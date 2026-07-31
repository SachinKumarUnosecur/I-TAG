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
