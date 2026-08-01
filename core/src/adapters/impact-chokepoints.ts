import type { ChokePoint, ImpactAssessment } from '../domain/impact.js';
import type { ImpactService } from '../impact/service.js';
import type { ThreatImpactSource } from '../threat/service.js';

/**
 * Adapts Blast Radius to the two-method port Identity Threat Profile declares.
 *
 * The seam exists for the reason `memoizedImpactExposure` does: only the composition root
 * knows both sides. This adapter is wider than that one because Threat Profile's Impact
 * derivation (research §4.2) reads two different things Blast Radius produces — a per-identity
 * `ImpactAssessment` for the pivot-shaped findings, and the whole estate's `ChokePointReport`
 * for the choke-point escalation bump — and the second is not indexed by identity at all.
 *
 * **Two caches for two different costs.** `chokePoints()` runs the exhaustive or greedy
 * selector once over the whole candidate space; `assessment()` runs the propagation walk once
 * per identity. Computing the report on every `chokePoints()` call would repeat the selector's
 * own worst cost on every identity this module scores, exactly the quadratic blow-up
 * `memoizedImpactExposure`'s header warns against for the per-identity case.
 */
export function memoizedImpactChokePoints(service: ImpactService): ThreatImpactSource {
  const assessmentCache = new Map<string, ImpactAssessment | null>();
  let chokePoints: readonly ChokePoint[] | null = null;

  return Object.freeze({
    assessment(identityId: string): ImpactAssessment | null {
      const cached = assessmentCache.get(identityId);
      if (cached !== undefined) {
        return cached;
      }
      const outcome = service.profile(identityId);
      const resolved = outcome.ok ? outcome.profile.assessment : null;
      assessmentCache.set(identityId, resolved);
      return resolved;
    },

    chokePoints(): readonly ChokePoint[] {
      chokePoints ??= service.chokePoints().candidates;
      return chokePoints;
    },
  });
}
