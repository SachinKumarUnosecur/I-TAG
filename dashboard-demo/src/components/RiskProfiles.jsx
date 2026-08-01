import { useState } from 'react';
import { Icon, TypeChip, SeverityBadge, AccessBadge, riskColor, bandColor, SlidePanel } from './ui';
import { riskProfiles, identities, accessPaths } from '../data/mockData';

const bandOrder = ['Catastrophic', 'Unacceptable', 'Undesirable', 'Acceptable', 'Desirable'];
const factorLabels = {
  exposure: 'Exposure',
  hopPresence: 'Hop presence',
  credentialHygiene: 'Credential hygiene',
  trustDecay: 'Trust decay',
  dormantPrivilege: 'Dormant privilege',
  ownershipStatus: 'Ownership status',
};

export default function RiskProfiles() {
  const [search, setSearch] = useState('');
  const [bandFilter, setBandFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [selected, setSelected] = useState(null);

  const sorted = riskProfiles.slice().sort((a, b) => b.score - a.score);
  const filtered = sorted.filter(r => {
    const identity = identities.find(i => i.id === r.identityId);
    const matchSearch = !search || r.name.includes(search);
    const matchBand = bandFilter === 'All' || r.band === bandFilter;
    const matchType = typeFilter === 'All' || identity?.type === typeFilter;
    return matchSearch && matchBand && matchType;
  });

  const selectedIdentity = selected && identities.find(i => i.id === selected.identityId);
  const selectedPaths = selected && accessPaths.filter(p => p.identityId === selected.identityId);

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity risk profiles</div>
        <div className="page-subtitle">Composite 0–100 score per identity from exposure, hop presence, credential hygiene, trust decay, dormant privilege, and ownership status</div>
      </div>

      {/* Band summary */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {bandOrder.map(band => {
          const count = riskProfiles.filter(r => r.band === band).length;
          return (
            <div key={band}
              onClick={() => setBandFilter(bandFilter === band ? 'All' : band)}
              style={{ background: 'var(--surface)', border: `0.5px solid ${bandFilter === band ? bandColor(band) : 'var(--border)'}`,
                borderRadius: 10, padding: '10px 14px', flex: '1 1 100px', cursor: 'pointer',
                background: bandFilter === band ? `color-mix(in srgb, ${bandColor(band)} 8%, white)` : 'var(--surface)' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: bandColor(band) }}>{count}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{band}</div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <div className="search-input">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input placeholder="Search identity..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['All', 'human', 'service'].map(t => (
          <button key={t}
            className={`filter-chip ${typeFilter === t ? 'active' : ''}`}
            onClick={() => setTypeFilter(t)}>
            {t === 'All' ? 'All types' : t}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Type</th>
              <th>Risk score</th>
              <th>Band</th>
              <th>Hop paths</th>
              <th>MFA</th>
              <th>Credential age (days)</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const identity = identities.find(i => i.id === r.identityId);
              const hasHop = accessPaths.some(p => p.identityId === r.identityId && p.accessType === 'Hop');
              return (
                <tr key={r.identityId}
                  className={r.band === 'Catastrophic' ? 'row-hop' : ''}
                  onClick={() => setSelected(r)}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{r.name}</div>
                    {identity?.department && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{identity.department}</div>}
                  </td>
                  <td><TypeChip type={r.type} /></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ flex: 1, height: 5, background: 'var(--surface-subtle)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                        <div style={{ height: '100%', width: `${r.score}%`, background: riskColor(r.score), borderRadius: 3 }} />
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: riskColor(r.score), width: 28 }}>{r.score}</span>
                    </div>
                  </td>
                  <td><SeverityBadge band={r.band} /></td>
                  <td>
                    {hasHop
                      ? <span style={{ color: 'var(--color-hop)', fontWeight: 700 }}>{accessPaths.filter(p => p.identityId === r.identityId && p.accessType === 'Hop').length}</span>
                      : <span style={{ color: 'var(--text-tertiary)' }}>0</span>}
                  </td>
                  <td>
                    {identity?.mfaEnabled
                      ? <Icon name="check" size={14} color="var(--color-desirable)" />
                      : <Icon name="x" size={14} color="var(--color-hop)" />}
                  </td>
                  <td>
                    <span style={{ color: identity?.credentialAge > 180 ? 'var(--color-hop)' : identity?.credentialAge > 90 ? 'var(--color-undesirable)' : 'var(--text-primary)', fontWeight: identity?.credentialAge > 180 ? 700 : 400 }}>
                      {identity?.credentialAge ?? '—'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: identity?.ownerName ? 'var(--text-secondary)' : 'var(--color-hop)', fontWeight: identity?.ownerName ? 400 : 600 }}>
                    {identity?.ownerName || 'No owner'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail panel */}
      {selected && selectedIdentity && (
        <SlidePanel
          title={selected.name}
          subtitle={`Risk score ${selected.score} · ${selected.band}`}
          onClose={() => setSelected(null)}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <TypeChip type={selected.type} />
              <SeverityBadge band={selected.band} />
            </div>
            {/* Score arc visual */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', background: 'var(--surface-subtle)', borderRadius: 10, marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <svg width={90} height={55}>
                  <path d="M 9 50 A 38 38 0 0 1 81 50" fill="none" stroke="var(--border)" strokeWidth="8" />
                  <path d="M 9 50 A 38 38 0 0 1 81 50" fill="none" stroke={riskColor(selected.score)} strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(selected.score / 100) * 119} 119`} />
                </svg>
                <div style={{ position: 'absolute', bottom: 0, width: '100%', textAlign: 'center', fontWeight: 800, fontSize: 18, color: riskColor(selected.score) }}>
                  {selected.score}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.band}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Composite risk band</div>
              </div>
            </div>
          </div>

          <div className="section-title">Score breakdown</div>
          {Object.entries(selected.factors).map(([key, val]) => {
            const norm = Math.min(val, 25);
            const pct = (norm / 25) * 100;
            return (
              <div key={key} className="factor-row">
                <div className="factor-name">{factorLabels[key]}</div>
                <div className="factor-bar">
                  <div className="factor-bar-fill" style={{ width: `${pct}%`, background: val > 15 ? 'var(--color-hop)' : val > 8 ? 'var(--color-undesirable)' : 'var(--color-acceptable)' }} />
                </div>
                <div className="factor-value">{Math.round(val)}</div>
              </div>
            );
          })}

          <div className="divider" />
          <div className="section-title">Access paths ({selectedPaths?.length || 0})</div>
          {selectedPaths?.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
              <div style={{ flex: 1, color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{p.resource}</div>
              <AccessBadge type={p.accessType} />
            </div>
          ))}

          <div className="divider" />
          <div className="info-row">
            <span className="info-row-label">MFA enabled</span>
            <span style={{ color: selectedIdentity.mfaEnabled ? 'var(--color-desirable)' : 'var(--color-hop)', fontWeight: 600 }}>
              {selectedIdentity.mfaEnabled ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Credential age</span>
            <span style={{ color: selectedIdentity.credentialAge > 180 ? 'var(--color-hop)' : 'var(--text-primary)', fontWeight: selectedIdentity.credentialAge > 180 ? 700 : 400 }}>
              {selectedIdentity.credentialAge} days
            </span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Owner of record</span>
            <span className="info-row-value" style={{ color: selectedIdentity.ownerName ? 'var(--text-primary)' : 'var(--color-hop)' }}>
              {selectedIdentity.ownerName || 'No owner assigned'}
            </span>
          </div>
        </SlidePanel>
      )}
    </div>
  );
}
