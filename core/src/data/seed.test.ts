import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccountabilityService } from '../accountability/assess.js';
import { DEFAULT_ORPHAN_RULES } from '../accountability/rules.js';
import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import type {
  OwnershipReason,
  OwnershipState,
  Severity,
  SuppressionEffect,
  SuppressionReason,
} from '../domain/ownership.js';
import type { OwnershipFinding } from '../domain/ownership-results.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
} from '../domain/policy.js';
import type { OrphanReason, TraceTermination } from '../domain/results.js';
import type { EmploymentStatus, Identity, IdentityType } from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { DEFAULT_OWNER_RESOLVERS } from '../ownership/resolve.js';
import { createSweepService } from '../ownership/sweep.js';
import { SEED_DATASET } from './seed.js';
import { SCIM_PROVISIONED_IDS } from './seed/lineage.js';
import { validateDataset } from './validate.js';

/**
 * The dataset *is* the demo, so it is pinned like an API contract.
 *
 * Every number asserted here is a number that appears on screen during the
 * five-minute walkthrough in `docs/demo-script.md`, computed against the clock the
 * demo runs with. A threshold change that silently re-ranks the queue, or a new
 * identity that quietly outranks the headline, fails here rather than on stage.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);
const HR = datasetHrDirectory(DATASET);

const OWNERSHIP = createOwnershipService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  hr: HR,
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const ACCOUNTABILITY = createAccountabilityService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
  rules: DEFAULT_ORPHAN_RULES,
});

const SWEEP = createSweepService({
  graphSource: { graph: () => GRAPH },
  hr: HR,
  clock: fixedClock(NOW),
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

function finding(identityId: string): OwnershipFinding {
  const outcome = OWNERSHIP.classify(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.finding;
}

function reasonOf(value: OwnershipFinding): OwnershipReason | null {
  return 'reason' in value ? value.reason : null;
}

/** Fixture rows are engine probes, not demo rows, and are filtered out of both. */
function isFixture(identity: Identity): boolean {
  return identity.id.includes('-fixture-');
}

const ALL_FINDINGS: readonly OwnershipFinding[] = DATASET.identities.map((identity) =>
  finding(identity.id),
);

// --- The contract the UI is built against -----------------------------------

/**
 * Every curated identity, with the verdict a reviewer will see.
 *
 * Groups are omitted because they are permission containers rather than things a
 * person owns, and the queue excludes them by type. Fixtures are omitted because
 * they exist to prove the traversal cannot be crashed.
 *
 * The set of ids is asserted to be exhaustive below, so adding an identity without
 * deciding what it is supposed to prove fails the build.
 */
type ExpectedRow = readonly [string, OwnershipState, OwnershipReason | null, Severity, boolean];

/**
 * Beat 17's cohort, pinned as a cohort.
 *
 * Thirty-four identities authored in `seed/lineage.ts` to be identical in every column
 * that decides a verdict, so the expectation is written once rather than copied
 * thirty-four times. Each identity still gets its own four assertions below and still
 * has to appear in the exhaustiveness check, so a single divergent row fails here — it
 * is the expectation that is shared, not the assertion.
 */
const SCIM_COHORT: readonly ExpectedRow[] = SCIM_PROVISIONED_IDS.map(
  (id): ExpectedRow => [id, 'owned', null, 'none', false],
);

const EXPECTED: readonly ExpectedRow[] = [
  // people
  ['user-alice', 'owner_invalid', 'creator_deactivated', 'critical', true],
  ['user-bob', 'owner_invalid', 'owner_attestation_stale', 'critical', true],
  ['user-carol', 'owner_invalid', 'creator_deactivated', 'critical', true],
  ['user-dan', 'owned', null, 'none', false],
  ['user-erin', 'owner_invalid', 'creator_deactivated', 'none', false],
  ['user-heidi', 'owned', null, 'none', false],
  ['user-nadia', 'owner_invalid', 'creator_deactivated', 'none', false],
  ['user-omar', 'owner_invalid', 'creator_deactivated', 'none', false],
  ['user-priya', 'owned', null, 'none', false],
  ['user-victor', 'owner_invalid', 'creator_deactivated', 'none', false],

  // beat 1 — the headline, and the login that *was* disabled
  ['svc-vpn-legacy', 'owner_invalid', 'creator_deactivated', 'critical', true],
  ['svc-legacy-fileshare', 'owner_invalid', 'creator_deactivated', 'none', false],

  // beats 2, 3, 9a — the three-hop chain
  ['svc-backup', 'ambiguous', 'conflicting_owner_signals', 'high', true],
  ['agent-report', 'owner_invalid', 'creator_deactivated', 'critical', true],
  ['agent-crm-writer', 'owner_invalid', 'creator_deactivated', 'medium', true],

  // beats 4, 5, 11 — the rows we correctly did not flag
  ['svc-payments-recon', 'owned', null, 'none', false],
  ['svc-invoice-mailer', 'owned', null, 'none', false],
  ['svc-quarterly-audit-pull', 'owned', null, 'none', false],
  ['svc-monitor', 'owned', null, 'none', false],
  ['svc-deploy', 'owned', null, 'none', false],

  // beats 6, 8 — unknown is not unowned
  ['svc-systemroot', 'unknown', 'outside_audit_window', 'none', false],
  ['svc-ldap-batch-sync', 'unknown', 'outside_audit_window', 'none', false],
  ['svc-ldap-print-spool', 'unknown', 'outside_audit_window', 'none', false],
  ['svc-hr-sync', 'unknown', 'no_owner_on_record', 'none', false],
  ['agent-legacy-sweeper', 'unowned', 'no_owner_on_record', 'medium', true],

  // beat 7 — suppressed by design, and one exemption that has expired
  ['svc-breakglass-root', 'unowned', 'no_owner_on_record', 'none', false],
  ['svc-shared-mailroom', 'unowned', 'no_owner_on_record', 'none', false],
  ['svc-vendor-scanner', 'unowned', 'no_owner_on_record', 'none', false],
  ['svc-migration-bridge', 'unowned', 'no_owner_on_record', 'medium', true],

  // beats 9b, 10, 12 — one clean example per reason code
  ['svc-legacy-export', 'owner_invalid', 'owner_team_vacant', 'critical', true],
  ['svc-payroll-export', 'owner_invalid', 'owner_departed', 'critical', true],
  ['svc-staging-seed', 'owner_invalid', 'owner_role_changed', 'medium', true],
  ['svc-cost-report', 'owner_invalid', 'owner_never_attested', 'medium', true],
  ['svc-warehouse-loader', 'owner_invalid', 'owner_attestation_stale', 'critical', true],
  ['svc-batch-recon', 'owner_invalid', 'creator_deactivated', 'critical', true],
  ['svc-quarter-close', 'owner_invalid', 'creator_deactivated', 'high', true],
  ['svc-index-builder', 'ambiguous', 'conflicting_owner_signals', 'low', true],
  ['svc-oauth-dashboards', 'unowned', 'no_owner_on_record', 'medium', true],
  ['svc-etl', 'owned', null, 'none', false],
  ['agent-analytics', 'owner_invalid', 'owner_attestation_stale', 'medium', true],

  /**
   * beat 16 — the Midnight Blizzard chain.
   *
   * The bootstrap principal predates the tenant's export floor, so it is `unknown`
   * for the same reason the legacy directory's roots are. The application below it is
   * a real ownership finding and only `medium`, because it reaches nothing sensitive —
   * which is exactly why an access-based queue never surfaces it and why this module
   * has something to add. The account it created is `high` rather than `critical`
   * only because it is five days old and still inside the 14-day SLA.
   */
  ['svc-entra-bootstrap', 'unknown', 'outside_audit_window', 'none', false],
  ['svc-legacy-test-oauth', 'unowned', 'no_owner_on_record', 'medium', true],
  ['svc-mail-archive-relay', 'unowned', 'no_owner_on_record', 'high', true],

  // beat 17 — fan-out 34 with a declared owner, and the 34 accounts themselves
  ['svc-scim-provisioner', 'owned', null, 'none', false],
  ...SCIM_COHORT,

  // beat 18 — five generations, every rung owned by the same live team
  ['svc-terraform-ci', 'owned', null, 'none', false],
  ['svc-tf-workspace-runner', 'owned', null, 'none', false],
  ['svc-landing-zone-baseline', 'owned', null, 'none', false],
  ['svc-service-mesh-ca', 'owned', null, 'none', false],
  ['svc-workload-identity-broker', 'owned', null, 'none', false],
  ['svc-batch-executor', 'owned', null, 'none', false],

  // Owned, attested, green — and its origin is still unexplained. Coverage and
  // hygiene are separate numbers, and this row is where that is visible.
  ['svc-github-release-bot', 'owned', null, 'none', false],

  /**
   * beats 19-21 — Access Discovery, and every row green on purpose.
   *
   * `user-jane` holds production platform admin through a resource hop and is still
   * `owned` with severity `none`, because her ownership is correct and
   * `ownership/reach.ts` does not follow permission bindings. That is not a gap in
   * this table — it is the finding Access Discovery exists to add, and it only
   * counts as a demonstration while these rows stay out of the queue.
   */
  ['role-deploy-box', 'owned', null, 'none', false],
  ['user-jane', 'owned', null, 'none', false],
  ['user-grace', 'owned', null, 'none', false],
  ['role-build-agent', 'owned', null, 'none', false],
  ['svc-ci-runner', 'owned', null, 'none', false],

  /**
   * beats 22-23 — the agent chain, owned at every rung by two live teams.
   *
   * `role-runbook-executor` and `role-warehouse-admin` each hold a sensitive
   * permission and are still `none`, because ownership is the question this module
   * answers and theirs is in good standing. Nothing is negligent anywhere in this
   * chain, which is exactly why no existing view surfaces it.
   */
  ['agent-support-triage', 'owned', null, 'none', false],
  ['role-runbook-executor', 'owned', null, 'none', false],
  ['role-warehouse-admin', 'owned', null, 'none', false],
];

test('every curated identity produces its documented verdict', () => {
  for (const [id, state, reason, severity, counted] of EXPECTED) {
    const result = finding(id);
    assert.equal(result.state, state, `state for ${id}`);
    assert.equal(reasonOf(result), reason, `reason for ${id}`);
    assert.equal(result.severity, severity, `severity for ${id}`);
    assert.equal(result.counted, counted, `counted for ${id}`);
  }
});

test('the expectation table covers every curated identity', () => {
  const curated = DATASET.identities
    .filter((identity) => identity.type !== 'group' && !isFixture(identity))
    .map((identity) => identity.id)
    .sort();

  assert.deepEqual(
    [...EXPECTED.map(([id]) => id)].sort(),
    curated,
    'a new identity needs a row above stating what it proves',
  );
});

// --- Union coverage ---------------------------------------------------------

function unique<T>(values: readonly (T | null | undefined)[]): readonly T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))].sort();
}

test('every ownership state is reachable', () => {
  const expected: readonly OwnershipState[] = [
    'ambiguous',
    'owned',
    'owner_invalid',
    'unknown',
    'unowned',
  ];
  assert.deepEqual(unique(ALL_FINDINGS.map((value) => value.state)), expected);
});

test('every ownership reason is reachable', () => {
  const expected: readonly OwnershipReason[] = [
    'broken_provenance',
    'conflicting_owner_signals',
    'creator_deactivated',
    'no_owner_on_record',
    'outside_audit_window',
    'owner_attestation_stale',
    'owner_departed',
    'owner_never_attested',
    'owner_role_changed',
    'owner_team_vacant',
  ];
  assert.deepEqual(unique(ALL_FINDINGS.map(reasonOf)), expected);
});

test('every severity band is reachable', () => {
  const expected: readonly Severity[] = ['critical', 'high', 'low', 'medium', 'none'];
  assert.deepEqual(unique(ALL_FINDINGS.map((value) => value.severity)), expected);
});

test('every suppression reason and effect is reachable', () => {
  const reasons: readonly SuppressionReason[] = [
    'already_revoked',
    'break_glass',
    'outside_audit_window',
    'shared_system',
    'sso_federated',
    'vendor_managed',
  ];
  const effects: readonly SuppressionEffect[] = ['excluded', 'suppressed', 'unknown'];

  assert.deepEqual(unique(ALL_FINDINGS.map((value) => value.suppression?.reason)), reasons);
  assert.deepEqual(unique(ALL_FINDINGS.map((value) => value.suppression?.effect)), effects);
});

/**
 * `inferred` is absent on purpose, and this assertion is an equality rather than a
 * subset check so that absence is reported rather than assumed: no resolver in
 * `DEFAULT_OWNER_RESOLVERS` emits it, so no dataset can make it appear. If an
 * inference resolver lands, this fails and the data needs a row that exercises it.
 */
test('every owner source a resolver can emit is exercised', () => {
  assert.equal(DEFAULT_OWNER_RESOLVERS.length, 4, 'resolver chain changed; re-check sources');
  assert.deepEqual(
    unique(ALL_FINDINGS.flatMap((value) => value.candidates.map((candidate) => candidate.source))),
    ['creator_fallback', 'explicit_tag', 'group_ownership'],
  );
});

test('every trace termination and v1 orphan reason is reachable', () => {
  const assessments = DATASET.identities.map((identity) => {
    const outcome = ACCOUNTABILITY.assess(identity.id);
    assert.ok(outcome.ok);
    return outcome.assessment;
  });

  const terminations: readonly TraceTermination[] = [
    'cycle_detected',
    'dangling_reference',
    'depth_limit_exceeded',
    'no_human_root',
    'resolved_human',
  ];
  const reasons: readonly OrphanReason[] = [
    'broken_provenance',
    'departed',
    'no_accountable_human',
    'role_changed',
    'stale_review',
  ];

  assert.deepEqual(unique(assessments.map((value) => value.termination)), terminations);
  assert.deepEqual(unique(assessments.map((value) => value.orphan_reason)), reasons);
});

test('every identity type, employment status and provisioning source is present', () => {
  const types: readonly IdentityType[] = ['ai_agent', 'group', 'human', 'service_account'];
  const statuses: readonly EmploymentStatus[] = ['active', 'departed', 'role_changed'];

  assert.deepEqual(unique(DATASET.identities.map((identity) => identity.type)), types);
  assert.deepEqual(
    unique(Object.values(DATASET.employee_status).map((record) => record.status)),
    statuses,
  );
  assert.deepEqual(unique(DATASET.identities.map((identity) => identity.provisioning_source)), [
    'app_native',
    'bulk_import',
    'self_registered',
    'sso_federated',
  ]);
});

// --- The beats --------------------------------------------------------------

test('beat 1: the Colonial row is the top of the queue', () => {
  const queue = OWNERSHIP.list();
  const [top] = queue;

  assert.equal(top?.identity_id, 'svc-vpn-legacy', 'the headline must not be outranked');
  assert.equal(top?.severity, 'critical');
  assert.equal(top?.timeline.age_days, 200, 'measured from the departure date, not the scan');
  assert.equal(top?.timeline.sla_days, 14);
  assert.equal(top?.timeline.sla_breached, true);
  assert.equal(top?.reachable_sensitive_count, 2, 'the VPN scope plus the production database');
  assert.equal(top?.timeline.inactive_days, 5, 'used 195 days after the owner left');

  // Orphaned *and* control-decayed. Neither signal alone would rank it here.
  const controls = DATASET.control_history.find((entry) => entry.identity_id === 'svc-vpn-legacy');
  assert.deepEqual(
    controls?.events.map((event) => event.control),
    ['mfa_enabled', 'conditional_access'],
  );
});

test('beat 2: the residual footprint is three live hops and crosses apps', () => {
  const footprint = SWEEP.forHuman('user-alice');
  assert.ok(footprint !== null);

  assert.deepEqual(
    footprint.live.map((node) => node.identity_id),
    ['svc-backup', 'agent-report', 'agent-crm-writer'],
  );
  assert.equal(footprint.max_hops, 3);
  assert.equal(footprint.crosses_apps, true, 'the agent is registered in a different system');
  assert.deepEqual(footprint.sensitive_reachable, ['mcp:prod-db-query']);
  assert.equal(footprint.departed_since, '2026-06-15');
});

test('beat 3: an agent provisioned by another agent still resolves to a human', () => {
  const spawned = GRAPH.byId.get('agent-crm-writer');
  const spawner = GRAPH.byId.get(spawned?.provisioned_by ?? '');
  assert.equal(spawner?.type, 'ai_agent', 'the parent is an agent, not a service account');

  const outcome = ACCOUNTABILITY.assess('agent-crm-writer');
  assert.ok(outcome.ok);
  assert.deepEqual(
    outcome.assessment.chain.map((node) => node.id),
    ['agent-crm-writer', 'agent-report', 'svc-backup', 'user-alice'],
  );
  assert.equal(outcome.assessment.root_human, 'user-alice');
});

test('beat 4: a departed creator with a live owning team renders green', () => {
  const result = finding('svc-payments-recon');

  assert.equal(GRAPH.byId.get('svc-payments-recon')?.provisioned_by, 'user-erin');
  assert.equal(HR.person('user-erin')?.status, 'departed');
  assert.equal(result.state, 'owned');
  assert.equal(result.owner?.id, 'team-payments');
  assert.equal(result.owner?.source, 'explicit_tag');
  assert.equal(result.reachable_sensitive_count, 1, 'green because owned, not because harmless');
  assert.equal(result.counted, false);
});

test('beat 6: an audit-retention gap is unknown, not counted, and not a severity', () => {
  const gaps = ['svc-systemroot', 'svc-ldap-batch-sync', 'svc-ldap-print-spool'];
  for (const id of gaps) {
    const result = finding(id);
    assert.equal(result.state, 'unknown', id);
    assert.notEqual(result.state, 'unowned', id);
    assert.equal(result.counted, false, id);
    assert.equal(result.severity, 'none', id);
    assert.equal(result.suppression?.reason, 'outside_audit_window', id);
  }

  const queued = OWNERSHIP.list().map((value) => value.identity_id);
  for (const id of gaps) {
    assert.ok(!queued.includes(id), `${id} must not appear in the counted queue`);
  }
});

test('beat 7: registered exemptions are silent and expired ones are not', () => {
  for (const id of ['svc-breakglass-root', 'svc-shared-mailroom', 'svc-vendor-scanner']) {
    const result = finding(id);
    assert.equal(result.suppression?.effect, 'suppressed', id);
    assert.equal(result.counted, false, id);
    assert.ok(result.suppression?.expires_at !== null, `${id} needs a bounded exception`);
  }

  // Every exemption in the registry is time-bounded: an exception with no expiry is
  // a permanent hole in the control.
  for (const entry of DATASET.suppressions ?? []) {
    assert.ok(entry.expires_at !== undefined, `suppression for ${entry.identity_id} has no expiry`);
  }

  const expired = finding('svc-migration-bridge');
  assert.equal(expired.suppression, null, 'the exemption lapsed 31 days ago');
  assert.equal(expired.counted, true);
});

test('beat 8: a revoked identity leaves the queue but stays in the sweep as remediated', () => {
  const revoked = finding('svc-legacy-fileshare');
  assert.equal(revoked.suppression?.effect, 'excluded');
  assert.equal(revoked.counted, false);

  const footprint = SWEEP.forHuman('user-victor');
  assert.equal(footprint?.revoked_count, 1);
  assert.deepEqual(
    footprint?.live.map((node) => node.identity_id),
    ['svc-vpn-legacy'],
    'the sweep reports one live and one closed, not two problems',
  );
});

test('beat 10: owner_departed and creator_deactivated are told apart', () => {
  // An owner accepted accountability and then left.
  const assigned = finding('svc-payroll-export');
  assert.equal(reasonOf(assigned), 'owner_departed');
  assert.equal(assigned.owner?.source, 'explicit_tag');
  assert.equal(assigned.owner?.id, 'user-nadia');
  assert.equal(GRAPH.byId.get('svc-payroll-export')?.provisioned_by, 'user-heidi');
  assert.equal(HR.person('user-heidi')?.status, 'active', 'the creator is still here');

  // Nobody ever owned this; only the creation record did, and it has expired.
  const fallback = finding('svc-batch-recon');
  assert.equal(reasonOf(fallback), 'creator_deactivated');
  assert.equal(fallback.owner?.source, 'creator_fallback');
});

test('beat 12: the SLA clock separates a breach from a row still inside it', () => {
  const breached = finding('svc-batch-recon');
  const withinSla = finding('svc-quarter-close');

  assert.equal(breached.timeline.age_days, 40);
  assert.equal(breached.timeline.sla_breached, true);
  assert.equal(breached.severity, 'critical');

  assert.equal(withinSla.timeline.age_days, 5);
  assert.equal(withinSla.timeline.sla_breached, false);
  assert.equal(withinSla.severity, 'high', 'same sensitivity, still inside the SLA');

  // The pair differs in exactly one column, so "why is this one critical" has a
  // one-word answer on stage.
  const left = GRAPH.byId.get('svc-batch-recon');
  const right = GRAPH.byId.get('svc-quarter-close');
  assert.equal(left?.app, right?.app);
  assert.equal(left?.type, right?.type);
  assert.deepEqual(left?.direct_grants, right?.direct_grants);
  assert.deepEqual(left?.inherited_from, right?.inherited_from);
  assert.equal(breached.reachable_sensitive_count, withinSla.reachable_sensitive_count);
  assert.equal(breached.reachable_sensitive_count, 1);

  // And the sweep, which reads direct grants, agrees with the queue, which reads
  // effective access. Two views disagreeing about danger is how trust is lost.
  assert.deepEqual(SWEEP.forHuman('user-nadia')?.sensitive_reachable, ['export:finance-report']);
  assert.deepEqual(SWEEP.forHuman('user-omar')?.sensitive_reachable, ['export:finance-report']);
});

test('beat 11: ownership and inactivity are two clocks', () => {
  const result = finding('svc-quarterly-audit-pull');

  assert.equal(result.state, 'owned');
  assert.equal(result.timeline.age_days, null, 'no ownership condition is true');
  assert.equal(result.timeline.inactive_days, 200);
  assert.equal(result.timeline.inactive_beyond_threshold, true, 'PCI DSS 8.2.6, 90 days');
  assert.equal(result.severity, 'none', 'the inactivity report is a different queue');
});

test('beat 13: cross-app lineage is stored apart from the per-app forest', () => {
  const crossApp = [...GRAPH.crossAppEdges.values()].map((edge) => edge.child_id).sort();

  assert.deepEqual(crossApp, ['agent-report', 'svc-legacy-fileshare', 'svc-vpn-legacy']);
  for (const edge of GRAPH.creationEdges.values()) {
    const parent = GRAPH.byId.get(edge.parent_id);
    // An unresolvable parent stays in the per-app forest by design: it is the
    // dangling_reference finding, not a cross-app join.
    if (parent === undefined) {
      continue;
    }
    assert.equal(parent.app, edge.app, 'the per-app forest must hold same-app edges only');
  }
});

test('beat 14: the depth cap is reachable on the default policy', () => {
  const outcome = ACCOUNTABILITY.assess('svc-fixture-depth-18');
  assert.ok(outcome.ok);
  assert.equal(outcome.assessment.termination, 'depth_limit_exceeded');
  assert.equal(DEFAULT_ACCOUNTABILITY_POLICY.maxChainDepth, 16, 'no env override needed');
});

/**
 * A curated dataset cannot demonstrate "7 of 4,000" by volume, so what is pinned
 * here is the ordering property that produces it: sensitive reachability decides
 * the band, and age only breaks ties inside one. Ranking by count or by age alone
 * would interleave these rows, which is the failure §3.4 describes — everyone can
 * produce the list, almost nobody hands you the ones that reach production.
 */
test('beat 15: the queue is ranked by reachable sensitive access, not by count or age', () => {
  const queue = OWNERSHIP.list();
  const reaching = queue.filter((value) => value.reachable_sensitive_count > 0);

  // 12 of 24 rather than 11 of 22: beat 16 adds one finding that reaches production
  // (`svc-mail-archive-relay`) and one that reaches nothing (`svc-legacy-test-oauth`).
  // The 46 identities beats 17 and 18 add are all `owned`, so none of them lands here.
  assert.equal(reaching.length, 12);
  assert.equal(queue.length, 24);

  const lastReaching = queue.findLastIndex((value) => value.reachable_sensitive_count > 0);
  const firstHarmless = queue.findIndex((value) => value.reachable_sensitive_count === 0);
  assert.equal(lastReaching < firstHarmless, true, 'every row that reaches sensitive sorts first');

  // The oldest finding in the dataset is 711 days old and sits twelve rows below a
  // five-day-old one, because it reaches nothing.
  const oldest = [...queue].sort((a, b) => (b.timeline.age_days ?? 0) - (a.timeline.age_days ?? 0))[0];
  assert.equal(oldest?.identity_id, 'agent-legacy-sweeper');
  assert.equal(oldest.timeline.age_days, 711);
  assert.equal(queue.indexOf(oldest) > 10, true, 'age alone would have put this at the top');
});

// --- Structural guards ------------------------------------------------------

test('nothing uncertain, exempt or already handled is ever counted', () => {
  for (const value of ALL_FINDINGS) {
    if (value.state === 'unknown' || value.suppression !== null) {
      assert.equal(value.counted, false, `${value.identity_id} must stay out of the count`);
    }
  }
});

test('the queue excludes groups, which are containers rather than owned things', () => {
  const queued = new Set(OWNERSHIP.list({ includeUncounted: true }).map((value) => value.identity_id));
  for (const identity of DATASET.identities) {
    if (identity.type === 'group') {
      assert.ok(!queued.has(identity.id), `${identity.id} is a permission container`);
    }
  }
});

test('every engine probe is prefixed so it can be filtered out of the demo', () => {
  const probes = DATASET.identities.filter((identity) => {
    const outcome = ACCOUNTABILITY.assess(identity.id);
    return (
      outcome.ok &&
      ['dangling_reference', 'cycle_detected', 'depth_limit_exceeded'].includes(
        outcome.assessment.termination,
      )
    );
  });

  assert.equal(probes.length > 0, true);
  for (const probe of probes) {
    assert.ok(isFixture(probe), `${probe.id} is a pathological shape and needs the fixture prefix`);
  }
});

test('every date in the dataset parses, so no threshold silently reads NaN', () => {
  const dates: string[] = [];
  for (const app of DATASET.apps) {
    if (app.creation_data_from !== null) {
      dates.push(app.creation_data_from);
    }
  }
  for (const identity of DATASET.identities) {
    dates.push(...[identity.created_at, identity.last_activity_at].filter((value): value is string => value !== undefined));
  }
  for (const record of Object.values(DATASET.employee_status)) {
    dates.push(record.last_reviewed);
    if (record.effective_from !== undefined) {
      dates.push(record.effective_from);
    }
  }
  for (const assignment of DATASET.owner_assignments) {
    if (assignment.attested_at !== undefined) {
      dates.push(assignment.attested_at);
    }
  }
  for (const entry of DATASET.suppressions ?? []) {
    if (entry.expires_at !== undefined) {
      dates.push(entry.expires_at);
    }
  }
  for (const history of DATASET.control_history) {
    dates.push(...history.events.map((event) => event.date));
  }
  for (const grant of DATASET.grant_records) {
    dates.push(grant.granted_at);
  }
  // The two lineage tables feed date arithmetic of their own — the AC-2(e) join
  // window and the observed-at ordering — so they belong in the same guard.
  for (const edge of DATASET.creation_edges ?? []) {
    dates.push(edge.observed_at);
    if (edge.occurred_at !== null) {
      dates.push(edge.occurred_at);
    }
  }
  for (const grant of DATASET.privilege_grant_events ?? []) {
    dates.push(grant.occurred_at);
  }

  for (const value of dates) {
    assert.equal(Number.isNaN(Date.parse(value)), false, `unparseable date "${value}"`);
  }
});

test('an identity created before its app started recording is never given a creator', () => {
  // The audit-window rule only fires when `provisioned_by` is null, so a row with
  // both a creator and a pre-retention creation date would silently become a
  // counted finding built on a date the app cannot actually vouch for.
  for (const identity of DATASET.identities) {
    const floor = GRAPH.apps.get(identity.app)?.creation_data_from ?? null;
    if (floor === null || identity.created_at === undefined || identity.provisioned_by === null) {
      continue;
    }
    assert.ok(
      Date.parse(identity.created_at) >= Date.parse(floor),
      `${identity.id} claims a creator from before ${identity.app} audit data begins`,
    );
  }
});
