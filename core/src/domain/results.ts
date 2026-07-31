import type { IdentityType } from './types.js';

export interface ChainNode {
  readonly id: string;
  readonly type: IdentityType;
  readonly name: string;
}

export type TraceTermination =
  | 'resolved_human'
  | 'no_human_root'
  | 'dangling_reference'
  | 'cycle_detected'
  | 'depth_limit_exceeded';

/**
 * Outcome of the backward walk (F4).
 *
 * Deliberately a discriminated union rather than "human or null": each variant is
 * a materially different finding. "This agent has no human owner by design" and
 * "we lost the pointer to its owner" must never collapse into the same answer —
 * the first is an architectural fact, the second is a data-integrity failure, and
 * the off-boarding sweep (F11) has to tell them apart to avoid being noise.
 *
 * `chain` is always ordered from the queried identity outward toward the root.
 */
export type AccountabilityTrace =
  | {
      readonly termination: 'resolved_human';
      readonly chain: readonly ChainNode[];
      /** Id of the human the chain resolved to. */
      readonly root_human: string;
    }
  | {
      readonly termination: 'no_human_root';
      readonly chain: readonly ChainNode[];
      /** Id of the non-human the chain terminated at (system / break-glass / pre-existing). */
      readonly root_non_human: string;
    }
  | {
      readonly termination: 'dangling_reference';
      readonly chain: readonly ChainNode[];
      /** The `provisioned_by` value that resolved to nothing. */
      readonly missing_id: string;
    }
  | {
      readonly termination: 'cycle_detected';
      readonly chain: readonly ChainNode[];
      /** The identity the chain looped back to. */
      readonly repeated_id: string;
    }
  | {
      readonly termination: 'depth_limit_exceeded';
      readonly chain: readonly ChainNode[];
      readonly limit: number;
    };

/**
 * @deprecated Superseded by `OwnershipState` + `OwnershipReason` in
 * `domain/ownership.ts`. Retained because the F5 v1 assessment and
 * `/api/accountability/:id` still speak it; map with
 * `ORPHAN_REASON_TO_OWNERSHIP_REASON`.
 */
export type OrphanReason =
  | 'departed'
  | 'role_changed'
  | 'stale_review'
  | 'no_accountable_human'
  | 'broken_provenance';

/** Combined F4 + F5 result. Serialised directly by the HTTP layer. */
export interface AccountabilityAssessment {
  readonly identity_id: string;
  readonly chain: readonly ChainNode[];
  readonly termination: TraceTermination;
  /** Null unless `termination` is `resolved_human`. */
  readonly root_human: string | null;
  readonly orphaned: boolean;
  readonly orphan_reason: OrphanReason | null;
  readonly orphan_detail: string | null;
  /** Null when no root human resolved, or when that human has no review on record. */
  readonly days_since_review: number | null;
}

export type AssessmentOutcome =
  | { readonly ok: true; readonly assessment: AccountabilityAssessment }
  | { readonly ok: false; readonly error: 'unknown_identity'; readonly identity_id: string };
