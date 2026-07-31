import type { OwnerRef } from '../domain/ownership.js';
import type { HrDirectory, OwnerRegistry, TeamDirectory } from '../domain/ports.js';
import type { AccountabilityTrace } from '../domain/results.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';

export interface OwnerResolutionContext {
  readonly identity: Identity;
  readonly graph: IdentityGraph;
  readonly hr: HrDirectory;
  readonly teams: TeamDirectory;
  readonly owners: OwnerRegistry;
  /**
   * Creation lineage for this identity, resolved once by the caller.
   *
   * Passed in rather than recomputed per resolver: two resolvers consult it, and
   * the walk is the expensive part of resolution.
   */
  readonly trace: AccountabilityTrace;
}

/**
 * One ownership signal.
 *
 * Contract: never throws, and either returns a fully populated `OwnerRef` or
 * null. A resolver that cannot decide returns null so the next one runs — it
 * must not return a half-filled ref, because every consumer treats a non-null
 * result as a complete answer.
 */
export interface OwnerResolver {
  readonly id: string;
  resolve(context: OwnerResolutionContext): OwnerRef | null;
}

export interface OwnerResolution {
  /** The winning owner under precedence, or null when nothing resolved. */
  readonly owner: OwnerRef | null;
  /** Every non-null candidate, in precedence order. */
  readonly considered: readonly OwnerRef[];
  /**
   * True when two or more high-confidence signals name different owners.
   *
   * Detected across the whole chain rather than stopping at the winner, because
   * "the tag says Priya, the group says the platform team" is a distinct finding
   * from "no owner" and must surface as `ambiguous` rather than being silently
   * won by precedence.
   */
  readonly conflicting: boolean;
}

function isActive(hr: HrDirectory, personId: string): boolean {
  return hr.person(personId)?.status === 'active';
}

const explicitAssignmentResolver: OwnerResolver = {
  id: 'explicit_assignment',
  resolve({ identity, owners }) {
    const assignment = owners.assignment(identity.id, identity.app);
    if (assignment === null) {
      return null;
    }
    return {
      kind: assignment.owner_kind,
      id: assignment.owner_id,
      source: 'explicit_tag',
      confidence: 'high',
      attested_at: assignment.attested_at ?? null,
      backup_id: assignment.backup_id ?? null,
    };
  },
};

/**
 * Ownership inherited from a group the identity belongs to.
 *
 * A team qualifies only while it has at least one active member: an "owning
 * team" whose whole roster has left is not an owner, it is the same orphan
 * wearing a different label.
 */
const owningTeamResolver: OwnerResolver = {
  id: 'owning_team',
  resolve({ identity, teams, hr }) {
    for (const groupId of [...identity.inherited_from].sort()) {
      const team = teams.teamForGroup(groupId);
      if (team === null) {
        continue;
      }
      const activeMember = team.members.find((memberId) => isActive(hr, memberId));
      if (activeMember === undefined) {
        continue;
      }
      return {
        kind: 'team',
        id: team.id,
        source: 'group_ownership',
        confidence: 'high',
        attested_at: null,
        backup_id: activeMember,
      };
    }
    return null;
  },
};

/** The human the creation chain resolves to, if any. */
function creatorHuman(trace: AccountabilityTrace): string | null {
  return trace.termination === 'resolved_human' ? trace.root_human : null;
}

/**
 * Fallback to the creator while they are still active.
 *
 * Medium confidence, and deliberately below the two signals above: `created_by`
 * is an immutable audit fact, not a statement that the creator still owns the
 * thing (§4.1). It is evidence of ownership, not proof of it.
 */
const activeCreatorResolver: OwnerResolver = {
  id: 'active_creator',
  resolve({ trace, hr }) {
    const human = creatorHuman(trace);
    if (human === null || !isActive(hr, human)) {
      return null;
    }
    return {
      kind: 'user',
      id: human,
      source: 'creator_fallback',
      confidence: 'medium',
      attested_at: hr.person(human)?.last_reviewed ?? null,
      backup_id: null,
    };
  },
};

/**
 * Fallback to a creator who is no longer active.
 *
 * Still returns a ref rather than null: naming the departed person is the whole
 * value of the finding ("Alice provisioned this and Alice left"). Classification
 * turns this into `owner_invalid`; resolution's job is only to say who.
 */
const inactiveCreatorResolver: OwnerResolver = {
  id: 'inactive_creator',
  resolve({ trace, hr }) {
    const human = creatorHuman(trace);
    if (human === null) {
      return null;
    }
    const record = hr.person(human);
    if (record === null || record.status === 'active') {
      return null;
    }
    return {
      kind: 'user',
      id: human,
      source: 'creator_fallback',
      confidence: 'low',
      attested_at: record.last_reviewed,
      backup_id: null,
    };
  },
};

/**
 * Precedence chain from `docs/orphaned-identity-research.md` §4.1.
 *
 * List order *is* precedence order: explicit tag, then owning team, then an
 * active creator, then an inactive one. Adding a signal means inserting an
 * object here; no consumer switches on resolver id.
 */
export const DEFAULT_OWNER_RESOLVERS: readonly OwnerResolver[] = Object.freeze([
  explicitAssignmentResolver,
  owningTeamResolver,
  activeCreatorResolver,
  inactiveCreatorResolver,
]);

function sameOwner(left: OwnerRef, right: OwnerRef): boolean {
  return left.kind === right.kind && left.id === right.id;
}

export function resolveOwner(
  context: OwnerResolutionContext,
  resolvers: readonly OwnerResolver[] = DEFAULT_OWNER_RESOLVERS,
): OwnerResolution {
  const considered: OwnerRef[] = [];
  for (const resolver of resolvers) {
    const candidate = resolver.resolve(context);
    if (candidate !== null) {
      considered.push(candidate);
    }
  }

  const [winner] = considered;
  const highConfidence = considered.filter((candidate) => candidate.confidence === 'high');
  const conflicting = highConfidence.some(
    (candidate) => highConfidence[0] !== undefined && !sameOwner(candidate, highConfidence[0]),
  );

  return {
    owner: winner ?? null,
    considered: Object.freeze([...considered]),
    conflicting,
  };
}
