import { useState } from 'react';
import { Icon, SeverityBadge } from './ui';
import { strideFindingCounts, mitreFindings } from '../data/mockData';

const strideOrder = ['S', 'T', 'R', 'I', 'D', 'E'];

const bandColors = {
  Catastrophic: { bg: 'rgba(226,75,74,0.12)', border: 'rgba(226,75,74,0.25)', text: 'var(--color-catastrophic)', letter: 'var(--color-catastrophic)' },
  Unacceptable: { bg: 'rgba(216,90,48,0.1)', border: 'rgba(216,90,48,0.2)', text: 'var(--color-unacceptable)', letter: 'var(--color-unacceptable)' },
  Undesirable: { bg: 'rgba(250,199,117,0.12)', border: 'rgba(186,117,23,0.15)', text: '#9a7200', letter: '#ba7517' },
  Desirable: { bg: 'rgba(99,153,34,0.06)', border: 'rgba(99,153,34,0.12)', text: 'var(--text-tertiary)', letter: 'var(--text-tertiary)' },
};

export default function ThreatProfile() {
  const [selectedStride, setSelectedStride] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = mitreFindings.filter(f => {
    const matchStride = !selectedStride || f.strideCategory === selectedStride;
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase())
      || f.technique.includes(search) || f.identityName.includes(search);
    return matchStride && matchSearch;
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity threat profile</div>
        <div className="page-subtitle">Findings mapped onto STRIDE categories and MITRE ATT&CK techniques — translate identity risk into your existing security playbooks</div>
      </div>

      {/* STRIDE grid */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>STRIDE — select a category to filter findings</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {strideOrder.map(letter => {
            const data = strideFindingCounts[letter];
            const theme = bandColors[data.severity] || bandColors.Desirable;
            const isActive = selectedStride === letter;
            return (
              <div key={letter}
                onClick={() => setSelectedStride(isActive ? null : letter)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${isActive ? theme.letter : (data.count > 0 ? theme.border : 'var(--border)')}`,
                  background: isActive ? theme.bg : (data.count > 0 ? theme.bg : 'var(--surface-subtle)'),
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  opacity: data.count === 0 ? 0.45 : 1,
                }}>
                <div style={{ fontSize: 26, fontWeight: 900, color: data.count > 0 ? theme.letter : 'var(--text-tertiary)', letterSpacing: -0.5, lineHeight: 1, width: 24, flexShrink: 0 }}>
                  {letter}
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: data.count > 0 ? theme.text : 'var(--text-tertiary)', lineHeight: 1, marginBottom: 2 }}>
                    {data.count}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {data.label.split(' ').slice(0, 2).join(' ')}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {selectedStride && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing findings for <strong>{strideFindingCounts[selectedStride].label}</strong> ({strideFindingCounts[selectedStride].count} total)
            <button className="btn btn-ghost" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }} onClick={() => setSelectedStride(null)}>Clear</button>
          </div>
        )}
      </div>

      {/* MITRE findings table */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div className="section-title" style={{ margin: 0 }}>MITRE ATT&CK findings</div>
          <div className="search-input" style={{ maxWidth: 240 }}>
            <Icon name="search" size={14} color="var(--text-tertiary)" />
            <input placeholder="Search technique or identity..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Technique</th>
                <th>Name</th>
                <th>Tactic</th>
                <th>STRIDE</th>
                <th>Identity</th>
                <th>Severity</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--text-tertiary)' }}>No findings match filters</td></tr>
              )}
              {filtered.map(f => {
                const theme = bandColors[f.severity] || {};
                return (
                  <tr key={f.id} className={f.severity === 'Catastrophic' ? 'row-hop' : ''}>
                    <td>
                      <a href={`https://attack.mitre.org/techniques/${f.technique.replace('.', '/')}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: 'monospace', fontSize: 12, color: '#6366f1', fontWeight: 600 }}>
                        {f.technique}
                      </a>
                    </td>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{f.name}</td>
                    <td><span className="fact-pill">{f.tactic}</span></td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: 14, color: theme.letter || 'var(--text-primary)' }}>
                        {f.strideCategory}
                      </span>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                        {strideFindingCounts[f.strideCategory]?.label}
                      </div>
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 500 }}>{f.identityName}</td>
                    <td><SeverityBadge band={f.severity} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 280 }}>{f.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* STRIDE → mapping legend */}
      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">STRIDE ↔ finding type mapping</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8, fontSize: 12 }}>
          {[
            { stride: 'E', label: 'Elevation of privilege', examples: 'Hop access, Workload Identity escalation' },
            { stride: 'R', label: 'Repudiation', examples: 'Orphaned accounts, departed owner' },
            { stride: 'I', label: 'Information disclosure', examples: 'Dormant privilege, PII exposure via Hop' },
            { stride: 'S', label: 'Spoofing', examples: 'Credential hygiene failures, stale keys' },
            { stride: 'T', label: 'Tampering', examples: 'Unauthorized policy or role modification' },
            { stride: 'D', label: 'Denial of service', examples: '(No active findings)' },
          ].map(m => (
            <div key={m.stride} style={{ padding: '8px 10px', background: 'var(--surface-subtle)', borderRadius: 6 }}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.stride} — {m.label}</div>
              <div style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{m.examples}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
