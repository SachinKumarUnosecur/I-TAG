import assert from 'node:assert/strict';
import { test } from 'node:test';

import { datasetHrDirectory } from '../adapters/dataset-directories.js';
import type {
  AuthorizingHuman,
  CreationActor,
  PersistedCreationEdge,
} from '../domain/lineage.js';
import { DEFAULT_ACCOUNTABILITY_POLICY } from '../domain/policy.js';
import type { EmployeeRecord, Identity, IdentityDataset } from '../domain/types.js';
import { buildIdentityGraph, type IdentityGraph } from '../graph/build.js';
import {
  DEFAULT_ACTOR_NORMALIZERS,
  DEFAULT_HUMAN_RESOLVERS,
  normalizeActor,
  resolveAuthorizingHuman,
} from './actors.js';

const APP = 'aws-iam';

function identity(partial: Pick<Identity, 'id' | 'type'> & Partial<Identity>): Identity {
  return {
    name: partial.id,
    app: APP,
    direct_grants: [],
    inherited_from: [],
    delegates_to: [],
    provisioned_by: null,
    ...partial,
  };
}

function actor(partial: Partial<CreationActor> = {}): CreationActor {
  return {
    raw_principal: 'arn:aws:sts::1:assumed-role/deploy/session',
    kind: 'role_session',
    app: APP,
    issuer: null,
    attested_human: null,
    attested_basis: null,
    pipeline_actor: null,
    review_approver: null,
    ...partial,
  };
}

function edge(partial: Partial<PersistedCreationEdge> = {}): PersistedCreationEdge {
  return {
    app: APP,
    child_id: 'svc',
    actor: actor(),
    observed_at: '2026-07-01T00:00:00Z',
    occurred_at: '2026-07-01T00:00:00Z',
    source: 'audit_event',
    superseded_by: null,
    ...partial,
  };
}

interface Fixture {
  readonly identities: readonly Identity[];
  readonly employee_status?: Readonly<Record<string, EmployeeRecord>>;
}

function build(fixture: Fixture): { graph: IdentityGraph; dataset: IdentityDataset } {
  const dataset: IdentityDataset = {
    apps: [{ id: APP, name: 'AWS IAM', creation_data_from: null }],
    identities: fixture.identities,
    employee_status: fixture.employee_status ?? {},
    teams: [],
    owner_assignments: [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
  return { graph: buildIdentityGraph(dataset), dataset };
}

function normalize(fixture: Fixture, childId: string, persisted: PersistedCreationEdge | null) {
  const { graph } = build(fixture);
  const child = graph.byId.get(childId);
  assert.ok(child !== undefined, `fixture is missing "${childId}"`);
  const parentId = child.provisioned_by;
  return normalizeActor({
    child,
    parent: parentId === null ? null : (graph.byId.get(parentId) ?? null),
    edge: persisted,
    graph,
  });
}

function resolveHuman(fixture: Fixture, childId: string, subject: CreationActor): AuthorizingHuman | null {
  const { graph, dataset } = build(fixture);
  const child = graph.byId.get(childId);
  assert.ok(child !== undefined, `fixture is missing "${childId}"`);
  return resolveAuthorizingHuman({
    actor: subject,
    child,
    graph,
    hr: datasetHrDirectory(dataset),
    policy: DEFAULT_ACCOUNTABILITY_POLICY,
  });
}

const HUMAN_PARENT: Fixture = {
  identities: [
    identity({ id: 'svc', type: 'service_account', provisioned_by: 'creator' }),
    identity({ id: 'creator', type: 'human' }),
  ],
  employee_status: { creator: { status: 'active', last_reviewed: '2026-07-01' } },
};

// --- Actor normalization ----------------------------------------------------

test('a persisted audit event outranks the parent object', () => {
  const result = normalize(HUMAN_PARENT, 'svc', edge());

  assert.equal(result?.kind, 'role_session', 'the event knows it was a session; the object cannot');
  assert.equal(result?.raw_principal, 'arn:aws:sts::1:assumed-role/deploy/session');
});

/**
 * The whole reason `superseded_by` exists. A correction has to be able to arrive
 * without the original being mutated, and the store is append-only, so the *live*
 * row has to be selected rather than the last one written.
 */
test('a superseded edge is history, not the current answer', () => {
  const result = normalize(HUMAN_PARENT, 'svc', edge({ superseded_by: 'edge-2' }));

  assert.equal(result?.kind, 'human', 'falls through to the parent object');
  assert.equal(result?.raw_principal, 'creator');
});

test('with no event, the parent object is read as the actor', () => {
  const result = normalize(HUMAN_PARENT, 'svc', null);

  assert.equal(result?.kind, 'human');
  assert.equal(result?.raw_principal, 'creator');
  assert.equal(result?.issuer, null, 'an object field carries no session context');
  assert.equal(result?.attested_human, null, 'and it is not an attestation of a human');
});

test('an automation parent is never read as a human actor', () => {
  const result = normalize(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'bot' }),
        identity({ id: 'bot', type: 'service_account' }),
      ],
    },
    'svc',
    null,
  );

  assert.equal(result?.kind, 'automation');
});

/**
 * A group is a permission container and cannot perform a create, so a group id in a
 * creator position is a data artefact. Reporting it as an acting kind would put a
 * fabricated actor on a finding.
 */
test('a group in a creator position is not dressed up as something that can act', () => {
  const result = normalize(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'group-eng' }),
        identity({ id: 'group-eng', type: 'group' }),
      ],
    },
    'svc',
    null,
  );

  assert.equal(result?.kind, 'unknown');
});

/**
 * `PRD` L28 treats an unresolvable parent as impossible. Research §4.8 shows AWS
 * `CreateServiceLinkedRole` produces one by construction, so this must stay known
 * provenance — we know what acted — with the walk carrying the dangling state.
 */
test('a recorded creator we cannot resolve is still an actor, not a blank', () => {
  const result = normalize(
    { identities: [identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-ghost' })] },
    'svc',
    null,
  );

  assert.equal(result?.raw_principal, 'user-ghost', 'the principal string is the evidence');
  assert.equal(result?.kind, 'unknown');
});

test('no creator on record produces no actor at all', () => {
  const result = normalize({ identities: [identity({ id: 'svc', type: 'service_account' })] }, 'svc', null);

  assert.equal(result, null, 'absence must reach the gap buckets, not arrive as an unknown actor');
});

// --- Human resolution -------------------------------------------------------

test('an attested provider field wins and is labelled attested', () => {
  const result = resolveHuman(
    HUMAN_PARENT,
    'svc',
    actor({ attested_human: 'creator', attested_basis: 'sts_source_identity' }),
  );

  assert.equal(result?.human_id, 'creator');
  assert.equal(result?.basis, 'sts_source_identity');
  assert.equal(result?.confidence, 'attested');
});

/**
 * The safety property the whole ordering exists for. Both signals are present and
 * they name *different* people, so a precedence bug is visible rather than hidden
 * behind a coincidence.
 */
test('attested never loses to inferred, even when the issuer correlates', () => {
  const result = resolveHuman(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'deploy-role' }),
        identity({ id: 'deploy-role', type: 'service_account', provisioned_by: 'bootstrap' }),
        identity({ id: 'bootstrap', type: 'human' }),
        identity({ id: 'operator', type: 'human' }),
      ],
      employee_status: {
        bootstrap: { status: 'active', last_reviewed: '2026-07-01' },
        operator: { status: 'active', last_reviewed: '2026-07-01' },
      },
    },
    'svc',
    actor({
      issuer: 'deploy-role',
      attested_human: 'operator',
      attested_basis: 'identity_center_user',
    }),
  );

  assert.equal(result?.human_id, 'operator', 'the attested human, not the bootstrap admin');
  assert.equal(result?.confidence, 'attested');
});

/**
 * Confidence is the field a CISO reads before acting on a row. If an adapter can
 * stamp a derived basis into `attested_basis` and have it come back as `attested`,
 * the label is decoration.
 */
test('a derived basis cannot be laundered into an attestation', () => {
  const result = resolveHuman(
    HUMAN_PARENT,
    'svc',
    actor({ attested_human: 'creator', attested_basis: 'role_assumption_correlation' }),
  );

  assert.notEqual(result?.confidence, 'attested');
});

test('precedence is the declared order of the resolver list', () => {
  const both = resolveHuman(
    HUMAN_PARENT,
    'svc',
    actor({ pipeline_actor: 'triggering-dev', review_approver: 'approving-lead' }),
  );
  assert.equal(both?.basis, 'pipeline_trigger');

  const approverOnly = resolveHuman(HUMAN_PARENT, 'svc', actor({ review_approver: 'approving-lead' }));
  assert.equal(approverOnly?.basis, 'pr_approver');
  assert.equal(approverOnly?.confidence, 'correlated');
});

test('a human principal resolves to itself as correlated, not attested', () => {
  const result = resolveHuman(HUMAN_PARENT, 'svc', actor({ kind: 'human', raw_principal: 'creator' }));

  assert.equal(result?.human_id, 'creator');
  assert.equal(result?.basis, 'acting_principal_is_human');
  assert.equal(
    result?.confidence,
    'correlated',
    'a principal string cannot say whether that person acted themselves',
  );
});

/**
 * The resolver research §4.1 calls the weakest, and the one that does damage if its
 * label is lost: it names whoever created the role, who authorised none of this.
 */
test('the graph join is reported as inferred and says so in the detail', () => {
  const result = resolveHuman(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'deploy-role' }),
        identity({ id: 'deploy-role', type: 'service_account', provisioned_by: 'bootstrap' }),
        identity({ id: 'bootstrap', type: 'human' }),
      ],
      employee_status: { bootstrap: { status: 'active', last_reviewed: '2026-07-01' } },
    },
    'svc',
    actor({ issuer: 'deploy-role' }),
  );

  assert.equal(result?.human_id, 'bootstrap');
  assert.equal(result?.basis, 'role_assumption_correlation');
  assert.equal(result?.confidence, 'inferred');
  assert.match(result?.detail ?? '', /our inference and not the provider's record/);
});

test('an automation with no attribution resolves to no human rather than a guess', () => {
  const result = resolveHuman(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'bot' }),
        identity({ id: 'bot', type: 'service_account' }),
      ],
    },
    'svc',
    actor({ kind: 'automation', raw_principal: 'bot', issuer: 'bot' }),
  );

  assert.equal(result, null, 'a create nobody is accountable for is a fact, not a blank to fill');
});

/**
 * Both registries are precedence-ordered lists, so a silent insertion changes
 * behaviour everywhere. Pinning the lengths makes that a failing test rather than a
 * surprise in a demo.
 */
test('both registries are frozen and their order is pinned', () => {
  assert.equal(Object.isFrozen(DEFAULT_ACTOR_NORMALIZERS), true);
  assert.equal(Object.isFrozen(DEFAULT_HUMAN_RESOLVERS), true);
  assert.deepEqual(
    DEFAULT_ACTOR_NORMALIZERS.map((normalizer) => normalizer.id),
    ['persisted_audit_event', 'recorded_parent', 'unresolved_principal'],
  );
  assert.deepEqual(
    DEFAULT_HUMAN_RESOLVERS.map((resolver) => resolver.id),
    [
      'attested_provider_field',
      'pipeline_trigger',
      'pr_approver',
      'acting_principal_is_human',
      'role_assumption_correlation',
    ],
  );
});
