/**
 * Cloud exposure / resource-map helpers.
 *
 * Resource map semantics (not permissions / delegation):
 *  - Human (HI): what they can access (cloud resources)
 *  - NHI: where it is attached (compute / binding) + what it can access
 *
 * Scope: cloud provider and/or cloud account (AWS account / GCP project / Azure subscription).
 */

import { accessPaths, dataSources, identities, tenant } from './mockData.js';
import {
  formatCloudLabel,
  formatCloudRef,
  normalizeAccessPath,
  resourceCategory,
} from './cloudNative.js';
import { fetchIdentityRiskProfile, listRiskCloudProviders } from './riskProfileApi.js';

const connectedClouds = listRiskCloudProviders();
export const CLOUD_PROVIDERS = connectedClouds.length
  ? connectedClouds
  : (tenant.cloudProviders || []);

const SENSITIVITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15 };

const identityById = Object.fromEntries(identities.map(i => [i.id, i]));

/** Normalize (cloud, accountKey) or scope object → { cloud, accountKey }. */
export function parseExposureScope(cloudOrScope = 'all', accountKey = 'all') {
  if (cloudOrScope && typeof cloudOrScope === 'object') {
    return {
      cloud: cloudOrScope.cloud || 'all',
      accountKey: cloudOrScope.accountKey || 'all',
    };
  }
  let cloud = cloudOrScope || 'all';
  let account = accountKey || 'all';
  if (account !== 'all') {
    const acc = listCloudAccounts().find(a => a.id === account);
    if (acc) cloud = acc.provider;
  }
  return { cloud, accountKey: account };
}

/** Connected cloud accounts derived from connectors — not hardcoded UI lists. */
export function listCloudAccounts() {
  return dataSources
    .filter(d => d.category === 'cloud' && d.status === 'connected')
    .map(ds => {
      if (ds.provider === 'AWS') {
        return {
          id: `aws:${ds.accountId}`,
          provider: 'AWS',
          label: `AWS · ${ds.accountId}`,
          shortLabel: ds.accountId,
          accountId: ds.accountId,
          projectId: null,
          subscriptionId: null,
          region: ds.region || null,
          connectorId: ds.id,
        };
      }
      if (ds.provider === 'GCP') {
        return {
          id: `gcp:${ds.projectId}`,
          provider: 'GCP',
          label: `GCP · ${ds.projectId}`,
          shortLabel: ds.projectId,
          accountId: null,
          projectId: ds.projectId,
          subscriptionId: null,
          organizationId: ds.organizationId || null,
          connectorId: ds.id,
        };
      }
      return {
        id: `azure:${ds.subscriptionId}`,
        provider: 'Azure',
        label: `Azure · ${String(ds.subscriptionId).slice(0, 8)}…`,
        shortLabel: ds.subscriptionId,
        accountId: null,
        projectId: null,
        subscriptionId: ds.subscriptionId,
        tenantId: ds.tenantId || null,
        connectorId: ds.id,
      };
    });
}

function pathHaystack(path) {
  const api = path.api || {};
  const hops = path.hopChain || [];
  return [
    path.resource,
    path.cloudProvider,
    api.resourceArn,
    api.resourceName,
    api.scope,
    api.principalArn,
    api.principal,
    api.roleArn,
    api.terminalRoleArn,
    api.terminalPrincipal,
    ...hops.flatMap(h => [h.to, h.from, h.resourceArn, h.resourceName]),
  ].filter(Boolean).join(' ');
}

/** True if path belongs to the selected cloud account / project / subscription. */
export function pathMatchesAccount(path, accountKey) {
  if (!accountKey || accountKey === 'all') return true;
  const acc = listCloudAccounts().find(a => a.id === accountKey);
  if (!acc) return false;
  if (path.cloudProvider !== acc.provider) return false;

  const hay = pathHaystack(path);

  if (acc.provider === 'AWS') {
    const hasAnyAccount = /arn:aws:[^:]*:[^:]*:\d{12}:/.test(hay);
    if (!hasAnyAccount) return true; // connector-default account
    return hay.includes(String(acc.accountId));
  }
  if (acc.provider === 'GCP') {
    const hasProject = /projects\/[a-z0-9-]+/i.test(hay) || hay.includes('@');
    if (!hasProject) return true;
    return hay.includes(String(acc.projectId));
  }
  if (acc.provider === 'Azure') {
    const hasSub = /\/subscriptions\//i.test(hay);
    if (!hasSub) return true;
    return hay.includes(String(acc.subscriptionId));
  }
  return true;
}

function cloudOfArnOrRef(ref, fallback = null) {
  const s = String(ref || '');
  if (/^arn:aws:|^s3:\/\/|^ec2:\/\/|^iam:\/\/|^rds:\/\/|^dynamodb:\/\/|^lambda:\/\/|^ssm:\/\//i.test(s)) {
    return 'AWS';
  }
  if (/^gce:\/\/|^gke:\/\/|^gcf:\/\/|^bigquery:\/\/|^storage:\/\/|gserviceaccount\.com|\.googleapis\.com/i.test(s)) {
    return 'GCP';
  }
  if (/^azure:\/\/|microsoft\.|\/subscriptions\//i.test(s)) {
    return 'Azure';
  }
  return fallback;
}

function normalizeTarget(ref) {
  return String(ref || '').trim();
}

function sameResource(a, b) {
  const left = normalizeTarget(a).toLowerCase();
  const right = normalizeTarget(b).toLowerCase();
  if (!left || !right) return false;
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function filterPaths(paths, scope) {
  const { cloud, accountKey } = parseExposureScope(scope);
  return paths.filter(p => {
    if (p.blocked) return false;
    if (!p.cloudProvider || !CLOUD_PROVIDERS.includes(p.cloudProvider)) return false;
    if (cloud !== 'all' && p.cloudProvider !== cloud) return false;
    if (!pathMatchesAccount(p, accountKey)) return false;
    return true;
  });
}

/** Live cloud access paths for an identity (scoped by cloud / account). */
export function fetchCloudPathsForIdentity(identityId, cloudOrScope = 'all', accountKey = 'all') {
  const scope = parseExposureScope(cloudOrScope, accountKey);
  return filterPaths(
    accessPaths.filter(p => p.identityId === identityId),
    scope,
  )
    .slice()
    .sort((a, b) => {
      const rank = t => (t === 'Shadow' ? 3 : t === 'Indirect' ? 2 : 1);
      const sens = s => SENSITIVITY_WEIGHT[s] || 0;
      return rank(b.accessType) - rank(a.accessType)
        || sens(b.resourceSensitivity) - sens(a.resourceSensitivity);
    });
}

/** All live cloud paths, optionally by provider / account. */
export function fetchCloudPaths(cloudOrScope = 'all', accountKey = 'all') {
  return filterPaths(accessPaths, parseExposureScope(cloudOrScope, accountKey));
}

export function computeCloudExposure(identityId, cloudOrScope = 'all', accountKey = 'all') {
  const paths = fetchCloudPathsForIdentity(identityId, cloudOrScope, accountKey)
    .map(normalizeAccessPath);
  const resources = paths.map(p => ({
    pathId: p.id,
    resource: p.resource,
    resourceShort: p.resourceShort,
    category: resourceCategory(p.resourceLegacy || p.resource, p.cloudProvider, p.api || {}),
    sensitivity: p.resourceSensitivity,
    accessType: p.accessType,
    cloudProvider: p.cloudProvider,
    hopCount: Number(p.hopCount) || 0,
    weight: SENSITIVITY_WEIGHT[p.resourceSensitivity] || 10,
    lastConfirmed: p.lastConfirmed,
    api: p.api || null,
    apiEvidence: p.apiEvidence || [],
    hopChain: p.hopChain || [],
    mechanism: p.mechanism,
    shadowAdmin: Boolean(p.shadowAdmin),
  }));
  const score = scoreExposure(resources);
  return { score, paths, resources };
}

/** 0–100 exposure score from reachable resources (not an unbounded weight sum). */
function scoreExposure(resources) {
  if (!resources.length) return 0;
  const peak = Math.max(...resources.map(r => r.weight || 0));
  const peakPart = Math.round((peak / 100) * 48);
  const volume = Math.min(25, resources.length * 5);
  const hop = Math.min(15, Math.max(...resources.map(r => r.hopCount || 0)) * 5);
  const shadow = resources.some(r => r.shadowAdmin) ? 12 : 0;
  const criticalBoost = resources.some(r => r.sensitivity === 'critical') ? 8 : 0;
  return Math.min(100, peakPart + volume + hop + shadow + criticalBoost);
}

/** NHIs owned / created by a human. */
export function fetchAttachedNhis(humanId) {
  return identities.filter(i => (
    i.type === 'service'
    && (i.owner === humanId || i.createdBy === humanId)
  ));
}

/** Human owner for an NHI. */
export function fetchNhiOwner(nhiId) {
  const nhi = identityById[nhiId];
  if (!nhi || nhi.type !== 'service') return null;
  const ownerId = nhi.owner || null;
  return ownerId ? identityById[ownerId] || null : null;
}

/**
 * Where an NHI is attached — compute / binding targets from hop evidence
 * and declared instance profiles. Not IAM permission lists.
 */
export function fetchNhiAttachments(identityId, cloudOrScope = 'all', accountKey = 'all') {
  const identity = identityById[identityId];
  if (!identity || identity.type !== 'service') return [];
  const scope = parseExposureScope(cloudOrScope, accountKey);

  const byKey = new Map();

  function addAttachment({ name, cloudProvider, mechanism, pathId, kind, hints }) {
    const provider = cloudProvider || cloudOfArnOrRef(name) || 'AWS';
    if (scope.cloud !== 'all' && provider !== scope.cloud) return;
    if (scope.accountKey !== 'all') {
      const fakePath = {
        cloudProvider: provider,
        resource: name,
        api: hints || {},
        hopChain: [],
      };
      if (!pathMatchesAccount(fakePath, scope.accountKey)) return;
    }
    const native = formatCloudRef(name, provider, hints || {}) || normalizeTarget(name);
    if (!native) return;
    const key = `${provider}|${native}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, {
        id: key,
        name: native,
        nameShort: formatCloudLabel(name, provider, hints || {}),
        cloudProvider: provider,
        mechanism: mechanism || 'Attachment',
        kind: kind || 'compute',
        pathIds: pathId ? [pathId] : [],
        weight: 0,
      });
      return;
    }
    if (pathId && !prev.pathIds.includes(pathId)) prev.pathIds.push(pathId);
    if (mechanism && prev.mechanism === 'Attachment') prev.mechanism = mechanism;
  }

  const awsProfile = identity.sources?.aws?.instanceProfileArn;
  if (awsProfile && (scope.cloud === 'all' || scope.cloud === 'AWS')) {
    addAttachment({
      name: awsProfile,
      cloudProvider: 'AWS',
      mechanism: 'iam:GetInstanceProfile',
      kind: 'compute',
    });
  }

  const paths = fetchCloudPathsForIdentity(identityId, scope).map(normalizeAccessPath);
  for (const p of paths) {
    const hops = p.hopChain || [];
    if (!hops.length) continue;
    const first = hops[0];
    const target = first?.to;
    if (!target || sameResource(target, p.resource) || sameResource(first.displayTo, p.resource)) continue;

    addAttachment({
      name: first.to,
      cloudProvider: p.cloudProvider || cloudOfArnOrRef(target),
      mechanism: first.api || first.mechanism || 'Attachment',
      pathId: p.id,
      kind: 'compute',
      hints: { resourceArn: first.resourceArn, resourceName: first.resourceName },
    });
  }

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Resource-map payload:
 *  - HI: accessible cloud resources only
 *  - NHI: attachment points + accessible cloud resources
 */
export function fetchIdentityResourceMap(identityId, cloudOrScope = 'all', accountKey = 'all') {
  const identity = identityById[identityId];
  if (!identity) return null;
  const scope = parseExposureScope(cloudOrScope, accountKey);

  const own = computeCloudExposure(identityId, scope);
  const risk = fetchIdentityRiskProfile(identityId);
  const owner = identity.type === 'service' ? fetchNhiOwner(identityId) : null;
  const attachments = identity.type === 'service'
    ? fetchNhiAttachments(identityId, scope)
    : [];

  const attachedNhis = identity.type === 'human'
    ? fetchAttachedNhis(identityId).map(nhi => {
      const exp = computeCloudExposure(nhi.id, scope);
      return {
        id: nhi.id,
        name: nhi.name,
        status: nhi.status,
        ownerName: nhi.ownerName,
        score: exp.score,
        pathCount: exp.paths.length,
        resources: exp.resources,
        clouds: [...new Set(exp.paths.map(p => p.cloudProvider))],
      };
    })
    : [];

  const accessNodes = own.resources.map(r => ({
    id: `${r.cloudProvider}|${r.resource}`,
    resource: r.resource,
    resourceShort: r.resourceShort || formatCloudLabel(r.resource, r.cloudProvider),
    category: r.category || resourceCategory(r.resource, r.cloudProvider, r.api || {}),
    cloudProvider: r.cloudProvider,
    sensitivity: r.sensitivity,
    accessType: r.accessType,
    accessTypes: [r.accessType],
    hopCount: r.hopCount || 0,
    weight: r.weight,
    pathIds: [r.pathId],
    kind: 'access',
    apiSource: r.api?.sourceLabel || r.api?.source || null,
    evaluatedVia: r.api?.evaluatedVia || null,
    mechanism: r.mechanism || null,
    apiEvidence: r.apiEvidence || [],
  }));

  const accessMap = new Map();
  for (const n of accessNodes) {
    const prev = accessMap.get(n.id);
    if (!prev) {
      accessMap.set(n.id, { ...n });
      continue;
    }
    if (!prev.accessTypes.includes(n.accessType)) prev.accessTypes.push(n.accessType);
    if (!prev.pathIds.includes(n.pathIds[0])) prev.pathIds.push(...n.pathIds);
    prev.weight = Math.max(prev.weight, n.weight);
    prev.hopCount = Math.min(prev.hopCount ?? 99, n.hopCount ?? 0);
    const order = { critical: 4, high: 3, medium: 2, low: 1 };
    if ((order[n.sensitivity] || 0) > (order[prev.sensitivity] || 0)) {
      prev.sensitivity = n.sensitivity;
    }
  }

  const resourceNodes = [...accessMap.values()].sort((a, b) => b.weight - a.weight);
  const maxHop = resourceNodes.reduce((m, n) => Math.max(m, n.hopCount || 0), 0);

  return {
    identity,
    scope,
    riskBand: risk?.band || null,
    riskScore: risk?.score ?? identity.riskScore,
    exposureScore: own.score,
    paths: own.paths,
    resources: own.resources,
    resourceNodes,
    attachments,
    attachedNhis,
    owner,
    maxHop,
    clouds: [...new Set([
      ...own.paths.map(p => p.cloudProvider),
      ...attachments.map(a => a.cloudProvider),
    ].filter(Boolean))],
    apiCalls: summarizeApiCalls(own.paths),
  };
}

/** Aggregate provider-native API evidence across paths. */
export function summarizeApiCalls(paths) {
  const rows = [];
  for (const p of paths) {
    const api = p.api || {};
    rows.push({
      pathId: p.id,
      cloud: p.cloudProvider,
      resource: p.resource,
      accessType: p.accessType,
      source: api.source || '—',
      evaluatedVia: api.evaluatedVia || null,
      principal: api.principalArn || api.principal || api.principalId || null,
      resourceRef: api.resourceArn || api.resourceName || api.scope || null,
      role: api.role || api.roleDefinitionName || api.roleArn || null,
      policy: api.policyArn || null,
      hopApis: (p.hopChain || []).map(h => h.api).filter(Boolean),
    });
  }
  return rows;
}

/** Ranked identity exposure inventory for the scoped map. */
export function fetchCloudExposureInventory(cloudOrScope = 'all', accountKey = 'all') {
  const scope = parseExposureScope(cloudOrScope, accountKey);
  return identities
    .map(id => {
      const { score, paths, resources } = computeCloudExposure(id.id, scope);
      const attachments = id.type === 'service'
        ? fetchNhiAttachments(id.id, scope)
        : [];
      const risk = fetchIdentityRiskProfile(id.id);
      const highest = resources.slice().sort((a, b) => b.weight - a.weight)[0] || null;
      return {
        ...id,
        exposureScore: score,
        pathCount: paths.length,
        attachmentCount: attachments.length,
        resources,
        paths,
        riskBand: risk?.band || null,
        clouds: [...new Set(paths.map(p => p.cloudProvider))],
        reachesCritical: resources.some(r => r.sensitivity === 'critical'),
        highestSensitivity: highest?.sensitivity || null,
        highestResource: highest?.resourceShort || highest?.resource || null,
        maxHop: resources.reduce((m, r) => Math.max(m, r.hopCount || 0), 0),
      };
    })
    .filter(i => i.pathCount > 0 || i.attachmentCount > 0)
    .sort((a, b) => b.exposureScore - a.exposureScore);
}

function toneForSensitivity(sensitivity) {
  if (sensitivity === 'critical' || sensitivity === 'high') return 'compromised';
  if (sensitivity === 'medium') return 'departed';
  return 'service';
}

function accessTreeNode(node) {
  const access = (node.accessTypes || []).join(' · ') || node.accessType || 'Direct';
  const category = node.category
    || resourceCategory(node.resource, node.cloudProvider, {});
  return {
    id: `access-${node.id}`,
    name: node.resourceShort || node.resource,
    nativeName: node.resource,
    type: 'service',
    isResource: true,
    mapRole: 'access',
    sensitivity: node.sensitivity,
    cloudProvider: node.cloudProvider,
    category,
    accessTypes: node.accessTypes || [],
    accessType: node.accessType || access,
    hopCount: node.hopCount || 0,
    pathIds: node.pathIds || [],
    weight: node.weight,
    chainTone: toneForSensitivity(node.sensitivity),
    status: 'active',
    originator: access,
    originatorId: null,
    delegator: access,
    createdAt: null,
    resourceKind: category,
    accessLabel: access,
    evaluatedVia: node.evaluatedVia || node.apiSource || null,
    children: [],
  };
}

function attachmentTreeNode(att) {
  const category = resourceCategory(att.name, att.cloudProvider, {}) || 'Attachment';
  return {
    id: `attach-${att.id}`,
    name: att.nameShort || att.name,
    nativeName: att.name,
    type: 'service',
    isResource: true,
    isAttachment: true,
    mapRole: 'attachment',
    cloudProvider: att.cloudProvider,
    category,
    mechanism: att.mechanism,
    hopCount: 0,
    pathIds: att.pathIds || [],
    weight: 0,
    chainTone: 'service',
    status: 'active',
    originator: att.mechanism || 'Attachment',
    originatorId: null,
    delegator: att.mechanism || 'Attachment',
    createdAt: null,
    resourceKind: category,
    accessLabel: att.mechanism || 'Attachment',
    children: [],
  };
}

function ownerAttachmentNode(owner) {
  if (!owner) return null;
  return {
    id: `attach-owner-${owner.id}`,
    name: owner.name,
    type: owner.type || 'human',
    isResource: false,
    isAttachment: true,
    mapRole: 'attachment',
    cloudProvider: null,
    category: 'Owner',
    mechanism: 'Owner',
    hopCount: 0,
    pathIds: [],
    weight: 0,
    chainTone: 'human',
    status: owner.status || 'active',
    originator: 'Owner',
    originatorId: null,
    delegator: 'Owner',
    createdAt: owner.createdAt || null,
    resourceKind: 'Attached to',
    accessLabel: 'Owner',
    children: [],
  };
}

/**
 * Radial resource-map model — hop-distance rings (PRD), data-driven from paths.
 *
 * buildResourceRadialModel(id, { cloud, accountKey, search, maxHopLimit })
 * buildResourceRadialModel(id, cloud, search) — back-compat
 */
export function buildResourceRadialModel(identityId, cloudOrOpts = 'all', searchArg = '') {
  let scope;
  let q = '';
  let hopCap = null;

  if (cloudOrOpts && typeof cloudOrOpts === 'object') {
    scope = parseExposureScope(cloudOrOpts);
    q = String(cloudOrOpts.search ?? searchArg ?? '').trim().toLowerCase();
    hopCap = cloudOrOpts.maxHopLimit ?? null;
  } else {
    scope = parseExposureScope(cloudOrOpts, 'all');
    q = String(searchArg || '').trim().toLowerCase();
  }

  const map = fetchIdentityResourceMap(identityId, scope);
  if (!map) return null;

  const match = (text) => !q || String(text || '').toLowerCase().includes(q);
  const isNhi = map.identity.type === 'service';

  const attachments = [
    ...(map.owner ? [ownerAttachmentNode(map.owner)].filter(Boolean) : []),
    ...(map.attachments || []).map(attachmentTreeNode),
  ].filter(n => (
    match(n.name)
    || match(n.nativeName)
    || match(n.mechanism)
    || match(n.cloudProvider)
  ));

  const accessLeaves = (map.resourceNodes || [])
    .map(accessTreeNode)
    .filter(node => (
      match(node.name)
      || match(node.nativeName)
      || match(node.category)
      || match(node.cloudProvider)
      || match(node.sensitivity)
      || match(node.accessLabel)
    ))
    .filter(node => hopCap == null || (node.hopCount || 0) <= hopCap);

  // Group by resource category (S3, IAM, BigQuery…) — not cloud vendor
  const byCategory = new Map();
  for (const node of accessLeaves) {
    const cat = node.category || 'Resource';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(node);
  }

  const rings = [];

  if (isNhi && attachments.length > 0) {
    // One "Attached" ring; leaf captions use resource category (EC2, Owner, …)
    rings.push({
      id: `ring-attached-${identityId}`,
      hopDistance: -1,
      label: 'Attached',
      kind: 'attachment',
      category: 'Attached',
      count: attachments.length,
      children: attachments,
    });
  }

  const catKeys = [...byCategory.keys()].sort((a, b) => {
    const wa = (byCategory.get(a) || []).reduce((s, n) => s + (n.weight || 0), 0);
    const wb = (byCategory.get(b) || []).reduce((s, n) => s + (n.weight || 0), 0);
    return wb - wa || a.localeCompare(b);
  });

  for (const cat of catKeys) {
    const children = byCategory.get(cat) || [];
    if (!children.length) continue;
    const maxHopInCat = children.reduce((m, n) => Math.max(m, n.hopCount || 0), 0);
    rings.push({
      id: `ring-cat-${cat}-${identityId}`,
      hopDistance: maxHopInCat,
      label: cat,
      kind: 'access',
      category: cat,
      count: children.length,
      children,
    });
  }

  const center = {
    id: map.identity.id,
    name: map.identity.name,
    type: map.identity.type,
    status: map.identity.status || 'active',
    resourceKind: isNhi ? 'NHI' : 'User',
    mapRole: 'identity',
    exposureScore: map.exposureScore,
    riskBand: map.riskBand,
    clouds: map.clouds,
    isNhi,
  };

  const itemCount = rings.reduce((sum, r) => sum + r.children.length, 0);
  const dataMaxHop = map.maxHop || 0;

  return {
    center,
    rings,
    branches: rings, // back-compat for older graph code
    map,
    itemCount,
    maxHop: dataMaxHop,
    scope: map.scope,
  };
}

/**
 * Flat tree (table view) — same payload as radial leaves.
 */
export function buildResourceTraceTree(identityId, cloudOrScope = 'all', accountKey = 'all') {
  const map = fetchIdentityResourceMap(identityId, cloudOrScope, accountKey);
  if (!map) return null;

  const accessChildren = (map.resourceNodes || []).map(accessTreeNode);
  const isNhi = map.identity.type === 'service';

  const children = isNhi
    ? [
      ...(map.owner ? [ownerAttachmentNode(map.owner)].filter(Boolean) : []),
      ...(map.attachments || []).map(attachmentTreeNode),
      ...accessChildren,
    ]
    : accessChildren;

  const identityNode = {
    id: map.identity.id,
    name: map.identity.name,
    type: map.identity.type,
    status: map.identity.status || 'active',
    chainTone: map.identity.status === 'departed'
      ? 'departed'
      : map.identity.compromisedAt
        ? 'compromised'
        : map.identity.type === 'service'
          ? 'service'
          : 'default',
    departed: map.identity.status === 'departed',
    compromised: Boolean(map.identity.compromisedAt),
    originator: isNhi
      ? (map.owner?.name || 'No owner')
      : (map.identity.originator || 'No originator'),
    originatorId: isNhi ? (map.owner?.id || null) : (map.identity.originatorId || null),
    delegator: map.owner?.name || map.identity.ownerName || map.identity.name,
    createdAt: map.identity.createdAt || null,
    exposureScore: map.exposureScore,
    riskBand: map.riskBand,
    resourceKind: isNhi ? 'NHI' : 'User',
    mapRole: 'identity',
    children,
  };

  return {
    id: `forest-exposure-${identityId}`,
    name: 'Resource reachability',
    type: 'human',
    isForestRoot: true,
    chainTone: 'default',
    originator: '—',
    delegator: '—',
    children: [identityNode],
    meta: {
      exposureScore: map.exposureScore,
      pathCount: map.paths.length,
      resourceCount: map.resourceNodes.length,
      attachmentCount: map.attachments?.length || 0,
      attachedNhiCount: map.attachedNhis.length,
      clouds: map.clouds,
      riskBand: map.riskBand,
      map,
    },
  };
}
