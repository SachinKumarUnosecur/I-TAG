import { creationEdgeKey } from '../graph/build.js';
import type { IdentityDataset } from '../domain/types.js';

export class DatasetValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Identity dataset failed validation:\n  - ${issues.join('\n  - ')}`);
    this.name = 'DatasetValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

/**
 * Validates referential integrity once, at load time.
 *
 * A dangling `provisioned_by` is deliberately *not* an error — lost provenance is
 * a finding the engine is built to report (see `AccountabilityTrace`). Everything
 * else that cannot resolve is a typo in the dataset and fails the boot, so no
 * request ever has to defend against a malformed graph.
 *
 * @throws {DatasetValidationError} when the dataset is internally inconsistent.
 */
export function validateDataset(dataset: IdentityDataset): IdentityDataset {
  const issues: string[] = [];
  const byId = new Map<string, IdentityDataset['identities'][number]>();

  for (const identity of dataset.identities) {
    if (byId.has(identity.id)) {
      issues.push(`duplicate identity id "${identity.id}"`);
      continue;
    }
    byId.set(identity.id, identity);
  }

  const permissionIds = new Set(dataset.permissions.map((permission) => permission.id));
  const appIds = new Set(dataset.apps.map((app) => app.id));

  for (const app of dataset.apps) {
    if (app.creation_data_from !== null && Number.isNaN(Date.parse(app.creation_data_from))) {
      issues.push(`app "${app.id}" has unparseable creation_data_from "${app.creation_data_from}"`);
    }
  }

  // One creation edge per (app, child). Enforced over a derived edge list rather
  // than trusted from identity uniqueness, because per-app ingestion
  // (`docs/PRD-delegation-chain.md` §4.2) is what will eventually populate these
  // and a second edge for one child would silently overwrite the first.
  const creationEdgeOwners = new Map<string, string>();

  for (const identity of dataset.identities) {
    if (!appIds.has(identity.app)) {
      issues.push(`"${identity.id}" belongs to app "${identity.app}", which is not in the apps table`);
    }

    if (identity.provisioned_by !== null) {
      const key = creationEdgeKey(identity.app, identity.id);
      const existing = creationEdgeOwners.get(key);
      if (existing !== undefined) {
        issues.push(
          `duplicate creation edge for (app "${identity.app}", identity "${identity.id}"): ` +
            `already provisioned by "${existing}"`,
        );
      } else {
        creationEdgeOwners.set(key, identity.provisioned_by);
      }

      // A provisioner in another app is *not* a dataset error. It is the
      // cross-app correlation that `docs/orphaned-identity-research.md` §4.4
      // exists to perform: per-app lineage is stored unmerged (see
      // `graph.creationEdges`, which holds same-app edges only) while the
      // analysis layer joins the fragments (`graph.crossAppEdges`). Rejecting it
      // here would forbid the one question a per-app view cannot answer.
    }

    for (const permission of identity.direct_grants) {
      if (!permissionIds.has(permission)) {
        issues.push(`"${identity.id}" grants "${permission}", which is not in the permissions table`);
      }
    }

    for (const groupId of identity.inherited_from) {
      const group = byId.get(groupId);
      if (group === undefined) {
        issues.push(`"${identity.id}" inherits from "${groupId}", which does not exist`);
      } else if (group.type !== 'group') {
        issues.push(
          `"${identity.id}" inherits from "${groupId}", which is a ${group.type} rather than a group`,
        );
      }
    }

    // `delegates_to` is the denormalised inverse of `provisioned_by`. Unresolvable
    // entries and disagreements are dataset bugs, not findings.
    for (const childId of identity.delegates_to) {
      const child = byId.get(childId);
      if (child === undefined) {
        issues.push(`"${identity.id}" delegates to "${childId}", which does not exist`);
        continue;
      }
      if (child.provisioned_by !== identity.id) {
        issues.push(
          `"${identity.id}" delegates to "${childId}", but that identity records its provisioner as ` +
            `${child.provisioned_by === null ? 'null' : `"${child.provisioned_by}"`}`,
        );
      }
    }

    if (identity.type === 'human' && dataset.employee_status[identity.id] === undefined) {
      issues.push(`human "${identity.id}" has no employee_status record`);
    }
  }

  for (const [id, record] of Object.entries(dataset.employee_status)) {
    const identity = byId.get(id);
    if (identity === undefined) {
      issues.push(`employee_status names "${id}", which is not an identity`);
    } else if (identity.type !== 'human') {
      issues.push(`employee_status names "${id}", which is a ${identity.type} rather than a human`);
    }
    if (Number.isNaN(Date.parse(record.last_reviewed))) {
      issues.push(`employee_status for "${id}" has unparseable last_reviewed "${record.last_reviewed}"`);
    }
  }

  const teamIds = new Set<string>();
  for (const team of dataset.teams) {
    if (teamIds.has(team.id)) {
      issues.push(`duplicate team id "${team.id}"`);
    }
    teamIds.add(team.id);

    for (const memberId of team.members) {
      const member = byId.get(memberId);
      if (member === undefined) {
        issues.push(`team "${team.id}" lists member "${memberId}", which is not an identity`);
      } else if (member.type !== 'human') {
        issues.push(`team "${team.id}" lists member "${memberId}", which is a ${member.type}`);
      }
    }

    if (team.owns_group !== undefined) {
      const group = byId.get(team.owns_group);
      if (group === undefined) {
        issues.push(`team "${team.id}" owns "${team.owns_group}", which is not an identity`);
      } else if (group.type !== 'group') {
        issues.push(`team "${team.id}" owns "${team.owns_group}", which is a ${group.type}`);
      }
    }
  }

  for (const assignment of dataset.owner_assignments) {
    const subject = byId.get(assignment.identity_id);
    if (subject === undefined) {
      issues.push(`owner_assignments names "${assignment.identity_id}", which is not an identity`);
    } else if (subject.app !== assignment.app) {
      issues.push(
        `owner_assignments scopes "${assignment.identity_id}" to app "${assignment.app}", ` +
          `but that identity lives in "${subject.app}"`,
      );
    }

    const ownerExists =
      assignment.owner_kind === 'team'
        ? teamIds.has(assignment.owner_id)
        : byId.get(assignment.owner_id)?.type === 'human';
    if (!ownerExists) {
      issues.push(
        `owner_assignments for "${assignment.identity_id}" names ${assignment.owner_kind} ` +
          `"${assignment.owner_id}", which does not exist`,
      );
    }
  }

  for (const history of dataset.control_history) {
    if (!byId.has(history.identity_id)) {
      issues.push(`control_history names "${history.identity_id}", which is not an identity`);
    }
  }

  // Persisted creation events are evidence for edges the identity table already
  // asserts, so the two have to agree. A record naming a different creator than
  // `provisioned_by` is a bug in ingestion, not a finding: the graph would traverse
  // one answer while the UI displayed the other.
  const seenEdges = new Set<string>();
  for (const edge of dataset.creation_edges ?? []) {
    const child = byId.get(edge.child_id);
    if (child === undefined) {
      issues.push(`creation_edges names child "${edge.child_id}", which is not an identity`);
      continue;
    }
    if (child.app !== edge.app) {
      issues.push(
        `creation_edges scopes "${edge.child_id}" to app "${edge.app}", but that identity lives in "${child.app}"`,
      );
    }
    if (child.provisioned_by !== edge.actor.raw_principal) {
      issues.push(
        `creation_edges records "${edge.actor.raw_principal}" as the actor for "${edge.child_id}", ` +
          `but that identity records its provisioner as ` +
          `${child.provisioned_by === null ? 'null' : `"${child.provisioned_by}"`}`,
      );
    }
    // Append-only means several rows per child are legal; several *live* rows are
    // not, because then "who created this" has two current answers.
    if (edge.superseded_by === null) {
      const key = creationEdgeKey(edge.app, edge.child_id);
      if (seenEdges.has(key)) {
        issues.push(`creation_edges holds more than one live record for "${edge.child_id}"`);
      }
      seenEdges.add(key);
    }
    if (Number.isNaN(Date.parse(edge.observed_at))) {
      issues.push(`creation_edges for "${edge.child_id}" has unparseable observed_at "${edge.observed_at}"`);
    }
  }

  for (const grant of dataset.privilege_grant_events ?? []) {
    const subject = byId.get(grant.identity_id);
    if (subject === undefined) {
      issues.push(`privilege_grant_events names "${grant.identity_id}", which is not an identity`);
    } else if (subject.app !== grant.app) {
      issues.push(
        `privilege_grant_events scopes "${grant.identity_id}" to app "${grant.app}", ` +
          `but that identity lives in "${subject.app}"`,
      );
    }
    if (!permissionIds.has(grant.permission)) {
      issues.push(
        `privilege_grant_events grants "${grant.permission}" to "${grant.identity_id}", ` +
          `which is not in the permissions table`,
      );
    }
    if (Number.isNaN(Date.parse(grant.occurred_at))) {
      issues.push(
        `privilege_grant_events for "${grant.identity_id}" has unparseable occurred_at "${grant.occurred_at}"`,
      );
    }
    // The approver is the AC-2(e) evidence, so a name that resolves to nothing would
    // let an unverifiable approval clear a real self-authorization finding.
    if (grant.approved_by !== null && byId.get(grant.approved_by)?.type !== 'human') {
      issues.push(
        `privilege_grant_events for "${grant.identity_id}" names approver "${grant.approved_by}", ` +
          `which is not a human identity`,
      );
    }
  }

  const grantTypes = new Set(dataset.grant_half_lives.map((pattern) => pattern.grant_type));
  for (const grant of dataset.grant_records) {
    if (!byId.has(grant.identity_id)) {
      issues.push(`grant_records names "${grant.identity_id}", which is not an identity`);
    }
    if (!grantTypes.has(grant.grant_type)) {
      issues.push(
        `grant_records references grant_type "${grant.grant_type}", which has no half-life pattern`,
      );
    }
  }

  if (issues.length > 0) {
    throw new DatasetValidationError(issues);
  }

  return Object.freeze(dataset);
}
