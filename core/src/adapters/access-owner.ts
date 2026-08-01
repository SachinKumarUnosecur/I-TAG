import type { AccessOwnerSource } from '../access/service.js';
import type { AccessOwnerResolution } from '../domain/access.js';
import type { OwnershipService } from '../ownership/classify.js';

/**
 * Adapts Ownership Assurance to the narrow port Access Discovery declares.
 *
 * The seam exists so Access Discovery does not import the ownership module:
 * `docs/PRD-access-discovery.md` §2.1 has Ownership reading *this* module for
 * grant-level attribution, and a direct dependency in this direction would put the
 * two in a cycle the moment that lands. Only this adapter knows both sides — the
 * same arrangement `memoizedOwnershipState` makes for Provisioning Lineage.
 *
 * **Memoized, and that is not an optimization.** `OwnershipService.classify` runs
 * an accountability traversal and the full resolver chain per identity, while
 * §6.3's table emits one row per (identity, permission) — so an un-memoized source
 * would re-resolve the same identity once per permission it can reach, which is
 * quadratic in exactly the view that has the most rows.
 *
 * Returns the full resolution (state + suppression + owner). Collapsing to
 * `OwnerRef | null` was how unknown / suppressed rows were painted as Unowned.
 */
export function memoizedAccessOwner(service: OwnershipService): AccessOwnerSource {
  const cache = new Map<string, AccessOwnerResolution>();

  return Object.freeze({
    owner(identityId: string): AccessOwnerResolution {
      const cached = cache.get(identityId);
      if (cached !== undefined) {
        return cached;
      }
      const outcome = service.classify(identityId);
      /**
       * An identity ownership cannot classify is reported as `unknown` with no
       * owner — ownership's own vocabulary for "we have no basis to say", never
       * fabricated as `unowned`.
       */
      const resolved: AccessOwnerResolution = outcome.ok
        ? {
            owner: outcome.finding.owner,
            state: outcome.finding.state,
            suppression: outcome.finding.suppression,
          }
        : {
            owner: null,
            state: 'unknown',
            suppression: null,
          };
      cache.set(identityId, resolved);
      return resolved;
    },
  });
}
