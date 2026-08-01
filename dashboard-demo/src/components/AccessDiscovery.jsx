import { useMemo, useState } from 'react';
import { Icon, SlidePanel } from './ui';

const VIEW_STATES = ['Populated', 'Loading', 'Empty', 'Error'];

const IDENTITY_ROWS = [
  {
    id: 'jane.doe',
    name: 'jane.doe',
    initials: 'JD',
    avatar: '#3B5BDB',
    type: 'Human',
    risk: 91,
    hopPaths: 2,
    owner: 'sarah.chen',
    ownerTag: 'Departed',
    lastUpdated: '2 hours ago',
    needsAttention: true,
  },
  {
    id: 'svc-billing',
    name: 'svc-billing',
    initials: 'SB',
    avatar: '#7C3AED',
    type: 'Service',
    risk: 76,
    hopPaths: 1,
    owner: 'mike.torres',
    ownerTag: null,
    lastUpdated: '1 day ago',
    needsAttention: true,
    subtitle: 'Service account',
  },
  {
    id: 'agent-pipeline-ci',
    name: 'agent-pipeline-ci',
    initials: 'AI',
    avatar: '#0D9488',
    type: 'AI agent',
    risk: 70,
    hopPaths: 1,
    owner: null,
    ownerTag: 'Unassigned',
    lastUpdated: '3 days ago',
    needsAttention: true,
  },
  {
    id: 'mike.torres',
    name: 'mike.torres',
    initials: 'MT',
    avatar: '#EA580C',
    type: 'Human',
    risk: 42,
    hopPaths: 0,
    owner: 'mike.torres',
    ownerTag: null,
    lastUpdated: '1 week ago',
    needsAttention: false,
  },
  {
    id: 'priya.sharma',
    name: 'priya.sharma',
    initials: 'PS',
    avatar: '#2563EB',
    type: 'Human',
    risk: 38,
    hopPaths: 0,
    owner: 'priya.sharma',
    ownerTag: null,
    lastUpdated: '2 weeks ago',
    needsAttention: false,
  },
  {
    id: 'svc-monitoring',
    name: 'svc-monitoring',
    initials: 'SM',
    avatar: '#64748B',
    type: 'Service',
    risk: 18,
    hopPaths: 0,
    owner: 'mark.chen',
    ownerTag: null,
    lastUpdated: '3 weeks ago',
    needsAttention: false,
    subtitle: 'Service account',
  },
];

function riskMeta(score) {
  if (score >= 80) return { label: 'Critical', tone: 'critical' };
  if (score >= 60) return { label: 'High', tone: 'high' };
  if (score >= 40) return { label: 'Moderate', tone: 'moderate' };
  return { label: 'Low', tone: 'low' };
}

function SummaryCard({ icon, tone, value, label, footer }) {
  return (
    <div className="ir-summary-card">
      <div className={`ir-summary-icon ir-summary-icon--${tone}`}>
        <Icon name={icon} size={16} />
      </div>
      <div className="ir-summary-value">{value}</div>
      <div className="ir-summary-label">{label}</div>
      <div className="ir-summary-footer">{footer}</div>
    </div>
  );
}

function RiskCell({ score }) {
  const meta = riskMeta(score);
  return (
    <div className={`ir-risk ir-risk--${meta.tone}`}>
      <div className="ir-risk-text">
        <span className="ir-risk-score">{score}</span>
        <span className="ir-risk-label">{meta.label}</span>
      </div>
      <div className="ir-risk-track">
        <div className="ir-risk-fill" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

export default function AccessDiscovery() {
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [viewState, setViewState] = useState('Populated');
  const [selected, setSelected] = useState(null);

  const counts = useMemo(() => ({
    all: IDENTITY_ROWS.length,
    attention: IDENTITY_ROWS.filter(r => r.needsAttention).length,
    human: IDENTITY_ROWS.filter(r => r.type === 'Human').length,
    service: IDENTITY_ROWS.filter(r => r.type === 'Service').length,
    agent: IDENTITY_ROWS.filter(r => r.type === 'AI agent').length,
  }), []);

  const tabs = [
    { id: 'all', label: `All (${counts.all})` },
    { id: 'attention', label: `Needs attention (${counts.attention})` },
    { id: 'human', label: `Human (${counts.human})` },
    { id: 'service', label: `Service (${counts.service})` },
    { id: 'agent', label: `AI agent (${counts.agent})` },
  ];

  const filtered = useMemo(() => {
    return IDENTITY_ROWS.filter(row => {
      const matchTab =
        tab === 'all' ||
        (tab === 'attention' && row.needsAttention) ||
        (tab === 'human' && row.type === 'Human') ||
        (tab === 'service' && row.type === 'Service') ||
        (tab === 'agent' && row.type === 'AI agent');
      const q = search.trim().toLowerCase();
      const matchSearch = !q || row.name.includes(q) || (row.owner || '').includes(q);
      return matchTab && matchSearch;
    });
  }, [tab, search]);

  const avgRisk = (
    IDENTITY_ROWS.reduce((sum, r) => sum + r.risk, 0) / IDENTITY_ROWS.length
  ).toFixed(1);
  const hopTotal = IDENTITY_ROWS.reduce((sum, r) => sum + r.hopPaths, 0);

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title">Identity risk</div>
          <div className="page-subtitle">
            Composite risk scores across every identity, weighted by exposure, hop-access presence, credential hygiene, and ownership status.
          </div>
        </div>
        <div className="ir-page-actions">
          <button type="button" className="btn btn-ghost">
            <Icon name="download" size={13} />
            Export
          </button>
          <button type="button" className="btn btn-brand">
            <Icon name="plus" size={13} />
            Start review campaign
          </button>
        </div>
      </div>

      <div className="ir-summary-grid">
        <SummaryCard
          icon="user"
          tone="blue"
          value="4,812"
          label="Total identities"
          footer={<span className="ir-trend ir-trend--up">↑ 3.1% this month</span>}
        />
        <SummaryCard
          icon="alertTriangle"
          tone="red"
          value={String(counts.attention)}
          label="Need attention today"
          footer={<span className="ir-pill ir-pill--danger">Owner gap + active hop path</span>}
        />
        <SummaryCard
          icon="clock"
          tone="amber"
          value={avgRisk}
          label="Average risk score"
          footer={<span className="ir-trend ir-trend--down">↓ 4 pts vs last week</span>}
        />
        <SummaryCard
          icon="sparkles"
          tone="violet"
          value={String(hopTotal)}
          label="Hop-access paths found"
          footer={<span className="ir-pill ir-pill--danger">The differentiator metric</span>}
        />
      </div>

      <div className="ir-toolbar">
        <div className="ir-tabs">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              className={`ir-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ir-toolbar-right">
          <div className="search-input ir-filter-search">
            <Icon name="search" size={14} color="var(--text-tertiary)" />
            <input
              placeholder="Filter by name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button type="button" className="btn btn-ghost">
            <Icon name="filter" size={13} />
            Filters
          </button>
        </div>
      </div>

      <div className="ir-state-bar">
        {VIEW_STATES.map(state => (
          <button
            key={state}
            type="button"
            className={`ir-state-chip ${viewState === state ? 'active' : ''}`}
            onClick={() => setViewState(state)}
          >
            {state}
          </button>
        ))}
      </div>

      {viewState === 'Loading' && (
        <div className="ir-state-panel">
          <div className="ir-spinner" />
          <div className="ir-state-title">Loading identity risk…</div>
          <div className="ir-state-copy">Correlating exposure, hop paths, and ownership signals.</div>
        </div>
      )}

      {viewState === 'Empty' && (
        <div className="ir-state-panel">
          <div className="ir-state-icon">
            <Icon name="search" size={22} color="var(--text-tertiary)" />
          </div>
          <div className="ir-state-title">No identities match</div>
          <div className="ir-state-copy">Try clearing filters or expanding the selected identity type.</div>
        </div>
      )}

      {viewState === 'Error' && (
        <div className="ir-state-panel ir-state-panel--error">
          <div className="ir-state-icon ir-state-icon--error">
            <Icon name="alertTriangle" size={22} color="var(--color-hop)" />
          </div>
          <div className="ir-state-title">Couldn’t load identity risk</div>
          <div className="ir-state-copy">The risk scoring service returned an error. Retry when the scan finishes.</div>
          <button type="button" className="btn btn-ghost" onClick={() => setViewState('Populated')}>
            <Icon name="refresh" size={13} />
            Retry
          </button>
        </div>
      )}

      {viewState === 'Populated' && (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Type</th>
                <th>Risk score</th>
                <th>Hop paths</th>
                <th>Owner</th>
                <th>Last updated</th>
                <th aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--text-tertiary)' }}>
                    No identities match current filters
                  </td>
                </tr>
              )}
              {filtered.map(row => (
                <tr key={row.id} onClick={() => setSelected(row)}>
                  <td>
                    <div className="ir-identity">
                      <div className="ir-avatar" style={{ background: row.avatar }}>{row.initials}</div>
                      <div>
                        <div className="ir-identity-name">{row.name}</div>
                        {row.needsAttention ? (
                          <div className="ir-attention">• Needs attention</div>
                        ) : row.subtitle ? (
                          <div className="ir-identity-meta">{row.subtitle}</div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`ir-type ir-type--${row.type === 'AI agent' ? 'agent' : row.type.toLowerCase()}`}>
                      {row.type}
                    </span>
                  </td>
                  <td><RiskCell score={row.risk} /></td>
                  <td>
                    {row.hopPaths > 0 ? (
                      <span className="ir-hop-pill">
                        <Icon name="gitBranch" size={11} />
                        {row.hopPaths}
                      </span>
                    ) : (
                      <span className="ir-hop-zero">0</span>
                    )}
                  </td>
                  <td>
                    <div className="ir-owner">
                      {row.owner ? <span>{row.owner}</span> : null}
                      {row.ownerTag && (
                        <span className={`ir-owner-tag ir-owner-tag--${row.ownerTag.toLowerCase()}`}>
                          {row.ownerTag}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="ir-updated">
                      <Icon name="clock" size={12} color="var(--text-tertiary)" />
                      {row.lastUpdated}
                    </span>
                  </td>
                  <td>
                    <Icon name="chevronRight" size={14} color="var(--text-tertiary)" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <SlidePanel
          title={selected.name}
          subtitle={`${selected.type} · risk ${selected.risk}`}
          onClose={() => setSelected(null)}
        >
          {selected.needsAttention && (
            <div className="ir-panel-alert">
              <Icon name="alertTriangle" size={14} color="var(--color-hop)" />
              <div>
                <div className="ir-panel-alert-title">Needs attention</div>
                <div className="ir-panel-alert-copy">
                  Owner gap and/or active hop-access path elevates this identity’s composite risk.
                </div>
              </div>
            </div>
          )}
          <div className="section-title">Risk breakdown</div>
          <RiskCell score={selected.risk} />
          <div className="divider" />
          <div className="info-row">
            <span className="info-row-label">Hop-access paths</span>
            <span className="info-row-value">{selected.hopPaths}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Owner</span>
            <span className="info-row-value">
              {selected.owner || 'Unassigned'}
              {selected.ownerTag ? ` · ${selected.ownerTag}` : ''}
            </span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Last updated</span>
            <span className="info-row-value">{selected.lastUpdated}</span>
          </div>
          <div className="divider" />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-brand">
              <Icon name="plus" size={12} />
              Start review
            </button>
            <button type="button" className="btn btn-ghost">
              <Icon name="download" size={12} />
              Export
            </button>
          </div>
        </SlidePanel>
      )}
    </div>
  );
}
