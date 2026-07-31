import { create } from 'zustand';
import {
  healthCore,
  type AnalysisSummary,
} from '../core/HealthCoreAdapter';
import type { FullAnalysis } from '@health-analyzer/lib';
import { analyzeHealthZipFile } from '../core/zipImport';
import { loadAndAnalyzeWarehouse } from '../core/warehouseLoad';
import { saveAnalysisSnapshot } from '../core/snapshotWrite';

export type { AnalysisSummary };

type HealthState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: AnalysisSummary | null;
  analysis: FullAnalysis | null;
  sourceLabel: string | null;
  analyzeVia: 'worker' | 'main' | 'zip' | 'warehouse' | null;
  lastSnapshotId: string | null;
  loadXml: (xml: string, sourceLabel: string) => void;
  loadXmlAsync: (xml: string, sourceLabel: string) => Promise<void>;
  loadZipFile: (file: File) => Promise<void>;
  loadWarehouse: () => Promise<void>;
  saveSnapshot: (label?: string) => Promise<string | null>;
  clear: () => void;
};

export const useHealthStore = create<HealthState>((set, get) => ({
  status: 'idle',
  error: null,
  summary: null,
  analysis: null,
  sourceLabel: null,
  analyzeVia: null,
  lastSnapshotId: null,
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
  loadZipFile: async (file) => {
    set({ status: 'loading', error: null, sourceLabel: file.name });
    try {
      const result = await analyzeHealthZipFile(file, { locale: 'zh-CN' });
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        sourceLabel: `${file.name} → ${result.xmlFileName}`,
        analyzeVia: 'zip',
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        analyzeVia: null,
      });
    }
  },
  loadWarehouse: async () => {
    set({ status: 'loading', error: null });
    try {
      const result = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
      if (!result) {
        set({
          status: 'error',
          error:
            '本地数据仓不可用：需在 legacy 中授权仓库且已有分片数据。',
          summary: null,
          analysis: null,
          sourceLabel: 'warehouse',
          analyzeVia: null,
        });
        return;
      }
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        sourceLabel: `warehouse (${result.layout}, ${result.chunkCount} chunks)`,
        analyzeVia: 'warehouse',
        error: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        sourceLabel: 'warehouse',
        analyzeVia: null,
      });
    }
  },
  saveSnapshot: async (label) => {
    const analysis = get().analysis;
    if (!analysis) return null;
    try {
      const ref = await saveAnalysisSnapshot(analysis, { label });
      set({ lastSnapshotId: ref.id });
      return ref.id;
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
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
      lastSnapshotId: null,
    }),
}));
