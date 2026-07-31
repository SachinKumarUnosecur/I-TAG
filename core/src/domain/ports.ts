import type { IdentityGraph } from '../graph/build.js';

/**
 * Time source. Injected so that staleness arithmetic is deterministic in tests
 * and pinnable during a live demo. Domain code must never call `Date.now()`.
 *
 * Implementations: `systemClock` and `fixedClock` (both in `src/adapters/clock.ts`).
 */
export interface Clock {
  now(): Date;
}

/**
 * Supplies the built graph. Keeps route handlers and domain code away from the
 * filesystem and from dataset construction.
 *
 * Implementations: `seedGraphSource` (production, in `src/adapters/seed-source.ts`),
 * fixture graphs in the test suites, and — once F7 lands — a simulation source
 * returning a mutated copy so "what-if" toggles never touch the base dataset.
 */
export interface GraphSource {
  graph(): IdentityGraph;
}
