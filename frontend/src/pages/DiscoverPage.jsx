import IdentityTable from '../components/IdentityTable';
import { ui } from '../lib/ui';
import { cn } from '../lib/cn';
import { badgeClass } from '../lib/badges';

export default function DiscoverPage({ onNavigate, onOpenDrawer, activeTab, onTab, data, identities = [], onSelectIdentity, onFilterIdentities }) {
  return (
    <>
      <div className={ui.pageHead}>
        <div>
          <div className={ui.pageEyebrow}>Discover</div>
          <h1 className={ui.pageHeadTitle}>Access discovery & ownership</h1>
          <p className={ui.pageHeadDesc}>Every user, group, application, role, permission, service account, secret, and resource — searchable in
            one inventory.</p>
        </div>
        <div className={ui.pageActions}><button className={ui.btn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>Add source</button></div>
      </div>

      <div className={ui.tabs}>
        <div className={cn(ui.tab, activeTab === 'd1' && ui.tabActive)} data-tab="d1" onClick={() => onTab('d1')}>Identity inventory</div>
        <div className={cn(ui.tab, activeTab === 'd2' && ui.tabActive)} data-tab="d2" onClick={() => onTab('d2')}>Apps & resources</div>
        <div className={cn(ui.tab, activeTab === 'd3' && ui.tabActive)} data-tab="d3" onClick={() => onTab('d3')}>Ownership</div>
      </div>

      <div id="d1" style={{ display: activeTab === 'd1' ? 'block' : 'none' }}>
        <div className={ui.filterbar}>
          <div className={ui.searchSm}><svg className={ui.searchIcon} style={{ left: '10px' }} width="13" height="13"
            viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg><input className={ui.searchSmInput} placeholder="Filter identities…" onChange={(e) => onFilterIdentities?.({ q: e.target.value })} /></div>
          <div className={ui.filterDivider} />
          <span className={cn(ui.chip, ui.chipActive)}>All (8,412)</span>
          <span className={ui.chip}>Users</span>
          <span className={ui.chip}>Service accounts</span>
          <span className={ui.chip}>Groups</span>
          <span className={ui.chip}>Roles</span>
          <div className={ui.filterDivider} />
          <span className={ui.chip}>🔴 Critical (47)</span>
          <span className={ui.chip}>🟠 Medium (208)</span>
          <button className={cn(ui.btn, ui.btnSm, 'ml-auto')}><svg width="13" height="13" viewBox="0 0 24 24"
            fill="none">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>Filters</button>
          <button className={cn(ui.btn, ui.btnSm)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
            <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          </svg>Columns</button>
        </div>

        <div className={ui.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Identity</th>
                <th>Type</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Risk</th>
                <th>Privilege tier</th>
                <th>Status</th>
                <th>Last activity</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody id="identityTable"><IdentityTable items={identities} onSelect={onSelectIdentity} /></tbody>
          </table>
        </div>
      </div>

      <div id="d2" style={{ display: activeTab === 'd2' ? 'block' : 'none' }}>
        <div className={cn(ui.grid, ui.g4, 'mb-4')}>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Applications</div>
            <div className={ui.kpiValue}>186</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Resources</div>
            <div className={ui.kpiValue}>4,930</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Secrets tracked</div>
            <div className={ui.kpiValue}>2,104</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Unmanaged apps</div>
            <div className={ui.kpiValue} style={{ color: '#fb923c' }}>23</div>
          </div>
        </div>
        <div className={ui.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Application</th>
                <th>Category</th>
                <th>Auth method</th>
                <th>Users with access</th>
                <th>Privileged users</th>
                <th>Owner</th>
                <th>Risk</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={ui.cellId}><span className={ui.svcIcon}>SF</span>
                  <div><b>Salesforce</b><span className={ui.cellMeta}>SaaS · CRM</span></div>
                </td>
                <td>SaaS</td>
                <td>SAML SSO</td>
                <td>1,204</td>
                <td>18</td>
                <td>M. Alvarez</td>
                <td><span className={badgeClass('medium')}>Medium</span></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.svcIcon}>AWS</span>
                  <div><b>AWS Production</b><span className={ui.cellMeta}>IaaS · Cloud</span></div>
                </td>
                <td>Cloud</td>
                <td>OIDC federated</td>
                <td>312</td>
                <td>41</td>
                <td>Platform Eng</td>
                <td><span className={badgeClass('critical')}>Critical</span></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.svcIcon}>SAP</span>
                  <div><b>SAP Finance</b><span className={ui.cellMeta}>On-prem · ERP</span></div>
                </td>
                <td>On-prem</td>
                <td>LDAP</td>
                <td>640</td>
                <td>9</td>
                <td>Finance IT</td>
                <td><span className={badgeClass('warning')}>Elevated</span></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.svcIcon}>GH</span>
                  <div><b>GitHub Enterprise</b><span className={ui.cellMeta}>SaaS · DevOps</span></div>
                </td>
                <td>SaaS</td>
                <td>OAuth</td>
                <td>890</td>
                <td>62</td>
                <td>N. Brooks</td>
                <td><span className={badgeClass('info')}>Low</span></td>
              </tr>
              <tr>
                <td className={ui.cellId}><span className={ui.svcIcon}>?</span>
                  <div><b>legacy-crm.internal</b><span className={ui.cellMeta}>Unmanaged · shadow IT</span></div>
                </td>
                <td>Unmanaged</td>
                <td>Basic auth</td>
                <td>44</td>
                <td>6</td>
                <td style={{ color: '#fb923c' }}>No owner</td>
                <td><span className={badgeClass('critical')}>Critical</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div id="d3" style={{ display: activeTab === 'd3' ? 'block' : 'none' }}>
        <div className={cn(ui.grid, ui.g3, 'mb-4')}>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Assets with an owner</div>
            <div className={ui.kpiValue}>94.2<small className={ui.kpiValueSmall}>%</small></div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Missing owners</div>
            <div className={ui.kpiValue} style={{ color: '#f87171' }}>286</div>
          </div>
          <div className={cn(ui.card, ui.kpi)}>
            <div className={ui.kpiLabel}>Escalation contacts defined</div>
            <div className={ui.kpiValue}>71<small className={ui.kpiValueSmall}>%</small></div>
          </div>
        </div>
        <div className={cn(ui.grid, ui.g126)}>
          <div className={ui.card}>
            <div className={ui.cardHead}>
              <h3 className={ui.cardHeadH3}>Ownership by identity</h3>
            </div>
            <div className={ui.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Identity / asset</th>
                    <th>Business owner</th>
                    <th>Technical owner</th>
                    <th>App owner</th>
                    <th>Delegated owner</th>
                    <th>Manager</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={ui.cellId}><span className={ui.avatarSm} style={{ background: '#3B82F6' }}>JC</span><b>j.chen</b></td>
                    <td>D. Whitfield</td>
                    <td>N. Brooks</td>
                    <td>—</td>
                    <td>—</td>
                    <td>D. Whitfield</td>
                  </tr>
                  <tr>
                    <td className={ui.cellId}><span className={ui.svcIcon}>SF</span><b>Salesforce</b></td>
                    <td>M. Alvarez</td>
                    <td>Platform Eng</td>
                    <td>M. Alvarez</td>
                    <td>K. Patel</td>
                    <td>—</td>
                  </tr>
                  <tr>
                    <td className={ui.cellId}><span className={ui.avatarSm}
                      style={{ background: '#6B7280' }}>SV</span><b>svc-billing-01</b></td>
                    <td style={{ color: '#fb923c' }}>Missing</td>
                    <td>Finance IT</td>
                    <td>—</td>
                    <td>—</td>
                    <td style={{ color: '#fb923c' }}>Manager disabled</td>
                  </tr>
                  <tr>
                    <td className={ui.cellId}><span className={ui.svcIcon}>?</span><b>legacy-crm.internal</b></td>
                    <td style={{ color: '#f87171' }}>Missing</td>
                    <td style={{ color: '#f87171' }}>Missing</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className={cn(ui.card, ui.graphPanel)}
            style={{ minHeight: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 260 220" width="100%" height="260">
              <g stroke="#8B5CF6" strokeWidth="1.4" className="gedge">
                <line x1="130" y1="40" x2="70" y2="110" />
                <line x1="130" y1="40" x2="190" y2="110" />
                <line x1="70" y1="110" x2="40" y2="180" />
                <line x1="70" y1="110" x2="100" y2="180" />
                <line x1="190" y1="110" x2="160" y2="180" />
                <line x1="190" y1="110" x2="220" y2="180" />
              </g>
              <circle cx="130" cy="40" r="16" fill="#111827" stroke="#22D3EE" strokeWidth="2" /><text x="130" y="44"
                textAnchor="middle" className="gnode-label">CISO</text>
              <circle cx="70" cy="110" r="14" fill="#111827" stroke="#8B5CF6" strokeWidth="2" /><text x="70" y="114"
                textAnchor="middle" className="gnode-label" style={{ fontSize: '8.5px' }}>Fin IT</text>
              <circle cx="190" cy="110" r="14" fill="#111827" stroke="#8B5CF6" strokeWidth="2" /><text x="190"
                y="114" textAnchor="middle" className="gnode-label" style={{ fontSize: '8.5px' }}>Platform</text>
              <circle cx="40" cy="180" r="10" fill="#111827" stroke="#F97316" strokeWidth="2" /><text x="40" y="184"
                textAnchor="middle" className="gnode-sub">unowned</text>
              <circle cx="100" cy="180" r="10" fill="#111827" stroke="#3B82F6" strokeWidth="2" />
              <circle cx="160" cy="180" r="10" fill="#111827" stroke="#3B82F6" strokeWidth="2" />
              <circle cx="220" cy="180" r="10" fill="#111827" stroke="#F97316" strokeWidth="2" /><text x="220"
                y="184" textAnchor="middle" className="gnode-sub">unowned</text>
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}
