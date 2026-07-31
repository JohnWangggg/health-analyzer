/**
 * Pure keep-N window helpers for sharded warehouse splits.
 * Keep newest N CGM months / year shards per domain; drop oldest.
 * Matches legacy app.js yearsToDropForKeepN + auto-trim drop rules.
 */
import {
  recomputeSplitTotalBytes,
  type ShardSplit,
} from './warehouseShards';

export type KeepWindows = { keepMonths: number; keepYears: number };

export type KeepWindowsMeta = {
  trimmed: boolean;
  droppedMonths: string[];
  /** Domain list key → dropped year strings (e.g. bpYears → ['2019','2020']) */
  droppedYearsByDomain: Record<string, string[]>;
  beforeBytes: number;
  afterBytes: number;
};

/** Year-domain fields on ShardSplit (independent keep-N). */
export const YEAR_DOMAIN_SPLIT_KEYS = [
  'bpYears',
  'weightYears',
  'sleepYears',
  'stepsYears',
  'hrvYears',
  'restingHrYears',
  'walkingHrYears',
  'workoutsYears',
  'ecgYears',
  'watchDailyYears',
] as const;

export type YearDomainSplitKey = (typeof YEAR_DOMAIN_SPLIT_KEYS)[number];

export type KeepForecastLists = {
  cgmMonths?: string[];
  bpYears?: string[];
  weightYears?: string[];
  sleepYears?: string[];
  stepsYears?: string[];
  hrvYears?: string[];
  restingHrYears?: string[];
  walkingHrYears?: string[];
  workoutsYears?: string[];
  ecgYears?: string[];
  watchDailyYears?: string[];
};

/** Sorted ascending; drop prefix when length > keepN (keep newest N). */
export function keysToDropForKeepN(
  keys: string[] | undefined | null,
  keepN: number,
): string[] {
  const sorted = (keys || [])
    .slice()
    .filter(Boolean)
    .map(String)
    .sort();
  if (sorted.length <= keepN) return [];
  return sorted.slice(0, sorted.length - keepN);
}

/**
 * Keep newest N months/years; drop oldest. Mutates split.
 */
export function applyKeepWindowsToSplit(
  split: ShardSplit,
  windows: KeepWindows,
): KeepWindowsMeta {
  const keepMonths = Math.max(0, Number(windows.keepMonths) || 0);
  const keepYears = Math.max(0, Number(windows.keepYears) || 0);
  const beforeBytes = split.totalBytes || 0;
  const droppedMonths: string[] = [];
  const droppedYearsByDomain: Record<string, string[]> = {};

  if (!Array.isArray(split.months)) split.months = [];
  split.months.sort((a, b) =>
    String(a.month || '').localeCompare(String(b.month || '')),
  );
  if (split.months.length > keepMonths) {
    const dropCount = split.months.length - keepMonths;
    const dropped = split.months.splice(0, dropCount);
    for (const m of dropped) {
      droppedMonths.push(String(m.month || ''));
    }
  }

  for (const key of YEAR_DOMAIN_SPLIT_KEYS) {
    const arr = split[key] as Array<{ year: string }> | undefined;
    if (!Array.isArray(arr)) {
      (split as unknown as Record<string, unknown>)[key] = [];
      continue;
    }
    arr.sort((a, b) =>
      String(a.year || '').localeCompare(String(b.year || '')),
    );
    if (arr.length > keepYears) {
      const dropCount = arr.length - keepYears;
      const dropped = arr.splice(0, dropCount);
      const years = dropped.map((y) => String(y.year || '')).filter(Boolean);
      if (years.length) droppedYearsByDomain[key] = years;
    }
  }

  recomputeSplitTotalBytes(split);

  const yearDropCount = Object.values(droppedYearsByDomain).reduce(
    (n, ys) => n + ys.length,
    0,
  );
  return {
    trimmed: droppedMonths.length > 0 || yearDropCount > 0,
    droppedMonths,
    droppedYearsByDomain,
    beforeBytes,
    afterBytes: split.totalBytes,
  };
}

/**
 * Forecast drops from sorted key lists (no IDB, no split mutation).
 */
export function forecastKeepDrops(
  lists: KeepForecastLists,
  windows: KeepWindows,
): { monthDrop: string[]; yearDrops: Record<string, string[]> } {
  const keepMonths = Math.max(0, Number(windows.keepMonths) || 0);
  const keepYears = Math.max(0, Number(windows.keepYears) || 0);

  const monthDrop = keysToDropForKeepN(lists.cgmMonths, keepMonths);

  const yearDrops: Record<string, string[]> = {};
  const yearListKeys: Array<keyof KeepForecastLists> = [
    'bpYears',
    'weightYears',
    'sleepYears',
    'stepsYears',
    'hrvYears',
    'restingHrYears',
    'walkingHrYears',
    'workoutsYears',
    'ecgYears',
    'watchDailyYears',
  ];
  for (const key of yearListKeys) {
    const drop = keysToDropForKeepN(lists[key], keepYears);
    if (drop.length) yearDrops[key] = drop;
  }

  return { monthDrop, yearDrops };
}
