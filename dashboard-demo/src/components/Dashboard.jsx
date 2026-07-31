import { useNavigate } from 'react-router-dom';
import {
  Icon, DonutChart, SegmentDonut, CompletionRing, RiskArc, TileExit,
  bandColor
} from './ui';
import {
  dashboardSummary, accessSummary, accessPaths, strideFindingCounts,
  reviewCampaigns, orphanedAccounts, riskProfiles,
  identities, jmlEvents, mitreFindings, impactGraph
} from '../data/mockData';

/* ── Donut tile ─────────────────────────────────────────────── */
function AccessTile({ navigate }) {
  const topShadowAdmins = accessPaths
    .filter(p => p.shadowAdmin)
    .sort((a, b) => (b.hopCount || 0) - (a.hopCount || 0))
    .slice(0, 5);
  return (
    <div className="tile" onClick={() => navigate('/access-discovery')}>
      <div className="tile-label">Access Discovery</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
        <div className="donut-wrapper">
          <DonutChart direct={accessSummary.direct} indirect={accessSummary.indirect} hop={accessSummary.shadow} size={96} />
          <div className="donut-center">
            <div className="donut-center-num">{accessSummary.shadow}</div>
            <div className="donut-center-label">Shadow Access</div>
          </div>
        </div>
        <div className="legend" style={{ flex: 1 }}>
          {[
            { label: 'Direct Access', color: 'var(--color-direct)', count: accessSummary.direct },
            { label: 'Indirect Access', color: 'var(--color-indirect)', count: accessSummary.indirect },
            { label: 'Shadow Access', color: 'var(--color-hop)', count: accessSummary.shadow },
          ].map(item => (
            <div className="legend-row" key={item.label}>
              <div className="legend-dot" style={{ background: item.color }} />
              <div className="legend-label">{item.label}</div>
              <div className="legend-count">{item.count}</div>
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{accessSummary.total}</span> total paths
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 12, marginBottom: 2 }}>
        Top 5 Shadow Admin Access
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly' }}>
        {topShadowAdmins.map((sa, i) => (
          <div key={sa.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
            padding: '6px 0',
            borderBottom: i < topShadowAdmins.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{sa.identityName}</span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: 'var(--color-hop)', flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>{sa.hopCount} hop{sa.hopCount !== 1 ? 's' : ''}</span>
          </div>
        ))}
      </div>

      <TileExit label="View all access paths" onClick={() => navigate('/access-discovery')} />
    </div>
  );
}

/* ── Risk tile ──────────────────────────────────────────────── */
function RiskTile({ navigate }) {
  const SEV = [
    { band: 'Critical', color: 'var(--uno-red-500)' },
    { band: 'High', color: 'var(--uno-orange-500)' },
    { band: 'Medium', color: 'var(--uno-yellow-500)' },
    { band: 'Low', color: 'var(--uno-green-500)' },
  ];
  const WEIGHT = { Critical: 40, High: 25, Medium: 12, Low: 5 };
  const ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };

  const severityCounts = SEV.map(s => ({
    ...s,
    count: mitreFindings.filter(f => f.severity === s.band).length,
  }));
  const openCount = mitreFindings.length;
  const riskPosture = Math.min(100, Math.round(
    mitreFindings.reduce((sum, f) => sum + (WEIGHT[f.severity] || 5), 0) / Math.max(openCount, 1) * 2.2
  ));
  const gaugeColor = riskPosture >= 70
    ? 'var(--uno-red-500)'
    : riskPosture >= 40
      ? 'var(--uno-orange-500)'
      : 'var(--uno-yellow-500)';

  const humanIds = new Set(identities.filter(i => i.type === 'human').map(i => i.id));
  const byUser = {};
  mitreFindings.forEach(f => {
    if (!humanIds.has(f.identityId)) return;
    if (!byUser[f.identityId]) {
      byUser[f.identityId] = {
        identityId: f.identityId,
        name: f.identityName,
        score: 0,
        topSeverity: 'Low',
      };
    }
    const u = byUser[f.identityId];
    u.score += WEIGHT[f.severity] || 5;
    if ((ORDER[f.severity] ?? 9) < (ORDER[u.topSeverity] ?? 9)) u.topSeverity = f.severity;
  });
  const topUsers = Object.values(byUser).sort((a, b) => b.score - a.score).slice(0, 5);

  return (
    <div className="tile" onClick={() => navigate('/threat-profile')}>
      <div className="tile-label">Incidents to Identities</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ position: 'relative', width: 120, flexShrink: 0 }}>
          <RiskArc score={riskPosture} size={120} color={gaugeColor} />
          <div style={{
            position: 'absolute', left: 0, right: 0, top: '42%',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: gaugeColor, lineHeight: 1, letterSpacing: -1 }}>
              {riskPosture}
            </div>
            <div style={{
              fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)',
              textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 3,
            }}>
              risk posture
            </div>
          </div>
        </div>

        <div className="legend" style={{ flex: 1 }}>
          {severityCounts.map(s => (
            <div className="legend-row" key={s.band}>
              <div className="legend-dot" style={{ background: s.color }} />
              <div className="legend-label">{s.band}</div>
              <div className="legend-count" style={{ color: s.color }}>{s.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 14, marginBottom: 2 }}>
        Highest risk users
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly' }}>
        {topUsers.map((u, i) => (
          <div key={u.identityId} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '6px 0',
            borderBottom: i < topUsers.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{u.name}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: bandColor(u.topSeverity), flexShrink: 0 }}>
              {u.topSeverity}
            </span>
          </div>
        ))}
      </div>

      <TileExit label="View threat profile" onClick={() => navigate('/threat-profile')} />
    </div>
  );
}

/* ── Review tile ────────────────────────────────────────────── */
function ReviewTile({ navigate }) {
  const campaigns = reviewCampaigns;
  const primary = campaigns[0];
  const avatars = [
    { label: 'TW', color: 'var(--uno-blue-500)' },
    { label: 'JD', color: 'var(--uno-red-500)' },
    { label: 'PS', color: 'var(--uno-green-700)' },
    { label: 'MC', color: 'var(--uno-yellow-600)' },
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
  const STATUS_META = {
    'Not offboarded': { color: 'var(--color-hop)', rank: 0 },
    'Partially offboarded': { color: 'var(--color-undesirable)', rank: 1 },
  };
  const statusOrder = ['Not offboarded', 'Partially offboarded'];

  // NHI → HI mapping: offboarding state is measured on NHIs, surfaced on the human identity
  const nhiToHi = [
    { nhiId: 'id-105', nhi: 'svc-old-payments-worker', hiId: 'id-005', hiName: 'alice.brooks', status: 'Not offboarded' },
    { nhiId: 'id-104', nhi: 'svc-orphaned-etl', hiId: 'id-006', hiName: 'raj.patel', status: 'Not offboarded' },
    { nhiId: 'id-105b', nhi: 'svc-finance-reporter', hiId: 'id-005', hiName: 'alice.brooks', status: 'Not offboarded' },
    { nhiId: 'id-107', nhi: 'svc-billing-sync', hiId: 'id-001', hiName: 'jane.doe', status: 'Partially offboarded' },
    { nhiId: 'id-101', nhi: 'svc-payments-api', hiId: 'id-001', hiName: 'jane.doe', status: 'Partially offboarded' },
    { nhiId: 'id-103', nhi: 'svc-ci-runner', hiId: 'id-002', hiName: 'mark.chen', status: 'Partially offboarded' },
    { nhiId: 'id-102', nhi: 'svc-data-ingest', hiId: 'id-003', hiName: 'priya.sharma', status: 'Partially offboarded' },
    { nhiId: 'id-106', nhi: 'svc-monitoring', hiId: 'id-002', hiName: 'mark.chen', status: 'Partially offboarded' },
    { nhiId: 'id-108', nhi: 'svc-legacy-batch', hiId: 'id-004', hiName: 'tom.walker', status: 'Partially offboarded' },
  ];

  // Donut counts are NHI-based
  const counts = Object.fromEntries(
    statusOrder.map(s => [s, nhiToHi.filter(n => n.status === s).length])
  );
  const totalNhis = nhiToHi.length;

  // Roll up to unique human identities (worst NHI offboarding status wins)
  const byHi = {};
  nhiToHi.forEach(row => {
    const rank = STATUS_META[row.status]?.rank ?? 9;
    if (!byHi[row.hiId]) {
      byHi[row.hiId] = { id: row.hiId, name: row.hiName, status: row.status };
      return;
    }
    if (rank < (STATUS_META[byHi[row.hiId].status]?.rank ?? 9)) {
      byHi[row.hiId].status = row.status;
    }
  });

  const top5 = Object.values(byHi)
    .sort((a, b) => (STATUS_META[a.status]?.rank ?? 9) - (STATUS_META[b.status]?.rank ?? 9) || a.name.localeCompare(b.name))
    .slice(0, 5);

  return (
    <div className="tile" onClick={() => navigate('/identity-lifecycle')}>
      <div className="tile-label">Identities Lifecycle</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14 }}>
        <div className="donut-wrapper">
          <SegmentDonut
            size={104}
            segments={statusOrder.map(s => ({
              value: counts[s],
              color: STATUS_META[s].color,
            }))}
          />
          <div className="donut-center">
            <div className="donut-center-num" style={{ color: 'var(--text-primary)' }}>{totalNhis}</div>
            <div className="donut-center-label">NHIs</div>
          </div>
        </div>
        <div className="legend">
          {statusOrder.map(label => (
            <div className="legend-row" key={label}>
              <div className="legend-dot" style={{ background: STATUS_META[label].color }} />
              <div className="legend-label">{label}</div>
              <div className="legend-count">{counts[label]}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
        Top 5 identities
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        {top5.map((h, i) => (
          <div key={h.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '8px 0',
            borderBottom: i < top5.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{h.name}</span>
            <span style={{
              fontSize: 12, fontWeight: 700, flexShrink: 0,
              color: STATUS_META[h.status]?.color || 'var(--text-tertiary)',
            }}>{h.status}</span>
          </div>
        ))}
      </div>

      <TileExit label="View lifecycle events" onClick={() => navigate('/identity-lifecycle')} />
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
    { label: 'Total Identities', value: dashboardSummary.totalIdentities, color: 'var(--text-primary)', to: '/access-discovery' },
    { label: 'Human', value: dashboardSummary.humanIdentities, color: 'var(--uno-blue-600)', to: '/access-discovery' },
    { label: 'Service Accounts', value: dashboardSummary.serviceIdentities, color: 'var(--uno-green-700)', to: '/access-discovery' },
    { label: 'Shadow Access', value: dashboardSummary.shadowPaths, color: 'var(--color-hop)', to: '/access-discovery' },
    { label: 'Shadow Admins', value: dashboardSummary.shadowAdminCount, color: 'var(--color-unacceptable)', to: '/access-discovery' },
    { label: 'Orphaned Accounts', value: orphanedAccounts.length, color: 'var(--uno-red-500)', to: '/identity-lifecycle' },
  ];
  return (
    <div className="summary-bar summary-bar-6">
      {items.map(item => (
        <div key={item.label} className="stat-card" onClick={() => navigate(item.to)}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.8, color: item.color, lineHeight: 1 }}>{item.value}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, fontWeight: 500, lineHeight: 1.3 }}>{item.label}</div>
        </div>
      ))}
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
          <div className="page-subtitle">Security posture across all identities</div>
        </div>
      </div>
      <SummaryBar navigate={navigate} />
      <div className="dashboard-grid">
        <AccessTile navigate={navigate} />
        <RiskTile navigate={navigate} />
        <LifecycleTile navigate={navigate} />
        <HygieneTile navigate={navigate} />
        <ImpactTile navigate={navigate} />
        <ReviewTile navigate={navigate} />
        <ThreatTile navigate={navigate} />
      </div>
    </div>
  );
}
