/**
 * Identity Exposure Map vocabulary — `docs/PRD-identity-exposure-map.md` §4.3 and
 * `docs/identity-exposure-map-research.md` §4.3, §5.
 *
 * **This is the only module in the engine besides `ownership/severity.ts` allowed
 * to rank anything, and the exception is deliberate** (research §7.2). Access
 * Discovery classifies how an identity reaches a permission and refuses to say how
 * much it matters; `access/classify.test.ts` enforces that by walking its output
 * for any key named `severity`, `rank`, `score` or `priority`. This file is where
 * that number is finally allowed to exist, for a different question over a
 * different population: ownership severity asks *is anyone accountable for this,
 * and how urgently*, exposure asks *if this were misused, how much is reachable*.
 *
 * Two consequences run through every type below.
 *
 * **The score never travels alone.** FIRST makes publishing the vector a condition
 * of using CVSS — "both the score and the vector string so others can understand
 * how the score was derived" — and CVSS v4.0 abandoned v3.x's algebra precisely
 * because those formulas "were not intuitive due to their rather abstract
 * predefined formulas". So `exposure_score`, `weighted_sum`, `contributions` and
 * the unclassified list are one object with one lifetime, and no consumer can
 * render the number without holding the derivation (research §4.3).
 *
 * **The other ranker travels with it too.** A reviewer looking at two numbers for
 * one identity will ask which to believe, and research §7.2 names that as this
 * module's stage risk. `ExposureOwnershipContext` puts ownership's verdict and the
 * sentence reconciling them inside the same payload, so a UI physically cannot
 * show one number without the other.
 */

import type { AccessPath, AccessPathType, AccessSnapshot } from './access.js';
import type { OwnerRef, OwnershipState, Severity } from './ownership.js';
import type { IdentityType } from './types.js';

// --- Sensitivity ------------------------------------------------------------

/**
 * The three states a permission's classification can be in — PRD Amendment 3.
 *
 * `unclassified` is the load-bearing member and the reason this is not a boolean.
 * It means *nobody has assessed this*, which is a different claim from "this is
 * safe", and PRD §5 L129's instruction to treat it as Medium is overruled: a score
 * that rises because the classification registry degraded tells a reviewer about
 * the registry rather than about the estate, and there is no action on the other
 * side of it. An `unclassified` permission is excluded from the weighted sum
 * (architecture rule 9 — absence of data is never a finding) and reported as the
 * completeness metric of §7 instead.
 *
 * The precedent is the providers' own: Amazon Macie reserves sensitivity score 50
 * for "not yet analyzed" between 1-49 "not sensitive" and 51-99 "sensitive", and
 * Microsoft Defender for Cloud carries "Not evaluated" alongside its four risk
 * levels. Neither collapses absence of assessment into a tier.
 *
 * A bare string union rather than Amendment 3's tagged-object form, matching
 * `AccessPathType` and `Severity`: this is a classification *value*, and the repo
 * reserves the `{ kind }` shape for outcomes that carry a payload. The three
 * states and their treatment are exactly as Amendment 3 specifies; only the
 * encoding is narrower.
 */
export type PermissionSensitivity = 'sensitive' | 'not_sensitive' | 'unclassified';

// --- The exposure set (research §5 step 1) ----------------------------------

/**
 * One permission an identity can reach, with every route to it collapsed.
 *
 * The de-duplication PRD §4.2 step 2 asks for, made auditable. §8's second open
 * question worries that collapsing to the worst route hides the fact that closing
 * it would not fully remediate — so the route that scores is carried whole, and
 * the ones discarded are carried as a count and a type list. The map badges
 * `route_count > 1`; remediation reads `route_types`; only `scored_route`
 * contributes.
 */
export interface ExposureEntry {
  readonly permission: string;
  readonly sensitivity: PermissionSensitivity;
  /**
   * The route the contribution is computed from: worst mechanism, `hop` >
   * `indirect` > `direct` (research §5 step 1).
   *
   * The whole `AccessPath`, not a flattened copy of its interesting fields. It is
   * already a discriminated union carrying exactly the right shape per mechanism —
   * a group for `indirect`, a resource and a principal for `hop` — so flattening
   * it here would reintroduce the nullable fields that union exists to remove. It
   * is also the object PRD §6.4 renders on node click, reusing Access Discovery's
   * chain accordion rather than duplicating it.
   */
  readonly scored_route: AccessPath;
  /**
   * The shortest route's edge count, which can differ from `scored_route.hop_count`.
   *
   * Research §5 step 1 retains both, and `svc-invoice-poster` is why they are two
   * fields rather than one: it reaches `write:invoice-queue` by an `indirect` route
   * at distance 2 and a `hop` at distance 3. The hop scores, because mechanism is
   * what a reviewer acts on; the map draws the permission at the scored route's
   * distance, because that is the route the badge describes. Publishing the
   * shorter one separately means neither fact has to be inferred.
   */
  readonly min_hop_distance: number;
  readonly route_count: number;
  /** Sorted and distinct, so `['hop','indirect']` reads the same for every identity. */
  readonly route_types: readonly AccessPathType[];
}

/** The de-duplicated footprint, and how much of it the score could see. */
export interface ExposureSet {
  readonly total_permissions: number;
  readonly counted: number;
  readonly unclassified: number;
  readonly entries: readonly ExposureEntry[];
}

/**
 * One ring of PRD §6.4's map — one per *distinct* distance present (Amendment 6).
 *
 * Not the spec's 1 / 2 / 3+ buckets: research §4.1 measured the seed and found
 * `direct` always at distance 1, `indirect` always at 2 and only `hop` beyond, so
 * three buckets would have re-encoded the path-type column and collapsed the
 * estate's deepest chain into the same ring as its shallowest hop. A nested group
 * now puts an `indirect` path at distance 3, which is what earns the geometry.
 *
 * An array sorted by distance rather than a record keyed by number-as-string,
 * matching `LineageCoverage.gap_buckets` — under `noUncheckedIndexedAccess` a
 * record forces every consumer to handle a key that cannot be absent.
 */
export interface ExposureRing {
  readonly hop_distance: number;
  readonly permissions: readonly ExposureEntry[];
}

// --- The score, and its derivation ------------------------------------------

/**
 * One counted permission's share of the weighted sum — research §4.3.
 *
 * Emitted for every scored identity, always, because the alternative is the bare
 * number CVSS v4.0 exists to escape. `share_of_score` is a share of
 * `weighted_sum`, not of the 0-100 score, which is the honest denominator: the
 * saturation is applied once to the total and cannot be attributed per permission.
 * The name is PRD §4.3's and is kept so the two documents read the same.
 */
export interface ExposureContribution {
  readonly permission: string;
  /** 1.0 sensitive, 0.1 not sensitive — research §5 step 2, a published 10:1 choice. */
  readonly weight: number;
  /** 1.5 hop, 1.0 otherwise — research §5 step 3, mechanism not distance. */
  readonly mechanism_multiplier: number;
  readonly contribution: number;
  readonly share_of_score: number;
}

/**
 * PRD §6.2's chip row, renamed away from the words the other ranker owns.
 *
 * `Severity` is `critical | high | medium | low | none` and ranks a finding's
 * urgency. §6.2 asks for exposure bands called Critical/High/Medium/Low, which
 * would put the same four words on two adjacent columns meaning two different
 * things — `svc-vpn-legacy` is severity `critical` and would badge exposure High,
 * while `user-maya` is severity `none` and would badge exposure Critical. Research
 * §7.2 already names two rankers disagreeing in front of a customer as this
 * module's stage risk; shared vocabulary is the version of it that cannot be
 * explained in one sentence. These four words describe *how much is reachable*,
 * which is what the score measures.
 */
export type ExposureBand = 'minimal' | 'limited' | 'substantial' | 'extensive';

/**
 * Flat quarters of the 0-100 scale, and flat on purpose.
 *
 * Research §4.3's argument is that an unpublished threshold is indefensible, and
 * a threshold fitted to this estate would be worse than unpublished — it would be
 * a claim about where danger begins, derived from 98 rows of demo data. A quarter
 * of the scale claims nothing except that the scale was divided into four. The
 * resulting distribution is usable rather than degenerate: 73 / 1 / 17 / 7 across
 * the seed, so the top band is a reviewable queue.
 *
 * Ordered high to low; the first floor a score clears wins. Appending a fifth band
 * means inserting a row here, never editing a comparison chain (architecture rule 3).
 */
export const EXPOSURE_BAND_FLOORS: readonly { readonly band: ExposureBand; readonly floor: number }[] =
  Object.freeze([
    Object.freeze({ band: 'extensive' as const, floor: 75 }),
    Object.freeze({ band: 'substantial' as const, floor: 50 }),
    Object.freeze({ band: 'limited' as const, floor: 25 }),
    Object.freeze({ band: 'minimal' as const, floor: 0 }),
  ]);

/**
 * What was computed for one identity, or why nothing was.
 *
 * Three arms, not two, and the third is the one architecture rule 7 exists for.
 * "This identity reaches nothing" and "this identity reaches six things and nobody
 * has assessed any of them" are different claims with different remediations — the
 * first is a clean result, the second is a gap in the classification registry — and
 * a `0` that both collapse into is a number a reviewer would act on wrongly in one
 * of the two cases. `svc-partner-sync` is the second case and is the point of PRD
 * §7's completeness gate.
 *
 * The scored fields live only on the `scored` arm, so a consumer cannot read a
 * score off a row that has not got one.
 */
export type ExposureAssessment =
  | {
      readonly kind: 'scored';
      /** 0-100, saturating — research §5 step 5, `k = 1.189` anchored on `user-jane`. */
      readonly exposure_score: number;
      /**
       * The pre-normalization `S`, uncompressed and totally ordered.
       *
       * Saturation costs resolution at the top — at `S = 6` the score is 99.4 and
       * every larger footprint is indistinguishable at integer precision — so the
       * table sorts on this and displays the other. A CISO reads the 0-100; an
       * engineer triaging a tie reads `S` (research §5).
       */
      readonly weighted_sum: number;
      readonly band: ExposureBand;
      /** Descending by contribution, so `[0]` is §6.4's "83 % of this is one hop path". */
      readonly contributions: readonly ExposureContribution[];
      /** Excluded from the sum, and named rather than merely counted. */
      readonly unclassified_permissions: readonly string[];
      /**
       * PRD §6.3's column, or null when the identity reaches nothing sensitive.
       *
       * Null means exactly one thing here and the column renders it as a dash, so
       * it does not collapse two claims the way a `0` score would — the same
       * reasoning that makes `IdentityAccessProfile.hop_summary` nullable.
       */
      readonly highest_sensitivity_reached: string | null;
    }
  | { readonly kind: 'no_paths' }
  | {
      readonly kind: 'no_classified_permissions';
      readonly unclassified_permissions: readonly string[];
    };

// --- Reconciling with the other ranker --------------------------------------

/**
 * The sentence research §7.2 requires on screen, frozen so it cannot drift.
 *
 * Held in the engine rather than in the frontend because it is the answer to a
 * question about how the engine works, and a UI copy of it would go stale the
 * first time either definition moves.
 */
export const EXPOSURE_VERSUS_SEVERITY =
  'Ownership severity ranks whether anyone is accountable for this identity and how urgently. ' +
  'Exposure ranks how much this identity could reach if it were misused. ' +
  'An identity can be correctly owned and still be a large blast radius, so the two numbers ' +
  'are expected to disagree.';

/**
 * Ownership's verdict, carried alongside exposure's so neither can be shown alone.
 *
 * This is not this module ranking ownership — the values are copied verbatim from
 * `ownership/classify.ts`, which remains their only author. It is the disclosure
 * that makes two rankers survivable: `user-jane` is `owned` at severity `none` and
 * 78/100 here, and a reviewer who sees only one of those learns the wrong thing.
 */
export interface ExposureOwnershipContext {
  readonly state: OwnershipState;
  readonly severity: Severity;
  readonly owner: OwnerRef | null;
  readonly why_these_differ: string;
}

// --- Staleness --------------------------------------------------------------

/**
 * PRD §4.4, implemented as written and the cleanest part of that spec.
 *
 * `based_on_access_discovery_snapshot` is copied verbatim from
 * `AccessSnapshot.graph_snapshot_at`, never re-read from the clock: the contract
 * is that a consumer dates the facts it *read*, not the moment it read them, and
 * Identity Risk Profile points its own `stalest_input` at this value.
 *
 * `computed_at` is the compute instant and is **not** evidence of freshness. Both
 * are present so the distinction is visible rather than assumed; in this build
 * they coincide, because the graph is built once from a frozen dataset.
 *
 * `stale_if_older_than_hours` is absent: it is a deployment policy, not a fact
 * about this snapshot, and there is no rebuild cadence to state one against.
 */
export interface ExposureStaleness {
  readonly based_on_access_discovery_snapshot: string;
  readonly computed_at: string;
}

// --- Output shapes ----------------------------------------------------------

/** One row of PRD §6.3's landing table. */
export interface ExposureRow {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly assessment: ExposureAssessment;
  /** §6.3's *Reachable Permissions*, with *Unclassified* beside it (Amendment 3). */
  readonly reachable_permissions: number;
  readonly unclassified_permissions: number;
  readonly ownership: ExposureOwnershipContext;
}

/** PRD §6.4's detail view: the set, the map, and the derivation. */
export interface ExposureProfile {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly assessment: ExposureAssessment;
  readonly exposure_set: ExposureSet;
  /** Ascending by distance — the rings, drawn outward from the identity. */
  readonly rings: readonly ExposureRing[];
  readonly ownership: ExposureOwnershipContext;
  readonly staleness: ExposureStaleness;
}

/**
 * Mirrors `AccessOutcome`: an unknown id is a terminal state, not a throw.
 *
 * Architecture rule 6 — only `validateDataset` throws, and it does so at boot.
 */
export type ExposureOutcome =
  | { readonly ok: true; readonly profile: ExposureProfile }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/**
 * PRD §7's gate metric, over the catalogue rather than over one footprint.
 *
 * Research §3.2 found the joinable fraction of provider classification data to be
 * zero — every mechanism the PRD names classifies a storage container and this
 * engine's terminal object is a capability — so this is not one quality indicator
 * among four. It is the precondition for the score meaning anything, and it is
 * measured over the whole permission catalogue because that is the vocabulary
 * every future score will be computed against, not just today's reachable subset.
 */
export interface ClassificationCompleteness {
  readonly classified: number;
  readonly unclassified: number;
  readonly total: number;
  readonly ratio: number;
}

/** One bar of the landing view's distribution — PRD §6.2's chip counts. */
export interface ExposureBandCount {
  readonly band: ExposureBand;
  readonly floor: number;
  readonly count: number;
}

/**
 * The landing strip. Three population counts rather than one `unscored`, for the
 * same reason `ExposureAssessment` has three arms.
 */
export interface ExposureSummary {
  readonly scored: number;
  readonly no_paths: number;
  readonly no_classified_permissions: number;
  readonly identities_scanned: number;
  readonly classification_completeness: ClassificationCompleteness;
  /** Descending by floor, so the band a reviewer opens with is first. */
  readonly band_counts: readonly ExposureBandCount[];
  readonly snapshot: AccessSnapshot;
}

/**
 * PRD §6.2's filter bar, minus the two filters that were removed.
 *
 * *Exposure Delta* and the *Rising Fast* chip are gone (Amendment 5): both need a
 * prior snapshot, the graph is built once from a frozen dataset, and a trend
 * computed from one snapshot is a fabricated alarm — worse than a missing field
 * because it is actionable. There is no `exposureDelta` here and no
 * `exposure_delta` anywhere in this file.
 */
export interface ExposureQuery {
  readonly app?: string;
  readonly identityType?: IdentityType;
  readonly band?: ExposureBand;
  readonly minScore?: number;
  readonly maxScore?: number;
  /**
   * Whether identities that reach nothing at all are listed. Default false.
   *
   * Asymmetric with `no_classified_permissions`, which is always listed, and the
   * asymmetry is the point: an identity with no paths has nothing to triage, while
   * an identity whose whole footprint is unassessed is precisely what §7's
   * completeness gate exists to put in front of someone. Mirrors
   * `OwnershipQuery.includeUncounted` (`ownership/classify.ts`).
   */
  readonly includeNoPaths?: boolean;
}
