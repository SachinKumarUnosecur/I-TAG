import { traceAccountability } from '../accountability/trace.js';
import type { OwnerRef, Suppression } from '../domain/ownership.js';
import type { OwnershipFinding, OwnershipOutcome } from '../domain/ownership-results.js';
import type {
  Clock,
  GraphSource,
  HrDirectory,
  OwnerRegistry,
  SuppressionRegistry,
  TeamDirectory,
} from '../domain/ports.js';
import type { AccountabilityPolicy, OwnershipPolicy } from '../domain/policy.js';
import type { Identity } from '../domain/types.js';
import { reachableAccess } from './reach.js';
import { resolveOwner, type OwnerResolver } from './resolve.js';
import { DEFAULT_OWNERSHIP_RULES, type OwnershipRule } from './rules.js';
import {
  atLeast,
  DEFAULT_SEVERITY_STRATEGY,
  severityRank,
  type SeverityStrategy,
} from './severity.js';
import { applySuppression, type SuppressionRule } from './suppression.js';
import { buildTimeline } from './timeline.js';
import type { OwnershipState, Severity } from '../domain/ownership.js';

export interface OwnershipDeps {
  readonly graphSource: GraphSource;
  readonly clock: Clock;
  readonly hr: HrDirectory;
  readonly teams: TeamDirectory;
  readonly owners: OwnerRegistry;
  readonly suppressions: SuppressionRegistry;
  readonly accountabilityPolicy: AccountabilityPolicy;
  readonly policy: OwnershipPolicy;
  readonly resolvers?: readonly OwnerResolver[];
  readonly rules?: readonly OwnershipRule[];
  readonly suppressionRules?: readonly SuppressionRule[];
  readonly severity?: SeverityStrategy;
}

export interface OwnershipQuery {
  readonly state?: OwnershipState;
  readonly app?: string;
  readonly minSeverity?: Severity;
  /** Suppressed and uncounted findings are excluded unless this is true. */
  readonly includeUncounted?: boolean;
}

export interface OwnershipService {
  /** Never throws on pathological graph shapes; unknown ids come back as an outcome. */
  classify(identityId: string): OwnershipOutcome;
  /** The reviewer's queue: filtered, then ranked severity-first. */
  list(query?: OwnershipQuery): readonly OwnershipFinding[];
}

export function createOwnershipService(deps: OwnershipDeps): OwnershipService {
  const severityStrategy = deps.severity ?? DEFAULT_SEVERITY_STRATEGY;
  const rules = deps.rules ?? DEFAULT_OWNERSHIP_RULES;

  function classifyIdentity(identity: Identity): OwnershipFinding {
    const graph = deps.graphSource.graph();
    const now = deps.clock.now();

    // Phase 1 — resolve who owns this, and on what evidence (§5).
    const trace = traceAccountability(graph, identity, deps.accountabilityPolicy);
    const resolution = resolveOwner(
      { identity, graph, hr: deps.hr, teams: deps.teams, owners: deps.owners, trace },
      deps.resolvers,
    );

    // Suppression runs before classification rather than after, inverting §5's
    // phase order on purpose: an audit-retention gap or a revoked identity means
    // no verdict is possible, and evaluating state rules first would compute a
    // finding only to throw it away — and risk reporting it.
    const suppression: Suppression | null = applySuppression(
      { identity, graph, registry: deps.suppressions, now },
      deps.suppressionRules,
    );

    // Phase 2 — state classification.
    const verdict =
      suppression?.effect === 'unknown'
        ? null
        : (rules.map((rule) => rule.evaluate({
            identity,
            resolution,
            trace,
            hr: deps.hr,
            teams: deps.teams,
            policy: deps.policy,
            now,
          })).find((candidate) => candidate !== null) ?? null);

    const state: OwnershipState =
      suppression?.effect === 'unknown' ? 'unknown' : (verdict?.state ?? 'owned');

    const timeline = buildTimeline({
      identity,
      conditionSince:
        suppression?.effect === 'unknown'
          ? (identity.created_at ?? null)
          : (verdict?.condition_since ?? null),
      policy: deps.policy,
      now,
    });

    // Phase 5 — a finding that cannot be trusted, or is exempt, is not a finding.
    const counted =
      state !== 'owned' && state !== 'unknown' && suppression?.effect !== 'suppressed' &&
      suppression?.effect !== 'excluded';

    const reach = reachableAccess(graph, identity, deps.accountabilityPolicy.maxChainDepth);
    const severity = severityStrategy.rank({
      state,
      sensitiveCount: reach.sensitive.length,
      timeline,
      counted,
    });

    const base = {
      identity_id: identity.id,
      app: identity.app,
      identity_type: identity.type,
      detected_at: now.toISOString(),
      timeline,
      candidates: resolution.considered,
      suppression,
      counted,
      severity,
      reachable_permissions: reach.permissions,
      reachable_sensitive_count: reach.sensitive.length,
    } as const;

    const owner: OwnerRef | null = resolution.owner;

    if (state === 'owned' && owner !== null) {
      return { ...base, state: 'owned', owner };
    }
    if (state === 'unknown') {
      return {
        ...base,
        state: 'unknown',
        owner,
        reason: suppression?.reason === 'sso_federated' ? 'no_owner_on_record' : 'outside_audit_window',
        detail: suppression?.detail ?? 'insufficient data to determine ownership',
      };
    }
    if (state === 'ambiguous' && verdict !== null) {
      return { ...base, state: 'ambiguous', owner, reason: verdict.reason, detail: verdict.detail };
    }
    if (state === 'owner_invalid' && verdict !== null && owner !== null) {
      return { ...base, state: 'owner_invalid', owner, reason: verdict.reason, detail: verdict.detail };
    }
    if (verdict !== null) {
      return { ...base, state: 'unowned', owner: null, reason: verdict.reason, detail: verdict.detail };
    }

    // `owned` with no resolved owner is unreachable: every rule that can leave the
    // owner null also returns a verdict. Reported rather than assumed away.
    return {
      ...base,
      state: 'unowned',
      owner: null,
      reason: 'no_owner_on_record',
      detail: 'no owner resolved and no rule explained why',
    };
  }

  return {
    classify(identityId) {
      const graph = deps.graphSource.graph();
      const identity = graph.byId.get(identityId);
      if (identity === undefined) {
        return { ok: false, error: 'unknown_identity', identity_id: identityId };
      }
      return { ok: true, finding: classifyIdentity(identity) };
    },

    list(query = {}) {
      const graph = deps.graphSource.graph();
      const scope = query.app === undefined ? graph.all : (graph.byApp.get(query.app) ?? []);

      const findings = scope
        // Groups are permission containers, not things a person owns.
        .filter((identity) => identity.type !== 'group')
        .map((identity) => classifyIdentity(identity))
        .filter((finding) => query.includeUncounted === true || finding.counted)
        .filter((finding) => query.state === undefined || finding.state === query.state)
        .filter(
          (finding) => query.minSeverity === undefined || atLeast(finding.severity, query.minSeverity),
        );

      // Severity first, then the oldest condition, then id for a stable order.
      return Object.freeze(
        [...findings].sort((left, right) => {
          const bySeverity = severityRank(right.severity) - severityRank(left.severity);
          if (bySeverity !== 0) {
            return bySeverity;
          }
          const byAge = (right.timeline.age_days ?? 0) - (left.timeline.age_days ?? 0);
          return byAge !== 0 ? byAge : left.identity_id.localeCompare(right.identity_id);
        }),
      );
    },
  };
}
