import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IdentityAccessProfile } from '../domain/access.js';
import type { ExposureAssessment } from '../domain/exposure.js';
import type { ChokePoint, ImpactAssessment, ImpactDelta } from '../domain/impact.js';
import type { CreatorStatus, LineageRow, Provenance } from '../domain/lineage.js';
import type { RiskAssessment, RiskFinding } from '../domain/risk.js';
import type { PtraceStage } from '../domain/threat.js';
import type { Identity } from '../domain/types.js';
import {
  allCells,
  CHOKE_POINT_RULE,
  CONTROL_DRIFT_RULE,
  CREATOR_LINEAGE_RULE,
  DEFAULT_THREAT_MAPPING_RULES,
  EXPOSURE_REALIZED_RULE,
  HOP_ACCESS_RULE,
  impactFor,
  likelihoodFor,
  PIVOT_RULE,
  PTRACE_REFERENCE,
  severityFor,
  type ThreatMappingContext,
} from './mapping.js';

/**
 * The mapping table and its rules, against hand-built contexts — `docs/identity-risk-profile-
 * research.md`'s own split, applied here: `service.test.ts` pins the seed's numbers,
 * this file pins the *rules*, so a threshold change and a seed change fail in different files.
 */

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

function accessProfile(overrides: Partial<IdentityAccessProfile> = {}): IdentityAccessProfile {
  return {
    identity_id: 'subject',
    name: 'subject',
    identity_type: 'service_account',
    app: 'fx',
    counts: { direct: 0, indirect: 0, hop: 0 },
    reachable_permissions: [],
    sensitive_permissions: [],
    paths: [],
    hop_summary: null,
    ...overrides,
  };
}

function hopPath() {
  return {
    identity_id: 'subject',
    app: 'fx',
    identity_type: 'service_account' as const,
    permission: 'aws:account-root',
    sensitive: true,
    hop_count: 3,
    chain: [],
    path_type: 'hop' as const,
    via_permission: 'ssm:start-session',
    assumed_identity: 'role:ec2-admin-role',
  };
}

function delta(removed: number, baseline: number): ImpactDelta {
  return { baseline, counterfactual: baseline - removed, removed, share_of_baseline: removed / baseline };
}

function chokePoint(overrides: Partial<ChokePoint> = {}): ChokePoint {
  return {
    permission: 'ssm:start-session',
    grants_identity: 'role:ec2-admin-role',
    held_by: ['subject'],
    access_removed: delta(4, 10),
    mechanisms_closed: delta(1, 3),
    closes: 'access',
    affected_identities: [],
    ...overrides,
  };
}

function propagatingImpact(overrides: Partial<Extract<ImpactAssessment, { kind: 'propagates' }>> = {}): ImpactAssessment {
  return {
    kind: 'propagates',
    counts: { direct: 0, indirect: 0, hop: 1 },
    pivots: [
      {
        via_permission: 'ssm:start-session',
        assumed_identity: 'svc:ci-deploy-bot',
        assumed_identity_app: 'fx',
        permissions_reached: ['deploy:prod', 'read:secrets'],
        deepest_hop_count: 4,
      },
    ],
    ...overrides,
  };
}

function scoredExposure(overrides: Partial<Extract<ExposureAssessment, { kind: 'scored' }>> = {}): ExposureAssessment {
  return {
    kind: 'scored',
    exposure_score: 78,
    weighted_sum: 3.2,
    band: 'extensive',
    contributions: [],
    unclassified_permissions: [],
    highest_sensitivity_reached: 'aws:account-root',
    ...overrides,
  };
}

function riskFinding(overrides: Partial<RiskFinding> = {}): RiskFinding {
  return {
    factor: 'control_drift',
    level: 'high',
    evidence: 'MFA disabled 271d ago',
    source: 'control_history',
    quoted: false,
    ...overrides,
  };
}

function findingsAssessment(overrides: Partial<Extract<RiskAssessment, { kind: 'findings' }>> = {}): RiskAssessment {
  return {
    kind: 'findings',
    worst_level: 'high',
    factors_firing: 1,
    findings: [riskFinding()],
    factors_evaluated: ['control_drift'],
    factors_unavailable: [],
    ...overrides,
  };
}

function lineageRow(overrides: Partial<LineageRow> = {}): LineageRow {
  const provenance: Provenance = { state: 'unexplained' };
  return {
    identity_id: 'subject',
    name: 'subject',
    identity_type: 'service_account',
    app: 'fx',
    created_by: null,
    generation: 0,
    root_id: 'subject',
    root_kind: 'no_creator_recorded',
    fan_out: 0,
    fan_out_in_app: 0,
    created_at: null,
    revoked: false,
    provenance,
    creator_status: 'active' as CreatorStatus,
    self_authorized: false,
    creator_privilege_mismatch: false,
    fan_out_exceeds_baseline: false,
    ...overrides,
  };
}

function context(overrides: Partial<ThreatMappingContext> = {}): ThreatMappingContext {
  return {
    identity: identity(),
    access: null,
    exposure: null,
    impact: null,
    chokePoints: [],
    risk: null,
    lineage: null,
    ...overrides,
  };
}

// --- Reachability: every stage but Probing fires on a realistic context ----

test('PTRACE_REFERENCE names all six stages, in attack-sequence order', () => {
  const stages = PTRACE_REFERENCE.map((entry) => entry.stage);
  assert.deepEqual(stages, [
    'probing',
    'trust_exploitation',
    'rights_escalation',
    'account_spoofing',
    'concealment_persistence',
    'exfiltration_lateral_movement',
  ]);
});

test('no rule in the default registry ever emits a Probing finding', () => {
  const ctx = context({
    access: accessProfile({ paths: [hopPath()] }),
    exposure: scoredExposure(),
    impact: propagatingImpact(),
    chokePoints: [chokePoint()],
    risk: findingsAssessment({ factors_firing: 4, worst_level: 'critical' }),
    lineage: lineageRow({ creator_status: 'departed', self_authorized: true }),
  });
  const stages = new Set<PtraceStage>();
  for (const rule of DEFAULT_THREAT_MAPPING_RULES) {
    if (rule.applies(ctx)) {
      for (const seed of rule.evaluate(ctx)) {
        stages.add(seed.ptrace_stage);
      }
    }
  }
  assert.equal(stages.has('probing'), false);
  // And every other stage *is* reachable from one realistic, fully-populated context —
  // the registry's collective coverage, independent of any one seed identity.
  assert.deepEqual(
    [...stages].sort(),
    [
      'account_spoofing',
      'concealment_persistence',
      'exfiltration_lateral_movement',
      'rights_escalation',
      'trust_exploitation',
    ],
  );
});

// --- HOP_ACCESS_RULE ---------------------------------------------------------

test('a hop path unconditionally fires Rights Escalation and Trust Exploitation', () => {
  const ctx = context({ access: accessProfile({ paths: [hopPath()] }) });
  assert.ok(HOP_ACCESS_RULE.applies(ctx));
  const seeds = HOP_ACCESS_RULE.evaluate(ctx);
  assert.deepEqual(seeds.map((s) => s.ptrace_stage).sort(), ['rights_escalation', 'trust_exploitation']);
});

test('a hop path only fires Exfiltration & Lateral Movement when Blast Radius already pivots through it', () => {
  const withoutPivot = context({ access: accessProfile({ paths: [hopPath()] }) });
  assert.equal(
    HOP_ACCESS_RULE.evaluate(withoutPivot).some((s) => s.ptrace_stage === 'exfiltration_lateral_movement'),
    false,
  );

  const withPivot = context({
    access: accessProfile({ paths: [hopPath()] }),
    impact: propagatingImpact(),
  });
  assert.equal(
    HOP_ACCESS_RULE.evaluate(withPivot).some((s) => s.ptrace_stage === 'exfiltration_lateral_movement'),
    true,
  );
});

test('no hop path means the rule does not apply', () => {
  const ctx = context({ access: accessProfile({ paths: [] }) });
  assert.equal(HOP_ACCESS_RULE.applies(ctx), false);
  assert.deepEqual(HOP_ACCESS_RULE.evaluate(ctx), []);
});

// --- CHOKE_POINT_RULE ---------------------------------------------------------

test('a directly-held choke point that is not already the reported hop fires Rights Escalation', () => {
  const ctx = context({
    access: accessProfile({ paths: [] }),
    chokePoints: [chokePoint({ permission: 'admin:break-glass', held_by: ['subject'] })],
  });
  assert.ok(CHOKE_POINT_RULE.applies(ctx));
  const seeds = CHOKE_POINT_RULE.evaluate(ctx);
  assert.equal(seeds.length, 1);
  assert.equal(seeds[0]?.ptrace_stage, 'rights_escalation');
});

test('a choke point that is the same hop already reported by HOP_ACCESS_RULE is not double-counted', () => {
  const ctx = context({
    access: accessProfile({ paths: [hopPath()] }),
    chokePoints: [chokePoint({ permission: 'ssm:start-session', held_by: ['subject'] })],
  });
  assert.deepEqual(CHOKE_POINT_RULE.evaluate(ctx), []);
});

// --- PIVOT_RULE ---------------------------------------------------------------

test('a pivot fires both Account Spoofing and Exfiltration & Lateral Movement', () => {
  const ctx = context({ impact: propagatingImpact() });
  assert.ok(PIVOT_RULE.applies(ctx));
  const stages = PIVOT_RULE.evaluate(ctx).map((s) => s.ptrace_stage).sort();
  assert.deepEqual(stages, ['account_spoofing', 'exfiltration_lateral_movement']);
});

// --- EXPOSURE_REALIZED_RULE ---------------------------------------------------

test('an extensive exposure band with a reached sensitive resource fires Exfiltration & Lateral Movement', () => {
  const ctx = context({ exposure: scoredExposure() });
  assert.ok(EXPOSURE_REALIZED_RULE.applies(ctx));
});

test('a minimal exposure band does not fire', () => {
  const ctx = context({ exposure: scoredExposure({ band: 'minimal', highest_sensitivity_reached: null }) });
  assert.equal(EXPOSURE_REALIZED_RULE.applies(ctx), false);
});

// --- CONTROL_DRIFT_RULE -------------------------------------------------------

test('a quoted control_drift risk finding fires Trust Exploitation with the same evidence string', () => {
  const finding = riskFinding({ evidence: 'MFA disabled 271d ago and a temporary exception still live after 167d' });
  const ctx = context({ risk: findingsAssessment({ findings: [finding] }) });
  assert.ok(CONTROL_DRIFT_RULE.applies(ctx));
  const [seed] = CONTROL_DRIFT_RULE.evaluate(ctx);
  assert.equal(seed?.evidence, finding.evidence);
});

// --- CREATOR_LINEAGE_RULE ------------------------------------------------------

test('a departed creator fires Concealment & Persistence', () => {
  const ctx = context({ lineage: lineageRow({ creator_status: 'departed' }) });
  assert.ok(CREATOR_LINEAGE_RULE.applies(ctx));
});

test('an active, non-mismatched, non-self-authorized creator does not fire', () => {
  const ctx = context({ lineage: lineageRow() });
  assert.equal(CREATOR_LINEAGE_RULE.applies(ctx), false);
});

// --- Impact / Likelihood / cell lookups --------------------------------------

test('impactFor escalates one band on a choke-point holder, capped at very_high', () => {
  assert.equal(impactFor(scoredExposure({ band: 'extensive' }), false), 'high');
  assert.equal(impactFor(scoredExposure({ band: 'extensive' }), true), 'very_high');
  assert.equal(impactFor(scoredExposure({ band: 'minimal' }), true), 'low');
});

test('impactFor is null exactly when exposure has no classified permissions, and very_low on no_paths', () => {
  assert.equal(impactFor({ kind: 'no_classified_permissions', unclassified_permissions: ['x'] }, false), null);
  assert.equal(impactFor({ kind: 'no_paths' }, false), 'very_low');
  assert.equal(impactFor(null, false), null);
});

test('likelihoodFor bumps one band once three or more factors fire, capped at very_high', () => {
  assert.equal(likelihoodFor(findingsAssessment({ worst_level: 'medium', factors_firing: 1 })), 'moderate');
  assert.equal(likelihoodFor(findingsAssessment({ worst_level: 'medium', factors_firing: 3 })), 'high');
  assert.equal(likelihoodFor(findingsAssessment({ worst_level: 'critical', factors_firing: 4 })), 'very_high');
});

test('likelihoodFor is null exactly when risk is partially evaluated, and very_low on no_findings', () => {
  assert.equal(likelihoodFor({ kind: 'partially_evaluated', factors_unavailable: ['control_drift'] } as RiskAssessment), null);
  assert.equal(likelihoodFor({ kind: 'no_findings', factors_evaluated: [] } as unknown as RiskAssessment), 'very_low');
  assert.equal(likelihoodFor(null), null);
});

test('severityFor prefers the quoted risk worst_level over exposure band', () => {
  assert.equal(severityFor(findingsAssessment({ worst_level: 'critical' }), scoredExposure({ band: 'minimal' })), 'critical');
});

test('severityFor falls back to exposure band when risk has no findings arm', () => {
  assert.equal(severityFor({ kind: 'no_findings', factors_evaluated: [] } as unknown as RiskAssessment, scoredExposure({ band: 'extensive' })), 'high');
  assert.equal(severityFor(null, scoredExposure({ band: 'substantial' })), 'medium');
});

test('severityFor defaults to low when neither risk nor exposure backs it', () => {
  assert.equal(severityFor(null, null), 'low');
});

test('allCells() publishes exactly 25 rows spanning all five levels on both axes', () => {
  const cells = allCells();
  assert.equal(cells.length, 25);
  const impacts = new Set(cells.map((c) => c.impact));
  const likelihoods = new Set(cells.map((c) => c.likelihood));
  assert.equal(impacts.size, 5);
  assert.equal(likelihoods.size, 5);
});

test('the worst cell (very_high impact, very_high likelihood) is catastrophic, matching the PRD worked example', () => {
  const worst = allCells().find((c) => c.impact === 'very_high' && c.likelihood === 'very_high');
  assert.equal(worst?.band, 'catastrophic');
});

test('the best cell (very_low impact, very_low likelihood) is desirable', () => {
  const best = allCells().find((c) => c.impact === 'very_low' && c.likelihood === 'very_low');
  assert.equal(best?.band, 'desirable');
});
