import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoryFindingStore } from '../adapters/memory-finding-store.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  type OwnershipPolicy,
} from '../domain/policy.js';
import type { OwnershipFinding } from '../domain/ownership-results.js';
import type {
  EmployeeRecord,
  Identity,
  IdentityDataset,
  OwnerAssignment,
  PermissionRecord,
  SuppressionEntry,
  TeamRecord,
} from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService, type OwnershipQuery } from './classify.js';
import { createDispositionService } from './dispositions.js';
import { findingsToCsv } from './evidence.js';
import { DEFAULT_SEVERITY_STRATEGY } from './severity.js';
import { createSweepService } from './sweep.js';
import { buildTimeline } from './timeline.js';

const NOW = new Date('2026-07-31T00:00:00Z');
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
  readonly suppressions?: readonly SuppressionEntry[];
  readonly permissions?: readonly PermissionRecord[];
  readonly creation_data_from?: string | null;
}

function toDataset(fixture: Fixture): IdentityDataset {
  return {
    apps: [{ id: APP, name: 'AWS IAM', creation_data_from: fixture.creation_data_from ?? null }],
    identities: fixture.identities,
    employee_status: fixture.employee_status ?? {},
    teams: fixture.teams ?? [],
    owner_assignments: fixture.owner_assignments ?? [],
    suppressions: fixture.suppressions ?? [],
    permissions: fixture.permissions ?? [],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
  };
}

function service(fixture: Fixture, policy: OwnershipPolicy = DEFAULT_OWNERSHIP_POLICY) {
  const dataset = toDataset(fixture);
  const graph = buildIdentityGraph(dataset);
  return createOwnershipService({
    graphSource: { graph: () => graph },
    clock: fixedClock(NOW),
    hr: datasetHrDirectory(dataset),
    teams: datasetTeamDirectory(dataset),
    owners: datasetOwnerRegistry(dataset),
    suppressions: datasetSuppressionRegistry(dataset),
    accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
    policy,
  });
}

function classify(fixture: Fixture, identityId: string): OwnershipFinding {
  const outcome = service(fixture).classify(identityId);
  assert.ok(outcome.ok, `expected "${identityId}" to resolve`);
  return outcome.finding;
}

function list(fixture: Fixture, query?: OwnershipQuery): readonly OwnershipFinding[] {
  return service(fixture).list(query);
}

// --- Step 4: time modeling ---------------------------------------------------

test('age runs from the HR effective date, not from when the scan ran', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-gone' }),
        identity({ id: 'user-gone', type: 'human' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-07-30', effective_from: '2026-05-02' },
      },
    },
    'svc',
  );

  assert.equal(finding.state, 'owner_invalid');
  assert.equal(finding.timeline.condition_since, '2026-05-02');
  assert.equal(finding.timeline.age_days, 90, 'derived from the departure date');
});

test('an identity is inside SLA on the boundary day and breached one day later', () => {
  const onBoundary = buildTimeline({
    identity: identity({ id: 'svc', type: 'service_account' }),
    conditionSince: '2026-07-17',
    policy: DEFAULT_OWNERSHIP_POLICY,
    now: NOW,
  });
  const pastBoundary = buildTimeline({
    identity: identity({ id: 'svc', type: 'service_account' }),
    conditionSince: '2026-07-16',
    policy: DEFAULT_OWNERSHIP_POLICY,
    now: NOW,
  });

  assert.equal(onBoundary.sla_days, 14);
  assert.equal(onBoundary.age_days, 14);
  assert.equal(onBoundary.sla_breached, false, 'AC-2(3) says "within" the period');
  assert.equal(pastBoundary.age_days, 15);
  assert.equal(pastBoundary.sla_breached, true);
});

test('inactivity is a separate clock from owner validity', () => {
  const timeline = buildTimeline({
    identity: identity({
      id: 'svc',
      type: 'service_account',
      last_activity_at: '2026-01-01',
    }),
    conditionSince: null,
    policy: DEFAULT_OWNERSHIP_POLICY,
    now: NOW,
  });

  assert.equal(timeline.age_days, null, 'owner validity has no condition');
  assert.equal(timeline.inactive_days, 211);
  assert.equal(timeline.inactive_beyond_threshold, true, 'PCI DSS 8.2.6, 90 days');
});

// --- Step 5: suppression and the unknown state ------------------------------

test('an audit-retention gap is unknown and never counted', () => {
  // The hard rule from §4.6: absence of evidence must not become a finding.
  const finding = classify(
    {
      identities: [identity({ id: 'svc-ancient', type: 'service_account', created_at: '2024-03-01' })],
      creation_data_from: '2025-01-01',
    },
    'svc-ancient',
  );

  assert.equal(finding.state, 'unknown');
  assert.notEqual(finding.state, 'unowned');
  assert.equal(finding.counted, false);
  assert.equal(finding.suppression?.reason, 'outside_audit_window');
  assert.equal(finding.severity, 'none');
});

test('unknown findings are absent from the counted queue', () => {
  const findings = list({
    identities: [
      identity({ id: 'svc-ancient', type: 'service_account', created_at: '2024-03-01' }),
      identity({ id: 'svc-orphan', type: 'service_account', created_at: '2026-01-01' }),
    ],
    creation_data_from: '2025-01-01',
  });

  assert.deepEqual(
    findings.map((finding) => finding.identity_id),
    ['svc-orphan'],
  );
});

test('an SSO-federated identity with no creator is unknown, not unowned', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'user-fed', type: 'service_account', provisioning_source: 'sso_federated' }),
      ],
    },
    'user-fed',
  );

  assert.equal(finding.state, 'unknown');
  assert.equal(finding.counted, false);
});

test('a registered break-glass account is suppressed rather than reported', () => {
  const finding = classify(
    {
      identities: [identity({ id: 'svc-breakglass', type: 'service_account' })],
      suppressions: [
        {
          identity_id: 'svc-breakglass',
          reason: 'break_glass',
          detail: 'emergency access, unowned by design, use is alerted on',
          expires_at: '2027-01-01',
        },
      ],
    },
    'svc-breakglass',
  );

  assert.equal(finding.counted, false);
  assert.equal(finding.suppression?.reason, 'break_glass');
  assert.equal(finding.suppression?.effect, 'suppressed');
});

test('an expired suppression stops protecting the identity', () => {
  const finding = classify(
    {
      identities: [identity({ id: 'svc-temp', type: 'service_account' })],
      suppressions: [
        {
          identity_id: 'svc-temp',
          reason: 'vendor_managed',
          detail: 'vendor owns this during migration',
          expires_at: '2026-01-01',
        },
      ],
    },
    'svc-temp',
  );

  assert.equal(finding.suppression, null);
  assert.equal(finding.counted, true);
});

test('a revoked identity is excluded from scope', () => {
  const finding = classify(
    { identities: [identity({ id: 'svc-dead', type: 'service_account', revoked: true })] },
    'svc-dead',
  );

  assert.equal(finding.counted, false);
  assert.equal(finding.suppression?.effect, 'excluded');
});

// --- Step 6: classification -------------------------------------------------

test('a departed creator with a live owning team is owned, not a finding', () => {
  const finding = classify(
    {
      identities: [
        identity({
          id: 'svc-payments',
          type: 'service_account',
          inherited_from: ['group-payments'],
          provisioned_by: 'user-gone',
        }),
        identity({ id: 'group-payments', type: 'group' }),
        identity({ id: 'user-gone', type: 'human' }),
        identity({ id: 'user-here', type: 'human' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-01-01' },
        'user-here': { status: 'active', last_reviewed: '2026-07-01' },
      },
      teams: [
        {
          id: 'team-payments',
          name: 'Payments',
          members: ['user-here'],
          owns_group: 'group-payments',
        },
      ],
    },
    'svc-payments',
  );

  assert.equal(finding.state, 'owned');
  assert.equal(finding.counted, false);
  assert.equal(finding.owner?.id, 'team-payments');
});

test('names a departed creator as creator_deactivated rather than an assigned owner', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-gone' }),
        identity({ id: 'user-gone', type: 'human' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-02-01', effective_from: '2026-02-01' },
      },
    },
    'svc',
  );

  assert.equal(finding.state, 'owner_invalid');
  assert.equal(finding.reason === 'creator_deactivated', true);
  assert.equal(finding.owner?.source, 'creator_fallback');
});

test('reports an identity with no signal at all as unowned', () => {
  const finding = classify(
    { identities: [identity({ id: 'svc', type: 'service_account' })] },
    'svc',
  );

  assert.equal(finding.state, 'unowned');
  assert.equal(finding.owner, null);
  assert.equal(finding.counted, true);
});

test('reports disagreeing high-confidence signals as ambiguous', () => {
  const finding = classify(
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
      teams: [{ id: 'team-eng', name: 'Eng', members: ['user-lead'], owns_group: 'group-eng' }],
      owner_assignments: [
        {
          identity_id: 'svc',
          app: APP,
          owner_kind: 'user',
          owner_id: 'user-priya',
          attested_at: '2026-07-20',
        },
      ],
    },
    'svc',
  );

  assert.equal(finding.state, 'ambiguous');
  assert.equal(finding.reason === 'conflicting_owner_signals', true);
});

test('an explicit owner team with nobody left in it is not a valid owner', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account' }),
        identity({ id: 'user-gone', type: 'human' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-01-01', effective_from: '2026-01-01' },
      },
      teams: [{ id: 'team-finance-ops', name: 'Finance Ops', members: ['user-gone'] }],
      owner_assignments: [
        {
          identity_id: 'svc',
          app: APP,
          owner_kind: 'team',
          owner_id: 'team-finance-ops',
          attested_at: '2026-07-20',
        },
      ],
    },
    'svc',
  );

  assert.equal(finding.state, 'owner_invalid');
  assert.equal(finding.reason === 'owner_team_vacant', true);
  assert.equal(finding.counted, true);
});

test('flags an explicit owner who has never attested', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account' }),
        identity({ id: 'user-owner', type: 'human' }),
      ],
      employee_status: { 'user-owner': { status: 'active', last_reviewed: '2026-07-01' } },
      owner_assignments: [
        { identity_id: 'svc', app: APP, owner_kind: 'user', owner_id: 'user-owner' },
      ],
    },
    'svc',
  );

  assert.equal(finding.state, 'owner_invalid');
  assert.equal(finding.reason === 'owner_never_attested', true);
});

test('returns a typed outcome for an unknown identity rather than throwing', () => {
  const outcome = service({ identities: [] }).classify('nope');

  assert.deepEqual(outcome, { ok: false, error: 'unknown_identity', identity_id: 'nope' });
});

// --- Step 7: severity ranking ----------------------------------------------

test('two orphans of identical age rank apart when only one reaches sensitive data', () => {
  const fixture: Fixture = {
    identities: [
      identity({
        id: 'svc-sensitive',
        type: 'service_account',
        direct_grants: ['export:finance-report'],
        provisioned_by: 'user-gone',
      }),
      identity({
        id: 'svc-harmless',
        type: 'service_account',
        direct_grants: ['read:metrics'],
        provisioned_by: 'user-gone',
      }),
      identity({ id: 'user-gone', type: 'human' }),
    ],
    employee_status: {
      'user-gone': { status: 'departed', last_reviewed: '2026-01-01', effective_from: '2026-01-01' },
    },
    permissions: [{ id: 'export:finance-report', sensitive: true }, { id: 'read:metrics' }],
  };

  const sensitive = classify(fixture, 'svc-sensitive');
  const harmless = classify(fixture, 'svc-harmless');

  assert.equal(sensitive.timeline.age_days, harmless.timeline.age_days, 'same age');
  assert.equal(sensitive.severity, 'critical');
  assert.equal(harmless.severity, 'medium');

  assert.deepEqual(
    list(fixture, { minSeverity: 'high' }).map((finding) => finding.identity_id),
    ['svc-sensitive'],
    'the queue surfaces only what reaches something',
  );
});

test('effective access inherited through a group counts toward severity', () => {
  const finding = classify(
    {
      identities: [
        identity({ id: 'svc', type: 'service_account', inherited_from: ['group-eng'] }),
        identity({ id: 'group-eng', type: 'group', direct_grants: ['admin:platform'] }),
      ],
      permissions: [{ id: 'admin:platform', sensitive: true }],
    },
    'svc',
  );

  assert.deepEqual(finding.reachable_permissions, ['admin:platform']);
  assert.equal(finding.reachable_sensitive_count, 1);
});

test('a healthy identity never ranks above none', () => {
  assert.equal(
    DEFAULT_SEVERITY_STRATEGY.rank({
      state: 'owned',
      sensitiveCount: 9,
      counted: false,
      timeline: buildTimeline({
        identity: identity({ id: 'svc', type: 'service_account' }),
        conditionSince: null,
        policy: DEFAULT_OWNERSHIP_POLICY,
        now: NOW,
      }),
    }),
    'none',
  );
});

// --- Step 8: residual footprint sweep --------------------------------------

function sweepService(fixture: Fixture) {
  const dataset = toDataset(fixture);
  const graph = buildIdentityGraph(dataset);
  return createSweepService({
    graphSource: { graph: () => graph },
    hr: datasetHrDirectory(dataset),
    clock: fixedClock(NOW),
    policy: DEFAULT_ACCOUNTABILITY_POLICY,
  });
}

test('sweeps a three-hop footprint and excludes what was already revoked', () => {
  const footprints = sweepService({
    identities: [
      identity({ id: 'user-gone', type: 'human', delegates_to: ['svc-mid'] }),
      identity({
        id: 'svc-mid',
        type: 'service_account',
        provisioned_by: 'user-gone',
        delegates_to: ['agent-leaf', 'svc-cleaned'],
      }),
      identity({
        id: 'agent-leaf',
        type: 'ai_agent',
        provisioned_by: 'svc-mid',
        direct_grants: ['export:finance-report'],
      }),
      identity({
        id: 'svc-cleaned',
        type: 'service_account',
        provisioned_by: 'svc-mid',
        revoked: true,
      }),
    ],
    employee_status: {
      'user-gone': { status: 'departed', last_reviewed: '2026-03-01', effective_from: '2026-03-01' },
    },
    permissions: [{ id: 'export:finance-report', sensitive: true }],
  }).all();

  assert.equal(footprints.length, 1);
  const [footprint] = footprints;
  assert.ok(footprint !== undefined);
  assert.deepEqual(
    footprint.live.map((node) => node.identity_id),
    ['svc-mid', 'agent-leaf'],
  );
  assert.equal(footprint.revoked_count, 1, 'the cleaned-up account is not debt');
  assert.equal(footprint.max_hops, 2);
  assert.deepEqual(footprint.sensitive_reachable, ['export:finance-report']);
  assert.equal(footprint.departed_since, '2026-03-01');
});

test('an active human has no residual footprint', () => {
  const footprints = sweepService({
    identities: [
      identity({ id: 'user-here', type: 'human', delegates_to: ['svc'] }),
      identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-here' }),
    ],
    employee_status: { 'user-here': { status: 'active', last_reviewed: '2026-07-01' } },
  }).all();

  assert.deepEqual(footprints, []);
});

test('the sweep terminates on a cyclic delegation graph', () => {
  // `delegates_to` is a general digraph, unlike single-parent creation lineage:
  // a replacement account provisioned by the account it replaces makes a loop.
  const footprint = sweepService({
    identities: [
      identity({ id: 'user-gone', type: 'human', delegates_to: ['svc-a'] }),
      identity({ id: 'svc-a', type: 'service_account', provisioned_by: 'user-gone' }),
    ],
    employee_status: {
      'user-gone': { status: 'departed', last_reviewed: '2026-03-01' },
    },
  }).forHuman('user-gone');

  assert.ok(footprint !== null);
  assert.equal(footprint.live.length, 1);
});

// --- Step 9: dispositions and evidence -------------------------------------

test('a suppression disposition without an expiry is rejected', () => {
  const dispositions = createDispositionService({
    store: memoryFindingStore(),
    clock: fixedClock(NOW),
  });

  const outcome = dispositions.record({
    finding_id: 'f-1',
    identity_id: 'svc',
    action: 'suppressed',
    actor: 'ciso@unosecur.com',
    justification: 'accepted risk',
  });

  assert.deepEqual(outcome, { ok: false, error: 'expiry_required' });
});

test('superseding a disposition preserves the earlier record', () => {
  const store = memoryFindingStore();
  const dispositions = createDispositionService({ store, clock: fixedClock(NOW) });

  dispositions.record({
    finding_id: 'f-1',
    identity_id: 'svc',
    action: 'attested',
    actor: 'lead@unosecur.com',
    justification: 'still needed for the nightly batch',
  });
  const second = dispositions.record({
    finding_id: 'f-2',
    identity_id: 'svc',
    action: 'reassigned',
    actor: 'ciso@unosecur.com',
    justification: 'handed to the platform team',
    evidence_ref: 'JIRA-4821',
  });

  assert.ok(second.ok);
  assert.equal(second.supersedes, 1);

  const history = dispositions.history('svc');
  assert.deepEqual(
    history.map((entry) => entry.action),
    ['attested', 'reassigned'],
    'the journal is append-only',
  );
  assert.equal(history[0]?.justification, 'still needed for the nightly batch');
});

test('evidence export quotes every field and carries the audit columns', () => {
  const csv = findingsToCsv(
    list({
      identities: [
        identity({ id: 'svc', type: 'service_account', provisioned_by: 'user-gone' }),
        identity({ id: 'user-gone', type: 'human', name: 'Gone, Ex "Contractor"' }),
      ],
      employee_status: {
        'user-gone': { status: 'departed', last_reviewed: '2026-03-01', effective_from: '2026-03-01' },
      },
    }),
  );

  const [header, row] = csv.split('\n');
  assert.ok(header?.startsWith('"identity_id","app"'));
  assert.ok(header?.includes('"sla_breached"'));
  assert.ok(row?.includes('"svc"'));
  assert.ok(row?.includes('"creator_deactivated"'));
});
