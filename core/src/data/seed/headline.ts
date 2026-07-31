import { cluster } from './fragment.js';

/**
 * BEAT 1 — the headline. The Colonial Pipeline pattern
 * (`docs/orphaned-identity-research.md` §3.3).
 *
 * April 2021: initial access to Colonial Pipeline was a legacy VPN account
 * belonging to a former employee — still enabled, no MFA, credentials in a
 * dark-web dump, nine days of dwell time. MITRE ATT&CK T1078 names exactly this:
 * adversaries use the accounts of people who have left *because the original user
 * is not around to notice*.
 *
 * This is the #1 ranked row in the queue, and it is ranked there by two signals at
 * once. Orphaned: Victor left 200 days ago and nothing was reassigned. Decayed:
 * MFA was turned off 271 days ago and a "temporary" conditional-access exception
 * has been open for 167. Neither alone would put it at the top — that fusion is
 * the strongest claim the project has.
 *
 * Evidences PCI DSS v4.0.1 8.2.6 (inactive accounts), NIST SP 800-53 AC-2(3)
 * (disable on separation, within an org-defined SLA) and ISO 27001:2022 A.5.18.
 *
 * Cross-app by construction: Victor lives in the IdP, the VPN concentrator lives
 * in the legacy directory. Neither system, read alone, shows a problem — the IdP
 * shows a correctly disabled leaver, the directory shows a working service
 * account. The finding only exists once the two fragments are joined, which is
 * why this edge is in `graph.crossAppEdges` (§4.4).
 */
export const HEADLINE = cluster({
  identities: [
    {
      id: 'svc-vpn-legacy',
      type: 'service_account',
      name: 'legacy-vpn-concentrator',
      app: 'legacy-ldap',
      // Reaches the production database through the admin group as well, so the
      // blast radius is two sensitive permissions, not one.
      direct_grants: ['vpn:corp-network'],
      inherited_from: ['group-legacy-admins'],
      delegates_to: [],
      provisioned_by: 'user-victor',
      revoked: false,
      created_at: '2021-05-04',
      // Used 5 days ago — 195 days after the only person accountable for it left.
      last_activity_at: '2026-07-26',
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-legacy-fileshare',
      type: 'service_account',
      name: 'legacy-fileshare-mount',
      app: 'legacy-ldap',
      direct_grants: ['read:fileshare'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-victor',
      // Cleaned up during off-boarding. Counted as remediated, not as debt, and it
      // is what makes the sweep's numbers credible: it reports 1 live and 1 closed
      // rather than 2 problems.
      revoked: true,
      created_at: '2020-09-14',
      last_activity_at: '2025-11-30',
      provisioning_source: 'app_native',
    },
  ],

  /**
   * F9 — the control side of the headline. Both events predate Victor's departure,
   * which is the uncomfortable part: the account was already under-protected while
   * it still had an owner, and losing the owner is what removed the last person
   * who might have noticed.
   */
  control_history: [
    {
      identity_id: 'svc-vpn-legacy',
      events: [
        { control: 'mfa_enabled', change: 'disabled', date: '2025-11-02' }, // 271 days
        {
          control: 'conditional_access',
          change: 'exception_granted',
          date: '2026-02-14', // 167 days, and still open
          note: 'temporary - contractor onsite window',
        },
      ],
    },
  ],

  // F10 — a VPN grant whose median useful life is 30 days, live for 1914.
  grant_records: [
    {
      identity_id: 'svc-vpn-legacy',
      permission: 'vpn:corp-network',
      grant_type: 'vpn_remote_access',
      granted_at: '2021-05-04',
    },
  ],
});
