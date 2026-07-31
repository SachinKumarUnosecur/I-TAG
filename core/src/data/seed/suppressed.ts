import { cluster } from './fragment.js';

/**
 * BEAT 7 — unowned by design, and correctly not findings.
 *
 * §4.6: "An orphan detector that cries wolf is uninstalled in month one." Three
 * classes of account are deliberately unowned, each needing its own explicit,
 * inspectable rule rather than a hardcoded exclusion list — a break-glass account,
 * a shared system account, and a vendor-managed one.
 *
 * Every entry here carries an `expires_at`. An exception with no expiry is a
 * permanent hole in the control, and it is the first thing a judge or an assessor
 * asks about; §4.5 requires exceptions be time-bounded so that "we accepted this
 * risk" cannot quietly become "we forgot about this forever". The break-glass
 * registration expires at year end because it is re-certified annually, not because
 * the account is temporary.
 *
 * The fourth row is the one that matters most: `svc-migration-bridge` had an
 * identical vendor exemption, and it expired 31 days ago. The suppression is spent,
 * so the identity is back in the queue as a real finding. A suppression list that
 * cannot expire is indistinguishable from a blind spot.
 *
 * Break-glass accounts are monitored for *use* rather than for ownership, which is
 * why the two states matter here: `svc-breakglass-root` has never been used, and
 * `svc-shared-mailroom` was used yesterday.
 */
export const SUPPRESSED = cluster({
  identities: [
    {
      id: 'svc-breakglass-root',
      type: 'service_account',
      name: 'breakglass-root',
      app: 'aws-iam',
      // Holds the production database, deliberately. Suppressing the ownership
      // finding does not suppress the blast radius: it still reports
      // reachable_sensitive_count 1, it is simply not an orphan.
      direct_grants: ['admin:prod-database'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-01-20',
      // Never used. `last_activity_at` is absent rather than old, so the
      // inactivity clock reports null instead of a misleading number.
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-shared-mailroom',
      type: 'service_account',
      name: 'shared-mailroom',
      app: 'aws-iam',
      direct_grants: ['read:mailroom'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-02-14',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-vendor-scanner',
      type: 'service_account',
      name: 'vendor-sast-scanner',
      app: 'github',
      direct_grants: ['read:repo-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-04-01',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },

    // The expired exemption. Same class as the row above, no longer protected.
    {
      id: 'svc-migration-bridge',
      type: 'service_account',
      name: 'warehouse-migration-bridge',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-10-01', // 303 days -> the age the finding reports
      last_activity_at: '2026-06-28',
      provisioning_source: 'app_native',
    },
  ],

  suppressions: [
    {
      identity_id: 'svc-breakglass-root',
      reason: 'break_glass',
      detail: 'emergency access, unowned by design; use is alerted on rather than owned',
      expires_at: '2026-12-31', // re-certified annually
    },
    {
      identity_id: 'svc-shared-mailroom',
      reason: 'shared_system',
      detail: 'shared inbox processor, owned by Payments Platform at the team level only',
      expires_at: '2026-10-31', // 92 days out
    },
    {
      identity_id: 'svc-vendor-scanner',
      reason: 'vendor_managed',
      detail: 'credentials held by the scanning vendor under contract SEC-2026-114',
      expires_at: '2026-09-30', // 61 days out, tracks the contract term
    },
    {
      identity_id: 'svc-migration-bridge',
      reason: 'vendor_managed',
      detail: 'vendor owned this for the warehouse migration window',
      expires_at: '2026-06-30', // expired 31 days ago -> back in the queue
    },
  ],
});
