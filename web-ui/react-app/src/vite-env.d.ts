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
    options?: {
      locale?: AppLocale | string;
      includeEvents?: boolean;
      events?: unknown[];
    },
  ): string;

  export function generateClinicalReviewMarkdown(
    analysis: FullAnalysis,
    userContext?: unknown,
    options?: {
      locale?: AppLocale | string;
      includeSensitiveContext?: boolean;
      includeEvents?: boolean;
      events?: unknown[];
    },
  ): string;

  export function generateClinicalReviewHtml(
    analysis: FullAnalysis,
    userContext?: unknown,
    options?: {
      locale?: AppLocale | string;
      includeSensitiveContext?: boolean;
      includeEvents?: boolean;
      events?: unknown[];
    },
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
    options?: {
      locale?: AppLocale | string | null;
      includeEvents?: boolean;
      events?: unknown[];
    },
  ): string;

  export function generateDataOnly(
    analysis: FullAnalysis,
    userContext?: UserContext | null,
    options?: {
      locale?: AppLocale | string | null;
      includeEvents?: boolean;
      events?: unknown[];
    },
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

  export interface ExportBundle {
    analysisJson: string;
    snapshotJson: string;
    csvFiles: { filename: string; content: string }[];
    signals: unknown[];
    snapshot: unknown;
  }

  export function buildExportBundle(analysis: FullAnalysis): ExportBundle;
  export function joinCsvBundle(
    csvFiles: { filename: string; content: string }[],
  ): string;

  export interface FhirExportResult {
    bundle: Record<string, unknown>;
    json: string;
    counts: {
      observations: number;
      provenances: number;
      documentReferences: number;
      patients: number;
      [key: string]: number;
    };
    validation?: { ok: boolean; issues: string[] };
    exchangeValidation?: { ok: boolean; issues?: string[] };
    exportTier?: string;
  }

  export function buildFhirExportBundle(
    analysis: FullAnalysis,
    options?: Record<string, unknown>,
  ): FhirExportResult;

  export function filterEventsInRange(
    events: HealthEvent[],
    start?: string | null,
    end?: string | null,
  ): HealthEvent[];

  export interface CsvMergeResult {
    weightAdded: number;
    weightUpdated: number;
    bpAdded: number;
    bodyFatFilled: number;
    skipped: number;
    notes: string[];
  }

  export function mergeExternalCsvIntoData(
    data: HealthData,
    options?: { weightCsvText?: string; bpCsvText?: string },
  ): CsvMergeResult;

  export interface RecoveryWeights {
    hrv: number;
    sleep: number;
    nightHr: number;
    spo2Night: number;
    exercise: number;
    workout: number;
    steps: number;
  }

  export type RecoveryWeightPresetId =
    | 'balanced'
    | 'recoveryFirst'
    | 'training'
    | 'weightLoss';

  export const DEFAULT_RECOVERY_WEIGHTS: RecoveryWeights;
  export const RECOVERY_WEIGHT_PRESETS: Record<
    RecoveryWeightPresetId,
    RecoveryWeights
  >;

  export type HealthEventKind =
    | 'medication_start'
    | 'medication_stop'
    | 'medication_missed'
    | 'medication_taken'
    | 'illness'
    | 'alcohol'
    | 'travel'
    | 'late_night'
    | 'menstrual'
    | 'training_change'
    | 'symptom'
    | 'fatigue'
    | 'custom';

  export type HealthEventSource = 'manual' | 'apple_medication' | 'import';

  export interface HealthEvent {
    id: string;
    kind: HealthEventKind;
    date: string;
    endDate?: string | null;
    title: string;
    note?: string | null;
    intensity?: number | null;
    source: HealthEventSource;
    createdAt: string;
    updatedAt?: string | null;
  }

  export const HEALTH_EVENT_KINDS: HealthEventKind[];

  export function createHealthEventId(): string;
  export function normalizeHealthEvent(
    input: Partial<HealthEvent> & { kind: string; date: string; title?: string },
  ): HealthEvent | null;
  export function sortHealthEvents(events: HealthEvent[]): HealthEvent[];
  export function formatEventKindLabel(
    kind: HealthEventKind,
    locale?: string,
  ): string;
}


