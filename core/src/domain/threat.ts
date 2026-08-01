/**
 * Identity Threat Profile vocabulary — `docs/identity-threat-profile-research.md` §4, §6.
 *
 * **This module authors no finding.** Every row it emits is a translation of a fact
 * `access/classify.ts`, `exposure/score.ts`, `impact/choke.ts` or `risk/summarize.ts` already
 * produced, onto a PTRACE stage and a MITRE ATT&CK tactic — the PRD's own non-goal #1 ("this
 * module computes zero original findings") is exactly architecture rule 8 applied a fourth
 * time. It is the **second** module in the engine whose entire contribution is refusing to
 * rank (`risk/` was the first), and `THREAT_VERSUS_RANKERS` below is its half of that sentence.
 *
 * Two conventions carried over from every sibling module:
 *
 * **The vocabulary is borrowed where one already exists, and named after NIST where it does
 * not.** `PtraceStage` and `MitreTactic` are new — nothing upstream has an opinion about attack
 * stages — but `ThreatImpactLevel` and `ThreatLikelihoodLevel` are *derived* from `ExposureBand`
 * and `RiskFindingLevel` by a frozen lookup table, never authored independently of them (see
 * `threat/mapping.ts`). Both axes are five-valued because the PRD's 5×5 matrix is NIST SP 800-30
 * Rev 1's own shape — Table G-3 and H-2 publish "Very Low / Low / Moderate / High / Very High" as
 * the qualitative scale for exactly this pair of axes, and Table I-2 combines them by lookup
 * matrix, never arithmetic. Introducing this pair of five-valued unions is this module's one
 * deliberate exception to "never fork a scale", argued the way `RiskPolicy.exceptionStaleDays`
 * argues for being new rather than borrowed: the four-valued `ExposureBand` and
 * `RiskFindingLevel` remain the *inputs*, quoted; the five-valued pair is the *published
 * NIST-shaped target* they translate onto, one step removed from either.
 *
 * **A finding that cannot be scored says so, structurally.** `ThreatCell` is `null` exactly
 * when the identity's quoted upstream verdict could not back an axis — an unclassified
 * footprint (`ExposureAssessment.kind === 'no_classified_permissions'`) leaves Impact
 * unavailable, an unevaluated Risk Profile (`kind === 'partially_evaluated'`) leaves Likelihood
 * unavailable — and a finding with a null cell still appears in the findings table (the PRD §7
 * mapping-coverage metric is about PTRACE/MITRE assignment, not matrix placement) but is excluded
 * from the 5×5 grid's counts, exactly as `ExposureAssessment`'s `scored` fields exist only on one
 * arm so a consumer cannot read a value off a row that has not got one.
 */

import type { ExposureAssessment, ExposureOwnershipContext } from './exposure.js';
import type { ImpactAssessment } from './impact.js';
import type { RiskAssessment } from './risk.js';
import type { IdentityType } from './types.js';

// --- PTRACE and MITRE ATT&CK vocabulary -------------------------------------

/**
 * The six PTRACE stages — `docs/identity-threat-profile-prd.md` §3.1 — as full words rather
 * than the PRD's single-letter codes, matching `RiskFactorName`'s style. A closed union: a
 * seventh stage has to break this module's own registry and its consumers' builds, the same
 * reason `AccessPathType` and `RiskFactorName` are closed.
 */
export type PtraceStage =
  | 'probing'
  | 'trust_exploitation'
  | 'rights_escalation'
  | 'account_spoofing'
  | 'concealment_persistence'
  | 'exfiltration_lateral_movement';

/**
 * The MITRE ATT&CK tactics PRD §3.1's table names against the six stages, and only those —
 * appended to, never grown past what the reference table in `threat/mapping.ts` actually
 * reaches. `Reconnaissance` and `Discovery` are members despite no rule in this build ever
 * emitting a finding tagged with either (Probing has no backing signal — see the research
 * doc §4 and `threat/mapping.ts`'s `PROBING_COVERAGE_GAP`), because the reference table still
 * has to label Probing's stage card even while its finding count is honestly zero.
 */
export type MitreTactic =
  | 'Reconnaissance'
  | 'Discovery'
  | 'Initial Access'
  | 'Defense Evasion'
  | 'Privilege Escalation'
  | 'Credential Access'
  | 'Persistence'
  | 'Collection'
  | 'Exfiltration'
  | 'Lateral Movement'
  | 'Impact';

/** One row of PRD §3.1's table — the static reference, independent of whether anything fired. */
export interface PtraceStageReference {
  readonly stage: PtraceStage;
  readonly tactics: readonly MitreTactic[];
  readonly diagnostic_question: string;
}

// --- The five-valued NIST-shaped axes ---------------------------------------

/**
 * NIST SP 800-30 Rev 1 Table G-3's five qualitative impact values, spelled as the document
 * spells them. Never authored directly — `threat/mapping.ts`'s `IMPACT_LOOKUP` is the only
 * place a `ThreatImpactLevel` is assigned, and it assigns one by translating
 * `ExposureAssessment.band` (quoted) plus a choke-point escalation bump (also quoted).
 */
export type ThreatImpactLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

/**
 * NIST SP 800-30 Rev 1 Table H-2's five qualitative likelihood values. Assigned only by
 * `threat/mapping.ts`'s `LIKELIHOOD_LOOKUP`, translating `RiskAssessment.worst_level` and
 * `factors_firing` (both quoted) — never `risk_score` or `peer_percentile`, which this engine
 * does not have (`docs/identity-risk-profile-research.md` Amendments 2 and 3).
 */
export type ThreatLikelihoodLevel = 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';

/**
 * PRD §6.2's five cell bands, kept in the PRD's own words because they are this product's
 * already-established output vocabulary for the matrix (not an axis label, which is why they
 * are not named after NIST like the two axes are). Ordered light to dark for the legend.
 */
export type ThreatSeverityBand = 'desirable' | 'acceptable' | 'undesirable' | 'unacceptable' | 'catastrophic';

/**
 * One occupied cell of the 5×5 grid, or absent — see this file's header. `null` on
 * `ThreatFinding.cell` is the honest "could not be placed" answer; there is no cell shaped
 * like a zero.
 */
export interface ThreatCell {
  readonly impact: ThreatImpactLevel;
  readonly likelihood: ThreatLikelihoodLevel;
  readonly band: ThreatSeverityBand;
}

// --- Findings (research §5 step 1) ------------------------------------------

/** Which upstream file authored the fact this finding translates. Closed, like `RiskFindingSource`. */
export type ThreatFindingSource =
  | 'access/classify.ts'
  | 'exposure/score.ts'
  | 'impact/service.ts'
  | 'impact/choke.ts'
  | 'risk/summarize.ts'
  | 'lineage/signals.ts';

/**
 * One translated row. Carries exactly one `ptrace_stage` — never a plural field — so that "how
 * many findings" and "how many stage-assignments" are the same question by construction
 * (research §4, resolving PRD §8's open question 2). A fact that genuinely spans stages, like
 * `jane.doe`'s hop path in the PRD's own worked example, becomes multiple `ThreatFinding` rows
 * sharing one `source_ref`, exactly as `RiskFinding` and `OwnershipFinding` both carry one level
 * and never a list.
 */
export interface ThreatFinding {
  readonly finding_id: string;
  readonly identity_id: string;
  readonly ptrace_stage: PtraceStage;
  readonly mitre_tactic: MitreTactic;
  readonly mitre_technique: string;
  readonly evidence: string;
  readonly source: ThreatFindingSource;
  /** What, specifically, was translated — the audit trail back to the upstream row. */
  readonly source_ref: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  /** Null exactly when this identity's upstream verdicts could not back a cell — see header. */
  readonly cell: ThreatCell | null;
}

// --- The rollup (research §5 steps 2, 3) ------------------------------------

/**
 * What was found for one identity, or why the answer is not "nothing" — the same three arms
 * as `RiskAssessment`, for the same reason (architecture rule 9 in `risk.ts`'s numbering,
 * rule 7 in `impact.ts`'s — see `threat/service.ts`'s header for why this module does not
 * referee that drift). "This identity has no translatable upstream fact" and "this identity's
 * upstream modules have not evaluated it at all" are different claims: the former is
 * `no_findings`, the latter is `partially_evaluated` and names which upstream module had
 * nothing to quote (`ExposureAssessment` or `RiskAssessment` returning a non-`scored` /
 * non-`findings` arm for this identity).
 */
export type ThreatAssessment =
  | {
      readonly kind: 'findings';
      readonly findings: readonly ThreatFinding[];
      /** Distinct stages this identity's findings touch — a count, never a fused value. */
      readonly stages_touched: readonly PtraceStage[];
    }
  | { readonly kind: 'no_findings' }
  | {
      readonly kind: 'partially_evaluated';
      /** Named upstream sources that had no verdict to quote for this identity. */
      readonly unavailable: readonly ThreatFindingSource[];
    };

// --- Reconciling with the rest of the engine --------------------------------

/**
 * The sentence this module owes the screen — `RISK_VERSUS_RANKERS` and `IMPACT_VERSUS_EXPOSURE`'s
 * pattern, extended to name all four surfaces a reviewer now sees on one row. Frozen in the
 * engine, not the frontend, for the reason those two are: a UI copy goes stale the moment any
 * of the four definitions moves.
 */
export const THREAT_VERSUS_RANKERS =
  'Ownership severity ranks whether anyone is accountable for this identity and how urgently. ' +
  'Exposure ranks how much this identity could reach if it were misused. ' +
  'Choke points rank which single revocation removes the most access. ' +
  'Identity Risk Profile ranks nothing: it reports how many independent factors fired. ' +
  'This threat profile ranks nothing either — it translates whichever of those signals already ' +
  'fired into an attacker-stage narrative and a NIST-shaped impact/likelihood cell, so a reviewer ' +
  'reads one row as a translation of the other three, never as a fifth opinion about danger.';

// --- Staleness (mirrors `RiskStaleness` / `ImpactStaleness`) ----------------

/**
 * The same two fields every sibling publishes, and the same refusal of a third.
 * `stale_if_older_than_hours` is declined a fourth time — `domain/exposure.ts` L280-282,
 * `domain/risk.ts`'s `RiskStaleness`, and `domain/impact.ts`'s `ImpactStaleness` all decline it
 * for the same reason: it is a deployment policy, not a fact about this snapshot, and this
 * module has no rebuild cadence of its own to state one against — it is, if anything, staler
 * than all three of them, since it is a join over their joins.
 */
export interface ThreatStaleness {
  readonly based_on_access_discovery_snapshot: string;
  readonly computed_at: string;
}

// --- Output shapes (research §6) --------------------------------------------

interface ThreatSubject {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly assessment: ThreatAssessment;
  /** Ownership's verdict, quoted whole — the same context every sibling module carries. */
  readonly ownership: ExposureOwnershipContext;
  /**
   * The three upstream verdicts this row's cell and severity were translated from, each
   * quoted whole and namespaced so a reviewer sees the number this row is not replacing —
   * `RiskProfile.exposure`'s pattern, extended to all three sources a threat row reads.
   * `null` is each port's own "no verdict for this identity", never invented here.
   */
  readonly exposure: ExposureAssessment | null;
  readonly impact: ImpactAssessment | null;
  readonly risk: RiskAssessment | null;
  readonly why_factors_differ: string;
  readonly staleness: ThreatStaleness;
}

export type ThreatRow = ThreatSubject;
export type ThreatProfile = ThreatSubject;

/**
 * §6.4's actual display artifact: a *findings* table, one row per finding rather than one row
 * per identity — unlike every sibling module's `*Row`. `ThreatRow` stays the per-identity
 * container `profile()` and the coverage/matrix aggregation need; this is what `list()` returns,
 * with the identity columns the table renders inlined so a consumer needs no second join.
 */
export interface ThreatFindingRow extends ThreatFinding {
  readonly identity_name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
}

/** Mirrors `RiskOutcome` / `ImpactOutcome`: an unknown id is terminal, never a throw (rule 6). */
export type ThreatOutcome =
  | { readonly ok: true; readonly profile: ThreatProfile }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/** One PTRACE stage's reach across the population — the coverage gate, `RiskFactorCoverage`'s shape. */
export interface ThreatStageCoverage {
  readonly stage: PtraceStage;
  readonly tactics: readonly MitreTactic[];
  readonly findings: number;
  readonly identities: number;
}

/**
 * One occupied or empty cell of the KPI matrix — always all 25, so a reviewer sees the zeros too.
 *
 * `count` and `identities` are deliberately both published, and deliberately allowed to differ:
 * because Impact and Likelihood are identity-level (research §4.2 — every finding on one
 * identity shares one cell), an identity with a long hop/pivot chain can contribute several
 * `count` without contributing more than one `identities`. A cell reading "24 findings" beside
 * "6 identities" is a different claim than "24 findings, 24 identities", and a reviewer who
 * only sees `count` cannot tell the two apart — exactly the ambiguity `stageCoverage`'s own
 * `findings`/`identities` pair already resolves for stages (`ThreatStageCoverage`, above).
 */
export interface ThreatMatrixCell {
  readonly impact: ThreatImpactLevel;
  readonly likelihood: ThreatLikelihoodLevel;
  readonly band: ThreatSeverityBand;
  readonly count: number;
  readonly identities: number;
}

/** PRD §6.1's three KPIs, plus the coverage gate that has to publish before them (§6's pattern). */
export interface ThreatSummary {
  readonly stage_coverage: readonly ThreatStageCoverage[];
  readonly matrix: readonly ThreatMatrixCell[];
  /** Findings with no cell — an honest count, never folded into the matrix's zeros. */
  readonly unplaced_findings: number;
  readonly total_findings: number;
  readonly critical_findings: number;
  readonly identities_with_findings: number;
  readonly scanned: number;
}

/** PRD §6.4's filter bar. Filters combine with AND, as every other router in this engine does. */
export interface ThreatQuery {
  readonly app?: string;
  readonly identityType?: IdentityType;
  readonly stage?: PtraceStage;
  readonly severity?: ThreatFinding['severity'];
  readonly impact?: ThreatImpactLevel;
  readonly likelihood?: ThreatLikelihoodLevel;
}
