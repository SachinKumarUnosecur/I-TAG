/**
 * Blast Radius vocabulary — `docs/unified-impact-analysis-research.md` §4.6, §5, §6.
 *
 * **This module ranks remediations, and that is the only reason it is allowed to
 * rank at all.** Architecture rule 8 fixes the engine at two ranking authorities —
 * `ownership/severity.ts` ranks findings by urgency, `exposure/score.ts` ranks
 * identities by footprint — and research §4.2 is the argument for why a third does
 * not breach it: a choke point is an *edge*, the unit is a measured count rather
 * than a 0-100 rating, and the verb is *revoke* rather than *review*. No type in
 * this file sorts an identity, and none of them carries a score.
 *
 * The PRD's `exploitable_risk_score`, its systemic leaderboard, and §4.2 step 6
 * are struck (research §4.2, §7.2), so there is deliberately **no `ImpactRow` and
 * no `ImpactQuery`** below: there is no landing table of identities to filter,
 * because ranking identities is what this module refused to do. The landing
 * artifact is `ChokePointReport`, whose rows are grants.
 *
 * Three properties run through every type here.
 *
 * **Two deltas, never one.** Research §1.3 measured `connect:ledger-writer` and
 * found the same remediation is a 17% reduction counted one way and 0% counted the
 * other, because `svc-invoice-poster` keeps reaching `write:invoice-queue` through
 * its group. A single "percent of risk removed" is therefore not a metric but a
 * choice of whichever denominator reads better. `ChokePoint` carries `access_removed`
 * and `mechanisms_closed` as separate `ImpactDelta` objects, each with its own
 * baseline inside it, so a percentage cannot be rendered without its denominator.
 *
 * **The selection method is published.** Minimum Critical Set of Attacks is
 * NP-complete and polynomially equivalent to minimum hitting set (Jha, Sheyner and
 * Wing, *Two Formal Analyses of Attack Graphs*, CSFW 2002), so an unbounded
 * heuristic presented as an optimum is the choke-point equivalent of an unpublished
 * score. `ChokePointSelection` states which of the two algorithms produced the
 * answer, and the approximation arm carries its bound (research §4.4).
 *
 * **This module authors no score, and quotes one.** `ImpactExposureReference` holds
 * the whole `ExposureAssessment` union rather than a number, so a consumer
 * physically cannot read `exposure_score` off a starting identity that has not got
 * one, and the quotation is namespaced under a single field so the guard test can
 * assert that everything outside it is score-free.
 */

import type { AccessPathType, AccessSnapshot } from './access.js';
import type { ExposureAssessment, ExposureOwnershipContext } from './exposure.js';
import type { IdentityType } from './types.js';

// --- The counts (research §5 step 1) ----------------------------------------

/**
 * What one starting identity can reach, in the three units research §5 step 1 names.
*
 * Counts rather than a score, and three of them rather than one, for the reason
 * `AccessCounts` is three plain numbers: collapsing them into a single figure is
 * the ranking this module does not do. All three are one pass over
 * `IdentityAccessProfile.paths` — the recursion already happened inside
 * `discoverAccess`, so nothing here re-walks the graph (architecture rule 1).
 *
 * `identities_reachable` is the genuinely new one and the reason NIST SP 800-53
 * AC-6 maps to this module at all: it counts the *other principals* one identity's
 * credentials transitively confer, which no per-identity review can see.
 */
export interface ImpactCounts {
  /** Distinct terminal permissions, by any mechanism. The PRD's "resources". */
  readonly resources_reachable: number;
  /** Distinct principals crossed via `AccessPath`'s hop arm — research §2, gap 7. */
  readonly identities_reachable: number;
  /**
   * The most sensitive permission reached, or null when none is sensitive.
   *
   * Null rather than a placeholder, matching `ExposureAssessment.highest_sensitivity_reached`
  * and `IdentityAccessProfile.hop_summary`: "reaches nothing sensitive" is a clean
   * result a column renders as a dash, and a fabricated zero would collapse it with
   * "we did not look".
   */
  readonly highest_sensitivity_reached: string | null;
}

/**
 * One identity boundary this starting identity actually crosses.
 *
 * Derived in a single pass from the hop arms of `IdentityAccessProfile.paths`,
 * grouped by the grant that opens them. `via_permission` is the front crossing —
 * `domain/access.ts` L74-79 documents it as "the grant a reviewer revokes to close
 * the path… deliberately not the terminal permission" — which is exactly the unit
 * a choke point is measured in.
 *
 * `assumed_identity_app` is carried because the cross-system case is the one no
 * provider console can render: demo beat 23 crosses from `mcp-gateway` into
 * `snowflake`, and a UI that had to join back to the identity table to discover
 * that would be re-deriving the finding.
 */
export interface ImpactPivot {
  readonly via_permission: string;
  readonly assumed_identity: string;
  readonly assumed_identity_app: string;
  /** Distinct permissions on paths this grant opens, sorted for stable rendering. */
  readonly permissions_reached: readonly string[];
  /** The longest chain this grant fronts, in edges — `AccessPathBase.hop_count`. */
  readonly deepest_hop_count: number;
}

// --- Reconciling with the other two authorities -----------------------------

/**
 * The sentence research §7.2 requires on screen, frozen so it cannot drift.
 *
 * `EXPOSURE_VERSUS_SEVERITY` reconciles the first two rankers; this reconciles the
 * third against them, and the distinction it draws is the module's entire claim to
 * existing. Held in the engine rather than in the frontend for the reason its
 * counterpart is: it answers a question about how the engine works, and a UI copy
 * would go stale the first time any of the three definitions moved.
 */
export const IMPACT_VERSUS_EXPOSURE =
  'Exposure ranks identities by how much they could reach if misused. ' +
  'Blast Radius ranks grants by how much reach is removed if they are revoked. ' +
  'The two disagree by design: the most valuable grant to revoke is often held by ' +
  'an identity whose own footprint is unremarkable, which is why it survives review.';

/**
 * The starting identity's exposure verdict, quoted rather than recomputed.
 *
 * The whole three-armed union, never the number: `exposure/score.ts` remains the
 * only author of a 0-100 figure in the engine, and carrying `ExposureAssessment`
 * intact means a consumer cannot read a score off an identity whose footprint was
 * unclassified or empty. Research §5 step 6 requires the context to travel, for the
 * reason `exposure/service.test.ts` already enforces on its own rows: a reviewer who
 * sees one ranking without the others learns the wrong thing.
 *
 * Namespaced under one field on purpose. The guard test walks every *other* field of
 * this module's output rejecting anything score-shaped, and asserts this subtree is a
 * verbatim copy of what `ExposureService` returned — so "authors no score" is
 * structural rather than a matter of review.
 */
export interface ImpactExposureReference {
  /**
   * Null when exposure does not rank this identity at all, which is not one of the
   * union's arms and must not be folded into one.
   *
   * Groups are the case: architecture rule 12 excludes them from every module's
   * subject population, so exposure has no verdict on `group-oncall-agents` — and
   * substituting `no_paths` would assert that exposure looked and found nothing,
   * when it never looked. That is the same two-claims-one-value collapse rule 7
   * exists to prevent, so the third state is spelled rather than approximated.
   */
  readonly assessment: ExposureAssessment | null;
  readonly why_these_differ: string;
}

// --- Per-identity assessment ------------------------------------------------

/**
 * What propagation found for one starting identity, or why there was none.
*
 * Three arms for the reason `ExposureAssessment` has three (architecture rule 7).
 * "This identity reaches things but cannot cross an identity boundary" and "this
 * identity reaches nothing at all" are different claims with different renderings:
 * the first is PRD §6.4's green *No cross-identity pivot paths found from this
 * starting point*, which is correct and kept verbatim; the second is an identity
 * that was scanned and had no footprint to analyse, and showing it the same banner
 * would assert an analysis that had nothing to run on. The 21 `svc-fixture-*`
 * engine probes are the second case.
 *
 * `counts` and `pivots` exist only on the first arm, so a zero can never be read
 * off a row that has not got one.
 */
export type ImpactAssessment =
  | {
      readonly kind: 'propagates';
      readonly counts: ImpactCounts;
      /** Descending by `permissions_reached`, then by id, so the widest crossing leads. */
      readonly pivots: readonly ImpactPivot[];
    }
  | {
     /** Has reachable access, but no path of it crosses an identity boundary. */
      readonly kind: 'no_pivot_paths';
      readonly counts: ImpactCounts;
    }
  | {
      /** Scanned, and reaches nothing at all — there was no footprint to propagate. */
      readonly kind: 'no_access';
    };

// --- Deltas (research §4.3) -------------------------------------------------

/**
 * One measured consequence of a revocation, with its denominator inside it.
 *
 * Research §1.3 is the reason `share_of_baseline` cannot be published on its own:
 * severing `connect:ledger-writer` is "17% of risk removed" against a baseline of
 * pivot edges and "0%" against a baseline of reachable access, and a percentage
 * whose value moves between the two depending on an unstated denominator is a pitch
 * rather than a measurement. `baseline` and `counterfactual` are both here so the
 * fraction can be checked rather than trusted.
 *
 * `share_of_baseline` is a ratio in [0, 1], not a 0-100 number, and deliberately so:
 * this module publishes no figure on the same scale as `exposure_score`.
 */
export interface ImpactDelta {
  readonly baseline: number;
  readonly counterfactual: number;
  readonly removed: number;
  readonly share_of_baseline: number;
}

/**
 * Whether severing this grant takes access away, only changes how it is obtained,
 * or does nothing at all.
 *
 * `mechanism_only` is research §5 step 5 and demo beat 31. It is the label that
 * makes the honest case renderable: `svc-invoice-poster` reaches
 * `write:invoice-queue` through both a group and a hop, so cutting the hop closes a
 * mechanism and removes nothing, and a reviewer who acted on a bare percentage there
 * would have changed how the permission is obtained and not what is obtainable.
 *
 * `no_effect` is a third value research §5 does not name, added because the two it
 * does name would otherwise have to absorb a case they describe wrongly. A binding
 * that no chain crosses — an impersonation grant nobody holds, or holds and never
 * reaches anything through — removes no access *and* closes no mechanism. Reporting
 * that as `mechanism_only` would claim a mechanism was closed, and dropping the row
 * would hide a standing grant that confers a principal. The distinction is the same
 * one architecture rule 9 draws elsewhere: "redundant today" and "unused today" are
 * different findings with different remediations, and only the second is a candidate
 * for deletion rather than a candidate for review.
 */
export type ChokePointEffect = 'access' | 'mechanism_only' | 'no_effect';

/**
 * A permission that stays reachable after the cut, and by what.
 *
 * Emitted for every `mechanism_only` candidate so the label carries its evidence,
 * the same discipline `ExposureContribution` imports from CVSS: the claim "this
 * removes no access" is only checkable if the surviving routes are named.
 * `route_types` is the field `ExposureEntry` already publishes for the equivalent
 * de-duplication question (`domain/exposure.ts` L100-102).
 */
export interface SurvivingRoute {
  readonly identity_id: string;
  readonly permission: string;
  /** Sorted and distinct, so `['direct','indirect']` reads the same for every row. */
  readonly route_types: readonly AccessPathType[];
}

/** One identity that loses reach when a candidate is severed. */
export interface AffectedIdentity {
  readonly identity_id: string;
 readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  /** Sorted, and never empty — an identity that loses nothing is not affected. */
  readonly permissions_lost: readonly string[];
  readonly ownership: ExposureOwnershipContext;
}

// --- Choke points -----------------------------------------------------------

/**
 * One grant, and what revoking it is measured to do.
 *
 * **There is no `node_type` field**, and that is a deliberate departure from
 * research §4.6's Amendment 1, which gives it two legal values while stating that
 * "in practice the actionable one is always `permission`, because that is the grant
 * a reviewer revokes". Nothing in this engine emits the second value, so a
 * discriminant fixed at authoring time would be a tag on a union with one arm —
 * which is the shape architecture rule 7 exists to remove, not to add. `permission`
 * below is self-describing; if an identity-shaped choke point is ever computed, this
 * becomes a discriminated union and every consumer's build breaks, which is the
 * outcome rule 7 wants.
 */
export interface ChokePoint {
  /** The grant to revoke — a `PermissionRecord.id` carrying `grants_identity`. */
  readonly permission: string;
  /** The principal the grant confers, from `PermissionRecord.grants_identity`. */
  readonly grants_identity: string;
  /**
   * Every identity holding the grant directly, sorted — including groups.
   *
  * Groups are subjects nowhere else in the engine (architecture rule 12), and are
   * included here because the remediation changes shape when the holder is one:
   * `mcp:connect-prod-runbook` is held by `group-oncall-agents`, so revoking it is a
   * single membership-container change rather than four separate user changes. That
   * is the difference between a one-line fix and a project, and it is not derivable
   * from a list of affected identities.
   */
  readonly held_by: readonly string[];
  /** Access actually removed — Δreach, research §5 step 3. */
  readonly access_removed: ImpactDelta;
  /** Mechanisms actually closed — Δpivot, research §5 step 3. */
 readonly mechanisms_closed: ImpactDelta;
  readonly closes: ChokePointEffect;
  /** Sorted by id. Non-empty exactly when `closes` is `access`. */
  readonly affected_identities: readonly AffectedIdentity[];
  /** Non-empty exactly when `closes` is `mechanism_only` — the label's evidence. */
  readonly surviving_routes: readonly SurvivingRoute[];
}

/**
 * The largest candidate space evaluated exhaustively before the selector degrades.
 *
 * Each candidate costs one `buildIdentityGraph` over a copied dataset plus one
 * re-traversal of the population, so the cost is linear in candidates and the
 * ceiling is a budget rather than a correctness boundary. Set well above the
 * estate's seven pivot bindings, so the demo is always `exhaustive` and the greedy
 * arm is exercised by fixtures rather than by accident.
 *
 * Frozen and named rather than inlined, because research §4.4's whole argument is
 * that the threshold between an exact answer and an approximated one has to be
 * published rather than buried in a comparison.
 */
export const MAX_EXHAUSTIVE_CANDIDATES = 64;

/**
 * Which algorithm produced the ranking, and what its answer is worth.
 *
 * Research §4.4: appearance frequency, which the PRD specifies, carries no bound at
 * all and is measurably wrong on this estate — `connect:ledger-writer` ties three
 * candidates that do remove access while removing none itself. The replacement is
 * exhaustive evaluation while the candidate space permits it, and `GREEDY-HITTING-SET`
 * with its published bound when it does not.
*
 * A union rather than a method string beside a nullable ratio: the bound exists only
 * for the approximation, and a consumer should not have to know which arm makes it
 * meaningful (architecture rule 7).
 */
export type ChokePointSelection =
  | {
      readonly method: 'exhaustive';
      /** Equal to `candidate_space` on this arm, and that equality is the claim. */
      readonly candidates_evaluated: number;
     readonly candidate_space: number;
    }
  | {
      readonly method: 'greedy_hitting_set';
      readonly candidates_evaluated: number;
      readonly candidate_space: number;
      /**
       * `H(k) = 1 + 1/2 + … + 1/k`, the greedy hitting-set approximation ratio.
       *
       * Jha, Sheyner and Wing prove Minimum Critical Set of Attacks polynomially
      * equivalent to minimum hitting set and give the greedy algorithm its bound;
       * `k` is `largest_hit_set` below, so the two travel together and the ratio can
       * be recomputed from what is published.
       */
      readonly approximation_ratio: number;
      /** The most paths any single candidate closes — the `k` the ratio is taken over. */
      readonly largest_hit_set: number;
    };

/**
 * The estate-wide denominators every `ImpactDelta` is measured against.
 *
 * Published once at the top of the report rather than repeated per row, and
 * published at all because research §1.3 makes an unstated denominator the module's
 * central integrity risk. `reachable_pairs` counts distinct `(identity, permission)`
 * pairs rather than paths, so two routes to one permission are one unit of reach —
 * which is precisely why severing a redundant mechanism scores zero.
 */
export interface ImpactBaseline {
  readonly reachable_pairs: number;
  readonly pivot_edges: number;
  readonly identities_scanned: number;
}

/** `GET /api/impact/choke-points` — the module's primary artifact (research §6). */
export interface ChokePointReport {
  readonly selection: ChokePointSelection;
  /** Ranked by `access_removed.removed`, then `mechanisms_closed.removed`, then id. */
  readonly candidates: readonly ChokePoint[];
  readonly baseline: ImpactBaseline;
  readonly snapshot: AccessSnapshot;
}

// --- Staleness --------------------------------------------------------------

/**
 * Research §6: the same two keys Identity Exposure Map publishes, and the same
 * refusal of the third.
 *
 * `based_on_access_discovery_snapshot` is copied verbatim from
 * `AccessSnapshot.graph_snapshot_at` — a consumer dates the facts it read, not the
 * moment it read them. `stale_if_older_than_hours` is **absent**: the source PRD
 * §4.4 asks for it on the grounds that Exposure Map established the convention, and
 * research §2 records that Exposure Map established the first key and explicitly
 * declined the second. It is a deployment policy rather than a fact about this
 * snapshot, and there is no rebuild cadence to state one against.
 *
 * A separate interface from `ExposureStaleness` despite identical fields, because
 * the two are independent contracts that happen to agree today; importing exposure's
 * would make a change to its freshness model silently a change to this one.
 */
export interface ImpactStaleness {
  readonly based_on_access_discovery_snapshot: string;
 readonly computed_at: string;
}

// --- Per-identity output ----------------------------------------------------

/** `GET /api/impact/:id` — one starting identity's propagation (research §6). */
export interface ImpactProfile {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
 readonly app: string;
  readonly assessment: ImpactAssessment;
  readonly ownership: ExposureOwnershipContext;
  /** The other ranker's verdict, quoted whole so no score can be read blind. */
  readonly exposure: ImpactExposureReference;
  readonly staleness: ImpactStaleness;
}

/**
 * Mirrors `AccessOutcome` and `ExposureOutcome`: an unknown id is a terminal state,
 * not a throw (architecture rules 6, 7).
 */
export type ImpactOutcome =
  | { readonly ok: true; readonly profile: ImpactProfile }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

// --- Simulation -------------------------------------------------------------

/**
 * `GET /api/impact/simulate?sever=<permission>` — `ITAG.md` §F7's before/after diff.
 *
 * F7 L97-101 specified this eighteen months before the PRD did, and its constraint
 * is the one that matters: "Re-run the forward traversal immediately on a modified
 * in-memory copy… Fully non-destructive — toggles never touch the base seed dataset."
 * `impact/counterfactual.ts` satisfies it by construction rather than by discipline —
 * `buildIdentityGraph` is a pure function of an `IdentityDataset`, so the modified
 * copy is a second graph and the frozen seed is never a mutation target.
 *
 * `unknown_binding` is a terminal state rather than a 404 thrown from the route: a
 * permission that exists but carries no `grants_identity` is severable in the user's
 * mental model and not in this one, and telling them which is more useful than a
 * bare not-found.
 */
export type SimulationOutcome =
  | {
      readonly ok: true;
      readonly severed: string;
      readonly before: ImpactBaseline;
      readonly after: ImpactBaseline;
      readonly access_removed: ImpactDelta;
      readonly mechanisms_closed: ImpactDelta;
      readonly closes: ChokePointEffect;
     readonly affected_identities: readonly AffectedIdentity[];
      readonly surviving_routes: readonly SurvivingRoute[];
      readonly snapshot: AccessSnapshot;
    }
  | {
      readonly ok: false;
      readonly error: 'unknown_permission' | 'not_a_pivot_binding';
      readonly permission: string;
    };
