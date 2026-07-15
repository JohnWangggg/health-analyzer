/**
 * 统计与指标计算
 */

import {
  HealthData,
  Stats,
  CgmStats,
  BloodPressureStats,
  HrvDaySummary,
  SleepDaySummary,
  FullAnalysis,
} from './types';
import { getDate, parseAppleDate } from './parser';

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

/** CGM 完整统计 */
export function calcCgmStats(cgm: { datetime: string; value: number }[]): CgmStats | null {
  if (cgm.length === 0) return null;

  const sorted = [...cgm].sort((a, b) => a.datetime.localeCompare(b.datetime));
  const values = sorted.map((p) => p.value);
  const total = values.length;

  const overall = calcStats(values);
  const overallObj = {
    ...overall,
    timeRange: `${sorted[0].datetime} 至 ${sorted[sorted.length - 1].datetime}`,
    pctBelow39: (values.filter((v) => v < 3.9).length / total) * 100,
    pctBelow30: (values.filter((v) => v < 3.0).length / total) * 100,
    pctInRange: (values.filter((v) => v >= 3.9 && v <= 10.0).length / total) * 100,
    pctAbove78: (values.filter((v) => v > 7.8).length / total) * 100,
    pctAbove100: (values.filter((v) => v > 10.0).length / total) * 100,
  };

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

  return { overall: overallObj, daily, maxRises };
}

/** 血压统计 */
export function calcBloodPressureStats(
  records: { datetime: string; date: string; systolic: number; diastolic: number }[]
): BloodPressureStats | null {
  if (records.length === 0) return null;
  const sorted = [...records].sort((a, b) => a.datetime.localeCompare(b.datetime));

  function periodStats(days: number) {
    if (records.length === 0) return null;
    const latest = sorted[sorted.length - 1].date;
    const latestDate = new Date(`${latest}T00:00:00Z`);
    latestDate.setUTCDate(latestDate.getUTCDate() - days);
    const startStr = latestDate.toISOString().slice(0, 10);

    const filtered = sorted.filter((r) => r.date >= startStr && r.date <= latest);
    if (filtered.length === 0) return null;
    const meanSys = filtered.reduce((a, b) => a + b.systolic, 0) / filtered.length;
    const meanDia = filtered.reduce((a, b) => a + b.diastolic, 0) / filtered.length;
    const lowCount = filtered.filter((r) => r.systolic < 90 || r.diastolic < 60).length;
    return {
      systolic: meanSys,
      diastolic: meanDia,
      count: filtered.length,
      lowCount,
    };
  }

  return {
    records: sorted,
    mean7d: periodStats(7),
    mean14d: periodStats(14),
    mean30d: periodStats(30),
    lowest: sorted.reduce((min, r) => (r.systolic < min.systolic ? r : min), sorted[0]),
    highest: sorted.reduce((max, r) => (r.systolic > max.systolic ? r : max), sorted[0]),
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
          : 0,
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
    };
  }
  return result;
}

/** 完整分析入口 */
export function analyzeAll(data: HealthData): FullAnalysis {
  const allDates: string[] = [
    ...data.cgm.map(x => getDate(x.datetime)),
    ...data.bloodPressure.map(x => x.date),
    ...data.weight.map(x => x.date),
    ...Object.keys(data.hrv), ...Object.keys(data.restingHr),
    ...Object.keys(data.walkingHr), ...Object.keys(data.steps),
    ...Object.keys(data.sleep),
  ];
  allDates.sort();
  const start = allDates[0] || '';
  const end = allDates[allDates.length - 1] || '';

  return {
    data,
    cgmStats: calcCgmStats(data.cgm),
    bpStats: calcBloodPressureStats(data.bloodPressure),
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
