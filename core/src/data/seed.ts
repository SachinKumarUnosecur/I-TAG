import type { IdentityDataset } from '../domain/types.js';

/**
 * Static seed dataset — `docs/ITAG.md` §9 Step 1.
 *
 * Held as a typed module rather than a `.json` file (which §4 F1 suggests) so the
 * literal is checked against `IdentityDataset` at compile time. Intent is
 * unchanged: one static dataset, loaded once into memory, no database.
 *
 * Lineage is stored per app and left unmerged (§4.2), so most chains sit inside a
 * single app. The canonical chain deliberately does not: agent-report lives in
 * mcp-gateway while its provisioner lives in aws-iam, which puts one edge into
 * `graph.crossAppEdges`. That edge is the whole point — each app holds a fragment
 * that looks unremarkable alone, and the accountability finding only appears once
 * the fragments are joined.
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
  apps: [
    // `creation_data_from` is the audit-retention floor: identities created before
    // it have no recoverable provisioner, which must read as a data gap rather
    // than as "nobody owns this".
    { id: 'aws-iam', name: 'AWS IAM', creation_data_from: '2025-01-01' },
    { id: 'snowflake', name: 'Snowflake', creation_data_from: '2025-06-01' },
    { id: 'github', name: 'GitHub', creation_data_from: null },
    { id: 'mcp-gateway', name: 'MCP Gateway', creation_data_from: null },
    // Predates any usable audit trail, which is why its roots are unattributable.
    { id: 'legacy-ldap', name: 'Legacy LDAP', creation_data_from: '2019-01-01' },
  ],

  identities: [
    // --- Canonical demo chain: departed owner, escalation via group ---------
    {
      id: 'user-alice',
      type: 'human',
      name: 'Alice Chen',
      app: 'aws-iam',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-backup'],
      provisioned_by: null,
    },
    {
      id: 'svc-backup',
      type: 'service_account',
      name: 'backup-service',
      app: 'aws-iam',
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
      // Registered in the agent gateway, not in the cloud account that spawned it.
      // This is the seed's one cross-app creation edge.
      app: 'mcp-gateway',
      direct_grants: ['mcp:gmail-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-backup',
      revoked: false,
    },

    // --- Role-changed owner, same app so it shares group-eng ----------------
    {
      id: 'user-carol',
      type: 'human',
      name: 'Carol Dsouza',
      app: 'aws-iam',
      direct_grants: ['deploy:staging'],
      inherited_from: [],
      delegates_to: ['svc-deploy'],
      provisioned_by: null,
    },
    {
      id: 'svc-deploy',
      type: 'service_account',
      name: 'deploy-bot',
      app: 'aws-iam',
      direct_grants: ['deploy:prod'],
      inherited_from: ['group-eng'],
      delegates_to: [],
      provisioned_by: 'user-carol',
    },

    // --- Second departed employee with a live sensitive footprint (F11) -----
    {
      id: 'user-erin',
      type: 'human',
      name: 'Erin Blake',
      app: 'aws-iam',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: ['svc-legacy-export'],
      provisioned_by: null,
    },
    {
      id: 'svc-legacy-export',
      type: 'service_account',
      name: 'legacy-export',
      app: 'aws-iam',
      direct_grants: ['export:finance-report'],
      inherited_from: ['group-finance'],
      delegates_to: [],
      provisioned_by: 'user-erin',
      revoked: false,
    },
    {
      id: 'group-eng',
      type: 'group',
      name: 'Engineering',
      app: 'aws-iam',
      direct_grants: ['mcp:notion-write'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },
    {
      id: 'group-finance',
      type: 'group',
      name: 'Finance',
      app: 'aws-iam',
      direct_grants: ['read:finance-db', 'export:finance-report'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },

    // --- Stale-review chain: owner still employed, never re-reviewed --------
    {
      id: 'user-bob',
      type: 'human',
      name: 'Bob Iyer',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: [],
      delegates_to: ['svc-etl'],
      provisioned_by: null,
    },
    {
      id: 'svc-etl',
      type: 'service_account',
      name: 'etl-runner',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: ['group-data'],
      delegates_to: ['agent-analytics'],
      provisioned_by: 'user-bob',
    },
    {
      id: 'agent-analytics',
      type: 'ai_agent',
      name: 'analytics-agent',
      app: 'snowflake',
      direct_grants: ['mcp:sheets-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-etl',
    },
    {
      id: 'group-data',
      type: 'group',
      name: 'Data Platform',
      app: 'snowflake',
      direct_grants: ['write:warehouse', 'admin:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
    },

    // --- Healthy baseline: active owner, recently reviewed, team-owned -------
    {
      id: 'user-dan',
      type: 'human',
      name: 'Dan Ferreira',
      app: 'github',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: ['svc-monitor'],
      provisioned_by: null,
    },
    {
      id: 'svc-monitor',
      type: 'service_account',
      name: 'monitor-agent',
      app: 'github',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-dan',
    },

    // --- Non-human root: nobody ever owned this branch ----------------------
    {
      id: 'svc-systemroot',
      type: 'service_account',
      name: 'platform-bootstrap',
      app: 'legacy-ldap',
      direct_grants: ['admin:platform'],
      inherited_from: [],
      delegates_to: ['agent-legacy-sweeper'],
      provisioned_by: null,
    },
    {
      id: 'agent-legacy-sweeper',
      type: 'ai_agent',
      name: 'legacy-sweeper-agent',
      app: 'legacy-ldap',
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
      app: 'legacy-ldap',
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
      app: 'legacy-ldap',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-b'],
      provisioned_by: 'svc-fixture-cycle-b',
    },
    {
      id: 'svc-fixture-cycle-b',
      type: 'service_account',
      name: 'cycle-probe-b',
      app: 'legacy-ldap',
      direct_grants: [],
      inherited_from: [],
      delegates_to: ['svc-fixture-cycle-a'],
      provisioned_by: 'svc-fixture-cycle-a',
    },
  ],

  employee_status: {
    // `effective_from` is when the person actually left or moved, so SLA age is
    // measured from the event rather than from whenever a scan noticed it.
    'user-alice': { status: 'departed', last_reviewed: '2026-06-01', effective_from: '2026-06-15' },
    'user-bob': { status: 'active', last_reviewed: '2026-01-15' },
    'user-carol': {
      status: 'role_changed',
      last_reviewed: '2026-05-20',
      effective_from: '2026-05-25',
    },
    'user-dan': { status: 'active', last_reviewed: '2026-07-10' },
    'user-erin': { status: 'departed', last_reviewed: '2026-02-02', effective_from: '2026-03-10' },
  },

  teams: [
    {
      id: 'team-platform',
      name: 'Platform Engineering',
      members: ['user-dan'],
      owns_group: 'group-eng',
    },
    { id: 'team-data', name: 'Data Platform', members: ['user-bob'], owns_group: 'group-data' },
    // Every member has departed, so this team cannot carry accountability even
    // though an owner record still names it.
    { id: 'team-finance-ops', name: 'Finance Operations', members: ['user-erin'] },
  ],

  owner_assignments: [
    // Healthy: team-owned, named backup, recently attested.
    {
      identity_id: 'svc-monitor',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      backup_id: 'user-dan',
      attested_at: '2026-07-05',
    },
    // Owner record exists but the owning team has no remaining active member.
    {
      identity_id: 'svc-legacy-export',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-finance-ops',
      attested_at: '2025-09-01',
    },
    // Named individual, departed, and never attested.
    {
      identity_id: 'svc-backup',
      app: 'aws-iam',
      owner_kind: 'user',
      owner_id: 'user-alice',
    },
  ],

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
