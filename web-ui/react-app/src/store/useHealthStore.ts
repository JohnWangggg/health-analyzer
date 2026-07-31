import { create } from 'zustand';
import {
  healthCore,
  type AnalysisSummary,
} from '../core/HealthCoreAdapter';
import type { FullAnalysis } from '@health-analyzer/lib';

export type { AnalysisSummary };

type HealthState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: AnalysisSummary | null;
  /** Full analysis kept for Trends/Reports (adapter-backed, not re-stats). */
  analysis: FullAnalysis | null;
  sourceLabel: string | null;
  loadXml: (xml: string, sourceLabel: string) => void;
  clear: () => void;
};

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  error: null,
  summary: null,
  analysis: null,
  sourceLabel: null,
  loadXml: (xml, sourceLabel) => {
    set({ status: 'loading', error: null });
    try {
      const result = healthCore.analyzeXml(xml, { locale: 'zh-CN' });
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        sourceLabel,
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        sourceLabel,
      });
    }
  },
  clear: () =>
    set({
      status: 'idle',
      error: null,
      summary: null,
      analysis: null,
      sourceLabel: null,
    }),
}));
