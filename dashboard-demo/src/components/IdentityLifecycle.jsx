import { useState } from 'react';
import { Icon, TypeChip, StatusChip } from './ui';
import { jmlEvents, orphanedAccounts, identities } from '../data/mockData';

export default function IdentityLifecycle() {
  const [eventFilter, setEventFilter] = useState('All');

  const filtered = jmlEvents.filter(e => eventFilter === 'All' || e.eventType === eventFilter);

  const jmlIcon = (event) => {
    if (event.eventType === 'joiner') return { cls: 'jml-joiner', icon: 'users' };
    if (event.eventType === 'mover') return { cls: 'jml-mover', icon: 'refresh' };
    if (event.status === 'success' || event.status === 'partial') return { cls: 'jml-leaver-success', icon: 'user' };
    return { cls: 'jml-leaver-failed', icon: 'alert' };
  };

  const statusText = {
    success: { label: 'Deprovisioned', color: 'var(--color-desirable)' },
    failed: { label: 'Deprovisioning failed', color: 'var(--color-hop)' },
    partial: { label: 'Partial deprovision', color: 'var(--color-undesirable)' },
  };

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity lifecycle</div>
        <div className="page-subtitle">Joiner, mover, and leaver events — deprovisioning sweep status and orphaned account detection</div>
      </div>

      {/* Orphaned accounts — always visible */}
      <div style={{ background: orphanedAccounts.length > 0 ? 'rgba(226,75,74,0.05)' : 'rgba(99,153,34,0.05)',
        border: `1px solid ${orphanedAccounts.length > 0 ? 'rgba(226,75,74,0.2)' : 'rgba(99,153,34,0.2)'}`,
        borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: orphanedAccounts.length > 0 ? 16 : 0 }}>
          <div className={`orphan-badge ${orphanedAccounts.length === 0 ? 'orphan-badge-zero' : ''}`} style={{ fontSize: 14, padding: '6px 14px' }}>
            <Icon name="alert" size={14} />
            {orphanedAccounts.length} orphaned {orphanedAccounts.length === 1 ? 'account' : 'accounts'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {orphanedAccounts.length === 0
              ? 'All leaver sweep operations completed successfully.'
              : 'Leaver sweep failed — live access remains after departure.'}
          </div>
        </div>
        {orphanedAccounts.length > 0 && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Type</th>
                  <th>Created by</th>
                  <th>Last active</th>
                  <th>Credential age</th>
                  <th>Owner</th>
                  <th>Apps</th>
                </tr>
              </thead>
              <tbody>
                {orphanedAccounts.map(acct => (
                  <tr key={acct.id} className="row-hop">
                    <td style={{ fontWeight: 600 }}>{acct.name}</td>
                    <td><TypeChip type={acct.type} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {identities.find(i => i.id === acct.createdBy)?.name || acct.createdBy}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{acct.lastActive}</td>
                    <td>
                      <span style={{ color: 'var(--color-hop)', fontWeight: 700 }}>{acct.credentialAge} days</span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-hop)', fontWeight: 600, fontSize: 12 }}>No owner</span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{acct.apps?.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Total JML events', value: jmlEvents.length, color: 'var(--text-primary)' },
          { label: 'Joiners', value: jmlEvents.filter(e => e.eventType === 'joiner').length, color: 'var(--color-desirable)' },
          { label: 'Movers', value: jmlEvents.filter(e => e.eventType === 'mover').length, color: 'var(--color-indirect)' },
          { label: 'Leavers', value: jmlEvents.filter(e => e.eventType === 'leaver').length, color: 'var(--text-secondary)' },
          { label: 'Failed deprovision', value: jmlEvents.filter(e => e.status === 'failed').length, color: 'var(--color-hop)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ flex: '1 1 100px' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Event filter */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        {['All', 'joiner', 'mover', 'leaver'].map(t => (
          <button key={t} className={`filter-chip ${eventFilter === t ? 'active' : ''}`} onClick={() => setEventFilter(t)}>
            {t === 'All' ? 'All events' : t.charAt(0).toUpperCase() + t.slice(1) + 's'}
          </button>
        ))}
      </div>

      {/* JML event feed */}
      <div className="card">
        <div className="section-title">JML event feed</div>
        <div style={{ marginTop: 4 }}>
          {filtered.map(event => {
            const { cls, icon } = jmlIcon(event);
            const status = statusText[event.status] || {};
            return (
              <div key={event.id} className="jml-event">
                <div className={`jml-icon ${cls}`}>
                  <Icon name={icon} size={15} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{event.identityName}</span>
                    <span className="fact-pill" style={{ textTransform: 'capitalize' }}>{event.eventType}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: status.color }}>{status.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    Triggered {event.triggeredAt}
                    {event.deprovisionedAt && ` · Deprovisioned ${event.deprovisionedAt}`}
                  </div>
                  {event.liveAccess > 0 && (
                    <div style={{ fontSize: 12, color: event.status === 'failed' ? 'var(--color-hop)' : 'var(--text-secondary)', fontWeight: event.status === 'failed' ? 600 : 400 }}>
                      {event.liveAccess} live access path{event.liveAccess !== 1 ? 's' : ''} remaining
                    </div>
                  )}
                  {event.orphanedAccounts?.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {event.orphanedAccounts.map(acct => (
                        <span key={acct} className="badge badge-hop" style={{ fontSize: 10 }}>{acct}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
