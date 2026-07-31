/**
 * Overview KPI card visibility prefs (localStorage).
 * Default: all visible. Safe try/catch for private mode / SSR.
 */

export type KpiId = 'cgm' | 'weight' | 'steps' | 'recovery' | 'restingHr';

export const KPI_IDS: readonly KpiId[] = [
  'cgm',
  'weight',
  'steps',
  'recovery',
  'restingHr',
] as const;

export const KPI_VISIBILITY_KEY = 'ha-react-kpi-visible';

export type KpiVisibility = Record<KpiId, boolean>;

const DEFAULT_VISIBILITY: KpiVisibility = {
  cgm: true,
  weight: true,
  steps: true,
  recovery: true,
  restingHr: true,
};

function defaultVisibility(): KpiVisibility {
  return { ...DEFAULT_VISIBILITY };
}

function isKpiId(v: string): v is KpiId {
  return (KPI_IDS as readonly string[]).includes(v);
}

function normalize(raw: unknown): KpiVisibility {
  const out = defaultVisibility();
  if (!raw || typeof raw !== 'object') return out;
  const obj = raw as Record<string, unknown>;
  for (const id of KPI_IDS) {
    if (typeof obj[id] === 'boolean') {
      out[id] = obj[id] as boolean;
    }
  }
  return out;
}

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Full visibility map; missing/invalid keys → true (default all visible). */
export function getKpiVisibility(): KpiVisibility {
  try {
    const raw = safeGetItem(KPI_VISIBILITY_KEY);
    if (raw == null || raw === '') return defaultVisibility();
    return normalize(JSON.parse(raw));
  } catch {
    return defaultVisibility();
  }
}

/** Merge partial flags, persist, return next full map. */
export function setKpiVisibility(
  partial: Partial<KpiVisibility>,
): KpiVisibility {
  const next = { ...getKpiVisibility() };
  try {
    if (partial && typeof partial === 'object') {
      for (const [k, v] of Object.entries(partial)) {
        if (isKpiId(k) && typeof v === 'boolean') {
          next[k] = v;
        }
      }
    }
    safeSetItem(KPI_VISIBILITY_KEY, JSON.stringify(next));
  } catch {
    /* still return computed next */
  }
  return next;
}

export function isKpiVisible(id: KpiId): boolean {
  try {
    return getKpiVisibility()[id] !== false;
  } catch {
    return true;
  }
}
