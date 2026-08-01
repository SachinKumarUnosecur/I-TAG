"""Cross-cutting data integrity between identities, paths, and lineage."""

from __future__ import annotations


def test_every_access_path_identity_exists(snapshot, identities_by_id):
    missing = sorted({
        p["identityId"]
        for p in snapshot["accessPaths"]
        if p["identityId"] not in identities_by_id
    })
    assert missing == []


def test_cloud_paths_have_provider(snapshot):
    bad = [
        p["id"]
        for p in snapshot["accessPaths"]
        if not p.get("blocked") and p.get("cloudProvider")
        and p["cloudProvider"] not in snapshot["cloudProviders"]
    ]
    # Non-cloud paths may omit provider; if set, must be a known cloud.
    assert bad == []


def test_lineage_nodes_reference_known_identities(snapshot, identities_by_id):
    unknown = sorted({
        n["id"]
        for n in snapshot["lineageNodes"]
        if n["id"] not in identities_by_id
    })
    assert unknown == []


def test_connected_sources_present(snapshot):
    assert snapshot["counts"]["connectedSources"] >= 3


def test_rebuilt_chains_match_export(snapshot):
    assert snapshot["rebuiltNodeCount"] == snapshot["counts"]["apps"]


def test_risk_profiles_cover_identities_with_paths(snapshot, identities_by_id):
    path_ids = {p["identityId"] for p in snapshot["accessPaths"]}
    profile_ids = {r["identityId"] for r in snapshot["riskProfiles"]}
    missing = sorted(path_ids - profile_ids)
    assert missing == [], f"path identities missing risk profiles: {missing}"
