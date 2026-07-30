/**
 * 导出 JSON / CSV / 周报 Markdown（纯文本，无副作用）
 */

import { FullAnalysis } from './types';
import { buildAnalysisSnapshot, AnalysisSnapshot } from './snapshot';
import { detectCrossSignals, CrossSignal } from './signals';

export { generateWeeklyReportMarkdown } from './weekly-report';
export type { WeeklyReportOptions } from './weekly-report';
export { generateVisitSummaryMarkdown } from './visit-summary';
export {
  CGM_REPORT_DAYS,
  CGM_MIN_COVERAGE_PCT,
  percentile,
  buildCgm14DayReport,
  buildAgpSvg,
  assessHomeBpProtocol,
  ensureSignalEvidence,
  generateClinicalReviewMarkdown,
  generateClinicalReviewHtml,
} from './clinical-report';
export type {
  Cgm14DayReport,
  CgmHourlyBin,
  HomeBpAssessment,
  HomeBpDayDetail,
  HomeBpMode,
  ClinicalReportOptions,
} from './clinical-report';
export {
  FHIR_EXPORT_PROFILE,
  FHIR_R4,
  FHIR_OBS_TYPE_TO_DOMAIN,
  FHIR_DEVICE_CLASSES,
  FHIR_EXPORT_TIERS,
  FHIR_EXCHANGE_PURPOSES,
  FHIR_EXCHANGE_GATE_ENGINE,
  toIsoDateTime,
  newBundleUuid,
  dayEffectivePeriod,
  isValidFhirDateTime,
  isValidR4DateTime,
  shortImportBatchIdForProv,
  buildLocalPatientResource,
  buildLocalDeviceResource,
  deviceLogicalId,
  deviceDisplayName,
  resolveObservationDevice,
  resolveObservationDeviceClass,
  classifySourceNameToDevice,
  stripPrivateFhirExtensions,
  normalizeFhirExportTier,
  normalizeFhirExchangePurpose,
  validateFhirR4ExchangeGate,
  buildFhirExportBundle,
  validateFhirExportBundle,
} from './fhir-export';
export type {
  FhirDeviceClass,
  FhirDeviceResolution,
  FhirExportTier,
  FhirExchangePurpose,
  FhirExportOptions,
  FhirExportResult,
  FhirExportValidation,
  FhirExchangeValidation,
} from './fhir-export';

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
          'stand_hours_stood',
          'stand_hours_idle',
          'spo2_mean',
          'spo2_min',
          'spo2_night_mean',
          'spo2_night_min',
          'spo2_day_mean',
          'spo2_day_min',
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
          d.standHoursStood || '',
          d.standHoursIdle || '',
          d.spo2Mean ?? '',
          d.spo2Min ?? '',
          d.spo2NightMean ?? '',
          d.spo2NightMin ?? '',
          d.spo2DayMean ?? '',
          d.spo2DayMin ?? '',
          d.rrMean ?? '',
          d.nightHrMean ?? '',
          d.vo2Max ?? '',
          d.wristTempMean ?? '',
          d.breathingDisturbance ?? '',
        ])
      ),
    });
  }

  if (analysis.workoutStats?.sessions?.length) {
    csvFiles.push({
      filename: 'workouts.csv',
      content: toCsv(
        [
          'start',
          'end',
          'date',
          'activity',
          'activity_label',
          'duration_min',
          'active_kcal',
          'distance_km',
          'hr_avg',
          'hr_min',
          'hr_max',
          'avg_mets',
          'indoor',
          'source',
        ],
        analysis.workoutStats.sessions.map((s) => [
          s.startDate,
          s.endDate ?? '',
          s.date,
          s.activityType,
          s.activityLabel || '',
          s.durationMin,
          s.activeKcal ?? '',
          s.distanceKm ?? '',
          s.hrAvg ?? '',
          s.hrMin ?? '',
          s.hrMax ?? '',
          s.avgMets ?? '',
          s.indoor == null ? '' : s.indoor ? 1 : 0,
          s.source ?? '',
        ])
      ),
    });
  }

  if (analysis.recoveryWeeks && analysis.recoveryWeeks.length) {
    csvFiles.push({
      filename: 'recovery_weeks.csv',
      content: toCsv(
        [
          'week_end',
          'recovery_score',
          'load_score',
          'hrv_mean_7d',
          'night_hr_mean_7d',
          'exercise_min_mean_7d',
          'sleep_mean_7d',
          'workout_count_7d',
          'status_label',
          'status_tone',
        ],
        analysis.recoveryWeeks.map((p) => [
          p.weekEnd,
          p.recoveryScore,
          p.loadScore,
          p.hrvMean7d,
          p.nightHrMean7d,
          p.exerciseMinMean7d,
          p.sleepMean7d,
          p.workoutCount7d,
          p.statusLabel ?? '',
          p.statusTone ?? '',
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
            spo2NightDayCount: analysis.watchStats.spo2NightDayCount,
            vo2DayCount: analysis.watchStats.vo2DayCount,
            breathingDisturbanceDayCount: analysis.watchStats.breathingDisturbanceDayCount,
            activeKcalMean7d: analysis.watchStats.activeKcalMean7d,
            exerciseMinMean7d: analysis.watchStats.exerciseMinMean7d,
            spo2Mean7d: analysis.watchStats.spo2Mean7d,
            spo2Min7d: analysis.watchStats.spo2Min7d,
            spo2NightMean7d: analysis.watchStats.spo2NightMean7d,
            spo2NightMin7d: analysis.watchStats.spo2NightMin7d,
            spo2DayMean7d: analysis.watchStats.spo2DayMean7d,
            spo2DayMin7d: analysis.watchStats.spo2DayMin7d,
            rrMean7d: analysis.watchStats.rrMean7d,
            nightHrMean7d: analysis.watchStats.nightHrMean7d,
            vo2Latest: analysis.watchStats.vo2Latest,
            vo2Earliest: analysis.watchStats.vo2Earliest,
            vo2Delta: analysis.watchStats.vo2Delta,
            wristTempMean7d: analysis.watchStats.wristTempMean7d,
            breathingDisturbanceMean7d: analysis.watchStats.breathingDisturbanceMean7d,
            breathingDisturbanceLatest: analysis.watchStats.breathingDisturbanceLatest,
            days: analysis.watchStats.days,
          }
        : null,
      workoutStats: analysis.workoutStats
        ? {
            count: analysis.workoutStats.count,
            count30d: analysis.workoutStats.count30d,
            count7d: analysis.workoutStats.count7d,
            durationSum30d: analysis.workoutStats.durationSum30d,
            durationSum7d: analysis.workoutStats.durationSum7d,
            activeKcalSum30d: analysis.workoutStats.activeKcalSum30d,
            hrAvgMean30d: analysis.workoutStats.hrAvgMean30d,
            byType: analysis.workoutStats.byType,
            lastSession: analysis.workoutStats.lastSession,
            sessions: analysis.workoutStats.sessions,
          }
        : null,
      recoveryWeek: analysis.recoveryWeek,
      recoveryWeeks: analysis.recoveryWeeks,
      ecgStats: analysis.ecgStats,
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
