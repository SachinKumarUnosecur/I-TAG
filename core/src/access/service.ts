import type {
  AccessCounts,
  AccessOutcome,
  AccessPath,
  AccessPathType,
  AccessRow,
  AccessSummary,
  IdentityAccessProfile,
} from '../domain/access.js';
import type { OwnerRef } from '../domain/ownership.js';
import type { AccountabilityPolicy } from '../domain/policy.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { Identity, IdentityType } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { comparePaths, discoverAccess, type AccessPathRule } from './classify.js';

/**
 * Ownership Assurance's answer for `PRD` §6.3's Owner column, as a narrow port.
 *
 * One method, injected, for the same reason `OwnershipStateSource` exists in
 * `lineage/signals.ts`: this module must not import the ownership module. `PRD`
 * §2.1 has Ownership *reading* Access Discovery for its own grant-level
 * attribution, and a direct import in this direction would close that loop the
 * moment it happens. Only the composition root knows both sides.
 *
 * Implementations must memoize — resolution runs a traversal per identity, so an
 * un-memoized source turns a linear table scan quadratic.
 */
export interface AccessOwnerSource {
  /** Null when nothing resolves an owner, which `PRD` §6.3 renders as "Unowned". */
  owner(identityId: string): OwnerRef | null;
}

export interface AccessDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  readonly owners: AccessOwnerSource;
  /** Supplies `maxChainDepth`, the same bound the other walks honour. */
  readonly policy: AccountabilityPolicy;
  readonly rules?: readonly AccessPathRule[];
}

/** `PRD` §6.2's filter bar. Filters combine with AND, as specified. */
export interface AccessQuery {
  readonly app?: string;
  readonly pathType?: AccessPathType;
  readonly identityType?: IdentityType;
  /** `PRD` §6.3's Resource Sensitivity column, reduced to the flag the model carries. */
  readonly sensitiveOnly?: boolean;
  readonly minHopCount?: number;
  readonly maxHopCount?: number;
}

export interface AccessService {
  /** The §6.3 table, hop first. */
  list(query?: AccessQuery): readonly AccessRow[];
  /** The §6.6 rollup and §6.9 per-user page. Never throws on an unknown id. */
  profile(identityId: string): AccessOutcome;
  /** The §6.4 summary strip — the landing view. */
  summary(query?: AccessQuery): AccessSummary;
}

function emptyCounts(): { direct: number; indirect: number; hop: number } {
  return { direct: 0, indirect: 0, hop: 0 };
}

function tally(paths: readonly AccessPath[]): AccessCounts {
  const counts = emptyCounts();
  for (const path of paths) {
    counts[path.path_type] += 1;
  }
  return Object.freeze(counts);
}

/**
 * `PRD` §6.4's one-line finding, generated only when there is a hop to describe.
 *
 * Names the sensitive terminal permission when there is one, because "can reach
 * production admin" and "can reach a staging deploy" are different sentences and
 * flattening them is how a green row starts reading red.
 */
function hopSentence(name: string, paths: readonly AccessPath[]): string | null {
  const hops = paths.filter((path) => path.path_type === 'hop');
  const [worst] = [...hops].sort(comparePaths);
  if (worst === undefined || worst.path_type !== 'hop') {
    return null;
  }
  return (
    `${name} can reach ${worst.permission} by connecting to ${worst.via_permission}, ` +
    `which carries ${worst.assumed_identity} — no policy grants it directly or through any group`
  );
}

export function createAccessService(deps: AccessDeps): AccessService {
  /**
   * Groups are excluded, matching `ownership/classify.ts` L186 and
   * `lineage/service.ts`'s population.
   *
   * Here the reason is arithmetic as well as conceptual: a group's grants already
   * appear as the `indirect` paths of every member, so listing the group as its own
   * subject would count the same permission twice in §6.4's strip and make the
   * headline number depend on how the estate happens to be foldered.
   */
  function population(graph: IdentityGraph, app: string | undefined): readonly Identity[] {
    const scope = app === undefined ? graph.all : (graph.byApp.get(app) ?? []);
    return scope.filter((identity) => identity.type !== 'group');
  }

  function pathsFor(graph: IdentityGraph, identity: Identity): readonly AccessPath[] {
    return discoverAccess(graph, identity, deps.policy.maxChainDepth, deps.rules);
  }

  function matches(path: AccessPath, query: AccessQuery): boolean {
    if (query.pathType !== undefined && path.path_type !== query.pathType) {
      return false;
    }
    if (query.identityType !== undefined && path.identity_type !== query.identityType) {
      return false;
    }
    if (query.sensitiveOnly === true && !path.sensitive) {
      return false;
    }
    if (query.minHopCount !== undefined && path.hop_count < query.minHopCount) {
      return false;
    }
    if (query.maxHopCount !== undefined && path.hop_count > query.maxHopCount) {
      return false;
    }
    return true;
  }

  function profileFor(graph: IdentityGraph, identity: Identity): IdentityAccessProfile {
    const paths = pathsFor(graph, identity);
    const permissions = [...new Set(paths.map((path) => path.permission))].sort();

    return {
      identity_id: identity.id,
      name: identity.name,
      identity_type: identity.type,
      app: identity.app,
      counts: tally(paths),
      reachable_permissions: Object.freeze(permissions),
      sensitive_permissions: Object.freeze(
        permissions.filter((permission) => graph.sensitivePermissions.has(permission)),
      ),
      paths,
      hop_summary: hopSentence(identity.name, paths),
    };
  }

  return {
    list(query = {}) {
      const graph = deps.graphSource.graph();
      const rows: AccessRow[] = [];

      for (const identity of population(graph, query.app)) {
        for (const path of pathsFor(graph, identity)) {
          if (matches(path, query)) {
            rows.push({ path, owner: deps.owners.owner(identity.id) });
          }
        }
      }

      return Object.freeze(
        [...rows].sort((left, right) => {
          const byPath = comparePaths(left.path, right.path);
          return byPath !== 0
            ? byPath
            : left.path.identity_id.localeCompare(right.path.identity_id);
        }),
      );
    },

    profile(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      return { ok: true, profile: profileFor(graph, identity) };
    },

    summary(query = {}) {
      const graph = deps.graphSource.graph();
      const scope = population(graph, query.app);
      const counts = emptyCounts();
      let withHop = 0;

      for (const identity of scope) {
        let hasHop = false;
        for (const path of pathsFor(graph, identity)) {
          if (!matches(path, query)) {
            continue;
          }
          counts[path.path_type] += 1;
          hasHop = hasHop || path.path_type === 'hop';
        }
        if (hasHop) {
          withHop += 1;
        }
      }

      return {
        counts: Object.freeze(counts),
        identities_with_hop: withHop,
        identities_scanned: scope.length,
        // `PRD` §4.4 requires every consumer to be able to date the facts it read.
        // From the injected clock, so the demo's pinned instant is reproducible.
        snapshot: { graph_snapshot_at: deps.clock.now().toISOString() },
      };
    },
  };
}
