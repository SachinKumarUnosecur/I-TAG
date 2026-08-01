import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccessService } from '../access/service.js';
import { memoizedAccessOwner } from '../adapters/access-owner.js';
import { fixedClock } from '../adapters/clock.js';
import {
  datasetHrDirectory,
  datasetLifecycleDirectory,
  datasetOwnerRegistry,
  datasetSuppressionRegistry,
  datasetTeamDirectory,
} from '../adapters/dataset-directories.js';
import { memoizedExposureOwnership } from '../adapters/exposure-ownership.js';
import { memoizedImpactExposure } from '../adapters/impact-exposure.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
} from '../domain/policy.js';
import type { RiskRow } from '../domain/risk.js';
import { createExposureService } from '../exposure/service.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { createRiskService } from '../risk/service.js';
import { SEED_DATASET } from './seed.js';
import { validateDataset } from './validate.js';

/**
 * Identity Risk Profile against the demo estate — beats 34-37.
 *
 * Every number here is a number that appears on screen, computed against the clock the demo
 * runs with. Split from `risk/service.test.ts` for the reason `seed-exposure.test.ts` is
 * split from `exposure/service.test.ts`: that file pins the *rules*, this one pins what the
 * estate does under them, so a threshold change and a seed change fail in different files.
 *
 * The pins here are unusually load bearing because this module reads four others. A seed row
 * that changes an ownership severity or an exposure band changes a factor count here without
 * touching a line of `risk/`, which is exactly the coupling worth failing loudly on.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

const DATASET = validateDataset(SEED_DATASET);
const GRAPH = buildIdentityGraph(DATASET);
const GRAPH_SOURCE = { graph: () => GRAPH };
const CLOCK = fixedClock(NOW);

const OWNERSHIP = createOwnershipService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  hr: datasetHrDirectory(DATASET),
  teams: datasetTeamDirectory(DATASET),
  owners: datasetOwnerRegistry(DATASET),
  suppressions: datasetSuppressionRegistry(DATASET),
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
  policy: DEFAULT_OWNERSHIP_POLICY,
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

const RISK = createRiskService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: memoizedExposureOwnership(OWNERSHIP),
  exposure: memoizedImpactExposure(EXPOSURE),
  lifecycle: datasetLifecycleDirectory(DATASET),
  hr: datasetHrDirectory(DATASET),
  policy: DEFAULT_RISK_POLICY,
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
});

const ROWS: readonly RiskRow[] = RISK.list({ includeWithoutFindings: true });
const SUMMARY = RISK.summary();

function row(identityId: string): RiskRow {
  const found = ROWS.find((entry) => entry.identity_id === identityId);
  assert.ok(found !== undefined, `seed dataset is missing "${identityId}"`);
  return found;
}

function findingsOf(identityId: string) {
  const { assessment } = row(identityId);
  assert.equal(assessment.kind, 'findings', `${identityId} should have findings`);
  assert.ok(assessment.kind === 'findings');
  return assessment;
}

// --- Beat 34: the four-factor row -------------------------------------------

/**
 * `svc-vpn-legacy` is rank 1 with four factors — the same answer beat 1 gives.
 *
 * This is the pin the module exists to hold. Beat 1's closing line is "the fusion is the
 * ranking", delivered today by `ownership/severity.ts` reading two signals; research §7.2
 * measured that the source PRD's composite demoted this identity from queue rank 1 to rank
 * 9 while promoting rows the shipped rankers had already surfaced. Four independent signals,
 * still at the top, is the whole argument — and if a change ever drops it, the averaging the
 * module was built to avoid has come back in some other form.
 */
test('beat 34 — svc-vpn-legacy is rank 1 with four factors firing', () => {
  const first = ROWS.at(0);
  assert.ok(first !== undefined);
  assert.equal(first.identity_id, 'svc-vpn-legacy');

  const assessment = findingsOf('svc-vpn-legacy');
  assert.equal(assessment.factors_firing, 4);
  assert.equal(assessment.worst_level, 'critical');
  assert.deepEqual(assessment.factors_unavailable, [], 'every applicable factor was evaluated here');
});

/**
 * The four evidence strings, verbatim, because they are what a reviewer reads aloud.
 *
 * Research §5's demo row asserted character for character. These are generated from seeded
 * data through four independent code paths — a quoted ownership state, a quoted exposure
 * band, `ITAG.md` §F9's control log and §F10's half-life table — so a change to any of the
 * four surfaces or their thresholds lands here rather than on stage.
 */
test('beat 34 — the four findings and their evidence are exactly these', () => {
  assert.deepEqual(
    findingsOf('svc-vpn-legacy').findings.map((finding) => ({
      factor: finding.factor,
      level: finding.level,
      evidence: finding.evidence,
      quoted: finding.quoted,
    })),
    [
      {
        factor: 'ownership',
        level: 'critical',
        evidence: 'owner_invalid (owner user user-victor)',
        quoted: true,
      },
      {
        factor: 'control_drift',
        level: 'critical',
        evidence: 'MFA disabled 271d ago and a temporary exception still live after 167d',
        quoted: false,
      },
      {
        factor: 'exposure',
        level: 'high',
        evidence: 'band extensive (exposure score 83)',
        quoted: true,
      },
      {
        factor: 'grant_staleness',
        level: 'high',
        evidence:
          'vpn:corp-network is 1914d old, past the 180d median revocation for vpn_remote_access (n=9)',
        quoted: false,
      },
    ],
  );
});

// --- Beat 35: the six -------------------------------------------------------

/**
 * `minFactors: 3` returns exactly seven identities out of 128.
 *
 * Research §9 beat 35: "this is the week's list" is a defensible sentence about a short
 * table and an indefensible one about a 128-row score. Asserted as an exhaustive equality
 * rather than a count, because which rows it is matters as much as how many — the source PRD's
 * composite put `user-bob` at 45 and `user-carol` at 60 while promoting two identities whose
 * only distinction was a hop path Exposure Map scores low. Beat 23b adds the compound
 * hop+unowned row (`svc-temp-ssm-bridge`) into this queue.
 */
test('beat 35 — the factors_firing >= 3 population is exactly these seven', () => {
  assert.deepEqual(
    RISK.list({ minFactors: 3 }).map((entry) => entry.identity_id),
    [
      'svc-vpn-legacy',
      'svc-backup',
      'svc-batch-recon',
      'svc-legacy-export',
      'svc-temp-ssm-bridge',
      'svc-quarter-close',
      'svc-etl',
    ],
  );
});

/**
 * The whole distribution, so a seed change that shifts the shape is visible.
 *
 * Compare with the source PRD's composite over the same estate: 33 distinct values across
 * 127 rows, **42 identities sharing the single value 8**, and an empty Critical band. Five
 * buckets, one of which is a six-row queue, is the shape a reviewer can act on.
 */
test('the factor-count distribution over the estate is {0:77, 1:27, 2:17, 3:6, 4:1}', () => {
  const distribution = new Map<number, number>();
  for (const entry of ROWS) {
    const count = entry.assessment.kind === 'findings' ? entry.assessment.factors_firing : 0;
    distribution.set(count, (distribution.get(count) ?? 0) + 1);
  }

  assert.deepEqual([...distribution.entries()].sort((left, right) => left[0] - right[0]), [
    [0, 77],
    [1, 27],
    [2, 17],
    [3, 6],
    [4, 1],
  ]);
});

test('the level distribution is critical 20, high 8, medium 19, low 4 over 51 rows', () => {
  assert.deepEqual(SUMMARY.by_worst_level, [
    { level: 'critical', count: 20 },
    { level: 'high', count: 8 },
    { level: 'medium', count: 19 },
    { level: 'low', count: 4 },
  ]);
  assert.equal(SUMMARY.with_findings, 51);
});

/**
 * `svc-backup` sits exactly on `ITAG.md` §F9's threshold, and that is deliberate.
 *
 * Its conditional-access exception is 90 days old at the pinned clock, and §F9's rule is
 * written as "still active 90+ days later", so the comparison is `>=` and this identity is
 * `critical` rather than `high`. It is the only row in the estate on the boundary, which
 * makes it the one that would move if the comparison were ever loosened — hence a pin of its
 * own rather than trust in the aggregate above.
 *
 * `ITAG.md` L342 seeded this identity for this eighteen months ago: "clean, correctly-scoped
 * direct grants but a decayed trust score (F9) — MFA disabled 4+ months ago and a
 * 'temporary' exception that's still active". This is the first module to read it.
 */
test('svc-backup is the 90-day boundary case ITAG.md L342 seeded, and reads as critical', () => {
  const assessment = findingsOf('svc-backup');
  assert.equal(assessment.factors_firing, 3);
  assert.equal(assessment.worst_level, 'critical');

  const drift = assessment.findings.find((finding) => finding.factor === 'control_drift');
  assert.ok(drift !== undefined);
  assert.equal(drift.level, 'critical');
  assert.equal(drift.evidence, 'MFA disabled 112d ago and a temporary exception still live after 90d');
  assert.equal(DEFAULT_RISK_POLICY.exceptionStaleDays, 90);
});

// --- Beat 36: the honest coverage -------------------------------------------

/**
 * The coverage block, exactly — and it is the beat a CISO judge remembers.
 *
 * Research §9 beat 36: sixty percent of the estate returns no findings, said out loud next to
 * the block showing that `control_drift` reaches four identities. `review_staleness` is the
 * shape of the argument in one row — 14 evaluated, **113 not applicable, 0 unavailable** —
 * because no provider records an access review for a machine identity and §3.2 establishes
 * none will. That is a scope statement, not a backlog item, and no product surveyed in §3.5
 * publishes the difference.
 */
test('beat 36 — the factor coverage over 128 identities is exactly this', () => {
  assert.equal(SUMMARY.scanned, 128);
  assert.deepEqual(SUMMARY.factor_coverage, [
    { factor: 'hop_access', evaluated: 128, unavailable: 0, not_applicable: 0, findings: 12 },
    { factor: 'exposure', evaluated: 127, unavailable: 1, not_applicable: 0, findings: 32 },
    { factor: 'ownership', evaluated: 123, unavailable: 5, not_applicable: 0, findings: 25 },
    { factor: 'control_drift', evaluated: 4, unavailable: 124, not_applicable: 0, findings: 4 },
    { factor: 'grant_staleness', evaluated: 7, unavailable: 121, not_applicable: 0, findings: 7 },
    { factor: 'review_staleness', evaluated: 14, unavailable: 0, not_applicable: 114, findings: 3 },
  ]);
});

/**
 * Seventy-seven identities report nothing, and **not one of them is called clean**.
 *
 * This is the arm distinction paying for itself, and the number that would be a lie under the
 * source PRD's design: a badge on a diluted row lets it sort, and a composite would have put
 * these 77 in a 42-way tie at the value 8. Here they are `partially_evaluated` with the
 * missing factors named, because `control_drift` and `grant_staleness` have no data for them.
 * `no_findings` is therefore zero on this estate — the only honest reading of a four-row
 * fixture table, and the thing to revisit when research §8 gap 3 is closed.
 */
test('beat 36 — the 77 with nothing found are unassessed, not clean', () => {
  assert.equal(SUMMARY.partially_evaluated, 77);
  assert.equal(SUMMARY.no_findings, 0);
  assert.equal(SUMMARY.with_findings + SUMMARY.partially_evaluated, SUMMARY.scanned);

  const unassessed = ROWS.filter((entry) => entry.assessment.kind === 'partially_evaluated');
  assert.equal(unassessed.length, 77);
  for (const entry of unassessed) {
    assert.ok(entry.assessment.kind === 'partially_evaluated');
    assert.ok(
      entry.assessment.factors_unavailable.length > 0,
      `${entry.identity_id} landed on the unassessed arm with nothing missing`,
    );
  }
});

// --- Beat 37: the disagreement ----------------------------------------------

/**
 * `user-maya` at exposure 97 has one factor; `svc-vpn-legacy` at 83 has four.
 *
 * Beat 37, and the same argument `EXPOSURE_VERSUS_SEVERITY` makes one module earlier, now
 * across four surfaces. Both readings are correct, they rank differently, and the
 * reconciliation string on the row is what says why. Research §1.3 measured what fusing them
 * costs: `user-maya` fell to composite rank 62 of 127, which is the information loss the
 * count avoids.
 */
test('beat 37 — the widest footprint in the estate has one factor firing, and says so', () => {
  const maya = findingsOf('user-maya');
  assert.equal(maya.factors_firing, 1);
  assert.deepEqual(
    maya.findings.map((finding) => finding.factor),
    ['exposure'],
  );
  assert.deepEqual(maya.factors_unavailable, ['control_drift', 'grant_staleness']);

  const mayaExposure = row('user-maya').exposure;
  assert.ok(mayaExposure !== null && mayaExposure.kind === 'scored');
  assert.equal(mayaExposure.exposure_score, 97);

  const legacyExposure = row('svc-vpn-legacy').exposure;
  assert.ok(legacyExposure !== null && legacyExposure.kind === 'scored');
  assert.equal(legacyExposure.exposure_score, 83);
  assert.ok(
    ROWS.indexOf(row('svc-vpn-legacy')) < ROWS.indexOf(row('user-maya')),
    'the four-factor row outranks the widest footprint, which is the beat',
  );
});

/**
 * The three humans research §8 gap 5 and open issue C flag are still visible here.
 *
 * `user-bob` is `active` and unreviewed for 197 days, which is the only reason
 * `review_staleness` fires at all on this estate. Pinned so that scoping the factor to a
 * narrower population — one of the two options §8 gap 6 leaves open — fails loudly rather
 * than silently emptying a column.
 */
test('review staleness fires for exactly the three humans whose reviews are past 90 days', () => {
  const fired = ROWS.filter(
    (entry) =>
      entry.assessment.kind === 'findings' &&
      entry.assessment.findings.some((finding) => finding.factor === 'review_staleness'),
  ).map((entry) => entry.identity_id);

  assert.deepEqual(fired.sort(), ['user-bob', 'user-erin', 'user-victor']);

  const bob = findingsOf('user-bob').findings.find((finding) => finding.factor === 'review_staleness');
  assert.ok(bob !== undefined);
  assert.equal(bob.evidence, 'last access review was 197d ago, past the 90d review window');
});
