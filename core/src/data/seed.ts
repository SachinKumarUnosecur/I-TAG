import type { IdentityDataset } from '../domain/types.js';

/**
 * Static seed dataset — `docs/ITAG.md` §9 Step 1.
 *
 * Held as a typed module rather than a `.json` file (which §4 F1 suggests) so the
 * literal is checked against `IdentityDataset` at compile time. Intent is
 * unchanged: one static dataset, loaded once into memory, no database.
 *
 * Identities prefixed `*-fixture-*` exist only to make the pathological
 * accountability terminal states reachable and should be filtered out of the
 * happy-path demo view.
 *
 * Canonical demo chain (§6): user-alice (departed) provisions svc-backup, which
 * spawns agent-report. agent-report explicitly holds only `mcp:gmail-read` but
 * effectively also reaches `mcp:notion-write` two hops back through group-eng —
 * the escalation F3 catches, while Alice's departure is what F5 catches.
 */
export const SEED_DATASET: IdentityDataset = {
  identities: [
    // --- Canonical demo chain: departed owner, escalation via group ---------
    {
      id: 'user-alice',
      type: 'human',
      name: 'Alice Chen',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-backup'],
      provisioned_by: null,
    },
    {
      id: 'svc-backup',
      type: 'service_account',
      name: 'backup-service',
      direct_grants: ['write:s3-backup'],
      inherited_from: ['group-eng'],
      delegates_to: ['agent-report'],
      provisioned_by: 'user-alice',
      revoked: false,
    },
    {
      id: 'agent-report',
      type: 'ai_agent',
      name: 'report-agent',
      direct_grants: ['mcp:gmail-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-backup',
      revoked: false,
    },

    // --- Stale-review chain: owner still employed, never re-reviewed --------
    {
      id: 'user-bob',
      type: 'human',
      name: 'Bob Iyer',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: ['svc-etl'],
      provisioned_by: null,
    },
    {
      id: 'svc-etl',
      type: 'service_account',
      name: 'etl-runner',
      direct_grants: ['read:warehouse'],
      inherited_from: ['group-data'],
      delegates_to: ['agent-analytics'],
      provisioned_by: 'user-bob',
    },
    {
      id: 'agent-analytics',
      type: 'ai_agent',
      name: 'analytics-agent',
      direct_grants: ['mcp:sheets-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-etl',
    },

    // --- Role-changed owner ------------------------------------------------
    {
      id: 'user-carol',
      type: 'human',
      name: 'Carol Dsouza',
      direct_grants: ['deploy:staging'],
      inherited_from: [],
      delegates_to: ['svc-deploy'],
      provisioned_by: null,
    },
    {
      id: 'svc-deploy',
      type: 'service_account',
      name: 'deploy-bot',
      direct_grants: ['deploy:prod'],
      inherited_from: ['group-eng'],
      delegates_to: [],
      provisioned_by: 'user-carol',
    },

    // --- Healthy baseline: active owner, recently reviewed ------------------
    {
      id: 'user-dan',
      type: 'human',
      name: 'Dan Ferreira',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: ['svc-monitor'],
      provisioned_by: null,
    },
    {
      id: 'svc-monitor',
      type: 'service_account',
      name: 'monitor-agent',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-dan',
    },

    // --- Second departed employee with a live sensitive footprint (F11) -----
    {
      id: 'user-erin',
      type: 'human',
      name: 'Erin Blake',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-legacy-export'],
      provisioned_by: null,
    },
    {
      id: 'svc-legacy-export',
      type: 'service_account',
      name: 'legacy-export',
      direct_grants: ['export:finance-report'],
      inherited_from: ['group-finance'],
      delegates_to: [],
      provisioned_by: 'user-erin',
      revoked: false,
    },

    // --- Groups ------------------------------------------------------------
    {
      id: 'group-eng',
      type: 'group',
      name: 'Engineering',
      direct_grants: ['mcp:notion-write'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },
    {
      id: 'group-finance',
      type: 'group',
      name: 'Finance',
      direct_grants: ['read:finance-db', 'export:finance-report'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },
    {
      id: 'group-data',
      type: 'group',
      name: 'Data Platform',
      direct_grants: ['write:warehouse', 'admin:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },

    // --- Non-human root: nobody ever owned this branch ----------------------
    {
      id: 'svc-systemroot',
      type: 'service_account',
      name: 'platform-bootstrap',
      direct_grants: ['admin:platform'],
      inherited_from: [],
      delegates_to: ['agent-legacy-sweeper'],
      provisioned_by: null,
    },
    {
      id: 'agent-legacy-sweeper',
      type: 'ai_agent',
      name: 'legacy-sweeper-agent',
      direct_grants: ['mcp:drive-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-systemroot',
    },

    // --- Pathological fixtures: exclude from the demo view ------------------
    {
      id: 'svc-fixture-dangling-owner',
      type: 'service_account',
      name: 'orphaned-import-svc',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: [],
      // Points at an identity that is not in the graph. Mirrors a real Entra
      // failure mode: an auto-created service principal inherits no owner from
      // either the application object or the user who triggered its creation.
      provisioned_by: 'user-ghost',
    },
    {
      id: 'svc-fixture-cycle-a',
      type: 'service_account',
      name: 'cycle-probe-a',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-b'],
      provisioned_by: 'svc-fixture-cycle-b',
    },
    {
      id: 'svc-fixture-cycle-b',
      type: 'service_account',
      name: 'cycle-probe-b',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-a'],
      provisioned_by: 'svc-fixture-cycle-a',
    },
  ],

  employee_status: {
    'user-alice': { status: 'departed', last_reviewed: '2026-06-01' },
    'user-bob': { status: 'active', last_reviewed: '2026-01-15' },
    'user-carol': { status: 'role_changed', last_reviewed: '2026-05-20' },
    'user-dan': { status: 'active', last_reviewed: '2026-07-10' },
    'user-erin': { status: 'departed', last_reviewed: '2026-02-02' },
  },

  permissions: [
    { id: 'read:finance-db' },
    { id: 'export:finance-report', sensitive: true },
    { id: 'write:s3-backup' },
    { id: 'mcp:gmail-read' },
    { id: 'mcp:notion-write' },
    { id: 'read:warehouse' },
    { id: 'write:warehouse' },
    { id: 'admin:warehouse', sensitive: true },
    { id: 'mcp:sheets-read' },
    { id: 'deploy:staging' },
    { id: 'deploy:prod', sensitive: true },
    { id: 'read:metrics' },
    { id: 'admin:platform', sensitive: true },
    { id: 'mcp:drive-read' },
  ],

  // F9 — protective controls weakening over time, independent of permissions.
  control_history: [
    {
      identity_id: 'svc-backup',
      events: [
        { control: 'mfa_enabled', change: 'disabled', date: '2026-04-10' },
        {
          control: 'conditional_access',
          change: 'exception_granted',
          date: '2026-05-02',
          note: 'temporary - VPN issue',
        },
      ],
    },
    {
      identity_id: 'svc-etl',
      events: [
        {
          control: 'session_timeout',
          change: 'extended',
          date: '2026-06-15',
          note: 'long-running batch jobs',
        },
      ],
    },
    {
      identity_id: 'svc-monitor',
      events: [{ control: 'mfa_enabled', change: 'disabled', date: '2026-07-20' }],
    },
  ],

  // F10 — historical revocation patterns per class of grant.
  grant_half_lives: [
    {
      grant_type: 'contractor_prod_db_access',
      median_days_to_actual_need: 45,
      median_days_to_revocation: 210,
      sample_size: 12,
    },
    {
      grant_type: 'temp_admin_elevation',
      median_days_to_actual_need: 7,
      median_days_to_revocation: 90,
      sample_size: 23,
    },
    {
      grant_type: 'service_account_provisioning',
      median_days_to_actual_need: 180,
      median_days_to_revocation: 540,
      sample_size: 41,
    },
    {
      grant_type: 'ci_deploy_key',
      median_days_to_actual_need: 90,
      median_days_to_revocation: 365,
      sample_size: 18,
    },
  ],

  grant_records: [
    {
      identity_id: 'svc-deploy',
      permission: 'deploy:prod',
      grant_type: 'temp_admin_elevation',
      granted_at: '2026-03-01',
    },
    {
      identity_id: 'svc-legacy-export',
      permission: 'export:finance-report',
      grant_type: 'contractor_prod_db_access',
      granted_at: '2026-01-20',
    },
    {
      identity_id: 'svc-backup',
      permission: 'write:s3-backup',
      grant_type: 'service_account_provisioning',
      granted_at: '2025-11-05',
    },
    {
      identity_id: 'svc-etl',
      permission: 'read:warehouse',
      grant_type: 'ci_deploy_key',
      granted_at: '2026-04-18',
    },
  ],
};
