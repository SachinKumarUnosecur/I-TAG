import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Icon } from './components/ui';
import Dashboard from './components/Dashboard';
import AccessDiscovery from './components/AccessDiscovery';
import DelegationChain from './components/DelegationChain';
import ExposureMap from './components/ExposureMap';
import ExposureIdentity from './components/ExposureIdentity';
import RiskProfiles from './components/RiskProfiles';
import ThreatProfile from './components/ThreatProfile';
import AccessReviews from './components/AccessReviews';
import IdentityLifecycle from './components/IdentityLifecycle';

const SIDE_NAV = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/access-discovery', label: 'Discovery', icon: 'search' },
  { path: '/delegation-chain', label: 'Delegation', icon: 'gitBranch' },
  { path: '/exposure-map', label: 'Exposure', icon: 'eye' },
  { path: '/risk-profiles', label: 'Risk', icon: 'activity' },
  { path: '/threat-profile', label: 'Threat', icon: 'target' },
  { path: '/access-reviews', label: 'Reviews', icon: 'clipboard' },
  { path: '/identity-lifecycle', label: 'Lifecycle', icon: 'users' },
];

function TopStrip() {
  return (
    <header className="top-strip">
      <div className="top-strip-left">
        <div className="top-strip-brand">
          <div className="top-strip-logo">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path d="M12 2l8 3.5v6.2c0 5.1-3.4 9.7-8 10.8-4.6-1.1-8-5.7-8-10.8V5.5L12 2z" fill="#00B44A" />
              <text x="12" y="15" textAnchor="middle" fill="#fff" fontSize="9" fontWeight="800" fontFamily="Inter, sans-serif">1</text>
            </svg>
          </div>
          <span className="top-strip-brand-name">unosecur</span>
        </div>

        <button type="button" className="top-strip-tenant" aria-label="Select tenant">
          <span className="top-strip-tenant-dot" />
          Unosecur
          <Icon name="chevronDown" size={14} />
        </button>
      </div>

      <div className="top-strip-right">
        <button type="button" className="top-strip-icon-btn" title="Documentation">
          <Icon name="book" size={18} />
        </button>
        <button type="button" className="top-strip-icon-btn" title="Notifications">
          <Icon name="bell" size={18} />
          <span className="top-strip-badge">3</span>
        </button>
        <div className="top-strip-avatar" title="Tom Walker">TW</div>
      </div>
    </header>
  );
}

function SideStrip({ location, navigate }) {
  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <aside className="side-strip">
      <nav className="side-strip-nav">
        {SIDE_NAV.map(item => (
          <button
            key={item.path}
            type="button"
            className={`side-strip-item ${isActive(item.path) ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span className="side-strip-icon">
              <Icon name={item.icon} size={18} />
            </span>
            <span className="side-strip-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="app-shell">
      <TopStrip />
      <div className="app-body">
        <SideStrip location={location} navigate={navigate} />
        <div className="main-area">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/access-discovery" element={<AccessDiscovery />} />
            <Route path="/delegation-chain" element={<DelegationChain />} />
            <Route path="/exposure-map" element={<ExposureMap />} />
            <Route path="/exposure-map/:identityId" element={<ExposureIdentity />} />
            <Route path="/risk-profiles" element={<RiskProfiles />} />
            <Route path="/threat-profile" element={<ThreatProfile />} />
            <Route path="/access-reviews" element={<AccessReviews />} />
            <Route path="/identity-lifecycle" element={<IdentityLifecycle />} />
          </Routes>
        </div>
      </div>
    </div>
  );
}
