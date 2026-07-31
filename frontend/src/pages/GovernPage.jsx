import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function GovernPage({ onNavigate, onOpenDrawer, activeTab, onTab, data }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Govern</div>
          <h1 className={ui.pageHeadTitle}>Access reviews, lifecycle & compliance</h1>
          <p className={ui.pageHeadDesc}>Run certification campaigns, watch identities move through their lifecycle, and export audit-ready
            reports.</p>
        </div>
        <div className={ui.pageActions}><button className={ui.btnPrimary}><svg width="14" height="14" viewBox="0 0 24 24"
          fill="none">
          <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>New campaign</button></div>
      </div>

      <div className={ui.tabs}>
        <div className={cn(ui.tab, activeTab === 'g1' && ui.tabActive)} data-tab="g1" onClick={() => onTab('g1')}>Access reviews</div>
        <div className={cn(ui.tab, activeTab === 'g2' && ui.tabActive)} data-tab="g2" onClick={() => onTab('g2')}>Identity lifecycle</div>
        <div className={cn(ui.tab, activeTab === 'g3' && ui.tabActive)} data-tab="g3" onClick={() => onTab('g3')}>Reports & compliance</div>
      </div>

      <div id="g1" style={{ display: activeTab === 'g1' ? 'block' : 'none' }}>
        <div className={cn(ui.grid, ui.g3, 'mb-4')}>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Pending reviews</div>
            <div className={ui.kpiValue}>164</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Completed this cycle</div>
            <div className={ui.kpiValue} style={{ color: '#4ade80' }}>892</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Expiring in 3 days</div>
            <div className={ui.kpiValue} style={{ color: '#facc15' }}>31</div>
          </div>
        </div>
        <div className={cn(ui.grid, ui.g2, 'mb-4')}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Q3 Tier-0 access recertification</h3><span className={badgeClass('success')}>On track</span>
            </div>
            <div className={cn(ui.progress, 'mb-2')}><span className={ui.progressFill} style={{ width: '74%' }} /></div>
            <p style={{ fontSize: '11.8px', color: 'var(--text-2)', margin: '0' }}>231 of 312 items reviewed · due in 4 days</p>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>SAP finance role review</h3><span className={badgeClass('warning')}>At risk</span>
            </div>
            <div className={cn(ui.progress, 'mb-2')}><span
              className={ui.progressFill} style={{ width: '38%', background: 'linear-gradient(90deg,#F97316,#EAB308)' }} /></div>
            <p style={{ fontSize: '11.8px', color: 'var(--text-2)', margin: '0' }}>34 of 90 items reviewed · due in 2 days</p>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Identity</th>
                <th>Entitlement</th>
                <th>Reviewer</th>
                <th>Risk</th>
                <th>Justification</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#3B82F6' }}>KP</span><b>k.patel</b></td>
                <td>SAP GL_POST</td>
                <td>N. Brooks</td>
                <td><span className={badgeClass('critical')}>Critical</span></td>
                <td>No recent usage logged</td>
                <td><button className={ui.iconBtn} title="Approve" style={{ borderColor: 'rgba(34,197,94,.3)' }}><svg width="14"
                  height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" />
                </svg></button> <button className={ui.iconBtn} title="Revoke"
                  style={{ borderColor: 'rgba(239,68,68,.3)' }}><svg width="14" height="14" viewBox="0 0 24 24"
                    fill="none">
                    <path d="M6 6l12 12M18 6L6 18" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" />
                  </svg></button></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#6B7280' }}>SV</span><b>svc-billing-01</b>
                </td>
                <td>Tier-0 vault access</td>
                <td>Unassigned</td>
                <td><span className={badgeClass('critical')}>Critical</span></td>
                <td>Manager disabled</td>
                <td><button className={ui.iconBtn} style={{ borderColor: 'rgba(34,197,94,.3)' }}><svg width="14" height="14"
                  viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" />
                </svg></button> <button className={ui.iconBtn} style={{ borderColor: 'rgba(239,68,68,.3)' }}><svg width="14"
                  height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" />
                </svg></button></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#8B5CF6' }}>JC</span><b>j.chen</b></td>
                <td>GitHub org owner</td>
                <td>D. Whitfield</td>
                <td><span className={badgeClass('warning')}>Elevated</span></td>
                <td>Used 3 days ago</td>
                <td><button className={ui.iconBtn} style={{ borderColor: 'rgba(34,197,94,.3)' }}><svg width="14" height="14"
                  viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" />
                </svg></button> <button className={ui.iconBtn} style={{ borderColor: 'rgba(239,68,68,.3)' }}><svg width="14"
                  height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="#f87171" strokeWidth="2.4" strokeLinecap="round" />
                </svg></button></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="g2" style={{ display: activeTab === 'g2' ? 'block' : 'none' }}>
        <div className={ui.card}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>Identity lifecycle</h3><span className={ui.cardSub}>joiner → mover → leaver</span>
          </div>
          <div className={ui.stageflow}>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--success-bg)' }}><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none">
                <path d="M12 5v14M5 12h14" stroke="#4ade80" strokeWidth="2" />
              </svg></div>
              <h4>Joiner</h4>
              <p>HR event received</p>
            </div>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--success-bg)' }}><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none">
                <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.2" strokeLinecap="round" />
              </svg></div>
              <h4>Approved</h4>
              <p>Manager sign-off</p>
            </div>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--info-bg)' }}><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="3" stroke="#60a5fa" strokeWidth="1.8" />
              </svg></div>
              <h4>Provisioned</h4>
              <p>18 systems synced</p>
            </div>
            <div className={ui.stage}>
              <div className={cn(ui.stageConn, ui.stageConnDone)} />
              <div className={ui.stageNode} style={{ background: 'var(--warning-bg)' }}><svg width="18" height="18"
                viewBox="0 0 24 24" fill="none">
                <path d="M7 7h10v10H7z" stroke="#facc15" strokeWidth="1.8" />
              </svg></div>
              <h4>Mover</h4>
              <p>Dept change · role reassigned</p>
            </div>
            <div className={ui.stage}>
              <div className={ui.stageNode} style={{ background: 'var(--card-2)' }}><svg width="18" height="18" viewBox="0 0 24 24"
                fill="none">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="var(--text-3)" strokeWidth="1.8"
                  strokeLinecap="round" />
              </svg></div>
              <h4>Leaver</h4>
              <p style={{ color: 'var(--text-3)' }}>Not yet triggered</p>
            </div>
          </div>
        </div>
        <div className={cn(ui.grid, ui.g2, 'mt-4')}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Recent lifecycle events</h3>
            </div>
            <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#3B82F6' }} />
              <div>
                <p className={ui.lrTitle}>t.lindgren — joiner</p>
                <p className={ui.lrMeta}>Provisioning failed at AD sync</p>
              </div><time>1h ago</time>
            </div>
            <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#EAB308' }} />
              <div>
                <p className={ui.lrTitle}>m.osei — mover</p>
                <p className={ui.lrMeta}>Finance → Platform Eng, 6 entitlements pending</p>
              </div><time>Today</time>
            </div>
            <div className={ui.listRow}><span className={ui.listDot} style={{ background: '#22C55E' }} />
              <div>
                <p className={ui.lrTitle}>a.reyes — leaver</p>
                <p className={ui.lrMeta}>Deprovisioned across 22 systems</p>
              </div><time>Yesterday</time>
            </div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Leaver deprovisioning SLA</h3>
            </div>
            <div className={cn(ui.progress, 'mb-2')}><span
              className={ui.progressFill} style={{ width: '91%', background: 'linear-gradient(90deg,#22C55E,#22D3EE)' }} /></div>
            <p style={{ fontSize: '11.8px', color: 'var(--text-2)', margin: '0' }}>91% deprovisioned within 24h target · 5 stuck
              beyond SLA</p>
          </div>
        </div>
      </div>

      <div id="g3" style={{ display: activeTab === 'g3' ? 'block' : 'none' }}>
        <div className={cn(ui.grid, ui.g4)}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Executive dashboard</h3>
            </div>
            <svg viewBox="0 0 200 60" width="100%" height="60">
              <path d="M0,40 L30,35 L60,38 L90,20 L120,25 L150,10 L200,14" fill="none" stroke="#3B82F6"
                strokeWidth="2" />
            </svg>
            <div className="mt-3 flex gap-1.5"><button className={cn(ui.btn, ui.btnSm)}>PDF</button><button
              className={cn(ui.btn, ui.btnSm)}>Excel</button><button className={cn(ui.btn, ui.btnSm)}>CSV</button></div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Compliance report</h3>
            </div>
            <div className={cn(badgeClass('success'), 'mb-3')}>SOC 2 · compliant</div>
            <div className="flex gap-1.5"><button className={cn(ui.btn, ui.btnSm)}>PDF</button><button
              className={cn(ui.btn, ui.btnSm)}>Excel</button><button className={cn(ui.btn, ui.btnSm)}>CSV</button></div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Risk report</h3>
            </div>
            <div className={cn(badgeClass('medium'), 'mb-3')}>47 critical identities</div>
            <div className="flex gap-1.5"><button className={cn(ui.btn, ui.btnSm)}>PDF</button><button
              className={cn(ui.btn, ui.btnSm)}>Excel</button><button className={cn(ui.btn, ui.btnSm)}>CSV</button></div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Audit report</h3>
            </div>
            <div className={cn(badgeClass('info'), 'mb-3')}>Last export 3d ago</div>
            <div className="flex gap-1.5"><button className={cn(ui.btn, ui.btnSm)}>PDF</button><button
              className={cn(ui.btn, ui.btnSm)}>Excel</button><button className={cn(ui.btn, ui.btnSm)}>CSV</button></div>
          </div>
        </div>
      </div>
    </>
  );
}
