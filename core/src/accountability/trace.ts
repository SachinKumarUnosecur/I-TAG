import type { AccountabilityPolicy } from '../domain/policy.js';
import type { AccountabilityTrace, ChainNode } from '../domain/results.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';
import { traverse } from '../graph/traverse.js';

function toChainNode(identity: Identity): ChainNode {
  return { id: identity.id, type: identity.type, name: identity.name };
}

/**
 * F4 — Accountability Trace.
 *
 * Walks `provisioned_by` backward to the accountable human. Not a bespoke walk:
 * it is `traverse` configured with a single-reference selector, so F2 and F11 get
 * the same primitive pointed the other way.
 *
 * Halts at the *first* identity of type `human`, including the queried identity
 * itself. If that human was in turn provisioned by someone else, the walk still
 * stops there: "who is accountable for this non-human identity" is answered by
 * the nearest human, and continuing past them answers a different question — the
 * multi-generation admin lineage that `docs/PRD-delegation-chain.md` covers.
 */
export function traceAccountability(
  graph: IdentityGraph,
  start: Identity,
  policy: AccountabilityPolicy,
): AccountabilityTrace {
  const result = traverse(graph, start, {
    select: (identity) => (identity.provisioned_by === null ? [] : [identity.provisioned_by]),
    maxDepth: policy.maxChainDepth,
    onRevisit: 'stop',
    haltOn: (identity) => identity.type === 'human',
  });

  const chain = result.visited.map(toChainNode);
  const stop = result.stop;

  switch (stop.kind) {
    case 'halted':
      return { termination: 'resolved_human', chain, root_human: stop.at };
    case 'exhausted': {
      // Exhausted means no reference remained. A human would have halted the walk,
      // so the final node is necessarily non-human: a system or break-glass root.
      const last = result.visited[result.visited.length - 1];
      return {
        termination: 'no_human_root',
        chain,
        root_non_human: last === undefined ? start.id : last.id,
      };
    }
    case 'dangling':
      return { termination: 'dangling_reference', chain, missing_id: stop.missing };
    case 'cycle':
      return { termination: 'cycle_detected', chain, repeated_id: stop.at };
    case 'depth_limit':
      return { termination: 'depth_limit_exceeded', chain, limit: stop.limit };
  }
}
