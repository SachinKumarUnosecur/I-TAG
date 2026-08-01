import { apiGet } from './client.js';

function toQuery(query = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return suffix;
}

/** `GET /api/lineage/coverage` — explanation coverage + gap buckets. */
export function fetchLineageCoverage(query = {}, opts) {
  return apiGet(`/api/lineage/coverage${toQuery(query)}`, opts);
}

/** `GET /api/lineage` — ProvenanceRecord rows (+ count / with_recorded_creator). */
export function fetchLineageList(query = {}, opts) {
  return apiGet(`/api/lineage${toQuery(query)}`, opts);
}

/** `GET /api/lineage/actors` — fan-out vs each actor's own baseline. */
export function fetchLineageActors(query = {}, opts) {
  return apiGet(`/api/lineage/actors${toQuery(query)}`, opts);
}

/** `GET /api/lineage/:id` — single ProvenanceRecord (+ walks). */
export function fetchLineageRecord(identityId, opts) {
  return apiGet(`/api/lineage/${encodeURIComponent(identityId)}`, opts);
}

/**
 * `GET /api/lineage/:id/tree` — depth-bounded ancestors + descendants.
 * Default depth=3; never request unbounded depth.
 */
export function fetchLineageTree(identityId, { depth = 3 } = {}, opts) {
  const bounded = Math.max(1, Math.min(Number(depth) || 3, 8));
  return apiGet(
    `/api/lineage/${encodeURIComponent(identityId)}/tree${toQuery({ depth: bounded })}`,
    opts,
  );
}
