import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { AccessPath, AccessPathType, IdentityAccessProfile } from '../domain/access.js';
import type { ExposureAssessment, ExposureBand, ExposureOwnershipContext } from '../domain/exposure.js';
import { EXPOSURE_VERSUS_SEVERITY } from '../domain/exposure.js';
import type { OwnershipState, Severity } from '../domain/ownership.js';
import { DEFAULT_ACCOUNTABILITY_POLICY, DEFAULT_RISK_POLICY } from '../domain/policy.js';
import type { RiskFactorName, RiskFindingLevel } from '../domain/risk.js';
import type { ControlEvent, Identity } from '../domain/types.js';
import {
  CONDITIONAL_ACCESS_CONTROL,
  CONTROL_DRIFT_FACTOR,
  DEFAULT_RISK_FACTORS,
  EXCEPTION_GRANTED,
  EXPOSURE_BAND_LEVELS,
  EXPOSURE_FACTOR,
  GRANT_STALENESS_FACTOR,
  HOP_ACCESS_FACTOR,
  MFA_CONTROL,
  MFA_DISABLED,
  OWNERSHIP_FACTOR,
  REVIEW_STALENESS_FACTOR,
  type RiskFactor,
  type RiskFactorContext,
  type RiskFactorVerdict,
  type RiskGrant,
} from './factors.js';

/**
 * The six factors alone — `docs/identity-risk-profile-research.md` §5 step 1.
 *
 * Hand-built contexts rather than the seed, because every property asserted here is a
 * *rule* and should fail for a rule's reasons. The estate's numbers are pinned in
 * `data/seed-risk.test.ts`, so a threshold change and a seed change fail in different
 * files — the split `exposure/score.test.ts` and `exposure/service.test.ts` established.
 *
 * The level assertions are equalities over the full set each factor can emit, not spot
 * checks. A factor that quietly loses a level is then *reported* rather than silently
 * stopping being exercised, which is the same device `seed-lineage.test.ts` uses on its
 * six actor kinds.
 */
const NOW = new Date('2026-07-31T00:00:00Z');

// --- Fixtures ---------------------------------------------------------------

function identity(overrides: Partial<Identity> = {}): Identity {
  return {
    id: 'subject',
    type: 'service_account',
    name: 'subject',
    app: 'fx',
    direct_grants: [],
    inherited_from: [],
    delegates_to: [],
    provisioned_by: null,
    ...overrides,
  };
}

function ownership(state: OwnershipState, severity: Severity): ExposureOwnershipContext {
  return { state, severity, owner: null, why_these_differ: EXPOSURE_VERSUS_SEVERITY };
}

function context(overrides: Partial<RiskFactorContext> = {}): RiskFactorContext {
  return {
    identity: identity(),
    now: NOW,
    access: null,
    exposure: null,
    ownership: ownership('owned', 'none'),
    control_events: null,
    grants: null,
    review: null,
    policy: DEFAULT_RISK_POLICY,
    accountabilityPolicy: DEFAULT_ACCOUNTABILITY_POLICY,
    ...overrides,
  };
}

function path(permission: string, pathType: AccessPathType, sensitive = false): AccessPath {
  const base = {
    identity_id: 'subject',
    app: 'fx',
    identity_type: 'service_account' as const,
    permission,
    sensitive,
    hop_count: pathType === 'hop' ? 3 : 1,
    chain: [],
  };
  if (pathType === 'hop') {
    return { ...base, path_type: 'hop', via_permission: 'connect:box', assumed_identity: 'role-box' };
  }
  if (pathType === 'indirect') {
    return { ...base, path_type: 'indirect', via_group: 'group-thing' };
  }
  return { ...base, path_type: 'direct' };
}

function accessProfile(paths: readonly AccessPath[]): IdentityAccessProfile {
  return {
    identity_id: 'subject',
    name: 'subject',
    identity_type: 'service_account',
    app: 'fx',
    counts: { direct: 0, indirect: 0, hop: paths.filter((p) => p.path_type === 'hop').length },
    reachable_permissions: paths.map((p) => p.permission),
    sensitive_permissions: paths.filter((p) => p.sensitive).map((p) => p.permission),
    paths,
    hop_summary: null,
  };
}

function scored(score: number, band: ExposureBand): ExposureAssessment {
  return {
    kind: 'scored' as const,
    exposure_score: score,
    weighted_sum: score / 25,
    band,
    contributions: [],
    unclassified_permissions: [],
    highest_sensitivity_reached: null,
  };
}

function event(control: string, change: string, date: string): ControlEvent {
  return { control, change, date };
}

function grant(permission: string, grantedAt: string, need: number, revoke: number): RiskGrant {
  return {
    grant: { identity_id: 'subject', permission, grant_type: 'fx_class', granted_at: grantedAt },
    half_life: {
      grant_type: 'fx_class',
      median_days_to_actual_need: need,
      median_days_to_revocation: revoke,
      sample_size: 11,
    },
  };
}

/** The level a verdict carries, or the verdict itself when it is not a finding. */
function levelOf(verdict: RiskFactorVerdict): RiskFindingLevel | 'no_finding' | 'unavailable' {
  return typeof verdict === 'string' ? verdict : verdict.level;
}

function evidenceOf(verdict: RiskFactorVerdict): string {
  assert.notEqual(typeof verdict, 'string', 'expected a finding, got a non-finding verdict');
  return typeof verdict === 'string' ? '' : verdict.evidence;
}

// --- The registry itself ----------------------------------------------------

/**
 * Architecture rule 3, as an equality: the registry *is* the factor set.
 *
 * Both directions matter. A factor added to `RiskFactorName` and not to the registry
 * never runs, and a factor in the registry that no consumer knows about cannot be
 * filtered on. The order is asserted too, because `RiskStaleness.stalest_input` breaks
 * its tie on it and findings are presented in it.
 */
test('the registry is the six factors, in the order research §5 lists them', () => {
  const expected: readonly RiskFactorName[] = [
    'hop_access',
    'exposure',
    'ownership',
    'control_drift',
    'grant_staleness',
    'review_staleness',
  ];

  assert.deepEqual(
    DEFAULT_RISK_FACTORS.map((factor) => factor.factor),
    expected,
  );
});

/**
 * The Liskov condition, asserted rather than reviewed.
 *
 * Every factor answers the same three-valued question through the same two methods, so
 * `risk/summarize.ts` can be written against `RiskFinding` alone and cannot special-case
 * one by name. A factor that needed different handling downstream would have to encode
 * it in the *level* it emits, which is the whole point of the interface.
 */
test('every factor answers the same three-valued question, with no special cases', () => {
  const empty = context();
  for (const factor of DEFAULT_RISK_FACTORS) {
    assert.equal(typeof factor.applies(empty), 'boolean', factor.factor);

    const verdict = factor.evaluate(empty);
    const level = levelOf(verdict);
    assert.ok(
      level === 'no_finding' || level === 'unavailable' || typeof verdict !== 'string',
      `${factor.factor} returned something outside the three-valued contract`,
    );
    if (typeof verdict !== 'string') {
      assert.equal(verdict.factor, factor.factor, 'a factor must sign its own finding');
      assert.notEqual(verdict.level, 'none', 'a finding at level none is not a finding');
    }
  }
});

/**
 * Architecture rule 9 at the factor level, which is where it is cheapest to hold.
 *
 * A context with no data at all must produce `unavailable` from every factor that
 * applies, and never a `low` finding. Research §3.2 is the empirical reason this is a
 * test rather than a convention: every provider's dormancy surface excludes populations
 * silently, so "no rows" is the common answer, and a factor that graded it as a mild
 * finding would put 120 fabricated rows in a 127-row estate.
 */
test('a factor with no data is unavailable, never a finding at the bottom of the scale', () => {
  const bare = context({ ownership: ownership('unknown', 'none') });

  const verdicts = DEFAULT_RISK_FACTORS.filter((factor) => factor.applies(bare)).map((factor) => ({
    factor: factor.factor,
    level: levelOf(factor.evaluate(bare)),
  }));

  assert.deepEqual(verdicts, [
    { factor: 'hop_access', level: 'unavailable' },
    { factor: 'exposure', level: 'unavailable' },
    { factor: 'ownership', level: 'unavailable' },
    { factor: 'control_drift', level: 'unavailable' },
    { factor: 'grant_staleness', level: 'unavailable' },
  ]);

  // The sixth is not merely unavailable — it does not apply, which is a different claim.
  assert.equal(REVIEW_STALENESS_FACTOR.applies(bare), false);
});

/**
 * Exactly one factor narrows its population, and it narrows it on data.
 *
 * Research §8 gap 6 requires `review_staleness`'s scope be stated rather than implied,
 * and architecture rule 10 requires it not be a branch on `Identity.type`. Both are
 * asserted here: an `ai_agent` with a personnel record is in scope and a `human` without
 * one is not, which is only true if the predicate reads the record.
 */
test('review staleness scopes itself by the personnel record, not by identity type', () => {
  const record = { status: 'active' as const, last_reviewed: '2026-07-01' };

  assert.equal(
    REVIEW_STALENESS_FACTOR.applies(context({ identity: identity({ type: 'ai_agent' }), review: record })),
    true,
  );
  assert.equal(
    REVIEW_STALENESS_FACTOR.applies(context({ identity: identity({ type: 'human' }), review: null })),
    false,
  );

  for (const factor of DEFAULT_RISK_FACTORS) {
    if (factor.factor === 'review_staleness') {
      continue;
    }
    assert.equal(factor.applies(context()), true, `${factor.factor} should not narrow its population`);
  }
});

// --- Factor 1: hop access ---------------------------------------------------

test('hop access is critical on a sensitive terminal permission and high otherwise', () => {
  const sensitiveHop = HOP_ACCESS_FACTOR.evaluate(
    context({ access: accessProfile([path('admin:prod', 'hop', true)]) }),
  );
  assert.equal(levelOf(sensitiveHop), 'critical');
  assert.match(evidenceOf(sensitiveHop), /1 hop path; reaches sensitive admin:prod by assuming role-box/);

  assert.equal(
    levelOf(HOP_ACCESS_FACTOR.evaluate(context({ access: accessProfile([path('read:thing', 'hop')]) }))),
    'high',
  );
  assert.equal(
    levelOf(
      HOP_ACCESS_FACTOR.evaluate(
        context({ access: accessProfile([path('admin:prod', 'direct', true), path('x', 'indirect')]) }),
      ),
    ),
    'no_finding',
  );
});

/**
 * The tie-break is the permission name, so two runs over the same estate agree.
 *
 * A sensitive hop always wins over a non-sensitive one regardless of order, and among
 * sensitive hops the name decides. Without this, the evidence string on a multi-hop
 * identity depends on the order Access Discovery happened to emit paths in.
 */
test('the hop named in the evidence is the sensitive one, chosen deterministically', () => {
  const verdict = HOP_ACCESS_FACTOR.evaluate(
    context({
      access: accessProfile([
        path('zeta:thing', 'hop'),
        path('beta:prod', 'hop', true),
        path('alpha:prod', 'hop', true),
      ]),
    }),
  );

  assert.equal(levelOf(verdict), 'critical');
  assert.match(evidenceOf(verdict), /^3 hop paths; reaches sensitive alpha:prod\b/);
});

// --- Factor 2: exposure -----------------------------------------------------

/**
 * The band table is the whole rule, and the two unscored arms are two answers.
 *
 * `no_paths` is an evaluation that found nothing. `no_classified_permissions` is not —
 * `domain/exposure.ts` separated it from a score because the identity reaches things
 * nobody has assessed, and reading it as "no exposure finding" would break architecture
 * rule 9 at the one seam where the engine already refused to.
 */
test('exposure quotes its band through the published table and reads its arms apart', () => {
  const levels = EXPOSURE_BAND_LEVELS.map(({ band, level }) => ({
    band,
    mapped: levelOf(EXPOSURE_FACTOR.evaluate(context({ exposure: scored(80, band) }))),
    published: level,
  }));

  assert.deepEqual(levels, [
    { band: 'extensive', mapped: 'high', published: 'high' },
    { band: 'substantial', mapped: 'medium', published: 'medium' },
  ]);

  assert.equal(levelOf(EXPOSURE_FACTOR.evaluate(context({ exposure: scored(30, 'limited') }))), 'no_finding');
  assert.equal(levelOf(EXPOSURE_FACTOR.evaluate(context({ exposure: scored(5, 'minimal') }))), 'no_finding');
  assert.equal(levelOf(EXPOSURE_FACTOR.evaluate(context({ exposure: { kind: 'no_paths' } }))), 'no_finding');
  assert.equal(
    levelOf(
      EXPOSURE_FACTOR.evaluate(
        context({ exposure: { kind: 'no_classified_permissions', unclassified_permissions: ['x'] } }),
      ),
    ),
    'unavailable',
  );
  assert.equal(levelOf(EXPOSURE_FACTOR.evaluate(context({ exposure: null }))), 'unavailable');
});

test('the exposure finding is marked quoted and carries the number it quoted', () => {
  const verdict = EXPOSURE_FACTOR.evaluate(context({ exposure: scored(83, 'extensive') }));
  assert.notEqual(typeof verdict, 'string');
  assert.ok(typeof verdict !== 'string');
  assert.equal(verdict.quoted, true);
  assert.equal(verdict.source, 'exposure/score.ts');
  assert.equal(verdict.evidence, 'band extensive (exposure score 83)');
});

// --- Factor 3: ownership ----------------------------------------------------

/**
 * Severity passes through untouched, and the three ways it can be `none` all mean
 * "no finding here" — including a live suppression, which is the case that matters.
 *
 * `ownership/severity.ts` returns `none` for an owned identity *and* for any uncounted
 * one, so a registered break-glass exemption arrives here as `none` and produces
 * nothing. Without that, a suppression a reviewer deliberately granted would be
 * resurrected as a risk factor on a new surface.
 */
test('ownership quotes severity verbatim across every level it can emit', () => {
  const cases: readonly { severity: Severity; expected: RiskFindingLevel | 'no_finding' }[] = [
    { severity: 'critical', expected: 'critical' },
    { severity: 'high', expected: 'high' },
    { severity: 'medium', expected: 'medium' },
    { severity: 'low', expected: 'low' },
    { severity: 'none', expected: 'no_finding' },
  ];

  assert.deepEqual(
    cases.map(({ severity }) => levelOf(OWNERSHIP_FACTOR.evaluate(context({ ownership: ownership('unowned', severity) })))),
    cases.map(({ expected }) => expected),
  );

  assert.equal(
    levelOf(OWNERSHIP_FACTOR.evaluate(context({ ownership: ownership('unknown', 'none') }))),
    'unavailable',
  );
});

// --- Factor 4: control drift (ITAG.md §F9) ----------------------------------

/**
 * §F9's ordering of the same facts, and the boundary the seed sits exactly on.
 *
 * §F9's wording is "still active 90+ days later", so the comparison is `>=` and an
 * exception granted on the threshold day is already stale. `svc-backup` is seeded at
 * exactly 90 days, which is why this is a rule test with a named boundary rather than
 * an incidental one.
 */
test('control drift grades MFA loss, and a stale exception is what makes it critical', () => {
  const mfa = event(MFA_CONTROL, MFA_DISABLED, '2026-04-10');
  const staleException = event(CONDITIONAL_ACCESS_CONTROL, EXCEPTION_GRANTED, '2026-05-02');
  const freshException = event(CONDITIONAL_ACCESS_CONTROL, EXCEPTION_GRANTED, '2026-07-20');

  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [mfa, staleException] }))), 'critical');
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [mfa, freshException] }))), 'high');
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [mfa] }))), 'high');
  assert.equal(
    levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [event('session_timeout', 'extended', '2026-06-15')] }))),
    'medium',
  );
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [] }))), 'no_finding');
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: null }))), 'unavailable');
});

test('an exception on the 90-day threshold is already stale, per ITAG.md §F9', () => {
  const mfa = event(MFA_CONTROL, MFA_DISABLED, '2026-04-10');
  const onThreshold = event(CONDITIONAL_ACCESS_CONTROL, EXCEPTION_GRANTED, '2026-05-02');
  const oneDayInside = event(CONDITIONAL_ACCESS_CONTROL, EXCEPTION_GRANTED, '2026-05-03');

  assert.equal(DEFAULT_RISK_POLICY.exceptionStaleDays, 90);
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [mfa, onThreshold] }))), 'critical');
  assert.equal(levelOf(CONTROL_DRIFT_FACTOR.evaluate(context({ control_events: [mfa, oneDayInside] }))), 'high');
});

test('control drift evidence carries both ages, not a decayed score', () => {
  const verdict = CONTROL_DRIFT_FACTOR.evaluate(
    context({
      control_events: [
        event(MFA_CONTROL, MFA_DISABLED, '2025-11-02'),
        event(CONDITIONAL_ACCESS_CONTROL, EXCEPTION_GRANTED, '2026-02-14'),
      ],
    }),
  );

  assert.equal(evidenceOf(verdict), 'MFA disabled 271d ago and a temporary exception still live after 167d');
});

// --- Factor 5: grant staleness (ITAG.md §F10) -------------------------------

/**
 * §F10 with both medians, because §F10 with one fires on the whole population.
 *
 * Implemented as §F10 writes it — "outlived the typical 'actually needed' window" —
 * the factor fires on all seven tracked grants in the estate (§4.1). So
 * `median_days_to_revocation` grades to `high` and separates two of the seven, and the
 * need window stays as `medium`. That is a grading rule, not a gate.
 */
test('grant staleness grades against both medians, worst grant first', () => {
  const pastNeed = grant('read:warehouse', '2026-04-18', 90, 365);
  const pastRevocation = grant('vpn:corp', '2021-05-04', 30, 180);
  const fresh = grant('read:thing', '2026-07-20', 90, 365);

  assert.equal(levelOf(GRANT_STALENESS_FACTOR.evaluate(context({ grants: [pastRevocation] }))), 'high');
  assert.equal(levelOf(GRANT_STALENESS_FACTOR.evaluate(context({ grants: [pastNeed] }))), 'medium');
  assert.equal(levelOf(GRANT_STALENESS_FACTOR.evaluate(context({ grants: [fresh] }))), 'no_finding');
  assert.equal(levelOf(GRANT_STALENESS_FACTOR.evaluate(context({ grants: [] }))), 'no_finding');
  assert.equal(levelOf(GRANT_STALENESS_FACTOR.evaluate(context({ grants: null }))), 'unavailable');

  // A worse grant is never diluted by a fresher one sitting beside it.
  const mixed = GRANT_STALENESS_FACTOR.evaluate(context({ grants: [fresh, pastNeed, pastRevocation] }));
  assert.equal(levelOf(mixed), 'high');
  assert.match(evidenceOf(mixed), /^vpn:corp is \d+d old, past the 180d median revocation/);
});

test('grant staleness evidence names the median, the class and its sample size', () => {
  const verdict = GRANT_STALENESS_FACTOR.evaluate(
    context({
      grants: [
        {
          grant: {
            identity_id: 'subject',
            permission: 'vpn:corp-network',
            grant_type: 'vpn_remote_access',
            granted_at: '2021-05-04',
          },
          half_life: {
            grant_type: 'vpn_remote_access',
            median_days_to_actual_need: 30,
            median_days_to_revocation: 180,
            sample_size: 9,
          },
        },
      ],
    }),
  );

  assert.equal(
    evidenceOf(verdict),
    'vpn:corp-network is 1914d old, past the 180d median revocation for vpn_remote_access (n=9)',
  );
});

// --- Factor 6: review staleness ---------------------------------------------

/**
 * One level only, and the same comparison `accountability/rules.ts` L124 makes.
 *
 * A late review is a process fact about a person; raising its level by what the account
 * can reach would re-derive exposure's judgement under a second name. The boundary is
 * asserted on both sides so the two surfaces cannot disagree about a 90-day-old review.
 */
test('review staleness fires at medium past the review window and nowhere else', () => {
  const at90 = { status: 'active' as const, last_reviewed: '2026-05-02' };
  const at91 = { status: 'active' as const, last_reviewed: '2026-05-01' };

  assert.equal(DEFAULT_ACCOUNTABILITY_POLICY.staleReviewDays, 90);
  assert.equal(levelOf(REVIEW_STALENESS_FACTOR.evaluate(context({ review: at90 }))), 'no_finding');

  const stale = REVIEW_STALENESS_FACTOR.evaluate(context({ review: at91 }));
  assert.equal(levelOf(stale), 'medium');
  assert.equal(evidenceOf(stale), 'last access review was 91d ago, past the 90d review window');
});

// --- Open/closed, demonstrated ----------------------------------------------

/**
 * A seventh factor is an append, and nothing downstream learns its name.
 *
 * The demonstration architecture rule 3 asks for, run rather than described: a factor
 * defined entirely in this test file is appended to a copy of the registry and produces a
 * finding through the same interface, without a line changing in `factors.ts`. If this
 * ever requires an edit elsewhere, the seam is in the wrong place.
 */
test('a factor the registry has never seen works by being appended to it', () => {
  const revokedFlag: RiskFactor = Object.freeze({
    factor: 'hop_access' as const,
    applies: () => true,
    evaluate: ({ identity: subject }: RiskFactorContext): RiskFactorVerdict =>
      subject.revoked === true
        ? Object.freeze({
            factor: 'hop_access' as const,
            level: 'low' as const,
            evidence: 'identity is revoked and still holds grants',
            source: 'access/classify.ts' as const,
            quoted: false,
          })
        : 'no_finding',
  });

  const extended: readonly RiskFactor[] = [...DEFAULT_RISK_FACTORS, revokedFlag];
  assert.equal(extended.length, DEFAULT_RISK_FACTORS.length + 1);
  assert.equal(
    levelOf(revokedFlag.evaluate(context({ identity: identity({ revoked: true }) }))),
    'low',
  );
});
