import assert from 'node:assert/strict';
import { test } from 'node:test';

import { memoizedAccessOwner } from '../adapters/access-owner.js';
import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoizedExposureOwnership } from '../adapters/exposure-ownership.js';
import { memoizedImpactExposure } from '../adapters/impact-exposure.js';
import { createAccessService } from '../access/service.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import { IMPACT_VERSUS_EXPOSURE } from '../domain/impact.js';
import type { ImpactAssessment, ImpactProfile } from '../domain/impact.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import { createExposureService } from '../exposure/service.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createImpactService } from './service.js';

/**
 * Blast Radius, assembled — `docs/unified-impact-analysis-research.md` §5, §6, §7.2.
 *
 * The single most important test in this file is the guard, and it is the mirror of
 * the two the engine already carries. `access/classify.test.ts` walks Access
 * Discovery's output and fails on any key named `severity`, `rank`, `score` or
 * `priority`; `exposure/service.test.ts` walks the paths Exposure borrows and fails
 * on the same, plus its own score leaking backwards. Research §7.2 states the
 * condition on this module's existence in one sentence — *the moment it emits a
 * per-identity 0-100 score, architecture rule 8 is genuinely violated* — and adds
 * that the guard should make that structurally impossible rather than leaving it to
 * review. That is what the first test below is.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);
const GRAPH_SOURCE = { graph: () => GRAPH };
const CLOCK = fixedClock(NOW);

const OWNERSHIP = createOwnershipService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  hr: datasetHrDirectory(DATASET),
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const ACCESS = createAccessService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  owners: memoizedAccessOwner(OWNERSHIP),
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const EXPOSURE = createExposureService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: memoizedExposureOwnership(OWNERSHIP),
});

const OWNERSHIP_SOURCE = memoizedExposureOwnership(OWNERSHIP);
const EXPOSURE_SOURCE = memoizedImpactExposure(EXPOSURE);

const IMPACT = createImpactService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: OWNERSHIP_SOURCE,
  exposure: EXPOSURE_SOURCE,
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

function profileOf(identityId: string): ImpactProfile {
  const outcome = IMPACT.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile;
}

function assessmentOf(identityId: string): ImpactAssessment {
  return profileOf(identityId).assessment;
}

// --- The condition this module exists under ---------------------------------

/**
 * Research §7.2, enforced rather than promised.
 *
 * Two subtrees are exempt and both are *quotations*: `ownership` carries
 * `ownership/severity.ts`'s verdict and `exposure` carries `exposure/score.ts`'s,
 * each authored elsewhere and copied here so a reviewer cannot see one ranking
 * without the others (§5 step 6). Everything this module writes itself is walked,
 * and the next test proves the exemptions are copies rather than a hiding place.
 *
 * `band` is on the list because it is exposure's four-word vocabulary for the same
 * axis, and re-emitting it under this module's own name is how two rankers end up
 * sharing a column heading — the §7.2 stage risk in its cheapest form.
 */
test('nothing this module authors is a score, a rank or a band', () => {
  const forbidden = [
    'severity',
    'rank',
    'score',
    'priority',
    'band',
    'exposure_score',
    'weighted_sum',
    'exploitable_risk_score',
    'risk_score',
  ];
  /** Quoted from another authority, asserted verbatim below rather than walked. */
  const quotations = ['ownership', 'exposure'];

  function walk(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbidden.includes(key), false, `${trail}.${key} ranks something`);
      assert.equal(key.endsWith('_score'), false, `${trail}.${key} is score-shaped`);
      if (!quotations.includes(key)) {
        walk(nested, `${trail}.${key}`);
      }
    }
  }

  walk(IMPACT.chokePoints(), 'chokePoints()');
  walk(IMPACT.simulate('connect:ledger-writer'), 'simulate()');
  for (const identity of DATASET.identities) {
    walk(IMPACT.profile(identity.id), `profile(${identity.id})`);
  }
});

/**
 * The other half of the guard: an exemption that is not a copy is a loophole.
 *
 * A module could satisfy the test above by renaming its own score to `exposure` and
 * hiding it in the exempt subtree, so both quotations are asserted identical to what
 * the ports returned. This is also the assertion that keeps §5 step 6 honest in the
 * other direction — the context has to actually be there, not merely be unranked.
 */
test('the quoted subtrees are verbatim copies of the authorities that own them', () => {
  for (const identityId of ['user-jane', 'agent-support-triage', 'user-maya', 'svc-vpn-legacy']) {
    const profile = profileOf(identityId);

    assert.deepEqual(profile.ownership, OWNERSHIP_SOURCE.context(identityId), identityId);
    assert.deepEqual(profile.exposure.assessment, EXPOSURE_SOURCE.assessment(identityId), identityId);
    assert.equal(profile.exposure.why_these_differ, IMPACT_VERSUS_EXPOSURE, identityId);
  }

  for (const candidate of IMPACT.chokePoints().candidates) {
    for (const affected of candidate.affected_identities) {
      assert.deepEqual(
        affected.ownership,
        OWNERSHIP_SOURCE.context(affected.identity_id),
        `${candidate.permission} -> ${affected.identity_id}`,
      );
    }
  }
});

/**
 * The null arm is currently unreachable, and is recorded rather than removed.
 *
 * Same device as `seed.test.ts`'s assertion that `OwnerSource.inferred` is emitted
 * by nothing: an equality over the population, so the state's arrival is a test
 * failure on the day some `ImpactExposureSource` starts declining an identity
 * rather than a silent widening of what consumers must handle.
 *
 * It is unreachable for two compounding reasons. `profile()` rejects an unknown id
 * before exposure is ever consulted, and `ExposureService.profile` — unlike its
 * `list()` — declines nothing, including groups. The second is the seam the next
 * test pins.
 */
test('no identity in the estate is missing an exposure verdict today', () => {
  const missing = DATASET.identities.filter(
    (identity) => profileOf(identity.id).exposure.assessment === null,
  );

  assert.deepEqual(missing, []);
});

/**
 * **A pre-existing seam this module walks straight into, pinned where it is now
 * visible.** Not a defect introduced here, and not this module's to fix.
 *
 * `ExposureService.list()` excludes groups by design — "permission containers, not
 * things a person owns" — and so does `summary().identities_scanned`. But
 * `ExposureService.profile()` does not, so all twelve seed groups carry a score
 * that appears in no exposure table, and `group-oncall-agents` carries `extensive`,
 * which would place it inside the estate's top band. This is the same `list()`
 * versus per-id disagreement already recorded against `ownership/classify.ts`.
 *
 * It matters here specifically because that group is the holder of the estate's top
 * choke point, so a reviewer drilling from the beat-30 row into the thing they are
 * being told to change lands on exactly this page. Asserted as an equality so that
 * whichever way the disagreement is settled, this test is part of the change.
 */
test('the group holding the top choke point is scored by exposure but listed by nobody', () => {
  const group = profileOf('group-oncall-agents');
  const quoted = group.exposure.assessment;

  assert.ok(quoted !== null);
  assert.equal(quoted.kind, 'scored');
  assert.ok(quoted.kind === 'scored');
  assert.equal(quoted.band, 'extensive');

  assert.deepEqual(
    EXPOSURE.list({ includeNoPaths: true }).filter((row) => row.identity_id === 'group-oncall-agents'),
    [],
    'and it is in no exposure table at any filter',
  );
  assert.equal(group.exposure.why_these_differ, IMPACT_VERSUS_EXPOSURE);
});

// --- The three arms ---------------------------------------------------------

/**
 * Architecture rule 7, and PRD §6.4's green banner made correct.
 *
 * All three arms are reachable from the seed, asserted as an equality rather than a
 * spot check so an arm that stops being producible fails here. `no_pivot_paths` is
 * the banner's case — access, but no boundary crossed — and `no_access` is the one
 * it would have been wrong for, because there was no footprint to analyse.
 */
test('every assessment arm is reachable from the estate', () => {
  const counts = new Map<string, number>();
  for (const identity of DATASET.identities) {
    const kind = assessmentOf(identity.id).kind;
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }

  assert.deepEqual(
    [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)),
    [
      ['no_access', 21],
      ['no_pivot_paths', 106],
      ['propagates', 13],
    ],
  );

  assert.equal(assessmentOf('user-grace').kind, 'no_pivot_paths', 'sensitive access, no pivot');
  assert.equal(assessmentOf('svc-fixture-cycle-a').kind, 'no_access', 'an engine probe');
  assert.equal(assessmentOf('user-jane').kind, 'propagates');
});

/**
 * Research §5 step 1, with the correction this module makes to it.
 *
 * §5 step 1 derives `identities_reachable` from `AccessPath.assumed_identity`, which
 * names only a path's front crossing — on the beat-23 chain that is
 * `role-runbook-executor` for all three paths, so the count would read 1. The agent
 * demonstrably reaches two principals, and crossing-based counting says so. The
 * profile and the choke-point table use the same derivation, which is why severing
 * the front grant costs this identity all three permissions.
 */
test('the counts describe the whole chain, not just its first crossing', () => {
  const assessment = assessmentOf('agent-support-triage');
  assert.ok(assessment.kind === 'propagates');

  assert.equal(assessment.counts.identities_reachable, 2);
  assert.equal(assessment.counts.highest_sensitivity_reached, 'admin:warehouse');

  assert.deepEqual(
    assessment.pivots.map((pivot) => [pivot.via_permission, pivot.assumed_identity]),
    [
      ['mcp:connect-prod-runbook', 'role-runbook-executor'],
      ['mcp:connect-warehouse-box', 'role-warehouse-admin'],
    ],
  );

  const [outer, inner] = assessment.pivots;
  assert.ok(outer !== undefined && inner !== undefined);
  assert.equal(outer.assumed_identity_app, 'mcp-gateway');
  assert.equal(inner.assumed_identity_app, 'snowflake', 'the chain ends in another system');
  assert.equal(outer.deepest_hop_count, 6);
});

/**
 * The rota member with no grants of its own — the widest gap in the estate between
 * what an entitlement screen shows and what the identity can do.
 */
test('an identity whose whole footprint is inherited still propagates', () => {
  const assessment = assessmentOf('user-tomas');
  assert.ok(assessment.kind === 'propagates');

  assert.deepEqual(GRAPH.byId.get('user-tomas')?.direct_grants, []);
  assert.equal(assessment.counts.resources_reachable, 4);
  assert.equal(assessment.counts.identities_reachable, 2);
  assert.equal(assessment.counts.highest_sensitivity_reached, 'admin:warehouse');
});

// --- The report -------------------------------------------------------------

/**
 * The selection method travels with the answer — research §4.4.
 *
 * Without it, an exact ranking and a bounded approximation are indistinguishable on
 * the wire, which is the choke-point equivalent of publishing a score with no vector.
 */
test('the report publishes its selection method and its denominators', () => {
  const report = IMPACT.chokePoints();

  assert.equal(report.selection.method, 'exhaustive');
  assert.equal(report.selection.candidates_evaluated, report.selection.candidate_space);
  assert.deepEqual(report.baseline, {
    reachable_pairs: 208,
    pivot_edges: 18,
    identities_scanned: 128,
  });
  assert.equal(report.snapshot.graph_snapshot_at, NOW.toISOString());
});

/**
 * Demo beat 30 — and the row that makes the module worth showing.
 *
 * Every rung of the chain is `owned` at severity `none`. Nobody was negligent, three
 * teams each attested correctly to the thing they are responsible for, and the most
 * valuable revocation in the estate is still sitting there — invisible to ownership,
 * to lineage, and to any per-identity view. Research §5's worked example ends on
 * exactly this line.
 */
test('beat 30: the top choke point is a finding no other module can produce', () => {
  const top = IMPACT.chokePoints().candidates[0];
  assert.ok(top !== undefined);

  assert.equal(top.permission, 'mcp:connect-prod-runbook');
  assert.deepEqual(top.held_by, ['group-oncall-agents']);
  assert.equal(top.affected_identities.length, 4);

  for (const affected of top.affected_identities) {
    assert.equal(affected.ownership.state, 'owned', affected.identity_id);
    assert.equal(affected.ownership.severity, 'none', affected.identity_id);
    assert.equal(affected.permissions_lost.length > 0, true, affected.identity_id);
  }

  assert.deepEqual(
    [...new Set(top.affected_identities.map((affected) => affected.identity_type))].sort(),
    ['ai_agent', 'human', 'service_account'],
  );
});

/** Demo beat 31 — the honesty beat, reached through the service rather than the selector. */
test('beat 31: the mechanism_only row carries its surviving route', () => {
  const redundant = IMPACT.chokePoints().candidates.find(
    (candidate) => candidate.permission === 'connect:ledger-writer',
  );

  assert.ok(redundant !== undefined);
  assert.equal(redundant.closes, 'mechanism_only');
  assert.equal(redundant.access_removed.removed, 0);
  assert.deepEqual(redundant.affected_identities, []);
  assert.deepEqual(redundant.surviving_routes, [
    {
      identity_id: 'svc-invoice-poster',
      permission: 'write:invoice-queue',
      route_types: ['indirect'],
    },
  ]);
});

// --- Simulation -------------------------------------------------------------

/**
 * `ITAG.md` §F7's before/after diff, and the reason it shares a code path with the
 * table: two implementations of "what happens if we cut this" would be two answers
 * to the same question, and a reviewer who saw them disagree could not adjudicate.
 */
test('simulating a cut agrees with the choke-point table exactly', () => {
  const outcome = IMPACT.simulate('mcp:connect-prod-runbook');
  assert.ok(outcome.ok);

  const tabled = IMPACT.chokePoints().candidates.find(
    (candidate) => candidate.permission === 'mcp:connect-prod-runbook',
  );
  assert.ok(tabled !== undefined);

  assert.deepEqual(outcome.access_removed, tabled.access_removed);
  assert.deepEqual(outcome.mechanisms_closed, tabled.mechanisms_closed);
  assert.deepEqual(outcome.affected_identities, tabled.affected_identities);
  assert.equal(outcome.closes, tabled.closes);

  assert.equal(outcome.before.reachable_pairs - outcome.after.reachable_pairs, 12);
  assert.equal(outcome.after.identities_scanned, outcome.before.identities_scanned);
});

/**
 * Architecture rule 6 — only `validateDataset` throws, and it does so at boot.
 *
 * Two error arms rather than one, because "no such permission" and "that permission
 * exists but confers nobody" send a caller to different places: the first is a typo,
 * the second is a permission that is simply not severable in this model.
 */
test('an unsimulatable request is a terminal state, not a throw', () => {
  const missing = IMPACT.simulate('connect:does-not-exist');
  assert.equal(missing.ok, false);
  assert.ok(!missing.ok);
  assert.equal(missing.error, 'unknown_permission');

  const ordinary = IMPACT.simulate('read:dashboards');
  assert.equal(ordinary.ok, false);
  assert.ok(!ordinary.ok);
  assert.equal(ordinary.error, 'not_a_pivot_binding');
  assert.equal(ordinary.permission, 'read:dashboards');
});

test('an unknown identity is reported, not thrown', () => {
  const outcome = IMPACT.profile('svc-does-not-exist');

  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error, 'unknown_identity');
  assert.equal(outcome.identity_id, 'svc-does-not-exist');
});

// --- Staleness --------------------------------------------------------------

/**
 * Research §2 and §6 — the key Exposure Map established, and the one it declined.
 *
 * The source PRD §4.4 asks for `stale_if_older_than_hours` on the grounds that
 * Exposure Map set the convention. It did not: it published
 * `based_on_access_discovery_snapshot` and refused the threshold as a deployment
 * policy rather than a fact about a snapshot. An equality on the key set rather than
 * a presence check, so the refused field cannot arrive later without failing here.
 */
test('staleness dates the facts it read, and publishes no freshness threshold', () => {
  const staleness = profileOf('user-jane').staleness;

  assert.deepEqual(Object.keys(staleness).sort(), [
    'based_on_access_discovery_snapshot',
    'computed_at',
  ]);
  assert.equal(staleness.based_on_access_discovery_snapshot, NOW.toISOString());
  assert.equal(staleness.computed_at, NOW.toISOString());
});

/**
 * The snapshot is copied from the module that produced the facts, not re-read from
 * this module's clock. Same contract `ExposureStaleness` holds, asserted the same
 * way: skew the impact service's clock and only `computed_at` moves.
 */
test('a later compute instant does not re-date the facts', () => {
  const later = new Date('2026-08-02T09:30:00Z');
  const skewed = createImpactService({
    graphSource: GRAPH_SOURCE,
    clock: fixedClock(later),
    access: ACCESS,
    ownership: OWNERSHIP_SOURCE,
    exposure: EXPOSURE_SOURCE,
    policy: DEFAULT_ACCOUNTABILITY_POLICY,
  });

  const outcome = skewed.profile('user-jane');
  assert.ok(outcome.ok);

  assert.equal(outcome.profile.staleness.based_on_access_discovery_snapshot, NOW.toISOString());
  assert.equal(outcome.profile.staleness.computed_at, later.toISOString());
});
