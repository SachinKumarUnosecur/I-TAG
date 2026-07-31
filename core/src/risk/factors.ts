import { daysSince } from '../accountability/rules.js';
import type { AccessPath, IdentityAccessProfile } from '../domain/access.js';
import type { ExposureAssessment, ExposureBand, ExposureOwnershipContext } from '../domain/exposure.js';
import type { AccountabilityPolicy, RiskPolicy } from '../domain/policy.js';
import type { RiskFactorName, RiskFinding, RiskFindingLevel } from '../domain/risk.js';
import type { ControlEvent, EmployeeRecord, GrantHalfLife, GrantRecord, Identity } from '../domain/types.js';

/**
 * The six factors — `docs/identity-risk-profile-research.md` §5 step 1.
 *
 * Pure functions over a context object. No clock, no graph, no service, no port: the
 * whole file is testable against a hand-built `Identity` and four literals, for the
 * reason `exposure/score.ts` is testable against four paths and a `Map`. Architecture
 * rule 1 is satisfied trivially because nothing here walks anything — two factors quote
 * a sibling module's verdict, one reads a path inventory that sibling already produced,
 * and three read tables.
 *
 * **Each factor emits at most one finding, at its own level, in its own vocabulary, and
 * nothing normalizes.** Research §4.2 measured what the alternative costs on this
 * estate: under the source PRD's weighted sum, an identity whose only signal was a live
 * hop path to `aws:account-root` scored 29 while an identity unremarkable on all six
 * scored 28. The OECD/JRC Handbook names the cause as a property of additive
 * aggregation rather than of the weights, so there is no `weight`, no `contribution` and
 * no common scale anywhere below — a level and a sentence is the entire output.
 *
 * **Extension is an append, never an edit** (architecture rule 3). A seventh factor is a
 * member on `RiskFactorName`, an object in `DEFAULT_RISK_FACTORS`, and a test. Nothing
 * downstream switches on a factor's name: `risk/summarize.ts` sees only `RiskFinding`, so
 * it cannot special-case one, and the guard in `risk/service.test.ts` walks whatever the
 * registry produced.
 */

// --- The interface every factor implements ----------------------------------

/**
 * One live grant with the historical pattern for its class, already joined.
 *
 * Joined by the service rather than here so this file stays free of ports — the lookup
 * is an index read, the *comparison* is `ITAG.md` §F10's rule and belongs in the factor.
 * `half_life` is non-optional because `validateDataset` rejects a `grant_records` row
 * whose `grant_type` has no pattern, at boot, so an unjoinable grant cannot be loaded.
 */
export interface RiskGrant {
  readonly grant: GrantRecord;
  readonly half_life: GrantHalfLife;
}

/**
 * Everything any factor may read, assembled once per identity by the service.
 *
 * Data, not callables. A context of plain values is what makes a factor's test a
 * literal rather than a stub of four interfaces, and it keeps the decision about *how*
 * to reach a sibling module — which port, memoized or not — in exactly one place.
 *
 * Note the three-state fields. `access` and `exposure` are `null` when the upstream has
 * no verdict for this identity, `control_events` and `grants` are `null` when no row has
 * been ingested, and `review` is `null` when no personnel record exists. None of them is
 * ever an empty array standing in for an absence: architecture rule 9 turns on that
 * distinction, and `LifecycleDirectory` documents why the ports preserve it.
 */
export interface RiskFactorContext {
  readonly identity: Identity;
  readonly now: Date;
  /** Access Discovery's inventory. Null when that module has no profile for this id. */
  readonly access: IdentityAccessProfile | null;
  /** Exposure's three-armed union, quoted whole. Null when exposure has no verdict. */
  readonly exposure: ExposureAssessment | null;
  /** Ownership's verdict, quoted whole — state, severity, owner. */
  readonly ownership: ExposureOwnershipContext;
  /** `ITAG.md` §F9's log. Null when nothing has been ingested for this identity. */
  readonly control_events: readonly ControlEvent[] | null;
  /** `ITAG.md` §F10's live grants, joined to their class. Null when none are tracked. */
  readonly grants: readonly RiskGrant[] | null;
  /** The personnel record, which exists only where this account belongs to a person. */
  readonly review: EmployeeRecord | null;
  readonly policy: RiskPolicy;
  /** Supplies `staleReviewDays`, the number the engine already uses for this question. */
  readonly accountabilityPolicy: AccountabilityPolicy;
}

/**
 * A factor's answer: a finding, an evaluation that found nothing, or no data.
 *
 * Three values rather than `RiskFinding | null`, and the third is the one architecture
 * rule 9 exists for. "This identity's controls have not weakened" and "no control
 * history has ever been ingested for this identity" are different claims with different
 * remediations, and a `null` both collapse into would be read as the first in a case
 * where it is the second — which on this estate is 123 identities out of 127 (§4.1).
 */
export type RiskFactorVerdict = RiskFinding | 'no_finding' | 'unavailable';

export interface RiskFactor {
  readonly factor: RiskFactorName;
  /**
   * Whether this factor is defined for this identity at all.
   *
   * Separate from returning `'unavailable'`, because "no provider on earth records this
   * for this kind of identity" is not a data gap that could be closed. Research §3.2
   * establishes that for exactly one factor: Entra's `authenticationMethod` is
   * "registered to a **user**" with no service-principal equivalent, and NIST SP
   * 800-63-4 scopes itself with "'person' refers only to natural persons", so an access
   * review for a machine identity is not late — it does not exist. Counting 113 service
   * accounts as a review-coverage gap would imply a gap somebody could be asked to fix.
   *
   * Exactly one factor narrows its population today, and it narrows it by the presence
   * of a personnel record rather than by `Identity.type`, so architecture rule 10 holds.
   */
  applies(context: RiskFactorContext): boolean;
  evaluate(context: RiskFactorContext): RiskFactorVerdict;
}

// --- Published thresholds and lookup tables ---------------------------------

/**
 * Exposure's band to this module's level — research §5 step 1, as a table.
 *
 * A frozen table rather than a comparison chain, so a fifth band is a row (architecture
 * rule 3). Bands below `substantial` are absent deliberately: they map to no finding, and
 * a row mapping them to `low` would turn "this identity reaches a little" into a finding
 * on 74 of 127 identities and bury the twelve that matter.
 *
 * The levels are one step *below* the intuitive reading — `extensive` is `high`, not
 * `critical` — because `EXPOSURE_BAND_FLOORS` is flat quarters of a scale rather than a
 * claim about where danger begins (`domain/exposure.ts` L168-176), while `Severity`'s
 * `critical` means an SLA-breached identity reaching production. Promoting a quarter of
 * a scale to the top of an urgency vocabulary is the shared-vocabulary collision
 * research §4.6 Amendment 5 refused.
 */
export const EXPOSURE_BAND_LEVELS: readonly {
  readonly band: ExposureBand;
  readonly level: RiskFindingLevel;
}[] = Object.freeze([
  Object.freeze({ band: 'extensive' as const, level: 'high' as const }),
  Object.freeze({ band: 'substantial' as const, level: 'medium' as const }),
]);

/**
 * `ITAG.md` §F9's control vocabulary, as the strings the table actually carries.
 *
 * Exported so a fixture can be built without repeating a magic string, and named for
 * what §F9's own JSON example uses. `ControlEvent.control` and `.change` are open strings
 * rather than unions because the log is an ingested provider stream — a new control name
 * must not fail validation — so the factor recognises the two it has a rule for and
 * treats everything else as a weakening it can report but not grade.
 */
export const MFA_CONTROL = 'mfa_enabled';
export const MFA_DISABLED = 'disabled';
export const CONDITIONAL_ACCESS_CONTROL = 'conditional_access';
export const EXCEPTION_GRANTED = 'exception_granted';

// --- Shared helpers ---------------------------------------------------------

/** A type guard rather than a predicate, so `via_permission` needs no assertion. */
function isHop(path: AccessPath): path is HopPath {
  return path.path_type === 'hop';
}

type HopPath = Extract<AccessPath, { path_type: 'hop' }>;

/** Sorted so a tie between two equally bad inputs resolves the same way every run. */
function byPermission(left: HopPath, right: HopPath): number {
  return left.permission.localeCompare(right.permission);
}

// --- Factor 1: hop access ---------------------------------------------------

/**
 * The finding Access Discovery exists to produce, given a level for the first time.
 *
 * This is the one factor that authors a level over a fact it quotes, and research §10
 * leaves the placement open: `access/classify.test.ts` L432 asserts that nothing that
 * module emits carries a severity or a rank, so the level cannot live there, and it has
 * to live somewhere for a reviewer to act on it. Recorded here rather than resolved
 * silently — `quoted` is `false` on this finding precisely because the level is ours.
 *
 * `critical` when a hop path lands on a sensitive permission, `high` otherwise, and
 * never compensable by the other five factors. FIRST's rule for a boolean signal that
 * conflicts with a scalar is override rather than weighting — treat a KEV-listed
 * vulnerability as exploited "regardless of EPSS score" — and it has a name for the
 * alternative, "Score Laundering", which is what a 0.30-weighted hop factor that the
 * other 0.70 can outvote is (§4.2).
 */
export const HOP_ACCESS_FACTOR: RiskFactor = Object.freeze({
  factor: 'hop_access' as const,

  applies: () => true,

  evaluate({ access }: RiskFactorContext): RiskFactorVerdict {
    if (access === null) {
      return 'unavailable';
    }

    const hops = access.paths.filter(isHop);
    if (hops.length === 0) {
      return 'no_finding';
    }

    const sensitive = hops.filter((path) => path.sensitive).sort(byPermission);
    const worst = sensitive[0] ?? [...hops].sort(byPermission)[0];
    if (worst === undefined) {
      return 'no_finding';
    }

    const count = hops.length === 1 ? '1 hop path' : `${hops.length} hop paths`;
    return Object.freeze({
      factor: 'hop_access' as const,
      level: sensitive.length > 0 ? ('critical' as const) : ('high' as const),
      evidence:
        `${count}; reaches ${sensitive.length > 0 ? 'sensitive ' : ''}${worst.permission} ` +
        `by assuming ${worst.assumed_identity} through ${worst.via_permission}`,
      source: 'access/classify.ts' as const,
      quoted: false,
    });
  },
});

// --- Factor 2: exposure -----------------------------------------------------

/**
 * Exposure's band, quoted, mapped to a level by the published table above.
 *
 * The mapping is the only thing this factor computes, and `quoted` is `true` because the
 * *judgement* is exposure's: this module has no opinion about how much footprint is a
 * lot. `risk/service.test.ts` asserts the mapping against the band in the quoted
 * `exposure` subtree on the same row, so a divergence fails rather than ships.
 *
 * The three arms map to three different answers, which is why the port carries the union
 * rather than a number. `no_paths` is a real evaluation that found nothing.
 * `no_classified_permissions` is not — it means the identity reaches things and nobody
 * has assessed any of them, which `domain/exposure.ts` L189-198 separated from a score
 * for exactly this reason, and reading it as "no exposure finding" would be architecture
 * rule 9 broken at the seam where the engine already refused to break it.
 */
export const EXPOSURE_FACTOR: RiskFactor = Object.freeze({
  factor: 'exposure' as const,

  applies: () => true,

  evaluate({ exposure }: RiskFactorContext): RiskFactorVerdict {
    if (exposure === null || exposure.kind === 'no_classified_permissions') {
      return 'unavailable';
    }
    if (exposure.kind === 'no_paths') {
      return 'no_finding';
    }

    const mapped = EXPOSURE_BAND_LEVELS.find((entry) => entry.band === exposure.band);
    if (mapped === undefined) {
      return 'no_finding';
    }

    return Object.freeze({
      factor: 'exposure' as const,
      level: mapped.level,
      evidence: `band ${exposure.band} (exposure score ${exposure.exposure_score})`,
      source: 'exposure/score.ts' as const,
      quoted: true,
    });
  },
});

// --- Factor 3: ownership ----------------------------------------------------

/**
 * Ownership's severity, verbatim, and the only factor whose level needs no rule.
 *
 * `Severity` is already an urgency ranking over this exact population, authored by the
 * engine's first ranking authority, so re-deriving it would be a second opinion nobody
 * asked for. `severity: 'none'` covers three cases in `ownership/severity.ts` — an owned
 * identity, an uncounted one and a live suppression — and all three correctly produce no
 * finding here, which is what stops a registered break-glass exemption from being
 * resurrected as a risk factor on a new surface.
 *
 * `state: 'unknown'` is `'unavailable'`, in ownership's own words: `OwnershipState`
 * documents it as "insufficient data to decide", "structurally separate from `unowned`
 * and never counted as a finding".
 */
export const OWNERSHIP_FACTOR: RiskFactor = Object.freeze({
  factor: 'ownership' as const,

  applies: () => true,

  evaluate({ ownership }: RiskFactorContext): RiskFactorVerdict {
    if (ownership.state === 'unknown') {
      return 'unavailable';
    }
    if (ownership.severity === 'none') {
      return 'no_finding';
    }

    const owner = ownership.owner;
    return Object.freeze({
      factor: 'ownership' as const,
      level: ownership.severity,
      evidence:
        owner === null
          ? ownership.state
          : `${ownership.state} (owner ${owner.kind} ${owner.id})`,
      source: 'ownership/classify.ts' as const,
      quoted: true,
    });
  },
});

// --- Factor 4: control drift (ITAG.md §F9) ----------------------------------

/**
 * `ITAG.md` §F9, built on the table §F9 published — and the factor the source PRD
 * proposed building an IdP connector for.
 *
 * §F9's scoring logic is a baseline of 100 with per-control deductions and a compounding
 * time multiplier, and it is **not** implemented as written: a decayed 0-100 trust score
 * is the fourth per-identity number architecture rule 8 forbids, and research §3.1 notes
 * the name collision that would follow. What survives is §F9's ordering of the same
 * facts — "MFA disabled = high impact", and "a 'temporary' exception that's still active
 * 90+ days later" is worse than one granted this quarter — expressed as three levels.
 *
 * Research §3.2 is why this reads a table rather than a provider: across AWS, Entra, GCP
 * and Kubernetes, no vendor documents an MFA, passwordless or authenticator-strength
 * signal for *any* machine identity, and AWS's credential report "lists all users in your
 * account" with no role coverage at all. For 125 of 139 identities here the signal is not
 * weak, it is structurally absent, so the PRD's §5 list of six provider sources is marked
 * aspirational and the seeded log is the honest input.
 */
export const CONTROL_DRIFT_FACTOR: RiskFactor = Object.freeze({
  factor: 'control_drift' as const,

  applies: () => true,

  evaluate({ control_events, now, policy }: RiskFactorContext): RiskFactorVerdict {
    if (control_events === null) {
      return 'unavailable';
    }
    if (control_events.length === 0) {
      return 'no_finding';
    }

    const dated = [...control_events]
      .map((event) => ({ event, age: daysSince(event.date, now) }))
      .filter((entry): entry is { event: ControlEvent; age: number } => entry.age !== null)
      .sort((left, right) => right.age - left.age);

    const mfa = dated.find(
      ({ event }) => event.control === MFA_CONTROL && event.change === MFA_DISABLED,
    );
    // `>=`, not `>`, because §F9's rule is written as "still active 90+ days later" —
    // which makes `svc-backup`, seeded at exactly the threshold, the boundary case the
    // pin in `data/seed-risk.test.ts` exists to hold.
    const staleException = dated.find(
      ({ event, age }) =>
        event.control === CONDITIONAL_ACCESS_CONTROL &&
        event.change === EXCEPTION_GRANTED &&
        age >= policy.exceptionStaleDays,
    );

    if (mfa !== undefined && staleException !== undefined) {
      return Object.freeze({
        factor: 'control_drift' as const,
        level: 'critical' as const,
        evidence:
          `MFA disabled ${mfa.age}d ago and a temporary exception still live after ` +
          `${staleException.age}d`,
        source: 'control_history' as const,
        quoted: false,
      });
    }
    if (mfa !== undefined) {
      return Object.freeze({
        factor: 'control_drift' as const,
        level: 'high' as const,
        evidence: `MFA disabled ${mfa.age}d ago`,
        source: 'control_history' as const,
        quoted: false,
      });
    }

    const oldest = dated[0];
    if (oldest === undefined) {
      return 'no_finding';
    }
    const others = dated.length === 1 ? '' : `, and ${dated.length - 1} further control change(s)`;
    return Object.freeze({
      factor: 'control_drift' as const,
      level: 'medium' as const,
      evidence: `${oldest.event.control} ${oldest.event.change} ${oldest.age}d ago${others}`,
      source: 'control_history' as const,
      quoted: false,
    });
  },
});

// --- Factor 5: grant staleness (ITAG.md §F10) -------------------------------

/**
 * `ITAG.md` §F10, with the discriminating threshold research §4.1 measured.
 *
 * §F10's rule is to flag a grant that "has already outlived the typical 'actually
 * needed' window but hasn't hit the typical revocation window yet". Implemented as
 * written on this estate, it fires on **all seven** tracked grants — and a detector that
 * fires on 100% of its population is not a detector. So both medians are used and they
 * grade rather than gate: `median_days_to_actual_need` is `medium` and separates 7 from
 * 7, `median_days_to_revocation` is `high` and separates 2 from 7, which is the line a
 * reviewer can act on.
 *
 * Named `grant_staleness`, not `dormant_privilege`, and the rename is research Amendment
 * 1. Dormancy is a claim about *use*, and `GrantRecord` carries `granted_at` and no
 * `last_used`; the estate's actual idle telemetry (`Identity.last_activity_at`) has a
 * median of two days. Calling grant age dormancy would assert a measurement that never
 * ran, which is the mistake `reachable_permissions` is named to avoid (rule 13).
 */
export const GRANT_STALENESS_FACTOR: RiskFactor = Object.freeze({
  factor: 'grant_staleness' as const,

  applies: () => true,

  evaluate({ grants, now }: RiskFactorContext): RiskFactorVerdict {
    if (grants === null) {
      return 'unavailable';
    }

    const aged = grants
      .map((entry) => ({ entry, age: daysSince(entry.grant.granted_at, now) }))
      .filter((row): row is { entry: RiskGrant; age: number } => row.age !== null)
      // Oldest first, so the grant named in the evidence is the one a reviewer opens
      // with when several in one class have crossed the same median.
      .sort((left, right) => right.age - left.age);

    const revoked = aged.filter(
      (row) => row.age > row.entry.half_life.median_days_to_revocation,
    );
    const needed = aged.filter((row) => row.age > row.entry.half_life.median_days_to_actual_need);

    const worst = revoked[0] ?? needed[0];
    if (worst === undefined) {
      return 'no_finding';
    }

    const beyondRevocation = revoked[0] !== undefined;
    const { median_days_to_revocation, median_days_to_actual_need, grant_type, sample_size } =
      worst.entry.half_life;
    const threshold = beyondRevocation ? median_days_to_revocation : median_days_to_actual_need;
    const window = beyondRevocation ? 'median revocation' : 'median need window';

    return Object.freeze({
      factor: 'grant_staleness' as const,
      level: beyondRevocation ? ('high' as const) : ('medium' as const),
      evidence:
        `${worst.entry.grant.permission} is ${worst.age}d old, past the ${threshold}d ` +
        `${window} for ${grant_type} (n=${sample_size})`,
      source: 'grant_records' as const,
      quoted: false,
    });
  },
});

// --- Factor 6: review staleness ---------------------------------------------

/**
 * The one factor whose population is narrower than the estate, and the only one that
 * says so through `applies`.
 *
 * Research §8 gap 6 requires this be scoped in writing rather than left to look like one
 * of six equal factors: it is defined for 14 of 139 identities and fires for 3. The scope
 * is "this account belongs to a person we hold a review record for", read from the
 * presence of the record, so the factor narrows on data rather than on `Identity.type`.
 *
 * `medium` and only `medium`, deliberately. A review being late is a process fact about a
 * human, and the level cannot be raised by what the account can reach without
 * re-deriving exposure's judgement under a second name. The threshold is
 * `AccountabilityPolicy.staleReviewDays`, compared exactly as
 * `accountability/rules.ts` L124 compares it, so the two surfaces cannot disagree about
 * whether a 90-day-old review is stale.
 */
export const REVIEW_STALENESS_FACTOR: RiskFactor = Object.freeze({
  factor: 'review_staleness' as const,

  applies: ({ review }: RiskFactorContext) => review !== null,

  evaluate({ review, now, accountabilityPolicy }: RiskFactorContext): RiskFactorVerdict {
    if (review === null) {
      return 'unavailable';
    }

    const elapsed = daysSince(review.last_reviewed, now);
    if (elapsed === null) {
      return 'unavailable';
    }
    if (elapsed <= accountabilityPolicy.staleReviewDays) {
      return 'no_finding';
    }

    return Object.freeze({
      factor: 'review_staleness' as const,
      level: 'medium' as const,
      evidence:
        `last access review was ${elapsed}d ago, past the ` +
        `${accountabilityPolicy.staleReviewDays}d review window`,
      source: 'employee_status' as const,
      quoted: false,
    });
  },
});

// --- The registry -----------------------------------------------------------

/**
 * The frozen registry, and **list order is precedence** (architecture rule 3).
 *
 * Two things read the order, and neither is a ranking. Findings are presented worst level
 * first and then in this order, so two identities with the same findings render
 * identically. And `RiskStaleness.stalest_input` breaks its tie here, which matters
 * because in this build every factor reads one dataset built at boot and the six input
 * snapshots are therefore equal.
 *
 * Ordered as research §5's table is: the two access-derived quotations, then ownership,
 * then the three lifecycle factors in descending coverage. Appending a seventh factor
 * changes nothing above it.
 */
export const DEFAULT_RISK_FACTORS: readonly RiskFactor[] = Object.freeze([
  HOP_ACCESS_FACTOR,
  EXPOSURE_FACTOR,
  OWNERSHIP_FACTOR,
  CONTROL_DRIFT_FACTOR,
  GRANT_STALENESS_FACTOR,
  REVIEW_STALENESS_FACTOR,
]);
