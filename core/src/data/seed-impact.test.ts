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
import type { AccessPath } from '../domain/access.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import type { Identity, IdentityType } from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { SEED_DATASET } from './seed.js';
import { validateDataset } from './validate.js';

/**
 * Beats 29-31 — the seed properties Blast Radius is built on.
 *
 * The module does not exist yet, and this file deliberately does not implement it,
 * for the same reason `seed-exposure.test.ts` stops short of the scoring model: a
 * second implementation of the selection rule is a second thing to keep in step
 * with `docs/unified-impact-analysis-research.md` §4.4.
 *
 * What it pins is the *data* that makes the selector falsifiable. Research §8 gap 1
 * names three properties the estate did not have, and each one is the difference
 * between an assertion that tests the algorithm and an assertion that a degenerate
 * implementation would also pass:
 *
 *   a rota with more than one member    — or severing a grant is just revoking it
 *   two unrelated multi-stage chains    — or "rank the chains" has one input
 *   a binding held by two subjects      — or every ranking rule agrees
 *
 * A seed change that quietly removes any of them leaves the future module's own
 * tests passing against data that cannot distinguish it from a stub, so they are
 * asserted here, in the file that would cause it.
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

function identityOf(identityId: string): Identity {
  const identity = GRAPH.byId.get(identityId);
  assert.ok(identity !== undefined, `seed dataset is missing "${identityId}"`);
  return identity;
}

/** Architecture rule 12 — groups are not subjects, here as everywhere else. */
const SUBJECTS: readonly Identity[] = DATASET.identities.filter(
  (identity) => identity.type !== 'group',
);

/** The permission ids that bind to a principal — the estate's whole pivot surface. */
const PIVOT_BINDINGS: readonly string[] = DATASET.permissions
  .filter((permission) => permission.grants_identity !== undefined)
  .map((permission) => permission.id)
  .sort();

/**
 * Subjects that name `permissionId` as the *front* crossing of one of their hops.
 *
 * `access/classify.ts` sets `via_permission` to the first binding a path crosses,
 * so a two-stage chain attributes to the grant at its head and never to the rung
 * behind it. This is therefore the cheap derivation a selector could compute
 * without a graph rebuild — and, as the test below pins, it is a **lower bound**
 * rather than an answer.
 */
function subjectsNamingAsFrontCrossing(permissionId: string): readonly string[] {
  const naming = SUBJECTS.filter((subject) =>
    pathsOf(subject.id).some(
      (path) => path.path_type === 'hop' && path.via_permission === permissionId,
    ),
  );
  return [...new Set(naming.map((subject) => subject.id))].sort();
}

// --- Beat 29 — the rota behind one grant -------------------------------------

/**
 * Gap 1a. A choke point that cuts one subject is a grant revocation with a longer
 * name, and until this cluster the estate's only interesting binding hung off a
 * group with a single member.
 *
 * Four members and all three identity types, because the sentence the module is
 * built to say is "one grant, and a person, an agent and a service account all lose
 * production" — a rota of four agents would read as an AI-governance finding and
 * let a reviewer file it under a programme they have not started.
 */
test('beat 29: the on-call rota is four principals spanning all three types', () => {
  const members = SUBJECTS.filter((subject) =>
    subject.inherited_from.includes('group-oncall-agents'),
  );

  assert.deepEqual(
    members.map((member) => member.id).sort(),
    [
      'agent-incident-responder',
      'agent-support-triage',
      'svc-runbook-scheduler',
      'user-tomas',
    ],
  );

  const types: readonly IdentityType[] = ['ai_agent', 'human', 'service_account'];
  assert.deepEqual([...new Set(members.map((member) => member.type))].sort(), types);

  assert.deepEqual(
    identityOf('group-oncall-agents').direct_grants,
    ['mcp:connect-prod-runbook'],
    'one grant on the container is what makes the group a choke point rather than a bucket',
  );
});

/**
 * Gap 1a, the half that makes the two deltas of research §4.3 readable.
 *
 * The three added members hold no direct grant, so the rota is their entire
 * footprint: severing `mcp:connect-prod-runbook` takes each of them from four
 * reachable permissions to zero, and the "access removed" and "mechanisms closed"
 * deltas coincide on a single candidate rather than having to be reconciled.
 *
 * `agent-support-triage` is excluded on purpose — it keeps its one direct grant, so
 * it is the member for whom the two deltas *differ*, and beat 25 keeps it at rank 2
 * of the exposure table.
 */
test('beat 29: three rota members reach production and hold nothing directly', () => {
  const dependents = ['user-tomas', 'agent-incident-responder', 'svc-runbook-scheduler'];

  for (const identityId of dependents) {
    assert.deepEqual(identityOf(identityId).direct_grants, [], `${identityId} holds nothing`);

    const reached = pathsOf(identityId);
    assert.deepEqual(
      reached.map((path) => path.permission).sort(),
      [
        'admin:warehouse',
        'mcp:connect-prod-runbook',
        'mcp:connect-warehouse-box',
        'mcp:prod-db-query',
      ],
      `${identityId} reaches four permissions, none of them on its own record`,
    );

    assert.deepEqual(
      reached
        .filter((path) => path.path_type === 'hop')
        .map((path) => path.via_permission)
        .sort(),
      ['mcp:connect-prod-runbook', 'mcp:connect-prod-runbook', 'mcp:connect-prod-runbook'],
      'every hop is closed by the same grant, so the delta is total',
    );
  }

  assert.deepEqual(
    identityOf('agent-support-triage').direct_grants,
    ['mcp:sheets-read'],
    'the pre-existing member keeps access the choke point does not close',
  );
});

// --- Beat 30 — a second multi-stage chain ------------------------------------

/**
 * Gap 1b. With one two-stage chain in the estate, a selector that compares
 * candidates and a selector that returns the deepest chain it can find produce the
 * same output, so §4.4's exhaustive arm is asserted against nothing.
 *
 * The second chain is parallel in structure and disjoint in every particular: two
 * systems neither beat-23 rung touches, and the grants held directly rather than
 * through a group.
 */
test('beat 30: a second two-stage chain runs github to aws-iam', () => {
  const terminal = pathsOf('svc-release-orchestrator').find(
    (path) => path.permission === 'deploy:prod',
  );

  assert.ok(terminal !== undefined && terminal.path_type === 'hop');
  assert.equal(terminal.hop_count, 5);
  assert.deepEqual(terminal.chain.map((step) => step.edge), [
    'CAN_ACCESS',
    'ASSUMES_ROLE',
    'CAN_ACCESS',
    'ASSUMES_ROLE',
    'HAS_POLICY',
  ]);

  // The front grant is what closes the path, and it is two rungs from the payload.
  assert.equal(terminal.via_permission, 'gh:connect-release-runner');
  assert.equal(terminal.assumed_identity, 'role-release-runner');

  assert.equal(terminal.app, 'github', 'the subject is in GitHub');
  assert.equal(identityOf('role-artifact-signer').app, 'aws-iam', 'the payload is in AWS');

  const beat23 = pathsOf('agent-support-triage').find(
    (path) => path.permission === 'admin:warehouse',
  );
  assert.ok(beat23 !== undefined);
  assert.notEqual(
    beat23.app,
    terminal.app,
    'two chains in the same app pair would prove the selector iterates, not that it compares',
  );
});

/**
 * The two chains share no identity, so a candidate drawn from one cannot close a
 * path in the other. That disjointness is what the exhaustive arm's pair search has
 * to be run against — overlapping chains would let a single candidate look optimal
 * for a reason that has nothing to do with the search.
 */
test('beat 30: the two multi-stage chains are disjoint', () => {
  const releaseChain = new Set([
    'svc-release-orchestrator',
    'svc-hotfix-deployer',
    'role-release-runner',
    'role-artifact-signer',
  ]);
  const runbookChain = new Set([
    'agent-support-triage',
    'agent-incident-responder',
    'svc-runbook-scheduler',
    'user-tomas',
    'group-oncall-agents',
    'role-runbook-executor',
    'role-warehouse-admin',
  ]);

  assert.deepEqual([...releaseChain].filter((id) => runbookChain.has(id)), []);

  for (const identityId of [...releaseChain, ...runbookChain]) {
    identityOf(identityId); // present in the dataset, so neither set is stale
  }
});

// --- Beat 31 — the binding two unrelated subjects share ----------------------

/**
 * Gap 1c, and the assertion research §4.4 exists for.
 *
 * §4.4 rejects ranking candidates by how often they appear across a path list,
 * because appearance counts paths and remediation closes *subjects*: a grant on
 * many paths belonging to one identity closes one identity's access. Every ranking
 * rule agrees on a dataset where each binding has exactly one holder, so the
 * objection was untestable until this row.
 *
 * `gh:connect-release-runner` is the release-chain counterexample — two subjects that
 * share no group, no owner and no other permission. Beat 23b also makes
 * `ssm:session-deploy-box` multi-held (`user-jane` + `svc-temp-ssm-bridge`).
 */
test('beat 31: exactly two pivot bindings are held by more than one subject', () => {
  const shared = PIVOT_BINDINGS.filter((permissionId) => {
    const holders = SUBJECTS.filter((subject) =>
      subject.direct_grants.includes(permissionId),
    );
    return holders.length > 1;
  });

  assert.deepEqual(shared, ['gh:connect-release-runner', 'ssm:session-deploy-box']);

  assert.deepEqual(
    SUBJECTS.filter((subject) => subject.direct_grants.includes('gh:connect-release-runner'))
      .map((subject) => subject.id)
      .sort(),
    ['svc-hotfix-deployer', 'svc-release-orchestrator'],
  );

  const [first, second] = ['svc-release-orchestrator', 'svc-hotfix-deployer'].map(identityOf);
  assert.ok(first !== undefined && second !== undefined);
  assert.deepEqual(first.inherited_from, [], 'no group in common, because neither has a group');
  assert.deepEqual(second.inherited_from, []);
  assert.deepEqual(
    first.direct_grants.filter((grant) => second.direct_grants.includes(grant)),
    ['gh:connect-release-runner'],
    'the binding is the only thing the two accounts share',
  );
});

/**
 * The candidate distribution, and the reason research §4.1 mandates a counterfactual
 * graph rather than a tally over path attributes.
 *
 * Counting front crossings gives a usable spread — a decisive leader at four and a
 * genuine runner-up at two, rather than one spike and a tail of ones — and it is
 * still **wrong**, in a way this dataset is now able to demonstrate.
 *
 * `gh:connect-artifact-signer` scores 1 here. Only `role-release-runner` holds it
 * directly, so only `role-release-runner` names it as a front crossing. But it sits
 * mid-chain on the paths of two more subjects: sever it and `svc-release-orchestrator`
 * and `svc-hotfix-deployer` both stop reaching `deploy:prod`, because they arrive at
 * `role-release-runner` and find the onward binding gone. Its true removal impact is
 * three subjects and the cheap derivation reports one.
 *
 * That understatement is the whole argument for §4.1. A selector that ranks on
 * anything readable off `AccessPath` will systematically undervalue every rung
 * behind the first, which is exactly where the interesting choke points are; only
 * rebuilding the graph without the binding and re-running the traversal gets it
 * right. This assertion is the fixture that proves the shortcut is inadequate, so
 * it is an equality on the whole binding set rather than a spot check.
 */
test('front-crossing counts understate removal impact mid-chain', () => {
  const spread = PIVOT_BINDINGS.map(
    (permissionId) => [permissionId, subjectsNamingAsFrontCrossing(permissionId).length] as const,
  ).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));

  assert.deepEqual(spread, [
    ['mcp:connect-prod-runbook', 4],
    ['gh:connect-release-runner', 2],
    ['ssm:session-deploy-box', 2],
    ['ci:assume-build-agent', 1],
    ['connect:ledger-writer', 1],
    ['gh:connect-artifact-signer', 1],
    ['mcp:connect-warehouse-box', 1],
  ]);

  // The three subjects whose access the mid-chain binding actually carries, against
  // the one that names it. The gap is what the counterfactual has to recover.
  assert.deepEqual(subjectsNamingAsFrontCrossing('gh:connect-artifact-signer'), [
    'role-release-runner',
  ]);
  assert.deepEqual(
    SUBJECTS.filter((subject) =>
      pathsOf(subject.id).some(
        (path) => path.permission === 'deploy:prod' && path.path_type === 'hop',
      ),
    )
      .map((subject) => subject.id)
      .sort(),
    ['role-release-runner', 'svc-hotfix-deployer', 'svc-release-orchestrator'],
    'three reach it through the signer role; only one of them names the binding',
  );

  /**
   * `svc-deploy` and `role-artifact-signer` hold `deploy:prod` outright and are
   * excluded above on purpose. Severing a binding cannot take away a grant written
   * on the identity's own record, and a delta that claimed otherwise would be
   * counting the permission rather than the route to it.
   */
  assert.deepEqual(
    SUBJECTS.filter((subject) => subject.direct_grants.includes('deploy:prod'))
      .map((subject) => subject.id)
      .sort(),
    ['role-artifact-signer', 'svc-deploy'],
  );
});
