import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { traverse } from '../graph/traverse.js';

export interface Reachability {
  /** Every permission the identity can ultimately exercise, sorted. */
  readonly permissions: readonly string[];
  readonly sensitive: readonly string[];
  /** Identities walked through, origin included. */
  readonly nodes: readonly string[];
}

/**
 * Forward blast radius — F2, reduced to what ranking needs.
 *
 * Configures the shared `traverse` primitive rather than adding a second walker:
 * `onRevisit: 'skip'` because two paths converging on one permission is normal
 * here, unlike the backward accountability walk where a revisit can only mean a
 * corrupt chain.
 *
 * Follows group inheritance and delegation together, which is the point of F3 —
 * an identity's effective access includes permissions nobody granted it directly.
 */
export function reachableAccess(
  graph: IdentityGraph,
  start: Identity,
  maxDepth: number,
): Reachability {
  const result = traverse(graph, start, {
    select: (identity) => [...identity.inherited_from, ...identity.delegates_to],
    maxDepth,
    onRevisit: 'skip',
  });

  const permissions = new Set<string>();
  for (const node of result.visited) {
    for (const permission of node.direct_grants) {
      permissions.add(permission);
    }
  }

  const sorted = [...permissions].sort();
  return {
    permissions: Object.freeze(sorted),
    sensitive: Object.freeze(sorted.filter((permission) => graph.sensitivePermissions.has(permission))),
    nodes: Object.freeze(result.visited.map((node) => node.id)),
  };
}
