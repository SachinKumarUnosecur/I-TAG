import type { PersistedCreationEdge, PrivilegeGrantEvent } from '../../domain/lineage.js';
import type {
  AppRecord,
  ControlHistory,
  EmployeeRecord,
  GrantHalfLife,
  GrantRecord,
  Identity,
  IdentityDataset,
  OwnerAssignment,
  PermissionRecord,
  SuppressionEntry,
  TeamRecord,
} from '../../domain/types.js';

/**
 * One demo beat's worth of dataset.
 *
 * The seed is split by beat rather than by table because the reviewable unit is a
 * scenario, not a column: "is the Colonial case still intact" is answerable by
 * reading one file, whereas a single object literal spreads every scenario across
 * six tables and hides the intent between them.
 *
 * Each cluster carries the identities *and* the HR, team, owner and suppression
 * records that give them meaning, so a beat can be understood, changed or deleted
 * without cross-referencing. The exception is `directory.ts`, which holds the
 * people and teams on purpose: employment status is the ground truth every other
 * cluster reads from, and it belongs in one table a reviewer can scan.
 */
export interface SeedCluster {
  readonly identities: readonly Identity[];
  readonly employee_status?: Readonly<Record<string, EmployeeRecord>>;
  readonly teams?: readonly TeamRecord[];
  readonly owner_assignments?: readonly OwnerAssignment[];
  readonly suppressions?: readonly SuppressionEntry[];
  readonly control_history?: readonly ControlHistory[];
  readonly grant_records?: readonly GrantRecord[];
  /**
   * Observed creation events, carried by the beat whose identities they explain.
   *
   * Kept with the cluster rather than in one table because an edge is only
   * meaningful next to the identity it describes: `docs/delegation-chain-research.md`
   * §4.6 makes this store the system of record for lineage, so a reviewer checking
   * whether the Midnight Blizzard beat is still intact has to be able to read the
   * actor and the account it created without opening a second file.
   */
  readonly creation_edges?: readonly PersistedCreationEdge[];
  readonly privilege_grant_events?: readonly PrivilegeGrantEvent[];
}

/** The catalogue every cluster draws on: systems, permissions, grant patterns. */
export interface SeedCatalog {
  readonly apps: readonly AppRecord[];
  readonly permissions: readonly PermissionRecord[];
  readonly grant_half_lives: readonly GrantHalfLife[];
}

function concat<T>(clusters: readonly SeedCluster[], pick: (cluster: SeedCluster) => readonly T[] | undefined): readonly T[] {
  return Object.freeze(clusters.flatMap((cluster) => [...(pick(cluster) ?? [])]));
}

/**
 * Flattens clusters into the one dataset the engine loads.
 *
 * Deliberately does no validation: `validateDataset` owns that, runs at boot and
 * fails the process, so a second half-checked gate here would only give a wrong
 * dataset two places to be wrong in.
 */
export function assembleDataset(
  catalog: SeedCatalog,
  clusters: readonly SeedCluster[],
): IdentityDataset {
  return {
    apps: catalog.apps,
    permissions: catalog.permissions,
    grant_half_lives: catalog.grant_half_lives,
    identities: concat(clusters, (cluster) => cluster.identities),
    employee_status: Object.freeze(
      Object.assign({}, ...clusters.map((cluster) => cluster.employee_status ?? {})) as Record<
        string,
        EmployeeRecord
      >,
    ),
    teams: concat(clusters, (cluster) => cluster.teams),
    owner_assignments: concat(clusters, (cluster) => cluster.owner_assignments),
    suppressions: concat(clusters, (cluster) => cluster.suppressions),
    control_history: concat(clusters, (cluster) => cluster.control_history),
    grant_records: concat(clusters, (cluster) => cluster.grant_records),
    creation_edges: concat(clusters, (cluster) => cluster.creation_edges),
    privilege_grant_events: concat(clusters, (cluster) => cluster.privilege_grant_events),
  };
}

/** Narrowing helper so a cluster literal is checked field by field at authoring time. */
export function cluster(value: SeedCluster): SeedCluster {
  return value;
}

/** Re-exported so cluster modules import one path rather than reaching into `domain/`. */
export type { Identity };
