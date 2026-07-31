import type { AccountabilityPolicy } from '../domain/policy.js';
import type { AccountabilityTrace, OrphanReason } from '../domain/results.js';
import type { EmployeeRecord } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';

export interface OrphanRuleContext {
  readonly trace: AccountabilityTrace;
  readonly graph: IdentityGraph;
  readonly policy: AccountabilityPolicy;
  readonly now: Date;
}

export interface OrphanFinding {
  readonly reason: OrphanReason;
  readonly detail: string;
}

/**
 * One reason an identity's accountability is no longer valid.
 *
 * The extension seam for the rest of the feature set: F9 (trust decay) and F11
 * (off-boarding debt) add rules to `DEFAULT_ORPHAN_RULES` without editing any
 * F4/F5 code. Rules are evaluated in list order and the first non-null finding
 * wins, so ordering encodes precedence.
 */
export interface OrphanRule {
  readonly id: string;
  evaluate(context: OrphanRuleContext): OrphanFinding | null;
}

const MS_PER_DAY = 86_400_000;

/** Whole days elapsed since an ISO-8601 date, or null if it does not parse. */
export function daysSince(isoDate: string, now: Date): number | null {
  const parsed = Date.parse(isoDate);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.floor((now.getTime() - parsed) / MS_PER_DAY);
}

/** The root human's employment record, or null when no human root resolved. */
export function rootHumanRecord(context: OrphanRuleContext): EmployeeRecord | null {
  if (context.trace.termination !== 'resolved_human') {
    return null;
  }
  return context.graph.employeeStatus.get(context.trace.root_human) ?? null;
}

const brokenProvenanceRule: OrphanRule = {
  id: 'broken_provenance',
  evaluate({ trace }) {
    switch (trace.termination) {
      case 'dangling_reference':
        return {
          reason: 'broken_provenance',
          detail: `provisioned_by points at "${trace.missing_id}", which is not present in the identity graph`,
        };
      case 'cycle_detected':
        return {
          reason: 'broken_provenance',
          detail: `provisioning chain loops back to "${trace.repeated_id}", so it has no root`,
        };
      case 'depth_limit_exceeded':
        return {
          reason: 'broken_provenance',
          detail: `provisioning chain exceeded the ${trace.limit}-hop traversal limit without reaching a root`,
        };
      default:
        return null;
    }
  },
};

const noAccountableHumanRule: OrphanRule = {
  id: 'no_accountable_human',
  evaluate({ trace }) {
    if (trace.termination !== 'no_human_root') {
      return null;
    }
    return {
      reason: 'no_accountable_human',
      detail: `chain terminates at "${trace.root_non_human}", a non-human root, so no person ever owned this access`,
    };
  },
};

const departedRootRule: OrphanRule = {
  id: 'departed_root',
  evaluate(context) {
    const record = rootHumanRecord(context);
    if (record === null || record.status !== 'departed') {
      return null;
    }
    return {
      reason: 'departed',
      detail: `accountable human has left the organization; last reviewed ${record.last_reviewed}`,
    };
  },
};

const roleChangedRootRule: OrphanRule = {
  id: 'role_changed_root',
  evaluate(context) {
    const record = rootHumanRecord(context);
    if (record === null || record.status !== 'role_changed') {
      return null;
    }
    return {
      reason: 'role_changed',
      detail: `accountable human changed roles and may no longer be positioned to own this access; last reviewed ${record.last_reviewed}`,
    };
  },
};

const staleReviewRule: OrphanRule = {
  id: 'stale_review',
  evaluate(context) {
    const record = rootHumanRecord(context);
    if (record === null || record.status !== 'active') {
      return null;
    }
    const elapsed = daysSince(record.last_reviewed, context.now);
    if (elapsed === null || elapsed <= context.policy.staleReviewDays) {
      return null;
    }
    return {
      reason: 'stale_review',
      detail: `accountable human is still active but has not reviewed this access in ${elapsed} days (threshold ${context.policy.staleReviewDays})`,
    };
  },
};

/**
 * Guards the case where a human root has no employment record. Dataset
 * validation rejects that at startup, so this is unreachable in production — it
 * exists so an unknown status can never be silently reported as healthy.
 */
const unknownRootStatusRule: OrphanRule = {
  id: 'unknown_root_status',
  evaluate(context) {
    if (context.trace.termination !== 'resolved_human') {
      return null;
    }
    if (rootHumanRecord(context) !== null) {
      return null;
    }
    return {
      reason: 'broken_provenance',
      detail: `no employment record on file for root human "${context.trace.root_human}", so accountability cannot be confirmed`,
    };
  },
};

/** Evaluation order is precedence order. Data integrity outranks employment state. */
export const DEFAULT_ORPHAN_RULES: readonly OrphanRule[] = Object.freeze([
  brokenProvenanceRule,
  noAccountableHumanRule,
  unknownRootStatusRule,
  departedRootRule,
  roleChangedRootRule,
  staleReviewRule,
]);
