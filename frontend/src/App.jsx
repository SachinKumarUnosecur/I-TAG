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
  const [pageFading, setPageFading] = useState(false);
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
    if (next === page || pageFading) return;
    setPageFading(true);
    window.setTimeout(() => {
      setPage(next);
      if (mainRef.current) mainRef.current.scrollTop = 0;
      setPageFading(false);
    }, 350);
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

  const pageClass = (id) =>
    cn(ui.page, page === id ? 'block' : 'hidden');
  const sectionKey = (id) => (page === id ? id : `${id}-off`);

  return (
    <div className={ui.shell}>
      <Topbar
        onNavigate={navigate}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        theme={theme}
      />
      <Sidebar page={page} onNavigate={navigate} sync={sync} />

      <div className={cn(ui.main, pageFading && ui.mainFadeOut)} id="main" ref={mainRef}>
        <section className={pageClass('overview')} key={sectionKey('overview')}>
          <OverviewPage {...pageProps} />
        </section>
        <section className={pageClass('security')} key={sectionKey('security')}>
          <SecurityOverviewPage {...pageProps} />
        </section>
        <section className={pageClass('threats')} key={sectionKey('threats')}>
          <ThreatsPage {...pageProps} />
        </section>
        <section className={pageClass('incidents')} key={sectionKey('incidents')}>
          <IncidentsPage {...pageProps} />
        </section>
        <section className={pageClass('alerts')} key={sectionKey('alerts')}>
          <AlertsPage {...pageProps} />
        </section>
        <section className={pageClass('vulns')} key={sectionKey('vulns')}>
          <VulnsPage {...pageProps} />
        </section>
        <section className={pageClass('assets')} key={sectionKey('assets')}>
          <AssetsPage {...pageProps} />
        </section>
        <section className={pageClass('endpoints')} key={sectionKey('endpoints')}>
          <EndpointsPage {...pageProps} />
        </section>
        <section className={pageClass('identity')} key={sectionKey('identity')}>
          <IdentityPage {...pageProps} />
        </section>
        <section className={pageClass('cloud')} key={sectionKey('cloud')}>
          <CloudPage {...pageProps} />
        </section>
        <section className={pageClass('compliance')} key={sectionKey('compliance')}>
          <CompliancePage {...pageProps} />
        </section>
        <section className={pageClass('reports')} key={sectionKey('reports')}>
          <ReportsPage {...pageProps} />
        </section>
        <section className={pageClass('integrations')} key={sectionKey('integrations')}>
          <SettingsPage initial="Integrations" />
        </section>
        <section className={pageClass('settings')} key={sectionKey('settings')}>
          <SettingsPage />
        </section>

        <section className={pageClass('discover')} key={sectionKey('discover')}>
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
        <section className={pageClass('trace')} key={sectionKey('trace')}>
          <TracePage {...pageProps} activeTab={tabs.trace} onTab={setTab} />
        </section>
        <section className={pageClass('analyze')} key={sectionKey('analyze')}>
          <AnalyzePage {...pageProps} activeTab={tabs.analyze} onTab={setTab} />
        </section>
        <section className={pageClass('protect')} key={sectionKey('protect')}>
          <ProtectPage {...pageProps} />
        </section>
        <section className={pageClass('govern')} key={sectionKey('govern')}>
          <GovernPage {...pageProps} activeTab={tabs.govern} onTab={setTab} />
        </section>
        <section className={pageClass('copilot')} key={sectionKey('copilot')}>
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
