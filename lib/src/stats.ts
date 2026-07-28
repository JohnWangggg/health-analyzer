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
} from './types';
import { getDate, getHour, parseAppleDate } from './parser';

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
    dayCount: days.length,
    spo2DayCount: days.filter((d) => d.spo2Mean != null).length,
    spo2NightDayCount: days.filter((d) => d.spo2NightMean != null).length,
    vo2DayCount: vo2Series.length,
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
  ];
  allDates.sort();
  const start = allDates[0] || '';
  const end = allDates[allDates.length - 1] || '';

  return {
    data,
    cgmStats: calcCgmStats(data.cgm),
    bpStats: calcBloodPressureStats(data.bloodPressure),
    weightStats: calcWeightStats(data.weight),
    watchStats: calcWatchStats(data.watchDaily),
    // 近 7/30 日相对整体数据结束日，避免「很久没练」被误算成仍有训练
    workoutStats: calcWorkoutStats(data.workouts, end || undefined),
    hrvByDate: summarizeHrvByDay(data.hrv, data.hrvOvernight),
    restingHrByDate: data.restingHr,
    walkingHrByDate: data.walkingHr,
    stepsByDate: Object.fromEntries(
      Object.entries(data.steps).map(([d, v]) => [d, v.max])
    ),
    sleepByDate: data.sleep,
    dateRange: { start, end },
    generatedAt: new Date().toISOString(),
  };
}
