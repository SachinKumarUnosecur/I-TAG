import { apiGet } from './client.js';

/** `GET /api/access/summary` — PRD §6.4 path-mix strip. */
export function fetchAccessSummary(query = {}, opts) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiGet(`/api/access/summary${suffix}`, opts);
}

/** `GET /api/access` — PRD §6.3 table rows (`path` + `ownership`). */
export function fetchAccessList(query = {}, opts) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiGet(`/api/access${suffix}`, opts);
}

/** `GET /api/access/:id` — PRD §6.9 identity profile. */
export function fetchAccessProfile(identityId, opts) {
  return apiGet(`/api/access/${encodeURIComponent(identityId)}`, opts);
}
