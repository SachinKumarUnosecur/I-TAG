import type { ExposureAssessment } from '../domain/exposure.js';
import type { ExposureService } from '../exposure/service.js';
import type { ImpactExposureSource } from '../impact/service.js';

/**
 * Adapts Identity Exposure Map to the narrow port Blast Radius declares.
 *
 * The seam exists for the reason `memoizedExposureOwnership` does: neither module
 * imports the other, and only the composition root knows both sides (architecture
 * rule 4). What crosses it is deliberately minimal — the whole `ExposureAssessment`
 * union for one identity, and nothing else. Not the score, because
 * `docs/unified-impact-analysis-research.md` §4.2 makes "this module authors no
 * 0-100 number" a structural property rather than a review comment, and a port
 * typed as `number` would have made the copy indistinguishable from an original.
 *
 * **Null is a real answer here, not a failure.** Groups are excluded from every
 * module's subject population (architecture rule 12), so exposure has no verdict on
 * one, and `ExposureOutcome`'s `unknown_identity` arm is the honest thing to
 * propagate. `memoizedExposureOwnership` substitutes an `unknown` ownership state in
 * the same position, and can, because `unknown` is ownership's own vocabulary for
 * "we have no basis to say"; exposure has no such arm — `no_paths` would claim it
 * looked — so this adapter passes the absence through instead of inventing one.
 *
 * **Memoized, and not as an optimization.** `ExposureService.profile` runs the
 * scoring model over a full path inventory per identity, while a choke-point report
 * can touch every affected identity across seven candidates. Un-memoized, one report
 * re-scores the same identities once per candidate. The cache is per-instance and
 * lives as long as the composition root, which is correct while the dataset is
 * static and built once at boot.
 */
export function memoizedImpactExposure(service: ExposureService): ImpactExposureSource {
  const cache = new Map<string, ExposureAssessment | null>();

  return Object.freeze({
    assessment(identityId: string): ExposureAssessment | null {
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
