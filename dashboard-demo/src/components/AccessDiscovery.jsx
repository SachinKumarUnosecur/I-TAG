import { useEffect, useMemo, useState } from 'react';
import { Icon, SlidePanel, HopChain, TablePager, paginateRows, SeverityBadge } from './ui';
import { pathMatchesSource } from '../data/accessDiscoveryApi';
import { useAccessDiscovery } from '../hooks/useAccessDiscovery';
import { fetchAccessProfile } from '../api/accessApi';
import { toUiPath } from '../adapters/accessViewModel';

const ALL = 'All';
const FILTER_ATTENTION = 'needs-attention';
const FILTER_SHADOW = 'shadow-access';
const KIND_HUMAN = 'human';
const KIND_NHI = 'service';
const TABLE_PAGE_SIZE = 10;

/**
 * Delegator column = PRD Owner column (`docs/PRD-access-discovery.md` §6.3).
 * UI keeps the "Delegator" label for demo continuity; values come from ownership resolution.
 */

function IdentityKindBadge({ kind }) {
  const isNhi = kind === KIND_NHI || kind === 'service';
  return (
    <span className={`ad-kind-badge ${isNhi ? 'ad-kind-badge--nhi' : 'ad-kind-badge--hi'}`}>
      {isNhi ? 'Non-human identity' : 'Human identity'}
    </span>
  );
}

/** Risk Profile levels only — never a fused 0–100 bar. */
function RiskLevelCell({ risk }) {
  if (!risk || risk.kind === 'partially_evaluated' || risk.kind === 'unevaluated') {
    return <span className="ad-owner ad-owner--muted">Unevaluated</span>;
  }
  if (risk.kind === 'no_findings') {
    return <span className="ad-owner ad-owner--ok">No findings</span>;
  }
  const band = risk.label || '—';
  return (
    <div className={`ad-risk-level ad-risk-level--${risk.tone || 'muted'}`}>
      <SeverityBadge band={band} />
      {risk.factorsFiring > 0 && (
        <span className="ad-risk-factors">{risk.factorsFiring} factor{risk.factorsFiring === 1 ? '' : 's'}</span>
      )}
    </div>
  );
}

function OwnerCell({ ownerDisplay }) {
  const tone = ownerDisplay?.tone || 'muted';
  const text = ownerDisplay?.text || 'Unevaluated';
  return (
    <span className={`ad-owner ad-owner--${tone}`} title={text}>
      {text}
    </span>
  );
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
    return { label: raw, detail: 'Broad service wildcard', tone: 'high' };
  }
  if (/admin|owner|iam:|sts:AssumeRole|setIamPolicy|PassRole/i.test(raw)) {
    return { label: raw, detail: 'Privileged identity or control-plane action', tone: 'high' };
  }
  return { label: raw, detail: null, tone: 'default' };
}

function summarizePermissions(perms = []) {
  const items = perms.map(formatPermission);
  return {
    items,
    critical: items.filter(p => p.tone === 'critical').length,
    high: items.filter(p => p.tone === 'high').length,
    total: items.length,
  };
}

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
    return { kind: 'role', name: api.roleDefinitionName, id: null, grantsVia: api.scope || null };
  }
  if (api.role) {
    return {
      kind: 'role',
      name: String(api.role).split('/').pop(),
      id: api.role,
      grantsVia: api.resourceName || null,
    };
  }
  if (mechanism.startsWith('MEMBER_OF:') || path?.pathType === 'indirect') {
    return { kind: 'group', name: mechanism.replace(/^MEMBER_OF:/, '') || mechanism, id: null, grantsVia: null };
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
              {perm.tone !== 'default' && <span className="ad-perm-tone">{perm.tone}</span>}
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

function matchesFiltersDropdown(entry, filter, sources) {
  if (filter === ALL) return true;
  if (filter === FILTER_ATTENTION) return entry.needsAttention;
  if (filter === FILTER_SHADOW) return entry.hopPaths > 0;
  const source = sources.find(s => s.provider === filter);
  if (!source) return entry.app === filter || entry.paths.some(p => p.cloudProvider === filter);
  return entry.paths.some(p => pathMatchesSource(p, source));
}

export default function AccessDiscovery() {
  const { bundle, loading, error, reload, preferMock } = useAccessDiscovery();
  const [kindFilter, setKindFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [filtersDropdown, setFiltersDropdown] = useState(ALL);
  const [selected, setSelected] = useState(null);
  const [profilePaths, setProfilePaths] = useState(null);
  const [page, setPage] = useState(1);

  const identities = bundle?.identities || [];
  const summary = bundle?.summary || {
    totalIdentities: 0,
    humanCount: 0,
    nhiCount: 0,
    needAttention: 0,
    attentionFooter: 'Loading…',
    riskFindings: 0,
    riskFooter: 'Loading…',
    hopPathCount: 0,
    shadowPaths: 0,
    directPaths: 0,
    indirectPaths: 0,
    kindCounts: { [ALL]: 0, [KIND_HUMAN]: 0, [KIND_NHI]: 0 },
    systemCounts: {},
    connectedSources: 0,
    lastSync: null,
  };
  const dataSources = bundle?.dataSources || [];

  const systemOptions = useMemo(() => {
    const connected = dataSources.filter(s => s.status === 'connected');
    return {
      clouds: connected.filter(s => s.category === 'cloud').map(s => s.provider),
      systems: connected.filter(s => s.category !== 'cloud').map(s => s.provider),
    };
  }, [dataSources]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return identities.filter(entry => {
      const matchKind =
        kindFilter === ALL
        || (kindFilter === KIND_HUMAN && entry.kind === KIND_HUMAN)
        || (kindFilter === KIND_NHI && entry.kind === KIND_NHI);
      const matchSearch = !q
        || entry.identityName.toLowerCase().includes(q)
        || entry.paths.some(p =>
          (p.resource || '').toLowerCase().includes(q)
          || (p.mechanism || '').toLowerCase().includes(q))
        || (entry.originator || '').toLowerCase().includes(q)
        || (entry.ownerDisplay?.text || '').toLowerCase().includes(q);
      return matchKind && matchSearch && matchesFiltersDropdown(entry, filtersDropdown, dataSources);
    });
  }, [identities, kindFilter, search, filtersDropdown, dataSources]);

  useEffect(() => {
    setPage(1);
  }, [kindFilter, search, filtersDropdown]);

  useEffect(() => {
    let cancelled = false;
    if (!selected || preferMock || bundle?.source !== 'live') {
      setProfilePaths(null);
      return undefined;
    }
    (async () => {
      try {
        const profile = await fetchAccessProfile(selected.identityId);
        if (cancelled) return;
        const snapshotAt = bundle?.summary?.graphSnapshotAt;
        setProfilePaths(
          (profile.paths || []).map(path => toUiPath(path, {
            identityName: profile.name || selected.identityName,
            snapshotAt,
            ownership: selected.ownership,
          })),
        );
      } catch {
        if (!cancelled) setProfilePaths(null);
      }
    })();
    return () => { cancelled = true; };
  }, [selected, preferMock, bundle?.source, bundle?.summary?.graphSnapshotAt]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    filtered,
    page,
    TABLE_PAGE_SIZE,
  );

  const relatedPathsForSelected = useMemo(() => {
    if (!selected) return [];
    const fromProfile = profilePaths && profilePaths.length ? profilePaths : selected.paths;
    return [...(fromProfile || [])].sort((a, b) => {
      const score = (p) => (p.accessType === 'Shadow' ? 3 : p.accessType === 'Indirect' ? 1 : 0)
        + (p.shadowAdmin ? 4 : 0) + (p.hopCount || 0);
      return score(b) - score(a);
    });
  }, [selected, profilePaths]);

  const baselineIdentityCount = summary.kindCounts?.[ALL] ?? 0;
  const filtersDirty = Boolean(
    kindFilter !== ALL || search.trim() || filtersDropdown !== ALL,
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
            {bundle?.source === 'live' && summary.lastSync && (
              <> Graph snapshot {summary.lastSync}.</>
            )}
            {preferMock && <> Offline mock mode (`VITE_USE_MOCK=1`).</>}
          </p>
          {error && (
            <div className="ad-load-error" role="alert">
              <span>{error}</span>
              <button type="button" className="btn btn-ghost" onClick={reload}>Retry</button>
            </div>
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
              {loading
                ? 'Loading…'
                : `${summary.humanCount} Human · ${summary.nhiCount} Non-human in estate`}
            </span>
          }
        />
        <SummaryCard
          icon="alertTriangle"
          tone="red"
          value={loading ? '—' : String(summary.riskFindings ?? 0)}
          label="Identities with risk findings"
          footer={<span className="ad-pill ad-pill--info">{summary.riskFooter}</span>}
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
              Has shadow access paths ({summary.identitiesWithHop ?? summary.hopPathCount})
            </option>
            {(systemOptions.clouds.length > 0 || systemOptions.systems.length > 0) && (
              <>
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
              </>
            )}
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

      <div className="table-wrapper ad-table-wrap">
        <table className="data-table ad-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Access type</th>
              <th>Risk</th>
              <th>Hop paths</th>
              <th>Originator</th>
              <th>Delegator</th>
              <th>Last access updated</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="ad-table-empty">
                  {error ? 'Unable to load access discovery' : 'No identities match current filters'}
                </td>
              </tr>
            )}
            {pageRows.map(entry => (
              <tr
                key={entry.identityId}
                className={entry.hopPaths > 0 ? 'row-hop' : ''}
                onClick={() => setSelected(entry)}
              >
                <td>
                  <div className="ad-identity">
                    <div className="ad-identity-name">{entry.identityName}</div>
                    {entry.needsAttention && (
                      <div className="ad-identity-meta">
                        <span className="ad-identity-alert">Needs attention</span>
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <IdentityKindBadge kind={entry.kind} />
                </td>
                <td><RiskLevelCell risk={entry.risk} /></td>
                <td>
                  {entry.hopPaths > 0 ? (
                    <span className="ad-hop-pill">
                      <Icon name="gitBranch" size={11} />
                      {entry.hopPaths}
                    </span>
                  ) : (
                    <span className="ad-hop-zero">0</span>
                  )}
                </td>
                <td>
                  <span className="ad-actor" title={entry.originator}>{entry.originator}</span>
                </td>
                <td className="ad-td-delegator">
                  <OwnerCell ownerDisplay={entry.ownerDisplay} />
                </td>
                <td>
                  <span className="ad-updated">
                    <Icon name="clock" size={12} color="var(--text-tertiary)" />
                    {entry.lastUpdated}
                  </span>
                </td>
              </tr>
            ))}
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

      {selected && (() => {
        const path = selected.representative || selected.paths?.[0] || null;
        if (!path) return null;
        const accessType = path.accessType;
        const isDirect = accessType === 'Direct';
        const isIndirect = accessType === 'Indirect';
        const isShadow = accessType === 'Shadow' || (path.hopCount || 0) > 0;
        const inheritance = isIndirect ? getIndirectInheritance(path) : null;
        const directPolicy = isDirect ? getDirectPolicyLabel(path) : null;
        const chainText = (path.hopChain || [])
          .map((s, i) => `${i + 1}. ${s.from || '—'} → ${s.to || '—'} (${s.mechanism || 'n/a'})`)
          .join('\n');

        return (
          <SlidePanel
            size="wide"
            title={path.resource}
            subtitle={`${selected.identityName} · ${path.accessType} access`}
            onClose={() => setSelected(null)}
          >
            <div className="ad-detail">
              {path.shadowAdmin && (
                <div className="ad-detail-alert">
                  <div className="ad-detail-alert-title">
                    <Icon name="alert" size={14} color="var(--color-hop)" />
                    Shadow path reaches sensitive access
                  </div>
                  <p>
                    This identity gains sensitive access through a resource-mediated hop.
                    This access is often <strong>not visible in native IAM tools</strong>.
                  </p>
                </div>
              )}

              <div className="ad-detail-meta">
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Access type</span>
                  <span className={`ad-detail-meta-value ad-detail-meta-value--${(path.accessType || '').toLowerCase()}`}>
                    {path.accessType === 'Shadow' ? 'Shadow access' : `${path.accessType} access`}
                  </span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">App / provider</span>
                  <span className="ad-detail-meta-value">{path.cloudProvider}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Sensitivity</span>
                  <span className={`ad-detail-sens ad-detail-sens--${path.resourceSensitivity || 'medium'}`}>
                    {path.resourceSensitivity || '—'}
                  </span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Originator</span>
                  <span className="ad-detail-meta-value">{selected.originator}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Delegator (Owner)</span>
                  <span className="ad-detail-meta-value">
                    <OwnerCell ownerDisplay={selected.ownerDisplay} />
                  </span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Graph snapshot</span>
                  <span className="ad-detail-meta-value">{selected.lastUpdated}</span>
                </div>
                <div className="ad-detail-meta-item">
                  <span className="ad-detail-meta-label">Risk</span>
                  <span className="ad-detail-meta-value"><RiskLevelCell risk={selected.risk} /></span>
                </div>
              </div>

              {isDirect && (
                <>
                  <section className="ad-detail-section">
                    <div className="ad-detail-section-head">
                      <h3>Direct access</h3>
                    </div>
                    <div className="ad-inherit-card">
                      <div className="ad-inherit-kind">Attached policy / role</div>
                      <div className="ad-inherit-name">{directPolicy}</div>
                    </div>
                  </section>
                  <PermissionsBlock
                    title="Permissions"
                    subtitle="Terminal permission on this direct path."
                    perms={path.effectivePermissions}
                  />
                </>
              )}

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
                      <div className="ad-detail-mechanism ad-detail-mechanism--tight">{path.mechanism}</div>
                    </div>
                  </section>
                  <PermissionsBlock
                    title="Inherited permissions"
                    perms={path.effectivePermissions}
                  />
                </>
              )}

              {isShadow && !isDirect && !isIndirect && (
                <>
                  <section className="ad-detail-section">
                    <div className="ad-detail-section-head">
                      <h3 className="is-hop">Escalation path</h3>
                      <span className="ad-detail-section-count">
                        {(path.hopChain?.length || path.hopCount || 0)} hop{(path.hopChain?.length || path.hopCount || 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="ad-detail-mechanism">{path.mechanism}</div>
                    {path.hopChain?.length > 0 ? (
                      <HopChain steps={path.hopChain} />
                    ) : (
                      <p className="ad-detail-section-note">No hop steps recorded for this shadow path.</p>
                    )}
                  </section>
                  <PermissionsBlock
                    title="Permissions gained"
                    subtitle="Terminal permission reachable after the hop."
                    perms={path.effectivePermissions}
                  />
                </>
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
                        className={`ad-related-path${p.id === path.id ? ' is-active' : ''}`}
                        onClick={() => setSelected({
                          ...selected,
                          representative: p,
                        })}
                      >
                        <div className="ad-related-path-top">
                          <span className={`ad-related-path-type ad-related-path-type--${(p.accessType || '').toLowerCase()}`}>
                            {p.accessType === 'Shadow' ? 'Shadow access' : `${p.accessType} access`}
                          </span>
                          <span className="ad-related-path-resource">{p.resource}</span>
                        </div>
                        <div className="ad-related-path-meta">
                          {p.cloudProvider} · snapshot {p.lastConfirmed}
                          {p.shadowAdmin ? ' · sensitive hop' : ''}
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
                  onClick={() => downloadJson(`${selected.identityId || 'access-path'}.json`, {
                    identity: selected,
                    path,
                    related: relatedPathsForSelected,
                  })}
                >
                  <Icon name="download" size={12} /> Export as JSON
                </button>
                {path.hopChain?.length > 0 && (
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
