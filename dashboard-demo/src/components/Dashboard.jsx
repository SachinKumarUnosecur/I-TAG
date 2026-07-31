import { useNavigate } from 'react-router-dom';
import {
  Icon, DonutChart, CompletionRing, TileExit,
  riskColor, bandColor
} from './ui';
import {
  dashboardSummary, accessSummary, accessPaths, strideFindingCounts,
  reviewCampaigns, orphanedAccounts, riskProfiles, ownershipRecords,
  identities, jmlEvents, mitreFindings, delegationChains, impactGraph
} from '../data/mockData';

const SENSITIVITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15 };

function computeExposure(identityId) {
  const paths = accessPaths.filter(p => p.identityId === identityId && !p.blocked);
  return paths.reduce((sum, p) => sum + (SENSITIVITY_WEIGHT[p.resourceSensitivity] || 10), 0);
}

function walkDelegation(node, depth = 0, path = []) {
  const current = [...path, node];
  const kids = (node.children || []).flatMap(c => walkDelegation(c, depth + 1, current));
  return [{ node, depth, path: current }, ...kids];
}

function riskiestDelegationChains() {
  return Object.values(delegationChains).map(app => {
    const flat = walkDelegation(app.root);
    const risky = flat.filter(e => e.node.status === 'orphaned' || e.node.status === 'departed');
    const maxDepth = Math.max(0, ...flat.map(e => e.depth));
    const sample = risky[0] || flat.filter(e => e.node.type === 'service').sort((a, b) => b.depth - a.depth)[0];
    return {
      appName: app.appName,
      riskCount: risky.length,
      maxDepth,
      chainLabel: sample
        ? sample.path.filter(n => n.type !== 'system').map(n => n.name).join(' → ')
        : app.appName,
    };
  }).sort((a, b) => b.riskCount - a.riskCount || b.maxDepth - a.maxDepth);
}

/* ── Donut tile ─────────────────────────────────────────────── */
function AccessTile({ navigate }) {
  const topShadow = accessPaths.filter(p => p.accessType === 'Shadow').slice(0, 2);
  const shadowAdminList = accessPaths.filter(p => p.shadowAdmin);
  return (
    <div className="tile" onClick={() => navigate('/access-discovery')}>
      <div className="tile-label">Access Discovery</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
        <div className="donut-wrapper">
          <DonutChart direct={accessSummary.direct} indirect={accessSummary.indirect} hop={accessSummary.shadow} size={104} />
          <div className="donut-center">
            <div className="donut-center-num">{accessSummary.shadow}</div>
            <div className="donut-center-label">Shadow</div>
          </div>
        </div>
        <div className="legend">
          {[
            { label: 'Direct', color: 'var(--color-direct)', count: accessSummary.direct },
            { label: 'Indirect', color: 'var(--color-indirect)', count: accessSummary.indirect },
            { label: 'Shadow', color: 'var(--color-hop)', count: accessSummary.shadow },
          ].map(item => (
            <div className="legend-row" key={item.label}>
              <div className="legend-dot" style={{ background: item.color }} />
              <div className="legend-label">{item.label}</div>
              <div className="legend-count">{item.count}</div>
            </div>
          ))}
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{accessSummary.total}</span> total paths
          </div>
        </div>
      </div>

      {shadowAdminList.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10,
          padding: '8px 10px', background: 'rgba(216,90,48,0.06)', borderRadius: 8,
          border: '1px solid rgba(216,90,48,0.15)',
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-unacceptable)', textTransform: 'uppercase', letterSpacing: '0.4px', width: '100%' }}>
            Shadow admin watchlist
          </span>
          {shadowAdminList.map(sa => (
            <span key={sa.id} style={{
              fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 7px',
            }}>
              {sa.identityName} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>· {sa.hopCount} hop{sa.hopCount !== 1 ? 's' : ''}</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {topShadow.map(h => (
          <div key={h.id} style={{
            padding: '8px 10px',
            background: 'rgba(226,75,74,0.05)',
            borderRadius: 8,
            borderLeft: '2.5px solid var(--color-hop)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Shadow access</div>
            <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
              <strong>{h.identityName}</strong> → <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-hop)' }}>{h.resource.split('//')[1]}</span>
              {h.shadowAdmin && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: 'var(--color-hop)', background: 'rgba(226,75,74,0.1)', padding: '1px 5px', borderRadius: 3 }}>Shadow Admin</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, fontFamily: 'monospace' }}>{h.mechanism.split(' →')[0]}</div>
          </div>
        ))}
      </div>

      <TileExit label="View all access paths" onClick={() => navigate('/access-discovery')} />
    </div>
  );
}

/* ── Risk tile ──────────────────────────────────────────────── */
function RiskTile({ navigate }) {
  const topRisks = riskProfiles.slice().sort((a, b) => b.score - a.score).slice(0, 4);
  const bands = [
    { band: 'Catastrophic', color: 'var(--color-catastrophic)', count: riskProfiles.filter(r => r.band === 'Catastrophic').length },
    { band: 'Unacceptable', color: 'var(--color-unacceptable)', count: riskProfiles.filter(r => r.band === 'Unacceptable').length },
    { band: 'Undesirable', color: 'var(--color-undesirable)', count: riskProfiles.filter(r => r.band === 'Undesirable').length },
    { band: 'Acceptable', color: 'var(--color-acceptable)', count: riskProfiles.filter(r => r.band === 'Acceptable').length },
    { band: 'Desirable', color: 'var(--color-desirable)', count: riskProfiles.filter(r => r.band === 'Desirable').length },
  ];

  return (
    <div className="tile" onClick={() => navigate('/risk-profiles')}>
      <div className="tile-label">Incidents and risk</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, color: 'var(--color-catastrophic)', lineHeight: 1 }}>
            {dashboardSummary.criticalFindings}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, fontWeight: 500 }}>Catastrophic-band identities</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', height: 32, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
            {bands.filter(b => b.count > 0).map(b => (
              <div key={b.band}
                title={`${b.band}: ${b.count}`}
                style={{ flex: b.count, background: b.color, opacity: 0.85, minWidth: 6 }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
            {bands.filter(b => b.count > 0).map(b => (
              <div key={b.band} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: 50, background: b.color }} />
                <span style={{ fontSize: 10.5, color: 'var(--text-tertiary)' }}>
                  {b.band.slice(0, 4)} <strong style={{ color: 'var(--text-primary)' }}>{b.count}</strong>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {topRisks.map(r => (
          <div key={r.identityId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, textAlign: 'right', fontWeight: 700, fontSize: 12.5, color: riskColor(r.score), flexShrink: 0 }}>{r.score}</div>
            <div style={{ flex: 1, height: 4, background: 'var(--surface-inset)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${r.score}%`, background: riskColor(r.score), borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', width: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
          </div>
        ))}
      </div>

      <TileExit label="View risk profiles" onClick={() => navigate('/risk-profiles')} />
    </div>
  );
}

/* ── Review tile ────────────────────────────────────────────── */
function ReviewTile({ navigate }) {
  const campaigns = reviewCampaigns;
  const primary = campaigns[0];
  const avatars = [
    { label: 'TW', color: '#5254F0' },
    { label: 'JD', color: '#E24B4A' },
    { label: 'PS', color: '#047857' },
    { label: 'MC', color: '#BA7517' },
  ];

  return (
    <div className="tile" onClick={() => navigate('/access-reviews')}>
      <div className="tile-label">Access reviews</div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <CompletionRing pct={primary.completionPct} size={82} />
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-desirable)', lineHeight: 1 }}>{primary.completionPct}%</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, lineHeight: 1.4 }}>{primary.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>Due {primary.dueDate}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {avatars.map((a, i) => (
              <div key={i} className="avatar-mini" style={{ background: a.color }}>{a.label}</div>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>4 reviewers</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, background: 'var(--surface-subtle)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 10 }}>
        {[
          { label: 'Pending', value: primary.pendingItems, color: 'var(--text-tertiary)' },
          { label: 'Approved', value: primary.approvedItems, color: 'var(--color-desirable)' },
          { label: 'Revoked', value: primary.revokedItems, color: 'var(--color-hop)' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 12px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 1, fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Campaign stack */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, flex: 1 }}>
        {campaigns.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
              <div style={{ height: 3, background: 'var(--surface-inset)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${c.completionPct}%`, background: c.completionPct === 0 ? 'var(--color-undesirable)' : 'var(--color-desirable)', borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.status === 'pending' ? 'var(--color-undesirable)' : 'var(--text-secondary)', flexShrink: 0 }}>
              {c.completionPct}%
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className={`orphan-badge ${orphanedAccounts.length === 0 ? 'orphan-badge-zero' : ''}`}>
          <Icon name="alert" size={11} />
          {orphanedAccounts.length} orphaned {orphanedAccounts.length === 1 ? 'account' : 'accounts'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{campaigns.length} campaigns</span>
      </div>

      <TileExit label="View review queue" onClick={() => navigate('/access-reviews')} />
    </div>
  );
}

/* ── STRIDE + MITRE tile ────────────────────────────────────── */
function ThreatTile({ navigate }) {
  const strideEntries = Object.entries(strideFindingCounts);
  const topCategory = strideEntries.slice().sort((a, b) => b[1].count - a[1].count)[0];
  const topMitre = mitreFindings.slice().sort((a, b) => {
    const order = { Catastrophic: 0, Unacceptable: 1, Undesirable: 2 };
    return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
  }).slice(0, 3);

  const strideTheme = {
    Catastrophic: { bg: 'rgba(226,75,74,0.1)', text: 'var(--color-catastrophic)' },
    Unacceptable: { bg: 'rgba(216,90,48,0.1)', text: 'var(--color-unacceptable)' },
    Undesirable: { bg: 'rgba(186,117,23,0.1)', text: 'var(--color-undesirable)' },
    Acceptable: { bg: 'rgba(90,138,30,0.1)', text: 'var(--color-acceptable)' },
    Desirable: { bg: 'rgba(99,153,34,0.08)', text: 'var(--color-desirable)' },
  };

  const totalFindings = strideEntries.reduce((sum, [, v]) => sum + v.count, 0);

  return (
    <div className="tile" onClick={() => navigate('/threat-profile')}>
      <div className="tile-label">Identity threat model</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, color: 'var(--color-catastrophic)', lineHeight: 1 }}>{totalFindings}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Total STRIDE findings</div>
        </div>
        {topCategory && topCategory[1].count > 0 && (
          <div style={{ flex: 1, padding: '8px 12px', background: 'rgba(226,75,74,0.06)', borderRadius: 8, borderLeft: '2.5px solid var(--color-hop)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>Top category</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>{topCategory[1].label}</div>
            <div style={{ fontSize: 11, color: 'var(--color-hop)', fontWeight: 600 }}>{topCategory[1].count} active</div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
        {strideEntries.map(([letter, data]) => {
          const theme = strideTheme[data.severity] || strideTheme.Desirable;
          return (
            <div key={letter}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '8px 4px',
                background: data.count > 0 ? theme.bg : 'var(--surface-subtle)',
                borderRadius: 8,
                opacity: data.count === 0 ? 0.45 : 1,
              }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: data.count > 0 ? theme.text : 'var(--text-tertiary)' }}>{letter}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: data.count > 0 ? theme.text : 'var(--text-tertiary)' }}>{data.count}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>
          Top MITRE techniques
        </div>
        {topMitre.map(m => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              color: 'var(--color-hop)', background: 'rgba(226,75,74,0.08)',
              padding: '2px 5px', borderRadius: 3, flexShrink: 0,
            }}>{m.technique}</span>
            <span style={{ fontSize: 11.5, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: bandColor(m.severity), flexShrink: 0 }}>{m.severity.slice(0, 4)}</span>
          </div>
        ))}
      </div>

      <TileExit label="View threat findings" onClick={() => navigate('/threat-profile')} />
    </div>
  );
}

/* ── Lifecycle tile ─────────────────────────────────────────── */
function LifecycleTile({ navigate }) {
  const failed = jmlEvents.filter(e => e.status === 'failed' || e.status === 'partial');
  const leaversFailed = jmlEvents.filter(e => e.eventType === 'leaver' && e.status === 'failed');
  const liveAccess = leaversFailed.reduce((s, e) => s + e.liveAccess, 0);
  const departed = identities.filter(i => i.status === 'departed');

  return (
    <div className="tile" onClick={() => navigate('/identity-lifecycle')}>
      <div className="tile-label">Identity lifecycle</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, color: 'var(--color-catastrophic)', lineHeight: 1 }}>{failed.length}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Failed / partial JML events</div>
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 0, background: 'var(--surface-subtle)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
          {[
            { label: 'Live access', value: liveAccess, color: 'var(--color-hop)' },
            { label: 'Departed', value: departed.length, color: 'var(--color-unacceptable)' },
            { label: 'Orphaned', value: orphanedAccounts.length, color: 'var(--color-undesirable)' },
          ].map((s, i) => (
            <div key={s.label} style={{
              flex: 1, padding: '10px 8px', textAlign: 'center',
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {failed.slice(0, 3).map(e => (
          <div key={e.id} style={{
            padding: '8px 10px',
            background: e.status === 'failed' ? 'rgba(226,75,74,0.05)' : 'rgba(186,117,23,0.06)',
            borderRadius: 8,
            borderLeft: `2.5px solid ${e.status === 'failed' ? 'var(--color-hop)' : 'var(--color-undesirable)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{e.identityName}</div>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                color: e.status === 'failed' ? 'var(--color-hop)' : 'var(--color-undesirable)',
              }}>{e.eventType} · {e.status}</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              {e.liveAccess} live grants{e.orphanedAccounts.length > 0 ? ` · ${e.orphanedAccounts.length} orphaned SA` : ''}
            </div>
          </div>
        ))}
      </div>

      <TileExit label="View lifecycle events" onClick={() => navigate('/identity-lifecycle')} />
    </div>
  );
}

/* ── Exposure tile ──────────────────────────────────────────── */
function ExposureTile({ navigate }) {
  const exposures = identities.map(id => ({
    ...id,
    exposureScore: computeExposure(id.id),
    reachesCritical: accessPaths.some(p => p.identityId === id.id && !p.blocked && p.resourceSensitivity === 'critical'),
  })).sort((a, b) => b.exposureScore - a.exposureScore);

  const top = exposures.slice(0, 4);
  const maxScore = Math.max(...exposures.map(e => e.exposureScore), 1);
  const criticalReach = exposures.filter(e => e.reachesCritical).length;

  return (
    <div className="tile" onClick={() => navigate('/exposure-map')}>
      <div className="tile-label">Exposure map</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, color: 'var(--color-hop)', lineHeight: 1 }}>
            {exposures[0]?.exposureScore ?? 0}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Highest blast-radius score</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{exposures[0]?.name}</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', background: 'rgba(216,90,48,0.06)', borderRadius: 8, borderLeft: '2.5px solid var(--color-unacceptable)' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-unacceptable)', lineHeight: 1 }}>{criticalReach}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Identities reaching critical resources</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {top.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 100, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
            <div style={{ flex: 1, height: 5, background: 'var(--surface-inset)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(e.exposureScore / maxScore) * 100}%`, background: riskColor(Math.min(100, e.exposureScore / 3)), borderRadius: 2 }} />
            </div>
            <div style={{ width: 36, textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{e.exposureScore}</div>
          </div>
        ))}
      </div>

      <TileExit label="View exposure map" onClick={() => navigate('/exposure-map')} />
    </div>
  );
}

/* ── Delegation tile ────────────────────────────────────────── */
function DelegationTile({ navigate }) {
  const chains = riskiestDelegationChains();
  const totalRisky = chains.reduce((s, c) => s + c.riskCount, 0);

  return (
    <div className="tile" onClick={() => navigate('/delegation-chain')}>
      <div className="tile-label">Delegation chains</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1.5, color: 'var(--color-unacceptable)', lineHeight: 1 }}>{totalRisky}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>Departed / orphaned in lineage</div>
        </div>
        <div style={{ flex: 1, padding: '8px 12px', background: 'var(--surface-subtle)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Deepest chain</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>{Math.max(...chains.map(c => c.maxDepth))} hops</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{chains[0]?.appName}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
        {chains.slice(0, 3).map(c => (
          <div key={c.appName} style={{
            padding: '8px 10px',
            background: c.riskCount > 0 ? 'rgba(216,90,48,0.05)' : 'var(--surface-subtle)',
            borderRadius: 8,
            borderLeft: `2.5px solid ${c.riskCount > 0 ? 'var(--color-unacceptable)' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{c.appName}</span>
              {c.riskCount > 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-unacceptable)' }}>{c.riskCount} risky</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace', lineHeight: 1.4 }}>
              {c.chainLabel}
            </div>
          </div>
        ))}
      </div>

      <TileExit label="View creator lineage" onClick={() => navigate('/delegation-chain')} />
    </div>
  );
}

/* ── Credential hygiene tile ────────────────────────────────── */
function HygieneTile({ navigate }) {
  const humansNoMfa = identities.filter(i => i.type === 'human' && !i.mfaEnabled && i.status !== 'departed');
  const humansNoMfaAll = identities.filter(i => i.type === 'human' && !i.mfaEnabled);
  const staleCreds = identities.filter(i => i.credentialAge >= 180).sort((a, b) => b.credentialAge - a.credentialAge);
  const staleServices = identities.filter(i => i.type === 'service' && i.credentialAge >= 180);

  return (
    <div className="tile" onClick={() => navigate('/risk-profiles')}>
      <div className="tile-label">Credential hygiene</div>

      <div style={{ display: 'flex', gap: 0, background: 'var(--surface-subtle)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 14 }}>
        {[
          { label: 'MFA off', value: humansNoMfaAll.length, color: 'var(--color-hop)', sub: 'humans' },
          { label: 'Stale >180d', value: staleCreds.length, color: 'var(--color-unacceptable)', sub: 'identities' },
          { label: 'Stale SAs', value: staleServices.length, color: 'var(--color-undesirable)', sub: 'service' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '12px 10px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
          Fix these first
        </div>
        {[...humansNoMfa, ...staleCreds.filter(i => i.mfaEnabled || i.type === 'service')].slice(0, 4).map(id => (
          <div key={id.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, fontSize: 12, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id.name}</div>
            {!id.mfaEnabled && id.type === 'human' && (
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-hop)', background: 'rgba(226,75,74,0.1)', padding: '1px 5px', borderRadius: 3 }}>No MFA</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{id.credentialAge}d</span>
          </div>
        ))}
      </div>

      <TileExit label="View risk factors" onClick={() => navigate('/risk-profiles')} />
    </div>
  );
}

/* ── Unified Impact tile ────────────────────────────────────── */
function ImpactTile({ navigate }) {
  const origin = impactGraph.nodes.find(n => n.group === 'origin');
  const compromised = impactGraph.nodes.filter(n => n.group === 'compromised');
  const reachable = impactGraph.nodes.filter(n => n.group === 'reachable' || n.group === 'compromised' || n.group === 'downstream');
  const critical = impactGraph.nodes.filter(n => n.sensitivity === 'critical').length;
  const shadowLinks = impactGraph.links.filter(l => l.type === 'Shadow').length;

  return (
    <div className="tile" onClick={() => navigate('/unified-impact')}>
      <div className="tile-label">Unified impact</div>

      <div style={{
        padding: '12px 14px', marginBottom: 14,
        background: 'rgba(226,75,74,0.05)', borderRadius: 8,
        borderLeft: '2.5px solid var(--color-hop)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
          Highest blast-radius origin
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>{origin?.label || '—'}</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
          Compromising this identity reaches <strong style={{ color: 'var(--color-hop)' }}>{reachable.length}</strong> downstream nodes
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, background: 'var(--surface-subtle)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 12 }}>
        {[
          { label: 'Reachable', value: reachable.length, color: 'var(--color-hop)' },
          { label: 'Critical', value: critical, color: 'var(--color-catastrophic)' },
          { label: 'Shadow hops', value: shadowLinks, color: 'var(--color-unacceptable)' },
        ].map((s, i) => (
          <div key={s.label} style={{
            flex: 1, padding: '10px 8px', textAlign: 'center',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
        {compromised.map(n => (
          <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: 50, background: 'var(--color-catastrophic)', flexShrink: 0 }} />
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{n.label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-catastrophic)', marginLeft: 'auto' }}>compromised</span>
          </div>
        ))}
      </div>

      <TileExit label="Open impact graph" onClick={() => navigate('/unified-impact')} />
    </div>
  );
}

/* ── Summary bar ────────────────────────────────────────────── */
function SummaryBar({ navigate }) {
  const items = [
    { label: 'Total identities', value: dashboardSummary.totalIdentities, color: 'var(--text-primary)', to: '/access-discovery' },
    { label: 'Human', value: dashboardSummary.humanIdentities, color: '#4338ca', to: '/access-discovery' },
    { label: 'Service accounts', value: dashboardSummary.serviceIdentities, color: '#047857', to: '/access-discovery' },
    { label: 'Shadow access paths', value: dashboardSummary.shadowPaths, color: 'var(--color-hop)', to: '/access-discovery' },
    { label: 'Shadow admins', value: dashboardSummary.shadowAdminCount, color: 'var(--color-unacceptable)', to: '/access-discovery' },
    {
      label: 'Overall risk band',
      value: dashboardSummary.overallRiskBand,
      color: bandColor(dashboardSummary.overallRiskBand),
      to: '/risk-profiles',
      isBand: true,
    },
  ];
  return (
    <div className="summary-bar summary-bar-6">
      {items.map(item => (
        <div key={item.label} className="stat-card" onClick={() => navigate(item.to)}>
          {item.isBand ? (
            <div style={{
              fontSize: 15, fontWeight: 800, letterSpacing: -0.3, color: item.color, lineHeight: 1.2,
              padding: '4px 0',
            }}>{item.value}</div>
          ) : (
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: item.color, lineHeight: 1 }}>{item.value}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500, lineHeight: 1.3 }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Alert ──────────────────────────────────────────────────── */
function AlertBanner() {
  if (orphanedAccounts.length === 0 && ownershipRecords.filter(o => o.orphaned).length === 0) return null;
  return (
    <div className="alert-banner alert-danger">
      <Icon name="alert" size={15} color="var(--color-hop)" style={{ flexShrink: 0, marginTop: 1 }} />
      <div>
        <strong>{orphanedAccounts.length} orphaned accounts</strong> with live access after leaver sweep failure — immediate deprovisioning required.
        {' '}{ownershipRecords.filter(o => o.orphaned).length} access chains have no accountable owner.
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title">Overview</div>
          <div className="page-subtitle">Security posture across all identities — last scan 14:22 UTC</div>
        </div>
        <div className="risk-band-chip" style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Tenant risk
          </span>
          <span style={{
            fontSize: 13, fontWeight: 800,
            color: bandColor(dashboardSummary.overallRiskBand),
            background: `color-mix(in srgb, ${bandColor(dashboardSummary.overallRiskBand)} 12%, transparent)`,
            border: `1px solid color-mix(in srgb, ${bandColor(dashboardSummary.overallRiskBand)} 28%, transparent)`,
            padding: '5px 12px', borderRadius: 6,
          }}>
            {dashboardSummary.overallRiskBand}
          </span>
        </div>
      </div>
      <AlertBanner />
      <SummaryBar navigate={navigate} />
      <div className="dashboard-grid">
        <AccessTile navigate={navigate} />
        <RiskTile navigate={navigate} />
        <LifecycleTile navigate={navigate} />
        <ExposureTile navigate={navigate} />
        <DelegationTile navigate={navigate} />
        <HygieneTile navigate={navigate} />
        <ImpactTile navigate={navigate} />
        <ReviewTile navigate={navigate} />
        <ThreatTile navigate={navigate} />
      </div>
    </div>
  );
}
