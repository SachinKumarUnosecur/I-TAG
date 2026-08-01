/**
 * Thin fetch wrapper for `@itag/backend`.
 * Vite proxies `/api` → `http://localhost:4000` (see vite.config.js).
 */

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status ?? null;
    this.body = body ?? null;
  }
}

export async function apiGet(path, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    throw new ApiError(err?.message || 'request_failed', { status: 0 });
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const code = body?.error || `http_${response.status}`;
    throw new ApiError(code, { status: response.status, body });
  }

  return body;
}

export async function apiPost(path, payload, { signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload ?? {}),
      signal,
    });
  } catch (err) {
    throw new ApiError(err?.message || 'request_failed', { status: 0 });
  }

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const code = body?.error || `http_${response.status}`;
    throw new ApiError(code, { status: response.status, body });
  }

  return body;
}
