import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Icons (inline SVG helpers)
export function Icon({ name, size = 16, color = 'currentColor' }) {
  const icons = {
    home: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
    search: <><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></>,
    network: <><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="M12 8v3M5 16l4-2M19 16l-4-2"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    alert: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
    target: <><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></>,
    clipboard: <><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>,
    arrowRight: <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    check: <polyline points="20 6 9 17 4 12"/>,
    chevronDown: <polyline points="6 9 12 15 18 9"/>,
    chevronRight: <polyline points="9 18 15 12 9 6"/>,
    minus: <line x1="5" y1="12" x2="19" y2="12"/>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    tree: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    lock: <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>,
    activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>,
    link: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
    bot: <><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></>,
    server: <><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></>,
    gitBranch: <><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></>,
    refresh: <><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {icons[name] || null}
    </svg>
  );
}

// Access type badge
export function AccessBadge({ type }) {
  const map = {
    Direct: 'badge-direct',
    Indirect: 'badge-indirect',
    Shadow: 'badge-hop',
    Hop: 'badge-hop', // legacy compat
  };
  return <span className={`badge ${map[type] || 'badge-direct'}`}>{type}</span>;
}

// Severity badge
export function SeverityBadge({ band }) {
  const map = {
    Catastrophic: 'badge-catastrophic',
    Unacceptable: 'badge-unacceptable',
    Undesirable: 'badge-undesirable',
    Acceptable: 'badge-acceptable',
    Desirable: 'badge-desirable',
  };
  return <span className={`badge ${map[band] || ''}`}>{band}</span>;
}

// Identity type chip
export function TypeChip({ type }) {
  const labels = { human: 'Human', service: 'Service' };
  return <span className={`type-chip type-chip-${type}`}>{labels[type] || type}</span>;
}

// Status chip
export function StatusChip({ status }) {
  return (
    <span className={`status-chip status-${status}`}>
      <span className="status-dot" />
      {status}
    </span>
  );
}

// Risk color by score
export function riskColor(score) {
  if (score >= 80) return 'var(--color-catastrophic)';
  if (score >= 60) return 'var(--color-unacceptable)';
  if (score >= 40) return 'var(--color-undesirable)';
  if (score >= 20) return 'var(--color-acceptable)';
  return 'var(--color-desirable)';
}

export function bandColor(band) {
  const map = {
    Catastrophic: 'var(--color-catastrophic)',
    Unacceptable: 'var(--color-unacceptable)',
    Undesirable: 'var(--color-undesirable)',
    Acceptable: 'var(--color-acceptable)',
    Desirable: 'var(--color-desirable)',
  };
  return map[band] || 'var(--text-tertiary)';
}

// Donut SVG
export function DonutChart({ direct, indirect, hop, size = 110 }) {
  const total = direct + indirect + hop;
  if (total === 0) return null;
  const r = 38;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pDirect = direct / total;
  const pIndirect = indirect / total;
  const pHop = hop / total;
  const gap = 0.02;
  const dLen = Math.max(0, pDirect * circ - gap * circ);
  const iLen = Math.max(0, pIndirect * circ - gap * circ);
  const hLen = Math.max(0, pHop * circ - gap * circ);
  const dOff = 0;
  const iOff = -(pDirect * circ);
  const hOff = -(pDirect * circ) - (pIndirect * circ);

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-subtle)" strokeWidth="10" />
      {dLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-direct)" strokeWidth="10" strokeDasharray={`${dLen} ${circ}`} strokeDashoffset={dOff} />}
      {iLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-indirect)" strokeWidth="10" strokeDasharray={`${iLen} ${circ}`} strokeDashoffset={iOff} />}
      {hLen > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-hop)" strokeWidth="10" strokeDasharray={`${hLen} ${circ}`} strokeDashoffset={hOff} />}
    </svg>
  );
}

// Completion ring
export function CompletionRing({ pct, size = 80 }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const fill = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--surface-subtle)" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--color-desirable)" strokeWidth="8"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// Risk arc
export function RiskArc({ score, size = 100 }) {
  const r = 38;
  const circ = Math.PI * r; // half circle
  const fill = (score / 100) * circ;
  const color = riskColor(score);
  return (
    <svg width={size} height={size / 2 + 10} viewBox={`0 0 ${size} ${size/2 + 10}`}>
      <path d={`M ${size*0.1} ${size/2} A ${r} ${r} 0 0 1 ${size*0.9} ${size/2}`}
        fill="none" stroke="var(--surface-subtle)" strokeWidth="9" />
      <path d={`M ${size*0.1} ${size/2} A ${r} ${r} 0 0 1 ${size*0.9} ${size/2}`}
        fill="none" stroke={color} strokeWidth="9" strokeLinecap="round"
        strokeDasharray={`${fill} ${circ}`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }} />
    </svg>
  );
}

// Panel overlay
export function SlidePanel({ title, subtitle, onClose, children }) {
  return (
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="slide-panel">
        <div className="panel-header">
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="panel-close" onClick={onClose}><Icon name="x" size={14} /></button>
        </div>
        <div className="panel-body">{children}</div>
      </div>
    </>
  );
}

// Hop chain display
export function HopChain({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="hop-chain">
      {steps.map((s, i) => (
        <div key={i} className="hop-step">
          <div className="hop-step-line">
            <div className="hop-step-dot" />
            {i < steps.length - 1 && <div className="hop-step-connector" />}
          </div>
          <div className="hop-step-content">
            <div className="hop-step-label">{s.to}</div>
            <div className="hop-step-mechanism">{s.mechanism}</div>
            <div className="hop-step-time">{s.timestamp}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Tree node
export function TreeNode({ node }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children?.length > 0;
  const typeIcon = { human: 'user', service: 'server', system: 'shield' };
  const statusColor = node.status === 'departed' ? 'var(--color-unacceptable)' : node.status === 'orphaned' ? 'var(--color-hop)' : 'var(--text-primary)';

  return (
    <div className="tree-node">
      <div className="tree-node-content" onClick={() => setOpen(!open)}>
        {hasChildren
          ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} color="var(--text-tertiary)" />
          : <span style={{ width: 12 }} />}
        <Icon name={typeIcon[node.type] || 'user'} size={13} color={statusColor} />
        <span style={{ color: statusColor, fontWeight: node.status === 'orphaned' || node.status === 'departed' ? 600 : 400 }}>
          {node.name}
        </span>
        {(node.status === 'orphaned' || node.status === 'departed') && (
          <span className={`badge badge-${node.status === 'orphaned' ? 'hop' : 'unacceptable'}`} style={{ fontSize: 10, padding: '1px 5px' }}>
            {node.status}
          </span>
        )}
      </div>
      {open && hasChildren && (
        <div className="tree-children">
          {node.children.map(child => <TreeNode key={child.id} node={child} />)}
        </div>
      )}
    </div>
  );
}

// Tile exit link
export function TileExit({ label, onClick }) {
  return (
    <button className="tile-exit" onClick={e => { e.stopPropagation(); onClick(); }}>
      {label} <Icon name="arrowRight" size={12} />
    </button>
  );
}
