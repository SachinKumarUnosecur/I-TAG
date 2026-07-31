import type { ActorKind } from './lineage.js';
import type { IdentityType } from './types.js';

export interface AccountabilityPolicy {
  /**
   * Days since a root human's last access review before their accountability is
   * treated as stale, even while they remain employed and in role.
   *
   * 90 is a deliberate midpoint between the two citable industry anchors, not an
   * invented number: CIS Controls v8 Safeguard 5.3 sets 45 days for dormant
   * account disablement, and PCI DSS v4.0.1 Requirement 7.2.4 sets six months
   * for user access review. NIST SP 800-53r5 AC-6(7) and AC-2(j) both leave the
   * review frequency organization-defined and supply no number to borrow.
   */
  readonly staleReviewDays: number;
  /**
   * Maximum provisioning hops the backward walk will follow before giving up.
   *
   * A depth cap on delegation-graph search is standard practice, not a guess:
   * the OASIS XACML 3.0 Administration and Delegation Profile bounds its
   * reduction graph search the same way. Real provisioning chains are 2-4 hops,
   * so 16 is far above any legitimate case and only trips on corrupt data.
   */
  readonly maxChainDepth: number;
}

export const DEFAULT_ACCOUNTABILITY_POLICY: AccountabilityPolicy = Object.freeze({
  staleReviewDays: 90,
  maxChainDepth: 16,
});

/**
 * Thresholds for the Ownership Assurance module.
 *
 * Separate from `AccountabilityPolicy` rather than bolted onto it: F5 v1 answers
 * "is this chain's root human still valid", which needs one number, while
 * ownership findings run two independent clocks and a per-type SLA.
 */
export interface OwnershipPolicy {
  /**
   * Days since the last ownership attestation before the owner is treated as
   * unverified. Distinct from `staleReviewDays`, which measures access review.
   */
  readonly staleAttestationDays: number;
  /**
   * Disablement SLA per identity type.
   *
   * NIST SP 800-53 AC-2(3) requires disablement within an organization-defined
   * period after separation, role change or inactivity, and supplies no number —
   * so this is a configured value, not a discovered one. Non-human identities get
   * a tighter window than humans because nobody notices their absence.
   */
  readonly slaDaysByType: Readonly<Record<IdentityType, number>>;
  /**
   * Inactivity window before an account is reportable independent of ownership.
   * 90 days is PCI DSS v4.0.1 Requirement 8.2.6 verbatim.
   */
  readonly inactivityDays: number;
}

export const DEFAULT_OWNERSHIP_POLICY: OwnershipPolicy = Object.freeze({
  staleAttestationDays: 90,
  slaDaysByType: Object.freeze({
    human: 30,
    service_account: 14,
    ai_agent: 14,
    group: 30,
  }),
  inactivityDays: 90,
});

/**
 * What counts as an abnormal creation rate for one class of actor.
 *
 * `docs/PRD-delegation-chain.md` L63 names the right problem — automation may have
 * high fan-out by design while a human admin should not — and then reaches for a
 * static configurable threshold, which cannot express it.
 * `docs/delegation-chain-research.md` §4.3 replaces it with a rate against the
 * principal's *own* trailing history, because lifetime fan-out measures tenure
 * rather than risk: threshold on it and the queue is permanently topped by
 * `scim-provisioner` and `terraform-ci`, and a muted flag never un-mutes.
 */
export interface FanOutBaseline {
  /** Length of the rolling window the current rate is measured over. */
  readonly windowDays: number;
  /** Preceding windows used to form this principal's own median. */
  readonly trailingWindows: number;
  /**
   * Ceiling inside one window. Set only where a raw count is meaningful on its own
   * — a person creating accounts — and null wherever volume is the normal state.
   */
  readonly maxInWindow: number | null;
  /**
   * Deviations above the principal's own trailing median. Null where creation
   * volume is too low for a deviation to mean anything.
   */
  readonly sigmaMultiple: number | null;
  /**
   * Whether creating a class of target for the first time is enough on its own, or
   * only counts when that target holds sensitive access.
   *
   * Automation legitimately meets new workloads; a person reaching into a system
   * they have never provisioned in before is the stronger signal (§4.3).
   */
  readonly noveltyRequiresPrivilegedTarget: boolean;
}

export interface LineagePolicy {
  /**
   * ISO-8601 date we began capturing creation events for ourselves.
   *
   * In a real deployment this is `max(provider retention floor, install date)`
   * (research §3.2). It is what makes explanation coverage a line that climbs from
   * a known date instead of a static percentage, and it populates the
   * `not_yet_captured` bucket — the only gap bucket that shrinks as the product runs.
   */
  readonly observedFrom: string;
  /**
   * Per actor class, because the whole point of §4.3 is that one threshold cannot
   * serve a human and a provisioning bot. A `Record` over every `ActorKind` rather
   * than a lookup with a default, so a new kind fails the build here instead of
   * silently inheriting someone else's baseline.
   *
   * **These values are reasoned, not measured.** No public dataset of enterprise
   * account-creation rates by actor class exists (research §10), so they are
   * starting points to be replaced by customer telemetry, and the UI should say so.
   */
  readonly fanOutBaselines: Readonly<Record<ActorKind, FanOutBaseline>>;
  /**
   * How close in time a create and a privilege grant must be to read as one act.
   *
   * The AC-2(e) join is bounded rather than open-ended: a grant made months later is
   * a separate decision by whoever made it, and calling it self-authorization would
   * turn ordinary maintenance into a finding.
   */
  readonly selfAuthorizedWindowDays: number;
  /** Days without activity before a creator counts as dormant (§4.4). */
  readonly creatorDormantDays: number;
}

export const DEFAULT_LINEAGE_POLICY: LineagePolicy = Object.freeze({
  // The seed's earliest app retention floor, so no identity in the demo lands in
  // `not_yet_captured` by accident; a real deployment sets its own install date.
  observedFrom: '2019-01-01',
  fanOutBaselines: Object.freeze({
    // A person creating more than five accounts in a week, or reaching into a system
    // they have never provisioned in, is the §4.3 human rule verbatim.
    human: Object.freeze({
      windowDays: 7,
      trailingWindows: 8,
      maxInWindow: 5,
      sigmaMultiple: null,
      noveltyRequiresPrivilegedTarget: false,
    }),
    // A role session is a human or an automation wearing a role; treated as
    // automation because its volume is machine-driven whoever is behind it.
    role_session: Object.freeze({
      windowDays: 30,
      trailingWindows: 6,
      maxInWindow: null,
      sigmaMultiple: 3,
      noveltyRequiresPrivilegedTarget: true,
    }),
    service_principal: Object.freeze({
      windowDays: 30,
      trailingWindows: 6,
      maxInWindow: null,
      sigmaMultiple: 3,
      noveltyRequiresPrivilegedTarget: true,
    }),
    automation: Object.freeze({
      windowDays: 30,
      trailingWindows: 6,
      maxInWindow: null,
      sigmaMultiple: 3,
      noveltyRequiresPrivilegedTarget: true,
    }),
    // The provider creating things is the provider working. No volume threshold can
    // be meaningful, so only a privileged novel target is reportable at all.
    provider_service: Object.freeze({
      windowDays: 30,
      trailingWindows: 6,
      maxInWindow: null,
      sigmaMultiple: null,
      noveltyRequiresPrivilegedTarget: true,
    }),
    // Unclassifiable, so deliberately the most conservative: we will not rank an
    // actor we cannot describe.
    unknown: Object.freeze({
      windowDays: 30,
      trailingWindows: 6,
      maxInWindow: null,
      sigmaMultiple: null,
      noveltyRequiresPrivilegedTarget: true,
    }),
  }),
  selfAuthorizedWindowDays: 7,
  creatorDormantDays: 90,
});
