import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function ReportsPage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Reports</div>
          <h1 className={ui.pageHeadTitle}>Executive & operational reporting</h1>
          <p className={ui.pageHeadDesc}>Charts, scheduled delivery, PDF/CSV export, trend analysis, and AI-written executive summaries.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Schedule</button>
          <button className={ui.btn}>Export CSV</button>
          <button className={ui.btnPrimary}>Export PDF</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {[
          ['Executive security brief', 'Weekly', 'PDF'],
          ['Incident trends', 'Daily', 'PDF + CSV'],
          ['Vulnerability SLA', 'Weekly', 'CSV'],
          ['Compliance evidence', 'Monthly', 'ZIP'],
        ].map(([title, cadence, format]) => (
          <div className={ui.card} key={title}>
            <div className={ui.cardTitle}>{title}</div>
            <div className={cn(ui.cardSub, 'mb-3')}>{cadence} · {format}</div>
            <button className={cn(ui.btn, 'text-xs')}>Generate now</button>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={ui.card}>
          <div className={ui.cardTitle}>Trend analysis</div>
          <div className={cn(ui.cardSub, 'mb-3')}>Incidents & critical alerts · 90 days</div>
          <div className={cn(ui.spark, 'h-[120px]')}>
            {[35, 42, 38, 55, 60, 48, 70, 66, 80, 74, 68, 90, 84, 78, 92, 88].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-[18px] grid grid-cols-3 gap-3">
            {[
              ['MTTR', '4.2h', '-18%'],
              ['Critical alerts', '126', '+6%'],
              ['Patch SLA', '71%', '+9%'],
            ].map(([l, v, d]) => (
              <div key={l} className={cn(ui.actionItem, 'm-0')}>
                <div className="text-xs text-text-3">{l}</div>
                <div className="text-[22px] font-extrabold">{v}</div>
                <div className={cn('text-xs', d.startsWith('-') ? 'text-success' : 'text-warning')}>{d}</div>
              </div>
            ))}
          </div>
        </div>

        <div className={ui.card}>
          <div className={ui.cardTitle}>AI executive summary</div>
          <p className="text-sm leading-relaxed text-text-2">
            Security score held at <b className="text-text-1">82</b>. Incident volume rose modestly, driven by credential abuse against VPN. Patch throughput improved after payments-cluster prioritization. Recommended board focus: close OpenSSL exposure and restore EDR coverage on finance endpoints.
          </p>
          <div className={cn(ui.chipRow, 'mt-3')}>
            <button className={cn(ui.chip, ui.chipActive)} onClick={() => onNavigate('copilot')}>Regenerate</button>
            <button className={ui.chip}>Copy</button>
            <button className={ui.chip}>Include in PDF</button>
          </div>
        </div>
      </div>
    </>
  );
}
