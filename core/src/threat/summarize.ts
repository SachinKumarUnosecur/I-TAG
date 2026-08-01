import type { ExposureAssessment } from '../domain/exposure.js';
import type { RiskAssessment } from '../domain/risk.js';
import type {
  PtraceStage,
  ThreatAssessment,
  ThreatFinding,
  ThreatFindingSource,
  ThreatMatrixCell,
  ThreatRow,
  ThreatStageCoverage,
} from '../domain/threat.js';
import { allCells, PTRACE_REFERENCE } from './mapping.js';

/**
 * The rollup — `docs/identity-threat-profile-research.md` §5 steps 2, 3. Pure, and it knows
 * only `ThreatFinding` and the two quoted axis sources, exactly as `risk/summarize.ts` knows
 * only `RiskFinding`. Nothing here multiplies, averages or weights: a finding either exists or
 * it does not, and the coverage functions are counts over what is printed beside them.
 */

const STAGE_ORDER: readonly PtraceStage[] = Object.freeze(PTRACE_REFERENCE.map((entry) => entry.stage));
const SEVERITY_RANK: Readonly<Record<ThreatFinding['severity'], number>> = Object.freeze({
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
});

/** Worst severity first, then PTRACE sequence order — the order a drawer reads. */
function orderFindings(findings: readonly ThreatFinding[]): readonly ThreatFinding[] {
  return Object.freeze(
    [...findings].sort((left, right) => {
      const bySeverity = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
      if (bySeverity !== 0) {
        return bySeverity;
      }
      return STAGE_ORDER.indexOf(left.ptrace_stage) - STAGE_ORDER.indexOf(right.ptrace_stage);
    }),
  );
}

function distinctStages(findings: readonly ThreatFinding[]): readonly PtraceStage[] {
  const present = new Set(findings.map((finding) => finding.ptrace_stage));
  return Object.freeze(STAGE_ORDER.filter((stage) => present.has(stage)));
}

/**
 * Which upstream axis sources had nothing to quote for this identity — the input to the
 * `partially_evaluated` arm. `access === null` should not occur for a non-group identity
 * (`AccessService.profile` only fails on an unknown id, and `threat/service.ts` filters
 * groups before this runs), and is named anyway so a future caller that lifts that
 * precondition inherits a correct answer rather than a silent one.
 */
export function unavailableSourcesFor(
  access: unknown,
  exposure: ExposureAssessment | null,
  risk: RiskAssessment | null,
): readonly ThreatFindingSource[] {
  const unavailable: ThreatFindingSource[] = [];
  if (access === null) {
    unavailable.push('access/classify.ts');
  }
  if (exposure === null || exposure.kind === 'no_classified_permissions') {
    unavailable.push('exposure/score.ts');
  }
  if (risk === null || risk.kind === 'partially_evaluated') {
    unavailable.push('risk/summarize.ts');
  }
  return Object.freeze(unavailable);
}

/**
 * §5 step 3's three-armed rollup for one identity. `findings` wins whenever a rule translated
 * something, regardless of whether the two axis sources were themselves fully evaluated — a
 * finding with a `null` cell is still a finding (PRD §7's mapping-coverage metric is about
 * PTRACE/MITRE assignment, not matrix placement). `partially_evaluated` is reached only when
 * nothing translated *and* an axis source was itself a gap; `no_findings` is the clean arm,
 * reached only when every axis source was actually evaluated and still nothing translated.
 */
export function summarizeThreatFindings(
  findings: readonly ThreatFinding[],
  unavailable: readonly ThreatFindingSource[],
): ThreatAssessment {
  if (findings.length > 0) {
    return {
      kind: 'findings',
      findings: orderFindings(findings),
      stages_touched: distinctStages(findings),
    };
  }
  if (unavailable.length > 0) {
    return { kind: 'partially_evaluated', unavailable };
  }
  return { kind: 'no_findings' };
}

// --- Coverage and KPI aggregation, over the whole population (research §6) --

function findingsOf(row: ThreatRow): readonly ThreatFinding[] {
  return row.assessment.kind === 'findings' ? row.assessment.findings : [];
}

/**
 * PRD §6.3's stage cards, over every row — the coverage gate, `RiskFactorCoverage`'s pattern
 * applied per PTRACE stage instead of per risk factor. Always six rows, including Probing at
 * zero, so a reviewer sees the gap named rather than a card silently missing from the panel.
 */
export function stageCoverage(rows: readonly ThreatRow[]): readonly ThreatStageCoverage[] {
  return Object.freeze(
    PTRACE_REFERENCE.map((reference): ThreatStageCoverage => {
      let findings = 0;
      const identities = new Set<string>();
      for (const row of rows) {
        for (const finding of findingsOf(row)) {
          if (finding.ptrace_stage === reference.stage) {
            findings += 1;
            identities.add(row.identity_id);
          }
        }
      }
      return {
        stage: reference.stage,
        tactics: reference.tactics,
        findings,
        identities: identities.size,
      };
    }),
  );
}

/**
 * PRD §6.2's 5×5 grid, always all 25 cells — a cell a reviewer never clicks is still a zero a
 * reviewer should be able to see, the same reason `levelCounts` publishes every level rather
 * than only the ones that fired.
 */
export function matrixCounts(rows: readonly ThreatRow[]): readonly ThreatMatrixCell[] {
  return Object.freeze(
    allCells().map((cell): ThreatMatrixCell => {
      let count = 0;
      for (const row of rows) {
        for (const finding of findingsOf(row)) {
          if (finding.cell !== null && finding.cell.impact === cell.impact && finding.cell.likelihood === cell.likelihood) {
            count += 1;
          }
        }
      }
      return { ...cell, count };
    }),
  );
}

/** Findings translated but not placeable on the grid — named, never folded into a cell's zero. */
export function unplacedFindingsCount(rows: readonly ThreatRow[]): number {
  let count = 0;
  for (const row of rows) {
    for (const finding of findingsOf(row)) {
      if (finding.cell === null) {
        count += 1;
      }
    }
  }
  return count;
}

/** PRD §6.1's three KPIs. */
export function totalFindings(rows: readonly ThreatRow[]): number {
  return rows.reduce((sum, row) => sum + findingsOf(row).length, 0);
}

export function criticalFindings(rows: readonly ThreatRow[]): number {
  return rows.reduce(
    (sum, row) => sum + findingsOf(row).filter((finding) => finding.severity === 'critical').length,
    0,
  );
}

export function identitiesWithFindings(rows: readonly ThreatRow[]): number {
  return rows.filter((row) => row.assessment.kind === 'findings').length;
}
