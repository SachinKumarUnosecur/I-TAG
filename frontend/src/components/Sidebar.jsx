import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

const Icon = {
  dashboard: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  overview: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  threat: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v10M12 17v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  incidents: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L3 20h18L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 9v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  alerts: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M18 8A6 6 0 0 0 6 8c0 3-1 5-2 6h16c-1-1-2-3-2-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  vulns: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 5V11C4 16 7 20 12 22C17 20 20 16 20 11V5L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 8v5M12 16v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  assets: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  endpoint: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  identity: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 19c1.5-3 4-4.5 7-4.5S17.5 16 19 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  cloud: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M7 18h11a4 4 0 0 0 .3-8A6 6 0 0 0 6.2 12.2 3.5 3.5 0 0 0 7 18Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  compliance: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 2L4 5V11C4 16 7 20 12 22C17 20 20 16 20 11V5L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  policies: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 10l8-5 8 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v8M19 10v8M2 21h20M9 14v4M15 14v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  reports: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 14l3-3 3 2 4-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  copilot: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  ),
  integrations: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M8 7h3v3H8zM13 14h3v3h-3z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11 8.5h2.5A2.5 2.5 0 0 1 16 11v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  discover: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M20 20l-4.8-4.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  trace: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="5" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="19" cy="6" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="18" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7l8 9M17 7l-8 9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  ),
  analyze: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M3 17l4-6 4 3 5-8 5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  protect: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 2L4 5V11C4 16 7 20 12 22C17 20 20 16 20 11V5L12 2Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  ),
};

const groups = [
  {
    label: 'Operations',
    items: [
      { id: 'overview', label: 'Dashboard', icon: Icon.dashboard },
      { id: 'security', label: 'Security Overview', icon: Icon.overview },
      { id: 'threats', label: 'Threat Detection', icon: Icon.threat, badge: 6 },
      { id: 'incidents', label: 'Incidents', icon: Icon.incidents, badge: 3 },
      { id: 'alerts', label: 'Alerts', icon: Icon.alerts, badge: 18 },
      { id: 'vulns', label: 'Vulnerabilities', icon: Icon.vulns },
    ],
  },
  {
    label: 'Coverage',
    items: [
      { id: 'assets', label: 'Asset Inventory', icon: Icon.assets },
      { id: 'endpoints', label: 'Endpoint Protection', icon: Icon.endpoint, badge: 2 },
      { id: 'identity', label: 'Identity Security', icon: Icon.identity },
      { id: 'discover', label: 'Discover', icon: Icon.discover },
      { id: 'trace', label: 'Trace', icon: Icon.trace },
      { id: 'cloud', label: 'Cloud Security', icon: Icon.cloud },
      { id: 'protect', label: 'Protect', icon: Icon.protect, badge: 4 },
    ],
  },
  {
    label: 'Governance',
    items: [
      { id: 'compliance', label: 'Compliance', icon: Icon.compliance },
      { id: 'govern', label: 'Policies', icon: Icon.policies },
      { id: 'analyze', label: 'Analyze', icon: Icon.analyze, badge: 12 },
      { id: 'reports', label: 'Reports', icon: Icon.reports },
    ],
  },
  {
    label: 'Platform',
    items: [
      { id: 'copilot', label: 'AI Security Assistant', icon: Icon.copilot },
      { id: 'integrations', label: 'Integrations', icon: Icon.integrations },
      { id: 'settings', label: 'Settings', icon: Icon.settings },
    ],
  },
];

export default function Sidebar({ page, onNavigate, sync }) {
  return (
    <div className={ui.sidebar}>
      {groups.map((group) => (
        <div key={group.label}>
          <div className={ui.navGroupLabel}>{group.label}</div>
          {group.items.map((item) => (
            <div
              key={item.id}
              className={cn(ui.navItem, page === item.id && ui.navItemActive)}
              data-page={item.id}
              onClick={() => onNavigate(item.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onNavigate(item.id)}
            >
              {item.icon}
              {item.label}
              {item.badge != null && <span className={ui.nBadge}>{item.badge}</span>}
            </div>
          ))}
        </div>
      ))}

      <div className={ui.sidebarFoot}>
        <span className={ui.pulse} />
        {sync?.status || 'All connectors syncing'}
        <br />
        Last sync {sync?.lastSync || '2 min ago'}
      </div>
    </div>
  );
}
