import type { FootprintNode, ResidualFootprint } from '../domain/ownership-results.js';
import type { Clock, GraphSource, HrDirectory } from '../domain/ports.js';
import type { AccountabilityPolicy } from '../domain/policy.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { traverse } from '../graph/traverse.js';

export interface SweepDeps {
  readonly graphSource: GraphSource;
  readonly hr: HrDirectory;
  readonly clock: Clock;
  readonly policy: AccountabilityPolicy;
}

export interface SweepService {
  /** Every departed human with a live downstream footprint, worst first. */
  all(): readonly ResidualFootprint[];
  /** Null when the id is not a human, or not departed. */
  forHuman(humanId: string): ResidualFootprint | null;
}

/**
 * F11 — off-boarding debt.
 *
 * The same walk as F4/F5 pointed the other way: `graph.provisionedChildren` is
 * the precomputed inverse of `provisioned_by`, and `traverse` supplies the
 * visited set. Deliberately not a second BFS — `docs/orphaned-identity-research.md`
 * §5 notes that two implementations of this walk will eventually disagree with
 * each other, which is worse than shipping only one view.
 *
 * `onRevisit: 'skip'` rather than `'stop'`: downstream fan-out converges (two
 * service accounts spawning the same agent is normal), so a revisit here is not
 * the corrupt-chain signal it is on the backward walk.
 */
export function createSweepService(deps: SweepDeps): SweepService {
  function footprintFor(graph: IdentityGraph, human: Identity): ResidualFootprint {
    const result = traverse(graph, human, {
      select: (identity) => graph.provisionedChildren.get(identity.id) ?? [],
      maxDepth: deps.policy.maxChainDepth,
      onRevisit: 'skip',
    });

    const live: FootprintNode[] = [];
    let revokedCount = 0;
    const sensitive = new Set<string>();
    let crossesApps = false;

    for (const node of result.visited) {
      if (node.id === human.id) {
        continue;
      }
      if (node.revoked === true) {
        revokedCount += 1;
        continue;
      }

      const nodeSensitive = node.direct_grants.filter((permission) =>
        graph.sensitivePermissions.has(permission),
      );
      for (const permission of nodeSensitive) {
        sensitive.add(permission);
      }
      if (node.app !== human.app) {
        crossesApps = true;
      }

      live.push({
        identity_id: node.id,
        identity_type: node.type,
        app: node.app,
        hops: result.depthOf.get(node.id) ?? 0,
        sensitive_permissions: Object.freeze([...nodeSensitive].sort()),
      });
    }

    const record = deps.hr.person(human.id);
    return {
      human_id: human.id,
      human_name: human.name,
      departed_since: record === null ? null : (record.effective_from ?? record.last_reviewed),
      live: Object.freeze([...live].sort((left, right) => left.hops - right.hops)),
      revoked_count: revokedCount,
      max_hops: live.reduce((deepest, node) => Math.max(deepest, node.hops), 0),
      sensitive_reachable: Object.freeze([...sensitive].sort()),
      crosses_apps: crossesApps,
    };
  }

  function isDeparted(identity: Identity): boolean {
    if (identity.type !== 'human') {
      return false;
    }
    const status = deps.hr.person(identity.id)?.status;
    return status === 'departed' || status === 'role_changed';
  }

  return {
    all() {
      const graph = deps.graphSource.graph();
      const footprints = graph.all
        .filter((identity) => isDeparted(identity))
        .map((human) => footprintFor(graph, human))
        .filter((footprint) => footprint.live.length > 0);

      // Sensitive exposure first, then breadth, then depth: "how much of this is
      // dangerous" outranks "how much of this is there".
      return Object.freeze(
        [...footprints].sort((left, right) => {
          const bySensitive = right.sensitive_reachable.length - left.sensitive_reachable.length;
          if (bySensitive !== 0) {
            return bySensitive;
          }
          const byBreadth = right.live.length - left.live.length;
          return byBreadth !== 0 ? byBreadth : right.max_hops - left.max_hops;
        }),
      );
    },

    forHuman(humanId) {
      const graph = deps.graphSource.graph();
      const human = graph.byId.get(humanId);
      if (human === undefined || !isDeparted(human)) {
        return null;
      }
      return footprintFor(graph, human);
    },
  };
}
