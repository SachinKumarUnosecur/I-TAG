import { cluster } from './fragment.js';

/**
 * BEATS 9b, 10 and 12 — one clean example of every reason code.
 *
 * The reason code is what a reviewer acts on: `owner_departed` means find a new
 * owner, `creator_deactivated` means assign one for the first time, `unowned`
 * means decide whether this should exist at all. A single "orphaned" boolean
 * collapses three different Monday mornings into one word (§3.1).
 *
 * The distinction the doc is most insistent about is the first two rows here:
 *
 *   `owner_departed`      an explicit owner record names a person who has left.
 *                         Somebody accepted accountability and then went away.
 *   `creator_deactivated` no owner was ever assigned; accountability fell back to
 *                         the creation record, and that creator has now left. This
 *                         identity never had an owner, only a provenance fact that
 *                         has expired.
 *
 * BEAT 12 is the matched pair `svc-batch-recon` / `svc-quarter-close`: identical
 * shape, identical reason, 40 days versus 5 days past the owner's departure against
 * a 14-day service-account SLA. One breaches, one does not, and the difference is
 * visible as `critical` versus `high`. That is what makes MTTR meaningful, and it
 * only works because the clock runs from `effective_from` rather than from when a
 * scan noticed.
 *
 * BEAT 9b is `svc-index-builder`: an explicit record names Payments Platform while
 * group-search-index implies Search & Discovery — team versus team, both high
 * confidence, neither dismissible.
 *
 * Evidences NIST SP 800-53 AC-2(3) (separation, role change and inactivity are all
 * triggers), ISO 27001:2022 A.5.16 and SOC 2 CC6.3.
 */
export const REASON_MATRIX = cluster({
  identities: [
    // owner_team_vacant — the owner record names a team whose whole roster left.
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
      created_at: '2025-01-22',
      last_activity_at: '2026-07-28',
      provisioning_source: 'app_native',
    },

    // owner_departed — Heidi created it, Nadia owned it, Nadia left 40 days ago.
    {
      id: 'svc-payroll-export',
      type: 'service_account',
      name: 'payroll-export',
      app: 'aws-iam',
      direct_grants: ['export:payroll-file'],
      inherited_from: ['group-finance'],
      delegates_to: [],
      provisioned_by: 'user-heidi',
      revoked: false,
      created_at: '2025-12-01',
      last_activity_at: '2026-07-24',
      provisioning_source: 'app_native',
    },

    // owner_role_changed — still employed, no longer in this domain.
    {
      id: 'svc-staging-seed',
      type: 'service_account',
      name: 'staging-data-seeder',
      app: 'aws-iam',
      direct_grants: ['deploy:staging'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-05-16',
      last_activity_at: '2026-07-20',
      provisioning_source: 'app_native',
    },

    // owner_never_attested — a name on a record nobody ever confirmed.
    {
      id: 'svc-cost-report',
      type: 'service_account',
      name: 'cost-report-builder',
      app: 'github',
      direct_grants: ['read:billing'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2026-03-15', // 138 days, the age the finding reports
      last_activity_at: '2026-07-28',
      provisioning_source: 'app_native',
    },

    // owner_attestation_stale — a real team owns it and last confirmed 102 days ago.
    {
      id: 'svc-warehouse-loader',
      type: 'service_account',
      name: 'warehouse-loader',
      app: 'snowflake',
      direct_grants: ['write:warehouse'],
      inherited_from: ['group-data'],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2025-07-09',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },

    // BEAT 12a — creator_deactivated, 40 days past departure, breaches the SLA.
    // Grants are held identical to `svc-quarter-close` below, directly rather than
    // through `group-finance`, so the pair differs in exactly one column on screen
    // and the F11 sweep (which reads direct grants) agrees with the queue (which
    // reads effective access) about how dangerous each one is.
    {
      id: 'svc-batch-recon',
      type: 'service_account',
      name: 'batch-reconciler',
      app: 'aws-iam',
      direct_grants: ['export:finance-report', 'read:payments-ledger'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-nadia',
      revoked: false,
      created_at: '2026-01-05',
      last_activity_at: '2026-07-22',
      provisioning_source: 'app_native',
    },

    // BEAT 12b — same reason, same sensitivity, 5 days. Still inside the SLA.
    {
      id: 'svc-quarter-close',
      type: 'service_account',
      name: 'quarter-close-runner',
      app: 'aws-iam',
      direct_grants: ['export:finance-report', 'read:payments-ledger'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'user-omar',
      revoked: false,
      created_at: '2026-02-18',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },

    // BEAT 9b — conflicting_owner_signals, team versus team.
    {
      id: 'svc-index-builder',
      type: 'service_account',
      name: 'search-index-builder',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: ['group-search-index'],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2026-05-12',
      last_activity_at: '2026-07-25',
      provisioning_source: 'app_native',
    },

    /**
     * no_owner_on_record — self-registered through an OAuth "sign up" flow, so it
     * is neither a root account nor a lost record. `docs/PRD-delegation-chain.md`
     * §8 lists this as an open classification question; the engine currently reads
     * it as a genuine orphan, which is the answer worth arguing about on stage.
     */
    {
      id: 'svc-oauth-dashboards',
      type: 'service_account',
      name: 'dashboards-oauth-app',
      app: 'github',
      direct_grants: ['read:dashboards'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      revoked: false,
      created_at: '2026-01-30', // 182 days
      last_activity_at: '2026-07-19',
      provisioning_source: 'self_registered',
    },

    /**
     * The F5 v1 stale-review chain, and a second reading of the same fact.
     * `svc-etl` is green: Data Platform owns group-data and has a live member.
     * `agent-analytics` is not, because its only ownership signal is the creation
     * fallback to Bob, and the only attestation a fallback has is Bob's access
     * review — 197 days old, past the 90-day floor.
     */
    {
      id: 'svc-etl',
      type: 'service_account',
      name: 'etl-runner',
      app: 'snowflake',
      direct_grants: ['read:warehouse'],
      inherited_from: ['group-data'],
      delegates_to: ['agent-analytics'],
      provisioned_by: 'user-bob',
      revoked: false,
      created_at: '2025-06-20',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
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
      revoked: false,
      created_at: '2025-08-14',
      last_activity_at: '2026-07-29',
      provisioning_source: 'app_native',
    },
  ],

  owner_assignments: [
    // Attested while the team still had a member; the last one left afterwards, so
    // the attestation date is when this ownership was last true.
    {
      identity_id: 'svc-legacy-export',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-finance-ops',
      attested_at: '2026-05-20', // 72 days
    },
    {
      identity_id: 'svc-payroll-export',
      app: 'aws-iam',
      owner_kind: 'user',
      owner_id: 'user-nadia',
      attested_at: '2026-05-10', // 82 days -> inside the attestation window, so the
      // finding is her departure rather than a stale attestation
    },
    {
      identity_id: 'svc-staging-seed',
      app: 'aws-iam',
      owner_kind: 'user',
      owner_id: 'user-carol',
      attested_at: '2026-06-01', // 60 days
    },
    // No attested_at at all: on record, never confirmed.
    {
      identity_id: 'svc-cost-report',
      app: 'github',
      owner_kind: 'user',
      owner_id: 'user-heidi',
      backup_id: 'user-dan',
    },
    {
      identity_id: 'svc-warehouse-loader',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-data',
      backup_id: 'user-bob',
      attested_at: '2026-04-20', // 102 days -> past the 90-day attestation floor
    },
    // BEAT 9b — disagrees with group-search-index, which Search & Discovery owns.
    {
      identity_id: 'svc-index-builder',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-payments',
      attested_at: '2026-07-06', // 25 days, so neither signal is stale
    },
  ],

  control_history: [
    {
      identity_id: 'svc-etl',
      events: [
        {
          control: 'session_timeout',
          change: 'extended',
          date: '2026-06-15', // 46 days
          note: 'long-running batch jobs',
        },
      ],
    },
  ],

  grant_records: [
    {
      identity_id: 'svc-legacy-export',
      permission: 'export:finance-report',
      grant_type: 'contractor_prod_db_access',
      granted_at: '2026-01-20',
    },
    {
      identity_id: 'svc-batch-recon',
      permission: 'export:finance-report',
      grant_type: 'contractor_prod_db_access',
      granted_at: '2026-01-05',
    },
    {
      identity_id: 'svc-quarter-close',
      permission: 'export:finance-report',
      grant_type: 'contractor_prod_db_access',
      granted_at: '2026-02-18',
    },
    {
      identity_id: 'svc-etl',
      permission: 'read:warehouse',
      grant_type: 'ci_deploy_key',
      granted_at: '2026-04-18',
    },
  ],
});
