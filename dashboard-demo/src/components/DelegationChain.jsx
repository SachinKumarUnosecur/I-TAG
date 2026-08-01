import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, SlidePanel, HopChain, TablePager, paginateRows } from './ui';
import DelegationGraph from './DelegationGraph';
import {
  apps,
  dataSources,
  delegationChains,
  identities,
  accessPaths,
} from '../data/mockData';
import { subtreeHasRiskSignal } from '../data/appLineage';

const TABLE_PAGE_SIZE = 10;

const CONNECTOR_SOURCE_KEY = {
  'src-okta': 'okta',
  'src-aws': 'aws',
  'src-gcp': 'gcp',
  'src-azure': 'azure',
  'src-gws': 'googleWorkspace',
  'src-workday': 'hr',
};

const CLOUD_TO_CONNECTOR = {
  AWS: 'src-aws',
  GCP: 'src-gcp',
  Azure: 'src-azure',
};

const CLOUD_SOURCE_KEY = {
  AWS: 'aws',
  GCP: 'gcp',
  Azure: 'azure',
};

const DELEGATOR_VISIBLE = 5;

/** Scope list — no "All"; each cloud once; IdP/HR as connectors. */
const SCOPE_OPTIONS = dataSources.map(ds => ({
  id: `conn:${ds.id}`,
  label: ds.provider === 'Google Workspace' ? 'Workspace' : ds.provider,
  meta: ds.category === 'cloud' ? 'Cloud' : ds.category === 'idp' ? 'Identity' : 'HR',
  category: ds.category,
  connectorId: ds.id,
  integratedAt: ds.integratedAt || null,
}));

function scopeKindLabel(category) {
  if (category === 'cloud') return 'Cloud';
  if (category === 'idp') return 'Identity';
  if (category === 'hr') return 'HR';
  return 'Connector';
}

function parseScopeKey(scopeKey) {
  if (scopeKey?.startsWith('conn:')) {
    const id = scopeKey.slice(5);
    const ds = dataSources.find(d => d.id === id);
    return {
      connectorId: id,
      cloudId: ds?.category === 'cloud' ? ds.provider : 'all',
    };
  }
  // Fallback to AWS if somehow empty
  return { connectorId: 'src-aws', cloudId: 'AWS' };
}

/** NHI delegator picker — human identities only, searchable. */
function DelegatorSelect({ value, onChange, humans, placeholder = 'Select delegator' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filteredHumans = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return humans;
    return humans.filter(h =>
      h.name.toLowerCase().includes(q)
      || (h.email || '').toLowerCase().includes(q)
      || (h.department || '').toLowerCase().includes(q),
    );
  }, [humans, query]);

  const visible = expanded ? filteredHumans : filteredHumans.slice(0, DELEGATOR_VISIBLE);
  const hiddenCount = Math.max(0, filteredHumans.length - DELEGATOR_VISIBLE);
  const selectedHuman = humans.find(h => h.id === value);
  const label = selectedHuman ? selectedHuman.name : placeholder;

  return (
    <div
      className={`ad-combobox ad-combobox--row${open ? ' is-open' : ''}${selectedHuman ? ' is-active' : ''}`}
      ref={rootRef}
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        className="ad-combobox-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select delegator"
        onClick={e => {
          e.stopPropagation();
          setOpen(v => !v);
          setExpanded(false);
        }}
      >
        <span className="ad-combobox-label">{label}</span>
        <Icon name="chevronDown" size={12} color="var(--text-tertiary)" />
      </button>
      {open && (
        <div className="ad-combobox-panel ad-combobox-panel--row" role="listbox">
          <div className="ad-combobox-search">
            <Icon name="search" size={13} color="var(--text-tertiary)" />
            <input
              autoFocus
              placeholder="Search human identities..."
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setExpanded(false);
              }}
            />
          </div>
          {visible.map(h => (
            <button
              key={h.id}
              type="button"
              className={`ad-combobox-option${value === h.id ? ' is-selected' : ''}`}
              onClick={() => {
                onChange(h.id);
                setOpen(false);
                setQuery('');
                setExpanded(false);
              }}
            >
              <span className="ad-combobox-option-name">{h.name}</span>
              <span className="ad-combobox-option-meta">{h.department}</span>
            </button>
          ))}
          {!expanded && hiddenCount > 0 && (
            <button
              type="button"
              className="ad-combobox-more"
              onClick={() => setExpanded(true)}
            >
              +{hiddenCount} more
            </button>
          )}
          {filteredHumans.length === 0 && (
            <div className="ad-combobox-empty">No human identities match</div>
          )}
        </div>
      )}
    </div>
  );
}

function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => (
      o.label.toLowerCase().includes(q)
      || (o.meta || '').toLowerCase().includes(q)
      || o.id.toLowerCase().includes(q)
    ));
  }, [options, query]);

  const grouped = useMemo(() => {
    const order = ['Cloud', 'Identity', 'HR'];
    const buckets = new Map(order.map(k => [k, []]));
    for (const o of filtered) {
      const key = o.meta || 'Other';
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(o);
    }
    return [...buckets.entries()].filter(([, list]) => list.length > 0);
  }, [filtered]);

  const selected = options.find(o => o.id === value);
  const triggerLabel = selected?.label || placeholder;

  return (
    <div
      className={`dc-scope-select${open ? ' is-open' : ''}${value ? ' is-active' : ''}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="dc-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen(v => !v);
          setQuery('');
        }}
      >
        <span className="dc-scope-trigger-k">{label}</span>
        <span className="dc-scope-trigger-v">{triggerLabel}</span>
        {selected?.meta && <span className="dc-scope-trigger-meta">{selected.meta}</span>}
        <Icon name="chevronDown" size={12} color="var(--text-tertiary)" />
      </button>
      {open && (
        <div className="dc-scope-panel" role="listbox">
          <div className="dc-scope-panel-search">
            <Icon name="search" size={13} color="var(--text-tertiary)" />
            <input
              autoFocus
              placeholder={searchPlaceholder}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="dc-scope-panel-list">
            {grouped.map(([group, list]) => (
              <div key={group} className="dc-scope-group">
                <div className="dc-scope-group-label">{group}</div>
                {list.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    className={`dc-scope-option${value === o.id ? ' is-selected' : ''}`}
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                      setQuery('');
                    }}
                  >
                    <span className="dc-scope-option-name">{o.label}</span>
                    {o.integratedAt && (
                      <span className="dc-scope-option-meta">Integrated {o.integratedAt}</span>
                    )}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="dc-scope-empty">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function flattenTree(node, depth = 0, parent = null, rows = []) {
  rows.push({ ...node, depth, parentId: parent?.id || null, parentName: parent?.name || null });
  (node.children || []).forEach(child => flattenTree(child, depth + 1, node, rows));
  return rows;
}

/** Shared Type labels for table, panel, and graph cards. */
function identityKindLabel(node) {
  if (!node) return 'User';
  if (node.isForestRoot) return 'Lineage forest';
  if (node.isNoOriginator) {
    return `${node.name || 'Connector'} · ${scopeKindLabel(node.scopeCategory)}`;
  }
  if (node.departed || node.status === 'departed' || node.chainTone === 'departed') {
    return 'Departed user';
  }
  if (node.type === 'service' && (node.status === 'orphaned' || node.chainTone === 'orphaned')) {
    return 'Orphaned NHI';
  }
  if (node.compromised) return 'Compromised user';
  // Compromised NHI: post-integration, no human originator, not on a path
  if (
    node.type === 'service'
    && !node.preIntegration
    && (node.compromisedNhiNoPath || (
      node.chainTone === 'compromised'
      && !node.postCompromise
      && !node.compromisedPivot
      && isMissingOriginatorLabel(node.originator)
    ))
  ) {
    return 'Compromised NHI';
  }
  if (node.compromisedPivot || (node.type === 'service' && node.postCompromise && !node.compromised)) {
    return 'Compromise-path NHI';
  }
  if (node.postCompromise) return 'After compromise';
  if (node.chainTone === 'after-departure') return 'After departure';
  if (node.type === 'service') return 'NHI';
  return 'User';
}

function kindLabel(type, status, node) {
  return identityKindLabel(node || { type, status });
}

function nodeMatchesSearch(node, q) {
  if (!q || !node) return false;
  // Hubs are structural — never treat them as search hits.
  if (node.isForestRoot || node.isNoOriginator) return false;
  return String(node.name || '').toLowerCase().includes(q);
}

/** Walk a tree and collect name matches as forward roots (match + descendants only). */
function collectForwardMatches(node, q, out = [], seen = new Set()) {
  if (!node) return out;
  if (nodeMatchesSearch(node, q)) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      out.push({ ...node, children: node.children || [] });
    }
    // Skip walking into the match — descendants stay inside this forward tree.
    return out;
  }
  for (const child of node.children || []) {
    collectForwardMatches(child, q, out, seen);
  }
  return out;
}

function identityMatchesScope(identity, connectorId, cloudId) {
  if (!identity) return false;
  const sources = identity.sources || {};
  // Cloud scopes (AWS/GCP/Azure): match that cloud source only.
  // IdP/HR scopes (Okta/Workspace/Workday): match that connector source only.
  if (cloudId !== 'all') {
    const key = CLOUD_SOURCE_KEY[cloudId];
    return Boolean(key && sources[key]);
  }
  if (connectorId !== 'all') {
    const key = CONNECTOR_SOURCE_KEY[connectorId];
    return Boolean(key && sources[key]);
  }
  return true;
}

/**
 * Deep-prune to scope: keep only matching identities.
 * Out-of-scope parents are dropped and in-scope children are promoted.
 */
function scopeSubtreeNodes(node, identityById, connectorId, cloudId) {
  if (!node || node.isNoOriginator) return [];

  const kids = (node.children || [])
    .flatMap(c => scopeSubtreeNodes(c, identityById, connectorId, cloudId));
  const inScope = identityMatchesScope(identityById[node.id], connectorId, cloudId);
  if (!inScope) return kids; // promote in-scope descendants
  return [{ ...node, children: kids }];
}

function belongsInScopeHub(node) {
  if (!node || node.isNoOriginator || node.isForestRoot) return false;
  // Hub only for identities with no human originator label.
  // Pre-integration NHIs that still name a human creator become peer roots when promoted.
  return isMissingOriginatorLabel(node.originator);
}

function applyScopeToForest(node, identityById, connectorId, cloudId) {
  if (!node?.isForestRoot) return node;

  const seen = new Set();
  const peers = [];
  const hubKids = [];
  let hubTemplate = null;

  function absorb(scopedNodes, fromHub) {
    for (const scoped of scopedNodes) {
      if (seen.has(scoped.id)) continue;
      seen.add(scoped.id);
      if (fromHub || belongsInScopeHub(scoped)) hubKids.push(scoped);
      else peers.push(scoped);
    }
  }

  for (const child of node.children || []) {
    if (child.isNoOriginator) {
      hubTemplate = child;
      for (const u of child.children || []) {
        // Promote into peers when the identity has a human originator;
        // only keep true no-originator / pre-integration edge cases in the hub.
        const scoped = scopeSubtreeNodes(u, identityById, connectorId, cloudId);
        for (const s of scoped) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          if (belongsInScopeHub(s)) hubKids.push(s);
          else peers.push(s);
        }
      }
      continue;
    }
    absorb(scopeSubtreeNodes(child, identityById, connectorId, cloudId), false);
  }

  const children = [...sortRoots(peers)];
  if (hubKids.length > 0) {
    children.push({
      ...(hubTemplate || {}),
      id: hubTemplate?.id || `hub-${connectorId || 'scope'}`,
      name: hubTemplate?.name || 'Connector',
      isNoOriginator: true,
      scopeCategory: hubTemplate?.scopeCategory,
      connectorId: hubTemplate?.connectorId || connectorId,
      integratedAt: hubTemplate?.integratedAt || null,
      createdAt: hubTemplate?.createdAt || hubTemplate?.integratedAt || null,
      originator: '—',
      children: sortRoots(hubKids),
    });
  }

  return pruneDisconnectedPeerRoots({ ...node, children: sortRoots(children) });
}

/**
 * Drop peer-root leaves that have nothing forward (Linked 0) and no originator
 * node in the forest to hang from — e.g. svc-backup-agent after owen was scoped out.
 * Identities under the scope hub stay (hub is their connection).
 */
function pruneDisconnectedPeerRoots(forest) {
  if (!forest?.isForestRoot) return forest;

  let children = [...(forest.children || [])];
  let changed = true;

  while (changed) {
    changed = false;
    const presentIds = new Set();
    const presentNames = new Set();

    function index(n) {
      if (!n || n.isForestRoot) return;
      if (n.isNoOriginator) {
        (n.children || []).forEach(index);
        return;
      }
      presentIds.add(n.id);
      if (n.name) presentNames.add(String(n.name));
      (n.children || []).forEach(index);
    }
    children.forEach(index);

    const next = [];
    for (const child of children) {
      if (child.isNoOriginator) {
        // Hub stays if it still has children
        if ((child.children || []).length > 0) next.push(child);
        else changed = true;
        continue;
      }

      const hasForward = (child.children || []).length > 0;
      if (hasForward) {
        next.push(child);
        continue;
      }

      // Leaf peer root: keep only when a human originator node exists to connect to
      const originatorId = child.originatorId || null;
      const originatorName = String(child.originator || '').trim();
      const hasOriginatorNode = Boolean(
        !isMissingOriginatorLabel(originatorName)
        && (
          (originatorId && presentIds.has(originatorId))
          || presentNames.has(originatorName)
        ),
      );

      if (hasOriginatorNode) {
        next.push(child);
      } else {
        changed = true;
      }
    }

    children = next;
  }

  return { ...forest, children: sortRoots(children) };
}

function appsForScope(connectorId, cloudId) {
  return apps.filter(app => {
    const connOk = connectorId === 'all' || app.connectors.includes(connectorId);
    // Non-cloud connectors (Okta, Workspace, Workday) should not require a cloud app match
    const cloudConnector = CLOUD_TO_CONNECTOR[cloudId];
    const cloudOk = cloudId === 'all'
      || !cloudConnector
      || app.connectors.includes(cloudConnector);
    return connOk && cloudOk;
  });
}

function sortRoots(children) {
  return [...children].sort((a, b) => {
    const ar = subtreeHasRiskSignal(a) ? 0 : 1;
    const br = subtreeHasRiskSignal(b) ? 0 : 1;
    if (ar !== br) return ar - br;
    return String(a.name).localeCompare(String(b.name));
  });
}

function isMissingOriginatorLabel(value) {
  const o = String(value || '').trim().toLowerCase();
  return !o
    || o === '—'
    || o === 'no originator'
    || o === 'unknown'
    || o === 'unknown (pre-audit)'
    || o === 'unknown (pre-integration)'
    || o === 'okta directory'
    || o === 'okta.admin';
}

function hasNoOriginator(node) {
  if (!node || node.isNoOriginator || node.isForestRoot) return false;
  return isMissingOriginatorLabel(node.originator);
}

function displayOriginator(value) {
  if (isMissingOriginatorLabel(value)) return 'No originator';
  return String(value).trim();
}

function makeScopeHub({
  scopeLabel,
  scopeCategory,
  connectorId,
  integratedAt,
  appName,
  children,
}) {
  return {
    id: `hub-${connectorId || 'scope'}`,
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
    appName: appName || '—',
    children,
  };
}

/** Walk forest and collect identity ids already present. */
function collectIdsInTree(node, out = new Set()) {
  if (!node) return out;
  if (node.isForestRoot || node.isNoOriginator) {
    (node.children || []).forEach(c => collectIdsInTree(c, out));
    return out;
  }
  out.add(node.id);
  (node.children || []).forEach(c => collectIdsInTree(c, out));
  return out;
}

/**
 * Edge case: no retained creation logs for this connector.
 * Evidence only — do NOT use "No originator" label (IdP bootstrap also uses that label).
 */
function isPreIntegrationEdgeCase(identity, integratedAt) {
  if (!identity) return false;
  if (identity.createdBy == null) return true;
  if (!integratedAt) return false;
  const created = identity.createdAt || identity.sources?.hr?.hireDate || null;
  return Boolean(created && created < integratedAt);
}

function catalogNodeFromIdentity(identity, integratedAt = null) {
  const departedAt = identity.departedAt
    || identity.sources?.hr?.terminationDate
    || null;
  const isDeparted = identity.status === 'departed' || Boolean(departedAt);
  const isService = identity.type === 'service';
  const createdAt = identity.createdAt || identity.sources?.hr?.hireDate || null;
  const preIntegration = isPreIntegrationEdgeCase(identity, integratedAt);
  const orphaned = isService
    && !preIntegration
    && !identity.compromisedAt
    && (identity.status === 'orphaned' || !identity.owner);
  // Match appLineage display rules: IdP bootstrap / missing creator → No originator
  const rawOriginator = identity.originator;
  const noHumanOriginator = isMissingOriginatorLabel(rawOriginator)
    || identity.createdBy == null
    || identity.createdBy === 'id-sys-001';
  const displayOrig = noHumanOriginator ? 'No originator' : String(rawOriginator).trim();
  const compromisedNhiNoPath = isService
    && !identity.compromisedAt
    && !preIntegration
    && !orphaned
    && noHumanOriginator;
  let chainTone = 'default';
  if (isDeparted) chainTone = 'departed';
  else if (orphaned) chainTone = 'orphaned';
  else if (identity.compromisedAt || compromisedNhiNoPath) chainTone = 'compromised';

  return {
    id: identity.id,
    name: identity.name,
    type: identity.type,
    createdAt,
    compromisedAt: identity.compromisedAt || null,
    departedAt,
    compromised: Boolean(identity.compromisedAt),
    departed: isDeparted,
    postCompromise: false,
    postDeparture: false,
    compromisedNhiNoPath,
    preIntegration,
    chainTone,
    // firstKnownRoot = no retained creator id (not merely created before integration)
    firstKnownRoot: identity.createdBy == null,
    originator: displayOrig,
    originatorId: noHumanOriginator ? null : (identity.originatorId || null),
    delegator: isService ? (identity.ownerName || '—') : identity.name,
    status: orphaned ? 'orphaned' : (isService && identity.status === 'orphaned' && preIntegration
      ? 'active'
      : (identity.status || 'active')),
    children: [],
  };
}

/**
 * Merge per-app forests into one canvas.
 * Identities without a human originator hang under a scope hub named after
 * the selected connector (AWS / Okta / …) with that connector's integration date.
 */
function mergeForestRoots(appRecords, {
  riskOnly = false,
  scopeLabel = 'Connector',
  scopeCategory = 'cloud',
  connectorId = null,
  integratedAt: scopeIntegratedAt = null,
} = {}) {
  const seen = new Set();
  const known = [];
  const unknown = [];
  const appAuditDates = [];
  const appNames = [];

  for (const app of appRecords) {
    const chain = delegationChains[app.id];
    if (!chain?.root) continue;
    appNames.push(chain.appName);
    if (chain.creation_data_from) appAuditDates.push(chain.creation_data_from);

    for (const child of chain.root.children || []) {
      if (child.isNoOriginator) {
        for (const u of child.children || []) {
          if (seen.has(u.id)) continue;
          seen.add(u.id);
          unknown.push(u);
        }
        continue;
      }
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      if (hasNoOriginator(child)) unknown.push(child);
      else known.push(child);
    }
  }

  let nextKnown = sortRoots(known);
  let nextUnknown = sortRoots(unknown);
  if (riskOnly) {
    nextKnown = nextKnown.filter(subtreeHasRiskSignal);
    nextUnknown = nextUnknown.filter(subtreeHasRiskSignal);
  }

  const fallbackAudit = appAuditDates.slice().sort()[0] || null;
  const integratedAt = scopeIntegratedAt || fallbackAudit;
  const children = [...nextKnown];
  if (nextUnknown.length > 0) {
    children.push(makeScopeHub({
      scopeLabel,
      scopeCategory,
      connectorId,
      integratedAt,
      appName: appNames.filter(Boolean).join(', '),
      children: nextUnknown,
    }));
  }

  return {
    id: `forest-scope-${connectorId || appRecords.map(a => a.id).join('-') || 'empty'}`,
    name: 'Creation lineage',
    type: 'human',
    isForestRoot: true,
    chainTone: 'default',
    originator: '—',
    delegator: '—',
    children,
  };
}

/**
 * Same edge case for every connector: if an in-scope identity has no creation
 * logs (often pre-integration), hang it under that connector's hub — even when
 * the connector has no app creation edges (e.g. Workday HR).
 */
function supplementScopeEdgeCases(forest, {
  identityById,
  connectorId,
  cloudId,
  scopeLabel,
  scopeCategory,
  integratedAt,
}) {
  if (!forest?.isForestRoot) return forest;

  const present = collectIdsInTree(forest);
  const known = [];
  let hub = null;
  const unknown = [];

  for (const child of forest.children || []) {
    if (child.isNoOriginator) {
      hub = child;
      unknown.push(...(child.children || []));
    } else {
      known.push(child);
    }
  }

  const unknownIds = new Set(unknown.map(n => n.id));
  // Only supplement true pre-integration / no-log identities missing from forests.
  // No human originator → hub; retained human creator → peer root (not stuffed under hub).
  for (const identity of Object.values(identityById || {})) {
    if (!identityMatchesScope(identity, connectorId, cloudId)) continue;
    if (present.has(identity.id) || unknownIds.has(identity.id)) continue;
    if (!isPreIntegrationEdgeCase(identity, integratedAt)) continue;

    const node = catalogNodeFromIdentity(identity, integratedAt);
    if (isMissingOriginatorLabel(node.originator)) {
      unknown.push(node);
      unknownIds.add(node.id);
    } else {
      known.push(node);
      present.add(node.id);
    }
  }

  const children = [...sortRoots(known)];
  if (unknown.length > 0) {
    children.push(makeScopeHub({
      scopeLabel: hub?.name || scopeLabel,
      scopeCategory: hub?.scopeCategory || scopeCategory,
      connectorId: hub?.connectorId || connectorId,
      integratedAt: hub?.integratedAt || integratedAt,
      appName: hub?.appName || '—',
      children: sortRoots(unknown),
    }));
  }

  return pruneDisconnectedPeerRoots({ ...forest, children });
}

/**
 * Scope the forest, then (if searching) re-root on each name match so the
 * canvas shows only forward creation lineage — no ancestors / hub path.
 */
function filterTreeNode(node, { q, identityById, connectorId, cloudId }) {
  if (!node) return null;
  const scoped = node.isForestRoot
    ? applyScopeToForest(node, identityById, connectorId, cloudId)
    : node;
  if (!q) return scoped;

  const matches = collectForwardMatches(scoped, q);
  return {
    ...scoped,
    isForestRoot: true,
    name: 'Forward lineage',
    children: sortRoots(matches),
  };
}

function identityConnectors(identity) {
  if (!identity?.sources) return [];
  const labels = {
    okta: 'Okta',
    aws: 'AWS',
    gcp: 'GCP',
    azure: 'Azure',
    googleWorkspace: 'Workspace',
    hr: 'Workday',
  };
  return Object.keys(identity.sources)
    .filter(k => identity.sources[k] && labels[k])
    .map(k => labels[k]);
}

function identityClouds(identity) {
  if (!identity?.sources) return [];
  return ['aws', 'gcp', 'azure']
    .filter(k => identity.sources[k])
    .map(k => ({ aws: 'AWS', gcp: 'GCP', azure: 'Azure' }[k]));
}

function summarizePermissions(perms = []) {
  return (perms || []).map(perm => {
    const raw = String(perm || '');
    if (raw === '*') {
      return { label: 'Full administrative access (*)', tone: 'critical', detail: 'Wildcard grants every action on in-scope resources' };
    }
    if (/\*$/.test(raw) || /admin|owner|iam:|PassRole/i.test(raw)) {
      return { label: raw, tone: 'high', detail: 'Privileged action' };
    }
    return { label: raw, tone: 'default', detail: null };
  });
}

function getIndirectInheritance(path) {
  const api = path?.api || {};
  const mechanism = String(path?.mechanism || '');
  if (api.oktaGroupName) return { kind: 'group', name: api.oktaGroupName, via: api.roleArn || api.role || null };
  if (api.roleDefinitionName) return { kind: 'role', name: api.roleDefinitionName, via: api.scope || null };
  if (api.role) return { kind: 'role', name: String(api.role).split('/').pop(), via: null };
  if (api.roleArn) return { kind: 'role', name: String(api.roleArn).split('/').pop(), via: api.roleArn };
  if (mechanism.startsWith('MEMBER_OF:')) return { kind: 'group', name: mechanism.slice(10), via: null };
  if (mechanism.startsWith('ASSUMES_ROLE:')) return { kind: 'role', name: mechanism.slice(13), via: null };
  return { kind: 'group', name: mechanism || 'Inherited access', via: null };
}

function PermissionsBlock({ title, subtitle, perms }) {
  const items = summarizePermissions(perms);
  return (
    <section className="ad-detail-section">
      <div className="ad-detail-section-head">
        <h3>{title}</h3>
        <span className="ad-detail-section-count">{items.length} permission{items.length === 1 ? '' : 's'}</span>
      </div>
      {subtitle && <p className="ad-detail-section-note">{subtitle}</p>}
      <div className="ad-perm-list">
        {items.map((perm, idx) => (
          <div key={`${perm.label}-${idx}`} className={`ad-perm-item ad-perm-item--${perm.tone}`}>
            <div className="ad-perm-item-main">
              <span className="ad-perm-label">{perm.label}</span>
              {perm.tone !== 'default' && <span className="ad-perm-tone">{perm.tone}</span>}
            </div>
            {perm.detail && <div className="ad-perm-detail">{perm.detail}</div>}
          </div>
        ))}
        {items.length === 0 && <div className="ad-perm-empty">No permissions recorded</div>}
      </div>
    </section>
  );
}

export default function DelegationChain() {
  const [scopeKey, setScopeKey] = useState('conn:src-aws');
  const [layoutMode, setLayoutMode] = useState('graph');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [delegatorByIdentity, setDelegatorByIdentity] = useState({});
  const [page, setPage] = useState(1);

  const { connectorId, cloudId } = useMemo(() => parseScopeKey(scopeKey), [scopeKey]);

  const identityById = useMemo(
    () => Object.fromEntries(identities.map(i => [i.id, i])),
    [],
  );

  const humanDelegators = useMemo(
    () => identities
      .filter(i => i.type === 'human' && i.status !== 'departed')
      .map(i => ({ id: i.id, name: i.name, email: i.email, department: i.department }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  function resolveOriginator(row) {
    return displayOriginator(
      row?.originator
      || row?.parentName
      || identityById[row?.id]?.originator,
    );
  }

  function resolveDelegator(row) {
    if (!row) return '—';
    const identity = identityById[row.id];
    const isNhi = row.type === 'service' || identity?.type === 'service';
    if (!isNhi) {
      // HI: the human is their own owner / delegator
      return identity?.name || row.name;
    }
    const pickedId = delegatorByIdentity[row.id] || identity?.owner || null;
    if (pickedId && identityById[pickedId]) return identityById[pickedId].name;
    return identity?.ownerName || row.delegator || 'Select delegator';
  }

  function defaultDelegatorId(row) {
    const identity = identityById[row?.id];
    return delegatorByIdentity[row?.id]
      || identity?.owner
      || humanDelegators.find(h => h.name === identity?.ownerName)?.id
      || '';
  }

  const scopedApps = useMemo(
    () => appsForScope(connectorId, cloudId),
    [connectorId, cloudId],
  );

  const scopeOption = SCOPE_OPTIONS.find(o => o.id === scopeKey);

  const scopeForest = useMemo(() => {
    const merged = mergeForestRoots(scopedApps, {
      scopeLabel: scopeOption?.label || 'Connector',
      scopeCategory: scopeOption?.category || 'cloud',
      connectorId,
      integratedAt: scopeOption?.integratedAt || null,
    });
    // Every connector shares the same edge case: pre-integration / no creation logs.
    return supplementScopeEdgeCases(merged, {
      identityById,
      connectorId,
      cloudId,
      scopeLabel: scopeOption?.label || 'Connector',
      scopeCategory: scopeOption?.category || 'cloud',
      integratedAt: scopeOption?.integratedAt || null,
    });
  }, [scopedApps, scopeOption, connectorId, cloudId, identityById]);

  const filteredTree = useMemo(() => {
    const q = search.trim().toLowerCase();
    return filterTreeNode(scopeForest, {
      q,
      identityById,
      connectorId,
      cloudId,
    }) || { ...scopeForest, children: [] };
  }, [scopeForest, identityById, connectorId, cloudId, search]);

  const rootCount = filteredTree.children?.length || 0;

  const graphKey = `${connectorId}|${cloudId}|${search}|${layoutMode}`;

  const selectedIdentity = selected ? identityById[selected.id] : null;
  const selectedConnectorLabels = selectedIdentity ? identityConnectors(selectedIdentity) : [];
  const selectedCloudLabels = selectedIdentity ? identityClouds(selectedIdentity) : [];

  const selectedPaths = useMemo(() => {
    if (!selected) return [];
    return accessPaths
      .filter(p => {
        if (p.identityId !== selected.id) return false;
        if (cloudId !== 'all' && p.cloudProvider !== cloudId) return false;
        return true;
      })
      .sort((a, b) => {
        const score = t => (t === 'Shadow' ? 3 : t === 'Indirect' ? 2 : 1);
        return score(b.accessType) - score(a.accessType);
      });
  }, [selected, cloudId]);

  const activePath = selectedPath || selectedPaths[0] || null;

  function openRow(row) {
    if (row?.isForestRoot) return;
    setSelected(row);
    if (row.isNoOriginator || row.id === 'id-sys-001') {
      setSelectedPath(null);
      return;
    }
    const paths = accessPaths.filter(p => {
      if (p.identityId !== row.id) return false;
      if (cloudId !== 'all' && p.cloudProvider !== cloudId) return false;
      return true;
    });
    setSelectedPath(paths.sort((a, b) => {
      const score = t => (t === 'Shadow' ? 3 : t === 'Indirect' ? 2 : 1);
      return score(b.accessType) - score(a.accessType);
    })[0] || null);
  }

  const tableRows = useMemo(
    () => flattenTree(filteredTree).filter(r => !r.isForestRoot),
    [filteredTree],
  );

  useEffect(() => {
    setPage(1);
  }, [search, scopeKey, layoutMode]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    tableRows,
    page,
    TABLE_PAGE_SIZE,
  );

  function onScopeChange(id) {
    setScopeKey(id);
    setSelected(null);
    setSelectedPath(null);
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Delegation chain</h1>
          <p className="page-subtitle">
            Creator-lineage trees by scope. Search an identity to focus its forward graph — what it went on to create.
          </p>
        </div>
      </div>

      <div className="dc-filters" role="search">
        <label className={`dc-filters-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={15} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity to focus forward lineage…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search identity"
          />
          {search.trim() && (
            <button
              type="button"
              className="dc-filters-clear"
              aria-label="Clear search"
              onClick={() => {
                setSearch('');
                setSelected(null);
                setSelectedPath(null);
              }}
            >
              Clear
            </button>
          )}
        </label>

        <SearchableSelect
          label="Scope"
          value={scopeKey}
          options={SCOPE_OPTIONS}
          onChange={onScopeChange}
          placeholder="Select scope"
          searchPlaceholder="Filter scopes…"
        />

        <div className="dc-filters-view" role="group" aria-label="View">
          <span className="dc-filters-view-k">View</span>
          <div className="dc-filters-view-seg">
            <button
              type="button"
              className={`dc-view-btn${layoutMode === 'graph' ? ' is-active' : ''}`}
              onClick={() => setLayoutMode('graph')}
            >
              Graph
            </button>
            <button
              type="button"
              className={`dc-view-btn${layoutMode === 'table' ? ' is-active' : ''}`}
              onClick={() => setLayoutMode('table')}
            >
              Table
            </button>
        </div>
        </div>
      </div>

      {layoutMode === 'graph' ? (
        <div className="dc-graph-wrap">
          {rootCount === 0 ? (
            <div className="dc-graph-empty">
              No identities in this scope yet. After a connector is integrated, pre-integration identities with no creation logs appear under its hub.
            </div>
          ) : (
            <DelegationGraph
              key={graphKey}
              tree={filteredTree}
              selectedId={selected?.id}
              onSelect={openRow}
              expandRoots={Boolean(search.trim())}
            />
          )}
        </div>
      ) : (
        <div className="table-wrapper ad-table-wrap dc-table-wrap">
          <table className="data-table ad-table">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Kind</th>
                <th>Originator</th>
                <th>Delegator</th>
                <th>Depth</th>
                <th>Children</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="ad-table-empty">No identities match current filters</td>
                </tr>
              )}
              {pageRows.map(row => (
                <tr
                  key={`${row.id}-${row.depth}-${row.parentId || 'root'}`}
                  className={selected?.id === row.id ? 'is-selected' : undefined}
                  onClick={() => openRow(row)}
                  style={{ cursor: 'pointer' }}
                >
                  <td>
                    <div className="dc-table-identity" style={{ paddingLeft: Math.min(row.depth, 6) * 14 }}>
                      <span className={`dc-table-tone dc-table-tone--${row.chainTone || 'default'}`} />
                      <span className="dc-table-name">{row.name}</span>
                    </div>
                  </td>
                  <td>{kindLabel(row.type, row.status, row)}</td>
                  <td>
                    <span className="ad-actor" title={row.isNoOriginator ? row.name : resolveOriginator(row)}>
                      {row.isNoOriginator ? row.name : resolveOriginator(row)}
                    </span>
                    <div className="dc-table-date">
                      {row.isNoOriginator
                        ? (row.integratedAt ? `Integrated ${row.integratedAt}` : '')
                        : ((row.createdAt || identityById[row.id]?.createdAt)
                          ? `Created ${row.createdAt || identityById[row.id]?.createdAt}`
                          : '')}
                      </div>
                    </td>
                  <td className="ad-td-delegator" onClick={e => e.stopPropagation()}>
                    {row.isNoOriginator ? (
                      <span className="ad-actor">—</span>
                    ) : (row.type === 'service' || identityById[row.id]?.type === 'service') ? (
                      <DelegatorSelect
                        value={defaultDelegatorId(row)}
                        humans={humanDelegators}
                        placeholder={identityById[row.id]?.ownerName || 'Select delegator'}
                        onChange={humanId => {
                          setDelegatorByIdentity(prev => ({ ...prev, [row.id]: humanId }));
                        }}
                      />
                    ) : (
                      <span className="ad-actor ad-actor--delegator" title={resolveDelegator(row)}>
                        {resolveDelegator(row)}
                      </span>
                    )}
                    </td>
                  <td>{row.depth}</td>
                  <td>{row.children?.length ?? 0}</td>
                  <td>
                    <span className={`dc-status-text--${row.status || 'active'}`}>
                      {row.status || 'active'}
                    </span>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
            total={tableRows.length}
            noun="identities"
          />
        </div>
      )}

      {selected && (() => {
        const isNhi = selected.type === 'service' || selectedIdentity?.type === 'service';
        const isHi = !selected.isNoOriginator && !isNhi;
        const alertText = selected.isNoOriginator
          ? `${selected.name} integrated ${selected.integratedAt || '—'} · edge case: identities seen in this connector with no creation logs (usually pre-integration) hang here.`
          : selected.firstKnownRoot
            ? `Created ${selected.createdAt || '—'} before integration · no originator in retained logs.`
            : selected.departed || selected.status === 'departed'
              ? 'Departed user · residual access may remain.'
              : (selected.status === 'orphaned' || selected.chainTone === 'orphaned')
                ? (selected.postDeparture && selected.departureSource
                  ? `Orphaned NHI · created after ${selected.departureSource.name} departed (${selected.departureSource.at}).`
                  : 'Orphaned NHI · no active human owner.')
                : selected.compromised
                  ? `Compromised ${selected.compromisedAt}.`
                    : selected.compromisedNhiNoPath
                  ? 'Compromised NHI · no human originator after integration (not on a compromise path).'
                  : selected.compromisedPivot
                    ? 'Compromise-path NHI.'
                    : selected.postCompromise && selected.compromiseSource
                      ? `Created after ${selected.compromiseSource.name} was compromised (${selected.compromiseSource.at}).`
                      : selected.postDeparture && selected.departureSource
                        ? `Created after ${selected.departureSource.name} departed (${selected.departureSource.at}).`
                        : null;
        const inherit = activePath ? getIndirectInheritance(activePath) : null;

        return (
          <SlidePanel
            size="wide"
            title={selected.name}
            subtitle={kindLabel(selected.type, selected.status, selected)}
            onClose={() => {
              setSelected(null);
              setSelectedPath(null);
            }}
          >
            <div className="dc-panel">
              <div className="dc-panel-chips">
                <span className={`dc-chip dc-chip--${isNhi ? 'nhi' : selected.isNoOriginator ? 'muted' : 'hi'}`}>
                  {selected.isNoOriginator
                    ? scopeKindLabel(selected.scopeCategory)
                    : isNhi ? 'NHI' : 'HI'}
                </span>
                {!selected.isNoOriginator && (
                  <span className={`dc-chip dc-chip--status-${selected.status || 'active'}`}>
                    {selected.status || 'active'}
                  </span>
                )}
                {(selected.createdAt || selectedIdentity?.createdAt || selected.integratedAt) && (
                  <span className="dc-chip dc-chip--muted">
                    {selected.isNoOriginator
                      ? `Integrated ${selected.integratedAt || selected.createdAt}`
                      : `Created ${selected.createdAt || selectedIdentity?.createdAt}`}
                  </span>
                )}
                {selectedIdentity?.riskScore != null && (
                  <span className="dc-chip dc-chip--risk">Risk {selectedIdentity.riskScore}</span>
                )}
              </div>

              {alertText && (
                <div className="dc-panel-banner">
                  <Icon name="alert" size={14} color="var(--color-hop)" />
                  <p>{alertText}</p>
                </div>
              )}

              {selected.isNoOriginator ? (
                <section className="dc-panel-section">
                  <h3 className="dc-panel-section-title">{selected.name}</h3>
                  <div className="dc-panel-facts">
                    <div>
                      <span className="dc-panel-k">Type</span>
                      <span className="dc-panel-v">{scopeKindLabel(selected.scopeCategory)}</span>
                    </div>
                    <div>
                      <span className="dc-panel-k">Integrated</span>
                      <span className="dc-panel-v">{selected.integratedAt || '—'}</span>
                    </div>
                    <div>
                      <span className="dc-panel-k">Linked identities</span>
                      <span className="dc-panel-v">{selected.children?.length ?? 0}</span>
                    </div>
                    <div>
                      <span className="dc-panel-k">Apps</span>
                      <span className="dc-panel-v">{selected.appName || '—'}</span>
                    </div>
                  </div>
                </section>
              ) : (
                <>
                  <section className="dc-panel-section">
                    <h3 className="dc-panel-section-title">Lineage</h3>
                    <div className="dc-panel-lineage">
                      <div className="dc-panel-lineage-col">
                        <span className="dc-panel-k">Originator</span>
                        <span className="dc-panel-v">
                          {resolveOriginator(selected)}
                        </span>
                      </div>
                      <div className="dc-panel-lineage-arrow" aria-hidden="true">→</div>
                      <div className="dc-panel-lineage-col">
                        <span className="dc-panel-k">{isNhi ? 'Delegator / owner' : 'Delegator'}</span>
                        {isNhi ? (
                          <DelegatorSelect
                            value={defaultDelegatorId(selected)}
                            humans={humanDelegators}
                            placeholder={selectedIdentity?.ownerName || 'Select human owner'}
                            onChange={humanId => {
                              setDelegatorByIdentity(prev => ({ ...prev, [selected.id]: humanId }));
                            }}
                          />
                        ) : (
                          <span className="dc-panel-v">
                            {resolveDelegator(selected)}
                            {isHi && <span className="dc-owner-hint"> · owner</span>}
                          </span>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className="dc-panel-section">
                    <h3 className="dc-panel-section-title">Profile</h3>
                    <div className="dc-panel-facts">
                      {selectedIdentity?.department && (
                        <div>
                          <span className="dc-panel-k">Department</span>
                          <span className="dc-panel-v">{selectedIdentity.department}</span>
                        </div>
                      )}
                      <div>
                        <span className="dc-panel-k">Children</span>
                        <span className="dc-panel-v">{selected.children?.length ?? 0}</span>
                      </div>
                      <div>
                        <span className="dc-panel-k">Depth</span>
                        <span className="dc-panel-v">{selected.depth}</span>
                      </div>
                      {selectedIdentity?.apps?.length > 0 && (
                        <div>
                          <span className="dc-panel-k">Apps</span>
                          <span className="dc-panel-v">{selectedIdentity.apps.join(', ')}</span>
                        </div>
                      )}
                    </div>
                    {(selectedConnectorLabels.length > 0 || selectedCloudLabels.length > 0) && (
                      <div className="dc-panel-tags">
                        {selectedConnectorLabels.map(c => (
                          <span key={c} className="dc-tag">{c}</span>
                        ))}
                        {selectedCloudLabels.map(c => (
                          <span key={`cloud-${c}`} className="dc-tag dc-tag--cloud">{c}</span>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              )}

              {activePath && (
                <section className="dc-panel-section">
                  <div className="dc-panel-section-head">
                    <h3 className="dc-panel-section-title">Access</h3>
                    {selectedPaths.length > 1 && (
                      <span className="dc-panel-section-meta">{selectedPaths.length} paths</span>
                    )}
          </div>

                  {selectedPaths.length > 1 && (
                    <div className="dc-panel-path-switch">
                      {selectedPaths.map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className={`dc-path-pill${activePath?.id === p.id ? ' is-active' : ''}`}
                          onClick={() => setSelectedPath(p)}
                        >
                          {p.accessType}
                        </button>
                      ))}
        </div>
      )}

                  <div className="dc-panel-access">
                    <div className="dc-panel-access-main">
                      <span className={`dc-access-type dc-access-type--${(activePath.accessType || '').toLowerCase()}`}>
                        {activePath.accessType === 'Shadow' ? 'Shadow' : activePath.accessType}
                      </span>
                      <span className="dc-panel-resource">{activePath.resource}</span>
                    </div>
                    <div className="dc-panel-facts dc-panel-facts--tight">
                      <div>
                        <span className="dc-panel-k">Cloud</span>
                        <span className="dc-panel-v">{activePath.cloudProvider}</span>
                      </div>
                      <div>
                        <span className="dc-panel-k">Sensitivity</span>
                        <span className="dc-panel-v">{activePath.resourceSensitivity}</span>
                      </div>
                    </div>
                  </div>

                  {activePath.accessType === 'Direct' && (
                    <PermissionsBlock
                      title="Permissions"
                      subtitle="Granted directly on this resource."
                      perms={activePath.effectivePermissions}
                    />
                  )}

                  {activePath.accessType === 'Indirect' && inherit && (
                    <>
                      <div className="dc-panel-inherit">
                        <span className="dc-panel-k">
                          {inherit.kind === 'group' ? 'Group' : 'Role'}
                        </span>
                        <span className="dc-panel-v">{inherit.name}</span>
                        {activePath.mechanism && (
                          <code className="dc-panel-code">{activePath.mechanism}</code>
                        )}
                      </div>
                      <PermissionsBlock
                        title="Inherited permissions"
                        subtitle="Via group or role."
                        perms={activePath.effectivePermissions}
                      />
                    </>
                  )}

                  {activePath.accessType === 'Shadow' && (
                    <>
                      {activePath.hops?.length > 0 && (
                        <div className="dc-panel-hops">
                          <HopChain hops={activePath.hops} />
                        </div>
                      )}
                      <PermissionsBlock
                        title="Effective permissions"
                        subtitle="Reachable through the shadow path."
                        perms={activePath.effectivePermissions}
                      />
                    </>
                  )}
                </section>
              )}
      </div>
          </SlidePanel>
        );
      })()}
    </div>
  );
}
