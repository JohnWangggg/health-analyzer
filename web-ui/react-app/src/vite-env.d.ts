/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?worker' {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}


/**
 * Typed surface for the adapter. Vite resolves `@health-analyzer/lib` to
 * `lib/src/index.ts` at bundle time; ambient types avoid pulling lib into tsc.
 */
declare module '@health-analyzer/lib' {
  export type AppLocale = 'zh-CN' | 'zh-TW' | 'en';

  export interface HealthData {
    cgm: Array<{ datetime: string; value: number }>;
    bloodPressure: unknown[];
    weight: Array<{ value: number; date: string; datetime: string }>;
    bodyFat: unknown[];
    hrv: Record<string, number[]>;
    hrvOvernight: Record<string, number[]>;
    restingHr: Record<string, number>;
    walkingHr: Record<string, number>;
    steps: Record<string, { watch: number; iphone: number; max: number }>;
    sleep: Record<string, unknown>;
    watchDaily: Record<string, unknown>;
    workouts: unknown[];
    ecg: unknown[];
    dataAvailability: unknown;
    dataQuality: unknown;
  }

  export interface FullAnalysis {
    data: HealthData;
    cgmStats: { overall: { mean: number } } | null;
    bpStats: unknown | null;
    weightStats: {
      latestTrend: { date: string; weight: number } | null;
      trendSeries?: Array<{ date: string; weight: number }>;
    } | null;
    watchStats: unknown | null;
    workoutStats: unknown | null;
    ecgStats: unknown | null;
    recoveryWeek: {
      recoveryScore: number | null;
      loadScore?: number | null;
      statusLabel?: string;
      statusTone?: string;
      weekEnd?: string;
    } | null;
    recoveryWeeks: unknown[] | null;
    hrvByDate: Record<string, { mean?: number; median?: number } | number>;
    restingHrByDate: Record<string, number>;
    walkingHrByDate: Record<string, number>;
    stepsByDate: Record<string, number>;
    sleepByDate: Record<string, unknown>;
    dateRange: { start: string; end: string };
    generatedAt: string;
    sourceBatchIds?: string[];
    domainSourceBatches?: Record<string, string[]>;
  }

  export function parseHealthXml(
    xml: string,
    options?: { startDate?: string; endDate?: string },
  ): HealthData;

  export function analyzeAll(
    data: HealthData,
    options?: {
      recoveryWeights?: unknown;
      locale?: AppLocale | string | null;
    },
  ): FullAnalysis;

  export function generateVisitSummaryMarkdown(
    analysis: FullAnalysis,
    userContext?: unknown,
    options?: { locale?: AppLocale | string },
  ): string;

  export function generateWeeklyReportMarkdown(
    analysis: FullAnalysis,
    userContext?: unknown,
    options?: { locale?: AppLocale | string; includeEvents?: boolean },
  ): string;

  export function generateClinicalReviewMarkdown(
    analysis: FullAnalysis,
    userContext?: unknown,
    options?: { locale?: AppLocale | string },
  ): string;

  export type UserContext = {
    medications?: string;
    targetWeight?: number | string;
    focusAreas?: string;
    notes?: string;
    [key: string]: unknown;
  };

  export function generateLLMPrompt(
    analysis: FullAnalysis,
    userContext?: UserContext | null,
    options?: { locale?: AppLocale | string | null; includeEvents?: boolean },
  ): string;

  export function generateDataOnly(
    analysis: FullAnalysis,
    userContext?: UserContext | null,
    options?: { locale?: AppLocale | string | null; includeEvents?: boolean },
  ): string;

  export const SHORT_SYSTEM_PROMPT: string;
  export const SHORT_SYSTEM_PROMPT_EN: string;

  export function parseEcgCsv(text: string): unknown;

  export function createEmptyData(referenceDate?: string): HealthData;

  export function mergeHaeIntoData(
    data: HealthData,
    files: Array<{ name: string; text: string }>,
    options?: { includeUnknown?: string[]; includeWorkouts?: boolean },
  ): {
    sourceFormat: string;
    files: string[];
    totalAdded: number;
    totalUpdated: number;
    totalSkipped: number;
    byDomain: Record<string, unknown>;
    knownMetrics: string[];
    unknownMetrics: Array<{ name: string; sampleCount: number }>;
    notes: string[];
  };

  export function buildAnalysisSnapshot(
    analysis: FullAnalysis,
    options?: { id?: string; label?: string; savedAt?: string },
  ): {
    id: string;
    savedAt: string;
    generatedAt: string;
    dateRange: { start: string; end: string };
    label?: string;
    metrics: Record<string, unknown>;
  };
}


