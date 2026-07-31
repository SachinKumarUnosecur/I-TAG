import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Identity, IdentityDataset } from '../domain/types.js';
import { buildIdentityGraph, type IdentityGraph } from './build.js';
import { traverse } from './traverse.js';

const FIXTURE_APP = 'aws-iam';

function identity(partial: Pick<Identity, 'id' | 'type'> & Partial<Identity>): Identity {
  return {
    name: partial.id,
    app: FIXTURE_APP,
    direct_grants: [],
    inherited_from: [],
    delegates_to: [],
    provisioned_by: null,
    ...partial,
  };
}

/** Fixture graph. Bypasses validation so pathological shapes can be built directly. */
function fixture(identities: readonly Identity[]): IdentityGraph {
  const dataset: IdentityDataset = {
    apps: [{ id: FIXTURE_APP, name: 'AWS IAM', creation_data_from: null }],
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

const upward = (node: Identity): readonly string[] =>
  node.provisioned_by === null ? [] : [node.provisioned_by];

function startOf(graph: IdentityGraph, id: string): Identity {
  const node = graph.byId.get(id);
  assert.ok(node !== undefined, `fixture is missing "${id}"`);
  return node;
}

test('exhausts a linear chain and reports every node in order', () => {
  const graph = fixture([
    identity({ id: 'c', type: 'ai_agent', provisioned_by: 'b' }),
    identity({ id: 'b', type: 'service_account', provisioned_by: 'a' }),
    identity({ id: 'a', type: 'service_account' }),
  ]);

  const result = traverse(graph, startOf(graph, 'c'), { select: upward, maxDepth: 16 });

  assert.deepEqual(
    result.visited.map((node) => node.id),
    ['c', 'b', 'a'],
  );
  assert.equal(result.stop.kind, 'exhausted');
  assert.equal(result.depthOf.get('a'), 2);
  assert.equal(result.predecessors.get('a'), 'b');
});

test('halts on the origin when the predicate matches immediately', () => {
  const graph = fixture([identity({ id: 'root', type: 'human' })]);

  const result = traverse(graph, startOf(graph, 'root'), {
    select: upward,
    maxDepth: 16,
    haltOn: (node) => node.type === 'human',
  });

  assert.deepEqual(result.stop, { kind: 'halted', at: 'root' });
  assert.equal(result.visited.length, 1);
});

test('reports a dangling reference without throwing', () => {
  const graph = fixture([identity({ id: 'a', type: 'service_account', provisioned_by: 'ghost' })]);

  const result = traverse(graph, startOf(graph, 'a'), { select: upward, maxDepth: 16 });

  assert.deepEqual(result.stop, { kind: 'dangling', from: 'a', missing: 'ghost' });
  assert.deepEqual(
    result.visited.map((node) => node.id),
    ['a'],
  );
});

test('reports a two-node cycle when revisits stop the walk', () => {
  const graph = fixture([
    identity({ id: 'a', type: 'service_account', provisioned_by: 'b' }),
    identity({ id: 'b', type: 'service_account', provisioned_by: 'a' }),
  ]);

  const result = traverse(graph, startOf(graph, 'a'), {
    select: upward,
    maxDepth: 16,
    onRevisit: 'stop',
  });

  assert.deepEqual(result.stop, { kind: 'cycle', at: 'a' });
});

test('reports a self-referencing node as a cycle', () => {
  const graph = fixture([identity({ id: 'a', type: 'service_account', provisioned_by: 'a' })]);

  const result = traverse(graph, startOf(graph, 'a'), {
    select: upward,
    maxDepth: 16,
    onRevisit: 'stop',
  });

  assert.deepEqual(result.stop, { kind: 'cycle', at: 'a' });
});

test('treats a revisit as convergence when the policy is skip', () => {
  // a delegates to both b and c; both delegate to d. Reaching d twice is a
  // diamond, not corruption — the forward blast radius (F2) depends on this.
  const graph = fixture([
    identity({ id: 'a', type: 'human', delegates_to: ['b', 'c'] }),
    identity({ id: 'b', type: 'service_account', delegates_to: ['d'] }),
    identity({ id: 'c', type: 'service_account', delegates_to: ['d'] }),
    identity({ id: 'd', type: 'ai_agent' }),
  ]);

  const result = traverse(graph, startOf(graph, 'a'), {
    select: (node) => node.delegates_to,
    maxDepth: 16,
    onRevisit: 'skip',
  });

  assert.equal(result.stop.kind, 'exhausted');
  assert.deepEqual(
    result.visited.map((node) => node.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('stops at the configured depth limit', () => {
  const graph = fixture([
    identity({ id: 'd', type: 'ai_agent', provisioned_by: 'c' }),
    identity({ id: 'c', type: 'service_account', provisioned_by: 'b' }),
    identity({ id: 'b', type: 'service_account', provisioned_by: 'a' }),
    identity({ id: 'a', type: 'human' }),
  ]);

  const result = traverse(graph, startOf(graph, 'd'), { select: upward, maxDepth: 2 });

  assert.deepEqual(result.stop, { kind: 'depth_limit', limit: 2 });
  assert.deepEqual(
    result.visited.map((node) => node.id),
    ['d', 'c', 'b'],
  );
});

test('visits branching references in deterministic sorted order', () => {
  const graph = fixture([
    identity({ id: 'root', type: 'human', delegates_to: ['zeta', 'alpha', 'mid'] }),
    identity({ id: 'alpha', type: 'service_account' }),
    identity({ id: 'mid', type: 'service_account' }),
    identity({ id: 'zeta', type: 'service_account' }),
  ]);

  const result = traverse(graph, startOf(graph, 'root'), {
    select: (node) => node.delegates_to,
    maxDepth: 16,
  });

  assert.deepEqual(
    result.visited.map((node) => node.id),
    ['root', 'alpha', 'mid', 'zeta'],
  );
});

test('indexes the inverse of provisioned_by for downstream sweeps', () => {
  const graph = fixture([
    identity({ id: 'owner', type: 'human' }),
    identity({ id: 'svc-b', type: 'service_account', provisioned_by: 'owner' }),
    identity({ id: 'svc-a', type: 'service_account', provisioned_by: 'owner' }),
  ]);

  assert.deepEqual(graph.provisionedChildren.get('owner'), ['svc-a', 'svc-b']);
});
