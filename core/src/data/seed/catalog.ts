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
   * reachable sensitive access first (§4.3), so the nine permissions flagged below
   * decide which handful of rows a reviewer sees at the top. Each one is
   * unmistakably production-facing, so "this agent can reach that" needs no
   * explanation.
   *
   * **The flag is tri-state, and the third state is load bearing.**
   * `docs/identity-exposure-map-research.md` §4.2 reads `true` as sensitive,
   * `false` as *confirmed* not sensitive, and an omitted key as **unclassified** —
   * "nobody has assessed this", which is a different claim from "this is safe".
   * `graph/build.ts` only ever tests `sensitive === true`, so ownership severity
   * and Access Discovery cannot tell `false` from absent and are unaffected; only
   * Exposure Map reads the distinction, and it excludes `unclassified` from the
   * weighted score rather than guessing a tier for it.
   *
   * The precedent is the providers' own. Amazon Macie reserves sensitivity score
   * 50 for "not yet analyzed", between 1-49 "not sensitive" and 51-99 "sensitive";
   * Microsoft Defender for Cloud carries "Not evaluated" alongside its four risk
   * levels. Neither collapses absence of assessment into a tier, and neither does
   * this table — which is why every permission that has genuinely been reviewed
   * carries an explicit `false` rather than relying on omission to mean it.
   */
  permissions: [
    { id: 'read:finance-db', sensitive: false },
    { id: 'export:finance-report', sensitive: true },
    { id: 'export:payroll-file', sensitive: true },
    { id: 'read:payments-ledger', sensitive: false },
    { id: 'write:invoice-queue', sensitive: false },
    { id: 'write:s3-backup', sensitive: false },
    { id: 'mcp:gmail-read', sensitive: false },
    { id: 'mcp:notion-write', sensitive: false },
    { id: 'mcp:prod-db-query', sensitive: true },
    { id: 'mcp:crm-write', sensitive: false },
    { id: 'mcp:sheets-read', sensitive: false },
    { id: 'mcp:drive-read', sensitive: false },
    { id: 'read:warehouse', sensitive: false },
    { id: 'write:warehouse', sensitive: false },
    { id: 'admin:warehouse', sensitive: true },
    { id: 'write:search-index', sensitive: false },
    { id: 'deploy:staging', sensitive: false },
    { id: 'deploy:prod', sensitive: true },
    { id: 'read:metrics', sensitive: false },
    { id: 'read:billing', sensitive: false },
    { id: 'read:dashboards', sensitive: false },
    { id: 'read:repo-metadata', sensitive: false },
    { id: 'admin:platform', sensitive: true },
    { id: 'admin:prod-database', sensitive: true },
    { id: 'vpn:corp-network', sensitive: true },
    { id: 'read:ldap-directory', sensitive: false },
    { id: 'read:fileshare', sensitive: false },
    { id: 'read:mailroom', sensitive: false },
    { id: 'sso:corp-login', sensitive: false },
    { id: 'read:hris-feed', sensitive: false },
    { id: 'read:directory-metadata', sensitive: false },
    /**
     * The consent the Midnight Blizzard chain ends in.
     *
     * Sensitive, and held by the *created* account rather than by its creator — which
     * is the point of the beat: the creator's own access is unremarkable, so no
     * access-based ranking reaches it, and only the creation act does.
     */
    { id: 'admin:exchange-mailboxes', sensitive: true },

    /**
     * The two hop edges — `docs/PRD-access-discovery.md` L58.
     *
     * Neither is sensitive on its own, and that is the whole point: what makes the
     * first one dangerous is not the permission but the principal on the other side
     * of it. A ranking that reads only the grant sees an SSM session and a CI
     * assume-role, which is why §1 says native tooling misses this entirely.
     */
    { id: 'ssm:session-deploy-box', sensitive: false, grants_identity: 'role-deploy-box' },
    { id: 'ci:assume-build-agent', sensitive: false, grants_identity: 'role-build-agent' },

    /**
     * The two rungs of the transitive chain — `PRD` §8's first open question.
     *
     * §8 asks whether a chain through *several* resources generalizes. It does,
     * and these are what make that answerable on screen rather than in a fixture:
     * the runbook host carries a principal that can itself connect to the warehouse
     * host, which carries another. Both rungs read as ordinary connect grants, and
     * the second one is held by a role rather than by a person, which is why no
     * review of human entitlements has ever seen it.
     */
    { id: 'mcp:connect-prod-runbook', sensitive: false, grants_identity: 'role-runbook-executor' },
    { id: 'mcp:connect-warehouse-box', sensitive: false, grants_identity: 'role-warehouse-admin' },

    /**
     * Beat 24 — the analyst's breadth, held directly.
     *
     * Twenty-eight read grants that are individually unarguable. Every one of them
     * was approved by somebody who was right to approve it, which is the property
     * that makes the beat work: there is no negligence to point at, and the finding
     * is the *shape* of the total rather than any row in it.
     *
     * Named individually rather than generated, because a reviewer has to be able
     * to read the list and agree that nothing in it is alarming — a loop emitting
     * `read:dataset-${n}` would prove the count and prove nothing about the claim.
     */
    { id: 'read:dashboard-revenue', sensitive: false },
    { id: 'read:dashboard-churn', sensitive: false },
    { id: 'read:dashboard-pipeline', sensitive: false },
    { id: 'read:dashboard-support-sla', sensitive: false },
    { id: 'read:dashboard-marketing-spend', sensitive: false },
    { id: 'read:dashboard-headcount', sensitive: false },
    { id: 'read:report-quarterly-close', sensitive: false },
    { id: 'read:report-cohort-retention', sensitive: false },
    { id: 'read:report-nps', sensitive: false },
    { id: 'read:report-campaign-attribution', sensitive: false },
    { id: 'read:dataset-web-events', sensitive: false },
    { id: 'read:dataset-mobile-events', sensitive: false },
    { id: 'read:dataset-billing-summary', sensitive: false },
    { id: 'read:dataset-subscription-history', sensitive: false },
    { id: 'read:dataset-support-tickets', sensitive: false },
    { id: 'read:dataset-product-usage', sensitive: false },
    { id: 'read:dataset-experiment-results', sensitive: false },
    { id: 'read:dataset-inventory-snapshot', sensitive: false },
    { id: 'read:dataset-shipping-times', sensitive: false },
    { id: 'read:dataset-vendor-catalog', sensitive: false },
    { id: 'read:lookup-currency-rates', sensitive: false },
    { id: 'read:lookup-tax-jurisdictions', sensitive: false },
    { id: 'read:lookup-country-codes', sensitive: false },
    { id: 'read:lookup-product-taxonomy', sensitive: false },
    { id: 'read:notebook-templates', sensitive: false },
    { id: 'read:query-history', sensitive: false },
    { id: 'read:schema-catalog', sensitive: false },
    { id: 'read:job-run-status', sensitive: false },

    /**
     * Beat 24 — the same breadth, arriving through a group.
     *
     * Split from the block above so the identity's footprint is not uniformly
     * `direct`: twelve of its forty paths are `indirect`, which is what a real
     * analyst's entitlements look like and what keeps the ring map from rendering
     * a single undifferentiated circle.
     */
    { id: 'read:warehouse-staging-tables', sensitive: false },
    { id: 'read:warehouse-marts', sensitive: false },
    { id: 'read:warehouse-dbt-docs', sensitive: false },
    { id: 'read:bi-workspace-shared', sensitive: false },
    { id: 'read:bi-workspace-archive', sensitive: false },
    { id: 'read:bi-scheduled-exports', sensitive: false },
    { id: 'read:metrics-definitions', sensitive: false },
    { id: 'read:metrics-lineage', sensitive: false },
    { id: 'read:data-quality-checks', sensitive: false },
    { id: 'read:data-freshness-status', sensitive: false },
    { id: 'read:glossary-business-terms', sensitive: false },
    { id: 'read:access-request-history', sensitive: false },

    /**
     * Beat 26 — the six permissions nobody has classified.
     *
     * `sensitive` is **omitted, not false**, and that is the entire beat. A partner
     * integration's scopes arrived with the integration; no data-classification
     * process has ever looked at them, and `docs/identity-exposure-map-research.md`
     * §3.2 establishes why that is the normal case rather than an oversight — every
     * provider mechanism classifies a storage container, and none of them has a key
     * that joins to a capability like these.
     *
     * Exposure Map excludes them from the weighted score and reports them as a
     * completeness figure. It does not default them to Medium: a score that rises
     * because the *registry* degraded is one no reviewer can act on.
     */
    { id: 'partner:webhook-replay' },
    { id: 'partner:sandbox-export' },
    { id: 'partner:catalog-sync' },
    { id: 'partner:invoice-callback' },
    { id: 'partner:audit-feed' },
    { id: 'partner:credential-rotate' },

    /**
     * Beat 27 — the third hop edge, and the one that shares its destination.
     *
     * `write:invoice-queue` is already reachable through `group-finance-ops` as an
     * ordinary two-edge membership. This binding gives the same permission a second
     * route through a role, so one identity reaches one permission by both an
     * `indirect` and a `hop` path — the case `PRD` §8's second open question asks
     * about and the only one the estate could not previously demonstrate.
     */
    { id: 'connect:ledger-writer', sensitive: false, grants_identity: 'role-ledger-writer' },

    /**
     * Beats 29-31 — the release chain, and the second app pair a choke point needs.
     *
     * `docs/unified-impact-analysis-research.md` §8 gap 1: the estate's only
     * multi-stage pivot ran `mcp-gateway → snowflake`, so a candidate ranking
     * computed over it had exactly one two-stage chain to rank and could not
     * demonstrate that the selector compares *unrelated* chains rather than walking
     * the only one it has. These two bindings put a second two-stage chain in
     * `github → aws-iam`, terminating in a sensitive permission the catalogue
     * already carries.
     *
     * The first binding is the shared one. Two service accounts that have nothing
     * else in common both hold `gh:connect-release-runner` directly, which is what
     * gives severing it a blast radius larger than either account — the property
     * §4.4 selects on, and the one an appearance-frequency count gets wrong.
     */
    { id: 'gh:connect-release-runner', sensitive: false, grants_identity: 'role-release-runner' },
    { id: 'gh:connect-artifact-signer', sensitive: false, grants_identity: 'role-artifact-signer' },

    /** An ordinary grant, so the release orchestrator is not a bare pivot. */
    { id: 'read:release-notes', sensitive: false },
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
