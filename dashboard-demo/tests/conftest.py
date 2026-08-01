"""Pytest fixtures: regenerate JS snapshot bridge when missing/stale."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = Path(__file__).resolve().parent / "bridge" / "export_snapshot.mjs"
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "snapshot.json"


def _export_snapshot() -> dict:
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["node", str(BRIDGE)],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"export_snapshot.mjs failed ({proc.returncode})\n"
            f"stdout:\n{proc.stdout}\nstderr:\n{proc.stderr}"
        )
    return json.loads(FIXTURE.read_text())


@pytest.fixture(scope="session")
def snapshot() -> dict:
    """Live export from the dashboard-demo JS data layer."""
    try:
        return _export_snapshot()
    except Exception as exc:  # noqa: BLE001 — surface bridge errors clearly
        pytest.fail(f"Could not export JS snapshot: {exc}")


@pytest.fixture(scope="session")
def lineage_nodes(snapshot):
    return snapshot["lineageNodes"]


@pytest.fixture(scope="session")
def identities_by_id(snapshot):
    return {i["id"]: i for i in snapshot["identities"]}


@pytest.fixture(scope="session")
def access_paths(snapshot):
    return snapshot["accessPaths"]
