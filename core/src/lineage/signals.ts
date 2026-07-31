import { daysSince } from '../accountability/rules.js';
import type {
  CreationActor,
  CreationAuthoritySignal,
  FanOutSignal,
  LineageGap,
  PrivilegeGrantEvent,
} from '../domain/lineage.js';
import type { OwnershipState } from '../domain/ownership.js';
import type { FanOutBaseline, LineagePolicy } from '../domain/policy.js';
import type { SuppressionRegistry } from '../domain/ports.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';

// ---------------------------------------------------------------------------
// Gap buckets — research §4.5
// ---------------------------------------------------------------------------

export interface LineageGapContext {
  readonly identity: Identity;
  readonly graph: IdentityGraph;
  /** Registered break-glass, shared-system and vendor-managed declarations. */
  readonly registry: SuppressionRegistry;
  readonly policy: LineagePolicy;
}

/**
 * One reason an identity has no creator on record.
 *
 * A frozen registry for the same reason `DEFAULT_SUPPRESSION_RULES` is one: the
 * buckets are how this module reports its own blind spots, and each needs to be
 * separately inspectable rather than hidden inside a `switch`. Adding a bucket —
 * when a new provider exposes a new `creationType`, say — is appending an object.
 *
 * Contract: never throws, and returns either a fully populated gap or null so the
 * next rule runs.
 */
export interface LineageGapRule {
  readonly id: string;
  evaluate(context: LineageGapContext): LineageGap | null;
}

/**
 * SSO/SCIM: the creator exists, in the IdP, and this app's log never saw it.
 *
 * Same reading as `ownership/suppression.ts` L79-92, which already treats this as
 * missing data rather than an absent owner. Repeated here rather than shared,
 * because the two modules answer different questions about the same fact and
 * collapsing them would make a lineage gap silently suppress an ownership finding.
 */
const federatedElsewhereRule: LineageGapRule = {
  id: 'federated_elsewhere',
  evaluate({ identity }) {
    if (identity.provisioning_source !== 'sso_federated') {
      return null;
    }
    return {
      reason: 'federated_elsewhere',
      detail: `provisioned into ${identity.app} by SSO federation, so the creator is recorded in the IdP rather than here`,
      recoverable_from: null,
    };
  },
};

/**
 * A self-service signup: no admin created it, and it is not a root either.
 *
 * `PRD` §8 L181 files this as an open question — "neither quite describes it". It is
 * its own bucket, and Entra already exposes the field that populates it
 * (`creationType` `SelfServiceSignUp` / `EmailVerified`, research §3.2). Closes the
 * first half of research gap 9: `types.ts` L55 has declared this value since the
 * first commit with no rule reading it.
 */
const selfRegisteredRule: LineageGapRule = {
  id: 'self_registered',
  evaluate({ identity }) {
    if (identity.provisioning_source !== 'self_registered') {
      return null;
    }
    return {
      reason: 'self_registered',
      detail: 'created through a self-service signup flow, so no administrator ever authorised it',
      recoverable_from: null,
    };
  },
};

/** A migration: no per-identity actor was ever recorded. Second half of gap 9. */
const bulkImportedRule: LineageGapRule = {
  id: 'bulk_imported',
  evaluate({ identity }) {
    if (identity.provisioning_source !== 'bulk_import') {
      return null;
    }
    return {
      reason: 'bulk_imported',
      detail: 'loaded in bulk during a migration, which records one job rather than one actor per identity',
      recoverable_from: null,
    };
  },
};

/**
 * Unowned by design, and declared as such.
 *
 * Below the three rules above rather than at the top, and the ordering is a real
 * distinction: a `provisioning_source` says *why no creation edge exists*, while a
 * registered exemption says *why that is acceptable*. This module's question is the
 * first one, so the mechanical fact wins and the declaration is the fallback.
 */
const rootByDesignRule: LineageGapRule = {
  id: 'root_by_design',
  evaluate({ identity, registry }) {
    const entry = registry.entry(identity.id);
    if (entry === null) {
      return null;
    }
    return {
      reason: 'root_by_design',
      detail: `registered as ${entry.reason}: ${entry.detail}`,
      recoverable_from: null,
    };
  },
};

/**
 * Predates the app's audit-retention floor, so no creator is recoverable at all.
 *
 * Ranked above `not_yet_captured` because the loss is permanent: the provider has
 * nothing to give us whenever we ask, whereas an identity created after the floor
 * but before our install date was at least recoverable at some point.
 */
const outsideAuditWindowRule: LineageGapRule = {
  id: 'outside_audit_window',
  evaluate({ identity, graph }) {
    const floor = graph.apps.get(identity.app)?.creation_data_from ?? null;
    if (floor === null || identity.created_at === undefined) {
      return null;
    }
    const createdAt = Date.parse(identity.created_at);
    const retentionFrom = Date.parse(floor);
    if (Number.isNaN(createdAt) || Number.isNaN(retentionFrom) || createdAt >= retentionFrom) {
      return null;
    }
    return {
      reason: 'outside_audit_window',
      detail: `created ${identity.created_at}, before ${identity.app} creation data begins`,
      recoverable_from: floor,
    };
  },
};

/**
 * Created before *we* were installed.
 *
 * The bucket that makes the metric move (§4.5): it is the only one that shrinks as
 * the product runs, which is what turns explanation coverage into a line climbing
 * from a known date rather than a static percentage. Last in precedence because it
 * is the weakest claim — it says only that we were not watching yet.
 */
const notYetCapturedRule: LineageGapRule = {
  id: 'not_yet_captured',
  evaluate({ identity, policy }) {
    if (identity.created_at === undefined) {
      return null;
    }
    const createdAt = Date.parse(identity.created_at);
    const observedFrom = Date.parse(policy.observedFrom);
    if (Number.isNaN(createdAt) || Number.isNaN(observedFrom) || createdAt >= observedFrom) {
      return null;
    }
    return {
      reason: 'not_yet_captured',
      detail: `created ${identity.created_at}, before creation-event capture began on ${policy.observedFrom}`,
      recoverable_from: policy.observedFrom,
    };
  },
};

/**
 * Evaluation order is precedence order — research §4.5's six buckets.
 *
 * Note what is absent: there is no `unlinked` rule, because `PRD` L65's single flag
 * is what these six replace. A flag tells you data is missing; a bucket lets you
 * count it, trend it, and exclude it from a denominator.
 */
export const DEFAULT_LINEAGE_GAP_RULES: readonly LineageGapRule[] = Object.freeze([
  federatedElsewhereRule,
  selfRegisteredRule,
  bulkImportedRule,
  rootByDesignRule,
  outsideAuditWindowRule,
  notYetCapturedRule,
]);

/**
 * Classifies why no creation edge exists, or returns null when we cannot say.
 *
 * A null here is the honest outcome and the one that matters: it is the population
 * that makes `explanation_coverage` less than 1, and hiding it behind a seventh
 * catch-all bucket would make the metric unfalsifiable.
 */
export function classifyLineageGap(
  context: LineageGapContext,
  rules: readonly LineageGapRule[] = DEFAULT_LINEAGE_GAP_RULES,
): LineageGap | null {
  for (const rule of rules) {
    const gap = rule.evaluate(context);
    if (gap !== null) {
      return gap;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fan-out as a rate — research §4.3
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** `${app}:${type}` — the class of thing created, not the individual target. */
function targetClass(identity: Identity): string {
  return `${identity.app}:${identity.type}`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (sorted.length % 2 === 1) {
    return upper ?? 0;
  }
  return lower === undefined || upper === undefined ? 0 : (lower + upper) / 2;
}

function standardDeviation(values: readonly number[], mean: number): number {
  if (values.length === 0) {
    return 0;
  }
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export interface FanOutContext {
  readonly actorId: string;
  readonly actor: CreationActor;
  readonly graph: IdentityGraph;
  readonly policy: LineagePolicy;
  readonly now: Date;
}

/**
 * Measures this principal's recent creation rate against its own trailing history.
 *
 * Returns null when the actor created nothing, so the caller has no empty signal to
 * render. Never reads lifetime totals as a threshold — `lifetime_total` travels on
 * the signal for context only, because that number measures tenure (§4.3).
 *
 * The honest limitation, stated because a reviewer will find it anyway: with a
 * curated dataset the trailing windows are sparse, so a deviation is only reported
 * when there is enough history to form one. `exceeds_baseline` stays false when
 * there is not, rather than dividing by a standard deviation of zero and declaring
 * everything anomalous.
 */
export function evaluateFanOut(context: FanOutContext): FanOutSignal | null {
  const { actorId, actor, graph, policy, now } = context;
  const childIds = graph.provisionedChildren.get(actorId) ?? [];
  if (childIds.length === 0) {
    return null;
  }

  const baseline: FanOutBaseline = policy.fanOutBaselines[actor.kind];
  const windowMs = baseline.windowDays * MS_PER_DAY;
  const children = childIds
    .map((id) => graph.byId.get(id))
    .filter((child): child is Identity => child !== undefined);

  /** Windows back from now: 0 is the current window, 1 the one before it. */
  const inWindow = new Map<number, Identity[]>();
  const undated: Identity[] = [];
  for (const child of children) {
    const createdAt = child.created_at === undefined ? Number.NaN : Date.parse(child.created_at);
    if (Number.isNaN(createdAt)) {
      undated.push(child);
      continue;
    }
    const index = Math.floor((now.getTime() - createdAt) / windowMs);
    if (index < 0) {
      continue;
    }
    const bucket = inWindow.get(index);
    if (bucket === undefined) {
      inWindow.set(index, [child]);
    } else {
      bucket.push(child);
    }
  }

  const createdInWindow = (inWindow.get(0) ?? []).length;
  const trailing: number[] = [];
  for (let index = 1; index <= baseline.trailingWindows; index += 1) {
    trailing.push((inWindow.get(index) ?? []).length);
  }

  const trailingMedian = median(trailing);
  const trailingMean = trailing.reduce((total, value) => total + value, 0) / (trailing.length || 1);
  const spread = standardDeviation(trailing, trailingMean);
  const deviationSigma = spread === 0 ? 0 : (createdInWindow - trailingMean) / spread;

  // Novelty is only meaningful against a history. An actor whose only child is its
  // first would otherwise be permanently novel, which would fire on every one-child
  // creator in the estate.
  const historical = new Set<string>();
  for (const [index, bucket] of inWindow) {
    if (index > 0) {
      for (const child of bucket) {
        historical.add(targetClass(child));
      }
    }
  }
  for (const child of undated) {
    historical.add(targetClass(child));
  }
  const novelTargets =
    historical.size === 0
      ? []
      : (inWindow.get(0) ?? []).filter((child) => !historical.has(targetClass(child)));
  const noveltyIsPrivileged = novelTargets.some((child) =>
    child.direct_grants.some((permission) => graph.sensitivePermissions.has(permission)),
  );
  const novelTargetClass = novelTargets.length > 0;

  const overCeiling = baseline.maxInWindow !== null && createdInWindow > baseline.maxInWindow;
  const overSigma =
    baseline.sigmaMultiple !== null && spread > 0 && deviationSigma > baseline.sigmaMultiple;
  const noveltyCounts =
    novelTargetClass && (!baseline.noveltyRequiresPrivilegedTarget || noveltyIsPrivileged);

  const reasons: string[] = [];
  if (overCeiling) {
    reasons.push(
      `${createdInWindow} creations in ${baseline.windowDays} days, above the ${String(baseline.maxInWindow)} expected of a ${actor.kind} actor`,
    );
  }
  if (overSigma) {
    reasons.push(
      `${deviationSigma.toFixed(1)}σ above this principal's own trailing median of ${trailingMedian}`,
    );
  }
  if (noveltyCounts) {
    reasons.push(
      `first ${novelTargets.map((child) => targetClass(child)).sort().join(', ')} this principal has created` +
        (noveltyIsPrivileged ? ', and it holds sensitive access' : ''),
    );
  }

  return {
    actor_id: actorId,
    actor_kind: actor.kind,
    window_days: baseline.windowDays,
    created_in_window: createdInWindow,
    lifetime_total: childIds.length,
    trailing_median: trailingMedian,
    deviation_sigma: Number(deviationSigma.toFixed(2)),
    novel_target_class: novelTargetClass,
    exceeds_baseline: reasons.length > 0,
    detail:
      reasons.length > 0
        ? reasons.join('; ')
        : `${childIds.length} lifetime creations is baseline-normal for this ${actor.kind} actor ` +
          `(${createdInWindow} in the last ${baseline.windowDays} days against its own median of ${trailingMedian})`,
  };
}

// ---------------------------------------------------------------------------
// Creation authority — research §4.4, NIST SP 800-53 AC-2(e)
// ---------------------------------------------------------------------------

/**
 * Ownership Assurance's verdict on an identity, as a narrow port.
 *
 * Injected rather than imported so this module does not depend on the ownership
 * module: research §7.2 has Ownership Assurance *consuming* lineage, and a direct
 * import here would put the two modules in a cycle the moment that happens. The
 * composition root wires the concrete service in.
 */
export interface OwnershipStateSource {
  /** Null when the identity is outside the population, e.g. an AWS service. */
  state(identityId: string): OwnershipState | null;
}

export interface CreationAuthorityContext {
  readonly child: Identity;
  readonly actor: CreationActor;
  readonly graph: IdentityGraph;
  readonly grants: readonly PrivilegeGrantEvent[];
  readonly ownership: OwnershipStateSource;
  readonly policy: LineagePolicy;
  readonly now: Date;
}

function withinWindow(left: string | null, right: string | null, days: number): boolean {
  if (left === null || right === null) {
    return false;
  }
  const from = Date.parse(left);
  const to = Date.parse(right);
  if (Number.isNaN(from) || Number.isNaN(to)) {
    return false;
  }
  return Math.abs(to - from) <= days * MS_PER_DAY;
}

/**
 * The one signal that earns its place — research §4.4.
 *
 * NIST SP 800-53 AC-2(e) requires approvals for account-creation requests, so the
 * computable violation is "the same principal created this account and granted it
 * privilege, and no second party appears in either event". That is the literal shape
 * of the Midnight Blizzard chain, where the actor "created a new user account to
 * grant consent" (Microsoft Security Blog, 25 Jan 2024) — an account whose fan-out
 * was 1 and whose generation was 2, so both of the `PRD`'s shape flags are silent on
 * it (§3.4). A flag set that misses its own canonical incident needs replacing
 * rather than threshold tuning.
 *
 * No traversal: it is a join on `(target, actor)` inside a time window. That the
 * differentiated finding needs no graph walk is itself the evidence for §7.2's
 * verdict about what this module is.
 *
 * Returns null when nothing about the creator is remarkable, so a green row carries
 * no empty signal object.
 */
export function evaluateCreationAuthority(
  context: CreationAuthorityContext,
): CreationAuthoritySignal | null {
  const { child, actor, graph, grants, ownership, policy, now } = context;

  const grantsToChild = grants.filter((grant) => grant.identity_id === child.id);
  const selfGranted = grantsToChild.filter(
    (grant) =>
      grant.actor_principal === actor.raw_principal &&
      grant.approved_by === null &&
      withinWindow(child.created_at ?? null, grant.occurred_at, policy.selfAuthorizedWindowDays),
  );

  // An approver anywhere in either event means a second party was involved, which is
  // exactly what AC-2(e) asks for. Its presence has to be able to clear the finding,
  // or the control is unsatisfiable and the flag is noise.
  const selfAuthorized = selfGranted.length > 0 && actor.review_approver === null;

  const creator = graph.byId.get(actor.raw_principal) ?? null;
  const actorState = ownership.state(actor.raw_principal);
  const dormantDays =
    creator?.last_activity_at === undefined ? null : daysSince(creator.last_activity_at, now);
  const nonProduction = creator?.environment === 'non_production';
  const dormant = dormantDays !== null && dormantDays > policy.creatorDormantDays;
  const unowned = actorState === 'unowned' || actorState === 'owner_invalid';

  // The property research §3.4 concludes is the real signal: not the shape of the
  // chain but a creator that nobody owns, nobody uses, and nobody put in production,
  // exercising a production creation privilege.
  const mismatch = (nonProduction || dormant || unowned) && grantsToChild.length > 0;

  if (!selfAuthorized && !mismatch) {
    return null;
  }

  const reasons: string[] = [];
  if (selfAuthorized) {
    reasons.push(
      `${actor.raw_principal} created ${child.id} and granted it ` +
        `${selfGranted.map((grant) => grant.permission).sort().join(', ')} with no second party in either event (AC-2(e))`,
    );
  }
  if (nonProduction) {
    reasons.push('the creator is a non-production account acting in a production system');
  }
  if (dormant) {
    reasons.push(`the creator has been dormant ${String(dormantDays)} days`);
  }
  if (unowned) {
    reasons.push(`the creator is itself ${String(actorState)}`);
  }

  return {
    child_id: child.id,
    actor,
    actor_ownership_state: actorState ?? 'unknown',
    actor_is_non_production: nonProduction,
    actor_dormant_days: dormantDays,
    self_authorized: selfAuthorized,
    creator_privilege_mismatch: mismatch,
    granted_permissions: Object.freeze(
      [...new Set(grantsToChild.map((grant) => grant.permission))].sort(),
    ),
    detail: reasons.join('; '),
  };
}
