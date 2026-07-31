import { useState } from 'react';
import { incidents } from '../data/mock';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { sevClass } from '../lib/badges';

export default function IncidentsPage({ onNavigate }) {
  const [active, setActive] = useState(incidents[0]);

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Incident Management</div>
          <h1 className={ui.pageHeadTitle}>Incident workspace</h1>
          <p className={ui.pageHeadDesc}>Investigate, contain, and communicate — timeline, evidence, attack graph, and response actions in one place.</p>
        </div>
        <div className={ui.pageActions}>
          <button className={ui.btn}>Assign</button>
          <button className={ui.btnPrimary} onClick={() => onNavigate('copilot')}>AI summary</button>
        </div>
      </div>

      <div className={cn(ui.grid, ui.g75)}>
        <div>
          <div className={cn(ui.card, 'mb-4 overflow-hidden p-0')}>
            <table className="w-full">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Owner</th>
                  <th>SLA</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc) => (
                  <tr
                    key={inc.id}
                    onClick={() => setActive(inc)}
                    className={cn('cursor-pointer', active.id === inc.id && 'bg-card-2')}
                  >
                    <td>
                      <div className={cn(ui.mono, 'text-[11px] text-text-3')}>{inc.id}</div>
                      <div className="font-semibold">{inc.title}</div>
                    </td>
                    <td><span className={sevClass(inc.sev)}>{inc.sev}</span></td>
                    <td>{inc.status}</td>
                    <td>{inc.owner}</td>
                    <td>{inc.sla}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={ui.card}>
            <div className={ui.cardHead}>
              <div>
                <div className={ui.cardTitle}>{active.id} · {active.title}</div>
                <div className={ui.cardSub}>Opened {active.opened} · {active.assets} affected assets · Owner {active.owner}</div>
              </div>
              <span className={sevClass(active.sev)}>{active.sev}</span>
            </div>

            <div className={cn(ui.cardTitle, 'mb-2.5')}>Attack graph</div>
            <div className={cn(ui.attackChain, 'mb-[18px]')}>
              {['VPN gateway', 'jdoe session', 'platform-sre', 'AWS vault', 'Secrets read'].map((n, i) => (
                <div key={n} className="contents">
                  {i > 0 && <div className={ui.chainArrow}>→</div>}
                  <div className={ui.chainStep}><b>Hop {i + 1}</b>{n}</div>
                </div>
              ))}
            </div>

            <div className={cn(ui.grid, ui.g2)}>
              <div>
                <div className={cn(ui.cardTitle, 'mb-2.5')}>Evidence</div>
                {['vpn_auth.log · 1,842 failures', 'cloudtrail · GetSecretValue × 6', 'edr · encoded PowerShell', 'id_graph · path to Tier-0'].map((e) => (
                  <div key={e} className={cn(ui.actionItem, 'text-[12.5px]')}>{e}</div>
                ))}
              </div>
              <div>
                <div className={cn(ui.cardTitle, 'mb-2.5')}>Affected assets</div>
                {['WIN-FIN-042', 'vpn-gw-01', 'aws-prod-vault', 'jdoe@acme.com'].map((a) => (
                  <div key={a} className={cn(ui.actionItem, 'text-[12.5px]')}>{a}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className={cn(ui.card, 'mb-4')}>
            <div className={ui.cardTitle}>Status tracking</div>
            <div className={cn(ui.chipRow, 'mt-3')}>
              <span className={cn(ui.chip, ui.chipActive)}>In progress</span>
              <span className={ui.chip}>Contain</span>
              <span className={ui.chip}>Eradicate</span>
              <span className={ui.chip}>Recover</span>
            </div>
            <div className={cn(ui.cardTitle, 'my-4 mb-2.5')}>Response actions</div>
            {['Disable compromised session', 'Force MFA re-enrollment', 'Rotate vault credentials', 'Notify finance leadership'].map((a) => (
              <div key={a} className={cn(ui.actionItem, 'flex items-center justify-between')}>
                <b className="m-0">{a}</b>
                <button className={cn(ui.btn, ui.btnSm)}>Run</button>
              </div>
            ))}
          </div>

          <div className={cn(ui.card, 'mb-4')}>
            <div className={ui.cardTitle}>Timeline</div>
            <div className={cn(ui.timeline, 'mt-3')}>
              <div className={cn(ui.tlItem, 'crit')}>
                <div className={ui.tlTime}>09:14</div>
                <div className={ui.tlTitle}>Incident opened by correlation engine</div>
              </div>
              <div className={cn(ui.tlItem, 'warn')}>
                <div className={ui.tlTime}>09:18</div>
                <div className={ui.tlTitle}>Assigned to A. Chen</div>
              </div>
              <div className={ui.tlItem}>
                <div className={ui.tlTime}>09:26</div>
                <div className={ui.tlTitle}>Evidence packaged · war-room channel created</div>
              </div>
              <div className={cn(ui.tlItem, 'ok')}>
                <div className={ui.tlTime}>09:41</div>
                <div className={ui.tlTitle}>VPN geo-block applied</div>
              </div>
            </div>
          </div>

          <div className={ui.card}>
            <div className={ui.cardTitle}>Comments & activity</div>
            <div className={cn(ui.actionItem, 'mt-3')}>
              <b>A. Chen</b>
              <div className="text-[12.5px] text-text-3">Seeing overlap with DET-10477 — treating as same campaign.</div>
            </div>
            <div className={ui.actionItem}>
              <b>AI Copilot</b>
              <div className="text-[12.5px] text-text-3">Recommended containment order: session revoke → vault rotate → endpoint isolate.</div>
            </div>
            <div className={cn(ui.field, 'mt-2 mb-0')}>
              <input className={ui.fieldInput} placeholder="Add a comment for the war room…" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
