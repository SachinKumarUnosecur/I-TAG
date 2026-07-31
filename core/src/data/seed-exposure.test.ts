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
import { createAccessService } from '../access/service.js';
import type { AccessPath, AccessPathType } from '../domain/access.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { SEED_DATASET } from './seed.js';
import { validateDataset } from './validate.js';

/**
 * Beats 24-28 — the seed properties Identity Exposure Map is built on.
 *
 * The module does not exist yet, and this file deliberately does not implement it.
 * What it pins is the *data* the algorithm in
 * `docs/identity-exposure-map-research.md` §5 consumes: how many permissions each
 * demo identity reaches, in which weight class, by which mechanism, at which
 * distance. Every score quoted on stage is a pure function of the numbers below,
 * so a seed change that would move a score fails here — in the cluster that caused
 * it — rather than inside a scoring module that is merely reporting what it was
 * handed.
 *
 * Scoring itself stays out of this file for the reason architecture rule 8 exists:
 * a second implementation of the weights, however small, is a second thing to keep
 * in step with §5.
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

function pathsOf(identityId: string): readonly AccessPath[] {
  const outcome = ACCESS.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile.paths;
}

/** The catalogue's three sensitivity states, read the way `seed/catalog.ts` writes them. */
function sensitivityOf(permissionId: string): 'sensitive' | 'not_sensitive' | 'unclassified' {
  const record = DATASET.permissions.find((permission) => permission.id === permissionId);
  assert.ok(record !== undefined, `permission "${permissionId}" is not in the catalogue`);
  return record.sensitive === undefined ? 'unclassified' : record.sensitive ? 'sensitive' : 'not_sensitive';
}

/** §5 step 1 — collapse `paths` to one entry per permission, keeping the worst mechanism. */
const MECHANISM_ORDER: readonly AccessPathType[] = ['direct', 'indirect', 'hop'];

interface ExposureEntry {
  readonly worst_path_type: AccessPathType;
  readonly min_hop_count: number;
  readonly route_count: number;
  readonly route_types: readonly AccessPathType[];
}

function exposureSet(identityId: string): ReadonlyMap<string, ExposureEntry> {
  const collapsed = new Map<string, ExposureEntry>();
  for (const path of pathsOf(identityId)) {
    const held = collapsed.get(path.permission);
    const routeTypes = new Set<AccessPathType>([...(held?.route_types ?? []), path.path_type]);
    const worse =
      held !== undefined &&
      MECHANISM_ORDER.indexOf(held.worst_path_type) > MECHANISM_ORDER.indexOf(path.path_type)
        ? held.worst_path_type
        : path.path_type;
    collapsed.set(path.permission, {
      worst_path_type: worse,
      min_hop_count: Math.min(held?.min_hop_count ?? Number.POSITIVE_INFINITY, path.hop_count),
      route_count: (held?.route_count ?? 0) + 1,
      route_types: [...routeTypes].sort(),
    });
  }
  return collapsed;
}

// --- Beat 24 — breadth --------------------------------------------------------

/**
 * Beat 24 — the widest footprint in the estate, and the number the demo turns on.
 *
 * Forty distinct permissions, none sensitive, none reached by a hop. Under §5 that
 * is `S = 40 × 0.1 × 1.0 = 4.0` and therefore `exposure_score 97` — *above*
 * `user-jane`'s 78, which is asserted immediately below so the inversion is a
 * pinned property of the demo rather than an accident nobody notices until it
 * quietly reverses.
 *
 * The forty are asserted as a count and as a weight-class breakdown rather than as
 * a list, because the claim is about the total and a forty-row `deepEqual` would
 * fail for reasons that have nothing to do with it.
 */
test('beat 24: one identity reaches forty permissions and not one of them is sensitive', () => {
  const exposure = exposureSet('user-maya');

  assert.equal(exposure.size, 40, 'forty distinct permissions, which is the headline');
  assert.equal(pathsOf('user-maya').length, 40, 'and forty paths — no permission is reached twice');

  const classes = [...exposure.keys()].map(sensitivityOf);
  assert.equal(classes.filter((value) => value === 'not_sensitive').length, 40);
  assert.equal(classes.filter((value) => value !== 'not_sensitive').length, 0);

  const mechanisms = [...exposure.values()].map((entry) => entry.worst_path_type);
  assert.equal(mechanisms.filter((value) => value === 'direct').length, 28);
  assert.equal(mechanisms.filter((value) => value === 'indirect').length, 12);
  assert.equal(mechanisms.filter((value) => value === 'hop').length, 0, 'no mechanism uplift');
});

/**
 * The comparison beat 24 exists to make, pinned as an ordering rather than as two
 * numbers, because the ordering is the claim.
 *
 * `user-jane` reaches production platform admin through a hop nothing else in the
 * product surfaces; `user-maya` reaches forty read grants and outscores her. That
 * is the opposite of what the PRD was pitched on, and it is kept: §9 argues that a
 * model which only ever agrees with the sensitivity flag has not added anything to
 * the sensitivity flag. Both halves are guarded so neither can be tuned away in
 * isolation.
 */
test('beat 25: breadth outscores depth, and both inputs are pinned', () => {
  const jane = exposureSet('user-jane');
  const maya = exposureSet('user-maya');

  // Jane: the §5 calibration anchor. 1 sensitive by hop + 3 non-sensitive direct
  // and indirect, giving S = 1.8 and the published score of 78.
  assert.equal(jane.size, 4);
  assert.equal([...jane.keys()].filter((id) => sensitivityOf(id) === 'sensitive').length, 1);
  assert.equal([...jane.values()].filter((entry) => entry.worst_path_type === 'hop').length, 1);

  const janeWeightedSum = 1 * 1.5 + 3 * 0.1 * 1.0;
  const mayaWeightedSum = 40 * 0.1 * 1.0;
  assert.equal(janeWeightedSum, 1.8, 'the anchor S that fixes k = 1.189');
  assert.equal(mayaWeightedSum, 4, 'breadth alone clears the anchor by more than double');
  assert.equal(
    mayaWeightedSum > janeWeightedSum,
    true,
    'if this ever reverses, §9 and the demo script are both describing a different chart',
  );

  assert.equal(maya.size > jane.size, true);
});

// --- Beat 26 — unclassified ---------------------------------------------------

/**
 * Beat 26 — an identity the score cannot be computed for, reported honestly.
 *
 * All six of its permissions are `unclassified`, so §5 excludes every one of them
 * and the weighted sum is taken over an empty set. The output is a completeness
 * figure of 0 %, not a score of 0 and not a defaulted middle tier — §4.2 and §7 are
 * explicit that a number which moves because the classification registry degraded
 * tells a reviewer about the registry rather than about the identity.
 */
test('beat 26: unclassified permissions are excluded, not defaulted', () => {
  const exposure = exposureSet('svc-partner-sync');

  assert.equal(exposure.size, 6);
  assert.deepEqual(
    [...new Set([...exposure.keys()].map(sensitivityOf))],
    ['unclassified'],
    'nothing here has ever been assessed, which is the beat',
  );
});

/**
 * The other half of beat 26: unclassified has to be *rare*, or the completeness
 * figure reads as a broken pipeline rather than as a gap worth closing.
 *
 * Also an equality on the whole catalogue, so a permission added without a
 * sensitivity decision shows up here instead of silently dropping out of every
 * exposure score in the product.
 */
test('the catalogue is classified except where beat 26 needs it not to be', () => {
  const byState = { sensitive: 0, not_sensitive: 0, unclassified: 0 };
  for (const permission of DATASET.permissions) {
    byState[sensitivityOf(permission.id)] += 1;
  }

  assert.deepEqual(byState, { sensitive: 9, not_sensitive: 71, unclassified: 6 });
  assert.equal(
    DATASET.permissions.length,
    86,
    'the three states partition the catalogue — a fourth would mean a schema change',
  );
});

// --- Beat 27 — two routes, two mechanisms ------------------------------------

/**
 * Beat 27 — `PRD` §8's second open question, answerable from the seed at last.
 *
 * `user-grace` could already reach one permission two ways — `read:finance-db`
 * directly and again through `group-finance` — but `direct` and `indirect` share
 * the mechanism multiplier `m = 1.0`, so collapsing her pair is free: whichever
 * route §5 step 1 keeps, the contribution is identical and only the remediation
 * advice differs.
 *
 * This is the case where collapsing costs something. `write:invoice-queue` arrives
 * as both `indirect` (m = 1.0) and `hop` (m = 1.5), so the choice moves the score,
 * and it is the first pair in the dataset that does. §5 takes the worst mechanism,
 * and `route_count` carries what that choice discarded.
 */
test('beat 27: one permission reached by two different mechanisms', () => {
  const exposure = exposureSet('svc-invoice-poster');
  const contested = exposure.get('write:invoice-queue');

  assert.ok(contested !== undefined);
  assert.equal(contested.route_count, 2);
  assert.deepEqual(contested.route_types, ['hop', 'indirect']);
  assert.equal(contested.worst_path_type, 'hop', 'the mechanism a reviewer has to act on');
  assert.equal(contested.min_hop_count, 2, 'the shorter of the two routes is the membership');

  // Three paths, two permissions: the gap between them is the whole insight, and
  // it is why the landing table counts permissions rather than paths.
  assert.equal(pathsOf('svc-invoice-poster').length, 3);
  assert.equal(exposure.size, 2);

  assert.deepEqual(
    exposureSet('user-grace').get('read:finance-db')?.route_types,
    ['direct', 'indirect'],
    'the pre-existing two-route case, whose mechanisms share a multiplier',
  );
});

// --- Beat 28 — rings that are not the type column ----------------------------

/**
 * Beat 28 — the counterexample that earns the ring map.
 *
 * `docs/PRD-identity-exposure-map.md` amendment 6: before this cluster, `direct`
 * was always distance 1, `indirect` always distance 2, and only `hop` ever went
 * further — so rings drawn on hop distance would have been the path-type column
 * with a different geometry. The nested group puts an `indirect` path at distance
 * 3, which is the first pair in the dataset where the two disagree.
 *
 * Asserted over the whole estate rather than over the one identity, because the
 * property that matters is "the dataset contains a counterexample", and it stays
 * true however the beat is later re-cut.
 */
test('beat 28: hop distance is no longer collinear with path type', () => {
  const everyPath = DATASET.identities.flatMap((identity) =>
    identity.type === 'group' ? [] : [...pathsOf(identity.id)],
  );

  const indirectDistances = [
    ...new Set(
      everyPath.filter((path) => path.path_type === 'indirect').map((path) => path.hop_count),
    ),
  ].sort();
  assert.deepEqual(indirectDistances, [2, 3], 'membership is no longer synonymous with distance 2');

  const watchdog = exposureSet('svc-platform-watchdog');
  const nested = watchdog.get('read:metrics');
  assert.ok(nested !== undefined);
  assert.equal(nested.worst_path_type, 'indirect', 'two memberships are still a membership');
  assert.equal(nested.min_hop_count, 3);
});

// --- The estate the map is drawn over ----------------------------------------

/**
 * The population figures quoted in research §9, pinned where they are produced.
 *
 * `identities_scanned` is the denominator under every percentage in the exposure
 * landing view, and it excludes groups (architecture rule 12), so it moves for two
 * unrelated reasons and is worth stating explicitly rather than deriving on stage.
 */
test('the exposure population and its path mix are what §9 publishes', () => {
  const summary = ACCESS.summary();

  assert.deepEqual(summary.counts, { direct: 108, indirect: 83, hop: 21 });
  assert.equal(summary.identities_with_hop, 11);
  assert.equal(summary.identities_scanned, 127);
  assert.equal(
    DATASET.identities.filter((identity) => identity.type === 'group').length,
    12,
    'scanned + groups = the 139 identities in the estate',
  );
});

/**
 * Exposure is a property of correctly owned access, and the beats have to keep
 * proving it. Every identity added for beats 24-28 is green, so none of them
 * enters the ownership queue, and the Colonial Pipeline row stays at rank 1.
 *
 * This is the same guard `seed/access.ts` carries, for the same reason: a beat
 * that arrives pre-flagged by an existing module is that module's argument, not
 * this one's.
 */
test('nothing beats 24-28 added is an ownership finding', () => {
  const queue = OWNERSHIP.list();

  assert.equal(queue.length, 24);
  assert.equal(queue[0]?.identity_id, 'svc-vpn-legacy');

  const added = [
    'user-maya',
    'svc-partner-sync',
    'svc-invoice-poster',
    'role-ledger-writer',
    'svc-platform-watchdog',
  ];
  assert.deepEqual(
    queue.map((row) => row.identity_id).filter((id) => added.includes(id)),
    [],
    'the widest blast radius in the estate is invisible to every existing view',
  );
});
