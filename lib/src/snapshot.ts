/**
 * 分析快照：用于本地历史保存与环比（不含原始逐条明细，体积可控）
 */

import { FullAnalysis } from './types';

export interface AnalysisSnapshotMetrics {
  cgmMean: number | null;
  cgmTir: number | null;
  cgmStableMean: number | null;
  cgmStableTir: number | null;
  cgmMin: number | null;
  cgmMax: number | null;
  cgmCount: number;
  cgmPctBelow39: number | null;
  weightLatest: number | null;
  weightEarliest: number | null;
  weightDelta: number | null;
  weightCount: number;
  bodyFatLatest: number | null;
  bodyFatDelta: number | null;
  bpMean7dSys: number | null;
  bpMean7dDia: number | null;
  bpMorning7dSys: number | null;
  bpEvening7dSys: number | null;
  bpCount: number;
  bpLowCount7d: number | null;
  hrvMean7d: number | null;
  hrvDays: number;
  restingHrMean7d: number | null;
  walkingHrMean7d: number | null;
  stepsMean7d: number | null;
  stepsDays: number;
  sleepMean7d: number | null;
  sleepDays: number;
  ecgCount: number;
}

export interface AnalysisSnapshot {
  id: string;
  savedAt: string;
  generatedAt: string;
  dateRange: { start: string; end: string };
  metrics: AnalysisSnapshotMetrics;
  label?: string;
}

export interface SnapshotDiffRow {
  key: string;
  label: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
  unit: string;
}

function meanOf(values: number[]): number | null {
  const vals = values.filter(Number.isFinite);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function lastNMeans(map: Record<string, number>, n: number): number | null {
  const dates = Object.keys(map).sort();
  if (dates.length === 0) return null;
  const recent = dates.slice(-n).map((d) => map[d]).filter(Number.isFinite);
  return meanOf(recent);
}

function makeId(): string {
  return `snap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 从完整分析压缩为可持久化的摘要快照 */
export function buildAnalysisSnapshot(
  analysis: FullAnalysis,
  options: { id?: string; label?: string; savedAt?: string } = {}
): AnalysisSnapshot {
  const data = analysis.data;
  const ws = analysis.weightStats;
  const latestW = ws?.latestTrend?.weight ?? null;
  const earliestW = ws?.earliestTrend?.weight ?? null;

  const hrvMeans: Record<string, number> = {};
  for (const [d, h] of Object.entries(analysis.hrvByDate || {})) {
    hrvMeans[d] = h.allMean;
  }

  const sleepTotals: Record<string, number> = {};
  for (const [d, s] of Object.entries(analysis.sleepByDate || data.sleep || {})) {
    sleepTotals[d] = s.total;
  }

  const cgm = analysis.cgmStats?.overall;
  const cgmStable = analysis.cgmStats?.stable;

  return {
    id: options.id || makeId(),
    savedAt: options.savedAt || new Date().toISOString(),
    generatedAt: analysis.generatedAt,
    dateRange: { ...analysis.dateRange },
    label: options.label,
    metrics: {
      cgmMean: cgm ? cgm.mean : null,
      cgmTir: cgm ? cgm.pctInRange : null,
      cgmStableMean: cgmStable ? cgmStable.mean : null,
      cgmStableTir: cgmStable ? cgmStable.pctInRange : null,
      cgmMin: cgm ? cgm.min : null,
      cgmMax: cgm ? cgm.max : null,
      cgmCount: cgm ? cgm.count : data.cgm.length,
      cgmPctBelow39: cgmStable ? cgmStable.pctBelow39 : cgm ? cgm.pctBelow39 : null,
      weightLatest: latestW,
      weightEarliest: earliestW,
      weightDelta:
        latestW != null && earliestW != null ? latestW - earliestW : null,
      weightCount: ws?.dayCount ?? data.weight.length,
      bodyFatLatest: ws?.bodyFatLatest ?? null,
      bodyFatDelta: ws?.bodyFatDelta ?? null,
      bpMean7dSys: analysis.bpStats?.mean7d?.systolic ?? null,
      bpMean7dDia: analysis.bpStats?.mean7d?.diastolic ?? null,
      bpMorning7dSys: analysis.bpStats?.morning7d?.systolic ?? null,
      bpEvening7dSys: analysis.bpStats?.evening7d?.systolic ?? null,
      bpCount: analysis.bpStats?.records?.length ?? data.bloodPressure.length,
      bpLowCount7d: analysis.bpStats?.mean7d?.lowCount ?? null,
      hrvMean7d: lastNMeans(hrvMeans, 7),
      hrvDays: Object.keys(analysis.hrvByDate || {}).length,
      restingHrMean7d: lastNMeans(analysis.restingHrByDate || data.restingHr || {}, 7),
      walkingHrMean7d: lastNMeans(analysis.walkingHrByDate || data.walkingHr || {}, 7),
      stepsMean7d: lastNMeans(analysis.stepsByDate || {}, 7),
      stepsDays: Object.keys(analysis.stepsByDate || data.steps || {}).length,
      sleepMean7d: lastNMeans(sleepTotals, 7),
      sleepDays: Object.keys(sleepTotals).length,
      ecgCount: data.ecg?.length || 0,
    },
  };
}

const DIFF_FIELDS: { key: keyof AnalysisSnapshotMetrics; label: string; unit: string }[] = [
  { key: 'cgmMean', label: 'CGM 全程均值', unit: 'mmol/L' },
  { key: 'cgmStableMean', label: 'CGM 稳定期均值', unit: 'mmol/L' },
  { key: 'cgmStableTir', label: 'CGM 稳定期 TIR', unit: '%' },
  { key: 'cgmPctBelow39', label: 'CGM <3.9 占比(稳)', unit: '%' },
  { key: 'weightLatest', label: '最新趋势体重(晨优)', unit: 'kg' },
  { key: 'bodyFatLatest', label: '最新体脂', unit: '%' },
  { key: 'bpMean7dSys', label: '血压 7 天收缩压', unit: 'mmHg' },
  { key: 'bpMorning7dSys', label: '血压 7 天晨间收缩压', unit: 'mmHg' },
  { key: 'bpEvening7dSys', label: '血压 7 天晚间收缩压', unit: 'mmHg' },
  { key: 'hrvMean7d', label: 'HRV 近 7 天均值', unit: 'ms' },
  { key: 'restingHrMean7d', label: '静息心率近 7 天均值', unit: 'bpm' },
  { key: 'walkingHrMean7d', label: '步行心率近 7 天均值', unit: 'bpm' },
  { key: 'stepsMean7d', label: '步数近 7 天日均', unit: '步' },
  { key: 'sleepMean7d', label: '睡眠近 7 天日均', unit: 'h' },
];

/** 对比两次快照的关键指标 */
export function compareSnapshots(
  previous: AnalysisSnapshot,
  current: AnalysisSnapshot
): SnapshotDiffRow[] {
  const rows: SnapshotDiffRow[] = [];
  for (const f of DIFF_FIELDS) {
    const prev = previous.metrics[f.key];
    const curr = current.metrics[f.key];
    const p = prev == null || !Number.isFinite(Number(prev)) ? null : Number(prev);
    const c = curr == null || !Number.isFinite(Number(curr)) ? null : Number(curr);
    if (p == null && c == null) continue;
    rows.push({
      key: f.key,
      label: f.label,
      previous: p,
      current: c,
      delta: p != null && c != null ? c - p : null,
      unit: f.unit,
    });
  }
  return rows;
}
