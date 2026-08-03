/**
 * External weight / BP CSV merge into session HealthData (lib kernel).
 * mergeExternalCsvIntoData mutates a clone of base data.
 */
import {
  analyzeAll,
  createEmptyData,
  mergeExternalCsvIntoData,
  type FullAnalysis,
  type HealthData,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type AnalysisSummary } from './HealthCoreAdapter';
import { loadRecoveryWeights } from './recoveryWeights';

export type CsvMergeAnalyzeResult = {
  data: HealthData;
  analysis: FullAnalysis;
  summary: AnalysisSummary;
  notes: string[];
  weightAdded: number;
  weightUpdated: number;
  bpAdded: number;
};

function cloneData(data: HealthData): HealthData {
  return JSON.parse(JSON.stringify(data)) as HealthData;
}

export function mergeCsvFilesAndAnalyze(
  base: HealthData | null,
  files: { weightText?: string | null; bpText?: string | null },
  options?: { locale?: string | null },
): CsvMergeAnalyzeResult {
  const data = base ? cloneData(base) : createEmptyData();
  const merge = mergeExternalCsvIntoData(data, {
    weightCsvText: files.weightText || undefined,
    bpCsvText: files.bpText || undefined,
  });
  const weights = loadRecoveryWeights();
  const analysis = analyzeAll(data, {
    locale: options?.locale ?? null,
    recoveryWeights: weights,
  });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
    notes: merge.notes || [],
    weightAdded: merge.weightAdded,
    weightUpdated: merge.weightUpdated,
    bpAdded: merge.bpAdded,
  };
}
