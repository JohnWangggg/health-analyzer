/**
 * 统计与指标计算
 */

import {
  HealthData,
  Stats,
  CgmStats,
  CgmSegmentStats,
  BloodPressureStats,
  BpPeriodMean,
  HrvDaySummary,
  SleepDaySummary,
  FullAnalysis,
  WeightRecord,
  WeightStats,
  DailyWeight,
  BloodPressureRecord,
  WatchStats,
  WatchDayView,
  WatchDaySummary,
  WorkoutSession,
  WorkoutStats,
  WorkoutTypeSummary,
  EcgStats,
  ERecordSummary,
  RecoveryWeekStats,
  RecoveryWeekPoint,
  RecoveryWeights,
  RecoveryScorePart,
  DEFAULT_RECOVERY_WEIGHTS,
} from './types';
import { getDate, getHour, parseAppleDate, workoutTypeLabel } from './parser';
import { createL, normalizeLocale, AppLocale } from './locale';
import {
  addDaysIso,
  calendarWindowEndInclusive,
  countDaysWithData,
  daysBetween,
  filterByCalendarWindow,
  meanInCalendarWindow,
  priorValuesBeforeWindow,
} from './window';

export {
  addDaysIso,
  calendarWindowEndInclusive,
  countDaysWithData,
  daysBetween,
  filterByCalendarWindow,
  meanInCalendarWindow,
  priorValuesBeforeWindow,
} from './window';

/** 将部分权重与默认合并，非正数回退默认 */
export function normalizeRecoveryWeights(
  weights?: Partial<RecoveryWeights> | null
): RecoveryWeights {
  const base = { ...DEFAULT_RECOVERY_WEIGHTS };
  if (!weights) return base;
  const keys = Object.keys(base) as (keyof RecoveryWeights)[];
  for (const k of keys) {
    const v = weights[k];
    if (v != null && Number.isFinite(v) && v > 0) {
      base[k] = v;
    }
  }
  return base;
}

/** 加权平均：仅对有值的维度；权重全相等时与简单平均一致 */
function weightedMean(parts: { value: number; weight: number }[]): number | null {
  let sum = 0;
  let wSum = 0;
  for (const p of parts) {
    if (!Number.isFinite(p.value) || !Number.isFinite(p.weight) || p.weight <= 0) continue;
    sum += p.value * p.weight;
    wSum += p.weight;
  }
  if (wSum <= 0) return null;
  return sum / wSum;
}

function calcStats(values: number[]): Stats {
  values = values.filter(Number.isFinite);
  if (values.length === 0) {
    return { mean: 0, std: 0, cv: 0, min: 0, max: 0, count: 0 };
  }
  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? (std / mean) * 100 : 0;
  return {
    mean,
    std,
    cv,
    min: Math.min(...values),
    max: Math.max(...values),
    count: n,
  };
}

/** CGM 相邻采样计入 TIR 的最大间隔（毫秒）；默认 15 分钟 */
const CGM_MAX_GAP_MS = 15 * 60 * 1000;
/** 末点默认代表时长（毫秒） */
const CGM_LAST_SAMPLE_MS = 5 * 60 * 1000;

type CgmLike = { datetime: string; value: number };

function sampleSharePcts(values: number[]) {
  const total = values.length || 1;
  return {
    pctBelow39: (values.filter((v) => v < 3.9).length / total) * 100,
    pctBelow30: (values.filter((v) => v < 3.0).length / total) * 100,
    pctInRange: (values.filter((v) => v >= 3.9 && v <= 10.0).length / total) * 100,
    pctAbove78: (values.filter((v) => v > 7.8).length / total) * 100,
    pctAbove100: (values.filter((v) => v > 10.0).length / total) * 100,
  };
}

/**
 * 时间加权占比：每个采样点代表「到下一点的间隔」（上限 maxGap）；
 * 末点贡献 LAST_SAMPLE。超 maxGap 的部分记为缺口，不计入 wear。
 */
function timeWeightedPcts(
  sorted: CgmLike[],
  maxGapMs = CGM_MAX_GAP_MS
): {
  pctBelow39: number;
  pctBelow30: number;
  pctInRange: number;
  pctAbove78: number;
  pctAbove100: number;
  wearMs: number;
  gapCount: number;
  intervalsMin: number[];
} {
  let wearMs = 0;
  let gapCount = 0;
  let below39 = 0;
  let below30 = 0;
  let inRange = 0;
  let above78 = 0;
  let above100 = 0;
  const intervalsMin: number[] = [];

  const add = (v: number, ms: number) => {
    if (ms <= 0) return;
    wearMs += ms;
    if (v < 3.9) below39 += ms;
    if (v < 3.0) below30 += ms;
    if (v >= 3.9 && v <= 10.0) inRange += ms;
    if (v > 7.8) above78 += ms;
    if (v > 10.0) above100 += ms;
  };

  for (let i = 0; i < sorted.length; i++) {
    const t0 = parseAppleDate(sorted[i].datetime);
    let dt: number;
    if (i + 1 < sorted.length) {
      const t1 = parseAppleDate(sorted[i + 1].datetime);
      dt = Math.max(0, t1 - t0);
      if (dt > 0) intervalsMin.push(dt / 60000);
      if (dt > maxGapMs) {
        gapCount += 1;
        dt = maxGapMs;
      }
    } else {
      dt = CGM_LAST_SAMPLE_MS;
    }
    add(sorted[i].value, dt);
  }

  const den = wearMs || 1;
  return {
    pctBelow39: (below39 / den) * 100,
    pctBelow30: (below30 / den) * 100,
    pctInRange: (inRange / den) * 100,
    pctAbove78: (above78 / den) * 100,
    pctAbove100: (above100 / den) * 100,
    wearMs,
    gapCount,
    intervalsMin,
  };
}

function medianOf(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function cgmSegment(
  points: CgmLike[],
  preferTimeWeighted: boolean
): CgmSegmentStats | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const values = sorted.map((p) => p.value);
  const overall = calcStats(values);
  const sample = sampleSharePcts(values);
  const tw = timeWeightedPcts(sorted);
  const useTw = preferTimeWeighted && tw.wearMs > 0;
  const pick = useTw ? tw : sample;
  return {
    ...overall,
    timeRange: `${sorted[0].datetime} 至 ${sorted[sorted.length - 1].datetime}`,
    pctBelow39: pick.pctBelow39,
    pctBelow30: pick.pctBelow30,
    pctInRange: pick.pctInRange,
    pctAbove78: pick.pctAbove78,
    pctAbove100: pick.pctAbove100,
    tirMethod: useTw ? 'time_weighted' : 'sample_share',
    samplePctInRange: sample.pctInRange,
  };
}

function buildCgmCoverage(sorted: CgmLike[]): import('./types').CgmCoverage {
  const tw = timeWeightedPcts(sorted);
  const t0 = parseAppleDate(sorted[0].datetime);
  const t1 = parseAppleDate(sorted[sorted.length - 1].datetime);
  const spanMs = Math.max(0, t1 - t0);
  const spanHours = spanMs / 3600000;
  const wearHours = tw.wearMs / 3600000;
  const coveragePct =
    spanHours >= 1 ? Math.min(100, (wearHours / spanHours) * 100) : null;
  const medianIntervalMin = medianOf(tw.intervalsMin);
  // 可靠时间加权：跨度≥6h、覆盖≥50%、中位间隔≤12 分钟
  const reliableTir =
    sorted.length >= 12 &&
    spanHours >= 6 &&
    coveragePct != null &&
    coveragePct >= 50 &&
    medianIntervalMin != null &&
    medianIntervalMin <= 12;
  return {
    pointCount: sorted.length,
    spanHours: Math.round(spanHours * 10) / 10,
    wearHours: Math.round(wearHours * 10) / 10,
    coveragePct: coveragePct == null ? null : Math.round(coveragePct * 10) / 10,
    medianIntervalMin:
      medianIntervalMin == null ? null : Math.round(medianIntervalMin * 10) / 10,
    gapCount: tw.gapCount,
    maxGapMin: CGM_MAX_GAP_MS / 60000,
    tirMethod: reliableTir ? 'time_weighted' : 'sample_share',
    reliableTir,
  };
}

/** CGM 完整统计：总体 + 首日 + 稳定期 + 覆盖/时间加权 TIR */
export function calcCgmStats(
  cgm: CgmLike[],
  options?: { unitReliable?: boolean }
): CgmStats | null {
  if (cgm.length === 0) return null;

  const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const coverage = buildCgmCoverage(sorted);
  const preferTw = coverage.reliableTir;
  const overall = cgmSegment(sorted, preferTw)!;
  const firstDayDate = getDate(sorted[0].datetime);
  const firstDayPoints = sorted.filter((p) => getDate(p.datetime) === firstDayDate);
  const stablePoints = sorted.filter((p) => getDate(p.datetime) !== firstDayDate);
  const firstDay = cgmSegment(firstDayPoints, preferTw);
  const stable = stablePoints.length ? cgmSegment(stablePoints, preferTw) : null;

  // 分日统计（日粒度仍用采样点占比，间隔短时与时间加权接近）
  const byDay: Record<string, number[]> = {};
  for (const p of sorted) {
    const d = getDate(p.datetime);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(p.value);
  }

  const daily: CgmStats['daily'] = {};
  for (const date of Object.keys(byDay).sort()) {
    const vals = byDay[date];
    const s = calcStats(vals);
    const share = sampleSharePcts(vals);
    daily[date] = {
      ...s,
      pctBelow39: share.pctBelow39,
      pctAbove78: share.pctAbove78,
      pctAbove100: share.pctAbove100,
    };
  }

  // 最大上升（30/60/120 分钟窗口）
  const maxRises: CgmStats['maxRises'] = {
    '30min': { rise: 0, time: '' },
    '60min': { rise: 0, time: '' },
    '120min': { rise: 0, time: '' },
  };
  for (const window of [30, 60, 120] as const) {
    const windowMs = window * 60 * 1000;
    let left = 0;
    const minDeque: number[] = [];
    let maxRise = 0;
    let maxTime = '';
    for (let right = 0; right < sorted.length; right++) {
      const rightMs = parseAppleDate(sorted[right].datetime);
      while (left < right && rightMs - parseAppleDate(sorted[left].datetime) > windowMs) {
        left++;
      }

      while (minDeque.length && minDeque[0] < left) minDeque.shift();
      const previous = right - 1;
      while (minDeque.length && sorted[minDeque[minDeque.length - 1]].value >= sorted[previous].value) {
        minDeque.pop();
      }
      if (previous >= left) minDeque.push(previous);

      if (minDeque.length) {
        const minIndex = minDeque[0];
        const rise = sorted[right].value - sorted[minIndex].value;
        if (rise > maxRise) {
          maxRise = rise;
          maxTime = `${sorted[minIndex].datetime} -> ${sorted[right].datetime}`;
        }
      }
    }
    maxRises[`${window}min` as keyof typeof maxRises] = { rise: maxRise, time: maxTime };
  }

  return {
    overall,
    firstDayDate,
    firstDay,
    stable,
    daily,
    maxRises,
    coverage,
    unitReliable: options?.unitReliable !== false,
  };
}

function meanBp(records: BloodPressureRecord[]): BpPeriodMean | null {
  if (!records.length) return null;
  const meanSys = records.reduce((a, b) => a + b.systolic, 0) / records.length;
  const meanDia = records.reduce((a, b) => a + b.diastolic, 0) / records.length;
  const lowCount = records.filter((r) => r.systolic < 90 || r.diastolic < 60).length;
  const daysWithData = new Set(records.map((r) => r.date)).size;
  return {
    systolic: meanSys,
    diastolic: meanDia,
    count: records.length,
    lowCount,
    daysWithData,
  };
}

/** 血压：整体时段 + 晨间/晚间分层（近 N 日 = 末日往前 N 个自然日，含末日） */
export function calcBloodPressureStats(
  records: BloodPressureRecord[]
): BloodPressureStats | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const latest = sorted[sorted.length - 1].date;

  function periodStats(days: number, pred?: (r: BloodPressureRecord) => boolean): BpPeriodMean | null {
    const { items } = filterByCalendarWindow(sorted, latest, days);
    let filtered = items;
    if (pred) filtered = filtered.filter(pred);
    return meanBp(filtered);
  }

  const isMorning = (r: BloodPressureRecord) => getHour(r.datetime) < 12;
  const isEvening = (r: BloodPressureRecord) => getHour(r.datetime) >= 18;

  return {
    records: sorted,
    mean7d: periodStats(7),
    mean14d: periodStats(14),
    mean30d: periodStats(30),
    morning7d: periodStats(7, isMorning),
    evening7d: periodStats(7, isEvening),
    morning14d: periodStats(14, isMorning),
    evening14d: periodStats(14, isEvening),
    lowest: sorted.reduce((min, r) => (r.systolic < min.systolic ? r : min), sorted[0]),
    highest: sorted.reduce((max, r) => (r.systolic > max.systolic ? r : max), sorted[0]),
  };
}

/**
 * 体重：同日聚合，趋势用晨起（12:00 前最早），否则全日最早
 */
export function calcWeightStats(weight: WeightRecord[]): WeightStats | null {
  if (!weight.length) return null;
  const sorted = [...weight].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const byDate: Record<string, WeightRecord[]> = {};
  for (const w of sorted) {
    if (!byDate[w.date]) byDate[w.date] = [];
    byDate[w.date].push(w);
  }

  const daily: DailyWeight[] = [];
  for (const date of Object.keys(byDate).sort()) {
    const all = byDate[date].sort((a, b) => a.datetime.localeCompare(b.datetime));
    const mornings = all.filter((w) => getHour(w.datetime) < 12);
    const evenings = all.filter((w) => getHour(w.datetime) >= 18);
    const morning = mornings.length ? mornings[0] : null;
    const evening = evenings.length ? evenings[evenings.length - 1] : null;
    const trend = morning || all[0];
    daily.push({
      date,
      trend,
      morning,
      evening,
      allCount: all.length,
    });
  }

  const trendSeries = daily.map((d) => ({
    date: d.date,
    weight: d.trend.value,
    bodyFat: d.trend.bodyFat,
  }));

  const withFat = trendSeries.filter((t) => t.bodyFat != null && Number.isFinite(t.bodyFat!));
  const latestTrend = trendSeries.length
    ? trendSeries[trendSeries.length - 1]
    : null;
  const earliestTrend = trendSeries.length ? trendSeries[0] : null;
  const morningsOnly = daily.map((d) => d.morning).filter(Boolean) as WeightRecord[];

  return {
    daily,
    trendSeries,
    rawCount: sorted.length,
    dayCount: daily.length,
    latestTrend,
    earliestTrend,
    latestMorning: morningsOnly.length ? morningsOnly[morningsOnly.length - 1] : null,
    bodyFatLatest: withFat.length ? withFat[withFat.length - 1].bodyFat! : null,
    bodyFatEarliest: withFat.length ? withFat[0].bodyFat! : null,
    bodyFatDelta:
      withFat.length >= 2
        ? withFat[withFat.length - 1].bodyFat! - withFat[0].bodyFat!
        : null,
    bodyFatDayCount: withFat.length,
  };
}

/** HRV 每日摘要 */
export function summarizeHrvByDay(
  hrv: Record<string, number[]>,
  hrvOvernight: Record<string, number[]>
): Record<string, HrvDaySummary> {
  const result: Record<string, HrvDaySummary> = {};
  for (const date of Object.keys(hrv).sort()) {
    const vals = hrv[date];
    const overnight = hrvOvernight[date] || [];
    result[date] = {
      allMean: vals.reduce((a, b) => a + b, 0) / vals.length,
      overnightMean:
        overnight.length > 0
          ? overnight.reduce((a, b) => a + b, 0) / overnight.length
          : null,
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
    };
  }
  return result;
}

/** 以末日为截止的近 n 自然日窗口内，对日序列 pick 值求均值 */
function meanWatchInCalendarWindow(
  days: WatchDayView[],
  pick: (d: WatchDayView) => number | null | undefined,
  endDate: string,
  n: number
): { mean: number | null; daysWithData: number } {
  const { start, end } = calendarWindowEndInclusive(endDate, n);
  const vals: number[] = [];
  for (const d of days) {
    if (d.date < start || d.date > end) continue;
    const v = pick(d);
    if (v != null && Number.isFinite(v)) vals.push(v);
  }
  if (!vals.length) return { mean: null, daysWithData: 0 };
  return {
    mean: vals.reduce((a, b) => a + b, 0) / vals.length,
    daysWithData: vals.length,
  };
}

/** 近 n 自然日内 pick 的最小值 */
function minWatchInCalendarWindow(
  days: WatchDayView[],
  pick: (d: WatchDayView) => number | null | undefined,
  endDate: string,
  n: number
): number | null {
  const { start, end } = calendarWindowEndInclusive(endDate, n);
  let min: number | null = null;
  for (const d of days) {
    if (d.date < start || d.date > end) continue;
    const v = pick(d);
    if (v != null && Number.isFinite(v)) {
      min = min == null ? v : Math.min(min, v);
    }
  }
  return min;
}

function toWatchView(date: string, w: WatchDaySummary): WatchDayView {
  const finiteMin = (v: number, count: number) =>
    count > 0 && v > 0 && v < Infinity ? v : null;
  return {
    date,
    activeKcal: w.activeKcal,
    exerciseMin: w.exerciseMin,
    standMin: w.standMin,
    daylightMin: w.daylightMin,
    standHoursStood: w.standHoursStood || 0,
    standHoursIdle: w.standHoursIdle || 0,
    spo2Mean: w.spo2Count > 0 ? w.spo2Sum / w.spo2Count : null,
    spo2Min: finiteMin(w.spo2Min, w.spo2Count),
    spo2NightMean: w.spo2NightCount > 0 ? w.spo2NightSum / w.spo2NightCount : null,
    spo2NightMin: finiteMin(w.spo2NightMin, w.spo2NightCount),
    spo2DayMean: w.spo2DayCount > 0 ? w.spo2DaySum / w.spo2DayCount : null,
    spo2DayMin: finiteMin(w.spo2DayMin, w.spo2DayCount),
    rrMean: w.rrCount > 0 ? w.rrSum / w.rrCount : null,
    nightHrMean: w.nightHrCount > 0 ? w.nightHrSum / w.nightHrCount : null,
    vo2Max: w.vo2Max ?? null,
    wristTempMean: w.wristTempCount > 0 ? w.wristTempSum / w.wristTempCount : null,
    breathingDisturbance: w.breathingDisturbance ?? null,
  };
}

/** Watch 活动 / 血氧 / 呼吸 / VO2 / 腕温 日汇总（近 7 日 = 末日往前 7 自然日） */
export function calcWatchStats(watchDaily: Record<string, WatchDaySummary> | undefined): WatchStats | null {
  if (!watchDaily || !Object.keys(watchDaily).length) return null;
  const days: WatchDayView[] = Object.keys(watchDaily)
    .sort()
    .map((d) => toWatchView(d, watchDaily[d]));

  const endDate = days[days.length - 1].date;
  const win7 = calendarWindowEndInclusive(endDate, 7);

  const vo2Series = days.filter((d) => d.vo2Max != null);
  const vo2Latest = vo2Series.length ? vo2Series[vo2Series.length - 1].vo2Max : null;
  const vo2Earliest = vo2Series.length ? vo2Series[0].vo2Max : null;

  const bdSeries = days.filter((d) => d.breathingDisturbance != null);
  const breathingDisturbanceLatest = bdSeries.length
    ? bdSeries[bdSeries.length - 1].breathingDisturbance
    : null;

  const daysWithData7d = countDaysWithData(
    days
      .filter((d) => {
        if (d.date < win7.start || d.date > win7.end) return false;
        return (
          d.activeKcal > 0 ||
          d.exerciseMin > 0 ||
          d.spo2Mean != null ||
          d.nightHrMean != null ||
          d.rrMean != null ||
          d.wristTempMean != null ||
          d.breathingDisturbance != null ||
          d.standHoursStood > 0 ||
          d.daylightMin > 0
        );
      })
      .map((d) => d.date),
    win7.start,
    win7.end
  );

  return {
    days,
    activeKcalMean7d: meanWatchInCalendarWindow(days, (d) => d.activeKcal, endDate, 7).mean,
    exerciseMinMean7d: meanWatchInCalendarWindow(days, (d) => d.exerciseMin, endDate, 7).mean,
    spo2Mean7d: meanWatchInCalendarWindow(days, (d) => d.spo2Mean, endDate, 7).mean,
    spo2Min7d: minWatchInCalendarWindow(days, (d) => d.spo2Min, endDate, 7),
    spo2NightMean7d: meanWatchInCalendarWindow(days, (d) => d.spo2NightMean, endDate, 7).mean,
    spo2NightMin7d: minWatchInCalendarWindow(days, (d) => d.spo2NightMin, endDate, 7),
    spo2DayMean7d: meanWatchInCalendarWindow(days, (d) => d.spo2DayMean, endDate, 7).mean,
    spo2DayMin7d: minWatchInCalendarWindow(days, (d) => d.spo2DayMin, endDate, 7),
    rrMean7d: meanWatchInCalendarWindow(days, (d) => d.rrMean, endDate, 7).mean,
    nightHrMean7d: meanWatchInCalendarWindow(days, (d) => d.nightHrMean, endDate, 7).mean,
    vo2Latest,
    vo2Earliest,
    vo2Delta:
      vo2Latest != null && vo2Earliest != null ? vo2Latest - vo2Earliest : null,
    wristTempMean7d: meanWatchInCalendarWindow(days, (d) => d.wristTempMean, endDate, 7).mean,
    breathingDisturbanceMean7d: meanWatchInCalendarWindow(
      days,
      (d) => d.breathingDisturbance,
      endDate,
      7
    ).mean,
    breathingDisturbanceLatest,
    daylightMinMean7d: meanWatchInCalendarWindow(
      days,
      (d) => (d.daylightMin > 0 ? d.daylightMin : null),
      endDate,
      7
    ).mean,
    standHoursMean7d: meanWatchInCalendarWindow(
      days,
      (d) => (d.standHoursStood > 0 || d.standHoursIdle > 0 ? d.standHoursStood : null),
      endDate,
      7
    ).mean,
    dayCount: days.length,
    spo2DayCount: days.filter((d) => d.spo2Mean != null).length,
    spo2NightDayCount: days.filter((d) => d.spo2NightMean != null).length,
    vo2DayCount: vo2Series.length,
    breathingDisturbanceDayCount: bdSeries.length,
    daysWithData7d,
  };
}

/** Workout 会话汇总；referenceDate 默认用最后一场日期，analyzeAll 传入数据结束日更合理 */
export function calcWorkoutStats(
  workouts: WorkoutSession[] | undefined,
  referenceDate?: string
): WorkoutStats | null {
  if (!workouts || !workouts.length) return null;
  const sessions = [...workouts].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const last = sessions[sessions.length - 1];
  const latestDate =
    referenceDate && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
      ? referenceDate
      : last.date;

  const inWindow = (s: WorkoutSession, days: number) =>
    daysBetween(s.date, latestDate) <= days - 1 && s.date <= latestDate;

  const s30 = sessions.filter((s) => inWindow(s, 30));
  const s7 = sessions.filter((s) => inWindow(s, 7));

  const sumDur = (list: WorkoutSession[]) => list.reduce((a, s) => a + (s.durationMin || 0), 0);
  const sumKcal = (list: WorkoutSession[]) =>
    list.reduce((a, s) => a + (s.activeKcal != null && Number.isFinite(s.activeKcal) ? s.activeKcal : 0), 0);

  const byTypeMap = new Map<string, WorkoutTypeSummary>();
  for (const s of sessions) {
    const cur = byTypeMap.get(s.activityType) || {
      activityType: s.activityType,
      activityLabel: s.activityLabel || workoutTypeLabel(s.activityType),
      count: 0,
      durationMin: 0,
      activeKcal: 0,
    };
    cur.count += 1;
    cur.durationMin += s.durationMin || 0;
    cur.activeKcal += s.activeKcal || 0;
    byTypeMap.set(s.activityType, cur);
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.durationMin - a.durationMin);

  const hr30 = s30.map((s) => s.hrAvg).filter((v): v is number => v != null && Number.isFinite(v));
  const hrAvgMean30d =
    hr30.length > 0 ? hr30.reduce((a, b) => a + b, 0) / hr30.length : null;

  return {
    sessions,
    count: sessions.length,
    totalDurationMin: sumDur(sessions),
    totalActiveKcal: sumKcal(sessions),
    count30d: s30.length,
    durationSum30d: sumDur(s30),
    durationMean30d: s30.length ? sumDur(s30) / s30.length : null,
    activeKcalSum30d: sumKcal(s30),
    count7d: s7.length,
    durationSum7d: sumDur(s7),
    byType,
    lastSession: last,
    hrAvgMean30d,
  };
}

const ECG_NEAR_WORKOUT_MS = 2 * 3600 * 1000;
const ECG_RECENT_HIGH_HR = 5;
const ECG_LOW_STEPS = 3000;
const ECG_LOW_EXERCISE_MIN = 10;
const ECG_HIGH_STEPS = 8000;
const ECG_HIGH_EXERCISE_MIN = 20;

function isHighHrClassification(c: string): boolean {
  return /高心率|High Heart/i.test(c);
}

/** 小时是否落在启发式夜间/清晨窗口 22–08（含 8 点） */
function isNightOrEarlyHour(hour: number): boolean {
  return hour >= 22 || hour <= 8;
}

/** 高心率 ECG 与当日活动关联时的可选上下文 */
export interface EcgActivityContext {
  stepsByDate?: Record<string, number>;
  /** Watch 日汇总（取 exerciseMin）；也接受已算好的日视图 */
  watchDaily?: Record<string, { exerciseMin?: number } | undefined>;
}

/**
 * 高心率 ECG 与时段 / Workout / 同日活动关联
 * （±2h 训练窗；22–08 或无附近训练 → 非运动窗；步数/锻炼分钟 → 低/高活动日）
 * 可单独测试；calcEcgStats / analyzeAll 会合并进 EcgStats。
 */
export function enrichEcgWithContext(
  ecg: ERecordSummary[] | undefined,
  workouts?: WorkoutSession[] | undefined,
  activity?: EcgActivityContext
): Pick<
  EcgStats,
  | 'highHrByHour'
  | 'highHrNearWorkoutCount'
  | 'highHrRestingWindowCount'
  | 'recentHighHr'
  | 'highHrOnLowActivityCount'
  | 'highHrOnHighActivityCount'
> {
  const highHrByHour = Array.from({ length: 24 }, () => 0);
  let highHrNearWorkoutCount = 0;
  let highHrRestingWindowCount = 0;
  let highHrOnLowActivityCount = 0;
  let highHrOnHighActivityCount = 0;
  const highHrDatetimes: string[] = [];

  if (!ecg || !ecg.length) {
    return {
      highHrByHour,
      highHrNearWorkoutCount,
      highHrRestingWindowCount,
      recentHighHr: [],
      highHrOnLowActivityCount,
      highHrOnHighActivityCount,
    };
  }

  const workoutStarts = (workouts || [])
    .map((w) => parseAppleDate(w.startDate))
    .filter((t): t is number => Number.isFinite(t))
    .sort((a, b) => a - b);

  const nearWorkout = (t: number): boolean => {
    if (!Number.isFinite(t) || !workoutStarts.length) return false;
    // 线性扫描即可（ECG / workout 规模通常很小）；有序可提前结束
    for (const ws of workoutStarts) {
      const d = Math.abs(ws - t);
      if (d <= ECG_NEAR_WORKOUT_MS) return true;
      if (ws > t + ECG_NEAR_WORKOUT_MS) break;
    }
    return false;
  };

  const stepsByDate = activity?.stepsByDate || {};
  const watchDaily = activity?.watchDaily || {};

  const highHrs = ecg
    .filter((e) => isHighHrClassification(e.classification || ''))
    .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));

  for (const e of highHrs) {
    const hour = getHour(e.datetime);
    if (Number.isFinite(hour) && hour >= 0 && hour <= 23) {
      highHrByHour[hour] += 1;
    }
    const t = parseAppleDate(e.datetime);
    const near = nearWorkout(t);
    if (near) highHrNearWorkoutCount += 1;
    // 非运动窗：夜间/清晨 22–08，或附近无 Workout
    if (isNightOrEarlyHour(hour) || !near) {
      highHrRestingWindowCount += 1;
    }

    const day = getDate(e.datetime);
    const stepsRaw = stepsByDate[day];
    const steps =
      stepsRaw != null && Number.isFinite(stepsRaw) ? (stepsRaw as number) : null;
    const exRaw = watchDaily[day]?.exerciseMin;
    const exerciseMin =
      exRaw != null && Number.isFinite(exRaw) ? (exRaw as number) : null;

    // 低活动：步数 < 3000，且若有锻炼分钟则 < 10
    if (steps != null && steps < ECG_LOW_STEPS) {
      if (exerciseMin == null || exerciseMin < ECG_LOW_EXERCISE_MIN) {
        highHrOnLowActivityCount += 1;
      }
    }
    // 高活动：步数 ≥ 8000，或锻炼 ≥ 20，或训练 ±2h
    if (
      near ||
      (steps != null && steps >= ECG_HIGH_STEPS) ||
      (exerciseMin != null && exerciseMin >= ECG_HIGH_EXERCISE_MIN)
    ) {
      highHrOnHighActivityCount += 1;
    }

    highHrDatetimes.push(e.datetime);
  }

  return {
    highHrByHour,
    highHrNearWorkoutCount,
    highHrRestingWindowCount,
    recentHighHr: highHrDatetimes.slice(-ECG_RECENT_HIGH_HR),
    highHrOnLowActivityCount,
    highHrOnHighActivityCount,
  };
}

/** ECG 分类汇总；可选 workouts / 活动日数据用于高心率关联 */
export function calcEcgStats(
  ecg: ERecordSummary[] | undefined,
  workouts?: WorkoutSession[] | undefined,
  activity?: EcgActivityContext
): EcgStats | null {
  if (!ecg || !ecg.length) return null;
  const sorted = [...ecg].sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  const counts = new Map<string, number>();
  let sinusCount = 0;
  let highHrCount = 0;
  let inconclusiveCount = 0;
  let otherCount = 0;
  for (const e of sorted) {
    const c = e.classification || 'unknown';
    counts.set(c, (counts.get(c) || 0) + 1);
    if (/窦性|Sinus/i.test(c)) sinusCount += 1;
    else if (isHighHrClassification(c)) highHrCount += 1;
    else if (/不佳|Inconclusive|Poor/i.test(c)) inconclusiveCount += 1;
    else otherCount += 1;
  }
  const byClassification = [...counts.entries()]
    .map(([classification, count]) => ({ classification, count }))
    .sort((a, b) => b.count - a.count);
  const ctx = enrichEcgWithContext(sorted, workouts, activity);
  return {
    count: sorted.length,
    byClassification,
    latest: sorted[sorted.length - 1],
    sinusCount,
    highHrCount,
    inconclusiveCount,
    otherCount,
    ...ctx,
  };
}

/** 以 endDate 为末日的近 n 自然日均值（日历窗，非「最近 n 个有数据日」） */
function meanMapCalendarN(
  map: Record<string, number>,
  n: number,
  endDate: string
): { mean: number | null; daysWithData: number } {
  return meanInCalendarWindow(map, endDate, n);
}

/** Watch 日序列：以 endDate 为末日的近 n 自然日均值 */
function meanWatchSeriesCalendarN(
  days: WatchDayView[] | undefined,
  pick: (d: WatchDayView) => number | null | undefined,
  n: number,
  endDate: string
): { mean: number | null; daysWithData: number } {
  if (!days?.length) return { mean: null, daysWithData: 0 };
  return meanWatchInCalendarWindow(days, pick, endDate, n);
}

/** Watch 日序列 → date→value 映射（仅有限值） */
function watchSeriesToMap(
  days: WatchDayView[] | undefined,
  pick: (d: WatchDayView) => number | null | undefined
): Record<string, number> {
  const map: Record<string, number> = {};
  if (!days) return map;
  for (const d of days) {
    const v = pick(d);
    if (v != null && Number.isFinite(v)) map[d.date] = v;
  }
  return map;
}

function workoutWindowAt(
  sessions: WorkoutSession[] | undefined,
  endDate: string,
  windowDays: number
): { count: number; duration: number } {
  if (!sessions?.length) return { count: 0, duration: 0 };
  const { start } = calendarWindowEndInclusive(endDate, windowDays);
  const list = sessions.filter((s) => s.date >= start && s.date <= endDate);
  return {
    count: list.length,
    duration: list.reduce((a, s) => a + (s.durationMin || 0), 0),
  };
}

/** 数值中位数；空数组返回 null */
function medianNumber(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 线性分位（p∈[0,1]） */
function percentileNumber(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const idx = Math.max(0, Math.min(1, p)) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const t = idx - lo;
  return sorted[lo] * (1 - t) + sorted[hi] * t;
}

/**
 * 相对个人中位/分位的 0–100 子分。
 * higherIsBetter：越高越好（HRV/睡眠）；false 则越低越好（夜心率）。
 * 中位≈55；向 p75/p25 方向约 ±25 分。
 */
function scoreFromPersonalDistribution(
  current: number,
  prior: number[],
  higherIsBetter: boolean
): number | null {
  if (prior.length < 14) return null;
  const med = medianNumber(prior);
  const p25 = percentileNumber(prior, 0.25);
  const p75 = percentileNumber(prior, 0.75);
  if (med == null || p25 == null || p75 == null) return null;

  const clamp = (x: number) => Math.max(0, Math.min(100, x));
  if (higherIsBetter) {
    if (current >= med) {
      const span = Math.max(p75 - med, Math.abs(med) * 0.05, 1e-3);
      return clamp(55 + 25 * ((current - med) / span));
    }
    const span = Math.max(med - p25, Math.abs(med) * 0.05, 1e-3);
    return clamp(55 - 25 * ((med - current) / span));
  }
  // lower is better
  if (current <= med) {
    const span = Math.max(med - p25, Math.abs(med) * 0.05, 1e-3);
    return clamp(55 + 25 * ((med - current) / span));
  }
  const span = Math.max(p75 - med, Math.abs(med) * 0.05, 1e-3);
  return clamp(55 - 25 * ((current - med) / span));
}

/** 个人基线主导阈值：≥28 个有数据日，或跨度≥28 天且样本≥14 */
const PERSONAL_BASELINE_MIN_SAMPLES = 28;
const PERSONAL_BASELINE_MIN_SPAN_DAYS = 28;
const PERSONAL_BASELINE_MIN_SAMPLES_WITH_SPAN = 14;
const PERSONAL_SCORE_WEIGHT = 0.72;
const ABSOLUTE_SCORE_WEIGHT = 0.28;

function hasPersonalHistoryDepth(prior: number[], priorDates?: string[]): boolean {
  if (prior.length >= PERSONAL_BASELINE_MIN_SAMPLES) return true;
  if (
    prior.length >= PERSONAL_BASELINE_MIN_SAMPLES_WITH_SPAN &&
    priorDates &&
    priorDates.length >= 2
  ) {
    const span = daysBetween(priorDates[0], priorDates[priorDates.length - 1]);
    return span >= PERSONAL_BASELINE_MIN_SPAN_DAYS - 1;
  }
  return false;
}

function blendPersonalAbsolute(
  personal: number | null,
  absolute: number,
  prior: number[],
  priorDates?: string[]
): { score: number; usedPersonal: boolean } {
  if (personal != null && hasPersonalHistoryDepth(prior, priorDates)) {
    return {
      score: personal * PERSONAL_SCORE_WEIGHT + absolute * ABSOLUTE_SCORE_WEIGHT,
      usedPersonal: true,
    };
  }
  return { score: absolute, usedPersonal: false };
}

/**
 * 用多周历史给最新一周贴上个人恢复基线标注（轻量、非诊断）。
 * 需要此前 ≥4 周有效 recoveryScore；|delta|≥8 时在 statusLabel 中提示。
 * 不在此处重算分数（避免与 scoreRecoveryLoad 个人分位混合双重改分）。
 */
export function attachRecoveryBaseline(
  week: RecoveryWeekStats,
  recoveryWeeks: RecoveryWeekPoint[] | null | undefined,
  localeInput?: AppLocale | string | null
): RecoveryWeekStats {
  const L = createL(normalizeLocale(localeInput));
  const priorScores = (recoveryWeeks || [])
    .filter((p) => p.weekEnd !== week.weekEnd)
    .map((p) => p.recoveryScore)
    .filter((s): s is number => s != null && Number.isFinite(s));

  let baselineRecoveryMedian: number | null = null;
  let vsBaselineDelta: number | null = null;
  let statusLabel = week.statusLabel;
  const alreadyAnnotated = /近几周中位|recent median/i.test(statusLabel);

  if (week.recoveryScore != null && priorScores.length >= 4) {
    const med = medianNumber(priorScores);
    if (med != null) {
      baselineRecoveryMedian = Math.round(med);
      vsBaselineDelta = week.recoveryScore - baselineRecoveryMedian;
      if (!alreadyAnnotated && Math.abs(vsBaselineDelta) >= 8) {
        const abs = Math.abs(vsBaselineDelta);
        statusLabel =
          vsBaselineDelta > 0
            ? L(
                `${statusLabel}（高于近几周中位约 ${abs} 分）`,
                `${statusLabel} (~${abs} pts above recent median)`
              )
            : L(
                `${statusLabel}（低于近几周中位约 ${abs} 分）`,
                `${statusLabel} (~${abs} pts below recent median)`
              );
      }
    }
  }

  return {
    ...week,
    baselineRecoveryMedian,
    vsBaselineDelta,
    statusLabel,
    components: week.components || [],
    usedPersonalBaseline: !!week.usedPersonalBaseline,
  };
}

/** 各维个人先验（窗口前有数据日的值序列） */
export type RecoveryPersonalPriors = {
  hrv?: number[];
  sleep?: number[];
  nightHr?: number[];
  spo2Night?: number[];
  exercise?: number[];
  steps?: number[];
  hrvDates?: string[];
  sleepDates?: string[];
  nightHrDates?: string[];
  spo2NightDates?: string[];
  exerciseDates?: string[];
  stepsDates?: string[];
};

/** 恢复/负荷启发式评分（共享，避免单周与多周漂移）；附带各维子分构成 */
function scoreRecoveryLoad(input: {
  hrvMean7d: number | null;
  sleepMean7d: number | null;
  nightHrMean7d: number | null;
  restingHrMean7d: number | null;
  spo2NightMean7d: number | null;
  exerciseMinMean7d: number | null;
  workoutDuration7d: number;
  stepsMean7d: number | null;
  daysWithData?: number;
  personalPriors?: RecoveryPersonalPriors | null;
  weights?: Partial<RecoveryWeights> | null;
  locale?: AppLocale | string | null;
}): {
  recoveryScore: number | null;
  loadScore: number | null;
  statusLabel: string;
  statusTone: RecoveryWeekStats['statusTone'];
  components: RecoveryScorePart[];
  usedPersonalBaseline: boolean;
} {
  const L = createL(normalizeLocale(input.locale));
  const w = normalizeRecoveryWeights(input.weights);
  const components: RecoveryScorePart[] = [];
  const priors = input.personalPriors || {};
  let usedPersonalBaseline = false;

  const recoveryParts: { value: number; weight: number }[] = [];
  if (input.hrvMean7d != null) {
    const absolute = Math.max(0, Math.min(100, ((input.hrvMean7d - 15) / 45) * 100));
    const prior = priors.hrv || [];
    const personal = scoreFromPersonalDistribution(input.hrvMean7d, prior, true);
    const blended = blendPersonalAbsolute(personal, absolute, prior, priors.hrvDates);
    if (blended.usedPersonal) usedPersonalBaseline = true;
    recoveryParts.push({ value: blended.score, weight: w.hrv });
    components.push({
      key: 'hrv',
      side: 'recovery',
      score: Math.round(blended.score),
      weight: w.hrv,
      raw: input.hrvMean7d,
      rawUnit: 'ms',
    });
  }
  if (input.sleepMean7d != null) {
    const absolute = Math.max(0, Math.min(100, (input.sleepMean7d / 8) * 100));
    const prior = priors.sleep || [];
    const personal = scoreFromPersonalDistribution(input.sleepMean7d, prior, true);
    const blended = blendPersonalAbsolute(personal, absolute, prior, priors.sleepDates);
    if (blended.usedPersonal) usedPersonalBaseline = true;
    recoveryParts.push({ value: blended.score, weight: w.sleep });
    components.push({
      key: 'sleep',
      side: 'recovery',
      score: Math.round(blended.score),
      weight: w.sleep,
      raw: input.sleepMean7d,
      rawUnit: 'h',
    });
  }
  if (input.nightHrMean7d != null && input.restingHrMean7d != null) {
    const delta = input.nightHrMean7d - input.restingHrMean7d;
    const absolute = Math.max(0, Math.min(100, 80 - delta * 4));
    const prior = priors.nightHr || [];
    const personal = scoreFromPersonalDistribution(input.nightHrMean7d, prior, false);
    const blended = blendPersonalAbsolute(personal, absolute, prior, priors.nightHrDates);
    if (blended.usedPersonal) usedPersonalBaseline = true;
    recoveryParts.push({ value: blended.score, weight: w.nightHr });
    components.push({
      key: 'nightHr',
      side: 'recovery',
      score: Math.round(blended.score),
      weight: w.nightHr,
      raw: input.nightHrMean7d,
      rawUnit: 'bpm',
    });
  } else if (input.nightHrMean7d != null) {
    const absolute = Math.max(0, Math.min(100, 100 - (input.nightHrMean7d - 50) * 1.5));
    const prior = priors.nightHr || [];
    const personal = scoreFromPersonalDistribution(input.nightHrMean7d, prior, false);
    const blended = blendPersonalAbsolute(personal, absolute, prior, priors.nightHrDates);
    if (blended.usedPersonal) usedPersonalBaseline = true;
    recoveryParts.push({ value: blended.score, weight: w.nightHr });
    components.push({
      key: 'nightHr',
      side: 'recovery',
      score: Math.round(blended.score),
      weight: w.nightHr,
      raw: input.nightHrMean7d,
      rawUnit: 'bpm',
    });
  }
  if (input.spo2NightMean7d != null) {
    const absolute = Math.max(0, Math.min(100, (input.spo2NightMean7d - 90) * 10));
    const prior = priors.spo2Night || [];
    const personal = scoreFromPersonalDistribution(input.spo2NightMean7d, prior, true);
    const blended = blendPersonalAbsolute(personal, absolute, prior, priors.spo2NightDates);
    if (blended.usedPersonal) usedPersonalBaseline = true;
    recoveryParts.push({ value: blended.score, weight: w.spo2Night });
    components.push({
      key: 'spo2Night',
      side: 'recovery',
      score: Math.round(blended.score),
      weight: w.spo2Night,
      raw: input.spo2NightMean7d,
      rawUnit: '%',
    });
  }

  const loadParts: { value: number; weight: number }[] = [];
  if (input.exerciseMinMean7d != null) {
    const absolute = Math.max(0, Math.min(100, (input.exerciseMinMean7d / 45) * 100));
    const prior = priors.exercise || [];
    const personal = scoreFromPersonalDistribution(input.exerciseMinMean7d, prior, true);
    let value = absolute;
    if (personal != null && hasPersonalHistoryDepth(prior, priors.exerciseDates)) {
      value = personal * 0.55 + absolute * 0.45;
      usedPersonalBaseline = true;
    }
    loadParts.push({ value, weight: w.exercise });
    components.push({
      key: 'exercise',
      side: 'load',
      score: Math.round(value),
      weight: w.exercise,
      raw: input.exerciseMinMean7d,
      rawUnit: 'min',
    });
  }
  if (input.workoutDuration7d > 0) {
    const value = Math.max(0, Math.min(100, (input.workoutDuration7d / 150) * 100));
    loadParts.push({ value, weight: w.workout });
    components.push({
      key: 'workout',
      side: 'load',
      score: Math.round(value),
      weight: w.workout,
      raw: input.workoutDuration7d,
      rawUnit: 'min',
    });
  }
  if (input.stepsMean7d != null) {
    const absolute = Math.max(0, Math.min(100, (input.stepsMean7d / 10000) * 100));
    const prior = priors.steps || [];
    const personal = scoreFromPersonalDistribution(input.stepsMean7d, prior, true);
    let value = absolute;
    if (personal != null && hasPersonalHistoryDepth(prior, priors.stepsDates)) {
      value = personal * 0.55 + absolute * 0.45;
      usedPersonalBaseline = true;
    }
    loadParts.push({ value, weight: w.steps });
    components.push({
      key: 'steps',
      side: 'load',
      score: Math.round(value),
      weight: w.steps,
      raw: input.stepsMean7d,
      rawUnit: 'steps',
    });
  }

  const recoveryScoreRaw = weightedMean(recoveryParts);
  const loadScoreRaw = weightedMean(loadParts);

  /**
   * 覆盖不足：窗口内有数据日 < 3 且恢复侧维度 < 2 → 不硬给恢复总分（仍返回 components）。
   */
  const daysWithData = input.daysWithData ?? 0;
  const thinRecoveryCoverage =
    (daysWithData > 0 && daysWithData < 3 && recoveryParts.length < 2) ||
    recoveryParts.length === 0;
  const recoveryScore =
    recoveryScoreRaw != null && !thinRecoveryCoverage
      ? Math.round(recoveryScoreRaw)
      : null;
  const loadScore = loadScoreRaw != null ? Math.round(loadScoreRaw) : null;

  let statusLabel = L('数据不足，暂不评估', 'Insufficient data to score');
  let statusTone: RecoveryWeekStats['statusTone'] = 'neutral';
  if (recoveryScore == null && loadScore == null) {
    statusLabel = L(
      '近 7 日数据覆盖不足，暂不给出恢复/负荷总分',
      'Insufficient coverage in last 7 days — no recovery/load total'
    );
  } else if (recoveryScore == null && loadScore != null) {
    statusLabel = L(
      '恢复侧数据不足，仅供负荷参考',
      'Insufficient recovery coverage — load only'
    );
    statusTone = 'neutral';
  } else if (recoveryScore != null) {
    const r = recoveryScore;
    const l = loadScore ?? 40;
    if (r >= 65 && l <= 70) {
      statusLabel = L('恢复尚可，可维持或轻量推进', 'Recovery looks OK — maintain or progress lightly');
      statusTone = 'positive';
    } else if (r < 45 && l >= 55) {
      statusLabel = L('负荷偏高且恢复偏紧，建议轻松日', 'High load with tight recovery — prefer easy days');
      statusTone = 'watch';
    } else if (r < 40) {
      statusLabel = L('恢复指标偏弱，优先睡眠与减负', 'Weak recovery — prioritize sleep and reduce load');
      statusTone = 'watch';
    } else if (l < 25 && r >= 50) {
      statusLabel = L('恢复尚可但活动偏低，可适量增加走动', 'Recovery OK but activity is low — add light walking');
      statusTone = 'neutral';
    } else {
      statusLabel = L('负荷与恢复大致平衡', 'Load and recovery are roughly balanced');
      statusTone = 'neutral';
    }
    if (usedPersonalBaseline) {
      statusLabel = L(
        `${statusLabel}（已结合个人基线）`,
        `${statusLabel} (personal baseline applied)`
      );
    }
  }

  return {
    recoveryScore,
    loadScore,
    statusLabel,
    statusTone,
    components,
    usedPersonalBaseline,
  };
}

export type RecoveryAnalysisPartial = {
  dateRange: { start: string; end: string };
  hrvByDate: Record<string, HrvDaySummary>;
  restingHrByDate: Record<string, number>;
  stepsByDate: Record<string, number>;
  sleepByDate: Record<string, { total: number }>;
  watchStats: WatchStats | null;
  workoutStats: WorkoutStats | null;
};

/** 以指定 weekEnd 计算近 7 自然日负荷/恢复（内部共用） */
function buildRecoveryWeekAt(
  analysis: RecoveryAnalysisPartial,
  weekEnd: string,
  weights?: Partial<RecoveryWeights> | null,
  locale?: AppLocale | string | null
): RecoveryWeekStats | null {
  if (!weekEnd) return null;

  const { start: windowStart } = calendarWindowEndInclusive(weekEnd, 7);

  const hrvMeans: Record<string, number> = {};
  for (const [d, h] of Object.entries(analysis.hrvByDate || {})) {
    if (h && Number.isFinite(h.allMean)) hrvMeans[d] = h.allMean;
  }
  const sleepTotals: Record<string, number> = {};
  for (const [d, s] of Object.entries(analysis.sleepByDate || {})) {
    if (s && Number.isFinite(s.total)) sleepTotals[d] = s.total;
  }

  const days = analysis.watchStats?.days;
  const sessions = analysis.workoutStats?.sessions;

  const hrvWin = meanMapCalendarN(hrvMeans, 7, weekEnd);
  const restWin = meanMapCalendarN(analysis.restingHrByDate || {}, 7, weekEnd);
  const stepsWin = meanMapCalendarN(analysis.stepsByDate || {}, 7, weekEnd);
  const sleepWin = meanMapCalendarN(sleepTotals, 7, weekEnd);

  const nightWin = meanWatchSeriesCalendarN(days, (d) => d.nightHrMean, 7, weekEnd);
  const exerciseWin = meanWatchSeriesCalendarN(days, (d) => d.exerciseMin, 7, weekEnd);
  const standWin = meanWatchSeriesCalendarN(
    days,
    (d) => (d.standHoursStood > 0 || d.standHoursIdle > 0 ? d.standHoursStood : null),
    7,
    weekEnd
  );
  const daylightWin = meanWatchSeriesCalendarN(
    days,
    (d) => (d.daylightMin > 0 ? d.daylightMin : null),
    7,
    weekEnd
  );
  const spo2NightWin = meanWatchSeriesCalendarN(days, (d) => d.spo2NightMean, 7, weekEnd);

  const hrvMean7d = hrvWin.mean;
  const restingHrMean7d = restWin.mean;
  const stepsMean7d = stepsWin.mean;
  const sleepMean7d = sleepWin.mean;
  const nightHrMean7d = nightWin.mean;
  const exerciseMinMean7d = exerciseWin.mean;
  const standHoursMean7d = standWin.mean;
  const daylightMinMean7d = daylightWin.mean;
  const spo2NightMean7d = spo2NightWin.mean;

  const w7 = workoutWindowAt(sessions, weekEnd, 7);
  const workoutCount7d = w7.count;
  const workoutDuration7d = w7.duration;

  if (
    hrvMean7d == null &&
    nightHrMean7d == null &&
    exerciseMinMean7d == null &&
    sleepMean7d == null &&
    workoutCount7d === 0
  ) {
    return null;
  }

  const dataDates = new Set<string>();
  for (const [d, v] of Object.entries(hrvMeans)) {
    if (d >= windowStart && d <= weekEnd && Number.isFinite(v)) dataDates.add(d);
  }
  for (const [d, v] of Object.entries(sleepTotals)) {
    if (d >= windowStart && d <= weekEnd && Number.isFinite(v)) dataDates.add(d);
  }
  for (const [d, v] of Object.entries(analysis.stepsByDate || {})) {
    if (d >= windowStart && d <= weekEnd && Number.isFinite(v)) dataDates.add(d);
  }
  for (const [d, v] of Object.entries(analysis.restingHrByDate || {})) {
    if (d >= windowStart && d <= weekEnd && Number.isFinite(v)) dataDates.add(d);
  }
  if (days) {
    for (const d of days) {
      if (d.date < windowStart || d.date > weekEnd) continue;
      if (
        d.nightHrMean != null ||
        d.exerciseMin > 0 ||
        d.spo2NightMean != null ||
        d.standHoursStood > 0 ||
        d.daylightMin > 0
      ) {
        dataDates.add(d.date);
      }
    }
  }
  if (sessions) {
    for (const s of sessions) {
      if (s.date >= windowStart && s.date <= weekEnd) dataDates.add(s.date);
    }
  }
  const daysWithData = dataDates.size;

  const priorCap = 90;
  const hrvPriorDates = Object.keys(hrvMeans)
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);
  const sleepPriorDates = Object.keys(sleepTotals)
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);
  const nightMap = watchSeriesToMap(days, (d) => d.nightHrMean);
  const exerciseMap = watchSeriesToMap(days, (d) =>
    d.exerciseMin > 0 ? d.exerciseMin : null
  );
  const spo2NightMap = watchSeriesToMap(days, (d) => d.spo2NightMean);
  const nightPriorDates = Object.keys(nightMap)
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);
  const exercisePriorDates = Object.keys(exerciseMap)
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);
  const spo2PriorDates = Object.keys(spo2NightMap)
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);
  const stepsPriorDates = Object.keys(analysis.stepsByDate || {})
    .filter((d) => d < windowStart)
    .sort()
    .slice(-priorCap);

  const personalPriors: RecoveryPersonalPriors = {
    hrv: priorValuesBeforeWindow(hrvMeans, windowStart, priorCap),
    sleep: priorValuesBeforeWindow(sleepTotals, windowStart, priorCap),
    nightHr: priorValuesBeforeWindow(nightMap, windowStart, priorCap),
    spo2Night: priorValuesBeforeWindow(spo2NightMap, windowStart, priorCap),
    exercise: priorValuesBeforeWindow(exerciseMap, windowStart, priorCap),
    steps: priorValuesBeforeWindow(analysis.stepsByDate || {}, windowStart, priorCap),
    hrvDates: hrvPriorDates,
    sleepDates: sleepPriorDates,
    nightHrDates: nightPriorDates,
    spo2NightDates: spo2PriorDates,
    exerciseDates: exercisePriorDates,
    stepsDates: stepsPriorDates,
  };

  const scored = scoreRecoveryLoad({
    hrvMean7d,
    sleepMean7d,
    nightHrMean7d,
    restingHrMean7d,
    spo2NightMean7d,
    exerciseMinMean7d,
    workoutDuration7d,
    stepsMean7d,
    daysWithData,
    personalPriors,
    weights,
    locale,
  });

  return {
    weekEnd,
    windowStart,
    hrvMean7d,
    nightHrMean7d,
    restingHrMean7d,
    exerciseMinMean7d,
    workoutCount7d,
    workoutDuration7d,
    sleepMean7d,
    stepsMean7d,
    standHoursMean7d,
    daylightMinMean7d,
    spo2NightMean7d,
    recoveryScore: scored.recoveryScore,
    loadScore: scored.loadScore,
    statusLabel: scored.statusLabel,
    statusTone: scored.statusTone,
    baselineRecoveryMedian: null,
    vsBaselineDelta: null,
    components: scored.components || [],
    daysWithData,
    usedPersonalBaseline: scored.usedPersonalBaseline,
  };
}

function toRecoveryWeekPoint(full: RecoveryWeekStats): RecoveryWeekPoint {
  return {
    weekEnd: full.weekEnd,
    recoveryScore: full.recoveryScore,
    loadScore: full.loadScore,
    hrvMean7d: full.hrvMean7d,
    nightHrMean7d: full.nightHrMean7d,
    exerciseMinMean7d: full.exerciseMinMean7d,
    sleepMean7d: full.sleepMean7d,
    workoutCount7d: full.workoutCount7d,
    statusLabel: full.statusLabel,
    statusTone: full.statusTone,
  };
}

/**
 * 近 7 日负荷 / 恢复仪表（最新一周，截止 dateRange.end）。
 * 默认用多周序列计算个人基线（≥4 周先验时写入 baseline 字段）。
 * 可传入已算好的 recoveryWeeks 避免重复计算。
 */
export function calcRecoveryWeek(
  analysis: RecoveryAnalysisPartial,
  options?: {
    recoveryWeeks?: RecoveryWeekPoint[] | null;
    skipBaseline?: boolean;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
  }
): RecoveryWeekStats | null {
  const end = analysis.dateRange?.end;
  if (!end) return null;
  const week = buildRecoveryWeekAt(
    analysis,
    end,
    options?.recoveryWeights,
    options?.locale
  );
  if (!week) return null;
  if (options?.skipBaseline) return week;
  const weeks =
    options?.recoveryWeeks !== undefined
      ? options.recoveryWeeks
      : calcRecoveryWeeks(analysis, {
          weeks: 12,
          recoveryWeights: options?.recoveryWeights,
          locale: options?.locale,
        });
  return attachRecoveryBaseline(week, weeks, options?.locale);
}

/**
 * 多周恢复/负荷序列：以 dateRange.end 为最后一周结束日，向前每 7 天一步。
 * 默认 12 周；只保留有足够维度的周；顺序最旧→最新。
 */
export function calcRecoveryWeeks(
  analysis: RecoveryAnalysisPartial,
  options?: {
    weeks?: number;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
  }
): RecoveryWeekPoint[] | null {
  const end = analysis.dateRange?.end;
  if (!end) return null;
  const n = Math.max(1, Math.min(52, Math.floor(options?.weeks ?? 12)));
  const start = analysis.dateRange?.start || '';
  const points: RecoveryWeekPoint[] = [];
  const weights = options?.recoveryWeights;
  const locale = options?.locale;

  for (let i = n - 1; i >= 0; i--) {
    const weekEnd = addDaysIso(end, -i * 7);
    if (start && weekEnd < start) continue;
    const full = buildRecoveryWeekAt(analysis, weekEnd, weights, locale);
    if (full) points.push(toRecoveryWeekPoint(full));
  }

  return points.length ? points : null;
}

/**
 * 仅用已有分析字段重算恢复/负荷（不重新 parse）。
 * 适合 UI 调整权重后即时刷新。
 */
export function recomputeRecovery(
  analysis: RecoveryAnalysisPartial,
  options?: {
    weeks?: number;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
  }
): {
  recoveryWeek: RecoveryWeekStats | null;
  recoveryWeeks: RecoveryWeekPoint[] | null;
} {
  const weeks = Math.max(1, Math.min(52, Math.floor(options?.weeks ?? 12)));
  const recoveryWeeks = calcRecoveryWeeks(analysis, {
    weeks,
    recoveryWeights: options?.recoveryWeights,
    locale: options?.locale,
  });
  const recoveryWeek = calcRecoveryWeek(analysis, {
    recoveryWeeks,
    recoveryWeights: options?.recoveryWeights,
    locale: options?.locale,
  });
  return { recoveryWeek, recoveryWeeks };
}

/** 完整分析入口 */
export function analyzeAll(
  data: HealthData,
  options?: {
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
  }
): FullAnalysis {
  const allDates: string[] = [
    ...data.cgm.map((x) => getDate(x.datetime)),
    ...data.bloodPressure.map((x) => x.date),
    ...data.weight.map((x) => x.date),
    ...(data.bodyFat || []).map((x) => x.date),
    ...Object.keys(data.hrv),
    ...Object.keys(data.restingHr),
    ...Object.keys(data.walkingHr),
    ...Object.keys(data.steps),
    ...Object.keys(data.sleep),
    ...Object.keys(data.watchDaily || {}),
    ...(data.workouts || []).map((w) => w.date),
    ...(data.ecg || []).map((e) => getDate(e.datetime)),
  ];
  allDates.sort();
  const start = allDates[0] || '';
  const end = allDates[allDates.length - 1] || '';

  const hrvByDate = summarizeHrvByDay(data.hrv, data.hrvOvernight);
  const stepsByDate = Object.fromEntries(
    Object.entries(data.steps).map(([d, v]) => [d, v.max])
  );
  const watchStats = calcWatchStats(data.watchDaily);
  const workoutStats = calcWorkoutStats(data.workouts, end || undefined);
  const sleepByDate = data.sleep;

  const partial = {
    dateRange: { start, end },
    hrvByDate,
    restingHrByDate: data.restingHr,
    stepsByDate,
    sleepByDate,
    watchStats,
    workoutStats,
  };

  const rw = options?.recoveryWeights;
  const locale = options?.locale;
  const recoveryWeeks = calcRecoveryWeeks(partial, {
    weeks: 12,
    recoveryWeights: rw,
    locale,
  });
  const recoveryWeek = calcRecoveryWeek(partial, {
    recoveryWeeks,
    recoveryWeights: rw,
    locale,
  });

  return {
    data,
    cgmStats: calcCgmStats(data.cgm, {
      unitReliable: data.dataQuality?.cgmUnit?.reliable !== false,
    }),
    bpStats: calcBloodPressureStats(data.bloodPressure),
    weightStats: calcWeightStats(data.weight),
    watchStats,
    workoutStats,
    ecgStats: calcEcgStats(data.ecg, data.workouts, {
      stepsByDate,
      watchDaily: data.watchDaily,
    }),
    recoveryWeek,
    recoveryWeeks,
    hrvByDate,
    restingHrByDate: data.restingHr,
    walkingHrByDate: data.walkingHr,
    stepsByDate,
    sleepByDate,
    dateRange: { start, end },
    generatedAt: new Date().toISOString(),
  };
}
