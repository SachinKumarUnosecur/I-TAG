import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { traceAccountability } from '../accountability/trace.js';
import { DEFAULT_ACCOUNTABILITY_POLICY } from '../domain/policy.js';
import type { EmployeeRecord, Identity, IdentityDataset, OwnerAssignment, TeamRecord } from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';
import { DEFAULT_OWNER_RESOLVERS, resolveOwner, type OwnerResolution } from './resolve.js';

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

interface Fixture {
  readonly identities: readonly Identity[];
  readonly employee_status?: Readonly<Record<string, EmployeeRecord>>;
  readonly teams?: readonly TeamRecord[];
  readonly owner_assignments?: readonly OwnerAssignment[];
}

function resolve(fixture: Fixture, identityId: string): OwnerResolution {
  const dataset: IdentityDataset = {
    apps: [{ id: APP, name: 'AWS IAM', creation_data_from: null }],
    identities: fixture.identities,
    employee_status: fixture.employee_status ?? {},
    teams: fixture.teams ?? [],
    owner_assignments: fixture.owner_assignments ?? [],
    permissions: [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
  const graph = buildIdentityGraph(dataset);
  const subject = graph.byId.get(identityId);
  assert.ok(subject !== undefined, `fixture is missing "${identityId}"`);

  return resolveOwner({
    identity: subject,
    graph,
    hr: datasetHrDirectory(dataset),
    teams: datasetTeamDirectory(dataset),
    owners: datasetOwnerRegistry(dataset),
    trace: traceAccountability(graph, subject, DEFAULT_ACCOUNTABILITY_POLICY),
  });
}

/** svc provisioned by a human, with the human's status supplied per test. */
function creatorChain(status: EmployeeRecord['status']): Fixture {
  return {
    identities: [
      identity({ id: 'svc', type: 'service_account', provisioned_by: 'creator' }),
      identity({ id: 'creator', type: 'human' }),
    ],
    employee_status: { creator: { status, last_reviewed: '2026-07-01' } },
  };
}

test('explicit assignment wins and is reported as high confidence', () => {
  const result = resolve(
    {
      identities: [identity({ id: 'svc', type: 'service_account' })],
      owner_assignments: [
        {
          identity_id: 'svc',
          app: APP,
          owner_kind: 'team',
          owner_id: 'team-platform',
          attested_at: '2026-07-01',
          backup_id: 'user-priya',
        },
      ],
      teams: [{ id: 'team-platform', name: 'Platform', members: [] }],
    },
    'svc',
  );

  assert.equal(result.owner?.source, 'explicit_tag');
  assert.equal(result.owner?.kind, 'team');
  assert.equal(result.owner?.id, 'team-platform');
  assert.equal(result.owner?.confidence, 'high');
  assert.equal(result.owner?.attested_at, '2026-07-01');
  assert.equal(result.owner?.backup_id, 'user-priya');
});

test('group ownership resolves to the owning team', () => {
  const result = resolve(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', inherited_from: ['group-eng'] }),
        identity({ id: 'group-eng', type: 'group' }),
        identity({ id: 'user-lead', type: 'human' }),
      ],
      employee_status: { 'user-lead': { status: 'active', last_reviewed: '2026-07-01' } },
      teams: [
        { id: 'team-eng', name: 'Engineering', members: ['user-lead'], owns_group: 'group-eng' },
      ],
    },
    'svc',
  );

  assert.equal(result.owner?.source, 'group_ownership');
  assert.equal(result.owner?.id, 'team-eng');
});

test('a team whose whole roster has left cannot hold ownership', () => {
  const result = resolve(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', inherited_from: ['group-eng'] }),
        identity({ id: 'group-eng', type: 'group' }),
        identity({ id: 'user-gone', type: 'human' }),
      ],
      employee_status: { 'user-gone': { status: 'departed', last_reviewed: '2026-01-01' } },
      teams: [
        { id: 'team-eng', name: 'Engineering', members: ['user-gone'], owns_group: 'group-eng' },
      ],
    },
    'svc',
  );

  assert.notEqual(result.owner?.source, 'group_ownership');
});

test('falls back to an active creator at medium confidence', () => {
  const result = resolve(creatorChain('active'), 'svc');

  assert.equal(result.owner?.source, 'creator_fallback');
  assert.equal(result.owner?.kind, 'user');
  assert.equal(result.owner?.id, 'creator');
  assert.equal(result.owner?.confidence, 'medium');
});

test('names a departed creator rather than returning nothing', () => {
  const result = resolve(creatorChain('departed'), 'svc');

  assert.equal(result.owner?.source, 'creator_fallback');
  assert.equal(result.owner?.id, 'creator');
  assert.equal(result.owner?.confidence, 'low');
});

test('resolves to nothing when no signal applies', () => {
  const result = resolve(
    { identities: [identity({ id: 'svc', type: 'service_account' })] },
    'svc',
  );

  assert.equal(result.owner, null);
  assert.deepEqual(result.considered, []);
  assert.equal(result.conflicting, false);
});

test('precedence is the declared order of the resolver list', () => {
  // Every signal present at once: explicit tag must win over group ownership,
  // which must win over the active creator.
  const result = resolve(
    {
      identities: [
        identity({
          id: 'svc',
          type: 'service_account',
          inherited_from: ['group-eng'],
          provisioned_by: 'creator',
        }),
        identity({ id: 'group-eng', type: 'group' }),
        identity({ id: 'creator', type: 'human' }),
        identity({ id: 'user-lead', type: 'human' }),
      ],
      employee_status: {
        creator: { status: 'active', last_reviewed: '2026-07-01' },
        'user-lead': { status: 'active', last_reviewed: '2026-07-01' },
      },
      teams: [
        { id: 'team-eng', name: 'Engineering', members: ['user-lead'], owns_group: 'group-eng' },
      ],
      owner_assignments: [
        { identity_id: 'svc', app: APP, owner_kind: 'user', owner_id: 'user-lead' },
      ],
    },
    'svc',
  );

  assert.equal(result.owner?.source, 'explicit_tag');
  assert.deepEqual(
    result.considered.map((candidate) => candidate.source),
    ['explicit_tag', 'group_ownership', 'creator_fallback'],
  );
  assert.equal(
    DEFAULT_OWNER_RESOLVERS[0]?.id,
    'explicit_assignment',
    'precedence is encoded in list order',
  );
});

test('a departed creator with a live owning team is owned, not orphaned', () => {
  // The correction at the heart of §4.1: creation is history, ownership is
  // current. A handover to a live team must not read as a finding.
  const result = resolve(
    {
      identities: [
        identity({
          id: 'svc',
          type: 'service_account',
          inherited_from: ['group-payments'],
          provisioned_by: 'user-gone',
        }),
        identity({ id: 'group-payments', type: 'group' }),
        identity({ id: 'user-gone', type: 'human' }),
        identity({ id: 'user-still-here', type: 'human' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-01-01' },
        'user-still-here': { status: 'active', last_reviewed: '2026-07-01' },
      },
      teams: [
        {
          id: 'team-payments',
          name: 'Payments',
          members: ['user-still-here'],
          owns_group: 'group-payments',
        },
      ],
    },
    'svc',
  );

  assert.equal(result.owner?.kind, 'team');
  assert.equal(result.owner?.id, 'team-payments');
  assert.equal(result.owner?.confidence, 'high');
});

test('flags disagreement between two high-confidence signals', () => {
  const result = resolve(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', inherited_from: ['group-eng'] }),
        identity({ id: 'group-eng', type: 'group' }),
        identity({ id: 'user-lead', type: 'human' }),
        identity({ id: 'user-priya', type: 'human' }),
      ],
      employee_status: {
        'user-lead': { status: 'active', last_reviewed: '2026-07-01' },
        'user-priya': { status: 'active', last_reviewed: '2026-07-01' },
      },
      teams: [
        { id: 'team-eng', name: 'Engineering', members: ['user-lead'], owns_group: 'group-eng' },
      ],
      owner_assignments: [
        { identity_id: 'svc', app: APP, owner_kind: 'user', owner_id: 'user-priya' },
      ],
    },
    'svc',
  );

  assert.equal(result.conflicting, true);
  assert.equal(result.owner?.id, 'user-priya', 'precedence still picks a winner');
});
