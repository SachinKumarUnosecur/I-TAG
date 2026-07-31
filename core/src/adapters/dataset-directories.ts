import type {
  HrDirectory,
  OwnerRegistry,
  SuppressionRegistry,
  TeamDirectory,
} from '../domain/ports.js';
import { creationEdgeKey } from '../graph/build.js';
import type { IdentityDataset } from '../domain/types.js';

/**
 * Port implementations backed by the static dataset.
 *
 * Each indexes once at construction. In a real deployment these are the seams
 * where Workday, Okta groups and the service registry plug in — the domain never
 * learns which.
 */

export function datasetHrDirectory(dataset: IdentityDataset): HrDirectory {
  const byPerson = new Map(Object.entries(dataset.employee_status));
  return Object.freeze({
    person: (personId: string) => byPerson.get(personId) ?? null,
  });
}

export function datasetTeamDirectory(dataset: IdentityDataset): TeamDirectory {
  const byId = new Map(dataset.teams.map((team) => [team.id, team]));
  const byGroup = new Map(
    dataset.teams
      .filter((team) => team.owns_group !== undefined)
      .map((team) => [team.owns_group ?? '', team]),
  );
  return Object.freeze({
    team: (teamId: string) => byId.get(teamId) ?? null,
    teamForGroup: (groupId: string) => byGroup.get(groupId) ?? null,
  });
}

export function datasetSuppressionRegistry(dataset: IdentityDataset): SuppressionRegistry {
  const byIdentity = new Map((dataset.suppressions ?? []).map((entry) => [entry.identity_id, entry]));
  return Object.freeze({
    entry: (identityId: string) => byIdentity.get(identityId) ?? null,
  });
}

export function datasetOwnerRegistry(dataset: IdentityDataset): OwnerRegistry {
  // Keyed by (app, identity) for the same reason creation edges are: an identity
  // can carry a different owner record in each system it exists in.
  const byKey = new Map(
    dataset.owner_assignments.map((assignment) => [
      creationEdgeKey(assignment.app, assignment.identity_id),
      assignment,
    ]),
  );
  return Object.freeze({
    assignment: (identityId: string, app: string) =>
      byKey.get(creationEdgeKey(app, identityId)) ?? null,
  });
}
