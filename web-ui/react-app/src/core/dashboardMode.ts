/**
 * Health TV / dashboard mode preference — sessionStorage (legacy key).
 */
export const DASHBOARD_MODE_KEY = 'health-analyzer-dashboard-mode';

export function loadDashboardModePref(): boolean {
  try {
    return sessionStorage.getItem(DASHBOARD_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveDashboardModePref(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(DASHBOARD_MODE_KEY, '1');
    else sessionStorage.removeItem(DASHBOARD_MODE_KEY);
  } catch {
    /* ignore */
  }
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function formatDashboardClock(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
