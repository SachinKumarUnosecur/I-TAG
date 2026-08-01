/**
 * Access Discovery API layer (offline / VITE_USE_MOCK=1).
 * Aggregates connector-style payloads from mock dataSources, then the view-model
 * adapter (`accessViewModel.js`) maps them into the same shape as live
 * `/api/access` + `/api/risk-profile` + `/api/lineage`.
 */

import {
  dataSources as catalogSources,
  identities as catalogIdentities,
  accessPaths as catalogAccessPaths,
  shadowAdmins as catalogShadowAdmins,
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

/**
 * Honest summary strip aligned with live Access Discovery KPIs.
 * No fused risk %, no week-over-week trend, no vanity "high privileges" copy.
 */
function computeSummary({ identities, accessPaths, dataSources }) {
  const identityById = Object.fromEntries(identities.map(i => [i.id, i]));
  const identitiesWithPaths = new Set(accessPaths.map(p => p.identityId));

  const estateHuman = identities.filter(i => i.type === 'human').length;
  const estateNhi = identities.filter(i => i.type === 'service').length;

  const hopPaths = accessPaths.filter(p => p.accessType === 'Shadow' || (p.hopCount || 0) > 0);
  const hopIdentityIds = new Set(hopPaths.map(p => p.identityId));

  const ownershipFindingIds = new Set(
    identities
      .filter(i => {
        if (i.suppressionEffect === 'suppressed' || i.suppressionEffect === 'excluded') return false;
        if (i.ownershipState === 'unknown' || i.suppressionEffect === 'unknown') return false;
        if (i.ownershipState === 'unowned' || i.ownershipState === 'owner_invalid' || i.ownershipState === 'ambiguous') {
          return true;
        }
        return !i.owner || i.status === 'orphaned' || i.status === 'departed';
      })
      .map(i => i.id),
  );

  const attentionIds = new Set([
    ...[...hopIdentityIds].filter(id => ownershipFindingIds.has(id)),
    ...hopIdentityIds,
    ...[...ownershipFindingIds].filter(id => identitiesWithPaths.has(id)),
  ]);

  const levelCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const id of identitiesWithPaths) {
    const score = identityById[id]?.riskScore;
    if (!Number.isFinite(score) || identityById[id]?.riskAssessment === 'unevaluated') continue;
    if (score >= 80) levelCounts.critical += 1;
    else if (score >= 60) levelCounts.high += 1;
    else if (score >= 40) levelCounts.medium += 1;
    else levelCounts.low += 1;
  }

  return {
    totalIdentities: identities.length,
    humanCount: estateHuman,
    nhiCount: estateNhi,
    needAttention: attentionIds.size,
    attentionFooter: `Shadow hops (${hopIdentityIds.size}) · Ownership findings (${[...ownershipFindingIds].filter(id => identitiesWithPaths.has(id)).length})`,
    riskFindings: levelCounts.critical + levelCounts.high + levelCounts.medium + levelCounts.low,
    riskFooter: `Critical (${levelCounts.critical}) · High (${levelCounts.high}) · Medium (${levelCounts.medium})`,
    hopPathCount: hopPaths.length,
    shadowPaths: hopPaths.length,
    directPaths: accessPaths.filter(p => p.accessType === 'Direct').length,
    indirectPaths: accessPaths.filter(p => p.accessType === 'Indirect').length,
    identitiesWithHop: hopIdentityIds.size,
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
    graphSnapshotAt: '2026-07-31T00:00:00.000Z',
    lastSync: '2026-07-31',
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

  // Full roster for estate Total card (matches live identities_scanned semantics)
  const estateIdentities = mergeById(catalogIdentities);

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

  const summary = computeSummary({
    identities: estateIdentities,
    accessPaths,
    dataSources: dataSources.filter(s => s.status === 'connected'),
  });

  return {
    dataSources,
    identities: estateIdentities,
    accessPaths,
    shadowAdmins,
    summary,
    sourceInventories: inventories,
    fetchedAt: new Date().toISOString(),
  };
}

export { pathMatchesSource };
