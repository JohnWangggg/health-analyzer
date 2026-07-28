/**
 * 导出 JSON / CSV（纯文本，无副作用）
 */

import { FullAnalysis } from './types';
import { buildAnalysisSnapshot, AnalysisSnapshot } from './snapshot';
import { detectCrossSignals, CrossSignal } from './signals';

function csvEscape(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvEscape).join(','));
  }
  return lines.join('\n') + '\n';
}

export interface ExportBundle {
  /** 完整分析 JSON（含明细，可能较大） */
  analysisJson: string;
  /** 摘要快照 JSON */
  snapshotJson: string;
  /** 多个 CSV 文件 */
  csvFiles: { filename: string; content: string }[];
  signals: CrossSignal[];
  snapshot: AnalysisSnapshot;
}

/** 生成可下载的导出包内容 */
export function buildExportBundle(analysis: FullAnalysis): ExportBundle {
  const snapshot = buildAnalysisSnapshot(analysis);
  const signals = detectCrossSignals(analysis);
  const data = analysis.data;

  const csvFiles: { filename: string; content: string }[] = [];

  // 摘要 metrics
  csvFiles.push({
    filename: 'summary_metrics.csv',
    content: toCsv(
      ['metric', 'value'],
      [
        ['generatedAt', analysis.generatedAt],
        ['dateStart', analysis.dateRange.start],
        ['dateEnd', analysis.dateRange.end],
        ...Object.entries(snapshot.metrics).map(([k, v]) => [k, v == null ? '' : v]),
      ]
    ),
  });

  if (analysis.cgmStats) {
    const daily = analysis.cgmStats.daily;
    csvFiles.push({
      filename: 'cgm_daily.csv',
      content: toCsv(
        ['date', 'count', 'mean', 'min', 'max', 'cv', 'pctBelow39', 'pctAbove78', 'pctAbove100'],
        Object.keys(daily)
          .sort()
          .map((d) => {
            const x = daily[d];
            return [d, x.count, x.mean, x.min, x.max, x.cv, x.pctBelow39, x.pctAbove78, x.pctAbove100];
          })
      ),
    });
  }

  if (data.bloodPressure.length) {
    csvFiles.push({
      filename: 'blood_pressure.csv',
      content: toCsv(
        ['datetime', 'date', 'systolic', 'diastolic'],
        data.bloodPressure.map((r) => [r.datetime, r.date, r.systolic, r.diastolic])
      ),
    });
  }

  if (data.weight.length) {
    csvFiles.push({
      filename: 'weight.csv',
      content: toCsv(
        ['datetime', 'date', 'value_kg', 'body_fat_pct'],
        data.weight.map((w) => [w.datetime, w.date, w.value, w.bodyFat ?? ''])
      ),
    });
  }
  if (analysis.weightStats?.trendSeries?.length) {
    csvFiles.push({
      filename: 'weight_trend_daily.csv',
      content: toCsv(
        ['date', 'trend_kg', 'body_fat_pct', 'morning_kg', 'evening_kg', 'raw_count'],
        analysis.weightStats.daily.map((d) => [
          d.date,
          d.trend.value,
          d.trend.bodyFat ?? '',
          d.morning?.value ?? '',
          d.evening?.value ?? '',
          d.allCount,
        ])
      ),
    });
  }
  if (data.bodyFat?.length) {
    csvFiles.push({
      filename: 'body_fat.csv',
      content: toCsv(
        ['datetime', 'date', 'body_fat_pct', 'source'],
        data.bodyFat.map((f) => [f.datetime, f.date, f.value, f.source ?? ''])
      ),
    });
  }

  const hrvDates = Object.keys(analysis.hrvByDate || {}).sort();
  if (hrvDates.length) {
    csvFiles.push({
      filename: 'hrv_daily.csv',
      content: toCsv(
        ['date', 'allMean', 'overnightMean', 'min', 'max', 'count'],
        hrvDates.map((d) => {
          const h = analysis.hrvByDate[d];
          return [d, h.allMean, h.overnightMean, h.min, h.max, h.count];
        })
      ),
    });
  }

  const rest = analysis.restingHrByDate || data.restingHr || {};
  const walk = analysis.walkingHrByDate || data.walkingHr || {};
  const hrDates = Array.from(new Set([...Object.keys(rest), ...Object.keys(walk)])).sort();
  if (hrDates.length) {
    csvFiles.push({
      filename: 'heart_rate.csv',
      content: toCsv(
        ['date', 'resting', 'walking'],
        hrDates.map((d) => [d, rest[d] ?? '', walk[d] ?? ''])
      ),
    });
  }

  const steps = analysis.stepsByDate || {};
  const stepDates = Object.keys(steps).sort();
  if (stepDates.length) {
    csvFiles.push({
      filename: 'steps.csv',
      content: toCsv(
        ['date', 'steps'],
        stepDates.map((d) => [d, steps[d]])
      ),
    });
  }

  const sleep = analysis.sleepByDate || data.sleep || {};
  const sleepDates = Object.keys(sleep).sort();
  if (sleepDates.length) {
    csvFiles.push({
      filename: 'sleep.csv',
      content: toCsv(
        ['date', 'total_h', 'deep_h', 'rem_h', 'core_h', 'awake_h'],
        sleepDates.map((d) => {
          const s = sleep[d];
          return [d, s.total, s.deep, s.rem, s.core, s.awake];
        })
      ),
    });
  }

  if (analysis.watchStats?.days?.length) {
    csvFiles.push({
      filename: 'watch_daily.csv',
      content: toCsv(
        [
          'date',
          'active_kcal',
          'exercise_min',
          'stand_min',
          'daylight_min',
          'spo2_mean',
          'spo2_min',
          'rr_mean',
          'night_hr_mean',
          'vo2_max',
          'wrist_temp_mean',
          'breathing_disturbance',
        ],
        analysis.watchStats.days.map((d) => [
          d.date,
          d.activeKcal || '',
          d.exerciseMin || '',
          d.standMin || '',
          d.daylightMin || '',
          d.spo2Mean ?? '',
          d.spo2Min ?? '',
          d.rrMean ?? '',
          d.nightHrMean ?? '',
          d.vo2Max ?? '',
          d.wristTempMean ?? '',
          d.breathingDisturbance ?? '',
        ])
      ),
    });
  }

  if (signals.length) {
    csvFiles.push({
      filename: 'cross_signals.csv',
      content: toCsv(
        ['severity', 'date', 'title', 'detail', 'dimensions'],
        signals.map((s) => [s.severity, s.date || '', s.title, s.detail, s.dimensions.join('|')])
      ),
    });
  }

  // 导出 JSON：为控制体积，CGM 明细可很大——完整 analysis 仍导出，用户自知
  const analysisJson = JSON.stringify(
    {
      generatedAt: analysis.generatedAt,
      dateRange: analysis.dateRange,
      dataAvailability: data.dataAvailability,
      cgmStats: analysis.cgmStats,
      bpStats: analysis.bpStats
        ? {
            mean7d: analysis.bpStats.mean7d,
            mean14d: analysis.bpStats.mean14d,
            mean30d: analysis.bpStats.mean30d,
            lowest: analysis.bpStats.lowest,
            highest: analysis.bpStats.highest,
            records: analysis.bpStats.records,
          }
        : null,
      watchStats: analysis.watchStats
        ? {
            dayCount: analysis.watchStats.dayCount,
            spo2DayCount: analysis.watchStats.spo2DayCount,
            vo2DayCount: analysis.watchStats.vo2DayCount,
            activeKcalMean7d: analysis.watchStats.activeKcalMean7d,
            exerciseMinMean7d: analysis.watchStats.exerciseMinMean7d,
            spo2Mean7d: analysis.watchStats.spo2Mean7d,
            spo2Min7d: analysis.watchStats.spo2Min7d,
            rrMean7d: analysis.watchStats.rrMean7d,
            nightHrMean7d: analysis.watchStats.nightHrMean7d,
            vo2Latest: analysis.watchStats.vo2Latest,
            vo2Earliest: analysis.watchStats.vo2Earliest,
            vo2Delta: analysis.watchStats.vo2Delta,
            wristTempMean7d: analysis.watchStats.wristTempMean7d,
            days: analysis.watchStats.days,
          }
        : null,
      hrvByDate: analysis.hrvByDate,
      restingHrByDate: analysis.restingHrByDate,
      walkingHrByDate: analysis.walkingHrByDate,
      stepsByDate: analysis.stepsByDate,
      sleepByDate: analysis.sleepByDate,
      weight: data.weight,
      cgm: data.cgm,
      ecg: data.ecg,
      signals,
      snapshot,
    },
    null,
    2
  );

  return {
    analysisJson,
    snapshotJson: JSON.stringify(snapshot, null, 2),
    csvFiles,
    signals,
    snapshot,
  };
}

/** 将多 CSV 拼成单文件（兼容无 zip 场景） */
export function joinCsvBundle(csvFiles: { filename: string; content: string }[]): string {
  return csvFiles
    .map((f) => `### ${f.filename}\n${f.content}`)
    .join('\n');
}
