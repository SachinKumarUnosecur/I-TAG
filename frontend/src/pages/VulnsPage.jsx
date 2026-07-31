import { vulns } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

const riskSev = (risk) => sevClass(risk.toLowerCase());

export default function VulnsPage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Vulnerability Management</div>
          <h1 className={ui.pageHeadTitle}>Prioritize what attackers can exploit</h1>
          <p className={ui.pageHeadDesc}>CVSS, exploit availability, asset blast radius, and remediation progress — ordered by real risk, not just score.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Export CSV</button>
          <button className={ui.btnPrimary} onClick={() => onNavigate('copilot')}>Patch plan with AI</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {[
          ['Critical open', '12', 'var(--critical-bg)'],
          ['Exploit in wild', '3', 'var(--medium-bg)'],
          ['Assets affected', '45', 'var(--warning-bg)'],
          ['Remediation SLA', '71%', 'var(--success-bg)'],
        ].map(([label, value, bg]) => (
          <div className={cn(ui.card, ui.kpi)} key={label}>
            <div className={ui.kpiTop}><span className={ui.kpiLabel}>{label}</span><div className={ui.kpiIcon} style={{ background: bg }} /></div>
            <div className={ui.kpiValue}>{value}</div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={cn(ui.card, 'overflow-hidden p-0')}>
          <table className="w-full">
            <thead>
              <tr>
                <th>Vulnerability</th>
                <th>CVSS</th>
                <th>Risk</th>
                <th>Assets</th>
                <th>Exploit</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {vulns.map((v) => (
                <tr key={v.cve}>
                  <td>
                    <div className={cn(ui.mono, 'text-[11px] text-cyan')}>{v.cve}</div>
                    <div className="font-semibold">{v.title}</div>
                    <div className="text-xs text-text-3">Patch: {v.patch}</div>
                  </td>
                  <td><b>{v.cvss}</b></td>
                  <td><span className={riskSev(v.risk)}>{v.risk}</span></td>
                  <td>{v.assets}</td>
                  <td>{v.exploit}</td>
                  <td className="min-w-[120px]">
                    <div className={ui.progressRingLabel}><span /><span>{v.progress}%</span></div>
                    <div className={ui.scoreBar}><i style={{ width: `${v.progress}%` }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={ui.card}>
          <div className={ui.cardTitle}>Priority queue</div>
          <div className={cn(ui.cardSub, 'mb-3')}>Fix-first recommendations</div>
          <div className={ui.actionItem}>
            <b>CVE-2026-2144 on payments-api</b>
            <div className="mb-2 text-[12.5px] text-text-3">Exploit in the wild · internet-facing · CVSS 9.8</div>
            <button className={cn(ui.btnPrimary, ui.btnSm)}>Create change</button>
          </div>
          <div className={ui.actionItem}>
            <b>Kubelet privilege escalation</b>
            <div className="mb-2 text-[12.5px] text-text-3">14 nodes · PoC public · roll in maintenance window</div>
            <button className={cn(ui.btn, ui.btnSm)}>View assets</button>
          </div>
          <div className={cn(ui.cardTitle, 'my-4 mb-2.5')}>Remediation trend</div>
          <div className={cn(ui.spark, 'h-16')}>
            {[40, 42, 48, 55, 52, 60, 66, 70, 74, 78, 82, 88].map((h, i) => (
              <i key={i} style={{ height: `${h}%`, background: 'linear-gradient(180deg,#22C55E,rgba(34,197,94,.25))' }} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
