import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccessService } from '../access/service.js';
import { memoizedAccessOwner } from '../adapters/access-owner.js';
import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoizedExposureOwnership } from '../adapters/exposure-ownership.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import type { ExposureProfile, ExposureRow } from '../domain/exposure.js';
import { EXPOSURE_VERSUS_SEVERITY } from '../domain/exposure.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createExposureService } from './service.js';

/**
 * Identity Exposure Map against the demo estate.
 *
 * Every number below is a number that appears on screen during beats 24-29 of
 * `docs/demo-script.md`, computed against the clock the demo runs with. The seed's
 * *data* properties are already pinned in `data/seed-exposure.test.ts`; what is
 * pinned here is the arithmetic on top of them, so a seed change and a scoring
 * change fail in different files.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);

const OWNERSHIP = createOwnershipService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  hr: datasetHrDirectory(DATASET),
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const ACCESS = createAccessService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  owners: memoizedAccessOwner(OWNERSHIP),
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const EXPOSURE = createExposureService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  access: ACCESS,
  ownership: memoizedExposureOwnership(OWNERSHIP),
});

function profileOf(identityId: string): ExposureProfile {
  const outcome = EXPOSURE.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile;
}

function scoredOf(identityId: string) {
  const { assessment } = profileOf(identityId);
  assert.equal(assessment.kind, 'scored', `${identityId} should be scorable`);
  assert.ok(assessment.kind === 'scored');
  return assessment;
}

// --- The table the demo is read off -----------------------------------------

/**
 * Beats 24-28, as the numbers rather than as the data.
 *
 * Asserted as one table because the *relationships* between these rows are the
 * demo, not any single value: breadth above depth, depth above the ordinary, and
 * an unscorable row that is neither. A change that moved all of them together
 * would still be a change to what the demo says.
 */
const EXPECTED_SCORES: readonly (readonly [string, number, number])[] = [
  // identity, weighted_sum, exposure_score
  ['user-maya', 4, 97],
  ['agent-support-triage', 3.35, 94],
  ['user-jane', 1.8, 78],
  ['user-grace', 1.1, 60],
  ['svc-invoice-poster', 0.25, 19],
  ['svc-platform-watchdog', 0.2, 15],
];

test('every demo identity scores exactly what the research document publishes', () => {
  for (const [identityId, weightedSum, exposureScore] of EXPECTED_SCORES) {
    const assessment = scoredOf(identityId);
    assert.equal(assessment.weighted_sum, weightedSum, `weighted_sum for ${identityId}`);
    assert.equal(assessment.exposure_score, exposureScore, `exposure_score for ${identityId}`);
  }
});

/**
 * Beat 25 — the comparison the module exists to make, pinned as an ordering.
 *
 * `user-jane` reaches production platform admin through a hop nothing else in the
 * product surfaces. `user-maya` reaches forty read grants and outscores her. That
 * is the reverse of what PRD §1 predicted and it is deliberate (Amendment 7):
 * sensitivity and breadth are independent axes, this is the pair where they
 * disagree, and a model tuned until it always agrees with the sensitivity flag has
 * added nothing to the sensitivity flag.
 *
 * If this ever reverses, research §1.3, PRD Amendment 7 and the demo script are
 * all describing a different chart.
 */
test('beat 25: breadth outscores depth, and the derivation says why', () => {
  const maya = scoredOf('user-maya');
  const jane = scoredOf('user-jane');

  assert.equal(maya.weighted_sum > jane.weighted_sum, true, 'the ordering is the claim');
  assert.equal(maya.exposure_score > jane.exposure_score, true);

  // Jane's score is one path. Maya's is forty, and no single one of them explains
  // it — which is the sentence PRD §6.4's summary card exists to deliver, twice,
  // in opposite directions.
  assert.equal(jane.contributions[0]?.permission, 'admin:platform');
  assert.equal(Math.round((jane.contributions[0]?.share_of_score ?? 0) * 100), 83);
  assert.equal(Math.round((maya.contributions[0]?.share_of_score ?? 0) * 1000) / 10, 2.5);

  assert.equal(jane.highest_sensitivity_reached, 'admin:platform');
  assert.equal(
    maya.highest_sensitivity_reached,
    null,
    'the widest footprint in the estate reaches nothing sensitive at all',
  );
});

/**
 * Beat 26 — the identity the score refuses to compute, and why that is the honest
 * output rather than a gap.
 *
 * All six of its permissions are `unclassified`, so §5 excludes every one and the
 * weighted sum would be taken over an empty set. Rule 7 forbids reporting that as
 * `0`: "reaches nothing" and "reaches six things nobody has assessed" are
 * different findings with different remediations.
 */
test('beat 26: an all-unclassified identity is unscored, not zero', () => {
  const profile = profileOf('svc-partner-sync');

  assert.equal(profile.assessment.kind, 'no_classified_permissions');
  assert.ok(profile.assessment.kind === 'no_classified_permissions');
  assert.deepEqual(profile.assessment.unclassified_permissions, [
    'partner:audit-feed',
    'partner:catalog-sync',
    'partner:credential-rotate',
    'partner:invoice-callback',
    'partner:sandbox-export',
    'partner:webhook-replay',
  ]);

  assert.equal(profile.exposure_set.total_permissions, 6, 'it reaches plenty');
  assert.equal(profile.exposure_set.counted, 0, 'and none of it could be weighed');
  assert.equal(
    'exposure_score' in profile.assessment,
    false,
    'the field does not exist on this arm, so no consumer can render a number',
  );
});

/**
 * Beat 27 — PRD §8's second open question, answered by the arithmetic.
 *
 * `write:invoice-queue` arrives as both `indirect` (m = 1.0) and `hop` (m = 1.5).
 * §5 step 1 takes the worst, so the choice *moves the score* — the first pair in
 * the estate where de-duplication is not free — and `route_count` carries what the
 * choice discarded. Closing the hop leaves the permission reachable, and the
 * payload has to be able to say so.
 */
test('beat 27: two mechanisms to one permission, and the worse one scores', () => {
  const profile = profileOf('svc-invoice-poster');
  const contested = profile.exposure_set.entries.find(
    (entry) => entry.permission === 'write:invoice-queue',
  );

  assert.ok(contested !== undefined);
  assert.equal(contested.route_count, 2);
  assert.deepEqual(contested.route_types, ['hop', 'indirect']);
  assert.equal(contested.scored_route.path_type, 'hop');
  assert.equal(contested.scored_route.hop_count, 3, 'and this is the ring it is drawn in');
  assert.equal(contested.min_hop_distance, 2, 'while the shorter route is still published');

  // Three paths, two permissions — the gap is why the table counts permissions.
  assert.equal(profile.exposure_set.total_permissions, 2);

  const assessment = scoredOf('svc-invoice-poster');
  const scored = assessment.contributions.find(
    (entry) => entry.permission === 'write:invoice-queue',
  );
  assert.equal(scored?.mechanism_multiplier, 1.5, 'the hop multiplier, not the membership one');

  // `user-grace` is the harmless version: two routes that share a multiplier, so
  // collapsing them cannot move her number and only the remediation advice differs.
  const grace = profileOf('user-grace').exposure_set.entries.find(
    (entry) => entry.permission === 'read:finance-db',
  );
  assert.deepEqual(grace?.route_types, ['direct', 'indirect']);
  assert.equal(
    grace?.scored_route.path_type,
    'indirect',
    'worse than direct, and worth exactly the same',
  );
});

/**
 * Beat 28 — the rings measure distance rather than restate the path-type column.
 *
 * Research §4.1 refused to build the map until the dataset contained an
 * `(path_type, hop_distance)` pair that broke the collinearity. `read:metrics`
 * through two nested groups is that pair: still `indirect`, because the mechanism
 * is still membership, but three edges out rather than two.
 */
test('beat 28: an indirect permission sits in the outer ring', () => {
  const profile = profileOf('svc-platform-watchdog');

  assert.deepEqual(
    profile.rings.map((ring) => [ring.hop_distance, ring.permissions.map((e) => e.permission)]),
    [[1, ['read:job-run-status']], [3, ['read:metrics']]],
    'ring 2 is absent because nothing is there — no empty buckets, no 3+ bucket',
  );

  const nested = profile.rings[1]?.permissions[0];
  assert.equal(nested?.scored_route.path_type, 'indirect', 'two memberships are a membership');
  assert.equal(nested?.min_hop_distance, 3);
});

// --- The published derivation -----------------------------------------------

/**
 * Research §4.3, enforced across the whole estate rather than on one worked example.
 *
 * FIRST requires publishing the vector as a condition of using CVSS, and a score
 * whose breakdown does not add up to it is worse than a score with no breakdown —
 * it invites a reviewer to check the arithmetic and then loses their trust.
 */
test('every published score is reconstructible from its own contributions', () => {
  for (const row of EXPOSURE.list({ includeNoPaths: true })) {
    if (row.assessment.kind !== 'scored') {
      continue;
    }
    const resummed = row.assessment.contributions.reduce(
      (running, entry) => running + entry.contribution,
      0,
    );
    assert.equal(
      Math.abs(resummed - row.assessment.weighted_sum) < 1e-9,
      true,
      `contributions do not reconstruct weighted_sum for ${row.identity_id}`,
    );

    const shares = row.assessment.contributions.reduce(
      (running, entry) => running + entry.share_of_score,
      0,
    );
    assert.equal(Math.abs(shares - 1) < 1e-9, true, `shares do not total 1 for ${row.identity_id}`);

    assert.equal(
      row.assessment.contributions.length,
      row.reachable_permissions - row.unclassified_permissions,
      `${row.identity_id} has a counted permission missing from its breakdown`,
    );
  }
});

// --- The line this module is allowed to cross, and the price of crossing it --

/**
 * The mirror of `access/classify.test.ts`'s guard, pointed the other way.
 *
 * That test walks Access Discovery's output and fails on any key named `severity`,
 * `rank`, `score` or `priority`, because `docs/PRD-access-discovery.md` L30 makes
 * scoring a non-goal there. Research §7.2 grants the exception *here* and nowhere
 * else, so the failure worth guarding is the opposite one: a score leaking back
 * into the path objects this module borrows from the module that promised not to
 * have one.
 */
test('a score never leaks onto the access objects this module borrows', () => {
  const forbidden = ['severity', 'rank', 'score', 'priority', 'exposure_score', 'weighted_sum'];

  function walkPath(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walkPath(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbidden.includes(key), false, `${trail}.${key} ranks something`);
      walkPath(nested, `${trail}.${key}`);
    }
  }

  for (const row of EXPOSURE.list()) {
    const profile = profileOf(row.identity_id);
    for (const entry of profile.exposure_set.entries) {
      walkPath(entry.scored_route, `${row.identity_id}.${entry.permission}.scored_route`);
    }
  }
});

/**
 * The other half of the exception: the score has to actually be here.
 *
 * A guard that only forbids is satisfied by a module that emits nothing. Research
 * §7.2's grant is conditional on this module carrying the number, so its absence
 * from a scored row is as much a defect as its presence upstream.
 */
test('every scored row carries the score and the derivation together', () => {
  const rows = EXPOSURE.list();
  assert.equal(rows.length > 0, true);

  for (const row of rows) {
    if (row.assessment.kind !== 'scored') {
      continue;
    }
    assert.equal(typeof row.assessment.exposure_score, 'number', row.identity_id);
    assert.equal(typeof row.assessment.weighted_sum, 'number', row.identity_id);
    assert.equal(row.assessment.contributions.length > 0, true, row.identity_id);
    assert.equal(Array.isArray(row.assessment.unclassified_permissions), true, row.identity_id);
  }
});

/**
 * Research §7.2's stage risk, closed in the payload rather than in a README.
 *
 * `user-jane` is `owned` at severity `none` and 78/100 here. A reviewer shown one
 * of those numbers without the other learns the wrong thing, so ownership's
 * verdict and the sentence reconciling the two are required fields on every row
 * and every profile — a UI physically cannot render one without the other.
 */
test('ownership travels with exposure on every row, so two rankers cannot be shown apart', () => {
  function assertDisclosed(carrier: ExposureRow | ExposureProfile, label: string): void {
    assert.equal(typeof carrier.ownership.state, 'string', label);
    assert.equal(typeof carrier.ownership.severity, 'string', label);
    assert.equal(carrier.ownership.why_these_differ, EXPOSURE_VERSUS_SEVERITY, label);
  }

  for (const row of EXPOSURE.list({ includeNoPaths: true })) {
    assertDisclosed(row, row.identity_id);
  }
  assertDisclosed(profileOf('user-jane'), 'user-jane profile');

  const jane = profileOf('user-jane');
  assert.equal(jane.ownership.state, 'owned');
  assert.equal(jane.ownership.severity, 'none', 'green in the other module, and 78 in this one');
  assert.equal(scoredOf('user-jane').exposure_score, 78);
});

// --- Staleness --------------------------------------------------------------

/**
 * PRD §4.4 — the snapshot is *copied* from Access Discovery, never re-read.
 *
 * Proved by handing the two services different clocks. If the field were derived
 * from this module's own clock the two timestamps would agree, and the contract
 * that a consumer dates the facts it *read* rather than the moment it read them
 * would be satisfied by coincidence rather than by construction.
 */
test('the snapshot comes from Access Discovery, not from this module clock', () => {
  const later = new Date('2026-08-04T09:30:00Z');
  const skewed = createExposureService({
    graphSource: { graph: () => GRAPH },
    clock: fixedClock(later),
    access: ACCESS,
    ownership: memoizedExposureOwnership(OWNERSHIP),
  });

  const outcome = skewed.profile('user-jane');
  assert.ok(outcome.ok);
  assert.equal(
    outcome.profile.staleness.based_on_access_discovery_snapshot,
    NOW.toISOString(),
    'the facts are four days old and the payload says so',
  );
  assert.equal(
    outcome.profile.staleness.computed_at,
    later.toISOString(),
    'and the compute instant is separately visible, so the gap is legible',
  );
  assert.equal(skewed.summary().snapshot.graph_snapshot_at, NOW.toISOString());
});

// --- The estate -------------------------------------------------------------

/**
 * §7's gate metrics, and the population they were computed over.
 *
 * Three counts rather than one `unscored`, because they are three claims. The
 * completeness ratio is the number research §3.2 promotes from a metric to a gate:
 * it is the precondition for any score on the screen meaning anything.
 */
test('the summary publishes the gate before it publishes the ranking', () => {
  const summary = EXPOSURE.summary();

  assert.equal(summary.scored, 105);
  assert.equal(summary.no_classified_permissions, 1);
  assert.equal(summary.no_paths, 21);
  assert.equal(summary.identities_scanned, 127);
  assert.equal(
    summary.scored + summary.no_classified_permissions + summary.no_paths,
    summary.identities_scanned,
    'every scanned identity lands in exactly one of the three states',
  );

  assert.deepEqual(summary.classification_completeness, {
    classified: 80,
    unclassified: 6,
    total: 86,
    ratio: 80 / 86,
  });

  /**
   * The top band grew from 7 to 12 when `seed/impact.ts` landed, and none of the
   * five it gained is a threshold change: three are on-call rota members who were
   * always able to reach `admin:warehouse` and had no row until the group had more
   * than one member, and two are the release chain reaching `deploy:prod`. Whether
   * a band this size is still reviewable is a real question — research §7.2 leaves
   * it open — but it is a question about the estate, not about the arithmetic.
   */
  assert.deepEqual(
    summary.band_counts.map((entry) => [entry.band, entry.floor, entry.count]),
    [
      ['extensive', 75, 12],
      ['substantial', 50, 19],
      ['limited', 25, 1],
      ['minimal', 0, 73],
    ],
    'the top band is a reviewable queue rather than a degenerate bucket',
  );

  assert.equal(summary.snapshot.graph_snapshot_at, NOW.toISOString());
});

/**
 * Architecture rule 12 — groups are not subjects.
 *
 * A group's grants already appear as the indirect paths of every member, so
 * scoring the group as well would count the same permission twice and make the
 * estate's totals depend on how it happens to be foldered. Same exclusion as
 * `access/service.ts` and `ownership/classify.ts`, and the arithmetic identity
 * below is how it stays true as the seed grows.
 */
test('groups are excluded from the population, and the arithmetic proves it', () => {
  const groups = DATASET.identities.filter((identity) => identity.type === 'group');

  assert.equal(EXPOSURE.summary().identities_scanned + groups.length, DATASET.identities.length);
  assert.deepEqual(
    EXPOSURE.list({ includeNoPaths: true })
      .map((row) => row.identity_id)
      .filter((id) => groups.some((group) => group.id === id)),
    [],
  );
});

/**
 * The landing table's default population, and why it is asymmetric.
 *
 * An identity that reaches nothing has nothing to triage — and in this dataset all
 * 21 of them are `svc-fixture-*` engine probes. An identity whose entire footprint
 * is unassessed is precisely what §7's completeness gate exists to put in front of
 * someone, so it is never hidden.
 */
test('rows with no paths are hidden by default; rows with nothing assessed never are', () => {
  const listed = EXPOSURE.list();
  const everything = EXPOSURE.list({ includeNoPaths: true });

  assert.equal(listed.length, 106);
  assert.equal(everything.length, 127);
  assert.deepEqual(listed.filter((row) => row.assessment.kind === 'no_paths'), []);
  assert.equal(
    listed.some((row) => row.identity_id === 'svc-partner-sync'),
    true,
    'beat 26 is on the landing table without a filter being touched',
  );

  assert.deepEqual(
    everything
      .filter((row) => row.assessment.kind === 'no_paths')
      .map((row) => row.identity_id.includes('-fixture-')),
    Array.from({ length: 21 }, () => true),
    'every zero-path identity is an engine probe, so the state is real but never demoed',
  );
});

/**
 * Widest footprint first, sorted on `weighted_sum` rather than the published score.
 *
 * Saturation compresses the top — everything past `S = 8` reads the same — so
 * sorting on the 0-100 would leave the most exposed identities in arbitrary order
 * exactly where the order matters most.
 */
test('the table opens on the widest footprint in the estate', () => {
  const rows = EXPOSURE.list();

  assert.equal(rows[0]?.identity_id, 'user-maya');
  assert.equal(rows[1]?.identity_id, 'agent-support-triage');
  assert.equal(
    rows[rows.length - 1]?.identity_id,
    'svc-partner-sync',
    'the unscorable row sorts last rather than being interleaved by a fabricated zero',
  );

  const sums = rows
    .filter((row) => row.assessment.kind === 'scored')
    .map((row) => (row.assessment.kind === 'scored' ? row.assessment.weighted_sum : 0));
  assert.deepEqual([...sums].sort((left, right) => right - left), sums, 'descending by S');
});

// --- Filters and terminal states --------------------------------------------

test('a filter on a score does not match a row that has not got one', () => {
  const minimal = EXPOSURE.list({ minScore: 0 });

  assert.deepEqual(
    minimal.filter((row) => row.assessment.kind !== 'scored'),
    [],
    'min_score=0 is still a filter on a score, so the unscored are not swept in as zero',
  );
  assert.equal(minimal.length, 105);

  /**
   * The three rota members tie at `S = 3.25`, so their relative order is decided by
   * `compareRows`' final `localeCompare` and is stable rather than incidental. It is
   * pinned here for the same reason the rest of the list is: the demo reads this
   * order off the screen.
   */
  assert.deepEqual(
    EXPOSURE.list({ band: 'extensive' }).map((row) => row.identity_id),
    [
      'user-maya',
      'agent-support-triage',
      'agent-incident-responder',
      'svc-runbook-scheduler',
      'user-tomas',
      'role-runbook-executor',
      'svc-payroll-export',
      'svc-vpn-legacy',
      'user-heidi',
      'svc-release-orchestrator',
      'user-jane',
      'svc-hotfix-deployer',
    ],
  );
  assert.deepEqual(
    EXPOSURE.list({ minScore: 90 }).map((row) => row.identity_id),
    [
      'user-maya',
      'agent-support-triage',
      'agent-incident-responder',
      'svc-runbook-scheduler',
      'user-tomas',
    ],
  );
});

/**
 * Architecture rule 6 — an unknown id is a terminal state, not a throw.
 *
 * Only `validateDataset` throws, and it does so at boot. Mirrors `AccessOutcome`,
 * which is the shape two downstream branches are already coding against.
 */
test('an unknown identity is reported, not thrown', () => {
  const outcome = EXPOSURE.profile('svc-does-not-exist');

  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok);
  assert.equal(outcome.error, 'unknown_identity');
  assert.equal(outcome.identity_id, 'svc-does-not-exist');
});

/**
 * Amendment 5 — `exposure_delta` is absent, not null, and stays that way.
 *
 * The graph is built once from a frozen dataset, so a 30-day trend would be
 * fabricated and a `rising_fast` badge derived from it would be a fabricated
 * alarm — worse than a missing field, because it is actionable. Asserted
 * structurally rather than trusted to review, because the pressure to add it back
 * comes from a PRD section that is still in the repo.
 */
test('no delta, no trend and no rising-fast badge appears anywhere in the output', () => {
  const banned = ['exposure_delta', 'delta_30d', 'rising_fast', 'flag', 'trend'];

  function walk(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(banned.includes(key), false, `${trail}.${key} is a fabricated trend`);
      walk(nested, `${trail}.${key}`);
    }
  }

  walk(EXPOSURE.list({ includeNoPaths: true }), 'list');
  walk(EXPOSURE.summary(), 'summary');
  walk(profileOf('user-jane'), 'profile');
});
