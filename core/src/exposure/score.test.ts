import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AccessPath, AccessPathType } from '../domain/access.js';
import type { PermissionSensitivity } from '../domain/exposure.js';
import {
  bandFor,
  collapseToExposureSet,
  contributionsOf,
  highestSensitivityReached,
  HOP_MULTIPLIER,
  NOT_SENSITIVE_WEIGHT,
  ringsOf,
  saturate,
  SATURATION_CONSTANT,
  SENSITIVE_WEIGHT,
  unclassifiedPermissionsOf,
  weightedSum,
} from './score.js';

/**
 * The algorithm alone — `docs/identity-exposure-map-research.md` §5.
 *
 * Hand-built paths rather than the seed, because the properties asserted here are
 * arithmetic and should fail for arithmetic reasons. The seed's numbers are pinned
 * in `service.test.ts`, where a change to the estate is the thing being caught.
 */

// --- Fixtures ---------------------------------------------------------------

function path(
  permission: string,
  pathType: AccessPathType,
  hopCount: number,
  sensitive = false,
): AccessPath {
  const base = {
    identity_id: 'subject',
    app: 'fx',
    identity_type: 'service_account' as const,
    permission,
    sensitive,
    hop_count: hopCount,
    chain: [],
  };
  if (pathType === 'hop') {
    return { ...base, path_type: 'hop', via_permission: 'connect:thing', assumed_identity: 'role-thing' };
  }
  if (pathType === 'indirect') {
    return { ...base, path_type: 'indirect', via_group: 'group-thing' };
  }
  return { ...base, path_type: 'direct' };
}

function lookup(overrides: Readonly<Record<string, PermissionSensitivity>>) {
  return (permission: string): PermissionSensitivity => overrides[permission] ?? 'not_sensitive';
}

// --- Step 1: collapse -------------------------------------------------------

/**
 * The de-duplication PRD §4.2 step 2 asks for, and the thing §8's second open
 * question worries it hides.
 *
 * Two routes to one permission with *different* mechanisms: the worst one scores,
 * the shorter one is still published, and the count says a route was discarded.
 * A reviewer who closes the hop has not cleared the permission, and the payload
 * has to be able to say so.
 */
test('a permission reached two ways collapses to the worst mechanism and keeps the rest', () => {
  const entries = collapseToExposureSet(
    [path('write:queue', 'indirect', 2), path('write:queue', 'hop', 3), path('read:thing', 'direct', 1)],
    lookup({}),
  );

  assert.equal(entries.length, 2, 'three paths, two permissions');

  const contested = entries.find((entry) => entry.permission === 'write:queue');
  assert.ok(contested !== undefined);
  assert.equal(contested.scored_route.path_type, 'hop', 'the mechanism a reviewer acts on');
  assert.equal(contested.scored_route.hop_count, 3, 'and the ring it is drawn in');
  assert.equal(contested.min_hop_distance, 2, 'the shorter route is still published');
  assert.equal(contested.route_count, 2);
  assert.deepEqual(contested.route_types, ['hop', 'indirect'], 'sorted, so it reads the same everywhere');
});

test('collapse is order-independent and its output is stable', () => {
  const forwards = collapseToExposureSet(
    [path('a:one', 'direct', 1), path('a:one', 'hop', 4), path('b:two', 'indirect', 2)],
    lookup({}),
  );
  const backwards = collapseToExposureSet(
    [path('b:two', 'indirect', 2), path('a:one', 'hop', 4), path('a:one', 'direct', 1)],
    lookup({}),
  );

  assert.deepEqual(
    forwards.map((entry) => [entry.permission, entry.scored_route.path_type, entry.min_hop_distance]),
    backwards.map((entry) => [entry.permission, entry.scored_route.path_type, entry.min_hop_distance]),
  );
  assert.deepEqual(forwards.map((entry) => entry.permission), ['a:one', 'b:two'], 'sorted by id');
});

// --- Steps 2-4: weight, multiply, sum ---------------------------------------

/**
 * Architecture rule 9 and PRD Amendment 3, as arithmetic rather than as prose.
 *
 * An unclassified permission contributes nothing and is named. It is emphatically
 * not weighted as Medium the way PRD §5 L129 asks: a score that rises when the
 * classification registry degrades has told a reviewer about the registry.
 */
test('unclassified permissions are excluded from the sum and named in the output', () => {
  const entries = collapseToExposureSet(
    [path('known:thing', 'direct', 1), path('mystery:one', 'direct', 1), path('mystery:two', 'hop', 3)],
    lookup({ 'mystery:one': 'unclassified', 'mystery:two': 'unclassified' }),
  );

  assert.equal(weightedSum(entries), NOT_SENSITIVE_WEIGHT, 'only the classified one counts');
  assert.deepEqual(unclassifiedPermissionsOf(entries), ['mystery:one', 'mystery:two']);
  assert.deepEqual(
    contributionsOf(entries).map((entry) => entry.permission),
    ['known:thing'],
    'the breakdown never contains a row that did not contribute',
  );
});

test('an identity whose every permission is unclassified sums to nothing at all', () => {
  const entries = collapseToExposureSet(
    [path('mystery:one', 'direct', 1), path('mystery:two', 'direct', 1)],
    lookup({ 'mystery:one': 'unclassified', 'mystery:two': 'unclassified' }),
  );

  assert.equal(weightedSum(entries), 0);
  assert.deepEqual(contributionsOf(entries), []);
  // The caller must distinguish this from "reaches nothing" — `service.ts` does,
  // and that discrimination is what architecture rule 7 is for.
  assert.equal(entries.length, 2, 'the permissions are still reachable; only the score is not');
});

/**
 * The mechanism uplift of §5 step 3, applied to `path_type` and never to distance.
 *
 * Asserted as a pair at the same distance so the test cannot pass by accident if
 * someone reintroduces the distance coefficient PRD step 4 originally asked for.
 */
test('the hop uplift follows the mechanism, not the distance', () => {
  const asHop = collapseToExposureSet([path('x:thing', 'hop', 3)], lookup({}));
  const asIndirect = collapseToExposureSet([path('x:thing', 'indirect', 3)], lookup({}));

  // The literal, not `NOT_SENSITIVE_WEIGHT * HOP_MULTIPLIER` — that expression is
  // `0.15000000000000002` in double precision, and the implementation is exact.
  assert.equal(weightedSum(asHop), 0.15);
  assert.equal(weightedSum(asIndirect), NOT_SENSITIVE_WEIGHT);
  assert.equal(
    asHop[0]?.scored_route.hop_count,
    asIndirect[0]?.scored_route.hop_count,
    'same distance, different score — so distance is not what moved it',
  );
});

/**
 * The float trap, pinned as an equality because the demo quotes `S = 1.8`.
 *
 * `1.5 + 0.1 + 0.1 + 0.1` in double precision is `1.8000000000000003`. Research
 * §4.3 requires the published derivation to reconstruct the published number, and
 * a weighted sum that renders as `1.8000000000000003` on a slide fails that in the
 * most embarrassing way available. `score.ts` accumulates in integer hundredths
 * for exactly this line.
 */
test('the weighted sum is exact, not an accumulation of rounding error', () => {
  const jane = collapseToExposureSet(
    [
      path('admin:platform', 'hop', 3, true),
      path('read:dashboards', 'direct', 1),
      path('ssm:session-deploy-box', 'direct', 1),
      path('mcp:notion-write', 'indirect', 2),
    ],
    lookup({ 'admin:platform': 'sensitive' }),
  );

  assert.equal(weightedSum(jane), 1.8, 'the anchor, exactly');
  assert.notEqual(
    SENSITIVE_WEIGHT * HOP_MULTIPLIER + 0.1 + 0.1 + 0.1,
    1.8,
    'and the naive sum really does drift, which is why the exactness above is a test',
  );

  const breadth = collapseToExposureSet(
    Array.from({ length: 40 }, (_unused, index) => path(`read:thing-${index}`, 'direct', 1)),
    lookup({}),
  );
  assert.equal(weightedSum(breadth), 4, 'forty tenths is four, and says so');
});

// --- Step 5: saturate -------------------------------------------------------

/**
 * `k` re-derived from the anchor rather than trusted — research §5 step 5.
 *
 * The anchor is that Jane's `S = 1.8` scores 78. Solving `78 = 100(1 − e^(−1.8/k))`
 * for `k` has to give back the constant the file ships, or the constant and the
 * documented derivation have drifted apart and one of them is a lie.
 */
test('the saturation constant is what the published anchor implies', () => {
  const derived = -1.8 / Math.log(1 - 78 / 100);

  assert.equal(Math.round(derived * 1000) / 1000, SATURATION_CONSTANT);
  assert.equal(saturate(1.8), 78, 'and the anchor round-trips');
});

test('the curve is bounded, monotone, and compresses the top as documented', () => {
  assert.equal(saturate(0), 0);
  assert.equal(saturate(4), 97, "user-maya's breadth");
  assert.equal(saturate(1000) <= 100, true, 'bounded above');

  let previous = -1;
  for (const weighted of [0, 0.1, 0.25, 1, 1.8, 3.35, 4, 6, 12]) {
    const score = saturate(weighted);
    assert.equal(score >= previous, true, `monotone at S=${weighted}`);
    previous = score;
  }

  // The cost §5 states plainly: past roughly S = 8 the integer score stops
  // discriminating altogether, so an identity reaching eight sensitive permissions
  // and one reaching eighty read the same. That is the price of comparability, and
  // it is why `weighted_sum` ships beside the score and the table sorts on it.
  assert.equal(saturate(6), 99, 'the figure §5 quotes');
  assert.equal(saturate(8), saturate(80), 'and past there, nothing distinguishes them');
});

// --- Bands ------------------------------------------------------------------

/**
 * Flat quarters of the scale, asserted at every boundary.
 *
 * The vocabulary is deliberately not `Severity`'s. `ownership/severity.ts` owns
 * critical/high/medium/low and ranks a finding's urgency; these four words
 * describe how much is reachable. Two rankers sharing four words on adjacent
 * columns is the stage risk research §7.2 names, and it is not worth the
 * familiarity.
 */
test('bands are quarters of the scale and every boundary belongs to the higher band', () => {
  assert.deepEqual(
    [0, 24, 25, 49, 50, 74, 75, 78, 97, 100].map(bandFor),
    [
      'minimal',
      'minimal',
      'limited',
      'limited',
      'substantial',
      'substantial',
      'extensive',
      'extensive',
      'extensive',
      'extensive',
    ],
  );
});

// --- Step 6: rings ----------------------------------------------------------

/**
 * One ring per distinct distance, ascending — PRD Amendment 6.
 *
 * The nested-group case is the one that earns the geometry: an `indirect` path at
 * distance 3 sits outside a `direct` at 1 with nothing at 2, so the rings are not
 * a relabelling of the path-type column and the map is not a redrawn summary strip.
 */
test('rings are one per distinct distance, in order, with no empty buckets', () => {
  const entries = collapseToExposureSet(
    [
      path('read:job-run-status', 'direct', 1),
      path('read:metrics', 'indirect', 3),
      path('admin:warehouse', 'hop', 6, true),
    ],
    lookup({ 'admin:warehouse': 'sensitive' }),
  );

  assert.deepEqual(
    ringsOf(entries).map((ring) => [ring.hop_distance, ring.permissions.map((e) => e.permission)]),
    [[1, ['read:job-run-status']], [3, ['read:metrics']], [6, ['admin:warehouse']]],
  );
});

// --- The published derivation -----------------------------------------------

/**
 * Research §4.3 — the score does not ship without the breakdown that produced it.
 *
 * FIRST makes publishing the vector a condition of using CVSS, and CVSS v4.0 exists
 * partly because v3.x's algebra was opaque. `contributions[0]` is the row PRD §6.4's
 * summary card renders as "83 % of this score is one hop path".
 */
test('contributions are ordered, complete, and reconstruct the weighted sum', () => {
  const jane = collapseToExposureSet(
    [
      path('admin:platform', 'hop', 3, true),
      path('read:dashboards', 'direct', 1),
      path('ssm:session-deploy-box', 'direct', 1),
      path('mcp:notion-write', 'indirect', 2),
    ],
    lookup({ 'admin:platform': 'sensitive' }),
  );
  const contributions = contributionsOf(jane);

  assert.equal(contributions.length, 4, 'one per counted permission, none omitted');
  assert.equal(contributions[0]?.permission, 'admin:platform', 'largest first');
  assert.equal(contributions[0]?.weight, SENSITIVE_WEIGHT);
  assert.equal(contributions[0]?.mechanism_multiplier, HOP_MULTIPLIER);
  assert.equal(contributions[0]?.contribution, 1.5);
  assert.equal(Math.round((contributions[0]?.share_of_score ?? 0) * 100) / 100, 0.83, 'the demo line');

  // Within an ulp, not exactly: `weighted_sum` is exact integer arithmetic, but
  // re-adding the published decimals in double precision cannot be, and pretending
  // otherwise would be the same overclaim the module exists to avoid.
  const resummed = contributions.reduce((running, entry) => running + entry.contribution, 0);
  assert.equal(Math.abs(resummed - weightedSum(jane)) < 1e-9, true);
});

test('the highest sensitivity reached is a sensitive permission, or nothing', () => {
  const withSensitive = collapseToExposureSet(
    [path('admin:platform', 'hop', 3, true), path('export:payroll-file', 'direct', 1, true)],
    lookup({ 'admin:platform': 'sensitive', 'export:payroll-file': 'sensitive' }),
  );
  assert.equal(
    highestSensitivityReached(withSensitive),
    'admin:platform',
    'the largest contributor, which is the row a reviewer should open first',
  );

  const breadthOnly = collapseToExposureSet(
    Array.from({ length: 40 }, (_unused, index) => path(`read:thing-${index}`, 'direct', 1)),
    lookup({}),
  );
  assert.equal(
    highestSensitivityReached(breadthOnly),
    null,
    'null means one thing here — nothing sensitive is reachable — so it collapses nothing',
  );
});
