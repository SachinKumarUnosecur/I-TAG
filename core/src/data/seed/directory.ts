import { cluster } from './fragment.js';

/**
 * People and teams — the ground truth every other cluster reads from.
 *
 * Kept in one file on purpose: employment status is what decides whether an owner
 * is valid, so a reviewer needs to see all nine statuses and all five rosters
 * side by side rather than hunting them across the beats that consume them.
 *
 * Every date is measured backward from the pinned demo instant
 * (`ITAG_NOW=2026-07-31T00:00:00Z`), and the day-delta is stated wherever a
 * threshold decision depends on it.
 *
 * Four of the five departed people had their own login disabled (`revoked: true`)
 * — that is what off-boarding usually means in practice, and it is exactly why the
 * sweep exists: the login is gone, the estate is not. Alice is the deliberate
 * exception; her own account is still enabled.
 */
export const DIRECTORY = cluster({
  identities: [
    // --- Departed, own account still enabled -------------------------------
    {
      id: 'user-alice',
      type: 'human',
      name: 'Alice Chen',
      app: 'aws-iam',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-backup'],
      provisioned_by: null,
      created_at: '2025-02-03',
      last_activity_at: '2026-06-14',
      provisioning_source: 'app_native',
    },

    // --- Departed, login disabled, estate left behind ----------------------
    {
      id: 'user-victor',
      type: 'human',
      name: 'Victor Osei',
      app: 'idp-core',
      direct_grants: ['sso:corp-login'],
      inherited_from: [],
      delegates_to: ['svc-legacy-fileshare', 'svc-vpn-legacy'],
      provisioned_by: null,
      // The SSO account was disabled on his last day. Everything he provisioned
      // in the legacy directory was not.
      revoked: true,
      created_at: '2025-06-02',
      last_activity_at: '2026-01-09',
      provisioning_source: 'app_native',
    },
    {
      id: 'user-erin',
      type: 'human',
      name: 'Erin Blake',
      app: 'aws-iam',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-legacy-export', 'svc-payments-recon'],
      provisioned_by: null,
      revoked: true,
      created_at: '2025-01-15',
      last_activity_at: '2026-03-09',
    },
    {
      id: 'user-nadia',
      type: 'human',
      name: 'Nadia Okonkwo',
      app: 'aws-iam',
      direct_grants: ['read:payments-ledger'],
      inherited_from: [],
      delegates_to: ['svc-batch-recon'],
      provisioned_by: null,
      revoked: true,
      created_at: '2025-09-10',
      last_activity_at: '2026-06-20',
    },
    {
      id: 'user-omar',
      type: 'human',
      name: 'Omar Lindqvist',
      app: 'aws-iam',
      direct_grants: ['read:payments-ledger'],
      inherited_from: [],
      delegates_to: ['svc-quarter-close'],
      provisioned_by: null,
      revoked: true,
      created_at: '2026-01-06',
      last_activity_at: '2026-07-25',
    },

    // --- Moved roles, still employed --------------------------------------
    {
      id: 'user-carol',
      type: 'human',
      name: 'Carol Dsouza',
      app: 'aws-iam',
      direct_grants: ['deploy:staging'],
      inherited_from: [],
      delegates_to: ['svc-deploy'],
      provisioned_by: null,
      created_at: '2025-03-05',
      last_activity_at: '2026-07-29',
    },

    // --- Active ------------------------------------------------------------
    {
      id: 'user-bob',
      type: 'human',
      name: 'Bob Iyer',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: ['svc-etl'],
      provisioned_by: null,
      created_at: '2025-06-14',
      last_activity_at: '2026-07-30',
    },
    {
      id: 'user-dan',
      type: 'human',
      name: 'Dan Ferreira',
      app: 'github',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: ['svc-monitor'],
      provisioned_by: null,
      created_at: '2025-01-08',
      last_activity_at: '2026-07-30',
    },
    {
      id: 'user-heidi',
      type: 'human',
      name: 'Heidi Nakamura',
      app: 'aws-iam',
      direct_grants: ['export:payroll-file'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-payroll-export'],
      provisioned_by: null,
      created_at: '2025-02-20',
      last_activity_at: '2026-07-30',
    },
  ],

  /**
   * `effective_from` is when the person actually left or moved, so the AC-2(3)
   * SLA clock runs from the HR event rather than from whenever a scan noticed.
   * Without it every finding looks one day old and MTTR means nothing (§4.3).
   */
  employee_status: {
    'user-alice': {
      status: 'departed',
      last_reviewed: '2026-06-01',
      effective_from: '2026-06-15', // 46 days -> past the 14-day service-account SLA
    },
    'user-victor': {
      status: 'departed',
      last_reviewed: '2025-12-03', // 240 days
      effective_from: '2026-01-12', // 200 days -> the oldest breach in the dataset
    },
    'user-erin': {
      status: 'departed',
      last_reviewed: '2026-02-02',
      effective_from: '2026-03-10', // 143 days
    },
    'user-nadia': {
      status: 'departed',
      last_reviewed: '2026-05-15',
      effective_from: '2026-06-21', // 40 days -> breaches the 14-day SLA
    },
    'user-omar': {
      status: 'departed',
      last_reviewed: '2026-07-02',
      effective_from: '2026-07-26', // 5 days -> still inside the 14-day SLA
    },
    // AC-2(3) names role change as a disablement trigger alongside separation,
    // so this is a control requirement rather than a nicety.
    'user-carol': {
      status: 'role_changed',
      last_reviewed: '2026-05-20',
      effective_from: '2026-05-25', // 67 days
    },
    // Active but unreviewed for 197 days, past the 90-day staleReviewDays floor.
    'user-bob': { status: 'active', last_reviewed: '2026-01-15' },
    'user-dan': { status: 'active', last_reviewed: '2026-07-10' }, // 21 days
    'user-heidi': { status: 'active', last_reviewed: '2026-07-12' }, // 19 days
  },

  /**
   * Ownership sits with teams in preference to individuals (§4.2): people leave,
   * teams persist. `owns_group` is the join that lets group membership imply
   * accountability, and it is also how two high-confidence signals end up
   * disagreeing when an explicit tag names someone else.
   */
  teams: [
    { id: 'team-platform', name: 'Platform Engineering', members: ['user-dan'], owns_group: 'group-eng' },
    { id: 'team-data', name: 'Data Platform', members: ['user-bob'], owns_group: 'group-data' },
    {
      id: 'team-discovery',
      name: 'Search & Discovery',
      members: ['user-dan'],
      owns_group: 'group-search-index',
    },
    { id: 'team-payments', name: 'Payments Platform', members: ['user-heidi'] },
    // Every member has departed. An owner record still names it, which is the
    // failure mode team-level assignment is otherwise meant to prevent.
    { id: 'team-finance-ops', name: 'Finance Operations', members: ['user-erin'] },
  ],
});
