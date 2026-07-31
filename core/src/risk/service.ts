import type { AccessService } from '../access/service.js';
import type { AccessSnapshot } from '../domain/access.js';
import type { ExposureAssessment, ExposureOwnershipContext } from '../domain/exposure.js';
import type { Clock, GraphSource, HrDirectory, LifecycleDirectory } from '../domain/ports.js';
import type { AccountabilityPolicy, RiskPolicy } from '../domain/policy.js';
import type {
  RiskFactorCoverage,
  RiskFactorName,
  RiskFinding,
  RiskOutcome,
  RiskProfile,
  RiskQuery,
  RiskRow,
  RiskStaleness,
  RiskSummary,
} from '../domain/risk.js';
import { RISK_VERSUS_RANKERS } from '../domain/risk.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import {
  DEFAULT_RISK_FACTORS,
  type RiskFactor,
  type RiskFactorContext,
  type RiskGrant,
} from './factors.js';
import { compareAssessments, levelCounts, summarize, type FactorRun } from './summarize.js';

/**
 * Identity Risk Profile — `docs/identity-risk-profile-research.md` §5, §6.
 *
 * The join, and nothing else. Every fact this service reports was produced by another
 * module or read from a table: two levels are quoted verbatim from the engine's ranking
 * authorities, one is authored over a path inventory Access Discovery already built, and
 * three come from the lifecycle tables `ITAG.md` §F9 and §F10 published and nothing has
 * consumed until now. There is no traversal here, so architecture rule 1 holds without
 * effort, and no arithmetic across factors, so architecture rule 8 holds by construction.
 *
 * **This is the first module in the engine whose main contribution is refusing to rank.**
 * Research §7.2 reaches verdict (c) — a data producer and a join — on measured grounds:
 * sixteen of the source PRD composite's top twenty rows were already surfaced by the two
 * shipped rankers, and the fusion actively destroyed information they had, dropping
 * `svc-vpn-legacy` from ownership queue rank 1 to composite rank 9 and `user-maya` from
 * exposure #1 to 62. What is added is the count of how many signals independently fired,
 * and the honest statement that most of the estate has factors nobody can evaluate.
 *
 * The price of touching two ranking authorities is the same disclosure exposure pays:
 * every row carries ownership's verdict, exposure's assessment union and the sentence
 * reconciling all four surfaces, so no consumer can put a factor count on screen without
 * the numbers it is not replacing. `service.test.ts`'s guard asserts the quotations are
 * byte-identical rather than trusting the word.
 */

// --- The two narrow ports ---------------------------------------------------

/**
 * Ownership's verdict for one identity, as this module is allowed to see it.
 *
 * Structurally identical to `ExposureOwnershipSource` and `ImpactOwnershipSource`, and
 * satisfied by the same `memoizedExposureOwnership` adapter — a third shape for "what
 * ownership said" would be the vocabulary drift research §3.1 warns about. The values are
 * copied, never recomputed: this module has no opinion about whether anyone is
 * accountable for an identity, and `ownership/classify.ts` must not become an import here.
 */
export interface RiskOwnershipSource {
  context(identityId: string): ExposureOwnershipContext;
}

/**
 * Exposure's assessment for one identity, quoted whole.
 *
 * The union rather than the number, for the reason `ImpactExposureSource` carries the
 * union: a port typed as `number` would make a copy indistinguishable from an original,
 * and this module publishing a 0-100 figure is the single thing architecture rule 8
 * forbids it. Null is the port's own "unknown to exposure" and is distinct from all three
 * arms — a group has no exposure verdict at all (rule 12).
 */
export interface RiskExposureSource {
  assessment(identityId: string): ExposureAssessment | null;
}

export interface RiskDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  /**
   * The path inventory this module reads and does not re-derive.
   *
   * Taken whole, as `exposure/service.ts` and `impact/service.ts` both take it, rather than
   * behind a one-method port. The narrow ports above exist because those two upstreams are
   * *ranking authorities* whose values are quoted and must be provably unmodified; Access
   * Discovery ranks nothing (`access/classify.test.ts` L432), so there is no verdict to
   * insulate and `AccessService` is already the narrowest honest dependency.
   */
  readonly access: AccessService;
  readonly ownership: RiskOwnershipSource;
  readonly exposure: RiskExposureSource;
  /** `ITAG.md` §F9's and §F10's tables, on whatever clock their source systems run. */
  readonly lifecycle: LifecycleDirectory;
  /** Supplies the review date, which exists only where an account belongs to a person. */
  readonly hr: HrDirectory;
  readonly policy: RiskPolicy;
  /** Supplies `staleReviewDays`, the number the engine already uses for this question. */
  readonly accountabilityPolicy: AccountabilityPolicy;
  /** Injected so a caller can pin the factor set; defaults to the frozen registry. */
  readonly factors?: readonly RiskFactor[];
}

export interface RiskService {
  /** §6's table, most independently-firing signals first. */
  list(query?: RiskQuery): readonly RiskRow[];
  /** §6's drawer. Never throws on an unknown id. */
  profile(identityId: string): RiskOutcome;
  /** §6's landing strip, coverage gate first. */
  summary(query?: RiskQuery): RiskSummary;
}

export function createRiskService(deps: RiskDeps): RiskService {
  const factors = deps.factors ?? DEFAULT_RISK_FACTORS;

  /**
   * Access Discovery's snapshot, read once and reused.
   *
   * Copied from the module that produced the facts, never re-read from the clock, exactly
   * as `exposure/service.ts` does it: a consumer dates the facts it *read*, not the moment
   * it read them. The only exposed source walks the estate, so calling it per request would
   * make a full scan out of a single-identity drawer. Cached per service instance, which is
   * correct while the graph is built once at boot from a frozen dataset.
   */
  let snapshot: AccessSnapshot | null = null;
  function accessSnapshot(): AccessSnapshot {
    snapshot ??= deps.access.summary().snapshot;
    return snapshot;
  }

  /**
   * Groups are excluded as subjects, matching every other module (architecture rule 12).
   *
   * Open issues A and A* are the reason this is one function rather than a filter applied
   * in `list` alone: `ownership.classify` and `exposure.profile` both answer for a group
   * while neither `list` returns one, so a drawer reachable from a choke-point row lands on
   * a page no table will show. This module does not inherit that split — a group is not a
   * subject in `list`, `profile` or `summary`, so all three agree about the population.
   */
  function population(graph: IdentityGraph, app: string | undefined): readonly Identity[] {
    const scope = app === undefined ? graph.all : (graph.byApp.get(app) ?? []);
    return scope.filter((identity) => identity.type !== 'group');
  }

  /**
   * The half-life join, done here because the index lives behind the port.
   *
   * `validateDataset` checks every `grant_records` row against `grant_half_lives` at boot,
   * so a grant whose class is missing cannot be loaded and the filter below is a type
   * narrowing rather than a silent drop.
   */
  function grantsFor(identityId: string): readonly RiskGrant[] | null {
    const records = deps.lifecycle.grants(identityId);
    if (records === null) {
      return null;
    }
    return records.flatMap((grant) => {
      const halfLife = deps.lifecycle.halfLife(grant.grant_type);
      return halfLife === null ? [] : [{ grant, half_life: halfLife }];
    });
  }

  function contextFor(identity: Identity): RiskFactorContext {
    const access = deps.access.profile(identity.id);
    return {
      identity,
      now: deps.clock.now(),
      access: access.ok ? access.profile : null,
      exposure: deps.exposure.assessment(identity.id),
      ownership: deps.ownership.context(identity.id),
      control_events: deps.lifecycle.controlEvents(identity.id),
      grants: grantsFor(identity.id),
      review: deps.hr.person(identity.id),
      policy: deps.policy,
      accountabilityPolicy: deps.accountabilityPolicy,
    };
  }

  /**
   * Runs the registry in order and sorts the results into the three lists.
   *
   * A factor that does not apply lands in neither, which is the distinction
   * `RiskFactorCoverage` is built on: no provider records an access review for a machine
   * identity and none will (§3.2), so counting 113 service accounts as a review-coverage
   * gap would name a gap nobody can close.
   */
  function runFactors(context: RiskFactorContext): FactorRun {
    const found: RiskFinding[] = [];
    const evaluated: RiskFactorName[] = [];
    const unavailable: RiskFactorName[] = [];

    for (const factor of factors) {
      if (!factor.applies(context)) {
        continue;
      }
      const verdict = factor.evaluate(context);
      if (verdict === 'unavailable') {
        unavailable.push(factor.factor);
        continue;
      }
      evaluated.push(factor.factor);
      if (verdict !== 'no_finding') {
        found.push(verdict);
      }
    }

    return {
      findings: Object.freeze(found),
      evaluated: Object.freeze(evaluated),
      unavailable: Object.freeze(unavailable),
    };
  }

  /**
   * Which input dates the row — research §4.5, and `domain/exposure.ts` L274's other half.
   *
   * Every factor in this build reads the one dataset validated at boot, so all six input
   * snapshots are `graph_snapshot_at` and the tie is broken by registry order (architecture
   * rule 3). That is visible rather than hidden: `snapshot_at` equalling
   * `based_on_access_discovery_snapshot` says nothing is staler than the graph. A
   * deployment whose IdP stream and entitlement register ingest on their own cadences gets
   * a real answer here without a change to this function's shape.
   */
  function stalenessFor(run: FactorRun): RiskStaleness {
    const graphSnapshot = accessSnapshot().graph_snapshot_at;
    const stalest = run.evaluated[0];
    return {
      based_on_access_discovery_snapshot: graphSnapshot,
      // The moment this object was built, and explicitly not evidence of freshness — the
      // field above is. Both are published so the difference between "when we looked" and
      // "when the facts are from" is visible rather than assumed.
      computed_at: deps.clock.now().toISOString(),
      stalest_input: stalest === undefined ? null : { factor: stalest, snapshot_at: graphSnapshot },
    };
  }

  function subjectFor(identity: Identity): RiskRow {
    const context = contextFor(identity);
    const run = runFactors(context);
    return {
      identity_id: identity.id,
      name: identity.name,
      identity_type: identity.type,
      app: identity.app,
      assessment: summarize(run),
      ownership: context.ownership,
      exposure: context.exposure,
      why_factors_differ: RISK_VERSUS_RANKERS,
      staleness: stalenessFor(run),
    };
  }

  /**
   * A filter on a finding cannot match a row that has not got one.
   *
   * `worstLevel`, `minFactors` and `factor` therefore exclude both no-finding arms rather
   * than treating them as zero — the same argument the three-armed union exists for,
   * applied to the query side so the table and the type agree. `owner` is the exception:
   * it reads the quoted ownership subtree, which every row carries whatever its arm.
   */
  function matches(row: RiskRow, query: RiskQuery): boolean {
    if (query.identityType !== undefined && row.identity_type !== query.identityType) {
      return false;
    }
    if (query.owner !== undefined && row.ownership.owner?.id !== query.owner) {
      return false;
    }

    const findingFiltered =
      query.worstLevel !== undefined || query.minFactors !== undefined || query.factor !== undefined;
    if (row.assessment.kind !== 'findings') {
      return !findingFiltered && query.includeWithoutFindings === true;
    }
    if (query.worstLevel !== undefined && row.assessment.worst_level !== query.worstLevel) {
      return false;
    }
    if (query.minFactors !== undefined && row.assessment.factors_firing < query.minFactors) {
      return false;
    }
    if (query.factor !== undefined) {
      return row.assessment.findings.some((finding) => finding.factor === query.factor);
    }
    return true;
  }

  /**
   * §6's gate, and it publishes before the ranking for the reason
   * `exposure/service.test.ts` L402 established: the first thing a reviewer needs is not
   * who ranks highest but whether the ranking means anything.
   *
   * On this estate `control_drift` reaches four identities and `grant_staleness` seven,
   * both entirely service accounts, so a table sorted by factor count without this block
   * beside it would read as an estate-wide assessment of a four-row fixture (§8 gap 3).
   * Reported per factor in registry order, so the shape is stable across releases.
   */
  function coverage(rows: readonly RiskRow[]): readonly RiskFactorCoverage[] {
    return Object.freeze(
      factors.map((factor): RiskFactorCoverage => {
        let evaluated = 0;
        let unavailable = 0;
        let findings = 0;

        for (const row of rows) {
          const { assessment } = row;
          const missing =
            assessment.kind === 'no_findings' ? [] : assessment.factors_unavailable;
          if (assessment.factors_evaluated.includes(factor.factor)) {
            evaluated += 1;
          } else if (missing.includes(factor.factor)) {
            unavailable += 1;
          }
          if (
            assessment.kind === 'findings' &&
            assessment.findings.some((finding) => finding.factor === factor.factor)
          ) {
            findings += 1;
          }
        }

        return {
          factor: factor.factor,
          evaluated,
          unavailable,
          not_applicable: rows.length - evaluated - unavailable,
          findings,
        };
      }),
    );
  }

  return {
    list(query = {}) {
      const graph = deps.graphSource.graph();
      const rows = population(graph, query.app)
        .map((identity) => subjectFor(identity))
        .filter((row) => matches(row, query));
      return Object.freeze(
        [...rows].sort((left, right) =>
          compareAssessments(left.assessment, right.assessment, left.identity_id, right.identity_id),
        ),
      );
    },

    profile(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined || identity.type === 'group') {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      const profile: RiskProfile = subjectFor(identity);
      return { ok: true, profile };
    },

    summary(query = {}) {
      const graph = deps.graphSource.graph();
      const scanned = population(graph, query.app).map((identity) => subjectFor(identity));
      const listed = scanned.filter((row) => matches(row, query));
      const assessments = listed.map((row) => row.assessment);

      return {
        // Coverage first in the payload as well as in the type — see `coverage`.
        factor_coverage: coverage(scanned),
        scanned: scanned.length,
        with_findings: assessments.filter((assessment) => assessment.kind === 'findings').length,
        no_findings: scanned.filter((row) => row.assessment.kind === 'no_findings').length,
        partially_evaluated: scanned.filter(
          (row) => row.assessment.kind === 'partially_evaluated',
        ).length,
        by_worst_level: levelCounts(assessments),
        snapshot: accessSnapshot(),
      };
    },
  };
}
