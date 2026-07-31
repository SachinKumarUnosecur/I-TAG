import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from './build.js';

/** Picks which references to follow from a node. Determines traversal direction. */
export type ReferenceSelector = (identity: Identity) => readonly string[];

/**
 * What to do when a reference resolves to an already-visited node.
 *
 * `stop` — the revisit is a cycle and the walk halts. Correct for single-parent
 * chains like `provisioned_by`, where a loop can only mean corrupt data.
 *
 * `skip` — the revisit is convergence and the walk continues. Correct for the
 * forward blast radius (F2), where two paths reaching one permission is normal.
 */
export type RevisitPolicy = 'stop' | 'skip';

export type TraversalStop =
  | { readonly kind: 'exhausted' }
  | { readonly kind: 'halted'; readonly at: string }
  | { readonly kind: 'dangling'; readonly from: string; readonly missing: string }
  | { readonly kind: 'cycle'; readonly at: string }
  | { readonly kind: 'depth_limit'; readonly limit: number };

export interface TraversalOptions {
  readonly select: ReferenceSelector;
  readonly maxDepth: number;
  /** Defaults to `skip`. */
  readonly onRevisit?: RevisitPolicy;
  /** Halts the walk as soon as it returns true, including on the origin node. */
  readonly haltOn?: (identity: Identity, depth: number) => boolean;
}

export interface TraversalResult {
  /**
   * Nodes in visit order, origin first. When `select` yields at most one
   * reference per node this is the ordered path; when it can branch, use
   * `predecessors` to reconstruct individual paths.
   */
  readonly visited: readonly Identity[];
  readonly depthOf: ReadonlyMap<string, number>;
  /** child id -> parent id, for path reconstruction by branching consumers. */
  readonly predecessors: ReadonlyMap<string, string>;
  readonly stop: TraversalStop;
}

/**
 * Breadth-first walk over identity references.
 *
 * The single traversal primitive for the whole engine, per `docs/ITAG.md` §3:
 * accountability (F4) configures it with `provisioned_by` and `onRevisit: 'stop'`;
 * blast radius (F2) will configure it with the grant/inheritance/delegation
 * references and `onRevisit: 'skip'`; the off-boarding sweep (F11) walks the
 * inverse via `graph.provisionedChildren`. It never branches on identity type.
 *
 * References are visited in sorted order so results are stable across runs.
 * Pathological graph shapes are reported through `stop`, never thrown.
 */
export function traverse(
  graph: IdentityGraph,
  start: Identity,
  options: TraversalOptions,
): TraversalResult {
  const revisitPolicy: RevisitPolicy = options.onRevisit ?? 'skip';

  const visited: Identity[] = [start];
  const seen = new Set<string>([start.id]);
  const depthOf = new Map<string, number>([[start.id, 0]]);
  const predecessors = new Map<string, string>();

  if (options.haltOn?.(start, 0) === true) {
    return { visited, depthOf, predecessors, stop: { kind: 'halted', at: start.id } };
  }

  const queue: Identity[] = [start];
  let stop: TraversalStop = { kind: 'exhausted' };
  let finished = false;

  while (queue.length > 0 && !finished) {
    const current = queue.shift();
    if (current === undefined) {
      break;
    }
    const depth = depthOf.get(current.id) ?? 0;

    for (const reference of [...options.select(current)].sort()) {
      if (depth + 1 > options.maxDepth) {
        stop = { kind: 'depth_limit', limit: options.maxDepth };
        finished = true;
        break;
      }

      const next = graph.byId.get(reference);
      if (next === undefined) {
        stop = { kind: 'dangling', from: current.id, missing: reference };
        finished = true;
        break;
      }

      if (seen.has(next.id)) {
        if (revisitPolicy === 'stop') {
          stop = { kind: 'cycle', at: next.id };
          finished = true;
          break;
        }
        continue;
      }

      seen.add(next.id);
      depthOf.set(next.id, depth + 1);
      predecessors.set(next.id, current.id);
      visited.push(next);

      if (options.haltOn?.(next, depth + 1) === true) {
        stop = { kind: 'halted', at: next.id };
        finished = true;
        break;
      }

      queue.push(next);
    }
  }

  return { visited, depthOf, predecessors, stop };
}
