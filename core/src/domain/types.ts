/**
 * Core identity model. Mirrors `docs/ITAG.md` §6.
 *
 * One node shape for every identity type — humans, service accounts, AI agents
 * and groups are structurally identical so that a single traversal serves all of
 * them (§3). Nothing in this file may branch on `type`.
 */

import type { PersistedCreationEdge, PrivilegeGrantEvent } from './lineage.js';
import type { OwnerKind, SuppressionReason } from './ownership.js';

export type IdentityType = 'human' | 'service_account' | 'ai_agent' | 'group';

export interface Identity {
  readonly id: string;
  readonly type: IdentityType;
  readonly name: string;
  /**
   * The app/system this identity and its relationships live in.
   *
   * Required, and never merged away at ingestion: `docs/PRD-delegation-chain.md`
   * §4.2 treats creation lineage as app-scoped, because a person's AWS IAM chain
   * and their Okta chain are separate stories rather than one graph. Cross-app
   * correlation is an analysis-layer concern (see `graph.byApp`), not a storage
   * one.
   */
  readonly app: string;
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
  /** ISO-8601 creation date, used to test against an app's audit-retention floor. */
  readonly created_at?: string;
  /**
   * ISO-8601 date of last use. Drives the PCI DSS v4.0.1 Req 8.2.6 inactivity
   * clock, which is a different question from whether the owner is still valid.
   */
  readonly last_activity_at?: string;
  /**
   * How the identity came to exist. `sso_federated` and `bulk_import` identities
   * legitimately have no creator in the app's audit log, so reading their empty
   * lineage as "unowned" would fabricate a finding (§4.6).
   */
  readonly provisioning_source?: 'app_native' | 'sso_federated' | 'bulk_import' | 'self_registered';
  /**
   * Which environment this account belongs to, where the estate classifies them.
   *
   * Read by the creation-authority signal (`docs/delegation-chain-research.md`
   * §4.4): the property that made the Midnight Blizzard chain a finding was not the
   * shape of the chain but a property of the creator — "a legacy, non-production
   * test tenant account" exercising a production-tenant creation privilege (§3.4).
   *
   * Optional and tri-state by absence: an unclassified identity is **not** treated
   * as non-production. Inferring the environment from a naming convention is how a
   * detector starts fabricating its own headline finding.
   */
  readonly environment?: 'production' | 'non_production';
  /**
   * The person this account belongs to, for cross-app correlation only.
   *
   * `docs/PRD-delegation-chain.md` L54 keys creation edges on `(app, child_id)`,
   * which presumes an identity spans apps, while `app` above is a required scalar —
   * so that key is currently redundant. `docs/delegation-chain-research.md` §4.7
   * resolves the conflict in favour of this model: an `Identity` is an *account* in
   * exactly one app, and correlation is an analysis act. Making `app` an array
   * instead would give one node two creators, two revocation states and two
   * activity clocks, which makes `buildTimeline` ambiguous, `graph.byApp`
   * non-partitioning and the PCI inactivity clock undefined.
   *
   * Never a storage key, never required, and never inferred: a wrong join
   * attributes one person's residual footprint to another, and downstream in the
   * off-boarding sweep that means either revoking a live credential belonging to a
   * current employee or filing a real departed-employee footprint under the wrong
   * name and closing it (§4.9).
   */
  readonly person_id?: string;
}

/**
 * A registered reason an identity is exempt from the orphan queue.
 *
 * Break-glass and shared system accounts are unowned *by design*; a detector
 * that reports them is uninstalled within a month (§4.6).
 */
export interface SuppressionEntry {
  readonly identity_id: string;
  readonly reason: SuppressionReason;
  readonly detail: string;
  /** ISO-8601. Required for anything granted as an exception rather than a fact. */
  readonly expires_at?: string;
}

export type EmploymentStatus = 'active' | 'departed' | 'role_changed';

export interface EmployeeRecord {
  readonly status: EmploymentStatus;
  /** ISO-8601 calendar date of the last access review for this person. */
  readonly last_reviewed: string;
  /**
   * ISO-8601 date the person left or changed role.
   *
   * The SLA clock runs from here, not from when a scan happened to notice
   * (`docs/orphaned-identity-research.md` §4.3). Deriving age from scan time
   * makes every finding look one day old and makes MTTR meaningless.
   */
  readonly effective_from?: string;
}

/**
 * A team that can hold ownership.
 *
 * Ownership is assigned to teams in preference to individuals (§4.2): people
 * leave, teams persist, and a team-owned identity does not become a finding the
 * day its creator resigns.
 */
export interface TeamRecord {
  readonly id: string;
  readonly name: string;
  /** Human identity ids. A team with no active member cannot hold ownership. */
  readonly members: readonly string[];
  /** Group identity this team owns, linking group membership to accountability. */
  readonly owns_group?: string;
}

/** An explicit, attested owner record — the highest-precedence ownership signal. */
export interface OwnerAssignment {
  readonly identity_id: string;
  readonly app: string;
  readonly owner_kind: OwnerKind;
  readonly owner_id: string;
  readonly backup_id?: string;
  /** ISO-8601 date of the last attestation. Absent means never attested. */
  readonly attested_at?: string;
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

/**
 * An app/system the engine has ingested identities from.
 *
 * `creation_data_from` is the audit-retention floor. Identities that predate it
 * have no recoverable creator, and `docs/PRD-delegation-chain.md` §6.6 requires
 * that be shown as a data gap rather than silently read as "no creator" — a
 * large cluster of unowned identities that is really missing history is a
 * fabricated finding.
 */
export interface AppRecord {
  readonly id: string;
  readonly name: string;
  /** ISO-8601 calendar date, or null when retention is unlimited. */
  readonly creation_data_from: string | null;
}

export interface IdentityDataset {
  readonly apps: readonly AppRecord[];
  readonly identities: readonly Identity[];
  readonly employee_status: Readonly<Record<string, EmployeeRecord>>;
  readonly teams: readonly TeamRecord[];
  readonly owner_assignments: readonly OwnerAssignment[];
  /** Optional so a dataset without registered exemptions stays valid. */
  readonly suppressions?: readonly SuppressionEntry[];
  readonly permissions: readonly PermissionRecord[];
  readonly control_history: readonly ControlHistory[];
  readonly grant_half_lives: readonly GrantHalfLife[];
  readonly grant_records: readonly GrantRecord[];
  /**
   * Observed creation events, append-only — `docs/delegation-chain-research.md` §4.6.
   *
   * `Identity.provisioned_by` stays the authoritative graph edge; this is the
   * evidence behind it. The two are separate because for six of seven providers
   * `created_by` is not a field on the identity object at all, only an audit event
   * with a retention window of 7 to 400 days (§3.2) — so this table is what lets
   * the engine still know on day 400 what it knew on day 1, and it is where the
   * actor detail a bare parent id cannot carry actually lives.
   *
   * Optional so a dataset that has not ingested an event stream stays valid: an
   * identity with a `provisioned_by` and no edge record here is a creator we
   * inherited from an object field rather than one we watched happen.
   */
  readonly creation_edges?: readonly PersistedCreationEdge[];
  /**
   * Privilege grants with the acting principal — the second half of the AC-2(e)
   * join (§4.4). Optional for the same reason `creation_edges` is.
   */
  readonly privilege_grant_events?: readonly PrivilegeGrantEvent[];
}
