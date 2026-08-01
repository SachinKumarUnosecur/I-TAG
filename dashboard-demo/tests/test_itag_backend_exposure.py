"""
Backend (I-TAG core) exposure scoring — published anchors from
docs/identity-exposure-map-research.md §5 / core/src/exposure/score.ts.
"""

from __future__ import annotations

from logic.itag_exposure_score import (
    HOP_MULTIPLIER,
    JANE_ANCHOR_PATHS,
    SATURATION_CONSTANT,
    SENSITIVE_WEIGHT,
    contribution,
    exposure_score_from_sum,
    score_paths,
    weighted_sum,
)


def test_jane_anchor_weighted_sum_is_1_8():
    # S = (1.0 × 1.5) + (3 × 0.1 × 1.0) = 1.8
    s = weighted_sum(JANE_ANCHOR_PATHS)
    assert abs(s - 1.8) < 1e-9


def test_jane_anchor_scores_78():
    result = score_paths(JANE_ANCHOR_PATHS)
    assert result["exposure_score"] == 78


def test_empty_paths_score_zero():
    assert score_paths([])["exposure_score"] == 0
    assert exposure_score_from_sum(0) == 0


def test_sensitive_hop_contribution():
    assert contribution("hop", "sensitive") == SENSITIVE_WEIGHT * HOP_MULTIPLIER


def test_saturation_constant_matches_published():
    assert SATURATION_CONSTANT == 1.189


def test_monotone_more_paths_not_lower_score():
    base = score_paths(JANE_ANCHOR_PATHS)["exposure_score"]
    more = score_paths(
        JANE_ANCHOR_PATHS + [{"path_type": "direct", "sensitivity": "sensitive"}]
    )["exposure_score"]
    assert more >= base


def test_maya_style_broad_footprint_high_score():
    # Forty non-sensitive direct paths — breadth alone is material (PRD Amendment 7).
    paths = [{"path_type": "direct", "sensitivity": "not_sensitive"}] * 40
    result = score_paths(paths)
    # S = 4.0 → score = round(100 * (1 - e^(-4/1.189))) ≈ 97
    assert result["exposure_score"] >= 95
    assert result["weighted_sum"] == 4.0
