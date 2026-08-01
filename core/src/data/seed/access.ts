import { cluster } from './fragment.js';

/**
 * Beats 19-23 — Access Discovery: the hop, the two rows it is not, and the chain.
 *
 * `docs/PRD-access-discovery.md` §1 rests the module on one claim: a user with no
 * admin policy anywhere in sight can still hold admin, by connecting through a
 * resource that carries a privileged identity. Nothing in the dataset could show
 * that before this cluster, because no permission bound to a principal.
 *
 * The load-bearing detail is that **every identity here is green**. Ownership
 * Assurance sees eight correctly owned accounts and puts none of them in the queue;
 * `ownership/reach.ts` walks `inherited_from` and `delegates_to` and reports that
 * `user-jane` reaches nothing sensitive. Both are right, and both miss the
 * escalation — which is the argument for the module. A hop that showed up as an
 * ownership finding anyway would prove nothing.
 *
 * Dates are measured back from the pinned demo instant
 * (`ITAG_NOW=2026-07-31T00:00:00Z`); each attestation states its day-delta against
 * the 90-day `staleAttestationDays` floor so no row here drifts into the queue.
 */
export const ACCESS = cluster({
  identities: [
    /**
     * Beat 19 — the resource's role, and the reason the hop is worth reporting.
     *
     * `admin:platform` sits here and nowhere near `user-jane`: no policy names her,
     * no group she belongs to carries it, and a native IAM policy viewer shows her
     * nothing (`PRD` L74). Owned, attested, and entirely unremarkable on its own.
     */
    {
      id: 'role-deploy-box',
      type: 'service_account',
      name: 'EC2 Instance Role — deploy-box',
      app: 'aws-iam',
      direct_grants: ['admin:platform'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-03-12',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 19 — Jane. `PRD` L72-76 verbatim, in this dataset's vocabulary.
     *
     * One unremarkable direct grant, one group membership, and one connect
     * permission onto the deploy box that somebody issued for a support task and
     * nobody revisited. Direct 2, indirect 1, hop 1 — and the hop is the only route
     * by which she holds production platform admin.
     */
    {
      id: 'user-jane',
      type: 'human',
      name: 'Jane Okafor',
      app: 'aws-iam',
      direct_grants: ['read:dashboards', 'ssm:session-deploy-box'],
      inherited_from: ['group-eng'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-04-02',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 20 — the first true negative: sensitive access, and correctly not a hop.
     *
     * Grace reaches `export:finance-report` through `group-finance`, which is
     * exactly the two-edge `MEMBER_OF → HAS_POLICY` shape of `PRD` L57. It is
     * sensitive, it is worth reviewing, and it is *indirect* — a module that painted
     * it red would be thresholding on sensitivity rather than on mechanism.
     */
    {
      id: 'user-grace',
      type: 'human',
      name: 'Grace Adeyemi',
      app: 'aws-iam',
      direct_grants: ['read:finance-db'],
      inherited_from: ['group-finance'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-05-19',
      last_activity_at: '2026-07-28',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 21 — the second true negative: a hop that is entirely legitimate.
     *
     * A CI runner assuming a build role is the designed behaviour of every
     * deployment pipeline ever written. It is reported as a hop, because it is one,
     * and it is green — the terminal permission is `deploy:staging`, which is not
     * sensitive, and both ends are owned by a live team. This is the row that proves
     * the module classifies a mechanism rather than scoring a shape.
     */
    {
      id: 'role-build-agent',
      type: 'service_account',
      name: 'Build Agent Role',
      app: 'aws-iam',
      direct_grants: ['deploy:staging'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-08-04',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'svc-ci-runner',
      type: 'service_account',
      name: 'CI Runner',
      app: 'aws-iam',
      direct_grants: ['ci:assume-build-agent', 'read:repo-metadata'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-08-04',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beats 22-23 — the agent chain, and the three things Jane's beat cannot show.
     *
     * Jane's path is one resource deep, held directly, inside one app. That proves
     * the mechanism and leaves three questions a reviewer will ask immediately:
     * what if the connect grant came from a group, what if the resource leads to
     * another resource, and does any of this cross a system boundary. This chain
     * answers all three at once, and it does it with a non-human identity — which
     * is the population the estate is 103 accounts of and the one nobody reviews.
     *
     *   agent-support-triage
     *     -MEMBER_OF->    group-oncall-agents
     *     -CAN_ACCESS->   mcp:connect-prod-runbook
     *     -ASSUMES_ROLE-> role-runbook-executor        (mcp-gateway)
     *     -CAN_ACCESS->   mcp:connect-warehouse-box
     *     -ASSUMES_ROLE-> role-warehouse-admin         (snowflake)
     *     -HAS_POLICY->   admin:warehouse
     *
     * Six edges, two systems, and the membership at the front is load-bearing:
     * `PRD` L99 says hop overrides indirect when a path contains both, and without
     * this row that rule is asserted only against a hand-built fixture.
     */
    {
      id: 'group-oncall-agents',
      type: 'group',
      name: 'On-call Agent Tooling',
      app: 'mcp-gateway',
      // The connect grant sits on the container rather than on the agent, which is
      // how it survives every review: nobody audits a group for what it can reach
      // *through* something, and the agent's own entitlement list is two rows long.
      direct_grants: ['mcp:connect-prod-runbook'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-01-14',
    },
    {
      id: 'agent-support-triage',
      type: 'ai_agent',
      name: 'Support Triage Agent',
      app: 'mcp-gateway',
      direct_grants: ['mcp:sheets-read'],
      inherited_from: ['group-oncall-agents'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-02-09',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'role-runbook-executor',
      type: 'service_account',
      name: 'Runbook Host Role',
      app: 'mcp-gateway',
      // Holds one sensitive permission and one connect grant. The second is what
      // turns a one-resource hop into a chain, and it is the unremarkable half.
      direct_grants: ['mcp:prod-db-query', 'mcp:connect-warehouse-box'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-01-14',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'role-warehouse-admin',
      type: 'service_account',
      name: 'Warehouse Host Role',
      app: 'snowflake',
      direct_grants: ['admin:warehouse'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-01-20',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 23b — hop AND unowned: the compound "Needs attention" case.
     *
     * Beats 19-23 keep every hop subject green on purpose so Access Discovery can
     * prove the mechanism without Ownership Assurance already screaming. That
     * leaves a gap the UI sort assumes exists and the seed never supplied: an
     * identity that both holds a hop-producing grant *and* has no owner on
     * record. Without this row, `needsAttention = hop || !owner` is an OR of two
     * conditions that never co-occur in real data, so its priority ordering is
     * unverified.
     *
     * Reuses `ssm:session-deploy-box` (catalog, beat 19) — no new permission
     * fragment. Deliberately absent from `owner_assignments` below. Created
     * 2026-05-01 → 91 days before `ITAG_NOW`, past the 14-day service_account SLA.
     */
    {
      id: 'svc-temp-ssm-bridge',
      type: 'service_account',
      name: 'Temporary SSM Bridge',
      app: 'aws-iam',
      direct_grants: ['ssm:session-deploy-box'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-05-01', // 91 days → past 14-day SA SLA
      last_activity_at: '2026-07-28', // 3 days
      provisioning_source: 'app_native',
    },
  ],

  /**
   * Both people are active and recently reviewed, so the creator fallback resolves
   * them to themselves and no attestation rule fires. Deliberate: the demo needs
   * Jane's hop to be the *only* thing wrong with her row.
   */
  employee_status: {
    'user-jane': { status: 'active', last_reviewed: '2026-07-15' }, // 16 days
    'user-grace': { status: 'active', last_reviewed: '2026-07-18' }, // 13 days
  },

  /** Attested well inside the 90-day floor, so these stay out of the queue. */
  owner_assignments: [
    {
      identity_id: 'role-deploy-box',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-20', // 11 days
    },
    {
      identity_id: 'role-build-agent',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-22', // 9 days
    },
    {
      identity_id: 'svc-ci-runner',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-22', // 9 days
    },
    /**
     * The agent chain is owned at every rung, by two different live teams.
     *
     * That is the uncomfortable part of beat 22 and the reason it is worth showing:
     * there is no negligence anywhere in this chain. Everybody attested, recently,
     * to the thing they are responsible for. Nobody owns the *composition*, because
     * no view in the estate renders it.
     */
    {
      identity_id: 'agent-support-triage',
      app: 'mcp-gateway',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-24', // 7 days
    },
    {
      identity_id: 'role-runbook-executor',
      app: 'mcp-gateway',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-24', // 7 days
    },
    {
      identity_id: 'role-warehouse-admin',
      app: 'snowflake',
      owner_kind: 'team',
      owner_id: 'team-data',
      attested_at: '2026-07-21', // 10 days
    },
  ],
});
