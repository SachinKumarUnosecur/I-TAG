import type { AccessPath, IdentityAccessProfile } from '../domain/access.js';
import type { ExposureAssessment, ExposureBand } from '../domain/exposure.js';
import type { ChokePoint } from '../domain/impact.js';
import type { ImpactAssessment } from '../domain/impact.js';
import type { LineageRow } from '../domain/lineage.js';
import type { RiskAssessment, RiskFindingLevel } from '../domain/risk.js';
import type {
  MitreTactic,
  PtraceStage,
  PtraceStageReference,
  ThreatCell,
  ThreatFinding,
  ThreatFindingSource,
  ThreatImpactLevel,
  ThreatLikelihoodLevel,
  ThreatSeverityBand,
} from '../domain/threat.js';
import type { Identity } from '../domain/types.js';

/**
 * The mapping table and translation-rule registry — `docs/identity-threat-profile-research.md`
 * §4, §5. Everything below is a frozen table or a pure function over already-quoted upstream
 * facts (architecture rule 1 holds trivially: nothing here walks a graph). Extending the
 * registry is an append, per architecture rule 3 — a seventh rule is a new array element and a
 * test, never a rewritten `if`/`else` chain.
 */

// --- §3.1's reference table, independent of whether anything fired ---------

/**
 * The static PTRACE↔MITRE reference table, for rendering the six stage cards even when a
 * stage's live finding count is zero. List order is precedence (rule 3) and is also PRD
 * §6.3's card order — the attack-sequence order, not a count-sorted one.
 */
export const PTRACE_REFERENCE: readonly PtraceStageReference[] = Object.freeze([
  Object.freeze({
    stage: 'probing' as const,
    tactics: Object.freeze(['Reconnaissance', 'Discovery'] as const),
    diagnostic_question: 'Is the attacker mapping accounts, groups, or trust relationships before acting?',
  }),
  Object.freeze({
    stage: 'trust_exploitation' as const,
    tactics: Object.freeze(['Initial Access', 'Defense Evasion'] as const),
    diagnostic_question: 'Is a trust relationship being abused rather than a credential?',
  }),
  Object.freeze({
    stage: 'rights_escalation' as const,
    tactics: Object.freeze(['Privilege Escalation', 'Credential Access'] as const),
    diagnostic_question: 'Can this identity get more than it started with?',
  }),
  Object.freeze({
    stage: 'account_spoofing' as const,
    tactics: Object.freeze(['Initial Access', 'Defense Evasion'] as const),
    diagnostic_question: 'Can someone become this identity?',
  }),
  Object.freeze({
    stage: 'concealment_persistence' as const,
    tactics: Object.freeze(['Persistence', 'Defense Evasion'] as const),
    diagnostic_question: 'Can the attacker keep access without being noticed?',
  }),
  Object.freeze({
    stage: 'exfiltration_lateral_movement' as const,
    tactics: Object.freeze(['Collection', 'Exfiltration', 'Lateral Movement', 'Impact'] as const),
    diagnostic_question: 'What can this identity now reach, and what does it enable next?',
  }),
]);

/**
 * Probing has no backing signal in this engine and none is invented — see the research doc §4
 * amendment 1. Access Discovery classifies paths, not enumeration volume; the only fields that
 * could suggest "mapping accounts before acting" are `exposure_delta`/`score_drift`, both
 * refused three times already (`docs/identity-risk-profile-research.md` Amendments 3-4).
 * Exported so `threat/summarize.ts` can report it as a named, zero-coverage stage rather than
 * silently returning 0 the same way a real gap would.
 */
export const PROBING_COVERAGE_GAP =
  'No upstream module in this engine records reconnaissance or enumeration volume, and the ' +
  'PRD-proposed signal (rising risk_score / exposure_score drift) is unbuildable: this engine ' +
  'has refused a delta or percentile on either number three times already, because the graph ' +
  'is built once from a frozen dataset and a trend computed from one snapshot is a fabricated ' +
  'alarm. Probing is reported as a named zero-coverage stage, not a fabricated finding.';

// --- The five-valued NIST-shaped axes, as frozen lookup tables --------------

const IMPACT_ORDER: readonly ThreatImpactLevel[] = Object.freeze([
  'very_low',
  'low',
  'moderate',
  'high',
  'very_high',
]);
const LIKELIHOOD_ORDER: readonly ThreatLikelihoodLevel[] = Object.freeze([
  'very_low',
  'low',
  'moderate',
  'high',
  'very_high',
]);

/** `ExposureAssessment.band` (quoted) → the NIST-shaped impact axis. Research §4.2 step 1. */
const EXPOSURE_BAND_TO_IMPACT: Readonly<Record<ExposureBand, ThreatImpactLevel>> = Object.freeze({
  minimal: 'very_low',
  limited: 'low',
  substantial: 'moderate',
  extensive: 'high',
});

/**
 * `RiskAssessment.worst_level` (quoted) → the NIST-shaped likelihood axis. Research §4.2 step
 * 2. Not `risk_score` and not `peer_percentile` — this engine has neither
 * (`docs/identity-risk-profile-research.md` Amendments 2-3) — so the mapping starts from the
 * same non-compensatory vocabulary `risk/summarize.ts` already publishes.
 */
const RISK_LEVEL_TO_LIKELIHOOD: Readonly<Record<RiskFindingLevel, ThreatLikelihoodLevel>> = Object.freeze({
  low: 'low',
  medium: 'moderate',
  high: 'high',
  critical: 'very_high',
});

/** One step up either axis, capped — never past `very_high`. The "escalated by one band" rule. */
function bump(order: readonly ThreatImpactLevel[] | readonly ThreatLikelihoodLevel[], level: string): string {
  const index = order.indexOf(level as never);
  return order[Math.min(index + 1, order.length - 1)] as string;
}

/**
 * PRD §4.2's Impact derivation: Exposure's band, quoted, escalated one level if the same grant
 * a hop path depends on is also a choke point (a real, already-computed fact from
 * `impact/choke.ts`, not a new score). `null` exactly when Exposure has no verdict to quote —
 * `no_paths` is a real, scored "reaches nothing" answer (`very_low`), while
 * `no_classified_permissions` means nobody has assessed this identity's footprint at all and
 * Impact is honestly unavailable, per architecture rule 9.
 */
export function impactFor(exposure: ExposureAssessment | null, isChokePoint: boolean): ThreatImpactLevel | null {
  if (exposure === null || exposure.kind === 'no_classified_permissions') {
    return null;
  }
  if (exposure.kind === 'no_paths') {
    return 'very_low';
  }
  const base = EXPOSURE_BAND_TO_IMPACT[exposure.band];
  return (isChokePoint ? bump(IMPACT_ORDER, base) : base) as ThreatImpactLevel;
}

/**
 * PRD §4.2's Likelihood derivation: Risk Profile's `worst_level`, quoted, with `factors_firing`
 * (also quoted) breaking ties by bumping one level once three or more independent factors have
 * fired — the same threshold `docs/identity-risk-profile-research.md` §9 uses as "the week's
 * list" boundary, reused here rather than declared fresh. `no_findings` is a real, evaluated
 * "nothing fired" answer (`very_low`); `partially_evaluated` is honestly unavailable.
 */
export function likelihoodFor(risk: RiskAssessment | null): ThreatLikelihoodLevel | null {
  if (risk === null || risk.kind === 'partially_evaluated') {
    return null;
  }
  if (risk.kind === 'no_findings') {
    return 'very_low';
  }
  const base = RISK_LEVEL_TO_LIKELIHOOD[risk.worst_level];
  return (risk.factors_firing >= 3 ? bump(LIKELIHOOD_ORDER, base) : base) as ThreatLikelihoodLevel;
}

/**
 * PRD §6.2's 5×5 legend, as an explicit 25-row lookup rather than arithmetic on the two axis
 * indices — NIST SP 800-30 Rev 1 Table I-2 combines likelihood and impact "by lookup matrix
 * rather than arithmetic" and this engine's own `risk/summarize.ts` header cites the same
 * table for the same reason. Band names are the PRD's own §6.2 vocabulary (Desirable through
 * Catastrophic), not NIST's, because that is this product's already-established output label
 * for the matrix — distinct from the two NIST-shaped axis vocabularies feeding it.
 */
export const SEVERITY_BAND_MATRIX: readonly {
  readonly impact: ThreatImpactLevel;
  readonly likelihood: ThreatLikelihoodLevel;
  readonly band: ThreatSeverityBand;
}[] = Object.freeze(
  [
    ['very_low', 'very_low', 'desirable'],
    ['very_low', 'low', 'desirable'],
    ['very_low', 'moderate', 'desirable'],
    ['very_low', 'high', 'acceptable'],
    ['very_low', 'very_high', 'acceptable'],
    ['low', 'very_low', 'desirable'],
    ['low', 'low', 'acceptable'],
    ['low', 'moderate', 'acceptable'],
    ['low', 'high', 'undesirable'],
    ['low', 'very_high', 'undesirable'],
    ['moderate', 'very_low', 'acceptable'],
    ['moderate', 'low', 'acceptable'],
    ['moderate', 'moderate', 'undesirable'],
    ['moderate', 'high', 'undesirable'],
    ['moderate', 'very_high', 'unacceptable'],
    ['high', 'very_low', 'acceptable'],
    ['high', 'low', 'undesirable'],
    ['high', 'moderate', 'undesirable'],
    ['high', 'high', 'unacceptable'],
    ['high', 'very_high', 'catastrophic'],
    ['very_high', 'very_low', 'undesirable'],
    ['very_high', 'low', 'undesirable'],
    ['very_high', 'moderate', 'unacceptable'],
    ['very_high', 'high', 'catastrophic'],
    ['very_high', 'very_high', 'catastrophic'],
  ] as const,
).map(([impact, likelihood, band]) => Object.freeze({ impact, likelihood, band })) as readonly {
  readonly impact: ThreatImpactLevel;
  readonly likelihood: ThreatLikelihoodLevel;
  readonly band: ThreatSeverityBand;
}[];

/** Every (impact, likelihood) pair, in the matrix's own row-major order — the KPI grid's 25 cells. */
export function allCells(): readonly { readonly impact: ThreatImpactLevel; readonly likelihood: ThreatLikelihoodLevel; readonly band: ThreatSeverityBand }[] {
  return SEVERITY_BAND_MATRIX;
}

function cellFor(impact: ThreatImpactLevel | null, likelihood: ThreatLikelihoodLevel | null): ThreatCell | null {
  if (impact === null || likelihood === null) {
    return null;
  }
  const row = SEVERITY_BAND_MATRIX.find((entry) => entry.impact === impact && entry.likelihood === likelihood);
  return row === undefined ? null : { impact, likelihood, band: row.band };
}

/**
 * §5 step 1's fallback: the finding-table severity chip (PRD §6.4), a four-valued vocabulary
 * borrowed from `RiskFindingLevel` rather than invented. Quoted from `RiskAssessment.worst_level`
 * when Risk Profile has a verdict; when it does not, from Exposure's band by the same table
 * `risk/factors.ts`'s `EXPOSURE_BAND_LEVELS` uses for the identical translation one module
 * earlier (`extensive` → `high`, `substantial` → `medium`); when neither backs it, `low` — the
 * one non-quoted default in this module, used only when a finding was translated from a fact
 * (a pivot, a lineage signal) that neither Exposure nor Risk Profile also verified.
 */
export function severityFor(risk: RiskAssessment | null, exposure: ExposureAssessment | null): ThreatFinding['severity'] {
  if (risk !== null && risk.kind === 'findings') {
    return risk.worst_level;
  }
  if (exposure !== null && exposure.kind === 'scored') {
    if (exposure.band === 'extensive') {
      return 'high';
    }
    if (exposure.band === 'substantial') {
      return 'medium';
    }
  }
  return 'low';
}

// --- The translation context and rule interface -----------------------------

/** Everything a rule may read, assembled once per identity by `threat/service.ts`. */
export interface ThreatMappingContext {
  readonly identity: Identity;
  readonly access: IdentityAccessProfile | null;
  readonly exposure: ExposureAssessment | null;
  readonly impact: ImpactAssessment | null;
  readonly chokePoints: readonly ChokePoint[];
  readonly risk: RiskAssessment | null;
  readonly lineage: LineageRow | null;
}

/** One translated fact, before an id and a cell are stamped on by the service. */
export interface ThreatFindingSeed {
  readonly ptrace_stage: PtraceStage;
  readonly mitre_tactic: MitreTactic;
  readonly mitre_technique: string;
  readonly evidence: string;
  readonly source: ThreatFindingSource;
  readonly source_ref: string;
}

export interface ThreatMappingRule {
  readonly id: string;
  applies(ctx: ThreatMappingContext): boolean;
  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[];
}

// --- Shared helpers ----------------------------------------------------------

type HopPath = Extract<AccessPath, { path_type: 'hop' }>;

function isHop(path: AccessPath): path is HopPath {
  return path.path_type === 'hop';
}

/** Sensitive hops first, then by permission — the same order `risk/factors.ts`'s hop factor uses. */
function worstHop(paths: readonly AccessPath[]): HopPath | undefined {
  const hops = paths.filter(isHop);
  const sensitive = hops.filter((path) => path.sensitive).sort((a, b) => a.permission.localeCompare(b.permission));
  const anyOrder = [...hops].sort((a, b) => a.permission.localeCompare(b.permission));
  return sensitive[0] ?? anyOrder[0];
}

// --- Rule 1 — hop access: Rights Escalation + Trust Exploitation, unconditionally ----

/**
 * The core mechanism the PRD's own worked example is built on (§3.2). Rights Escalation is the
 * hop itself — going from a nominal grant to an assumed principal's whole footprint with no
 * policy naming the identity directly. Trust Exploitation is unconditional on the *same* hop
 * because a hop is, by `domain/access.ts`'s own definition, a resource that "trusts anything
 * that can reach it" — the mechanism is structurally an abused trust relationship, never a
 * stolen credential, so both stages fire from one fact rather than from a second heuristic.
 */
export const HOP_ACCESS_RULE: ThreatMappingRule = Object.freeze({
  id: 'hop_access',

  applies(ctx: ThreatMappingContext) {
    return ctx.access !== null && worstHop(ctx.access.paths) !== undefined;
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    const hop = worstHop(ctx.access?.paths ?? []);
    if (hop === undefined) {
      return [];
    }
    const ref = `access:hop:${hop.via_permission}->${hop.permission}`;
    const seeds: ThreatFindingSeed[] = [
      {
        ptrace_stage: 'rights_escalation',
        mitre_tactic: 'Privilege Escalation',
        mitre_technique: 'T1548.002',
        evidence:
          `${ctx.identity.name} reaches ${hop.permission} by assuming ${hop.assumed_identity} ` +
          `through ${hop.via_permission} — no policy grants it directly or through any group.`,
        source: 'access/classify.ts',
        source_ref: ref,
      },
      {
        ptrace_stage: 'trust_exploitation',
        mitre_tactic: 'Defense Evasion',
        mitre_technique: 'T1550.001',
        evidence:
          `The resource behind ${hop.via_permission} trusts anything that can reach it; ` +
          `${ctx.identity.name}'s grant on it was never intended to imply ${hop.assumed_identity}'s trust.`,
        source: 'access/classify.ts',
        source_ref: ref,
      },
    ];

    // Exfiltration & Lateral Movement, only when Blast Radius's own propagation already
    // established this exact grant as a pivot into a further identity's footprint (research
    // §4.2 — the PRD's worked example's third stage). A real, quoted join, not a heuristic.
    if (ctx.impact !== null && ctx.impact.kind === 'propagates') {
      const pivot = ctx.impact.pivots.find((candidate) => candidate.via_permission === hop.via_permission);
      if (pivot !== undefined) {
        seeds.push({
          ptrace_stage: 'exfiltration_lateral_movement',
          mitre_tactic: 'Lateral Movement',
          mitre_technique: 'T1021',
          evidence:
            `${hop.via_permission} also pivots onward into ${pivot.assumed_identity_app}:` +
            `${pivot.assumed_identity}, reaching ${pivot.permissions_reached.length} further permission(s) — ` +
            `this is the first hop of a lateral-movement chain, not just an escalation endpoint.`,
          source: 'impact/service.ts',
          source_ref: `impact:pivot:${pivot.via_permission}`,
        });
      }
    }

    return seeds;
  },
});

// --- Rule 2 — choke-point node identified: Rights Escalation --------------

/**
 * PRD §4.1 row 4. Distinct from `HOP_ACCESS_RULE` so a chokepoint permission held *directly*
 * (no hop) still surfaces, and deduplicated against it so a hop that is already the chosen
 * `worstHop` and is also a chokepoint is not counted twice for the same stage.
 */
export const CHOKE_POINT_RULE: ThreatMappingRule = Object.freeze({
  id: 'choke_point',

  applies(ctx: ThreatMappingContext) {
    return ctx.chokePoints.some((cp) => cp.held_by.includes(ctx.identity.id));
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    const hop = worstHop(ctx.access?.paths ?? []);
    const already = hop === undefined ? null : hop.via_permission;
    const held = ctx.chokePoints.filter(
      (cp) => cp.held_by.includes(ctx.identity.id) && cp.permission !== already,
    );
    if (held.length === 0) {
      return [];
    }
    const worst = [...held].sort((a, b) => b.access_removed.removed - a.access_removed.removed)[0];
    if (worst === undefined) {
      return [];
    }
    return [
      {
        ptrace_stage: 'rights_escalation',
        mitre_tactic: 'Privilege Escalation',
        mitre_technique: 'T1078',
        evidence:
          `${ctx.identity.name} directly holds ${worst.permission}, which Blast Radius's ` +
          `choke-point selection ranks as removing ${worst.access_removed.removed} of ` +
          `${worst.access_removed.baseline} reachable pairs if revoked — escalation concentrates here.`,
        source: 'impact/choke.ts',
        source_ref: `impact:choke:${worst.permission}`,
      },
    ];
  },
});

// --- Rule 3 — identity-to-identity pivot: Account Spoofing + Exfiltration -----

/**
 * PRD §4.1 row 3. The pivot mechanism functionally lets one identity act as another
 * (Account Spoofing/Assumption) and, because it is a live route into a further footprint, also
 * represents realized lateral reach. One rule, two stages, from one quoted `ImpactAssessment`.
 */
export const PIVOT_RULE: ThreatMappingRule = Object.freeze({
  id: 'identity_pivot',

  applies(ctx: ThreatMappingContext) {
    return ctx.impact !== null && ctx.impact.kind === 'propagates' && ctx.impact.pivots.length > 0;
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    if (ctx.impact === null || ctx.impact.kind !== 'propagates') {
      return [];
    }
    const widest = [...ctx.impact.pivots].sort(
      (a, b) => b.permissions_reached.length - a.permissions_reached.length,
    )[0];
    if (widest === undefined) {
      return [];
    }
    const ref = `impact:pivot:${widest.via_permission}`;
    return [
      {
        ptrace_stage: 'account_spoofing',
        mitre_tactic: 'Initial Access',
        mitre_technique: 'T1078',
        evidence:
          `${widest.via_permission} lets ${ctx.identity.name} assume ${widest.assumed_identity} in ` +
          `${widest.assumed_identity_app} — functionally becoming that identity, with no separate credential.`,
        source: 'impact/service.ts',
        source_ref: ref,
      },
      {
        ptrace_stage: 'exfiltration_lateral_movement',
        mitre_tactic: 'Lateral Movement',
        mitre_technique: 'T1021',
        evidence:
          `Once assumed, ${widest.assumed_identity} reaches ${widest.permissions_reached.length} ` +
          `further permission(s) at chain depth ${widest.deepest_hop_count}.`,
        source: 'impact/service.ts',
        source_ref: ref,
      },
    ];
  },
});

// --- Rule 4 — realized exposure: Exfiltration & Lateral Movement -----------

/**
 * PRD §4.1 row 2. A high-sensitivity resource being reachable *at all* is realized "what can
 * this identity now reach" — Exposure's own scored verdict, quoted, never rescored.
 */
export const EXPOSURE_REALIZED_RULE: ThreatMappingRule = Object.freeze({
  id: 'exposure_realized',

  applies(ctx: ThreatMappingContext) {
    return (
      ctx.exposure !== null &&
      ctx.exposure.kind === 'scored' &&
      (ctx.exposure.band === 'extensive' || ctx.exposure.band === 'substantial') &&
      ctx.exposure.highest_sensitivity_reached !== null
    );
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    if (ctx.exposure === null || ctx.exposure.kind !== 'scored') {
      return [];
    }
    return [
      {
        ptrace_stage: 'exfiltration_lateral_movement',
        mitre_tactic: 'Collection',
        mitre_technique: 'T1530',
        evidence:
          `Exposure band ${ctx.exposure.band} (score ${ctx.exposure.exposure_score}), reaching ` +
          `${ctx.exposure.highest_sensitivity_reached} — a footprint already realized, not hypothetical.`,
        source: 'exposure/score.ts',
        source_ref: `exposure:band:${ctx.exposure.band}`,
      },
    ];
  },
});

// --- Rule 5 — control drift: Trust Exploitation ----------------------------

/**
 * PRD §4.1 row 6 ("no MFA / stale credentials"). Quoted from Risk Profile's own
 * `control_drift` factor (`ITAG.md` §F9), never rescored: a weak or drifted control is itself
 * an abusable trust gap, which is exactly Trust Exploitation's diagnostic question.
 */
export const CONTROL_DRIFT_RULE: ThreatMappingRule = Object.freeze({
  id: 'control_drift',

  applies(ctx: ThreatMappingContext) {
    return (
      ctx.risk !== null &&
      ctx.risk.kind === 'findings' &&
      ctx.risk.findings.some((finding) => finding.factor === 'control_drift')
    );
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    if (ctx.risk === null || ctx.risk.kind !== 'findings') {
      return [];
    }
    const finding = ctx.risk.findings.find((entry) => entry.factor === 'control_drift');
    if (finding === undefined) {
      return [];
    }
    return [
      {
        ptrace_stage: 'trust_exploitation',
        mitre_tactic: 'Defense Evasion',
        mitre_technique: 'T1556',
        evidence: finding.evidence,
        source: 'risk/summarize.ts',
        source_ref: `risk:control_drift:${ctx.identity.id}`,
      },
    ];
  },
});

// --- Rule 6 — creation lineage: Concealment & Persistence ------------------

/**
 * PRD §4.1 row 5, translated from the fields that actually replaced the `flags` array this
 * repo already deleted (`docs/domain/lineage.ts` L421-424): `creator_status`, `self_authorized`,
 * `creator_privilege_mismatch`, `fan_out_exceeds_baseline` — never `orphaned_creator` /
 * `high_fanout` / `deep_chain`, which do not exist in this engine's vocabulary.
 */
export const CREATOR_LINEAGE_RULE: ThreatMappingRule = Object.freeze({
  id: 'creator_lineage',

  applies(ctx: ThreatMappingContext) {
    const row = ctx.lineage;
    return (
      row !== null &&
      (row.creator_status === 'departed' ||
        row.self_authorized ||
        row.creator_privilege_mismatch ||
        row.fan_out_exceeds_baseline)
    );
  },

  evaluate(ctx: ThreatMappingContext): readonly ThreatFindingSeed[] {
    const row = ctx.lineage;
    if (row === null) {
      return [];
    }
    const reasons: string[] = [];
    if (row.creator_status === 'departed') {
      reasons.push('its creator has since departed');
    }
    if (row.self_authorized) {
      reasons.push('the same principal created it and granted its own privilege (AC-2(e))');
    }
    if (row.creator_privilege_mismatch) {
      reasons.push('its creator is itself unowned, dormant or non-production');
    }
    if (row.fan_out_exceeds_baseline) {
      reasons.push("its creator's fan-out rate exceeds its own trailing baseline");
    }
    if (reasons.length === 0) {
      return [];
    }
    return [
      {
        ptrace_stage: 'concealment_persistence',
        mitre_tactic: 'Persistence',
        mitre_technique: 'T1098',
        evidence: `${ctx.identity.name} is access nobody is actively watching: ${reasons.join('; ')}.`,
        source: 'lineage/signals.ts',
        source_ref: `lineage:creator_status:${row.identity_id}`,
      },
    ];
  },
});

/**
 * The frozen registry. List order is precedence (rule 3) — findings render in this order for
 * two identities that fire the same rules, and it is the order `threat/summarize.ts` walks to
 * build `factor_coverage`-style stage counts. No stage is Probing, which is the point: see
 * `PROBING_COVERAGE_GAP`.
 */
export const DEFAULT_THREAT_MAPPING_RULES: readonly ThreatMappingRule[] = Object.freeze([
  HOP_ACCESS_RULE,
  CHOKE_POINT_RULE,
  PIVOT_RULE,
  EXPOSURE_REALIZED_RULE,
  CONTROL_DRIFT_RULE,
  CREATOR_LINEAGE_RULE,
]);

export { cellFor };
