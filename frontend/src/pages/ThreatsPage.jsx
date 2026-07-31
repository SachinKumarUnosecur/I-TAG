import { useMemo, useState } from 'react';
import { threats } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

export default function ThreatsPage({ onNavigate }) {
  const [q, setQ] = useState('');
  const [sev, setSev] = useState('all');

  const rows = useMemo(() => threats.filter((t) => {
    const hay = `${t.id} ${t.title} ${t.asset} ${t.technique}`.toLowerCase();
    const matchQ = !q || hay.includes(q.toLowerCase());
    const matchS = sev === 'all' || t.sev === sev;
    return matchQ && matchS;
  }), [q, sev]);

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Threat Detection</div>
          <h1 className={ui.pageHeadTitle}>SOC detection workspace</h1>
          <p className={ui.pageHeadDesc}>Real-time detections with MITRE ATT&CK mapping, attack-chain context, and analyst-ready filtering.</p>
        </div>
        <div className={ui.pageActions}>
          <span className={ui.liveDot}>Streaming</span>
          <button className={ui.btn} onClick={() => onNavigate('copilot')}>Explain with AI</button>
        </div>
      </div>

      <div className={ui.filterBar}>
        <input className={ui.filterInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search detections, assets, techniques…" />
        <select className={ui.filterSelect} value={sev} onChange={(e) => setSev(e.target.value)}>
          <option value="all">All severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <button className={ui.btn}>MITRE filter</button>
        <button className={ui.btn}>Last 24h</button>
      </div>

      <div className={ui.chipRow}>
        {['all', 'critical', 'high', 'medium'].map((s) => (
          <button
            key={s}
            className={cn(ui.chip, sev === s && ui.chipActive, s === 'critical' && ui.chipCrit)}
            onClick={() => setSev(s)}
          >
            {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75, 'mb-4')}>
        <div className={cn(ui.card, 'overflow-hidden p-0')}>
          <table className="w-full">
            <thead>
              <tr>
                <th>Detection</th>
                <th>Severity</th>
                <th>MITRE</th>
                <th>Asset</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="cursor-pointer" onClick={() => onNavigate('incidents')}>
                  <td>
                    <div className={cn(ui.mono, 'text-[11px] text-text-3')}>{t.id}</div>
                    <div className="font-semibold">{t.title}</div>
                  </td>
                  <td><span className={sevClass(t.sev)}>{t.sev}</span></td>
                  <td className={ui.mono}>{t.technique}</td>
                  <td>{t.asset}</td>
                  <td>{t.status}</td>
                  <td className="text-text-3">{t.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={ui.card}>
          <div className={ui.cardTitle}>Attack chain</div>
          <div className={cn(ui.cardSub, 'mb-3')}>DET-10482 correlated path</div>
          <div className={ui.attackChain}>
            {[
              ['Initial access', 'Phishing kit', 'T1566'],
              ['Execution', 'Encoded PS', 'T1059'],
              ['Credential access', 'LSASS read', 'T1003'],
              ['Lateral move', 'RDP', 'T1021'],
              ['Impact', 'Vault enum', 'T1552'],
            ].map(([stage, detail, tech], i) => (
              <div key={stage} className="contents">
                {i > 0 && <div className={ui.chainArrow}>→</div>}
                <div className={ui.chainStep}>
                  <b>{stage}</b>
                  {detail}
                  <div className={cn(ui.mono, 'mt-1.5 text-[11px] text-cyan')}>{tech}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={cn(ui.cardTitle, 'my-[18px] mb-2.5')}>Detection analytics</div>
          <div className={cn(ui.spark, 'h-14')}>
            {[30, 44, 38, 60, 52, 70, 66, 80, 74, 90, 84, 96].map((h, i) => (
              <i key={i} style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-2.5 flex justify-between text-xs text-text-3">
            <span>00:00</span><span>Now · +28% volume</span>
          </div>

          <div className={cn(ui.cardTitle, 'my-[18px] mb-2.5')}>MITRE coverage</div>
          <div className={ui.chipRow}>
            <span className={cn(ui.chip, ui.chipCrit)}>T1059</span>
            <span className={cn(ui.chip, ui.chipCrit)}>T1003</span>
            <span className={cn(ui.chip, ui.chipWarn)}>T1078</span>
            <span className={ui.chip}>T1021</span>
            <span className={ui.chip}>T1530</span>
          </div>
        </div>
      </div>
    </>
  );
}
