import type {
  HrDirectory,
  LifecycleDirectory,
  OwnerRegistry,
  SuppressionRegistry,
  TeamDirectory,
} from '../domain/ports.js';
import { creationEdgeKey } from '../graph/build.js';
import type { GrantRecord, IdentityDataset } from '../domain/types.js';

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

/**
 * Indexes `ITAG.md` §F9's and §F10's tables, and keeps their absences absent.
 *
 * The three lookups return `null` rather than an empty array for a missing row,
 * because `LifecycleDirectory` makes that distinction the whole point: on this estate
 * `control_history` covers 4 identities of 127 and `grant_records` 7, so "no row" is
 * the answer for almost every identity and collapsing it into "no events" would turn
 * 120 unevaluated identities into 120 clean ones
 * (`docs/identity-risk-profile-research.md` §4.1, architecture rule 9).
 */
export function datasetLifecycleDirectory(dataset: IdentityDataset): LifecycleDirectory {
  const controls = new Map(
    dataset.control_history.map((history) => [history.identity_id, history.events]),
  );
  const grants = new Map<string, GrantRecord[]>();
  for (const grant of dataset.grant_records) {
    const existing = grants.get(grant.identity_id);
    if (existing === undefined) {
      grants.set(grant.identity_id, [grant]);
    } else {
      existing.push(grant);
    }
  }
  const halfLives = new Map(dataset.grant_half_lives.map((pattern) => [pattern.grant_type, pattern]));

  return Object.freeze({
    controlEvents: (identityId: string) => controls.get(identityId) ?? null,
    grants: (identityId: string) => grants.get(identityId) ?? null,
    halfLife: (grantType: string) => halfLives.get(grantType) ?? null,
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
