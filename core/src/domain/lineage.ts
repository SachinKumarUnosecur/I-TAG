/**
 * Provisioning Lineage vocabulary — `docs/delegation-chain-research.md` §4.
 *
 * Named for what the industry calls this. "Delegation" means *permission*
 * delegation everywhere else — AWS cross-account role delegation, Entra delegated
 * permissions, OAuth delegated consent — which is precisely what
 * `docs/PRD-delegation-chain.md` L32 scopes out. Research §3.1 recommends the
 * rename; this module is the rename.
 *
 * Types only. Behaviour lives in `src/lineage/`.
 */

import type { OwnershipState } from './ownership.js';
import type { IdentityType } from './types.js';

/**
 * What actually performed a creation, as the audit log recorded it.
 *
 * `docs/PRD-delegation-chain.md` §4.1 assumes the `CREATED_BY` parent is an
 * identity drawn from the same population as the child. In production it is a role
 * session, a service principal, a SCIM client or a CI runner: CloudTrail routinely
 * records `type: AssumedRole` where `sessionContext.sessionIssuer` names the
 * *role*, and Entra's `initiatedBy` is a union of `user` **or** `app`, where an
 * app-initiated creation contains no human at all (research §3.2). For
 * machine-provisioned estates that is the majority case, not an edge case.
 */
export type ActorKind =
  | 'human'
  /** CloudTrail `AssumedRole`: the session acted, `sessionIssuer` names the role. */
  | 'role_session'
  /** Entra `initiatedBy.app`, or an OAuth application acting on its own behalf. */
  | 'service_principal'
  /** A service account, agent or CI runner in our own population. */
  | 'automation'
  /** The provider itself, e.g. AWS `CreateServiceLinkedRole`. Never in our estate. */
  | 'provider_service'
  /** Recorded, but not classifiable. Never a synonym for "no actor". */
  | 'unknown';

/**
 * How a human was attached to an actor.
 *
 * Ordered strongest to weakest, and that order *is* the resolver precedence in
 * `lineage/actors.ts` — research §4.1 requires basis and confidence ship with
 * every resolution, the same discipline `OwnerRef` already uses.
 */
export type HumanResolutionBasis =
  /** AWS STS `sourceIdentity`. Only present if an admin configured STS to require it. */
  | 'sts_source_identity'
  /** CloudTrail `userIdentity.onBehalfOf` for an IdentityCenterUser. */
  | 'identity_center_user'
  /** Entra `directoryAudit.initiatedBy.user`. */
  | 'entra_initiated_by_user'
  /** The CI run's triggering actor. A second system asserts it, not the provider. */
  | 'pipeline_trigger'
  /** An IaC review record. Evidence of a second party, which is AC-2(e)'s demand. */
  | 'pr_approver'
  /** Our own join up the creation graph. The weakest, and the one that misleads. */
  | 'role_assumption_correlation';

/**
 * `attested` — the provider that recorded the create also named the human.
 * `correlated` — a different system named them; we joined two records.
 * `inferred` — we derived them ourselves. Never auto-remediate on this (§4.9).
 */
export type HumanResolutionConfidence = 'attested' | 'correlated' | 'inferred';

/**
 * Exactly what the audit log said. Immutable, and never overwritten by resolution.
 *
 * Split from `AuthorizingHuman` per research §4.1, mirroring the `OwnerRef` pattern
 * at `ownership/resolve.ts` L40-48. Treating the automation as the creator is
 * correct; stopping there is not. If these two collapse into one field, every
 * Terraform-provisioned identity resolves to `terraform-ci`, that node permanently
 * tops any fan-out ranking, and `no_human_root` becomes the dominant trace
 * termination across a real estate — which is the failure the five-way union in
 * `domain/results.ts` exists to prevent. Getting this wrong poisons F4, not just
 * this module.
 */
export interface CreationActor {
  /** The principal string verbatim, e.g. an ARN or an appId. Never normalised away. */
  readonly raw_principal: string;
  readonly kind: ActorKind;
  /** The app whose audit log recorded the event, which may not be the child's app. */
  readonly app: string;
  /** CloudTrail `sessionContext.sessionIssuer` — the role, not the human. */
  readonly issuer: string | null;
  /** Provider-attested human. Never inferred, never filled in by a join. */
  readonly attested_human: string | null;
  /**
   * Which provider field carried `attested_human`.
   *
   * Extends research §4.1's shape, which lists the attested bases but keeps only
   * `attested_human` on the actor. The basis is a property of the *field the
   * provider populated*, so it has to travel with the actor — otherwise the
   * resolver has to guess which provider the record came from to label its own
   * output, and a guess is exactly what `basis` exists to eliminate.
   */
  readonly attested_basis: HumanResolutionBasis | null;
  /** CI run actor, when the edge came from a pipeline rather than a console. */
  readonly pipeline_actor: string | null;
  /**
   * Approver on the change record, when one exists.
   *
   * The presence of a second party is what NIST SP 800-53 AC-2(e) requires, so
   * this field is the difference between a `self_authorized` finding and a
   * correctly governed create (§4.4).
   */
  readonly review_approver: string | null;
}

/** A human held responsible for a creation, with the evidence for that claim. */
export interface AuthorizingHuman {
  readonly human_id: string;
  readonly basis: HumanResolutionBasis;
  readonly confidence: HumanResolutionConfidence;
  /** Why this basis won, in the words an analyst can argue with. */
  readonly detail: string;
}

/**
 * Why no creation edge exists — research §4.5.
 *
 * `docs/PRD-delegation-chain.md` L65 makes `unlinked` a single informational flag.
 * That is the wrong instrument, because for six of seven providers the creator
 * exists only inside an audit-retention window of 7 to 400 days against identities
 * that live for years (§3.2), so a missing creator is the *regime*, not the
 * exception. A flag tells you data is absent; a bucket lets you count it, trend it,
 * exclude it from a denominator, and draw a coverage line climbing from install
 * date. That difference is the whole landing view (§6).
 *
 * This also settles `PRD` §8's open question about self-service signups (L181):
 * they are neither root nor unlinked, they are their own bucket, and Entra's
 * `creationType` already exposes the field that populates it.
 */
export type LineageGapReason =
  /** Break-glass, bootstrap, genuine root. Absence of a creator is correct here. */
  | 'root_by_design'
  /** Predates the app's audit-retention floor. Unknowable, not unowned. */
  | 'outside_audit_window'
  /** SSO/SCIM: the creator exists, in the IdP, not in this app's log. */
  | 'federated_elsewhere'
  /** OAuth signup. Entra `creationType` `SelfServiceSignUp` / `EmailVerified`. */
  | 'self_registered'
  /** Migration or bulk load; no per-identity actor was ever recorded. */
  | 'bulk_imported'
  /**
   * Created before *we* were installed.
   *
   * The bucket that makes the metric move: it is the one that shrinks as the
   * product runs, which is what lets coverage climb from a known date instead of
   * sitting still (§3.2, §4.5).
   */
  | 'not_yet_captured'
  /**
   * A creator was recorded and we cannot follow it.
   *
   * Deliberately *not* one of research §4.5's six buckets, and deliberately not
   * folded into any of them. The six are all "no edge was ever recorded", which is
   * a statement about the provider's audit trail. This one means the edge exists
   * and points somewhere we cannot resolve — a data-integrity failure to chase,
   * not a coverage gap to report. Collapsing them would let a corrupt pointer
   * quietly improve the coverage number.
   */
  | 'unresolvable_creator';

/** A countable reason the lineage is absent, with the evidence on screen. */
export interface LineageGap {
  readonly reason: LineageGapReason;
  readonly detail: string;
  /**
   * The date creation data begins for this app, when that is what caused the gap.
   *
   * `PRD` §6.6 asks for this as a per-app banner. Carried on the finding instead so
   * the reason a specific row is unexplained travels with the row.
   */
  readonly recoverable_from: string | null;
}

/** One hop in a lineage walk, in the shape the `PRD` §6.5 tree view renders. */
export interface LineageNode {
  readonly identity_id: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly name: string;
  /** Hops from the queried identity, not from the root. 0 is the identity itself. */
  readonly distance: number;
  readonly created_at: string | null;
  /**
   * True when the edge reaching this node left the app of the node below it.
   *
   * Rendered visually distinct from an observed same-app edge, per research §4.9:
   * a cross-app hop is a correlation we performed, not a fact one provider
   * recorded, and the two must never look alike on screen.
   */
  readonly crosses_app: boolean;
}

/**
 * Outcome of a lineage walk.
 *
 * A discriminated union for the same reason `AccountabilityTrace` is one: "this
 * chain ends at a root" and "we could not finish the walk" are materially
 * different answers. `PRD` L28 asserts creation lineage is "strictly hierarchical
 * … not a general directed graph with cycles", which is true of individual
 * creation *acts* and false of the identity-id graph in two specific ways
 * (research §4.8): identifier reuse produces genuine cycles, and service-linked
 * role creation produces parents outside the population. Both already have
 * terminal states in `graph/traverse.ts`, and both are pinned in the seed.
 *
 * There is no `halted` variant, because this walk sets no `haltOn`. That is the
 * one difference from F4: `accountability/trace.ts` L17-22 stops at the first
 * human on purpose, and this module has to continue *past* humans to the true root.
 */
export type LineageWalk =
  | { readonly outcome: 'complete'; readonly nodes: readonly LineageNode[] }
  | {
      readonly outcome: 'cycle_detected';
      readonly nodes: readonly LineageNode[];
      readonly repeated_id: string;
    }
  | {
      readonly outcome: 'dangling_reference';
      readonly nodes: readonly LineageNode[];
      readonly missing_id: string;
    }
  | {
      readonly outcome: 'depth_limit_exceeded';
      readonly nodes: readonly LineageNode[];
      readonly limit: number;
    };

/**
 * Why the in-app ancestor walk stopped.
 *
 * `PRD` §3 defines Root as "an identity with no recorded creator" and then lists
 * three very different things under it: a genuine break-glass account, an account
 * predating tracking, and an SSO identity provisioned elsewhere. §6.6 then asks
 * the UI to tell them apart. They are told apart here instead, because a string
 * the UI has to re-derive is a string two views will derive differently.
 */
export type LineageRootKind =
  /** `provisioned_by` is null: this app recorded no creator at all. */
  | 'no_creator_recorded'
  /** An in-app root whose creator lives in another app; lineage continues there. */
  | 'creator_in_other_app'
  /** A creator was recorded and does not resolve to any identity we hold. */
  | 'creator_unresolvable'
  /** The in-app walk never terminated, so there is no root. Cycle (§4.8). */
  | 'none';

/**
 * Fan-out measured as a rate against the actor's own history — research §4.3.
 *
 * `PRD` L63 identifies the problem exactly — "a legitimate automation/service
 * account may have high fan-out by design while a human admin should not" — and
 * then selects a static configurable threshold, an instrument that cannot express
 * it. Lifetime fan-out measures tenure, not risk: threshold on it and the queue is
 * permanently topped by `scim-provisioner` and `terraform-ci`, the analyst mutes
 * the flag in week one, and we have rebuilt the "4,000 orphans nobody reads"
 * failure `docs/orphaned-identity-research.md` §3.4 warns about.
 */
export interface FanOutSignal {
  readonly actor_id: string;
  readonly actor_kind: ActorKind;
  readonly window_days: number;
  readonly created_in_window: number;
  /** Lifetime children. Reported for context, never thresholded on (§4.3). */
  readonly lifetime_total: number;
  /** This principal's own trailing baseline, not a population average. */
  readonly trailing_median: number;
  readonly deviation_sigma: number;
  /** First time this actor created this class of target. The strongest sub-signal. */
  readonly novel_target_class: boolean;
  readonly exceeds_baseline: boolean;
  readonly detail: string;
}

/**
 * The signal that earns its place — research §4.4, derived from §3.4 and AC-2(e).
 *
 * NIST SP 800-53 AC-2(e): "Require approvals by [Assignment: organization-defined
 * personnel or roles] for requests to create accounts." The computable violation
 * is not "this admin created many accounts" — it is "the same principal created
 * this account and granted it privilege, and no second party appears in either
 * event". That is the literal shape of the Midnight Blizzard chain, where the
 * actor "created a new user account to grant consent" (Microsoft Security Blog,
 * 25 Jan 2024), and it is the only signal in the analysis that is simultaneously
 * predictive, mapped to a named control clause, and not free in a provider console.
 *
 * Computation is a join of two events on `(target, actor)` inside a window — no
 * traversal at all. That the differentiated finding needs no graph walk is itself
 * evidence about what this module is (research §7.2).
 */
export interface CreationAuthoritySignal {
  readonly child_id: string;
  readonly actor: CreationActor;
  /** Ownership Assurance's verdict on the creator itself. */
  readonly actor_ownership_state: OwnershipState;
  readonly actor_is_non_production: boolean;
  readonly actor_dormant_days: number | null;
  /**
   * Same principal performed the create *and* the privilege grant, with no second
   * party in either event. The AC-2(e) violation.
   */
  readonly self_authorized: boolean;
  /**
   * The creator is itself unowned, dormant or non-production while exercising a
   * production creation privilege. The property of the creator that research §3.4
   * concludes is the real signal, rather than the shape of the chain.
   */
  readonly creator_privilege_mismatch: boolean;
  readonly granted_permissions: readonly string[];
  readonly detail: string;
}

/**
 * An observed creation event, persisted by us — research §4.6.
 *
 * Because retention is shorter than identity lifetime for six of seven providers
 * (§3.2), our store has to be the system of record. We are not reading a forest
 * that exists; we are becoming the system of record for one the providers discard.
 * A recompute-based design is permanently lossy — the data it failed to capture is
 * gone — which is why this is the most expensive decision to reverse and why it is
 * append-only from the start, exactly as the disposition journal is.
 */
export interface PersistedCreationEdge {
  readonly app: string;
  readonly child_id: string;
  readonly actor: CreationActor;
  /** When *we* observed it. The honest field. */
  readonly observed_at: string;
  /** When it happened, if the provider told us. */
  readonly occurred_at: string | null;
  /**
   * Separates "we watched this happen" from "someone told us", which in front of
   * an assessor is the difference between evidence and assertion.
   */
  readonly source: 'audit_event' | 'object_field' | 'backfill_import' | 'declared';
  /** Append-only: a correction supersedes, and nothing is ever mutated in place. */
  readonly superseded_by: string | null;
}

/**
 * A privilege grant, with the principal that performed it.
 *
 * The second half of the `self_authorized` join. Deliberately not folded into
 * `GrantRecord`, which exists for F10's half-life arithmetic and records no actor:
 * one table serving two questions is how the two answers start disagreeing.
 *
 * `approved_by` is the AC-2(e) evidence field. Whether any provider audit log
 * actually populates an approver, or whether it only ever lives in a ticketing
 * system, is an open question (research §10) — it decides whether
 * `self_authorized` is a finding or a hypothesis needing external corroboration.
 * Modelled here so the answer changes data rather than code.
 */
export interface PrivilegeGrantEvent {
  readonly identity_id: string;
  readonly permission: string;
  readonly app: string;
  /** Matched against `CreationActor.raw_principal`, not against an identity id. */
  readonly actor_principal: string;
  /** ISO-8601 instant or date. */
  readonly occurred_at: string;
  /** The second party, if one exists. Its absence is the finding. */
  readonly approved_by: string | null;
}

/**
 * Whether this identity's origin is known.
 *
 * A union rather than a nullable actor plus a nullable gap: "we know what created
 * this" and "we do not, and here is which bucket" are different answers, and a
 * shape that allows both or neither to be set lets a caller report a coverage gap
 * on a row whose creator we actually hold.
 */
export type Provenance =
  | {
      readonly known: true;
      readonly actor: CreationActor;
      /**
       * Null when the actor is an automation we could not attribute to any human.
       *
       * That is a fact about the estate — a create nobody is accountable for — not
       * a data error, and it must stay distinguishable from "we did not look".
       */
      readonly authorizing_human: AuthorizingHuman | null;
    }
  | { readonly known: false; readonly gap: LineageGap };

/**
 * The core output — `PRD` §4.3's chain object, corrected.
 *
 * Differences from the spec, each argued in research §4: the parent is a
 * `CreationActor` plus a resolved human rather than a bare identity (§4.1); there
 * is no `flags` array of `deep_chain` / `high_fanout` / `orphaned_creator` /
 * `unlinked` (§4.2, §4.3, §4.5); `unlinked` is a gap bucket rather than a flag; and
 * both walks report a terminal state rather than assuming a clean tree (§4.8).
 *
 * Carries **no severity and no rank**, per `PRD` L34 and research §7.2:
 * `ownership/severity.ts` is the single place in the engine where anything is
 * ranked, and that is the property that stops two modules from disagreeing about
 * danger in front of a customer.
 */
export interface ProvenanceRecord {
  readonly identity_id: string;
  readonly app: string;
  readonly identity_type: IdentityType;
  /**
   * Same-app creation hops to the in-app root, or null when there is no root
   * because the walk found a cycle.
   *
   * App-scoped because `PRD` §4.1 puts the app on every edge and `graph.byApp` has
   * to stay a partition: a chain that hops systems is a correlation we performed,
   * and counting its hops as one app's generation would present a merged lineage
   * as though one provider had recorded it. Kept as a sortable column and
   * deliberately *not* a flag — research §4.2 deletes `deep_chain`.
   */
  readonly generation: number | null;
  readonly root_kind: LineageRootKind;
  /** Direct children in any app. What the §4.3 fan-out signal measures. */
  readonly fan_out: number;
  /** Direct children in this app only. The `PRD` §6.3 column under an app filter. */
  readonly fan_out_in_app: number;
  readonly provenance: Provenance;
  /** Ordered outward from this identity toward the root, past humans (§5). */
  readonly ancestors: LineageWalk;
  readonly descendants: LineageWalk;
  readonly fan_out_signal: FanOutSignal | null;
  readonly creation_authority: CreationAuthoritySignal | null;
}

export type ProvenanceOutcome =
  | { readonly ok: true; readonly record: ProvenanceRecord }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/** One gap bucket's share of the unexplained population. */
export interface LineageGapBucket {
  readonly reason: LineageGapReason;
  readonly count: number;
}

/**
 * Explanation coverage — research §4.5, and the module's landing view (§6).
 *
 * `explanation_coverage = 1 − (unexplained / total)`. A raw `unlinked` count is
 * never published: like the raw orphan count in `docs/orphaned-identity-research.md`
 * §5.2, it moves in the wrong direction as the product improves, so it is the one
 * number guaranteed to mislead on a slide.
 *
 * `explained` counts both identities whose creator we hold *and* identities whose
 * absent creator we can account for by bucket. Saying "this account is federated
 * from your IdP, which is why this app has no creator for it" is an explanation;
 * an empty cell is not.
 */
export interface LineageCoverage {
  /** Null for the whole-estate view, set when scoped to one app. */
  readonly app: string | null;
  readonly total: number;
  /** Creator on record. */
  readonly with_recorded_creator: number;
  /** No creator on record, but the absence is accounted for by a bucket. */
  readonly explained_absences: number;
  readonly unexplained: number;
  readonly explanation_coverage: number;
  readonly gap_buckets: readonly LineageGapBucket[];
  /**
   * The date coverage starts climbing from — `max(provider retention floor, our
   * install date)`, which is what `AppRecord.creation_data_from` holds (§3.2).
   * Null when the app's audit history is complete.
   */
  readonly creation_data_from: string | null;
  /** Of the recorded creators, how many resolve to a human, by confidence. */
  readonly attributed_to_human: number;
  readonly attested_attributions: number;
}
