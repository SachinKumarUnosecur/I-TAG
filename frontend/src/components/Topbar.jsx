import { ui } from '../lib/ui';
import { cn } from '../lib/cn';

export default function Topbar({ onNavigate, onToggleTheme, theme }) {
  return (
    <div className={ui.topbar}>
      <div className={ui.brand}>
        <img
          src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSoSumsULCCZMc0P1nV4-NihGLl2slx9XrW5CxWGb3edg&s=10"
          className="h-8 w-8"
          alt="ITAG"
        />
        <div className={ui.brandName}>
          ITAG
          <span className={ui.brandSub}>Security Platform</span>
        </div>
      </div>

      <div className={ui.searchWrap}>
        <svg className={ui.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21L16.5 16.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className={ui.searchInput}
          placeholder="Search threats, incidents, assets, identities, CVEs…"
          aria-label="Global search"
        />
        <span className={ui.kbd}>⌘K</span>
      </div>

      <div className={ui.topActions}>
        <div className={ui.orgSwitch} role="button" tabIndex={0} title="Organization switcher">
          <span className={ui.orgDot}>AC</span> Acme Corp
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="text-text-3">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <button className={ui.iconBtn} aria-label="Help Center" title="Help Center">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.8 2.1c-.8.5-1.3 1-1.3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M12 17h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <button className={ui.iconBtn} aria-label="Notifications" title="Notifications" onClick={() => onNavigate('alerts')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
            <path d="M18 8A6 6 0 0 0 6 8c0 3-1 5-2 6h16c-1-1-2-3-2-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M10 21a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <span className={ui.dotBadge} />
        </button>

        <button className={cn(ui.iconBtn, ui.aiBtn)} onClick={() => onNavigate('copilot')} title="Open AI Copilot">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="text-purple">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          AI Copilot
        </button>

        <button className={ui.themeToggle} onClick={onToggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            {theme === 'dark' ? (
              <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
            ) : (
              <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            )}
          </svg>
        </button>

        <div className={ui.avatar} title="Profile menu" role="button" tabIndex={0}>RC</div>
      </div>
    </div>
  );
}
