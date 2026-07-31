import { useState } from 'react';
import { Icon, TypeChip, SeverityBadge, AccessBadge, riskColor } from './ui';
import { identities, accessPaths, riskProfiles } from '../data/mockData';

const sensitivityWeight = { critical: 100, high: 70, medium: 40, low: 15 };

function computeExposure(identityId) {
  const paths = accessPaths.filter(p => p.identityId === identityId && !p.blocked);
  const breakdown = paths.map(p => ({
    resource: p.resource,
    sensitivity: p.resourceSensitivity,
    accessType: p.accessType,
    weight: sensitivityWeight[p.resourceSensitivity] || 10,
  }));
  const total = breakdown.reduce((sum, b) => sum + b.weight, 0);
  return { total, breakdown };
}

export default function ExposureMap() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const identityExposures = identities.map(id => {
    const { total, breakdown } = computeExposure(id.id);
    const risk = riskProfiles.find(r => r.identityId === id.id);
    return { ...id, exposureScore: total, breakdown, riskBand: risk?.band };
  }).sort((a, b) => b.exposureScore - a.exposureScore);

  const filtered = identityExposures.filter(i =>
    !search || i.name.includes(search) || i.department?.includes(search)
  );

  const maxExposure = Math.max(...identityExposures.map(i => i.exposureScore), 1);

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity exposure map</div>
        <div className="page-subtitle">Aggregated blast radius per identity — weighted by resource sensitivity across all access paths</div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-hop)' }}>
            {identityExposures[0]?.exposureScore}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Highest exposure score</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{identityExposures[0]?.name}</div>
        </div>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-unacceptable)' }}>
            {identityExposures.filter(i => i.breakdown.some(b => b.sensitivity === 'critical')).length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Identities reaching critical resources</div>
        </div>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>
            {identityExposures.reduce((sum, i) => sum + i.breakdown.length, 0)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Total live access paths</div>
        </div>
      </div>

      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-input">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input placeholder="Search identity or department..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* Exposure bars */}
      <div className="card" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 20, fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <div style={{ flex: 2 }}>Identity</div>
          <div style={{ flex: 1 }}>Type</div>
          <div style={{ flex: 4 }}>Exposure</div>
          <div style={{ flex: 1 }}>Score</div>
          <div style={{ flex: 1 }}>Paths</div>
          <div style={{ flex: 1 }}>Band</div>
        </div>
        {filtered.map(id => {
          const pct = (id.exposureScore / maxExposure) * 100;
          const color = riskColor(id.exposureScore / maxExposure * 100);
          return (
            <div key={id.id}
              onClick={() => setSelected(id)}
              style={{ display: 'flex', gap: 20, padding: '12px 20px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer', background: selected?.id === id.id ? 'var(--surface-subtle)' : 'transparent' }}
              className="data-row">
              <div style={{ flex: 2 }}>
                <div style={{ fontWeight: 500, fontSize: 13 }}>{id.name}</div>
                {id.department && <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{id.department}</div>}
              </div>
              <div style={{ flex: 1 }}><TypeChip type={id.type} /></div>
              <div style={{ flex: 4 }}>
                <div style={{ height: 8, background: 'var(--surface-subtle)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.5s ease' }} />
                </div>
              </div>
              <div style={{ flex: 1, fontWeight: 700, color, fontSize: 14 }}>{id.exposureScore}</div>
              <div style={{ flex: 1, fontSize: 12, color: 'var(--text-tertiary)' }}>{id.breakdown.length}</div>
              <div style={{ flex: 1 }}>
                {id.riskBand ? <SeverityBadge band={id.riskBand} /> : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="card" style={{ marginTop: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
            <TypeChip type={selected.type} />
            {selected.riskBand && <SeverityBadge band={selected.riskBand} />}
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="section-title">Reachable resources — weighted breakdown</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {selected.breakdown.map((b, i) => {
              const sensColor = { critical: 'var(--color-hop)', high: 'var(--color-unacceptable)', medium: 'var(--color-undesirable)', low: 'var(--text-tertiary)' };
              return (
                <div key={i} style={{ padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 8, borderLeft: `3px solid ${sensColor[b.sensitivity] || 'var(--border)'}` }}>
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', marginBottom: 4, wordBreak: 'break-all' }}>{b.resource}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AccessBadge type={b.accessType} />
                    <span style={{ fontSize: 11, color: sensColor[b.sensitivity], fontWeight: 600 }}>{b.sensitivity}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>+{b.weight}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--surface-subtle)', borderRadius: 8, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total exposure score</span>
            <span style={{ fontWeight: 800, fontSize: 16, color: riskColor(selected.exposureScore / maxExposure * 100) }}>{selected.exposureScore}</span>
          </div>
        </div>
      )}
    </div>
  );
}
