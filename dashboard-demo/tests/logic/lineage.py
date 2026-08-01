"""Pure-Python ports of dashboard-demo delegation lineage classification rules."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


MISSING_ORIGINATOR_LABELS = {
    "",
    "—",
    "-",
    "no originator",
    "unknown",
    "unknown (pre-audit)",
    "unknown (pre-integration)",
    "okta directory",
    "okta.admin",
}


def is_missing_originator_label(value: Optional[str]) -> bool:
    o = str(value or "").strip().lower()
    return o in MISSING_ORIGINATOR_LABELS


def is_outside_audit_window(
    edge: Optional[dict[str, Any]],
    creation_data_from: Optional[str],
) -> bool:
    """Mirror appLineage.isOutsideAuditWindow."""
    if not edge:
        return False
    if edge.get("source") == "backfill_import":
        return True
    occurred = edge.get("occurred_at")
    if creation_data_from and occurred and occurred < creation_data_from:
        return True
    return False


def is_pre_integration_edge_case(
    identity: dict[str, Any],
    integrated_at: Optional[str],
) -> bool:
    """
    Mirror DelegationChain.isPreIntegrationEdgeCase.
    Evidence only — do NOT use 'No originator' label alone.
    """
    if not identity:
        return False
    if identity.get("createdBy") is None:
        return True
    if not integrated_at:
        return False
    created = identity.get("createdAt") or (identity.get("sources") or {}).get("hr", {}).get("hireDate")
    return bool(created and created < integrated_at)


def belongs_in_scope_hub(node: dict[str, Any]) -> bool:
    """Hub only for identities with no human originator label."""
    if not node or node.get("isNoOriginator") or node.get("isForestRoot"):
        return False
    return is_missing_originator_label(node.get("originator"))


@dataclass
class ClassifiedNode:
    pre_integration: bool
    orphaned_nhi: bool
    compromised_nhi_no_path: bool
    post_compromise: bool
    chain_tone: str
    status: str


def classify_identity_node(
    *,
    identity: dict[str, Any],
    originator: str,
    first_known_root: bool,
    parent_edge: Optional[dict[str, Any]],
    creation_data_from: Optional[str],
    compromise_ctx_at: Optional[str] = None,
    departure_ctx_at: Optional[str] = None,
    owner: Optional[dict[str, Any]] = None,
) -> ClassifiedNode:
    """Mirror appLineage.buildNode classification flags (without tree walk)."""
    created_at = identity.get("createdAt") or (parent_edge or {}).get("occurred_at")
    is_service = identity.get("type") == "service"
    is_compromised_user = bool(identity.get("compromisedAt"))
    is_departed_user = identity.get("status") == "departed" or bool(identity.get("departedAt"))

    post_departure = bool(
        not is_departed_user
        and departure_ctx_at
        and created_at
        and created_at > departure_ctx_at
    )

    pre_integration = bool(
        first_known_root
        or is_outside_audit_window(parent_edge, creation_data_from)
        or (creation_data_from and created_at and created_at < creation_data_from)
    )

    post_compromise = bool(
        not pre_integration
        and not is_departed_user
        and (
            is_compromised_user
            or (compromise_ctx_at and created_at and created_at >= compromise_ctx_at)
        )
    )

    owner_id = identity.get("owner")
    owner_departed = bool(
        owner and (owner.get("status") == "departed" or owner.get("departedAt"))
    )
    orphaned_nhi = bool(
        is_service
        and not is_compromised_user
        and not pre_integration
        and (
            identity.get("status") == "orphaned"
            or not owner_id
            or owner_departed
            or post_departure
        )
    )

    no_human = is_missing_originator_label(originator)
    compromised_nhi_no_path = bool(
        is_service
        and not is_compromised_user
        and not pre_integration
        and not post_compromise
        and not orphaned_nhi
        and no_human
    )

    if is_departed_user:
        tone = "departed"
    elif orphaned_nhi:
        tone = "orphaned"
    elif is_compromised_user or post_compromise or compromised_nhi_no_path:
        tone = "compromised"
    elif post_departure and not pre_integration:
        tone = "after-departure"
    else:
        tone = "default"

    st = identity.get("status") or "active"
    if orphaned_nhi:
        status = "orphaned"
    elif pre_integration and is_service and st == "orphaned":
        status = "active"
    else:
        status = st

    return ClassifiedNode(
        pre_integration=pre_integration,
        orphaned_nhi=orphaned_nhi,
        compromised_nhi_no_path=compromised_nhi_no_path,
        post_compromise=post_compromise and not orphaned_nhi,
        chain_tone=tone,
        status=status,
    )


def should_keep_peer_root(node: dict[str, Any], present_ids: set, present_names: set) -> bool:
    """
    Peer-root leaf with no forward graph is kept only when its human originator
    exists as another node in the forest (something to connect back to).
    """
    if (node.get("children") or []):
        return True
    originator = str(node.get("originator") or "").strip()
    if is_missing_originator_label(originator):
        return False
    oid = node.get("originatorId")
    if oid and oid in present_ids:
        return True
    return originator in present_names


def identity_kind_label(node: dict[str, Any]) -> str:
    """Mirror DelegationChain.identityKindLabel / graph typeLabel."""
    if node.get("isForestRoot"):
        return "Lineage forest"
    if node.get("isNoOriginator"):
        return f"{node.get('name') or 'Connector'} · Connector"
    if node.get("departed") or node.get("status") == "departed" or node.get("chainTone") == "departed":
        return "Departed user"
    if node.get("type") == "service" and (
        node.get("status") == "orphaned" or node.get("chainTone") == "orphaned"
    ):
        return "Orphaned NHI"
    if node.get("compromised"):
        return "Compromised user"
    if (
        node.get("type") == "service"
        and not node.get("preIntegration")
        and (
            node.get("compromisedNhiNoPath")
            or (
                node.get("chainTone") == "compromised"
                and not node.get("postCompromise")
                and not node.get("compromisedPivot")
                and is_missing_originator_label(node.get("originator"))
            )
        )
    ):
        return "Compromised NHI"
    if node.get("compromisedPivot") or (
        node.get("type") == "service" and node.get("postCompromise") and not node.get("compromised")
    ):
        return "Compromise-path NHI"
    if node.get("postCompromise"):
        return "After compromise"
    if node.get("chainTone") == "after-departure":
        return "After departure"
    if node.get("type") == "service":
        return "NHI"
    return "User"
