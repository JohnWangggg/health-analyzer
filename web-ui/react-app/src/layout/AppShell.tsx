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

export function AppShell() {
  const { mode, setMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();
  const { active, setFromPath, setActive } = useWorkspaceStore();
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    setFromPath(location.pathname);
  }, [location.pathname, setFromPath]);

  const go = (id: WorkspaceId, path: string) => {
    setActive(id);
    navigate(path);
  };

  return (
    <div className="app-shell" data-testid="app-shell" data-workspace={active}>
      <header className="app-topbar">
        <div className="brand">
          <strong>健康 OS · React</strong>
          <span>本地优先预览 · 非默认生产入口</span>
        </div>
        <div className="header-actions">
          <Badge tone="accent">双轨</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAboutOpen(true)}
            data-testid="open-about-sheet"
          >
            关于
          </Button>
          <label className="sr-only" htmlFor="theme-select">
            主题
          </label>
          <select
            id="theme-select"
            className="theme-select"
            value={mode}
            onChange={(e) => setMode(e.target.value as ThemeMode)}
            data-testid="theme-select"
          >
            <option value="system">系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
      </header>

      <div className="app-body">
        <aside
          className="app-sidebar"
          aria-label="桌面工作区导航"
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
              <span>{w.label}</span>
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
        aria-label="手机工作区导航"
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
            {w.shortLabel}
          </button>
        ))}
      </nav>

      <footer className="app-footer">
        本地优先 · 无 CDN · 生产默认仍为 web-ui/public · 当前工作区：
        {WORKSPACES.find((w) => w.id === active)?.label}
      </footer>

      <Sheet
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        title="关于双轨预览"
      >
        <p className="muted">
          本壳通过 HealthCoreAdapter 调用 @health-analyzer/lib，不重写解析与统计。
          IndexedDB 契约与 legacy history-db.js 对齐。健康原始数据不离开本机。
        </p>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          切换生产入口见 docs/DUAL_TRACK_UI.md；legacy 始终可回退。
        </p>
      </Sheet>
    </div>
  );
}
