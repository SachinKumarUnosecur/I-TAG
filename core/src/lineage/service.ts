import type {
  CreationActor,
  CreationAuthoritySignal,
  CreatorStatus,
  FanOutSignal,
  LineageCoverageReport,
  LineageGapReason,
  LineageRow,
  LineageTreeOutcome,
  PersistedCreationEdge,
  Provenance,
  ProvenanceOutcome,
  ProvenanceRecord,
  PrivilegeGrantEvent,
} from '../domain/lineage.js';
import type { AccountabilityPolicy, LineagePolicy } from '../domain/policy.js';
import type { Clock, GraphSource, HrDirectory, SuppressionRegistry } from '../domain/ports.js';
import type { Identity } from '../domain/types.js';
import { creationEdgeKey, type IdentityGraph } from '../graph/build.js';
import {
  normalizeActor,
  resolveAuthorizingHuman,
  type ActorNormalizer,
  type HumanResolver,
} from './actors.js';
import { buildCoverage } from './coverage.js';
import { ancestorsToRoot, descendants, fanOut, fanOutInApp, inAppRoot, rootKindOf } from './resolve.js';
import {
  classifyLineageGap,
  evaluateCreationAuthority,
  evaluateFanOut,
  type LineageGapRule,
  type OwnershipStateSource,
} from './signals.js';

export interface LineageDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  readonly hr: HrDirectory;
  readonly suppressions: SuppressionRegistry;
  /**
   * Ownership Assurance's verdict on a creator, behind a port.
   *
   * Implementations must memoize: classification runs a traversal per identity, so
   * an un-memoized source turns a linear table scan quadratic. `memoizedOwnershipState`
   * in `src/adapters/ownership-state.ts` is the one the composition root wires in.
   */
  readonly ownership: OwnershipStateSource;
  readonly accountabilityPolicy: AccountabilityPolicy;
  readonly policy: LineagePolicy;
  readonly normalizers?: readonly ActorNormalizer[];
  readonly humanResolvers?: readonly HumanResolver[];
  readonly gapRules?: readonly LineageGapRule[];
}

/** `PRD` §6.4's filter bar, minus the filters for flags research §4.2/§4.3 removed. */
export interface LineageQuery {
  /** §6.2 makes this the first and most prominent control, not a buried filter. */
  readonly app?: string;
  readonly signal?: 'self_authorized' | 'creator_privilege_mismatch' | 'fan_out_rate';
  readonly minGeneration?: number;
  readonly maxGeneration?: number;
  readonly gapReason?: LineageGapReason;
  /**
   * `PRD` §6.3's "Hide unlinked" toggle, renamed to what it actually hides.
   *
   * Off by default: research §3.2 shows a missing creator is the regime rather than
   * the exception, so a view that hides them by default hides most of the estate.
   */
  readonly hideAbsentCreators?: boolean;
  readonly identityType?: Identity['type'];
}

export interface LineageService {
  /** The §6.3 table. `O(1)` per row — no walks. */
  list(query?: LineageQuery): readonly LineageRow[];
  /** The §4.3 chain object for one identity, walks included. */
  record(identityId: string): ProvenanceOutcome;
  /** The §6.5 tree, depth-bounded. */
  tree(identityId: string, depth: number): LineageTreeOutcome;
  /** The landing view (§6). */
  coverage(app?: string): LineageCoverageReport;
  /** The fan-out leaderboard, each actor against its own baseline (§4.3). */
  actors(app?: string): readonly FanOutSignal[];
}

/**
 * Per-graph indexes over the two optional dataset tables.
 *
 * Keyed on the graph object itself so they are built once per boot rather than once
 * per request: `buildIdentityGraph` runs at the composition root and the result is
 * immutable, so object identity is a sound cache key. Rebuilding an `O(E)` index
 * inside `list()` would reintroduce exactly the per-row cost the generation memo
 * exists to remove.
 */
interface DatasetIndexes {
  readonly edges: ReadonlyMap<string, PersistedCreationEdge>;
  readonly grants: ReadonlyMap<string, readonly PrivilegeGrantEvent[]>;
}

function indexDataset(graph: IdentityGraph): DatasetIndexes {
  const edges = new Map<string, PersistedCreationEdge>();
  for (const edge of graph.dataset.creation_edges ?? []) {
    edges.set(creationEdgeKey(edge.app, edge.child_id), edge);
  }

  const grants = new Map<string, PrivilegeGrantEvent[]>();
  for (const grant of graph.dataset.privilege_grant_events ?? []) {
    const bucket = grants.get(grant.identity_id);
    if (bucket === undefined) {
      grants.set(grant.identity_id, [grant]);
    } else {
      bucket.push(grant);
    }
  }

  return { edges, grants };
}

/**
 * Employment status of whoever acted — `PRD` §6.3's Creator Status column.
 *
 * An automation creator is `not_a_person` rather than `unknown`: "a bot made this"
 * and "we cannot tell who made this" are different answers, and collapsing them
 * would make the column read as a data gap on a correctly automated estate.
 */
function creatorStatusOf(actor: CreationActor | null, graph: IdentityGraph, hr: HrDirectory): CreatorStatus {
  if (actor === null) {
    return 'unknown';
  }
  if (actor.kind !== 'human') {
    return 'not_a_person';
  }
  const record = hr.person(actor.raw_principal) ?? graph.employeeStatus.get(actor.raw_principal) ?? null;
  return record === null ? 'unknown' : record.status;
}

export function createLineageService(deps: LineageDeps): LineageService {
  let cachedGraph: IdentityGraph | null = null;
  let cachedIndexes: DatasetIndexes | null = null;

  function indexes(graph: IdentityGraph): DatasetIndexes {
    if (cachedGraph !== graph || cachedIndexes === null) {
      cachedGraph = graph;
      cachedIndexes = indexDataset(graph);
    }
    return cachedIndexes;
  }

  function actorFor(graph: IdentityGraph, identity: Identity): CreationActor | null {
    const parentId = identity.provisioned_by;
    return normalizeActor(
      {
        child: identity,
        parent: parentId === null ? null : (graph.byId.get(parentId) ?? null),
        edge: indexes(graph).edges.get(creationEdgeKey(identity.app, identity.id)) ?? null,
        graph,
      },
      deps.normalizers,
    );
  }

  /**
   * The three-state provenance verdict (§4.5).
   *
   * `unexplained` is reached only when there is no creator *and* no rule accounts for
   * the absence. It is never suppressed into a bucket, because that population is the
   * whole subject of `explanation_coverage`.
   */
  function provenanceFor(graph: IdentityGraph, identity: Identity, actor: CreationActor | null): Provenance {
    if (actor !== null) {
      return {
        state: 'recorded',
        actor,
        authorizing_human: resolveAuthorizingHuman(
          { actor, child: identity, graph, hr: deps.hr, policy: deps.accountabilityPolicy },
          deps.humanResolvers,
        ),
      };
    }

    const gap = classifyLineageGap(
      { identity, graph, registry: deps.suppressions, policy: deps.policy },
      deps.gapRules,
    );
    return gap === null ? { state: 'unexplained' } : { state: 'explained_absence', gap };
  }

  function authorityFor(
    graph: IdentityGraph,
    identity: Identity,
    actor: CreationActor | null,
  ): CreationAuthoritySignal | null {
    if (actor === null) {
      return null;
    }
    return evaluateCreationAuthority({
      child: identity,
      actor,
      graph,
      grants: indexes(graph).grants.get(identity.id) ?? [],
      ownership: deps.ownership,
      policy: deps.policy,
      now: deps.clock.now(),
    });
  }

  function fanOutFor(graph: IdentityGraph, identity: Identity): FanOutSignal | null {
    // The actor here is the identity itself acting as a creator, which is a different
    // question from who created it — hence a normalization of the identity, not of
    // its parent edge.
    const asActor = normalizeActor(
      { child: identity, parent: identity, edge: null, graph },
      deps.normalizers,
    );
    if (asActor === null) {
      return null;
    }
    return evaluateFanOut({
      actorId: identity.id,
      actor: { ...asActor, raw_principal: identity.id },
      graph,
      policy: deps.policy,
      now: deps.clock.now(),
    });
  }

  function rowFor(graph: IdentityGraph, identity: Identity): LineageRow {
    const actor = actorFor(graph, identity);
    const authority = authorityFor(graph, identity, actor);
    const rate = fanOutFor(graph, identity);
    const root = inAppRoot(graph, identity);

    return {
      identity_id: identity.id,
      name: identity.name,
      identity_type: identity.type,
      app: identity.app,
      created_by: actor?.raw_principal ?? null,
      generation: graph.generation.get(identity.id) ?? null,
      root_id: root?.id ?? null,
      root_kind: rootKindOf(graph, identity),
      fan_out: fanOut(graph, identity.id),
      fan_out_in_app: fanOutInApp(graph, identity.id),
      created_at: identity.created_at ?? null,
      revoked: identity.revoked === true,
      provenance: provenanceFor(graph, identity, actor),
      creator_status: creatorStatusOf(actor, graph, deps.hr),
      self_authorized: authority?.self_authorized ?? false,
      creator_privilege_mismatch: authority?.creator_privilege_mismatch ?? false,
      fan_out_exceeds_baseline: rate?.exceeds_baseline ?? false,
    };
  }

  function recordFor(graph: IdentityGraph, identity: Identity): ProvenanceRecord {
    const actor = actorFor(graph, identity);
    const depth = deps.accountabilityPolicy.maxChainDepth;
    const root = inAppRoot(graph, identity);

    return {
      identity_id: identity.id,
      app: identity.app,
      identity_type: identity.type,
      generation: graph.generation.get(identity.id) ?? null,
      root_id: root?.id ?? null,
      root_kind: rootKindOf(graph, identity),
      fan_out: fanOut(graph, identity.id),
      fan_out_in_app: fanOutInApp(graph, identity.id),
      provenance: provenanceFor(graph, identity, actor),
      ancestors: ancestorsToRoot(graph, identity, depth),
      descendants: descendants(graph, identity, depth),
      fan_out_signal: fanOutFor(graph, identity),
      creation_authority: authorityFor(graph, identity, actor),
    };
  }

  /** Groups are permission containers, matching `ownership/classify.ts` L186. */
  function population(graph: IdentityGraph, app: string | undefined): readonly Identity[] {
    const scope = app === undefined ? graph.all : (graph.byApp.get(app) ?? []);
    return scope.filter((identity) => identity.type !== 'group');
  }

  function matches(row: LineageRow, query: LineageQuery): boolean {
    if (query.signal === 'self_authorized' && !row.self_authorized) {
      return false;
    }
    if (query.signal === 'creator_privilege_mismatch' && !row.creator_privilege_mismatch) {
      return false;
    }
    if (query.signal === 'fan_out_rate' && !row.fan_out_exceeds_baseline) {
      return false;
    }
    if (query.minGeneration !== undefined && (row.generation ?? -1) < query.minGeneration) {
      return false;
    }
    if (query.maxGeneration !== undefined && (row.generation ?? Number.POSITIVE_INFINITY) > query.maxGeneration) {
      return false;
    }
    if (query.gapReason !== undefined) {
      if (row.provenance.state !== 'explained_absence' || row.provenance.gap.reason !== query.gapReason) {
        return false;
      }
    }
    if (query.hideAbsentCreators === true && row.provenance.state !== 'recorded') {
      return false;
    }
    if (query.identityType !== undefined && row.identity_type !== query.identityType) {
      return false;
    }
    return true;
  }

  return {
    list(query = {}) {
      const graph = deps.graphSource.graph();
      const rows = population(graph, query.app)
        .map((identity) => rowFor(graph, identity))
        .filter((row) => matches(row, query));

      // `PRD` §6.3's default sort puts flagged rows first, then deepest generation.
      // Deliberately *not* a severity: this module ranks nothing (`PRD` L34, §7.2),
      // and a stable presentation order is not a risk ordering. Ownership Assurance
      // remains the only place in the engine that decides what matters most.
      return Object.freeze(
        [...rows].sort((left, right) => {
          const byAuthority = Number(right.self_authorized) - Number(left.self_authorized);
          if (byAuthority !== 0) {
            return byAuthority;
          }
          const byMismatch =
            Number(right.creator_privilege_mismatch) - Number(left.creator_privilege_mismatch);
          if (byMismatch !== 0) {
            return byMismatch;
          }
          const byRate =
            Number(right.fan_out_exceeds_baseline) - Number(left.fan_out_exceeds_baseline);
          if (byRate !== 0) {
            return byRate;
          }
          const byGeneration = (right.generation ?? -1) - (left.generation ?? -1);
          return byGeneration !== 0 ? byGeneration : left.identity_id.localeCompare(right.identity_id);
        }),
      );
    },

    record(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      return { ok: true, record: recordFor(graph, identity) };
    },

    tree(identityId, depth) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      const bounded = Math.max(1, Math.min(depth, deps.accountabilityPolicy.maxChainDepth));
      return {
        ok: true,
        tree: {
          identity_id: identity.id,
          app: identity.app,
          root_id: inAppRoot(graph, identity)?.id ?? null,
          depth: bounded,
          ancestors: ancestorsToRoot(graph, identity, bounded),
          descendants: descendants(graph, identity, bounded),
        },
      };
    },

    coverage(app) {
      const graph = deps.graphSource.graph();
      return buildCoverage(
        graph,
        population(graph, app).map((identity) => recordFor(graph, identity)),
      );
    },

    actors(app) {
      const graph = deps.graphSource.graph();
      const signals = population(graph, app)
        .map((identity) => fanOutFor(graph, identity))
        .filter((signal): signal is FanOutSignal => signal !== null);

      // Ordered by deviation from the actor's own baseline, never by lifetime total:
      // sorting by volume is precisely the leaderboard §4.3 says the analyst mutes.
      return Object.freeze(
        [...signals].sort((left, right) => {
          const byExceeds = Number(right.exceeds_baseline) - Number(left.exceeds_baseline);
          if (byExceeds !== 0) {
            return byExceeds;
          }
          const bySigma = right.deviation_sigma - left.deviation_sigma;
          return bySigma !== 0 ? bySigma : left.actor_id.localeCompare(right.actor_id);
        }),
      );
    },
  };
}
