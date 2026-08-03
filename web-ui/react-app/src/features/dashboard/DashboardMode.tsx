import { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { Button } from '../../components/ui/Button';
import {
  formatDashboardClock,
  loadDashboardModePref,
  prefersReducedMotion,
  saveDashboardModePref,
} from '../../core/dashboardMode';
import { useHealthStore } from '../../store/useHealthStore';
import { useLocale } from '../../i18n/LocaleProvider';
import { MOTION } from '../../motion/tokens';
import { DashboardAtmosphere } from './DashboardAtmosphere';

const FOCUS_STEPS = ['metrics', 'signals', 'priority'] as const;
type FocusStep = (typeof FOCUS_STEPS)[number];

/** Auto-rotate interval for TV focus (ms). */
const FOCUS_ROTATE_MS = 12_000;

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
 * Health TV / dashboard mode overlay.
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
      document.body.removeAttribute('data-dashboard-focus');
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

  useEffect(() => {
    const onFs = () => {
      if (!document.fullscreenElement && loadDashboardModePref()) {
        /* keep session pref when fullscreen unavailable */
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
  const [focus, setFocus] = useState<FocusStep>('priority');
  const [rotateKey, setRotateKey] = useState(0);
  const reduce = prefersReducedMotion();

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
    if (!active || reduce) return;
    const id = window.setInterval(() => {
      setFocus((prev) => {
        const i = FOCUS_STEPS.indexOf(prev);
        const next = FOCUS_STEPS[(i < 0 ? 0 : i + 1) % FOCUS_STEPS.length]!;
        return next;
      });
      setRotateKey((k) => k + 1);
    }, FOCUS_ROTATE_MS);
    return () => clearInterval(id);
  }, [active, reduce]);

  // Manual focus: restart progress visual
  const selectFocus = (step: FocusStep) => {
    setFocus(step);
    setRotateKey((k) => k + 1);
  };

  if (!active) return null;

  const end = summary?.dateRange?.end || '';
  const focusLabel =
    focus === 'signals'
      ? t('tv.focus.signals')
      : focus === 'priority'
        ? t('tv.focus.priority')
        : t('tv.focus.metrics');

  return (
    <>
      <DashboardAtmosphere />
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
        <m.span
          key={focus}
          className="dashboard-focus-label muted"
          initial={reduce ? false : { opacity: 0.4, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION.navMs / 1000, ease: MOTION.easeOut }}
        >
          {focusLabel}
        </m.span>
        <div
          className="dashboard-focus-btns"
          role="group"
          aria-label={focusLabel}
        >
          {FOCUS_STEPS.map((step) => (
            <Button
              key={step}
              size="sm"
              variant={focus === step ? 'primary' : 'ghost'}
              type="button"
              data-testid={`dashboard-focus-${step}`}
              onClick={() => selectFocus(step)}
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
        {!reduce ? (
          <div
            className="dashboard-focus-progress"
            data-testid="dashboard-focus-progress"
            aria-hidden
          >
            <m.div
              key={rotateKey}
              className="dashboard-focus-progress-bar"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{
                duration: FOCUS_ROTATE_MS / 1000,
                ease: 'linear',
              }}
            />
          </div>
        ) : null}
      </div>
    </>
  );
}
