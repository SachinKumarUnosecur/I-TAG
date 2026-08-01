import type { AccessService } from '../access/service.js';
import type { AccessSnapshot } from '../domain/access.js';
import type { ExposureAssessment, ExposureOwnershipContext } from '../domain/exposure.js';
import type { ChokePoint, ImpactAssessment } from '../domain/impact.js';
import type { LineageRow } from '../domain/lineage.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { RiskAssessment } from '../domain/risk.js';
import type {
  ThreatFinding,
  ThreatFindingRow,
  ThreatOutcome,
  ThreatProfile,
  ThreatQuery,
  ThreatRow,
  ThreatStaleness,
  ThreatSummary,
} from '../domain/threat.js';
import { THREAT_VERSUS_RANKERS } from '../domain/threat.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import {
  cellFor,
  DEFAULT_THREAT_MAPPING_RULES,
  impactFor,
  likelihoodFor,
  severityFor,
  type ThreatFindingSeed,
  type ThreatMappingContext,
  type ThreatMappingRule,
} from './mapping.js';
import {
  criticalFindings,
  identitiesWithFindings,
  matrixCounts,
  stageCoverage,
  summarizeThreatFindings,
  totalFindings,
  unavailableSourcesFor,
  unplacedFindingsCount,
} from './summarize.js';

/**
 * Identity Threat Profile — `docs/identity-threat-profile-research.md` §5, §6.
 *
 * The join, and nothing else. Every fact this service reports was produced by Access
 * Discovery, Identity Exposure Map, Blast Radius or Identity Risk Profile and quoted here,
 * never recomputed — the PRD's own non-goal #1 restated as architecture rule 8, a fourth time.
 * `risk/service.ts` was the first module whose main contribution was refusing to rank; this is
 * the second, and it reads that module's own output (`RiskAssessment`) as one of its four
 * inputs rather than duplicating its non-compensatory rollup.
 *
 * **One deliberate deviation from `RiskService`'s shape, named rather than hidden.** PRD §6.4's
 * primary artifact is a *findings* table — "32 findings", one row per translated fact — not an
 * identity table. Every sibling service's `list()` returns one row per identity because that is
 * what their own PRDs' landing tables are. Modelling `list()` the same way here would force a
 * consumer to re-flatten `ThreatRow.assessment.findings` themselves, which is exactly the kind
 * of client-side recomputation `docs/delegation-chain-research.md` §5 identifies as the thing
 * that actually breaks a table view at scale. So `list()` returns `ThreatFindingRow[]` — one row
 * per finding, identity columns inlined — while `profile()` and `summary()` keep the
 * per-identity `ThreatRow` shape every sibling module uses for its drawer and its coverage gate.
 *
 * **Impact and Likelihood are computed once per identity, not once per finding.** PRD §4.2
 * describes Impact as "derived primarily from the finding's underlying resource/identity
 * sensitivity" — but the only resource-sensitivity signal this engine has is
 * `ExposureAssessment`, which is scored per *identity*, not per permission-that-a-specific-
 * finding-mentions. Likelihood is `RiskAssessment`, scored per identity for the same reason.
 * Rather than inventing a per-finding sensitivity this engine does not have, every finding
 * translated for one identity in one call shares that identity's one quoted Impact/Likelihood
 * cell — an honest reflection of what is actually measured, recorded in
 * `docs/identity-threat-profile-research.md` §4 rather than smoothed over in code.
 */

// --- The four narrow ports ---------------------------------------------------

/** Exposure's assessment for one identity, quoted whole — `RiskExposureSource`'s shape. */
export interface ThreatExposureSource {
  assessment(identityId: string): ExposureAssessment | null;
}

/** Ownership's verdict for one identity, quoted whole — `RiskOwnershipSource`'s shape. */
export interface ThreatOwnershipSource {
  context(identityId: string): ExposureOwnershipContext;
}

/**
 * Blast Radius's per-identity propagation, plus the estate's choke-point selection — the one
 * port this module needs two methods on, because Impact's derivation (§4.2) reads both: pivots
 * for Account Spoofing / Exfiltration, and choke-point membership for the escalation bump.
 */
export interface ThreatImpactSource {
  assessment(identityId: string): ImpactAssessment | null;
  /** `ChokePointReport.candidates`, quoted whole. Small (single digits), read once per call. */
  chokePoints(): readonly ChokePoint[];
}

/** Identity Risk Profile's non-compensatory rollup for one identity, quoted whole. */
export interface ThreatRiskSource {
  assessment(identityId: string): RiskAssessment | null;
}

/** Provisioning Lineage's table row for one identity — `creator_status` et al., quoted whole. */
export interface ThreatLineageSource {
  row(identityId: string): LineageRow | null;
}

export interface ThreatDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  /** The path inventory this module reads and does not re-derive. */
  readonly access: AccessService;
  readonly ownership: ThreatOwnershipSource;
  readonly exposure: ThreatExposureSource;
  readonly impact: ThreatImpactSource;
  readonly risk: ThreatRiskSource;
  readonly lineage: ThreatLineageSource;
  /** Injected so a caller can pin the registry; defaults to the frozen rule set. */
  readonly rules?: readonly ThreatMappingRule[];
}

export interface ThreatService {
  /** PRD §6.4's findings table — one row per finding (see this file's header). */
  list(query?: ThreatQuery): readonly ThreatFindingRow[];
  /** PRD's per-identity drawer, reached from the table's Identity column. Never throws. */
  profile(identityId: string): ThreatOutcome;
  /**
   * PRD §6.1's KPIs, §6.2's matrix, §6.3's stage cards. Only `app` and `identityType` scope
   * this — the finding-level filters (`stage`, `severity`, `impact`, `likelihood`) belong to
   * `list()`, because a KPI panel with no filter fields of its own (§6.1 has none) should show
   * the whole distribution the matrix and stage cards are themselves the filters into.
   */
  summary(query?: Pick<ThreatQuery, 'app' | 'identityType'>): ThreatSummary;
}

export function createThreatProfileService(deps: ThreatDeps): ThreatService {
  const rules = deps.rules ?? DEFAULT_THREAT_MAPPING_RULES;

  /** Copied from the module that produced the facts, never re-read from the clock. */
  let snapshot: AccessSnapshot | null = null;
  function accessSnapshot(): AccessSnapshot {
    snapshot ??= deps.access.summary().snapshot;
    return snapshot;
  }

  /** Groups excluded, matching every other module (architecture rule 12). */
  function population(graph: IdentityGraph, app: string | undefined): readonly Identity[] {
    const scope = app === undefined ? graph.all : (graph.byApp.get(app) ?? []);
    return scope.filter((identity) => identity.type !== 'group');
  }

  function contextFor(identity: Identity): ThreatMappingContext {
    const accessOutcome = deps.access.profile(identity.id);
    return {
      identity,
      access: accessOutcome.ok ? accessOutcome.profile : null,
      exposure: deps.exposure.assessment(identity.id),
      impact: deps.impact.assessment(identity.id),
      chokePoints: deps.impact.chokePoints(),
      risk: deps.risk.assessment(identity.id),
      lineage: deps.lineage.row(identity.id),
    };
  }

  function isChokePointHolder(ctx: ThreatMappingContext): boolean {
    return ctx.chokePoints.some((candidate) => candidate.held_by.includes(ctx.identity.id));
  }

  /**
   * Runs the registry in order (rule 3) and stamps every seed with this identity's one
   * Impact/Likelihood cell and one severity — see this file's header for why those three
   * values are identity-level rather than per-finding.
   */
  function findingsFor(ctx: ThreatMappingContext): readonly ThreatFinding[] {
    const seeds: ThreatFindingSeed[] = [];
    for (const rule of rules) {
      if (rule.applies(ctx)) {
        seeds.push(...rule.evaluate(ctx));
      }
    }
    if (seeds.length === 0) {
      return [];
    }

    const impact = impactFor(ctx.exposure, isChokePointHolder(ctx));
    const likelihood = likelihoodFor(ctx.risk);
    const cell = cellFor(impact, likelihood);
    const severity = severityFor(ctx.risk, ctx.exposure);

    return Object.freeze(
      seeds.map((seed): ThreatFinding => ({
        finding_id: `threat:${ctx.identity.id}:${seed.ptrace_stage}:${seed.source_ref}`,
        identity_id: ctx.identity.id,
        ptrace_stage: seed.ptrace_stage,
        mitre_tactic: seed.mitre_tactic,
        mitre_technique: seed.mitre_technique,
        evidence: seed.evidence,
        source: seed.source,
        source_ref: seed.source_ref,
        severity,
        cell,
      })),
    );
  }

  function stalenessFor(): ThreatStaleness {
    return {
      based_on_access_discovery_snapshot: accessSnapshot().graph_snapshot_at,
      computed_at: deps.clock.now().toISOString(),
    };
  }

  function subjectFor(identity: Identity): ThreatRow {
    const ctx = contextFor(identity);
    const findings = findingsFor(ctx);
    const unavailable = unavailableSourcesFor(ctx.access, ctx.exposure, ctx.risk);
    return {
      identity_id: identity.id,
      name: identity.name,
      identity_type: identity.type,
      app: identity.app,
      assessment: summarizeThreatFindings(findings, unavailable),
      ownership: deps.ownership.context(identity.id),
      exposure: ctx.exposure,
      impact: ctx.impact,
      risk: ctx.risk,
      why_factors_differ: THREAT_VERSUS_RANKERS,
      staleness: stalenessFor(),
    };
  }

  function matchesFinding(finding: ThreatFinding, query: ThreatQuery): boolean {
    if (query.stage !== undefined && finding.ptrace_stage !== query.stage) {
      return false;
    }
    if (query.severity !== undefined && finding.severity !== query.severity) {
      return false;
    }
    if (query.impact !== undefined && finding.cell?.impact !== query.impact) {
      return false;
    }
    if (query.likelihood !== undefined && finding.cell?.likelihood !== query.likelihood) {
      return false;
    }
    return true;
  }

  return {
    list(query = {}) {
      const graph = deps.graphSource.graph();
      const rows: ThreatFindingRow[] = [];

      for (const identity of population(graph, query.app)) {
        if (query.identityType !== undefined && identity.type !== query.identityType) {
          continue;
        }
        const row = subjectFor(identity);
        if (row.assessment.kind !== 'findings') {
          continue;
        }
        for (const finding of row.assessment.findings) {
          if (matchesFinding(finding, query)) {
            rows.push({
              ...finding,
              identity_name: row.name,
              identity_type: row.identity_type,
              app: row.app,
            });
          }
        }
      }

      return Object.freeze(
        [...rows].sort((left, right) => left.finding_id.localeCompare(right.finding_id)),
      );
    },

    profile(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined || identity.type === 'group') {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      const profile: ThreatProfile = subjectFor(identity);
      return { ok: true, profile };
    },

    summary(query = {}) {
      const graph = deps.graphSource.graph();
      const scanned = population(graph, query.app)
        .filter((identity) => query.identityType === undefined || identity.type === query.identityType)
        .map((identity) => subjectFor(identity));

      return {
        // Coverage first, matching `RiskSummary`'s and `ExposureSummary`'s own ordering —
        // the gate publishes before the ranking / KPI numbers it qualifies.
        stage_coverage: stageCoverage(scanned),
        matrix: matrixCounts(scanned),
        unplaced_findings: unplacedFindingsCount(scanned),
        total_findings: totalFindings(scanned),
        critical_findings: criticalFindings(scanned),
        identities_with_findings: identitiesWithFindings(scanned),
        scanned: scanned.length,
      };
    },
  };
}
