import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AppShell } from './layout/AppShell';
import { OverviewPage } from './pages/OverviewPage';
import { TrendsPage } from './pages/TrendsPage';
import { ReportsPage } from './pages/ReportsPage';
import { DataPage } from './pages/DataPage';
import './styles/theme.css';
import './styles/app.css';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
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
    </ThemeProvider>
  );
}
