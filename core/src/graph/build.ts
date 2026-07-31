import type { EmployeeRecord, Identity, IdentityDataset } from '../domain/types.js';

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

  return Object.freeze({
    all: Object.freeze([...dataset.identities]),
    byId,
    provisionedChildren,
    employeeStatus,
    sensitivePermissions,
    dataset,
  });
}
