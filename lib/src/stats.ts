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
} from './types';
import { getDate, getHour, parseAppleDate, workoutTypeLabel } from './parser';

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

function cgmSegment(
  points: { datetime: string; value: number }[]
): CgmSegmentStats | null {
  if (!points.length) return null;
  const sorted = [...points].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const values = sorted.map((p) => p.value);
  const total = values.length;
  const overall = calcStats(values);
  return {
    ...overall,
    timeRange: `${sorted[0].datetime} 至 ${sorted[sorted.length - 1].datetime}`,
    pctBelow39: (values.filter((v) => v < 3.9).length / total) * 100,
    pctBelow30: (values.filter((v) => v < 3.0).length / total) * 100,
    pctInRange: (values.filter((v) => v >= 3.9 && v <= 10.0).length / total) * 100,
    pctAbove78: (values.filter((v) => v > 7.8).length / total) * 100,
    pctAbove100: (values.filter((v) => v > 10.0).length / total) * 100,
  };
}

/** CGM 完整统计：总体 + 首日 + 稳定期 */
export function calcCgmStats(cgm: { datetime: string; value: number }[]): CgmStats | null {
  if (cgm.length === 0) return null;

  const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const overall = cgmSegment(sorted)!;
  const firstDayDate = getDate(sorted[0].datetime);
  const firstDayPoints = sorted.filter((p) => getDate(p.datetime) === firstDayDate);
  const stablePoints = sorted.filter((p) => getDate(p.datetime) !== firstDayDate);
  const firstDay = cgmSegment(firstDayPoints);
  const stable = stablePoints.length ? cgmSegment(stablePoints) : null;

  // 分日统计
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
    daily[date] = {
      ...s,
      pctBelow39: (vals.filter((v) => v < 3.9).length / vals.length) * 100,
      pctAbove78: (vals.filter((v) => v > 7.8).length / vals.length) * 100,
      pctAbove100: (vals.filter((v) => v > 10.0).length / vals.length) * 100,
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
  };
}

function meanBp(records: BloodPressureRecord[]): BpPeriodMean | null {
  if (!records.length) return null;
  const meanSys = records.reduce((a, b) => a + b.systolic, 0) / records.length;
  const meanDia = records.reduce((a, b) => a + b.diastolic, 0) / records.length;
  const lowCount = records.filter((r) => r.systolic < 90 || r.diastolic < 60).length;
  return {
    systolic: meanSys,
    diastolic: meanDia,
    count: records.length,
    lowCount,
  };
}

/** 血压：整体时段 + 晨间/晚间分层 */
export function calcBloodPressureStats(
  records: BloodPressureRecord[]
): BloodPressureStats | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));

  function inLastDays(days: number): BloodPressureRecord[] {
    const latest = sorted[sorted.length - 1].date;
    const latestDate = new Date(`${latest}T00:00:00Z`);
    latestDate.setUTCDate(latestDate.getUTCDate() - days);
    const startStr = latestDate.toISOString().slice(0, 10);
    return sorted.filter((r) => r.date >= startStr && r.date <= latest);
  }

  function periodStats(days: number, pred?: (r: BloodPressureRecord) => boolean): BpPeriodMean | null {
    let filtered = inLastDays(days);
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

function meanLastN(values: (number | null | undefined)[], n: number): number | null {
  const vals = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  const slice = vals.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** 近 n 个非空值中的最小值（用于血氧日最低） */
function minLastN(values: (number | null | undefined)[], n: number): number | null {
  const vals = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  return Math.min(...vals.slice(-n));
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

/** Watch 活动 / 血氧 / 呼吸 / VO2 / 腕温 日汇总 */
export function calcWatchStats(watchDaily: Record<string, WatchDaySummary> | undefined): WatchStats | null {
  if (!watchDaily || !Object.keys(watchDaily).length) return null;
  const days: WatchDayView[] = Object.keys(watchDaily)
    .sort()
    .map((d) => toWatchView(d, watchDaily[d]));

  const vo2Series = days.filter((d) => d.vo2Max != null);
  const vo2Latest = vo2Series.length ? vo2Series[vo2Series.length - 1].vo2Max : null;
  const vo2Earliest = vo2Series.length ? vo2Series[0].vo2Max : null;

  const bdSeries = days.filter((d) => d.breathingDisturbance != null);
  const breathingDisturbanceLatest = bdSeries.length
    ? bdSeries[bdSeries.length - 1].breathingDisturbance
    : null;

  return {
    days,
    activeKcalMean7d: meanLastN(days.map((d) => d.activeKcal), 7),
    exerciseMinMean7d: meanLastN(days.map((d) => d.exerciseMin), 7),
    spo2Mean7d: meanLastN(days.map((d) => d.spo2Mean), 7),
    // 近 7 个有血氧日的「日最低」中的最小值（不是日最低的均值）
    spo2Min7d: minLastN(days.map((d) => d.spo2Min), 7),
    spo2NightMean7d: meanLastN(days.map((d) => d.spo2NightMean), 7),
    spo2NightMin7d: minLastN(days.map((d) => d.spo2NightMin), 7),
    spo2DayMean7d: meanLastN(days.map((d) => d.spo2DayMean), 7),
    spo2DayMin7d: minLastN(days.map((d) => d.spo2DayMin), 7),
    rrMean7d: meanLastN(days.map((d) => d.rrMean), 7),
    nightHrMean7d: meanLastN(days.map((d) => d.nightHrMean), 7),
    vo2Latest,
    vo2Earliest,
    vo2Delta:
      vo2Latest != null && vo2Earliest != null ? vo2Latest - vo2Earliest : null,
    wristTempMean7d: meanLastN(days.map((d) => d.wristTempMean), 7),
    breathingDisturbanceMean7d: meanLastN(
      days.map((d) => d.breathingDisturbance),
      7
    ),
    breathingDisturbanceLatest,
    daylightMinMean7d: meanLastN(
      days.map((d) => (d.daylightMin > 0 ? d.daylightMin : null)),
      7
    ),
    standHoursMean7d: meanLastN(
      days.map((d) => (d.standHoursStood > 0 || d.standHoursIdle > 0 ? d.standHoursStood : null)),
      7
    ),
    dayCount: days.length,
    spo2DayCount: days.filter((d) => d.spo2Mean != null).length,
    spo2NightDayCount: days.filter((d) => d.spo2NightMean != null).length,
    vo2DayCount: vo2Series.length,
    breathingDisturbanceDayCount: bdSeries.length,
  };
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return 0;
  return Math.round((tb - ta) / (24 * 3600 * 1000));
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

function meanMapLastN(map: Record<string, number>, n: number, endDate: string): number | null {
  const keys = Object.keys(map)
    .filter((d) => d <= endDate)
    .sort();
  if (!keys.length) return null;
  const recent = keys.slice(-n).map((d) => map[d]).filter(Number.isFinite);
  if (!recent.length) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function addDaysIso(date: string, deltaDays: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(t)) return date;
  const d = new Date(t);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

/** 以 endDate 为截止，取 watch 日序列最后 n 个有效值的均值（与 meanLastN 语义一致） */
function meanWatchSeriesLastN(
  days: WatchDayView[] | undefined,
  pick: (d: WatchDayView) => number | null | undefined,
  n: number,
  endDate: string
): number | null {
  if (!days?.length) return null;
  const vals = days
    .filter((d) => d.date <= endDate)
    .map((d) => pick(d))
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!vals.length) return null;
  const slice = vals.slice(-n);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function workoutWindowAt(
  sessions: WorkoutSession[] | undefined,
  endDate: string,
  windowDays: number
): { count: number; duration: number } {
  if (!sessions?.length) return { count: 0, duration: 0 };
  const list = sessions.filter(
    (s) => s.date <= endDate && daysBetween(s.date, endDate) <= windowDays - 1
  );
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

/**
 * 用多周历史给最新一周贴上个人恢复基线（轻量、非诊断）。
 * 需要此前 ≥4 周有效 recoveryScore；|delta|≥8 时在 statusLabel 中提示。
 */
export function attachRecoveryBaseline(
  week: RecoveryWeekStats,
  recoveryWeeks: RecoveryWeekPoint[] | null | undefined
): RecoveryWeekStats {
  const priorScores = (recoveryWeeks || [])
    .filter((p) => p.weekEnd !== week.weekEnd)
    .map((p) => p.recoveryScore)
    .filter((s): s is number => s != null && Number.isFinite(s));

  let baselineRecoveryMedian: number | null = null;
  let vsBaselineDelta: number | null = null;
  let statusLabel = week.statusLabel;

  if (week.recoveryScore != null && priorScores.length >= 4) {
    const med = medianNumber(priorScores);
    if (med != null) {
      baselineRecoveryMedian = Math.round(med);
      vsBaselineDelta = week.recoveryScore - baselineRecoveryMedian;
      if (Math.abs(vsBaselineDelta) >= 8) {
        const dir = vsBaselineDelta > 0 ? '高于' : '低于';
        statusLabel = `${statusLabel}（${dir}近几周中位约 ${Math.abs(vsBaselineDelta)} 分）`;
      }
    }
  }

  return {
    ...week,
    baselineRecoveryMedian,
    vsBaselineDelta,
    statusLabel,
  };
}

/** 恢复/负荷启发式评分（共享，避免单周与多周漂移） */
function scoreRecoveryLoad(input: {
  hrvMean7d: number | null;
  sleepMean7d: number | null;
  nightHrMean7d: number | null;
  restingHrMean7d: number | null;
  spo2NightMean7d: number | null;
  exerciseMinMean7d: number | null;
  workoutDuration7d: number;
  stepsMean7d: number | null;
  /** 可选：此前多周恢复分中位（由 attachRecoveryBaseline 统一写入，此处仅预留） */
  baselineRecoveryMedian?: number | null;
}): {
  recoveryScore: number | null;
  loadScore: number | null;
  statusLabel: string;
  statusTone: RecoveryWeekStats['statusTone'];
} {
  const recoveryParts: number[] = [];
  if (input.hrvMean7d != null) {
    // 约 20–60 ms 映射到 30–90
    recoveryParts.push(Math.max(0, Math.min(100, ((input.hrvMean7d - 15) / 45) * 100)));
  }
  if (input.sleepMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, (input.sleepMean7d / 8) * 100)));
  }
  if (input.nightHrMean7d != null && input.restingHrMean7d != null) {
    const delta = input.nightHrMean7d - input.restingHrMean7d;
    recoveryParts.push(Math.max(0, Math.min(100, 80 - delta * 4)));
  } else if (input.nightHrMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, 100 - (input.nightHrMean7d - 50) * 1.5)));
  }
  if (input.spo2NightMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, (input.spo2NightMean7d - 90) * 10)));
  }

  const loadParts: number[] = [];
  if (input.exerciseMinMean7d != null) {
    loadParts.push(Math.max(0, Math.min(100, (input.exerciseMinMean7d / 45) * 100)));
  }
  if (input.workoutDuration7d > 0) {
    loadParts.push(Math.max(0, Math.min(100, (input.workoutDuration7d / 150) * 100)));
  }
  if (input.stepsMean7d != null) {
    loadParts.push(Math.max(0, Math.min(100, (input.stepsMean7d / 10000) * 100)));
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const recoveryScoreRaw = avg(recoveryParts);
  const loadScoreRaw = avg(loadParts);
  const recoveryScore = recoveryScoreRaw != null ? Math.round(recoveryScoreRaw) : null;
  const loadScore = loadScoreRaw != null ? Math.round(loadScoreRaw) : null;

  let statusLabel = '数据不足，暂不评估';
  let statusTone: RecoveryWeekStats['statusTone'] = 'neutral';
  if (recoveryScore != null || loadScore != null) {
    const r = recoveryScore ?? 50;
    const l = loadScore ?? 40;
    if (r >= 65 && l <= 70) {
      statusLabel = '恢复尚可，可维持或轻量推进';
      statusTone = 'positive';
    } else if (r < 45 && l >= 55) {
      statusLabel = '负荷偏高且恢复偏紧，建议轻松日';
      statusTone = 'watch';
    } else if (r < 40) {
      statusLabel = '恢复指标偏弱，优先睡眠与减负';
      statusTone = 'watch';
    } else if (l < 25 && r >= 50) {
      statusLabel = '恢复尚可但活动偏低，可适量增加走动';
      statusTone = 'neutral';
    } else {
      statusLabel = '负荷与恢复大致平衡';
      statusTone = 'neutral';
    }
  }

  // 可选：评分时若已有基线中位，|delta|≥8 则附加说明（主路径仍由 attachRecoveryBaseline 负责）
  const base = input.baselineRecoveryMedian;
  if (recoveryScore != null && base != null && Number.isFinite(base)) {
    const delta = recoveryScore - base;
    if (Math.abs(delta) >= 8) {
      const dir = delta > 0 ? '高于' : '低于';
      statusLabel = `${statusLabel}（${dir}近几周中位约 ${Math.abs(delta)} 分）`;
    }
  }

  return { recoveryScore, loadScore, statusLabel, statusTone };
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

/** 以指定 weekEnd 计算近 7 日负荷/恢复（内部共用） */
function buildRecoveryWeekAt(
  analysis: RecoveryAnalysisPartial,
  weekEnd: string
): RecoveryWeekStats | null {
  if (!weekEnd) return null;

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

  const hrvMean7d = meanMapLastN(hrvMeans, 7, weekEnd);
  const restingHrMean7d = meanMapLastN(analysis.restingHrByDate || {}, 7, weekEnd);
  const stepsMean7d = meanMapLastN(analysis.stepsByDate || {}, 7, weekEnd);
  const sleepMean7d = meanMapLastN(sleepTotals, 7, weekEnd);

  const nightHrMean7d = meanWatchSeriesLastN(days, (d) => d.nightHrMean, 7, weekEnd);
  const exerciseMinMean7d = meanWatchSeriesLastN(days, (d) => d.exerciseMin, 7, weekEnd);
  const standHoursMean7d = meanWatchSeriesLastN(
    days,
    (d) => (d.standHoursStood > 0 || d.standHoursIdle > 0 ? d.standHoursStood : null),
    7,
    weekEnd
  );
  const daylightMinMean7d = meanWatchSeriesLastN(
    days,
    (d) => (d.daylightMin > 0 ? d.daylightMin : null),
    7,
    weekEnd
  );
  const spo2NightMean7d = meanWatchSeriesLastN(days, (d) => d.spo2NightMean, 7, weekEnd);

  const w7 = workoutWindowAt(sessions, weekEnd, 7);
  const workoutCount7d = w7.count;
  const workoutDuration7d = w7.duration;

  // 至少有一个维度才返回
  if (
    hrvMean7d == null &&
    nightHrMean7d == null &&
    exerciseMinMean7d == null &&
    sleepMean7d == null &&
    workoutCount7d === 0
  ) {
    return null;
  }

  const scored = scoreRecoveryLoad({
    hrvMean7d,
    sleepMean7d,
    nightHrMean7d,
    restingHrMean7d,
    spo2NightMean7d,
    exerciseMinMean7d,
    workoutDuration7d,
    stepsMean7d,
  });

  return {
    weekEnd,
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
  options?: { recoveryWeeks?: RecoveryWeekPoint[] | null; skipBaseline?: boolean }
): RecoveryWeekStats | null {
  const end = analysis.dateRange?.end;
  if (!end) return null;
  const week = buildRecoveryWeekAt(analysis, end);
  if (!week) return null;
  if (options?.skipBaseline) return week;
  const weeks =
    options?.recoveryWeeks !== undefined
      ? options.recoveryWeeks
      : calcRecoveryWeeks(analysis, { weeks: 12 });
  return attachRecoveryBaseline(week, weeks);
}

/**
 * 多周恢复/负荷序列：以 dateRange.end 为最后一周结束日，向前每 7 天一步。
 * 默认 12 周；只保留有足够维度的周；顺序最旧→最新。
 */
export function calcRecoveryWeeks(
  analysis: RecoveryAnalysisPartial,
  options?: { weeks?: number }
): RecoveryWeekPoint[] | null {
  const end = analysis.dateRange?.end;
  if (!end) return null;
  const n = Math.max(1, Math.min(52, Math.floor(options?.weeks ?? 12)));
  const start = analysis.dateRange?.start || '';
  const points: RecoveryWeekPoint[] = [];

  for (let i = n - 1; i >= 0; i--) {
    const weekEnd = addDaysIso(end, -i * 7);
    if (start && weekEnd < start) continue;
    const full = buildRecoveryWeekAt(analysis, weekEnd);
    if (full) points.push(toRecoveryWeekPoint(full));
  }

  return points.length ? points : null;
}

/** 完整分析入口 */
export function analyzeAll(data: HealthData): FullAnalysis {
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

  const recoveryWeeks = calcRecoveryWeeks(partial, { weeks: 12 });
  const recoveryWeek = calcRecoveryWeek(partial, { recoveryWeeks });

  return {
    data,
    cgmStats: calcCgmStats(data.cgm),
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
