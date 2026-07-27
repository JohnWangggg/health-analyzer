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
  bodyFat?: number;
  muscleMass?: number;
  bmi?: number;
}

export interface HealthData {
  cgm: CgmPoint[];
  bloodPressure: BloodPressureRecord[];
  weight: WeightRecord[];
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
  ecg: ERecordSummary[];
  dataAvailability: DataAvailability;
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
  hasHrv: boolean;
  hasHeartRate: boolean;
  hasSteps: boolean;
  hasSleep: boolean;
  hasEcg: boolean;
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

export interface CgmStats {
  overall: Stats & {
    timeRange: string;
    pctBelow39: number;
    pctBelow30: number;
    pctInRange: number;
    pctAbove78: number;
    pctAbove100: number;
  };
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

export interface BloodPressureStats {
  records: BloodPressureRecord[];
  mean7d: { systolic: number; diastolic: number; count: number; lowCount: number } | null;
  mean14d: { systolic: number; diastolic: number; count: number; lowCount: number } | null;
  mean30d: { systolic: number; diastolic: number; count: number; lowCount: number } | null;
  lowest: BloodPressureRecord | null;
  highest: BloodPressureRecord | null;
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
  overnightMean: number;
  min: number;
  max: number;
  count: number;
}

export interface FullAnalysis {
  data: HealthData;
  cgmStats: CgmStats | null;
  bpStats: BloodPressureStats | null;
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