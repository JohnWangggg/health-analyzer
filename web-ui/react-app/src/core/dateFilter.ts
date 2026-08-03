/**
 * Analysis date window prefs (session) + filter HealthData by calendar day.
 * Mirrors legacy filter-start-date / filter-end-date applied at parse or reanalyze.
 */
import type { HealthData } from '@health-analyzer/lib';

export const DATE_FILTER_START_KEY = 'health-analyzer-date-filter-start';
export const DATE_FILTER_END_KEY = 'health-analyzer-date-filter-end';

export type DateFilter = {
  startDate: string | null;
  endDate: string | null;
};

function safeGet(key: string): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const v = sessionStorage.getItem(key);
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (!value) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadDateFilter(): DateFilter {
  return {
    startDate: safeGet(DATE_FILTER_START_KEY),
    endDate: safeGet(DATE_FILTER_END_KEY),
  };
}

export function saveDateFilter(filter: DateFilter): void {
  safeSet(DATE_FILTER_START_KEY, filter.startDate);
  safeSet(DATE_FILTER_END_KEY, filter.endDate);
}

export function clearDateFilter(): void {
  saveDateFilter({ startDate: null, endDate: null });
}

/** Validate start ≤ end when both set. */
export function normalizeDateFilter(filter: DateFilter): DateFilter {
  let { startDate, endDate } = filter;
  if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) startDate = null;
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) endDate = null;
  if (startDate && endDate && startDate > endDate) {
    throw new Error('date_range_invalid');
  }
  return { startDate, endDate };
}

function dayOf(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function inRange(day: string | null, start: string | null, end: string | null): boolean {
  if (!day) return true; // keep undated
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function filterMapByDay<T>(
  map: Record<string, T> | null | undefined,
  start: string | null,
  end: string | null,
): Record<string, T> {
  const out: Record<string, T> = {};
  if (!map) return out;
  for (const [k, v] of Object.entries(map)) {
    if (inRange(dayOf(k), start, end)) out[k] = v;
  }
  return out;
}

/**
 * Deep-clone HealthData and drop points outside [start, end] (inclusive YYYY-MM-DD).
 * Empty filter → clone only.
 */
export function filterHealthDataByDate(
  data: HealthData,
  filter: DateFilter,
): HealthData {
  const { startDate, endDate } = normalizeDateFilter(filter);
  const clone = JSON.parse(JSON.stringify(data)) as HealthData;
  if (!startDate && !endDate) return clone;

  const keepDay = (raw: unknown) => inRange(dayOf(raw), startDate, endDate);

  if (Array.isArray(clone.cgm)) {
    clone.cgm = clone.cgm.filter((p) => keepDay(p.datetime || (p as { date?: string }).date));
  }
  if (Array.isArray(clone.bloodPressure)) {
    clone.bloodPressure = clone.bloodPressure.filter((p) =>
      keepDay((p as { datetime?: string; date?: string }).datetime || (p as { date?: string }).date),
    );
  }
  if (Array.isArray(clone.weight)) {
    clone.weight = clone.weight.filter((p) => keepDay(p.datetime || p.date));
  }
  if (Array.isArray(clone.bodyFat)) {
    clone.bodyFat = clone.bodyFat.filter((p) =>
      keepDay((p as { datetime?: string; date?: string }).datetime || (p as { date?: string }).date),
    );
  }
  if (Array.isArray(clone.workouts)) {
    clone.workouts = clone.workouts.filter((w) =>
      keepDay((w as { startDate?: string }).startDate),
    );
  }
  if (Array.isArray(clone.ecg)) {
    clone.ecg = clone.ecg.filter((e) =>
      keepDay((e as { datetime?: string }).datetime),
    );
  }

  clone.hrv = filterMapByDay(clone.hrv, startDate, endDate);
  clone.hrvOvernight = filterMapByDay(clone.hrvOvernight, startDate, endDate);
  clone.restingHr = filterMapByDay(clone.restingHr, startDate, endDate);
  clone.walkingHr = filterMapByDay(clone.walkingHr, startDate, endDate);
  clone.steps = filterMapByDay(clone.steps, startDate, endDate);
  clone.sleep = filterMapByDay(clone.sleep as Record<string, unknown>, startDate, endDate) as typeof clone.sleep;
  clone.watchDaily = filterMapByDay(
    clone.watchDaily as Record<string, unknown>,
    startDate,
    endDate,
  ) as typeof clone.watchDaily;

  return clone;
}
