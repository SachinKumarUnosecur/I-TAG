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
  /** Retained so F9 (control history) and F10 (half-lives) need no new plumbing. */
  readonly dataset: IdentityDataset;
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
  for (const permission of dataset.permissions) {
    if (permission.sensitive === true) {
      sensitivePermissions.add(permission.id);
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

  return Object.freeze({
    all: Object.freeze([...dataset.identities]),
    byId,
    provisionedChildren,
    employeeStatus,
    sensitivePermissions,
    apps,
    byApp,
    creationEdges,
    crossAppEdges,
    dataset,
  });
}
