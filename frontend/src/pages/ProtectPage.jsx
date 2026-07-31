import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function ProtectPage({ onNavigate, onOpenDrawer, activeTab, onTab, data }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Protect</div>
          <h1 className={ui.pageHeadTitle}>Threat center</h1>
          <p className={ui.pageHeadDesc}>Identity threats, suspicious behavior, and privilege abuse — mapped to MITRE ATT&CK, with AI investigation on tap.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            Filter feed
          </button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        <div className={cn(ui.card, ui.kpi)}>
          <div className={ui.kpiLabel}>Open threats</div>
          <div className={cn(ui.kpiValue, 'text-red-400')}>18</div>
        </div>
        <div className={cn(ui.card, ui.kpi)}>
          <div className={ui.kpiLabel}>Impossible travel</div>
          <div className={ui.kpiValue}>3</div>
        </div>
        <div className={cn(ui.card, ui.kpi)}>
          <div className={ui.kpiLabel}>Credential exposure</div>
          <div className={ui.kpiValue}>5</div>
        </div>
        <div className={cn(ui.card, ui.kpi)}>
          <div className={ui.kpiLabel}>Mean time to triage</div>
          <div className={ui.kpiValue}>22<small className={ui.kpiValueSmall}>min</small></div>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g75, 'mb-4')}>
        <div className={cn(ui.card, 'overflow-hidden p-0')}>
          <div className={cn(ui.cardHead, 'px-4 pt-4 pb-0')}>
            <h3 className={ui.cardHeadH3}>Threat feed</h3>
            <span className={ui.cardSub}>live</span>
          </div>
          <div className={cn(ui.tableWrap, 'rounded-none border-0 border-t border-border')}>
            <table className="w-full">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Threat</th>
                  <th>Identity</th>
                  <th>Type</th>
                  <th>Detected</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr onClick={() => onOpenDrawer('threat')} className="cursor-pointer">
                  <td><span className={badgeClass('critical')}>Critical</span></td>
                  <td>Impossible travel</td>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#3B82F6' }}>MA</span>M. Alvarez</td>
                  <td>Identity threat</td>
                  <td>2h ago</td>
                  <td><span className={badgeClass('warning')}>Investigating</span></td>
                </tr>
                <tr>
                  <td><span className={badgeClass('medium')}>High</span></td>
                  <td>Privilege abuse</td>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#6B7280' }}>SV</span>svc-billing-01</td>
                  <td>Privilege abuse</td>
                  <td>5h ago</td>
                  <td><span className={badgeClass('critical')}>Open</span></td>
                </tr>
                <tr>
                  <td><span className={badgeClass('warning')}>Medium</span></td>
                  <td>Credential exposure</td>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#8B5CF6' }}>JC</span>j.chen</td>
                  <td>Credential exposure</td>
                  <td>Yesterday</td>
                  <td><span className={badgeClass('info')}>Acknowledged</span></td>
                </tr>
                <tr>
                  <td><span className={badgeClass('medium')}>High</span></td>
                  <td>Dormant admin reactivated</td>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#22D3EE' }}>TO</span>t.owusu</td>
                  <td>Inactive admin</td>
                  <td>Yesterday</td>
                  <td><span className={badgeClass('critical')}>Open</span></td>
                </tr>
                <tr>
                  <td><span className={badgeClass('inactive')}>Low</span></td>
                  <td>New impossible geo-pair</td>
                  <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#F97316' }}>RS</span>r.singh</td>
                  <td>Identity threat</td>
                  <td>2d ago</td>
                  <td><span className={badgeClass('success')}>Resolved</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className={cn(ui.card, 'border-[rgba(139,92,246,.3)] bg-grad-soft')}>
          <div className={ui.cardHead}>
            <h3 className={ui.cardHeadH3}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-purple-300">
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              </svg>
              AI investigation summary
            </h3>
          </div>
          <p className="mb-2.5 text-[12.4px] leading-relaxed"><b>M. Alvarez — impossible travel.</b> Sign-in from Lagos at 09:14 UTC, then Warsaw at 09:25 UTC. No travel record, no VPN flag. Device fingerprint changed between sessions.</p>
          <p className="mb-3 text-[12.4px] leading-relaxed">Correlates with <b>T1078 — Valid Accounts</b>. Recommend session revoke and step-up auth.</p>
          <button className={cn(ui.btnPrimary, ui.btnSm, 'mb-2 w-full justify-center')}>Revoke active sessions</button>
          <button className={cn(ui.btn, ui.btnSm, 'w-full justify-center')}>Require step-up MFA</button>
        </div>
      </div>

      <div className={cn(ui.card, 'mb-4')}>
        <div className={ui.cardHead}>
          <h3 className={ui.cardHeadH3}>MITRE ATT&CK mapping</h3>
          <span className={ui.cardSub}>last 7 days</span>
        </div>
        <div className={ui.mitreGrid}>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Initial access</h5>
            <div className={cn(ui.mitreCell, ui.mitreHit)}>Valid accounts</div>
            <div className={ui.mitreCell}>Phishing</div>
            <div className={ui.mitreCell}>Trusted relationship</div>
          </div>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Persistence</h5>
            <div className={ui.mitreCell}>Account manip.</div>
            <div className={cn(ui.mitreCell, ui.mitreHit)}>Create account</div>
          </div>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Privilege esc.</h5>
            <div className={cn(ui.mitreCell, ui.mitreHit)}>Valid accounts</div>
            <div className={cn(ui.mitreCell, ui.mitreHit)}>Abuse elevation</div>
          </div>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Credential access</h5>
            <div className={cn(ui.mitreCell, ui.mitreHit)}>Unsecured creds</div>
            <div className={ui.mitreCell}>Brute force</div>
          </div>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Lateral movement</h5>
            <div className={ui.mitreCell}>Remote services</div>
            <div className={ui.mitreCell}>Internal spearphish</div>
          </div>
          <div className={ui.mitreCol}>
            <h5 className={ui.mitreColH5}>Exfiltration</h5>
            <div className={ui.mitreCell}>Automated exfil</div>
            <div className={ui.mitreCell}>Exfil over web</div>
          </div>
        </div>
      </div>

      <div className={ui.card}>
        <div className={ui.cardHead}>
          <h3 className={ui.cardHeadH3}>Risk timeline</h3>
          <span className={ui.cardSub}>14d, threats per day</span>
        </div>
        <svg viewBox="0 0 900 90" width="100%" height="90">
          <g fill="#EF4444">
            <rect x="0" y="60" width="18" height="30" rx="2" />
            <rect x="30" y="50" width="18" height="40" rx="2" />
            <rect x="60" y="70" width="18" height="20" rx="2" fill="#F97316" />
            <rect x="90" y="40" width="18" height="50" rx="2" />
            <rect x="120" y="65" width="18" height="25" rx="2" fill="#F97316" />
            <rect x="150" y="30" width="18" height="60" rx="2" />
            <rect x="180" y="55" width="18" height="35" rx="2" fill="#F97316" />
            <rect x="210" y="20" width="18" height="70" rx="2" />
            <rect x="240" y="48" width="18" height="42" rx="2" />
            <rect x="270" y="10" width="18" height="80" rx="2" />
            <rect x="300" y="58" width="18" height="32" rx="2" fill="#F97316" />
            <rect x="330" y="35" width="18" height="55" rx="2" />
          </g>
        </svg>
      </div>
    </>
  );
}
