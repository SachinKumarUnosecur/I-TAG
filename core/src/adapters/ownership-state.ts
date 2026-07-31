import type { OwnershipState } from '../domain/ownership.js';
import type { OwnershipService } from '../ownership/classify.js';
import type { OwnershipStateSource } from '../lineage/signals.js';

/**
 * Adapts Ownership Assurance to the narrow port Provisioning Lineage declares.
 *
 * The seam exists so lineage does not import the ownership module:
 * `docs/delegation-chain-research.md` §7.2 has ownership *consuming* lineage, and a
 * direct dependency in this direction would put the two in a cycle the moment that
 * happens. Only this adapter knows both sides.
 *
 * **Memoized, and that is not an optimization.** `OwnershipService.classify` runs an
 * accountability traversal and the full resolver chain per identity, so a lineage
 * table scan that asks for every creator's state would re-classify the same handful
 * of provisioning bots once per row — quadratic in a view whose whole design goal
 * (§5) is to stay linear. The cache is per-instance and lives as long as the
 * composition root, which is correct here because the dataset is static and built
 * once at boot; a deployment with a mutable graph must scope one of these per scan.
 */
export function memoizedOwnershipState(service: OwnershipService): OwnershipStateSource {
  const cache = new Map<string, OwnershipState | null>();

  return Object.freeze({
    state(identityId: string): OwnershipState | null {
      const cached = cache.get(identityId);
      // `has` rather than an `undefined` check: null is a real answer, meaning the
      // principal is outside our population — an AWS service, say — and caching it
      // is the point, since those are the ids asked about most often.
      if (cached !== undefined || cache.has(identityId)) {
        return cached ?? null;
      }
      const outcome = service.classify(identityId);
      const resolved = outcome.ok ? outcome.finding.state : null;
      cache.set(identityId, resolved);
      return resolved;
    },
  });
}
