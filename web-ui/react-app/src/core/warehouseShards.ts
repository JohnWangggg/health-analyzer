/**
 * Shared warehouse shard split / reassemble / chunk rows.
 * Port of web-ui/public/history-db.js splitHealthDataShards + chunk construction
 * (layout `sharded-v1`). Used by React dual-track persist so React write is
 * compatible with legacy reassemble (domain shards, not core-only blob).
 *
 * Soft-quota: CGM → BP/weight → sleep/steps → HRV/hr → workouts/ecg/watch (legacy order).
 * Interactive keep-N (applyKeepWindowsToSplit) is separate; hard 200MB still rejects.
 */
import type { HealthData } from '@health-analyzer/lib';

export const WH_LAYOUT_SHARDED = 'sharded-v1';
export const WH_CHUNK_CORE = 'core|full';
export const WH_SOFT_BYTES = 150 * 1024 * 1024;
export const WH_HARD_BYTES = 200 * 1024 * 1024;

export type DomainChunkRow = {
  id: string;
  domain: string;
  shard: string;
  dateStart: string | null;
  dateEnd: string | null;
  payload: unknown;
  approxBytes: number;
  recordCount: number;
  batchId: string | null;
  updatedAt: string;
  codec: 'json';
};

export type ShardSplit = {
  core: HealthData;
  months: Array<{
    month: string;
    points: unknown[];
    approxBytes: number;
    recordCount: number;
  }>;
  bpYears: Array<{
    year: string;
    points: unknown[];
    approxBytes: number;
    recordCount: number;
  }>;
  weightYears: Array<{
    year: string;
    weight: unknown[];
    bodyFat: unknown[];
    payload: { weight: unknown[]; bodyFat: unknown[] };
    approxBytes: number;
    recordCount: number;
  }>;
  sleepYears: YearMapShard[];
  stepsYears: YearMapShard[];
  hrvYears: Array<{
    year: string;
    payload: { hrv: Record<string, unknown>; hrvOvernight: Record<string, unknown> };
    approxBytes: number;
    recordCount: number;
  }>;
  restingHrYears: YearMapShard[];
  walkingHrYears: YearMapShard[];
  workoutsYears: YearArrayShard[];
  ecgYears: YearArrayShard[];
  watchDailyYears: YearMapShard[];
  coreBytes: number;
  totalBytes: number;
};

type YearMapShard = {
  year: string;
  payload: Record<string, unknown>;
  approxBytes: number;
  recordCount: number;
};

type YearArrayShard = {
  year: string;
  points: unknown[];
  payload: unknown[];
  approxBytes: number;
  recordCount: number;
};

export function approxJsonBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

function clonePlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function isDateKeyedMap(m: unknown): m is Record<string, unknown> {
  return !!(m && typeof m === 'object' && !Array.isArray(m));
}

function monthKeyFromDatetime(dt: unknown): string {
  const s = String(dt || '');
  const m = s.match(/^(\d{4}-\d{2})/);
  return m ? m[1]! : 'unknown';
}

function yearKeyFromDatetime(dt: unknown): string {
  const s = String(dt || '').slice(0, 4);
  return /^\d{4}$/.test(s) ? s : 'unknown';
}

function yearKeyFromDateMapKey(key: string): string {
  const s = String(key || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 4);
  return yearKeyFromDatetime(s);
}

function ecgRecordDatetime(p: unknown): string {
  if (!p || typeof p !== 'object') return '';
  const o = p as Record<string, unknown>;
  return String(o.date || o.startDate || o.datetime || o.recordedAt || '');
}

function workoutRecordDatetime(p: unknown): string {
  if (!p || typeof p !== 'object') return '';
  const o = p as Record<string, unknown>;
  return String(o.startDate || o.date || o.start || o.datetime || '');
}

function bucketDateMapByYear(map: Record<string, unknown>): YearMapShard[] {
  const byYear: Record<string, Record<string, unknown>> = {};
  Object.keys(map || {}).forEach((k) => {
    const y = yearKeyFromDateMapKey(k);
    if (!byYear[y]) byYear[y] = {};
    byYear[y]![k] = map[k];
  });
  return Object.keys(byYear)
    .sort()
    .map((year) => {
      const payload = byYear[year]!;
      return {
        year,
        payload,
        approxBytes: approxJsonBytes(payload),
        recordCount: Object.keys(payload).length,
      };
    });
}

function bucketArrayByYear(
  rows: unknown[],
  getDt: (row: unknown) => string,
): YearArrayShard[] {
  const byYear: Record<string, unknown[]> = {};
  (rows || []).forEach((p) => {
    const y = yearKeyFromDatetime(getDt(p));
    if (!byYear[y]) byYear[y] = [];
    byYear[y]!.push(p);
  });
  return Object.keys(byYear)
    .sort()
    .map((year) => {
      const points = byYear[year]!;
      return {
        year,
        points,
        payload: points,
        approxBytes: approxJsonBytes(points),
        recordCount: points.length,
      };
    });
}

function bucketHrvYears(
  hrvMap: Record<string, unknown>,
  hrvOvernightMap: Record<string, unknown>,
) {
  const byYear: Record<
    string,
    { hrv: Record<string, unknown>; hrvOvernight: Record<string, unknown> }
  > = {};
  Object.keys(hrvMap || {}).forEach((k) => {
    const y = yearKeyFromDateMapKey(k);
    if (!byYear[y]) byYear[y] = { hrv: {}, hrvOvernight: {} };
    byYear[y]!.hrv[k] = hrvMap[k]!;
  });
  Object.keys(hrvOvernightMap || {}).forEach((k) => {
    const y = yearKeyFromDateMapKey(k);
    if (!byYear[y]) byYear[y] = { hrv: {}, hrvOvernight: {} };
    byYear[y]!.hrvOvernight[k] = hrvOvernightMap[k]!;
  });
  return Object.keys(byYear)
    .sort()
    .map((year) => {
      const bucket = byYear[year]!;
      const payload = { hrv: bucket.hrv, hrvOvernight: bucket.hrvOvernight };
      return {
        year,
        payload,
        approxBytes: approxJsonBytes(payload),
        recordCount:
          Object.keys(bucket.hrv).length + Object.keys(bucket.hrvOvernight).length,
      };
    });
}

/** Recompute split.totalBytes from core + domain shard approxBytes. Mutates split. */
export function recomputeSplitTotalBytes(split: ShardSplit): number {
  const sum = (arr: { approxBytes?: number }[]) =>
    (arr || []).reduce((s, m) => s + (m.approxBytes || 0), 0);
  split.totalBytes =
    (split.coreBytes || 0) +
    sum(split.months) +
    sum(split.bpYears) +
    sum(split.weightYears) +
    sum(split.sleepYears) +
    sum(split.stepsYears) +
    sum(split.hrvYears) +
    sum(split.restingHrYears) +
    sum(split.walkingHrYears) +
    sum(split.workoutsYears) +
    sum(split.ecgYears) +
    sum(split.watchDailyYears);
  return split.totalBytes;
}

export type SoftEvictionMeta = {
  trimmed: boolean;
  removedCgm: number;
  removedMonths: number;
  removedBp: number;
  removedWeight: number;
  removedSleep: number;
  removedSteps: number;
  removedHrv: number;
  removedRestingHr: number;
  removedWalkingHr: number;
  removedWorkouts: number;
  removedEcg: number;
  removedWatchDaily: number;
  removedYears: number;
  beforeBytes: number;
  afterBytes: number;
};

function emptyEvictMeta(beforeBytes: number, afterBytes: number): SoftEvictionMeta {
  return {
    trimmed: false,
    removedCgm: 0,
    removedMonths: 0,
    removedBp: 0,
    removedWeight: 0,
    removedSleep: 0,
    removedSteps: 0,
    removedHrv: 0,
    removedRestingHr: 0,
    removedWalkingHr: 0,
    removedWorkouts: 0,
    removedEcg: 0,
    removedWatchDaily: 0,
    removedYears: 0,
    beforeBytes,
    afterBytes,
  };
}



/**
 * Drop oldest CGM months until under soft quota (history-db evictOldestCgmMonths).
 * Mutates split.months. Keeps at least one month when small enough.
 */
export function evictOldestCgmMonths(split: ShardSplit): SoftEvictionMeta {
  let removedCgm = 0;
  let removedMonths = 0;
  const beforeBytes = split.totalBytes;
  while (split.totalBytes > WH_SOFT_BYTES && split.months.length > 0) {
    if (split.months.length === 1 && (split.months[0]!.recordCount || 0) <= 500) {
      break;
    }
    const oldest = split.months.shift();
    if (!oldest) break;
    removedCgm += oldest.recordCount || 0;
    removedMonths += 1;
    recomputeSplitTotalBytes(split);
  }
  if (split.totalBytes > WH_SOFT_BYTES && split.months.length === 1) {
    const m = split.months[0]!;
    let pts = [...m.points].sort((a, b) =>
      String((a as { datetime?: string })?.datetime || '').localeCompare(
        String((b as { datetime?: string })?.datetime || ''),
      ),
    );
    const otherBytes = split.totalBytes - (m.approxBytes || 0);
    while (
      approxJsonBytes(pts) + otherBytes > WH_SOFT_BYTES &&
      pts.length > 500
    ) {
      const drop = Math.max(50, Math.floor(pts.length * 0.1));
      removedCgm += drop;
      pts = pts.slice(drop);
    }
    m.points = pts;
    m.recordCount = pts.length;
    m.approxBytes = approxJsonBytes(pts);
    recomputeSplitTotalBytes(split);
  }
  return {
    ...emptyEvictMeta(beforeBytes, split.totalBytes),
    trimmed: removedCgm > 0,
    removedCgm,
    removedMonths,
  };
}

/**
 * Drop oldest BP/weight year shards until under soft quota
 * (history-db evictOldestBpWeightYears). Mutates split.
 */
export function evictOldestBpWeightYears(split: ShardSplit): SoftEvictionMeta {
  let removedBp = 0;
  let removedWeight = 0;
  let removedYears = 0;
  const beforeBytes = split.totalBytes;
  if (!split.bpYears) split.bpYears = [];
  if (!split.weightYears) split.weightYears = [];

  while (
    split.totalBytes > WH_SOFT_BYTES &&
    (split.bpYears.length > 0 || split.weightYears.length > 0)
  ) {
    const years: Record<string, true> = {};
    split.bpYears.forEach((y) => {
      years[y.year] = true;
    });
    split.weightYears.forEach((y) => {
      years[y.year] = true;
    });
    const yearKeys = Object.keys(years).sort();
    if (yearKeys.length <= 1) break;

    const oldestYear = yearKeys[0]!;
    const bpIdx = split.bpYears.findIndex((y) => y.year === oldestYear);
    const wIdx = split.weightYears.findIndex((y) => y.year === oldestYear);
    if (bpIdx >= 0) {
      const row = split.bpYears.splice(bpIdx, 1)[0]!;
      removedBp += row.recordCount || 0;
      removedYears += 1;
    } else if (wIdx >= 0) {
      const row = split.weightYears.splice(wIdx, 1)[0]!;
      removedWeight += (row.weight?.length || 0) + (row.bodyFat?.length || 0);
      removedYears += 1;
    } else {
      break;
    }
    recomputeSplitTotalBytes(split);
  }
  return {
    ...emptyEvictMeta(beforeBytes, split.totalBytes),
    trimmed: removedBp > 0 || removedWeight > 0,
    removedBp,
    removedWeight,
    removedYears,
  };
}

/**
 * Drop oldest sleep/steps year shards (history-db evictOldestSleepStepsYears).
 */
export function evictOldestSleepStepsYears(split: ShardSplit): SoftEvictionMeta {
  let removedSleep = 0;
  let removedSteps = 0;
  let removedYears = 0;
  const beforeBytes = split.totalBytes;
  if (!split.sleepYears) split.sleepYears = [];
  if (!split.stepsYears) split.stepsYears = [];

  while (
    split.totalBytes > WH_SOFT_BYTES &&
    (split.sleepYears.length > 0 || split.stepsYears.length > 0)
  ) {
    const years: Record<string, true> = {};
    split.sleepYears.forEach((y) => {
      years[y.year] = true;
    });
    split.stepsYears.forEach((y) => {
      years[y.year] = true;
    });
    const yearKeys = Object.keys(years).sort();
    if (yearKeys.length <= 1) break;

    const oldestYear = yearKeys[0]!;
    const sleepIdx = split.sleepYears.findIndex((y) => y.year === oldestYear);
    const stepsIdx = split.stepsYears.findIndex((y) => y.year === oldestYear);
    if (sleepIdx >= 0) {
      const row = split.sleepYears.splice(sleepIdx, 1)[0]!;
      removedSleep += row.recordCount || 0;
      removedYears += 1;
    } else if (stepsIdx >= 0) {
      const row = split.stepsYears.splice(stepsIdx, 1)[0]!;
      removedSteps += row.recordCount || 0;
      removedYears += 1;
    } else {
      break;
    }
    recomputeSplitTotalBytes(split);
  }
  return {
    ...emptyEvictMeta(beforeBytes, split.totalBytes),
    trimmed: removedSleep > 0 || removedSteps > 0,
    removedSleep,
    removedSteps,
    removedYears,
  };
}

/**
 * Drop oldest hrv / restingHr / walkingHr year shards (keep ≥1 year per domain).
 */
export function evictOldestHrvHrYears(split: ShardSplit): SoftEvictionMeta {
  let removedHrv = 0;
  let removedRestingHr = 0;
  let removedWalkingHr = 0;
  let removedYears = 0;
  const beforeBytes = split.totalBytes;
  if (!split.hrvYears) split.hrvYears = [];
  if (!split.restingHrYears) split.restingHrYears = [];
  if (!split.walkingHrYears) split.walkingHrYears = [];

  while (split.totalBytes > WH_SOFT_BYTES) {
    type Cand = { domain: 'hrv' | 'restingHr' | 'walkingHr'; year: string; idx: number };
    const candidates: Cand[] = [];
    if (split.hrvYears.length > 1) {
      split.hrvYears.forEach((y, idx) => {
        candidates.push({ domain: 'hrv', year: String(y.year || ''), idx });
      });
    }
    if (split.restingHrYears.length > 1) {
      split.restingHrYears.forEach((y, idx) => {
        candidates.push({ domain: 'restingHr', year: String(y.year || ''), idx });
      });
    }
    if (split.walkingHrYears.length > 1) {
      split.walkingHrYears.forEach((y, idx) => {
        candidates.push({ domain: 'walkingHr', year: String(y.year || ''), idx });
      });
    }
    if (!candidates.length) break;

    candidates.sort((a, b) => {
      const yc = a.year.localeCompare(b.year);
      if (yc !== 0) return yc;
      const order = { hrv: 0, restingHr: 1, walkingHr: 2 };
      return order[a.domain] - order[b.domain];
    });
    const pick = candidates[0]!;
    if (pick.domain === 'hrv') {
      const row = split.hrvYears.splice(pick.idx, 1)[0]!;
      removedHrv += row.recordCount || 0;
      removedYears += 1;
    } else if (pick.domain === 'restingHr') {
      const row = split.restingHrYears.splice(pick.idx, 1)[0]!;
      removedRestingHr += row.recordCount || 0;
      removedYears += 1;
    } else {
      const row = split.walkingHrYears.splice(pick.idx, 1)[0]!;
      removedWalkingHr += row.recordCount || 0;
      removedYears += 1;
    }
    recomputeSplitTotalBytes(split);
  }
  return {
    ...emptyEvictMeta(beforeBytes, split.totalBytes),
    trimmed: removedHrv > 0 || removedRestingHr > 0 || removedWalkingHr > 0,
    removedHrv,
    removedRestingHr,
    removedWalkingHr,
    removedYears,
  };
}

/**
 * Drop oldest workouts / ecg / watchDaily year shards (keep ≥1 year per domain).
 */
export function evictOldestWorkoutsEcgWatchYears(
  split: ShardSplit,
): SoftEvictionMeta {
  let removedWorkouts = 0;
  let removedEcg = 0;
  let removedWatchDaily = 0;
  let removedYears = 0;
  const beforeBytes = split.totalBytes;
  if (!split.workoutsYears) split.workoutsYears = [];
  if (!split.ecgYears) split.ecgYears = [];
  if (!split.watchDailyYears) split.watchDailyYears = [];

  while (split.totalBytes > WH_SOFT_BYTES) {
    type Cand = {
      domain: 'workouts' | 'ecg' | 'watchDaily';
      year: string;
      idx: number;
    };
    const candidates: Cand[] = [];
    if (split.workoutsYears.length > 1) {
      split.workoutsYears.forEach((y, idx) => {
        candidates.push({ domain: 'workouts', year: String(y.year || ''), idx });
      });
    }
    if (split.ecgYears.length > 1) {
      split.ecgYears.forEach((y, idx) => {
        candidates.push({ domain: 'ecg', year: String(y.year || ''), idx });
      });
    }
    if (split.watchDailyYears.length > 1) {
      split.watchDailyYears.forEach((y, idx) => {
        candidates.push({
          domain: 'watchDaily',
          year: String(y.year || ''),
          idx,
        });
      });
    }
    if (!candidates.length) break;

    candidates.sort((a, b) => {
      const yc = a.year.localeCompare(b.year);
      if (yc !== 0) return yc;
      const order = { workouts: 0, ecg: 1, watchDaily: 2 };
      return order[a.domain] - order[b.domain];
    });
    const pick = candidates[0]!;
    if (pick.domain === 'workouts') {
      const row = split.workoutsYears.splice(pick.idx, 1)[0]!;
      removedWorkouts += row.recordCount || 0;
      removedYears += 1;
    } else if (pick.domain === 'ecg') {
      const row = split.ecgYears.splice(pick.idx, 1)[0]!;
      removedEcg += row.recordCount || 0;
      removedYears += 1;
    } else {
      const row = split.watchDailyYears.splice(pick.idx, 1)[0]!;
      removedWatchDaily += row.recordCount || 0;
      removedYears += 1;
    }
    recomputeSplitTotalBytes(split);
  }
  return {
    ...emptyEvictMeta(beforeBytes, split.totalBytes),
    trimmed:
      removedWorkouts > 0 || removedEcg > 0 || removedWatchDaily > 0,
    removedWorkouts,
    removedEcg,
    removedWatchDaily,
    removedYears,
  };
}

/** Soft-quota pass: full legacy chain order. */
export function applySoftQuotaEviction(split: ShardSplit): SoftEvictionMeta {
  const beforeBytes = split.totalBytes;
  const cgm = evictOldestCgmMonths(split);
  const yw = evictOldestBpWeightYears(split);
  const ms = evictOldestSleepStepsYears(split);
  const hh = evictOldestHrvHrYears(split);
  const wew = evictOldestWorkoutsEcgWatchYears(split);
  return {
    trimmed:
      cgm.trimmed || yw.trimmed || ms.trimmed || hh.trimmed || wew.trimmed,
    removedCgm: cgm.removedCgm,
    removedMonths: cgm.removedMonths,
    removedBp: yw.removedBp,
    removedWeight: yw.removedWeight,
    removedSleep: ms.removedSleep,
    removedSteps: ms.removedSteps,
    removedHrv: hh.removedHrv,
    removedRestingHr: hh.removedRestingHr,
    removedWalkingHr: hh.removedWalkingHr,
    removedWorkouts: wew.removedWorkouts,
    removedEcg: wew.removedEcg,
    removedWatchDaily: wew.removedWatchDaily,
    removedYears:
      yw.removedYears +
      ms.removedYears +
      hh.removedYears +
      wew.removedYears,
    beforeBytes,
    afterBytes: split.totalBytes,
  };
}





/** Split HealthData into thin core + domain shards (legacy-compatible). */
export function splitHealthDataShards(healthData: HealthData): ShardSplit {
  const full = clonePlain(healthData);
  const cgm = Array.isArray(full.cgm) ? full.cgm : [];
  const bloodPressure = Array.isArray(full.bloodPressure)
    ? full.bloodPressure
    : [];
  const weight = Array.isArray(full.weight) ? full.weight : [];
  const bodyFat = Array.isArray(full.bodyFat) ? full.bodyFat : [];
  const sleepMap = isDateKeyedMap(full.sleep) ? full.sleep : {};
  const stepsMap = isDateKeyedMap(full.steps) ? full.steps : {};
  const hrvMap = isDateKeyedMap(full.hrv) ? full.hrv : {};
  const hrvOvernightMap = isDateKeyedMap(full.hrvOvernight)
    ? full.hrvOvernight
    : {};
  const restingHrMap = isDateKeyedMap(full.restingHr) ? full.restingHr : {};
  const walkingHrMap = isDateKeyedMap(full.walkingHr) ? full.walkingHr : {};
  const workoutsArr = Array.isArray(full.workouts) ? full.workouts : [];
  const ecgArr = Array.isArray(full.ecg) ? full.ecg : [];
  const watchDailyMap = isDateKeyedMap(full.watchDaily) ? full.watchDaily : {};

  full.cgm = [];
  full.bloodPressure = [];
  full.weight = [];
  full.bodyFat = [];
  full.sleep = {};
  full.steps = {};
  full.hrv = {};
  full.hrvOvernight = {};
  full.restingHr = {};
  full.walkingHr = {};
  full.workouts = [];
  full.ecg = [];
  full.watchDaily = {};

  const byMonth: Record<string, unknown[]> = {};
  cgm.forEach((p) => {
    const m = monthKeyFromDatetime((p as { datetime?: string })?.datetime);
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m]!.push(p);
  });
  const months = Object.keys(byMonth)
    .sort()
    .map((month) => ({
      month,
      points: byMonth[month]!,
      approxBytes: approxJsonBytes(byMonth[month]),
      recordCount: byMonth[month]!.length,
    }));

  const bpByYear: Record<string, unknown[]> = {};
  bloodPressure.forEach((p) => {
    const y = yearKeyFromDatetime((p as { datetime?: string })?.datetime);
    if (!bpByYear[y]) bpByYear[y] = [];
    bpByYear[y]!.push(p);
  });
  const bpYears = Object.keys(bpByYear)
    .sort()
    .map((year) => ({
      year,
      points: bpByYear[year]!,
      approxBytes: approxJsonBytes(bpByYear[year]),
      recordCount: bpByYear[year]!.length,
    }));

  const weightByYear: Record<string, { weight: unknown[]; bodyFat: unknown[] }> =
    {};
  weight.forEach((p) => {
    const y = yearKeyFromDatetime((p as { datetime?: string })?.datetime);
    if (!weightByYear[y]) weightByYear[y] = { weight: [], bodyFat: [] };
    weightByYear[y]!.weight.push(p);
  });
  bodyFat.forEach((p) => {
    const y = yearKeyFromDatetime((p as { datetime?: string })?.datetime);
    if (!weightByYear[y]) weightByYear[y] = { weight: [], bodyFat: [] };
    weightByYear[y]!.bodyFat.push(p);
  });
  const weightYears = Object.keys(weightByYear)
    .sort()
    .map((year) => {
      const bucket = weightByYear[year]!;
      const payloadSlice = { weight: bucket.weight, bodyFat: bucket.bodyFat };
      return {
        year,
        weight: bucket.weight,
        bodyFat: bucket.bodyFat,
        payload: payloadSlice,
        approxBytes: approxJsonBytes(payloadSlice),
        recordCount: bucket.weight.length + bucket.bodyFat.length,
      };
    });

  const split: ShardSplit = {
    core: full,
    months,
    bpYears,
    weightYears,
    sleepYears: bucketDateMapByYear(sleepMap),
    stepsYears: bucketDateMapByYear(stepsMap),
    hrvYears: bucketHrvYears(hrvMap, hrvOvernightMap),
    restingHrYears: bucketDateMapByYear(restingHrMap),
    walkingHrYears: bucketDateMapByYear(walkingHrMap),
    workoutsYears: bucketArrayByYear(workoutsArr, workoutRecordDatetime),
    ecgYears: bucketArrayByYear(ecgArr, ecgRecordDatetime),
    watchDailyYears: bucketDateMapByYear(watchDailyMap),
    coreBytes: approxJsonBytes(full),
    totalBytes: 0,
  };
  recomputeSplitTotalBytes(split);
  return split;
}

/** Reassemble HealthData from split (parity with history-db reassembleFromSplit). */
export function reassembleFromSplit(split: ShardSplit): HealthData {
  const payload = clonePlain(split.core);
  payload.cgm = [];
  (split.months || []).forEach((m) => {
    payload.cgm = payload.cgm.concat(m.points as never[]);
  });
  payload.bloodPressure = [];
  (split.bpYears || []).forEach((y) => {
    payload.bloodPressure = payload.bloodPressure.concat(y.points as never[]);
  });
  payload.weight = [];
  payload.bodyFat = [];
  (split.weightYears || []).forEach((y) => {
    payload.weight = payload.weight.concat(y.weight as never[]);
    payload.bodyFat = payload.bodyFat.concat(y.bodyFat as never[]);
  });
  payload.sleep = {};
  [...(split.sleepYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => Object.assign(payload.sleep, y.payload));
  payload.steps = {};
  [...(split.stepsYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => Object.assign(payload.steps, y.payload));
  payload.hrv = {};
  payload.hrvOvernight = {};
  [...(split.hrvYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => {
      const p = y.payload;
      if (p.hrv) Object.assign(payload.hrv, p.hrv);
      if (p.hrvOvernight) Object.assign(payload.hrvOvernight, p.hrvOvernight);
    });
  payload.restingHr = {};
  [...(split.restingHrYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => Object.assign(payload.restingHr, y.payload));
  payload.walkingHr = {};
  [...(split.walkingHrYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => Object.assign(payload.walkingHr, y.payload));
  payload.workouts = [];
  (split.workoutsYears || []).forEach((y) => {
    payload.workouts = payload.workouts.concat(
      (y.points || y.payload || []) as never[],
    );
  });
  payload.ecg = [];
  (split.ecgYears || []).forEach((y) => {
    payload.ecg = payload.ecg.concat((y.points || y.payload || []) as never[]);
  });
  payload.watchDaily = {};
  [...(split.watchDailyYears || [])]
    .sort((a, b) => a.year.localeCompare(b.year))
    .forEach((y) => Object.assign(payload.watchDaily, y.payload));
  return payload;
}

export function countHealthRecords(data: HealthData): number {
  if (!data) return 0;
  let n = 0;
  n += data.cgm?.length || 0;
  n += data.bloodPressure?.length || 0;
  n += data.weight?.length || 0;
  n += data.bodyFat?.length || 0;
  n += data.workouts?.length || 0;
  n += data.ecg?.length || 0;
  n += Object.keys(data.hrv || {}).length;
  n += Object.keys(data.hrvOvernight || {}).length;
  n += Object.keys(data.restingHr || {}).length;
  n += Object.keys(data.walkingHr || {}).length;
  n += Object.keys(data.steps || {}).length;
  n += Object.keys(data.sleep || {}).length;
  n += Object.keys(data.watchDaily || {}).length;
  return n;
}

export function inferDateRange(
  data: HealthData,
): { start: string; end: string } | null {
  const dates: string[] = [];
  const pushDate = (s: unknown) => {
    if (!s) return;
    const d = String(s).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) dates.push(d);
  };
  (data.cgm || []).forEach((p) => pushDate(p?.datetime));
  (data.bloodPressure || []).forEach((p) =>
    pushDate((p as { datetime?: string })?.datetime),
  );
  (data.weight || []).forEach((p) => pushDate(p?.datetime || p?.date));
  Object.keys(data.sleep || {}).forEach(pushDate);
  Object.keys(data.steps || {}).forEach(pushDate);
  Object.keys(data.hrv || {}).forEach(pushDate);
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}

/** Build full domainChunks row set (legacy clear+put set). */
export function buildDomainChunkRows(
  split: ShardSplit,
  opts?: { batchId?: string | null; now?: string },
): DomainChunkRow[] {
  const now = opts?.now || new Date().toISOString();
  const batchId = opts?.batchId ?? null;
  const dateRange = inferDateRange(reassembleFromSplit(split));
  const rows: DomainChunkRow[] = [];

  rows.push({
    id: WH_CHUNK_CORE,
    domain: 'core',
    shard: 'full',
    dateStart: dateRange?.start ?? null,
    dateEnd: dateRange?.end ?? null,
    payload: split.core,
    approxBytes: split.coreBytes,
    recordCount: countHealthRecords({
      ...split.core,
      cgm: [],
      bloodPressure: [],
      weight: [],
      bodyFat: [],
    } as HealthData),
    batchId,
    updatedAt: now,
    codec: 'json',
  });

  const yearRow = (
    idPrefix: string,
    domain: string,
    year: string,
    payload: unknown,
    approxBytes: number,
    recordCount: number,
  ): DomainChunkRow => ({
    id: `${idPrefix}|${year}`,
    domain,
    shard: year,
    dateStart: `${year}-01-01`,
    dateEnd: `${year}-12-31`,
    payload,
    approxBytes,
    recordCount,
    batchId,
    updatedAt: now,
    codec: 'json',
  });

  for (const m of split.months) {
    rows.push({
      id: `cgm|${m.month}`,
      domain: 'cgm',
      shard: m.month,
      dateStart: `${m.month}-01`,
      dateEnd: `${m.month}-28`,
      payload: m.points,
      approxBytes: m.approxBytes,
      recordCount: m.recordCount,
      batchId,
      updatedAt: now,
      codec: 'json',
    });
  }
  for (const y of split.bpYears) {
    rows.push(
      yearRow(
        'bloodPressure',
        'bloodPressure',
        y.year,
        y.points,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  for (const y of split.weightYears) {
    rows.push(
      yearRow(
        'weight',
        'weight',
        y.year,
        y.payload,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  for (const y of split.sleepYears) {
    rows.push(
      yearRow('sleep', 'sleep', y.year, y.payload, y.approxBytes, y.recordCount),
    );
  }
  for (const y of split.stepsYears) {
    rows.push(
      yearRow('steps', 'steps', y.year, y.payload, y.approxBytes, y.recordCount),
    );
  }
  for (const y of split.hrvYears) {
    rows.push(
      yearRow('hrv', 'hrv', y.year, y.payload, y.approxBytes, y.recordCount),
    );
  }
  for (const y of split.restingHrYears) {
    rows.push(
      yearRow(
        'restingHr',
        'restingHr',
        y.year,
        y.payload,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  for (const y of split.walkingHrYears) {
    rows.push(
      yearRow(
        'walkingHr',
        'walkingHr',
        y.year,
        y.payload,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  for (const y of split.workoutsYears) {
    rows.push(
      yearRow(
        'workouts',
        'workouts',
        y.year,
        y.payload,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  for (const y of split.ecgYears) {
    rows.push(
      yearRow('ecg', 'ecg', y.year, y.payload, y.approxBytes, y.recordCount),
    );
  }
  for (const y of split.watchDailyYears) {
    rows.push(
      yearRow(
        'watchDaily',
        'watchDaily',
        y.year,
        y.payload,
        y.approxBytes,
        y.recordCount,
      ),
    );
  }
  return rows;
}
