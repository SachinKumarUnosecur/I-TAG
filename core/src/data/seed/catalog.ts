import type { SeedCatalog } from './fragment.js';

/**
 * Systems, permissions and grant patterns — the shared vocabulary of the demo.
 *
 * `creation_data_from` is each app's audit-retention floor. It is the difference
 * between "nobody created this" and "we cannot see who created this", and
 * `docs/PRD-delegation-chain.md` §6.6 requires the second be shown as a data gap.
 * Two apps have no floor because their audit history is complete; the legacy
 * directory's floor is why its oldest accounts are unattributable.
 */
export const CATALOG: SeedCatalog = {
  apps: [
    { id: 'aws-iam', name: 'AWS IAM', creation_data_from: '2025-01-01' },
    { id: 'snowflake', name: 'Snowflake', creation_data_from: '2025-06-01' },
    { id: 'github', name: 'GitHub', creation_data_from: null },
    { id: 'mcp-gateway', name: 'MCP Gateway', creation_data_from: null },
    { id: 'idp-core', name: 'Corporate IdP', creation_data_from: '2025-03-01' },
    // Predates any usable audit trail, which is why its roots are unattributable.
    { id: 'legacy-ldap', name: 'Legacy LDAP', creation_data_from: '2019-01-01' },
    /**
     * Its own tenant rather than a row inside `idp-core`, because
     * `docs/delegation-chain-research.md` §8 gap 8 is that `PRD` §5's provider table
     * omits Entra service-principal and app-registration creation entirely, and the
     * canonical incident runs through exactly that object type. A gap closed only in
     * prose is a gap; this is the app whose data closes it.
     *
     * The floor is the date diagnostic settings were pointed at Log Analytics, which
     * is the whole counterfactual: Entra's own `directoryAudit` retention is 7 days
     * on the free tier and 30 on P1 (§3.2), so an estate that did not export gets
     * nothing. Everything created after this date here is attributable.
     */
    { id: 'entra-tenant', name: 'Microsoft Entra ID', creation_data_from: '2024-01-01' },
  ],

  /**
   * `sensitive` is what turns a list of orphans into a queue: severity ranks by
   * reachable sensitive access first (§4.3), so these eight permissions decide
   * which handful of rows a reviewer sees at the top. Each one is unmistakably
   * production-facing, so "this agent can reach that" needs no explanation.
   */
  permissions: [
    { id: 'read:finance-db' },
    { id: 'export:finance-report', sensitive: true },
    { id: 'export:payroll-file', sensitive: true },
    { id: 'read:payments-ledger' },
    { id: 'write:invoice-queue' },
    { id: 'write:s3-backup' },
    { id: 'mcp:gmail-read' },
    { id: 'mcp:notion-write' },
    { id: 'mcp:prod-db-query', sensitive: true },
    { id: 'mcp:crm-write' },
    { id: 'mcp:sheets-read' },
    { id: 'mcp:drive-read' },
    { id: 'read:warehouse' },
    { id: 'write:warehouse' },
    { id: 'admin:warehouse', sensitive: true },
    { id: 'write:search-index' },
    { id: 'deploy:staging' },
    { id: 'deploy:prod', sensitive: true },
    { id: 'read:metrics' },
    { id: 'read:billing' },
    { id: 'read:dashboards' },
    { id: 'read:repo-metadata' },
    { id: 'admin:platform', sensitive: true },
    { id: 'admin:prod-database', sensitive: true },
    { id: 'vpn:corp-network', sensitive: true },
    { id: 'read:ldap-directory' },
    { id: 'read:fileshare' },
    { id: 'read:mailroom' },
    { id: 'sso:corp-login' },
    { id: 'read:hris-feed' },
    { id: 'read:directory-metadata' },
    /**
     * The consent the Midnight Blizzard chain ends in.
     *
     * Sensitive, and held by the *created* account rather than by its creator — which
     * is the point of the beat: the creator's own access is unremarkable, so no
     * access-based ranking reaches it, and only the creation act does.
     */
    { id: 'admin:exchange-mailboxes', sensitive: true },
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
    {
      grant_type: 'vpn_remote_access',
      median_days_to_actual_need: 30,
      median_days_to_revocation: 180,
      sample_size: 9,
    },
  ],
};
