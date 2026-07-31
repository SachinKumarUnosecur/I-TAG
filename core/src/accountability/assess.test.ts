import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixedClock } from '../adapters/clock.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, type AccountabilityPolicy } from '../domain/policy.js';
import type { AccountabilityAssessment } from '../domain/results.js';
import type { EmployeeRecord, Identity, IdentityDataset } from '../domain/types.js';
import { buildIdentityGraph, creationEdgeKey } from '../graph/build.js';
import { SEED_DATASET } from '../data/seed.js';
import { DatasetValidationError, validateDataset } from '../data/validate.js';
import { createAccountabilityService } from './assess.js';
import { DEFAULT_ORPHAN_RULES } from './rules.js';

const NOW = new Date('2026-07-31T00:00:00Z');

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

function dataset(
  identities: readonly Identity[],
  employeeStatus: Readonly<Record<string, EmployeeRecord>>,
): IdentityDataset {
  return {
    apps: [{ id: FIXTURE_APP, name: 'AWS IAM', creation_data_from: null }],
    identities,
    employee_status: employeeStatus,
    teams: [],
    owner_assignments: [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
}

/**
 * Assesses an identity against a hand-built graph.
 *
 * Fixtures rather than the seed dataset: each test then states its own premise,
 * and pathological shapes can be built without satisfying dataset validation.
 */
function assess(
  identities: readonly Identity[],
  employeeStatus: Readonly<Record<string, EmployeeRecord>>,
  identityId: string,
  policy: AccountabilityPolicy = DEFAULT_ACCOUNTABILITY_POLICY,
): AccountabilityAssessment {
  const graph = buildIdentityGraph(dataset(identities, employeeStatus));
  const service = createAccountabilityService({
    graphSource: { graph: () => graph },
    clock: fixedClock(NOW),
    policy,
    rules: DEFAULT_ORPHAN_RULES,
  });

  const outcome = service.assess(identityId);
  assert.ok(outcome.ok, `expected "${identityId}" to resolve`);
  return outcome.assessment;
}

/** agent -> service account -> human. The shape of the canonical demo chain. */
function threeHopChain(): readonly Identity[] {
  return [
    identity({ id: 'agent', type: 'ai_agent', provisioned_by: 'svc' }),
    identity({ id: 'svc', type: 'service_account', provisioned_by: 'owner' }),
    identity({ id: 'owner', type: 'human' }),
  ];
}

test('resolves a multi-hop chain to an active, recently reviewed human', () => {
  const result = assess(threeHopChain(), {
    owner: { status: 'active', last_reviewed: '2026-07-01' },
  }, 'agent');

  assert.equal(result.termination, 'resolved_human');
  assert.equal(result.root_human, 'owner');
  assert.equal(result.orphaned, false);
  assert.equal(result.orphan_reason, null);
  assert.equal(result.days_since_review, 30);
  assert.deepEqual(
    result.chain.map((node) => node.id),
    ['agent', 'svc', 'owner'],
  );
});

test('flags a departed root human', () => {
  const result = assess(threeHopChain(), {
    owner: { status: 'departed', last_reviewed: '2026-06-01' },
  }, 'agent');

  assert.equal(result.termination, 'resolved_human');
  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'departed');
  assert.equal(result.days_since_review, 60);
});

test('flags a role-changed root human even with a recent review', () => {
  const result = assess(threeHopChain(), {
    owner: { status: 'role_changed', last_reviewed: '2026-07-29' },
  }, 'agent');

  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'role_changed');
});

test('does not flag an active human reviewed exactly on the staleness threshold', () => {
  // 2026-05-02 is exactly 90 days before the injected clock.
  const result = assess(threeHopChain(), {
    owner: { status: 'active', last_reviewed: '2026-05-02' },
  }, 'agent');

  assert.equal(result.days_since_review, DEFAULT_ACCOUNTABILITY_POLICY.staleReviewDays);
  assert.equal(result.orphaned, false);
  assert.equal(result.orphan_reason, null);
});

test('flags an active human one day past the staleness threshold', () => {
  const result = assess(threeHopChain(), {
    owner: { status: 'active', last_reviewed: '2026-05-01' },
  }, 'agent');

  assert.equal(result.days_since_review, DEFAULT_ACCOUNTABILITY_POLICY.staleReviewDays + 1);
  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'stale_review');
});

test('honours a tightened staleness threshold from policy', () => {
  const result = assess(
    threeHopChain(),
    { owner: { status: 'active', last_reviewed: '2026-07-01' } },
    'agent',
    { staleReviewDays: 14, maxChainDepth: 16 },
  );

  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'stale_review');
});

test('reports a dangling provisioner as broken provenance, not as a missing human', () => {
  const result = assess(
    [identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-ghost' })],
    {},
    'svc',
  );

  assert.equal(result.termination, 'dangling_reference');
  assert.equal(result.root_human, null);
  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'broken_provenance');
  assert.match(result.orphan_detail ?? '', /user-ghost/);
  assert.equal(result.days_since_review, null);
});

test('reports a two-node cycle without looping', () => {
  const result = assess(
    [
      identity({ id: 'a', type: 'service_account', provisioned_by: 'b' }),
      identity({ id: 'b', type: 'service_account', provisioned_by: 'a' }),
    ],
    {},
    'a',
  );

  assert.equal(result.termination, 'cycle_detected');
  assert.equal(result.orphan_reason, 'broken_provenance');
});

test('reports a self-referencing identity as a cycle', () => {
  const result = assess(
    [identity({ id: 'a', type: 'service_account', provisioned_by: 'a' })],
    {},
    'a',
  );

  assert.equal(result.termination, 'cycle_detected');
  assert.equal(result.orphan_reason, 'broken_provenance');
});

test('distinguishes a non-human root from broken provenance', () => {
  const result = assess(
    [
      identity({ id: 'agent', type: 'ai_agent', provisioned_by: 'svc-root' }),
      identity({ id: 'svc-root', type: 'service_account' }),
    ],
    {},
    'agent',
  );

  assert.equal(result.termination, 'no_human_root');
  assert.equal(result.root_human, null);
  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'no_accountable_human');
});

test('reports a chain that exceeds the depth limit', () => {
  const result = assess(threeHopChain(), { owner: { status: 'active', last_reviewed: '2026-07-01' } }, 'agent', {
    staleReviewDays: 90,
    maxChainDepth: 1,
  });

  assert.equal(result.termination, 'depth_limit_exceeded');
  assert.equal(result.root_human, null);
  assert.equal(result.orphan_reason, 'broken_provenance');
});

test('treats a queried human as their own accountable root', () => {
  const result = assess(threeHopChain(), {
    owner: { status: 'active', last_reviewed: '2026-07-01' },
  }, 'owner');

  assert.equal(result.termination, 'resolved_human');
  assert.equal(result.root_human, 'owner');
  assert.deepEqual(
    result.chain.map((node) => node.id),
    ['owner'],
  );
});

test('never reports an unknown root status as healthy', () => {
  // Unreachable in production: dataset validation requires a record per human.
  const result = assess(threeHopChain(), {}, 'agent');

  assert.equal(result.termination, 'resolved_human');
  assert.equal(result.orphaned, true);
  assert.equal(result.orphan_reason, 'broken_provenance');
});

test('returns a typed outcome for an unknown identity rather than throwing', () => {
  const graph = buildIdentityGraph(dataset(threeHopChain(), {}));
  const service = createAccountabilityService({
    graphSource: { graph: () => graph },
    clock: fixedClock(NOW),
    policy: DEFAULT_ACCOUNTABILITY_POLICY,
    rules: DEFAULT_ORPHAN_RULES,
  });

  const outcome = service.assess('does-not-exist');

  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome, { ok: false, error: 'unknown_identity', identity_id: 'does-not-exist' });
});

test('seed dataset passes referential validation', () => {
  assert.doesNotThrow(() => validateDataset(SEED_DATASET));
});

test('validation rejects a delegates_to edge that disagrees with provisioned_by', () => {
  assert.throws(
    () =>
      validateDataset(
        dataset(
          [
            identity({ id: 'owner', type: 'human', delegates_to: ['svc'] }),
            identity({ id: 'svc', type: 'service_account', provisioned_by: null }),
          ],
          { owner: { status: 'active', last_reviewed: '2026-07-01' } },
        ),
      ),
    DatasetValidationError,
  );
});

test('validation rejects a human with no employment record', () => {
  assert.throws(
    () => validateDataset(dataset([identity({ id: 'owner', type: 'human' })], {})),
    DatasetValidationError,
  );
});

test('validation rejects an identity in an undeclared app', () => {
  assert.throws(
    () => validateDataset(dataset([identity({ id: 'svc', type: 'service_account', app: 'okta' })], {})),
    DatasetValidationError,
  );
});

test('keeps a cross-app creation edge out of the per-app forest', () => {
  // PRD-delegation-chain.md §4.2 forbids *merging* apps at ingestion, not
  // recording that a chain hops systems. The edge is kept, but segregated: a
  // per-app view must not be able to present it as that app's own lineage.
  const graph = buildIdentityGraph({
    apps: [
      { id: 'aws-iam', name: 'AWS IAM', creation_data_from: null },
      { id: 'okta', name: 'Okta', creation_data_from: null },
    ],
    identities: [
      identity({ id: 'owner', type: 'human', app: 'okta', delegates_to: ['svc'] }),
      identity({ id: 'svc', type: 'service_account', app: 'aws-iam', provisioned_by: 'owner' }),
    ],
    employee_status: { owner: { status: 'active', last_reviewed: '2026-07-01' } },
    teams: [],
    owner_assignments: [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  });

  assert.equal(graph.creationEdges.get(creationEdgeKey('aws-iam', 'svc')), undefined);
  assert.equal(graph.crossAppEdges.get(creationEdgeKey('aws-iam', 'svc'))?.parent_id, 'owner');
});

test('indexes identities per app without merging them', () => {
  const graph = buildIdentityGraph({
    apps: [
      { id: 'aws-iam', name: 'AWS IAM', creation_data_from: null },
      { id: 'okta', name: 'Okta', creation_data_from: null },
    ],
    identities: [
      identity({ id: 'a', type: 'service_account', app: 'aws-iam' }),
      identity({ id: 'b', type: 'service_account', app: 'okta', provisioned_by: 'c' }),
      identity({ id: 'c', type: 'human', app: 'okta' }),
    ],
    employee_status: {},
    teams: [],
    owner_assignments: [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  });

  assert.deepEqual(graph.byApp.get('aws-iam')?.map((node) => node.id), ['a']);
  assert.deepEqual(graph.byApp.get('okta')?.map((node) => node.id), ['b', 'c']);
  assert.equal(graph.creationEdges.get(creationEdgeKey('okta', 'b'))?.parent_id, 'c');
  assert.equal(graph.creationEdges.get(creationEdgeKey('aws-iam', 'b')), undefined);
});

test('every accountability outcome is demonstrable from the seed dataset', () => {
  const graph = buildIdentityGraph(validateDataset(SEED_DATASET));
  const service = createAccountabilityService({
    graphSource: { graph: () => graph },
    clock: fixedClock(NOW),
    policy: DEFAULT_ACCOUNTABILITY_POLICY,
    rules: DEFAULT_ORPHAN_RULES,
  });

  const expected: ReadonlyArray<readonly [string, string, string | null]> = [
    ['agent-report', 'resolved_human', 'departed'],
    ['svc-etl', 'resolved_human', 'stale_review'],
    ['svc-deploy', 'resolved_human', 'role_changed'],
    ['svc-monitor', 'resolved_human', null],
    ['agent-legacy-sweeper', 'no_human_root', 'no_accountable_human'],
    ['svc-fixture-dangling-owner', 'dangling_reference', 'broken_provenance'],
    ['svc-fixture-cycle-a', 'cycle_detected', 'broken_provenance'],
  ];

  for (const [id, termination, reason] of expected) {
    const outcome = service.assess(id);
    assert.ok(outcome.ok, `seed dataset is missing "${id}"`);
    assert.equal(outcome.assessment.termination, termination, `termination for ${id}`);
    assert.equal(outcome.assessment.orphan_reason, reason, `orphan_reason for ${id}`);
  }
});
