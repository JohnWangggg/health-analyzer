/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*?raw' {
  const content: string;
  export default content;
}

/**
 * Typed surface for the adapter. Vite resolves `@health-analyzer/lib` to
 * `lib/src/index.ts` at bundle time; we intentionally do NOT pull the whole
 * lib tree into `tsc -b` (lib uses non-verbatim type imports).
 */
declare module '@health-analyzer/lib' {
  export type AppLocale = 'zh-CN' | 'zh-TW' | 'en';

  export interface HealthData {
    cgm: unknown[];
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
    } | null;
    watchStats: unknown | null;
    workoutStats: unknown | null;
    ecgStats: unknown | null;
    recoveryWeek: { recoveryScore: number | null } | null;
    recoveryWeeks: unknown[] | null;
    hrvByDate: Record<string, unknown>;
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
}
