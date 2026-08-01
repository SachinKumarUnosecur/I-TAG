"""Access Discovery filtering / identity-first view invariants."""

from __future__ import annotations

from logic.access_discovery import (
    dedupe_paths_by_identity,
    filter_paths,
    is_shadow_access_path,
    path_needs_attention,
    path_severity,
)


def test_unique_identity_count_matches_dedupe(snapshot, access_paths):
    unique = {p["identityId"] for p in access_paths}
    deduped = dedupe_paths_by_identity(access_paths)
    assert len(deduped) == len(unique)
    assert len(unique) == snapshot["counts"]["uniquePathIdentities"]


def test_dedupe_keeps_highest_severity():
    paths = [
        {"identityId": "a", "accessType": "Direct", "hopCount": 0, "shadowAdmin": False, "lastConfirmed": "2026-01-01"},
        {"identityId": "a", "accessType": "Shadow", "hopCount": 2, "shadowAdmin": True, "lastConfirmed": "2026-01-02"},
        {"identityId": "b", "accessType": "Indirect", "hopCount": 0, "shadowAdmin": False, "lastConfirmed": "2026-01-01"},
    ]
    out = dedupe_paths_by_identity(paths)
    by_id = {p["identityId"]: p for p in out}
    assert by_id["a"]["accessType"] == "Shadow"
    assert by_id["a"]["shadowAdmin"] is True
    assert len(out) == 2


def test_filter_kind_human_only(snapshot, access_paths, identities_by_id):
    rows = filter_paths(access_paths, identities_by_id, kind="human")
    assert rows
    for r in rows:
        assert identities_by_id[r["identityId"]]["type"] == "human"


def test_filter_kind_nhi_only(snapshot, access_paths, identities_by_id):
    rows = filter_paths(access_paths, identities_by_id, kind="service")
    assert rows
    for r in rows:
        assert identities_by_id[r["identityId"]]["type"] == "service"


def test_filter_shadow(snapshot, access_paths, identities_by_id):
    rows = filter_paths(access_paths, identities_by_id, dropdown="shadow-access")
    assert rows
    for r in rows:
        assert is_shadow_access_path(r)


def test_filter_attention_includes_owner_gaps(snapshot, access_paths, identities_by_id):
    rows = filter_paths(access_paths, identities_by_id, dropdown="needs-attention")
    assert rows
    for r in rows:
        identity = identities_by_id.get(r["identityId"])
        assert path_needs_attention(r, identity)


def test_filter_cloud_aws(snapshot, access_paths, identities_by_id):
    rows = filter_paths(access_paths, identities_by_id, dropdown="AWS")
    assert rows
    for r in rows:
        assert r["cloudProvider"] == "AWS"


def test_reset_filters_returns_full_baseline(snapshot, access_paths, identities_by_id):
    baseline = filter_paths(access_paths, identities_by_id)
    narrowed = filter_paths(access_paths, identities_by_id, kind="service", dropdown="AWS")
    assert len(narrowed) <= len(baseline)
    assert len(baseline) == snapshot["counts"]["uniquePathIdentities"]


def test_path_severity_ordering():
    direct = {"accessType": "Direct", "hopCount": 0, "shadowAdmin": False}
    shadow = {"accessType": "Shadow", "hopCount": 1, "shadowAdmin": False}
    admin = {"accessType": "Shadow", "hopCount": 1, "shadowAdmin": True}
    assert path_severity(admin) > path_severity(shadow) > path_severity(direct)
