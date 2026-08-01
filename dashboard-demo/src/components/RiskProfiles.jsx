import { useEffect, useMemo, useState } from 'react';
import { Icon, TypeChip, SeverityBadge, riskColor, SlidePanel, TablePager, paginateRows } from './ui';
import {
  fetchIdentityIncidents,
  fetchIdentityRiskProfile,
  fetchRiskInventory,
  fetchRiskSummary,
} from '../data/riskProfileApi';

const TABLE_PAGE_SIZE = 10;
const INCIDENT_PAGE_SIZE = 6;

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function typeLabel(type) {
  if (type === 'service') return 'NHI';
  if (type === 'human') return 'Human';
  return type;
}

function IncidentList({ identityId, cloudOptions = [], statusOptions = [] }) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [cloudFilter, setCloudFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  const { items: filtered } = useMemo(
    () => fetchIdentityIncidents({
      identityId,
      cloud: cloudFilter,
      status: statusFilter,
      search,
    }),
    [identityId, cloudFilter, statusFilter, search],
  );

  const { rows, page: safePage, pageCount } = paginateRows(filtered, page, INCIDENT_PAGE_SIZE);

  const clouds = ['all', ...cloudOptions];
  const statuses = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'closed', label: 'Closed' },
    ...statusOptions
      .filter(s => s !== 'open' && s !== 'closed' && s !== 'investigating')
      .map(s => ({ id: s, label: s })),
  ];

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [search, statusFilter, cloudFilter, identityId]);

  return (
    <div className="rp-panel-incidents">
      <div className="rp-panel-toolbar">
        <label className={`rp-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search incidents…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search incidents"
          />
        </label>
        <div className="rp-status-seg" role="group" aria-label="Cloud">
          {clouds.map(c => (
            <button
              key={c}
              type="button"
              className={`rp-status-btn${cloudFilter === c ? ' is-active' : ''}`}
              onClick={() => setCloudFilter(c)}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <div className="rp-status-seg" role="group" aria-label="Status">
          {statuses.map(s => (
            <button
              key={s.id}
              type="button"
              className={`rp-status-btn${statusFilter === s.id ? ' is-active' : ''}`}
              onClick={() => setStatusFilter(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rp-panel-count">
        {filtered.length} incident{filtered.length === 1 ? '' : 's'}
      </div>

      <div className="rp-incident-list">
        {rows.length === 0 && (
          <div className="rp-incident-empty">No incidents for this filter.</div>
        )}
        {rows.map(inc => {
          const open = expandedId === inc.id;
          return (
            <article key={inc.id} className={`rp-incident rp-incident--${inc.status}${open ? ' is-open' : ''}`}>
              <div className="rp-incident-score" title="Impact × likelihood">
                <span>{inc.cellScore}</span>
                <small>score</small>
                {inc.cvss != null && <em>CVSS {inc.cvss}</em>}
              </div>
              <div className="rp-incident-body">
                <div className="rp-incident-title-row">
                  <h3 className="rp-incident-title">{inc.title}</h3>
                  <SeverityBadge band={inc.severity} />
                  {inc.cloudProvider && (
                    <span className="rp-cloud-pill">{inc.cloudProvider}</span>
                  )}
                </div>
                <p className="rp-incident-summary">{inc.summary}</p>
                <div className="rp-incident-meta">
                  <span className="rp-incident-status">{inc.status}</span>
                  {inc.technique && (
                    <a
                      className="rp-mitre-link"
                      href={inc.mitreUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {inc.technique}
                    </a>
                  )}
                  {inc.tactic && <span>{inc.tactic}</span>}
                  {inc.ptrace && (
                    <span>
                      PTRACE {inc.ptrace.key} · {inc.ptrace.short}
                    </span>
                  )}
                  <span>{formatWhen(inc.triggeredAt)}</span>
                </div>

                <button
                  type="button"
                  className="rp-incident-toggle"
                  onClick={() => setExpandedId(open ? null : inc.id)}
                  aria-expanded={open}
                >
                  {open ? 'Hide details' : 'Permissions · remediation · best practices'}
                </button>

                {open && (
                  <div className="rp-incident-detail">
                    {inc.methodName && (
                      <div className="rp-detail-block">
                        <div className="rp-detail-k">Method / API</div>
                        <code className="rp-detail-code">{inc.methodName}</code>
                      </div>
                    )}
                    {(inc.permissions || []).length > 0 && (
                      <div className="rp-detail-block">
                        <div className="rp-detail-k">Permissions</div>
                        <ul className="rp-detail-list rp-detail-list--mono">
                          {inc.permissions.map(p => <li key={p}>{p}</li>)}
                        </ul>
                      </div>
                    )}
                    {(inc.bestPractices || []).length > 0 && (
                      <div className="rp-detail-block">
                        <div className="rp-detail-k">Recommended best practices</div>
                        <ol className="rp-detail-list">
                          {inc.bestPractices.map((p, i) => <li key={i}>{p}</li>)}
                        </ol>
                      </div>
                    )}
                    {(inc.remediation || []).length > 0 && (
                      <div className="rp-detail-block">
                        <div className="rp-detail-k">Remediation steps</div>
                        <ol className="rp-detail-list">
                          {inc.remediation.map((p, i) => <li key={i}>{p}</li>)}
                        </ol>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={filtered.length}
        noun="incidents"
      />
    </div>
  );
}

export default function RiskProfiles() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [bandFilter, setBandFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);

  const summary = useMemo(() => fetchRiskSummary(), []);

  const inventory = useMemo(
    () => fetchRiskInventory({
      search,
      type: typeFilter,
      band: bandFilter,
      onlyWithIncidents: false,
    }),
    [search, typeFilter, bandFilter],
  );

  const rows = inventory.items;
  const { bands, types, clouds, statuses } = inventory.filters;

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(rows, page, TABLE_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, bandFilter]);

  const selected = selectedId ? fetchIdentityRiskProfile(selectedId) : null;

  return (
    <div className="page-content rp-page">
      <div className="page-header rp-page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Identity risk profiles</h1>
          <p className="page-subtitle">
            Same identity roster as Exposure and Access Reviews. Open a row to inspect mapped incidents.
          </p>
        </div>
      </div>

      <div className="rp-stats">
        <div className="rp-stat">
          <div className="rp-stat-value">{summary.identityCount}</div>
          <div className="rp-stat-label">Identities hit</div>
          <div className="rp-stat-meta">With observed incidents</div>
        </div>
        <div className="rp-stat">
          <div className="rp-stat-value">{summary.incidentCount}</div>
          <div className="rp-stat-label">Incidents</div>
          <div className="rp-stat-meta">MITRE-mapped events</div>
        </div>
        <div className="rp-stat">
          <div className="rp-stat-value rp-stat-value--hot">{summary.openCount}</div>
          <div className="rp-stat-label">Open</div>
          <div className="rp-stat-meta">Needs investigation</div>
        </div>
      </div>

      <div className="rp-toolbar" role="search">
        <label className={`rp-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity or department…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search identities"
          />
        </label>
        <div className="rp-status-seg" role="group" aria-label="Type">
          <button
            type="button"
            className={`rp-status-btn${typeFilter === 'all' ? ' is-active' : ''}`}
            onClick={() => setTypeFilter('all')}
          >
            All types
          </button>
          {types.map(t => (
            <button
              key={t}
              type="button"
              className={`rp-status-btn${typeFilter === t ? ' is-active' : ''}`}
              onClick={() => setTypeFilter(t)}
            >
              {typeLabel(t)}
            </button>
          ))}
        </div>
        <label className="rp-tactic-filter">
          <span>Band</span>
          <select
            value={bandFilter}
            onChange={e => setBandFilter(e.target.value)}
            aria-label="Filter by risk band"
          >
            <option value="all">All bands</option>
            {bands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
        <div className="rp-list-count">
          {rows.length} identit{rows.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      <div className="rp-table-shell">
        <div className="rp-table-scroll">
          <table className="data-table rp-table">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Type</th>
                <th>Risk score</th>
                <th>Band</th>
                <th>Incidents</th>
                <th>Open</th>
                <th>Clouds</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="rp-table-empty">No identities match</td>
                </tr>
              )}
              {pageRows.map(r => (
                <tr
                  key={r.identityId}
                  className={selectedId === r.identityId ? 'is-selected' : ''}
                  onClick={() => setSelectedId(r.identityId)}
                >
                  <td>
                    <div className="rp-id-name">{r.name}</div>
                    {r.department && (
                      <div className="rp-id-dept">{r.department}</div>
                    )}
                  </td>
                  <td><TypeChip type={r.type} /></td>
                  <td>
                    <div className="rp-score-cell">
                      <span className="rp-bar-track">
                        <span
                          className="rp-bar-fill"
                          style={{
                            width: `${Math.max(r.score, r.score > 0 ? 4 : 0)}%`,
                            background: riskColor(r.score),
                          }}
                        />
                      </span>
                      <span className="rp-score-num" style={{ color: riskColor(r.score) }}>
                        {r.score}
                      </span>
                    </div>
                  </td>
                  <td><SeverityBadge band={r.band} /></td>
                  <td className="tp-num">{r.incidentCount}</td>
                  <td className="tp-num">{r.openIncidentCount}</td>
                  <td>
                    <span className="rp-cloud-row">
                      {(r.clouds || []).length
                        ? r.clouds.map(c => <span key={c} className="rp-cloud-pill">{c}</span>)
                        : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={rows.length}
        noun="identities"
      />

      {selected && (
        <SlidePanel
          size="wide"
          title={selected.name}
          subtitle={`${selected.band} · ${selected.incidentCount} incident${selected.incidentCount === 1 ? '' : 's'}`}
          onClose={() => setSelectedId(null)}
        >
          <div className="rp-panel-head">
            <div className="rp-panel-head-row">
              <TypeChip type={selected.type} />
              <SeverityBadge band={selected.band} />
              {selected.department && (
                <span className="rp-panel-dept">{selected.department}</span>
              )}
            </div>
            <div className="rp-panel-score-row">
              <span className="rp-panel-score" style={{ color: riskColor(selected.score) }}>
                {selected.score}
              </span>
              <div className="rp-panel-score-meta">
                <div>Composite from incidents</div>
                <div>
                  {selected.incidentCount} incident{selected.incidentCount === 1 ? '' : 's'}
                  {selected.openIncidentCount > 0
                    ? ` · ${selected.openIncidentCount} open`
                    : ''}
                </div>
              </div>
            </div>
          </div>

          <div className="rp-panel-section-title">Incidents</div>
          <IncidentList
            identityId={selected.identityId}
            cloudOptions={clouds}
            statusOptions={statuses}
          />
        </SlidePanel>
      )}
    </div>
  );
}
