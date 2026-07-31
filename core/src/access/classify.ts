import type { AccessChainStep, AccessPath, AccessPathType } from '../domain/access.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { traverse } from '../graph/traverse.js';

/**
 * The type-specific half of a verdict.
 *
 * Split from `AccessPath` so a rule decides only what it can see — the shape of
 * the chain — while the caller owns the identity and permission columns every
 * path carries regardless of type.
 */
export type AccessClassification =
  | { readonly path_type: 'direct' }
  | { readonly path_type: 'indirect'; readonly via_group: string }
  | { readonly path_type: 'hop'; readonly via_permission: string; readonly assumed_identity: string };

export interface AccessPathContext {
  readonly identity: Identity;
  readonly graph: IdentityGraph;
  /** Every edge from the identity to the terminal permission, in order. */
  readonly chain: readonly AccessChainStep[];
}

/**
 * One path-type verdict.
 *
 * Frozen registry in precedence order, the same mechanism as
 * `DEFAULT_LINEAGE_GAP_RULES` and `DEFAULT_OWNERSHIP_RULES`: a fourth path type —
 * `PRD` §8 raises OAuth sub-classification as an open question — is an appended
 * object, not an edited conditional.
 *
 * Contract: never throws, and returns either a fully populated classification or
 * null so the next rule runs.
 */
export interface AccessPathRule {
  readonly id: string;
  classify(context: AccessPathContext): AccessClassification | null;
}

/**
 * Hop first, because `PRD` L99 makes it an override rather than an alternative.
 *
 * A path that crosses into a resource and out through the principal it carries is
 * a hop no matter how many memberships preceded it: the mechanism is the finding,
 * and reporting the same path as `indirect` because a group appeared earlier would
 * hide exactly the escalation §1 says native tooling misses.
 *
 * The *first* crossing is reported rather than the last. Both are true; only the
 * first names the grant that closes the path for this identity, which is what a
 * reviewer acts on.
 */
const hopRule: AccessPathRule = {
  id: 'hop',
  classify({ chain }) {
    const crossing = chain.findIndex((step) => step.edge === 'ASSUMES_ROLE');
    if (crossing === -1) {
      return null;
    }
    const step = chain[crossing];
    return step === undefined
      ? null
      : { path_type: 'hop', via_permission: step.from, assumed_identity: step.to };
  },
};

/** `PRD` L57 — the policy is on a container the identity belongs to. */
const indirectRule: AccessPathRule = {
  id: 'indirect',
  classify({ chain }) {
    const membership = chain.find((step) => step.edge === 'MEMBER_OF');
    return membership === undefined ? null : { path_type: 'indirect', via_group: membership.to };
  },
};

/** `PRD` L56 — a single `HAS_POLICY` edge off the identity itself. */
const directRule: AccessPathRule = {
  id: 'direct',
  classify() {
    return { path_type: 'direct' };
  },
};

export const DEFAULT_ACCESS_PATH_RULES: readonly AccessPathRule[] = Object.freeze([
  hopRule,
  indirectRule,
  directRule,
]);

export function classifyChain(
  context: AccessPathContext,
  rules: readonly AccessPathRule[] = DEFAULT_ACCESS_PATH_RULES,
): AccessClassification {
  for (const rule of rules) {
    const verdict = rule.classify(context);
    if (verdict !== null) {
      return verdict;
    }
  }
  // Unreachable while `directRule` terminates the list, and reported rather than
  // thrown so a caller that supplies its own registry gets a path instead of a
  // crash mid-scan.
  return { path_type: 'direct' };
}

/**
 * The principals an identity's access flows through.
 *
 * Configures the shared `traverse` primitive rather than adding a second walker,
 * exactly as `ownership/reach.ts` does. Two reference kinds, and the second is the
 * whole module: `inherited_from` is `MEMBER_OF`, and a directly held permission
 * that binds to a principal is the `CAN_ACCESS → ASSUMES_ROLE` pair of `PRD` L58.
 *
 * `delegates_to` is deliberately absent. It records what an identity provisioned,
 * and `PRD` L58 is explicit that a hop is *not* an identity-to-identity
 * relationship — reading creation lineage as an access path would manufacture
 * escalations that no credential supports.
 */
function accessSelector(graph: IdentityGraph): (identity: Identity) => readonly string[] {
  return (identity) => {
    const bound: string[] = [];
    for (const permission of identity.direct_grants) {
      const principal = graph.permissionBindings.get(permission);
      if (principal !== undefined) {
        bound.push(principal);
      }
    }
    return [...identity.inherited_from, ...bound];
  };
}

/** The edges between two adjacent principals, which is two steps across a binding. */
function stepsBetween(graph: IdentityGraph, from: Identity, toId: string): readonly AccessChainStep[] {
  if (from.inherited_from.includes(toId)) {
    return [{ from: from.id, to: toId, edge: 'MEMBER_OF', mechanism: 'group membership' }];
  }

  for (const permission of [...from.direct_grants].sort()) {
    if (graph.permissionBindings.get(permission) !== toId) {
      continue;
    }
    return [
      { from: from.id, to: permission, edge: 'CAN_ACCESS', mechanism: `granted ${permission}` },
      { from: permission, to: toId, edge: 'ASSUMES_ROLE', mechanism: `resource carries ${toId}` },
    ];
  }

  return [];
}

/**
 * Every route from one identity to every permission it can reach.
 *
 * **One route per (principal, permission) pair, and that is a documented departure
 * from `PRD` L101.** The PRD asks for every distinct route to a terminal
 * permission, because closing one does not close the others. What is emitted here
 * is every distinct *source* of a permission — each principal holding it produces
 * its own path — while two memberships converging on the same principal collapse
 * to the one route `traverse.predecessors` records. That covers the remediation
 * case L101 argues for (revoking the role does not revoke the group) and stops
 * short of full path enumeration, which `traverse` cannot express: its
 * `predecessors` map is one parent per node by construction, and a second walker
 * that could enumerate them would be the duplicate BFS `docs/ITAG.md` §3 forbids.
 *
 * Never throws. A malformed graph surfaces through the traversal's `stop` state
 * and simply bounds what was reached.
 */
export function discoverAccess(
  graph: IdentityGraph,
  start: Identity,
  maxDepth: number,
  rules: readonly AccessPathRule[] = DEFAULT_ACCESS_PATH_RULES,
): readonly AccessPath[] {
  const result = traverse(graph, start, {
    select: accessSelector(graph),
    maxDepth,
    // Convergence, not corruption: two groups legitimately lead to one role, which
    // is the opposite of the backward accountability walk where a revisit can only
    // mean a broken chain.
    onRevisit: 'skip',
  });

  /** Chain from `start` to each visited principal, memoized as the walk unwinds. */
  const chainTo = new Map<string, readonly AccessChainStep[]>([[start.id, []]]);
  function prefixFor(node: Identity): readonly AccessChainStep[] {
    const known = chainTo.get(node.id);
    if (known !== undefined) {
      return known;
    }
    const parentId = result.predecessors.get(node.id);
    const parent = parentId === undefined ? undefined : graph.byId.get(parentId);
    const prefix =
      parent === undefined ? [] : [...prefixFor(parent), ...stepsBetween(graph, parent, node.id)];
    chainTo.set(node.id, prefix);
    return prefix;
  }

  const paths: AccessPath[] = [];
  for (const node of result.visited) {
    const prefix = prefixFor(node);
    for (const permission of [...node.direct_grants].sort()) {
      const chain: readonly AccessChainStep[] = [
        ...prefix,
        { from: node.id, to: permission, edge: 'HAS_POLICY', mechanism: `holds ${permission}` },
      ];
      const classification = classifyChain({ identity: start, graph, chain }, rules);
      paths.push({
        ...classification,
        identity_id: start.id,
        app: start.app,
        identity_type: start.type,
        permission,
        sensitive: graph.sensitivePermissions.has(permission),
        hop_count: chain.length,
        chain: Object.freeze(chain),
      });
    }
  }

  // `PRD` L183 sorts hop first, then sensitivity, so the highest-value rows are on
  // page 1 with no filter configured. Presentation order only — it ranks nothing,
  // and carries no severity a consumer could mistake for one.
  return Object.freeze([...paths].sort(comparePaths));
}

const TYPE_ORDER: Readonly<Record<AccessPathType, number>> = Object.freeze({
  hop: 0,
  indirect: 1,
  direct: 2,
});

export function comparePaths(left: AccessPath, right: AccessPath): number {
  const byType = TYPE_ORDER[left.path_type] - TYPE_ORDER[right.path_type];
  if (byType !== 0) {
    return byType;
  }
  const bySensitivity = Number(right.sensitive) - Number(left.sensitive);
  if (bySensitivity !== 0) {
    return bySensitivity;
  }
  const byHops = right.hop_count - left.hop_count;
  return byHops !== 0 ? byHops : left.permission.localeCompare(right.permission);
}
