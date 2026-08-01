import assert from 'node:assert/strict';
import { test } from 'node:test';

import { seedGraphSource } from '../adapters/seed-source.js';
import { MAX_EXHAUSTIVE_CANDIDATES } from '../domain/impact.js';
import { DEFAULT_ACCOUNTABILITY_POLICY } from '../domain/policy.js';
import type { Identity, IdentityDataset, PermissionRecord } from '../domain/types.js';
import { buildIdentityGraph, type IdentityGraph } from '../graph/build.js';
import {
  baselineOf,
  DEFAULT_CHOKE_POINT_STRATEGIES,
  EXHAUSTIVE_STRATEGY,
  GREEDY_HITTING_SET_STRATEGY,
  indexReach,
  pivotBindingsOf,
  selectChokePoints,
  type CandidateEvaluation,
  type SelectionContext,
} from './choke.js';
import { severingBindings } from './counterfactual.js';

/**
 * The choke-point selector — `docs/unified-impact-analysis-research.md` §4.1, §4.4,
 * §5 steps 2 to 5.
 *
 * Two things are asserted here that the module's correctness rests on and that no
 * amount of reading the code establishes. First, that the counterfactual actually
 * measures rather than estimates: the seed's mid-chain binding is the fixture, and
 * it is the case every cheap derivation gets wrong. Second, that the two selection
 * strategies are genuinely different algorithms with a published discriminant, so
 * `selection.method` is load-bearing rather than decorative.
 */
const MAX_DEPTH = DEFAULT_ACCOUNTABILITY_POLICY.maxChainDepth;

const GRAPH: IdentityGraph = seedGraphSource().graph();
const BASELINE = indexReach(GRAPH, MAX_DEPTH);
const CANDIDATES = pivotBindingsOf(GRAPH);

const CONTEXT: SelectionContext = {
  graph: GRAPH,
  maxDepth: MAX_DEPTH,
  candidates: CANDIDATES,
  baseline: BASELINE,
};

const REPORT = selectChokePoints(CONTEXT);

function candidate(permission: string): CandidateEvaluation {
  const found = REPORT.evaluations.find((evaluation) => evaluation.permission === permission);
  assert.ok(found !== undefined, `no evaluation for "${permission}"`);
  return found;
}

// --- Fixtures ---------------------------------------------------------------

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

function contextFor(dataset: IdentityDataset): SelectionContext {
  const graph = buildIdentityGraph(dataset);
  return {
    graph,
    maxDepth: MAX_DEPTH,
    candidates: pivotBindingsOf(graph),
    baseline: indexReach(graph, MAX_DEPTH),
  };
}

// --- The counterfactual is non-destructive ----------------------------------

/**
 * `ITAG.md` §F7 L101 — "toggles never touch the base seed dataset."
 *
 * Asserted rather than trusted, because it is the one property whose violation
 * would be invisible until a later request returned the wrong answer: a mutation
 * would leave the process serving a permanently severed estate and every number
 * after it would be internally consistent and wrong.
 */
test('severing a binding leaves the base graph untouched', () => {
  const before = indexReach(GRAPH, MAX_DEPTH).reachablePairs;

  const severed = severingBindings(GRAPH.dataset, ['mcp:connect-prod-runbook']);
  const counterfactual = indexReach(severed.graph(), MAX_DEPTH);

  assert.equal(counterfactual.reachablePairs < before, true, 'the copy really did change');
  assert.equal(
    indexReach(GRAPH, MAX_DEPTH).reachablePairs,
    before,
    'and the original is the same graph it was',
  );
  assert.equal(GRAPH.permissionBindings.has('mcp:connect-prod-runbook'), true);
});

/**
 * A `GraphSource` whose `graph()` returned a fresh object per call would make every
 * identity comparison in a consumer accidentally false, and the failure would look
 * like a caching bug three modules away. Same contract as `seedGraphSource`.
 */
test('a counterfactual source returns one stable graph', () => {
  const severed = severingBindings(GRAPH.dataset, ['ssm:session-deploy-box']);
  assert.equal(severed.graph(), severed.graph());
});

/** The tri-state of `sensitive` survives the copy — PRD Amendment 3. */
test('severing preserves every other fact about the permission catalogue', () => {
  const severed = severingBindings(GRAPH.dataset, ['mcp:connect-prod-runbook']).graph();

  assert.deepEqual([...severed.sensitivePermissions].sort(), [...GRAPH.sensitivePermissions].sort());
  assert.deepEqual(
    [...severed.unclassifiedPermissions].sort(),
    [...GRAPH.unclassifiedPermissions].sort(),
  );
  assert.equal(severed.dataset.permissions.length, GRAPH.dataset.permissions.length);
  assert.deepEqual(
    [...severed.permissionBindings.keys()].sort(),
    CANDIDATES.filter((id) => id !== 'mcp:connect-prod-runbook'),
    'exactly one binding is gone, and nothing else is',
  );
});

// --- Measurement beats estimation -------------------------------------------

/**
 * The assertion this module exists for.
 *
 * `seed-impact.test.ts` pins that ranking candidates by `AccessPath.via_permission`
 * scores `gh:connect-artifact-signer` at one subject, because `via_permission`
 * records only a path's front crossing. Severing it actually costs three subjects
 * their route to `deploy:prod`. This is the same fixture read from the other side:
 * the counterfactual recovers the two the shortcut loses, which is the whole
 * argument for rebuilding the graph rather than tallying a path attribute.
 */
test('the counterfactual recovers reach a front-crossing tally would miss', () => {
  const midChain = candidate('gh:connect-artifact-signer');

  assert.equal(midChain.access_removed.removed, 3);
  assert.deepEqual(
    midChain.affected.map((loss) => loss.identity_id),
    ['role-release-runner', 'svc-hotfix-deployer', 'svc-release-orchestrator'],
  );
  for (const loss of midChain.affected) {
    assert.deepEqual(loss.permissions_lost, ['deploy:prod'], loss.identity_id);
  }

  assert.deepEqual(
    midChain.held_by,
    ['role-release-runner'],
    'one holder, three subjects — which is exactly why the shortcut undercounts',
  );
});

/**
 * Demo beat 30 — the whole-estate choke point, computed rather than authored.
 *
 * `docs/demo-script.md` beat 23 already ends on a hand-written table row naming
 * `mcp:connect-prod-runbook` as the grant that closes the chain. Research §9 makes
 * this module's demo job "compute that sentence instead of authoring it", so the
 * assertion is that it comes out on top on measured consequence.
 *
 * `held_by` is the part a reviewer acts on: the grant sits on a group, so the
 * remediation is one membership-container change rather than four user changes.
 */
test('beat 30: the top choke point is measured, and it sits on a group', () => {
  const top = REPORT.evaluations[0];
  assert.ok(top !== undefined);

  assert.equal(top.permission, 'mcp:connect-prod-runbook');
  assert.equal(top.grants_identity, 'role-runbook-executor');
  assert.deepEqual(top.held_by, ['group-oncall-agents']);
  assert.equal(top.closes, 'access');

  assert.equal(top.access_removed.removed, 12);
  assert.equal(top.access_removed.baseline, 220);
  assert.equal(top.mechanisms_closed.removed, 8);
  assert.equal(top.mechanisms_closed.baseline, 18);

  assert.deepEqual(
    top.affected.map((loss) => loss.identity_id),
    ['agent-incident-responder', 'agent-support-triage', 'svc-runbook-scheduler', 'user-tomas'],
    'one grant, and a person, an agent and two service identities lose production',
  );
});

/**
 * Demo beat 31 — the honesty beat, and research §1.3 answered on screen.
 *
 * Severing `connect:ledger-writer` closes a mechanism and removes **no access**,
 * because `svc-invoice-poster` still reaches `write:invoice-queue` through its
 * group. A tool reporting "17% of risk removed" here would have changed how the
 * permission is obtained and not what is obtainable, and the label plus the
 * surviving route is what makes that impossible to render.
 */
test('beat 31: a candidate that closes a mechanism and removes nothing says so', () => {
  const redundant = candidate('connect:ledger-writer');

  assert.equal(redundant.closes, 'mechanism_only');
  assert.equal(redundant.access_removed.removed, 0);
  assert.equal(redundant.access_removed.share_of_baseline, 0);
  assert.equal(redundant.mechanisms_closed.removed, 1);
  assert.deepEqual(redundant.affected, [], 'nobody loses access, so nobody is affected');

  assert.deepEqual(redundant.surviving_routes, [
    {
      identity_id: 'svc-invoice-poster',
      permission: 'write:invoice-queue',
      route_types: ['indirect'],
    },
  ]);
});

/**
 * Both deltas travel on every row, and each carries its own denominator inside it.
 *
 * Research §1.3: the same remediation is 17% or 0% depending on which baseline is
 * meant, so a single figure is a choice of whichever reads better. `baseline`,
 * `counterfactual` and `removed` are all published so the share can be checked
 * rather than trusted, and `share_of_baseline` is a ratio rather than a 0-100
 * number so it can never be mistaken for the other ranker's scale.
 */
test('every candidate publishes two deltas and both denominators', () => {
  assert.equal(REPORT.evaluations.length > 0, true);

  for (const evaluation of REPORT.evaluations) {
    for (const [name, delta] of [
      ['access_removed', evaluation.access_removed],
      ['mechanisms_closed', evaluation.mechanisms_closed],
    ] as const) {
      const label = `${evaluation.permission}.${name}`;
      assert.equal(delta.baseline - delta.counterfactual, delta.removed, label);
      assert.equal(delta.share_of_baseline, delta.removed / delta.baseline, label);
      assert.equal(delta.share_of_baseline <= 1, true, label);
    }
  }
});

/**
 * The label and its evidence are the same fact, so neither can appear alone.
 *
 * `mechanism_only` without a surviving route is an unevidenced claim that access
 * survived; `access` with an empty affected list is an unevidenced claim that it
 * did not. Asserted over the whole candidate set rather than the two demo rows so
 * it stays true as the estate grows.
 */
test('the effect label is consistent with what the candidate produced', () => {
  for (const evaluation of REPORT.evaluations) {
    const label = evaluation.permission;
    switch (evaluation.closes) {
      case 'access':
        assert.equal(evaluation.access_removed.removed > 0, true, label);
        assert.equal(evaluation.affected.length > 0, true, label);
        assert.deepEqual(evaluation.surviving_routes, [], label);
        break;
      case 'mechanism_only':
        assert.equal(evaluation.access_removed.removed, 0, label);
        assert.equal(evaluation.mechanisms_closed.removed > 0, true, label);
        assert.equal(evaluation.surviving_routes.length > 0, true, label);
        break;
      case 'no_effect':
        assert.equal(evaluation.access_removed.removed, 0, label);
        assert.equal(evaluation.mechanisms_closed.removed, 0, label);
        break;
    }
  }
});

/**
 * Research §5 step 4 — ranked on measured consequence, not on appearance.
 *
 * The estate's ordering is the whole demo table, so it is pinned rather than
 * described. `gh:connect-release-runner` above `gh:connect-artifact-signer` is the
 * interesting pair: the first is held by two subjects and removes four pairs, the
 * second by one subject and removes three, and no appearance-frequency count
 * arrives at that ordering.
 */
test('candidates rank by access removed, then mechanisms closed, then id', () => {
  assert.deepEqual(
    REPORT.evaluations.map((evaluation) => [evaluation.permission, evaluation.access_removed.removed]),
    [
      ['mcp:connect-prod-runbook', 12],
      ['mcp:connect-warehouse-box', 5],
      ['gh:connect-release-runner', 4],
      ['gh:connect-artifact-signer', 3],
      ['ssm:session-deploy-box', 2],
      ['ci:assume-build-agent', 1],
      // `seed/threat-coverage.ts` beats 32-33 tie at zero with `connect:ledger-writer` —
      // each is a single-holder choke point that removes only its own holder's reach
      // of the permission itself — so the tie breaks on id.
      ['connect:ledger-writer', 0],
      ['read:integration-status-feed', 0],
      ['read:vendor-sync-status', 0],
    ],
  );
});

/** The candidate space is the binding set, and every member of it is evaluated. */
test('the selection method is published, and exhaustive means exhaustive', () => {
  assert.equal(REPORT.selection.method, 'exhaustive');
  assert.equal(REPORT.selection.candidate_space, CANDIDATES.length);
  assert.equal(REPORT.selection.candidates_evaluated, CANDIDATES.length);
  assert.equal(REPORT.evaluations.length, CANDIDATES.length);
  assert.equal(CANDIDATES.length, 9);
});

/**
 * The denominators the whole report is quoted against, pinned where they are
 * produced. `reachable_pairs` counts distinct `(subject, permission)` pairs rather
 * than paths, which is why a redundant mechanism can score zero at all.
 */
test('the baseline is stated in the units the deltas are measured in', () => {
  assert.deepEqual(baselineOf(BASELINE), {
    reachable_pairs: 220,
    pivot_edges: 18,
    identities_scanned: 134,
  });
});

// --- The two strategies are two algorithms ----------------------------------

/**
 * Architecture rule 3 — extension is an append to a frozen registry, and list order
 * is precedence. The exact answer wins whenever it is affordable; the bounded
 * approximation is the fallback that accepts everything left over.
 */
test('the strategy registry is frozen, ordered, and ends in a total fallback', () => {
  assert.equal(Object.isFrozen(DEFAULT_CHOKE_POINT_STRATEGIES), true);
  assert.deepEqual(
    DEFAULT_CHOKE_POINT_STRATEGIES.map((strategy) => strategy.method),
    ['exhaustive', 'greedy_hitting_set'],
  );
  assert.equal(GREEDY_HITTING_SET_STRATEGY.applies(CONTEXT), true, 'the fallback declines nothing');
  assert.equal(EXHAUSTIVE_STRATEGY.applies(CONTEXT), true, 'and the exact arm is affordable here');
});

/**
 * The budget is a cost ceiling, and crossing it changes the algorithm rather than
 * truncating the answer.
 *
 * `applies` reads only the candidate count, so the threshold is asserted directly
 * instead of by growing a fixture past it: what is under test is that
 * `MAX_EXHAUSTIVE_CANDIDATES` is honoured at all, and a 65-binding estate built to
 * prove an inequality would be sixty-five permissions nobody can read.
 */
test('the exact arm declines a candidate space it cannot afford', () => {
  const oversized: SelectionContext = {
    ...CONTEXT,
    candidates: Array.from({ length: MAX_EXHAUSTIVE_CANDIDATES + 1 }, (_unused, index) => `connect:${index}`),
  };

  assert.equal(EXHAUSTIVE_STRATEGY.applies(oversized), false);
  assert.equal(
    selectChokePoints(oversized).selection.method,
    'greedy_hitting_set',
    'and the registry falls through to the arm that carries a bound',
  );
});

/**
 * The greedy arm, exercised on a fixture because the seed will never reach it.
 *
 * Research §4.4 adopts `GREEDY-HITTING-SET` for its published bound, and the bound
 * is only meaningful if it is computed from the instance rather than quoted: `H(k)`
 * over the largest set, travelling with the `k` it was taken over so a consumer can
 * recompute it. Forcing the strategy directly rather than growing a fixture past
 * `MAX_EXHAUSTIVE_CANDIDATES`, because what is under test is the algorithm and not
 * the budget.
 */
test('the greedy arm publishes a bound computed from its own instance', () => {
  const context = contextFor(
    fixture(
      [
        node('subject-a', { direct_grants: ['connect:one'] }),
        node('subject-b', { direct_grants: ['connect:one', 'connect:two'] }),
        node('role-one', { direct_grants: ['admin:alpha'] }),
        node('role-two', { direct_grants: ['admin:beta'] }),
      ],
      [
        { id: 'connect:one', sensitive: false, grants_identity: 'role-one' },
        { id: 'connect:two', sensitive: false, grants_identity: 'role-two' },
        { id: 'admin:alpha', sensitive: true },
        { id: 'admin:beta', sensitive: true },
      ],
    ),
  );

  const greedy = GREEDY_HITTING_SET_STRATEGY.rank(context);
  assert.equal(greedy.selection.method, 'greedy_hitting_set');
  assert.ok(greedy.selection.method === 'greedy_hitting_set');

  const { largest_hit_set: largest, approximation_ratio: ratio } = greedy.selection;
  assert.equal(largest > 0, true, 'a bound over an empty instance would be meaningless');

  let harmonic = 0;
  for (let index = 1; index <= largest; index += 1) {
    harmonic += 1 / index;
  }
  assert.equal(ratio, harmonic, 'H(k) is recomputable from the k that travels with it');

  assert.deepEqual(
    greedy.evaluations.map((evaluation) => evaluation.permission).sort(),
    ['connect:one', 'connect:two'],
    'every candidate is still ranked; only the method of ranking changed',
  );
});

/**
 * The two arms disagree, and that is why publishing which one ran matters.
 *
 * Greedy never rebuilds the graph, so it cannot name the identities that lose
 * access and does not pretend to. A consumer reading `affected_identities` without
 * checking `selection.method` would read an empty list as "nobody is affected"
 * rather than as "this arm does not measure that" — which is the exact failure
 * research §4.4 is about, one level down.
 */
test('the greedy arm withholds what it did not measure', () => {
  const greedy = GREEDY_HITTING_SET_STRATEGY.rank(CONTEXT);

  for (const evaluation of greedy.evaluations) {
    assert.deepEqual(evaluation.affected, [], evaluation.permission);
    assert.deepEqual(evaluation.surviving_routes, [], evaluation.permission);
  }

  const exhaustive = EXHAUSTIVE_STRATEGY.rank(CONTEXT);
  assert.equal(
    exhaustive.evaluations.some((evaluation) => evaluation.affected.length > 0),
    true,
    'while the arm that did measure it publishes it',
  );
});

// --- The third effect value -------------------------------------------------

/**
 * A binding nobody crosses removes no access *and* closes no mechanism.
 *
 * Not reachable from the seed, where every binding is exercised, so it is a
 * fixture — and it is a distinct value rather than a `mechanism_only` with a zero,
 * because "redundant today" and "unused today" have different remediations and only
 * the second is a candidate for deletion.
 */
test('a binding no path crosses is reported as no_effect, not as a closed mechanism', () => {
  const context = contextFor(
    fixture(
      [
        node('lonely-role', { direct_grants: ['admin:unused'] }),
        node('bystander', { direct_grants: ['read:ordinary'] }),
      ],
      [
        { id: 'connect:nobody-holds-this', sensitive: false, grants_identity: 'lonely-role' },
        { id: 'admin:unused', sensitive: true },
        { id: 'read:ordinary', sensitive: false },
      ],
    ),
  );

  const result = EXHAUSTIVE_STRATEGY.rank(context);
  const unused = result.evaluations.find(
    (evaluation) => evaluation.permission === 'connect:nobody-holds-this',
  );

  assert.ok(unused !== undefined);
  assert.equal(unused.closes, 'no_effect');
  assert.equal(unused.access_removed.removed, 0);
  assert.equal(unused.mechanisms_closed.removed, 0);
  assert.deepEqual(unused.held_by, [], 'the grant confers a principal and nobody holds it');
});
