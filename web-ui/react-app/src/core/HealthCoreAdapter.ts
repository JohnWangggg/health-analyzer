/**
 * HealthCoreAdapter — thin typed boundary over @health-analyzer/lib.
 * UI must not reimplement parse/stats; all analysis goes through this adapter.
 */
import {
  parseHealthXml,
  analyzeAll,
  type FullAnalysis,
  type HealthData,
  type AppLocale,
} from '@health-analyzer/lib';

export type AnalyzeOptions = {
  locale?: AppLocale | string | null;
};

/** Stable summary fields used for parity tests and shell KPI cards. */
export type AnalysisSummary = {
  dateRange: { start: string; end: string };
  generatedAt: string;
  domainPresence: {
    cgm: boolean;
    bloodPressure: boolean;
    weight: boolean;
    hrv: boolean;
    restingHr: boolean;
    steps: boolean;
    sleep: boolean;
    watch: boolean;
    workouts: boolean;
    ecg: boolean;
  };
  counts: {
    cgm: number;
    bloodPressure: number;
    weight: number;
    stepsDays: number;
    sleepDays: number;
    hrvDays: number;
  };
  kpis: {
    cgmMean: number | null;
    weightLatest: number | null;
    stepsLatest: number | null;
    restingHrLatest: number | null;
    recoveryScore: number | null;
  };
};

export type ParseAnalyzeResult = {
  data: HealthData;
  analysis: FullAnalysis;
  summary: AnalysisSummary;
};

function numOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Extract comparable summary from a FullAnalysis (shared by adapter + direct lib path). */
export function summarizeAnalysis(analysis: FullAnalysis): AnalysisSummary {
  const data = analysis.data;
  const cgmMean = numOrNull(analysis.cgmStats?.overall?.mean);
  const weightLatest =
    numOrNull(analysis.weightStats?.latestTrend?.weight) ??
    (data.weight.length
      ? numOrNull(data.weight[data.weight.length - 1]!.value)
      : null);
  const stepDates = Object.keys(analysis.stepsByDate || {}).sort();
  const stepsLatest = stepDates.length
    ? numOrNull(analysis.stepsByDate[stepDates[stepDates.length - 1]!])
    : null;
  const rhrDates = Object.keys(analysis.restingHrByDate || {}).sort();
  const restingHrLatest = rhrDates.length
    ? numOrNull(analysis.restingHrByDate[rhrDates[rhrDates.length - 1]!])
    : null;
  const recoveryScore = numOrNull(analysis.recoveryWeek?.recoveryScore);

  return {
    dateRange: { ...analysis.dateRange },
    generatedAt: analysis.generatedAt,
    domainPresence: {
      cgm: (data.cgm?.length ?? 0) > 0 || !!analysis.cgmStats,
      bloodPressure: (data.bloodPressure?.length ?? 0) > 0 || !!analysis.bpStats,
      weight: (data.weight?.length ?? 0) > 0 || !!analysis.weightStats,
      hrv: Object.keys(data.hrv || {}).length > 0,
      restingHr: Object.keys(data.restingHr || {}).length > 0,
      steps: Object.keys(data.steps || {}).length > 0,
      sleep: Object.keys(data.sleep || {}).length > 0,
      watch: Object.keys(data.watchDaily || {}).length > 0 || !!analysis.watchStats,
      workouts: (data.workouts?.length ?? 0) > 0 || !!analysis.workoutStats,
      ecg: (data.ecg?.length ?? 0) > 0 || !!analysis.ecgStats,
    },
    counts: {
      cgm: data.cgm?.length ?? 0,
      bloodPressure: data.bloodPressure?.length ?? 0,
      weight: data.weight?.length ?? 0,
      stepsDays: Object.keys(data.steps || {}).length,
      sleepDays: Object.keys(data.sleep || {}).length,
      hrvDays: Object.keys(data.hrv || {}).length,
    },
    kpis: {
      cgmMean,
      weightLatest: numOrNull(weightLatest),
      stepsLatest: numOrNull(stepsLatest),
      restingHrLatest: numOrNull(restingHrLatest),
      recoveryScore,
    },
  };
}

/**
 * Parse Apple Health XML and run full analysis via the existing lib kernel.
 */
export function analyzeHealthXml(
  xml: string,
  options?: AnalyzeOptions,
): ParseAnalyzeResult {
  const data = parseHealthXml(xml);
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}

/**
 * Direct lib path used only by parity tests to prove the adapter is not a reimplementation.
 */
export function analyzeHealthXmlViaLibDirect(
  xml: string,
  options?: AnalyzeOptions,
): ParseAnalyzeResult {
  const data = parseHealthXml(xml);
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}

export class HealthCoreAdapter {
  analyzeXml(xml: string, options?: AnalyzeOptions): ParseAnalyzeResult {
    return analyzeHealthXml(xml, options);
  }
}

export const healthCore = new HealthCoreAdapter();
