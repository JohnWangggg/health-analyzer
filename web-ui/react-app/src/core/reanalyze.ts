/**
 * Re-run analyzeAll on in-memory HealthData (recovery weights / date filter / post-merge).
 */
import {
  analyzeAll,
  type FullAnalysis,
  type HealthData,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type AnalysisSummary } from './HealthCoreAdapter';
import { loadRecoveryWeights } from './recoveryWeights';
import {
  filterHealthDataByDate,
  loadDateFilter,
  type DateFilter,
} from './dateFilter';

export function reanalyzeHealthData(
  data: HealthData,
  options?: {
    locale?: string | null;
    dateFilter?: DateFilter | null;
    /** When true, use full data without session date filter. */
    skipDateFilter?: boolean;
  },
): { data: HealthData; analysis: FullAnalysis; summary: AnalysisSummary } {
  const weights = loadRecoveryWeights();
  const filter: DateFilter = options?.skipDateFilter
    ? { startDate: null, endDate: null }
    : options?.dateFilter != null
      ? options.dateFilter
      : loadDateFilter();
  const filtered =
    filter.startDate || filter.endDate
      ? filterHealthDataByDate(data, filter)
      : data;
  const analysis = analyzeAll(filtered, {
    locale: options?.locale ?? null,
    recoveryWeights: weights,
  });
  return {
    /** Keep unfiltered source for re-filter / warehouse persist */
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}
