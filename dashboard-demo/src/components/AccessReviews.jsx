import { useState } from 'react';
import { Icon, AccessBadge, SeverityBadge } from './ui';
import { reviewCampaigns, reviewItems } from '../data/mockData';

export default function AccessReviews() {
  const [items, setItems] = useState(reviewItems);
  const [selectedCampaign, setSelectedCampaign] = useState('camp-001');
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('All');

  const campaign = reviewCampaigns.find(c => c.id === selectedCampaign);

  const filtered = items.filter(i => {
    const matchCampaign = i.campaignId === selectedCampaign;
    const matchSearch = !search || i.identityName.includes(search) || i.resource?.includes(search);
    const matchDecision = decisionFilter === 'All' || i.decision === decisionFilter;
    return matchCampaign && matchSearch && matchDecision;
  });

  const approve = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, decision: 'approved' } : i));
  const revoke = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, decision: 'revoked' } : i));
  const escalate = (id) => setItems(prev => prev.map(i => i.id === id ? { ...i, decision: 'escalated' } : i));

  const pending = filtered.filter(i => i.decision === 'pending').length;
  const approved = filtered.filter(i => i.decision === 'approved').length;
  const revoked = filtered.filter(i => i.decision === 'revoked').length;
  const escaled = filtered.filter(i => i.decision === 'escalated').length;

  const decisionBadge = {
    approved: <span className="badge badge-desirable">Approved</span>,
    revoked: <span className="badge badge-hop">Revoked</span>,
    pending: <span className="badge" style={{ background: 'var(--surface-subtle)', color: 'var(--text-tertiary)' }}>Pending</span>,
    escalated: <span className="badge badge-undesirable">Escalated</span>,
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Access reviews</div>
        <div className="page-subtitle">Periodic attestation campaigns — review access with full context: access path, owner, and risk profile</div>
      </div>

      {/* Campaign cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
        {reviewCampaigns.map(c => (
          <div key={c.id}
            className="campaign-card"
            style={{ cursor: 'pointer', border: selectedCampaign === c.id ? '1px solid var(--color-desirable)' : '0.5px solid var(--border)' }}
            onClick={() => setSelectedCampaign(c.id)}>
            <div className="campaign-header">
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', marginBottom: 2 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Due {c.dueDate} · Reviewer: {c.reviewer}</div>
              </div>
              <span className={`badge ${c.status === 'in_progress' ? 'badge-acceptable' : 'badge'}`} style={{ flexShrink: 0, background: c.status === 'pending' ? 'var(--surface-subtle)' : undefined, color: c.status === 'pending' ? 'var(--text-tertiary)' : undefined }}>
                {c.status === 'in_progress' ? 'In progress' : 'Pending'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
              <span>{c.completionPct}% complete</span>
              <span>{c.totalItems} items</span>
            </div>
            <div className="campaign-progress-bar">
              <div className="campaign-progress-fill" style={{ width: `${c.completionPct}%` }} />
            </div>
            {c.status === 'in_progress' && (
              <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                <span style={{ color: 'var(--color-desirable)', fontWeight: 600 }}>{c.approvedItems} approved</span>
                <span style={{ color: 'var(--color-hop)', fontWeight: 600 }}>{c.revokedItems} revoked</span>
                <span style={{ color: 'var(--text-tertiary)' }}>{c.pendingItems} pending</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {[{ label: 'Pending', value: pending, color: 'var(--text-tertiary)' }, { label: 'Approved', value: approved, color: 'var(--color-desirable)' }, { label: 'Revoked', value: revoked, color: 'var(--color-hop)' }, { label: 'Escalated', value: escaled, color: 'var(--color-undesirable)' }].map(s => (
          <div key={s.label} className="card" style={{ flex: '1 1 80px' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-input">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input placeholder="Search identity or resource..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['All', 'pending', 'approved', 'revoked', 'escalated'].map(d => (
          <button key={d} className={`filter-chip ${decisionFilter === d ? 'active' : ''}`} onClick={() => setDecisionFilter(d)}>
            {d === 'All' ? 'All decisions' : d}
          </button>
        ))}
      </div>

      {/* Review queue */}
      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Resource / grant</th>
              <th>Access type</th>
              <th>Risk band</th>
              <th>Owner</th>
              <th>Decision</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(item => (
              <tr key={item.id} className={item.riskBand === 'Catastrophic' ? 'row-hop' : ''}>
                <td style={{ fontWeight: 500 }}>{item.identityName}</td>
                <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', maxWidth: 200, wordBreak: 'break-all' }}>
                  {item.resource}
                </td>
                <td><AccessBadge type={item.accessType} /></td>
                <td><SeverityBadge band={item.riskBand} /></td>
                <td style={{ fontSize: 12, color: item.owner ? 'var(--text-secondary)' : 'var(--color-hop)', fontWeight: item.owner ? 400 : 600 }}>
                  {item.owner || 'No owner'}
                </td>
                <td>{decisionBadge[item.decision] || null}</td>
                <td>
                  {item.decision === 'pending' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-success" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => approve(item.id)}>
                        <Icon name="check" size={11} /> Approve
                      </button>
                      <button className="btn btn-danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => revoke(item.id)}>
                        <Icon name="x" size={11} /> Revoke
                      </button>
                      <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => escalate(item.id)}>
                        Escalate
                      </button>
                    </div>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Decision recorded</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
        <button className="btn btn-ghost">
          <Icon name="download" size={13} /> Export report (SOC 2)
        </button>
        <button className="btn btn-ghost">
          <Icon name="download" size={13} /> Export report (ISO 27001)
        </button>
      </div>
    </div>
  );
}
