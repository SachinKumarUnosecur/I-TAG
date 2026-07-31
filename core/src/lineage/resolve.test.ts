import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_ACCOUNTABILITY_POLICY } from '../domain/policy.js';
import type { Identity, IdentityDataset } from '../domain/types.js';
import { buildIdentityGraph, creationEdgeKey, type IdentityGraph } from '../graph/build.js';
import {
  ancestorsToRoot,
  descendants,
  fanOut,
  fanOutInApp,
  inAppRoot,
  rootKindOf,
} from './resolve.js';

const DEPTH = DEFAULT_ACCOUNTABILITY_POLICY.maxChainDepth;

function identity(partial: Pick<Identity, 'id' | 'type'> & Partial<Identity>): Identity {
  return {
    name: partial.id,
    app: 'aws-iam',
    direct_grants: [],
    inherited_from: [],
    delegates_to: [],
    provisioned_by: null,
    ...partial,
  };
}

function build(identities: readonly Identity[]): IdentityGraph {
  const dataset: IdentityDataset = {
    apps: [
      { id: 'aws-iam', name: 'AWS IAM', creation_data_from: null },
      { id: 'mcp-gateway', name: 'MCP Gateway', creation_data_from: null },
    ],
    identities,
    employee_status: {},
    teams: [],
    owner_assignments: [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
  return buildIdentityGraph(dataset);
}

function subject(graph: IdentityGraph, id: string): Identity {
  const found = graph.byId.get(id);
  assert.ok(found !== undefined, `fixture is missing "${id}"`);
  return found;
}

/** root -> mid -> leaf, all in one app. */
const LADDER: readonly Identity[] = [
  identity({ id: 'root', type: 'human', delegates_to: ['mid'] }),
  identity({ id: 'mid', type: 'service_account', provisioned_by: 'root', delegates_to: ['leaf'] }),
  identity({ id: 'leaf', type: 'service_account', provisioned_by: 'mid' }),
];

// --- Generation, memoized at build ------------------------------------------

test('generation counts same-app hops from the root, with the root at zero', () => {
  const graph = build(LADDER);

  assert.equal(graph.generation.get('root'), 0);
  assert.equal(graph.generation.get('mid'), 1);
  assert.equal(graph.generation.get('leaf'), 2);
});

/**
 * The property research §5 says keeps the table view `O(V)` instead of `O(V·d)`.
 * Asserted by shape rather than by timing: every identity is present exactly once,
 * which is only true if the pass settled each node on first visit.
 */
test('every identity with a root is memoized once, in one pass', () => {
  const graph = build(LADDER);

  assert.equal(graph.generation.size, LADDER.length);
  for (const value of graph.generation.values()) {
    assert.equal(Number.isInteger(value), true);
  }
});

/**
 * A chain that leaves the app is not one app's lineage. If cross-app hops counted
 * toward generation, `graph.byApp` would stop partitioning and a per-app figure
 * would silently describe a merged forest (§4.7).
 */
test('a cross-app creator does not raise the child generation', () => {
  const graph = build([
    identity({ id: 'human', type: 'human', delegates_to: ['agent'] }),
    identity({ id: 'agent', type: 'ai_agent', app: 'mcp-gateway', provisioned_by: 'human' }),
  ]);

  assert.equal(graph.generation.get('agent'), 0, 'a root within its own app');
  assert.equal(rootKindOf(graph, subject(graph, 'agent')), 'creator_in_other_app');
  assert.equal(graph.crossAppEdges.has(creationEdgeKey('mcp-gateway', 'agent')), true);
  assert.equal(graph.creationEdges.has(creationEdgeKey('mcp-gateway', 'agent')), false);
});

/**
 * `PRD` L28 says this shape cannot exist. Identifier reuse produces it (§4.8), so
 * the memo has to report "no root" rather than loop or emit an arbitrary number.
 */
test('a cycle yields no generation at all rather than a wrong one', () => {
  const graph = build([
    identity({ id: 'a', type: 'service_account', provisioned_by: 'b', delegates_to: ['b'] }),
    identity({ id: 'b', type: 'service_account', provisioned_by: 'a', delegates_to: ['a'] }),
  ]);

  assert.equal(graph.generation.has('a'), false, 'absent, not zero — zero would read as a root');
  assert.equal(graph.generation.has('b'), false);
  assert.equal(rootKindOf(graph, subject(graph, 'a')), 'none');
  assert.equal(inAppRoot(graph, subject(graph, 'a')), null);
});

/**
 * A dangling edge stays in the per-app forest by design, so `buildGenerations` has
 * to re-check that the parent resolves; otherwise the child inherits a generation
 * from a node that does not exist.
 */
test('an unresolvable creator leaves its child a root, and says which kind', () => {
  const graph = build([identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-ghost' })]);

  assert.equal(graph.generation.get('svc'), 0);
  assert.equal(rootKindOf(graph, subject(graph, 'svc')), 'creator_unresolvable');
  assert.equal(
    graph.creationEdges.has(creationEdgeKey('aws-iam', 'svc')),
    true,
    'the edge is recorded; it is the parent that is missing',
  );
});

test('a five-generation ladder is measured, not flagged', () => {
  const ladder: readonly Identity[] = Array.from({ length: 6 }, (_unused, offset) =>
    identity({
      id: `gen-${offset}`,
      type: offset === 0 ? 'human' : 'service_account',
      provisioned_by: offset === 0 ? null : `gen-${offset - 1}`,
      delegates_to: offset === 5 ? [] : [`gen-${offset + 1}`],
    }),
  );
  const graph = build(ladder);

  assert.equal(graph.generation.get('gen-5'), 5);
  // Research §4.2 deletes `deep_chain`: depth is a sortable column, and nothing in
  // the engine converts it into a flag or a severity.
  assert.equal(rootKindOf(graph, subject(graph, 'gen-5')), 'no_creator_recorded');
  assert.equal(inAppRoot(graph, subject(graph, 'gen-5'))?.id, 'gen-0');
});

// --- Fan-out ----------------------------------------------------------------

test('fan-out is O(1) from the precomputed inverse indexes', () => {
  const graph = build([
    identity({ id: 'bot', type: 'service_account', delegates_to: ['local', 'remote'] }),
    identity({ id: 'local', type: 'service_account', provisioned_by: 'bot' }),
    identity({ id: 'remote', type: 'ai_agent', app: 'mcp-gateway', provisioned_by: 'bot' }),
  ]);

  assert.equal(fanOut(graph, 'bot'), 2, 'children in any app');
  assert.equal(fanOutInApp(graph, 'bot'), 1, 'children inside this app only');
  assert.equal(fanOut(graph, 'local'), 0);
});

// --- Walks ------------------------------------------------------------------

/**
 * The single behavioural difference from F4, and the reason this module exists:
 * `accountability/trace.ts` L33 halts at the first human, so it can never report a
 * generation, a true root, or the §4.3 chain object.
 */
test('the ancestor walk continues past a human to the true root', () => {
  const graph = build([
    identity({ id: 'bootstrap', type: 'service_account', delegates_to: ['admin'] }),
    identity({ id: 'admin', type: 'human', provisioned_by: 'bootstrap', delegates_to: ['svc'] }),
    identity({ id: 'svc', type: 'service_account', provisioned_by: 'admin' }),
  ]);

  const walk = ancestorsToRoot(graph, subject(graph, 'svc'), DEPTH);

  assert.equal(walk.outcome, 'complete');
  assert.deepEqual(
    walk.nodes.map((node) => node.identity_id),
    ['svc', 'admin', 'bootstrap'],
    'the human is a hop, not a terminus',
  );
  assert.deepEqual(
    walk.nodes.map((node) => node.distance),
    [0, 1, 2],
  );
});

test('each hop reports whether it crossed an app boundary', () => {
  const graph = build([
    identity({ id: 'human', type: 'human', delegates_to: ['svc'] }),
    identity({ id: 'svc', type: 'service_account', delegates_to: ['agent'], provisioned_by: 'human' }),
    identity({ id: 'agent', type: 'ai_agent', app: 'mcp-gateway', provisioned_by: 'svc' }),
  ]);

  const walk = ancestorsToRoot(graph, subject(graph, 'agent'), DEPTH);

  assert.deepEqual(
    walk.nodes.map((node) => [node.identity_id, node.crosses_app]),
    [
      ['agent', false],
      ['svc', true],
      ['human', false],
    ],
    'only the hop that left mcp-gateway is a correlation',
  );
});

test('the descendant walk follows the precomputed inverse and tolerates convergence', () => {
  const graph = build(LADDER);
  const walk = descendants(graph, subject(graph, 'root'), DEPTH);

  assert.equal(walk.outcome, 'complete');
  assert.deepEqual(
    walk.nodes.map((node) => node.identity_id),
    ['root', 'mid', 'leaf'],
  );
});

test('a cycle terminates the ancestor walk and names the repeated id', () => {
  const graph = build([
    identity({ id: 'a', type: 'service_account', provisioned_by: 'b', delegates_to: ['b'] }),
    identity({ id: 'b', type: 'service_account', provisioned_by: 'a', delegates_to: ['a'] }),
  ]);

  const walk = ancestorsToRoot(graph, subject(graph, 'a'), DEPTH);

  assert.equal(walk.outcome, 'cycle_detected');
  assert.equal(walk.outcome === 'cycle_detected' ? walk.repeated_id : null, 'a');
});

test('a dangling creator terminates the ancestor walk and names what is missing', () => {
  const graph = build([identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-ghost' })]);

  const walk = ancestorsToRoot(graph, subject(graph, 'svc'), DEPTH);

  assert.equal(walk.outcome, 'dangling_reference');
  assert.equal(walk.outcome === 'dangling_reference' ? walk.missing_id : null, 'user-ghost');
});

/**
 * A safety state, not a risk signal. Research §4.2 is explicit that this must not be
 * folded into the deleted `deep_chain` space: "the walk gave up" and "this chain is
 * suspicious" are different claims.
 */
test('the depth cap terminates the walk and reports the limit', () => {
  const chain: readonly Identity[] = Array.from({ length: 5 }, (_unused, offset) =>
    identity({
      id: `link-${offset}`,
      type: 'service_account',
      provisioned_by: offset === 0 ? null : `link-${offset - 1}`,
      delegates_to: offset === 4 ? [] : [`link-${offset + 1}`],
    }),
  );
  const graph = build(chain);

  const walk = ancestorsToRoot(graph, subject(graph, 'link-4'), 2);

  assert.equal(walk.outcome, 'depth_limit_exceeded');
  assert.equal(walk.outcome === 'depth_limit_exceeded' ? walk.limit : null, 2);
});

/** No `haltOn` is set, so the traversal's halted state must be unreachable here. */
test('neither walk can halt, which is what separates this from F4', () => {
  const graph = build(LADDER);

  for (const walk of [
    ancestorsToRoot(graph, subject(graph, 'leaf'), DEPTH),
    descendants(graph, subject(graph, 'root'), DEPTH),
  ]) {
    assert.equal(walk.outcome, 'complete');
    assert.equal(walk.nodes.length, 3, 'a halt would have truncated this');
  }
});
