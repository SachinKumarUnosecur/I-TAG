import { Fragment, useEffect, useMemo, useState } from 'react';
import { Icon, TablePager, paginateRows } from './ui';
import { jmlEvents, identities } from '../data/mockData';

const TABLE_PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { key: 'All', label: 'All statuses' },
  { key: 'success', label: 'Deprovisioned' },
  { key: 'failed', label: 'Not deprovisioned' },
  { key: 'partial', label: 'Partial deprovisioned' },
];

const STATUS_META = {
  success: { label: 'Deprovisioned', tone: 'ok' },
  failed: { label: 'Not deprovisioned', tone: 'hot' },
  partial: { label: 'Partial deprovisioned', tone: 'warn' },
};

const identityById = Object.fromEntries(identities.map(i => [i.id, i]));

function originatedByName(identity) {
  if (!identity) return 'No originator';
  if (identity.originator) return identity.originator;
  if (!identity.createdBy) return 'No originator';
  return identityById[identity.createdBy]?.name || 'No originator';
}

/** Leaver humans with nested NHIs — status/counts come from jmlEvents (derived). */
function buildLeaverRows() {
  return jmlEvents
    .filter(e => e.eventType === 'leaver')
    .map(event => {
      const human = identityById[event.identityId];
      const nhis = (event.linkedNhis || []).map(nhi => {
        const full = identityById[nhi.id];
        return {
          id: nhi.id,
          name: nhi.name,
          status: nhi.status,
          owner: nhi.owner,
          createdBy: nhi.createdBy,
          originatedBy: originatedByName(full),
          app: nhi.app || event.app,
          liveAccess: nhi.liveAccess,
          offboardStatus: nhi.offboardStatus,
        };
      });

      return {
        id: event.id,
        identityId: event.identityId,
        identityName: event.identityName,
        originatedBy: originatedByName(human),
        status: event.status,
        triggeredAt: event.triggeredAt,
        liveAccess: event.liveAccess,
        app: event.app,
        nhis,
        openNhiCount: nhis.filter(n => n.offboardStatus !== 'success').length,
      };
    });
}

export default function IdentityLifecycle() {
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const allRows = useMemo(() => buildLeaverRows(), []);

  const stats = useMemo(() => {
    const allNhis = allRows.flatMap(r => r.nhis);
    return {
      humans: allRows.length,
      nhis: allNhis.length,
      deprovisioned: allRows.filter(r => r.status === 'success').length
        + allNhis.filter(n => n.offboardStatus === 'success').length,
      notDeprovisioned: allRows.filter(r => r.status === 'failed').length
        + allNhis.filter(n => n.offboardStatus === 'failed').length,
      partial: allRows.filter(r => r.status === 'partial').length
        + allNhis.filter(n => n.offboardStatus === 'partial').length,
      orphaned: allNhis.filter(n => n.status === 'orphaned').length,
    };
  }, [allRows]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.identityName.toLowerCase().includes(q)
        || (r.originatedBy || '').toLowerCase().includes(q)
        || (r.app || '').toLowerCase().includes(q)
        || r.nhis.some(n => (
          n.name.toLowerCase().includes(q)
          || (n.originatedBy || '').toLowerCase().includes(q)
        ))
        || (STATUS_META[r.status]?.label || '').toLowerCase().includes(q)
      );
    });
  }, [allRows, statusFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, search]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    rows,
    page,
    TABLE_PAGE_SIZE,
  );

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="page-content lc-page">
      <div className="page-header lc-page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Identity lifecycle</h1>
          <p className="page-subtitle">
            Leaver offboarding for humans and the service accounts they created or own.
          </p>
        </div>
      </div>

      <div className="lc-stats">
        <div className="lc-stat">
          <div className="lc-stat-value">{stats.humans}</div>
          <div className="lc-stat-label">Leavers</div>
          <div className="lc-stat-meta">{stats.nhis} linked NHIs</div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-value lc-stat-value--ok">{stats.deprovisioned}</div>
          <div className="lc-stat-label">Deprovisioned</div>
          <div className="lc-stat-meta">Access removed</div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-value lc-stat-value--hot">{stats.notDeprovisioned}</div>
          <div className="lc-stat-label">Not deprovisioned</div>
          <div className="lc-stat-meta">Still live in cloud</div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-value lc-stat-value--warn">{stats.partial}</div>
          <div className="lc-stat-label">Partial deprovisioned</div>
          <div className="lc-stat-meta">Residual access left</div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-value lc-stat-value--hot">{stats.orphaned}</div>
          <div className="lc-stat-label">Orphaned NHIs</div>
          <div className="lc-stat-meta">No owner remaining</div>
        </div>
      </div>

      <div className="lc-toolbar" role="search">
        <label className={`lc-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search leaver, originator, or service account…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search offboarding"
          />
        </label>

        <div className="lc-status-seg" role="group" aria-label="Deprovisioning status">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              className={`lc-status-btn${statusFilter === f.key ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="lc-list-count">
          {rows.length} leaver{rows.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="lc-table-shell">
        <div className="lc-table-scroll">
          <table className="data-table lc-table lc-table--events">
            <thead>
              <tr>
                <th aria-hidden="true" className="lc-col-expand" />
                <th>Identity</th>
                <th>Originated by</th>
                <th>Service accounts</th>
                <th>Status</th>
                <th>Triggered</th>
                <th>Live access</th>
                <th>App</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="lc-table-empty">No leavers match</td>
                </tr>
              )}
              {pageRows.map(row => {
                const status = STATUS_META[row.status] || { label: row.status, tone: 'muted' };
                const open = expandedId === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={`lc-leaver-row${open ? ' is-open' : ''}`}
                      onClick={() => toggleExpand(row.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleExpand(row.id);
                        }
                      }}
                      tabIndex={0}
                      aria-expanded={open}
                    >
                      <td className="lc-col-expand">
                        <span className={`lc-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
                          <Icon name="chevronRight" size={14} />
                        </span>
                      </td>
                      <td>
                        <span className="lc-id-name" title={row.identityName}>{row.identityName}</span>
                      </td>
                      <td>
                        <span
                          className={row.originatedBy === 'No originator' ? 'lc-muted' : 'lc-originator'}
                          title={row.originatedBy}
                        >
                          {row.originatedBy}
                        </span>
                      </td>
                      <td>
                        <span className={`lc-nhi-chip${row.openNhiCount > 0 ? ' is-hot' : ''}`}>
                          {row.nhis.length}
                        </span>
                      </td>
                      <td>
                        <span className={`lc-status-pill lc-status-pill--${status.tone}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="lc-muted">{row.triggeredAt}</td>
                      <td className={row.liveAccess > 0 && row.status !== 'success' ? 'lc-hot' : 'lc-num'}>
                        {row.liveAccess}
                      </td>
                      <td className="lc-muted" title={row.app || undefined}>{row.app || '—'}</td>
                    </tr>
                    {open && (
                      <tr className="lc-nhi-dropdown-row">
                        <td colSpan={8}>
                          <div className="lc-nhi-dropdown" onClick={(e) => e.stopPropagation()}>
                            <div className="lc-nhi-dropdown-head">
                              <div className="lc-nhi-dropdown-title">
                                Service accounts for {row.identityName}
                              </div>
                              <div className="lc-nhi-dropdown-meta">
                                Created by or attached to this leaver
                              </div>
                            </div>
                            {row.nhis.length === 0 ? (
                              <div className="lc-nhi-empty">No linked service accounts</div>
                            ) : (
                              <div className="lc-nhi-grid-scroll">
                                <div className="lc-nhi-grid">
                                  <div className="lc-nhi-grid-head" aria-hidden="true">
                                    <span>Service account</span>
                                    <span>Originated by</span>
                                    <span>Status</span>
                                    <span>Live access</span>
                                    <span>App</span>
                                  </div>
                                  {row.nhis.map(nhi => {
                                    const nhiStatus = STATUS_META[nhi.offboardStatus]
                                      || { label: nhi.offboardStatus, tone: 'muted' };
                                    return (
                                      <div key={nhi.id} className="lc-nhi-grid-row">
                                        <span>
                                          <span className="lc-id-name" title={nhi.name}>{nhi.name}</span>
                                          {nhi.status === 'orphaned' && (
                                            <span className="lc-id-hint">Orphaned NHI</span>
                                          )}
                                        </span>
                                        <span className="lc-originator" title={nhi.originatedBy}>
                                          {nhi.originatedBy}
                                        </span>
                                        <span>
                                          <span className={`lc-status-pill lc-status-pill--${nhiStatus.tone}`}>
                                            {nhiStatus.label}
                                          </span>
                                        </span>
                                        <span className={nhi.liveAccess > 0 && nhi.offboardStatus !== 'success' ? 'lc-hot' : 'lc-num'}>
                                          {nhi.liveAccess}
                                        </span>
                                        <span className="lc-muted">{nhi.app || '—'}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={rows.length}
        noun="leavers"
      />
    </div>
  );
}
