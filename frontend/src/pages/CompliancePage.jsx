import { compliance } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function CompliancePage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Compliance</div>
          <h1 className={ui.pageHeadTitle}>Framework readiness at a glance</h1>
          <p className={ui.pageHeadDesc}>ISO 27001, SOC 2, NIST, PCI DSS, HIPAA, and GDPR — progress, controls, evidence, and auditor-ready status.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn} onClick={() => onNavigate('reports')}>Evidence pack</button>
          <button className={ui.btnPrimary}>Schedule audit</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g3, 'mb-4')}>
        {compliance.map((c) => (
          <div className={ui.card} key={c.framework}>
            <div className="mb-2.5 flex justify-between">
              <div className={cn(ui.cardTitle, 'm-0')}>{c.framework}</div>
              <span className={cn(ui.chip, c.status.includes('risk') ? ui.chipCrit : c.status.includes('ready') ? ui.chipOk : ui.chipActive)}>{c.status}</span>
            </div>
            <div className={cn(ui.kpiValue, 'text-[32px]')}>{c.score}<small className={ui.kpiValueSmall}>%</small></div>
            <div className={cn(ui.scoreBar, 'my-3')}><i style={{ width: `${c.score}%` }} /></div>
            <div className="flex justify-between text-[12.5px] text-text-3">
              <span>{c.controls} controls</span>
              <span>{c.gaps} gaps</span>
            </div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={ui.card}>
          <div className={ui.cardTitle}>Control backlog</div>
          <table className="w-full">
            <thead>
              <tr>
                <th>Control</th>
                <th>Framework</th>
                <th>Owner</th>
                <th>Evidence</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['AC-2 Account management', 'NIST', 'Identity', 'Partial', 'Open'],
                ['CC6.1 Logical access', 'SOC 2', 'SecOps', 'Attached', 'Ready'],
                ['A.9.2.3 Privileged access', 'ISO 27001', 'IAM', 'Missing', 'Open'],
                ['Req 8 MFA', 'PCI DSS', 'Platform', 'Partial', 'In review'],
              ].map((r) => (
                <tr key={r[0]}>
                  <td className="font-semibold">{r[0]}</td>
                  <td>{r[1]}</td>
                  <td>{r[2]}</td>
                  <td>{r[3]}</td>
                  <td>{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={ui.card}>
          <div className={ui.cardTitle}>Recommendations</div>
          <div className={ui.actionItem}><b>Close privileged access evidence gap</b><div className="text-[12.5px] text-text-3">ISO A.9.2.3 · blocks audit readiness</div></div>
          <div className={ui.actionItem}><b>Complete MFA attestation for PCI scope</b><div className="text-[12.5px] text-text-3">12 systems pending screenshot evidence</div></div>
          <div className={ui.actionItem}><b>Refresh NIST AC-2 review cycle</b><div className="text-[12.5px] text-text-3">Quarterly review overdue by 11 days</div></div>
          <button className={cn(ui.btnPrimary, 'mt-2 w-full justify-center')} onClick={() => onNavigate('copilot')}>
            Draft auditor narrative
          </button>
        </div>
      </div>
    </>
  );
}
