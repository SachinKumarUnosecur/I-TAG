import type { OwnershipState, OwnershipTimeline, Severity } from '../domain/ownership.js';

export interface SeverityInput {
  readonly state: OwnershipState;
  readonly sensitiveCount: number;
  readonly timeline: OwnershipTimeline;
  readonly counted: boolean;
}

/**
 * Injected so thresholds can be tuned per deployment without the classifier
 * knowing how ranking works.
 */
export interface SeverityStrategy {
  rank(input: SeverityInput): Severity;
}

/**
 * Sensitive reachability first, SLA breach second — `docs/orphaned-identity-research.md` §4.3.
 *
 * Age alone cannot rank a queue: an ancient orphan that reaches nothing is not
 * the one to work on first. Sensitivity is what turns 4,000 rows into the seven
 * that matter, so it dominates, and time only breaks ties within a band.
 */
export const DEFAULT_SEVERITY_STRATEGY: SeverityStrategy = Object.freeze({
  rank({ state, sensitiveCount, timeline, counted }: SeverityInput): Severity {
    if (state === 'owned' || !counted) {
      return 'none';
    }
    if (sensitiveCount > 0) {
      return timeline.sla_breached ? 'critical' : 'high';
    }
    if (timeline.sla_breached || timeline.inactive_beyond_threshold) {
      return 'medium';
    }
    return 'low';
  },
});

const ORDER: Readonly<Record<Severity, number>> = Object.freeze({
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});

export function severityRank(severity: Severity): number {
  return ORDER[severity];
}

export function atLeast(severity: Severity, floor: Severity): boolean {
  return severityRank(severity) >= severityRank(floor);
}
