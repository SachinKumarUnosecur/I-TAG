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
