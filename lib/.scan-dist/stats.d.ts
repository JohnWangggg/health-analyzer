/**
 * 统计与指标计算
 */
import { HealthData, CgmStats, BloodPressureStats, HrvDaySummary, FullAnalysis, WeightRecord, WeightStats, BloodPressureRecord, WatchStats, WatchDaySummary, WorkoutSession, WorkoutStats, EcgStats, ERecordSummary, RecoveryWeekStats, RecoveryWeekPoint, RecoveryWeights } from './types';
import { AppLocale } from './locale';
/** 将部分权重与默认合并，非正数回退默认 */
export declare function normalizeRecoveryWeights(weights?: Partial<RecoveryWeights> | null): RecoveryWeights;
/** CGM 完整统计：总体 + 首日 + 稳定期 */
export declare function calcCgmStats(cgm: {
    datetime: string;
    value: number;
}[]): CgmStats | null;
/** 血压：整体时段 + 晨间/晚间分层 */
export declare function calcBloodPressureStats(records: BloodPressureRecord[]): BloodPressureStats | null;
/**
 * 体重：同日聚合，趋势用晨起（12:00 前最早），否则全日最早
 */
export declare function calcWeightStats(weight: WeightRecord[]): WeightStats | null;
/** HRV 每日摘要 */
export declare function summarizeHrvByDay(hrv: Record<string, number[]>, hrvOvernight: Record<string, number[]>): Record<string, HrvDaySummary>;
/** Watch 活动 / 血氧 / 呼吸 / VO2 / 腕温 日汇总 */
export declare function calcWatchStats(watchDaily: Record<string, WatchDaySummary> | undefined): WatchStats | null;
/** Workout 会话汇总；referenceDate 默认用最后一场日期，analyzeAll 传入数据结束日更合理 */
export declare function calcWorkoutStats(workouts: WorkoutSession[] | undefined, referenceDate?: string): WorkoutStats | null;
/** 高心率 ECG 与当日活动关联时的可选上下文 */
export interface EcgActivityContext {
    stepsByDate?: Record<string, number>;
    /** Watch 日汇总（取 exerciseMin）；也接受已算好的日视图 */
    watchDaily?: Record<string, {
        exerciseMin?: number;
    } | undefined>;
}
/**
 * 高心率 ECG 与时段 / Workout / 同日活动关联
 * （±2h 训练窗；22–08 或无附近训练 → 非运动窗；步数/锻炼分钟 → 低/高活动日）
 * 可单独测试；calcEcgStats / analyzeAll 会合并进 EcgStats。
 */
export declare function enrichEcgWithContext(ecg: ERecordSummary[] | undefined, workouts?: WorkoutSession[] | undefined, activity?: EcgActivityContext): Pick<EcgStats, 'highHrByHour' | 'highHrNearWorkoutCount' | 'highHrRestingWindowCount' | 'recentHighHr' | 'highHrOnLowActivityCount' | 'highHrOnHighActivityCount'>;
/** ECG 分类汇总；可选 workouts / 活动日数据用于高心率关联 */
export declare function calcEcgStats(ecg: ERecordSummary[] | undefined, workouts?: WorkoutSession[] | undefined, activity?: EcgActivityContext): EcgStats | null;
/**
 * 用多周历史给最新一周贴上个人恢复基线（轻量、非诊断）。
 * 需要此前 ≥4 周有效 recoveryScore；|delta|≥8 时在 statusLabel 中提示。
 */
export declare function attachRecoveryBaseline(week: RecoveryWeekStats, recoveryWeeks: RecoveryWeekPoint[] | null | undefined, localeInput?: AppLocale | string | null): RecoveryWeekStats;
export type RecoveryAnalysisPartial = {
    dateRange: {
        start: string;
        end: string;
    };
    hrvByDate: Record<string, HrvDaySummary>;
    restingHrByDate: Record<string, number>;
    stepsByDate: Record<string, number>;
    sleepByDate: Record<string, {
        total: number;
    }>;
    watchStats: WatchStats | null;
    workoutStats: WorkoutStats | null;
};
/**
 * 近 7 日负荷 / 恢复仪表（最新一周，截止 dateRange.end）。
 * 默认用多周序列计算个人基线（≥4 周先验时写入 baseline 字段）。
 * 可传入已算好的 recoveryWeeks 避免重复计算。
 */
export declare function calcRecoveryWeek(analysis: RecoveryAnalysisPartial, options?: {
    recoveryWeeks?: RecoveryWeekPoint[] | null;
    skipBaseline?: boolean;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
}): RecoveryWeekStats | null;
/**
 * 多周恢复/负荷序列：以 dateRange.end 为最后一周结束日，向前每 7 天一步。
 * 默认 12 周；只保留有足够维度的周；顺序最旧→最新。
 */
export declare function calcRecoveryWeeks(analysis: RecoveryAnalysisPartial, options?: {
    weeks?: number;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
}): RecoveryWeekPoint[] | null;
/**
 * 仅用已有分析字段重算恢复/负荷（不重新 parse）。
 * 适合 UI 调整权重后即时刷新。
 */
export declare function recomputeRecovery(analysis: RecoveryAnalysisPartial, options?: {
    weeks?: number;
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
}): {
    recoveryWeek: RecoveryWeekStats | null;
    recoveryWeeks: RecoveryWeekPoint[] | null;
};
/** 完整分析入口 */
export declare function analyzeAll(data: HealthData, options?: {
    recoveryWeights?: Partial<RecoveryWeights> | null;
    locale?: AppLocale | string | null;
}): FullAnalysis;
//# sourceMappingURL=stats.d.ts.map