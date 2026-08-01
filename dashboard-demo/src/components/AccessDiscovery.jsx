import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, SlidePanel, HopChain, TablePager, paginateRows } from './ui';
import { fetchAccessDiscoveryFromSources, pathMatchesSource } from '../data/accessDiscoveryApi';

const ALL = 'All';
const FILTER_ATTENTION = 'needs-attention';
const FILTER_SHADOW = 'shadow-access';
const KIND_HUMAN = 'human';
const KIND_NHI = 'service';
const DELEGATOR_VISIBLE = 5;
const TABLE_PAGE_SIZE = 10;

function hasOwnerGap(identity) {
  return Boolean(identity && (!identity.owner || identity.status === 'orphaned' || identity.status === 'departed'));
}

/** Path-level attention: shadow-admin escalation, or any path owned by an owner-gap identity. */
function pathNeedsAttention(path, identity) {
  return Boolean(path.shadowAdmin || hasOwnerGap(identity));
}

function isShadowAccessPath(path) {
  return path.accessType === 'Shadow' || (path.hopCount || 0) > 0;
}

function pathSeverity(path) {
  const typeScore = path.accessType === 'Shadow' ? 3 : path.accessType === 'Indirect' ? 1 : 0;
  return (path.shadowAdmin ? 4 : 0) + typeScore + (path.hopCount || 0);
}

/** One representative path per identity (highest severity among matches). */
function dedupePathsByIdentity(paths) {
  const bestByIdentity = new Map();
  paths.forEach(p => {
    const existing = bestByIdentity.get(p.identityId);
    if (!existing || pathSeverity(p) > pathSeverity(existing)) {
      bestByIdentity.set(p.identityId, p);
    } else if (existing && pathSeverity(p) === pathSeverity(existing)) {
      if (String(p.lastConfirmed) > String(existing.lastConfirmed)) {
        bestByIdentity.set(p.identityId, p);
      }
    }
  });
  return [...bestByIdentity.values()];
}

function riskMeta(score) {
  if (score >= 80) return { label: 'Critical', tone: 'critical' };
  if (score >= 60) return { label: 'High', tone: 'high' };
  if (score >= 40) return { label: 'Moderate', tone: 'moderate' };
  return { label: 'Low', tone: 'low' };
}

function IdentityKindBadge({ kind }) {
  const isNhi = kind === KIND_NHI || kind === 'service';
  return (
    <span className={`ad-kind-badge ${isNhi ? 'ad-kind-badge--nhi' : 'ad-kind-badge--hi'}`}>
      {isNhi ? 'Non-human identity' : 'Human identity'}
    </span>
  );
}

function RiskCell({ score }) {
  const value = Number.isFinite(score) ? Math.round(score) : 0;
  const meta = riskMeta(value);
  return (
    <div className={`ad-risk ad-risk--${meta.tone}`}>
      <div className="ad-risk-text">
        <span className="ad-risk-score">{value}</span>
        <span className="ad-risk-label">{meta.label}</span>
      </div>
      <div className="ad-risk-track">
        <div className="ad-risk-fill" style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

/**
 * Originator = who provisioned / created the identity (always present in mock data).
 * Delegator = for humans, themselves; for NHIs, human owner; else hop/indirect pivot.
 */
function pathActors(path, identity, identityById = {}) {
  const principal = (path.identityName || identity?.name || '').replace(/\s*\(departed\)\s*/i, '');
  const rawOriginator = path.originator
    || path.provisionedBy
    || identity?.originator
    || (identity?.createdBy && identityById[identity.createdBy]?.name)
    || 'No originator';
  const originatorNorm = String(rawOriginator).trim().toLowerCase();
  const originator = (
    !originatorNorm
    || originatorNorm === 'okta directory'
    || originatorNorm === 'okta.admin'
    || originatorNorm === 'unknown (pre-audit)'
    || originatorNorm === 'unknown (pre-integration)'
  ) ? 'No originator' : rawOriginator;

  if (identity?.type === 'human') {
    return { originator, delegator: identity.name || principal || originator };
  }

  if (identity?.type === 'service' && identity.owner) {
    const owner = identityById[identity.owner];
    return { originator, delegator: owner?.name || identity.ownerName || originator };
  }

  if (path.hopChain?.length) {
    return {
      originator,
      delegator: path.hopChain[0].to || identity?.ownerName || originator,
    };
  }

  if (path.accessType === 'Indirect' && path.mechanism) {
    const parts = path.mechanism.split(':');
    const delegator = parts.length > 1 ? parts.slice(1).join(':') : path.mechanism;
    return { originator, delegator };
  }

  return { originator, delegator: identity?.ownerName || originator };
}

/** Match a connected data source dynamically from provider metadata + path evidence. */
function matchesFiltersDropdown(path, identity, filter, sources) {
  if (filter === ALL) return true;
  if (filter === FILTER_ATTENTION) return pathNeedsAttention(path, identity);
  if (filter === FILTER_SHADOW) return isShadowAccessPath(path);
  const source = sources.find(s => s.provider === filter);
  if (!source) return path.cloudProvider === filter;
  return pathMatchesSource(path, source);
}

function formatPermission(perm) {
  const raw = String(perm || '');
  if (raw === '*') {
    return {
      label: 'Full administrative access (*)',
      detail: 'Wildcard grants every action on in-scope resources',
      tone: 'critical',
    };
  }
  if (/\*$/.test(raw) || /:\*$/.test(raw)) {
    return {
      label: raw,
      detail: 'Broad service wildcard',
      tone: 'high',
    };
  }
  if (/admin|owner|iam:|sts:AssumeRole|setIamPolicy|PassRole/i.test(raw)) {
    return {
      label: raw,
      detail: 'Privileged identity or control-plane action',
      tone: 'high',
    };
  }
  return { label: raw, detail: null, tone: 'default' };
}

function summarizePermissions(perms = []) {
  const items = perms.map(formatPermission);
  const critical = items.filter(p => p.tone === 'critical').length;
  const high = items.filter(p => p.tone === 'high').length;
  return { items, critical, high, total: items.length };
}

/** Group / role that grants indirect access. */
function getIndirectInheritance(path) {
  const api = path?.api || {};
  const mechanism = String(path?.mechanism || '');

  if (api.oktaGroupName) {
    return {
      kind: 'group',
      name: api.oktaGroupName,
      id: api.oktaGroupId || null,
      grantsVia: api.roleArn || api.role || api.roleDefinitionName || null,
    };
  }
  if (api.roleDefinitionName) {
    return {
      kind: 'role',
      name: api.roleDefinitionName,
      id: null,
      grantsVia: api.scope || null,
    };
  }
  if (api.role) {
    return {
      kind: 'role',
      name: String(api.role).split('/').pop(),
      id: api.role,
      grantsVia: api.resourceName || null,
    };
  }
  if (api.roleArn) {
    return {
      kind: 'role',
      name: String(api.roleArn).split('/').pop(),
      id: api.roleArn,
      grantsVia: api.resourceArn || null,
    };
  }
  if (mechanism.startsWith('MEMBER_OF:')) {
    return { kind: 'group', name: mechanism.slice('MEMBER_OF:'.length), id: null, grantsVia: null };
  }
  if (mechanism.startsWith('ASSUMES_ROLE:')) {
    return { kind: 'role', name: mechanism.slice('ASSUMES_ROLE:'.length), id: null, grantsVia: null };
  }
  return { kind: 'group', name: mechanism || 'Inherited access', id: null, grantsVia: null };
}

function getDirectPolicyLabel(path) {
  const api = path?.api || {};
  if (api.policyArn) return String(api.policyArn).split('/').pop();
  if (api.roleDefinitionName) return api.roleDefinitionName;
  if (api.role) return String(api.role).split('/').pop();
  if (path?.mechanism && path.mechanism !== 'HAS_POLICY') return path.mechanism;
  return 'Attached policy';
}

function PermissionsBlock({ title, subtitle, perms }) {
  const permSummary = summarizePermissions(perms || []);
  return (
    <section className="ad-detail-section">
      <div className="ad-detail-section-head">
        <h3>{title}</h3>
        <span className="ad-detail-section-count">
          {permSummary.total} permission{permSummary.total === 1 ? '' : 's'}
          {permSummary.critical > 0 ? ` · ${permSummary.critical} critical` : ''}
          {permSummary.high > 0 ? ` · ${permSummary.high} high` : ''}
        </span>
      </div>
      {subtitle && <p className="ad-detail-section-note">{subtitle}</p>}
      <div className="ad-perm-list">
        {permSummary.items.map((perm, idx) => (
          <div key={`${perm.label}-${idx}`} className={`ad-perm-item ad-perm-item--${perm.tone}`}>
            <div className="ad-perm-item-main">
              <span className="ad-perm-label">{perm.label}</span>
              {perm.tone !== 'default' && (
                <span className="ad-perm-tone">{perm.tone}</span>
              )}
            </div>
            {perm.detail && <div className="ad-perm-detail">{perm.detail}</div>}
          </div>
        ))}
        {permSummary.total === 0 && (
          <div className="ad-perm-empty">No permissions recorded for this path</div>
        )}
      </div>
    </section>
  );
}

function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function SummaryCard({ icon, tone, value, label, footer, onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`ad-summary-card ad-summary-card--${tone}${active ? ' is-active' : ''}${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
    >
      <div className={`ad-summary-icon ad-summary-icon--${tone}`}>
        <Icon name={icon} size={15} />
      </div>
      <div className="ad-summary-body">
        <div className={`ad-summary-value${tone === 'red' ? ' is-alert' : ''}`}>{value}</div>
        <div className="ad-summary-label">{label}</div>
        {footer ? <div className="ad-summary-footer">{footer}</div> : null}
      </div>
    </Tag>
  );
}

/** Per-row NHI delegator picker: human identities only, 5 + more, searchable. */
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
  const selected = humans.find(h => h.id === value);
  const label = selected ? selected.name : placeholder;

  return (
    <div
      className={`ad-combobox ad-combobox--row${open ? ' is-open' : ''}${selected ? ' is-active' : ''}`}
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

export default function AccessDiscovery() {
  const [kindFilter, setKindFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [filtersDropdown, setFiltersDropdown] = useState(ALL);
  const [delegatorByIdentity, setDelegatorByIdentity] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchAccessDiscoveryFromSources();
        if (!cancelled) setBundle(data);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load access discovery from data sources');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const identities = bundle?.identities || [];
  const accessPaths = bundle?.accessPaths || [];
  const dataSources = bundle?.dataSources || [];
  const summary = bundle?.summary || {
    totalIdentities: 0,
    humanCount: 0,
    nhiCount: 0,
    needAttention: 0,
    attentionPathCount: 0,
    attentionFooter: 'Loading…',
    avgRisk: '0.0',
    riskDeltaPctWeek: 0,
    hopPathCount: 0,
    shadowPaths: 0,
    shadowAdminCount: 0,
    highPrivilegeCount: 0,
    directPaths: 0,
    indirectPaths: 0,
    kindCounts: { [ALL]: 0, [KIND_HUMAN]: 0, [KIND_NHI]: 0 },
    systemCounts: {},
    connectedSources: 0,
    lastSync: null,
  };

  const identityById = useMemo(
    () => Object.fromEntries(identities.map(i => [i.id, i])),
    [identities],
  );

  const systemOptions = useMemo(() => {
    const connected = dataSources.filter(s => s.status === 'connected');
    return {
      clouds: connected.filter(s => s.category === 'cloud').map(s => s.provider),
      systems: connected.filter(s => s.category !== 'cloud').map(s => s.provider),
    };
  }, [dataSources]);

  const hopPathCountByIdentity = useMemo(() => {
    const counts = {};
    accessPaths.forEach(p => {
      if (isShadowAccessPath(p)) {
        counts[p.identityId] = (counts[p.identityId] || 0) + 1;
      }
    });
    return counts;
  }, [accessPaths]);

  const humanDelegators = useMemo(
    () => identities
      .filter(i => i.type === 'human')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name)),
    [identities],
  );

  const filtered = useMemo(() => {
    const matchingPaths = accessPaths.filter(p => {
      const identity = identityById[p.identityId];
      const { originator, delegator } = pathActors(p, identity, identityById);

      const matchKind =
        kindFilter === ALL
        || (kindFilter === KIND_HUMAN && identity?.type === 'human')
        || (kindFilter === KIND_NHI && identity?.type === 'service');
      const q = search.trim().toLowerCase();
      const matchSearch = !q
        || p.identityName.toLowerCase().includes(q)
        || p.resource.toLowerCase().includes(q)
        || p.mechanism.toLowerCase().includes(q)
        || originator.toLowerCase().includes(q)
        || delegator.toLowerCase().includes(q);
      const matchFilter = matchesFiltersDropdown(p, identity, filtersDropdown, dataSources);

      return matchKind && matchSearch && matchFilter;
    });

    // Identity-first view: never repeat the same user/service across paths
    return dedupePathsByIdentity(matchingPaths).sort((a, b) => {
      const scoreA = identityById[a.identityId]?.riskScore ?? 0;
      const scoreB = identityById[b.identityId]?.riskScore ?? 0;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const sevA = pathSeverity(a);
      const sevB = pathSeverity(b);
      if (sevB !== sevA) return sevB - sevA;
      return (b.hopCount || 0) - (a.hopCount || 0);
    });
  }, [
    accessPaths,
    identityById,
    kindFilter,
    search,
    filtersDropdown,
    dataSources,
  ]);

  useEffect(() => {
    setPage(1);
  }, [kindFilter, search, filtersDropdown]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    filtered,
    page,
    TABLE_PAGE_SIZE,
  );

  const relatedPathsForSelected = useMemo(() => {
    if (!selected) return [];
    return accessPaths
      .filter(p => p.identityId === selected.identityId)
      .sort((a, b) => pathSeverity(b) - pathSeverity(a));
  }, [selected, accessPaths]);

  const baselineIdentityCount = summary.kindCounts?.[ALL] ?? 0;
  const filtersDirty = Boolean(
    kindFilter !== ALL
    || search.trim()
    || filtersDropdown !== ALL,
  );

  const resetFilters = () => {
    setKindFilter(ALL);
    setSearch('');
    setFiltersDropdown(ALL);
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Access Discovery</h1>
          <p className="page-subtitle">
            Maps how an identity reaches access across direct, indirect, and hop paths, surfacing shadow privilege escalation that native IAM tools miss.
            {summary.connectedSources > 0 && (
              <> Ingested from {summary.connectedSources} connected data-source APIs.</>
            )}
          </p>
          {error && (
            <div className="ad-load-error" role="alert">{error}</div>
          )}
        </div>
      </div>

      <div className="ad-summary-grid">
        <SummaryCard
          icon="users"
          tone="blue"
          value={loading ? '—' : summary.totalIdentities.toLocaleString()}
          label="Total identities"
          footer={
            <span className="ad-pill ad-pill--info">
              {loading ? 'Loading…' : `${summary.humanCount} Human · ${summary.nhiCount} Non-human identities`}
            </span>
          }
        />
        <SummaryCard
          icon="alertTriangle"
          tone="red"
          value={loading ? '—' : `${summary.avgRisk}%`}
          label="Risk percentage"
          footer={
            <span
              className={
                summary.riskDeltaPctWeek < 0
                  ? 'ad-trend ad-trend--down'
                  : summary.riskDeltaPctWeek > 0
                    ? 'ad-trend ad-trend--up-pill'
                    : 'ad-trend ad-trend--flat'
              }
            >
              {loading
                ? '…'
                : summary.riskDeltaPctWeek < 0
                  ? `Reduced ${Math.abs(summary.riskDeltaPctWeek).toFixed(1)}% from last week`
                  : summary.riskDeltaPctWeek > 0
                    ? `Increased ${Math.abs(summary.riskDeltaPctWeek).toFixed(1)}% from last week`
                    : 'No change from last week'}
            </span>
          }
        />
        <SummaryCard
          icon="target"
          tone="amber"
          value={loading ? '—' : String(summary.needAttention)}
          label="Need attention today"
          footer={<span className="ad-pill ad-pill--amber">{summary.attentionFooter}</span>}
          onClick={loading ? undefined : () => setFiltersDropdown(v => (v === FILTER_ATTENTION ? ALL : FILTER_ATTENTION))}
          active={filtersDropdown === FILTER_ATTENTION}
        />
        <SummaryCard
          icon="gitBranch"
          tone="violet"
          value={loading ? '—' : String(summary.hopPathCount)}
          label="Access paths found"
          footer={
            <span className="ad-pill ad-pill--violet">
              Direct ({summary.directPaths}) · Indirect ({summary.indirectPaths}) · Shadow ({summary.shadowPaths}) access
            </span>
          }
          onClick={loading ? undefined : () => setFiltersDropdown(v => (v === FILTER_SHADOW ? ALL : FILTER_SHADOW))}
          active={filtersDropdown === FILTER_SHADOW}
        />
      </div>

      {/* Filters */}
      <div className="ad-filters">
        <div className="ad-filters-search">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity, resource, or mechanism..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="ad-filters-group" role="group" aria-label="Identity type">
          {[
            { id: ALL, label: `All (${summary.kindCounts?.[ALL] ?? 0})` },
            { id: KIND_HUMAN, label: `Human identities (${summary.kindCounts?.[KIND_HUMAN] ?? 0})` },
            { id: KIND_NHI, label: `Non-human identities (${summary.kindCounts?.[KIND_NHI] ?? 0})` },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={`ad-seg ${kindFilter === t.id ? 'is-active' : ''}`}
              onClick={() => setKindFilter(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="ad-filters-select ad-filters-select--wide">
          <select
            aria-label="Filters"
            value={filtersDropdown}
            onChange={e => setFiltersDropdown(e.target.value)}
          >
            <option value={ALL}>Filters</option>
            <option value={FILTER_ATTENTION}>
              Needs attention ({summary.needAttention})
            </option>
            <option value={FILTER_SHADOW}>
              Has shadow access paths ({summary.hopPathCount})
            </option>
            <optgroup label="Cloud">
              {systemOptions.clouds.map(p => (
                <option key={p} value={p}>
                  {p} ({summary.systemCounts[p] || 0})
                </option>
              ))}
            </optgroup>
            <optgroup label="Connectors">
              {systemOptions.systems.map(p => (
                <option key={p} value={p}>
                  {p} ({summary.systemCounts[p] || 0})
                </option>
              ))}
            </optgroup>
          </select>
          <Icon name="chevronDown" size={13} color="var(--text-tertiary)" />
        </div>

        {loading ? (
          <div className="ad-filters-count">…</div>
        ) : (
          <button
            type="button"
            className={`ad-filters-count${filtersDirty ? ' ad-filters-count--reset' : ''}`}
            onClick={resetFilters}
            aria-label="Reset filters"
            title="Reset filters"
            disabled={!filtersDirty}
          >
            {filtersDirty ? (
              <>
                Reset filters
                <span className="ad-filters-count-meta">{filtered.length} of {baselineIdentityCount}</span>
              </>
            ) : (
              `${baselineIdentityCount} identities`
            )}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-wrapper ad-table-wrap">
        <table className="data-table ad-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Access type</th>
              <th>Risk score</th>
              <th>Hop paths</th>
              <th>Originator</th>
              <th>Delegator</th>
              <th>Last access updated</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="ad-table-empty">No identities match current filters</td>
              </tr>
            )}
            {pageRows.map(p => {
              const identity = identityById[p.identityId];
              const identityPaths = accessPaths.filter(ap => ap.identityId === p.identityId);
              const needsAttention = identityPaths.some(ap => pathNeedsAttention(ap, identity));
              const riskScore = identity?.riskScore ?? 0;
              const hopPaths = hopPathCountByIdentity[p.identityId] || 0;
              const { originator } = pathActors(p, identity, identityById);
              const isNhi = identity?.type === 'service';
              const humanName = identity?.name || (p.identityName || '').replace(/\s*\(departed\)\s*/i, '');
              const selectedDelegatorId = delegatorByIdentity[p.identityId]
                || identity?.owner
                || null;
              return (
                <tr
                  key={p.identityId}
                  className={p.accessType === 'Shadow' ? 'row-hop' : ''}
                  onClick={() => setSelected(p)}
                >
                  <td>
                    <div className="ad-identity">
                      <div className="ad-identity-name">{p.identityName}</div>
                      {needsAttention && (
                        <div className="ad-identity-meta">
                          <span className="ad-identity-alert">Needs attention</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <IdentityKindBadge kind={isNhi ? KIND_NHI : KIND_HUMAN} />
                  </td>
                  <td><RiskCell score={riskScore} /></td>
                  <td>
                    {hopPaths > 0 ? (
                      <span className="ad-hop-pill">
                        <Icon name="gitBranch" size={11} />
                        {hopPaths}
                      </span>
                    ) : (
                      <span className="ad-hop-zero">0</span>
                    )}
                  </td>
                  <td>
                    <span className="ad-actor" title={originator}>{originator}</span>
                  </td>
                  <td className="ad-td-delegator">
                    {isNhi ? (
                      <DelegatorSelect
                        value={selectedDelegatorId}
                        humans={humanDelegators}
                        placeholder={identity?.ownerName || 'Select delegator'}
                        onChange={humanId => {
                          setDelegatorByIdentity(prev => ({ ...prev, [p.identityId]: humanId }));
                        }}
                      />
                    ) : (
                      <span className="ad-actor ad-actor--delegator" title={humanName}>{humanName}</span>
                    )}
                  </td>
                  <td>
                    <span className="ad-updated">
                      <Icon name="clock" size={12} color="var(--text-tertiary)" />
                      {p.lastConfirmed}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <TablePager
        page={safePage}
        pageCount={pageCount}
        onPageChange={setPage}
        total={filtered.length}
        noun="identities"
      />

      {/* Detail panel */}
      {selected && (() => {
        const selectedIdentity = identityById[selected.identityId];
        const { originator, delegator } = pathActors(selected, selectedIdentity, identityById);
        const accessType = selected.accessType;
        const isDirect = accessType === 'Direct';
        const isIndirect = accessType === 'Indirect';
        const isShadow = accessType === 'Shadow' || (selected.hopCount || 0) > 0;
        const inheritance = isIndirect ? getIndirectInheritance(selected) : null;
        const directPolicy = isDirect ? getDirectPolicyLabel(selected) : null;
        const resolvedDelegator = delegatorByIdentity[selected.identityId]
          ? (identityById[delegatorByIdentity[selected.identityId]]?.name || delegator)
          : delegator;
        const chainText = (selected.hopChain || [])
          .map((s, i) => `${i + 1}. ${s.from || '—'} → ${s.to || '—'} (${s.mechanism || 'n/a'})`)
          .join('\n');

        return (
          <SlidePanel
            size="wide"
            title={selected.resource}
            subtitle={`${selected.identityName} · ${selected.accessType} access`}
            onClose={() => setSelected(null)}
          >
            <div className="ad-detail">
              {selected.shadowAdmin && (
                <div className="ad-detail-alert">
                  <div className="ad-detail-alert-title">
                    <Icon name="alert" size={14} color="var(--color-hop)" />
                    Shadow admin confirmed
                  </div>
                  <p>
                    This identity gains effective admin-level access through a shadow path.
                    This access is <strong>not visible in native IAM tools</strong> (AWS IAM Analyzer, GCP Policy Analyzer, Azure PIM).
                  </p>
                </div>
              )}

              <div className="ad-detail-meta">
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Access type</span>
                  <span className={`ad-detail-meta-value ad-detail-meta-value--${(selected.accessType || '').toLowerCase()}`}>
                    {selected.accessType === 'Shadow' ? 'Shadow access' : `${selected.accessType} access`}
                  </span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Cloud</span>
                  <span className="ad-detail-meta-value">{selected.cloudProvider}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Sensitivity</span>
                  <span className={`ad-detail-sens ad-detail-sens--${selected.resourceSensitivity || 'medium'}`}>
                    {selected.resourceSensitivity || '—'}
                  </span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Identity</span>
                  <span className="ad-detail-meta-value">{selected.identityName}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Originator</span>
                  <span className="ad-detail-meta-value">{originator}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Delegator</span>
                  <span className="ad-detail-meta-value">{resolvedDelegator}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Last confirmed</span>
                  <span className="ad-detail-meta-value">{selected.lastConfirmed}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Boundary policy</span>
                  <span className={`ad-detail-meta-value${selected.blocked ? '' : ' is-live'}`}>
                    {selected.blocked ? 'Blocked' : 'Live access'}
                  </span>
                </div>
              </div>

              {/* Direct — attached permissions */}
              {isDirect && (
                <>
                  <section className="ad-detail-section">
                    <div className="ad-detail-section-head">
                      <h3>Direct access</h3>
                    </div>
                    <div className="ad-inherit-card">
                      <div className="ad-inherit-kind">Attached policy / role</div>
                      <div className="ad-inherit-name">{directPolicy}</div>
                      {selected.api?.policyArn && (
                        <div className="ad-inherit-via">{selected.api.policyArn}</div>
                      )}
                      {selected.api?.evaluatedVia && (
                        <div className="ad-inherit-via">Evaluated via {selected.api.evaluatedVia}</div>
                      )}
                    </div>
                  </section>
                  <PermissionsBlock
                    title="Permissions"
                    subtitle="Actions granted directly to this identity on the resource."
                    perms={selected.effectivePermissions}
                  />
                </>
              )}

              {/* Indirect — group / role inheritance + permissions */}
              {isIndirect && inheritance && (
                <>
                  <section className="ad-detail-section">
                    <div className="ad-detail-section-head">
                      <h3>Inherited from</h3>
                    </div>
                    <div className="ad-inherit-card">
                      <div className="ad-inherit-kind">
                        {inheritance.kind === 'group' ? 'Group membership' : 'Assumed role'}
                      </div>
                      <div className="ad-inherit-name">{inheritance.name}</div>
                      {inheritance.id && (
                        <div className="ad-inherit-via">{inheritance.id}</div>
                      )}
                      {inheritance.grantsVia && (
                        <div className="ad-inherit-via">Grants via {inheritance.grantsVia}</div>
                      )}
                      <div className="ad-detail-mechanism ad-detail-mechanism--tight">{selected.mechanism}</div>
                    </div>
                  </section>
                  <PermissionsBlock
                    title="Inherited permissions"
                    subtitle={`Permissions this identity receives through ${inheritance.kind === 'group' ? 'group' : 'role'} inheritance.`}
                    perms={selected.effectivePermissions}
                  />
                </>
              )}

              {/* Shadow — escalation path + permissions */}
              {isShadow && !isDirect && !isIndirect && (
                <>
                  <section className="ad-detail-section">
                    <div className="ad-detail-section-head">
                      <h3 className="is-hop">Escalation path</h3>
                      <span className="ad-detail-section-count">
                        {(selected.hopChain?.length || selected.hopCount || 0)} hop{(selected.hopChain?.length || selected.hopCount || 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="ad-detail-mechanism">{selected.mechanism}</div>
                    {selected.hopChain?.length > 0 ? (
                      <HopChain steps={selected.hopChain} />
                    ) : (
                      <p className="ad-detail-section-note">No hop steps recorded for this shadow path.</p>
                    )}
                  </section>
                  <PermissionsBlock
                    title="Permissions gained"
                    subtitle="Effective permissions reachable after completing the escalation path."
                    perms={selected.effectivePermissions}
                  />
                </>
              )}

              {/* Fallback if type is unexpected */}
              {!isDirect && !isIndirect && !isShadow && (
                <PermissionsBlock
                  title="Effective permissions"
                  perms={selected.effectivePermissions}
                />
              )}

              {relatedPathsForSelected.length > 1 && (
                <section className="ad-detail-section">
                  <div className="ad-detail-section-head">
                    <h3>All access paths for this identity</h3>
                    <span className="ad-detail-section-count">{relatedPathsForSelected.length}</span>
                  </div>
                  <div className="ad-related-list">
                    {relatedPathsForSelected.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`ad-related-path${p.id === selected.id ? ' is-active' : ''}`}
                        onClick={() => setSelected(p)}
                      >
                        <div className="ad-related-path-top">
                          <span className={`ad-related-path-type ad-related-path-type--${(p.accessType || '').toLowerCase()}`}>
                            {p.accessType === 'Shadow' ? 'Shadow access' : `${p.accessType} access`}
                          </span>
                          <span className="ad-related-path-resource">{p.resource}</span>
                        </div>
                        <div className="ad-related-path-meta">
                          {p.cloudProvider} · updated {p.lastConfirmed}
                          {p.shadowAdmin ? ' · shadow admin' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <div className="ad-detail-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => downloadJson(`${selected.id || 'access-path'}.json`, selected)}
                >
                  <Icon name="download" size={12} /> Export as JSON
                </button>
                {selected.hopChain?.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => copyText(chainText)}
                  >
                    Copy chain as text
                  </button>
                )}
              </div>
            </div>
          </SlidePanel>
        );
      })()}
    </div>
  );
}
