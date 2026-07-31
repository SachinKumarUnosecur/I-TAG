import { cluster } from './fragment.js';

/**
 * Beats 29-31 — Blast Radius: the estate a choke-point selector can be judged on.
 *
 * `docs/unified-impact-analysis-research.md` §8 gap 1 is a data gap rather than a
 * design one. Every mechanism the module needs already exists in the seed —
 * `PermissionRecord.grants_identity` binds a permission to a principal, and
 * `access/classify.ts` already walks the composition — but the *shape* of what it
 * walks made the module unprovable three separate ways:
 *
 *   1. `group-oncall-agents` had **one** member, so severing the grant that hangs
 *      off it removed one identity's access. A choke point that cuts one subject is
 *      indistinguishable from revoking that subject's grant directly, which is the
 *      thing every existing queue already tells you to do.
 *   2. The only two-stage chain in the estate was `mcp-gateway → snowflake`. With a
 *      single multi-stage chain to look at, a selector that ranks correctly and a
 *      selector that simply returns the deepest chain it can find produce the same
 *      answer, so the ranking is asserted against nothing.
 *   3. Every pivot binding was held by exactly one subject. Research §4.4 rejects
 *      appearance-frequency ranking precisely because it mistakes "named on many
 *      paths" for "closes many paths", and a dataset in which no binding is shared
 *      cannot tell the two apart.
 *
 * This cluster closes all three, and it does it without touching a single existing
 * identity: the three new on-call members join `group-oncall-agents` from this
 * file, so `seed/access.ts` and its beats are unchanged and the four ownership pins
 * and seven exposure scores stay exactly where they were.
 *
 * **Every identity here is green**, for the third time and for the same reason as
 * `seed/access.ts` and `seed/exposure.ts`. Impact is a property of correctly owned
 * access: the whole argument of the module is that no existing view flags any of
 * this, so a row that arrived pre-flagged would be arguing another module's case.
 *
 * Dates are measured back from the pinned demo instant
 * (`ITAG_NOW=2026-07-31T00:00:00Z`). `mcp-gateway` and `github` carry no
 * `creation_data_from` floor, so a null `provisioned_by` here cannot resolve to
 * `unknown`; the one `aws-iam` identity is created well after that app's
 * 2025-01-01 floor for the reason `seed/exposure.ts` states.
 */
export const IMPACT = cluster({
  identities: [
    /**
     * Beat 29 — the on-call rota, and the reason one grant is worth a whole beat.
     *
     * `group-oncall-agents` carries `mcp:connect-prod-runbook`, and through it the
     * six-edge chain that ends in `admin:warehouse` in another system. Beat 23
     * already shows that chain. What it cannot show is *how many principals stand
     * at the top of it*, because the group had one member — and "one agent can
     * reach the warehouse" is a row, not a blast radius.
     *
     * A rota is three or four principals by construction, so this is the ordinary
     * case rather than a contrived one. All three types stand in it deliberately:
     * severing one grant cuts a person, an agent and a service account at once,
     * which is the sentence the module exists to be able to say. A group of four
     * agents would read as an AI-governance beat and would let a CISO file the
     * finding under a programme they have not started yet.
     *
     * **None of the three holds a direct grant at all**, which is deliberate on two
     * counts. Their entire footprint — four reachable permissions, two of them
     * sensitive, in two systems — arrives through the rota, so an entitlement screen
     * shows each of them an empty list while `access/classify.ts` shows four paths:
     * the widest gap in the estate between what a reviewer is shown and what the
     * identity can do. And because nothing else feeds them, severing the group's one
     * connect grant takes each of them to *zero* reachable permissions, which is the
     * only place the module's two deltas (research §4.3) can both be read off a
     * single candidate without arithmetic.
     *
     * It also keeps the ranking honest. `agent-support-triage` holds one direct
     * grant on top of the same group access, so it stays strictly the most exposed
     * member and beat 25's rank-2 row is unmoved; three rota members carrying an
     * identical spare grant would have tied with it exactly and made every ordering
     * assertion in `exposure/service.test.ts` depend on an arbitrary tie-break.
     */
    {
      id: 'user-tomas',
      type: 'human',
      name: 'Tomas Brennan',
      app: 'mcp-gateway',
      direct_grants: [],
      inherited_from: ['group-oncall-agents'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-01-16',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'agent-incident-responder',
      type: 'ai_agent',
      name: 'Incident Responder Agent',
      app: 'mcp-gateway',
      direct_grants: [],
      inherited_from: ['group-oncall-agents'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-02-23',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'svc-runbook-scheduler',
      type: 'service_account',
      name: 'Runbook Scheduler',
      app: 'mcp-gateway',
      direct_grants: [],
      inherited_from: ['group-oncall-agents'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-01-16',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 30 — a second two-stage chain, in a system pair that shares nothing with
     * the first.
     *
     * Research §4.4 specifies an exhaustive-then-greedy selector, and the exhaustive
     * arm is only meaningful over a candidate set with more than one real answer in
     * it. With one multi-stage chain in the estate, "the best pair of grants to
     * revoke" and "the two grants in the only chain we have" are the same list.
     *
     *   svc-release-orchestrator  -CAN_ACCESS->   gh:connect-release-runner
     *   svc-hotfix-deployer       -CAN_ACCESS->   gh:connect-release-runner
     *                             -ASSUMES_ROLE-> role-release-runner   (github)
     *                             -CAN_ACCESS->   gh:connect-artifact-signer
     *                             -ASSUMES_ROLE-> role-artifact-signer  (aws-iam)
     *                             -HAS_POLICY->   deploy:prod
     *
     * Deliberately parallel in structure to the beat-23 chain and different in
     * every particular: two systems neither of those beats uses, a terminal
     * permission the catalogue already flags sensitive, and the grants held
     * directly rather than through a group. Two chains that differed only in their
     * names would prove the selector iterates, not that it compares.
     *
     * The terminal permission is `deploy:prod` rather than a new one because a
     * choke point whose removal closes nothing sensitive is not worth ranking, and
     * inventing a second production-admin permission to make the point would be the
     * dataset arguing with itself.
     */
    {
      id: 'svc-release-orchestrator',
      type: 'service_account',
      name: 'Release Orchestrator',
      app: 'github',
      direct_grants: ['gh:connect-release-runner', 'read:release-notes'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-10-08',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 31 — the shared binding, and the case appearance-frequency gets wrong.
     *
     * The hotfix path was stood up by a different team for a different reason, and
     * it reuses the same runner because that is what the runner is for. The two
     * accounts have no group, no owner and no permission in common; the only thing
     * they share is `gh:connect-release-runner`.
     *
     * That is the entire point. Research §4.4 rejects ranking candidates by how
     * often they appear on a path list, because a grant that appears once per
     * subject on a hundred paths belonging to one identity closes one identity's
     * access, while a grant on four paths belonging to four identities closes four.
     * Until this row, no binding in the estate had a second holder, so both rankings
     * agreed and the objection was untestable.
     */
    {
      id: 'svc-hotfix-deployer',
      type: 'service_account',
      name: 'Hotfix Deployer',
      app: 'github',
      direct_grants: ['gh:connect-release-runner'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-04-12',
      last_activity_at: '2026-07-28',
      provisioning_source: 'bulk_import',
    },

    /**
     * The middle rung. Holds one connect grant and nothing else, which is why no
     * review of it has ever raised a question: the account that can sign artefacts
     * is one edge further on, and this one looks like a build runner.
     */
    {
      id: 'role-release-runner',
      type: 'service_account',
      name: 'Release Runner Role',
      app: 'github',
      direct_grants: ['gh:connect-artifact-signer'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-10-08',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'role-artifact-signer',
      type: 'service_account',
      name: 'Artifact Signer Role',
      app: 'aws-iam',
      direct_grants: ['deploy:prod'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-10-08',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },
  ],

  /**
   * Active and reviewed 12 days ago, well inside the 90-day `staleAttestationDays`
   * floor. Same treatment as `user-jane` in `seed/access.ts` and for the same
   * reason: the only notable thing about this row has to be what he can reach.
   */
  employee_status: {
    'user-tomas': { status: 'active', last_reviewed: '2026-07-19' }, // 12 days
  },

  /**
   * Every rung of both chains is owned, by three different live teams, and attested
   * inside the 90-day floor.
   *
   * This is the uncomfortable half of the beat and the reason it is worth showing:
   * there is no negligence anywhere in either chain, and there is no single team to
   * send the finding to. `team-finance-ops` is avoided throughout — its last member
   * has departed, which is a beat-12 finding and would put these rows in the queue.
   */
  owner_assignments: [
    {
      identity_id: 'user-tomas',
      app: 'mcp-gateway',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-24', // 7 days
    },
    {
      identity_id: 'agent-incident-responder',
      app: 'mcp-gateway',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-24', // 7 days
    },
    {
      identity_id: 'svc-runbook-scheduler',
      app: 'mcp-gateway',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-24', // 7 days
    },
    {
      identity_id: 'svc-release-orchestrator',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-discovery',
      attested_at: '2026-07-26', // 5 days
    },
    {
      identity_id: 'svc-hotfix-deployer',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-payments',
      attested_at: '2026-07-22', // 9 days
    },
    {
      identity_id: 'role-release-runner',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-discovery',
      attested_at: '2026-07-26', // 5 days
    },
    {
      identity_id: 'role-artifact-signer',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-25', // 6 days
    },
  ],
});
