import type { ExposureOwnershipContext } from '../domain/exposure.js';
import { EXPOSURE_VERSUS_SEVERITY } from '../domain/exposure.js';
import type { OwnershipService } from '../ownership/classify.js';
import type { ExposureOwnershipSource } from '../exposure/service.js';

/**
 * Adapts Ownership Assurance to the narrow port Identity Exposure Map declares.
 *
 * The seam exists for the reason `memoizedAccessOwner` and `memoizedOwnershipState`
 * exist: only an adapter knows both sides, so neither module imports the other and
 * the dependency cannot become a cycle. This one carries more than an owner
 * reference because it answers a question the other two do not have to —
 * **why are there two numbers on this row.**
 *
 * `docs/identity-exposure-map-research.md` §7.2: exposure is the product's second
 * ranking authority, and a reviewer seeing `user-jane` at severity `none` and
 * exposure 78 will ask which one is lying. Neither is. Shipping ownership's verdict
 * inside the exposure payload, next to the sentence that reconciles them, is what
 * makes two rankers survivable in front of a customer — a UI cannot render one
 * number without having been handed the other.
 *
 * **Memoized, and that is not an optimization.** `OwnershipService.classify` runs
 * an accountability traversal and the full resolver chain per identity, while the
 * exposure landing table asks for every identity in the estate. Un-memoized, the
 * summary strip would re-classify the population once per view. The cache is
 * per-instance and lives as long as the composition root, which is correct while
 * the dataset is static and built once at boot.
 */
export function memoizedExposureOwnership(service: OwnershipService): ExposureOwnershipSource {
  const cache = new Map<string, ExposureOwnershipContext>();

  return Object.freeze({
    context(identityId: string): ExposureOwnershipContext {
      const cached = cache.get(identityId);
      if (cached !== undefined) {
        return cached;
      }

      const outcome = service.classify(identityId);
      /**
       * An identity ownership cannot classify is reported as `unknown` at severity
       * `none`, which is ownership's own vocabulary for "we have no basis to say"
       * rather than an invention of this adapter. `unknown` is structurally
       * excluded from ownership's counts (architecture rule 9), so the row reads
       * the same here as it does there.
       */
      const resolved: ExposureOwnershipContext = outcome.ok
        ? {
            state: outcome.finding.state,
            severity: outcome.finding.severity,
            owner: outcome.finding.owner,
            why_these_differ: EXPOSURE_VERSUS_SEVERITY,
          }
        : {
            state: 'unknown',
            severity: 'none',
            owner: null,
            why_these_differ: EXPOSURE_VERSUS_SEVERITY,
          };

      cache.set(identityId, resolved);
      return resolved;
    },
  });
}
