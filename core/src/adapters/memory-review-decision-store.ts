import type { ReviewDecisionRecord } from '../domain/access-reviews.js';

/**
 * In-memory decision journal for Access Reviews — `docs/PRD-access-reviews.md` §6.
 *
 * Same durability class as `memoryFindingStore`: process lifetime only. Swapping
 * for a durable store is an adapter change; the domain only sees this port.
 */
export interface ReviewDecisionStore {
  latest(itemId: string): ReviewDecisionRecord | null;
  append(record: ReviewDecisionRecord): void;
  all(): readonly ReviewDecisionRecord[];
}

export function memoryReviewDecisionStore(): ReviewDecisionStore {
  const journal: ReviewDecisionRecord[] = [];

  return Object.freeze({
    latest(itemId: string): ReviewDecisionRecord | null {
      for (let i = journal.length - 1; i >= 0; i -= 1) {
        const entry = journal[i];
        if (entry !== undefined && entry.item_id === itemId) {
          return entry;
        }
      }
      return null;
    },
    append(record: ReviewDecisionRecord) {
      journal.push(record);
    },
    all() {
      return Object.freeze([...journal]);
    },
  });
}
