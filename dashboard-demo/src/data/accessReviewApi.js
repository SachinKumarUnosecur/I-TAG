/**
 * Access Reviews API
 * Inventory + assignments are built live from identities, access paths, and connectors.
 */

import {
  accessPaths,
  dataSources,
  identities,
  shadowAdmins,
} from './mockData.js';

const ACCESS_TYPE_RANK = { Shadow: 3, Indirect: 2, Direct: 1 };

const SOURCE_TO_CONNECTOR = {
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  okta: 'Okta',
  googleWorkspace: 'Google Workspace',
  hr: 'Workday',
};

const CONNECTOR_ORDER = dataSources.map(d => d.provider);

const CAMPAIGN_DEFS = [
  {
    id: 'camp-001',
    name: 'Identities Access Review',
    scope: 'identities',
    reviewer: 'tom.walker',
    reviewers: ['tom.walker', 'priya.sharma', 'sara.jones'],
    dueDate: '2026-08-15',
    status: 'in_progress',
  },
  {
    id: 'camp-002',
    name: 'Data Pipeline Quarterly Attestation',
    scope: 'data-pipeline',
    reviewer: 'priya.sharma',
    reviewers: ['priya.sharma', 'elise.moran'],
    dueDate: '2026-08-30',
    status: 'in_progress',
  },
];

/** Seed decisions for the demo; callers may override via decisions map. */
const SEED_DECISIONS = {
  'id-001': 'escalated',
  'id-002': 'approved',
  'id-003': 'pending',
  'id-004': 'approved',
  'id-005': 'pending',
  'id-006': 'pending',
  'id-007': 'pending',
  'id-011': 'revoked',
  'id-018': 'escalated',
  'id-101': 'pending',
  'id-102': 'approved',
  'id-104': 'revoked',
  'id-105': 'pending',
  'id-107': 'revoked',
  'id-108': 'approved',
  'id-114': 'revoked',
  'id-116': 'revoked',
  'id-120': 'approved',
};

const DECISION_CYCLE = ['pending', 'approved', 'pending', 'revoked', 'approved', 'escalated'];

const identityById = Object.fromEntries(identities.map(i => [i.id, i]));
const shadowAdminIds = new Set(shadowAdmins.map(s => s.identityId));

function riskBandFromScore(score) {
  if ((score || 0) >= 80) return 'Catastrophic';
  if ((score || 0) >= 60) return 'Unacceptable';
  if ((score || 0) >= 40) return 'Undesirable';
  if ((score || 0) >= 20) return 'Acceptable';
  return 'Desirable';
}

function ownerLoginName(identity) {
  if (!identity?.owner) return null;
  return identityById[identity.owner]?.name ?? null;
}

function seedDecision(identityId, index) {
  return SEED_DECISIONS[identityId] || DECISION_CYCLE[index % DECISION_CYCLE.length];
}

function campaignIdFor(identity) {
  return (identity.apps || []).includes('data-pipeline') ? 'camp-002' : 'camp-001';
}

export function connectorForPath(path) {
  if (path?.cloudProvider) return path.cloudProvider;
  const apiSource = String(path?.api?.source || '').toLowerCase();
  if (apiSource.includes('okta')) return 'Okta';
  if (apiSource.includes('google') || apiSource.includes('workspace') || apiSource.includes('directory')) {
    return 'Google Workspace';
  }
  if (apiSource.includes('workday')) return 'Workday';
  if (apiSource.includes('aws')) return 'AWS';
  if (apiSource.includes('gcp') || apiSource.includes('cloudresourcemanager')) return 'GCP';
  if (apiSource.includes('azure') || apiSource.includes('microsoft')) return 'Azure';
  return null;
}

function sortConnectors(list) {
  const set = new Set(list.filter(Boolean));
  return CONNECTOR_ORDER.filter(c => set.has(c)).concat(
    [...set].filter(c => !CONNECTOR_ORDER.includes(c)),
  );
}

/** Connectors with live grants for this identity (from access paths). */
export function connectorsWithGrants(identityId) {
  const connectors = accessPaths
    .filter(p => p.identityId === identityId && !p.blocked)
    .map(connectorForPath)
    .filter(Boolean);
  return sortConnectors(connectors);
}

/** Connected source bindings on the identity record. */
export function connectorsFromSources(identityId) {
  const identity = identityById[identityId];
  if (!identity) return [];
  const connectors = Object.keys(identity.sources || {})
    .map(key => SOURCE_TO_CONNECTOR[key])
    .filter(Boolean);
  return sortConnectors(connectors);
}

export function listReviewConnectors() {
  return dataSources
    .filter(d => d.status === 'connected')
    .map(d => ({
      id: d.id,
      provider: d.provider,
      category: d.category,
      lastSync: d.lastSync,
    }));
}

/**
 * Live grants for an identity, optionally filtered by connector.
 * opts: { connector }
 */
export function fetchIdentityAssignments(identityId, opts = {}) {
  const { connector = 'all' } = opts;
  const identity = identityById[identityId];
  if (!identity) {
    return { identityId, assignments: [], connectors: [], grantCount: 0, permissionCount: 0 };
  }

  let assignments = accessPaths
    .filter(p => p.identityId === identityId && !p.blocked)
    .slice()
    .sort((a, b) =>
      (ACCESS_TYPE_RANK[b.accessType] || 0) - (ACCESS_TYPE_RANK[a.accessType] || 0)
      || (b.hopCount || 0) - (a.hopCount || 0)
      || String(a.resource).localeCompare(String(b.resource)))
    .map(path => ({
      id: path.id,
      identityId: path.identityId,
      identityName: identity.name,
      resource: path.resource,
      accessType: path.accessType,
      hopCount: path.hopCount || 0,
      mechanism: path.mechanism || null,
      cloudProvider: path.cloudProvider || null,
      connector: connectorForPath(path),
      permissions: [...(path.effectivePermissions || [])],
      resourceSensitivity: path.resourceSensitivity || null,
      lastConfirmed: path.lastConfirmed || null,
      shadowAdmin: Boolean(path.shadowAdmin),
      api: path.api || null,
    }));

  const connectors = sortConnectors(assignments.map(a => a.connector));

  if (connector !== 'all') {
    assignments = assignments.filter(a => a.connector === connector);
  }

  const permissionCount = assignments.reduce((n, a) => n + a.permissions.length, 0);

  return {
    identityId,
    identityName: identity.name,
    type: identity.type,
    status: identity.status,
    owner: ownerLoginName(identity),
    riskScore: identity.riskScore || 0,
    riskBand: riskBandFromScore(identity.riskScore),
    connectors,
    sourceConnectors: connectorsFromSources(identityId),
    assignments,
    grantCount: assignments.length,
    permissionCount,
  };
}

function buildReviewRow(identity, index, decisions = {}) {
  const detail = fetchIdentityAssignments(identity.id);
  const primary = detail.assignments[0] || null;
  const decision = decisions[identity.id] || seedDecision(identity.id, index);

  return {
    id: `ri-${identity.id}`,
    campaignId: campaignIdFor(identity),
    identityId: identity.id,
    identityName: identity.name,
    type: identity.type,
    status: identity.status || 'active',
    resource: primary?.resource || null,
    accessType: primary?.accessType || null,
    riskScore: identity.riskScore || 0,
    riskBand: riskBandFromScore(identity.riskScore),
    owner: ownerLoginName(identity),
    decision,
    shadowAdmin: shadowAdminIds.has(identity.id),
    connectors: detail.connectors,
    grantCount: detail.grantCount,
    permissionCount: detail.permissionCount,
    app: (identity.apps && identity.apps[0]) || null,
  };
}

function tally(items) {
  const approvedItems = items.filter(i => i.decision === 'approved').length;
  const revokedItems = items.filter(i => i.decision === 'revoked').length;
  const pendingItems = items.filter(i => i.decision === 'pending').length;
  const escalatedItems = items.filter(i => i.decision === 'escalated').length;
  const decided = approvedItems + revokedItems + escalatedItems;
  const totalItems = items.length;
  return {
    totalItems,
    approvedItems,
    revokedItems,
    pendingItems,
    escalatedItems,
    completionPct: totalItems ? Math.round((decided / totalItems) * 100) : 0,
  };
}

/**
 * Campaign list with live tallies from current decisions.
 * opts: { decisions }
 */
export function fetchReviewCampaigns(opts = {}) {
  const { decisions = {} } = opts;
  const inventory = identities.map((identity, index) => buildReviewRow(identity, index, decisions));

  return CAMPAIGN_DEFS.map(def => {
    const items = inventory.filter(i => i.campaignId === def.id);
    return { ...def, ...tally(items) };
  });
}

/**
 * Review inventory built from the identity roster + live access paths.
 * opts: { campaignId, search, decision, connector, decisions }
 */
export function fetchReviewInventory(opts = {}) {
  const {
    campaignId = 'all',
    search = '',
    decision = 'all',
    connector = 'all',
    decisions = {},
  } = opts;

  const q = String(search || '').trim().toLowerCase();
  let items = identities.map((identity, index) => buildReviewRow(identity, index, decisions));

  if (campaignId !== 'all') items = items.filter(i => i.campaignId === campaignId);
  if (decision !== 'all' && decision !== 'All') {
    items = items.filter(i => i.decision === decision);
  }
  if (connector !== 'all') {
    items = items.filter(i => i.connectors.includes(connector));
  }
  if (q) {
    items = items.filter(i => (
      i.identityName.toLowerCase().includes(q)
      || (i.owner || '').toLowerCase().includes(q)
      || i.connectors.some(c => c.toLowerCase().includes(q))
      || (i.resource || '').toLowerCase().includes(q)
    ));
  }

  const summary = {
    pending: items.filter(i => i.decision === 'pending').length,
    approved: items.filter(i => i.decision === 'approved').length,
    revoked: items.filter(i => i.decision === 'revoked').length,
    escalated: items.filter(i => i.decision === 'escalated').length,
    identityCount: items.length,
    grantCount: items.reduce((n, i) => n + i.grantCount, 0),
  };

  return { items, summary };
}

/** @deprecated sync snapshot for legacy imports */
export function getReviewItemsSnapshot() {
  return fetchReviewInventory({}).items;
}

/** @deprecated sync snapshot for legacy imports */
export function getReviewCampaignsSnapshot() {
  return fetchReviewCampaigns();
}
