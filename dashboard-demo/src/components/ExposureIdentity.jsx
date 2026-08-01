import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Icon,
  AccessBadge,
  HopChain,
  riskColor,
  TablePager,
  paginateRows,
} from './ui';
import ResourceMapGraph from './ResourceMapGraph';
import {
  CLOUD_PROVIDERS,
  fetchCloudExposureInventory,
  fetchIdentityResourceMap,
  buildResourceTraceTree,
  buildResourceRadialModel,
  listCloudAccounts,
} from '../data/exposureApi';
import { buildApiEvidenceRows } from '../data/cloudNative';

const VISIBLE_IDENTITIES = 5;
const TABLE_PAGE_SIZE = 10;

function cloudQuery(cloud, accountKey) {
  const params = new URLSearchParams();
  if (cloud) params.set('cloud', cloud);
  if (accountKey && accountKey !== 'all') params.set('account', accountKey);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function flattenTree(node, depth = 0, parent = null, rows = []) {
  if (!node) return rows;
  if (!node.isForestRoot) {
    rows.push({ ...node, depth, parentId: parent?.id || null, parentName: parent?.name || null });
  }
  (node.children || []).forEach(child => flattenTree(child, depth + 1, node, rows));
  return rows;
}

function collectResources(node, out = []) {
  if (!node || node.isForestRoot) {
    (node?.children || []).forEach(c => collectResources(c, out));
    return out;
  }
  const isAccess = (node.isResource || node.mapRole === 'access')
    && !node.isAttachment
    && node.mapRole !== 'attachment';
  if (isAccess) out.push(node);
  (node.children || []).forEach(c => collectResources(c, out));
  return out;
}

function ApiEvidence({ api, cloud, path }) {
  const rows = api?.length
    ? api
    : buildApiEvidenceRows(path?.api || api, cloud, path);
  if (!rows?.length) return null;

  const title = cloud === 'AWS'
    ? 'AWS API evidence'
    : cloud === 'GCP'
      ? 'Google Cloud API evidence'
      : cloud === 'Azure'
        ? 'Azure API evidence'
        : 'API evidence';

  return (
    <div className={`em-api em-api--${(cloud || 'cloud').toLowerCase()}`}>
      <div className="em-api-head">
        <span className="em-cloud-pill">{cloud}</span>
        <span className="em-api-title">{title}</span>
      </div>
      <dl className="em-api-grid">
        {rows.map(r => (
          <div key={r.k} className="em-api-row">
            <dt>{r.k}</dt>
            <dd title={String(r.v)}>{r.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function IdentityPicker({ value, onChange, identities, placeholder = 'Select identity' }) {
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return identities;
    return identities.filter(h => (
      h.name.toLowerCase().includes(q)
      || (h.email || '').toLowerCase().includes(q)
      || (h.department || '').toLowerCase().includes(q)
    ));
  }, [identities, query]);

  const visible = expanded ? filtered : filtered.slice(0, VISIBLE_IDENTITIES);
  const hiddenCount = Math.max(0, filtered.length - VISIBLE_IDENTITIES);
  const selected = identities.find(h => h.id === value);

  return (
    <div className={`dc-scope-select em-identity-switch${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="dc-scope-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setOpen(v => !v);
          setExpanded(false);
        }}
      >
        <span className="dc-scope-trigger-k">Identity</span>
        <span className="dc-scope-trigger-v">
          {selected ? selected.name : placeholder}
        </span>
        <Icon name="chevronDown" size={13} color="var(--text-tertiary)" />
      </button>
      {open && (
        <div className="dc-scope-panel" role="listbox">
          <div className="dc-scope-panel-search">
            <Icon name="search" size={13} color="var(--text-tertiary)" />
            <input
              autoFocus
              placeholder="Search identities…"
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setExpanded(false);
              }}
            />
          </div>
          <div className="dc-scope-panel-list">
            {visible.map(h => (
              <button
                key={h.id}
                type="button"
                className={`dc-scope-option${value === h.id ? ' is-selected' : ''}`}
                onClick={() => {
                  onChange(h.id);
                  setOpen(false);
                  setQuery('');
                  setExpanded(false);
                }}
              >
                <span className="dc-scope-option-name">{h.name}</span>
                <span className="dc-scope-option-meta">
                  {h.type === 'service' ? 'NHI' : 'User'} · score {h.exposureScore}
                </span>
              </button>
            ))}
            {!expanded && hiddenCount > 0 && (
              <button
                type="button"
                className="em-picker-more"
                onClick={() => setExpanded(true)}
              >
                +{hiddenCount} more
              </button>
            )}
            {filtered.length === 0 && (
              <div className="dc-scope-empty">No identities match</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(row) {
  if (row.category) return row.category;
  if (row.isAttachment || row.mapRole === 'attachment') {
    return row.resourceKind === 'Attached to' ? 'Owner' : (row.resourceKind || 'Attachment');
  }
  if (row.resourceKind && row.resourceKind !== 'Resource') return row.resourceKind;
  if (row.type === 'service') return 'NHI';
  return 'User';
}

export default function ExposureIdentity() {
  const { identityId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [layoutMode, setLayoutMode] = useState('graph');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [activePathId, setActivePathId] = useState(null);
  const [maxHopLimit, setMaxHopLimit] = useState(null);
  const [page, setPage] = useState(1);

  const accounts = useMemo(() => listCloudAccounts(), []);
  const connectedClouds = useMemo(
    () => CLOUD_PROVIDERS.filter(c => accounts.some(a => a.provider === c)),
    [accounts],
  );

  const accountFromUrl = searchParams.get('account') || 'all';
  const cloudFromUrl = searchParams.get('cloud');
  const accountMeta = accounts.find(a => a.id === accountFromUrl);

  const cloud = useMemo(() => {
    if (cloudFromUrl && connectedClouds.includes(cloudFromUrl)) return cloudFromUrl;
    if (accountMeta) return accountMeta.provider;
    return connectedClouds[0] || 'AWS';
  }, [cloudFromUrl, accountMeta, connectedClouds]);

  const accountKey = useMemo(() => {
    if (accountFromUrl === 'all') return 'all';
    if (accountMeta && accountMeta.provider === cloud) return accountFromUrl;
    return 'all';
  }, [accountFromUrl, accountMeta, cloud]);

  const cloudAccounts = useMemo(
    () => accounts.filter(a => a.provider === cloud),
    [accounts, cloud],
  );

  const scope = useMemo(() => ({ cloud, accountKey }), [cloud, accountKey]);

  // Keep URL on a concrete cloud (never "all resources")
  useEffect(() => {
    if (!connectedClouds.length) return;
    const params = new URLSearchParams(searchParams);
    let dirty = false;
    if (params.get('cloud') !== cloud) {
      params.set('cloud', cloud);
      dirty = true;
    }
    if (accountFromUrl !== 'all' && accountKey === 'all') {
      params.delete('account');
      dirty = true;
    }
    if (dirty) setSearchParams(params, { replace: true });
  }, [cloud, accountKey, accountFromUrl, connectedClouds, searchParams, setSearchParams]);

  const inventory = useMemo(
    () => fetchCloudExposureInventory(scope),
    [scope],
  );

  const map = useMemo(
    () => fetchIdentityResourceMap(identityId, scope),
    [identityId, scope],
  );

  const tree = useMemo(
    () => buildResourceTraceTree(identityId, scope),
    [identityId, scope],
  );

  const radialModel = useMemo(
    () => buildResourceRadialModel(identityId, {
      ...scope,
      search,
      maxHopLimit,
    }),
    [identityId, scope, search, maxHopLimit],
  );

  useEffect(() => {
    setSelectedIds([]);
    setActivePathId(map?.paths[0]?.id || null);
    setSearch('');
    setMaxHopLimit(map?.maxHop ?? null);
  }, [identityId, cloud, accountKey, map?.maxHop, map?.paths]);

  const filteredTree = useMemo(() => {
    if (!tree) return null;
    const q = search.trim().toLowerCase();
    if (!q) return tree;

    function matchNode(n) {
      if (n.isForestRoot) {
        return {
          ...n,
          children: (n.children || []).map(matchNode).filter(Boolean),
        };
      }
      const selfHit = (
        n.name.toLowerCase().includes(q)
        || String(n.originator || '').toLowerCase().includes(q)
        || String(n.cloudProvider || '').toLowerCase().includes(q)
        || String(n.resourceKind || '').toLowerCase().includes(q)
        || String(n.sensitivity || '').toLowerCase().includes(q)
      );
      const kids = (n.children || []).map(matchNode).filter(Boolean);
      if (selfHit || kids.length) return { ...n, children: kids.length ? kids : n.children };
      return null;
    }

    return matchNode(tree) || { ...tree, children: [] };
  }, [tree, search]);

  const tableRows = useMemo(() => {
    const rows = flattenTree(filteredTree).filter(r => !r.isForestRoot && r.mapRole !== 'identity');
    if (maxHopLimit == null) return rows;
    return rows.filter(r => (
      r.isAttachment || r.mapRole === 'attachment' || (r.hopCount || 0) <= maxHopLimit
    ));
  }, [filteredTree, maxHopLimit]);

  useEffect(() => {
    setPage(1);
  }, [search, maxHopLimit, layoutMode, cloud, accountKey, identityId]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    tableRows,
    page,
    TABLE_PAGE_SIZE,
  );

  const allResources = useMemo(() => collectResources(tree), [tree]);
  const visibleResources = useMemo(() => {
    if (maxHopLimit == null) return allResources;
    return allResources.filter(r => (r.hopCount || 0) <= maxHopLimit);
  }, [allResources, maxHopLimit]);

  const totalMapExposure = useMemo(
    () => visibleResources.reduce((sum, r) => sum + (r.weight || 0), 0),
    [visibleResources],
  );

  const selectedResources = useMemo(
    () => visibleResources.filter(r => selectedIds.includes(r.id)),
    [visibleResources, selectedIds],
  );

  // Score selected resources; if none selected, show scoped total in view
  const exposureScore = selectedResources.length > 0
    ? selectedResources.reduce((sum, r) => sum + (r.weight || 0), 0)
    : totalMapExposure;
  const exposurePct = totalMapExposure > 0
    ? Math.round((exposureScore / Math.max(totalMapExposure, 1)) * 100)
    : 0;
  const exposureColor = riskColor(
    selectedResources.length > 0
      ? (exposurePct || 60)
      : Math.min(100, (totalMapExposure / Math.max(...inventory.map(i => i.exposureScore), 1)) * 100),
  );

  const activePath = useMemo(() => {
    if (!map?.paths?.length) return null;
    if (activePathId) {
      return map.paths.find(p => p.id === activePathId) || map.paths[0];
    }
    return map.paths[0];
  }, [map, activePathId]);

  const activeAccount = cloudAccounts.find(a => a.id === accountKey);

  function setCloud(next) {
    const params = new URLSearchParams(searchParams);
    params.set('cloud', next);
    // Drop account when switching cloud — pick all accounts in that cloud
    const keep = accounts.find(a => a.id === accountKey && a.provider === next);
    if (!keep) params.delete('account');
    setSearchParams(params, { replace: true });
  }

  function setAccount(next) {
    const params = new URLSearchParams(searchParams);
    params.set('cloud', cloud);
    if (!next || next === 'all') params.delete('account');
    else params.set('account', next);
    setSearchParams(params, { replace: true });
  }

  function navigateIdentity(id) {
    navigate(`/exposure-map/${id}${cloudQuery(cloud, accountKey)}`);
  }

  function toggleIds(ids, pathId) {
    if (!ids.length) return;
    setSelectedIds(prev => {
      const set = new Set(prev);
      const allOn = ids.every(id => set.has(id));
      if (allOn) ids.forEach(id => set.delete(id));
      else ids.forEach(id => set.add(id));
      return [...set];
    });
    if (pathId) setActivePathId(pathId);
  }

  function toggleNode(node) {
    if (!node) return;

    if (node.role === 'center' || node.mapRole === 'identity') {
      toggleIds(visibleResources.map(r => r.id), map?.paths?.[0]?.id);
      return;
    }

    if (node.role === 'hub') {
      const kids = node.children || [];
      toggleIds(kids.map(c => c.id), kids[0]?.pathIds?.[0]);
      return;
    }

    if (node.isAttachment || node.mapRole === 'attachment') {
      toggleIds([node.id], node.pathIds?.[0]);
      return;
    }

    if (node.isResource || node.mapRole === 'access') {
      toggleIds([node.id], node.pathIds?.[0]);
    }
  }

  const listHref = `/exposure-map${cloudQuery(cloud, accountKey)}`;

  if (!map || !tree) {
    return (
      <div className="page-content">
        <div className="page-header">
          <button
            type="button"
            className="em-back"
            onClick={() => navigate(listHref)}
          >
            ← Identities
          </button>
          <h1 className="page-title">Identity not found</h1>
          <p className="page-subtitle">
            No {cloud} resource map for this identity
            {activeAccount ? ` in ${activeAccount.label}` : ''}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-copy">
          <button type="button" className="em-back" onClick={() => navigate(listHref)}>
            ← Identities
          </button>
          <h1 className="page-title">{map.identity.name}</h1>
          <p className="page-subtitle">
            {map.identity.type === 'service'
              ? `NHI resource map on ${cloud}.`
              : `Human resource map on ${cloud}.`}
            {activeAccount ? ` Account ${activeAccount.shortLabel || activeAccount.label}.` : ''}
          </p>
        </div>
      </div>

      <div className="dc-filters" role="search">
        <label className={`dc-filters-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={15} color="var(--text-tertiary)" />
          <input
            placeholder="Search resource…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search resource map"
          />
          {search.trim() && (
            <button type="button" className="dc-filters-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </label>

        <IdentityPicker
          value={identityId}
          identities={inventory}
          onChange={navigateIdentity}
        />

        <div className="em-cloud-seg" role="group" aria-label="Cloud">
          {connectedClouds.map(c => (
            <button
              key={c}
              type="button"
              className={`em-cloud-btn${cloud === c ? ' is-active' : ''}`}
              onClick={() => setCloud(c)}
            >
              {c}
            </button>
          ))}
        </div>

        {cloudAccounts.length > 1 && (
          <label className="em-account-filter">
            <span className="em-account-filter-k">Account</span>
            <select
              value={accountKey}
              onChange={e => setAccount(e.target.value)}
              aria-label={`Filter ${cloud} account`}
            >
              <option value="all">All {cloud} accounts</option>
              {cloudAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.shortLabel || a.label}</option>
              ))}
            </select>
          </label>
        )}

        <div className="dc-filters-view" role="group" aria-label="View">
          <span className="dc-filters-view-k">View</span>
          <div className="dc-filters-view-seg">
            <button
              type="button"
              className={`dc-view-btn${layoutMode === 'graph' ? ' is-active' : ''}`}
              onClick={() => setLayoutMode('graph')}
            >
              Map
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

      <div className="em-identity-bar">
        <div className="em-identity-bar-main">
          <div className="em-identity-bar-title">
            <h2>{map.identity.name}</h2>
            <span className="em-cloud-pill">{cloud}</span>
          </div>
          <p className="em-identity-bar-sub">
            {selectedResources.length > 0
              ? `${selectedResources.length} selected · score from selection`
              : `${visibleResources.length} reachable on ${cloud}`}
            {selectedIds.length > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="em-clear-selection"
                  onClick={() => setSelectedIds([])}
                >
                  Clear selection
                </button>
              </>
            )}
          </p>
        </div>
        <div className="em-identity-bar-score">
          <span className="em-identity-bar-score-k">Exposure</span>
          <span className="em-identity-bar-score-v" style={{ color: exposureColor }}>
            {exposureScore}
          </span>
          <span className="em-bar-track em-bar-track--wide">
            <span
              className="em-bar-fill"
              style={{
                width: `${Math.max(exposurePct, exposureScore > 0 ? 4 : 0)}%`,
                background: exposureColor,
              }}
            />
          </span>
        </div>
      </div>

      {layoutMode === 'graph' ? (
        <div className="dc-graph-wrap rm-graph-wrap">
          {!radialModel || radialModel.itemCount === 0 ? (
            <div className="dc-graph-empty">
              No {cloud} resources for {map.identity.name}
              {activeAccount ? ` in ${activeAccount.label}` : ''}.
            </div>
          ) : (
            <ResourceMapGraph
              key={`${identityId}-${cloud}-${accountKey}`}
              model={radialModel}
              selectedIds={selectedIds}
              onSelect={toggleNode}
              maxHopLimit={maxHopLimit}
              onMaxHopLimitChange={setMaxHopLimit}
            />
          )}
        </div>
      ) : (
        <div className="table-wrapper ad-table-wrap dc-table-wrap">
          <table className="data-table ad-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Category</th>
                <th>Access</th>
                <th>Cloud</th>
                <th>Hops</th>
                <th>Sensitivity</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="ad-table-empty">No nodes match</td>
                </tr>
              )}
              {pageRows.map(row => (
                <tr
                  key={`${row.id}-${row.depth}-${row.parentId || 'root'}`}
                  className={selectedIds.includes(row.id) ? 'is-selected' : ''}
                  onClick={() => toggleNode(row)}
                >
                  <td>
                    <span title={row.nativeName || row.name}>{row.name}</span>
                  </td>
                  <td>{kindLabel(row)}</td>
                  <td>{row.accessLabel || row.mechanism || '—'}</td>
                  <td>
                    {row.cloudProvider
                      ? <span className="em-cloud-pill">{row.cloudProvider}</span>
                      : '—'}
                  </td>
                  <td>{row.isAttachment ? '—' : (row.hopCount ?? 0)}</td>
                  <td>{row.sensitivity || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={safePage}
            pageCount={pageCount}
            onPageChange={setPage}
            total={tableRows.length}
            noun="resources"
          />
        </div>
      )}

      {activePath && (
        <section className="em-section em-section--split">
          <div>
            <div className="em-section-head">
              <h3>Selected path</h3>
              <span>{activePath.accessType} · {activePath.lastConfirmed}</span>
            </div>
            <div className="em-selected-path">
              <div className="em-selected-path-top">
                <span className="em-cloud-pill">{activePath.cloudProvider}</span>
                <AccessBadge type={activePath.accessType} />
                <span className={`em-sens em-sens--${activePath.resourceSensitivity}`}>
                  {activePath.resourceSensitivity}
                </span>
              </div>
              <div className="em-selected-path-resource" title={activePath.resource}>
                {activePath.resource}
              </div>
              <ApiEvidence
                api={activePath.apiEvidence}
                cloud={activePath.cloudProvider}
                path={activePath}
              />
            </div>
          </div>
          {activePath.accessType === 'Shadow' && activePath.hopChain?.length > 0 && (
            <div>
              <div className="em-section-head">
                <h3>
                  {activePath.cloudProvider
                    ? `${activePath.cloudProvider} escalation path`
                    : 'Escalation path'}
                </h3>
                <span>{activePath.hopChain.length} hops</span>
              </div>
              <p className="em-section-note">{activePath.mechanism}</p>
              <HopChain steps={activePath.hopChain} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
