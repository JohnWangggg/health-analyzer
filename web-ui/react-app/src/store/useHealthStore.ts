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
  analysis: FullAnalysis | null;
  sourceLabel: string | null;
  /** How last analysis ran (worker vs main). */
  analyzeVia: 'worker' | 'main' | null;
  loadXml: (xml: string, sourceLabel: string) => void;
  loadXmlAsync: (xml: string, sourceLabel: string) => Promise<void>;
  clear: () => void;
};

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  error: null,
  summary: null,
  analysis: null,
  sourceLabel: null,
  analyzeVia: null,
  loadXml: (xml, sourceLabel) => {
    set({ status: 'loading', error: null });
    try {
      const result = healthCore.analyzeXml(xml, { locale: 'zh-CN' });
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        sourceLabel,
        analyzeVia: 'main',
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        sourceLabel,
        analyzeVia: null,
      });
    }
  },
  loadXmlAsync: async (xml, sourceLabel) => {
    set({ status: 'loading', error: null });
    try {
      const result = await healthCore.analyzeXmlAsync(xml, {
        locale: 'zh-CN',
      });
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        sourceLabel,
        analyzeVia: result.via,
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        sourceLabel,
        analyzeVia: null,
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
      analyzeVia: null,
    }),
}));
