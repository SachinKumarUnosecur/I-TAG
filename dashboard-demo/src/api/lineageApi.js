import { apiGet } from './client.js';

/** `GET /api/lineage` — provisioning provenance for Originator column. */
export function fetchLineageList(query = {}, opts) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiGet(`/api/lineage${suffix}`, opts);
}
