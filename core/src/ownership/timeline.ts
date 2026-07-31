import { daysSince } from '../accountability/rules.js';
import type { OwnershipTimeline } from '../domain/ownership.js';
import type { OwnershipPolicy } from '../domain/policy.js';
import type { Identity } from '../domain/types.js';

export interface TimelineInput {
  readonly identity: Identity;
  /**
   * When the condition became true, supplied by the classifier from whichever
   * source applies: an HR departure date, an attestation date, an app's
   * audit-retention floor. Null when the identity is healthy.
   */
  readonly conditionSince: string | null;
  readonly policy: OwnershipPolicy;
  readonly now: Date;
}

/**
 * Turns a condition date into the two clocks a reviewer needs (§4.3).
 *
 * Pure arithmetic over injected time — nothing here reads the system clock, so
 * a rehearsed demo and a test produce identical numbers.
 */
export function buildTimeline(input: TimelineInput): OwnershipTimeline {
  const { identity, conditionSince, policy, now } = input;

  const slaDays = policy.slaDaysByType[identity.type];
  const ageDays = conditionSince === null ? null : daysSince(conditionSince, now);
  const lastActivity = identity.last_activity_at ?? null;
  const inactiveDays = lastActivity === null ? null : daysSince(lastActivity, now);

  return {
    condition_since: conditionSince,
    age_days: ageDays,
    sla_days: slaDays,
    // Strictly greater than: an identity remediated on the SLA boundary met the
    // SLA. AC-2(3) says "within" the period.
    sla_breached: ageDays !== null && ageDays > slaDays,
    last_activity_at: lastActivity,
    inactive_days: inactiveDays,
    inactive_beyond_threshold: inactiveDays !== null && inactiveDays > policy.inactivityDays,
  };
}
