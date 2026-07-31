import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import {
  WORKSPACES,
  useWorkspaceStore,
  type WorkspaceId,
} from '../stores/workspaceStore';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { useLocale } from '../i18n/LocaleProvider';
import type { AppLocaleUi } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import { useHealthStore } from '../store/useHealthStore';

const NAV_KEYS: Record<WorkspaceId, MessageKey> = {
  overview: 'nav.overview',
  trends: 'nav.trends',
  reports: 'nav.reports',
  data: 'nav.data',
};

/** Shorten long source labels for the compact topbar chip. */
function shortSource(label: string | null | undefined, max = 18): string | null {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  // Prefer basename for paths / fixture-like labels
  const base = trimmed.includes('/')
    ? trimmed.slice(trimmed.lastIndexOf('/') + 1)
    : trimmed;
  if (base.length <= max) return base;
  return `${base.slice(0, max - 1)}…`;
}

export function AppShell() {
  const { mode, setMode } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { active, setFromPath, setActive } = useWorkspaceStore();
  const [aboutOpen, setAboutOpen] = useState(false);
  const summary = useHealthStore((s) => s.summary);
  const sourceLabel = useHealthStore((s) => s.sourceLabel);

  useEffect(() => {
    setFromPath(location.pathname);
  }, [location.pathname, setFromPath]);

  const go = (id: WorkspaceId, path: string) => {
    setActive(id);
    navigate(path);
  };

  const sessionChipText = summary
    ? shortSource(sourceLabel) || t('shell.sessionReady')
    : null;

  return (
    <div className="app-shell" data-testid="app-shell" data-workspace={active}>
      <header className="app-topbar">
        <div className="brand">
          <strong>{t('brand')}</strong>
          <span className="brand-sub">{t('brandSub')}</span>
        </div>
        <div className="header-actions">
          {sessionChipText ? (
            <span
              className="shell-session-chip"
              data-testid="shell-session-chip"
              title={sourceLabel || t('shell.sessionReady')}
            >
              {sessionChipText}
            </span>
          ) : null}
          <Badge tone="accent" className="badge-dual-track">
            {t('dualTrack')}
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAboutOpen(true)}
            data-testid="open-about-sheet"
          >
            {t('about')}
          </Button>
          <label className="sr-only" htmlFor="locale-select">
            Language
          </label>
          <select
            id="locale-select"
            className="theme-select"
            value={locale}
            onChange={(e) => setLocale(e.target.value as AppLocaleUi)}
            data-testid="locale-select"
          >
            <option value="zh-CN">中文</option>
            <option value="en">EN</option>
          </select>
          <label className="sr-only" htmlFor="theme-select">
            {t('theme')}
          </label>
          <select
            id="theme-select"
            className="theme-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as ThemeMode)}
            data-testid="theme-select"
          >
            <option value="system">{t('theme.system')}</option>
            <option value="light">{t('theme.light')}</option>
            <option value="dark">{t('theme.dark')}</option>
          </select>
        </div>
      </header>

      <div className="app-body">
        <aside
          className="app-sidebar"
          aria-label="desktop nav"
          data-testid="desktop-sidebar"
        >
          {WORKSPACES.map((w) => (
            <NavLink
              key={w.id}
              to={w.path}
              end={w.path === '/'}
              className="nav-item"
              data-workspace-nav={w.id}
              data-nav-surface="sidebar"
              onClick={() => setActive(w.id)}
            >
              <span>{t(NAV_KEYS[w.id])}</span>
              <small>{w.description}</small>
            </NavLink>
          ))}
        </aside>

        <main className="app-main" id="main">
          <Outlet />
        </main>
      </div>

      <nav
        className="bottom-nav"
        aria-label="mobile nav"
        data-testid="mobile-bottom-nav"
      >
        {WORKSPACES.map((w) => (
          <button
            key={w.id}
            type="button"
            className="nav-item"
            data-workspace-nav={w.id}
            data-nav-surface="bottom"
            aria-current={active === w.id ? 'page' : undefined}
            onClick={() => go(w.id, w.path)}
          >
            {t(NAV_KEYS[w.id])}
          </button>
        ))}
      </nav>

      <footer className="app-footer">
        {t('footer')} · {t(NAV_KEYS[active])}
      </footer>

      <Sheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={t('about')}
      >
        <p className="muted">
          HealthCoreAdapter → @health-analyzer/lib. IndexedDB v5 sharded-v1
          compatible with history-db.js. No CDN / analytics.
        </p>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          <a href="../" data-testid="link-legacy-home">
            ← legacy
          </a>
        </p>
        <div className="row" style={{ marginTop: '0.75rem' }}>
          <Button
            size="sm"
            variant="secondary"
            data-testid="prefer-react-shell"
            onClick={() => {
              try {
                localStorage.setItem('ha-ui-shell', 'react');
              } catch {
                /* ignore */
              }
            }}
          >
            ui-shell=react
          </Button>
          <Button
            size="sm"
            variant="ghost"
            data-testid="prefer-legacy-shell"
            onClick={() => {
              try {
                localStorage.setItem('ha-ui-shell', 'legacy');
              } catch {
                /* ignore */
              }
            }}
          >
            ui-shell=legacy
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
