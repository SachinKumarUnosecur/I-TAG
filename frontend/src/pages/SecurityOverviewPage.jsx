import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function SecurityOverviewPage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Security Overview</div>
          <h1 className={ui.pageHeadTitle}>Posture across every control plane</h1>
          <p className={ui.pageHeadDesc}>Identity, cloud, endpoint, and detection health in one operational read — built for CISO briefings and SOC shift handoff.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btnPrimary} onClick={() => onNavigate('copilot')}>Summarize with AI</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {[
          { title: 'Identity', score: 78, note: '47 critical identities', page: 'identity' },
          { title: 'Cloud', score: 71, note: '23 misconfigurations', page: 'cloud' },
          { title: 'Endpoint', score: 84, note: '2 devices elevated risk', page: 'endpoints' },
          { title: 'Detection', score: 91, note: '6 active threats', page: 'threats' },
        ].map((d) => (
          <div className={cn(ui.card, ui.kpi, 'cursor-pointer')} key={d.title} onClick={() => onNavigate(d.page)}>
            <div className={ui.kpiLabel}>{d.title}</div>
            <div className={ui.kpiValue}>{d.score}<small className={ui.kpiValueSmall}>/100</small></div>
            <div className={cn(ui.scoreBar, 'my-2.5')}><i style={{ width: `${d.score}%` }} /></div>
            <div className={cn(ui.kpiTrend, 'text-text-3')}>{d.note}</div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g2)}>
        <div className={ui.card}>
          <div className={ui.cardTitle}>Control effectiveness</div>
          <div className={cn(ui.cardSub, 'mb-3.5')}>Last 7 days</div>
          {[
            ['Preventive controls', 88],
            ['Detective controls', 93],
            ['Response playbooks', 76],
            ['Vulnerability SLA', 71],
          ].map(([label, v]) => (
            <div key={label} className="mb-3">
              <div className={ui.progressRingLabel}><span>{label}</span><span>{v}%</span></div>
              <div className={ui.scoreBar}><i style={{ width: `${v}%` }} /></div>
            </div>
          ))}
        </div>
        <div className={ui.card}>
          <div className={ui.cardTitle}>Executive narrative</div>
          <p className="text-sm leading-relaxed text-text-2">
            Overall security score is <b className="text-text-1">82</b> — stable week-over-week. Threat level remains elevated due to active credential abuse against the finance VPN and one offline high-risk endpoint. Patch SLA is the primary drag on score; remediating CVE-2026-2144 lifts projected score to <b className="text-text-1">86</b>.
          </p>
          <div className={cn(ui.chipRow, 'mt-4')}>
            <span className={cn(ui.chip, ui.chipCrit)}>2 critical attack paths</span>
            <span className={cn(ui.chip, ui.chipWarn)}>Patch backlog 29</span>
            <span className={cn(ui.chip, ui.chipOk)}>MFA coverage ↑</span>
          </div>
        </div>
      </div>
    </>
  );
}
