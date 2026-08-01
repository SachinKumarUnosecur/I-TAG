/**
 * Export runtime snapshots from the dashboard-demo data layer for pytest.
 * Run: node tests/bridge/export_snapshot.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  identities,
  accessPaths,
  delegationChains,
  dataSources,
  riskProfiles,
} from '../../src/data/mockData.js';
import {
  apps,
  creationEdges,
  buildDelegationChains,
} from '../../src/data/appLineage.js';
import {
  CLOUD_PROVIDERS,
  fetchCloudExposureInventory,
  fetchIdentityResourceMap,
  computeCloudExposure,
  fetchCloudPaths,
} from '../../src/data/exposureApi.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = join(__dirname, '../fixtures/snapshot.json');

function walk(node, appId, out) {
  if (!node) return;
  if (node.isForestRoot || node.isNoOriginator) {
    for (const c of node.children || []) walk(c, appId, out);
    return;
  }
  out.push({
    appId,
    id: node.id,
    name: node.name,
    type: node.type,
    status: node.status || 'active',
    preIntegration: Boolean(node.preIntegration),
    compromisedNhiNoPath: Boolean(node.compromisedNhiNoPath),
    compromisedPivot: Boolean(node.compromisedPivot),
    postCompromise: Boolean(node.postCompromise),
    postDeparture: Boolean(node.postDeparture),
    compromised: Boolean(node.compromised),
    departed: Boolean(node.departed),
    chainTone: node.chainTone || 'default',
    firstKnownRoot: Boolean(node.firstKnownRoot),
    originator: node.originator || null,
    orphaned: node.status === 'orphaned',
  });
  for (const c of node.children || []) walk(c, appId, out);
}

const lineageNodes = [];
for (const [appId, chain] of Object.entries(delegationChains)) {
  walk(chain.root, appId, lineageNodes);
}

const uniquePathIdentities = [...new Set(accessPaths.map(p => p.identityId))];

const exposureAll = fetchCloudExposureInventory('all');
const exposureByCloud = Object.fromEntries(
  CLOUD_PROVIDERS.map(c => [c, fetchCloudExposureInventory(c)]),
);

const sampleMaps = {};
for (const id of ['id-001', 'id-005', 'id-101', 'id-111', 'id-115']) {
  sampleMaps[id] = fetchIdentityResourceMap(id, 'all');
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  counts: {
    identities: identities.length,
    accessPaths: accessPaths.length,
    uniquePathIdentities: uniquePathIdentities.length,
    creationEdges: creationEdges.length,
    apps: apps.length,
    connectedSources: dataSources.filter(s => s.status === 'connected').length,
    cloudPaths: fetchCloudPaths('all').length,
    exposureInventory: exposureAll.length,
  },
  cloudProviders: CLOUD_PROVIDERS,
  identities: identities.map(i => ({
    id: i.id,
    name: i.name,
    type: i.type,
    status: i.status,
    owner: i.owner || null,
    createdBy: i.createdBy ?? null,
    createdAt: i.createdAt || null,
    compromisedAt: i.compromisedAt || null,
    departedAt: i.departedAt || null,
    originator: i.originator || null,
    riskScore: i.riskScore ?? null,
    sources: i.sources ? Object.keys(i.sources) : [],
  })),
  accessPaths: accessPaths.map(p => ({
    id: p.id,
    identityId: p.identityId,
    identityName: p.identityName,
    cloudProvider: p.cloudProvider || null,
    accessType: p.accessType,
    resource: p.resource,
    resourceSensitivity: p.resourceSensitivity,
    hopCount: p.hopCount || 0,
    shadowAdmin: Boolean(p.shadowAdmin),
    blocked: Boolean(p.blocked),
    apiSource: p.api?.source || null,
  })),
  lineageNodes,
  exposureInventory: exposureAll.map(i => ({
    id: i.id,
    name: i.name,
    type: i.type,
    exposureScore: i.exposureScore,
    pathCount: i.pathCount,
    clouds: i.clouds,
    reachesCritical: i.reachesCritical,
  })),
  exposureByCloud: Object.fromEntries(
    Object.entries(exposureByCloud).map(([k, rows]) => [
      k,
      rows.map(r => ({ id: r.id, exposureScore: r.exposureScore, pathCount: r.pathCount })),
    ]),
  ),
  sampleMaps: Object.fromEntries(
    Object.entries(sampleMaps).map(([id, m]) => [
      id,
      m
        ? {
          id: m.identity.id,
          exposureScore: m.exposureScore,
          pathCount: m.paths.length,
          resourceNodeCount: m.resourceNodes.length,
          attachmentCount: (m.attachments || []).length,
          attachedNhiCount: m.attachedNhis.length,
          clouds: m.clouds,
          // IdP/HR must never appear as cloud resources
          cloudsAreCloudOnly: m.clouds.every(c => CLOUD_PROVIDERS.includes(c)),
        }
        : null,
    ]),
  ),
  knownCases: {
    'id-111': computeCloudExposure('id-111', 'all'),
    'id-105': computeCloudExposure('id-105', 'all'),
    'id-115': computeCloudExposure('id-115', 'all'),
  },
  riskProfiles: riskProfiles.map(r => ({
    identityId: r.identityId,
    score: r.score,
    band: r.band,
  })),
  // Rebuild chains once to ensure export uses same builder
  rebuiltNodeCount: Object.values(buildDelegationChains(identities)).length,
};

writeFileSync(outPath, JSON.stringify(snapshot, null, 2));
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify(snapshot.counts, null, 2));
