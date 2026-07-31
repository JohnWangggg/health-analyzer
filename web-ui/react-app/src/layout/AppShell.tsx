import { NavLink, Outlet } from 'react-router-dom';
import { useTheme, type ThemeMode } from '../theme/ThemeProvider';

const NAV: Array<{ to: string; label: string; end?: boolean }> = [
  { to: '/', label: '总览', end: true },
  { to: '/trends', label: '趋势' },
  { to: '/reports', label: '报告' },
  { to: '/data', label: '数据' },
];


export function AppShell() {
  const { mode, setMode } = useTheme();

  return (
    <div className="app-shell" data-testid="app-shell">
      <header className="app-header">
        <div className="brand">
          <strong>健康分析</strong>
          <span>React 预览壳 · 非生产默认入口</span>
        </div>
        <nav className="app-nav" aria-label="工作区">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className="nav-link"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
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
      <main className="app-main" id="main">
        <Outlet />
      </main>
      <footer className="app-footer">
        本地优先 · 无 CDN/分析上报 · 生产仍部署 web-ui/public
      </footer>
    </div>
  );
}
