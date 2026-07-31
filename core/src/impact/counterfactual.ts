import type { GraphSource } from '../domain/ports.js';
import type { IdentityDataset, PermissionRecord } from '../domain/types.js';
import { buildIdentityGraph } from '../graph/build.js';

/**
 * The what-if graph — `ITAG.md` §F7 L97-101 and research §4.1.
 *
 * F7 specified this eighteen months before the PRD did, and its constraint is the
 * one that matters: "Re-run the forward traversal (F2) immediately on a modified
 * in-memory copy… Fully non-destructive — toggles never touch the base seed
 * dataset." `domain/ports.ts` L24-26 anticipates the same thing from the other
 * side, listing "a simulation source returning a mutated copy" as a planned
 * `GraphSource` implementation.
 *
 * **Non-destructiveness here is structural, not disciplinary.** `buildIdentityGraph`
 * is a pure function of an `IdentityDataset`, so a counterfactual is a *second
 * graph over a copied dataset* rather than an edit to the first. There is no code
 * path in this file that could write to the seed even if someone tried: the only
 * thing it constructs is a new permission array, and `Object.freeze` on the seed
 * would fail loudly rather than silently if it ever became a target.
 *
 * **No second traversal.** Architecture rule 1 fixes the engine at one walker, and
 * this file does not add one. It produces a graph; whoever wants to walk it uses
 * `traverse` through `access/classify.ts` exactly as they would on the real one.
 * That is the whole trick — the counterfactual is a different *input*, not a
 * different algorithm, which is why the numbers it produces are comparable to the
 * baseline at all.
 */

/**
 * Strips the pivot edge from one permission, preserving everything else about it.
 *
 * The tri-state of `sensitive` is preserved exactly, including its absence.
 * `graph/build.ts` reads `=== true` for sensitive and `=== undefined` for
 * unclassified (PRD Amendment 3), so rebuilding a record with `sensitive` present
 * but undefined would be equivalent today and a latent bug the moment anyone
 * distinguishes an absent key from an undefined one. The two branches are the
 * price of not having to think about that again.
 */
function withoutPivotEdge(permission: PermissionRecord): PermissionRecord {
  return permission.sensitive === undefined
    ? { id: permission.id }
    : { id: permission.id, sensitive: permission.sensitive };
}

/**
 * A `GraphSource` over the estate as it would be if these grants stopped conferring
 * a principal.
 *
 * Takes a set rather than a single id because the greedy arm of the choke-point
 * selector (research §4.4) evaluates an accumulating selection, and a
 * sever-one-thing signature would force it either to re-derive the dataset itself
 * or to call this in a loop that rebuilds from the wrong base. One code path for
 * both arms; the exhaustive arm simply passes a set of one.
 *
 * Severing removes a binding and changes nothing else, so the result is valid by
 * construction and `validateDataset` is deliberately not re-run. Its one relevant
 * check is that `grants_identity` names an existing principal (`data/validate.ts`
 * L43-55), and dropping a binding can only make that easier to satisfy — a second
 * pass would cost `O(n)` per candidate to re-prove something arithmetic already
 * guarantees.
 *
 * The graph is built once and closed over, matching `seedGraphSource`: a
 * `GraphSource` whose `graph()` returned a different object per call would make
 * every identity comparison in a consumer accidentally false.
 */
export function severingBindings(
  dataset: IdentityDataset,
  permissionIds: Iterable<string>,
): GraphSource {
  const severed = new Set(permissionIds);

  const permissions = dataset.permissions.map((permission) =>
    severed.has(permission.id) && permission.grants_identity !== undefined
      ? withoutPivotEdge(permission)
      : permission,
  );

  const graph = buildIdentityGraph({ ...dataset, permissions: Object.freeze(permissions) });
  return Object.freeze({ graph: () => graph });
}
