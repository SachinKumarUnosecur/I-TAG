import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccessService } from '../access/service.js';
import {
  datasetHrDirectory,
  datasetLifecycleDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoizedAccessOwner } from '../adapters/access-owner.js';
import { fixedClock } from '../adapters/clock.js';
import { memoizedExposureOwnership } from '../adapters/exposure-ownership.js';
import { memoizedImpactChokePoints } from '../adapters/impact-chokepoints.js';
import { memoizedImpactExposure } from '../adapters/impact-exposure.js';
import { memoizedLineageRows } from '../adapters/lineage-rows.js';
import { memoizedOwnershipState } from '../adapters/ownership-state.js';
import { memoizedRiskAssessment } from '../adapters/risk-assessment.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_LINEAGE_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
} from '../domain/policy.js';
import type { ThreatFinding, ThreatProfile } from '../domain/threat.js';
import { createExposureService } from '../exposure/service.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createImpactService } from '../impact/service.js';
import { createLineageService } from '../lineage/service.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createRiskService } from '../risk/service.js';
import { PROBING_COVERAGE_GAP } from './mapping.js';
import { createThreatProfileService } from './service.js';

/**
 * Identity Threat Profile, assembled — `docs/identity-threat-profile-research.md` §5-§7.
 *
 * Wired identically to `backend/src/server.ts`'s composition root, so a construction bug here
 * is a construction bug there. The guards at the bottom are the fourth generation of the same
 * device `access/classify.test.ts`, `exposure/service.test.ts`, `impact/service.test.ts` and
 * `risk/service.test.ts` each run — with one deliberate exception, explained where it appears:
 * this module's whole deliverable is a qualitative band, which every sibling guard forbids
 * *itself* from authoring, so this guard cannot forbid it too without forbidding the PRD.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);
const GRAPH_SOURCE = { graph: () => GRAPH };
const CLOCK = fixedClock(NOW);

const HR = datasetHrDirectory(DATASET);

const OWNERSHIP = createOwnershipService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  hr: HR,
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const LINEAGE = createLineageService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  hr: HR,
  suppressions: datasetSuppressionRegistry(DATASET),
  ownership: memoizedOwnershipState(OWNERSHIP),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_LINEAGE_POLICY,
});

const ACCESS = createAccessService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  owners: memoizedAccessOwner(OWNERSHIP),
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const EXPOSURE = createExposureService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: memoizedExposureOwnership(OWNERSHIP),
});

/** The same adapter instances the sibling services are given, so a quotation can be checked. */
const OWNERSHIP_SOURCE = memoizedExposureOwnership(OWNERSHIP);
const EXPOSURE_SOURCE = memoizedImpactExposure(EXPOSURE);

const IMPACT = createImpactService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: OWNERSHIP_SOURCE,
  exposure: EXPOSURE_SOURCE,
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const RISK = createRiskService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: OWNERSHIP_SOURCE,
  exposure: EXPOSURE_SOURCE,
  lifecycle: datasetLifecycleDirectory(DATASET),
  hr: HR,
  policy: DEFAULT_RISK_POLICY,
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const IMPACT_SOURCE = memoizedImpactChokePoints(IMPACT);
const RISK_SOURCE = memoizedRiskAssessment(RISK);
const LINEAGE_SOURCE = memoizedLineageRows(LINEAGE);

const THREAT = createThreatProfileService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: OWNERSHIP_SOURCE,
  exposure: EXPOSURE_SOURCE,
  impact: IMPACT_SOURCE,
  risk: RISK_SOURCE,
  lineage: LINEAGE_SOURCE,
});

function profileOf(identityId: string): ThreatProfile {
  const outcome = THREAT.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile;
}

// --- Basic shape ------------------------------------------------------------

test('profile() is a terminal outcome for an unknown id, never a throw', () => {
  const outcome = THREAT.profile('identity:does-not-exist');
  assert.equal(outcome.ok, false);
  if (!outcome.ok) {
    assert.equal(outcome.error, 'unknown_identity');
  }
});

test('profile() refuses a group, the same as every other module (rule 12)', () => {
  const group = DATASET.identities.find((identity) => identity.type === 'group');
  assert.ok(group !== undefined, 'seed dataset has no group to test against');
  const outcome = THREAT.profile(group.id);
  assert.equal(outcome.ok, false);
});

test('list() never returns a row for a group', () => {
  const groupIds = new Set(DATASET.identities.filter((identity) => identity.type === 'group').map((i) => i.id));
  for (const row of THREAT.list()) {
    assert.equal(groupIds.has(row.identity_id), false, `${row.identity_id} is a group`);
  }
});

test('summary() publishes coverage before the KPI counts, matching every sibling summary', () => {
  const summary = THREAT.summary();
  const keys = Object.keys(summary);
  assert.ok(keys.indexOf('stage_coverage') < keys.indexOf('total_findings'));
  assert.ok(keys.indexOf('matrix') < keys.indexOf('total_findings'));
});

test('summary() reports all six PTRACE stages, including zero-coverage ones', () => {
  const summary = THREAT.summary();
  assert.equal(summary.stage_coverage.length, 6);
  const stages = summary.stage_coverage.map((entry) => entry.stage);
  assert.deepEqual(
    [...stages].sort(),
    [
      'account_spoofing',
      'concealment_persistence',
      'exfiltration_lateral_movement',
      'probing',
      'rights_escalation',
      'trust_exploitation',
    ],
  );
});

test('Probing is a named zero-coverage gap on the seed dataset, not a fabricated finding', () => {
  const summary = THREAT.summary();
  const probing = summary.stage_coverage.find((entry) => entry.stage === 'probing');
  assert.ok(probing !== undefined);
  assert.equal(probing.findings, 0);
  assert.equal(probing.identities, 0);
  assert.ok(PROBING_COVERAGE_GAP.length > 0);
});

test('every stage other than Probing is reachable on the seed dataset', () => {
  const summary = THREAT.summary();
  for (const entry of summary.stage_coverage) {
    if (entry.stage === 'probing') {
      continue;
    }
    assert.ok(entry.findings > 0, `${entry.stage} has no findings on the seed dataset`);
  }
});

test('the matrix always has all 25 cells, and every cell count is non-negative', () => {
  const summary = THREAT.summary();
  assert.equal(summary.matrix.length, 25);
  for (const cell of summary.matrix) {
    assert.ok(cell.count >= 0);
  }
  const matrixTotal = summary.matrix.reduce((sum, cell) => sum + cell.count, 0);
  assert.equal(matrixTotal + summary.unplaced_findings, summary.total_findings);
});

test('a finding with a null cell is excluded from the matrix but still counted in total_findings', () => {
  const summary = THREAT.summary();
  const listed = THREAT.list();
  const unplaced = listed.filter((finding) => finding.cell === null);
  assert.equal(unplaced.length, summary.unplaced_findings);
});

test('list() rows carry the identity columns the findings table needs, inlined', () => {
  const rows = THREAT.list();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.equal(typeof row.identity_name, 'string');
    assert.equal(typeof row.app, 'string');
    assert.ok(['human', 'service_account', 'ai_agent'].includes(row.identity_type));
  }
});

test('list() findings are a subset of profile() findings for the same identities', () => {
  const rows = THREAT.list();
  const byIdentity = new Map<string, ThreatFinding[]>();
  for (const row of rows) {
    const bucket = byIdentity.get(row.identity_id) ?? [];
    bucket.push(row);
    byIdentity.set(row.identity_id, bucket);
  }
  for (const [identityId, findings] of byIdentity) {
    const profile = profileOf(identityId);
    assert.equal(profile.assessment.kind, 'findings');
    if (profile.assessment.kind === 'findings') {
      assert.equal(findings.length, profile.assessment.findings.length);
    }
  }
});

test('query filters on list() combine with AND', () => {
  const all = THREAT.list();
  const critical = all.filter((finding) => finding.severity === 'critical');
  const filtered = THREAT.list({ severity: 'critical' });
  assert.deepEqual(
    filtered.map((f) => f.finding_id).sort(),
    critical.map((f) => f.finding_id).sort(),
  );
});

// --- Byte-identity guard: quoted subtrees are copies, never re-derived ------

test('the quoted exposure subtree on a row equals what exposure.profile() returns, verbatim', () => {
  for (const identity of DATASET.identities) {
    if (identity.type === 'group') {
      continue;
    }
    const threatProfile = profileOf(identity.id);
    const exposureOutcome = EXPOSURE.profile(identity.id);
    const expected = exposureOutcome.ok ? exposureOutcome.profile.assessment : null;
    assert.deepEqual(threatProfile.exposure, expected, `${identity.id}'s quoted exposure diverges`);
  }
});

test('the quoted risk subtree on a row equals what risk.profile() returns, verbatim', () => {
  for (const identity of DATASET.identities) {
    if (identity.type === 'group') {
      continue;
    }
    const threatProfile = profileOf(identity.id);
    const riskOutcome = RISK.profile(identity.id);
    const expected = riskOutcome.ok ? riskOutcome.profile.assessment : null;
    assert.deepEqual(threatProfile.risk, expected, `${identity.id}'s quoted risk diverges`);
  }
});

test('the quoted impact subtree on a row equals what impact.profile() returns, verbatim', () => {
  for (const identity of DATASET.identities) {
    if (identity.type === 'group') {
      continue;
    }
    const threatProfile = profileOf(identity.id);
    const impactOutcome = IMPACT.profile(identity.id);
    const expected = impactOutcome.ok ? impactOutcome.profile.assessment : null;
    assert.deepEqual(threatProfile.impact, expected, `${identity.id}'s quoted impact diverges`);
  }
});

test('the quoted ownership subtree on a row equals what ownership.classify() returns, verbatim', () => {
  for (const identity of DATASET.identities) {
    if (identity.type === 'group') {
      continue;
    }
    const threatProfile = profileOf(identity.id);
    const outcome = OWNERSHIP.classify(identity.id);
    const expected = outcome.ok
      ? { state: outcome.finding.state, severity: outcome.finding.severity, owner: outcome.finding.owner }
      : { state: 'unknown', severity: 'none', owner: null };
    assert.deepEqual(
      { state: threatProfile.ownership.state, severity: threatProfile.ownership.severity, owner: threatProfile.ownership.owner },
      expected,
      `${identity.id}'s quoted ownership diverges`,
    );
  }
});

// --- The condition this module exists under ---------------------------------

/**
 * Copied from `risk/service.test.ts`'s own guard, with one named exception. Every sibling
 * module's guard forbids `band` because none of them are supposed to author one — but PRD
 * §6.2 *is* a band, published by an explicit NIST-shaped lookup table (`SEVERITY_BAND_MATRIX`),
 * never arithmetic, and refusing to let this module emit the one artifact its own PRD exists
 * to produce would not be architectural discipline, it would be refusing to build the module.
 * What stays forbidden is the numeric vocabulary no lookup table produces: a recomputed
 * `risk_score`/`exposure_score`, an invented `exploitable_risk_score`, or any new
 * `*_score`-shaped key — which is `docs/identity-threat-profile-research.md` §4's own
 * resolution of the PRD's non-goal #2, enforced rather than promised.
 */
test('nothing this module authors is a numeric score — only NIST-shaped bands, quoted verdicts', () => {
  const forbidden = [
    'weighted_sum',
    'risk_score',
    'exposure_score',
    'impact_score',
    'likelihood_score',
    'exploitable_risk_score',
    'peer_percentile',
    'score_drift',
  ];
  /** Quoted whole from another authority — asserted byte-identical above, not walked here. */
  const quotations = ['ownership', 'exposure', 'impact', 'risk'];

  function walk(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbidden.includes(key), false, `${trail}.${key} is a forbidden numeric key`);
      assert.equal(key.endsWith('_score'), false, `${trail}.${key} is score-shaped`);
      if (!quotations.includes(key)) {
        walk(nested, `${trail}.${key}`);
      }
    }
  }

  walk(THREAT.summary(), 'summary()');
  walk(THREAT.list(), 'list()');
  for (const identity of DATASET.identities) {
    walk(THREAT.profile(identity.id), `profile(${identity.id})`);
  }
});

test('every cell on every finding is one of the 25 published bands, or null', () => {
  const validBands = new Set(['desirable', 'acceptable', 'undesirable', 'unacceptable', 'catastrophic']);
  for (const finding of THREAT.list()) {
    if (finding.cell !== null) {
      assert.ok(validBands.has(finding.cell.band), `${finding.finding_id} has an unpublished band`);
    }
  }
});
