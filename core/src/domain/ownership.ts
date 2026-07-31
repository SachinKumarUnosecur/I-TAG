import type { OrphanReason } from './results.js';

/**
 * Ownership vocabulary — `docs/orphaned-identity-research.md` §3.1.
 *
 * Deliberately uses the industry's words rather than ITAG's. An auditor or a
 * buyer reads "orphaned account" as "no owner at all"; F5's original phrasing
 * ("orphaned accountability") means the narrower "an owner resolves but is no
 * longer valid". Three names for overlapping findings is how the numbers stop
 * matching the numbers a customer already has, so one enum carries the state and
 * reason codes carry the distinction.
 */
export type OwnershipState =
  /** A live, attested owner resolved. */
  | 'owned'
  /** No owner on record — the classic orphaned account. */
  | 'unowned'
  /** An owner resolved, but is departed, role-changed or unattested. */
  | 'owner_invalid'
  /** Two or more high-confidence signals disagree about who owns this. */
  | 'ambiguous'
  /**
   * Insufficient data to decide.
   *
   * Structurally separate from `unowned` and never counted as a finding (§4.6).
   * Reporting an audit-history gap as an orphan is the single most common way
   * this class of feature loses analyst trust.
   */
  | 'unknown';

export type OwnershipReason =
  | 'owner_departed'
  | 'owner_role_changed'
  | 'owner_never_attested'
  | 'owner_attestation_stale'
  | 'no_owner_on_record'
  | 'creator_deactivated'
  | 'conflicting_owner_signals'
  | 'outside_audit_window'
  /**
   * Also extends §3.1. An owner record naming a team whose entire roster has
   * left is not ownership — it is the same orphan with a nicer label, and it is
   * the failure mode team-level assignment (§4.2) is otherwise meant to prevent.
   */
  | 'owner_team_vacant'
  /**
   * Extends the §3.1 list. The engine already detects provenance that cannot be
   * followed — a dangling `provisioned_by`, a cycle, a chain past the depth cap
   * — and those are data-integrity failures, not statements about an owner.
   * Folding them into `no_owner_on_record` would collapse "nobody owns this" into
   * "we lost the pointer", which `AccountabilityTrace` exists to keep apart.
   */
  | 'broken_provenance';

export type OwnerKind = 'user' | 'team';

/**
 * Where an owner assertion came from. Emitted with every finding so an analyst
 * can argue with it instead of dismissing the tool.
 */
export type OwnerSource = 'explicit_tag' | 'group_ownership' | 'creator_fallback' | 'inferred';

export type OwnerConfidence = 'high' | 'medium' | 'low';

/**
 * The current accountable party — `docs/orphaned-identity-research.md` §4.1.
 *
 * Distinct from `Identity.provisioned_by`, which is an immutable audit fact.
 * Ownership is reassignable and attestable: a service account created by a
 * bootstrap admin in 2021 and handed to a platform team in 2023 is owned by that
 * team, and reading the creation edge as the answer would report every
 * legitimate handover as an orphan.
 */
export interface OwnerRef {
  readonly kind: OwnerKind;
  readonly id: string;
  readonly source: OwnerSource;
  readonly confidence: OwnerConfidence;
  /** ISO-8601 date of the last ownership attestation, or null if never attested. */
  readonly attested_at: string | null;
  /**
   * Secondary contact. Recommended by every practitioner source surveyed in §3.4:
   * a single named owner is one departure away from being the finding.
   */
  readonly backup_id: string | null;
}

/**
 * The two clocks a finding runs on — `docs/orphaned-identity-research.md` §4.3.
 *
 * Owner validity and account inactivity are deliberately separate. PCI DSS
 * v4.0.1 Req 8.2.6's 90 days measures *inactivity*; NIST SP 800-53 AC-2(3)'s SLA
 * runs from a *trigger* such as separation or role change. Collapsing them into
 * one "days stale" number answers neither question.
 */
export interface OwnershipTimeline {
  /**
   * ISO-8601 date the condition became true — a departure date, an attestation
   * date, an audit-retention floor. Never the scan date: deriving age from when
   * a scan happened to run makes every finding look one day old and makes MTTR
   * meaningless.
   */
  readonly condition_since: string | null;
  readonly age_days: number | null;
  /** Organization-defined disablement SLA for this identity type (AC-2(3)). */
  readonly sla_days: number;
  readonly sla_breached: boolean;
  readonly last_activity_at: string | null;
  readonly inactive_days: number | null;
  /** PCI DSS v4.0.1 Req 8.2.6 — inactive beyond the configured window. */
  readonly inactive_beyond_threshold: boolean;
}

/**
 * What a suppression does to a finding.
 *
 * `unknown` is not a softer `unowned`: it means the data cannot support a
 * conclusion, and §4.6 requires it stay out of the finding count entirely.
 * `excluded` drops the identity from scope. `suppressed` keeps a real finding
 * but withholds it from the queue under a time-bounded exception.
 */
export type SuppressionEffect = 'unknown' | 'suppressed' | 'excluded';

export type SuppressionReason =
  | 'break_glass'
  | 'shared_system'
  | 'vendor_managed'
  | 'sso_federated'
  | 'outside_audit_window'
  | 'already_revoked';

export interface Suppression {
  readonly effect: SuppressionEffect;
  readonly reason: SuppressionReason;
  readonly detail: string;
  /** ISO-8601. Exceptions are always time-bounded; structural facts are not. */
  readonly expires_at: string | null;
}

/**
 * Ranked by reachable sensitive access first, age second (§4.3).
 *
 * Ranking by count or age alone produces a list nobody can triage: everyone can
 * generate 4,000 orphans, and the question is which seven reach production.
 */
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'none';

export type DispositionAction = 'open' | 'reassigned' | 'revoked' | 'attested' | 'suppressed';

/**
 * What a human decided about a finding — `docs/orphaned-identity-research.md` §4.5.
 *
 * Records are appended, never edited: PCI DSS v4.0.1 Req 8.2.6 and NIST SP
 * 800-53 AC-2(3) are both satisfied with evidence that an action happened within
 * a window, which means "what did we know on 30 June" has to be reconstructable.
 * That cannot be retrofitted onto mutable rows.
 */
export interface FindingDisposition {
  readonly finding_id: string;
  readonly identity_id: string;
  readonly action: DispositionAction;
  readonly actor: string;
  /** ISO-8601 instant, from the injected clock. */
  readonly at: string;
  readonly justification: string;
  /** Required for `suppressed`: an exception with no expiry is a permanent hole. */
  readonly expires_at: string | null;
  /** Ticket or change-record reference, the artefact an assessor asks for. */
  readonly evidence_ref: string | null;
}

/**
 * Bridges the F5 v1 vocabulary onto the ownership vocabulary.
 *
 * A lookup table rather than a `switch` so a new `OrphanReason` fails the build
 * here instead of silently falling through to a default.
 */
export const ORPHAN_REASON_TO_OWNERSHIP_REASON: Readonly<Record<OrphanReason, OwnershipReason>> =
  Object.freeze({
    departed: 'owner_departed',
    role_changed: 'owner_role_changed',
    stale_review: 'owner_attestation_stale',
    no_accountable_human: 'no_owner_on_record',
    broken_provenance: 'broken_provenance',
  });
