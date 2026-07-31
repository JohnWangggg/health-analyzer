import { create } from 'zustand';
import {
  healthCore,
  type AnalysisSummary,
  type ParseAnalyzeResult,
} from '../core/HealthCoreAdapter';

type HealthState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: AnalysisSummary | null;
  sourceLabel: string | null;
  loadXml: (xml: string, sourceLabel: string) => void;
  clear: () => void;
};

export const useHealthStore = create<HealthState>((set) => ({
  status: 'idle',
  error: null,
  summary: null,
  sourceLabel: null,
  loadXml: (xml, sourceLabel) => {
    set({ status: 'loading', error: null });
    try {
      const result: ParseAnalyzeResult = healthCore.analyzeXml(xml, {
        locale: 'zh-CN',
      });
      set({
        status: 'ready',
        summary: result.summary,
        sourceLabel,
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        sourceLabel,
      });
    }
  },
  clear: () =>
    set({
      status: 'idle',
      error: null,
      summary: null,
      sourceLabel: null,
    }),
}));
