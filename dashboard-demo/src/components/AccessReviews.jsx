import { useEffect, useMemo, useState } from 'react';
import {
  Icon,
  AccessBadge,
  SeverityBadge,
  TypeChip,
  SlidePanel,
  TablePager,
  paginateRows,
} from './ui';
import {
  downloadReviewExport,
  fetchIdentityAssignments,
  fetchReviewInventory,
  postReviewDecision,
} from '../data/accessReviewApi';

const TABLE_PAGE_SIZE = 10;

const DECISIONS = [
  { key: 'All', label: 'All decisions' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'revoked', label: 'Revoked' },
  { key: 'escalated', label: 'Escalated' },
];

function ReviewAssignmentPanel({ item, onClose, decisionBadge, onApprove, onRevoke, onEscalate }) {
  const [connectorFilter, setConnectorFilter] = useState('all');
  const [fullDetail, setFullDetail] = useState({
    assignments: [],
    connectors: [],
    grantCount: 0,
    permissionCount: 0,
  });
  const [detail, setDetail] = useState(fullDetail);

  useEffect(() => {
    setConnectorFilter('all');
  }, [item.identityId]);

  useEffect(() => {
    let cancelled = false;
    fetchIdentityAssignments(item.identityId).then((next) => {
      if (!cancelled) setFullDetail(next);
    }).catch(() => {
      if (!cancelled) {
        setFullDetail({
          assignments: [],
          connectors: [],
          grantCount: 0,
          permissionCount: 0,
        });
      }
    });
    return () => { cancelled = true; };
  }, [item.identityId]);

  useEffect(() => {
    let cancelled = false;
    fetchIdentityAssignments(item.identityId, { connector: connectorFilter }).then((next) => {
      if (!cancelled) setDetail(next);
    }).catch(() => {
      if (!cancelled) {
        setDetail({
          assignments: [],
          connectors: [],
          grantCount: 0,
          permissionCount: 0,
        });
      }
    });
    return () => { cancelled = true; };
  }, [item.identityId, connectorFilter]);

  const grantCountByConnector = useMemo(() => {
    const map = {};
    for (const grant of fullDetail.assignments) {
      if (!grant.connector) continue;
      map[grant.connector] = (map[grant.connector] || 0) + 1;
    }
    return map;
  }, [fullDetail]);

  const allConnectors = fullDetail.connectors;

  return (
    <SlidePanel
      size="wide"
      title={item.identityName}
      subtitle={`${detail.grantCount} assignment${detail.grantCount === 1 ? '' : 's'} · ${detail.permissionCount} permission${detail.permissionCount === 1 ? '' : 's'} · ${item.riskBand}`}
      onClose={onClose}
    >
      <div className="ar-panel">
        <div className="ar-panel-head">
          <div className="ar-panel-head-row">
            <TypeChip type={item.type} />
            <SeverityBadge band={item.riskBand} />
            {decisionBadge[item.decision] || null}
            {item.shadowAdmin && (
              <span className="badge badge-hop">Shadow admin</span>
            )}
          </div>
          <div className="ar-panel-meta">
            <span>
              Owner: <strong>{item.owner || 'No owner'}</strong>
            </span>
            <span>
              Live grants: <strong>{detail.grantCount}</strong>
            </span>
            <span>
              Risk score: <strong>{item.riskScore}</strong>
            </span>
          </div>
          {item.decision === 'pending' && (
            <div className="ar-panel-actions">
              <button type="button" className="btn btn-success" onClick={() => onApprove(item.identityId)}>
                <Icon name="check" size={12} /> Approve
              </button>
              <button type="button" className="btn btn-danger" onClick={() => onRevoke(item.identityId)}>
                <Icon name="x" size={12} /> Revoke
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => onEscalate(item.identityId)}>
                Escalate
              </button>
            </div>
          )}
        </div>

        <div className="ar-panel-section">
          <div className="ar-panel-section-title">Connectors with access</div>
          <div className="ar-app-chips">
            {allConnectors.length === 0 && (
              <span className="ar-panel-muted">No connector grants for this identity</span>
            )}
            {allConnectors.map(connector => (
              <button
                key={connector}
                type="button"
                className={`ar-app-chip${connectorFilter === connector ? ' is-active' : ''}`}
                onClick={() => setConnectorFilter(connectorFilter === connector ? 'all' : connector)}
              >
                {connector}
                <span>{grantCountByConnector[connector] || 0}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ar-panel-toolbar">
          <label className="ar-campaign-select">
            <select
              value={connectorFilter}
              onChange={e => setConnectorFilter(e.target.value)}
              aria-label="Filter by connector"
            >
              <option value="all">All connectors</option>
              {allConnectors.map(connector => (
                <option key={connector} value={connector}>{connector}</option>
              ))}
            </select>
          </label>
          <div className="ar-panel-count">
            {detail.grantCount} grant{detail.grantCount === 1 ? '' : 's'}
          </div>
        </div>

        <div className="ar-panel-section">
          <div className="ar-panel-section-title">What is assigned</div>
          {detail.assignments.length === 0 ? (
            <div className="ar-panel-empty">No access grants for this connector filter</div>
          ) : (
            <div className="ar-assign-list">
              {detail.assignments.map(grant => (
                <article key={grant.id} className="ar-assign-card">
                  <div className="ar-assign-top">
                    <code className="ar-assign-resource" title={grant.resource}>
                      {grant.resource}
                    </code>
                    <AccessBadge type={grant.accessType} />
                  </div>
                  <div className="ar-assign-meta">
                    <span>{grant.connector}</span>
                    {grant.mechanism && <span title={grant.mechanism}>{grant.mechanism}</span>}
                    {grant.lastConfirmed && <span>Confirmed {grant.lastConfirmed}</span>}
                  </div>
                  <div className="ar-assign-perms-label">
                    Permissions
                    <span>{grant.permissions.length}</span>
                  </div>
                  {grant.permissions.length === 0 ? (
                    <div className="ar-panel-muted">No permissions recorded</div>
                  ) : (
                    <ul className="ar-perm-list">
                      {grant.permissions.map(perm => (
                        <li key={`${grant.id}-${perm}`}>{perm}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </SlidePanel>
  );
}

export default function AccessReviews() {
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [decisionFilter, setDecisionFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    pending: 0,
    approved: 0,
    revoked: 0,
    escalated: 0,
    identityCount: 0,
    grantCount: 0,
  });

  useEffect(() => {
    let cancelled = false;
    fetchReviewInventory({
      campaignId: 'all',
      search,
      decision: decisionFilter,
    }).then((next) => {
      if (cancelled) return;
      setItems(next.items);
      setSummary(next.summary);
    }).catch(() => {
      if (cancelled) return;
      setItems([]);
      setSummary({
        pending: 0,
        approved: 0,
        revoked: 0,
        escalated: 0,
        identityCount: 0,
        grantCount: 0,
      });
    });
    return () => { cancelled = true; };
  }, [search, decisionFilter, revision]);

  const selectedItem = selectedId
    ? items.find(i => i.id === selectedId) || null
    : null;

  const setDecision = async (identityId, decision) => {
    const action =
      decision === 'approved' ? 'approve'
        : decision === 'revoked' ? 'revoke'
          : 'escalate';
    try {
      await postReviewDecision(identityId, action);
      setRevision(n => n + 1);
    } catch {
      /* keep prior rows on failure */
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, decisionFilter]);

  const { rows: pageRows, page: safePage, pageCount } = paginateRows(
    items,
    page,
    TABLE_PAGE_SIZE,
  );

  const decisionBadge = {
    approved: <span className="badge badge-desirable">Approved</span>,
    revoked: <span className="badge badge-hop">Revoked</span>,
    pending: <span className="badge ar-badge-pending">Pending</span>,
    escalated: <span className="badge badge-undesirable">Escalated</span>,
  };

  return (
    <div className="page-content ar-page">
      <div className="page-header ar-page-header">
        <div className="page-header-copy">
          <h1 className="page-title">Access reviews</h1>
          <p className="page-subtitle">
            Review access in periodic attestation campaigns with path, owner, and risk context.
          </p>
        </div>
      </div>

      <div className="ar-stats">
        <div className="ar-stat">
          <div className="ar-stat-value ar-stat-value--muted">{summary.pending}</div>
          <div className="ar-stat-label">Pending</div>
          <div className="ar-stat-meta">Needs decision</div>
        </div>
        <div className="ar-stat">
          <div className="ar-stat-value ar-stat-value--ok">{summary.approved}</div>
          <div className="ar-stat-label">Approved</div>
          <div className="ar-stat-meta">Attested keep</div>
        </div>
        <div className="ar-stat">
          <div className="ar-stat-value ar-stat-value--hot">{summary.revoked}</div>
          <div className="ar-stat-label">Revoked</div>
          <div className="ar-stat-meta">Access removed</div>
        </div>
        <div className="ar-stat">
          <div className="ar-stat-value ar-stat-value--warn">{summary.escalated}</div>
          <div className="ar-stat-label">Escalated</div>
          <div className="ar-stat-meta">
            {summary.grantCount} live grant{summary.grantCount === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="ar-toolbar" role="search">
        <label className={`ar-search${search.trim() ? ' is-filled' : ''}`}>
          <Icon name="search" size={14} color="var(--text-tertiary)" />
          <input
            placeholder="Search identity, owner, or connector…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search review items"
          />
        </label>
        <div className="ar-status-seg" role="group" aria-label="Decision">
          {DECISIONS.map(d => (
            <button
              key={d.key}
              type="button"
              className={`ar-status-btn${decisionFilter === d.key ? ' is-active' : ''}`}
              onClick={() => setDecisionFilter(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="ar-list-count">
          {items.length} identit{items.length === 1 ? 'y' : 'ies'}
        </div>
      </div>

      <div className="ar-table-shell">
        <div className="ar-table-scroll">
          <table className="data-table ar-table">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Grants</th>
                <th>Risk band</th>
                <th>Owner</th>
                <th>Decision</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="ar-table-empty">No review items match</td>
                </tr>
              )}
              {pageRows.map(item => (
                <tr
                  key={item.id}
                  className={selectedId === item.id ? 'is-selected' : ''}
                  onClick={() => setSelectedId(item.id)}
                >
                  <td>
                    <div className="ar-id-name">{item.identityName}</div>
                    <div className="ar-id-hint">
                      {item.permissionCount} permission{item.permissionCount === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="ar-owner">{item.grantCount}</td>
                  <td><SeverityBadge band={item.riskBand} /></td>
                  <td className={item.owner ? 'ar-owner' : 'ar-owner is-missing'}>
                    {item.owner || 'No owner'}
                  </td>
                  <td>{decisionBadge[item.decision] || null}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {item.decision === 'pending' ? (
                      <div className="ar-actions">
                        <button
                          type="button"
                          className="btn btn-success ar-action-btn"
                          onClick={() => setDecision(item.identityId, 'approved')}
                        >
                          <Icon name="check" size={11} /> Approve
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger ar-action-btn"
                          onClick={() => setDecision(item.identityId, 'revoked')}
                        >
                          <Icon name="x" size={11} /> Revoke
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost ar-action-btn"
                          onClick={() => setDecision(item.identityId, 'escalated')}
                        >
                          Escalate
                        </button>
                      </div>
                    ) : (
                      <span className="ar-recorded">Decision recorded</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ar-footer">
        <TablePager
          page={safePage}
          pageCount={pageCount}
          onPageChange={setPage}
          total={items.length}
          noun="identities"
        />
        <div className="ar-exports">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadReviewExport('soc2').catch(() => {})}
          >
            <Icon name="download" size={13} /> SOC 2
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => downloadReviewExport('iso27001').catch(() => {})}
          >
            <Icon name="download" size={13} /> ISO 27001
          </button>
        </div>
      </div>

      {selectedItem && (
        <ReviewAssignmentPanel
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          decisionBadge={decisionBadge}
          onApprove={(id) => setDecision(id, 'approved')}
          onRevoke={(id) => setDecision(id, 'revoked')}
          onEscalate={(id) => setDecision(id, 'escalated')}
        />
      )}
    </div>
  );
}
