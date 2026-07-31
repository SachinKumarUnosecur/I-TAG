import type { GraphSource } from '../domain/ports.js';
import { buildIdentityGraph, type IdentityGraph } from '../graph/build.js';
import { SEED_DATASET } from '../data/seed.js';
import { validateDataset } from '../data/validate.js';

/**
 * Validates and indexes the seed dataset exactly once, then serves the same
 * frozen graph to every caller.
 *
 * @throws {DatasetValidationError} at construction time if the dataset is invalid.
 */
export function seedGraphSource(): GraphSource {
  const graph: IdentityGraph = buildIdentityGraph(validateDataset(SEED_DATASET));
  return Object.freeze({ graph: () => graph });
}
