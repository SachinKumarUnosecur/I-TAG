/**
 * Identity Risk Profile vocabulary — `docs/identity-risk-profile-research.md` §5, §6.
 *
 * **This module authors no ranking of identities, and every type below is shaped to
 * make that structural rather than promised.** Architecture rule 8 fixes the engine
 * at three ranking authorities over three populations — `ownership/severity.ts`
 * ranks findings, `exposure/score.ts` ranks identities, `impact/choke.ts` ranks
 * remediations — and research §1.4 records that `impact/service.test.ts` already
 * forbids the literal key `risk_score` in anticipation of this module. So there is
 * no composite here: no weights, no normalization to a common scale, no 0-100
 * number, no band this module invented.
 *
 * What replaces it is research §5's non-compensatory model. Each factor emits at
 * most one finding at its own level in its own vocabulary; a rollup reports the
 * worst of those levels and a **count** of how many independent factors fired.
 * Measured on this estate, the PRD's weighted sum put a live administrative hop
 * path (29) one point above an identity that was unremarkable on everything (28),
 * emptied the Critical band and gave 42 identities the same value (§1.2, §1.3). The
 * OECD/JRC Handbook states the cause as a property of the arithmetic rather than of
 * the weights — additive aggregation implies full compensability, and weights in it
 * "necessarily take the meaning of substitution rates" — so the operator is
 * replaced, not retuned (§4.2).
 *
 * Two conventions run through the file.
 *
 * **The vocabulary is borrowed, never forked.** Levels are `Severity`, imported from
 * `domain/ownership.ts` rather than redeclared. Research §4.6 Amendment 5 refused a
 * second set of four words for the same axis, and `ExposureBand` exists precisely
 * because exposure needed a *different* axis; this module needs the same one
 * ownership already publishes, so it uses ownership's own type.
 *
 * **A level that was quoted says so.** Two of the six factors copy their level
 * verbatim from the module that authored it, and `RiskFinding.quoted` marks them, so
 * the guard in `risk/service.test.ts` can assert the copies are byte-identical to
 * what the ports returned instead of taking the word `quoted` on trust.
 */

import type { AccessSnapshot } from './access.js';
import type { ExposureAssessment, ExposureOwnershipContext } from './exposure.js';
import type { Severity } from './ownership.js';
import type { IdentityType } from './types.js';

// --- The factor registry's vocabulary ---------------------------------------

/**
 * The six factors research §5 step 1 survives with, as a closed union.
 *
 * A union rather than a bare string for the reason `AccessPathType` is one: PRD §2.1
 * hands this contract to Unified Impact Analysis and the Home Dashboard, and a
 * seventh factor has to break their builds rather than arrive as an unhandled value.
 * Adding one is a line here plus an append to `DEFAULT_RISK_FACTORS` (architecture
 * rule 3) — never an edit to a comparison chain.
 *
 * Three names differ from the source PRD's §4.1 list, and the renames are the
 * research's Amendment 1. `credential_hygiene` and `trust_decay` are one thing,
 * `ITAG.md` §F9's control drift over the seeded `control_history` table, because no
 * provider records an MFA or authenticator signal for a machine identity at all
 * (§3.2) and 125 of 139 identities here are machines. `dormant_privilege` is
 * `ITAG.md` §F10's grant staleness over `grant_records` × `grant_half_lives`,
 * because `GrantRecord` carries `granted_at` and no `last_used`, so dormancy is not
 * observable and grant age against its class median is.
 */
export type RiskFactorName =
  | 'hop_access'
  | 'exposure'
  | 'ownership'
  | 'control_drift'
  | 'grant_staleness'
  | 'review_staleness';

/**
 * Where a finding's datum came from, named as the file or table rather than prose.
 *
 * Research §3.3 maps NIST SP 800-53r5 RA-3 to "the persisted, versioned per-identity
 * finding record" and notes it maps *only if* the factor values are traceable, so the
 * provenance is a field rather than something a reader infers from the factor name.
 * A closed union so a new source is a deliberate addition.
 */
export type RiskFindingSource =
  | 'access/classify.ts'
  | 'exposure/score.ts'
  | 'ownership/classify.ts'
  | 'control_history'
  | 'grant_records'
  | 'employee_status';

/**
 * A finding's level, which is `Severity` minus the member that is not a finding.
 *
 * `none` is excluded at the type level rather than by convention, so "a finding
 * always reports something worth reporting" cannot be violated by a factor that
 * returns a level it computed as nothing. That is architecture rule 9 in the one
 * place it is cheapest to enforce: absence of a finding is an absent finding, not a
 * finding at zero.
 */
export type RiskFindingLevel = Exclude<Severity, 'none'>;

// --- One factor's verdict (research §5 step 1) ------------------------------

/**
 * One factor's finding about one identity.
 *
 * `evidence` is a sentence carrying the numbers a reviewer would ask for — "past the
 * 180d median revocation for vpn_remote_access (n=9)" — and deliberately **not** a
 * sub-score. Research §4.2 is that a per-factor number exists only to be combined,
 * and NIST SP 800-30 Rev 1's requirement is the opposite one: reproducibility "is
 * increased by the annotation of assessed values… and by the use of tables or other
 * well-defined functions", and "Organizations make explicit the rules used". A
 * sentence with the inputs in it satisfies that; a normalized 0-100 does not.
 */
export interface RiskFinding {
  readonly factor: RiskFactorName;
  readonly level: RiskFindingLevel;
  readonly evidence: string;
  readonly source: RiskFindingSource;
  /**
   * True when `level` was copied verbatim from the module that authored it.
   *
   * `exposure` and `ownership` are quotations; the other four are authored here. The
   * flag is not documentation — `risk/service.test.ts` asserts that every quoted
   * level equals what the corresponding port returned, so a factor cannot claim to
   * be quoting while computing.
   */
  readonly quoted: boolean;
}

// --- The rollup (research §5 steps 2 and 3) ---------------------------------

/**
 * What was found for one identity, or why the answer is not "nothing".
 *
 * Three arms, and the third is the differentiator research §3.5 measured the market
 * for and did not find: nobody ships an explicit not-evaluated state *on the
 * identity itself*. Defender for Cloud's `Not evaluated` scores a recommendation
 * against a resource, Identity Secure Score's `[Not Scored]` is per-tenant, Entra's
 * `hidden` means licence-gated, Okta's enum has no null tier, and SailPoint only
 * creates a record for a detected outlier. The whole category reads absent signal as
 * absent risk.
 *
 * The engine refuses that twice already — `ExposureAssessment` keeps `no_paths` and
 * `no_classified_permissions` structurally apart from a score, and `OwnershipState`
 * carries `unknown` "never counted as a finding" — so this is a house pattern to
 * inherit rather than an idea to invent. What it rules out is the source PRD §6.6's
 * "Partial" badge: a badge beside a value still lets the value sort against
 * fully-evaluated rows, and an arm has no value to sort (§4.5).
 *
 * `factors_unavailable` is present on the `findings` arm too, because a row with
 * four findings and two unevaluated factors is reporting a **floor**, and a reviewer
 * comparing it with a fully-evaluated row needs to know which one they are holding.
 */
export type RiskAssessment =
  | {
      readonly kind: 'findings';
      /** The maximum over the findings' own levels. Nothing averages (§5 step 2). */
      readonly worst_level: RiskFindingLevel;
      /**
       * How many *distinct* factors fired — a count of findings, in findings.
       *
       * This is the number the table sorts on, and it is not a fourth score: it is
       * recomputable by counting the rows below it, which is the condition FIRST
       * places on publishing any derived figure ("both the score and the vector
       * string so others can understand how the score was derived") and which no
       * weighted mean of six heterogeneous scales can meet (§4.3).
       */
      readonly factors_firing: number;
      /** Worst level first, then registry order — the order a drawer reads. */
      readonly findings: readonly RiskFinding[];
      readonly factors_evaluated: readonly RiskFactorName[];
      readonly factors_unavailable: readonly RiskFactorName[];
    }
  | {
      readonly kind: 'no_findings';
      /** Every factor that applies to this identity ran, and none of them fired. */
      readonly factors_evaluated: readonly RiskFactorName[];
    }
  | {
      readonly kind: 'partially_evaluated';
      readonly factors_evaluated: readonly RiskFactorName[];
      /**
       * Named, not counted. Research §3.2 found the dormancy exclusions across AWS,
       * GCP and Azure to be *silent* — Access Analyzer omits service-linked roles,
       * Access Advisor omits data-plane events — and concluded that a factor which
       * reports nothing is indistinguishable from one that was never run unless the
       * omission is named. This is where it is named.
       */
      readonly factors_unavailable: readonly RiskFactorName[];
    };

// --- Reconciling with the three rankers -------------------------------------

/**
 * The sentence research §6 requires on every row, frozen so it cannot drift.
 *
 * Held in the engine for the reason `EXPOSURE_VERSUS_SEVERITY` is: it answers a
 * question about how the engine works, and a UI copy would go stale the first time
 * one of the four definitions moved. The stage risk it addresses is named in §6 —
 * "a fourth surface disagreeing with three others in front of a CISO" — and it is
 * the same risk `access/classify.test.ts` was written to prevent one module earlier.
 */
export const RISK_VERSUS_RANKERS =
  'Ownership severity ranks whether anyone is accountable for this identity and how urgently. ' +
  'Exposure ranks how much this identity could reach if it were misused. ' +
  'Choke points rank which single revocation removes the most access. ' +
  'This profile ranks nothing: it reports which of those signals independently fired for ' +
  'this identity, and how many, so a reviewer can see agreement and disagreement rather ' +
  'than an average of the two.';

// --- Staleness (research §4.5) ----------------------------------------------

/**
 * Which input dates the profile, when the inputs do not share a clock.
 *
 * The source PRD's §4.4 argument is correct and is the one part of that spec adopted
 * unchanged: a composite "is only as fresh as its stalest ingredient", and
 * `domain/exposure.ts` L274 already wrote this module's half of the contract —
 * "Identity Risk Profile points its own `stalest_input` at this value".
 *
 * In this build every factor reads the one dataset validated at boot, so all six
 * inputs share `AccessSnapshot.graph_snapshot_at` and the tie is broken by registry
 * order (architecture rule 3 — list order is precedence). That is visible rather
 * than hidden: when `snapshot_at` equals `based_on_access_discovery_snapshot`,
 * nothing is staler than the graph. A deployment whose control-plane log and
 * entitlement register ingest on their own cadences gets a real answer here with no
 * change to this type.
 */
export interface RiskStalestInput {
  readonly factor: RiskFactorName;
  readonly snapshot_at: string;
}

/**
 * `based_on_access_discovery_snapshot` and `computed_at` are copied from
 * `ExposureStaleness`, which implemented them first and for the same reasons.
 *
 * `stale_if_older_than_hours` is absent, and this is the third document to decline
 * it. `domain/exposure.ts` L280-282 declined it in writing — "it is a deployment
 * policy, not a fact about this snapshot, and there is no rebuild cadence to state
 * one against" — and `unified-impact-analysis-research.md` §2 issued the same
 * correction to the previous PRD that asserted it was a shared convention (§2).
 */
export interface RiskStaleness {
  readonly based_on_access_discovery_snapshot: string;
  readonly computed_at: string;
  /** Null only when no factor could be evaluated at all, so nothing dates the row. */
  readonly stalest_input: RiskStalestInput | null;
}

// --- Output shapes (research §6) --------------------------------------------

interface RiskSubject {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly assessment: RiskAssessment;
  /**
   * Ownership's verdict, quoted whole — the same `ExposureOwnershipContext` two other
   * modules carry, produced by the same adapter.
   *
   * Reusing exposure's context type rather than declaring a parallel one is
   * deliberate: `impact/service.ts` already does it, the guard's byte-identity
   * assertion is then made against an adapter two shipped modules depend on, and a
   * third shape for "what ownership said" is exactly the drift research §3.1 warns
   * about when it notes `ITAG.md` calls the F9 quantity a trust score.
   */
  readonly ownership: ExposureOwnershipContext;
  /**
   * Exposure's assessment union, quoted whole, or null when exposure has no verdict.
   *
   * The union rather than the number, for the reason `ImpactExposureReference` carries
   * the union: a port typed as `number` would make a copy indistinguishable from an
   * original, and this module authoring a 0-100 figure is the one thing architecture
   * rule 8 forbids it. Null is the port's own "unknown to exposure" and is distinct
   * from every arm — groups have no exposure verdict at all (rule 12).
   */
  readonly exposure: ExposureAssessment | null;
  /** `RISK_VERSUS_RANKERS`, on every row, so no consumer can strip it. */
  readonly why_factors_differ: string;
  readonly staleness: RiskStaleness;
}

/** One row of research §6's table. */
export type RiskRow = RiskSubject;

/** §6's drawer — identical to the row, because the row already carries the evidence. */
export type RiskProfile = RiskSubject;

/**
 * Mirrors `ExposureOutcome` and `AccessOutcome`: an unknown id is a terminal state.
 *
 * Architecture rule 6 — only `validateDataset` throws, and it does so at boot.
 */
export type RiskOutcome =
  | { readonly ok: true; readonly profile: RiskProfile }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/**
 * One factor's reach across the population — research §6's `factor_coverage`.
 *
 * The gate, and it is published *before* the ranking for the reason
 * `exposure/service.test.ts` L402 established: the first thing a reviewer needs is
 * not who ranks highest but whether the ranking means anything. Measured on this
 * estate `control_drift` covers four identities and `grant_staleness` seven, both
 * entirely service accounts, so a table sorted by factor count without this block
 * beside it would read as an estate-wide assessment of a four-row fixture (§8 gap 3).
 *
 * `not_applicable` is separate from `unavailable` and the distinction is load
 * bearing: no provider records an access review for a machine identity and none will
 * (§3.2), so counting 113 service accounts as a *gap* in review coverage would imply
 * a gap that could be closed.
 */
export interface RiskFactorCoverage {
  readonly factor: RiskFactorName;
  readonly evaluated: number;
  readonly unavailable: number;
  readonly not_applicable: number;
  /** How many of the evaluated identities this factor actually fired for. */
  readonly findings: number;
}

/** One bar of the level distribution. Findings only — `none` is not a level here. */
export interface RiskLevelCount {
  readonly level: RiskFindingLevel;
  readonly count: number;
}

/**
 * The landing strip. Three population counts rather than one `unassessed`, for the
 * same reason `RiskAssessment` has three arms.
 */
export interface RiskSummary {
  /** First in the type as well as in the payload — see `RiskFactorCoverage`. */
  readonly factor_coverage: readonly RiskFactorCoverage[];
  readonly scanned: number;
  readonly with_findings: number;
  readonly no_findings: number;
  readonly partially_evaluated: number;
  /** Descending by level, so the one a reviewer opens with is first. */
  readonly by_worst_level: readonly RiskLevelCount[];
  readonly snapshot: AccessSnapshot;
}

/**
 * Research §6's filter bar. Filters combine with AND, as every other router does.
 *
 * Note the four fields that are absent, all four refused by name in §4.6: there is no
 * `minScore` or `maxScore` because there is no score, no `peerPercentile` because at
 * n=14 humans and n=6 AI agents NIST's own definition returns the maximum for any
 * p ≥ N/(N+1), and no `risingFast` or `delta7d` because the graph is built once from
 * a frozen dataset and a trend derived from one snapshot is a fabricated alarm —
 * already banned by `exposure/service.test.ts` L590 against the same key names.
 */
export interface RiskQuery {
  readonly app?: string;
  readonly identityType?: IdentityType;
  readonly worstLevel?: RiskFindingLevel;
  /** Research §9 beat 35: `minFactors: 3` is the six-row list, out of 127. */
  readonly minFactors?: number;
  /** Rows where a named factor fired, which is how a coverage gap is drilled into. */
  readonly factor?: RiskFactorName;
  /** Matches the quoted `ownership.owner.id`. Never recomputed here. */
  readonly owner?: string;
  /**
   * Whether identities with no findings are listed. Default false.
   *
   * Covers both no-finding arms together, and asymmetrically with
   * `ExposureQuery.includeNoPaths`, which excludes only one of exposure's two
   * unscored arms. The reason is that here the *summary* is where a coverage gap
   * belongs — `factor_coverage` names it per factor across the whole population,
   * which is stronger than surfacing one partially-evaluated identity in a queue
   * that a reviewer is meant to work top-down.
   */
  readonly includeWithoutFindings?: boolean;
}
