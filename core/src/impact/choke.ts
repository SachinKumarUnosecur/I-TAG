import { discoverAccess, type AccessPathRule } from '../access/classify.js';
import type { AccessPath, AccessPathType } from '../domain/access.js';
import type {
  ChokePointEffect,
  ChokePointSelection,
  ImpactBaseline,
  ImpactDelta,
  SurvivingRoute,
} from '../domain/impact.js';
import { MAX_EXHAUSTIVE_CANDIDATES } from '../domain/impact.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { severingBindings } from './counterfactual.js';

/**
 * Choke-point selection — research §4.4, §5 steps 2 to 5.
 *
 * The PRD ranks candidates "by naive appearance-frequency in paths first", and §8
 * of the PRD then asks how confident the product can be that the true choke point
 * is inside the shortlist. Research §4.4 answers it: Jha, Sheyner and Wing prove
 * Minimum Critical Set of Attacks NP-complete and polynomially equivalent to
 * minimum hitting set, so appearance frequency carries **no bound at all** — and it
 * is measurably wrong on this estate, where `connect:ledger-writer` ties three
 * candidates that do remove access while removing none itself.
 *
 * So this file does two things and publishes which one it did. While the candidate
 * space fits the budget, every candidate is evaluated by *actually rebuilding the
 * graph without it* and re-running the traversal — an exact answer, no heuristic.
 * Above the budget it falls back to greedy hitting set, which carries the published
 * `H(k)` bound. `ChokePointSelection` states which, because an unbounded heuristic
 * presented as an optimum is the choke-point equivalent of an unpublished score.
 *
 * **Everything here is derived from chain crossings, never from `via_permission`.**
 * `AccessPath.via_permission` records only a path's *front* crossing, which
 * systematically undervalues every rung behind the first: `seed-impact.test.ts`
 * pins the case — `gh:connect-artifact-signer` fronts one subject's paths and
 * carries three subjects' access to `deploy:prod`. Reading the `CAN_ACCESS` steps
 * out of `AccessChainStep` instead finds every binding a path traverses, at any
 * depth, and costs one pass over a chain that is already built.
 */

/** Non-group principals — architecture rule 12, as everywhere else in the engine. */
function subjectsOf(graph: IdentityGraph): readonly Identity[] {
  return graph.all.filter((identity) => identity.type !== 'group');
}

/**
 * Every pivot binding a path traverses, at any depth.
 *
 * A hop is emitted by `access/classify.ts` as an adjacent `CAN_ACCESS` then
 * `ASSUMES_ROLE` pair, so the `to` of each `CAN_ACCESS` step is a permission that
 * binds. A two-stage chain yields two; a direct or indirect path yields none.
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

const TYPE_ORDER: Readonly<Record<AccessPathType, number>> = Object.freeze({
  direct: 0,
  indirect: 1,
  hop: 2,
});

function sortedRouteTypes(types: Iterable<AccessPathType>): readonly AccessPathType[] {
  return Object.freeze([...new Set(types)].sort((left, right) => TYPE_ORDER[left] - TYPE_ORDER[right]));
}

/**
 * What one graph — real or counterfactual — lets the whole estate reach.
 *
 * Computed once per graph and reused across every comparison, because the same
 * index answers all four questions the module asks: the two baselines, which
 * identities lost what, and which permissions survived by another route.
 */
export interface ReachIndex {
  /** Subject id -> the permissions it can reach by any mechanism. */
  readonly permissionsBySubject: ReadonlyMap<string, ReadonlySet<string>>;
  /** Subject id -> permission -> the distinct mechanisms reaching it. */
  readonly routesBySubject: ReadonlyMap<string, ReadonlyMap<string, readonly AccessPathType[]>>;
  /** Subject id -> the pivot bindings its paths traverse. */
  readonly crossingsBySubject: ReadonlyMap<string, ReadonlySet<string>>;
  /** Distinct `(subject, permission)` pairs. Two routes to one permission is one pair. */
  readonly reachablePairs: number;
  /**
   * Distinct `(subject, binding)` crossings — the estate's exercised mechanisms.
   *
   * The unit is "one principal using one grant to cross a boundary" rather than
   * "one binding", because that is what a revocation closes. Research §4.1 quotes
   * six exercised pivot edges under a different definition taken before the module
   * existed; this one is stated here and asserted in `choke.test.ts` so the two
   * cannot be confused.
   */
  readonly exercisedCrossings: number;
  readonly subjectsScanned: number;
}

export function indexReach(
  graph: IdentityGraph,
  maxDepth: number,
  rules?: readonly AccessPathRule[],
): ReachIndex {
  const permissionsBySubject = new Map<string, ReadonlySet<string>>();
  const routesBySubject = new Map<string, ReadonlyMap<string, readonly AccessPathType[]>>();
  const crossingsBySubject = new Map<string, ReadonlySet<string>>();
  let reachablePairs = 0;
  let exercisedCrossings = 0;

  const subjects = subjectsOf(graph);
  for (const subject of subjects) {
    const paths = discoverAccess(graph, subject, maxDepth, rules);

    const mechanisms = new Map<string, AccessPathType[]>();
    const crossings = new Set<string>();
    for (const path of paths) {
      const seen = mechanisms.get(path.permission);
      if (seen === undefined) {
        mechanisms.set(path.permission, [path.path_type]);
      } else {
        seen.push(path.path_type);
      }
      for (const crossing of crossingsOf(path, graph)) {
        crossings.add(crossing);
      }
    }

    const routes = new Map<string, readonly AccessPathType[]>();
    for (const [permission, types] of mechanisms) {
      routes.set(permission, sortedRouteTypes(types));
    }

    permissionsBySubject.set(subject.id, new Set(mechanisms.keys()));
    routesBySubject.set(subject.id, routes);
    crossingsBySubject.set(subject.id, crossings);
    reachablePairs += mechanisms.size;
    exercisedCrossings += crossings.size;
  }

  return Object.freeze({
    permissionsBySubject,
    routesBySubject,
    crossingsBySubject,
    reachablePairs,
    exercisedCrossings,
    subjectsScanned: subjects.length,
  });
}

export function baselineOf(reach: ReachIndex): ImpactBaseline {
  return Object.freeze({
    reachable_pairs: reach.reachablePairs,
    pivot_edges: reach.exercisedCrossings,
    identities_scanned: reach.subjectsScanned,
  });
}

/**
 * A delta with its denominator inside it — research §1.3.
 *
 * `share_of_baseline` is 0 rather than `NaN` on an empty baseline: a ratio of
 * nothing to nothing is not "unknown", it is "this removed none of the nothing
 * there was", and a `NaN` would propagate into JSON as `null` and be read as a
 * missing measurement.
 */
function deltaOf(baseline: number, counterfactual: number): ImpactDelta {
  const removed = baseline - counterfactual;
  return Object.freeze({
    baseline,
    counterfactual,
    removed,
    share_of_baseline: baseline === 0 ? 0 : removed / baseline,
  });
}

/** One identity's loss under a counterfactual, before ownership context is attached. */
export interface AffectedReach {
  readonly identity_id: string;
  readonly permissions_lost: readonly string[];
}

/** One candidate, measured. Ownership and naming are the service's job, not this file's. */
export interface CandidateEvaluation {
  readonly permission: string;
  readonly grants_identity: string;
  readonly held_by: readonly string[];
  readonly access_removed: ImpactDelta;
  readonly mechanisms_closed: ImpactDelta;
  readonly closes: ChokePointEffect;
  readonly affected: readonly AffectedReach[];
  readonly surviving_routes: readonly SurvivingRoute[];
}

/**
 * Compares two reach indexes and reports what the difference means.
 *
 * A permission is **lost** when the subject reached it before and cannot now. It is
 * a **surviving route** when the subject still reaches it but by a different set of
 * mechanisms than before — which is exactly the `connect:ledger-writer` case, where
 * `['hop','indirect']` becomes `['indirect']` and the reachable set does not move.
 * Comparing route sets rather than counting paths means the label carries its own
 * evidence and needs no attribution to the candidate.
 */
function diffReach(
  baseline: ReachIndex,
  counterfactual: ReachIndex,
): { readonly affected: readonly AffectedReach[]; readonly surviving: readonly SurvivingRoute[] } {
  const affected: AffectedReach[] = [];
  const surviving: SurvivingRoute[] = [];

  for (const [subjectId, before] of baseline.permissionsBySubject) {
    const after = counterfactual.permissionsBySubject.get(subjectId) ?? new Set<string>();

    const lost = [...before].filter((permission) => !after.has(permission)).sort();
    if (lost.length > 0) {
      affected.push(Object.freeze({ identity_id: subjectId, permissions_lost: Object.freeze(lost) }));
    }

    const routesBefore = baseline.routesBySubject.get(subjectId);
    const routesAfter = counterfactual.routesBySubject.get(subjectId);
    if (routesBefore === undefined || routesAfter === undefined) {
      continue;
    }
    for (const [permission, typesBefore] of routesBefore) {
      const typesAfter = routesAfter.get(permission);
      if (typesAfter === undefined || typesAfter.join() === typesBefore.join()) {
        continue;
      }
      surviving.push(Object.freeze({ identity_id: subjectId, permission, route_types: typesAfter }));
    }
  }

  affected.sort((left, right) => left.identity_id.localeCompare(right.identity_id));
  surviving.sort(
    (left, right) =>
      left.identity_id.localeCompare(right.identity_id) ||
      left.permission.localeCompare(right.permission),
  );

  return { affected: Object.freeze(affected), surviving: Object.freeze(surviving) };
}

/** Everything a strategy needs, so a new one can be appended without changing a caller. */
export interface SelectionContext {
  readonly graph: IdentityGraph;
  readonly maxDepth: number;
  readonly rules?: readonly AccessPathRule[];
  /** Sorted pivot binding ids — the whole candidate space. */
  readonly candidates: readonly string[];
  readonly baseline: ReachIndex;
}

export interface SelectionResult {
  readonly selection: ChokePointSelection;
  readonly evaluations: readonly CandidateEvaluation[];
}

/**
 * One way of ranking the candidate space.
 *
 * A frozen registry of these rather than a branch, per architecture rule 3: the
 * list order *is* the precedence, so the exact answer is preferred whenever it is
 * affordable and adding a third strategy is an append rather than an edit to a
 * comparison chain. `applies` is the budget test; `rank` produces the answer and
 * the `ChokePointSelection` describing how it got there.
 */
export interface ChokePointStrategy {
  readonly method: ChokePointSelection['method'];
  applies(context: SelectionContext): boolean;
  rank(context: SelectionContext): SelectionResult;
}

function holdersOf(graph: IdentityGraph, permission: string): readonly string[] {
  return Object.freeze(
    graph.all
      .filter((identity) => identity.direct_grants.includes(permission))
      .map((identity) => identity.id)
      .sort(),
  );
}

function effectOf(accessRemoved: ImpactDelta, mechanismsClosed: ImpactDelta): ChokePointEffect {
  if (accessRemoved.removed > 0) {
    return 'access';
  }
  return mechanismsClosed.removed > 0 ? 'mechanism_only' : 'no_effect';
}

/**
 * One candidate, measured exactly: rebuild the graph without the binding and
 * re-measure the estate.
 *
 * The unit of work for both the exhaustive strategy and the single-candidate
 * simulator, shared so `GET /api/impact/simulate` cannot drift from the numbers on
 * the choke-point table. One graph build and one re-traversal, so the cost is
 * linear in candidates and `MAX_EXHAUSTIVE_CANDIDATES` is a budget rather than a
 * correctness boundary.
 */
export function evaluateCandidate(
  context: SelectionContext,
  permission: string,
): CandidateEvaluation {
  const severed = severingBindings(context.graph.dataset, [permission]);
  const counterfactual = indexReach(severed.graph(), context.maxDepth, context.rules);

  const accessRemoved = deltaOf(context.baseline.reachablePairs, counterfactual.reachablePairs);
  const mechanismsClosed = deltaOf(
    context.baseline.exercisedCrossings,
    counterfactual.exercisedCrossings,
  );
  const closes = effectOf(accessRemoved, mechanismsClosed);
  const { affected, surviving } = diffReach(context.baseline, counterfactual);

  return Object.freeze({
    permission,
    grants_identity: context.graph.permissionBindings.get(permission) ?? '',
    held_by: holdersOf(context.graph, permission),
    access_removed: accessRemoved,
    mechanisms_closed: mechanismsClosed,
    closes,
    affected,
    // Only meaningful as the evidence for the `mechanism_only` label; a candidate
    // that removed access is described by what it removed, not by what it left.
    surviving_routes: closes === 'mechanism_only' ? surviving : Object.freeze([]),
  });
}

/**
 * Exact evaluation of the whole candidate space.
 *
 * This is the arm that makes the module's central claim checkable rather than
 * asserted, and the one whose answer carries no approximation at all.
 */
export const EXHAUSTIVE_STRATEGY: ChokePointStrategy = Object.freeze({
  method: 'exhaustive' as const,

  applies(context: SelectionContext): boolean {
    return context.candidates.length <= MAX_EXHAUSTIVE_CANDIDATES;
  },

  rank(context: SelectionContext): SelectionResult {
    const evaluations = context.candidates.map((permission) => evaluateCandidate(context, permission));

    return Object.freeze({
      selection: Object.freeze({
        method: 'exhaustive' as const,
        candidates_evaluated: evaluations.length,
        candidate_space: context.candidates.length,
      }),
      evaluations: Object.freeze(rankEvaluations(evaluations)),
    });
  },
});

/** `H(k) = 1 + 1/2 + … + 1/k` — the greedy hitting-set bound, computed not quoted. */
function harmonic(k: number): number {
  let total = 0;
  for (let index = 1; index <= k; index += 1) {
    total += 1 / index;
  }
  return total;
}

/**
 * Greedy hitting set over the baseline path inventory, for when rebuilding per
 * candidate stops being affordable.
 *
 * The universe is every `(subject, permission)` pair a pivot carries; a candidate's
 * set is the pairs whose path traverses it. Greedy repeatedly takes the candidate
 * covering the most still-uncovered pairs, which is the algorithm Jha, Sheyner and
 * Wing give bounds for.
 *
 * **This arm is an approximation and says so in its own output.** It never rebuilds
 * the graph, so its deltas are derived from path membership rather than measured:
 * that is what makes it affordable and what makes `selection.method` load-bearing
 * rather than decorative. The two arms are not interchangeable, and a consumer that
 * treats them as such is reading a bound as an exact figure — which is the failure
 * research §4.4 exists to prevent.
 */
export const GREEDY_HITTING_SET_STRATEGY: ChokePointStrategy = Object.freeze({
  method: 'greedy_hitting_set' as const,

  // The last strategy in the registry is the fallback, so it accepts everything the
  // earlier ones declined. Ordering is the precedence (architecture rule 3).
  applies(): boolean {
    return true;
  },

  rank(context: SelectionContext): SelectionResult {
    const coverage = new Map<string, Set<string>>();
    for (const candidate of context.candidates) {
      coverage.set(candidate, new Set<string>());
    }
    for (const [subjectId, crossings] of context.baseline.crossingsBySubject) {
      const permissions = context.baseline.permissionsBySubject.get(subjectId);
      if (permissions === undefined) {
        continue;
      }
      for (const crossing of crossings) {
        const covered = coverage.get(crossing);
        if (covered === undefined) {
          continue;
        }
        for (const permission of permissions) {
          covered.add(`${subjectId}\u0000${permission}`);
        }
      }
    }

    const largestHitSet = Math.max(0, ...[...coverage.values()].map((pairs) => pairs.size));

    const uncovered = new Set<string>([...coverage.values()].flatMap((pairs) => [...pairs]));
    const remaining = new Set(context.candidates);
    const evaluations: CandidateEvaluation[] = [];

    while (remaining.size > 0) {
      let best: string | undefined;
      let bestGain = -1;
      for (const candidate of [...remaining].sort()) {
        const pairs = coverage.get(candidate);
        const gain = pairs === undefined ? 0 : [...pairs].filter((pair) => uncovered.has(pair)).length;
        if (gain > bestGain) {
          best = candidate;
          bestGain = gain;
        }
      }
      if (best === undefined) {
        break;
      }

      const pairs = coverage.get(best) ?? new Set<string>();
      for (const pair of pairs) {
        uncovered.delete(pair);
      }
      remaining.delete(best);

      const accessRemoved = deltaOf(context.baseline.reachablePairs, context.baseline.reachablePairs - bestGain);
      const mechanismsClosed = deltaOf(
        context.baseline.exercisedCrossings,
        context.baseline.exercisedCrossings - subjectsCrossing(context.baseline, best),
      );

      evaluations.push(
        Object.freeze({
          permission: best,
          grants_identity: context.graph.permissionBindings.get(best) ?? '',
          held_by: holdersOf(context.graph, best),
          access_removed: accessRemoved,
          mechanisms_closed: mechanismsClosed,
          closes: effectOf(accessRemoved, mechanismsClosed),
          // Absent by construction on this arm: naming the identities that lose access
          // requires the counterfactual this strategy exists to avoid computing, and a
          // list derived from path membership would read as measured when it is not.
          affected: Object.freeze([]),
          surviving_routes: Object.freeze([]),
        }),
      );
    }

    return Object.freeze({
      selection: Object.freeze({
        method: 'greedy_hitting_set' as const,
        candidates_evaluated: evaluations.length,
        candidate_space: context.candidates.length,
        approximation_ratio: harmonic(largestHitSet),
        largest_hit_set: largestHitSet,
      }),
      // Greedy order *is* the ranking — re-sorting by delta would discard the
      // marginal-coverage reasoning the bound is stated over.
      evaluations: Object.freeze(evaluations),
    });
  },
});

function subjectsCrossing(reach: ReachIndex, permission: string): number {
  let crossing = 0;
  for (const crossings of reach.crossingsBySubject.values()) {
    if (crossings.has(permission)) {
      crossing += 1;
    }
  }
  return crossing;
}

/**
 * Research §5 step 4: most access removed first, then most mechanisms closed, then
 * id for stability. Sorting on the measured consequence rather than on appearance
 * frequency is the correction §4.4 exists to make.
 */
function rankEvaluations(evaluations: readonly CandidateEvaluation[]): readonly CandidateEvaluation[] {
  return [...evaluations].sort(
    (left, right) =>
      right.access_removed.removed - left.access_removed.removed ||
      right.mechanisms_closed.removed - left.mechanisms_closed.removed ||
      left.permission.localeCompare(right.permission),
  );
}

/**
 * Order is precedence: the exact answer wins whenever the budget allows it, and the
 * bounded approximation is the fallback. Appending a third strategy is an append
 * here, never an edit to a branch (architecture rule 3).
 */
export const DEFAULT_CHOKE_POINT_STRATEGIES: readonly ChokePointStrategy[] = Object.freeze([
  EXHAUSTIVE_STRATEGY,
  GREEDY_HITTING_SET_STRATEGY,
]);

/**
 * The whole candidate space: every permission that confers a principal.
 *
 * Research §5 step 2 scopes candidates to the bindings "actually exercised". This
 * takes every binding instead, which is a deliberate widening: an unexercised
 * binding evaluates to `no_effect` and sorts last at a cost of one graph rebuild,
 * whereas deciding in advance which bindings are exercised means re-deriving
 * attribution — the thing this file avoids everywhere else, and the thing
 * `seed-impact.test.ts` shows gets mid-chain bindings wrong.
 */
export function pivotBindingsOf(graph: IdentityGraph): readonly string[] {
  return Object.freeze([...graph.permissionBindings.keys()].sort());
}

export function selectChokePoints(
  context: SelectionContext,
  strategies: readonly ChokePointStrategy[] = DEFAULT_CHOKE_POINT_STRATEGIES,
): SelectionResult {
  for (const strategy of strategies) {
    if (strategy.applies(context)) {
      return strategy.rank(context);
    }
  }

  // Unreachable with the default registry, whose last member accepts everything —
  // but a caller may pass its own, and an empty answer is a terminal state rather
  // than a throw (architecture rule 6).
  return Object.freeze({
    selection: Object.freeze({
      method: 'exhaustive' as const,
      candidates_evaluated: 0,
      candidate_space: context.candidates.length,
    }),
    evaluations: Object.freeze([]),
  });
}
