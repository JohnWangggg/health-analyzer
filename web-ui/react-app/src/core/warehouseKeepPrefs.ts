/**
 * Keep-N preferences shared with legacy app.js (same localStorage keys).
 * SSR / localStorage-safe: try/catch; invalid values fall back to defaults.
 */

export const CGM_KEEP_MONTHS_KEY = 'health-analyzer-cgm-keep-months';
export const CGM_KEEP_MONTHS_OPTIONS = [3, 6, 12, 24] as const;
export const CGM_KEEP_MONTHS_DEFAULT = 6;

export const YEAR_KEEP_YEARS_KEY = 'health-analyzer-year-keep-years';
export const YEAR_KEEP_YEARS_OPTIONS = [1, 2, 3, 5] as const;
export const YEAR_KEEP_YEARS_DEFAULT = 3;

export const WAREHOUSE_AUTO_TRIM_KEY = 'health-analyzer-warehouse-auto-trim';

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

export function getCgmKeepMonths(): number {
  const v = Number(safeGetItem(CGM_KEEP_MONTHS_KEY));
  if ((CGM_KEEP_MONTHS_OPTIONS as readonly number[]).indexOf(v) >= 0) return v;
  return CGM_KEEP_MONTHS_DEFAULT;
}

export function setCgmKeepMonths(n: number): number {
  const num = Number(n);
  const v =
    (CGM_KEEP_MONTHS_OPTIONS as readonly number[]).indexOf(num) >= 0
      ? num
      : CGM_KEEP_MONTHS_DEFAULT;
  safeSetItem(CGM_KEEP_MONTHS_KEY, String(v));
  return v;
}

export function getYearKeepYears(): number {
  const v = Number(safeGetItem(YEAR_KEEP_YEARS_KEY));
  if ((YEAR_KEEP_YEARS_OPTIONS as readonly number[]).indexOf(v) >= 0) return v;
  return YEAR_KEEP_YEARS_DEFAULT;
}

export function setYearKeepYears(n: number): number {
  const num = Number(n);
  const v =
    (YEAR_KEEP_YEARS_OPTIONS as readonly number[]).indexOf(num) >= 0
      ? num
      : YEAR_KEEP_YEARS_DEFAULT;
  safeSetItem(YEAR_KEEP_YEARS_KEY, String(v));
  return v;
}

/** Opt-in: localStorage === '1' means on (default off). */
export function isWarehouseAutoTrimEnabled(): boolean {
  try {
    return safeGetItem(WAREHOUSE_AUTO_TRIM_KEY) === '1';
  } catch {
    return false;
  }
}

export function setWarehouseAutoTrimEnabled(on: boolean): boolean {
  safeSetItem(WAREHOUSE_AUTO_TRIM_KEY, on ? '1' : '0');
  return !!on;
}
