import { useState } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './components/ui';
import Dashboard from './components/Dashboard';
import AccessDiscovery from './components/AccessDiscovery';
import DelegationChain from './components/DelegationChain';
import ExposureMap from './components/ExposureMap';
import RiskProfiles from './components/RiskProfiles';
import UnifiedImpact from './components/UnifiedImpact';
import ThreatProfile from './components/ThreatProfile';
import IdentityOwnership from './components/IdentityOwnership';
import AccessReviews from './components/AccessReviews';
import IdentityLifecycle from './components/IdentityLifecycle';
import { orphanedAccounts, dashboardSummary } from './data/mockData';

const NAV = [
  {
    section: 'Traceability',
    items: [
      { path: '/', label: 'Overview', icon: 'home' },
      { path: '/access-discovery', label: 'Identity risk', icon: 'activity' },
      { path: '/delegation-chain', label: 'Delegation Chain', icon: 'gitBranch' },
      { path: '/exposure-map', label: 'Exposure Map', icon: 'eye' },
      { path: '/risk-profiles', label: 'Identity Risk Profile', icon: 'activity' },
      { path: '/unified-impact', label: 'Unified Impact Analysis', icon: 'zap' },
      { path: '/threat-profile', label: 'Identity Threat Profile', icon: 'target' },
    ],
  },
  {
    section: 'Accountability',
    items: [
      { path: '/identity-ownership', label: 'Identity Ownership', icon: 'lock', badge: dashboardSummary.orphanedAccountability },
    ],
  },
  {
    section: 'Governance',
    items: [
      { path: '/access-reviews', label: 'Access Reviews', icon: 'clipboard' },
      { path: '/identity-lifecycle', label: 'Identity Lifecycle', icon: 'users', badge: orphanedAccounts.length },
    ],
  },
];

function Sidebar({ location, navigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="sidebar-logo-mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>
        <div>
          <div className="sidebar-logo-text">ITAG</div>
          <div className="sidebar-logo-sub">by Unosecur</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.section} className="nav-section">
            <div className="nav-section-label">{group.section}</div>
            {group.items.map(item => (
              <div key={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => navigate(item.path)}>
                <span className="nav-icon"><Icon name={item.icon} size={15} /></span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </div>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-scan-info">
          Last sync: <span className="sidebar-scan-time">14:20 UTC</span>
        </div>
        <div className="sidebar-scan-info" style={{ marginTop: 2 }}>
          Tenant: <span className="sidebar-scan-time">Unosecur Demo</span>
        </div>
      </div>
    </aside>
  );
}

const PAGE_TITLES = {
  '/': 'Overview',
  '/access-discovery': 'Identity risk',
  '/delegation-chain': 'Delegation Chain',
  '/exposure-map': 'Exposure Map',
  '/risk-profiles': 'Identity Risk Profile',
  '/unified-impact': 'Unified Impact Analysis',
  '/threat-profile': 'Identity Threat Profile',
  '/identity-ownership': 'Identity Ownership',
  '/access-reviews': 'Access Reviews',
  '/identity-lifecycle': 'Identity Lifecycle',
};

function Topbar({ location }) {
  const title = PAGE_TITLES[location.pathname] || 'ITAG';
  const section = NAV.find(g => g.items.some(i => i.path === location.pathname))?.section;
  return (
    <header className="topbar">
      {section && <span className="topbar-breadcrumb">{section}</span>}
      {section && <Icon name="chevronRight" size={12} color="var(--text-tertiary)" />}
      <span className="topbar-page-title">{title}</span>
      <div className="topbar-spacer" />
      <div className="topbar-scan-badge">
        <div className="topbar-scan-dot" />
        Live scan active
      </div>
      <div className="topbar-tenant">
        <div className="topbar-tenant-dot" />
        Unosecur Demo
        <Icon name="chevronDown" size={12} color="var(--text-tertiary)" />
      </div>
      <div className="topbar-avatar" title="Tom Walker (Security)">TW</div>
    </header>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app-shell">
      <Sidebar location={location} navigate={navigate} />
      <div className="main-area">
        <Topbar location={location} />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/access-discovery" element={<AccessDiscovery />} />
          <Route path="/delegation-chain" element={<DelegationChain />} />
          <Route path="/exposure-map" element={<ExposureMap />} />
          <Route path="/risk-profiles" element={<RiskProfiles />} />
          <Route path="/unified-impact" element={<UnifiedImpact />} />
          <Route path="/threat-profile" element={<ThreatProfile />} />
          <Route path="/identity-ownership" element={<IdentityOwnership />} />
          <Route path="/access-reviews" element={<AccessReviews />} />
          <Route path="/identity-lifecycle" element={<IdentityLifecycle />} />
        </Routes>
      </div>
    </div>
  );
}
