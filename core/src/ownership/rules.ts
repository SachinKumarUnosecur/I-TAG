import { daysSince } from '../accountability/rules.js';
import type { OwnershipReason, OwnershipState } from '../domain/ownership.js';
import type { HrDirectory, TeamDirectory } from '../domain/ports.js';
import type { OwnershipPolicy } from '../domain/policy.js';
import type { AccountabilityTrace } from '../domain/results.js';
import type { EmployeeRecord, Identity } from '../domain/types.js';
import type { OwnerResolution } from './resolve.js';

export interface OwnershipRuleContext {
  readonly identity: Identity;
  readonly resolution: OwnerResolution;
  readonly trace: AccountabilityTrace;
  readonly hr: HrDirectory;
  readonly teams: TeamDirectory;
  readonly policy: OwnershipPolicy;
  readonly now: Date;
}

export interface OwnershipVerdict {
  /** Never `owned` — reaching the end of the rule list is what means healthy. */
  readonly state: Exclude<OwnershipState, 'owned'>;
  readonly reason: OwnershipReason;
  readonly detail: string;
  /**
   * When the condition became true. Feeds `buildTimeline`, and is the reason the
   * SLA clock can run from a departure date rather than from scan time (§4.3).
   */
  readonly condition_since: string | null;
}

/**
 * One reason an identity's ownership is not in good standing.
 *
 * Same shape as `DEFAULT_ORPHAN_RULES` in `accountability/rules.ts`, for the same
 * reason: a new signal is a new object in the frozen list below, and no consumer
 * switches on rule id.
 */
export interface OwnershipRule {
  readonly id: string;
  evaluate(context: OwnershipRuleContext): OwnershipVerdict | null;
}

/** The date a person's status changed, preferring the HR event over the review date. */
function statusChangedOn(record: EmployeeRecord): string {
  return record.effective_from ?? record.last_reviewed;
}

function ownerPerson(context: OwnershipRuleContext): EmployeeRecord | null {
  const owner = context.resolution.owner;
  if (owner === null || owner.kind !== 'user') {
    return null;
  }
  return context.hr.person(owner.id);
}

const conflictingSignalsRule: OwnershipRule = {
  id: 'conflicting_signals',
  evaluate({ resolution }) {
    if (!resolution.conflicting) {
      return null;
    }
    const named = resolution.considered
      .filter((candidate) => candidate.confidence === 'high')
      .map((candidate) => `${candidate.kind} "${candidate.id}" (${candidate.source})`)
      .join(' vs ');
    return {
      state: 'ambiguous',
      reason: 'conflicting_owner_signals',
      detail: `high-confidence ownership signals disagree: ${named}`,
      condition_since: null,
    };
  },
};

/**
 * Only reachable when nothing else resolved an owner. A broken creation chain
 * under a validly tagged owner is a lineage defect, not an ownership finding.
 */
const brokenProvenanceRule: OwnershipRule = {
  id: 'broken_provenance',
  evaluate({ resolution, trace, identity }) {
    if (resolution.owner !== null) {
      return null;
    }
    const since = identity.created_at ?? null;
    switch (trace.termination) {
      case 'dangling_reference':
        return {
          state: 'unowned',
          reason: 'broken_provenance',
          detail: `provisioned_by points at "${trace.missing_id}", which is not in the graph`,
          condition_since: since,
        };
      case 'cycle_detected':
        return {
          state: 'unowned',
          reason: 'broken_provenance',
          detail: `provisioning chain loops back to "${trace.repeated_id}", so it has no root`,
          condition_since: since,
        };
      case 'depth_limit_exceeded':
        return {
          state: 'unowned',
          reason: 'broken_provenance',
          detail: `provisioning chain exceeded the ${trace.limit}-hop limit without reaching a root`,
          condition_since: since,
        };
      default:
        return null;
    }
  },
};

const noOwnerRule: OwnershipRule = {
  id: 'no_owner',
  evaluate({ resolution, identity }) {
    if (resolution.owner !== null) {
      return null;
    }
    return {
      state: 'unowned',
      reason: 'no_owner_on_record',
      detail: 'no owner tag, no owning team, and no human in the creation chain',
      condition_since: identity.created_at ?? null,
    };
  },
};

/**
 * The creator fallback fired and that creator is gone.
 *
 * Kept distinct from `owner_departed` because the remediation differs: this
 * identity never had a real owner, only a creation record that has now expired,
 * so the fix is to assign one rather than to replace one.
 */
const creatorDeactivatedRule: OwnershipRule = {
  id: 'creator_deactivated',
  evaluate(context) {
    const owner = context.resolution.owner;
    const record = ownerPerson(context);
    if (owner === null || record === null || owner.source !== 'creator_fallback') {
      return null;
    }
    if (record.status === 'active') {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'creator_deactivated',
      detail:
        `accountability falls back to "${owner.id}", who created this identity but is ` +
        `now ${record.status}; no owner was ever assigned`,
      condition_since: statusChangedOn(record),
    };
  },
};

const ownerDepartedRule: OwnershipRule = {
  id: 'owner_departed',
  evaluate(context) {
    const record = ownerPerson(context);
    if (record === null || record.status !== 'departed') {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'owner_departed',
      detail: `owner "${context.resolution.owner?.id ?? 'unknown'}" has left the organization`,
      condition_since: statusChangedOn(record),
    };
  },
};

const ownerRoleChangedRule: OwnershipRule = {
  id: 'owner_role_changed',
  evaluate(context) {
    const record = ownerPerson(context);
    if (record === null || record.status !== 'role_changed') {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'owner_role_changed',
      detail:
        `owner "${context.resolution.owner?.id ?? 'unknown'}" changed roles and may no longer ` +
        `be positioned to own this access`,
      condition_since: statusChangedOn(record),
    };
  },
};

/**
 * A team owner with nobody left in it.
 *
 * The group-ownership resolver already refuses to name a vacant team, but an
 * explicit assignment bypasses that check by design — the record is evidence of
 * intent. Validating it here keeps resolution and validation separate: resolvers
 * say who, rules say whether that still holds.
 */
const teamOwnerVacantRule: OwnershipRule = {
  id: 'team_owner_vacant',
  evaluate({ resolution, teams, hr, identity }) {
    const owner = resolution.owner;
    if (owner === null || owner.kind !== 'team') {
      return null;
    }
    const team = teams.team(owner.id);
    if (team === null) {
      return {
        state: 'unowned',
        reason: 'owner_team_vacant',
        detail: `owner record names team "${owner.id}", which no longer exists`,
        condition_since: identity.created_at ?? null,
      };
    }
    const active = team.members.filter((memberId) => hr.person(memberId)?.status === 'active');
    if (active.length > 0) {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'owner_team_vacant',
      detail:
        `owner team "${team.name}" has no active members (${team.members.length} on roster, ` +
        `none current), so nobody can act on this identity`,
      condition_since: owner.attested_at,
    };
  },
};

/**
 * Scoped to explicitly tagged owners on purpose.
 *
 * A team resolved through group membership carries no attestation date by
 * construction, and flagging every team-owned identity as unattested would bury
 * the queue in noise on day one.
 */
const neverAttestedRule: OwnershipRule = {
  id: 'never_attested',
  evaluate({ resolution, identity }) {
    const owner = resolution.owner;
    if (owner === null || owner.source !== 'explicit_tag' || owner.attested_at !== null) {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'owner_never_attested',
      detail: `owner "${owner.id}" is on record but has never attested to this ownership`,
      condition_since: identity.created_at ?? null,
    };
  },
};

const staleAttestationRule: OwnershipRule = {
  id: 'stale_attestation',
  evaluate({ resolution, policy, now }) {
    const owner = resolution.owner;
    if (owner === null || owner.attested_at === null) {
      return null;
    }
    const elapsed = daysSince(owner.attested_at, now);
    if (elapsed === null || elapsed <= policy.staleAttestationDays) {
      return null;
    }
    return {
      state: 'owner_invalid',
      reason: 'owner_attestation_stale',
      detail:
        `owner "${owner.id}" last attested ${elapsed} days ago ` +
        `(threshold ${policy.staleAttestationDays})`,
      condition_since: owner.attested_at,
    };
  },
};

/**
 * Evaluation order is precedence order.
 *
 * Disagreement outranks everything (we cannot say who is wrong until it is
 * settled), then the absence of any owner, then an owner who has lapsed, then
 * attestation hygiene. Reaching the end means `owned`.
 */
export const DEFAULT_OWNERSHIP_RULES: readonly OwnershipRule[] = Object.freeze([
  conflictingSignalsRule,
  brokenProvenanceRule,
  noOwnerRule,
  creatorDeactivatedRule,
  ownerDepartedRule,
  ownerRoleChangedRule,
  teamOwnerVacantRule,
  neverAttestedRule,
  staleAttestationRule,
]);
