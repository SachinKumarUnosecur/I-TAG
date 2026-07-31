import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RiskAssessment, RiskFactorName, RiskFinding, RiskFindingLevel } from '../domain/risk.js';
import {
  compareAssessments,
  factorsFiringIn,
  levelCounts,
  riskLevelsHighToLow,
  summarize,
  worstLevelOf,
  type FactorRun,
} from './summarize.js';

/**
 * The rollup alone — `docs/identity-risk-profile-research.md` §5 steps 2 and 3.
 *
 * The most important test in this file is the dilution counterexample, because it is the
 * reason the module has this shape rather than the PRD's. Everything else here holds the
 * three arms apart, which is the property research §3.5 found nobody in the category
 * ships.
 */

// --- Fixtures ---------------------------------------------------------------

function finding(factor: RiskFactorName, level: RiskFindingLevel): RiskFinding {
  return { factor, level, evidence: `${factor} fired at ${level}`, source: 'control_history', quoted: false };
}

function run(overrides: Partial<FactorRun> = {}): FactorRun {
  return { findings: [], evaluated: [], unavailable: [], ...overrides };
}

// --- The counterexample the module exists for -------------------------------

/**
 * Research §1.3, as an executable assertion.
 *
 * One `critical` finding must outrank five mediocre ones. Under the source PRD's weighted
 * sum these two identities scored 29 and 28 — the identity holding a live administrative
 * hop path one point above the identity that was merely unremarkable everywhere — because
 * additive aggregation implies full compensability. Here the ordering is not close, and it
 * cannot be made close by retuning anything, because there is nothing to tune.
 */
test('one critical finding outranks five mediocre ones (research §1.3)', () => {
  const oneCritical = summarize(run({ findings: [finding('hop_access', 'critical')], evaluated: ['hop_access'] }));
  const fiveMediocre = summarize(
    run({
      findings: [
        finding('exposure', 'medium'),
        finding('ownership', 'low'),
        finding('control_drift', 'medium'),
        finding('grant_staleness', 'medium'),
        finding('review_staleness', 'medium'),
      ],
      evaluated: ['exposure', 'ownership', 'control_drift', 'grant_staleness', 'review_staleness'],
    }),
  );

  assert.equal(oneCritical.kind, 'findings');
  assert.ok(oneCritical.kind === 'findings');
  assert.equal(oneCritical.worst_level, 'critical');
  assert.equal(oneCritical.factors_firing, 1);

  assert.ok(fiveMediocre.kind === 'findings');
  assert.equal(fiveMediocre.worst_level, 'medium');
  assert.equal(fiveMediocre.factors_firing, 5);

  // The count leads, so the five-factor row sorts first — and the critical is still
  // visible as a critical rather than averaged into a middling number.
  assert.ok(compareAssessments(fiveMediocre, oneCritical, 'many', 'one') < 0);
  assert.equal(oneCritical.worst_level, 'critical');
  assert.notEqual(fiveMediocre.worst_level, 'critical');
});

/**
 * The other half of non-compensation: a mediocre finding cannot dilute a bad one.
 *
 * Two identities at the same factor count, one carrying a `critical`. The one with the
 * critical must sort first, which is the property a weighted mean loses the moment the
 * other factors outvote it — FIRST calls building that arrangement "Score Laundering".
 */
test('at an equal factor count the worst level breaks the tie, and is never averaged away', () => {
  const withCritical = summarize(
    run({ findings: [finding('ownership', 'critical'), finding('exposure', 'low')], evaluated: [] }),
  );
  const withoutCritical = summarize(
    run({ findings: [finding('ownership', 'high'), finding('exposure', 'high')], evaluated: [] }),
  );

  assert.ok(withCritical.kind === 'findings' && withoutCritical.kind === 'findings');
  assert.equal(withCritical.factors_firing, withoutCritical.factors_firing);
  assert.equal(withCritical.worst_level, 'critical');
  assert.ok(compareAssessments(withCritical, withoutCritical, 'a', 'b') < 0);
});

// --- The three arms ---------------------------------------------------------

/**
 * An equality over the arms, so a fourth one fails here the day it lands.
 *
 * The middle case is the differentiator: nothing fired *and* something was not looked at.
 * Research §3.5 checked six products and found none that carries this on the identity
 * itself — Defender for Cloud's `Not evaluated` scores a recommendation, Entra's `hidden`
 * means licence-gated, Okta has no null tier — and §4.5 rules out the source PRD's
 * "Partial" badge because a badge beside a value still lets the value sort.
 */
test('the assessment has exactly three arms and the middle one carries no value', () => {
  const withFindings = summarize(
    run({ findings: [finding('ownership', 'high')], evaluated: ['ownership'], unavailable: ['control_drift'] }),
  );
  const partial = summarize(run({ evaluated: ['ownership'], unavailable: ['control_drift', 'grant_staleness'] }));
  const clean = summarize(run({ evaluated: ['ownership', 'exposure', 'hop_access'] }));

  assert.deepEqual([withFindings.kind, partial.kind, clean.kind], [
    'findings',
    'partially_evaluated',
    'no_findings',
  ]);

  // The unassessed row has no level and no count to read, by construction rather than
  // by a filter a consumer might forget to apply.
  assert.equal('worst_level' in partial, false);
  assert.equal('factors_firing' in partial, false);
  assert.equal('worst_level' in clean, false);
  assert.equal('factors_firing' in clean, false);

  assert.ok(partial.kind === 'partially_evaluated');
  assert.deepEqual(partial.factors_unavailable, ['control_drift', 'grant_staleness']);
});

/**
 * "Nothing found" and "nothing found, nothing looked at" must not collapse.
 *
 * The identical findings list produces two different arms depending only on whether a
 * factor was unevaluated. That is architecture rule 9 — absence of data is never a finding
 * — extended to its corollary: absence of data is never a clean bill of health either.
 */
test('an unevaluated factor is what separates unassessed from clean', () => {
  assert.equal(summarize(run({ evaluated: ['exposure'] })).kind, 'no_findings');
  assert.equal(summarize(run({ evaluated: ['exposure'], unavailable: ['control_drift'] })).kind, 'partially_evaluated');
});

/**
 * A row with findings still declares what it could not see, because the count is a floor.
 *
 * `svc-vpn-legacy` fires four of six factors on this estate and the other two have no
 * data. Publishing four without publishing the two would let a reviewer read the count as
 * a total, and research §3.2 is that provider omissions are silent — so the omission has
 * to be on the row, not inferred from the coverage block.
 */
test('a row with findings names its unevaluated factors too', () => {
  const assessment = summarize(
    run({
      findings: [finding('ownership', 'critical'), finding('control_drift', 'critical')],
      evaluated: ['ownership', 'control_drift', 'exposure', 'hop_access'],
      unavailable: ['grant_staleness'],
    }),
  );

  assert.ok(assessment.kind === 'findings');
  assert.equal(assessment.factors_firing, 2);
  assert.deepEqual(assessment.factors_unavailable, ['grant_staleness']);
  assert.deepEqual(assessment.factors_evaluated, ['ownership', 'control_drift', 'exposure', 'hop_access']);
});

// --- The primitives ---------------------------------------------------------

test('worst level is a maximum over the levels present, and null when nothing fired', () => {
  assert.equal(worstLevelOf([]), null);
  assert.equal(worstLevelOf([finding('exposure', 'low')]), 'low');
  assert.equal(
    worstLevelOf([finding('exposure', 'medium'), finding('ownership', 'critical'), finding('hop_access', 'high')]),
    'critical',
  );
});

/**
 * The count is of factors, not of findings, so a factor cannot vote twice.
 *
 * A factor emits at most one finding by contract; this is the defence against a future
 * one that forgets. The number is meant to read as "how many independent systems said
 * something", and a duplicated factor would inflate it into an agreement that is not there.
 */
test('factors firing counts distinct factors, not rows', () => {
  assert.equal(factorsFiringIn([]), 0);
  assert.equal(factorsFiringIn([finding('ownership', 'high'), finding('ownership', 'critical')]), 1);
  assert.equal(factorsFiringIn([finding('ownership', 'high'), finding('exposure', 'high')]), 2);
});

test('findings are presented worst level first', () => {
  const assessment = summarize(
    run({
      findings: [
        finding('exposure', 'high'),
        finding('review_staleness', 'medium'),
        finding('ownership', 'critical'),
      ],
    }),
  );

  assert.ok(assessment.kind === 'findings');
  assert.deepEqual(
    assessment.findings.map((entry) => entry.level),
    ['critical', 'high', 'medium'],
  );
});

/**
 * The published level order, and the absence of a fifth bar.
 *
 * `none` is not a `RiskFindingLevel`, so an identity with nothing found is reported by the
 * population counts rather than as a bottom band at zero. That is what stops "most of the
 * estate is low risk" being said about identities nobody assessed.
 */
test('the level distribution covers the four finding levels and nothing else', () => {
  assert.deepEqual(riskLevelsHighToLow(), ['critical', 'high', 'medium', 'low']);

  const assessments: readonly RiskAssessment[] = [
    summarize(run({ findings: [finding('ownership', 'critical')] })),
    summarize(run({ findings: [finding('ownership', 'critical')] })),
    summarize(run({ findings: [finding('exposure', 'medium')] })),
    summarize(run({ evaluated: ['exposure'] })),
    summarize(run({ unavailable: ['control_drift'] })),
  ];

  assert.deepEqual(levelCounts(assessments), [
    { level: 'critical', count: 2 },
    { level: 'high', count: 0 },
    { level: 'medium', count: 1 },
    { level: 'low', count: 0 },
  ]);
});

/**
 * Arm order in the table, and the asymmetry it inherits.
 *
 * Findings, then the unassessed, then the clean. Putting `partially_evaluated` ahead of
 * `no_findings` is the same choice `exposure/service.ts` makes when it orders
 * `no_classified_permissions` ahead of `no_paths`: a coverage gap is work, and a clean
 * result is not.
 */
test('the table orders findings, then the unassessed, then the clean', () => {
  const withFindings = summarize(run({ findings: [finding('ownership', 'low')] }));
  const partial = summarize(run({ unavailable: ['control_drift'] }));
  const clean = summarize(run({ evaluated: ['exposure'] }));

  const rows = [clean, partial, withFindings]
    .map((assessment, index) => ({ assessment, id: `id-${index}` }))
    .sort((left, right) => compareAssessments(left.assessment, right.assessment, left.id, right.id));

  assert.deepEqual(
    rows.map((row) => row.assessment.kind),
    ['findings', 'partially_evaluated', 'no_findings'],
  );
});

test('identities that tie on every rule are ordered by id, so a run is reproducible', () => {
  const same = () => summarize(run({ findings: [finding('ownership', 'high')] }));
  assert.ok(compareAssessments(same(), same(), 'svc-a', 'svc-b') < 0);
  assert.ok(compareAssessments(same(), same(), 'svc-b', 'svc-a') > 0);
});
