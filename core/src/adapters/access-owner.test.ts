import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fixedClock } from './clock.js';
import {
  datasetHrDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from './dataset-directories.js';
import { memoizedAccessOwner } from './access-owner.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_OWNERSHIP_POLICY } from '../domain/policy.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createAccessService } from '../access/service.js';

const NOW = new Date('2026-07-31T00:00:00Z');
const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);

const OWNERSHIP = createOwnershipService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  hr: datasetHrDirectory(DATASET),
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
});

const OWNERS = memoizedAccessOwner(OWNERSHIP);
const ACCESS = createAccessService({
  graphSource: { graph: () => GRAPH },
  clock: fixedClock(NOW),
  owners: OWNERS,
  policy: DEFAULT_ACCOUNTABILITY_POLICY,
});

test('access owner port preserves unowned vs unknown vs suppressed', () => {
  const unowned = OWNERS.owner('svc-temp-ssm-bridge');
  assert.equal(unowned.state, 'unowned');
  assert.equal(unowned.owner, null);
  assert.equal(unowned.suppression, null);

  const unknown = OWNERS.owner('svc-ldap-print-spool');
  assert.equal(unknown.state, 'unknown');
  assert.notEqual(unknown.state, 'unowned');

  const suppressed = OWNERS.owner('svc-breakglass-root');
  assert.equal(suppressed.state, 'unowned');
  assert.equal(suppressed.suppression?.effect, 'suppressed');
});

test('access rows carry ownership resolution, not a bare OwnerRef', () => {
  const bridge = ACCESS.list({ pathType: 'hop' }).find(
    (row) => row.path.identity_id === 'svc-temp-ssm-bridge',
  );
  assert.ok(bridge);
  assert.equal(bridge.ownership.state, 'unowned');
  assert.equal(bridge.ownership.owner, null);
});
