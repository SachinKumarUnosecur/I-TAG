import type {
  OwnerRef,
  OwnershipReason,
  OwnershipTimeline,
  Severity,
  Suppression,
} from './ownership.js';
import type { IdentityType } from './types.js';

interface FindingBase {
  readonly identity_id: string;
  readonly app: string;
  readonly identity_type: IdentityType;
  /** ISO-8601 instant the finding was computed, from the injected clock. */
  readonly detected_at: string;
  readonly timeline: OwnershipTimeline;
  /** Every candidate the resolver chain produced, in precedence order. */
  readonly candidates: readonly OwnerRef[];
  readonly suppression: Suppression | null;
  /**
   * Whether this belongs in the orphan count.
   *
   * False for `unknown`, for excluded identities and for live suppressions. §4.6
   * makes this structural rather than a UI filter: a count that quietly includes
   * audit-retention gaps is the number that gets disputed in the first review.
   */
  readonly counted: boolean;
  readonly severity: Severity;
  readonly reachable_permissions: readonly string[];
  readonly reachable_sensitive_count: number;
}

/**
 * The unit of work for a reviewer — `docs/orphaned-identity-research.md` §4.3.
 *
 * A union on `state` rather than a boolean plus nullable fields: "owned" carries
 * no reason, "owner_invalid" always names an owner, and "ambiguous" is about
 * competing candidates rather than a single verdict. Encoding that in the type
 * stops consumers from having to guess which fields are meaningful.
 */
export type OwnershipFinding =
  | (FindingBase & {
      readonly state: 'owned';
      readonly owner: OwnerRef;
    })
  | (FindingBase & {
      readonly state: 'unowned';
      readonly owner: null;
      readonly reason: OwnershipReason;
      readonly detail: string;
    })
  | (FindingBase & {
      readonly state: 'owner_invalid';
      readonly owner: OwnerRef;
      readonly reason: OwnershipReason;
      readonly detail: string;
    })
  | (FindingBase & {
      readonly state: 'ambiguous';
      readonly owner: OwnerRef | null;
      readonly reason: OwnershipReason;
      readonly detail: string;
    })
  | (FindingBase & {
      readonly state: 'unknown';
      readonly owner: OwnerRef | null;
      readonly reason: OwnershipReason;
      readonly detail: string;
    });

export type OwnershipOutcome =
  | { readonly ok: true; readonly finding: OwnershipFinding }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };

/** One live descendant of a departed human. */
export interface FootprintNode {
  readonly identity_id: string;
  readonly identity_type: IdentityType;
  readonly app: string;
  readonly hops: number;
  readonly sensitive_permissions: readonly string[];
}

/**
 * Everything a departed person provisioned that is still live — F11.
 *
 * The inverse question to a per-identity finding: not "who owns this" but "for
 * everyone who already left, what did we forget to clean up".
 */
export interface ResidualFootprint {
  readonly human_id: string;
  readonly human_name: string;
  readonly departed_since: string | null;
  readonly live: readonly FootprintNode[];
  readonly revoked_count: number;
  readonly max_hops: number;
  readonly sensitive_reachable: readonly string[];
  /** True when the chain leaves the app the person's identity lives in. */
  readonly crosses_apps: boolean;
}
