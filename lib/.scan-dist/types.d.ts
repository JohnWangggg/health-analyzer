/**
 * 数据类型定义
 * Apple Health 导出数据的所有结构定义
 */
export interface RawRecord {
    type: string;
    source: string;
    startDate: string;
    endDate?: string;
    value: string;
}
export interface CgmPoint {
    datetime: string;
    value: number;
}
export interface BloodPressureRecord {
    datetime: string;
    date: string;
    systolic: number;
    diastolic: number;
}
export interface WeightRecord {
    datetime: string;
    date: string;
    value: number;
    bodyFat?: number;
    muscleMass?: number;
    bmi?: number;
}
/** 体脂独立点（解析后与体重按日合并） */
export interface BodyFatPoint {
    datetime: string;
    date: string;
    value: number;
    source?: string;
}
/** 解析期数据质量提示（如误录的未来日期） */
export interface DataQualityInfo {
    /** 用于判定「未来」的参考日 YYYY-MM-DD（通常为本地今天） */
    referenceDate: string;
    /** 因日期晚于 referenceDate 而跳过的 Record 条数 */
    skippedFutureCount: number;
    /** 见到的未来日期样本（去重，最多若干条，便于提示） */
    futureSampleDates: string[];
}
/**
 * Apple Watch 日汇总（解析期累加，避免存全部逐条心率）
 * 单位约定：血氧 %、活动 kcal、锻炼/站立/日照 min、呼吸 次/分、VO2 mL/kg/min、腕温 °C
 */
export interface WatchDaySummary {
    activeKcal: number;
    exerciseMin: number;
    standMin: number;
    daylightMin: number;
    /** 站立小时：Stood 次数（AppleStandHour） */
    standHoursStood: number;
    standHoursIdle: number;
    spo2Sum: number;
    spo2Count: number;
    spo2Min: number;
    /** 夜段 0–8 点血氧 */
    spo2NightSum: number;
    spo2NightCount: number;
    spo2NightMin: number;
    /** 日段 8–24 点血氧 */
    spo2DaySum: number;
    spo2DayCount: number;
    spo2DayMin: number;
    rrSum: number;
    rrCount: number;
    nightHrSum: number;
    nightHrCount: number;
    /** 当日最后一条 VO2Max */
    vo2Max?: number;
    wristTempSum: number;
    wristTempCount: number;
    /** 睡眠呼吸紊乱指数类指标（若有） */
    breathingDisturbance?: number;
}
/** 单次 Workout 会话（来自 <Workout> 块，非逐条 Record） */
export interface WorkoutSession {
    startDate: string;
    endDate?: string;
    date: string;
    /** 去前缀后的类型，如 Walking / Running */
    activityType: string;
    /** 中文展示名 */
    activityLabel: string;
    durationMin: number;
    activeKcal?: number;
    distanceKm?: number;
    hrAvg?: number;
    hrMin?: number;
    hrMax?: number;
    avgMets?: number;
    indoor?: boolean;
    source?: string;
}
export interface HealthData {
    cgm: CgmPoint[];
    bloodPressure: BloodPressureRecord[];
    weight: WeightRecord[];
    /** 体脂原始点（finalize 时会尽量合并进 weight.bodyFat） */
    bodyFat: BodyFatPoint[];
    hrv: Record<string, number[]>;
    hrvOvernight: Record<string, number[]>;
    restingHr: Record<string, number>;
    walkingHr: Record<string, number>;
    steps: Record<string, {
        watch: number;
        iphone: number;
        max: number;
    }>;
    sleep: Record<string, {
        total: number;
        deep: number;
        rem: number;
        core: number;
        awake: number;
    }>;
    /** Watch 日汇总 */
    watchDaily: Record<string, WatchDaySummary>;
    /** Workout 会话列表 */
    workouts: WorkoutSession[];
    ecg: ERecordSummary[];
    dataAvailability: DataAvailability;
    dataQuality: DataQualityInfo;
}
export interface ERecordSummary {
    datetime: string;
    classification: string;
    device?: string;
    /** 可选症状自述 */
    symptoms?: string;
}
export interface EcgClassCount {
    classification: string;
    count: number;
}
export interface EcgStats {
    count: number;
    byClassification: EcgClassCount[];
    latest: ERecordSummary | null;
    sinusCount: number;
    highHrCount: number;
    inconclusiveCount: number;
    otherCount: number;
    /** 高心率分类按本地小时 0–23 计数 */
    highHrByHour: number[];
    /** 高心率 ECG 落在任一 Workout 开始时间 ±2h 内的份数 */
    highHrNearWorkoutCount: number;
    /**
     * 启发式「非运动窗口」高心率份数：
     * 小时在 22–08，或附近无 Workout（±2h）
     */
    highHrRestingWindowCount: number;
    /** 最近若干次高心率 ECG 的 datetime（时间升序，最多 5 条） */
    recentHighHr: string[];
    /**
     * 高心率 ECG 落在低活动日的份数：
     * 当日步数 < 3000，且（若有）锻炼分钟 < 10
     */
    highHrOnLowActivityCount: number;
    /**
     * 高心率 ECG 落在高活动日/训练邻域的份数：
     * 步数 ≥ 8000，或锻炼分钟 ≥ 20，或 Workout ±2h
     */
    highHrOnHighActivityCount: number;
}
export interface DataAvailability {
    hasCgm: boolean;
    hasBloodPressure: boolean;
    hasWeight: boolean;
    hasBodyFat: boolean;
    hasHrv: boolean;
    hasHeartRate: boolean;
    hasSteps: boolean;
    hasSleep: boolean;
    hasEcg: boolean;
    hasSpO2: boolean;
    hasRespiratoryRate: boolean;
    hasVo2Max: boolean;
    hasWatchActivity: boolean;
    hasWristTemp: boolean;
    /** Apple Sleeping Breathing Disturbances */
    hasBreathingDisturbance: boolean;
    hasWorkouts: boolean;
}
export interface Stats {
    mean: number;
    std: number;
    cv: number;
    min: number;
    max: number;
    count: number;
}
/** CGM 单段汇总（总体 / 首日 / 稳定期） */
export type CgmSegmentStats = Stats & {
    timeRange: string;
    pctBelow39: number;
    pctBelow30: number;
    pctInRange: number;
    pctAbove78: number;
    pctAbove100: number;
};
export interface CgmStats {
    overall: CgmSegmentStats;
    /** 有数据的第一个日历日（传感器首日，易出现伪影） */
    firstDayDate: string | null;
    firstDay: CgmSegmentStats | null;
    /** 排除首个日历日后的稳定期；若仅一天数据则为 null */
    stable: CgmSegmentStats | null;
    daily: Record<string, Stats & {
        pctBelow39: number;
        pctAbove78: number;
        pctAbove100: number;
    }>;
    maxRises: {
        '30min': {
            rise: number;
            time: string;
        };
        '60min': {
            rise: number;
            time: string;
        };
        '120min': {
            rise: number;
            time: string;
        };
    };
}
export interface BpPeriodMean {
    systolic: number;
    diastolic: number;
    count: number;
    lowCount: number;
}
export interface BloodPressureStats {
    records: BloodPressureRecord[];
    mean7d: BpPeriodMean | null;
    mean14d: BpPeriodMean | null;
    mean30d: BpPeriodMean | null;
    /** 近 7 日晨间（本地时 hour < 12） */
    morning7d: BpPeriodMean | null;
    /** 近 7 日晚间（hour >= 18） */
    evening7d: BpPeriodMean | null;
    /** 近 14 日晨间 */
    morning14d: BpPeriodMean | null;
    /** 近 14 日晚间 */
    evening14d: BpPeriodMean | null;
    lowest: BloodPressureRecord | null;
    highest: BloodPressureRecord | null;
}
/** 单日体重（晨起优先用于趋势） */
export interface DailyWeight {
    date: string;
    /** 用于趋势：优先 12:00 前最早一条，否则全日最早 */
    trend: WeightRecord;
    morning: WeightRecord | null;
    evening: WeightRecord | null;
    allCount: number;
}
export interface WeightStats {
    /** 按日聚合（已按 date 升序） */
    daily: DailyWeight[];
    /** 趋势序列（每日一点） */
    trendSeries: {
        date: string;
        weight: number;
        bodyFat?: number;
    }[];
    rawCount: number;
    dayCount: number;
    latestTrend: {
        date: string;
        weight: number;
        bodyFat?: number;
    } | null;
    earliestTrend: {
        date: string;
        weight: number;
        bodyFat?: number;
    } | null;
    /** 最新晨起体重（若存在） */
    latestMorning: WeightRecord | null;
    bodyFatLatest: number | null;
    bodyFatEarliest: number | null;
    bodyFatDelta: number | null;
    bodyFatDayCount: number;
}
export interface SleepDaySummary {
    total: number;
    deep: number;
    rem: number;
    core: number;
    awake: number;
}
export interface HrvDaySummary {
    allMean: number;
    /** 无夜间样本时为 null（勿用 0 表示） */
    overnightMean: number | null;
    min: number;
    max: number;
    count: number;
}
/** 供展示/提示词的 Watch 日指标（均值已算好） */
export interface WatchDayView {
    date: string;
    activeKcal: number;
    exerciseMin: number;
    standMin: number;
    daylightMin: number;
    standHoursStood: number;
    standHoursIdle: number;
    spo2Mean: number | null;
    spo2Min: number | null;
    spo2NightMean: number | null;
    spo2NightMin: number | null;
    spo2DayMean: number | null;
    spo2DayMin: number | null;
    rrMean: number | null;
    nightHrMean: number | null;
    vo2Max: number | null;
    wristTempMean: number | null;
    breathingDisturbance: number | null;
}
export interface WatchStats {
    days: WatchDayView[];
    /** 近 7 日活动能量日均 */
    activeKcalMean7d: number | null;
    exerciseMinMean7d: number | null;
    spo2Mean7d: number | null;
    /** 近 7 个有样本日的日最低 SpO₂ 中的最小值 */
    spo2Min7d: number | null;
    spo2NightMean7d: number | null;
    spo2NightMin7d: number | null;
    spo2DayMean7d: number | null;
    spo2DayMin7d: number | null;
    rrMean7d: number | null;
    nightHrMean7d: number | null;
    vo2Latest: number | null;
    vo2Earliest: number | null;
    vo2Delta: number | null;
    wristTempMean7d: number | null;
    /** 近 7 个有样本日的睡眠呼吸紊乱日值均值（HealthKit 原始量，越高扰动越多） */
    breathingDisturbanceMean7d: number | null;
    /** 最新一日有样本的睡眠呼吸紊乱值 */
    breathingDisturbanceLatest: number | null;
    daylightMinMean7d: number | null;
    standHoursMean7d: number | null;
    dayCount: number;
    spo2DayCount: number;
    spo2NightDayCount: number;
    vo2DayCount: number;
    /** 有睡眠呼吸紊乱样本的天数 */
    breathingDisturbanceDayCount: number;
}
export interface WorkoutTypeSummary {
    activityType: string;
    activityLabel: string;
    count: number;
    durationMin: number;
    activeKcal: number;
}
/**
 * 恢复 / 负荷评分个人权重（相对比例，正数；缺省按 1.0）。
 * 仅对「有数据的维度」参与加权平均，全 1.0 时与原先等权一致。
 */
export interface RecoveryWeights {
    /** 恢复侧：HRV */
    hrv: number;
    /** 恢复侧：睡眠时长 */
    sleep: number;
    /** 恢复侧：夜间心率（相对静息或绝对） */
    nightHr: number;
    /** 恢复侧：夜段血氧 */
    spo2Night: number;
    /** 负荷侧：锻炼分钟 */
    exercise: number;
    /** 负荷侧：Workout 时长 */
    workout: number;
    /** 负荷侧：步数 */
    steps: number;
}
/** 默认等权（与历史启发式一致） */
export declare const DEFAULT_RECOVERY_WEIGHTS: RecoveryWeights;
/** 恢复权重预设 id */
export type RecoveryWeightPresetId = 'balanced' | 'recoveryFirst' | 'training' | 'weightLoss';
/**
 * 恢复 / 负荷权重预设（相对比例，经 normalizeRecoveryWeights 使用）。
 * balanced 与 DEFAULT_RECOVERY_WEIGHTS 一致。
 */
export declare const RECOVERY_WEIGHT_PRESETS: Record<RecoveryWeightPresetId, RecoveryWeights>;
/** 恢复/负荷评分中的单维构成（0–100 启发式子分 + 权重） */
export interface RecoveryScorePart {
    /** hrv | sleep | nightHr | spo2Night | exercise | workout | steps */
    key: string;
    side: 'recovery' | 'load';
    /** 映射后的 0–100 子分（加权前） */
    score: number;
    /** 用户/预设权重 */
    weight: number;
    /** 原始指标值（如 HRV ms、睡眠 h），无可为 null */
    raw: number | null;
    /** 原始单位说明（ms / h / bpm / % / min / steps） */
    rawUnit: string;
}
/**
 * 近 7 日负荷 / 恢复仪表（启发式，非诊断）
 */
export interface RecoveryWeekStats {
    weekEnd: string;
    hrvMean7d: number | null;
    nightHrMean7d: number | null;
    restingHrMean7d: number | null;
    exerciseMinMean7d: number | null;
    workoutCount7d: number;
    workoutDuration7d: number;
    sleepMean7d: number | null;
    stepsMean7d: number | null;
    standHoursMean7d: number | null;
    daylightMinMean7d: number | null;
    spo2NightMean7d: number | null;
    /** 0–100，越高恢复越好（启发式） */
    recoveryScore: number | null;
    /** 0–100，越高训练/活动负荷越高（启发式） */
    loadScore: number | null;
    /** 人话一句话状态 */
    statusLabel: string;
    statusTone: 'positive' | 'neutral' | 'watch' | 'alert';
    /**
     * 个人基线：此前多周（不含本周）恢复分中位数。
     * 至少 4 个有效周样本时才有值，否则 null。
     */
    baselineRecoveryMedian: number | null;
    /**
     * 本周恢复分相对基线中位的差值（本周 − 中位）。
     * 无基线或本周无恢复分时为 null。
     */
    vsBaselineDelta: number | null;
    /** 各维度子分构成（有数据才出现） */
    components: RecoveryScorePart[];
}
/**
 * 多周恢复/负荷序列点（用于趋势图；字段为周粒度 7d 窗口）
 */
export interface RecoveryWeekPoint {
    weekEnd: string;
    recoveryScore: number | null;
    loadScore: number | null;
    hrvMean7d: number | null;
    nightHrMean7d: number | null;
    exerciseMinMean7d: number | null;
    sleepMean7d: number | null;
    workoutCount7d: number;
    statusLabel?: string;
    statusTone?: string;
}
export interface WorkoutStats {
    sessions: WorkoutSession[];
    count: number;
    totalDurationMin: number;
    totalActiveKcal: number;
    /** 近 30 日场次 */
    count30d: number;
    durationSum30d: number;
    durationMean30d: number | null;
    activeKcalSum30d: number;
    /** 近 7 日场次 / 总分钟 */
    count7d: number;
    durationSum7d: number;
    byType: WorkoutTypeSummary[];
    lastSession: WorkoutSession | null;
    /** 近 30 日均心率（有 HR 的场次） */
    hrAvgMean30d: number | null;
}
export interface FullAnalysis {
    data: HealthData;
    cgmStats: CgmStats | null;
    bpStats: BloodPressureStats | null;
    weightStats: WeightStats | null;
    watchStats: WatchStats | null;
    workoutStats: WorkoutStats | null;
    ecgStats: EcgStats | null;
    recoveryWeek: RecoveryWeekStats | null;
    /** 多周恢复/负荷序列（最旧→最新，默认约 12 周；无数据时 null） */
    recoveryWeeks: RecoveryWeekPoint[] | null;
    hrvByDate: Record<string, HrvDaySummary>;
    restingHrByDate: Record<string, number>;
    walkingHrByDate: Record<string, number>;
    stepsByDate: Record<string, number>;
    sleepByDate: Record<string, SleepDaySummary>;
    dateRange: {
        start: string;
        end: string;
    };
    generatedAt: string;
}
export interface UserContext {
    /** 年龄（岁） */
    age?: number | null;
    /** 性别自述，如 男 / 女 */
    sex?: string | null;
    /** 身高 cm */
    heightCm?: number | null;
    /** 当前用药（自由文本） */
    medications?: string | null;
    /** 已知情况 / 诊断史（自述，非医疗结论） */
    conditions?: string | null;
    /** 目标体重 kg */
    targetWeightKg?: number | null;
    /** 本次最想关注的点 */
    focus?: string | null;
    /** 其他补充说明 */
    notes?: string | null;
}
//# sourceMappingURL=types.d.ts.map