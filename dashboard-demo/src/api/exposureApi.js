import { apiGet } from './client.js';

function toQuery(query = {}) {
  const qs = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  });
  const suffix = qs.toString() ? `?${qs}` : '';
  return suffix;
}

/**
 * `GET /api/exposure/summary` — classification-completeness gate + band
 * distribution + scored/no_paths/no_classified_permissions counts.
 */
export function fetchExposureSummary(query = {}, opts) {
  return apiGet(`/api/exposure/summary${toQuery(query)}`, opts);
}

/** `GET /api/exposure` — ranked `ExposureRow[]` table, engine order already sorted. */
export function fetchExposureList(query = {}, opts) {
  return apiGet(`/api/exposure${toQuery(query)}`, opts);
}

/** `GET /api/exposure/:id` — `ExposureProfile` (exposure set, rings, contributions, ownership). */
export function fetchExposureProfile(identityId, opts) {
  return apiGet(`/api/exposure/${encodeURIComponent(identityId)}`, opts);
}

/** `GET /api/exposure/:id/export` URL — contribution-level CSV audit pack. */
export function exposureProfileExportUrl(identityId) {
  return `/api/exposure/${encodeURIComponent(identityId)}/export`;
}

/** Fetch + trigger a browser download of the CSV export (avoids a bare `<a href>` GET nav). */
export async function downloadExposureProfileCsv(identityId) {
  const response = await fetch(exposureProfileExportUrl(identityId), {
    headers: { Accept: 'text/csv' },
  });
  if (!response.ok) {
    throw new Error(`export_failed_${response.status}`);
  }
  const text = await response.text();
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${identityId}-exposure.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
