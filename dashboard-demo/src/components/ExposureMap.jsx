import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Icon, TypeChip, SeverityBadge, riskColor, TablePager, paginateRows } from './ui';
import {
  CLOUD_PROVIDERS,
  fetchCloudExposureInventory,
  listCloudAccounts,
} from '../data/exposureApi';

const TABLE_PAGE_SIZE = 10;

function cloudQuery(cloud, accountKey) {
  const params = new URLSearchParams();
  if (cloud) params.set('cloud', cloud);
  if (accountKey && accountKey !== 'all') params.set('account', accountKey);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Identity Exposure Map — inventory list.
 * Scoped cloud-by-cloud (never "all clouds"); optional account within that cloud.
 */
export default function ExposureMap() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
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
    () => fetchCloudExposureInventory({ cloud, accountKey }),
    [cloud, accountKey],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(i => (
      i.name.toLowerCase().includes(q)
      || (i.department || '').toLowerCase().includes(q)
      || i.clouds.some(c => c.toLowerCase().includes(q))
      || (i.type === 'service' ? 'nhi' : 'user').includes(q)
      || String(i.highestResource || '').toLowerCase().includes(q)
    ));
  }, [inventory, search]);

  useEffect(() => {
    setPage(1);
  }, [search, cloud, accountKey]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    filtered,
    page,
    TABLE_PAGE_SIZE,
  );

  const stats = useMemo(() => ({
    top: inventory[0] || null,
    critical: inventory.filter(i => i.reachesCritical).length,
    paths: inventory.reduce((sum, i) => sum + i.pathCount, 0),
    identities: inventory.length,
  }), [inventory]);

  const activeAccount = cloudAccounts.find(a => a.id === accountKey);

  function setCloud(next) {
    const params = new URLSearchParams(searchParams);
    params.set('cloud', next);
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

  function openIdentity(id) {
    navigate(`/exposure-map/${id}${cloudQuery(cloud, accountKey)}`);
  }

  return (
    <div className="page-content em-page">
      <div className="page-header em-page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Identity exposure map</h1>
          <p className="page-subtitle">
            Blast radius on one cloud at a time. Open an identity —
            humans show what they can access; NHIs show attachments and reachability.
          </p>
        </div>
      </div>

      <div className="em-stats">
        <div className="em-stat">
          <div className="em-stat-value em-stat-value--hot">{stats.top?.exposureScore ?? '—'}</div>
          <div className="em-stat-label">Highest exposure</div>
          <div className="em-stat-meta">{stats.top?.name || '—'}</div>
        </div>
        <div className="em-stat">
          <div className="em-stat-value em-stat-value--warn">{stats.critical}</div>
          <div className="em-stat-label">Reaching critical resources</div>
          <div className="em-stat-meta">{stats.identities} identities on {cloud}</div>
        </div>
        <div className="em-stat">
          <div className="em-stat-value">{stats.paths}</div>
          <div className="em-stat-label">Live access paths</div>
          <div className="em-stat-meta">
            {activeAccount ? activeAccount.label : cloud}
          </div>
        </div>
      </div>

      <div className="em-toolbar" role="search">
        <label className={`em-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={15} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity, department, or resource…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search identity"
          />
          {search.trim() && (
            <button type="button" className="em-search-clear" onClick={() => setSearch('')}>
              Clear
            </button>
          )}
        </label>

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

        <div className="em-list-count">
          {filtered.length} identit{filtered.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      <div className="em-table-shell">
        <div className="em-table-scroll">
          <div className="em-table-head">
            <span className="em-col-id">Identity</span>
            <span className="em-col-type">Type</span>
            <span className="em-col-bar">Exposure</span>
            <span className="em-col-score">Score</span>
            <span className="em-col-paths">Paths</span>
            <span className="em-col-band">Band</span>
          </div>
          {filtered.length === 0 && (
            <div className="em-table-empty">
              No exposure on {cloud}
              {activeAccount ? ` / ${activeAccount.label}` : ''}.
            </div>
          )}
          {pageRows.map(row => {
            const pct = Math.max(0, Math.min(100, row.exposureScore));
            const color = riskColor(pct);
            return (
              <button
                key={row.id}
                type="button"
                className="em-table-row"
                onClick={() => openIdentity(row.id)}
              >
                <span className="em-col-id">
                  <span className="em-id-name">{row.name}</span>
                  {row.department && <span className="em-id-dept">{row.department}</span>}
                </span>
                <span className="em-col-type">
                  <TypeChip type={row.type} />
                </span>
                <span className="em-col-bar">
                  <span className="em-bar-track">
                    <span className="em-bar-fill" style={{ width: `${pct}%`, background: color }} />
                  </span>
                </span>
                <span className="em-col-score" style={{ color }}>{row.exposureScore}</span>
                <span className="em-col-paths">{row.pathCount}</span>
                <span className="em-col-band">
                  {row.riskBand ? <SeverityBadge band={row.riskBand} /> : '—'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={filtered.length}
        noun="identities"
      />
    </div>
  );
}
