import type { Clock } from '../domain/ports.js';

export const systemClock: Clock = Object.freeze({
  now: () => new Date(),
});

/**
 * Clock pinned to a fixed instant. Used by the test suites, and by the server
 * when `ITAG_NOW` is set so a rehearsed demo produces identical numbers on
 * whatever day it is presented.
 */
export function fixedClock(instant: Date): Clock {
  const frozen = new Date(instant.getTime());
  return Object.freeze({ now: () => new Date(frozen.getTime()) });
}
