import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  formatDashboardClock,
  loadDashboardModePref,
  prefersReducedMotion,
  saveDashboardModePref,
} from '../../core/dashboardMode';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';

const FOCUS_STEPS = ['metrics', 'signals', 'priority'] as const;
type FocusStep = (typeof FOCUS_STEPS)[number];

/**
 * Health TV / large-display mode overlay (legacy parity).
 * Hides chrome via body class; Esc or exit button to leave.
 */
export function useDashboardMode() {
  const [active, setActive] = useState(() => loadDashboardModePref());

  const setMode = (on: boolean) => {
    setActive(on);
    saveDashboardModePref(on);
  };

  useEffect(() => {
    document.body.classList.toggle('health-dashboard-mode', active);
    document.body.setAttribute(
      'data-dashboard-mode',
      active ? '1' : '0',
    );
    return () => {
      document.body.classList.remove('health-dashboard-mode');
      document.body.removeAttribute('data-dashboard-mode');
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  return { active, setMode, toggle: () => setMode(!active) };
}

export function DashboardModeChrome({
  active,
  onExit,
}: {
  active: boolean;
  onExit: () => void;
}) {
  const { t } = useLocale();
  const summary = useHealthStore((s) => s.summary);
  const [clock, setClock] = useState(() => formatDashboardClock());
  const [focus, setFocus] = useState<FocusStep>('metrics');

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setClock(formatDashboardClock()), 1000);
    return () => clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % FOCUS_STEPS.length;
      setFocus(FOCUS_STEPS[i]!);
      document.body.setAttribute('data-dashboard-focus', FOCUS_STEPS[i]!);
    }, 12_000);
    document.body.setAttribute('data-dashboard-focus', focus);
    return () => {
      clearInterval(id);
      document.body.removeAttribute('data-dashboard-focus');
    };
  }, [active, focus]);

  if (!active) return null;

  const end = summary?.dateRange?.end || '';
  const focusLabel =
    focus === 'signals'
      ? t('tv.focus.signals')
      : focus === 'priority'
        ? t('tv.focus.priority')
        : t('tv.focus.metrics');

  return (
    <div className="dashboard-mode-bar" data-testid="dashboard-mode-bar">
      <time className="dashboard-clock" data-testid="dashboard-clock">
        {clock}
      </time>
      <span className="dashboard-data-updated" data-testid="dashboard-data-updated">
        {end
          ? t('tv.dataUpdated').replace('{end}', end)
          : t('tv.dataWaiting')}
      </span>
      <span className="dashboard-focus-label muted">{focusLabel}</span>
      <Button
        variant="secondary"
        size="sm"
        type="button"
        data-testid="dashboard-exit"
        onClick={onExit}
      >
        {t('tv.exit')}
      </Button>
    </div>
  );
}
