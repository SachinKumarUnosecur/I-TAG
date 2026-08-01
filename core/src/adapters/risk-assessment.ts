import type { RiskAssessment } from '../domain/risk.js';
import type { RiskService } from '../risk/service.js';
import type { ThreatRiskSource } from '../threat/service.js';

/**
 * Adapts Identity Risk Profile to the narrow port Identity Threat Profile declares.
 *
 * Structurally identical to `memoizedImpactExposure`, one module later: the whole
 * `RiskAssessment` union is quoted, never a number, because a port typed to a scalar would
 * make this module's Likelihood axis indistinguishable from an authored `risk_score` — the
 * one thing `docs/identity-risk-profile-research.md` Amendment 2 already forbids twice over.
 *
 * **Memoized, and not as an optimization.** `RiskService.profile` runs the full six-factor
 * registry per identity; Threat Profile's `summary()` and `list()` both walk the whole
 * population once, so an un-memoized source would re-run every factor once per view.
 */
export function memoizedRiskAssessment(service: RiskService): ThreatRiskSource {
  const cache = new Map<string, RiskAssessment | null>();

  return Object.freeze({
    assessment(identityId: string): RiskAssessment | null {
      const cached = cache.get(identityId);
      if (cached !== undefined) {
        return cached;
      }
      const outcome = service.profile(identityId);
      const resolved = outcome.ok ? outcome.profile.assessment : null;
      cache.set(identityId, resolved);
      return resolved;
    },
  });
}
