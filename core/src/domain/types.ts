/**
 * Core identity model. Mirrors `docs/ITAG.md` §6.
 *
 * One node shape for every identity type — humans, service accounts, AI agents
 * and groups are structurally identical so that a single traversal serves all of
 * them (§3). Nothing in this file may branch on `type`.
 */

export type IdentityType = 'human' | 'service_account' | 'ai_agent' | 'group';

export interface Identity {
  readonly id: string;
  readonly type: IdentityType;
  readonly name: string;
  /** Permissions attached directly to this identity. */
  readonly direct_grants: readonly string[];
  /** Groups/roles this identity draws permissions from. */
  readonly inherited_from: readonly string[];
  /** Identities this one provisioned, spawned or configured. */
  readonly delegates_to: readonly string[];
  /**
   * The identity that provisioned this one, or null if this is a root.
   *
   * Authoritative for accountability tracing. `delegates_to` is the denormalised
   * inverse and is validated for agreement at load time, but never traversed by
   * the backward walk.
   */
  readonly provisioned_by: string | null;
  /** True once the identity has been decommissioned. Consumed by F11. */
  readonly revoked?: boolean;
}

export type EmploymentStatus = 'active' | 'departed' | 'role_changed';

export interface EmployeeRecord {
  readonly status: EmploymentStatus;
  /** ISO-8601 calendar date of the last access review for this person. */
  readonly last_reviewed: string;
}

export interface PermissionRecord {
  readonly id: string;
  readonly sensitive?: boolean;
}

/** A weakening of a protective control over time. Consumed by F9. */
export interface ControlEvent {
  readonly control: string;
  readonly change: string;
  /** ISO-8601 calendar date. */
  readonly date: string;
  readonly note?: string;
}

export interface ControlHistory {
  readonly identity_id: string;
  readonly events: readonly ControlEvent[];
}

/** Historical revocation pattern for a class of grant. Consumed by F10. */
export interface GrantHalfLife {
  readonly grant_type: string;
  readonly median_days_to_actual_need: number;
  readonly median_days_to_revocation: number;
  readonly sample_size: number;
}

/** Binds a live grant to a half-life class and an issue date. Consumed by F10. */
export interface GrantRecord {
  readonly identity_id: string;
  readonly permission: string;
  readonly grant_type: string;
  /** ISO-8601 calendar date. */
  readonly granted_at: string;
}

export interface IdentityDataset {
  readonly identities: readonly Identity[];
  readonly employee_status: Readonly<Record<string, EmployeeRecord>>;
  readonly permissions: readonly PermissionRecord[];
  readonly control_history: readonly ControlHistory[];
  readonly grant_half_lives: readonly GrantHalfLife[];
  readonly grant_records: readonly GrantRecord[];
}
