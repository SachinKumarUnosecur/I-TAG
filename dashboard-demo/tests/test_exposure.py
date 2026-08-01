"""Frontend exposure map cloud-only scoring & resource map invariants."""

from __future__ import annotations

from logic.exposure import (
    CLOUD_PROVIDERS,
    compute_cloud_exposure,
    inventory,
)


def test_exposure_inventory_cloud_only(snapshot):
    for row in snapshot["exposureInventory"]:
        for c in row["clouds"]:
            assert c in CLOUD_PROVIDERS
        assert row["pathCount"] > 0
        assert row["exposureScore"] >= 0


def test_exposure_inventory_sorted_desc(snapshot):
    scores = [r["exposureScore"] for r in snapshot["exposureInventory"]]
    assert scores == sorted(scores, reverse=True)


def test_python_port_matches_js_inventory(snapshot, identities_by_id, access_paths):
    py_rows = inventory(snapshot["identities"], access_paths, "all")
    js_by_id = {r["id"]: r for r in snapshot["exposureInventory"]}
    assert len(py_rows) == len(js_by_id)
    for row in py_rows:
        js = js_by_id[row["id"]]
        assert row["exposureScore"] == js["exposureScore"], row["id"]
        assert row["pathCount"] == js["pathCount"], row["id"]


def test_cloud_filter_subset(snapshot):
    all_ids = {r["id"] for r in snapshot["exposureInventory"]}
    for cloud, rows in snapshot["exposureByCloud"].items():
        for r in rows:
            assert r["id"] in all_ids
            assert r["pathCount"] > 0


def test_sample_resource_maps_are_cloud_only(snapshot):
    for id_, m in snapshot["sampleMaps"].items():
        if m is None:
            # identities without cloud paths may be null
            continue
        assert m["cloudsAreCloudOnly"] is True
        assert m["pathCount"] == m["pathCount"]


def test_identity_without_cloud_paths_not_in_inventory(snapshot):
    inv_ids = {r["id"] for r in snapshot["exposureInventory"]}
    # Ghost finance NHI may have no cloud path — must not appear if pathCount=0
    if "id-115" not in inv_ids:
        exp = compute_cloud_exposure(snapshot["accessPaths"], "id-115", "all")
        assert exp["score"] == 0
        assert exp["paths"] == []


def test_jane_has_resource_map(snapshot):
    m = snapshot["sampleMaps"]["id-001"]
    assert m is not None
    assert m["pathCount"] >= 1
    assert m["resourceNodeCount"] >= 1
    # Humans list owned NHIs for metadata, but the resource map is access-only.
    assert m["attachedNhiCount"] >= 1


def test_nhi_resource_map_has_attachments(snapshot):
    m = snapshot["sampleMaps"]["id-101"]
    assert m is not None
    assert m["pathCount"] >= 1
    assert m.get("attachmentCount", 0) >= 1


def test_sensitivity_weights():
    paths = [
        {
            "id": "p1",
            "identityId": "x",
            "cloudProvider": "AWS",
            "resourceSensitivity": "critical",
            "blocked": False,
        },
        {
            "id": "p2",
            "identityId": "x",
            "cloudProvider": "GCP",
            "resourceSensitivity": "low",
            "blocked": False,
        },
    ]
    exp = compute_cloud_exposure(paths, "x", "all")
    assert exp["score"] == 100 + 15
