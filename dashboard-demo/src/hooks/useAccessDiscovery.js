import { useCallback, useEffect, useState } from 'react';
import { fetchAccessList, fetchAccessSummary } from '../api/accessApi.js';
import { fetchRiskList, fetchRiskSummary } from '../api/riskApi.js';
import { fetchLineageList } from '../api/lineageApi.js';
import {
  buildAccessDiscoveryViewModel,
  buildViewModelFromMockBundle,
} from '../adapters/accessViewModel.js';
import { fetchAccessDiscoveryFromSources } from '../data/accessDiscoveryApi.js';

function useMockFlag() {
  return import.meta.env.VITE_USE_MOCK === '1';
}

/**
 * Loads Access Discovery from `@itag/backend` (access + risk + lineage join).
 *
 * - Default: live APIs; on failure surfaces Error + Retry (no silent mock).
 * - `VITE_USE_MOCK=1`: offline mock bundle through the same view-model shape.
 */
export function useAccessDiscovery() {
  const preferMock = useMockFlag();
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);

    if (preferMock) {
      try {
        const mock = await fetchAccessDiscoveryFromSources();
        if (signal?.aborted) return;
        setBundle(buildViewModelFromMockBundle(mock));
      } catch (err) {
        if (!signal?.aborted) setError(err?.message || 'mock_load_failed');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
      return;
    }

    try {
      const [accessSummary, accessList, riskSummary, riskList, lineageList] = await Promise.all([
        fetchAccessSummary({}, { signal }),
        fetchAccessList({}, { signal }),
        fetchRiskSummary({}, { signal }),
        fetchRiskList({ include_without_findings: true }, { signal }),
        fetchLineageList({}, { signal }),
      ]);

      if (signal?.aborted) return;

      setBundle(buildAccessDiscoveryViewModel({
        accessSummary,
        accessList,
        riskSummary,
        riskList,
        lineageList,
      }));
    } catch (err) {
      if (!signal?.aborted) {
        setBundle(null);
        setError(err?.message || 'request_failed');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [preferMock]);

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
