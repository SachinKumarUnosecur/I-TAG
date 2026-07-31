import { identities } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function IdentityPage({ onNavigate }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Identity Security</div>
          <h1 className={ui.pageHeadTitle}>Users, privilege & risky sign-ins</h1>
          <p className={ui.pageHeadDesc}>Roles, MFA posture, conditional access, privileged accounts, and identity graph paths that matter to Tier-0.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn} onClick={() => onNavigate('discover')}>Open Discover</button>
          <button className={ui.btnPrimary} onClick={() => onNavigate('trace')}>Identity graph</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g4, 'mb-4')}>
        {[
          ['Users monitored', '8,422'],
          ['Privileged', '312'],
          ['MFA gaps', '146'],
          ['Risky sign-ins', '23'],
        ].map(([label, value]) => (
          <div className={cn(ui.card, ui.kpi)} key={label}>
            <div className={ui.kpiLabel}>{label}</div>
            <div className={ui.kpiValue}>{value}</div>
          </div>
        ))}
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div className={cn(ui.card, 'overflow-hidden p-0')}>
          <table className="w-full">
            <thead>
              <tr>
                <th>Identity</th>
                <th>Role</th>
                <th>MFA</th>
                <th>Privileged</th>
                <th>Risk</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {identities.map((i) => (
                <tr key={i.email} className="cursor-pointer" onClick={() => onNavigate('discover')}>
                  <td>
                    <div className="font-semibold">{i.name}</div>
                    <div className={cn(ui.mono, 'text-[11px] text-text-3')}>{i.email}</div>
                  </td>
                  <td>{i.role}</td>
                  <td>{i.mfa === true ? 'Enabled' : i.mfa === false ? 'Missing' : i.mfa}</td>
                  <td>{i.priv ? 'Yes' : 'No'}</td>
                  <td><b style={{ color: i.risk > 7 ? 'var(--critical)' : i.risk > 4 ? 'var(--warning)' : 'var(--success)' }}>{i.risk}</b></td>
                  <td className="text-text-3">{i.lastSignIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className={cn(ui.card, 'mb-4')}>
            <div className={ui.cardTitle}>Conditional access</div>
            <div className={ui.actionItem}><b>Require MFA for admins</b><div className="text-[12.5px] text-text-3">Enforced · 0 exceptions</div></div>
            <div className={ui.actionItem}><b>Block legacy auth</b><div className="text-[12.5px] text-text-3">Enforced · 12 legacy clients queued</div></div>
            <div className={ui.actionItem}><b>Step-up for vault apps</b><div className="text-[12.5px] text-text-3">Pilot · finance + platform</div></div>
          </div>
          <div className={ui.card}>
            <div className={ui.cardTitle}>Identity graph highlight</div>
            <div className={cn(ui.cardSub, 'mb-3')}>Shortest path to Tier-0</div>
            <div className={ui.attackChain}>
              {['jdoe', 'platform-sre', 'prod-vault', 'Tier-0'].map((n, i) => (
                <div key={n} className="contents">
                  {i > 0 && <div className={ui.chainArrow}>→</div>}
                  <div className={ui.chainStep}><b>{n}</b>{i === 0 ? 'No MFA' : 'Group / secret'}</div>
                </div>
              ))}
            </div>
            <button className={cn(ui.btnPrimary, ui.btnSm, 'mt-3.5')} onClick={() => onNavigate('trace')}>Inspect full path</button>
          </div>
        </div>
      </div>
    </>
  );
}
