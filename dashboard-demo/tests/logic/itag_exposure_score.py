"""
Pure-Python port of I-TAG core exposure scoring
(docs/identity-exposure-map-research.md §5 / core/src/exposure/score.ts).
"""

from __future__ import annotations

import math
from typing import Iterable, Literal

SENSITIVE_WEIGHT = 1.0
NOT_SENSITIVE_WEIGHT = 0.1
HOP_MULTIPLIER = 1.5
BASELINE_MULTIPLIER = 1.0
SATURATION_CONSTANT = 1.189

PathType = Literal["direct", "indirect", "hop"]
Sensitivity = Literal["sensitive", "not_sensitive"]


def mechanism_multiplier(path_type: str) -> float:
    return HOP_MULTIPLIER if path_type == "hop" else BASELINE_MULTIPLIER


def sensitivity_weight(sensitivity: str) -> float:
    return SENSITIVE_WEIGHT if sensitivity == "sensitive" else NOT_SENSITIVE_WEIGHT


def contribution(path_type: str, sensitivity: str) -> float:
    return sensitivity_weight(sensitivity) * mechanism_multiplier(path_type)


def weighted_sum(paths: Iterable[dict]) -> float:
    # Accumulate in hundredths (same approach as I-TAG score.ts) to avoid IEEE drift.
    hundredths = 0
    for p in paths:
        hundredths += int(round(contribution(p["path_type"], p["sensitivity"]) * 100))
    return hundredths / 100.0


def exposure_score_from_sum(weighted: float) -> int:
    """exposure_score = round(100 · (1 − e^(−S / k)))."""
    if weighted <= 0:
        return 0
    raw = 100.0 * (1.0 - math.exp(-weighted / SATURATION_CONSTANT))
    return int(round(raw))


def score_paths(paths: Iterable[dict]) -> dict:
    s = weighted_sum(paths)
    return {
        "weighted_sum": s,
        "exposure_score": exposure_score_from_sum(s),
    }


# Published anchor from PRD / score.ts: one sensitive hop + three non-sensitive → 78
JANE_ANCHOR_PATHS = [
    {"path_type": "hop", "sensitivity": "sensitive"},
    {"path_type": "direct", "sensitivity": "not_sensitive"},
    {"path_type": "direct", "sensitivity": "not_sensitive"},
    {"path_type": "direct", "sensitivity": "not_sensitive"},
]
