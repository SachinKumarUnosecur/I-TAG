import { useCallback, useEffect, useState } from 'react';
import { fetchExposureList, fetchExposureSummary } from '../api/exposureApi.js';
import {
  buildExposureMapViewModel,
  buildExposureMapViewModelFromMock,
} from '../adapters/exposureViewModel.js';
import { fetchCloudExposureInventory } from '../data/exposureApi.js';

function useMockFlag() {
  return import.meta.env.VITE_USE_MOCK === '1';
}

/**
 * Loads Identity Exposure Map from `@itag/backend` (`/api/exposure/summary` + `/api/exposure`).
 *
 * - Default: live APIs; on failure surfaces Error + Retry (no silent mock fallback).
 * - `VITE_USE_MOCK=1`: offline mock bundle through the same view-model shape.
 * - `app` (engine's own filter dimension — there is no `cloud=` on this endpoint) is applied
 *   to both calls so the completeness KPI and the table agree on the same population.
 */
export function useExposureMap({ app } = {}) {
  const preferMock = useMockFlag();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);

    if (preferMock) {
      try {
        const inventory = fetchCloudExposureInventory('all');
        const filtered = app
          ? inventory.filter((item) => (item.department || item.clouds?.[0] || 'mock') === app)
          : inventory;
        if (signal?.aborted) return;
        setBundle(buildExposureMapViewModelFromMock(filtered));
      } catch (err) {
        if (!signal?.aborted) setError(err?.message || 'mock_load_failed');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
      return;
    }

    try {
      const query = app ? { app } : {};
      const [summary, list] = await Promise.all([
        fetchExposureSummary(query, { signal }),
        fetchExposureList(query, { signal }),
      ]);
      if (signal?.aborted) return;
      setBundle(buildExposureMapViewModel({ summary, list }));
    } catch (err) {
      if (!signal?.aborted) {
        setBundle(null);
        setError(err?.message || 'request_failed');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [preferMock, app]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return {
    bundle,
    loading,
    error,
    reload: () => load(),
    preferMock,
  };
}
