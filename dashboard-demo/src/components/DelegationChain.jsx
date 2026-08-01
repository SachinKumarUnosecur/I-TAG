import { useState } from 'react';
import { Icon, TreeNode, TypeChip, StatusChip } from './ui';
import { delegationChains, identities } from '../data/mockData';

export default function DelegationChain() {
  const [selectedApp, setSelectedApp] = useState('payments');
  const [view, setView] = useState('table'); // 'table' | 'tree'
  const apps = [
    { key: 'payments', label: 'Payments' },
    { key: 'dataPipeline', label: 'Data Pipeline' },
    { key: 'devops', label: 'DevOps' },
  ];
  const chain = delegationChains[selectedApp];

  // Flatten the tree for table view
  function flattenTree(node, depth = 0, rows = []) {
    rows.push({ ...node, depth });
    (node.children || []).forEach(child => flattenTree(child, depth + 1, rows));
    return rows;
  }
  const rows = flattenTree(chain.root);

  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-title">Delegation chain</div>
        <div className="page-subtitle">Creator-lineage trees scoped per app — who provisioned which identity, and what that identity went on to create</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="select-control" value={selectedApp} onChange={e => setSelectedApp(e.target.value)}>
          {apps.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <div className="tabs">
          <div className={`tab ${view === 'table' ? 'active' : ''}`} onClick={() => setView('table')}>Table</div>
          <div className={`tab ${view === 'tree' ? 'active' : ''}`} onClick={() => setView('tree')}>Tree view</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span className="badge badge-hop" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name="alert" size={10} />
            {rows.filter(r => r.status === 'orphaned').length} orphaned
          </span>
          <span className="badge badge-unacceptable" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {rows.filter(r => r.status === 'departed').length} departed
          </span>
        </div>
      </div>

      {view === 'table' ? (
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Type</th>
                <th>Created by</th>
                <th>Depth</th>
                <th>Children created</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const isOrphaned = row.status === 'orphaned';
                const isDeparted = row.status === 'departed';
                return (
                  <tr key={`${row.id}-${i}`}
                    className={isOrphaned ? 'row-hop' : ''}
                    style={{ background: isDeparted ? 'rgba(216,90,48,0.04)' : undefined }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: row.depth * 16 }}>
                        {row.depth > 0 && <Icon name="gitBranch" size={11} color="var(--text-tertiary)" />}
                        <span style={{ fontWeight: row.depth === 0 ? 700 : 500 }}>{row.name}</span>
                      </div>
                    </td>
                    <td><TypeChip type={row.type} /></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {row.depth === 0 ? '—' : rows.find(r => r.children?.some(c => c.id === row.id))?.name || '—'}
                    </td>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{row.depth}</td>
                    <td style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{row.children?.length ?? 0}</td>
                    <td>
                      {isOrphaned
                        ? <span className="badge badge-hop">orphaned</span>
                        : isDeparted
                        ? <span className="badge badge-unacceptable">departed</span>
                        : <StatusChip status="active" />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            {chain.appName} lineage tree — rooted at IdP provisioning system
          </div>
          <TreeNode node={chain.root} />
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
        Lineage scoped to {chain.appName}. Cross-system grants are listed separately only if an explicit cross-scope binding exists.
      </div>
    </div>
  );
}
