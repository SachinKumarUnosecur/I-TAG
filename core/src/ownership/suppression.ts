import type { Suppression, SuppressionReason } from '../domain/ownership.js';
import type { SuppressionRegistry } from '../domain/ports.js';
import type { Identity } from '../domain/types.js';
import type { IdentityGraph } from '../graph/build.js';

export interface SuppressionContext {
  readonly identity: Identity;
  readonly graph: IdentityGraph;
  readonly registry: SuppressionRegistry;
  readonly now: Date;
}

/**
 * One reason an identity does not belong in the orphan queue.
 *
 * Suppression is a first-class part of the detector, not a filter bolted on
 * afterwards: the six classes in `docs/orphaned-identity-research.md` §4.6 are
 * the ways this feature loses analyst trust, and each needs its own explicit,
 * inspectable rule rather than a hardcoded exclusion list.
 */
export interface SuppressionRule {
  readonly id: string;
  evaluate(context: SuppressionContext): Suppression | null;
}

/** An exception is spent once its expiry passes; a structural fact never expires. */
function isLive(expiresAt: string | undefined, now: Date): boolean {
  if (expiresAt === undefined) {
    return true;
  }
  const parsed = Date.parse(expiresAt);
  return Number.isNaN(parsed) || parsed >= now.getTime();
}

/**
 * Builds a rule that honours one registered exemption class.
 *
 * A factory rather than three near-identical objects, so adding a class is one
 * line in the registry list below.
 */
function registeredExemptionRule(reason: SuppressionReason): SuppressionRule {
  return {
    id: `registered_${reason}`,
    evaluate({ identity, registry, now }) {
      const entry = registry.entry(identity.id);
      if (entry === null || entry.reason !== reason || !isLive(entry.expires_at, now)) {
        return null;
      }
      return {
        effect: 'suppressed',
        reason,
        detail: entry.detail,
        expires_at: entry.expires_at ?? null,
      };
    },
  };
}

/** Already cleaned up. Out of scope entirely rather than a resolved finding. */
const alreadyRevokedRule: SuppressionRule = {
  id: 'already_revoked',
  evaluate({ identity }) {
    if (identity.revoked !== true) {
      return null;
    }
    return {
      effect: 'excluded',
      reason: 'already_revoked',
      detail: 'identity is revoked, so it carries no live access to own',
      expires_at: null,
    };
  },
};

/**
 * Federated identities are provisioned outside the app, so the app's audit log
 * has no creator to find. That is missing data, not an absent owner.
 */
const ssoFederatedRule: SuppressionRule = {
  id: 'sso_federated',
  evaluate({ identity }) {
    if (identity.provisioning_source !== 'sso_federated' || identity.provisioned_by !== null) {
      return null;
    }
    return {
      effect: 'unknown',
      reason: 'sso_federated',
      detail: 'provisioned via SSO federation, so this app records no creator',
      expires_at: null,
    };
  },
};

/**
 * Created before the app's audit retention begins.
 *
 * `docs/PRD-delegation-chain.md` §6.6 requires this be visible as a data gap:
 * a cluster of identities with no recoverable creator is a retention artefact,
 * and counting it as orphans is a fabricated finding.
 */
const outsideAuditWindowRule: SuppressionRule = {
  id: 'outside_audit_window',
  evaluate({ identity, graph }) {
    const app = graph.apps.get(identity.app);
    const floor = app?.creation_data_from ?? null;
    if (floor === null || identity.created_at === undefined || identity.provisioned_by !== null) {
      return null;
    }

    const createdAt = Date.parse(identity.created_at);
    const retentionFrom = Date.parse(floor);
    if (Number.isNaN(createdAt) || Number.isNaN(retentionFrom) || createdAt >= retentionFrom) {
      return null;
    }

    return {
      effect: 'unknown',
      reason: 'outside_audit_window',
      detail:
        `created ${identity.created_at}, before ${identity.app} creation data begins (${floor}); ` +
        `no creator is recoverable`,
      expires_at: null,
    };
  },
};

/**
 * Evaluation order is precedence order.
 *
 * Revocation first (nothing else matters about a dead identity), then the data
 * gaps that make a verdict impossible, then the registered exemptions that make
 * a verdict unnecessary.
 */
export const DEFAULT_SUPPRESSION_RULES: readonly SuppressionRule[] = Object.freeze([
  alreadyRevokedRule,
  ssoFederatedRule,
  outsideAuditWindowRule,
  registeredExemptionRule('break_glass'),
  registeredExemptionRule('shared_system'),
  registeredExemptionRule('vendor_managed'),
]);

export function applySuppression(
  context: SuppressionContext,
  rules: readonly SuppressionRule[] = DEFAULT_SUPPRESSION_RULES,
): Suppression | null {
  for (const rule of rules) {
    const suppression = rule.evaluate(context);
    if (suppression !== null) {
      return suppression;
    }
  }
  return null;
}
