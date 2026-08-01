import { apiGet } from './client.js';

/** `GET /api/risk-profile/summary` — factor coverage + level counts (no fused score). */
export function fetchRiskSummary(query = {}, opts) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiGet(`/api/risk-profile/summary${suffix}`, opts);
}

/**
 * `GET /api/risk-profile`
 * Pass `include_without_findings=true` when joining the full Access Discovery population.
 */
export function fetchRiskList(query = {}, opts) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return apiGet(`/api/risk-profile${suffix}`, opts);
}
