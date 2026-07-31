import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function Drawer({ open, kind, payload, onClose, onAction }) {
  if (!open) return null;

  return (
    <div className={ui.drawerOverlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={ui.drawer} id="drawerBody">
        {kind === 'threat' && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-[15px]">Impossible travel</h3>
              <button className={ui.iconBtn} onClick={onClose} aria-label="Close">×</button>
            </div>
            <span className={cn(badgeClass('critical'), 'mb-3.5')}>Critical</span>
            <p className="text-[12.8px] leading-relaxed text-text-2">
              M. Alvarez signed in from Lagos at 09:14 UTC and from Warsaw at 09:25 UTC — a distance that cannot be traveled in 11 minutes. Device fingerprint changed between sessions.
            </p>
            <div className={cn(ui.card, 'my-3.5')}>
              <div className={ui.cardHead}><h3 className={ui.cardHeadH3}>MITRE mapping</h3></div>
              <div className={cn(ui.mitreCell, ui.mitreHit)}>T1078 — Valid accounts</div>
            </div>
            <button className={cn(ui.btnPrimary, 'mb-2 w-full justify-center')} onClick={() => onAction?.('revoke-sessions')}>
              Revoke active sessions
            </button>
            <button className={cn(ui.btn, 'w-full justify-center')} onClick={() => onAction?.('step-up-mfa')}>
              Require step-up MFA
            </button>
          </>
        )}

        {kind === 'identity' && payload && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="m-0 text-[15px]">{payload.name}</h3>
              <button className={ui.iconBtn} onClick={onClose} aria-label="Close">×</button>
            </div>
            <span className={cn(badgeClass(payload.riskInfo?.badge || 'info'), 'mb-3.5')}>
              {payload.riskInfo?.label || 'Risk'} · {payload.risk}/100
            </span>
            <p className="text-[12.8px] leading-relaxed text-text-2">
              {payload.type} in {payload.dept}. Privilege {payload.tier}. Status {payload.status}.
              Owner: {payload.owner}. Manager: {payload.mgr}. Last activity: {payload.last}.
            </p>
            <button className={cn(ui.btnPrimary, 'mt-3.5 w-full justify-center')} onClick={onClose}>
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
