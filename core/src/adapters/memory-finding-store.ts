import type { FindingDisposition } from '../domain/ownership.js';
import type { FindingStore } from '../domain/ports.js';

/**
 * In-memory, append-only journal.
 *
 * Swapping this for a durable store is the only change needed to make findings
 * survive a restart; nothing in the domain knows which is in use.
 */
export function memoryFindingStore(): FindingStore {
  const journal: FindingDisposition[] = [];

  return Object.freeze({
    append(disposition: FindingDisposition) {
      journal.push(disposition);
    },
    history(identityId: string) {
      return Object.freeze(journal.filter((entry) => entry.identity_id === identityId));
    },
    all() {
      return Object.freeze([...journal]);
    },
  });
}
