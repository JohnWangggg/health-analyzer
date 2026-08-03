import { lazy, Suspense, useEffect, useState } from 'react';

const OverviewAdvancedTools = lazy(() =>
  import('./OverviewAdvancedTools').then((m) => ({
    default: m.OverviewAdvancedTools,
  })),
);

/**
 * Mount advanced Overview panels after first paint so OverviewPage
 * parse/exec stays on the critical KPI/import path.
 *
 * requestIdleCallback (with timeout) keeps e2e within default timeouts:
 * panels attach once idle fires (≤ timeout ms).
 */
export function DeferredAdvancedTools() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const win = window as Window & {
      requestIdleCallback?: (
        cb: IdleRequestCallback,
        opts?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    const start = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof win.requestIdleCallback === 'function') {
      const id = win.requestIdleCallback(start, { timeout: 800 });
      return () => {
        cancelled = true;
        win.cancelIdleCallback?.(id);
      };
    }

    const tid = window.setTimeout(start, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <OverviewAdvancedTools />
    </Suspense>
  );
}
