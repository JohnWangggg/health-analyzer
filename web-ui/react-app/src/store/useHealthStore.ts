import { create } from 'zustand';
import {
  healthCore,
  type AnalysisSummary,
} from '../core/HealthCoreAdapter';
import type { FullAnalysis, HealthData } from '@health-analyzer/lib';
import { analyzeHealthZipFile } from '../core/zipImport';
import { loadAndAnalyzeWarehouse } from '../core/warehouseLoad';
import { saveAnalysisSnapshot } from '../core/snapshotWrite';
import { analyzeHaeBrowserFiles, type HaeImportResult } from '../core/haeImport';
import { persistHealthDataSharded } from '../core/warehousePersist';

export type { AnalysisSummary };

export type AnalyzeVia =
  | 'worker'
  | 'main'
  | 'zip'
  | 'warehouse'
  | 'hae'
  | null;

type HealthState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: AnalysisSummary | null;
  analysis: FullAnalysis | null;
  /** Raw health data for HAE merge / warehouse persist */
  data: HealthData | null;
  sourceLabel: string | null;
  analyzeVia: AnalyzeVia;
  lastSnapshotId: string | null;
  lastHaeNotes: string[];
  warehousePersistMsg: string | null;
  progressLabel: string | null;
  loadXml: (xml: string, sourceLabel: string) => void;
  loadXmlAsync: (xml: string, sourceLabel: string) => Promise<void>;
  loadZipFile: (file: File) => Promise<void>;
  loadHaeFiles: (files: File[]) => Promise<void>;
  loadWarehouse: () => Promise<void>;
  persistWarehouse: () => Promise<void>;
  saveSnapshot: (label?: string) => Promise<string | null>;
  clear: () => void;
};

function setFromAnalysis(
  set: (p: Partial<HealthState>) => void,
  analysis: FullAnalysis,
  summary: AnalysisSummary,
  data: HealthData,
  sourceLabel: string,
  analyzeVia: AnalyzeVia,
  extra?: Partial<HealthState>,
) {
  set({
    status: 'ready',
    summary,
    analysis,
    data,
    sourceLabel,
    analyzeVia,
    error: null,
    progressLabel: null,
    ...extra,
  });
}

export const useHealthStore = create<HealthState>((set, get) => ({
  status: 'idle',
  error: null,
  summary: null,
  analysis: null,
  data: null,
  sourceLabel: null,
  analyzeVia: null,
  lastSnapshotId: null,
  lastHaeNotes: [],
  warehousePersistMsg: null,
  progressLabel: null,
  loadXml: (xml, sourceLabel) => {
    set({ status: 'loading', error: null, progressLabel: '解析 XML…' });
    try {
      const result = healthCore.analyzeXml(xml, { locale: 'zh-CN' });
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        sourceLabel,
        'main',
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        data: null,
        sourceLabel,
        analyzeVia: null,
        progressLabel: null,
      });
    }
  },
  loadXmlAsync: async (xml, sourceLabel) => {
    set({
      status: 'loading',
      error: null,
      progressLabel: 'Worker 解析 XML…',
    });
    try {
      const result = await healthCore.analyzeXmlAsync(xml, {
        locale: 'zh-CN',
      });
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        sourceLabel,
        result.via,
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        data: null,
        sourceLabel,
        analyzeVia: null,
        progressLabel: null,
      });
    }
  },
  loadZipFile: async (file) => {
    set({
      status: 'loading',
      error: null,
      sourceLabel: file.name,
      progressLabel: '解压 ZIP…',
    });
    try {
      const result = await analyzeHealthZipFile(file, { locale: 'zh-CN' });
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        `${file.name} → ${result.xmlFileName}`,
        'zip',
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        data: null,
        analyzeVia: null,
        progressLabel: null,
      });
    }
  },
  loadHaeFiles: async (files) => {
    set({
      status: 'loading',
      error: null,
      progressLabel: `合并 HAE（${files.length} 个文件）…`,
    });
    try {
      const base = get().data;
      const result: HaeImportResult = await analyzeHaeBrowserFiles(files, {
        locale: 'zh-CN',
        baseData: base,
      });
      const names = files.map((f) => f.name).join(', ');
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        `HAE: ${names}`,
        'hae',
        {
          lastHaeNotes: [
            `+${result.stats.totalAdded} / ~${result.stats.totalUpdated} / skip ${result.stats.totalSkipped}`,
            ...result.stats.notes.slice(0, 5),
          ],
        },
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        analyzeVia: null,
        progressLabel: null,
      });
    }
  },
  loadWarehouse: async () => {
    set({
      status: 'loading',
      error: null,
      progressLabel: '读取本地数据仓…',
    });
    try {
      const result = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
      if (!result) {
        set({
          status: 'error',
          error:
            '本地数据仓不可用：需已授权且有分片。可先「写入数据仓」保存当前会话。',
          summary: null,
          analysis: null,
          data: null,
          sourceLabel: 'warehouse',
          analyzeVia: null,
          progressLabel: null,
        });
        return;
      }
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        `warehouse (${result.layout}, ${result.chunkCount} chunks)`,
        'warehouse',
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        summary: null,
        analysis: null,
        data: null,
        sourceLabel: 'warehouse',
        analyzeVia: null,
        progressLabel: null,
      });
    }
  },
  persistWarehouse: async () => {
    const data = get().data;
    if (!data) {
      set({ warehousePersistMsg: '无会话数据可写入' });
      return;
    }
    set({ progressLabel: '写入数据仓（sharded-v1）…', warehousePersistMsg: null });
    try {
      const r = await persistHealthDataSharded(data, { grantIfNeeded: true });
      if (!r.ok) {
        set({
          warehousePersistMsg: `写入失败: ${r.reason}`,
          progressLabel: null,
        });
        return;
      }
      set({
        warehousePersistMsg: `已写入 ${r.layout} · ${r.chunkCount} 分片 · ~${(r.approxBytes / 1024).toFixed(1)} KB · ${r.recordCount} 条${r.softWarn ? '（软配额提示）' : ''}`,
        progressLabel: null,
      });
    } catch (e) {
      set({
        warehousePersistMsg: e instanceof Error ? e.message : String(e),
        progressLabel: null,
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
      data: null,
      sourceLabel: null,
      analyzeVia: null,
      lastSnapshotId: null,
      lastHaeNotes: [],
      warehousePersistMsg: null,
      progressLabel: null,
    }),
}));
