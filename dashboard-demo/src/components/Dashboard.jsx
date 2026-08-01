import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Icon, DonutChart, SegmentDonut, RiskArc, StepFunnel, RadarChart, TileExit,
  bandColor
} from './ui';
import {
  dashboardSummary, accessSummary, accessPaths, ptraceFindingCounts,
  orphanedAccounts, shadowAdmins,
  identities, jmlEvents, impactGraph
} from '../data/mockData';
import { fetchMitreFindings } from '../data/riskProfileApi';
import {
  getReviewCampaignsSnapshot,
  getReviewItemsSnapshot,
} from '../data/accessReviewApi';

const reviewCampaigns = getReviewCampaignsSnapshot();
const reviewItems = getReviewItemsSnapshot();

function useMitreFindings() {
  const [findings, setFindings] = useState([]);
  useEffect(() => {
    let alive = true;
    fetchMitreFindings().then((rows) => {
      if (alive) setFindings(rows);
    });
    return () => {
      alive = false;
    };
  }, []);
  return findings;
}

function FabricStatIcon({ kind }) {
  if (kind === 'hi') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    );
  }
  if (kind === 'nhi') {
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="11" width="18" height="10" rx="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
      <path d="M16 3l1.5 1.5L16 6M8 3L6.5 4.5 8 6" />
    </svg>
  );
}

/* ── Identity overview (HI / NHI / compromised + risk signals) ─────── */
function IdentityOverview({ navigate }) {
  const humanIdentities = identities.filter(i => i.type === 'human');
  const serviceIdentities = identities.filter(i => i.type === 'service');
  const compromisedUsers = humanIdentities.filter(i => i.compromisedAt).length;
  const shadowPaths = accessPaths.filter(p => p.accessType === 'Shadow').length;

  const cards = [
    {
      key: 'hi',
      label: "HI's",
      sub: 'Human identities',
      value: humanIdentities.length,
      accent: '#F8A012',
      to: '/access-discovery',
      icon: <FabricStatIcon kind="hi" />,
    },
    {
      key: 'nhi',
      label: "NHI's",
      sub: 'Non-human identities',
      value: serviceIdentities.length,
      accent: '#025DFD',
      to: '/access-discovery',
      icon: <FabricStatIcon kind="nhi" />,
    },
    {
      key: 'compromised',
      label: 'Compromised Users',
      sub: 'Known compromised humans',
      value: compromisedUsers,
      accent: '#E72E21',
      valueColor: '#E72E21',
      to: '/threat-profile',
      icon: <FabricStatIcon kind="compromised" />,
    },
    {
      key: 'shadow',
      label: 'Shadow Access',
      sub: 'Shadow access paths',
      value: shadowPaths,
      accent: '#E72E21',
      valueColor: '#E72E21',
      to: '/access-discovery',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      ),
    },
    {
      key: 'admins',
      label: 'Shadow Admins',
      sub: 'Shadow admin access',
      value: shadowAdmins.length,
      accent: '#F97316',
      valueColor: '#F97316',
      to: '/access-discovery',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
    },
    {
      key: 'orphaned',
      label: 'Orphaned Accounts',
      sub: 'Accounts without owner',
      value: orphanedAccounts.length,
      accent: '#E72E21',
      valueColor: '#E72E21',
      to: '/identity-lifecycle',
      icon: (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
      ),
    },
  ];

  return (
    <section className="identity-fabric">
      <div className="identity-fabric-eyebrow">Identity security posture</div>
      <div className="identity-fabric-cards identity-fabric-cards-6">
        {cards.map(card => (
          <button
            key={card.key}
            type="button"
            className="identity-fabric-card"
            onClick={() => navigate(card.to)}
          >
            <span className="identity-fabric-diamond" style={{ '--fab-accent': card.accent }}>
              {card.icon}
            </span>
            <span className="identity-fabric-card-copy">
              <span className="identity-fabric-card-label">{card.label}</span>
              <span className="identity-fabric-card-sub">{card.sub}</span>
            </span>
            <span
              className="identity-fabric-card-value"
              style={card.valueColor ? { color: card.valueColor } : undefined}
            >
              {card.value}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Donut tile ─────────────────────────────────────────────── */
function AccessTile({ navigate }) {
  const topShadowAdmins = accessPaths
    .filter(p => p.shadowAdmin)
    .sort((a, b) => (b.hopCount || 0) - (a.hopCount || 0))
    .slice(0, 5);
  return (
    <div className="tile" onClick={() => navigate('/access-discovery')}>
      <div className="tile-label">Access Discovery</div>

      <div className="tile-chart-row">
        <div className="tile-chart-viz">
          <div className="donut-wrapper">
            <DonutChart direct={accessSummary.direct} indirect={accessSummary.indirect} hop={accessSummary.shadow} size={168} />
            <div className="donut-center">
              <div className="donut-center-num" style={{ fontSize: 32 }}>{accessSummary.shadow}</div>
              <div className="donut-center-label" style={{ maxWidth: 88, fontSize: 10 }}>Shadow Access</div>
            </div>
          </div>
        </div>
        <div className="tile-chart-legend">
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
  const mitreFindings = useMitreFindings();
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

      <div className="tile-chart-row">
        <div className="tile-chart-viz">
          <div className="tile-gauge-wrap">
            <RiskArc score={riskPosture} size={200} color={gaugeColor} strokeWidth={16} />
            <div className="tile-gauge-center">
              <div className="tile-gauge-num" style={{ color: gaugeColor }}>
                {riskPosture}
              </div>
              <div className="tile-gauge-label">risk posture</div>
            </div>
          </div>
        </div>
        <div className="tile-chart-legend">
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
  const campaign = reviewCampaigns[0];
  const RISK_RANK = { Catastrophic: 0, Unacceptable: 1, Undesirable: 2, Acceptable: 3, Desirable: 4 };
  const SEVERITY_META = {
    Catastrophic: { label: 'Critical', tone: 'critical' },
    Unacceptable: { label: 'High', tone: 'high' },
    Undesirable: { label: 'Medium', tone: 'medium' },
    Acceptable: { label: 'Low', tone: 'low' },
    Desirable: { label: 'Low', tone: 'low' },
  };

  const topRisky = [...reviewItems]
    .filter(r => r.campaignId === campaign.id && r.decision === 'pending')
    .sort((a, b) => (RISK_RANK[a.riskBand] ?? 9) - (RISK_RANK[b.riskBand] ?? 9))
    .slice(0, 5);

  const pending = campaign.pendingItems;
  const approved = campaign.approvedItems;
  const revoked = campaign.revokedItems;
  const total = campaign.totalItems;
  const completionPct = campaign.completionPct;

  const statusSegments = [
    { label: 'Approved', value: approved, color: 'var(--color-desirable)', pct: (approved / total) * 100 },
    { label: 'Revoked', value: revoked, color: 'var(--color-hop)', pct: (revoked / total) * 100 },
    { label: 'Pending', value: pending, color: 'var(--uno-grey-300)', pct: (pending / total) * 100 },
  ];

  const reviewers = (campaign.reviewers || [campaign.reviewer]).map(name => ({
    name,
    initials: name.split('.').map(p => p[0]?.toUpperCase() || '').join('').slice(0, 2),
  }));
  const visibleReviewers = reviewers.slice(0, 2);
  const extraReviewers = reviewers.length - visibleReviewers.length;

  return (
    <div className="tile" onClick={() => navigate('/access-reviews')}>
      <div className="tile-label-row">
        <div className="tile-label" style={{ marginBottom: 0 }}>Access Reviews</div>
        <span className="review-due-chip">Due {campaign.dueDate}</span>
      </div>

      <div className="review-headline">
        <div className="review-headline-text">
          <div className="review-headline-name">{campaign.name}</div>
          <div className="review-headline-sub">{total} access items in scope</div>
        </div>
        <div className="review-meta-reviewers" title={reviewers.map(r => r.name).join(', ')}>
          <span className="review-meta-reviewers-label">Reviewers</span>
          <div className="review-avatars">
            {visibleReviewers.map(r => (
              <span key={r.name} className="review-avatar" title={r.name}>{r.initials}</span>
            ))}
            {extraReviewers > 0 && (
              <span className="review-avatar review-avatar-more">+{extraReviewers}</span>
            )}
          </div>
        </div>
      </div>

      <div className="review-progress">
        <div className="review-progress-top">
          <div className="review-progress-pct">{completionPct}%</div>
          <div className="review-progress-label">reviewed</div>
        </div>
        <div className="review-progress-track" aria-hidden="true">
          {statusSegments.filter(s => s.value > 0).map(s => (
            <div
              key={s.label}
              className="review-progress-seg"
              style={{ width: `${s.pct}%`, background: s.color }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
        </div>
        <div className="review-progress-legend">
          {[
            { label: 'Pending', value: pending, color: 'var(--uno-grey-500)' },
            { label: 'Approved', value: approved, color: 'var(--color-desirable)' },
            { label: 'Revoked', value: revoked, color: 'var(--color-hop)' },
          ].map(s => (
            <div className="review-progress-stat" key={s.label}>
              <span className="review-progress-stat-dot" style={{ background: s.color }} />
              <span className="review-progress-stat-label">{s.label}</span>
              <span className="review-progress-stat-value" style={{ color: s.color }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 14, marginBottom: 2 }}>
        Top 5 Risky Access reviews
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly', minHeight: 0 }}>
        {topRisky.map((r, i) => {
          const sev = SEVERITY_META[r.riskBand] || SEVERITY_META.Acceptable;
          return (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0',
              borderBottom: i < topRisky.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.identityName}</span>
              <span style={{
                fontSize: 10, color: 'var(--text-tertiary)', flexShrink: 0,
                maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.resource.replace(/^[a-z]+:\/\//, '')}</span>
              <span className={`review-sev review-sev-${sev.tone}`}>{sev.label}</span>
            </div>
          );
        })}
      </div>

      <TileExit label="View review queue" onClick={() => navigate('/access-reviews')} />
    </div>
  );
}

/* ── PTRACE + MITRE tile ────────────────────────────────────── */
function ThreatTile({ navigate }) {
  const mitreFindings = useMitreFindings();
  const PTRACE_ORDER = ['P', 'T', 'R', 'A', 'C', 'E'];
  const PTRACE_META = {
    P: { lines: ['Probing', '(Recon & Discovery)'], color: 'var(--uno-green-700)' },
    T: { lines: ['Trust', 'Exploitation'], color: 'var(--uno-orange-500)' },
    R: { lines: ['Rights', 'Escalation'], color: 'var(--uno-red-500)' },
    A: { lines: ['Account Spoofing /', 'Assumption'], color: 'var(--uno-blue-500)' },
    C: { lines: ['Concealment &', 'Persistence'], color: 'var(--uno-yellow-600)' },
    E: { lines: ['Exfiltration &', 'Lateral Movement'], color: 'var(--uno-blue-700)' },
  };

  const steps = PTRACE_ORDER.map(key => {
    const data = ptraceFindingCounts[key];
    const meta = PTRACE_META[key];
    return {
      key,
      label: data.label,
      shortLabel: data.label,
      lines: meta.lines,
      value: data.count,
      severity: data.severity,
      color: meta.color,
      question: data.question,
    };
  });

  const defaultActive = Math.max(0, steps.findIndex(s => s.value === Math.max(...steps.map(x => x.value))));
  const [active, setActive] = useState(defaultActive);
  const selected = steps[active] || steps[0];
  const totalFindings = steps.reduce((s, v) => s + v.value, 0);
  const related = mitreFindings
    .filter(f => f.ptraceCategory === selected?.key)
    .slice(0, 4);

  return (
    <div className="tile tile-wide" onClick={() => navigate('/threat-profile')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="tile-label" style={{ marginBottom: 0 }}>Identity threat model</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500 }}>
          {totalFindings} findings · PTRACE
        </div>
      </div>

      <div className="threat-wide-body" style={{
        display: 'grid',
        gridTemplateColumns: '65% 35%',
        gap: 24,
        flex: 1,
        alignItems: 'stretch',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, justifyContent: 'center' }}>
          <StepFunnel
            steps={steps}
            activeIndex={active}
            onSelect={setActive}
            height={290}
            colW={118}
            barW={40}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: `color-mix(in srgb, ${selected?.color} 8%, white)`,
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${selected?.color}`,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              {selected?.label}
              <span style={{ fontWeight: 700, color: bandColor(selected?.severity), marginLeft: 8, fontSize: 12 }}>
                {selected?.severity}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.4, marginBottom: 6 }}>
              {selected?.question}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {selected?.value} active · {related.length ? related[0].technique : '—'} focus
            </div>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
            Related techniques
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            {related.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, fontFamily: 'monospace',
                  color: selected?.color,
                  background: `color-mix(in srgb, ${selected?.color} 12%, white)`,
                  padding: '3px 7px', borderRadius: 4, flexShrink: 0,
                }}>{m.technique}</span>
                <span style={{
                  fontSize: 13, color: 'var(--text-primary)', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{m.name}</span>
              </div>
            ))}
            {related.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No techniques in this stage</div>
            )}
          </div>
        </div>
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

  // Open NHIs from leavers — status derived from residual access (no hardcoded rows)
  const nhiToHi = jmlEvents
    .filter(e => e.eventType === 'leaver')
    .flatMap(event => (event.linkedNhis || [])
      .filter(nhi => nhi.offboardStatus !== 'success')
      .map(nhi => ({
        nhiId: nhi.id,
        nhi: nhi.name,
        hiId: event.identityId,
        hiName: event.identityName,
        status: (
          event.status === 'partial' || nhi.offboardStatus === 'partial'
            ? 'Partially offboarded'
            : 'Not offboarded'
        ),
      })));

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

      <div className="tile-chart-row">
        <div className="tile-chart-viz">
          <div className="donut-wrapper">
            <SegmentDonut
              size={168}
              strokeWidth={14}
              segments={statusOrder.map(s => ({
                value: counts[s],
                color: STATUS_META[s].color,
              }))}
            />
            <div className="donut-center">
              <div className="donut-center-num" style={{ color: 'var(--text-primary)', fontSize: 32 }}>{totalNhis}</div>
              <div className="donut-center-label" style={{ fontSize: 10, maxWidth: 72 }}>NHIs</div>
            </div>
          </div>
        </div>
        <div className="tile-chart-legend">
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

/* ── Identity hygiene tile ──────────────────────────────────── */
function HygieneTile({ navigate }) {
  const humansNoMfa = identities.filter(i => i.type === 'human' && !i.mfaEnabled && i.status !== 'departed');
  const humansNoMfaAll = identities.filter(i => i.type === 'human' && !i.mfaEnabled);
  const staleCreds = identities.filter(i => i.credentialAge >= 180).sort((a, b) => b.credentialAge - a.credentialAge);
  const staleNhis = identities.filter(i => i.type === 'service' && i.credentialAge >= 180);

  const issueStats = [
    { label: 'MFA off', value: humansNoMfaAll.length, color: 'var(--uno-red-500)' },
    { label: 'Stale >180d', value: staleCreds.length, color: 'var(--uno-orange-500)' },
    { label: 'Stale NHIs', value: staleNhis.length, color: 'var(--uno-yellow-500)' },
  ];
  const totalIssues = issueStats.reduce((s, i) => s + i.value, 0);
  const hygieneScore = Math.max(10, Math.min(100, Math.round(
    100 - humansNoMfaAll.length * 2 - staleCreds.length * 1 - staleNhis.length * 0.5
  )));
  const scoreColor = hygieneScore >= 70
    ? 'var(--uno-green-500)'
    : hygieneScore >= 40
      ? 'var(--uno-yellow-500)'
      : 'var(--uno-red-500)';

  const priority = [...humansNoMfa, ...staleCreds.filter(i => i.mfaEnabled || i.type === 'service')].slice(0, 5);
  const maxAge = Math.max(...priority.map(i => i.credentialAge), 1);

  return (
    <div className="tile" onClick={() => navigate('/risk-profiles')}>
      <div className="tile-label-row">
        <div className="tile-label" style={{ marginBottom: 0 }}>Identity Hygiene</div>
      </div>

      <div className="tile-chart-row">
        <div className="tile-chart-viz">
          <div className="tile-gauge-wrap">
            <RiskArc score={hygieneScore} size={200} color={scoreColor} strokeWidth={16} />
            <div className="tile-gauge-center">
              <div className="tile-gauge-num" style={{ color: scoreColor }}>{hygieneScore}</div>
              <div className="tile-gauge-label">hygiene</div>
            </div>
          </div>
        </div>
        <div className="tile-chart-legend">
          {issueStats.map(s => (
            <div className="legend-row" key={s.label}>
              <div className="legend-dot" style={{ background: s.color }} />
              <div className="legend-label">{s.label}</div>
              <div className="legend-count" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-tertiary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalIssues}</span> open issues
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: 12, marginBottom: 2 }}>
        Top 5 to fix
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-evenly' }}>
        {priority.map((id, i) => {
          const noMfa = !id.mfaEnabled && id.type === 'human';
          const barColor = noMfa ? 'var(--uno-red-500)' : 'var(--uno-orange-500)';
          return (
            <div key={id.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 0',
              borderBottom: i < priority.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span className={`hygiene-type ${id.type === 'service' ? 'is-service' : 'is-human'}`}>
                {id.type === 'service' ? 'NHI' : 'HI'}
              </span>
              <span style={{
                width: 86, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0,
              }}>{id.name}</span>
              <div style={{ flex: 1, height: 4, background: 'var(--surface-inset)', borderRadius: 999, overflow: 'hidden', minWidth: 24 }}>
                <div style={{
                  height: '100%', width: `${(id.credentialAge / maxAge) * 100}%`,
                  background: barColor, borderRadius: 999,
                }} />
              </div>
              {noMfa && <span className="hygiene-tag">No MFA</span>}
              <span style={{
                width: 34, textAlign: 'right', fontSize: 11, fontWeight: 700,
                color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>{id.credentialAge}d</span>
            </div>
          );
        })}
      </div>

      <TileExit label="View identity hygiene" onClick={() => navigate('/risk-profiles')} />
    </div>
  );
}

/* ── Resource map / blast radius tile ───────────────────────── */
function ImpactTile({ navigate }) {
  const SENS_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
  const SENS_COLOR = {
    critical: 'var(--uno-red-500)',
    high: 'var(--uno-orange-500)',
    medium: 'var(--uno-yellow-500)',
    low: 'var(--uno-green-500)',
  };

  const isDataStore = (n) => /s3:\/\/|rds:\/\/|dynamodb:\/\/|bigquery:\/\/|storage:\/\/|azure:\/\/sa-|azure:\/\/rg-/i.test(n.label || n.id);
  const isSecretOrKey = (n) => /secrets:\/\/|kms:\/\/|azure:\/\/kv-/i.test(n.label || n.id);
  const isCompute = (n) => /ec2|gke:\/\/|i-/i.test(n.label || n.id) || n.group === 'hop';

  const exposed = impactGraph.nodes.filter(n => n.type === 'resource' || n.type === 'role');
  const privilegedRoles = impactGraph.nodes.filter(n => n.type === 'role');
  const dataStores = impactGraph.nodes.filter(isDataStore);
  const secretsAndKeys = impactGraph.nodes.filter(isSecretOrKey);
  const computeWorkloads = impactGraph.nodes.filter(isCompute);
  const nonHumanIdentities = impactGraph.nodes.filter(n => n.type === 'service');
  const shadowPaths = impactGraph.links.filter(l => l.type === 'Shadow');
  const indirectPaths = impactGraph.links.filter(l => l.type === 'Indirect' || l.type === 'Shadow');

  const norm = (v, max) => Math.min(1, v / Math.max(max, 1));

  const axes = [
    { key: 'roles', label: 'Roles', lines: ['Roles'] },
    { key: 'data', label: 'Data', lines: ['Data'] },
    { key: 'secrets', label: 'Secrets', lines: ['Secrets'] },
    { key: 'compute', label: 'Compute', lines: ['Compute'] },
    { key: 'shadow', label: 'Shadow', lines: ['Shadow'] },
    { key: 'nhi', label: 'NHIs', lines: ['NHIs'] },
  ];

  const blastValues = [
    norm(privilegedRoles.length, 4),
    norm(dataStores.length, 5),
    norm(secretsAndKeys.length, 4),
    norm(computeWorkloads.length, 3),
    norm(shadowPaths.length, 5),
    norm(nonHumanIdentities.length, 3),
  ];

  const privilegeDepth = [
    norm(privilegedRoles.length, 4),
    norm(dataStores.filter(n => n.sensitivity === 'critical').length, 5),
    norm(secretsAndKeys.length, 4),
    norm(Math.max(0, computeWorkloads.length - 1), 3),
    norm(shadowPaths.length, 5),
    norm(nonHumanIdentities.length * 0.5, 3),
  ];

  const pathExposure = [
    norm(privilegedRoles.filter(n => n.group === 'compromised').length, 4),
    norm(dataStores.length * 0.6, 5),
    norm(secretsAndKeys.length * 0.5, 4),
    norm(computeWorkloads.length, 3),
    norm(indirectPaths.length, 6),
    norm(nonHumanIdentities.length, 3),
  ];

  const series = [
    { name: 'Blast radius', color: 'var(--uno-orange-500)', values: blastValues, fillOpacity: 0.18 },
    { name: 'Privilege depth', color: 'var(--uno-red-500)', values: privilegeDepth, fillOpacity: 0.14 },
    { name: 'Path exposure', color: 'var(--uno-blue-500)', values: pathExposure, fillOpacity: 0.12 },
  ];

  const stats = [
    { label: 'Privileged roles', value: privilegedRoles.length, color: 'var(--uno-red-500)' },
    { label: 'Data stores', value: dataStores.length, color: 'var(--uno-orange-500)' },
    { label: 'Secrets & keys', value: secretsAndKeys.length, color: 'var(--uno-yellow-600)' },
    { label: 'Non-human IDs', value: nonHumanIdentities.length, color: 'var(--uno-blue-500)' },
  ];

  const topResources = [...exposed]
    .sort((a, b) => {
      const groupRank = (g) => (g === 'compromised' ? 0 : g === 'reachable' ? 1 : 2);
      return (SENS_RANK[a.sensitivity] ?? 9) - (SENS_RANK[b.sensitivity] ?? 9)
        || groupRank(a.group) - groupRank(b.group)
        || a.label.localeCompare(b.label);
    })
    .slice(0, 4);

  const typeLabel = (n) => {
    if (n.type === 'role') return 'Role';
    if (isSecretOrKey(n)) return 'Secret';
    if (isDataStore(n)) return 'Data';
    if (isCompute(n)) return 'Compute';
    return 'Resource';
  };

  return (
    <div className="tile" onClick={() => navigate('/exposure-map')}>
      <div className="tile-label">Resource Map · Blast Radius</div>

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12,
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            padding: '10px 8px', borderRadius: 8, textAlign: 'center',
            background: 'var(--surface-subtle)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 5, lineHeight: 1.25 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'var(--surface-subtle)', borderRadius: 10, border: '1px solid var(--border)',
        padding: '8px 8px 10px', marginBottom: 12,
      }}>
        <RadarChart axes={axes} series={series} size={236} />
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
          {series.map(s => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
              {s.name}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
        Top exposed resources
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 0 }}>
        {topResources.map((n, i) => (
          <div key={n.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 0',
            borderBottom: i < topResources.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: 50, flexShrink: 0,
              background: SENS_COLOR[n.sensitivity] || 'var(--text-tertiary)',
            }} />
            <span style={{
              flex: 1, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{n.label}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, flexShrink: 0,
              color: SENS_COLOR[n.sensitivity] || 'var(--text-tertiary)',
              background: `color-mix(in srgb, ${SENS_COLOR[n.sensitivity] || 'var(--text-tertiary)'} 12%, white)`,
              padding: '2px 7px', borderRadius: 999,
            }}>
              {typeLabel(n)}
            </span>
          </div>
        ))}
      </div>

      <TileExit label="Open exposure map" onClick={() => navigate('/exposure-map')} />
    </div>
  );
}

/* ── Summary bar ────────────────────────────────────────────── */
export default function Dashboard() {
  const navigate = useNavigate();
  return (
    <div className="page-content">
      <div className="page-header">
        <div className="page-header-copy">
          <p className="page-welcome">Welcome back, <span className="page-welcome-name">Tom Walker</span></p>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">Security posture across all identities</p>
        </div>
      </div>
      <IdentityOverview navigate={navigate} />
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
