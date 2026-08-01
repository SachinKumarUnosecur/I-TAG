import { useState } from 'react';
import { Icon, AccessBadge, SeverityBadge } from './ui';
import { ownershipRecords, identities, accessPaths } from '../data/mockData';

export default function IdentityOwnership() {
  const [search, setSearch] = useState('');
  const [showOrphaned, setShowOrphaned] = useState(false);

  const enriched = ownershipRecords.map(r => {
    const identity = identities.find(i => i.id === r.identityId);
    const path = accessPaths.find(p => p.identityId === r.identityId);
    return { ...r, identity, accessType: path?.accessType };
  });

  const filtered = enriched.filter(r => {
    const matchSearch = !search || r.identityName?.includes(search) || r.resource?.includes(search) || r.owner?.includes(search);
    const matchOrphaned = !showOrphaned || r.orphaned;
    return matchSearch && matchOrphaned;
  });

  const orphanedCount = ownershipRecords.filter(r => r.orphaned).length;

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Identity ownership</div>
        <div className="page-subtitle">Every identity and grant carries an owner of record. Backward traversal identifies the root human accountable for each access chain.</div>
      </div>

      {/* Orphaned accountability banner */}
      {orphanedCount > 0 && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} color="var(--color-hop)" />
          <div>
            <strong>{orphanedCount} orphaned accountability findings</strong> — access chains with no living, active owner of record.
            This is access that exists with no one responsible for it.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{ownershipRecords.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Total grants tracked</div>
        </div>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-hop)' }}>{orphanedCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Orphaned accountability</div>
        </div>
        <div className="card" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-desirable)' }}>{ownershipRecords.length - orphanedCount}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>Owned and active</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-input">
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input placeholder="Search identity, resource, or owner..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className={`filter-chip ${showOrphaned ? 'active-hop' : ''}`} onClick={() => setShowOrphaned(!showOrphaned)}>
          <Icon name="alert" size={11} />
          Orphaned only
        </button>
      </div>

      <div className="table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Identity</th>
              <th>Resource / grant</th>
              <th>Access type</th>
              <th>Owner of record</th>
              <th>Owner status</th>
              <th>Last confirmed</th>
              <th>Accountability</th>
              <th>Root cause</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}
                className={r.orphaned ? 'row-hop ownership-row-orphaned' : ''}>
                <td style={{ fontWeight: 500 }}>
                  {identities.find(i => i.id === r.identityId)?.name || r.identityId}
                </td>
                <td style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)', maxWidth: 200, wordBreak: 'break-all' }}>
                  {r.resource}
                </td>
                <td>
                  {r.accessType ? <AccessBadge type={r.accessType} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                </td>
                <td style={{ color: r.owner ? 'var(--text-primary)' : 'var(--color-hop)', fontWeight: r.owner ? 400 : 700 }}>
                  {r.owner || 'Unassigned'}
                </td>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: r.ownerStatus === 'active' ? 'var(--color-desirable)' : r.ownerStatus === 'departed' ? 'var(--color-hop)' : 'var(--text-tertiary)'
                  }}>
                    {r.ownerStatus}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{r.lastConfirmed}</td>
                <td>
                  {r.orphaned
                    ? <span className="badge badge-hop"><Icon name="alert" size={10} /> Orphaned</span>
                    : <span className="badge badge-desirable"><Icon name="check" size={10} /> Owned</span>}
                </td>
                <td style={{ fontSize: 11, color: 'var(--color-unacceptable)', fontWeight: 500 }}>
                  {r.rootCause || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explanation */}
      <div className="card" style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>How backward traversal works</div>
        For any access chain, ITAG walks <code style={{ fontSize: 11, background: 'var(--surface-subtle)', padding: '1px 4px', borderRadius: 3 }}>CREATED_BY</code> edges
        back to a root human. If that root human is marked departed, or the owner-of-record field is null or unconfirmed beyond the
        review window, the chain is flagged as <strong>orphaned accountability</strong> — access exists with no one responsible for it.
        This is the finding class that forward-only blast-radius tools never surface.
      </div>
    </div>
  );
}
