import { useState } from 'react';
import { endpoints } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

const malwareSev = (status) => {
  if (status === 'Clean') return sevClass('low');
  if (status === 'Quarantined') return sevClass('medium');
  return sevClass('critical');
};

export default function EndpointsPage() {
  const [toast, setToast] = useState('');

  const act = (label) => {
    setToast(label);
    setTimeout(() => setToast(''), 2200);
  };

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Endpoint Protection</div>
          <h1 className={ui.pageHeadTitle}>Device health & remote response</h1>
          <p className={ui.pageHeadDesc}>Health and risk scores, agent status, isolation, and live response — CrowdStrike-grade workflows with a calmer UI.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Policies</button>
          <button className={ui.btnPrimary}>Deploy agent</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {[
          ['Devices online', '12,841'],
          ['Elevated risk', '2'],
          ['Isolated', '1'],
          ['Avg health', '86'],
        ].map(([label, value]) => (
          <div className={cn(ui.card, ui.kpi)} key={label}>
            <div className={ui.kpiLabel}>{label}</div>
            <div className={ui.kpiValue}>{value}</div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g3)}>
        {endpoints.map((e) => (
          <div className={ui.assetCard} key={e.name}>
            <div className="mb-3 flex justify-between gap-3">
              <div>
                <div className="text-[15px] font-extrabold">{e.name}</div>
                <div className="text-[12.5px] text-text-3">{e.os} · Agent {e.agent}</div>
                <div className="text-[12.5px] text-text-3">User {e.user}</div>
              </div>
              <div className="health-ring" style={{ '--h': `${e.health}%` }}><span>{e.health}</span></div>
            </div>
            <div className="mb-2.5 flex justify-between text-[12.5px]">
              <span>Risk score</span>
              <b style={{ color: e.risk > 7 ? 'var(--critical)' : e.risk > 4 ? 'var(--warning)' : 'var(--success)' }}>{e.risk}</b>
            </div>
            <div className={cn(ui.scoreBar, 'mb-3')}>
              <i style={{ width: `${e.risk * 10}%`, background: e.risk > 7 ? 'var(--critical)' : 'var(--grad)' }} />
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className={malwareSev(e.malware)}>{e.malware}</span>
              {e.isolated && <span className={cn(ui.chip, ui.chipCrit)}>Isolated</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={cn(ui.btn, ui.btnSm)} onClick={() => act(`Isolation queued for ${e.name}`)}>
                {e.isolated ? 'Release' : 'Isolate'}
              </button>
              <button className={cn(ui.btn, ui.btnSm)} onClick={() => act(`Live terminal session for ${e.name}`)}>Live terminal</button>
              <button className={cn(ui.btn, ui.btnSm)} onClick={() => act(`Remote response playbook on ${e.name}`)}>Respond</button>
            </div>
          </div>
        ))}
      </div>

      {toast && <div className={ui.toast}>{toast}</div>}
    </>
  );
}
