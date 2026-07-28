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
}

// ============================================================
// 解析后的数据维度
// ============================================================

export interface CgmPoint {
  datetime: string;
  value: number; // mmol/L
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
  spo2Sum: number;
  spo2Count: number;
  spo2Min: number;
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
  ecg: ERecordSummary[];
  dataAvailability: DataAvailability;
  dataQuality: DataQualityInfo;
}

export interface ERecordSummary {
  datetime: string;
  classification: string; // "窦性心律" | "高心率" | "记录结果不佳" 等
  device?: string;
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
  spo2Mean: number | null;
  spo2Min: number | null;
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
  rrMean7d: number | null;
  nightHrMean7d: number | null;
  vo2Latest: number | null;
  vo2Earliest: number | null;
  vo2Delta: number | null;
  wristTempMean7d: number | null;
  dayCount: number;
  spo2DayCount: number;
  vo2DayCount: number;
}

export interface FullAnalysis {
  data: HealthData;
  cgmStats: CgmStats | null;
  bpStats: BloodPressureStats | null;
  weightStats: WeightStats | null;
  watchStats: WatchStats | null;
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
