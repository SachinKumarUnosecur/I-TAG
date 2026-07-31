import { useMemo, useState } from 'react';
import { alerts } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

export default function AlertsPage({ onNavigate }) {
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('all');
  const [open, setOpen] = useState(alerts[0].id);
  const [selected, setSelected] = useState(() => new Set());

  const rows = useMemo(() => alerts.filter((a) => {
    const hay = `${a.id} ${a.title} ${a.source}`.toLowerCase();
    return (!q || hay.includes(q.toLowerCase())) && (sev === 'all' || a.sev === sev);
  }), [q, sev]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Alerts Center</div>
          <h1 className={ui.pageHeadTitle}>Smart alert management</h1>
          <p className={ui.pageHeadDesc}>Triage with severity chips, bulk actions, expandable cards, and AI-generated summaries — built for high-volume SOC queues.</p>
        </div>
        <div className={ui.pageActions}>
          <span className={ui.liveDot}>Real-time</span>
          <button className={ui.btn} onClick={() => onNavigate('copilot')}>Ask AI</button>
        </div>
      </div>

      <div className={ui.filterBar}>
        <input className={ui.filterInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search alerts…" />
        <select className={ui.filterSelect} value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className={ui.btn}>Source</button>
        <button className={ui.btn}>Time range</button>
      </div>

      <div className={ui.chipRow}>
        {['all', 'critical', 'high', 'medium', 'low'].map((s) => (
          <button key={s} className={cn(ui.chip, sev === s && ui.chipActive)} onClick={() => setSev(s)}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {selected.size > 0 && (
        <div className={ui.bulkBar}>
          <b>{selected.size} selected</b>
          <button className={cn(ui.btn, ui.btnSm)}>Acknowledge</button>
          <button className={cn(ui.btn, ui.btnSm)}>Assign</button>
          <button className={cn(ui.btn, ui.btnSm)}>Suppress 24h</button>
          <button className={cn(ui.btnPrimary, ui.btnSm)} onClick={() => onNavigate('incidents')}>Create incident</button>
        </div>
      )}

      {rows.map((a) => (
        <div className={ui.alertCard} key={a.id}>
          <div className={ui.alertCardHead} onClick={() => setOpen(open === a.id ? null : a.id)}>
            <input
              type="checkbox"
              checked={selected.has(a.id)}
              onClick={(e) => e.stopPropagation()}
              onChange={() => toggle(a.id)}
              aria-label={`Select ${a.id}`}
            />
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2.5">
                <span className={sevClass(a.sev)}>{a.sev}</span>
                <span className={cn(ui.mono, 'text-[11px] text-text-3')}>{a.id}</span>
                <span className="text-xs text-text-3">{a.source} · ×{a.count}</span>
                <span className="ml-auto text-xs text-text-3">{a.time}</span>
              </div>
              <div className="font-bold">{a.title}</div>
            </div>
          </div>
          {open === a.id && (
            <div className={ui.alertCardBody}>
              <div className="my-3 mb-1.5 text-xs font-bold text-purple">AI summary</div>
              <p className="m-0 text-[13.5px] leading-normal text-text-2">{a.ai}</p>
              <div className={cn(ui.chipRow, 'mt-3 mb-0')}>
                <button className={cn(ui.chip, ui.chipActive)}>Acknowledge</button>
                <button className={ui.chip} onClick={() => onNavigate('incidents')}>Escalate</button>
                <button className={ui.chip} onClick={() => onNavigate('copilot')}>Explain</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
