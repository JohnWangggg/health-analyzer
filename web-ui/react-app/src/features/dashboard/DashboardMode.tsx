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

async function requestFs(): Promise<void> {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      await el.requestFullscreen();
    }
  } catch {
    /* ignore — user gesture / browser policy */
  }
}

async function exitFs(): Promise<void> {
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen();
    }
  } catch {
    /* ignore */
  }
}

/**
 * Health TV / large-display mode overlay (legacy parity).
 * Hides chrome via body class; Esc or exit button to leave.
 * Optional Fullscreen API for kiosk / TV displays.
 */
export function useDashboardMode() {
  const [active, setActive] = useState(() => loadDashboardModePref());

  const setMode = (on: boolean) => {
    setActive(on);
    saveDashboardModePref(on);
    if (on) void requestFs();
    else void exitFs();
  };

  useEffect(() => {
    document.body.classList.toggle('health-dashboard-mode', active);
    document.body.setAttribute('data-dashboard-mode', active ? '1' : '0');
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

  // Leave TV mode if user exits fullscreen via browser chrome
  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && loadDashboardModePref()) {
        // keep session pref; only exit if we entered via our toggle
        // do not auto-exit mode when fullscreen unavailable
      }
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

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
    if (!active) return;
    document.body.setAttribute('data-dashboard-focus', focus);
  }, [active, focus]);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    const id = window.setInterval(() => {
      setFocus((prev) => {
        const i = FOCUS_STEPS.indexOf(prev);
        const next = FOCUS_STEPS[(i < 0 ? 0 : i + 1) % FOCUS_STEPS.length]!;
        return next;
      });
    }, 12_000);
    return () => clearInterval(id);
  }, [active]);

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
      <span
        className="dashboard-data-updated"
        data-testid="dashboard-data-updated"
      >
        {end
          ? t('tv.dataUpdated').replace('{end}', end)
          : t('tv.dataWaiting')}
      </span>
      <span className="dashboard-focus-label muted">{focusLabel}</span>
      <div className="dashboard-focus-btns" role="group" aria-label={focusLabel}>
        {FOCUS_STEPS.map((step) => (
          <Button
            key={step}
            size="sm"
            variant={focus === step ? 'primary' : 'ghost'}
            type="button"
            data-testid={`dashboard-focus-${step}`}
            onClick={() => setFocus(step)}
          >
            {step === 'signals'
              ? t('tv.focus.signals')
              : step === 'priority'
                ? t('tv.focus.priority')
                : t('tv.focus.metrics')}
          </Button>
        ))}
      </div>
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
