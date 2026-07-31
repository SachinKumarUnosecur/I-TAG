import assert from 'node:assert/strict';
import { test } from 'node:test';

import type {
  HumanResolutionConfidence,
  LineageGapReason,
  Provenance,
  ProvenanceRecord,
} from '../domain/lineage.js';
import type { Identity, IdentityDataset, IdentityType } from '../domain/types.js';
import { buildIdentityGraph, type IdentityGraph } from '../graph/build.js';
import { buildCoverage } from './coverage.js';

const GRAPH: IdentityGraph = buildIdentityGraph({
  apps: [
    { id: 'aws-iam', name: 'AWS IAM', creation_data_from: '2025-01-01' },
    { id: 'github', name: 'GitHub', creation_data_from: null },
  ],
  identities: [],
  employee_status: {},
  teams: [],
  owner_assignments: [],
  permissions: [],
  control_history: [],
  grant_half_lives: [],
  grant_records: [],
} satisfies IdentityDataset);

function known(confidence: HumanResolutionConfidence | null): Provenance {
  return {
    state: 'recorded',
    actor: {
      raw_principal: 'actor',
      kind: 'automation',
      app: 'aws-iam',
      issuer: null,
      attested_human: null,
      attested_basis: null,
      pipeline_actor: null,
      review_approver: null,
    },
    authorizing_human:
      confidence === null
        ? null
        : { human_id: 'user-dan', basis: 'sts_source_identity', confidence, detail: 'fixture' },
  };
}

function absent(reason: LineageGapReason): Provenance {
  return { state: 'explained_absence', gap: { reason, detail: 'fixture', recoverable_from: null } };
}

/** No creator, and no bucket that accounts for it. The population coverage measures. */
const UNEXPLAINED: Provenance = { state: 'unexplained' };

function record(
  id: string,
  provenance: Provenance,
  overrides: Partial<Pick<ProvenanceRecord, 'app' | 'identity_type'>> = {},
): ProvenanceRecord {
  return {
    identity_id: id,
    app: overrides.app ?? 'aws-iam',
    identity_type: overrides.identity_type ?? 'service_account',
    generation: 0,
    root_id: id,
    root_kind: 'no_creator_recorded',
    fan_out: 0,
    fan_out_in_app: 0,
    provenance,
    ancestors: { outcome: 'complete', nodes: [] },
    descendants: { outcome: 'complete', nodes: [] },
    fan_out_signal: null,
    creation_authority: null,
  };
}

test('coverage is the explained share, counting creators and accounted-for absences alike', () => {
  const report = buildCoverage(GRAPH, [
    record('a', known('attested')),
    record('b', known(null)),
    record('c', absent('federated_elsewhere')),
    record('d', absent('outside_audit_window')),
  ]);

  assert.equal(report.overall.total, 4);
  assert.equal(report.overall.with_recorded_creator, 2);
  assert.equal(report.overall.explained_absences, 2);
  assert.equal(report.overall.unexplained, 0);
  assert.equal(report.overall.explanation_coverage, 1);
});

/**
 * The contrast that matters, and a deliberate *inversion* of the ownership rule.
 *
 * `OwnershipFinding.counted` excludes `unknown` because billing an audit-retention
 * gap as an orphan is a fabricated finding. Coverage does the opposite and keeps its
 * uncertain population in the denominator, because that population is the entire
 * subject of the measurement: exclude it and coverage is always 1, the number can
 * never be falsified, and there is no line to show climbing from install date.
 */
test('an unexplained identity stays in the denominator and pulls coverage down', () => {
  const report = buildCoverage(GRAPH, [
    record('a', known('attested')),
    record('b', absent('root_by_design')),
    record('c', UNEXPLAINED),
    record('d', UNEXPLAINED),
  ]);

  assert.equal(report.overall.total, 4, 'nothing is dropped from the denominator');
  assert.equal(report.overall.explanation_coverage, 0.5);
});

test('gap buckets are counted and ranked, never published as one unlinked total', () => {
  const report = buildCoverage(GRAPH, [
    record('a', absent('outside_audit_window')),
    record('b', absent('outside_audit_window')),
    record('c', absent('outside_audit_window')),
    record('d', absent('federated_elsewhere')),
    record('e', absent('self_registered')),
  ]);

  assert.deepEqual(report.overall.gap_buckets, [
    { reason: 'outside_audit_window', count: 3 },
    { reason: 'federated_elsewhere', count: 1 },
    { reason: 'self_registered', count: 1 },
  ]);
  assert.equal(
    'unlinked' in report.overall,
    false,
    'a raw unlinked count moves the wrong way as ingestion improves (§5.2)',
  );
});

/**
 * One blended figure would hide the only actionable message. Research §3.2 models a
 * three-year-old estate at roughly 3% recoverable on Entra P1 against 37% on GCP, so
 * the per-app split is what tells a customer which audit configuration to fix.
 */
test('coverage is reported per app, with each app carrying its own retention floor', () => {
  const report = buildCoverage(GRAPH, [
    record('a', known('attested')),
    record('b', absent('outside_audit_window')),
    record('c', known('correlated'), { app: 'github' }),
    record('d', known('inferred'), { app: 'github' }),
  ]);

  assert.deepEqual(
    report.by_app.map((entry) => [entry.app, entry.total, entry.creation_data_from]),
    [
      ['aws-iam', 2, '2025-01-01'],
      ['github', 2, null],
    ],
  );
  assert.equal(
    report.overall.creation_data_from,
    null,
    'the estate has no single floor, so it claims none',
  );
});

test('attribution confidence is reported separately from coverage', () => {
  const report = buildCoverage(GRAPH, [
    record('a', known('attested')),
    record('b', known('correlated')),
    record('c', known('inferred')),
    record('d', known(null)),
  ]);

  assert.equal(report.overall.with_recorded_creator, 4);
  assert.equal(report.overall.attributed_to_human, 3, 'one create has no human behind it at all');
  assert.equal(
    report.overall.attested_attributions,
    1,
    'only the provider-attested one is safe to act on automatically (§4.9)',
  );
});

/**
 * `PRD` §4.1's node list names humans, service accounts, AI agents and
 * app-integration accounts. A group is a permission container, and the ownership
 * queue already excludes it (`ownership/classify.ts` L186); two modules disagreeing
 * about the population is how the numbers stop matching on screen.
 */
test('groups are outside the population, so they cannot dilute coverage', () => {
  const types: readonly IdentityType[] = ['group', 'group', 'service_account'];
  const report = buildCoverage(
    GRAPH,
    types.map((identity_type, offset) =>
      record(`n-${offset}`, offset === 2 ? known('attested') : UNEXPLAINED, { identity_type }),
    ),
  );

  assert.equal(report.overall.total, 1);
  assert.equal(report.overall.explanation_coverage, 1);
});

test('an empty population reports full coverage rather than dividing by zero', () => {
  const report = buildCoverage(GRAPH, []);

  assert.equal(report.overall.explanation_coverage, 1);
  assert.deepEqual(report.by_app, []);
});

/** Guards against the identity list drifting from the fixture's own assumptions. */
test('the coverage fixture graph knows both apps', () => {
  const apps: readonly Identity['app'][] = ['aws-iam', 'github'];
  for (const app of apps) {
    assert.ok(GRAPH.apps.has(app), `fixture graph is missing "${app}"`);
  }
});
