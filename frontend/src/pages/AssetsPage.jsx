import { useMemo, useState } from 'react';
import { assets } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

const types = ['All', 'Server', 'Endpoint', 'Container', 'Cloud', 'Database', 'Application', 'Network', 'Kubernetes'];

const riskSev = (risk) => sevClass(risk.toLowerCase());

export default function AssetsPage() {
  const [type, setType] = useState('All');
  const [q, setQ] = useState('');

  const rows = useMemo(() => assets.filter((a) => {
    const matchType = type === 'All' || a.type === type || (type === 'Container' && a.type === 'Kubernetes');
    const hay = `${a.name} ${a.type} ${a.owner}`.toLowerCase();
    return matchType && (!q || hay.includes(q.toLowerCase()));
  }), [type, q]);

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Asset Inventory</div>
          <h1 className={ui.pageHeadTitle}>Explore every protected asset</h1>
          <p className={ui.pageHeadDesc}>Servers, endpoints, containers, cloud resources, databases, apps, and network devices — with health, risk, and topology context.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Topology view</button>
          <button className={ui.btnPrimary}>Add connector</button>
        </div>
      </div>

      <div className={ui.filterBar}>
        <input className={ui.filterInput} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assets…" />
        <select className={ui.filterSelect} value={type} onChange={(e) => setType(e.target.value)}>
          {types.map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className={ui.btn}>Environment</button>
        <button className={ui.btn}>Risk</button>
      </div>

      <div className={ui.chipRow}>
        {types.slice(0, 7).map((t) => (
          <button key={t} className={cn(ui.chip, type === t && ui.chipActive)} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {rows.map((a) => (
          <div className={ui.assetCard} key={a.name}>
            <div className="mb-3 flex justify-between">
              <div>
                <div className="font-bold">{a.name}</div>
                <div className="text-xs text-text-3">{a.type} · {a.env}</div>
              </div>
              <div className="health-ring" style={{ '--h': `${a.health}%` }}><span>{a.health}</span></div>
            </div>
            <div className="mb-2 flex justify-between text-[12.5px]">
              <span className="text-text-3">Owner</span>
              <span>{a.owner}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={riskSev(a.risk)}>{a.risk}</span>
              <span className="text-xs text-text-3">Seen {a.lastSeen}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={ui.card}>
        <div className={ui.cardTitle}>Visual topology snapshot</div>
        <div className={cn(ui.cardSub, 'mb-3')}>Edge → identity → workload → data</div>
        <div className={ui.attackChain}>
          {['fw-edge-01', 'vpn / IdP', 'WIN-FIN-042', 'payments-api', 'postgres-core', 'aws-prod-logs'].map((n, i) => (
            <div key={n} className="contents">
              {i > 0 && <div className={ui.chainArrow}>→</div>}
              <div className={ui.chainStep}><b>{n}</b>Healthy path segment</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
