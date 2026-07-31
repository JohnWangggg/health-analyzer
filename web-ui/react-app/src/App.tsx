import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { LocaleProvider } from './i18n/LocaleProvider';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { TrendsPage } from './pages/TrendsPage';
import { ReportsPage } from './pages/ReportsPage';
import { DataPage } from './pages/DataPage';
import { PwaUpdateBanner } from './components/PwaUpdateBanner';
import './styles/theme.css';
import './styles/app.css';

/** Vite base is `/` or `/next/` for dual-track export under public/next */
const basename = (import.meta.env.BASE_URL || '/').replace(/\/$/, '') || '/';

export default function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <PwaUpdateBanner />
        <BrowserRouter basename={basename === '/' ? undefined : basename}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
              <Route path="trends" element={<TrendsPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="data" element={<DataPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </LocaleProvider>
    </ThemeProvider>
  );
}



