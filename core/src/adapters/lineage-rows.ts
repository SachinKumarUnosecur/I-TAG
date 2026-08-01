import type { LineageRow } from '../domain/lineage.js';
import type { LineageService } from '../lineage/service.js';
import type { ThreatLineageSource } from '../threat/service.js';

/**
 * Adapts Provisioning Lineage to the narrow port Identity Threat Profile declares.
 *
 * `LineageService` has no per-identity row lookup — `list()` is the table, built in one pass
 * over the population — so this adapter takes the whole table once and indexes it, rather than
 * asking the service for a shape it does not have. The same "quote the replacement fields, not
 * a flags array" discipline `threat/mapping.ts`'s `CREATOR_LINEAGE_RULE` documents applies here
 * too: this adapter hands back `creator_status`, `self_authorized`,
 * `creator_privilege_mismatch` and `fan_out_exceeds_baseline` verbatim, and invents nothing.
 *
 * **Memoized as a single table read, not a per-identity cache.** `list()` walks every identity
 * once; calling it again per identity would turn a linear scan quadratic for exactly the reason
 * `docs/delegation-chain-research.md` §5 warns about. Correct while the dataset is static and
 * built once at boot, same as every other memoized adapter in this file's family.
 */
export function memoizedLineageRows(service: LineageService): ThreatLineageSource {
  let index: ReadonlyMap<string, LineageRow> | null = null;

  function rows(): ReadonlyMap<string, LineageRow> {
    if (index === null) {
      const built = new Map<string, LineageRow>();
      for (const row of service.list()) {
        built.set(row.identity_id, row);
      }
      index = built;
    }
    return index;
  }

  return Object.freeze({
    row(identityId: string): LineageRow | null {
      return rows().get(identityId) ?? null;
    },
  });
}
