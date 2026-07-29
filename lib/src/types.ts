/**
 * 数据类型定义
 * Apple Health 导出数据的所有结构定义
 */

// ============================================================
// 原始 Record 类型（来自 Apple Health 导出 XML）
// ============================================================

export interface RawRecord {
  type: string;
  source: string;
  startDate: string;
  endDate?: string;
  value: string;
  /** Apple Health Record unit 属性，如 mmol/L、mg/dL */
  unit?: string;
}

// ============================================================
// 解析后的数据维度
// ============================================================

export interface CgmPoint {
  datetime: string;
  /** 规范单位 mmol/L（解析时已转换） */
  value: number;
  /** 原始 unit 字符串（若有） */
  originalUnit?: string;
  /** 转换前的原始数值 */
  originalValue?: number;
  /** unit 缺失/未知，待 finalize 推断 */
  unitPending?: boolean;
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
  bodyFat?: number; // %
  muscleMass?: number;
  bmi?: number;
}

/** 体脂独立点（解析后与体重按日合并） */
export interface BodyFatPoint {
  datetime: string;
  date: string;
  value: number; // %
  source?: string;
}

/** CGM 血糖单位识别与转换摘要 */
export interface CgmUnitInfo {
  /** 导出中见过的原始 unit 字符串（去重） */
  rawUnits: string[];
  /** 明确为 mmol/L 的条数 */
  mmolCount: number;
  /** 由 mg/dL 转换的条数 */
  convertedMgDlCount: number;
  /** unit 缺失或无法识别的条数 */
  unknownUnitCount: number;
  /** 是否对缺失 unit 用数值分布推断 */
  inferredFromValues: boolean;
  /**
   * 单位是否可靠：全部可转为 mmol/L。
   * false 时不应将 CGM 阈值结论视为可信（UI/提示词会降级）。
   */
  reliable: boolean;
  /** 内部规范单位 */
  canonicalUnit: 'mmol/L';
}

/** CGM 采样覆盖与 TIR 方法 */
export type CgmTirMethod = 'time_weighted' | 'sample_share';

export interface CgmCoverage {
  pointCount: number;
  /** 首末点时间跨度（小时） */
  spanHours: number;
  /** 计入统计的有效佩戴时长（小时，间隔上限内） */
  wearHours: number;
  /** wearHours / spanHours * 100；span 过短时为 null */
  coveragePct: number | null;
  /** 相邻采样间隔中位数（分钟） */
  medianIntervalMin: number | null;
  /** 超过 maxGap 的间隔数 */
  gapCount: number;
  /** 允许计入的最大间隔（分钟） */
  maxGapMin: number;
  /** 主展示 TIR 所用方法 */
  tirMethod: CgmTirMethod;
  /**
   * 时间加权 TIR 是否足够可靠：
   * 覆盖率与采样间隔大致符合 CGM 连续监测假设
   */
  reliableTir: boolean;
}

/** 解析期数据质量提示（如误录的未来日期） */
export interface DataQualityInfo {
  /** 用于判定「未来」的参考日 YYYY-MM-DD（通常为本地今天） */
  referenceDate: string;
  /** 因日期晚于 referenceDate 而跳过的 Record 条数 */
  skippedFutureCount: number;
  /** 见到的未来日期样本（去重，最多若干条，便于提示） */
  futureSampleDates: string[];
  /** CGM 单位识别/转换；无 CGM 时为 null/undefined */
  cgmUnit?: CgmUnitInfo | null;
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
  hrv: Record<string, number[]>;          // date -> values
  hrvOvernight: Record<string, number[]>; // date -> values [00:00, 09:00)
  restingHr: Record<string, number>;
  walkingHr: Record<string, number>;
  steps: Record<string, { watch: number; iphone: number; max: number }>;
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
  classification: string; // "窦性心律" | "高心率" | "记录结果不佳" 等
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

// ============================================================
// 统计指标
// ============================================================

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
  /** 主展示占比的计算方法 */
  tirMethod?: CgmTirMethod;
  /** 对照：纯采样点占比 TIR（3.9–10.0） */
  samplePctInRange?: number;
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
    '30min': { rise: number; time: string };
    '60min': { rise: number; time: string };
    '120min': { rise: number; time: string };
  };
  /** 全程采样覆盖与 TIR 方法说明 */
  coverage: CgmCoverage;
  /**
   * 单位是否可靠（来自 dataQuality.cgmUnit）。
   * false 时阈值结论应降级展示。
   */
  unitReliable: boolean;
}

export interface BpPeriodMean {
  systolic: number;
  diastolic: number;
  /** 窗口内读数条数 */
  count: number;
  lowCount: number;
  /** 窗口内有读数的自然日数 */
  daysWithData: number;
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
  trendSeries: { date: string; weight: number; bodyFat?: number }[];
  rawCount: number;
  dayCount: number;
  latestTrend: { date: string; weight: number; bodyFat?: number } | null;
  earliestTrend: { date: string; weight: number; bodyFat?: number } | null;
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
  /** 近 7 自然日活动能量日均（以末日为截止的日历窗） */
  activeKcalMean7d: number | null;
  exerciseMinMean7d: number | null;
  spo2Mean7d: number | null;
  /** 近 7 自然日内有样本日的日最低 SpO₂ 中的最小值 */
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
  /** 近 7 自然日内睡眠呼吸紊乱日值均值（HealthKit 原始量，越高扰动越多） */
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
  /** 近 7 自然日内至少有一项 Watch 指标的自然日数 */
  daysWithData7d?: number;
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
export const DEFAULT_RECOVERY_WEIGHTS: RecoveryWeights = {
  hrv: 1,
  sleep: 1,
  nightHr: 1,
  spo2Night: 1,
  exercise: 1,
  workout: 1,
  steps: 1,
};

/** 恢复权重预设 id */
export type RecoveryWeightPresetId =
  | 'balanced'
  | 'recoveryFirst'
  | 'training'
  | 'weightLoss';

/**
 * 恢复 / 负荷权重预设（相对比例，经 normalizeRecoveryWeights 使用）。
 * balanced 与 DEFAULT_RECOVERY_WEIGHTS 一致。
 */
export const RECOVERY_WEIGHT_PRESETS: Record<
  RecoveryWeightPresetId,
  RecoveryWeights
> = {
  balanced: {
    hrv: 1,
    sleep: 1,
    nightHr: 1,
    spo2Night: 1,
    exercise: 1,
    workout: 1,
    steps: 1,
  },
  /** 恢复优先：抬高 HRV/睡眠/夜心率/夜血氧，略降负荷侧 */
  recoveryFirst: {
    hrv: 1.4,
    sleep: 1.4,
    nightHr: 1.2,
    spo2Night: 1.1,
    exercise: 0.8,
    workout: 0.7,
    steps: 0.8,
  },
  /** 训练期：抬高锻炼/Workout/步数，略降部分恢复侧 */
  training: {
    hrv: 0.9,
    sleep: 1.0,
    nightHr: 0.9,
    spo2Night: 0.8,
    exercise: 1.3,
    workout: 1.4,
    steps: 1.2,
  },
  /** 减脂：抬高步数/锻炼与睡眠 */
  weightLoss: {
    hrv: 1.0,
    sleep: 1.2,
    nightHr: 1.0,
    spo2Night: 1.0,
    exercise: 1.2,
    workout: 1.0,
    steps: 1.3,
  },
};

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
 * 窗口语义：以 weekEnd 为末日的最近 7 个自然日 [windowStart, weekEnd]。
 */
export interface RecoveryWeekStats {
  weekEnd: string;
  /** 近 7 自然日窗口起始（含） */
  windowStart: string;
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
  /**
   * 0–100，越高恢复越好（启发式）。
   * 有 ≥28 天/≥4 周个人历史时以个人基线偏离为主导；覆盖不足时可为 null。
   */
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
  /** 各维度子分构成（有原始指标即可出现；总分 null 时仍可返回） */
  components: RecoveryScorePart[];
  /** 近 7 自然日内至少有一项恢复/负荷相关数据的自然日数 */
  daysWithData: number;
  /** 是否以个人基线（中位/分位）主导了恢复侧评分 */
  usedPersonalBaseline: boolean;
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
  dateRange: { start: string; end: string };
  generatedAt: string;
}

// ============================================================
// 可选个人上下文（仅本地填写，注入提示词，不上传）
// ============================================================

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
