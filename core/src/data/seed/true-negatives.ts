import { cluster } from './fragment.js';

/**
 * BEATS 4, 5 and 11 — the rows we correctly did not flag.
 *
 * Anyone can render red nodes. §8 is blunt about what a security buyer is actually
 * evaluating: "showing the ones we correctly *didn't* flag is what separates this
 * from a report generator." Four identities here resolve to `owned` and are absent
 * from the queue, and two of them reach sensitive production access.
 *
 * BEAT 4 (§4.2 calls this the most important row after the headline):
 * `svc-payments-recon` was created by Erin, who left 143 days ago. It renders
 * green, because Payments Platform holds the owner record, has a live member and
 * attested 23 days ago. An identity is not orphaned because a person left — it is
 * orphaned because no live team claims it. A detector that cannot draw that
 * distinction is just counting departures.
 *
 * BEAT 5: `svc-invoice-mailer` is owned by a named individual who attested 46 days
 * ago, inside the 90-day window. Individual ownership is weaker than team
 * ownership and one departure away from being a finding, which is why the record
 * also names a backup.
 *
 * BEAT 11 (two clocks, not one): `svc-quarterly-audit-pull` has a valid owner who
 * attested 17 days ago, and has not been used in 200. It is `owned` and severity
 * `none`, and it is simultaneously reportable under PCI DSS v4.0.1 8.2.6, whose
 * 90 days measures *inactivity*. AC-2(3)'s SLA runs from a trigger such as
 * separation; 8.2.6's runs from last use. Collapsing them into one "days stale"
 * number answers neither question, so the finding carries both:
 * `timeline.age_days` is null while `timeline.inactive_days` is 200.
 */
export const TRUE_NEGATIVES = cluster({
  identities: [
    // BEAT 4 — creator departed 143 days ago, live team owns it, renders green.
    {
      id: 'svc-payments-recon',
      type: 'service_account',
      name: 'payments-reconciler',
      app: 'aws-iam',
      direct_grants: ['read:payments-ledger'],
      // Reaches export:finance-report through the group, so this is not green by
      // being harmless — it is green by being owned.
      inherited_from: ['group-finance'],
      delegates_to: [],
      provisioned_by: 'user-erin',
      revoked: false,
      created_at: '2025-08-11',
      last_activity_at: '2026-07-29',
      provisioning_source: 'app_native',
    },

    // BEAT 5 — named individual owner, attested 46 days ago.
    {
      id: 'svc-invoice-mailer',
      type: 'service_account',
      name: 'invoice-mailer',
      app: 'aws-iam',
      direct_grants: ['write:invoice-queue'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-04-02',
      last_activity_at: '2026-07-27',
      provisioning_source: 'app_native',
    },

    // BEAT 11 — perfectly owned, and dormant for 200 days.
    {
      id: 'svc-quarterly-audit-pull',
      type: 'service_account',
      name: 'quarterly-audit-pull',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-09-05',
      last_activity_at: '2026-01-12', // 200 days -> past PCI's 90-day inactivity window
      provisioning_source: 'app_native',
    },

    // Team-owned, recently attested, and the F5 v1 healthy baseline.
    {
      id: 'svc-monitor',
      type: 'service_account',
      name: 'monitor-agent',
      app: 'github',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-dan',
      revoked: false,
      created_at: '2026-02-10',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },

    /**
     * Carol moved roles 67 days ago, which AC-2(3) treats as a disablement
     * trigger — and yet this is green, because Platform Engineering owns group-eng
     * and group-eng is where this identity draws from. Team ownership survives a
     * role change; creator-as-owner would not have.
     */
    {
      id: 'svc-deploy',
      type: 'service_account',
      name: 'deploy-bot',
      app: 'aws-iam',
      direct_grants: ['deploy:prod'],
      inherited_from: ['group-eng'],
      delegates_to: [],
      provisioned_by: 'user-carol',
      revoked: false,
      created_at: '2025-07-22',
      last_activity_at: '2026-07-25',
      provisioning_source: 'app_native',
    },
  ],

  owner_assignments: [
    // BEAT 4 — a team with a live member, attested inside the 90-day window.
    {
      identity_id: 'svc-payments-recon',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-payments',
      backup_id: 'user-heidi',
      attested_at: '2026-07-08', // 23 days
    },
    // BEAT 5 — individual owner plus the backup every practitioner source insists on.
    {
      identity_id: 'svc-invoice-mailer',
      app: 'aws-iam',
      owner_kind: 'user',
      owner_id: 'user-heidi',
      backup_id: 'user-dan',
      attested_at: '2026-06-15', // 46 days
    },
    // BEAT 11 — freshly attested, so ownership is not the question here.
    {
      identity_id: 'svc-quarterly-audit-pull',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-data',
      backup_id: 'user-bob',
      attested_at: '2026-07-14', // 17 days
    },
    {
      identity_id: 'svc-monitor',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      backup_id: 'user-dan',
      attested_at: '2026-07-05', // 26 days
    },
  ],

  // F9 — clean permissions, MFA removed 11 days ago. Owned and still worth seeing.
  control_history: [
    {
      identity_id: 'svc-monitor',
      events: [{ control: 'mfa_enabled', change: 'disabled', date: '2026-07-20' }],
    },
  ],

  grant_records: [
    {
      identity_id: 'svc-deploy',
      permission: 'deploy:prod',
      grant_type: 'temp_admin_elevation',
      granted_at: '2026-03-01',
    },
  ],
});
