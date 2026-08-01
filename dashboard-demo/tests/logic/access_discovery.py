"""Pure-Python ports of Access Discovery filtering / identity-first dedupe."""

from __future__ import annotations

from typing import Any, Iterable, Optional


def is_shadow_access_path(path: dict[str, Any]) -> bool:
    return path.get("accessType") == "Shadow" or (path.get("hopCount") or 0) > 0


def path_severity(path: dict[str, Any]) -> int:
    type_score = 3 if path.get("accessType") == "Shadow" else 1 if path.get("accessType") == "Indirect" else 0
    return (4 if path.get("shadowAdmin") else 0) + type_score + (path.get("hopCount") or 0)


def has_owner_gap(identity: Optional[dict[str, Any]]) -> bool:
    if not identity:
        return False
    return (not identity.get("owner")) or identity.get("status") in {"orphaned", "departed"}


def path_needs_attention(path: dict[str, Any], identity: Optional[dict[str, Any]]) -> bool:
    return bool(path.get("shadowAdmin") or has_owner_gap(identity))


def dedupe_paths_by_identity(paths: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    best: dict[str, dict[str, Any]] = {}
    for p in paths:
        iid = p["identityId"]
        existing = best.get(iid)
        if existing is None or path_severity(p) > path_severity(existing):
            best[iid] = p
        elif existing is not None and path_severity(p) == path_severity(existing):
            if str(p.get("lastConfirmed") or "") > str(existing.get("lastConfirmed") or ""):
                best[iid] = p
    return list(best.values())


def filter_paths(
    paths: Iterable[dict[str, Any]],
    identities_by_id: dict[str, dict[str, Any]],
    *,
    kind: str = "All",
    search: str = "",
    dropdown: str = "All",
) -> list[dict[str, Any]]:
    q = search.strip().lower()
    matching = []
    for p in paths:
        identity = identities_by_id.get(p["identityId"])
        if kind == "human" and (not identity or identity.get("type") != "human"):
            continue
        if kind == "service" and (not identity or identity.get("type") != "service"):
            continue
        if q:
            hay = " ".join([
                str(p.get("identityName") or ""),
                str(p.get("resource") or ""),
                str(p.get("mechanism") or ""),
            ]).lower()
            if q not in hay:
                continue
        if dropdown == "needs-attention" and not path_needs_attention(p, identity):
            continue
        if dropdown == "shadow-access" and not is_shadow_access_path(p):
            continue
        if dropdown not in {"All", "needs-attention", "shadow-access"}:
            if p.get("cloudProvider") != dropdown:
                continue
        matching.append(p)
    return dedupe_paths_by_identity(matching)
