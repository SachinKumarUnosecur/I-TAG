import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoizedOwnershipState } from '../adapters/ownership-state.js';
import type {
  ActorKind,
  HumanResolutionBasis,
  HumanResolutionConfidence,
  LineageGapReason,
  LineageRootKind,
  LineageRow,
  LineageWalk,
  ProvenanceRecord,
} from '../domain/lineage.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_LINEAGE_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
} from '../domain/policy.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createLineageService } from '../lineage/service.js';
import { createOwnershipService } from '../ownership/classify.js';
import { SEED_DATASET } from './seed.js';
import { SCIM_PROVISIONED_IDS } from './seed/lineage.js';
import { validateDataset } from './validate.js';

/**
 * Provisioning Lineage against the seed — the module's half of the demo contract.
 *
 * Split from `seed.test.ts` for the reason `ownership/` is split from
 * `accountability/`: that file pins what a reviewer sees in the ownership queue, this
 * one pins what they see in the lineage views, and the two answer different questions
 * about the same rows. Both run against the same pinned clock, because a beat that only
 * holds on one of them is not a beat.
 *
 * The union assertions below are equalities rather than subset checks, so a value that
 * becomes unreachable is *reported* rather than silently stopping being exercised.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);
const GRAPH_SOURCE = { graph: () => GRAPH };

const OWNERSHIP = createOwnershipService({
  graphSource: GRAPH_SOURCE,
  clock: fixedClock(NOW),
  hr: datasetHrDirectory(DATASET),
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const LINEAGE = createLineageService({
  graphSource: GRAPH_SOURCE,
  clock: fixedClock(NOW),
  hr: datasetHrDirectory(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  ownership: memoizedOwnershipState(OWNERSHIP),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_LINEAGE_POLICY,
});

const ROWS: readonly LineageRow[] = LINEAGE.list();

function record(identityId: string): ProvenanceRecord {
  const outcome = LINEAGE.record(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.record;
}

function row(identityId: string): LineageRow {
  const found = ROWS.find((value) => value.identity_id === identityId);
  assert.ok(found !== undefined, `no lineage row for "${identityId}"`);
  return found;
}

function unique<T>(values: readonly (T | null | undefined)[]): readonly T[] {
  return [...new Set(values.filter((value): value is T => value !== null && value !== undefined))].sort();
}

const RECORDS: readonly ProvenanceRecord[] = DATASET.identities.map((identity) =>
  record(identity.id),
);

// --- BEAT 16: the Midnight Blizzard chain -----------------------------------

/**
 * The row the module exists for, and the reason the `PRD`'s flag set was replaced.
 *
 * Microsoft's account has the actor using "a legacy test OAuth application" to "create
 * a new user account to grant consent" (Microsoft Security Blog, 25 Jan 2024). Fan-out
 * 1, generation 2. `PRD` L62-63 specifies `deep_chain` at >4 generations and
 * `high_fanout` at a static ceiling; on the canonical incident both are silent, which
 * is the argument of research §4.4 stated as data rather than as prose.
 */
test('beat 16: the shape flags stay silent on the incident the flags were meant to catch', () => {
  const creator = row('svc-legacy-test-oauth');
  const created = row('svc-mail-archive-relay');

  assert.equal(creator.fan_out, 1, 'one child — no fan-out threshold can reach this');
  assert.equal(created.generation, 2, 'two hops — no depth threshold can reach this either');
  assert.equal(creator.fan_out_exceeds_baseline, false, 'the rate signal is correctly silent');

  // And the creator holds nothing sensitive, so effective-access ranking never
  // surfaces it. Every other instrument in the engine is blind to this row.
  assert.equal(OWNERSHIP.classify('svc-legacy-test-oauth').ok, true);
  const finding = OWNERSHIP.classify('svc-legacy-test-oauth');
  assert.ok(finding.ok);
  assert.equal(finding.finding.reachable_sensitive_count, 0);
  assert.equal(finding.finding.severity, 'medium');
});

/**
 * NIST SP 800-53 AC-2(e) requires approvals for account-creation requests. The
 * computable violation is one principal performing both the create and the grant with
 * no second party in either event, which is what this asserts — and it is the only
 * signal in the module that fires on this row.
 */
test('beat 16: creationAuthority is the one signal that fires, and it names the control', () => {
  const created = record('svc-mail-archive-relay');
  const signal = created.creation_authority;

  assert.ok(signal !== null, 'the differentiated finding must be present');
  assert.equal(signal.self_authorized, true);
  assert.equal(signal.creator_privilege_mismatch, true);
  assert.equal(signal.actor.raw_principal, 'svc-legacy-test-oauth');
  assert.equal(signal.actor.kind, 'service_principal', 'Entra `initiatedBy.app`');
  assert.deepEqual(signal.granted_permissions, ['admin:exchange-mailboxes']);
  assert.match(signal.detail, /AC-2\(e\)/, 'the finding has to carry the control clause');

  // The three properties research §3.4 concludes are the real signal, as against the
  // shape of the chain: unowned, non-production, exercising a production privilege.
  assert.equal(signal.actor_is_non_production, true);
  assert.equal(signal.actor_ownership_state, 'unowned');

  // An app-initiated create contains no human at all (§3.2). That is a fact about the
  // estate, and it must not be dressed up as an inference or as missing data.
  assert.equal(created.provenance.state, 'recorded');
  if (created.provenance.state === 'recorded') {
    assert.equal(created.provenance.authorizing_human, null);
  }
});

test('beat 16: exactly one row in the estate carries the AC-2(e) violation', () => {
  assert.deepEqual(
    ROWS.filter((value) => value.self_authorized).map((value) => value.identity_id),
    ['svc-mail-archive-relay'],
  );
  assert.deepEqual(
    ROWS.filter((value) => value.creator_privilege_mismatch).map((value) => value.identity_id),
    ['svc-mail-archive-relay'],
  );
});

// --- BEAT 17: fan-out 34, and green ----------------------------------------

/**
 * Research §9, true negative 1 — the row that proves we did not threshold on a number.
 *
 * The highest fan-out in the dataset by an order of magnitude, and no finding, because
 * the measurement is a rate against this principal's own trailing history rather than a
 * lifetime total (§4.3). `PRD` L63's static threshold would rank this first in the
 * estate on day one, and an analyst mutes a flag like that in week one.
 */
test('beat 17: the highest fan-out in the estate is green because the rate is normal', () => {
  const bot = row('svc-scim-provisioner');

  assert.equal(bot.fan_out, SCIM_PROVISIONED_IDS.length);
  assert.equal(bot.fan_out, 34, 'research §9 asks for 30-40 so the rate has real data');
  assert.equal(bot.fan_out_exceeds_baseline, false);
  assert.equal(bot.self_authorized, false);
  assert.equal(bot.creator_privilege_mismatch, false);

  const signal = record('svc-scim-provisioner').fan_out_signal;
  assert.ok(signal !== null);
  assert.equal(signal.actor_kind, 'automation');
  assert.equal(signal.lifetime_total, 34, 'reported for context, never thresholded on');
  assert.equal(signal.created_in_window, 3, 'three in the last 30 days');
  assert.equal(signal.trailing_median, 2.5, 'against its own median of two and a half');
  assert.equal(signal.novel_target_class, false, 'it has provisioned this class all year');
  assert.equal(signal.exceeds_baseline, false);

  // The other half of why this is green: an owner who attested three weeks ago.
  const owned = OWNERSHIP.classify('svc-scim-provisioner');
  assert.ok(owned.ok);
  assert.equal(owned.finding.state, 'owned');
  assert.equal(owned.finding.owner?.id, 'team-identity');
});

test('beat 17: nothing anywhere in the estate exceeds a fan-out baseline', () => {
  // The strongest form of the claim, and the one a buyer is actually testing: the rate
  // signal is not merely quiet on the bot, it is quiet everywhere, because no principal
  // in this dataset is creating abnormally for what it is. A demo where the flag fires
  // somewhere convenient proves nothing about the threshold.
  assert.deepEqual(ROWS.filter((value) => value.fan_out_exceeds_baseline), []);
  assert.deepEqual(
    LINEAGE.actors().filter((signal) => signal.exceeds_baseline),
    [],
  );
});

test('beat 17: all 34 provisioned accounts are owned, so the cohort adds no findings', () => {
  for (const id of SCIM_PROVISIONED_IDS) {
    const finding = OWNERSHIP.classify(id);
    assert.ok(finding.ok, id);
    assert.equal(finding.finding.state, 'owned', id);
    assert.equal(finding.finding.counted, false, id);
    assert.equal(row(id).generation, 2, id);
  }
});

// --- BEAT 18: five generations, and green ----------------------------------

/**
 * Research §9, true negative 2 — the concrete counterexample to `deep_chain`.
 *
 * `PRD` L62 proposes flagging chains deeper than four generations. This is a correct
 * landing-zone pipeline five generations deep with an owner at every rung, and the flag
 * would have fired on all six rows. Research §4.2 deletes it; this is the evidence.
 */
test('beat 18: a five-generation ladder is green, which is why deep_chain was deleted', () => {
  const ladder = [
    'svc-terraform-ci',
    'svc-tf-workspace-runner',
    'svc-landing-zone-baseline',
    'svc-service-mesh-ca',
    'svc-workload-identity-broker',
    'svc-batch-executor',
  ];

  ladder.forEach((id, generation) => {
    const value = row(id);
    assert.equal(value.generation, generation, `generation for ${id}`);
    assert.equal(value.root_id, 'svc-terraform-ci', `root for ${id}`);
    assert.equal(value.fan_out_exceeds_baseline, false, id);
    assert.equal(value.self_authorized, false, id);

    const finding = OWNERSHIP.classify(id);
    assert.ok(finding.ok, id);
    assert.equal(finding.finding.state, 'owned', id);
    assert.equal(finding.finding.severity, 'none', id);
  });

  // Generation is a sortable column and nothing else: the deepest row in the demo
  // carries no signal at all, which is the property the deletion bought.
  const deepest = record('svc-batch-executor');
  assert.equal(deepest.creation_authority, null, 'no finding on the deepest row');
  assert.equal(deepest.ancestors.outcome, 'complete');
  assert.equal(deepest.ancestors.nodes.length, 6, 'itself plus five hops to the root');
});

/**
 * The presence of an approver is what AC-2(e) asks for, so it has to be able to clear
 * the finding. If it could not, the control would be unsatisfiable and `self_authorized`
 * would be a smear rather than a finding.
 */
test('beat 18: a grant of the same shape with a named approver is not a finding', () => {
  const granted = DATASET.privilege_grant_events?.find(
    (grant) => grant.identity_id === 'svc-batch-executor',
  );
  assert.ok(granted !== undefined, 'the true negative needs the grant event to exist');
  assert.equal(granted.approved_by, 'user-priya', 'a second party performed the approval');
  assert.equal(row('svc-batch-executor').self_authorized, false);
});

// --- The remaining true negatives from research §9 -------------------------

/**
 * Research §9, true negative 3 — absence of data, visibly being not-a-finding.
 *
 * These sit in the coverage *denominator* with the reason displayed, which is the whole
 * distinction between a bucket and the single `unlinked` flag `PRD` L65 specifies: a
 * flag says data is missing, a bucket lets you count it, trend it and exclude it from a
 * finding count without excluding it from the measurement.
 */
test('research §9 true negative 3: the legacy cluster is explained, counted in the denominator, and not a finding', () => {
  const legacy = ['svc-systemroot', 'svc-ldap-batch-sync', 'svc-ldap-print-spool'];

  for (const id of legacy) {
    const value = row(id);
    assert.equal(value.provenance.state, 'explained_absence', id);
    if (value.provenance.state === 'explained_absence') {
      assert.ok(value.provenance.gap.detail.length > 0, `${id} needs its reason on screen`);
    }
    assert.equal(value.self_authorized, false, id);
    assert.equal(value.creator_privilege_mismatch, false, id);
  }

  const report = LINEAGE.coverage();
  const ldap = report.by_app.find((value) => value.app === 'legacy-ldap');
  assert.ok(ldap !== undefined);
  assert.equal(
    ldap.explained_absences >= legacy.length,
    true,
    'they are explained rather than dropped',
  );
  assert.equal(ldap.total > ldap.with_recorded_creator, true, 'and still in the denominator');
});

/** Research §9, true negative 4 — `unknown`, not `unowned`, for a structural reason. */
test('research §9 true negative 4: an SSO-federated identity is a gap bucket, not a finding', () => {
  const value = row('svc-hr-sync');

  assert.equal(value.provenance.state, 'explained_absence');
  if (value.provenance.state === 'explained_absence') {
    assert.equal(value.provenance.gap.reason, 'federated_elsewhere');
    assert.equal(value.provenance.gap.recoverable_from, null, 'the IdP has it; we never will');
  }

  const finding = OWNERSHIP.classify('svc-hr-sync');
  assert.ok(finding.ok);
  assert.equal(finding.finding.state, 'unknown');
  assert.equal(finding.finding.counted, false);
});

// --- Coverage ---------------------------------------------------------------

/**
 * The landing view (research §6), and the one number the module is judged on.
 *
 * Pinned as an exact arithmetic identity rather than as a threshold, because the
 * failure mode being guarded against is a change that improves the percentage by
 * quietly moving rows out of the denominator.
 */
test('explanation coverage is an identity over the whole population, not a share of what we found', () => {
  const { overall } = LINEAGE.coverage();

  assert.equal(
    overall.with_recorded_creator + overall.explained_absences + overall.unexplained,
    overall.total,
    'every identity lands in exactly one of the three states',
  );
  /**
   * Within one ULP rather than exactly equal. `coverage.ts` evaluates
   * `(with_recorded_creator + explained_absences) / total` and this line evaluates
   * `1 − unexplained / total`; the two are the same real number and can land one
   * bit apart in IEEE-754 for some populations — 103/120 does, 98/115 did not.
   * The property being guarded is the denominator, and a row quietly leaving
   * `total` moves this figure by ~1e-2, four orders above the tolerance.
   */
  assert.ok(
    Math.abs(overall.explanation_coverage - (1 - overall.unexplained / overall.total)) <=
      Number.EPSILON,
    'the metric is 1 - (unexplained / total) and nothing else',
  );
  assert.equal(overall.unexplained > 0, true, 'a demo with nothing unexplained is a lie');
  assert.equal(overall.attested_attributions > 0, true, 'the persisted edges are being read');
  assert.equal(overall.attested_attributions < overall.attributed_to_human, true);
});

/**
 * Per-app rather than one blended figure, because research §3.2's model puts a
 * three-year-old estate at roughly 3% recoverable on Entra P1 and 37% on GCP: a single
 * number would hide the only actionable message, which is *which* audit configuration
 * to fix. The seed makes that visible as two regimes inside one tenant.
 */
test('coverage is reported per app, and the tenant that exports its audit log looks different', () => {
  const report = LINEAGE.coverage();
  const entra = report.by_app.find((value) => value.app === 'entra-tenant');
  const ldap = report.by_app.find((value) => value.app === 'legacy-ldap');

  assert.ok(entra !== undefined && ldap !== undefined);
  assert.equal(entra.creation_data_from, '2024-01-01', 'the date coverage climbs from');
  assert.equal(
    entra.explanation_coverage > ldap.explanation_coverage,
    true,
    'a tenant with diagnostic export configured is more explainable, which is the pitch',
  );

  // No app publishes a raw count of identities with no creator, per research §4.5 and
  // `orphaned-identity-research.md` §5.2: a raw count moves the wrong way as the
  // product improves, so it is never the number on screen.
  for (const value of report.by_app) {
    assert.equal(
      Object.keys(value).includes('unlinked'),
      false,
      `${String(value.app)} must not publish a raw unlinked count`,
    );
  }
});

test('the not_yet_captured bucket is the one that can shrink, and it says so', () => {
  const value = row('svc-github-release-bot');

  assert.equal(value.provenance.state, 'explained_absence');
  if (value.provenance.state === 'explained_absence') {
    assert.equal(value.provenance.gap.reason, 'not_yet_captured');
    assert.equal(
      value.provenance.gap.recoverable_from,
      DEFAULT_LINEAGE_POLICY.observedFrom,
      'a backfill from our install date recovers this one, unlike a retention loss',
    );
  }

  // And it is green, so an unexplained origin cannot be read as an ownership problem.
  const finding = OWNERSHIP.classify('svc-github-release-bot');
  assert.ok(finding.ok);
  assert.equal(finding.finding.state, 'owned');
});

// --- Union coverage ---------------------------------------------------------

function actorKindsOf(): readonly ActorKind[] {
  return unique(
    RECORDS.map((value) => (value.provenance.state === 'recorded' ? value.provenance.actor.kind : null)),
  );
}

/**
 * Three of these six cannot be produced by reading an identity object at all — a role
 * session is not its issuer, an app-initiated create names no human, and an AWS service
 * principal is not in the customer's estate to have a type (`lineage/actors.ts` L54-58).
 * They exist here only because the persisted edge store does, which is the argument of
 * research §4.6 expressed as a test.
 */
test('every actor kind is reachable from the seed', () => {
  const expected: readonly ActorKind[] = [
    'automation',
    'human',
    'provider_service',
    'role_session',
    'service_principal',
    'unknown',
  ];
  assert.deepEqual(actorKindsOf(), expected);
});

test('every human resolution basis and confidence is reachable from the seed', () => {
  const bases: readonly HumanResolutionBasis[] = [
    'acting_principal_is_human',
    'entra_initiated_by_user',
    'identity_center_user',
    'pipeline_trigger',
    'pr_approver',
    'role_assumption_correlation',
    'sts_source_identity',
  ];
  const confidences: readonly HumanResolutionConfidence[] = ['attested', 'correlated', 'inferred'];

  const humans = RECORDS.map((value) =>
    value.provenance.state === 'recorded' ? value.provenance.authorizing_human : null,
  );

  assert.deepEqual(unique(humans.map((human) => human?.basis)), bases);
  assert.deepEqual(unique(humans.map((human) => human?.confidence)), confidences);
});

test('every lineage gap reason is reachable from the seed', () => {
  const expected: readonly LineageGapReason[] = [
    'bulk_imported',
    'federated_elsewhere',
    'not_yet_captured',
    'outside_audit_window',
    'root_by_design',
    'self_registered',
  ];
  assert.deepEqual(
    unique(
      RECORDS.map((value) =>
        value.provenance.state === 'explained_absence' ? value.provenance.gap.reason : null,
      ),
    ),
    expected,
  );
});

test('every root kind and creator status is reachable from the seed', () => {
  const roots: readonly LineageRootKind[] = [
    'creator_in_other_app',
    'creator_unresolvable',
    'no_creator_recorded',
    'none',
  ];
  assert.deepEqual(unique(RECORDS.map((value) => value.root_kind)), roots);
  assert.deepEqual(unique(ROWS.map((value) => value.creator_status)), [
    'active',
    'departed',
    'not_a_person',
    'role_changed',
    'unknown',
  ]);
});

/**
 * Every terminal state of the ancestor walk, on the default policy and with no env
 * override. `PRD` L28 asserts creation lineage is "strictly hierarchical … not a
 * general directed graph with cycles"; research §4.8 shows identifier reuse produces
 * genuine cycles and service-linked role creation produces out-of-population parents.
 * Both are here, and both come back as a terminal state rather than as an exception.
 */
test('every lineage walk outcome is reachable from the seed', () => {
  const outcomes: readonly LineageWalk['outcome'][] = [
    'complete',
    'cycle_detected',
    'dangling_reference',
    'depth_limit_exceeded',
  ];
  assert.deepEqual(unique(RECORDS.map((value) => value.ancestors.outcome)), outcomes);

  // Named rows, so a future change that makes one unreachable says which beat broke.
  assert.equal(record('svc-fixture-cycle-a').ancestors.outcome, 'cycle_detected');
  assert.equal(record('svc-fixture-depth-18').ancestors.outcome, 'depth_limit_exceeded');

  const dangling = record('svc-fixture-service-linked-role');
  assert.equal(dangling.ancestors.outcome, 'dangling_reference');
  assert.equal(dangling.root_kind, 'creator_unresolvable');
  // Known provenance with a parent we do not hold — not a coverage gap. Calling it one
  // would let an unresolvable pointer quietly improve the metric (research §4.8).
  assert.equal(dangling.provenance.state, 'recorded');
  if (dangling.provenance.state === 'recorded') {
    assert.equal(dangling.provenance.actor.kind, 'provider_service');
  }
});

// --- Structural guards ------------------------------------------------------

/**
 * `PRD` L34 and research §7.2: `ownership/severity.ts` is the only place in the engine
 * that ranks anything. Two modules disagreeing about danger in front of a customer is
 * the failure this prevents, so it is asserted structurally rather than trusted.
 */
test('nothing this module emits carries a severity or a rank', () => {
  const forbidden = ['severity', 'rank', 'score', 'priority'];
  for (const value of ROWS) {
    for (const key of forbidden) {
      assert.equal(Object.keys(value).includes(key), false, `LineageRow must not carry "${key}"`);
    }
  }
  for (const value of RECORDS) {
    for (const key of forbidden) {
      assert.equal(
        Object.keys(value).includes(key),
        false,
        `ProvenanceRecord must not carry "${key}"`,
      );
    }
  }
});

test('the table view is depth-bounded and the tree view honours the bound', () => {
  // §6.5's own worked example is a bot that created 40 accounts, so an unbounded
  // subtree is how one row becomes a megabyte of payload.
  const shallow = LINEAGE.tree('svc-scim-provisioner', 1);
  assert.ok(shallow.ok);
  assert.equal(shallow.tree.depth, 1);
  assert.equal(shallow.tree.descendants.nodes.length, 1 + SCIM_PROVISIONED_IDS.length);

  const deep = LINEAGE.tree('svc-terraform-ci', 2);
  assert.ok(deep.ok);
  assert.equal(
    deep.tree.descendants.nodes.length,
    3,
    'itself plus two generations, not the whole ladder',
  );
});

test('the generation memo agrees with the walk it replaces', () => {
  // The memo exists because per-row ancestor walks are what break the table at 100k
  // (research §5). It is only a valid optimisation if it returns the same answer, so
  // the two are compared across the whole seed rather than spot-checked.
  for (const value of RECORDS) {
    if (value.ancestors.outcome !== 'complete') {
      continue;
    }
    // Generation is app-scoped, so the walk's in-app prefix is what it corresponds to:
    // the first cross-app hop ends this identity's own app's tree, and counting past it
    // would present a correlation we performed as one provider's recorded lineage.
    const boundary = value.ancestors.nodes.findIndex((node) => node.crosses_app);
    const inApp = boundary === -1 ? value.ancestors.nodes.length : boundary;
    assert.equal(
      value.generation,
      inApp - 1,
      `memoized generation disagrees with the walk for ${value.identity_id}`,
    );
  }
});
