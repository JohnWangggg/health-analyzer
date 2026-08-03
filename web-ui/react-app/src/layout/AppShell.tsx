import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';
import {
  WORKSPACES,
  useWorkspaceStore,
  type WorkspaceId,
} from '../stores/workspaceStore';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';
import { useLocale } from '../i18n/LocaleProvider';
import type { AppLocaleUi } from '../i18n/messages';
import type { MessageKey } from '../i18n/messages';
import { useHealthStore } from '../store/useHealthStore';
import {
  DashboardModeChrome,
  useDashboardMode,
} from '../features/dashboard/DashboardMode';
import { ConnectivityBanner } from '../components/ConnectivityBanner';
import { NavIcon, ShellIcons } from '../components/icons/navIcons';
import { PageTransition } from '../motion/PageTransition';

const NAV_KEYS: Record<WorkspaceId, MessageKey> = {
  overview: 'nav.overview',
  trends: 'nav.trends',
  reports: 'nav.reports',
  data: 'nav.data',
};

const NAV_DESC_KEYS: Record<WorkspaceId, MessageKey> = {
  overview: 'nav.overview.desc',
  trends: 'nav.trends.desc',
  reports: 'nav.reports.desc',
  data: 'nav.data.desc',
};

/** Alt+1..4 → workspace (DigitN for layout-independent matching). */
const KBD_WORKSPACE: Record<string, WorkspaceId> = {
  '1': 'overview',
  '2': 'trends',
  '3': 'reports',
  '4': 'data',
};

const KBD_ARIA: Record<WorkspaceId, string> = {
  overview: 'Alt+1',
  trends: 'Alt+2',
  reports: 'Alt+3',
  data: 'Alt+4',
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

function formatTopbarDate(locale: AppLocaleUi): string {
  const tag =
    locale === 'en' ? 'en-US' : locale === 'zh-TW' ? 'zh-TW' : 'zh-CN';
  try {
    return new Intl.DateTimeFormat(tag, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function freshnessChip(
  days: number | null | undefined,
  t: (k: MessageKey) => string,
): { text: string; tone: 'ok' | 'watch' | 'alert' | 'neutral' } {
  if (days == null) {
    return { text: t('shell.freshness.idle'), tone: 'neutral' };
  }
  if (days <= 1) {
    return {
      text: days === 0 ? t('shell.freshness.today') : t('shell.freshness.yesterday'),
      tone: 'ok',
    };
  }
  if (days <= 7) {
    return {
      text: t('shell.freshness.days').replace('{n}', String(days)),
      tone: 'watch',
    };
  }
  return {
    text: t('shell.freshness.stale').replace('{n}', String(days)),
    tone: 'alert',
  };
}

export function AppShell() {
  const { mode, setMode } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { active, setFromPath, setActive } = useWorkspaceStore();
  const [aboutOpen, setAboutOpen] = useState(false);
  const summary = useHealthStore((s) => s.summary);
  const { active: dashboardOn, toggle: toggleDashboard, setMode: setDashboard } =
    useDashboardMode();

  useEffect(() => {
    setFromPath(location.pathname);
  }, [location.pathname, setFromPath]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const digit = e.code.startsWith('Digit')
        ? e.code.slice('Digit'.length)
        : e.key >= '1' && e.key <= '4'
          ? e.key
          : '';
      const id = digit ? KBD_WORKSPACE[digit] : undefined;
      if (!id) return;
      if (aboutOpen) return;
      if (isEditableTarget(e.target)) return;

      const ws = WORKSPACES.find((w) => w.id === id);
      if (!ws) return;
      e.preventDefault();
      setActive(id);
      navigate(ws.path);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [aboutOpen, navigate, setActive]);

  const go = (id: WorkspaceId, path: string) => {
    setActive(id);
    navigate(path);
  };

  const todayLabel = useMemo(() => formatTopbarDate(locale), [locale]);
  const fresh = useMemo(
    () => freshnessChip(summary?.freshnessDays, t),
    [summary?.freshnessDays, t],
  );

  return (
    <div className="app-shell" data-testid="app-shell" data-workspace={active}>
      <DashboardModeChrome
        active={dashboardOn}
        onExit={() => setDashboard(false)}
      />
      <ConnectivityBanner />
      <header className="app-topbar">
        <div className="brand">
          <strong>{t('brand')}</strong>
          <span className="brand-sub">{t('brandSub')}</span>
        </div>

        <div className="topbar-context" data-testid="topbar-context">
          <span className="shell-date-chip" data-testid="shell-date-chip">
            {todayLabel}
          </span>
          <span
            className={`shell-freshness-chip shell-freshness-${fresh.tone}`}
            data-testid="shell-freshness-chip"
            title={
              summary?.dateRange?.end
                ? `${summary.dateRange.start || '—'} → ${summary.dateRange.end}`
                : t('shell.freshness.idle')
            }
          >
            {fresh.text}
          </span>
        </div>

        <div className="header-actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleDashboard}
            data-testid="btn-dashboard-mode"
            aria-pressed={dashboardOn}
            title={t('tv.enter')}
            className="btn-dashboard-mode"
          >
            <ShellIcons.monitor size={16} aria-hidden />
            <span className="btn-label-text">
              {dashboardOn ? t('tv.exit') : t('tv.enter')}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAboutOpen(true)}
            data-testid="open-about-sheet"
          >
            <ShellIcons.settings size={16} aria-hidden />
            <span className="btn-label-text">{t('shell.settings')}</span>
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
            <option value="zh-CN">简体</option>
            <option value="zh-TW">繁體</option>
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
              aria-keyshortcuts={KBD_ARIA[w.id]}
              onClick={() => setActive(w.id)}
            >
              <span className="nav-item-row">
                <NavIcon id={w.id} className="nav-item-icon" />
                <span>{t(NAV_KEYS[w.id])}</span>
              </span>
              <small>{t(NAV_DESC_KEYS[w.id])}</small>
            </NavLink>
          ))}
        </aside>

        <main className="app-main" id="main">
          <PageTransition>
            <Outlet />
          </PageTransition>
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
            aria-keyshortcuts={KBD_ARIA[w.id]}
            aria-current={active === w.id ? 'page' : undefined}
            onClick={() => go(w.id, w.path)}
          >
            <NavIcon id={w.id} size={20} className="nav-item-icon" />
            <span>{t(NAV_KEYS[w.id])}</span>
          </button>
        ))}
      </nav>

      <footer className="app-footer">
        {t('footer')} · {t(NAV_KEYS[active])}
        <span className="shell-kbd-hint"> · {t('shell.kbdHint')}</span>
      </footer>

      <Sheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title={t('shell.settings')}
      >
        <p className="muted">{t('shell.aboutBody')}</p>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          {t('shell.defaultEntry')}
        </p>
        <div className="about-prefs" style={{ marginTop: '1rem' }}>
          <label className="user-ctx-field">
            <span>{t('theme')}</span>
            <select
              className="theme-select"
              value={mode}
              onChange={(e) => setMode(e.target.value as ThemeMode)}
              data-testid="about-theme-select"
            >
              <option value="system">{t('theme.system')}</option>
              <option value="light">{t('theme.light')}</option>
              <option value="dark">{t('theme.dark')}</option>
            </select>
          </label>
          <label className="user-ctx-field" style={{ marginTop: '0.75rem' }}>
            <span>Language</span>
            <select
              className="theme-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as AppLocaleUi)}
              data-testid="about-locale-select"
            >
              <option value="zh-CN">简体</option>
              <option value="zh-TW">繁體</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
        <details className="about-legacy-fold" style={{ marginTop: '0.75rem' }}>
          <summary className="muted" style={{ cursor: 'pointer' }}>
            {t('shell.recoveryTitle')}
          </summary>
          <p
            className="muted"
            style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}
          >
            {t('shell.recoveryHint')}
          </p>
        </details>
      </Sheet>
    </div>
  );
}
