import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function AnalyzePage({ onNavigate, onOpenDrawer, activeTab, onTab, data }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Analyze</div>
          <h1 className={ui.pageHeadTitle}>Risk profiles, exposure & blast radius</h1>
          <p className={ui.pageHeadDesc}>Understand how risky an identity is, what it can reach, and what happens the moment it's compromised.</p>
        </div>
        <div className={ui.pageActions}><button className={ui.btnPrimary} onClick={() => onNavigate('copilot')}><svg width="14" height="14"
          viewBox="0 0 24 24" fill="none">
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.8" />
        </svg>Ask AI about this</button></div>
      </div>

      <div className={ui.tabs}>
        <div className={cn(ui.tab, activeTab === 'a1' && ui.tabActive)} data-tab="a1" onClick={() => onTab('a1')}>Risk profile</div>
        <div className={cn(ui.tab, activeTab === 'a2' && ui.tabActive)} data-tab="a2" onClick={() => onTab('a2')}>Exposure & reachability</div>
        <div className={cn(ui.tab, activeTab === 'a3' && ui.tabActive)} data-tab="a3" onClick={() => onTab('a3')}>Blast radius / impact</div>
      </div>

      <div id="a1" style={{ display: activeTab === 'a1' ? 'block' : 'none' }}>
        <div className={cn(ui.card, 'mb-4')}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
            <div
              style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'linear-gradient(135deg,#8B5CF6,#3B82F6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px', color: '#fff', flexShrink: '0' }}>
              JD</div>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: '0', fontSize: '17px' }}>John Doe</h2>
                <span className={badgeClass('critical')}>Critical risk</span>
                <span className={ui.pillTier}>Tier-0 privileged</span>
              </div>
              <p style={{ color: 'var(--text-2)', fontSize: '12.8px', margin: '6px 0 0' }}>Senior Cloud Engineer · Platform
                Infrastructure · Manager: D. Whitfield (disabled)</p>
              <div style={{ display: 'flex', gap: '18px', marginTop: '12px', fontSize: '11.8px', color: 'var(--text-2)' }}>
                <span>Department <b style={{ color: 'var(--text-1)' }}>Platform Eng</b></span>
                <span>Criticality <b style={{ color: 'var(--text-1)' }}>Business-critical</b></span>
                <span>Last login <b style={{ color: 'var(--text-1)' }}>14 hours ago</b></span>
                <span>MFA <b style={{ color: '#f87171' }}>Not enrolled</b></span>
              </div>
            </div>
            <div className={ui.gaugeWrap}>
              <div className="gauge">
                <svg width="88" height="88" viewBox="0 0 88 88">
                  <circle cx="44" cy="44" r="38" fill="none" stroke="var(--card-2)" strokeWidth="8" />
                  <circle cx="44" cy="44" r="38" fill="none" stroke="#EF4444" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray="196 239" />
                </svg>
                <div className="gauge-val"><b>8.9</b><span>RISK / 10</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className={cn(ui.grid, ui.g75, 'mb-4')}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Risk timeline</h3><span className={ui.cardSub}>30d</span>
            </div>
            <svg viewBox="0 0 460 90" width="100%" height="90">
              <defs>
                <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#EF4444" stopOpacity=".3" />
                  <stop offset="1" stopColor="#EF4444" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0,70 L40,66 L80,60 L120,62 L160,40 L200,44 L240,30 L280,34 L320,18 L360,22 L400,10 L460,8 L460,90 L0,90 Z"
                fill="url(#gC)" />
              <path d="M0,70 L40,66 L80,60 L120,62 L160,40 L200,44 L240,30 L280,34 L320,18 L360,22 L400,10 L460,8"
                fill="none" stroke="#EF4444" strokeWidth="2.2" />
            </svg>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Risk factors</h3>
            </div>
            <div className={ui.listRow}><span className={badgeClass('critical')}>Critical</span>
              <p className={ui.lrTitle} style={{ marginLeft: '8px' }}>Reaches Tier-0 AWS vault</p>
            </div>
            <div className={ui.listRow}><span className={badgeClass('medium')}>Medium</span>
              <p className={ui.lrTitle} style={{ marginLeft: '8px' }}>MFA not enrolled</p>
            </div>
            <div className={ui.listRow}><span className={badgeClass('warning')}>Elevated</span>
              <p className={ui.lrTitle} style={{ marginLeft: '8px' }}>Dormant 14h, standing admin</p>
            </div>
            <div className={ui.listRow}><span className={badgeClass('inactive')}>Info</span>
              <p className={ui.lrTitle} style={{ marginLeft: '8px' }}>Manager account disabled</p>
            </div>
          </div>
        </div>

        <div className={cn(ui.grid, ui.g2, 'mb-4')}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Privilege analysis</h3>
            </div>
            <div className={ui.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Entitlement</th>
                    <th>Source</th>
                    <th>Tier</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>AWS root vault access</td>
                    <td>Direct grant</td>
                    <td><span className={badgeClass('critical')}>Tier-0</span></td>
                  </tr>
                  <tr>
                    <td>Kubernetes cluster-admin</td>
                    <td>Group: platform-sre</td>
                    <td><span className={badgeClass('medium')}>Tier-1</span></td>
                  </tr>
                  <tr>
                    <td>GitHub org owner</td>
                    <td>Direct grant</td>
                    <td><span className={badgeClass('warning')}>Tier-1</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Behavior analytics</h3><span className={ui.cardSub}>vs peer group</span>
            </div>
            <svg viewBox="0 0 300 90" width="100%" height="90">
              <line x1="0" y1="75" x2="300" y2="75" stroke="var(--border)" />
              <g fill="#3B82F6" opacity=".85">
                <rect x="10" y="50" width="14" height="25" />
                <rect x="50" y="40" width="14" height="35" />
                <rect x="90" y="55" width="14" height="20" />
                <rect x="130" y="20" width="14" height="55" />
                <rect x="170" y="45" width="14" height="30" />
                <rect x="210" y="10" width="14" height="65" fill="#EF4444" />
                <rect x="250" y="48" width="14" height="27" />
              </g>
            </svg>
            <p style={{ fontSize: '11.5px', color: 'var(--text-2)', margin: '6px 0 0' }}>Off-hours privileged session on <b
              style={{ color: '#f87171' }}>Jul 28</b> — 5.4× peer baseline.</p>
          </div>
        </div>

        <div className={cn(ui.grid, ui.g75)}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Attack path</h3><span className={ui.cardSub}>shortest to Tier-0</span>
            </div>
            <svg viewBox="0 0 460 110" width="100%" height="110">
              <g stroke="#EF4444" strokeWidth="1.8" className="gedge">
                <line x1="40" y1="55" x2="150" y2="30" />
                <line x1="150" y1="30" x2="270" y2="70" />
                <line x1="270" y1="70" x2="400" y2="35" />
              </g>
              <circle cx="40" cy="55" r="18" fill="#111827" stroke="#22D3EE" strokeWidth="2.5" /><text x="40" y="80"
                textAnchor="middle" className="gnode-sub">John Doe</text>
              <circle cx="150" cy="30" r="14" fill="#111827" stroke="#8B5CF6" strokeWidth="2" /><text x="150" y="12"
                textAnchor="middle" className="gnode-sub">platform-sre</text>
              <circle cx="270" cy="70" r="14" fill="#111827" stroke="#8B5CF6" strokeWidth="2" /><text x="270" y="92"
                textAnchor="middle" className="gnode-sub">k8s-admin role</text>
              <circle cx="400" cy="35" r="20" fill="#111827" stroke="#EF4444" strokeWidth="2.5" /><text x="400"
                y="14" textAnchor="middle" className="gnode-sub">AWS root vault</text>
            </svg>
          </div>
          <div className={ui.card} style={{ background: 'var(--grad-soft)', borderColor: 'rgba(139,92,246,.3)' }}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: '#a78bfa' }}>
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              </svg>AI summary</h3>
            </div>
            <p style={{ fontSize: '12.6px', lineHeight: '1.6', margin: '0 0 12px' }}>John reaches the AWS production vault in 2
              hops through <b>platform-sre</b>, without MFA, and hasn't authenticated in 14 hours. His manager's
              account is disabled, so approvals for his access are effectively unowned.</p>
            <button className={cn(ui.btnPrimary, ui.btnSm, 'w-full justify-center')}>Recommend: enforce MFA
              + reassign owner</button>
          </div>
        </div>
      </div>

      <div id="a2" style={{ display: activeTab === 'a2' ? 'block' : 'none' }}>
        <div className={ui.filterbar}>
          <span className={cn(ui.chip, ui.chipActive)}>Attack paths</span>
          <span className={ui.chip}>Privilege escalation</span>
          <span className={ui.chip}>Shadow admins</span>
          <span className={ui.chip}>Lateral movement</span>
          <span className={ui.chip}>Reachability</span>
        </div>
        <div className={cn(ui.card, ui.graphPanel)} style={{ height: '420px', padding: '0' }}>
          <div className={ui.graphToolbar}>
            <button className={ui.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg></button>
            <button className={ui.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg></button>
          </div>
          <svg viewBox="0 0 900 420" width="100%" height="100%">
            <g strokeWidth="1.4" fill="none" opacity=".8">
              <path className="gedge" d="M100,340 C160,300 180,260 240,240" stroke="#3B82F6" />
              <path className="gedge" d="M240,240 C300,220 320,180 380,150" stroke="#3B82F6" />
              <path className="gedge" d="M380,150 C440,120 460,90 520,70" stroke="#EF4444" />
              <path d="M150,120 C220,140 260,160 300,180" stroke="#6B7280" />
              <path d="M600,320 C560,280 500,250 460,220" stroke="#6B7280" />
              <path className="gedge" d="M600,320 C660,280 680,240 720,200" stroke="#F97316" />
              <path className="gedge" d="M720,200 C760,160 780,120 800,90" stroke="#EF4444" />
            </g>
            <circle cx="100" cy="340" r="14" fill="#111827" stroke="#3B82F6" strokeWidth="2" />
            <circle cx="150" cy="120" r="10" fill="#111827" stroke="#6B7280" strokeWidth="2" />
            <circle cx="240" cy="240" r="12" fill="#111827" stroke="#3B82F6" strokeWidth="2" />
            <circle cx="380" cy="150" r="12" fill="#111827" stroke="#8B5CF6" strokeWidth="2" />
            <circle cx="600" cy="320" r="14" fill="#111827" stroke="#F97316" strokeWidth="2.5" /><text x="600"
              y="345" textAnchor="middle" className="gnode-sub">shadow admin</text>
            <circle cx="720" cy="200" r="12" fill="#111827" stroke="#F97316" strokeWidth="2" />
            <circle cx="520" cy="70" r="20" fill="#111827" stroke="#EF4444" strokeWidth="2.5" /><text x="520" y="48"
              textAnchor="middle" className="gnode-sub">Tier-0: SAP GL</text>
            <circle cx="800" cy="90" r="20" fill="#111827" stroke="#EF4444" strokeWidth="2.5" /><text x="800" y="68"
              textAnchor="middle" className="gnode-sub">Tier-0: AWS vault</text>
          </svg>
          <div className={ui.graphLegend}>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#3B82F6' }} />identity</span>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#F97316' }} />shadow admin path</span>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#EF4444' }} />Tier-0 asset</span>
          </div>
        </div>
      </div>

      <div id="a3" style={{ display: activeTab === 'a3' ? 'block' : 'none' }}>
        <div className={cn(ui.card, 'mb-4')} style={{ background: 'var(--grad-soft)', borderColor: 'rgba(139,92,246,.3)' }}>
          <p style={{ margin: '0', fontSize: '13.5px' }}>If <b>svc-billing-01</b> is compromised right now —</p>
        </div>
        <div className={cn(ui.grid, ui.g4, 'mb-4')}>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Affected applications</div>
            <div className={ui.kpiValue} style={{ color: '#fb923c' }}>14</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Sensitive resources</div>
            <div className={ui.kpiValue} style={{ color: '#f87171' }}>6</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Critical assets in blast radius</div>
            <div className={ui.kpiValue} style={{ color: '#f87171' }}>3</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Estimated business impact</div>
            <div className={ui.kpiValue}>High</div>
          </div>
        </div>
        <div className={cn(ui.card, ui.graphPanel)} style={{ height: '340px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 500 300" width="100%" height="300">
            <circle cx="250" cy="150" r="120" fill="none" stroke="#EF4444" strokeOpacity=".15" strokeWidth="30" />
            <circle cx="250" cy="150" r="80" fill="none" stroke="#F97316" strokeOpacity=".18" strokeWidth="24" />
            <circle cx="250" cy="150" r="26" fill="#111827" stroke="#EF4444" strokeWidth="3" /><text x="250" y="155"
              textAnchor="middle" className="gnode-label">svc-billing-01</text>
            <g className="gedge" stroke="#F97316" strokeWidth="1.6">
              <line x1="250" y1="150" x2="190" y2="80" />
              <line x1="250" y1="150" x2="330" y2="70" />
              <line x1="250" y1="150" x2="380" y2="150" />
              <line x1="250" y1="150" x2="150" y2="220" />
            </g>
            <circle cx="190" cy="80" r="12" fill="#111827" stroke="#F97316" strokeWidth="2" /><text x="190" y="60"
              textAnchor="middle" className="gnode-sub">Stripe billing</text>
            <circle cx="330" cy="70" r="12" fill="#111827" stroke="#EF4444" strokeWidth="2" /><text x="330" y="50"
              textAnchor="middle" className="gnode-sub">Customer PII DB</text>
            <circle cx="380" cy="150" r="10" fill="#111827" stroke="#F97316" strokeWidth="2" />
            <circle cx="150" cy="220" r="10" fill="#111827" stroke="#EF4444" strokeWidth="2" /><text x="150" y="245"
              textAnchor="middle" className="gnode-sub">Finance ledger</text>
          </svg>
        </div>
      </div>
    </>
  );
}
