import type { AppRecord, EmployeeRecord, Identity, IdentityDataset } from '../domain/types.js';

/** One creation-lineage edge, scoped to the app whose audit log recorded it. */
export interface CreationEdge {
  readonly app: string;
  readonly child_id: string;
  readonly parent_id: string;
}

/**
 * Composite key for a creation edge.
 *
 * `(app, child_id)` is the identifying pair per `docs/PRD-delegation-chain.md`
 * §4.1: an identity has at most one creator *within an app*, and the same person
 * may have a separate, unrelated creation record in another app.
 */
export function creationEdgeKey(app: string, childId: string): string {
  return `${app}\u0000${childId}`;
}

/**
 * Immutable index over a dataset, built once at startup.
 *
 * `provisionedChildren` is the precomputed inverse of `provisioned_by`, so the
 * off-boarding sweep (F11) can walk downstream from a departed human without
 * rescanning every identity.
 */
export interface IdentityGraph {
  readonly all: readonly Identity[];
  readonly byId: ReadonlyMap<string, Identity>;
  readonly provisionedChildren: ReadonlyMap<string, readonly string[]>;
  readonly employeeStatus: ReadonlyMap<string, EmployeeRecord>;
  readonly sensitivePermissions: ReadonlySet<string>;
  /**
   * Permission id -> the principal holding it confers, for `PRD` §4.2's hop check.
   *
   * Precomputed here for the same reason `generation` is: the classifier asks this
   * question once per grant per identity, and rescanning the permission table per
   * row would make an `O(V·P)` walk out of an `O(V+E)` one. Only permissions that
   * actually bind appear, so a `has` on this map is the hop test itself.
   */
  readonly permissionBindings: ReadonlyMap<string, string>;
  readonly apps: ReadonlyMap<string, AppRecord>;
  /** Identities grouped by app, for the per-app views the Unosecur model expects. */
  readonly byApp: ReadonlyMap<string, readonly Identity[]>;
  /**
   * Same-app creation edges only, keyed by `creationEdgeKey`.
   *
   * This is the per-app forest `docs/PRD-delegation-chain.md` §4.2 describes, and
   * it is deliberately incomplete: a chain that hops systems is absent here, so a
   * per-app view cannot silently present a merged lineage as if one app had
   * recorded it.
   */
  readonly creationEdges: ReadonlyMap<string, CreationEdge>;
  /**
   * Creation edges whose parent lives in another app.
   *
   * Held separately rather than mixed in, per `docs/orphaned-identity-research.md`
   * §4.4: storage stays app-scoped, and joining the fragments is an explicit
   * analysis-layer act. These are the edges that make "what did this departed
   * person leave behind *across every system*" answerable.
   */
  readonly crossAppEdges: ReadonlyMap<string, CreationEdge>;
  /**
   * Inverse of the same-app creation edges — the per-app forest, walkable downward.
   *
   * Distinct from `provisionedChildren`, which spans apps because the off-boarding
   * sweep has to follow a departed person's estate wherever it went. This one keeps
   * `graph.byApp` a partition, so a per-app fan-out or generation figure cannot be
   * inflated by a chain that hopped systems.
   */
  readonly sameAppChildren: ReadonlyMap<string, readonly string[]>;
  /**
   * Same-app creation hops from the in-app root, computed once at build.
   *
   * `docs/PRD-delegation-chain.md` §3 defines this (root = generation 0) and §6.3
   * makes it a sortable column. Memoized here rather than derived per row because
   * `docs/delegation-chain-research.md` §5 identifies recomputing it at render time
   * as the one thing that actually breaks the table view at 100k identities: one
   * bottom-up pass is `O(V)`, per-row ancestor walks are `O(V·d)`.
   *
   * An id is **absent** rather than null when no generation exists, which happens
   * only when the walk above it loops (§4.8) and so it has no root. Absence is used
   * instead of a sentinel so a caller cannot accidentally do arithmetic on it.
   *
   * Deliberately not a risk signal. Research §4.2 deletes the `deep_chain` flag
   * `PRD` L62 specifies: measured on this repo's own seed the maximum real
   * generation is 3 against a proposed threshold of >4, so it fires on nothing here
   * and on a customer's cleanest IaC pipeline there.
   */
  readonly generation: ReadonlyMap<string, number>;
  /** Retained so F9 (control history) and F10 (half-lives) need no new plumbing. */
  readonly dataset: IdentityDataset;
}

/**
 * Assigns every identity its distance from the root of its own app's forest.
 *
 * Iterative rather than recursive: the walk depth is data-controlled, and a
 * pathological chain must produce a terminal answer rather than a stack overflow —
 * the same rule the traversal primitive follows.
 *
 * `O(V)` overall. Each identity is pushed onto a pending path at most once, because
 * the moment it leaves that path it is recorded in `generation` or in `rootless` and
 * every later walk short-circuits on it.
 */
function buildGenerations(
  identities: readonly Identity[],
  parentOf: ReadonlyMap<string, string>,
): ReadonlyMap<string, number> {
  const generation = new Map<string, number>();
  /** Proven to have no root, because the chain above it loops back on itself. */
  const rootless = new Set<string>();

  for (const identity of identities) {
    if (generation.has(identity.id) || rootless.has(identity.id)) {
      continue;
    }

    // Ids whose generation is still unknown, deepest first.
    const pending: string[] = [];
    const onPath = new Set<string>();
    let cursor = identity.id;
    /** Generation of the *last* element of `pending`, or null if there is no root. */
    let deepest: number | null = null;

    for (;;) {
      const settled = generation.get(cursor);
      if (settled !== undefined) {
        // Not pushed, so the last pending id is this node's child.
        deepest = settled + 1;
        break;
      }
      if (rootless.has(cursor) || onPath.has(cursor)) {
        deepest = null;
        break;
      }

      onPath.add(cursor);
      pending.push(cursor);

      const parent = parentOf.get(cursor);
      if (parent === undefined) {
        // No resolvable same-app creator: this node is the root of its own tree.
        deepest = 0;
        break;
      }
      cursor = parent;
    }

    if (deepest === null) {
      for (const id of pending) {
        rootless.add(id);
      }
      continue;
    }

    let value = deepest;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const id = pending[index];
      if (id !== undefined) {
        generation.set(id, value);
        value += 1;
      }
    }
  }

  return generation;
}

export function buildIdentityGraph(dataset: IdentityDataset): IdentityGraph {
  const byId = new Map<string, Identity>();
  for (const identity of dataset.identities) {
    byId.set(identity.id, identity);
  }

  const children = new Map<string, string[]>();
  for (const identity of dataset.identities) {
    const parentId = identity.provisioned_by;
    if (parentId === null) {
      continue;
    }
    const bucket = children.get(parentId);
    if (bucket === undefined) {
      children.set(parentId, [identity.id]);
    } else {
      bucket.push(identity.id);
    }
  }

  const provisionedChildren = new Map<string, readonly string[]>();
  for (const [parentId, ids] of children) {
    provisionedChildren.set(parentId, Object.freeze([...ids].sort()));
  }

  const employeeStatus = new Map<string, EmployeeRecord>();
  for (const [id, record] of Object.entries(dataset.employee_status)) {
    employeeStatus.set(id, record);
  }

  const sensitivePermissions = new Set<string>();
  const permissionBindings = new Map<string, string>();
  for (const permission of dataset.permissions) {
    if (permission.sensitive === true) {
      sensitivePermissions.add(permission.id);
    }
    if (permission.grants_identity !== undefined) {
      permissionBindings.set(permission.id, permission.grants_identity);
    }
  }

  const apps = new Map<string, AppRecord>();
  for (const app of dataset.apps) {
    apps.set(app.id, app);
  }

  const grouped = new Map<string, Identity[]>();
  const creationEdges = new Map<string, CreationEdge>();
  const crossAppEdges = new Map<string, CreationEdge>();
  for (const identity of dataset.identities) {
    const bucket = grouped.get(identity.app);
    if (bucket === undefined) {
      grouped.set(identity.app, [identity]);
    } else {
      bucket.push(identity);
    }

    if (identity.provisioned_by !== null) {
      const edge: CreationEdge = {
        app: identity.app,
        child_id: identity.id,
        parent_id: identity.provisioned_by,
      };
      const parent = byId.get(identity.provisioned_by);
      const target = parent !== undefined && parent.app !== identity.app ? crossAppEdges : creationEdges;
      target.set(creationEdgeKey(identity.app, identity.id), edge);
    }
  }

  const byApp = new Map<string, readonly Identity[]>();
  for (const [appId, identities] of grouped) {
    byApp.set(appId, Object.freeze([...identities]));
  }

  // A dangling edge stays in `creationEdges` by design (it is the per-app forest's
  // own data-integrity finding), so the parent is re-checked here: an unresolvable
  // creator cannot supply a generation, which makes its child an in-app root.
  const sameAppParent = new Map<string, string>();
  const sameAppKids = new Map<string, string[]>();
  for (const edge of creationEdges.values()) {
    if (!byId.has(edge.parent_id)) {
      continue;
    }
    sameAppParent.set(edge.child_id, edge.parent_id);
    const bucket = sameAppKids.get(edge.parent_id);
    if (bucket === undefined) {
      sameAppKids.set(edge.parent_id, [edge.child_id]);
    } else {
      bucket.push(edge.child_id);
    }
  }

  const sameAppChildren = new Map<string, readonly string[]>();
  for (const [parentId, ids] of sameAppKids) {
    sameAppChildren.set(parentId, Object.freeze([...ids].sort()));
  }

  return Object.freeze({
    all: Object.freeze([...dataset.identities]),
    byId,
    provisionedChildren,
    employeeStatus,
    sensitivePermissions,
    permissionBindings,
    apps,
    byApp,
    creationEdges,
    crossAppEdges,
    sameAppChildren,
    generation: buildGenerations(dataset.identities, sameAppParent),
    dataset,
  });
}
