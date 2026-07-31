import { cluster } from './fragment.js';

/**
 * BEATS 6 and 8 — missing evidence is not evidence of an orphan.
 *
 * §4.6 states the non-negotiable rule: `unknown` must be structurally separate
 * from `unowned` and must never appear in the finding count. Reporting an
 * audit-retention gap as an orphan is the single fastest way this class of feature
 * loses analyst trust — the customer already knows their old directory has no
 * usable audit trail, and a tool that bills that as 3 findings has just told them
 * it does not understand their estate.
 *
 * BEAT 6: three legacy-directory accounts created before that app's creation data
 * begins (2019-01-01). No creator is recoverable, so no owner can be asserted.
 * They resolve to `unknown` / `outside_audit_window` with `counted: false`, and
 * they must render visibly differently from a real finding — a data-gap badge, not
 * a severity. Presenting them as a cluster is deliberate: §6.6 of the delegation
 * PRD asks for a per-app "creation data available from" banner precisely so a
 * cluster like this is read as a retention artefact.
 *
 * BEAT 8: `svc-hr-sync` is SSO-federated. It has no creator in this app's log
 * *by design*, because it was provisioned outside the app — also `unknown`, for a
 * structurally different reason.
 *
 * The contrast row is `agent-legacy-sweeper`, whose lineage *is* recoverable and
 * terminates at a non-human root. That is a real finding: no person ever owned it.
 * "We cannot see who owned this" and "nobody ever owned this" sit next to each
 * other here on purpose, one counted and one not.
 */
export const DATA_GAPS = cluster({
  identities: [
    // BEAT 6 — created 2018, audit data starts 2019. Unknowable, not unowned.
    {
      id: 'svc-systemroot',
      type: 'service_account',
      name: 'platform-bootstrap',
      app: 'legacy-ldap',
      direct_grants: ['admin:platform'],
      inherited_from: [],
      delegates_to: ['agent-legacy-sweeper'],
      provisioned_by: null,
      created_at: '2018-03-14', // predates legacy-ldap creation_data_from (2019-01-01)
      last_activity_at: '2026-07-15',
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-ldap-batch-sync',
      type: 'service_account',
      name: 'nightly-batch-sync',
      app: 'legacy-ldap',
      direct_grants: ['read:ldap-directory'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2017-11-08',
      last_activity_at: '2026-07-23',
      provisioning_source: 'app_native',
    },
    {
      id: 'svc-ldap-print-spool',
      type: 'service_account',
      name: 'print-spool-reader',
      app: 'legacy-ldap',
      direct_grants: ['read:ldap-directory'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2016-06-21',
      // Dormant for over seven years and still not a finding, because we cannot
      // say who owned it. The inactivity report is where this one belongs.
      last_activity_at: '2019-04-02',
      provisioning_source: 'bulk_import',
    },

    // BEAT 8 — federated in from the HR system, so this app never saw a creator.
    {
      id: 'svc-hr-sync',
      type: 'service_account',
      name: 'hris-directory-sync',
      app: 'idp-core',
      direct_grants: ['read:hris-feed'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-04-18',
      last_activity_at: '2026-07-30',
      provisioning_source: 'sso_federated',
    },

    /**
     * The contrast row. Lineage resolves cleanly and terminates at a service
     * account, so this is not a data gap — it is an agent that no human has ever
     * been accountable for. Counted, and the remediation is to assign an owner
     * rather than to go looking for a lost record.
     */
    {
      id: 'agent-legacy-sweeper',
      type: 'ai_agent',
      name: 'legacy-sweeper-agent',
      app: 'legacy-ldap',
      direct_grants: ['mcp:drive-read'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: 'svc-systemroot',
      created_at: '2024-08-19', // 711 days, far past the 14-day ai_agent SLA
      last_activity_at: '2026-07-11',
      provisioning_source: 'app_native',
    },
  ],
});
