import type { Severity } from '../domain/ownership.js';
import { severityRank } from '../ownership/severity.js';
import type {
  RiskAssessment,
  RiskFactorName,
  RiskFinding,
  RiskFindingLevel,
  RiskLevelCount,
} from '../domain/risk.js';

/**
 * The rollup — `docs/identity-risk-profile-research.md` §5 steps 2 and 3.
 *
 * Pure, and it knows only `RiskFinding`. It never sees a factor's identity, never reads a
 * threshold and holds no table, which is what makes appending a seventh factor an append:
 * if adding one required an edit in this file, the seam would be in the wrong place
 * (architecture rule 3).
 *
 * **Nothing multiplies, nothing averages, nothing is weighted.** `worst_level` is a
 * maximum and `factors_firing` is a count, so one `critical` finding can never be
 * outvoted by five mediocre ones. That is not a preference. Measured on this estate the
 * source PRD's weighted sum put an identity whose only signal was a live hop path to
 * `aws:account-root` at 29 and an identity unremarkable on all six factors at 28 — one
 * point apart — and the OECD/JRC Handbook states the cause as a property of additive
 * aggregation rather than of the weights: "two countries, one with values 21, 1, 1, 1,
 * and the other with 6,6,6,6, would have equal composites" (§1.3, §4.2).
 *
 * The precedent is in the engine, not in the literature. `ownership/severity.ts` L20-22
 * rejected the same operator for the same reason in the engine's first ranking authority:
 * "Age alone cannot rank a queue… Sensitivity is what turns 4,000 rows into the seven
 * that matter, so it dominates, and time only breaks ties within a band." This is that
 * rule generalized from two signals to six.
 *
 * And it is what NIST SP 800-30 Rev 1 asks for. That document declines to specify a
 * combination algorithm — "this guideline does not specify algorithms for combining
 * semi-quantitative values" — lists `max` first among the acceptable ones, combines its
 * own exemplary likelihood and impact by lookup table rather than arithmetic, and states
 * the obligation as "Organizations make explicit the rules used". A maximum and a count
 * are re-derivable from the findings printed beside them; a weighted mean of six
 * heterogeneous scales is not.
 */

/** Descending, so `[0]` is the level a reviewer opens the queue with. */
const LEVELS_HIGH_TO_LOW: readonly RiskFindingLevel[] = Object.freeze([
  'critical',
  'high',
  'medium',
  'low',
]);

/**
 * What one identity's factor run produced, before it becomes an arm.
 *
 * Three lists rather than a findings array plus two counts: the *names* of the factors
 * that could not be evaluated are what research §3.2 requires be published, because every
 * provider's dormancy surface omits populations silently and an unnamed omission is
 * indistinguishable from a clean result. Factors that do not apply are in neither list —
 * they are out of scope for this identity, and the estate-wide coverage block is where
 * their reach is reported.
 */
export interface FactorRun {
  readonly findings: readonly RiskFinding[];
  readonly evaluated: readonly RiskFactorName[];
  readonly unavailable: readonly RiskFactorName[];
}

/** The published order of levels, exported so a consumer need not re-declare it. */
export function riskLevelsHighToLow(): readonly RiskFindingLevel[] {
  return LEVELS_HIGH_TO_LOW;
}

/**
 * The maximum over the findings' own levels, or null when nothing fired.
 *
 * Reuses `severityRank` rather than declaring a second order, so the two surfaces cannot
 * disagree about whether `high` outranks `medium`.
 */
export function worstLevelOf(findings: readonly RiskFinding[]): RiskFindingLevel | null {
  let worst: RiskFindingLevel | null = null;
  for (const finding of findings) {
    if (worst === null || severityRank(finding.level) > severityRank(worst)) {
      worst = finding.level;
    }
  }
  return worst;
}

/**
 * How many *distinct* factors fired.
 *
 * Distinct because a factor emits at most one finding by contract, so this is a
 * defence against a future factor that forgets — and because the number is meant to read
 * as "how many independent signals agree about this identity", which a factor counted
 * twice would inflate. `svc-vpn-legacy` at four is four different systems saying
 * something, not four rows.
 */
export function factorsFiringIn(findings: readonly RiskFinding[]): number {
  return new Set(findings.map((finding) => finding.factor)).size;
}

/**
 * Which of the three arms this identity supports — research §5 step 3.
 *
 * The arm is chosen on two questions in a fixed order: did anything fire, and was
 * everything that applies actually looked at. That produces the one distinction the
 * category does not make (§3.5): an identity with nothing found and nothing missing is
 * *clean*, while an identity with nothing found and two unevaluated factors is
 * **unassessed**, and neither is a number that can sort against the other.
 *
 * A row with findings carries `factors_unavailable` too, because four findings out of four
 * evaluated factors and four out of six are different claims — the second is a floor.
 */
export function summarize(run: FactorRun): RiskAssessment {
  const worst = worstLevelOf(run.findings);

  if (worst !== null) {
    return {
      kind: 'findings',
      worst_level: worst,
      factors_firing: factorsFiringIn(run.findings),
      findings: orderFindings(run.findings),
      factors_evaluated: run.evaluated,
      factors_unavailable: run.unavailable,
    };
  }

  if (run.unavailable.length > 0) {
    return {
      kind: 'partially_evaluated',
      factors_evaluated: run.evaluated,
      factors_unavailable: run.unavailable,
    };
  }

  return { kind: 'no_findings', factors_evaluated: run.evaluated };
}

/**
 * Worst level first, then the order the caller supplied — which is registry order.
 *
 * A stable sort over a list the registry produced, so two identities with the same
 * findings render identically and a drawer opens on the worst one. This is presentation,
 * not ranking: no level is combined with another, and removing this function would change
 * the order of a list without changing a single verdict in it.
 */
function orderFindings(findings: readonly RiskFinding[]): readonly RiskFinding[] {
  return Object.freeze(
    [...findings].sort((left, right) => severityRank(right.level) - severityRank(left.level)),
  );
}

/**
 * The non-compensatory comparison, and the module's only ordering rule.
 *
 * Count of independent signals first, worst level second, id last. Count leads because it
 * is the question research §7.2 says this module exists to answer — how many of the
 * engine's signals independently fired for this identity — and because it is the one
 * ordering the shipped rankers cannot produce: `svc-vpn-legacy` is ownership queue rank 1
 * and exposure 83, and under the PRD's composite it fell to rank 9 while `user-maya`
 * (exposure #1 at 97) fell to 62. Both are recovered here, at four factors and one.
 *
 * This sorts a table; it does not author a rank. `factors_firing` is recomputable by
 * counting the findings printed on the row, which is the transparency condition FIRST
 * places on any published figure and which no fused value can meet (§4.3).
 */
export function compareAssessments(
  left: RiskAssessment,
  right: RiskAssessment,
  leftId: string,
  rightId: string,
): number {
  const byArm = ARM_ORDER[left.kind] - ARM_ORDER[right.kind];
  if (byArm !== 0) {
    return byArm;
  }

  if (left.kind === 'findings' && right.kind === 'findings') {
    const byCount = right.factors_firing - left.factors_firing;
    if (byCount !== 0) {
      return byCount;
    }
    const byLevel = severityRank(right.worst_level) - severityRank(left.worst_level);
    if (byLevel !== 0) {
      return byLevel;
    }
  }

  return leftId.localeCompare(rightId);
}

/**
 * Ordering of the three arms in the landing table.
 *
 * Findings first because they are the triage queue. Then the partially evaluated, which
 * are a gap to close rather than a clean result and must not be buried — the same
 * asymmetry `exposure/service.ts` applies when it puts `no_classified_permissions` ahead
 * of `no_paths`. Identities with nothing found and nothing missing come last.
 */
const ARM_ORDER: Readonly<Record<RiskAssessment['kind'], number>> = Object.freeze({
  findings: 0,
  partially_evaluated: 1,
  no_findings: 2,
});

/**
 * The level distribution, over the arm that has a level.
 *
 * Findings only — `Severity`'s `none` is not a member of `RiskFindingLevel`, so an
 * identity with nothing found is reported by the three population counts beside this and
 * never as a fifth bar at zero. A count that quietly folded the unassessed into the
 * bottom band is how "60% of the estate is low risk" gets said about a four-row fixture.
 */
export function levelCounts(assessments: readonly RiskAssessment[]): readonly RiskLevelCount[] {
  return Object.freeze(
    LEVELS_HIGH_TO_LOW.map(
      (level): RiskLevelCount => ({
        level,
        count: assessments.filter(
          (assessment) => assessment.kind === 'findings' && assessment.worst_level === level,
        ).length,
      }),
    ),
  );
}

/** Narrowing helper for consumers that hold a `Severity` and need a finding level. */
export function isFindingLevel(severity: Severity): severity is RiskFindingLevel {
  return severity !== 'none';
}
