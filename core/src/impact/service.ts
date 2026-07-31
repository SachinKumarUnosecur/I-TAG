import type { AccessService } from '../access/service.js';
import type { AccessPath, AccessSnapshot } from '../domain/access.js';
import type { ExposureAssessment, ExposureOwnershipContext } from '../domain/exposure.js';
import type {
  AffectedIdentity,
  ChokePoint,
  ChokePointReport,
  ImpactAssessment,
  ImpactCounts,
  ImpactOutcome,
  ImpactPivot,
  ImpactProfile,
  ImpactStaleness,
  SimulationOutcome,
} from '../domain/impact.js';
import { IMPACT_VERSUS_EXPOSURE } from '../domain/impact.js';
import type { AccountabilityPolicy } from '../domain/policy.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import type { AccessPathRule } from '../access/classify.js';
import {
  baselineOf,
  evaluateCandidate,
  indexReach,
  pivotBindingsOf,
  selectChokePoints,
  type AffectedReach,
  type CandidateEvaluation,
  type ChokePointStrategy,
  type ReachIndex,
  type SelectionContext,
} from './choke.js';

/**
 * Blast Radius — `docs/unified-impact-analysis-research.md` §5, §6.
 *
 * **Ranks grants, never identities.** Architecture rule 8 fixes the engine at two
 * identity-ranking authorities and research §4.2 is the argument that a third
 * population does not breach it: this service sorts remediations by measured
 * reduction, and nothing it returns puts one identity above another. The PRD's
 * `exploitable_risk_score` and systemic leaderboard are struck, so there is no
 * `list()` here — the landing artifact is `chokePoints()`, whose rows are grants.
 *
 * **Reads paths, not scores.** Research §10 leaves open whether this module should
 * seed from `ExposureProfile.exposure_set` as the PRD mandates or from
 * `AccessService.profile().paths` directly, and settles on the latter for a reason
 * that turns out to be load-bearing: exposure collapses each permission to its
 * worst mechanism, and a counterfactual computed over collapsed routes cannot see
 * that `svc-invoice-poster` keeps reaching `write:invoice-queue` after the hop is
 * cut. Collapsing away a surviving route is exactly how `connect:ledger-writer`
 * would be mis-scored, so this service consumes the uncollapsed inventory.
 *
 * Exposure is still quoted — §5 step 6 requires the other ranker to travel with
 * every row — but as the whole `ExposureAssessment` union, under one namespaced
 * field, so a score can neither be read blind nor be mistaken for this module's own.
 */

/**
 * Ownership Assurance's verdict, as a narrow port.
 *
 * Structurally identical to `ExposureOwnershipSource` and declared separately on
 * purpose: `impact/` importing `exposure/service.ts` for a one-method interface
 * would make a type dependency out of what is only a shape agreement, and the two
 * are free to diverge. Only the composition root knows both sides (architecture
 * rule 4), and one adapter satisfies both.
 */
export interface ImpactOwnershipSource {
  context(identityId: string): ExposureOwnershipContext;
}

/**
 * The other ranker's verdict for one identity, quoted whole.
 *
 * Returns the three-armed union rather than a number, so a starting identity whose
 * footprint was unclassified or empty cannot have a score read off it. Null is the
 * port's own "this identity is unknown to exposure" and is distinct from any of the
 * union's arms.
 */
export interface ImpactExposureSource {
  assessment(identityId: string): ExposureAssessment | null;
}

export interface ImpactDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  /** The uncollapsed path inventory this module aggregates and does not re-derive. */
  readonly access: AccessService;
  readonly ownership: ImpactOwnershipSource;
  readonly exposure: ImpactExposureSource;
  /** Supplies `maxChainDepth`, the same bound every other walk in the engine honours. */
  readonly policy: AccountabilityPolicy;
  /** Injected so a caller can pin the selector; defaults to the frozen registry. */
  readonly strategies?: readonly ChokePointStrategy[];
  readonly rules?: readonly AccessPathRule[];
}

export interface ImpactService {
  /** §6's primary artifact: every pivot binding, ranked by what revoking it removes. */
  chokePoints(): ChokePointReport;
  /** §6's per-identity propagation. Never throws on an unknown id. */
  profile(identityId: string): ImpactOutcome;
  /** `ITAG.md` §F7's before/after diff for one grant. Never throws. */
  simulate(permissionId: string): SimulationOutcome;
}

/**
 * Every pivot binding a path traverses, at any depth.
 *
 * Duplicated from `choke.ts` deliberately rather than exported from it: that copy
 * is an implementation detail of the selector and this one is an implementation
 * detail of the profile, and the day either needs a different notion of "crosses"
 * the two should be free to move apart. Both read the same `CAN_ACCESS` steps and
 * neither reads `via_permission`, for the reason `seed-impact.test.ts` pins.
 */
function crossingsOf(path: AccessPath, graph: IdentityGraph): readonly string[] {
  const crossings: string[] = [];
  for (const step of path.chain) {
    if (step.edge === 'CAN_ACCESS' && graph.permissionBindings.has(step.to)) {
      crossings.push(step.to);
    }
  }
  return crossings;
}

/**
 * Research §5 step 1, with one documented correction.
 *
 * §5 step 1 derives `identities_reachable` from "distinct `assumed_identity` over
 * the hop arms". `AccessPath.assumed_identity` names only the principal at a path's
 * *front* crossing, so on the beat-23 chain it reports one principal where the
 * identity demonstrably reaches two — `role-runbook-executor` and then
 * `role-warehouse-admin`. Counting the principals named by every crossing gives
 * two, which is the number the chain shows on screen, and it is the same derivation
 * `choke.ts` uses so the profile and the choke-point table cannot disagree.
 */
function countsOf(
  paths: readonly AccessPath[],
  graph: IdentityGraph,
): { readonly counts: ImpactCounts; readonly pivots: readonly ImpactPivot[] } {
  const permissions = new Set<string>();
  const principals = new Set<string>();
  /** Binding -> the permissions reached on paths that traverse it. */
  const reachedVia = new Map<string, Set<string>>();
  const deepestVia = new Map<string, number>();

  for (const path of paths) {
    permissions.add(path.permission);
    for (const crossing of crossingsOf(path, graph)) {
      const principal = graph.permissionBindings.get(crossing);
      if (principal !== undefined) {
        principals.add(principal);
      }
      const reached = reachedVia.get(crossing);
      if (reached === undefined) {
        reachedVia.set(crossing, new Set([path.permission]));
      } else {
        reached.add(path.permission);
      }
      deepestVia.set(crossing, Math.max(deepestVia.get(crossing) ?? 0, path.hop_count));
    }
  }

  const sensitive = [...permissions].filter((permission) => graph.sensitivePermissions.has(permission)).sort();

  const pivots = [...reachedVia.entries()]
    .map(([via, reached]): ImpactPivot => {
      const principal = graph.permissionBindings.get(via) ?? '';
      return Object.freeze({
        via_permission: via,
        assumed_identity: principal,
        assumed_identity_app: graph.byId.get(principal)?.app ?? '',
        permissions_reached: Object.freeze([...reached].sort()),
        deepest_hop_count: deepestVia.get(via) ?? 0,
      });
    })
    .sort(
      (left, right) =>
        right.permissions_reached.length - left.permissions_reached.length ||
        left.via_permission.localeCompare(right.via_permission),
    );

  return {
    counts: Object.freeze({
      resources_reachable: permissions.size,
      identities_reachable: principals.size,
      /**
       * Deterministic rather than weighted, and that is a refusal rather than an
       * omission. `exposure/score.ts` orders sensitive permissions by contribution
       * because it has a published weighting model; this module has none and must
       * not invent a second one (architecture rule 8), so where several sensitive
       * permissions are reached the first in sort order is named and the column
       * means "reaches something sensitive, for example this".
       */
      highest_sensitivity_reached: sensitive[0] ?? null,
    }),
    pivots: Object.freeze(pivots),
  };
}

export function createImpactService(deps: ImpactDeps): ImpactService {
  const maxDepth = deps.policy.maxChainDepth;

  /**
   * Access Discovery's snapshot, copied rather than re-read from the clock.
   *
   * Same contract as `ExposureStaleness`: a consumer dates the facts it read, not
   * the moment it read them. Cached per service instance because the only exposed
   * source walks the estate, and because the graph is built once at boot from a
   * frozen dataset — a deployment with a mutable graph scopes one service per
   * rebuild rather than one per process.
   */
  let snapshot: AccessSnapshot | null = null;
  function accessSnapshot(): AccessSnapshot {
    snapshot ??= deps.access.summary().snapshot;
    return snapshot;
  }

  function stalenessNow(): ImpactStaleness {
    return Object.freeze({
      based_on_access_discovery_snapshot: accessSnapshot().graph_snapshot_at,
      computed_at: deps.clock.now().toISOString(),
    });
  }

  /**
   * The baseline reach index, and the choke-point report over it.
   *
   * Memoized together because the report costs one graph rebuild and one estate
   * re-traversal *per candidate*, and `chokePoints()` and `simulate()` both need the
   * same baseline to compare against. Two callers computing their own baselines
   * would be two answers to "how much reach is there", which is precisely the
   * unstated-denominator failure research §1.3 is about.
   */
  let cachedBaseline: ReachIndex | null = null;
  function baselineReach(): ReachIndex {
    cachedBaseline ??= indexReach(deps.graphSource.graph(), maxDepth, deps.rules);
    return cachedBaseline;
  }

  function selectionContext(): SelectionContext {
    const graph = deps.graphSource.graph();
    return {
      graph,
      maxDepth,
      ...(deps.rules === undefined ? {} : { rules: deps.rules }),
      candidates: pivotBindingsOf(graph),
      baseline: baselineReach(),
    };
  }

  /** Attaches the identity's name, app and ownership to a measured loss. */
  function affectedIdentitiesOf(
    graph: IdentityGraph,
    affected: readonly AffectedReach[],
  ): readonly AffectedIdentity[] {
    return Object.freeze(
      affected.flatMap((loss): AffectedIdentity[] => {
        const identity: Identity | undefined = graph.byId.get(loss.identity_id);
        if (identity === undefined) {
          return [];
        }
        return [
          Object.freeze({
            identity_id: identity.id,
            name: identity.name,
            identity_type: identity.type,
            app: identity.app,
            permissions_lost: loss.permissions_lost,
            ownership: deps.ownership.context(identity.id),
          }),
        ];
      }),
    );
  }

  function chokePointOf(graph: IdentityGraph, evaluation: CandidateEvaluation): ChokePoint {
    return Object.freeze({
      permission: evaluation.permission,
      grants_identity: evaluation.grants_identity,
      held_by: evaluation.held_by,
      access_removed: evaluation.access_removed,
      mechanisms_closed: evaluation.mechanisms_closed,
      closes: evaluation.closes,
      affected_identities: affectedIdentitiesOf(graph, evaluation.affected),
      surviving_routes: evaluation.surviving_routes,
    });
  }

  let cachedReport: ChokePointReport | null = null;

  return Object.freeze({
    chokePoints(): ChokePointReport {
      if (cachedReport !== null) {
        return cachedReport;
      }
      const context = selectionContext();
      const result = selectChokePoints(context, deps.strategies);

      cachedReport = Object.freeze({
        selection: result.selection,
        candidates: Object.freeze(
          result.evaluations.map((evaluation) => chokePointOf(context.graph, evaluation)),
        ),
        baseline: baselineOf(context.baseline),
        snapshot: accessSnapshot(),
      });
      return cachedReport;
    },

    profile(identityId: string): ImpactOutcome {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }

      const outcome = deps.access.profile(identityId);
      const paths: readonly AccessPath[] = outcome.ok ? outcome.profile.paths : [];
      const { counts, pivots } = countsOf(paths, graph);

      /**
       * Three arms, and the order of these tests is the distinction (rule 7).
       * "Reaches nothing at all" is checked first because it is a claim about the
       * footprint; "reaches things but crosses no boundary" is PRD §6.4's green
       * banner and is only correct once there is a footprint to have analysed.
       */
      const assessment: ImpactAssessment =
        paths.length === 0
          ? { kind: 'no_access' }
          : pivots.length === 0
            ? { kind: 'no_pivot_paths', counts }
            : { kind: 'propagates', counts, pivots };

      return {
        ok: true,
        profile: Object.freeze({
          identity_id: identity.id,
          name: identity.name,
          identity_type: identity.type,
          app: identity.app,
          assessment,
          ownership: deps.ownership.context(identity.id),
          exposure: Object.freeze({
            assessment: deps.exposure.assessment(identity.id),
            why_these_differ: IMPACT_VERSUS_EXPOSURE,
          }),
          staleness: stalenessNow(),
        }) satisfies ImpactProfile,
      };
    },

    simulate(permissionId: string): SimulationOutcome {
      const graph = deps.graphSource.graph();

      if (!graph.dataset.permissions.some((permission) => permission.id === permissionId)) {
        return { ok: false, error: 'unknown_permission', permission: permissionId };
      }
      if (!graph.permissionBindings.has(permissionId)) {
        return { ok: false, error: 'not_a_pivot_binding', permission: permissionId };
      }

      const context = selectionContext();
      const evaluation = evaluateCandidate(context, permissionId);

      return {
        ok: true,
        severed: permissionId,
        before: baselineOf(context.baseline),
        after: Object.freeze({
          reachable_pairs: evaluation.access_removed.counterfactual,
          pivot_edges: evaluation.mechanisms_closed.counterfactual,
          identities_scanned: context.baseline.subjectsScanned,
        }),
        access_removed: evaluation.access_removed,
        mechanisms_closed: evaluation.mechanisms_closed,
        closes: evaluation.closes,
        affected_identities: affectedIdentitiesOf(graph, evaluation.affected),
        surviving_routes: evaluation.surviving_routes,
        snapshot: accessSnapshot(),
      };
    },
  });
}
