/**
 * Health Auto Export (HAE) import via lib mergeHaeIntoData — no reimplementation.
 */
import {
  createEmptyData,
  mergeHaeIntoData,
  analyzeAll,
  type HealthData,
  type FullAnalysis,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type AnalysisSummary } from './HealthCoreAdapter';

export type HaeFileText = { name: string; text: string };

export type HaeImportResult = {
  data: HealthData;
  analysis: FullAnalysis;
  summary: AnalysisSummary;
  stats: {
    sourceFormat: string;
    files: string[];
    totalAdded: number;
    totalUpdated: number;
    totalSkipped: number;
    knownMetrics: string[];
    unknownMetrics: Array<{ name: string; sampleCount: number }>;
    notes: string[];
  };
};

/**
 * Merge HAE JSON/CSV texts into base HealthData (or empty), then analyzeAll.
 */
export function analyzeHaeFiles(
  files: HaeFileText[],
  options?: {
    locale?: string | null;
    /** Existing session data to merge into (cloned). */
    baseData?: HealthData | null;
  },
): HaeImportResult {
  if (!files.length) {
    throw new Error('未提供 HAE 文件');
  }
  const data = options?.baseData
    ? (JSON.parse(JSON.stringify(options.baseData)) as HealthData)
    : createEmptyData();

  const rawStats = mergeHaeIntoData(
    data,
    files.map((f) => ({ name: f.name, text: f.text })),
    { includeWorkouts: true },
  );

  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
    stats: {
      sourceFormat: rawStats.sourceFormat,
      files: rawStats.files,
      totalAdded: rawStats.totalAdded,
      totalUpdated: rawStats.totalUpdated,
      totalSkipped: rawStats.totalSkipped,
      knownMetrics: rawStats.knownMetrics,
      unknownMetrics: (rawStats.unknownMetrics || []).map((u) => ({
        name: u.name,
        sampleCount: u.sampleCount,
      })),
      notes: rawStats.notes || [],
    },
  };
}

export class HaeImportCancelledError extends Error {
  constructor(message = 'hae_import_cancelled') {
    super(message);
    this.name = 'HaeImportCancelledError';
  }
}

export async function analyzeHaeBrowserFiles(
  fileList: File[],
  options?: {
    locale?: string | null;
    baseData?: HealthData | null;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number, name: string) => void;
  },
): Promise<HaeImportResult> {
  const files: HaeFileText[] = [];
  const total = fileList.length;
  for (let i = 0; i < fileList.length; i++) {
    if (options?.signal?.aborted) {
      throw new HaeImportCancelledError();
    }
    const f = fileList[i]!;
    const name = f.name || 'hae.json';
    if (!/\.(json|csv)$/i.test(name)) {
      throw new Error(`不支持的 HAE 文件类型: ${name}（需要 .json / .csv）`);
    }
    options?.onProgress?.(i, total, name);
    files.push({ name, text: await f.text() });
  }
  if (options?.signal?.aborted) {
    throw new HaeImportCancelledError();
  }
  options?.onProgress?.(total, total, '');
  return analyzeHaeFiles(files, options);
}
