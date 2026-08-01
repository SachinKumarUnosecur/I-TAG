/**
 * Delegation Chain / Provisioning Lineage view-model.
 *
 * Maps `@itag/backend` lineage payloads into Graph + Table shapes consumed by
 * `DelegationChain.jsx`. Pattern mirror: `accessViewModel.js`.
 *
 * ## SCOPE (UI connector) → engine `app`
 * | UI chip (dataSources id) | Engine app        | Notes |
 * |--------------------------|-------------------|-------|
 * | src-aws / AWS            | aws-iam           | Primary CISO walkthrough |
 * | src-azure / Azure        | entra-tenant      | Closest Entra seed app |
 * | src-okta                 | idp-core          | Corporate IdP |
 * | src-gcp / GCP            | (none)            | No engine app in seed — empty scope |
 * | src-gws / Workspace      | (none)            | No engine app |
 * | src-workday              | (none)            | HR ≠ creation lineage app |
 * | (also in seed, no chip)  | snowflake, github, legacy-ldap, mcp-gateway | Available via `?app=` only |
 *
 * Do not silently merge apps. Unmapped chips → empty forest + honest message.
 *
 * ## Engine field → UI field
 * | Engine                         | UI                                      |
 * |--------------------------------|-----------------------------------------|
 * | identity_id / name             | node.id / node.name                     |
 * | identity_type                  | node.type (human \| service)            |
 * | provenance + created_by        | originator via shared originatorLabel   |
 * | provenance.state / gap.reason   | provenanceState / gapReason (kept)      |
 * | generation                     | generation / table Depth                |
 * | fan_out / fan_out_in_app       | fanOut / Linked (children when nested)  |
 * | creator_status                 | creatorStatus; tone departed if set     |
 * | self_authorized                | selfAuthorized + Signals badge          |
 * | creator_privilege_mismatch     | creatorPrivilegeMismatch + badge        |
 * | fan_out_exceeds_baseline       | fanOutExceedsBaseline + badge           |
 * | coverage.explanation_coverage  | coverage strip % only — never risk %    |
 *
 * Live path never sets chainTone compromised|orphaned|after-departure.
 */

import { originatorLabel } from './accessViewModel.js';

/** UI connector id → engine lineage app (or null if unmapped). */
export const SCOPE_TO_ENGINE_APP = {
  'src-aws': 'aws-iam',
  'src-azure': 'entra-tenant',
  'src-okta': 'idp-core',
  'src-gcp': null,
  'src-gws': null,
  'src-workday': null,
};

export function engineAppForScope(connectorId, cloudId) {
  if (connectorId && Object.prototype.hasOwnProperty.call(SCOPE_TO_ENGINE_APP, connectorId)) {
    return SCOPE_TO_ENGINE_APP[connectorId];
  }
  if (cloudId === 'AWS') return 'aws-iam';
  if (cloudId === 'Azure') return 'entra-tenant';
  if (cloudId === 'GCP') return null;
  return null;
}

function kindOf(identityType) {
  return identityType === 'human' ? 'human' : 'service';
}

function gapReasonOf(row) {
  const provenance = row?.provenance;
  if (!provenance) return null;
  if (provenance.state === 'explained_absence') return provenance.gap?.reason || null;
  if (provenance.state === 'unexplained') return 'unexplained';
  return null;
}

function isMissingOriginator(value) {
  const o = String(value || '').trim().toLowerCase();
  return !o
    || o === '—'
    || o === 'no originator'
    || o === 'unknown'
    || o === 'okta.admin'
    || o === 'okta directory';
}

/** Live path: no compromise/orphan/after-departure tones. Badges carry structural signals. */
function structuralTone(_row) {
  return 'default';
}

function signalBadges(row) {
  const badges = [];
  if (row?.self_authorized) badges.push({ id: 'self_authorized', label: 'Self-authorized' });
  if (row?.creator_privilege_mismatch) {
    badges.push({ id: 'creator_privilege_mismatch', label: 'Creator privilege mismatch' });
  }
  if (row?.fan_out_exceeds_baseline) {
    badges.push({ id: 'fan_out_exceeds_baseline', label: 'Fan-out exceeds baseline' });
  }
  if (row?.creator_status === 'departed') {
    badges.push({ id: 'creator_departed', label: 'Creator departed' });
  }
  return badges;
}

/** Map one ProvenanceRecord → graph/table node (no children yet). */
export function lineageRowToNode(row) {
  const originator = originatorLabel(row);
  const noOrig = isMissingOriginator(originator);
  const type = kindOf(row.identity_type);
  const tone = structuralTone(row);

  return {
    id: row.identity_id,
    name: row.name || row.identity_id,
    type,
    createdAt: row.created_at || null,
    originator,
    originatorId: row.created_by || null,
    delegator: type === 'human' ? (row.name || row.identity_id) : '—',
    generation: row.generation,
    fanOut: row.fan_out_in_app ?? row.fan_out ?? 0,
    fanOutTotal: row.fan_out ?? 0,
    creatorStatus: row.creator_status || null,
    provenanceState: row.provenance?.state || null,
    gapReason: gapReasonOf(row),
    selfAuthorized: Boolean(row.self_authorized),
    creatorPrivilegeMismatch: Boolean(row.creator_privilege_mismatch),
    fanOutExceedsBaseline: Boolean(row.fan_out_exceeds_baseline),
    signals: signalBadges(row),
    chainTone: tone,
    departed: false,
    status: 'active',
    firstKnownRoot: noOrig && (row.generation === 0 || row.generation == null),
    preIntegration: row.provenance?.state === 'explained_absence'
      && row.provenance?.gap?.reason === 'outside_audit_window',
    children: [],
    _raw: row,
  };
}

/**
 * Build peer roots + No-originator hub from list rows (approach A).
 * Nest via same-app `created_by` when parent is in the result set.
 */
export function buildForestFromLineageRows(rows, {
  scopeLabel = 'Connector',
  scopeCategory = 'cloud',
  connectorId = null,
  integratedAt = null,
  engineApp = null,
} = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const byId = new Map(list.map((r) => [r.identity_id, r]));
  const nodes = new Map(list.map((r) => [r.identity_id, lineageRowToNode(r)]));

  // Prefer human-readable creator names over raw identity ids
  for (const node of nodes.values()) {
    if (node.originatorId && nodes.has(node.originatorId)) {
      node.originator = nodes.get(node.originatorId).name;
    } else if (node.originatorId && byId.has(node.originatorId)) {
      const parentRow = byId.get(node.originatorId);
      node.originator = parentRow.name || node.originatorId;
    }
    // Re-apply honesty: never leave IdP bootstrap as a fake human label
    if (isMissingOriginator(node.originator)) {
      node.originator = 'No originator';
      node.originatorId = null;
    }
  }

  const childIds = new Set();
  for (const row of list) {
    if (row.provenance?.state !== 'recorded' || !row.created_by) continue;
    if (!byId.has(row.created_by)) continue;
    const parent = nodes.get(row.created_by);
    const child = nodes.get(row.identity_id);
    if (!parent || !child) continue;
    parent.children.push(child);
    childIds.add(row.identity_id);
  }

  // Stable child order by created_at then name
  for (const node of nodes.values()) {
    node.children.sort((a, b) => {
      const da = a.createdAt || '';
      const db = b.createdAt || '';
      if (da !== db) return da.localeCompare(db);
      return String(a.name).localeCompare(String(b.name));
    });
    // Linked prefers nested children; fall back to engine fan_out_in_app
    if (node.children.length === 0 && node.fanOut > 0) {
      // Placeholder capacity for expand — graph uses children.length; keep fanOut on node
    }
  }

  const peers = [];
  const hubKids = [];
  for (const [id, node] of nodes) {
    if (childIds.has(id)) continue;
    if (isMissingOriginator(node.originator)) hubKids.push(node);
    else peers.push(node);
  }

  const sortRoots = (arr) => [...arr].sort((a, b) => {
    const as = a.signals?.length ? 0 : 1;
    const bs = b.signals?.length ? 0 : 1;
    if (as !== bs) return as - bs;
    if ((b.fanOut || 0) !== (a.fanOut || 0)) return (b.fanOut || 0) - (a.fanOut || 0);
    return String(a.name).localeCompare(String(b.name));
  });

  const children = [...sortRoots(peers)];
  if (hubKids.length > 0) {
    children.push({
      id: `hub-${connectorId || engineApp || 'scope'}`,
      name: scopeLabel,
      type: 'human',
      isNoOriginator: true,
      scopeCategory,
      connectorId,
      chainTone: 'default',
      integratedAt,
      createdAt: integratedAt,
      originator: '—',
      originatorId: null,
      delegator: '—',
      appName: engineApp || scopeLabel,
      children: sortRoots(hubKids),
    });
  }

  return {
    id: `forest-scope-${connectorId || engineApp || 'empty'}`,
    name: 'Creation lineage',
    type: 'human',
    isForestRoot: true,
    chainTone: 'default',
    originator: '—',
    delegator: '—',
    children,
  };
}

/** Flatten forest → table rows (skips forest root; keeps hub). */
export function flattenForest(node, depth = 0, parent = null, rows = []) {
  if (!node) return rows;
  if (node.isForestRoot) {
    for (const child of node.children || []) {
      flattenForest(child, 0, null, rows);
    }
    return rows;
  }
  rows.push({
    ...node,
    depth,
    parentId: parent?.id || null,
    parentName: parent?.name || null,
  });
  for (const child of node.children || []) {
    flattenForest(child, depth + 1, node, rows);
  }
  return rows;
}

export function coverageViewModel(coveragePayload, engineApp) {
  const overall = coveragePayload?.overall || coveragePayload;
  const byApp = coveragePayload?.by_app || [];
  const scoped = engineApp
    ? (byApp.find((a) => a.app === engineApp) || null)
    : overall;

  const slice = scoped || overall || {};
  return {
    engineApp: engineApp || null,
    total: slice.total ?? 0,
    withRecordedCreator: slice.with_recorded_creator ?? 0,
    explainedAbsences: slice.explained_absences ?? 0,
    unexplained: slice.unexplained ?? 0,
    explanationCoverage: slice.explanation_coverage ?? null,
    gapBuckets: slice.gap_buckets || [],
    creationDataFrom: slice.creation_data_from ?? null,
    attributedToHuman: slice.attributed_to_human ?? null,
    overall: overall || null,
    byApp,
  };
}

/**
 * Live bundle from coverage + list (+ optional actors).
 */
export function buildLineageViewModel({
  coverage,
  lineageList,
  actors,
  scopeLabel,
  scopeCategory,
  connectorId,
  integratedAt,
  engineApp,
}) {
  const rows = lineageList?.rows || [];
  const forest = engineApp
    ? buildForestFromLineageRows(rows, {
      scopeLabel,
      scopeCategory,
      connectorId,
      integratedAt,
      engineApp,
    })
    : {
      id: 'forest-scope-unmapped',
      name: 'Creation lineage',
      type: 'human',
      isForestRoot: true,
      chainTone: 'default',
      originator: '—',
      delegator: '—',
      children: [],
      unmappedScope: true,
    };

  const identityById = Object.fromEntries(
    rows.map((r) => [r.identity_id, {
      id: r.identity_id,
      name: r.name || r.identity_id,
      type: kindOf(r.identity_type),
      createdAt: r.created_at || null,
      originator: originatorLabel(r),
      status: 'active',
      apps: r.app ? [r.app] : [],
      sources: {},
      creatorStatus: r.creator_status,
      provenanceState: r.provenance?.state,
      gapReason: gapReasonOf(r),
      selfAuthorized: Boolean(r.self_authorized),
      fanOut: r.fan_out_in_app ?? r.fan_out ?? 0,
      generation: r.generation,
    }]),
  );

  const tableRows = flattenForest(forest).filter((r) => !r.isForestRoot);

  return {
    source: 'live',
    engineApp,
    coverage: coverageViewModel(coverage, engineApp),
    listMeta: {
      count: lineageList?.count ?? rows.length,
      withRecordedCreator: lineageList?.with_recorded_creator ?? null,
      selfAuthorized: lineageList?.self_authorized ?? null,
    },
    actors: actors?.actors || [],
    forest,
    tableRows,
    identityById,
    rows,
  };
}

/**
 * Attach direct children from a tree response onto a forest node (lazy expand / search).
 * Descendants walk is flat with `distance`; distance === 1 are direct children.
 */
export function mergeTreeIntoForest(forest, identityId, tree, rowById = new Map()) {
  if (!forest || !tree) return forest;
  const desc = tree.descendants?.nodes || [];
  const direct = desc.filter((n) => n.distance === 1);

  function enrich(node) {
    const row = rowById.get(node.identity_id);
    if (row) return { ...lineageRowToNode(row), children: [] };
    return {
      id: node.identity_id,
      name: node.name || node.identity_id,
      type: kindOf(node.identity_type),
      createdAt: node.created_at || null,
      originator: '—',
      generation: node.generation,
      fanOut: 0,
      chainTone: 'default',
      status: 'active',
      signals: [],
      children: [],
      crossesApp: Boolean(node.crosses_app),
    };
  }

  function walk(node) {
    if (!node) return node;
    if (node.id === identityId && !node.isNoOriginator && !node.isForestRoot) {
      const existing = new Map((node.children || []).map((c) => [c.id, c]));
      const merged = direct.map((d) => {
        const prev = existing.get(d.identity_id);
        return prev || enrich(d);
      });
      return { ...node, children: merged, fanOut: Math.max(node.fanOut || 0, merged.length) };
    }
    return {
      ...node,
      children: (node.children || []).map(walk),
    };
  }

  return walk(forest);
}

/**
 * Offline mock: reuse buildDelegationChains forest + synthetic coverage.
 * Narrative tones (compromised/orphaned) remain — mock overlay only.
 */
export function buildViewModelFromMockBundle({
  identities,
  delegationChains,
  apps,
  scopeLabel,
  scopeCategory,
  connectorId,
  cloudId,
  integratedAt,
  mergeForestRoots,
  supplementScopeEdgeCases,
  appsForScope,
}) {
  const scopedApps = appsForScope(connectorId, cloudId);
  const identityById = Object.fromEntries(identities.map((i) => [i.id, i]));

  let forest = mergeForestRoots(scopedApps, {
    scopeLabel,
    scopeCategory,
    connectorId,
    integratedAt,
  });
  forest = supplementScopeEdgeCases(forest, {
    identityById,
    connectorId,
    cloudId,
    scopeLabel,
    scopeCategory,
    integratedAt,
  });

  const tableRows = flattenForest(forest).filter((r) => !r.isForestRoot);

  // Honest-ish mock coverage from table population (not a risk KPI)
  const noOrig = tableRows.filter((r) => !r.isNoOriginator && isMissingOriginator(r.originator)).length;
  const withOrig = tableRows.filter((r) => !r.isNoOriginator && !isMissingOriginator(r.originator)).length;
  const total = noOrig + withOrig;
  const coverage = {
    engineApp: null,
    total,
    withRecordedCreator: withOrig,
    explainedAbsences: noOrig,
    unexplained: 0,
    explanationCoverage: total ? withOrig / total : null,
    gapBuckets: noOrig
      ? [{ reason: 'outside_audit_window', count: noOrig }]
      : [],
    creationDataFrom: integratedAt,
    attributedToHuman: withOrig,
    overall: null,
    byApp: [],
    mock: true,
  };

  return {
    source: 'mock',
    engineApp: null,
    coverage,
    listMeta: { count: total, withRecordedCreator: withOrig, selfAuthorized: null },
    actors: [],
    forest,
    tableRows,
    identityById,
    rows: [],
    scopedApps,
    apps,
    delegationChains,
  };
}
