import type { LineageNode, LineageRootKind, LineageWalk } from '../domain/lineage.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { traverse, type TraversalResult } from '../graph/traverse.js';

/**
 * Turns a completed traversal into the ordered node list the tree view renders.
 *
 * `crosses_app` is derived from `predecessors` rather than from the queried
 * identity's app, because a chain can leave and re-enter a system: the honest
 * question per hop is "did this edge cross a boundary", and research §4.9 requires
 * a correlated edge never render like an observed one.
 */
function toNodes(graph: IdentityGraph, result: TraversalResult): readonly LineageNode[] {
  return Object.freeze(
    result.visited.map((identity): LineageNode => {
      const arrivedFrom = result.predecessors.get(identity.id);
      const previous = arrivedFrom === undefined ? undefined : graph.byId.get(arrivedFrom);
      return {
        identity_id: identity.id,
        identity_type: identity.type,
        app: identity.app,
        name: identity.name,
        distance: result.depthOf.get(identity.id) ?? 0,
        generation: graph.generation.get(identity.id) ?? null,
        created_at: identity.created_at ?? null,
        crosses_app: previous !== undefined && previous.app !== identity.app,
      };
    }),
  );
}

/**
 * Maps the traversal's terminal state onto the lineage vocabulary.
 *
 * The mapping is total on purpose. `PRD` L28 asserts the graph is acyclic and
 * single-parent, so a walk written to the spec would need neither a visited set nor
 * a dangling branch and would loop forever or throw on real data (research §4.8).
 * `graph/traverse.ts` is already correct; this keeps its correctness visible in the
 * type the API returns.
 */
function toWalk(graph: IdentityGraph, result: TraversalResult): LineageWalk {
  const nodes = toNodes(graph, result);
  const stop = result.stop;

  switch (stop.kind) {
    case 'exhausted':
      return { outcome: 'complete', nodes };
    case 'cycle':
      return { outcome: 'cycle_detected', nodes, repeated_id: stop.at };
    case 'dangling':
      return { outcome: 'dangling_reference', nodes, missing_id: stop.missing };
    case 'depth_limit':
      return { outcome: 'depth_limit_exceeded', nodes, limit: stop.limit };
    case 'halted':
      // Structurally unreachable: neither walk below sets `haltOn`, which is the
      // one deliberate difference from F4. Reported as complete rather than thrown,
      // and if a halting condition is ever added, `LineageWalk` needs a variant for
      // it instead of this line quietly absorbing it.
      return { outcome: 'complete', nodes };
  }
}

/**
 * Full ancestor lineage — `PRD` §4.2.3, and the walk F4 deliberately does not do.
 *
 * Two differences from `accountability/trace.ts`, both load-bearing:
 *
 * 1. **No `haltOn`.** F4 stops at the first human because "who is accountable for
 *    this non-human identity" is answered by the nearest one (`trace.ts` L17-22,
 *    which names this PRD as the question it is not answering). Generation, true
 *    roots and the §4.3 chain object all need the walk to continue *past* humans.
 * 2. **It crosses apps.** The per-app forest is what `graph.generation` measures;
 *    this walk answers "where did this ultimately come from", which is the one
 *    question a per-app view cannot answer. Every hop is labelled, so the join stays
 *    visible rather than being presented as one provider's record.
 *
 * `onRevisit: 'stop'` because on a single-parent chain a revisit can only be a
 * cycle. Not a second BFS: research §5 is explicit that a forked ancestor
 * implementation would eventually disagree with F4 on the same dataset in the same
 * demo, which is worse than not shipping it.
 */
export function ancestorsToRoot(graph: IdentityGraph, start: Identity, maxDepth: number): LineageWalk {
  return toWalk(
    graph,
    traverse(graph, start, {
      select: (identity) => (identity.provisioned_by === null ? [] : [identity.provisioned_by]),
      maxDepth,
      onRevisit: 'stop',
    }),
  );
}

/**
 * Everything this identity provisioned, transitively — `PRD` §4.2.4.
 *
 * `onRevisit: 'skip'`, because forward the same identity can be reached by two
 * paths and that is convergence rather than corruption — the distinction
 * `graph/traverse.ts` L10-15 draws, and the same configuration the off-boarding
 * sweep uses. Reads the precomputed inverse index, so no full-forest scan.
 */
export function descendants(graph: IdentityGraph, start: Identity, maxDepth: number): LineageWalk {
  return toWalk(
    graph,
    traverse(graph, start, {
      select: (identity) => graph.provisionedChildren.get(identity.id) ?? [],
      maxDepth,
      onRevisit: 'skip',
    }),
  );
}

/**
 * The root of this identity's own app's tree — `PRD` §3's Root, and the target of
 * §6.5's "jump to root" shortcut.
 *
 * Bounded by the memoized generation rather than by a separate depth cap: the
 * generation *is* the number of same-app hops to the root, so the loop cannot run
 * longer than the answer it is looking for. Null when there is no root, which
 * happens only under a cycle (§4.8).
 */
export function inAppRoot(graph: IdentityGraph, identity: Identity): Identity | null {
  const generation = graph.generation.get(identity.id);
  if (generation === undefined) {
    return null;
  }

  let cursor = identity;
  for (let hop = 0; hop < generation; hop += 1) {
    const parentId = cursor.provisioned_by;
    if (parentId === null) {
      break;
    }
    const parent = graph.byId.get(parentId);
    if (parent === undefined || parent.app !== cursor.app) {
      break;
    }
    cursor = parent;
  }
  return cursor;
}

/**
 * Why this identity's in-app lineage stops where it does.
 *
 * Classifies the *root* of the tree, not the identity itself: "where does this
 * ultimately come from, and is that a real origin or a hole in the audit trail" is
 * the question, and for anything below generation 0 the answer lives at the top of
 * the chain. `PRD` §3 files three very different things under one "Root" definition
 * and §6.6 then asks the UI to tell them apart — so they are told apart once, here,
 * because a distinction each view re-derives is one two views will derive
 * differently.
 */
export function rootKindOf(graph: IdentityGraph, identity: Identity): LineageRootKind {
  const root = inAppRoot(graph, identity);
  if (root === null) {
    return 'none';
  }
  const parentId = root.provisioned_by;
  if (parentId === null) {
    return 'no_creator_recorded';
  }
  const parent = graph.byId.get(parentId);
  if (parent === undefined) {
    return 'creator_unresolvable';
  }
  // The root of a same-app tree cannot itself have a resolvable same-app parent, so
  // reaching here means the chain continues in another system.
  return 'creator_in_other_app';
}

/** Direct children in any app. `O(1)`: the inverse index is built once (§5). */
export function fanOut(graph: IdentityGraph, identityId: string): number {
  return (graph.provisionedChildren.get(identityId) ?? []).length;
}

/** Direct children inside this identity's own app, for the per-app table column. */
export function fanOutInApp(graph: IdentityGraph, identityId: string): number {
  return (graph.sameAppChildren.get(identityId) ?? []).length;
}
