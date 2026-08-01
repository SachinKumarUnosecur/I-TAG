/**
 * Access Reviews API client — quotes `@itag/backend` `/api/access-reviews`.
 * View-model field names match the existing AccessReviews UI (shape unchanged).
 */

import { apiGet, apiPost } from '../api/client.js';

function toQuery(params) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null || value === '' || value === 'all' || value === 'All') {
      continue;
    }
    q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** Campaign list with live tallies. */
export async function fetchReviewCampaigns(opts = {}) {
  const body = await apiGet('/api/access-reviews/campaigns', opts);
  return body?.campaigns || [];
}

/**
 * Review inventory from live seed via Access + Risk quotes + owned decisions.
 * opts: { campaignId, search, decision, connector, signal }
 */
export async function fetchReviewInventory(opts = {}) {
  const {
    campaignId = 'all',
    search = '',
    decision = 'all',
    connector = 'all',
    signal,
  } = opts;

  const body = await apiGet(
    `/api/access-reviews${toQuery({
      campaign: campaignId,
      search,
      decision: decision === 'All' ? 'all' : decision,
      connector,
    })}`,
    { signal },
  );

  return {
    items: body?.items || [],
    summary: body?.summary || {
      pending: 0,
      approved: 0,
      revoked: 0,
      escalated: 0,
      identityCount: 0,
      grantCount: 0,
    },
  };
}

export async function fetchReviewSummary(opts = {}) {
  const { search = '', decision = 'all', campaignId = 'all', signal } = opts;
  return apiGet(
    `/api/access-reviews/summary${toQuery({
      campaign: campaignId,
      search,
      decision: decision === 'All' ? 'all' : decision,
    })}`,
    { signal },
  );
}

/**
 * Live grants for an identity (assignment drawer).
 * opts: { connector, signal }
 */
export async function fetchIdentityAssignments(identityId, opts = {}) {
  const { connector = 'all', signal } = opts;
  const itemId = identityId.startsWith('ri-') ? identityId : `ri-${identityId}`;
  const body = await apiGet(
    `/api/access-reviews/${encodeURIComponent(itemId)}${toQuery({ connector })}`,
    { signal },
  );
  return body?.detail || {
    identityId,
    assignments: [],
    connectors: [],
    grantCount: 0,
    permissionCount: 0,
  };
}

/** Record approve | revoke | escalate against a review item. */
export async function postReviewDecision(itemOrIdentityId, action, opts = {}) {
  const itemId = String(itemOrIdentityId).startsWith('ri-')
    ? String(itemOrIdentityId)
    : `ri-${itemOrIdentityId}`;
  const {
    actor = 'tom.walker',
    justification = `Campaign decision: ${action}`,
    signal,
  } = opts;
  return apiPost(
    `/api/access-reviews/${encodeURIComponent(itemId)}/decision`,
    { action, actor, justification },
    { signal },
  );
}

export async function downloadReviewExport(framework) {
  const response = await fetch(
    `/api/access-reviews/export?framework=${encodeURIComponent(framework)}`,
  );
  if (!response.ok) {
    throw new Error(`export_failed_${response.status}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `access-reviews-${framework}-attestation.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** @deprecated prefer async fetchReviewInventory — sync cache for Overview tile */
let _snapshotItems = null;
let _snapshotCampaigns = null;

export async function warmReviewSnapshots() {
  const [inventory, campaigns] = await Promise.all([
    fetchReviewInventory({}),
    fetchReviewCampaigns(),
  ]);
  _snapshotItems = inventory.items;
  _snapshotCampaigns = campaigns;
  return { items: _snapshotItems, campaigns: _snapshotCampaigns };
}

export function getReviewItemsSnapshot() {
  return _snapshotItems || [];
}

export function getReviewCampaignsSnapshot() {
  return _snapshotCampaigns || [];
}
