import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchLineageCoverage,
  fetchLineageList,
  fetchLineageActors,
  fetchLineageTree,
} from '../api/lineageApi.js';
import {
  buildLineageViewModel,
  mergeTreeIntoForest,
  engineAppForScope,
  flattenForest,
  coverageViewModel,
} from '../adapters/lineageViewModel.js';
import { identities } from '../data/mockData.js';

function useMockFlag() {
  return import.meta.env.VITE_USE_MOCK === '1';
}

/**
 * Loads Provisioning Lineage for Delegation Chain.
 *
 * - Default: live `/api/lineage/*`; on failure → Error + Retry (no silent mock).
 * - `VITE_USE_MOCK=1`: lightweight mock identity index; page keeps mock forest builders.
 */
export function useDelegationChain({
  connectorId,
  cloudId,
  scopeLabel,
  scopeCategory,
  integratedAt,
}) {
  const preferMock = useMockFlag();
  const engineApp = preferMock ? null : engineAppForScope(connectorId, cloudId);

  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const treeCacheRef = useRef({});

  const load = useCallback(async (signal) => {
    setLoading(true);
    setError(null);

    if (preferMock) {
      try {
        if (signal?.aborted) return;
        setBundle({
          source: 'mock',
          engineApp: null,
          coverage: {
            engineApp: null,
            total: identities.length,
            withRecordedCreator: null,
            explainedAbsences: null,
            unexplained: null,
            explanationCoverage: null,
            gapBuckets: [],
            creationDataFrom: integratedAt || null,
            mock: true,
          },
          listMeta: { count: identities.length, withRecordedCreator: null, selfAuthorized: null },
          actors: [],
          forest: null, // page builds from buildDelegationChains
          tableRows: null,
          identityById: Object.fromEntries(identities.map((i) => [i.id, i])),
          rows: [],
        });
        treeCacheRef.current = {};
      } catch (err) {
        if (!signal?.aborted) setError(err?.message || 'mock_load_failed');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
      return;
    }

    try {
      const query = engineApp ? { app: engineApp } : {};
      const [coverage, lineageList, actors] = await Promise.all([
        fetchLineageCoverage(engineApp ? { app: engineApp } : {}, { signal }),
        engineApp
          ? fetchLineageList(query, { signal })
          : Promise.resolve({ count: 0, with_recorded_creator: 0, self_authorized: 0, rows: [] }),
        engineApp
          ? fetchLineageActors(query, { signal })
          : Promise.resolve({ count: 0, actors: [] }),
      ]);

      if (signal?.aborted) return;

      const floor = coverageViewModel(coverage, engineApp).creationDataFrom;

      setBundle(buildLineageViewModel({
        coverage,
        lineageList,
        actors,
        scopeLabel,
        scopeCategory,
        connectorId,
        integratedAt: integratedAt || floor || null,
        engineApp,
      }));
      treeCacheRef.current = {};
    } catch (err) {
      if (!signal?.aborted) {
        setBundle(null);
        setError(err?.message || 'request_failed');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [
    preferMock,
    engineApp,
    connectorId,
    scopeLabel,
    scopeCategory,
    integratedAt,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  /**
   * Lazy tree fetch for search focus / enrich.
   * Merges distance=1 descendants into the forest node; caches raw tree.
   */
  const loadTree = useCallback(async (identityId, depth = 3) => {
    if (!identityId || preferMock) return null;

    try {
      let tree = treeCacheRef.current[identityId];
      if (!tree) {
        tree = await fetchLineageTree(identityId, { depth });
        treeCacheRef.current[identityId] = tree;
      }
      setBundle((prev) => {
        if (!prev?.forest) return prev;
        const rowById = new Map((prev.rows || []).map((r) => [r.identity_id, r]));
        const forest = mergeTreeIntoForest(prev.forest, identityId, tree, rowById);
        const tableRows = flattenForest(forest).filter((r) => !r.isForestRoot);
        return { ...prev, forest, tableRows };
      });
      return tree;
    } catch (err) {
      console.warn('lineage tree load failed', identityId, err?.message || err);
      return null;
    }
  }, [preferMock]);

  return {
    bundle,
    loading,
    error,
    reload: () => load(),
    preferMock,
    engineApp,
    loadTree,
  };
}
