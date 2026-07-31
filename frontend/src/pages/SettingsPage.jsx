import { useState } from 'react';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

const NAV = [
  'Organization',
  'Users',
  'Roles',
  'Notifications',
  'Integrations',
  'API Keys',
  'Branding',
  'Billing',
  'Audit Logs',
  'Security Settings',
];

export default function SettingsPage({ initial = 'Organization' }) {
  const [tab, setTab] = useState(initial);

  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Settings</div>
          <h1 className={ui.pageHeadTitle}>Platform configuration</h1>
          <p className={ui.pageHeadDesc}>Organization, access control, notifications, integrations, API keys, branding, billing, and security settings.</p>
        </div>
      </div>

      <div className={ui.settingsLayout}>
        <div className={ui.settingsNav}>
          {NAV.map((n) => (
            <button
              key={n}
              className={cn(ui.settingsNavBtn, tab === n && ui.settingsNavActive)}
              onClick={() => setTab(n)}
            >
              {n}
            </button>
          ))}
        </div>

        <div className={ui.card}>
          <div className={ui.cardTitle}>{tab}</div>
          <div className={cn(ui.cardSub, 'mb-[18px]')}>Manage {tab.toLowerCase()} for Acme Corp</div>

          {tab === 'Organization' && (
            <>
              <div className={ui.field}><label className={ui.fieldLabel}>Organization name</label><input className={ui.fieldInput} defaultValue="Acme Corp" /></div>
              <div className={ui.field}><label className={ui.fieldLabel}>Primary domain</label><input className={ui.fieldInput} defaultValue="acme.com" /></div>
              <div className={ui.field}><label className={ui.fieldLabel}>Timezone</label><input className={ui.fieldInput} defaultValue="America/New_York" /></div>
              <button className={ui.btnPrimary}>Save changes</button>
            </>
          )}

          {tab === 'Users' && (
            <table className="w-full">
              <thead><tr><th>User</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>Riya Caplan</td><td>Admin</td><td>Active</td></tr>
                <tr><td>Aisha Chen</td><td>Analyst</td><td>Active</td></tr>
                <tr><td>Maya Ortiz</td><td>Responder</td><td>Active</td></tr>
              </tbody>
            </table>
          )}

          {tab === 'Roles' && (
            <div>
              {['Admin', 'Analyst', 'Responder', 'Auditor', 'Read-only'].map((r) => (
                <div key={r} className={cn(ui.actionItem, 'flex justify-between')}>
                  <b className="m-0">{r}</b>
                  <button className={cn(ui.btn, 'text-[11px]')}>Edit permissions</button>
                </div>
              ))}
            </div>
          )}

          {tab === 'Notifications' && (
            <>
              {['Critical alerts → Slack #sec-warroom', 'Incident assignment → Email + PagerDuty', 'Weekly exec brief → Email'].map((n) => (
                <div key={n} className={cn(ui.actionItem, 'flex items-center justify-between')}>
                  <span className="text-[13px]">{n}</span>
                  <input type="checkbox" defaultChecked />
                </div>
              ))}
            </>
          )}

          {tab === 'Integrations' && (
            <div className={cn(ui.grid, ui.g2)}>
              {['Microsoft Entra ID', 'AWS', 'CrowdStrike', 'Splunk', 'Jira', 'Slack'].map((i) => (
                <div key={i} className={cn(ui.actionItem, 'flex items-center justify-between')}>
                  <b className="m-0">{i}</b>
                  <span className={cn(ui.chip, ui.chipOk)}>Connected</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'API Keys' && (
            <>
              <div className={ui.actionItem}><b className={ui.mono}>aegis_live_••••••••9f2a</b><div className="text-[12.5px] text-text-3">Created 12d ago · last used 2h ago</div></div>
              <button className={ui.btnPrimary}>Generate new key</button>
            </>
          )}

          {tab === 'Branding' && (
            <>
              <div className={ui.field}><label className={ui.fieldLabel}>Product display name</label><input className={ui.fieldInput} defaultValue="Aegis" /></div>
              <div className={ui.field}><label className={ui.fieldLabel}>Support URL</label><input className={ui.fieldInput} defaultValue="https://support.acme.com" /></div>
              <button className={ui.btnPrimary}>Save branding</button>
            </>
          )}

          {tab === 'Billing' && (
            <div className={ui.actionItem}>
              <b>Enterprise · Annual</b>
              <div className="text-[12.5px] text-text-3">Next invoice Sep 1 · 15,000 assets covered</div>
              <button className={cn(ui.btn, 'mt-2 text-xs')}>Manage billing</button>
            </div>
          )}

          {tab === 'Audit Logs' && (
            <table className="w-full">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th></tr></thead>
              <tbody>
                <tr><td>2m ago</td><td>achen</td><td>Isolated WIN-FIN-042</td></tr>
                <tr><td>1h ago</td><td>riya</td><td>Rotated API key</td></tr>
                <tr><td>3h ago</td><td>system</td><td>Connector sync AWS</td></tr>
              </tbody>
            </table>
          )}

          {tab === 'Security Settings' && (
            <>
              {['Enforce SSO for all users', 'Require MFA for admins', 'Session timeout 8h', 'IP allowlisting'].map((s) => (
                <div key={s} className={cn(ui.actionItem, 'flex items-center justify-between')}>
                  <span className="text-[13px]">{s}</span>
                  <input type="checkbox" defaultChecked={s !== 'IP allowlisting'} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
