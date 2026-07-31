import { useEffect, useRef, useState } from 'react';
import { api } from './api/client';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import Drawer from './components/Drawer';
import LoginPage from './pages/LoginPage';
import OverviewPage from './pages/OverviewPage';
import SecurityOverviewPage from './pages/SecurityOverviewPage';
import ThreatsPage from './pages/ThreatsPage';
import IncidentsPage from './pages/IncidentsPage';
import AlertsPage from './pages/AlertsPage';
import VulnsPage from './pages/VulnsPage';
import AssetsPage from './pages/AssetsPage';
import EndpointsPage from './pages/EndpointsPage';
import IdentityPage from './pages/IdentityPage';
import CloudPage from './pages/CloudPage';
import CompliancePage from './pages/CompliancePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import DiscoverPage from './pages/DiscoverPage';
import TracePage from './pages/TracePage';
import AnalyzePage from './pages/AnalyzePage';
import ProtectPage from './pages/ProtectPage';
import GovernPage from './pages/GovernPage';
import CopilotPage from './pages/CopilotPage';
import './styles/index.css';
import { ui } from './lib/ui';
import { cn } from './lib/cn';

const DEFAULT_TABS = {
  discover: 'd1',
  trace: 't1',
  analyze: 'a1',
  govern: 'g1',
};

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('aegis-authed') === '1');
  const [page, setPage] = useState('overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('aegis-theme') || 'dark');
  const [tabs, setTabs] = useState(DEFAULT_TABS);
  const [drawer, setDrawer] = useState({ open: false, kind: null, payload: null });
  const [overview, setOverview] = useState(null);
  const [identities, setIdentities] = useState([]);
  const [sync, setSync] = useState(null);
  const mainRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('aegis-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!authed) return;
    api.overview().then(setOverview).catch(console.error);
    api.sync().then(setSync).catch(console.error);
    api.identities().then((d) => setIdentities(d.items || [])).catch(console.error);
  }, [authed]);

  const navigate = (next) => {
    setPage(next);
    if (mainRef.current) mainRef.current.scrollTop = 0;
  };

  const setTab = (tabId) => {
    const map = { d: 'discover', t: 'trace', a: 'analyze', g: 'govern' };
    const key = map[tabId[0]];
    if (key) setTabs((t) => ({ ...t, [key]: tabId }));
  };

  const openDrawer = (kind, payload = null) => setDrawer({ open: true, kind, payload });
  const closeDrawer = () => setDrawer({ open: false, kind: null, payload: null });

  const pageProps = {
    onNavigate: navigate,
    onOpenDrawer: openDrawer,
    data: { overview, identities },
  };

  if (!authed) {
    return (
      <LoginPage
        onLogin={() => {
          localStorage.setItem('aegis-authed', '1');
          setAuthed(true);
        }}
      />
    );
  }

  const pageClass = (id) => cn(ui.page, page !== id && 'hidden');

  return (
    <div className={ui.shell}>
      <Topbar
        onNavigate={navigate}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        theme={theme}
      />
      <Sidebar page={page} onNavigate={navigate} sync={sync} />

      <div className={ui.main} id="main" ref={mainRef}>
        <section className={pageClass('overview')}>
          <OverviewPage {...pageProps} />
        </section>
        <section className={pageClass('security')}>
          <SecurityOverviewPage {...pageProps} />
        </section>
        <section className={pageClass('threats')}>
          <ThreatsPage {...pageProps} />
        </section>
        <section className={pageClass('incidents')}>
          <IncidentsPage {...pageProps} />
        </section>
        <section className={pageClass('alerts')}>
          <AlertsPage {...pageProps} />
        </section>
        <section className={pageClass('vulns')}>
          <VulnsPage {...pageProps} />
        </section>
        <section className={pageClass('assets')}>
          <AssetsPage {...pageProps} />
        </section>
        <section className={pageClass('endpoints')}>
          <EndpointsPage {...pageProps} />
        </section>
        <section className={pageClass('identity')}>
          <IdentityPage {...pageProps} />
        </section>
        <section className={pageClass('cloud')}>
          <CloudPage {...pageProps} />
        </section>
        <section className={pageClass('compliance')}>
          <CompliancePage {...pageProps} />
        </section>
        <section className={pageClass('reports')}>
          <ReportsPage {...pageProps} />
        </section>
        <section className={pageClass('integrations')}>
          <SettingsPage initial="Integrations" />
        </section>
        <section className={pageClass('settings')}>
          <SettingsPage />
        </section>

        <section className={pageClass('discover')}>
          <DiscoverPage
            {...pageProps}
            activeTab={tabs.discover}
            onTab={setTab}
            identities={identities}
            onSelectIdentity={(i) => openDrawer('identity', i)}
            onFilterIdentities={async (params) => {
              const d = await api.identities(params);
              setIdentities(d.items || []);
            }}
          />
        </section>
        <section className={pageClass('trace')}>
          <TracePage {...pageProps} activeTab={tabs.trace} onTab={setTab} />
        </section>
        <section className={pageClass('analyze')}>
          <AnalyzePage {...pageProps} activeTab={tabs.analyze} onTab={setTab} />
        </section>
        <section className={pageClass('protect')}>
          <ProtectPage {...pageProps} />
        </section>
        <section className={pageClass('govern')}>
          <GovernPage {...pageProps} activeTab={tabs.govern} onTab={setTab} />
        </section>
        <section className={pageClass('copilot')}>
          <CopilotPage {...pageProps} />
        </section>
      </div>

      <Drawer
        open={drawer.open}
        kind={drawer.kind}
        payload={drawer.payload}
        onClose={closeDrawer}
        onAction={async (action) => {
          try {
            await api.threatAction('1', action);
            closeDrawer();
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </div>
  );
}
