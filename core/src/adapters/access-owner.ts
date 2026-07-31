import type { AccessOwnerSource } from '../access/service.js';
import type { OwnerRef } from '../domain/ownership.js';
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
 */
export function memoizedAccessOwner(service: OwnershipService): AccessOwnerSource {
  const cache = new Map<string, OwnerRef | null>();

  return Object.freeze({
    owner(identityId: string): OwnerRef | null {
      const cached = cache.get(identityId);
      // `has` rather than an `undefined` check: null is a real answer meaning
      // nothing resolved an owner, and caching it is the point.
      if (cached !== undefined || cache.has(identityId)) {
        return cached ?? null;
      }
      const outcome = service.classify(identityId);
      const resolved = outcome.ok ? outcome.finding.owner : null;
      cache.set(identityId, resolved);
      return resolved;
    },
  });
}
