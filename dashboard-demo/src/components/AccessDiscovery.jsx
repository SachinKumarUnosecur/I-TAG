import { useState } from 'react';
import { Icon, AccessBadge, SeverityBadge, TypeChip, StatusChip, SlidePanel, HopChain } from './ui';
import { accessPaths, identities, shadowAdmins } from '../data/mockData';

const ALL = 'All';

export default function AccessDiscovery() {
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState(ALL);
  const [selected, setSelected] = useState(null);
  const [showShadowAdmins, setShowShadowAdmins] = useState(false);

  const filtered = accessPaths.filter(p => {
    const matchType = typeFilter === ALL || p.accessType === typeFilter;
    const matchSearch = !search || p.identityName.includes(search) || p.resource.includes(search) || p.mechanism.includes(search);
    const matchProvider = providerFilter === ALL || p.cloudProvider === providerFilter;
    return matchType && matchSearch && matchProvider;
  });

  const shadowCount = accessPaths.filter(p => p.accessType === 'Shadow').length;
  const shadowAdminCount = shadowAdmins.length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Access Discovery</div>
        <div className="page-subtitle">Every access path classified as Direct, Indirect, or Shadow — Shadow access is resource-mediated privilege escalation not visible in native IAM tools</div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[
          { label: 'Total paths', value: accessPaths.length, color: 'var(--text-primary)' },
          { label: 'Direct', value: accessPaths.filter(p => p.accessType === 'Direct').length, color: 'var(--color-direct)' },
          { label: 'Indirect', value: accessPaths.filter(p => p.accessType === 'Indirect').length, color: 'var(--color-indirect)' },
          { label: 'Shadow access', value: shadowCount, color: 'var(--color-hop)' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ flex: '1 1 90px', minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color, letterSpacing: -0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>{s.label}</div>
          </div>
        ))}

        {/* Shadow Admins — always prominently shown */}
        <div
          className="stat-card"
          style={{
            flex: '1 1 140px', cursor: 'pointer',
            background: showShadowAdmins ? 'rgba(226,75,74,0.05)' : 'var(--surface)',
            borderColor: showShadowAdmins ? 'rgba(226,75,74,0.25)' : 'var(--border)',
          }}
          onClick={() => setShowShadowAdmins(!showShadowAdmins)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-hop)', letterSpacing: -0.5 }}>{shadowAdminCount}</div>
            <div style={{ background: 'rgba(226,75,74,0.1)', color: 'var(--color-hop)', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shadow Admins</div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Identities with effective admin access via shadow paths</div>
          <div style={{ fontSize: 11, color: 'var(--color-hop)', marginTop: 4, fontWeight: 500 }}>{showShadowAdmins ? 'Hide details ↑' : 'View details →'}</div>
        </div>
      </div>

      {/* Shadow Admins panel — expanded on click */}
      {showShadowAdmins && (
        <div style={{
          marginBottom: 16, padding: 0,
          background: 'var(--surface)', border: '1px solid rgba(226,75,74,0.2)',
          borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            padding: '12px 18px', background: 'rgba(226,75,74,0.05)',
            borderBottom: '1px solid rgba(226,75,74,0.12)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 8, height: 8, background: 'var(--color-hop)', borderRadius: '50%' }} />
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-hop)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Shadow admins</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 4 }}>— identities with effective admin-level access gained through shadow paths. Not visible in native IAM tools (AWS IAM Analyzer, GCP Policy Analyzer, Azure PIM).</div>
          </div>
          {shadowAdmins.map((sa, i) => (
            <div key={sa.identityId} style={{
              padding: '16px 18px',
              borderBottom: i < shadowAdmins.length - 1 ? '1px solid rgba(226,75,74,0.08)' : 'none',
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16,
            }}>
              {/* Identity */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{sa.identityName}</div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(226,75,74,0.12)', color: 'var(--color-hop)', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shadow Admin</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 3 }}>{sa.department} · {sa.cloudProvider}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  Visible to native tools: <strong style={{ color: 'var(--color-hop)' }}>No</strong>
                </div>
              </div>
              {/* Effective admin role */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Effective admin role</div>
                <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-hop)', fontWeight: 600, marginBottom: 4 }}>{sa.adminRoleLabel}</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {sa.effectivePermissions.map(p => (
                    <span key={p} style={{ fontSize: 10, fontFamily: 'monospace', background: 'rgba(226,75,74,0.08)', color: 'var(--color-hop)', padding: '1px 5px', borderRadius: 3 }}>{p}</span>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Pivot: <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>{sa.pivotResource}</span></div>
              </div>
              {/* Path + risk note */}
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Shadow path</div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5, wordBreak: 'break-all' }}>
                  {sa.shadowPath.split(' → ').map((seg, idx, arr) => (
                    <span key={idx}>
                      {idx > 0 && <span style={{ color: 'var(--color-hop)', margin: '0 3px' }}>→</span>}
                      <span style={{ color: idx === arr.length - 1 ? 'var(--color-hop)' : 'var(--text-secondary)', fontWeight: idx === arr.length - 1 ? 700 : 400 }}>{seg}</span>
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>{sa.riskNote}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input placeholder="Search identity, resource, or mechanism..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {[ALL, 'Direct', 'Indirect', 'Shadow'].map(t => (
          <button key={t}
            className={`filter-chip ${typeFilter === t ? (t === ALL ? 'active' : `active-${t === 'Shadow' ? 'hop' : t.toLowerCase()}`) : ''}`}
            onClick={() => setTypeFilter(t)}>
            {t === ALL ? 'All types' : t}
          </button>
        ))}
        <select className="select-control" value={providerFilter} onChange={e => setProviderFilter(e.target.value)}>
          {[ALL, 'AWS', 'GCP', 'Azure'].map(p => <option key={p} value={p}>{p === ALL ? 'All providers' : p}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Resource</th>
              <th>Access type</th>
              <th>Shadow admin</th>
              <th>Pivot count</th>
              <th>Effective permissions</th>
              <th>Mechanism</th>
              <th>Provider</th>
              <th>Last confirmed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No access paths match current filters</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id}
                className={p.accessType === 'Shadow' ? 'row-hop' : ''}
                onClick={() => setSelected(p)}>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.identityName}</div>
                </td>
                <td style={{ maxWidth: 180 }}>
                  <div style={{ fontSize: 11.5, fontFamily: 'monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 165 }} title={p.resource}>{p.resource}</div>
                </td>
                <td><AccessBadge type={p.accessType} /></td>
                <td>
                  {p.shadowAdmin
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, background: 'rgba(226,75,74,0.1)', color: 'var(--color-hop)', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        <Icon name="alert" size={9} color="var(--color-hop)" /> Shadow Admin
                      </span>
                    : <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>}
                </td>
                <td>
                  <span style={{ color: p.hopCount > 0 ? 'var(--color-hop)' : 'var(--text-tertiary)', fontWeight: p.hopCount > 0 ? 700 : 400 }}>
                    {p.hopCount || '—'}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 200 }}>
                    {p.effectivePermissions.slice(0, 2).map(perm => (
                      <span key={perm} className="fact-pill" style={{ fontSize: 10 }}>{perm}</span>
                    ))}
                    {p.effectivePermissions.length > 2 && <span className="fact-pill" style={{ fontSize: 10 }}>+{p.effectivePermissions.length - 2}</span>}
                  </div>
                </td>
                <td style={{ maxWidth: 180 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 165, fontFamily: 'monospace' }} title={p.mechanism}>{p.mechanism.split(' →')[0]}{p.mechanism.includes('→') ? ' →…' : ''}</span>
                </td>
                <td>
                  <span className="fact-pill">{p.cloudProvider}</span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.lastConfirmed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && (
        <SlidePanel
          title={selected.resource}
          subtitle={`${selected.identityName} · ${selected.accessType} access`}
          onClose={() => setSelected(null)}>

          {/* Shadow Admin warning */}
          {selected.shadowAdmin && (
            <div style={{ padding: '10px 12px', background: 'rgba(226,75,74,0.06)', border: '1px solid rgba(226,75,74,0.2)', borderRadius: 8, marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <Icon name="alert" size={13} color="var(--color-hop)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-hop)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shadow admin confirmed</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                This identity gains effective admin-level access through a shadow path. This access is <strong>not visible in native IAM tools</strong> (AWS IAM Analyzer, GCP Policy Analyzer, Azure PIM).
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <AccessBadge type={selected.accessType} />
            <span className="fact-pill">{selected.cloudProvider}</span>
            <span className="fact-pill">{selected.resourceSensitivity} sensitivity</span>
          </div>
          <div className="divider" />
          <div className="section-title">Effective permissions</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {selected.effectivePermissions.map(p => <span key={p} className="fact-pill">{p}</span>)}
          </div>
          <div className="section-title">Mechanism</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace', marginBottom: 16, wordBreak: 'break-all' }}>{selected.mechanism}</div>
          {selected.hopChain && (
            <>
              <div className="divider" />
              <div className="section-title" style={{ color: 'var(--color-hop)', marginBottom: 12 }}>Shadow access chain</div>
              <HopChain steps={selected.hopChain} />
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost">
                  <Icon name="download" size={12} /> Export as JSON
                </button>
                <button className="btn btn-ghost">
                  Copy chain as text
                </button>
              </div>
            </>
          )}
          <div className="divider" />
          <div className="info-row">
            <span className="info-row-label">Last confirmed</span>
            <span className="info-row-value">{selected.lastConfirmed}</span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Blocked by boundary policy</span>
            <span className="info-row-value">{selected.blocked ? 'Yes' : 'No — live access'}</span>
          </div>
        </SlidePanel>
      )}
    </div>
  );
}
