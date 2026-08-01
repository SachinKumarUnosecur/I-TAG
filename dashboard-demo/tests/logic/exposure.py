"""Pure-Python ports of dashboard-demo exposureApi cloud scoring."""

from __future__ import annotations

from typing import Any, Iterable, Optional

CLOUD_PROVIDERS = ("AWS", "GCP", "Azure")
SENSITIVITY_WEIGHT = {"critical": 100, "high": 70, "medium": 40, "low": 15}


def cloud_paths_for_identity(
    access_paths: Iterable[dict[str, Any]],
    identity_id: str,
    cloud: str = "all",
) -> list[dict[str, Any]]:
    rows = []
    for p in access_paths:
        if p.get("identityId") != identity_id or p.get("blocked"):
            continue
        provider = p.get("cloudProvider")
        if not provider or provider not in CLOUD_PROVIDERS:
            continue
        if cloud != "all" and provider != cloud:
            continue
        rows.append(p)
    return rows


def compute_cloud_exposure(
    access_paths: Iterable[dict[str, Any]],
    identity_id: str,
    cloud: str = "all",
) -> dict[str, Any]:
    paths = cloud_paths_for_identity(access_paths, identity_id, cloud)
    score = 0
    resources = []
    for p in paths:
        sens = p.get("resourceSensitivity") or "low"
        weight = SENSITIVITY_WEIGHT.get(sens, 10)
        score += weight
        resources.append({
            "pathId": p.get("id"),
            "resource": p.get("resource"),
            "sensitivity": sens,
            "weight": weight,
            "cloudProvider": p.get("cloudProvider"),
        })
    return {"score": score, "paths": paths, "resources": resources}


def inventory(
    identities: Iterable[dict[str, Any]],
    access_paths: Iterable[dict[str, Any]],
    cloud: str = "all",
) -> list[dict[str, Any]]:
    access_paths = list(access_paths)
    out = []
    for ident in identities:
        exp = compute_cloud_exposure(access_paths, ident["id"], cloud)
        if exp["paths"]:
            out.append({
                **ident,
                "exposureScore": exp["score"],
                "pathCount": len(exp["paths"]),
                "clouds": sorted({p.get("cloudProvider") for p in exp["paths"] if p.get("cloudProvider")}),
                "reachesCritical": any(r["sensitivity"] == "critical" for r in exp["resources"]),
            })
    out.sort(key=lambda r: r["exposureScore"], reverse=True)
    return out


def resource_nodes_are_cloud_only(nodes: Iterable[dict[str, Any]]) -> bool:
    for n in nodes:
        if n.get("cloudProvider") not in CLOUD_PROVIDERS:
            return False
    return True
