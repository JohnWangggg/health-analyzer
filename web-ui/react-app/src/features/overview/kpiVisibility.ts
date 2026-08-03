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
export const KPI_ORDER_KEY = 'ha-react-kpi-order';

export type KpiVisibility = Record<KpiId, boolean>;

const DEFAULT_VISIBILITY: KpiVisibility = {
  cgm: true,
  weight: true,
  steps: true,
  recovery: true,
  restingHr: true,
};

const DEFAULT_ORDER: KpiId[] = [...KPI_IDS];

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

function normalizeOrder(raw: unknown): KpiId[] {
  const seen = new Set<KpiId>();
  const out: KpiId[] = [];
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === 'string' && isKpiId(x) && !seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
  }
  for (const id of DEFAULT_ORDER) {
    if (!seen.has(id)) out.push(id);
  }
  return out;
}

/** Ordered KPI ids for matrix layout (localStorage). */
export function getKpiOrder(): KpiId[] {
  try {
    const raw = safeGetItem(KPI_ORDER_KEY);
    if (!raw) return [...DEFAULT_ORDER];
    return normalizeOrder(JSON.parse(raw));
  } catch {
    return [...DEFAULT_ORDER];
  }
}

export function setKpiOrder(order: KpiId[]): KpiId[] {
  const next = normalizeOrder(order);
  safeSetItem(KPI_ORDER_KEY, JSON.stringify(next));
  return next;
}

/** Move id earlier/later in order; returns next order. */
export function moveKpiOrder(id: KpiId, dir: -1 | 1): KpiId[] {
  const order = getKpiOrder();
  const i = order.indexOf(id);
  if (i < 0) return order;
  const j = i + dir;
  if (j < 0 || j >= order.length) return order;
  const next = [...order];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return setKpiOrder(next);
}
