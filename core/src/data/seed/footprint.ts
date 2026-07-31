import { cluster } from './fragment.js';

/**
 * BEATS 2, 3 and 9a — the transitive chain, and the one thing a flat owner tag
 * cannot produce.
 *
 * `docs/ITAG.md` §6's canonical chain, extended one hop. Alice departed 46 days
 * ago; her account is still enabled; the service account she created still runs;
 * the agent that service account spawned can query the production database; and
 * that agent has since spawned an agent of its own.
 *
 *   user-alice (departed) -> svc-backup -> agent-report -> agent-crm-writer
 *
 * BEAT 2: three live hops from a departed human, with `mcp:prod-db-query` at hop
 * two. §3.4 puts transitive multi-hop lineage among only two things in this market
 * that are not already commoditized — every competitor resolves one hop or a flat
 * tag. The sweep reports max_hops 3 and crosses_apps true.
 *
 * BEAT 3: `agent-crm-writer.provisioned_by` is another AI agent, not a human or a
 * service account. Unosecur ships an MCP Gateway for agent identities, and §9
 * lists agent-spawned-agent ownership as an open question — this row makes that
 * question concrete rather than theoretical: the chain resolves to Alice three
 * hops back, and there is no rule anywhere that says an ephemeral agent inherits
 * its spawner's owner.
 *
 * BEAT 9a: `svc-backup` is `ambiguous`. An explicit owner record names Alice while
 * group-eng membership names Platform Engineering — two high-confidence signals
 * that disagree, which is a different finding from having no owner, and is the
 * Owned / Orphaned / Ambiguous vocabulary Veza already ships (§3.1).
 *
 * Evidences NIST SP 800-53 AC-2(4) (audit account creation) and SOC 2 CC6.2.
 */
export const FOOTPRINT = cluster({
  identities: [
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
      created_at: '2025-03-19',
      last_activity_at: '2026-07-29',
      provisioning_source: 'app_native',
    },
    {
      id: 'agent-report',
      type: 'ai_agent',
      name: 'report-agent',
      // Registered in the agent gateway, not in the cloud account that spawned it.
      app: 'mcp-gateway',
      // `mcp:prod-db-query` is the permission that makes this the second-worst row
      // in the dataset: an agent two hops from a departed employee, reading
      // production. `mcp:notion-write` arrives through group-agent-tools and was
      // never granted to it directly — the F3 escalation.
      direct_grants: ['mcp:gmail-read', 'mcp:prod-db-query'],
      inherited_from: ['group-agent-tools'],
      delegates_to: ['agent-crm-writer'],
      provisioned_by: 'svc-backup',
      revoked: false,
      created_at: '2025-11-08',
      last_activity_at: '2026-07-30',
      provisioning_source: 'app_native',
    },
    {
      id: 'agent-crm-writer',
      type: 'ai_agent',
      name: 'crm-writer-agent',
      app: 'mcp-gateway',
      direct_grants: ['mcp:crm-write'],
      inherited_from: [],
      delegates_to: [],
      // Spawned by another agent at runtime. Nobody signed off on this identity
      // existing, and no owner record was created for it.
      provisioned_by: 'agent-report',
      revoked: false,
      created_at: '2026-04-22',
      last_activity_at: '2026-07-28',
      provisioning_source: 'app_native',
    },
  ],

  owner_assignments: [
    /**
     * BEAT 9a. Names Alice, who has left. It is not read as `owner_departed`,
     * because group-eng simultaneously implies Platform Engineering owns this —
     * disagreement outranks either verdict, since we cannot say which record is
     * wrong until somebody settles it.
     */
    {
      identity_id: 'svc-backup',
      app: 'aws-iam',
      owner_kind: 'user',
      owner_id: 'user-alice',
    },
  ],

  // F9 — clean permissions, eroded protection. Independent of everything above.
  control_history: [
    {
      identity_id: 'svc-backup',
      events: [
        { control: 'mfa_enabled', change: 'disabled', date: '2026-04-10' }, // 112 days
        {
          control: 'conditional_access',
          change: 'exception_granted',
          date: '2026-05-02', // 90 days, exactly on the review floor
          note: 'temporary - VPN issue',
        },
      ],
    },
  ],

  grant_records: [
    {
      identity_id: 'svc-backup',
      permission: 'write:s3-backup',
      grant_type: 'service_account_provisioning',
      granted_at: '2025-11-05',
    },
  ],
});
