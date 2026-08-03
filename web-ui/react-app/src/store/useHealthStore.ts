import { create } from 'zustand';
import {
  healthCore,
  type AnalysisSummary,
} from '../core/HealthCoreAdapter';
import type { FullAnalysis, HealthData } from '@health-analyzer/lib';
import { analyzeHealthZipFile } from '../core/zipImport';
import { loadAndAnalyzeWarehouse } from '../core/warehouseLoad';
import { saveAnalysisSnapshot } from '../core/snapshotWrite';
import {
  analyzeHaeBrowserFiles,
  HaeImportCancelledError,
  type HaeImportResult,
} from '../core/haeImport';
import { persistHealthDataSharded } from '../core/warehousePersist';
import { reanalyzeHealthData } from '../core/reanalyze';
import { mergeCsvFilesAndAnalyze } from '../core/csvMerge';
import { analysisLocaleFromUi } from '../i18n/uiLocale';

export type { AnalysisSummary };

function storeLocale() {
  return analysisLocaleFromUi();
}

export type AnalyzeVia =
  | 'worker'
  | 'main'
  | 'zip'
  | 'warehouse'
  | 'hae'
  | 'csv'
  | 'reanalyze'
  | null;

/** Module-level abort for in-flight HAE (not serializable in state). */
let haeAbort: AbortController | null = null;

type HealthState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  summary: AnalysisSummary | null;
  analysis: FullAnalysis | null;
  /** Raw health data for HAE merge / warehouse persist (unfiltered source) */
  data: HealthData | null;
  /**
   * Full unfiltered session data when date filter is applied.
   * Same as data until a date window is used mid-session.
   */
  sourceData: HealthData | null;
  sourceLabel: string | null;
  analyzeVia: AnalyzeVia;
  lastSnapshotId: string | null;
  lastHaeNotes: string[];
  warehousePersistMsg: string | null;
  progressLabel: string | null;
  /** True while HAE multi-file import can be cancelled. */
  haeCancellable: boolean;
  loadXml: (xml: string, sourceLabel: string) => void;
  loadXmlAsync: (xml: string, sourceLabel: string) => Promise<void>;
  loadZipFile: (file: File) => Promise<void>;
  loadHaeFiles: (files: File[]) => Promise<void>;
  cancelHaeImport: () => void;
  loadWarehouse: () => Promise<void>;
  persistWarehouse: () => Promise<void>;
  saveSnapshot: (label?: string) => Promise<string | null>;
  /** Re-run analyzeAll on current data (recovery weights / date filter). */
  reanalyzeSession: (opts?: {
    locale?: string | null;
    /** Apply session date filter from sessionStorage (default true). */
    applyDateFilter?: boolean;
  }) => void;
  /** Merge external weight/BP CSV into session and reanalyze. */
  mergeCsvFiles: (
    files: { weightText?: string | null; bpText?: string | null },
    opts?: { locale?: string | null },
  ) => void;
  /** Replace session from an already-analyzed result (shared helper path). */
  applyAnalyzed: (payload: {
    data: HealthData;
    analysis: FullAnalysis;
    summary: AnalysisSummary;
    sourceLabel?: string;
    analyzeVia?: AnalyzeVia;
    extra?: Partial<HealthState>;
  }) => void;
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
    sourceData: data,
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
  sourceData: null,
  sourceLabel: null,
  analyzeVia: null,
  lastSnapshotId: null,
  lastHaeNotes: [],
  warehousePersistMsg: null,
  progressLabel: null,
  haeCancellable: false,
  loadXml: (xml, sourceLabel) => {
    set({ status: 'loading', error: null, progressLabel: '解析 XML…' });
    try {
      const result = healthCore.analyzeXml(xml, { locale: storeLocale() });
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
        locale: storeLocale(),
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
      const result = await analyzeHealthZipFile(file, { locale: storeLocale() });
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
    if (haeAbort) {
      haeAbort.abort();
      haeAbort = null;
    }
    const ac = new AbortController();
    haeAbort = ac;
    set({
      status: 'loading',
      error: null,
      progressLabel: `合并 HAE（0/${files.length}）…`,
      haeCancellable: true,
    });
    try {
      const base = get().sourceData || get().data;
      const result: HaeImportResult = await analyzeHaeBrowserFiles(files, {
        locale: storeLocale(),
        baseData: base,
        signal: ac.signal,
        onProgress: (done, total, name) => {
          set({
            progressLabel:
              done >= total
                ? `分析 HAE（${total} 个文件）…`
                : `读取 HAE ${done + 1}/${total}${name ? ` · ${name}` : ''}…`,
          });
        },
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
          haeCancellable: false,
        },
      );
    } catch (e) {
      if (e instanceof HaeImportCancelledError || ac.signal.aborted) {
        set({
          status: get().analysis ? 'ready' : 'idle',
          error: null,
          progressLabel: null,
          haeCancellable: false,
          lastHaeNotes: ['HAE 导入已取消'],
        });
        return;
      }
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        analyzeVia: null,
        progressLabel: null,
        haeCancellable: false,
      });
    } finally {
      if (haeAbort === ac) haeAbort = null;
    }
  },
  cancelHaeImport: () => {
    if (haeAbort) {
      haeAbort.abort();
      haeAbort = null;
    }
    set({ haeCancellable: false, progressLabel: '正在取消 HAE…' });
  },
  loadWarehouse: async () => {
    set({
      status: 'loading',
      error: null,
      progressLabel: '读取本地数据仓…',
    });
    try {
      const result = await loadAndAnalyzeWarehouse({ locale: storeLocale() });
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
      const parts: string[] = [];
      if (r.removedMonths)
        parts.push(`${r.removedMonths} 个旧 CGM 月`);
      if (r.removedBp || r.removedWeight)
        parts.push('旧 BP/体重年');
      if (r.removedSleep || r.removedSteps)
        parts.push('旧睡眠/步数年');
      if (r.removedHrv) parts.push('旧 HRV 年');
      if (r.removedWorkouts) parts.push('旧训练/ECG/手表年');
      if (r.removedYears && !parts.length)
        parts.push(`${r.removedYears} 个旧年份`);
      const trimNote = parts.length
        ? ` · 软配额裁剪 ${parts.join('、')}`
        : r.softWarn
          ? '（软配额提示）'
          : '';
      set({
        warehousePersistMsg: `已写入 ${r.layout} · ${r.chunkCount} 分片 · ~${(r.approxBytes / 1024).toFixed(1)} KB · ${r.recordCount} 条${trimNote}`,
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
  reanalyzeSession: (opts) => {
    const base = get().sourceData || get().data;
    if (!base) {
      set({ error: '无会话数据可重算' });
      return;
    }
    set({ status: 'loading', error: null, progressLabel: '按当前设置重算…' });
    try {
      const result = reanalyzeHealthData(base, {
        locale: opts?.locale ?? storeLocale(),
        skipDateFilter: opts?.applyDateFilter === false,
      });
      set({
        status: 'ready',
        summary: result.summary,
        analysis: result.analysis,
        data: result.data,
        sourceData: base,
        sourceLabel: get().sourceLabel || 'reanalyze',
        analyzeVia: 'reanalyze',
        error: null,
        progressLabel: null,
      });
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        progressLabel: null,
      });
    }
  },
  mergeCsvFiles: (files, opts) => {
    set({
      status: 'loading',
      error: null,
      progressLabel: '合并外部 CSV…',
    });
    try {
      const result = mergeCsvFilesAndAnalyze(get().data, files, {
        locale: opts?.locale ?? storeLocale(),
      });
      const notes = [
        `体重 +${result.weightAdded}/~${result.weightUpdated} · 血压 +${result.bpAdded}`,
        ...result.notes.slice(0, 4),
      ];
      setFromAnalysis(
        set,
        result.analysis,
        result.summary,
        result.data,
        get().sourceLabel
          ? `${get().sourceLabel} + CSV`
          : 'external CSV',
        'csv',
        { lastHaeNotes: notes },
      );
    } catch (e) {
      set({
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        progressLabel: null,
      });
    }
  },
  applyAnalyzed: (payload) => {
    setFromAnalysis(
      set,
      payload.analysis,
      payload.summary,
      payload.data,
      payload.sourceLabel ?? get().sourceLabel ?? 'session',
      payload.analyzeVia ?? 'reanalyze',
      payload.extra,
    );
  },
  clear: () =>
    set({
      status: 'idle',
      error: null,
      summary: null,
      analysis: null,
      data: null,
      sourceData: null,
      sourceLabel: null,
      analyzeVia: null,
      lastSnapshotId: null,
      lastHaeNotes: [],
      warehousePersistMsg: null,
      progressLabel: null,
      haeCancellable: false,
    }),
}));
