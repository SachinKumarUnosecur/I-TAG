import { cluster } from './fragment.js';

/**
 * Beats 24-28 — Identity Exposure Map: breadth, unclassified access, and two
 * shapes the path inventory could not previously produce.
 *
 * `docs/PRD-identity-exposure-map.md` §1 asks a question Access Discovery cannot
 * answer from a list: not "how does this identity reach that permission" but "how
 * much can this identity reach in total, and how much of it matters". Answering it
 * needs an estate with an identity whose footprint is *wide*, and the seed did not
 * have one — the largest reachable set before this cluster was six paths, which is
 * a number a reviewer can hold in their head and therefore proves nothing about
 * aggregation.
 *
 * **The uncomfortable result is the beat.** `user-maya` holds forty paths, every
 * one of them a read grant somebody was right to approve, and under the weighting
 * in `docs/identity-exposure-map-research.md` §5 she scores *above* `user-jane`,
 * who reaches production platform admin through an invisible hop. That inverts the
 * comparison the module was originally pitched on, and it is kept rather than
 * calibrated away: forty systems is a real blast radius, the 2019 Capital One
 * breach turned on exactly the read scope nobody re-examined, and a scoring model
 * that only ever agrees with the sensitivity flag is a sensitivity flag with extra
 * arithmetic. §9 states the resulting demo line.
 *
 * As in `seed/access.ts`, **every identity here is green.** Nothing in this cluster
 * enters the ownership queue, changes its rank, or produces a finding. Exposure is
 * a property of correctly owned, correctly attested access, and a beat that
 * arrived pre-flagged by an existing module would be arguing the existing module's
 * case rather than this one's.
 *
 * Dates are measured back from the pinned demo instant
 * (`ITAG_NOW=2026-07-31T00:00:00Z`). Every `aws-iam` identity is created on or
 * after that app's `creation_data_from` floor of 2025-01-01, because a null
 * `provisioned_by` below the floor resolves to `unknown` rather than to `owned`
 * and would put these rows in front of the reviewer as data gaps.
 */
export const EXPOSURE = cluster({
  identities: [
    /**
     * Beat 24 — the widest footprint in the estate, and nothing wrong with any of it.
     *
     * Twenty-eight direct read grants plus twelve inherited through
     * `group-analytics-readers`: forty reachable permissions across two systems,
     * none sensitive, none stale, held by an active employee reviewed this month.
     * Every existing view in the product renders her as green, and every one of
     * them is right.
     *
     * The split between direct and inherited is deliberate rather than cosmetic.
     * A footprint that arrived entirely as direct grants would draw one ring and
     * invite the reading that breadth is a provisioning mistake; twelve of hers
     * arrive through a group she was correctly added to, which is what makes the
     * total nobody's fault and therefore nobody's job to reduce.
     */
    {
      id: 'user-maya',
      type: 'human',
      name: 'Maya Lindqvist',
      app: 'aws-iam',
      direct_grants: [
        'read:dashboard-revenue',
        'read:dashboard-churn',
        'read:dashboard-pipeline',
        'read:dashboard-support-sla',
        'read:dashboard-marketing-spend',
        'read:dashboard-headcount',
        'read:report-quarterly-close',
        'read:report-cohort-retention',
        'read:report-nps',
        'read:report-campaign-attribution',
        'read:dataset-web-events',
        'read:dataset-mobile-events',
        'read:dataset-billing-summary',
        'read:dataset-subscription-history',
        'read:dataset-support-tickets',
        'read:dataset-product-usage',
        'read:dataset-experiment-results',
        'read:dataset-inventory-snapshot',
        'read:dataset-shipping-times',
        'read:dataset-vendor-catalog',
        'read:lookup-currency-rates',
        'read:lookup-tax-jurisdictions',
        'read:lookup-country-codes',
        'read:lookup-product-taxonomy',
        'read:notebook-templates',
        'read:query-history',
        'read:schema-catalog',
        'read:job-run-status',
      ],
      inherited_from: ['group-analytics-readers'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-02-17',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },

    /**
     * The group half of beat 24, and the reason the footprint crosses a boundary.
     *
     * Sits in Snowflake while Maya sits in AWS IAM, so twelve of her forty paths
     * terminate in a different system from the one her account lives in. That is
     * the ordinary case in any estate with a warehouse, and it is what the ring map
     * has to render correctly before anyone will believe the total.
     */
    {
      id: 'group-analytics-readers',
      type: 'group',
      name: 'Analytics Readers',
      app: 'snowflake',
      direct_grants: [
        'read:warehouse-staging-tables',
        'read:warehouse-marts',
        'read:warehouse-dbt-docs',
        'read:bi-workspace-shared',
        'read:bi-workspace-archive',
        'read:bi-scheduled-exports',
        'read:metrics-definitions',
        'read:metrics-lineage',
        'read:data-quality-checks',
        'read:data-freshness-status',
        'read:glossary-business-terms',
        'read:access-request-history',
      ],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-06-24',
    },

    /**
     * Beat 26 — six permissions nobody has ever classified.
     *
     * A partner integration installed against GitHub, carrying the scopes the
     * partner asked for. Its permissions are in the catalogue with `sensitive`
     * omitted rather than set — `seed/catalog.ts` explains why the distinction is
     * load bearing — so the exposure score for this account is computed over
     * *nothing*, and the honest output is a completeness figure rather than a
     * number.
     *
     * This is the row that stops the score being oversold. §7 of the research is
     * explicit that an unclassified permission must not default to a middle tier:
     * a score that moves because the classification registry degraded tells the
     * reviewer about the registry, not about the identity, and there is no action
     * on the other side of it.
     */
    {
      id: 'svc-partner-sync',
      type: 'service_account',
      name: 'Partner Sync Integration',
      app: 'github',
      direct_grants: [
        'partner:webhook-replay',
        'partner:sandbox-export',
        'partner:catalog-sync',
        'partner:invoice-callback',
        'partner:audit-feed',
        'partner:credential-rotate',
      ],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-11-06',
      last_activity_at: '2026-07-29',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 27 — one permission, two routes, and `PRD` §8's second open question.
     *
     * §8 asks what an aggregate should report when an identity reaches the same
     * permission more than one way. The estate could already produce the harmless
     * version — `user-grace` reaches `read:finance-db` both directly and through
     * `group-finance` — but `direct` and `indirect` carry the same mechanism
     * multiplier, so collapsing her pair cannot move a score and the choice between
     * them is invisible. What the dataset had never produced is two routes whose
     * multipliers differ, where de-duplication has to pick one and the number
     * changes depending on which.
     *
     *   svc-invoice-poster -MEMBER_OF->     group-finance-ops
     *                      -HAS_POLICY->    write:invoice-queue        (indirect, 2)
     *   svc-invoice-poster -CAN_ACCESS->    connect:ledger-writer
     *                      -ASSUMES_ROLE->  role-ledger-writer
     *                      -HAS_POLICY->    write:invoice-queue        (hop, 3)
     *
     * The hop is deliberately three edges long in `aws-iam`, reusing a distance and
     * an app the estate already exhibits, so this beat adds a *shape* to the
     * inventory without moving the hop distribution the Access Discovery beats are
     * read against.
     *
     * Neither route is a mistake. Membership came with the team; the connect grant
     * came with a runbook for replaying stuck invoices. Revoking either one leaves
     * the permission reachable, which is the operational point: a queue that lists
     * paths tells you to fix two rows, and only an aggregate tells you that fixing
     * one of them changes nothing.
     */
    {
      id: 'svc-invoice-poster',
      type: 'service_account',
      name: 'Invoice Poster',
      app: 'aws-iam',
      direct_grants: ['connect:ledger-writer'],
      inherited_from: ['group-invoice-ops'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-09-15',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'group-invoice-ops',
      type: 'group',
      name: 'Invoice Operations',
      app: 'aws-iam',
      direct_grants: ['write:invoice-queue'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-09-15',
    },
    {
      id: 'role-ledger-writer',
      type: 'service_account',
      name: 'Ledger Writer Role',
      app: 'aws-iam',
      direct_grants: ['write:invoice-queue'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-09-15',
      last_activity_at: '2026-07-28',
      provisioning_source: 'bulk_import',
    },

    /**
     * Beat 28 — the nested group, and the collinearity it breaks.
     *
     * `docs/PRD-identity-exposure-map.md` amendment 6: the PRD's 1 / 2 / 3+ rings
     * assume hop distance carries information that path type does not, and in the
     * pre-existing seed it does not — every `direct` path was distance 1, every
     * `indirect` distance 2, and only `hop` ever exceeded them. Rings drawn on that
     * data would be a relabelling of the type column.
     *
     * A group inside a group is the cheapest thing in the world and produces the
     * first counterexample: `MEMBER_OF → MEMBER_OF → HAS_POLICY` is still
     * `indirect`, because the mechanism is still membership, but it is three edges
     * away rather than two. The map now has an `indirect` path in the outer ring,
     * which is the only way to demonstrate that the rings measure distance rather
     * than restate the classifier.
     */
    {
      id: 'svc-platform-watchdog',
      type: 'service_account',
      name: 'Platform Watchdog',
      app: 'aws-iam',
      direct_grants: ['read:job-run-status'],
      inherited_from: ['group-platform-oncall'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-03-04',
      last_activity_at: '2026-07-30',
      provisioning_source: 'bulk_import',
    },
    {
      id: 'group-platform-oncall',
      type: 'group',
      name: 'Platform On-call',
      app: 'aws-iam',
      // Holds nothing itself. A rota group that exists to pick up a base group's
      // entitlements is the shape nesting takes in practice, and it is why the
      // extra edge is invisible in any view that reports a member's groups.
      direct_grants: [],
      inherited_from: ['group-platform-base'],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2026-03-04',
    },
    {
      id: 'group-platform-base',
      type: 'group',
      name: 'Platform Baseline',
      app: 'aws-iam',
      direct_grants: ['read:metrics'],
      inherited_from: [],
      delegates_to: [],
      provisioned_by: null,
      created_at: '2025-01-21',
    },
  ],

  /**
   * Active and reviewed 15 days ago, well inside the 90-day `staleAttestationDays`
   * floor, so the creator fallback resolves Maya to herself and no attestation
   * rule fires. Same treatment as `user-jane` in `seed/access.ts`, and for the same
   * reason: her exposure has to be the only notable thing about her row.
   */
  employee_status: {
    'user-maya': { status: 'active', last_reviewed: '2026-07-16' }, // 15 days
  },

  /**
   * Attested well inside the 90-day floor, and assigned only to teams that still
   * have a live member — `team-finance-ops` is deliberately avoided here because
   * its last member has departed, which is the whole point of the beat-12 row that
   * already owns it.
   */
  owner_assignments: [
    {
      identity_id: 'svc-partner-sync',
      app: 'github',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-23', // 8 days
    },
    {
      identity_id: 'svc-invoice-poster',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-payments',
      attested_at: '2026-07-21', // 10 days
    },
    {
      identity_id: 'role-ledger-writer',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-payments',
      attested_at: '2026-07-21', // 10 days
    },
    {
      identity_id: 'svc-platform-watchdog',
      app: 'aws-iam',
      owner_kind: 'team',
      owner_id: 'team-platform',
      attested_at: '2026-07-25', // 6 days
    },
  ],
});
