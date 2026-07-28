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

/** ECG 分类汇总 */
export function calcEcgStats(ecg: ERecordSummary[] | undefined): EcgStats | null {
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
    else if (/高心率|High Heart/i.test(c)) highHrCount += 1;
    else if (/不佳|Inconclusive|Poor/i.test(c)) inconclusiveCount += 1;
    else otherCount += 1;
  }
  const byClassification = [...counts.entries()]
    .map(([classification, count]) => ({ classification, count }))
    .sort((a, b) => b.count - a.count);
  return {
    count: sorted.length,
    byClassification,
    latest: sorted[sorted.length - 1],
    sinusCount,
    highHrCount,
    inconclusiveCount,
    otherCount,
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

/** 近 7 日负荷 / 恢复仪表 */
export function calcRecoveryWeek(
  analysis: {
    dateRange: { start: string; end: string };
    hrvByDate: Record<string, HrvDaySummary>;
    restingHrByDate: Record<string, number>;
    stepsByDate: Record<string, number>;
    sleepByDate: Record<string, { total: number }>;
    watchStats: WatchStats | null;
    workoutStats: WorkoutStats | null;
  }
): RecoveryWeekStats | null {
  const end = analysis.dateRange?.end;
  if (!end) return null;

  const hrvMeans: Record<string, number> = {};
  for (const [d, h] of Object.entries(analysis.hrvByDate || {})) {
    if (h && Number.isFinite(h.allMean)) hrvMeans[d] = h.allMean;
  }
  const sleepTotals: Record<string, number> = {};
  for (const [d, s] of Object.entries(analysis.sleepByDate || {})) {
    if (s && Number.isFinite(s.total)) sleepTotals[d] = s.total;
  }

  const hrvMean7d = meanMapLastN(hrvMeans, 7, end);
  const restingHrMean7d = meanMapLastN(analysis.restingHrByDate || {}, 7, end);
  const stepsMean7d = meanMapLastN(analysis.stepsByDate || {}, 7, end);
  const sleepMean7d = meanMapLastN(sleepTotals, 7, end);
  const ws = analysis.watchStats;
  const wos = analysis.workoutStats;

  const nightHrMean7d = ws?.nightHrMean7d ?? null;
  const exerciseMinMean7d = ws?.exerciseMinMean7d ?? null;
  const standHoursMean7d = ws?.standHoursMean7d ?? null;
  const daylightMinMean7d = ws?.daylightMinMean7d ?? null;
  const spo2NightMean7d = ws?.spo2NightMean7d ?? null;
  const workoutCount7d = wos?.count7d ?? 0;
  const workoutDuration7d = wos?.durationSum7d ?? 0;

  // 启发式评分（可缺省维度）
  let recoveryParts: number[] = [];
  if (hrvMean7d != null) {
    // 约 20–60 ms 映射到 30–90
    recoveryParts.push(Math.max(0, Math.min(100, ((hrvMean7d - 15) / 45) * 100)));
  }
  if (sleepMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, (sleepMean7d / 8) * 100)));
  }
  if (nightHrMean7d != null && restingHrMean7d != null) {
    const delta = nightHrMean7d - restingHrMean7d;
    recoveryParts.push(Math.max(0, Math.min(100, 80 - delta * 4)));
  } else if (nightHrMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, 100 - (nightHrMean7d - 50) * 1.5)));
  }
  if (spo2NightMean7d != null) {
    recoveryParts.push(Math.max(0, Math.min(100, (spo2NightMean7d - 90) * 10)));
  }

  let loadParts: number[] = [];
  if (exerciseMinMean7d != null) {
    loadParts.push(Math.max(0, Math.min(100, (exerciseMinMean7d / 45) * 100)));
  }
  if (workoutDuration7d > 0) {
    loadParts.push(Math.max(0, Math.min(100, (workoutDuration7d / 150) * 100)));
  }
  if (stepsMean7d != null) {
    loadParts.push(Math.max(0, Math.min(100, (stepsMean7d / 10000) * 100)));
  }

  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const recoveryScore = avg(recoveryParts);
  const loadScore = avg(loadParts);

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

  return {
    weekEnd: end,
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
    recoveryScore: recoveryScore != null ? Math.round(recoveryScore) : null,
    loadScore: loadScore != null ? Math.round(loadScore) : null,
    statusLabel,
    statusTone,
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

  return {
    data,
    cgmStats: calcCgmStats(data.cgm),
    bpStats: calcBloodPressureStats(data.bloodPressure),
    weightStats: calcWeightStats(data.weight),
    watchStats,
    workoutStats,
    ecgStats: calcEcgStats(data.ecg),
    recoveryWeek: calcRecoveryWeek(partial),
    hrvByDate,
    restingHrByDate: data.restingHr,
    walkingHrByDate: data.walkingHr,
    stepsByDate,
    sleepByDate,
    dateRange: { start, end },
    generatedAt: new Date().toISOString(),
  };
}
