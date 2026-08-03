/**
 * Re-run analyzeAll on in-memory HealthData (recovery weights / post-merge).
 */
import {
  analyzeAll,
  type FullAnalysis,
  type HealthData,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type AnalysisSummary } from './HealthCoreAdapter';
import { loadRecoveryWeights } from './recoveryWeights';

export function reanalyzeHealthData(
  data: HealthData,
  options?: { locale?: string | null },
): { data: HealthData; analysis: FullAnalysis; summary: AnalysisSummary } {
  const weights = loadRecoveryWeights();
  const analysis = analyzeAll(data, {
    locale: options?.locale ?? null,
    recoveryWeights: weights,
  });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}
