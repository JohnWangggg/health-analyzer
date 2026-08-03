import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { LocaleProvider } from './i18n/LocaleProvider';
import { MotionRoot } from './motion/MotionRoot';
import { AppShell } from './layout/AppShell';
import { LoadingState } from './components/ui/EmptyState';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import { PwaInstallBanner } from './components/PwaInstallBanner';
import './styles/theme.css';
import './styles/app.css';

/** Vite base is `/` (production default). Optional `/next/` only for deprecated preview export. */
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

/**
 * Route-level code split: each workspace is its own chunk so first paint
 * only pays for shell + the active page (not Trends/Reports/Data together).
 */
const OverviewPage = lazy(() =>
  import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })),
);
const TrendsPage = lazy(() =>
  import('./pages/TrendsPage').then((m) => ({ default: m.TrendsPage })),
);
const ReportsPage = lazy(() =>
  import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const DataPage = lazy(() =>
  import('./pages/DataPage').then((m) => ({ default: m.DataPage })),
);

/** Keep inside AppShell Outlet so chrome never unmounts during route suspend. */
function RouteFallback() {
  return (
    <div
      className="route-fallback"
      style={{ padding: '1.5rem' }}
      data-testid="route-fallback"
    >
      <LoadingState label="…" />
    </div>
  );
}

function LazyPage({ page }: { page: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{page}</Suspense>;
}

export default function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <MotionRoot>
          <PwaUpdateBanner />
          <PwaInstallBanner />
          <BrowserRouter basename={basename === '/' ? undefined : basename}>
            <Routes>
              <Route element={<AppShell />}>
                <Route
                  index
                  element={<LazyPage page={<OverviewPage />} />}
                />
                <Route
                  path="trends"
                  element={<LazyPage page={<TrendsPage />} />}
                />
                <Route
                  path="reports"
                  element={<LazyPage page={<ReportsPage />} />}
                />
                <Route path="data" element={<LazyPage page={<DataPage />} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </MotionRoot>
      </LocaleProvider>
    </ThemeProvider>
  );
}
