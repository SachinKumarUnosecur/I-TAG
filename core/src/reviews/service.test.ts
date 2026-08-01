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
import { memoizedImpactExposure } from '../adapters/impact-exposure.js';
import { memoryReviewDecisionStore } from '../adapters/memory-review-decision-store.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
} from '../domain/policy.js';
import { createExposureService } from '../exposure/service.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createRiskService } from '../risk/service.js';
import { createAccessReviewsService } from './service.js';

/**
 * Access Reviews, assembled — `docs/PRD-access-reviews.md`.
 * Wired identically to `backend/src/server.ts`'s composition root for this module.
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

const OWNERSHIP_SOURCE = memoizedExposureOwnership(OWNERSHIP);

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
  ownership: OWNERSHIP_SOURCE,
});

const EXPOSURE_SOURCE = memoizedImpactExposure(EXPOSURE);

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

const DECISIONS = memoryReviewDecisionStore();

const REVIEWS = createAccessReviewsService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  risk: RISK,
  decisions: DECISIONS,
});

test('list() excludes groups and returns review items for the seed estate', () => {
  const { items, summary } = REVIEWS.list();
  const groupIds = new Set(
    DATASET.identities.filter((i) => i.type === 'group').map((i) => i.id),
  );
  assert.ok(items.length > 0);
  assert.equal(summary.identityCount, items.length);
  for (const item of items) {
    assert.equal(groupIds.has(item.identityId), false);
    assert.ok(item.id.startsWith('ri-'));
    assert.match(item.decision, /^(pending|approved|revoked|escalated)$/);
  }
});

test('summary KPIs equal decision tallies on the same filtered set', () => {
  const pending = REVIEWS.list({ decision: 'pending' });
  assert.equal(pending.summary.pending, pending.items.length);
  assert.equal(pending.summary.approved, 0);
});

test('decide() records approve and moves summary counts', () => {
  const pending = REVIEWS.list({ decision: 'pending' }).items[0];
  assert.ok(pending);
  const before = REVIEWS.summary();
  const outcome = REVIEWS.decide(pending.id, {
    action: 'approve',
    actor: 'tom.walker',
    justification: 'Still required for role; reviewed in campaign.',
  });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.item.decision, 'approved');
  const after = REVIEWS.summary();
  assert.equal(after.pending, before.pending - 1);
  assert.equal(after.approved, before.approved + 1);
});

test('decide() refuses a second decision on a non-pending item', () => {
  const approved = REVIEWS.list({ decision: 'approved' }).items[0];
  assert.ok(approved);
  const outcome = REVIEWS.decide(approved.id, {
    action: 'revoke',
    actor: 'tom.walker',
    justification: 'should fail',
  });
  assert.equal(outcome.ok, false);
  if (outcome.ok) return;
  assert.equal(outcome.error, 'not_pending');
});

test('profile() quotes assignments from AccessService without inventing path types', () => {
  const item = REVIEWS.list().items.find((row) => row.grantCount > 0);
  assert.ok(item);
  const outcome = REVIEWS.profile(item.id);
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  for (const grant of outcome.profile.detail.assignments) {
    assert.ok(['Direct', 'Indirect', 'Shadow'].includes(grant.accessType));
    assert.ok(['direct', 'indirect', 'hop'].includes(grant.pathType));
  }
});

test('exportCsv labels attestation evidence, not certification', () => {
  const csv = REVIEWS.exportCsv('soc2');
  assert.match(csv, /attestation evidence export — not a certification/);
  assert.match(csv, /soc2/);
});

test('riskScore is factors_firing (or 0), never a fabricated 0–100 composite', () => {
  for (const item of REVIEWS.list().items.slice(0, 40)) {
    assert.ok(Number.isInteger(item.riskScore));
    assert.ok(item.riskScore >= 0);
    assert.ok(item.riskScore <= 10, `unexpectedly large factors_firing for ${item.identityId}`);
  }
});
