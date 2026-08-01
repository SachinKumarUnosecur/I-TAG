"""Frontend lineage / delegation-chain classification invariants (JS snapshot)."""

from __future__ import annotations

import pytest

from logic.lineage import (
    belongs_in_scope_hub,
    classify_identity_node,
    identity_kind_label,
    is_outside_audit_window,
    is_pre_integration_edge_case,
)


def test_pre_integration_never_orphaned_or_compromise_class(lineage_nodes):
    violations = []
    for n in lineage_nodes:
        if not n["preIntegration"]:
            continue
        if n["orphaned"]:
            violations.append((n["appId"], n["id"], "orphaned"))
        if n["compromisedNhiNoPath"]:
            violations.append((n["appId"], n["id"], "compromisedNhiNoPath"))
        if n["compromisedPivot"]:
            violations.append((n["appId"], n["id"], "compromisedPivot"))
        if n["postCompromise"]:
            violations.append((n["appId"], n["id"], "postCompromise"))
        if n["type"] == "service" and n["chainTone"] == "compromised" and not n["compromised"]:
            violations.append((n["appId"], n["id"], "red-tone-without-self-compromise"))
    assert violations == [], f"pre-integration misclassified: {violations[:20]}"


def test_compromised_nhi_requires_post_integration(lineage_nodes):
    for n in lineage_nodes:
        if n["compromisedNhiNoPath"]:
            assert n["type"] == "service"
            assert not n["preIntegration"]
            assert not n["orphaned"]


def test_known_pre_integration_nhis_are_plain(lineage_nodes):
    """svc-backup-agent / svc-old-payments-worker existed before audit retention."""
    by_key = {(n["appId"], n["id"]): n for n in lineage_nodes}
    for key in (("devops", "id-111"), ("payments", "id-105"), ("payments", "id-114")):
        n = by_key[key]
        assert n["preIntegration"] is True
        assert n["compromisedNhiNoPath"] is False
        assert n["compromisedPivot"] is False
        assert n["orphaned"] is False
        assert identity_kind_label(n) == "NHI"


def test_compromise_path_nhi_post_integration(lineage_nodes):
    by_key = {(n["appId"], n["id"]): n for n in lineage_nodes}
    payments_api = by_key[("payments", "id-101")]
    billing = by_key[("payments", "id-107")]
    assert payments_api["preIntegration"] is False
    assert payments_api["compromisedPivot"] or payments_api["postCompromise"]
    assert identity_kind_label(payments_api) == "Compromise-path NHI"
    assert billing["postCompromise"] is True
    assert identity_kind_label(billing) == "Compromise-path NHI"


def test_post_departure_ghost_is_orphaned_not_pre_integration(lineage_nodes):
    by_key = {(n["appId"], n["id"]): n for n in lineage_nodes}
    ghost = by_key[("payments", "id-115")]
    assert ghost["preIntegration"] is False
    assert ghost["orphaned"] is True
    assert identity_kind_label(ghost) == "Orphaned NHI"


def test_object_field_not_always_outside_window():
    assert is_outside_audit_window(
        {"source": "object_field", "occurred_at": "2023-06-01"},
        "2022-01-01",
    ) is False
    assert is_outside_audit_window(
        {"source": "object_field", "occurred_at": "2021-06-01"},
        "2022-01-01",
    ) is True
    assert is_outside_audit_window(
        {"source": "backfill_import", "occurred_at": "2023-06-01"},
        "2022-01-01",
    ) is True


def test_pre_integration_edge_case_ignores_no_originator_label():
    identity = {
        "createdBy": "id-001",
        "createdAt": "2023-01-01",
        "originator": "No originator",
    }
    # Has creator id and date after integration → NOT pre-integration
    assert is_pre_integration_edge_case(identity, "2022-01-01") is False
    # Null creator → pre-integration / no logs
    assert is_pre_integration_edge_case({**identity, "createdBy": None}, "2022-01-01") is True
    # Before integration → pre-integration
    assert is_pre_integration_edge_case(
        {**identity, "createdAt": "2021-01-01"},
        "2022-01-01",
    ) is True


def test_hub_membership_requires_missing_human_originator():
    assert belongs_in_scope_hub({"originator": "owen.blake", "preIntegration": True}) is False
    assert belongs_in_scope_hub({"originator": "No originator"}) is True
    assert belongs_in_scope_hub({"originator": "okta.admin"}) is True


def test_prune_peer_leaf_without_originator_node():
    from logic.lineage import should_keep_peer_root

    present_ids = {"id-002"}
    present_names = {"mark.chen"}
    # Floating leaf — owen not in forest
    assert should_keep_peer_root(
        {
            "id": "id-111",
            "originator": "owen.blake",
            "originatorId": "id-011",
            "children": [],
        },
        present_ids,
        present_names,
    ) is False
    # Originator present → keep
    assert should_keep_peer_root(
        {
            "id": "id-106",
            "originator": "mark.chen",
            "originatorId": "id-002",
            "children": [],
        },
        present_ids,
        present_names,
    ) is True
    # Has forward graph → keep even without originator in set
    assert should_keep_peer_root(
        {
            "id": "id-101",
            "originator": "gone.user",
            "children": [{"id": "id-107"}],
        },
        present_ids,
        present_names,
    ) is True


def test_classify_pre_integration_service_not_orphaned():
    result = classify_identity_node(
        identity={
            "id": "id-111",
            "type": "service",
            "status": "orphaned",
            "owner": None,
            "createdAt": "2021-06-01",
        },
        originator="owen.blake",
        first_known_root=False,
        parent_edge={"source": "object_field", "occurred_at": "2021-06-01"},
        creation_data_from="2022-01-01",
    )
    assert result.pre_integration is True
    assert result.orphaned_nhi is False
    assert result.compromised_nhi_no_path is False
    assert result.status == "active"
    assert result.chain_tone == "default"
