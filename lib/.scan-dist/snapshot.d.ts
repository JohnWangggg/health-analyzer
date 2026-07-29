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
    ecgHighHrCount: number;
    /** Watch 近 7 日日均锻炼分钟 */
    exerciseMinMean7d: number | null;
    activeKcalMean7d: number | null;
    spo2Mean7d: number | null;
    spo2Min7d: number | null;
    nightHrMean7d: number | null;
    vo2Latest: number | null;
    vo2Delta: number | null;
    watchDayCount: number;
    spo2NightMean7d: number | null;
    workoutCount30d: number;
    workoutDuration30d: number | null;
    recoveryScore: number | null;
    loadScore: number | null;
    daylightMinMean7d: number | null;
    standHoursMean7d: number | null;
}
export interface AnalysisSnapshot {
    id: string;
    savedAt: string;
    generatedAt: string;
    dateRange: {
        start: string;
        end: string;
    };
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
/** 从完整分析压缩为可持久化的摘要快照 */
export declare function buildAnalysisSnapshot(analysis: FullAnalysis, options?: {
    id?: string;
    label?: string;
    savedAt?: string;
}): AnalysisSnapshot;
/** 对比两次快照的关键指标 */
export declare function compareSnapshots(previous: AnalysisSnapshot, current: AnalysisSnapshot): SnapshotDiffRow[];
//# sourceMappingURL=snapshot.d.ts.map