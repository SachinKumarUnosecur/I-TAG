const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  health: () => request('/health'),
  overview: () => request('/overview'),
  identities: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/identities${qs ? `?${qs}` : ''}`);
  },
  apps: () => request('/apps'),
  threats: () => request('/threats'),
  threatAction: (id, action) =>
    request(`/threats/${id}/actions`, { method: 'POST', body: JSON.stringify({ action }) }),
  reviews: () => request('/reviews'),
  reviewAction: (id, decision) =>
    request(`/reviews/${id}/action`, { method: 'POST', body: JSON.stringify({ decision }) }),
  ownership: () => request('/ownership'),
  copilotChat: (message) =>
    request('/copilot/chat', { method: 'POST', body: JSON.stringify({ message }) }),
  sync: () => request('/sync'),
};
