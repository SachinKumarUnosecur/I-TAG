/**
 * Access Discovery vocabulary — `docs/PRD-access-discovery.md` §3, §4.3.
 *
 * The module classifies how an identity reaches a permission and says nothing
 * about how much that matters. `PRD` L30 makes scoring a non-goal and
 * `docs/delegation-chain-research.md` §7.2 keeps `ownership/severity.ts` the one
 * place in the engine that ranks anything, so no type in this file carries a
 * severity, a rank, a score or a priority.
 */

import type { OwnerRef } from './ownership.js';
import type { IdentityType } from './types.js';

/**
 * The three path types, and the whole product claim (`PRD` L56-58).
 *
 * A closed union rather than a string: `PRD` §2.1 makes this the contract two
 * unbuilt modules are written against, and a fourth type has to break their
 * builds rather than arrive as an unhandled value.
 */
export type AccessPathType = 'direct' | 'indirect' | 'hop';

/**
 * The edge kinds `PRD` §4.1 names, kept verbatim.
 *
 * `HAS_IDENTITY` is folded into `ASSUMES_ROLE`: `PRD` L58 lists them as
 * alternatives for one mechanism (an instance profile *is* the resource holding
 * an identity), and two names for one edge would let two consumers count the
 * same hop differently.
 */
export type AccessEdge = 'HAS_POLICY' | 'MEMBER_OF' | 'CAN_ACCESS' | 'ASSUMES_ROLE';

/** One `from → to` link in a path, as rendered by `PRD` §6.5's numbered list. */
export interface AccessChainStep {
  readonly from: string;
  readonly to: string;
  readonly edge: AccessEdge;
  /** The plain-English mechanism, e.g. an SSM session or an instance profile. */
  readonly mechanism: string;
}

interface AccessPathBase {
  readonly identity_id: string;
  readonly app: string;
  readonly identity_type: IdentityType;
  /** The terminal permission this path arrives at — `PRD` §4.3's `resource_id`. */
  readonly permission: string;
  readonly sensitive: boolean;
  /** Edges traversed, so direct is 1, indirect is 2, a one-resource hop is 3 (`PRD` L97-99). */
  readonly hop_count: number;
  readonly chain: readonly AccessChainStep[];
}

/**
 * One route from an identity to one permission.
 *
 * A union on `path_type` rather than a type tag beside nullable fields, for the
 * reason `OwnershipFinding` is one: only a hop has a resource and an assumed
 * principal, only an indirect path has a group, and a consumer should not have to
 * know which fields are meaningful for which type. `PRD` §2.1 hands this shape to
 * Identity Risk Profile and Unified Impact Analysis, so the discrimination is load
 * bearing outside this module too.
 */
export type AccessPath =
  | (AccessPathBase & { readonly path_type: 'direct' })
  | (AccessPathBase & {
      readonly path_type: 'indirect';
      /** The container holding the policy — `PRD` L57's intermediate construct. */
      readonly via_group: string;
    })
  | (AccessPathBase & {
      readonly path_type: 'hop';
      /**
       * The permission that reached the resource — the `CAN_ACCESS` half of L58.
       *
       * This is the grant a reviewer revokes to close the path, and it is
       * deliberately not the terminal permission: revoking `admin:platform` from
       * the role fixes the role, revoking this fixes *this identity*.
       */
      readonly via_permission: string;
      /** The principal the resource carries — the `ASSUMES_ROLE` half of L58. */
      readonly assumed_identity: string;
    });

/**
 * One row of `PRD` §6.3's table: the path, plus who answers for the identity.
 *
 * Nested rather than spread so `AccessPath` stays a discriminated union a consumer
 * can switch on. `owner` is additive metadata per `PRD` §2.1 — it never filters or
 * alters classification, so an unowned hop is reported exactly as an owned one is,
 * and it is null rather than a placeholder string because "nobody owns this" is a
 * finding Ownership Assurance already reports and this module must not restate.
 */
export interface AccessRow {
  readonly path: AccessPath;
  readonly owner: OwnerRef | null;
}

/**
 * `PRD` §6.4's summary strip and §6.6's per-identity rollup.
 *
 * Three plain counts. Note there is no total-risk figure and no worst-type field:
 * collapsing three counts into one number is the ranking this module does not do.
 */
export interface AccessCounts {
  readonly direct: number;
  readonly indirect: number;
  readonly hop: number;
}

/** `PRD` §6.6 — the compact rollup shown wherever an identity appears elsewhere. */
export interface IdentityAccessProfile {
  readonly identity_id: string;
  readonly name: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly counts: AccessCounts;
  /**
   * Distinct permissions reached by any route.
   *
   * Named for what it is. `PRD` L100 asks for denies, permission boundaries and
   * SCPs to be evaluated so a path blocked by a boundary is not reported as live
   * access; the engine has no deny model (`PermissionRecord` is additive), so this
   * is the nominal union and is *not* an effective-permission set. Calling it
   * `effective_permissions` as `PRD` L116 does would assert an evaluation that
   * never ran — see the amendment in `docs/PRD-access-discovery.md`.
   */
  readonly reachable_permissions: readonly string[];
  readonly sensitive_permissions: readonly string[];
  /** Every route, hop first, so `PRD` §6.9's page needs no client-side sort. */
  readonly paths: readonly AccessPath[];
  /**
   * The §6.4 tooltip sentence, or null when there is no hop to describe.
   *
   * Null rather than a reassuring string: `PRD` §6.7 wants the green "no
   * resource-mediated escalation paths detected" banner to be a deliberate UI
   * decision, not a sentence the engine invented.
   */
  readonly hop_summary: string | null;
}

export type AccessOutcome =
  | { readonly ok: true; readonly profile: IdentityAccessProfile }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/**
 * `PRD` §4.4's staleness block, reduced to the half this engine can honestly fill.
 *
 * `graph_snapshot_at` comes from the injected `Clock`, which is what makes the
 * demo's pinned instant reproducible. `discovered_at` and `last_confirmed_at`
 * (L127) are absent on purpose: both require comparing two rebuilds, and the graph
 * is built once at boot from a frozen dataset, so there is no prior snapshot to
 * confirm a path against. Emitting them from the current clock would make every
 * path look freshly re-verified, which is precisely the false assurance L127 warns
 * about.
 */
export interface AccessSnapshot {
  readonly graph_snapshot_at: string;
}

/** `PRD` §6.4's strip, plus the population it was computed over. */
export interface AccessSummary {
  readonly counts: AccessCounts;
  readonly identities_with_hop: number;
  readonly identities_scanned: number;
  readonly snapshot: AccessSnapshot;
}
