import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function TracePage({ onNavigate, onOpenDrawer, activeTab, onTab, data }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Trace</div>
          <h1 className={ui.pageHeadTitle}>Access lineage & provisioning</h1>
          <p className={ui.pageHeadDesc}>Follow any grant back to who requested it, who approved it, and where it was inherited from — with a full
            timeline.</p>
        </div>
        <div className={ui.pageActions}><button className={ui.btn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 3v13M7 11l5 5 5-5M4 21h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
            strokeLinejoin="round" />
        </svg>Export lineage</button></div>
      </div>

      <div className={ui.tabs}>
        <div className={cn(ui.tab, activeTab === 't1' && ui.tabActive)} data-tab="t1" onClick={() => onTab('t1')}>Access lineage</div>
        <div className={cn(ui.tab, activeTab === 't2' && ui.tabActive)} data-tab="t2" onClick={() => onTab('t2')}>Delegation chain</div>
        <div className={cn(ui.tab, activeTab === 't3' && ui.tabActive)} data-tab="t3" onClick={() => onTab('t3')}>Provision chain</div>
      </div>

      <div id="t1" style={{ display: activeTab === 't1' ? 'block' : 'none' }}>
        <div className={ui.filterbar}>
          <div className={ui.searchSm}><input className={ui.searchSmInput} placeholder="Trace identity, e.g. k.patel" /></div>
          <span className={cn(ui.chip, ui.chipActive)}>k.patel → SAP GL_POST</span>
          <span className={ui.chip}>4 hops</span>
          <span className={ui.chip}>Inherited via group</span>
        </div>
        <div className={cn(ui.card, ui.graphPanel)} style={{ height: '400px', padding: '0' }}>
          <div className={ui.graphToolbar}>
            <button className={ui.iconBtn} title="Zoom in"><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" stroke="currentColor" strokeWidth="1.8"
                strokeLinecap="round" />
            </svg></button>
            <button className={ui.iconBtn} title="Zoom out"><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
              <path d="M21 21l-4.3-4.3M8 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg></button>
            <button className={ui.iconBtn} title="Reset view"><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.5 3M19.5 9A8 8 0 005 6" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" />
            </svg></button>
          </div>
          <svg viewBox="0 0 900 400" width="100%" height="100%">
            <g strokeWidth="1.6" fill="none">
              <path className="gedge" d="M110,200 C190,150 220,120 300,110" stroke="#3B82F6" />
              <path className="gedge" d="M300,110 C380,100 420,150 480,200" stroke="#8B5CF6" />
              <path className="gedge" d="M480,200 C560,240 600,260 680,270" stroke="#8B5CF6" />
              <path className="gedge" d="M680,270 C740,280 760,240 800,210" stroke="#EF4444" />
              <path className="gedge" d="M300,110 C340,60 380,50 440,55" stroke="#3B82F6" opacity=".4" />
            </g>
            <g>
              <circle cx="110" cy="200" r="26" fill="#111827" stroke="#22D3EE" strokeWidth="2.5" /><text x="110"
                y="196" textAnchor="middle" className="gnode-label">k.patel</text><text x="110" y="209"
                  textAnchor="middle" className="gnode-sub">user</text>
            </g>
            <g>
              <circle cx="440" cy="55" r="18" fill="#111827" stroke="#3B82F6" strokeWidth="2" /><text x="440" y="51"
                textAnchor="middle" className="gnode-label" style={{ fontSize: '8.5px' }}>N. Brooks</text><text x="440" y="63"
                  textAnchor="middle" className="gnode-sub">approved</text>
            </g>
            <g>
              <circle cx="300" cy="110" r="22" fill="#111827" stroke="#8B5CF6" strokeWidth="2.5" /><text x="300"
                y="106" textAnchor="middle" className="gnode-label" style={{ fontSize: '9px' }}>fin-analysts</text><text
                  x="300" y="119" textAnchor="middle" className="gnode-sub">group</text>
            </g>
            <g>
              <circle cx="480" cy="200" r="22" fill="#111827" stroke="#8B5CF6" strokeWidth="2.5" /><text x="480"
                y="196" textAnchor="middle" className="gnode-label" style={{ fontSize: '9px' }}>GL_ANALYST</text><text x="480"
                  y="209" textAnchor="middle" className="gnode-sub">role</text>
            </g>
            <g>
              <circle cx="680" cy="270" r="22" fill="#111827" stroke="#22D3EE" strokeWidth="2.5" /><text x="680"
                y="266" textAnchor="middle" className="gnode-label" style={{ fontSize: '9px' }}>GL_POST</text><text x="680"
                  y="279" textAnchor="middle" className="gnode-sub">permission</text>
            </g>
            <g>
              <circle cx="800" cy="210" r="26" fill="#111827" stroke="#EF4444" strokeWidth="2.5" /><text x="800"
                y="206" textAnchor="middle" className="gnode-label">SAP GL</text><text x="800" y="219"
                  textAnchor="middle" className="gnode-sub">Tier-0 resource</text>
            </g>
          </svg>
          <div className={ui.graphLegend}>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#22D3EE' }} />identity / target</span>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#8B5CF6' }} />group / role</span>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#3B82F6' }} />approver</span>
            <span className="lg-item"><span className="lg-dot" style={{ background: '#EF4444' }} />Tier-0 resource</span>
          </div>
        </div>
        <div className={cn(ui.card, 'mt-4')}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Lineage timeline</h3><span className={ui.cardSub}>Mar 2024 — present</span>
          </div>
          <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#3B82F6' }} />
            <div>
              <p className={ui.lrTitle}>k.patel added to group fin-analysts</p>
              <p className={ui.lrMeta}>Requested by manager D. Whitfield</p>
            </div><time>Mar 12, 2024</time>
          </div>
          <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#8B5CF6' }} />
            <div>
              <p className={ui.lrTitle}>fin-analysts nested under role GL_ANALYST</p>
              <p className={ui.lrMeta}>Approved by N. Brooks · change ticket CH-4471</p>
            </div><time>Mar 14, 2024</time>
          </div>
          <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#EAB308' }} />
            <div>
              <p className={ui.lrTitle}>GL_ANALYST granted GL_POST permission</p>
              <p className={ui.lrMeta}>Bundled in SAP role template update</p>
            </div><time>Aug 2, 2024</time>
          </div>
          <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#EF4444' }} />
            <div>
              <p className={ui.lrTitle}>GL_POST resolved to Tier-0 SAP GL resource</p>
              <p className={ui.lrMeta}>Flagged: no direct approval on record for Tier-0 reach</p>
            </div><time>Detected today</time>
          </div>
        </div>
      </div>

      <div id="t2" style={{ display: activeTab === 't2' ? 'block' : 'none' }}>
        <div className={ui.card}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Delegation chain — svc-crm-sync</h3>
          </div>
          <div className={ui.listRow}><span className={ui.avatarSm} style={{ background: '#3B82F6' }}>MA</span>
            <div>
              <p className={ui.lrTitle}>M. Alvarez (App owner)</p>
              <p className={ui.lrMeta}>Delegated Salesforce admin scope</p>
            </div><span className={badgeClass('info')}>Owner</span>
          </div>
          <div className={ui.listRow} style={{ paddingLeft: '26px' }}><span className={ui.avatarSm}
            style={{ background: '#8B5CF6' }}>KP</span>
            <div>
              <p className={ui.lrTitle}>K. Patel (Integration lead)</p>
              <p className={ui.lrMeta}>Delegated to service account provisioning</p>
            </div><span className={badgeClass('warning')}>Delegate</span>
          </div>
          <div className={ui.listRow} style={{ paddingLeft: '52px' }}><span className={ui.avatarSm}
            style={{ background: '#6B7280' }}>SV</span>
            <div>
              <p className={ui.lrTitle}>svc-crm-sync</p>
              <p className={ui.lrMeta}>Holds Salesforce admin, unattended, no MFA</p>
            </div><span className={badgeClass('critical')}>Elevated risk</span>
          </div>
        </div>
      </div>

      <div id="t3" style={{ display: activeTab === 't3' ? 'block' : 'none' }}>
        <div className={ui.card}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Provision chain — joiner to leaver</h3><span className={ui.cardSub}>Org-wide, live</span>
          </div>
          <div className={cn(ui.stageflow, 'mt-2')}>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--success-bg)' }}><svg width="20" height="20"
                viewBox="0 0 24 24" fill="none">
                <path d="M12 2l7 3v6c0 5-3.5 8-7 9-3.5-1-7-4-7-9V5l7-3Z" stroke="#4ade80" strokeWidth="1.8" />
              </svg></div>
              <h4>Joiner</h4>
              <p>412 this month</p>
            </div>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--success-bg)' }}><svg width="20" height="20"
                viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" />
              </svg></div>
              <h4>Approvals</h4>
              <p>398 auto-approved</p>
            </div>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--info-bg)' }}><svg width="20" height="20"
                viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="3" stroke="#60a5fa" strokeWidth="1.8" />
                <path d="M9 12h6" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" />
              </svg></div>
              <h4>Provisioning</h4>
              <p>391 completed · 7 failed</p>
            </div>
            <div className={ui.stage}>
              <div className={ui.stageConn} />
              <div className={ui.stageNode} style={{ background: 'var(--warning-bg)' }}><svg width="20" height="20"
                viewBox="0 0 24 24" fill="none">
                <path d="M12 3v13M7 11l5 5 5-5" stroke="#facc15" strokeWidth="1.8" strokeLinecap="round"
                  strokeLinejoin="round" />
              </svg></div>
              <h4>Changes</h4>
              <p>1,204 role updates</p>
            </div>
            <div className={ui.stage}>
              <div className={ui.stageNode} style={{ background: 'var(--inactive-bg)' }}><svg width="20" height="20"
                viewBox="0 0 24 24" fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="#9ca3af"
                  strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg></div>
              <h4>Termination</h4>
              <p>58 deprovisioned</p>
            </div>
          </div>
        </div>
        <div className={cn(ui.card, 'mt-4')}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Provisioning failures</h3>
          </div>
          <div className={ui.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>Stage</th>
                  <th>System</th>
                  <th>Error</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#8B5CF6' }}>TL</span><b>t.lindgren</b>
                  </td>
                  <td>Provisioning</td>
                  <td>Workday → AD sync</td>
                  <td>Manager attribute null</td>
                  <td>1h ago</td>
                </tr>
                <tr>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#3B82F6' }}>RS</span><b>r.singh</b></td>
                  <td>Provisioning</td>
                  <td>Okta → SAP</td>
                  <td>Duplicate employee ID</td>
                  <td>3h ago</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
