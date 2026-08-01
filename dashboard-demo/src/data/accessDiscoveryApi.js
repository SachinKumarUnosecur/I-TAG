/**
 * Access Discovery API layer
 * Aggregates live-style payloads from connected dataSources (AWS, GCP, Azure, Okta, GWS, Workday).
 * UI consumes this instead of reading static arrays directly.
 */

import {
  dataSources as catalogSources,
  identities as catalogIdentities,
  accessPaths as catalogAccessPaths,
  shadowAdmins as catalogShadowAdmins,
  riskTrend as catalogRiskTrend,
} from './mockData.js';

const SOURCE_KEY_BY_PROVIDER = {
  AWS: 'aws',
  GCP: 'gcp',
  Azure: 'azure',
  Okta: 'okta',
  'Google Workspace': 'googleWorkspace',
  Workday: 'hr',
};

function delay(ms = 180) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function providerKey(provider) {
  return SOURCE_KEY_BY_PROVIDER[provider] || provider.toLowerCase().replace(/\s+/g, '');
}

function pathMatchesSource(path, source) {
  const apiSource = String(path.api?.source || '').toLowerCase();
  const key = providerKey(source.provider);

  if (source.category === 'cloud') {
    return path.cloudProvider === source.provider || apiSource.includes(key);
  }
  if (source.category === 'idp') {
    if (/okta/i.test(source.provider)) return apiSource.includes('okta');
    if (/google|workspace/i.test(source.provider)) {
      return /workspace|google|gws|directory/i.test(apiSource);
    }
    return apiSource.includes(key);
  }
  if (source.category === 'hr') {
    return Boolean(path.api?.hrCorrelation)
      || /workday|hr/i.test(apiSource)
      || /workday|hr/i.test(JSON.stringify(path.api || {}));
  }
  return apiSource.includes(key);
}

function identityMatchesSource(identity, source) {
  const key = providerKey(source.provider);
  if (!identity?.sources) {
    // fall back: identity appears on a path from this source
    return false;
  }
  if (source.category === 'hr') return Boolean(identity.sources.hr);
  if (source.category === 'idp') {
    if (/okta/i.test(source.provider)) return Boolean(identity.sources.okta);
    if (/google|workspace/i.test(source.provider)) return Boolean(identity.sources.googleWorkspace);
  }
  if (source.category === 'cloud') {
    return Boolean(identity.sources[key] || identity.sources[source.provider.toLowerCase()]);
  }
  return Boolean(identity.sources[key]);
}

/** Simulate calling one connector's documented APIs and returning its slice of inventory. */
async function fetchSourceInventory(source) {
  await delay(50);

  if (source.status !== 'connected') {
    return {
      sourceId: source.id,
      provider: source.provider,
      apisCalled: [],
      identities: [],
      accessPaths: [],
      shadowAdmins: [],
      lastSync: source.lastSync,
      ok: false,
    };
  }

  const identities = catalogIdentities.filter(i => identityMatchesSource(i, source));
  const accessPaths = catalogAccessPaths
    .filter(p => pathMatchesSource(p, source))
    .map(p => ({
      ...p,
      dataSourceId: source.id,
      dataSourceProvider: source.provider,
      ingestedVia: Array.isArray(source.apis) ? source.apis.slice(0, 3) : [],
    }));

  const pathIdentityIds = new Set(accessPaths.map(p => p.identityId));
  const shadowAdmins = catalogShadowAdmins.filter(sa =>
    sa.cloudProvider === source.provider || pathIdentityIds.has(sa.identityId),
  );

  return {
    sourceId: source.id,
    provider: source.provider,
    category: source.category,
    apisCalled: source.apis || [],
    identities,
    accessPaths,
    shadowAdmins,
    lastSync: source.lastSync,
    ok: true,
  };
}

function mergeById(items, key = 'id') {
  const map = new Map();
  items.forEach(item => {
    const id = item[key];
    if (!id) return;
    if (!map.has(id)) {
      map.set(id, item);
      return;
    }
    const prev = map.get(id);
    map.set(id, {
      ...prev,
      ...item,
      sources: { ...(prev.sources || {}), ...(item.sources || {}) },
      apps: [...new Set([...(prev.apps || []), ...(item.apps || [])])],
      ingestedVia: [...new Set([...(prev.ingestedVia || []), ...(item.ingestedVia || [])])],
    });
  });
  return [...map.values()];
}

function computeSummary({ identities, accessPaths, shadowAdmins, riskTrend, dataSources }) {
  const humanCount = identities.filter(i => i.type === 'human').length;
  const nhiCount = identities.filter(i => i.type === 'service').length;
  const ownerGapIdentities = identities.filter(i => !i.owner || i.status === 'orphaned' || i.status === 'departed');
  const shadowAdminIds = new Set([
    ...accessPaths.filter(p => p.shadowAdmin).map(p => p.identityId),
    ...shadowAdmins.map(s => s.identityId),
  ]);
  const attentionIds = new Set([
    ...ownerGapIdentities.map(i => i.id),
    ...shadowAdminIds,
  ]);

  const attentionPaths = accessPaths.filter(p => {
    const identity = identities.find(i => i.id === p.identityId);
    return p.shadowAdmin || !identity?.owner || identity?.status === 'orphaned' || identity?.status === 'departed';
  });

  const shadowOnlyPaths = accessPaths.filter(p => p.accessType === 'Shadow');
  const hopPaths = accessPaths.filter(p => p.accessType === 'Shadow' || (p.hopCount || 0) > 0);
  const shadowAdminCount = shadowAdminIds.size;

  // High-privilege identities: elevated risk or critical/high sensitivity access
  const highPrivilegeIds = new Set([
    ...identities.filter(i => (i.riskScore || 0) >= 60).map(i => i.id),
    ...accessPaths
      .filter(p => p.resourceSensitivity === 'critical' || p.resourceSensitivity === 'high'
        || (p.effectivePermissions || []).some(perm => perm === '*' || /admin|owner|\*/i.test(perm)))
      .map(p => p.identityId),
  ]);
  const highPrivilegeCount = highPrivilegeIds.size;

  const avgRisk = identities.length
    ? identities.reduce((sum, i) => sum + (i.riskScore || 0), 0) / identities.length
    : 0;

  const priorAvgRisk = Number.isFinite(riskTrend?.priorAvgRisk)
    ? riskTrend.priorAvgRisk
    : avgRisk;
  // Negative = risk reduced vs last week; positive = increased
  const riskDeltaPctWeek = Number((avgRisk - priorAvgRisk).toFixed(1));

  const identityById = Object.fromEntries(identities.map(i => [i.id, i]));
  const identitiesWithPaths = new Set(accessPaths.map(p => p.identityId));

  return {
    totalIdentities: identities.length,
    humanCount,
    nhiCount,
    needAttention: attentionIds.size,
    attentionPathCount: attentionPaths.length,
    attentionFooter: `High privileges (${highPrivilegeCount}) and Shadow admin (${shadowAdminCount})`,
    avgRisk: avgRisk.toFixed(1),
    priorAvgRisk: priorAvgRisk.toFixed(1),
    riskDeltaPctWeek,
    hopPathCount: hopPaths.length,
    shadowPaths: shadowOnlyPaths.length,
    shadowAdminCount,
    highPrivilegeCount,
    directPaths: accessPaths.filter(p => p.accessType === 'Direct').length,
    indirectPaths: accessPaths.filter(p => p.accessType === 'Indirect').length,
    kindCounts: {
      All: identitiesWithPaths.size,
      human: [...identitiesWithPaths].filter(id => identityById[id]?.type === 'human').length,
      service: [...identitiesWithPaths].filter(id => identityById[id]?.type === 'service').length,
    },
    systemCounts: Object.fromEntries(
      dataSources.map(src => [
        src.provider,
        new Set(accessPaths.filter(p => pathMatchesSource(p, src)).map(p => p.identityId)).size,
      ]),
    ),
    connectedSources: dataSources.filter(s => s.status === 'connected').length,
    lastSync: dataSources
      .map(s => s.lastSync)
      .filter(Boolean)
      .sort()
      .at(-1) || null,
  };
}

/**
 * Fan out to each connected data source API surface, then correlate into Access Discovery view models.
 */
export async function fetchAccessDiscoveryFromSources({
  sources = catalogSources,
} = {}) {
  await delay(120);

  const inventories = await Promise.all(sources.map(fetchSourceInventory));
  const connectedInventories = inventories.filter(inv => inv.ok);

  const accessPaths = mergeById(
    connectedInventories.flatMap(inv => inv.accessPaths),
    'id',
  );

  // Include identities discovered via IdP/HR even if they have no cloud path yet,
  // plus every principal referenced by ingested access paths.
  const pathIdentityIds = new Set(accessPaths.map(p => p.identityId));
  const identities = mergeById([
    ...connectedInventories.flatMap(inv => inv.identities),
    ...catalogIdentities.filter(i => pathIdentityIds.has(i.id)),
  ]);

  const shadowAdmins = mergeById(
    connectedInventories.flatMap(inv => inv.shadowAdmins),
    'identityId',
  );

  const dataSources = sources.map(src => {
    const inv = inventories.find(i => i.sourceId === src.id);
    return {
      ...src,
      apisCalled: inv?.apisCalled || src.apis || [],
      ingestedPaths: inv?.accessPaths?.length || 0,
      ingestedIdentities: inv?.identities?.length || 0,
    };
  });

  const riskTrend = { ...catalogRiskTrend };
  const summary = computeSummary({
    identities,
    accessPaths,
    shadowAdmins,
    riskTrend,
    dataSources: dataSources.filter(s => s.status === 'connected'),
  });

  return {
    dataSources,
    identities,
    accessPaths,
    shadowAdmins,
    riskTrend,
    summary,
    sourceInventories: inventories,
    fetchedAt: new Date().toISOString(),
  };
}

export { pathMatchesSource };
