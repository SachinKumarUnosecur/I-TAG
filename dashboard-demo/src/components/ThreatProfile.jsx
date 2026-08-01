import { useState } from 'react';
import { Icon, SeverityBadge } from './ui';
import { ptraceFindingCounts, mitreFindings } from '../data/mockData';

const PTRACE_ORDER = ['P', 'T', 'R', 'A', 'C', 'E'];

const PTRACE_META = {
  P: { short: 'Probing (Reconnaissance & Discovery)', color: 'var(--uno-green-700)' },
  T: { short: 'Trust Exploitation', color: 'var(--uno-orange-500)' },
  R: { short: 'Rights Escalation', color: 'var(--uno-red-500)' },
  A: { short: 'Account Spoofing / Assumption', color: 'var(--uno-blue-500)' },
  C: { short: 'Concealment & Persistence', color: 'var(--uno-yellow-600)' },
  E: { short: 'Exfiltration & Lateral Movement', color: 'var(--uno-blue-700)' },
};

const PTRACE_COLOR = Object.fromEntries(
  Object.entries(PTRACE_META).map(([k, v]) => [k, v.color])
);

const bandColors = {
  Critical: { bg: 'rgba(226,75,74,0.12)', border: 'rgba(226,75,74,0.25)', text: 'var(--color-catastrophic)', letter: 'var(--color-catastrophic)' },
  High: { bg: 'rgba(216,90,48,0.1)', border: 'rgba(216,90,48,0.2)', text: 'var(--color-unacceptable)', letter: 'var(--color-unacceptable)' },
  Medium: { bg: 'rgba(250,199,117,0.12)', border: 'rgba(186,117,23,0.15)', text: '#B0720D', letter: '#CA7F06' },
  Low: { bg: 'rgba(99,153,34,0.06)', border: 'rgba(99,153,34,0.12)', text: 'var(--color-acceptable)', letter: 'var(--color-acceptable)' },
};

export default function ThreatProfile() {
  const [selectedPtrace, setSelectedPtrace] = useState(null);
  const [search, setSearch] = useState('');

  const filtered = mitreFindings.filter(f => {
    const matchPtrace = !selectedPtrace || f.ptraceCategory === selectedPtrace;
    const matchSearch = !search || f.name.toLowerCase().includes(search.toLowerCase())
      || f.technique.includes(search) || f.identityName.includes(search);
    return matchPtrace && matchSearch;
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity threat profile</div>
        <div className="page-subtitle">
          Findings mapped onto PTRACE — an identity-specific attack-chain model covering MITRE ATT&CK identity tactics
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: 'var(--shadow-xs)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PTRACE — select a stage to filter findings
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {PTRACE_ORDER.map(letter => {
            const data = ptraceFindingCounts[letter];
            const theme = bandColors[data.severity] || bandColors.Low;
            const color = PTRACE_COLOR[letter];
            const isActive = selectedPtrace === letter;
            return (
              <div key={letter}
                onClick={() => setSelectedPtrace(isActive ? null : letter)}
                style={{
                  display: 'flex', flexDirection: 'column', gap: 8,
                  padding: '14px 12px',
                  borderRadius: 10,
                  border: `1px solid ${isActive ? color : (data.count > 0 ? theme.border : 'var(--border)')}`,
                  background: isActive ? `color-mix(in srgb, ${color} 10%, white)` : (data.count > 0 ? theme.bg : 'var(--surface-subtle)'),
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  opacity: data.count === 0 ? 0.45 : 1,
                  borderLeft: `3px solid ${color}`,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '0.2px', lineHeight: 1.2 }}>
                    {PTRACE_META[letter].short}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: data.count > 0 ? theme.text : 'var(--text-tertiary)', lineHeight: 1, flexShrink: 0 }}>
                    {data.count}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-tertiary)', lineHeight: 1.35 }}>
                  {data.question}
                </div>
              </div>
            );
          })}
        </div>
        {selectedPtrace && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing findings for <strong>{ptraceFindingCounts[selectedPtrace].label}</strong> ({ptraceFindingCounts[selectedPtrace].count} total)
            <button className="btn btn-ghost" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }} onClick={() => setSelectedPtrace(null)}>Clear</button>
          </div>
        )}
      </div>

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
                <th>PTRACE</th>
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
                const color = PTRACE_COLOR[f.ptraceCategory] || theme.letter;
                return (
                  <tr key={f.id}>
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
                      <span style={{ fontWeight: 700, fontSize: 12, color }}>
                        {PTRACE_META[f.ptraceCategory]?.short || f.ptraceCategory}
                      </span>
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

      <div className="card" style={{ marginTop: 12 }}>
        <div className="section-title">PTRACE ↔ identity attack chain</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12, lineHeight: 1.45 }}>
          PTRACE asks where in the identity attack chain a threat sits — probing, trust abuse, rights growth, identity assumption, persistence, then reach and impact.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, fontSize: 12 }}>
          {PTRACE_ORDER.map(letter => {
            const data = ptraceFindingCounts[letter];
            return (
              <div key={letter} style={{
                padding: '10px 12px', background: 'var(--surface-subtle)', borderRadius: 8,
                borderLeft: `3px solid ${PTRACE_COLOR[letter]}`,
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4, color: PTRACE_COLOR[letter] }}>
                  {PTRACE_META[letter].short}
                </div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 11, lineHeight: 1.4 }}>{data.question}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
