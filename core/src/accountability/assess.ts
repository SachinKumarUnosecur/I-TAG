import type { AccountabilityPolicy } from '../domain/policy.js';
import type { Clock, GraphSource } from '../domain/ports.js';
import type { AssessmentOutcome, OrphanReason } from '../domain/results.js';
import { traceAccountability } from './trace.js';
import { daysSince, type OrphanRule, type OrphanRuleContext } from './rules.js';

export interface AccountabilityDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  readonly policy: AccountabilityPolicy;
  readonly rules: readonly OrphanRule[];
}

export interface AccountabilityService {
  /** Combined F4 + F5 assessment. Never throws on pathological graph shapes. */
  assess(identityId: string): AssessmentOutcome;
}

export function createAccountabilityService(deps: AccountabilityDeps): AccountabilityService {
  return {
    assess(identityId) {
      const graph = deps.graphSource.graph();
      const start = graph.byId.get(identityId);
      if (start === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }

      const trace = traceAccountability(graph, start, deps.policy);
      const context: OrphanRuleContext = {
        trace,
        graph,
        policy: deps.policy,
        now: deps.clock.now(),
      };

      let reason: OrphanReason | null = null;
      let detail: string | null = null;
      for (const rule of deps.rules) {
        const finding = rule.evaluate(context);
        if (finding !== null) {
          reason = finding.reason;
          detail = finding.detail;
          break;
        }
      }

      // Reported whether or not the identity is orphaned, so a healthy result can
      // still show how recently its owner was reviewed.
      const rootHuman = trace.termination === 'resolved_human' ? trace.root_human : null;
      const record = rootHuman === null ? undefined : graph.employeeStatus.get(rootHuman);
      const daysSinceReview =
        record === undefined ? null : daysSince(record.last_reviewed, context.now);

      return {
        ok: true,
        assessment: {
          identity_id: start.id,
          chain: trace.chain,
          termination: trace.termination,
          root_human: rootHuman,
          orphaned: reason !== null,
          orphan_reason: reason,
          orphan_detail: detail,
          days_since_review: daysSinceReview,
        },
      };
    },
  };
}
