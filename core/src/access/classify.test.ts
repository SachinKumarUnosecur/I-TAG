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
import { SEED_DATASET } from '../data/seed.js';
import { DatasetValidationError, validateDataset } from '../data/validate.js';
import type { AccessPath, AccessPathType } from '../domain/access.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import type { Identity, IdentityDataset, PermissionRecord } from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createAccessService } from './service.js';
import { discoverAccess } from './classify.js';

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

function profileOf(identityId: string) {
  const outcome = ACCESS.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile;
}

// --- Fixtures ---------------------------------------------------------------

/** Minimal dataset so a graph shape can be built without the seed's meaning. */
function fixture(identities: readonly Identity[], permissions: readonly PermissionRecord[]): IdentityDataset {
  return {
    apps: [{ id: 'fx', name: 'Fixture', creation_data_from: null }],
    identities,
    employee_status: {},
    teams: [],
    owner_assignments: [],
    permissions,
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
}

function node(id: string, over: Partial<Identity> = {}): Identity {
  return {
    id,
    type: 'service_account',
    name: id,
    app: 'fx',
    direct_grants: [],
    inherited_from: [],
    delegates_to: [],
    provisioned_by: null,
    ...over,
  };
}

function pathsIn(dataset: IdentityDataset, startId: string, maxDepth = 16): readonly AccessPath[] {
  const graph = buildIdentityGraph(dataset);
  const start = graph.byId.get(startId);
  assert.ok(start !== undefined);
  return discoverAccess(graph, start, maxDepth);
}

// --- Union coverage ---------------------------------------------------------

/**
 * An equality, not a subset check.
 *
 * `PRD` §2.1 makes this union the contract Identity Risk Profile and Unified
 * Impact Analysis are written against, so a fourth type has to fail here — and be
 * decided — rather than reach them as an unhandled string.
 */
test('every access path type is reachable from the seed, and only these three', () => {
  const observed = new Set<AccessPathType>();
  for (const row of ACCESS.list()) {
    observed.add(row.path.path_type);
  }

  assert.deepEqual([...observed].sort(), ['direct', 'hop', 'indirect']);
});

// --- The three types, on the real dataset -----------------------------------

/**
 * Beat 19 — `PRD` L72-76, which is the whole reason the module exists.
 *
 * Asserted by id rather than by count: the claim is not "a hop exists somewhere"
 * but "this person holds production admin and no policy names her".
 */
test('beat 19: jane reaches platform admin through a resource, and only through it', () => {
  const jane = profileOf('user-jane');

  assert.deepEqual(jane.counts, { direct: 2, indirect: 1, hop: 1 });

  const hop = jane.paths.find((path) => path.path_type === 'hop');
  assert.ok(hop !== undefined && hop.path_type === 'hop');
  assert.equal(hop.permission, 'admin:platform');
  assert.equal(hop.sensitive, true);
  assert.equal(hop.via_permission, 'ssm:session-deploy-box');
  assert.equal(hop.assumed_identity, 'role-deploy-box');
  // `PRD` L76 states the count for this exact shape.
  assert.equal(hop.hop_count, 3);
  assert.deepEqual(
    hop.chain.map((step) => step.edge),
    ['CAN_ACCESS', 'ASSUMES_ROLE', 'HAS_POLICY'],
  );

  // The claim that makes it a finding: nothing else gets her there.
  const others = jane.paths.filter(
    (path) => path.permission === 'admin:platform' && path.path_type !== 'hop',
  );
  assert.deepEqual(others, [], 'no direct or group route grants her platform admin');
});

/**
 * Beat 20 — sensitive, reviewable, and correctly not a hop.
 *
 * The row that proves classification keys on mechanism rather than on sensitivity.
 */
test('beat 20: sensitive access through a group stays indirect', () => {
  const grace = profileOf('user-grace');

  assert.equal(grace.counts.hop, 0);
  assert.equal(grace.hop_summary, null);
  assert.deepEqual(grace.sensitive_permissions, ['export:finance-report']);

  const sensitive = grace.paths.find((path) => path.permission === 'export:finance-report');
  assert.ok(sensitive !== undefined && sensitive.path_type === 'indirect');
  assert.equal(sensitive.via_group, 'group-finance');
  assert.equal(sensitive.hop_count, 2);
});

/**
 * Beat 21 — a hop is a mechanism, not a verdict.
 *
 * A CI runner assuming a build role is how deployment works. It is reported,
 * because it is a hop, and it reaches nothing sensitive and is owned at both ends.
 */
test('beat 21: a legitimate hop is reported and is not a finding', () => {
  const runner = profileOf('svc-ci-runner');

  assert.equal(runner.counts.hop, 1);
  assert.deepEqual(runner.sensitive_permissions, []);

  const owned = ACCESS.list({ pathType: 'hop' }).filter(
    (row) => row.path.identity_id === 'svc-ci-runner',
  );
  assert.equal(owned.length, 1);
  assert.equal(owned[0]?.ownership.owner?.id, 'team-platform');
  assert.equal(owned[0]?.ownership.state, 'owned');

  // Absence of data is never a finding, and neither is presence of a mechanism:
  // Ownership Assurance still sees a correctly owned account.
  const ownership = OWNERSHIP.classify('svc-ci-runner');
  assert.ok(ownership.ok);
  assert.equal(ownership.finding.state, 'owned');
  assert.equal(ownership.finding.counted, false);
});

/**
 * Beat 22 — `PRD` L99's override rule, on the real dataset rather than a fixture.
 *
 * The agent's connect grant sits on a group, so the path contains both a
 * `MEMBER_OF` edge and a binding. It is a hop, not an indirect path, and the
 * distinction is the difference between a row a reviewer opens and a row that
 * looks like the thousand ordinary group memberships around it.
 */
test('beat 22: a hop reached through a group is still a hop', () => {
  const agent = profileOf('agent-support-triage');
  assert.equal(agent.identity_type, 'ai_agent');

  const viaGroup = agent.paths.find((path) => path.permission === 'mcp:prod-db-query');
  assert.ok(viaGroup !== undefined && viaGroup.path_type === 'hop');
  assert.equal(viaGroup.hop_count, 4);
  assert.deepEqual(
    viaGroup.chain.map((step) => step.edge),
    ['MEMBER_OF', 'CAN_ACCESS', 'ASSUMES_ROLE', 'HAS_POLICY'],
  );
  assert.equal(viaGroup.via_permission, 'mcp:connect-prod-runbook');

  // The membership is real, and it is not what this path is classified by.
  assert.equal(agent.counts.indirect, 1, 'the group also grants ordinary indirect access');
});

/**
 * Beat 23 — `PRD` §8's first open question, answered on screen.
 *
 * §8 asks whether a chain through several resources generalizes from the
 * single-resource case. It does: two `ASSUMES_ROLE` crossings in one path, ending
 * in a permission that lives in a different app from the identity holding it.
 */
test('beat 23: a hop chains across two resources and two systems', () => {
  const agent = profileOf('agent-support-triage');

  const transitive = agent.paths.find((path) => path.permission === 'admin:warehouse');
  assert.ok(transitive !== undefined && transitive.path_type === 'hop');
  assert.equal(transitive.hop_count, 6);
  assert.deepEqual(
    transitive.chain.map((step) => step.edge),
    ['MEMBER_OF', 'CAN_ACCESS', 'ASSUMES_ROLE', 'CAN_ACCESS', 'ASSUMES_ROLE', 'HAS_POLICY'],
  );

  // The first crossing is reported, because it is the grant that closes every one
  // of these paths at once.
  assert.equal(transitive.via_permission, 'mcp:connect-prod-runbook');
  assert.equal(transitive.assumed_identity, 'role-runbook-executor');

  // The identity is in the MCP gateway; the permission it reaches is in Snowflake.
  assert.equal(transitive.identity_type, 'ai_agent');
  assert.equal(transitive.app, 'mcp-gateway');
  assert.equal(GRAPH.byId.get('role-warehouse-admin')?.app, 'snowflake');

  assert.deepEqual(agent.sensitive_permissions, ['admin:warehouse', 'mcp:prod-db-query']);
});

/**
 * `PRD` §6.2 gives the filter bar an app selector and a hop-count range. Both are
 * inert if every hop in the dataset has the same count and lives in one app, so
 * the spread is asserted rather than left to chance as the seed grows.
 */
test('the hop population spans several counts, apps and identity types', () => {
  const hops = ACCESS.list({ pathType: 'hop' }).map((row) => row.path);

  assert.deepEqual(
    [...new Set(hops.map((path) => path.hop_count))].sort(),
    [3, 4, 5, 6],
    'the release chain fills the gap at 5, so the range slider has no dead interval',
  );
  assert.deepEqual(
    [...new Set(hops.map((path) => path.app))].sort(),
    ['aws-iam', 'github', 'mcp-gateway'],
  );
  assert.deepEqual(
    [...new Set(hops.map((path) => path.identity_type))].sort(),
    ['ai_agent', 'human', 'service_account'],
    'the estate is 103 non-human accounts; a hop demo that only reaches people proves little',
  );

  /**
   * Deduplicated, because `list()` returns one row per path and both two-stage
   * chains close more than one permission each. The set is what the filter selects;
   * the row count is a property of the chains, not of the filter.
   */
  assert.deepEqual(
    [...new Set(ACCESS.list({ pathType: 'hop', minHopCount: 5 }).map((row) => row.path.identity_id))].sort(),
    [
      'agent-incident-responder',
      'agent-support-triage',
      'svc-hotfix-deployer',
      'svc-release-orchestrator',
      'svc-runbook-scheduler',
      'user-tomas',
    ],
    'the range filter selects both transitive chains and nothing shallower',
  );
});

// --- Precedence -------------------------------------------------------------

/**
 * `PRD` L99 — hop overrides, and this is the fixture that has both edge kinds.
 *
 * A membership that leads to a binding is still a hop: the mechanism is what the
 * reviewer acts on, and reporting it as `indirect` because a group came first
 * would hide the escalation behind the most ordinary shape in the estate.
 */
test('a path with both a membership and a binding classifies as hop', () => {
  const dataset = fixture(
    [
      node('member', { type: 'human', inherited_from: ['grp'] }),
      node('grp', { type: 'group', direct_grants: ['connect:box'] }),
      node('role', { direct_grants: ['admin:everything'] }),
    ],
    [{ id: 'connect:box', grants_identity: 'role' }, { id: 'admin:everything', sensitive: true }],
  );

  const terminal = pathsIn(dataset, 'member').find((path) => path.permission === 'admin:everything');
  assert.ok(terminal !== undefined && terminal.path_type === 'hop');
  assert.equal(terminal.hop_count, 4, 'MEMBER_OF, CAN_ACCESS, ASSUMES_ROLE, HAS_POLICY');
  assert.deepEqual(
    terminal.chain.map((step) => step.edge),
    ['MEMBER_OF', 'CAN_ACCESS', 'ASSUMES_ROLE', 'HAS_POLICY'],
  );
  assert.equal(terminal.via_permission, 'connect:box', 'the grant that closes the path');
});

/**
 * `PRD` L101 asks for every route to a terminal permission. What is emitted is
 * every distinct *source* of one — which is the half that changes remediation.
 */
test('one permission held by two principals produces two paths', () => {
  const dataset = fixture(
    [
      node('subject', { inherited_from: ['grp'], direct_grants: ['connect:box'] }),
      node('grp', { type: 'group', direct_grants: ['shared:perm'] }),
      node('role', { direct_grants: ['shared:perm'] }),
    ],
    [{ id: 'connect:box', grants_identity: 'role' }, { id: 'shared:perm' }],
  );

  const routes = pathsIn(dataset, 'subject').filter((path) => path.permission === 'shared:perm');
  assert.deepEqual(
    routes.map((path) => path.path_type).sort(),
    ['hop', 'indirect'],
    'revoking the role does not revoke the group, so both are reported',
  );
});

// --- Terminal states: pathological shapes return, never throw ----------------

test('a membership cycle terminates instead of looping', () => {
  const dataset = fixture(
    [
      node('subject', { inherited_from: ['a'] }),
      node('a', { type: 'group', inherited_from: ['b'], direct_grants: ['p'] }),
      node('b', { type: 'group', inherited_from: ['a'], direct_grants: ['q'] }),
    ],
    [{ id: 'p' }, { id: 'q' }],
  );

  const paths = pathsIn(dataset, 'subject');
  assert.deepEqual(
    paths.map((path) => path.permission).sort(),
    ['p', 'q'],
    'convergence is normal on the forward walk, so both are still reached',
  );
});

test('a binding into a missing principal terminates instead of throwing', () => {
  // Built directly, bypassing `validateDataset` — boot would reject this, and the
  // traversal still has to answer rather than crash if it ever arrives another way.
  const dataset = fixture([node('subject', { direct_grants: ['connect:ghost'] })], [
    { id: 'connect:ghost', grants_identity: 'nobody' },
  ]);

  const paths = pathsIn(dataset, 'subject');
  assert.deepEqual(paths.map((path) => path.permission), ['connect:ghost']);
  assert.equal(paths[0]?.path_type, 'direct');
});

test('the depth cap bounds the walk rather than failing it', () => {
  const dataset = fixture(
    [
      node('subject', { direct_grants: ['c1'] }),
      node('r1', { direct_grants: ['c2'] }),
      node('r2', { direct_grants: ['deep:perm'] }),
    ],
    [
      { id: 'c1', grants_identity: 'r1' },
      { id: 'c2', grants_identity: 'r2' },
      { id: 'deep:perm' },
    ],
  );

  assert.equal(
    pathsIn(dataset, 'subject', 2).some((path) => path.permission === 'deep:perm'),
    true,
    'two principal hops are inside a depth of two',
  );
  assert.equal(
    pathsIn(dataset, 'subject', 1).some((path) => path.permission === 'deep:perm'),
    false,
    'and outside a depth of one, without an exception',
  );
});

test('an unknown identity comes back as an outcome, not a throw', () => {
  const outcome = ACCESS.profile('nobody-here');
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.error, 'unknown_identity');
  }
});

// --- Boot-time validation ---------------------------------------------------

test('a hop binding naming a non-identity fails the boot', () => {
  assert.throws(
    () =>
      validateDataset(
        fixture([node('subject', { direct_grants: ['connect:ghost'] })], [
          { id: 'connect:ghost', grants_identity: 'nobody' },
        ]),
      ),
    DatasetValidationError,
  );
});

test('a permission granting its own access fails the boot', () => {
  assert.throws(
    () =>
      validateDataset(
        fixture([node('loop', { direct_grants: ['self:perm'] })], [
          { id: 'self:perm', grants_identity: 'self:perm' },
        ]),
      ),
    DatasetValidationError,
  );
});

// --- The line this module does not cross ------------------------------------

/**
 * `PRD` L30 and `docs/delegation-chain-research.md` §7.2: `ownership/severity.ts`
 * is the only place in the engine that ranks anything. Two modules disagreeing
 * about danger in front of a customer is worse than either being wrong alone.
 */
test('nothing this module emits carries a severity or a rank', () => {
  const forbidden = ['severity', 'rank', 'score', 'priority'];

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
      walk(nested, `${trail}.${key}`);
    }
  }

  walk(ACCESS.list(), 'list');
  walk(ACCESS.summary(), 'summary');
  walk(profileOf('user-jane'), 'profile');
});

/**
 * The staleness contract of `PRD` §4.4, and the reason the demo clock is pinned.
 *
 * A consumer must be able to date the facts it read; `PRD` L138 has Identity Risk
 * Profile pointing its own `stalest_input` at this value rather than inventing one.
 */
test('the summary dates itself from the injected clock', () => {
  assert.equal(ACCESS.summary().snapshot.graph_snapshot_at, NOW.toISOString());
});

test('groups are not their own subjects, so no permission is counted twice', () => {
  const subjects = new Set(ACCESS.list().map((row) => row.path.identity_id));
  const groups = GRAPH.all.filter((identity) => identity.type === 'group').map((identity) => identity.id);

  for (const groupId of groups) {
    assert.equal(subjects.has(groupId), false, `${groupId} appears as its own access subject`);
  }
  assert.equal(ACCESS.summary().identities_scanned, GRAPH.all.length - groups.length);
});
