import assert from 'node:assert/strict';
import { test } from 'node:test';

import { datasetSuppressionRegistry } from '../adapters/dataset-directories.js';
import type { CreationActor, PrivilegeGrantEvent } from '../domain/lineage.js';
import type { OwnershipState } from '../domain/ownership.js';
import { DEFAULT_LINEAGE_POLICY } from '../domain/policy.js';
import type { Identity, IdentityDataset, SuppressionEntry } from '../domain/types.js';
import { buildIdentityGraph, type IdentityGraph } from '../graph/build.js';
import {
  classifyLineageGap,
  DEFAULT_LINEAGE_GAP_RULES,
  evaluateCreationAuthority,
  evaluateFanOut,
  type OwnershipStateSource,
} from './signals.js';

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

function actor(partial: Partial<CreationActor> = {}): CreationActor {
  return {
    raw_principal: 'bot',
    kind: 'automation',
    app: APP,
    issuer: null,
    attested_human: null,
    attested_basis: null,
    pipeline_actor: null,
    review_approver: null,
    ...partial,
  };
}

interface Fixture {
  readonly identities: readonly Identity[];
  readonly suppressions?: readonly SuppressionEntry[];
  readonly privilege_grant_events?: readonly PrivilegeGrantEvent[];
}

function build(fixture: Fixture): { graph: IdentityGraph; dataset: IdentityDataset } {
  const dataset: IdentityDataset = {
    apps: [
      { id: APP, name: 'AWS IAM', creation_data_from: '2025-01-01' },
      { id: 'github', name: 'GitHub', creation_data_from: null },
    ],
    identities: fixture.identities,
    employee_status: {},
    teams: [],
    owner_assignments: [],
    suppressions: fixture.suppressions ?? [],
    permissions: [{ id: 'admin:prod-database', sensitive: true }, { id: 'read:metrics' }],
    control_history: [],
    grant_half_lives: [],
    grant_records: [],
    privilege_grant_events: fixture.privilege_grant_events ?? [],
  };
  return { graph: buildIdentityGraph(dataset), dataset };
}

function gapOf(fixture: Fixture, identityId: string) {
  const { graph, dataset } = build(fixture);
  const subject = graph.byId.get(identityId);
  assert.ok(subject !== undefined, `fixture is missing "${identityId}"`);
  return classifyLineageGap({
    identity: subject,
    graph,
    registry: datasetSuppressionRegistry(dataset),
    policy: DEFAULT_LINEAGE_POLICY,
  });
}

function ownershipAlways(state: OwnershipState | null): OwnershipStateSource {
  return { state: () => state };
}

// --- Gap buckets ------------------------------------------------------------

test('every gap bucket is produced by its own rule', () => {
  assert.equal(
    gapOf(
      { identities: [identity({ id: 'a', type: 'service_account', provisioning_source: 'sso_federated' })] },
      'a',
    )?.reason,
    'federated_elsewhere',
  );

  // Closes the first half of research gap 9: declared in types.ts since the first
  // commit, read by nothing until now.
  assert.equal(
    gapOf(
      { identities: [identity({ id: 'b', type: 'service_account', provisioning_source: 'self_registered' })] },
      'b',
    )?.reason,
    'self_registered',
  );
  assert.equal(
    gapOf(
      { identities: [identity({ id: 'c', type: 'service_account', provisioning_source: 'bulk_import' })] },
      'c',
    )?.reason,
    'bulk_imported',
  );

  assert.equal(
    gapOf(
      {
        identities: [identity({ id: 'd', type: 'service_account' })],
        suppressions: [{ identity_id: 'd', reason: 'break_glass', detail: 'emergency access' }],
      },
      'd',
    )?.reason,
    'root_by_design',
  );

  const retention = gapOf(
    { identities: [identity({ id: 'e', type: 'service_account', created_at: '2024-06-01' })] },
    'e',
  );
  assert.equal(retention?.reason, 'outside_audit_window');
  assert.equal(retention?.recoverable_from, '2025-01-01', 'the date the banner needs');

  const notCaptured = gapOf(
    {
      identities: [
        identity({ id: 'f', type: 'service_account', app: 'github', created_at: '2015-01-01' }),
      ],
    },
    'f',
  );
  assert.equal(notCaptured?.reason, 'not_yet_captured');
});

/**
 * The honest outcome, and the one the whole metric rests on. If an unexplained
 * identity silently landed in a seventh catch-all bucket, `explanation_coverage`
 * would always be 1 and could never be falsified.
 */
test('an identity we cannot explain returns no bucket at all', () => {
  const gap = gapOf(
    { identities: [identity({ id: 'mystery', type: 'service_account', created_at: '2026-01-01' })] },
    'mystery',
  );

  assert.equal(gap, null);
});

/**
 * Permanent loss outranks "we were not watching yet": the provider has nothing to
 * give us whenever we ask, so reporting the weaker reason would overstate what a
 * backfill could recover.
 */
test('a retention gap outranks a capture gap when both are true', () => {
  const gap = gapOf(
    { identities: [identity({ id: 'old', type: 'service_account', created_at: '2016-01-01' })] },
    'old',
  );

  assert.equal(gap?.reason, 'outside_audit_window');
});

test('the gap registry is frozen and its precedence is pinned', () => {
  assert.equal(Object.isFrozen(DEFAULT_LINEAGE_GAP_RULES), true);
  assert.deepEqual(
    DEFAULT_LINEAGE_GAP_RULES.map((rule) => rule.id),
    [
      'federated_elsewhere',
      'self_registered',
      'bulk_imported',
      'root_by_design',
      'outside_audit_window',
      'not_yet_captured',
    ],
  );
  // `PRD` L65's single `unlinked` flag is what these six replace (§4.5).
  assert.equal(
    DEFAULT_LINEAGE_GAP_RULES.some((rule) => rule.id === 'unlinked'),
    false,
  );
});

// --- Fan-out as a rate ------------------------------------------------------

function bulkChildren(count: number, isoDates: readonly string[]): readonly Identity[] {
  return Array.from({ length: count }, (_unused, offset) =>
    identity({
      id: `child-${offset}`,
      type: 'service_account',
      provisioned_by: 'bot',
      created_at: isoDates[offset % isoDates.length] ?? '2026-07-30',
    }),
  );
}

function fanOutOf(fixture: Fixture, subject: CreationActor) {
  const { graph } = build(fixture);
  return evaluateFanOut({
    actorId: subject.raw_principal,
    actor: subject,
    graph,
    policy: DEFAULT_LINEAGE_POLICY,
    now: NOW,
  });
}

/**
 * The true negative research §9 calls the row that proves we did not simply
 * threshold on a number: 40 children, spread across the bot's own history, green.
 */
test('an automation with a large but steady lifetime fan-out is not a finding', () => {
  const dates = ['2026-07-20', '2026-06-15', '2026-05-14', '2026-04-12', '2026-03-11', '2026-02-08'];
  const signal = fanOutOf(
    {
      identities: [
        identity({
          id: 'bot',
          type: 'service_account',
          delegates_to: bulkChildren(40, dates).map((child) => child.id),
        }),
        ...bulkChildren(40, dates),
      ],
    },
    actor({ kind: 'automation' }),
  );

  assert.equal(signal?.lifetime_total, 40);
  assert.equal(signal?.exceeds_baseline, false, 'volume alone is baseline-normal for automation');
  assert.match(signal?.detail ?? '', /baseline-normal/);
});

/** §4.3's human rule verbatim: more than five creations in a rolling seven days. */
test('a human above the weekly ceiling exceeds the baseline', () => {
  const burst = Array.from({ length: 6 }, (_unused, offset) =>
    identity({
      id: `burst-${offset}`,
      type: 'service_account',
      provisioned_by: 'bot',
      created_at: '2026-07-29',
    }),
  );
  const signal = fanOutOf(
    {
      identities: [
        identity({ id: 'bot', type: 'human', delegates_to: burst.map((child) => child.id) }),
        ...burst,
      ],
    },
    actor({ kind: 'human' }),
  );

  assert.equal(signal?.created_in_window, 6);
  assert.equal(signal?.exceeds_baseline, true);
  assert.match(signal?.detail ?? '', /above the 5 expected of a human actor/);
});

test('the same six creations spread over months do not exceed it', () => {
  const spread = ['2026-07-29', '2026-06-20', '2026-05-20', '2026-04-20', '2026-03-20', '2026-02-20'].map(
    (date, offset) =>
      identity({
        id: `spread-${offset}`,
        type: 'service_account',
        provisioned_by: 'bot',
        created_at: date,
      }),
  );
  const signal = fanOutOf(
    {
      identities: [
        identity({ id: 'bot', type: 'human', delegates_to: spread.map((child) => child.id) }),
        ...spread,
      ],
    },
    actor({ kind: 'human' }),
  );

  assert.equal(signal?.lifetime_total, 6, 'same lifetime total as the burst above');
  assert.equal(signal?.exceeds_baseline, false, 'rate, not total — this is the whole of §4.3');
});

/**
 * A single-child creator is trivially "novel", so novelty has to be measured against
 * a history or it fires on most of an estate.
 */
test('novelty needs a history to be novel against', () => {
  const signal = fanOutOf(
    {
      identities: [
        identity({ id: 'bot', type: 'human', delegates_to: ['only'] }),
        identity({ id: 'only', type: 'service_account', provisioned_by: 'bot', created_at: '2026-07-30' }),
      ],
    },
    actor({ kind: 'human' }),
  );

  assert.equal(signal?.novel_target_class, false);
  assert.equal(signal?.exceeds_baseline, false);
});

test('a human reaching into a system it has never provisioned in is reported', () => {
  const signal = fanOutOf(
    {
      identities: [
        identity({ id: 'bot', type: 'human', delegates_to: ['usual', 'elsewhere'] }),
        identity({ id: 'usual', type: 'service_account', provisioned_by: 'bot', created_at: '2026-05-01' }),
        identity({
          id: 'elsewhere',
          type: 'service_account',
          app: 'github',
          provisioned_by: 'bot',
          created_at: '2026-07-30',
        }),
      ],
    },
    actor({ kind: 'human' }),
  );

  assert.equal(signal?.novel_target_class, true);
  assert.equal(signal?.exceeds_baseline, true);
  assert.match(signal?.detail ?? '', /first github:service_account/);
});

/**
 * Automation meets new workloads constantly, so a novel target only counts when it
 * is privileged — otherwise every deployment is a finding.
 */
test('a novel but unprivileged target is not a finding for automation', () => {
  const fixture = (grants: readonly string[]) => ({
    identities: [
      identity({ id: 'bot', type: 'service_account', delegates_to: ['usual', 'novel'] }),
      identity({ id: 'usual', type: 'service_account', provisioned_by: 'bot', created_at: '2026-05-01' }),
      identity({
        id: 'novel',
        type: 'ai_agent',
        provisioned_by: 'bot',
        created_at: '2026-07-30',
        direct_grants: grants,
      }),
    ],
  });

  const harmless = fanOutOf(fixture(['read:metrics']), actor({ kind: 'automation' }));
  assert.equal(harmless?.novel_target_class, true);
  assert.equal(harmless?.exceeds_baseline, false, 'automation legitimately meets new workloads');

  const privileged = fanOutOf(fixture(['admin:prod-database']), actor({ kind: 'automation' }));
  assert.equal(privileged?.exceeds_baseline, true);
  assert.match(privileged?.detail ?? '', /holds sensitive access/);
});

test('an actor that created nothing produces no signal to render', () => {
  const signal = fanOutOf({ identities: [identity({ id: 'bot', type: 'human' })] }, actor({ kind: 'human' }));

  assert.equal(signal, null);
});

// --- Creation authority -----------------------------------------------------

const MIDNIGHT_BLIZZARD: Fixture = {
  identities: [
    identity({
      id: 'legacy-test-app',
      type: 'service_account',
      delegates_to: ['consent-user'],
      environment: 'non_production',
      created_at: '2021-03-02',
      last_activity_at: '2026-07-28',
    }),
    identity({
      id: 'consent-user',
      type: 'service_account',
      provisioned_by: 'legacy-test-app',
      direct_grants: ['admin:prod-database'],
      created_at: '2026-07-26',
    }),
  ],
  privilege_grant_events: [
    {
      identity_id: 'consent-user',
      permission: 'admin:prod-database',
      app: APP,
      actor_principal: 'legacy-test-app',
      occurred_at: '2026-07-26',
      approved_by: null,
    },
  ],
};

function authorityOf(fixture: Fixture, childId: string, subject: CreationActor, ownership: OwnershipStateSource) {
  const { graph, dataset } = build(fixture);
  const child = graph.byId.get(childId);
  assert.ok(child !== undefined, `fixture is missing "${childId}"`);
  return evaluateCreationAuthority({
    child,
    actor: subject,
    graph,
    grants: dataset.privilege_grant_events ?? [],
    ownership,
    policy: DEFAULT_LINEAGE_POLICY,
    now: NOW,
  });
}

/**
 * The headline. Fan-out 1 and generation 2, so both of `PRD` §4.2.5's shape flags are
 * silent — and this signal fires, which is the argument of research §3.4 made
 * executable.
 */
test('one principal creating an account and granting it privilege is self-authorized', () => {
  const signal = authorityOf(
    MIDNIGHT_BLIZZARD,
    'consent-user',
    actor({ raw_principal: 'legacy-test-app', kind: 'service_principal' }),
    ownershipAlways('unowned'),
  );

  assert.equal(signal?.self_authorized, true);
  assert.equal(signal?.creator_privilege_mismatch, true);
  assert.equal(signal?.actor_is_non_production, true);
  assert.deepEqual(signal?.granted_permissions, ['admin:prod-database']);
  assert.match(signal?.detail ?? '', /AC-2\(e\)/);
});

/**
 * If an approver cannot clear the finding, AC-2(e) is unsatisfiable and the flag is
 * noise. This is the row that makes the control actionable rather than decorative.
 */
test('a second party on the grant clears the self-authorization', () => {
  const approved: Fixture = {
    ...MIDNIGHT_BLIZZARD,
    privilege_grant_events: [
      {
        identity_id: 'consent-user',
        permission: 'admin:prod-database',
        app: APP,
        actor_principal: 'legacy-test-app',
        occurred_at: '2026-07-26',
        approved_by: 'user-dan',
      },
    ],
  };

  const signal = authorityOf(
    approved,
    'consent-user',
    actor({ raw_principal: 'legacy-test-app', kind: 'service_principal' }),
    ownershipAlways('owned'),
  );

  assert.equal(signal?.self_authorized ?? false, false);
});

/**
 * A grant made months later is a separate decision by whoever made it. Without the
 * window, ordinary maintenance becomes a segregation-of-duties violation.
 */
test('a grant outside the window is not the same act as the create', () => {
  const late: Fixture = {
    ...MIDNIGHT_BLIZZARD,
    privilege_grant_events: [
      {
        identity_id: 'consent-user',
        permission: 'admin:prod-database',
        app: APP,
        actor_principal: 'legacy-test-app',
        occurred_at: '2026-11-01',
        approved_by: null,
      },
    ],
  };

  const signal = authorityOf(
    late,
    'consent-user',
    actor({ raw_principal: 'legacy-test-app', kind: 'service_principal' }),
    ownershipAlways('owned'),
  );

  assert.equal(signal?.self_authorized ?? false, false);
});

test('a different principal granting the privilege is not self-authorization', () => {
  const separated: Fixture = {
    ...MIDNIGHT_BLIZZARD,
    privilege_grant_events: [
      {
        identity_id: 'consent-user',
        permission: 'admin:prod-database',
        app: APP,
        actor_principal: 'someone-else',
        occurred_at: '2026-07-26',
        approved_by: null,
      },
    ],
  };

  const signal = authorityOf(
    separated,
    'consent-user',
    actor({ raw_principal: 'legacy-test-app', kind: 'service_principal' }),
    ownershipAlways('owned'),
  );

  assert.equal(signal?.self_authorized ?? false, false);
});

/**
 * An unclassified environment must never be read as non-production, or the detector
 * fabricates its own headline finding out of missing metadata.
 */
test('an owned production creator with an approved grant is not a finding at all', () => {
  const clean: Fixture = {
    identities: [
      identity({
        id: 'provisioner',
        type: 'service_account',
        delegates_to: ['svc'],
        environment: 'production',
        last_activity_at: '2026-07-30',
      }),
      identity({
        id: 'svc',
        type: 'service_account',
        provisioned_by: 'provisioner',
        direct_grants: ['read:metrics'],
        created_at: '2026-07-26',
      }),
    ],
    privilege_grant_events: [
      {
        identity_id: 'svc',
        permission: 'read:metrics',
        app: APP,
        actor_principal: 'provisioner',
        occurred_at: '2026-07-26',
        approved_by: 'user-dan',
      },
    ],
  };

  const signal = authorityOf(
    clean,
    'svc',
    actor({ raw_principal: 'provisioner' }),
    ownershipAlways('owned'),
  );

  assert.equal(signal, null, 'a green row carries no empty signal object');
});

test('a dormant creator is a privilege mismatch even when the grant was approved', () => {
  const dormant: Fixture = {
    identities: [
      identity({
        id: 'stale-bot',
        type: 'service_account',
        delegates_to: ['svc'],
        environment: 'production',
        last_activity_at: '2026-01-01', // 211 days -> past the 90-day dormancy floor
      }),
      identity({
        id: 'svc',
        type: 'service_account',
        provisioned_by: 'stale-bot',
        created_at: '2026-07-26',
      }),
    ],
    privilege_grant_events: [
      {
        identity_id: 'svc',
        permission: 'read:metrics',
        app: APP,
        actor_principal: 'stale-bot',
        occurred_at: '2026-07-26',
        approved_by: 'user-dan',
      },
    ],
  };

  const signal = authorityOf(
    dormant,
    'svc',
    actor({ raw_principal: 'stale-bot' }),
    ownershipAlways('owned'),
  );

  assert.equal(signal?.self_authorized, false);
  assert.equal(signal?.creator_privilege_mismatch, true);
  assert.equal(signal?.actor_dormant_days, 211);
});

/**
 * Ownership state arrives through a port rather than an import, because research
 * §7.2 has Ownership Assurance consuming lineage — a direct dependency here would
 * make that a cycle.
 */
test('a creator outside the population reports unknown rather than assuming ownership', () => {
  const signal = authorityOf(
    MIDNIGHT_BLIZZARD,
    'consent-user',
    actor({ raw_principal: 'legacy-test-app', kind: 'provider_service' }),
    ownershipAlways(null),
  );

  assert.equal(signal?.actor_ownership_state, 'unknown');
});
