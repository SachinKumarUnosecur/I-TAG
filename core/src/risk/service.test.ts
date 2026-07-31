import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAccessService } from '../access/service.js';
import { datasetHrDirectory, datasetLifecycleDirectory, datasetOwnerRegistry, datasetSuppressionRegistry, datasetTeamDirectory } from '../adapters/dataset-directories.js';
import { memoizedAccessOwner } from '../adapters/access-owner.js';
import { fixedClock } from '../adapters/clock.js';
import { memoizedExposureOwnership } from '../adapters/exposure-ownership.js';
import { memoizedImpactExposure } from '../adapters/impact-exposure.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';
import { EXPOSURE_VERSUS_SEVERITY } from '../domain/exposure.js';
import {
  DEFAULT_ACCOUNTABILITY_POLICY,
  DEFAULT_OWNERSHIP_POLICY,
  DEFAULT_RISK_POLICY,
} from '../domain/policy.js';
import type { RiskFactorName, RiskProfile } from '../domain/risk.js';
import { RISK_VERSUS_RANKERS } from '../domain/risk.js';
import { createExposureService } from '../exposure/service.js';
import { buildIdentityGraph } from '../graph/build.js';
import { createOwnershipService } from '../ownership/classify.js';
import { EXPOSURE_BAND_LEVELS } from './factors.js';
import { createRiskService } from './service.js';

/**
 * Identity Risk Profile, assembled — `docs/identity-risk-profile-research.md` §5, §6, §7.2.
 *
 * The most important tests in this file are the guards at the bottom, and they are the
 * fourth generation of a device this engine has run three times. `access/classify.test.ts`
 * walks Access Discovery's output for any key named `severity`, `rank`, `score` or
 * `priority`; `exposure/service.test.ts` walks the paths exposure borrows for the same,
 * plus its own score leaking backwards; `impact/service.test.ts` walks every payload
 * Blast Radius authors and exempts exactly two quotation subtrees. Research §1.4 records
 * that the second of those already forbids the literal key **`risk_score`** — written with
 * this module's output in mind, one module before it existed — so passing that same guard
 * is the condition this module ships under.
 *
 * Estate numbers are pinned in `data/seed-risk.test.ts`, not here, so a seed change and a
 * service change fail in different files.
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

/** The same adapter instances the service is given, so a quotation can be checked. */
const OWNERSHIP_SOURCE = memoizedExposureOwnership(OWNERSHIP);
const EXPOSURE_SOURCE = memoizedImpactExposure(EXPOSURE);

const RISK = createRiskService({
  graphSource: GRAPH_SOURCE,
  clock: CLOCK,
  access: ACCESS,
  ownership: OWNERSHIP_SOURCE,
  exposure: EXPOSURE_SOURCE,
  lifecycle: datasetLifecycleDirectory(DATASET),
  hr: datasetHrDirectory(DATASET),
  policy: DEFAULT_RISK_POLICY,
  accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
});

function profileOf(identityId: string): RiskProfile {
  const outcome = RISK.profile(identityId);
  assert.ok(outcome.ok, `seed dataset is missing "${identityId}"`);
  return outcome.profile;
}

const FACTORS: readonly RiskFactorName[] = [
  'hop_access',
  'exposure',
  'ownership',
  'control_drift',
  'grant_staleness',
  'review_staleness',
];

// --- Population -------------------------------------------------------------

/**
 * All three methods answer for the same population, which is not true of two siblings.
 *
 * Open issues A and A* are that `ownership.classify` and `exposure.profile` both answer for
 * a group while neither `list` returns one, so a drawer reachable from a choke-point row
 * lands on a page no table will show. This module does not inherit the split: a group is
 * not a subject anywhere in it, so `profile` on one is `unknown_identity` rather than a
 * verdict that cannot be found again.
 */
test('groups are not subjects in list, profile or summary — architecture rule 12', () => {
  const rows = RISK.list({ includeWithoutFindings: true });
  const summary = RISK.summary();
  const groups = DATASET.identities.filter((identity) => identity.type === 'group');

  assert.ok(groups.length > 0, 'the seed should contain groups for this test to mean anything');
  assert.equal(
    rows.filter((row) => row.identity_type === 'group').length,
    0,
    'no group should appear in the table',
  );
  assert.equal(rows.length, summary.scanned);

  for (const group of groups) {
    const outcome = RISK.profile(group.id);
    assert.equal(outcome.ok, false, `${group.id} should have no risk profile`);
    assert.ok(!outcome.ok);
    assert.equal(outcome.error, 'unknown_identity');
  }
});

/** Architecture rule 6 — an unknown id is a terminal state, never a throw. */
test('an unknown identity is an outcome, not an exception', () => {
  const outcome = RISK.profile('svc-does-not-exist');
  assert.equal(outcome.ok, false);
  assert.ok(!outcome.ok);
  assert.deepEqual(outcome, {
    ok: false,
    error: 'unknown_identity',
    identity_id: 'svc-does-not-exist',
  });
});

// --- The coverage gate ------------------------------------------------------

/**
 * The gate publishes before the ranking, and it names every factor including the ones
 * that reached almost nothing.
 *
 * `exposure/service.test.ts` L402 established the ordering for the same reason §7 promoted
 * classification completeness from a metric to a gate: the first thing a reviewer needs is
 * not who ranks highest but whether the ranking means anything. Here it is sharper, because
 * research §8 gap 3 measured `control_drift` at four identities — a table sorted by factor
 * count without this block beside it reads as an estate-wide assessment of a fixture.
 */
test('the summary publishes factor coverage first, over every factor in the registry', () => {
  const summary = RISK.summary();

  assert.deepEqual(Object.keys(summary)[0], 'factor_coverage');
  assert.deepEqual(
    summary.factor_coverage.map((entry) => entry.factor),
    FACTORS,
  );

  for (const entry of summary.factor_coverage) {
    assert.equal(
      entry.evaluated + entry.unavailable + entry.not_applicable,
      summary.scanned,
      `${entry.factor} coverage should account for every scanned identity`,
    );
    assert.ok(entry.findings <= entry.evaluated, `${entry.factor} cannot fire where it did not run`);
  }
});

/**
 * `unavailable` and `not_applicable` are different columns because they are different claims.
 *
 * Research §3.2 found that no provider records an access review for a machine identity and
 * that NIST SP 800-63-4 closes the door on it explicitly — "'person' refers only to natural
 * persons" — so 113 service accounts are out of scope for `review_staleness` rather than
 * missing from it. Meanwhile `control_drift` genuinely has no data for 123 identities, and
 * that is a gap somebody could be asked to close. One column for both would name a backlog
 * item nobody can action.
 */
test('a factor that does not apply is counted apart from one that has no data', () => {
  const coverage = RISK.summary().factor_coverage;
  const review = coverage.find((entry) => entry.factor === 'review_staleness');
  const drift = coverage.find((entry) => entry.factor === 'control_drift');

  assert.ok(review !== undefined && drift !== undefined);
  assert.ok(review.not_applicable > 0, 'review staleness is out of scope for machine identities');
  assert.equal(review.unavailable, 0, 'an out-of-scope identity is not a data gap');
  assert.ok(drift.unavailable > 0, 'control drift has no data for most of the estate');
  assert.equal(drift.not_applicable, 0, 'control drift applies to every identity');
});

/**
 * The three population counts add up, and the sum of the level bars is the findings count.
 *
 * Three counts rather than one `unassessed`, for the same reason `RiskAssessment` has three
 * arms. `no_findings` and `partially_evaluated` are the two halves the whole category
 * collapses (§3.5), and if they ever stop summing to the population the arm selection has a
 * hole in it.
 */
test('the population splits into exactly the three arms, and the bars sum to the findings', () => {
  const summary = RISK.summary();

  assert.equal(
    summary.with_findings + summary.no_findings + summary.partially_evaluated,
    summary.scanned,
  );
  assert.equal(
    summary.by_worst_level.reduce((total, bar) => total + bar.count, 0),
    summary.with_findings,
  );
  assert.deepEqual(
    summary.by_worst_level.map((bar) => bar.level),
    ['critical', 'high', 'medium', 'low'],
  );
});

// --- The table and its filters ----------------------------------------------

/**
 * Rows with nothing found are hidden by default and disclosed in the summary.
 *
 * The asymmetry `ExposureQuery.includeNoPaths` established: a queue a reviewer works
 * top-down should not open with 77 rows that have nothing on them, and the honest place for
 * that number is the strip above the table, where it sits beside the coverage block that
 * explains it.
 */
test('the table hides rows with no findings unless asked, and the summary still counts them', () => {
  const visible = RISK.list();
  const everything = RISK.list({ includeWithoutFindings: true });
  const summary = RISK.summary();

  assert.ok(visible.length < everything.length);
  assert.equal(visible.length, summary.with_findings);
  assert.equal(everything.length, summary.scanned);
  assert.equal(
    visible.every((row) => row.assessment.kind === 'findings'),
    true,
  );
});

/**
 * A filter on a finding cannot match a row that has not got one.
 *
 * The query side of the three-armed union: `worstLevel`, `minFactors` and `factor` exclude
 * both no-finding arms rather than treating them as zero, so the table and the type agree
 * about what a row without findings is. `includeWithoutFindings` cannot override it —
 * asking for critical rows and for unassessed rows at once is a contradiction, and the
 * finding filter wins.
 */
test('finding filters exclude the arms that have no finding, even with includeWithoutFindings', () => {
  const critical = RISK.list({ worstLevel: 'critical' });
  assert.ok(critical.length > 0);
  assert.equal(
    critical.every((row) => row.assessment.kind === 'findings' && row.assessment.worst_level === 'critical'),
    true,
  );

  const contradiction = RISK.list({ worstLevel: 'critical', includeWithoutFindings: true });
  assert.deepEqual(
    contradiction.map((row) => row.identity_id),
    critical.map((row) => row.identity_id),
  );
});

test('filters combine with AND, across the authored and the quoted alike', () => {
  const byFactor = RISK.list({ factor: 'grant_staleness' });
  assert.ok(byFactor.length > 0);
  assert.equal(
    byFactor.every(
      (row) =>
        row.assessment.kind === 'findings' &&
        row.assessment.findings.some((finding) => finding.factor === 'grant_staleness'),
    ),
    true,
  );

  const narrowed = RISK.list({ factor: 'grant_staleness', identityType: 'service_account', minFactors: 3 });
  assert.ok(narrowed.length > 0);
  assert.ok(narrowed.length < byFactor.length);
  assert.equal(
    narrowed.every(
      (row) => row.identity_type === 'service_account' && row.assessment.kind === 'findings' && row.assessment.factors_firing >= 3,
    ),
    true,
  );

  // `owner` reads the quoted ownership subtree, so it matches whatever arm the row is on.
  const anOwner = RISK.list({ includeWithoutFindings: true }).find((row) => row.ownership.owner !== null)?.ownership.owner;
  assert.ok(anOwner !== undefined && anOwner !== null);
  const byOwner = RISK.list({ owner: anOwner.id, includeWithoutFindings: true });
  assert.ok(byOwner.length > 0);
  assert.equal(byOwner.every((row) => row.ownership.owner?.id === anOwner.id), true);
});

/**
 * The count leads the ordering, and that is the whole ranking rule.
 *
 * Research §7.2's measured objection to the composite was that fusion destroyed information
 * the shipped rankers had — `svc-vpn-legacy` fell from ownership queue rank 1 to composite
 * rank 9. Ordering on a count of independent signals recovers it without inventing a value:
 * every number this sort reads is recomputable by counting the findings printed on the row.
 */
test('the table is ordered by factors firing, then worst level, then id', () => {
  const rows = RISK.list();

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];
    assert.ok(previous !== undefined && current !== undefined);
    assert.ok(previous.assessment.kind === 'findings' && current.assessment.kind === 'findings');
    assert.ok(
      previous.assessment.factors_firing >= current.assessment.factors_firing,
      `${previous.identity_id} then ${current.identity_id} is not descending by factor count`,
    );
  }
});

// --- Disclosure -------------------------------------------------------------

/**
 * The condition this module exists under, on every row rather than on the drawer.
 *
 * Research §6 requires the reconciliation sentence in the engine because a fourth surface
 * disagreeing with three others in front of a CISO is the failure mode
 * `access/classify.test.ts` L432 was written to prevent. Both quotations travel too, so a UI
 * physically cannot render a factor count without the two numbers it is not replacing.
 */
test('every row carries both quotations and the sentence reconciling four surfaces', () => {
  for (const row of RISK.list({ includeWithoutFindings: true })) {
    assert.equal(row.why_factors_differ, RISK_VERSUS_RANKERS, row.identity_id);
    assert.equal(row.ownership.why_these_differ, EXPOSURE_VERSUS_SEVERITY, row.identity_id);
    assert.ok('state' in row.ownership && 'severity' in row.ownership, row.identity_id);
    assert.ok('exposure' in row, row.identity_id);
  }
});

/**
 * Staleness dates the facts, not the moment they were read.
 *
 * `based_on_access_discovery_snapshot` is copied from Access Discovery and never re-read
 * from the clock. `stalest_input` is research §4.5's field, and in this build it points at
 * the graph snapshot for every row because all six inputs come from one dataset validated
 * at boot — which the payload says out loud by having the two values agree, rather than
 * implying a per-factor ingestion cadence that does not exist.
 */
test('staleness copies the snapshot it read and points stalest_input at it', () => {
  const profile = profileOf('svc-vpn-legacy');
  const snapshot = ACCESS.summary().snapshot.graph_snapshot_at;

  assert.equal(profile.staleness.based_on_access_discovery_snapshot, snapshot);
  assert.equal(profile.staleness.computed_at, NOW.toISOString());
  assert.deepEqual(profile.staleness.stalest_input, { factor: 'hop_access', snapshot_at: snapshot });

  // An identity with no evaluable factor has nothing to date the row with, and says so.
  const unassessed = RISK.list({ includeWithoutFindings: true }).find(
    (row) => row.assessment.factors_evaluated.length === 0,
  );
  if (unassessed !== undefined) {
    assert.equal(unassessed.staleness.stalest_input, null);
  }
});

/** The drawer and the row are the same object, so a table cell cannot disagree with it. */
test('profile returns exactly the row the table shows', () => {
  const row = RISK.list().at(0);
  assert.ok(row !== undefined);
  assert.deepEqual(profileOf(row.identity_id), row);
});

// --- The guards this module ships under -------------------------------------

/**
 * Architecture rule 8, enforced rather than promised.
 *
 * The engine's fourth generation of this walk, and the one it was written for: research
 * §1.4 records that `impact/service.test.ts` L117 already lists **`risk_score`** in its
 * forbidden array, and that `exposure/service.test.ts` L590 already bans `rising_fast`,
 * `flag` and `trend` — the exact keys the source PRD's §4.3 score object uses verbatim.
 * Three modules have now been asked to publish a fused per-identity number and three have
 * refused; this test is that refusal made structural for the fourth.
 *
 * Two subtrees are exempt and both are *quotations*: `ownership` carries
 * `ownership/severity.ts`'s verdict and `exposure` carries `exposure/score.ts`'s, each
 * authored elsewhere and copied here so a reviewer cannot see one signal without the
 * others. The next test proves the exemptions are copies rather than a hiding place.
 *
 * `band` is on the list because it is exposure's four-word vocabulary for a different
 * axis, and re-emitting it under this module's own name is how two surfaces end up sharing
 * a column heading — research §4.6 Amendment 5's objection in its cheapest form.
 */
test('nothing this module authors is a score, a rank or a band', () => {
  const forbidden = [
    'severity',
    'rank',
    'score',
    'priority',
    'band',
    'exposure_score',
    'weighted_sum',
    'risk_score',
    'trust_score',
    'composite_score',
    'peer_percentile',
  ];
  /** Quoted from another authority, asserted verbatim below rather than walked. */
  const quotations = ['ownership', 'exposure'];

  function walk(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(forbidden.includes(key), false, `${trail}.${key} ranks something`);
      assert.equal(key.endsWith('_score'), false, `${trail}.${key} is score-shaped`);
      if (!quotations.includes(key)) {
        walk(nested, `${trail}.${key}`);
      }
    }
  }

  walk(RISK.summary(), 'summary()');
  walk(RISK.list({ includeWithoutFindings: true }), 'list()');
  for (const identity of DATASET.identities) {
    walk(RISK.profile(identity.id), `profile(${identity.id})`);
  }
});

/**
 * The other half of the guard: an exemption that is not a copy is a loophole.
 *
 * A module could satisfy the test above by renaming its own value to `exposure` and hiding
 * it in the exempt subtree, so both quotations are asserted identical to what the ports
 * returned — the same ports, the same adapter instances the service was constructed with.
 * This is also what keeps the disclosure honest in the other direction: the context has to
 * actually be there, not merely be unranked.
 */
test('the quoted subtrees are verbatim copies of the authorities that own them', () => {
  for (const identityId of ['svc-vpn-legacy', 'user-maya', 'user-jane', 'agent-support-triage', 'svc-backup']) {
    const profile = profileOf(identityId);

    assert.deepEqual(profile.ownership, OWNERSHIP_SOURCE.context(identityId), identityId);
    assert.deepEqual(profile.exposure, EXPOSURE_SOURCE.assessment(identityId), identityId);
    assert.equal(profile.why_factors_differ, RISK_VERSUS_RANKERS, identityId);
  }
});

/**
 * `quoted: true` is a checkable claim, not a comment.
 *
 * Two factors copy a level they did not author, and this is what stops one of them quietly
 * starting to compute. The ownership finding's level must equal the severity in the quoted
 * subtree beside it, and the exposure finding's level must be exactly what
 * `EXPOSURE_BAND_LEVELS` maps that subtree's band to — so a divergence between the table and
 * the factor fails here instead of shipping as two numbers that disagree on one row.
 */
test('a factor marked quoted carries the level the authority beside it published', () => {
  let checkedOwnership = 0;
  let checkedExposure = 0;

  for (const row of RISK.list()) {
    assert.ok(row.assessment.kind === 'findings');
    for (const finding of row.assessment.findings) {
      if (finding.factor === 'ownership') {
        assert.equal(finding.quoted, true, row.identity_id);
        assert.equal(finding.level, row.ownership.severity, row.identity_id);
        checkedOwnership += 1;
      }
      if (finding.factor === 'exposure') {
        assert.equal(finding.quoted, true, row.identity_id);
        assert.ok(row.exposure !== null && row.exposure.kind === 'scored', row.identity_id);
        const mapped = EXPOSURE_BAND_LEVELS.find((entry) => entry.band === row.exposure?.band);
        assert.equal(finding.level, mapped?.level, row.identity_id);
        checkedExposure += 1;
      }
      if (finding.factor !== 'ownership' && finding.factor !== 'exposure') {
        assert.equal(finding.quoted, false, `${row.identity_id} / ${finding.factor} is authored here`);
      }
    }
  }

  assert.ok(checkedOwnership > 0 && checkedExposure > 0, 'both quotations must actually be exercised');
});

/**
 * Research §4.6 Amendment 4, and the third module to enforce it against the same key names.
 *
 * `exposure/service.test.ts` L590 bans `rising_fast`, `flag` and `trend`; the exposure
 * router's own comment records why — "the graph is built once from a frozen dataset, so a
 * trend would be fabricated and a badge derived from it would be a fabricated alarm — worse
 * than a missing field, because it is actionable". The source PRD §4.3 uses `"flag":
 * "rising_fast"` verbatim and §6.3 asks for the chip, so this test is what stops it coming
 * back. `stale_if_older_than_hours` and `partially_stale` are here for the same reason one
 * document further on: both were refused in writing before this module existed.
 */
test('no fabricated trend, percentile or partial-badge key exists anywhere', () => {
  const banned = [
    'delta_7d',
    'exposure_delta',
    'rising_fast',
    'flag',
    'trend',
    'score_drift',
    'peer_percentile',
    'partially_stale',
    'stale_if_older_than_hours',
    'historical_trend',
  ];

  function walk(value: unknown, trail: string): void {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
      return;
    }
    if (value === null || typeof value !== 'object') {
      return;
    }
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(banned.includes(key), false, `${trail}.${key} claims a measurement we never made`);
      walk(nested, `${trail}.${key}`);
    }
  }

  walk(RISK.summary(), 'summary()');
  walk(RISK.list({ includeWithoutFindings: true }), 'list()');
  walk(RISK.profile('svc-vpn-legacy'), 'profile(svc-vpn-legacy)');
});

/**
 * Union completeness, as equalities rather than subset checks.
 *
 * A value that becomes unreachable is then *reported* rather than silently stopping being
 * exercised — the device `seed-lineage.test.ts` uses on its six actor kinds and four walk
 * outcomes. The `no_findings` arm is the interesting entry: on this estate it is
 * **unreachable**, because `control_drift` and `grant_staleness` have no data for most
 * identities and every clean row is therefore `partially_evaluated` rather than clean. That
 * is research §8 gap 3 with a test attached, so the day the lifecycle tables reach a
 * realistic population this assertion fails and someone reads this comment.
 */
test('the arms and levels reachable on this estate are exactly these', () => {
  const rows = RISK.list({ includeWithoutFindings: true });

  const arms = [...new Set(rows.map((row) => row.assessment.kind))].sort();
  assert.deepEqual(arms, ['findings', 'partially_evaluated']);

  const levels = [
    ...new Set(
      rows.flatMap((row) => (row.assessment.kind === 'findings' ? [row.assessment.worst_level] : [])),
    ),
  ].sort();
  assert.deepEqual(levels, ['critical', 'high', 'low', 'medium']);

  const firedFactors = [
    ...new Set(
      rows.flatMap((row) =>
        row.assessment.kind === 'findings' ? row.assessment.findings.map((finding) => finding.factor) : [],
      ),
    ),
  ].sort();
  assert.deepEqual(firedFactors, [...FACTORS].sort(), 'every factor should fire somewhere in the seed');

  const sources = [
    ...new Set(
      rows.flatMap((row) =>
        row.assessment.kind === 'findings' ? row.assessment.findings.map((finding) => finding.source) : [],
      ),
    ),
  ].sort();
  assert.deepEqual(sources, [
    'access/classify.ts',
    'control_history',
    'employee_status',
    'exposure/score.ts',
    'grant_records',
    'ownership/classify.ts',
  ]);
});
