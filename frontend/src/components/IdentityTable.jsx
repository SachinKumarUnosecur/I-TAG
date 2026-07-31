import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

function StatusBadge({ status }) {
  if (status === 'Active') return <span className={badgeClass('success')}>Active</span>;
  if (status === 'Dormant') return <span className={badgeClass('warning')}>Dormant</span>;
  return <span className={badgeClass('inactive')}>{status}</span>;
}

export default function IdentityTable({ items = [], onSelect }) {
  if (!items.length) {
    return (
      <tr>
        <td colSpan={9} className="px-6 py-6 text-center text-text-2">
          No identities match your filters.
        </td>
      </tr>
    );
  }

  return items.map((i) => {
    const ri = i.riskInfo || {};
    const badgeKey = ri.badge?.replace('badge-', '') || 'info';
    return (
      <tr key={i.id || i.name} onClick={() => onSelect?.(i)} className="cursor-pointer">
        <td className={ui.cellId}>
          <span className={ui.avatarSm} style={{ background: i.color }}>{i.initials}</span>
          <div>
            <b>{i.name}</b>
            <span className={ui.cellMeta}>{i.dept}</span>
          </div>
        </td>
        <td>{i.type}</td>
        <td>{i.dept}</td>
        <td>{i.mgr}</td>
        <td>
          <span className={ui.riskBar}>
            <span className={ui.progressFill} style={{ width: `${i.risk}%`, background: ri.bar }} />
          </span>
          <span className={badgeClass(badgeKey)}>{ri.label}</span>
        </td>
        <td><span className={ui.pillTier}>{i.tier}</span></td>
        <td><StatusBadge status={i.status} /></td>
        <td>{i.last}</td>
        <td>{i.owner}</td>
      </tr>
    );
  });
}
