import { useCallback, useEffect, useState } from 'react';
import { fetchExposureProfile } from '../api/exposureApi.js';
import { buildExposureIdentityViewModel } from '../adapters/exposureViewModel.js';

function useMockFlag() {
  return import.meta.env.VITE_USE_MOCK === '1';
}

/**
 * Loads one `ExposureProfile` from `GET /api/exposure/:id` when `identityId` changes.
 *
 * The engine has no `ExposureProfile` shape in offline mock mode (mock inventory carries a
 * flat score, not `exposure_set` / `rings` / `contributions`), so `VITE_USE_MOCK=1` surfaces
 * that explicitly rather than fabricating a profile — see `ExposureIdentity`'s mock-mode panel.
 */
export function useExposureIdentity(identityId) {
  const preferMock = useMockFlag();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async (signal) => {
    if (!identityId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    if (preferMock) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const raw = await fetchExposureProfile(identityId, { signal });
      if (signal?.aborted) return;
      setProfile(buildExposureIdentityViewModel(raw));
    } catch (err) {
      if (!signal?.aborted) {
        if (err?.status === 404 || err?.message === 'unknown_identity') {
          setNotFound(true);
        } else {
          setError(err?.message || 'request_failed');
        }
        setProfile(null);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [identityId, preferMock]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    profile,
    loading,
    error,
    notFound,
    reload: () => load(),
    preferMock,
  };
}
