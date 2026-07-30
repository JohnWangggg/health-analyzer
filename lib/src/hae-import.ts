/**
 * Health Auto Export (HAE) JSON/CSV 增量导入
 * 用户本地选文件，解析后合并进 HealthData（去重 + 统计，未知指标必上报）
 * v1.40 core — 无服务端、无实时告警、无诊断
 */

import {
  HealthData,
  WatchDaySummary,
  WorkoutSession,
  CgmPoint,
  BloodPressureRecord,
  WeightRecord,
  BodyFatPoint,
} from './types';
import {
  getDate,
  getHour,
  finalizeData,
  parseAppleDate,
  shortWorkoutType,
  workoutTypeLabel,
} from './parser';
import {
  classifyGlucoseUnit,
  emptyCgmUnitInfo,
  noteRawUnit,
  toMmolL,
  inferGlucoseUnitFromValues,
} from './glucose';

// ============================================================
// 公开类型
// ============================================================

export interface HaeFileInput {
  name: string;
  text: string;
}

export interface HaeUnknownMetric {
  name: string;
  sampleCount: number;
  units?: string;
  sampleDates?: string[];
}

export interface HaeDomainDelta {
  added: number;
  updated: number;
  skipped: number;
}

export interface HaeImportStats {
  sourceFormat: 'json' | 'csv' | 'mixed' | 'empty';
  files: string[];
  totalAdded: number;
  totalUpdated: number;
  totalSkipped: number;
  byDomain: Record<string, HaeDomainDelta>;
  knownMetrics: string[];
  unknownMetrics: HaeUnknownMetric[];
  notes: string[];
}

export interface HaeMergeOptions {
  /** 用户选择强制纳入的未知指标名；v1.40 可仅上报不落库 */
  includeUnknown?: string[];
  /** 是否导入 workouts，默认 true（有 workouts 时） */
  includeWorkouts?: boolean;
}

/** 解析后的通用 metric 块 */
export interface HaeParsedMetric {
  name: string;
  units?: string;
  data: Record<string, unknown>[];
}

export interface HaeParsedWorkout {
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
  name?: string;
  activityType?: string;
  workoutActivityType?: string;
  duration?: number;
  durationMin?: number;
  activeEnergyBurned?: number;
  activeEnergy?: number;
  totalEnergyBurned?: number;
  distance?: number;
  distanceKm?: number;
  avgHeartRate?: number;
  hrAvg?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  avgMets?: number;
  indoor?: boolean;
  source?: string;
  [key: string]: unknown;
}

// ============================================================
// 已知指标映射
// ============================================================

/** HAE snake_case / 规范化名 → 内部 domain */
const KNOWN_METRIC_DOMAIN: Record<string, string> = {
  blood_glucose: 'cgm',
  blood_pressure: 'bloodPressure',
  weight_body_mass: 'weight',
  body_mass: 'weight',
  body_weight: 'weight',
  weight: 'weight',
  body_fat_percentage: 'bodyFat',
  body_fat: 'bodyFat',
  body_mass_index: 'weight',
  bmi: 'weight',
  heart_rate_variability: 'hrv',
  heart_rate_variability_sdnn: 'hrv',
  hrv: 'hrv',
  resting_heart_rate: 'restingHr',
  walking_heart_rate: 'walkingHr',
  walking_heart_rate_average: 'walkingHr',
  heart_rate: 'watch',
  step_count: 'steps',
  steps: 'steps',
  sleep_analysis: 'sleep',
  sleep: 'sleep',
  active_energy: 'watch',
  active_energy_burned: 'watch',
  apple_exercise_time: 'watch',
  exercise_time: 'watch',
  apple_stand_time: 'watch',
  stand_time: 'watch',
  apple_stand_hour: 'watch',
  stand_hour: 'watch',
  time_in_daylight: 'watch',
  blood_oxygen_saturation: 'watch',
  oxygen_saturation: 'watch',
  spo2: 'watch',
  respiratory_rate: 'watch',
  vo2max: 'watch',
  vo2_max: 'watch',
  apple_sleeping_wrist_temperature: 'watch',
  sleeping_wrist_temperature: 'watch',
  wrist_temperature: 'watch',
  breathing_disturbances: 'watch',
  apple_sleeping_breathing_disturbances: 'watch',
};

/** 规范化名 → watch 子字段（日汇总类） */
type WatchField =
  | 'activeKcal'
  | 'exerciseMin'
  | 'standMin'
  | 'daylightMin'
  | 'standHoursStood'
  | 'spo2'
  | 'rr'
  | 'vo2Max'
  | 'wristTemp'
  | 'breathingDisturbance'
  | 'nightHr';

const WATCH_FIELD_BY_METRIC: Record<string, WatchField> = {
  active_energy: 'activeKcal',
  active_energy_burned: 'activeKcal',
  apple_exercise_time: 'exerciseMin',
  exercise_time: 'exerciseMin',
  apple_stand_time: 'standMin',
  stand_time: 'standMin',
  apple_stand_hour: 'standHoursStood',
  stand_hour: 'standHoursStood',
  time_in_daylight: 'daylightMin',
  blood_oxygen_saturation: 'spo2',
  oxygen_saturation: 'spo2',
  spo2: 'spo2',
  respiratory_rate: 'rr',
  vo2max: 'vo2Max',
  vo2_max: 'vo2Max',
  apple_sleeping_wrist_temperature: 'wristTemp',
  sleeping_wrist_temperature: 'wristTemp',
  wrist_temperature: 'wristTemp',
  breathing_disturbances: 'breathingDisturbance',
  apple_sleeping_breathing_disturbances: 'breathingDisturbance',
  heart_rate: 'nightHr',
};

// ============================================================
// 工具
// ============================================================

/** 规范化 HAE 指标名：小写、空格→下划线、去多余符号 */
export function normalizeHaeMetricName(name: string): string {
  if (!name) return '';
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[%]/g, '')
    .replace(/[/\-]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function isKnownMetric(name: string): boolean {
  return Boolean(KNOWN_METRIC_DOMAIN[name]);
}

function domainOf(name: string): string | undefined {
  return KNOWN_METRIC_DOMAIN[name];
}

function emptyDelta(): HaeDomainDelta {
  return { added: 0, updated: 0, skipped: 0 };
}

function ensureDomain(stats: HaeImportStats, domain: string): HaeDomainDelta {
  if (!stats.byDomain[domain]) stats.byDomain[domain] = emptyDelta();
  return stats.byDomain[domain];
}

function bump(
  stats: HaeImportStats,
  domain: string,
  kind: 'added' | 'updated' | 'skipped',
  n = 1
): void {
  const d = ensureDomain(stats, domain);
  d[kind] += n;
  if (kind === 'added') stats.totalAdded += n;
  else if (kind === 'updated') stats.totalUpdated += n;
  else stats.totalSkipped += n;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

function sameMinute(a: string, b: string): boolean {
  return a.slice(0, 16) === b.slice(0, 16);
}

/** datetime 前 16 位：`YYYY-MM-DD HH:MM`，用于分钟级去重索引 */
function minuteKey(dt: string): string {
  return dt.slice(0, 16);
}

function approxEq(a: number, b: number, eps = 0.05): boolean {
  return Math.abs(a - b) < eps;
}

/** 在分钟桶内查找近似相等数值（列表通常很短） */
function hasApproxInList(values: number[] | undefined, value: number, eps: number): boolean {
  if (!values || values.length === 0) return false;
  for (let i = 0; i < values.length; i++) {
    if (approxEq(values[i], value, eps)) return true;
  }
  return false;
}

function pushToMinuteValues(map: Map<string, number[]>, key: string, value: number): void {
  let arr = map.get(key);
  if (!arr) {
    arr = [];
    map.set(key, arr);
  }
  arr.push(value);
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/%/g, '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** 规范化日期时间字符串为可排序形式 */
function normalizeDt(raw: unknown): string | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // ISO → 空格
  s = s.replace('T', ' ');
  // 去掉毫秒
  s = s.replace(/(\d{2}:\d{2}:\d{2})\.\d+/, '$1');
  // 时区 +08:00 → +0800
  s = s.replace(/([+-]\d{2}):(\d{2})$/, '$1$2');
  // 仅日期
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s} 00:00:00 +0000`;
  }
  // 有日期时间无时区
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
    if (s.length === 16) s = `${s}:00`;
    return `${s} +0000`;
  }
  // 已有时区或 Z
  if (/^\d{4}-\d{2}-\d{2} /.test(s) || /^\d{4}-\d{2}-\d{2}T/.test(String(raw))) {
    if (s.endsWith('Z')) s = s.replace(/Z$/, ' +0000');
    return s;
  }
  return s;
}

function dateFromPoint(pt: Record<string, unknown>): string | null {
  const raw =
    pt.date ?? pt.Date ?? pt.DateTime ?? pt.datetime ?? pt.startDate ?? pt.start ?? pt['测量日期时间'];
  const dt = normalizeDt(raw);
  if (!dt) return null;
  return getDate(dt);
}

function datetimeFromPoint(pt: Record<string, unknown>): string | null {
  const raw =
    pt.date ?? pt.Date ?? pt.DateTime ?? pt.datetime ?? pt.startDate ?? pt.start ?? pt['测量日期时间'];
  return normalizeDt(raw);
}

function qtyFromPoint(pt: Record<string, unknown>): number | null {
  // 优先 qty / value；HR 聚合用 Avg / avg
  const candidates = [
    pt.qty,
    pt.value,
    pt.Value,
    pt.Avg,
    pt.avg,
    pt.average,
    pt['数量'],
  ];
  for (const c of candidates) {
    const n = parseNum(c);
    if (n != null) return n;
  }
  return null;
}

function ensureWatchDay(data: HealthData, date: string): WatchDaySummary {
  if (!data.watchDaily) data.watchDaily = {};
  if (!data.watchDaily[date]) {
    data.watchDaily[date] = {
      activeKcal: 0,
      exerciseMin: 0,
      standMin: 0,
      daylightMin: 0,
      standHoursStood: 0,
      standHoursIdle: 0,
      spo2Sum: 0,
      spo2Count: 0,
      spo2Min: Infinity,
      spo2NightSum: 0,
      spo2NightCount: 0,
      spo2NightMin: Infinity,
      spo2DaySum: 0,
      spo2DayCount: 0,
      spo2DayMin: Infinity,
      rrSum: 0,
      rrCount: 0,
      nightHrSum: 0,
      nightHrCount: 0,
      wristTempSum: 0,
      wristTempCount: 0,
    };
  }
  const w = data.watchDaily[date];
  if (w.spo2NightMin == null) w.spo2NightMin = Infinity;
  if (w.spo2DayMin == null) w.spo2DayMin = Infinity;
  if (w.spo2NightSum == null) w.spo2NightSum = 0;
  if (w.spo2NightCount == null) w.spo2NightCount = 0;
  if (w.spo2DaySum == null) w.spo2DaySum = 0;
  if (w.spo2DayCount == null) w.spo2DayCount = 0;
  if (w.standHoursStood == null) w.standHoursStood = 0;
  if (w.standHoursIdle == null) w.standHoursIdle = 0;
  return w;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function basenameNoExt(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  return base.replace(/\.(json|csv|txt)$/i, '');
}

function detectMetricFromFileName(fileName: string): string {
  return normalizeHaeMetricName(basenameNoExt(fileName));
}

// ============================================================
// 解析 JSON
// ============================================================

function extractMetricsArray(root: unknown): {
  metrics: HaeParsedMetric[];
  workouts: HaeParsedWorkout[];
  notes: string[];
} {
  const notes: string[] = [];
  const metrics: HaeParsedMetric[] = [];
  let workouts: HaeParsedWorkout[] = [];

  if (root == null) {
    notes.push('JSON 根为空');
    return { metrics, workouts, notes };
  }

  // 根是 metrics 数组
  if (Array.isArray(root)) {
    for (const item of root) {
      if (item && typeof item === 'object' && 'name' in item) {
        const m = item as { name: string; units?: string; data?: unknown[] };
        metrics.push({
          name: normalizeHaeMetricName(m.name),
          units: m.units,
          data: Array.isArray(m.data)
            ? (m.data.filter((d) => d && typeof d === 'object') as Record<string, unknown>[])
            : [],
        });
      }
    }
    return { metrics, workouts, notes };
  }

  if (typeof root !== 'object') {
    notes.push('JSON 根类型无法识别');
    return { metrics, workouts, notes };
  }

  const obj = root as Record<string, unknown>;
  // { data: { metrics, workouts, ... } }
  const dataBlock =
    obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)
      ? (obj.data as Record<string, unknown>)
      : obj;

  const rawMetrics = dataBlock.metrics ?? obj.metrics;
  if (Array.isArray(rawMetrics)) {
    for (const item of rawMetrics) {
      if (!item || typeof item !== 'object') continue;
      const m = item as { name?: string; units?: string; data?: unknown[] };
      if (!m.name) continue;
      metrics.push({
        name: normalizeHaeMetricName(m.name),
        units: m.units,
        data: Array.isArray(m.data)
          ? (m.data.filter((d) => d && typeof d === 'object') as Record<string, unknown>[])
          : [],
      });
    }
  }

  const rawWorkouts = dataBlock.workouts ?? obj.workouts;
  if (Array.isArray(rawWorkouts)) {
    workouts = rawWorkouts.filter((w) => w && typeof w === 'object') as HaeParsedWorkout[];
  }

  if (!metrics.length && !workouts.length) {
    notes.push('JSON 中未找到 metrics / workouts');
  }

  return { metrics, workouts, notes };
}

export function parseHaeJson(
  text: string,
  fileName?: string
): { metrics: HaeParsedMetric[]; workouts?: HaeParsedWorkout[]; notes: string[] } {
  const notes: string[] = [];
  const trimmed = stripBom(text).trim();
  if (!trimmed) {
    notes.push(fileName ? `${fileName}: 空文件` : '空 JSON');
    return { metrics: [], workouts: [], notes };
  }
  let root: unknown;
  try {
    root = JSON.parse(trimmed);
  } catch (e) {
    notes.push(
      fileName
        ? `${fileName}: JSON 解析失败 (${(e as Error).message})`
        : `JSON 解析失败 (${(e as Error).message})`
    );
    return { metrics: [], workouts: [], notes };
  }
  const extracted = extractMetricsArray(root);
  notes.push(...extracted.notes);
  return {
    metrics: extracted.metrics,
    workouts: extracted.workouts,
    notes,
  };
}

// ============================================================
// 解析 CSV
// ============================================================

export function parseHaeCsvFile(
  fileName: string,
  text: string
): { metrics: HaeParsedMetric[]; notes: string[] } {
  const notes: string[] = [];
  const lines = stripBom(text)
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 2) {
    notes.push(`${fileName}: CSV 行数不足`);
    return { metrics: [], notes };
  }

  const header = parseCsvLine(lines[0]);
  const headerLower = header.map((h) => h.toLowerCase().trim());

  const findCol = (names: string[]): number => {
    for (const n of names) {
      const i = headerLower.findIndex((h) => h === n || h.includes(n));
      if (i >= 0) return i;
    }
    return -1;
  };

  const iDt = findCol(['测量日期时间', 'datetime', 'date', 'date/time', 'time', '日期时间', '日期']);
  const iQty = findCol(['qty', 'value', '数量', 'val', 'amount', 'count']);
  const iSys = findCol(['systolic', 'sys', '高压', '收缩']);
  const iDia = findCol(['diastolic', 'dia', '低压', '舒张']);
  const iUnits = findCol(['units', 'unit', '单位']);
  const iName = findCol(['name', 'metric', 'type', '指标']);

  if (iDt < 0) {
    notes.push(`${fileName}: 未找到日期列`);
    return { metrics: [], notes };
  }

  const metricFromFile = detectMetricFromFileName(fileName);
  const isBpHint =
    metricFromFile === 'blood_pressure' ||
    metricFromFile.includes('blood_pressure') ||
    (iSys >= 0 && iDia >= 0);

  // 多指标 CSV：有 name 列时按 name 分组
  if (iName >= 0) {
    const byName = new Map<string, { units?: string; data: Record<string, unknown>[] }>();
    for (let r = 1; r < lines.length; r++) {
      const cols = parseCsvLine(lines[r]);
      const nm = normalizeHaeMetricName(cols[iName] || '');
      if (!nm) continue;
      const dt = normalizeDt(cols[iDt]);
      if (!dt) continue;
      const pt: Record<string, unknown> = { date: dt };
      if (iQty >= 0 && cols[iQty] !== undefined) pt.qty = parseNum(cols[iQty]) ?? cols[iQty];
      if (iSys >= 0 && cols[iSys] !== undefined) pt.systolic = parseNum(cols[iSys]);
      if (iDia >= 0 && cols[iDia] !== undefined) pt.diastolic = parseNum(cols[iDia]);
      let units: string | undefined;
      if (iUnits >= 0 && cols[iUnits]) units = cols[iUnits];
      if (!byName.has(nm)) byName.set(nm, { units, data: [] });
      const bucket = byName.get(nm)!;
      if (units && !bucket.units) bucket.units = units;
      bucket.data.push(pt);
    }
    const metrics: HaeParsedMetric[] = [];
    for (const [name, v] of byName) {
      metrics.push({ name, units: v.units, data: v.data });
    }
    if (!metrics.length) notes.push(`${fileName}: 无有效数据行`);
    return { metrics, notes };
  }

  // 单指标 CSV
  let metricName = metricFromFile;
  if (isBpHint && iSys >= 0 && iDia >= 0) {
    metricName = 'blood_pressure';
  } else if (!metricName || metricName === 'export' || metricName === 'data') {
    // 无法从文件名推断
    if (iSys >= 0 && iDia >= 0) metricName = 'blood_pressure';
    else metricName = 'unknown_csv_metric';
  }

  let units: string | undefined;
  const data: Record<string, unknown>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cols = parseCsvLine(lines[r]);
    if (!cols[iDt]) continue;
    const dt = normalizeDt(cols[iDt]);
    if (!dt) continue;
    const pt: Record<string, unknown> = { date: dt };
    if (metricName === 'blood_pressure' && iSys >= 0 && iDia >= 0) {
      const sys = parseNum(cols[iSys]);
      const dia = parseNum(cols[iDia]);
      if (sys == null || dia == null) continue;
      pt.systolic = sys;
      pt.diastolic = dia;
    } else if (iQty >= 0) {
      const q = parseNum(cols[iQty]);
      if (q == null) continue;
      pt.qty = q;
    } else {
      continue;
    }
    if (iUnits >= 0 && cols[iUnits] && !units) units = cols[iUnits];
    data.push(pt);
  }

  if (!data.length) {
    notes.push(`${fileName}: 无有效数据行`);
    return { metrics: [], notes };
  }

  return {
    metrics: [{ name: metricName, units, data }],
    notes,
  };
}

// ============================================================
// 聚合多文件
// ============================================================

export function parseHaeInputs(files: HaeFileInput[]): {
  metrics: HaeParsedMetric[];
  workouts?: HaeParsedWorkout[];
  sourceFormat: HaeImportStats['sourceFormat'];
  files: string[];
  notes: string[];
} {
  const notes: string[] = [];
  const fileNames: string[] = [];
  const metricMap = new Map<string, HaeParsedMetric>();
  const workouts: HaeParsedWorkout[] = [];
  let hasJson = false;
  let hasCsv = false;

  for (const f of files || []) {
    if (!f || f.text == null) continue;
    const name = f.name || 'unknown';
    fileNames.push(name);
    const lower = name.toLowerCase();
    const isJson =
      lower.endsWith('.json') ||
      (!lower.endsWith('.csv') && stripBom(f.text).trim().startsWith('{')) ||
      stripBom(f.text).trim().startsWith('[');
    const isCsv = lower.endsWith('.csv') || (!isJson && f.text.includes(','));

    if (isJson && !lower.endsWith('.csv')) {
      hasJson = true;
      const parsed = parseHaeJson(f.text, name);
      notes.push(...parsed.notes);
      for (const m of parsed.metrics) {
        const existing = metricMap.get(m.name);
        if (existing) {
          existing.data.push(...m.data);
          if (!existing.units && m.units) existing.units = m.units;
        } else {
          metricMap.set(m.name, { name: m.name, units: m.units, data: [...m.data] });
        }
      }
      if (parsed.workouts?.length) workouts.push(...parsed.workouts);
    } else if (isCsv || lower.endsWith('.csv')) {
      hasCsv = true;
      const parsed = parseHaeCsvFile(name, f.text);
      notes.push(...parsed.notes);
      for (const m of parsed.metrics) {
        const existing = metricMap.get(m.name);
        if (existing) {
          existing.data.push(...m.data);
          if (!existing.units && m.units) existing.units = m.units;
        } else {
          metricMap.set(m.name, { name: m.name, units: m.units, data: [...m.data] });
        }
      }
    } else {
      // 尝试 JSON 再 CSV
      const t = stripBom(f.text).trim();
      if (t.startsWith('{') || t.startsWith('[')) {
        hasJson = true;
        const parsed = parseHaeJson(f.text, name);
        notes.push(...parsed.notes);
        for (const m of parsed.metrics) {
          const existing = metricMap.get(m.name);
          if (existing) {
            existing.data.push(...m.data);
            if (!existing.units && m.units) existing.units = m.units;
          } else {
            metricMap.set(m.name, { name: m.name, units: m.units, data: [...m.data] });
          }
        }
        if (parsed.workouts?.length) workouts.push(...parsed.workouts);
      } else {
        hasCsv = true;
        const parsed = parseHaeCsvFile(name, f.text);
        notes.push(...parsed.notes);
        for (const m of parsed.metrics) {
          const existing = metricMap.get(m.name);
          if (existing) {
            existing.data.push(...m.data);
            if (!existing.units && m.units) existing.units = m.units;
          } else {
            metricMap.set(m.name, { name: m.name, units: m.units, data: [...m.data] });
          }
        }
      }
    }
  }

  let sourceFormat: HaeImportStats['sourceFormat'] = 'empty';
  if (hasJson && hasCsv) sourceFormat = 'mixed';
  else if (hasJson) sourceFormat = 'json';
  else if (hasCsv) sourceFormat = 'csv';
  else if (fileNames.length === 0) sourceFormat = 'empty';

  return {
    metrics: [...metricMap.values()],
    workouts: workouts.length ? workouts : undefined,
    sourceFormat,
    files: fileNames,
    notes,
  };
}

// ============================================================
// 合并各 domain
// ============================================================

function mergeCgm(
  data: HealthData,
  points: Record<string, unknown>[],
  units: string | undefined,
  stats: HaeImportStats
): void {
  if (!data.dataQuality.cgmUnit) {
    data.dataQuality.cgmUnit = emptyCgmUnitInfo();
  }
  const meta = data.dataQuality.cgmUnit;
  noteRawUnit(meta, units);

  // 预扫描未知单位时的数值，便于推断
  const kindFromUnits = classifyGlucoseUnit(units);
  let inferred: ReturnType<typeof classifyGlucoseUnit> | null = null;
  if (kindFromUnits === 'unknown') {
    const raws: number[] = [];
    for (const pt of points) {
      const q = qtyFromPoint(pt);
      if (q != null) raws.push(q);
    }
    inferred = inferGlucoseUnitFromValues(raws);
  }

  // 分钟 → 已有 value 列表；避免 data.cgm.find O(n) 导致大批量 O(n²)
  const byMinute = new Map<string, number[]>();
  for (const c of data.cgm) {
    pushToMinuteValues(byMinute, minuteKey(c.datetime), c.value);
  }

  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    const qty = qtyFromPoint(pt);
    if (!datetime || qty == null) {
      bump(stats, 'cgm', 'skipped');
      continue;
    }

    let kind = kindFromUnits;
    if (kind === 'unknown' && inferred && inferred !== 'unknown') {
      kind = inferred;
    }
    // 数值启发式：无 unit 时 > 40 多半 mg/dL
    if (kind === 'unknown' && qty >= 40) kind = 'mg/dL';
    if (kind === 'unknown' && qty <= 25) kind = 'mmol/L';

    let value: number;
    let originalValue = qty;
    let unitPending = false;
    if (kind === 'mg/dL') {
      value = toMmolL(qty, 'mg/dL');
      meta.convertedMgDlCount += 1;
    } else if (kind === 'mmol/L') {
      value = qty;
      meta.mmolCount += 1;
    } else {
      value = qty;
      unitPending = true;
      meta.unknownUnitCount += 1;
    }

    const mk = minuteKey(datetime);
    if (hasApproxInList(byMinute.get(mk), value, 0.02)) {
      bump(stats, 'cgm', 'skipped');
      continue;
    }
    const rec: CgmPoint = {
      datetime,
      value,
      originalUnit: units,
      originalValue,
    };
    if (unitPending) rec.unitPending = true;
    data.cgm.push(rec);
    pushToMinuteValues(byMinute, mk, value);
    data.dataAvailability.hasCgm = true;
    bump(stats, 'cgm', 'added');
  }
}

function mergeBloodPressure(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  // 同分钟 或 同日同收缩/舒张压 → skip
  const minutes = new Set<string>();
  const dateSysDia = new Set<string>();
  for (const b of data.bloodPressure) {
    minutes.add(minuteKey(b.datetime));
    dateSysDia.add(`${b.date}|${b.systolic}|${b.diastolic}`);
  }

  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    if (!datetime) {
      bump(stats, 'bloodPressure', 'skipped');
      continue;
    }
    const date = getDate(datetime);
    const sys = parseNum(pt.systolic ?? pt.Systolic ?? pt.sys);
    const dia = parseNum(pt.diastolic ?? pt.Diastolic ?? pt.dia);
    if (sys == null || dia == null) {
      bump(stats, 'bloodPressure', 'skipped');
      continue;
    }
    if (sys < 50 || sys > 250 || dia < 30 || dia > 150) {
      bump(stats, 'bloodPressure', 'skipped');
      continue;
    }
    const mk = minuteKey(datetime);
    const dsd = `${date}|${sys}|${dia}`;
    if (minutes.has(mk) || dateSysDia.has(dsd)) {
      bump(stats, 'bloodPressure', 'skipped');
      continue;
    }
    const rec: BloodPressureRecord = { datetime, date, systolic: sys, diastolic: dia };
    data.bloodPressure.push(rec);
    minutes.add(mk);
    dateSysDia.add(dsd);
    data.dataAvailability.hasBloodPressure = true;
    bump(stats, 'bloodPressure', 'added');
  }
}

function mergeWeight(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats,
  mode: 'mass' | 'bmi'
): void {
  // 按日索引：同日条目通常很少，查找仍为线性但不再扫全量 weight
  const byDate = new Map<string, WeightRecord[]>();
  for (const w of data.weight) {
    let arr = byDate.get(w.date);
    if (!arr) {
      arr = [];
      byDate.set(w.date, arr);
    }
    arr.push(w);
  }

  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    if (!datetime) {
      bump(stats, 'weight', 'skipped');
      continue;
    }
    const date = getDate(datetime);

    if (mode === 'bmi') {
      const bmi = qtyFromPoint(pt);
      if (bmi == null || bmi < 10 || bmi > 80) {
        bump(stats, 'weight', 'skipped');
        continue;
      }
      // 尝试填到同日体重
      const sameDay = byDate.get(date) || [];
      if (sameDay.length) {
        let updated = false;
        for (const w of sameDay) {
          if (w.bmi == null) {
            w.bmi = bmi;
            updated = true;
          }
        }
        if (updated) bump(stats, 'weight', 'updated');
        else bump(stats, 'weight', 'skipped');
      } else {
        // 无体重时跳过纯 BMI（无法成有效 WeightRecord 的 value）
        bump(stats, 'weight', 'skipped');
      }
      continue;
    }

    const value = qtyFromPoint(pt);
    if (value == null || value < 20 || value > 300) {
      bump(stats, 'weight', 'skipped');
      continue;
    }
    const bodyFat = parseNum(pt.bodyFat ?? pt.body_fat ?? pt.fat);
    const bmi = parseNum(pt.bmi ?? pt.BMI);

    // sameMinute 隐含同日（YYYY-MM-DD HH:MM），在日桶内保持与 find 相同的首次命中语义
    const dayList = byDate.get(date);
    const hit = dayList?.find(
      (w) => sameMinute(w.datetime, datetime) || approxEq(w.value, value, 0.05)
    );
    if (hit) {
      let updated = false;
      if (hit.bodyFat == null && bodyFat != null && bodyFat > 0 && bodyFat < 80) {
        hit.bodyFat = bodyFat;
        updated = true;
      }
      if (hit.bmi == null && bmi != null) {
        hit.bmi = bmi;
        updated = true;
      }
      if (updated) bump(stats, 'weight', 'updated');
      else bump(stats, 'weight', 'skipped');
      continue;
    }

    const rec: WeightRecord = { datetime, date, value };
    if (bodyFat != null && bodyFat > 0 && bodyFat < 80) rec.bodyFat = bodyFat;
    if (bmi != null) rec.bmi = bmi;
    data.weight.push(rec);
    let arr = byDate.get(date);
    if (!arr) {
      arr = [];
      byDate.set(date, arr);
    }
    arr.push(rec);
    data.dataAvailability.hasWeight = true;
    if (rec.bodyFat != null) data.dataAvailability.hasBodyFat = true;
    bump(stats, 'weight', 'added');
  }
}

function mergeBodyFat(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  // 同日体重：sameMinute || same date → 日桶内首次命中（与 find 一致）
  const weightByDate = new Map<string, WeightRecord[]>();
  for (const w of data.weight) {
    let arr = weightByDate.get(w.date);
    if (!arr) {
      arr = [];
      weightByDate.set(w.date, arr);
    }
    arr.push(w);
  }
  // 独立体脂点：分钟 → values
  const bodyFatByMinute = new Map<string, number[]>();
  for (const b of data.bodyFat) {
    pushToMinuteValues(bodyFatByMinute, minuteKey(b.datetime), b.value);
  }

  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    if (!datetime) {
      bump(stats, 'bodyFat', 'skipped');
      continue;
    }
    const date = getDate(datetime);
    let value = qtyFromPoint(pt);
    if (value == null) {
      bump(stats, 'bodyFat', 'skipped');
      continue;
    }
    // 0–1 小数 → 百分数
    if (value > 0 && value <= 1) value = value * 100;
    if (value <= 0 || value >= 80) {
      bump(stats, 'bodyFat', 'skipped');
      continue;
    }

    // 优先合并到同日/同分钟体重（日桶内 find：sameMinute 或任意同日）
    const dayWeights = weightByDate.get(date);
    const weightHit = dayWeights?.find(
      (w) => sameMinute(w.datetime, datetime) || w.date === date
    );
    if (weightHit) {
      if (weightHit.bodyFat == null) {
        weightHit.bodyFat = value;
        data.dataAvailability.hasBodyFat = true;
        bump(stats, 'bodyFat', 'updated');
      } else if (approxEq(weightHit.bodyFat, value, 0.2)) {
        bump(stats, 'bodyFat', 'skipped');
      } else {
        // 已有不同体脂：写独立点
        const mk = minuteKey(datetime);
        if (hasApproxInList(bodyFatByMinute.get(mk), value, 0.2)) {
          bump(stats, 'bodyFat', 'skipped');
        } else {
          data.bodyFat.push({ datetime, date, value, source: 'hae' });
          pushToMinuteValues(bodyFatByMinute, mk, value);
          data.dataAvailability.hasBodyFat = true;
          bump(stats, 'bodyFat', 'added');
        }
      }
      continue;
    }

    const mk = minuteKey(datetime);
    if (hasApproxInList(bodyFatByMinute.get(mk), value, 0.2)) {
      bump(stats, 'bodyFat', 'skipped');
      continue;
    }
    const rec: BodyFatPoint = { datetime, date, value, source: 'hae' };
    data.bodyFat.push(rec);
    pushToMinuteValues(bodyFatByMinute, mk, value);
    data.dataAvailability.hasBodyFat = true;
    bump(stats, 'bodyFat', 'added');
  }
}

function mergeHrv(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    const qty = qtyFromPoint(pt);
    if (!datetime || qty == null || qty <= 0) {
      bump(stats, 'hrv', 'skipped');
      continue;
    }
    const date = getDate(datetime);
    if (!data.hrv[date]) data.hrv[date] = [];
    // 避免同日完全相同值重复
    if (data.hrv[date].some((v) => approxEq(v, qty, 0.01))) {
      bump(stats, 'hrv', 'skipped');
      continue;
    }
    data.hrv[date].push(qty);
    if (getHour(datetime) < 9) {
      if (!data.hrvOvernight[date]) data.hrvOvernight[date] = [];
      if (!data.hrvOvernight[date].some((v) => approxEq(v, qty, 0.01))) {
        data.hrvOvernight[date].push(qty);
      }
    }
    data.dataAvailability.hasHrv = true;
    bump(stats, 'hrv', 'added');
  }
}

function mergeDailyHr(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats,
  field: 'restingHr' | 'walkingHr'
): void {
  const domain = field;
  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    const qty = qtyFromPoint(pt);
    if (!datetime || qty == null || qty < 30 || qty > 220) {
      bump(stats, domain, 'skipped');
      continue;
    }
    const date = getDate(datetime);
    const map = field === 'restingHr' ? data.restingHr : data.walkingHr;
    if (map[date] != null) {
      if (approxEq(map[date], qty, 0.5)) {
        bump(stats, domain, 'skipped');
      } else {
        map[date] = qty;
        data.dataAvailability.hasHeartRate = true;
        bump(stats, domain, 'updated');
      }
    } else {
      map[date] = qty;
      data.dataAvailability.hasHeartRate = true;
      bump(stats, domain, 'added');
    }
  }
}

function mergeSteps(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    const qty = qtyFromPoint(pt);
    if (!datetime || qty == null || qty < 0) {
      bump(stats, 'steps', 'skipped');
      continue;
    }
    const date = getDate(datetime);
    if (!data.steps[date]) {
      data.steps[date] = { watch: 0, iphone: 0, max: 0 };
    }
    const s = data.steps[date];
    // HAE 多为日汇总：写入 watch 侧，取较大值
    if (s.watch === 0 && s.iphone === 0 && s.max === 0) {
      s.watch = qty;
      s.max = qty;
      data.dataAvailability.hasSteps = true;
      bump(stats, 'steps', 'added');
    } else if (qty > s.watch && qty > s.max) {
      s.watch = qty;
      s.max = Math.max(s.watch, s.iphone, qty);
      data.dataAvailability.hasSteps = true;
      bump(stats, 'steps', 'updated');
    } else if (approxEq(qty, s.watch, 1) || approxEq(qty, s.max, 1) || qty <= s.max) {
      bump(stats, 'steps', 'skipped');
    } else {
      s.watch = Math.max(s.watch, qty);
      s.max = Math.max(s.watch, s.iphone);
      data.dataAvailability.hasSteps = true;
      bump(stats, 'steps', 'updated');
    }
  }
}

function mergeSleep(
  data: HealthData,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    if (!datetime) {
      bump(stats, 'sleep', 'skipped');
      continue;
    }
    const date = getDate(datetime);

    // 聚合字段：小时
    const totalSleep = parseNum(
      pt.totalSleep ?? pt.total_sleep ?? pt.asleep ?? pt.total ?? pt.qty
    );
    const core = parseNum(pt.core ?? pt.Core) ?? 0;
    const deep = parseNum(pt.deep ?? pt.Deep) ?? 0;
    const rem = parseNum(pt.rem ?? pt.REM ?? pt.Rem) ?? 0;
    const awake = parseNum(pt.awake ?? pt.Awake) ?? 0;

    let total = totalSleep;
    if (total == null) {
      const sumStages = core + deep + rem;
      total = sumStages > 0 ? sumStages : null;
    }
    if (total == null || total <= 0) {
      bump(stats, 'sleep', 'skipped');
      continue;
    }

    const next = {
      total,
      deep,
      rem,
      core,
      awake,
    };

    if (data.sleep[date]) {
      const prev = data.sleep[date];
      if (
        approxEq(prev.total, next.total, 0.05) &&
        approxEq(prev.deep, next.deep, 0.05) &&
        approxEq(prev.rem, next.rem, 0.05) &&
        approxEq(prev.core, next.core, 0.05)
      ) {
        bump(stats, 'sleep', 'skipped');
      } else {
        data.sleep[date] = next;
        data.dataAvailability.hasSleep = true;
        bump(stats, 'sleep', 'updated');
      }
    } else {
      data.sleep[date] = next;
      data.dataAvailability.hasSleep = true;
      bump(stats, 'sleep', 'added');
    }
  }
}

function setMaxField(
  w: WatchDaySummary,
  key: 'activeKcal' | 'exerciseMin' | 'standMin' | 'daylightMin' | 'standHoursStood',
  value: number
): 'added' | 'updated' | 'skipped' {
  const prev = w[key] || 0;
  if (prev === 0 && value > 0) {
    w[key] = value;
    return 'added';
  }
  if (value > prev) {
    w[key] = value;
    return 'updated';
  }
  return 'skipped';
}

function mergeWatchMetric(
  data: HealthData,
  metricName: string,
  points: Record<string, unknown>[],
  stats: HaeImportStats
): void {
  const field = WATCH_FIELD_BY_METRIC[metricName];
  if (!field) {
    // 不应到达：未知走 unknown
    return;
  }

  for (const pt of points) {
    const datetime = datetimeFromPoint(pt);
    if (!datetime) {
      bump(stats, 'watch', 'skipped');
      continue;
    }
    const date = getDate(datetime);
    let qty = qtyFromPoint(pt);

    // stand hour 可能是 Stood/Idle 字符串
    if (field === 'standHoursStood') {
      const raw = pt.qty ?? pt.value ?? pt.Value;
      if (typeof raw === 'string') {
        if (/stood/i.test(raw)) qty = 1;
        else if (/idle/i.test(raw)) {
          const w = ensureWatchDay(data, date);
          w.standHoursIdle = (w.standHoursIdle || 0) + 1;
          bump(stats, 'watch', 'added');
          continue;
        }
      }
    }

    if (qty == null || !Number.isFinite(qty)) {
      bump(stats, 'watch', 'skipped');
      continue;
    }

    const w = ensureWatchDay(data, date);

    if (field === 'activeKcal' || field === 'exerciseMin' || field === 'standMin' || field === 'daylightMin') {
      // 日汇总：prefer max 避免重复合计
      const kind = setMaxField(w, field, qty);
      if (kind !== 'skipped') {
        data.dataAvailability.hasWatchActivity = true;
      }
      bump(stats, 'watch', kind);
    } else if (field === 'standHoursStood') {
      const kind = setMaxField(w, 'standHoursStood', qty);
      if (kind !== 'skipped') data.dataAvailability.hasWatchActivity = true;
      bump(stats, 'watch', kind);
    } else if (field === 'spo2') {
      let pct = qty;
      if (pct <= 1.5) pct = pct * 100;
      if (pct < 50 || pct > 100) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      // 日聚合：若已有样本则 skip 重复日汇总
      if (w.spo2Count > 0) {
        // 若导入的是单点，仍可累加；若像日均（仅 1 点且 count 已有）则 skip
        // 简单策略：同日已有数据则 skip（避免 HAE 日汇总双计）
        bump(stats, 'watch', 'skipped');
        continue;
      }
      w.spo2Sum += pct;
      w.spo2Count += 1;
      w.spo2Min = Math.min(w.spo2Min === Infinity ? pct : w.spo2Min, pct);
      const hour = getHour(datetime);
      if (hour >= 0 && hour < 8) {
        w.spo2NightSum += pct;
        w.spo2NightCount += 1;
        w.spo2NightMin = Math.min(w.spo2NightMin === Infinity ? pct : w.spo2NightMin, pct);
      } else {
        w.spo2DaySum += pct;
        w.spo2DayCount += 1;
        w.spo2DayMin = Math.min(w.spo2DayMin === Infinity ? pct : w.spo2DayMin, pct);
      }
      data.dataAvailability.hasSpO2 = true;
      bump(stats, 'watch', 'added');
    } else if (field === 'rr') {
      if (qty < 5 || qty > 40) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      if (w.rrCount > 0) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      w.rrSum += qty;
      w.rrCount += 1;
      data.dataAvailability.hasRespiratoryRate = true;
      bump(stats, 'watch', 'added');
    } else if (field === 'vo2Max') {
      if (qty < 10 || qty > 90) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      if (w.vo2Max != null) {
        if (approxEq(w.vo2Max, qty, 0.1)) {
          bump(stats, 'watch', 'skipped');
        } else {
          w.vo2Max = qty;
          data.dataAvailability.hasVo2Max = true;
          bump(stats, 'watch', 'updated');
        }
      } else {
        w.vo2Max = qty;
        data.dataAvailability.hasVo2Max = true;
        bump(stats, 'watch', 'added');
      }
    } else if (field === 'wristTemp') {
      if (qty < 30 || qty > 40) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      if (w.wristTempCount > 0) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      w.wristTempSum += qty;
      w.wristTempCount += 1;
      data.dataAvailability.hasWristTemp = true;
      bump(stats, 'watch', 'added');
    } else if (field === 'breathingDisturbance') {
      if (w.breathingDisturbance != null) {
        if (approxEq(w.breathingDisturbance, qty, 0.01)) {
          bump(stats, 'watch', 'skipped');
        } else {
          w.breathingDisturbance = qty;
          data.dataAvailability.hasBreathingDisturbance = true;
          bump(stats, 'watch', 'updated');
        }
      } else {
        w.breathingDisturbance = qty;
        data.dataAvailability.hasBreathingDisturbance = true;
        bump(stats, 'watch', 'added');
      }
    } else if (field === 'nightHr') {
      if (qty < 30 || qty > 220) {
        bump(stats, 'watch', 'skipped');
        continue;
      }
      const hour = getHour(datetime);
      // 仅夜间 0–6 点累加；若无具体小时（00:00 日汇总）则记入 night 均值一次
      if (hour >= 0 && hour < 6) {
        w.nightHrSum += qty;
        w.nightHrCount += 1;
        data.dataAvailability.hasHeartRate = true;
        bump(stats, 'watch', 'added');
      } else if (hour === 0 && datetime.includes('00:00:00') && w.nightHrCount === 0) {
        // 日级汇总兜底：当作一次夜间代表值
        w.nightHrSum += qty;
        w.nightHrCount += 1;
        data.dataAvailability.hasHeartRate = true;
        bump(stats, 'watch', 'added');
      } else {
        bump(stats, 'watch', 'skipped');
      }
    }
  }
}

function mergeWorkouts(
  data: HealthData,
  workouts: HaeParsedWorkout[],
  stats: HaeImportStats
): void {
  if (!data.workouts) data.workouts = [];
  // key = `${minuteKey}|${activityType}` → 已有 durationMin 列表
  const byStartAct = new Map<string, number[]>();
  for (const w of data.workouts) {
    const k = `${minuteKey(w.startDate)}|${w.activityType}`;
    pushToMinuteValues(byStartAct, k, w.durationMin);
  }

  for (const wo of workouts) {
    const startRaw =
      wo.startDate ?? wo.start ?? (wo as { start_date?: string }).start_date;
    const startDate = normalizeDt(startRaw);
    if (!startDate) {
      bump(stats, 'workouts', 'skipped');
      continue;
    }
    const date = getDate(startDate);
    const activityRaw =
      wo.activityType ??
      wo.workoutActivityType ??
      wo.name ??
      (wo as { type?: string }).type ??
      'Other';
    const activityType = shortWorkoutType(String(activityRaw));
    let durationMin =
      parseNum(wo.durationMin) ??
      parseNum(wo.duration) ??
      parseNum((wo as { duration_min?: number }).duration_min);
    if (durationMin == null || durationMin <= 0) {
      // 尝试 end - start
      const endRaw = wo.endDate ?? wo.end;
      const endDate = normalizeDt(endRaw);
      if (endDate) {
        const ms = parseAppleDate(endDate) - parseAppleDate(startDate);
        if (Number.isFinite(ms) && ms > 0) durationMin = ms / 60000;
      }
    }
    if (durationMin == null || durationMin <= 0) {
      bump(stats, 'workouts', 'skipped');
      continue;
    }
    // 若 duration 看起来像秒
    if (durationMin > 24 * 60 && durationMin < 24 * 3600) {
      durationMin = durationMin / 60;
    }

    const idxKey = `${minuteKey(startDate)}|${activityType}`;
    if (hasApproxInList(byStartAct.get(idxKey), durationMin, 0.5)) {
      bump(stats, 'workouts', 'skipped');
      continue;
    }

    const endDate = normalizeDt(wo.endDate ?? wo.end) ?? undefined;
    const session: WorkoutSession = {
      startDate,
      endDate,
      date,
      activityType,
      activityLabel: workoutTypeLabel(activityType),
      durationMin,
      source: wo.source ? String(wo.source) : 'hae',
    };
    const kcal =
      parseNum(wo.activeEnergyBurned) ??
      parseNum(wo.activeEnergy) ??
      parseNum(wo.totalEnergyBurned);
    if (kcal != null) session.activeKcal = kcal;
    const dist = parseNum(wo.distanceKm) ?? parseNum(wo.distance);
    if (dist != null) {
      // 若像米
      session.distanceKm = dist > 100 ? dist / 1000 : dist;
    }
    const hrAvg = parseNum(wo.hrAvg) ?? parseNum(wo.avgHeartRate);
    if (hrAvg != null) session.hrAvg = hrAvg;
    const hrMin = parseNum(wo.minHeartRate);
    if (hrMin != null) session.hrMin = hrMin;
    const hrMax = parseNum(wo.maxHeartRate);
    if (hrMax != null) session.hrMax = hrMax;
    const mets = parseNum(wo.avgMets);
    if (mets != null) session.avgMets = mets;
    if (typeof wo.indoor === 'boolean') session.indoor = wo.indoor;

    data.workouts.push(session);
    pushToMinuteValues(byStartAct, idxKey, durationMin);
    data.dataAvailability.hasWorkouts = true;
    bump(stats, 'workouts', 'added');
  }
}

// ============================================================
// 主合并入口
// ============================================================

function applyMetric(
  data: HealthData,
  metric: HaeParsedMetric,
  stats: HaeImportStats,
  unknownAcc: Map<string, HaeUnknownMetric>
): void {
  const name = metric.name;
  if (!isKnownMetric(name)) {
    const prev = unknownAcc.get(name);
    const sampleDates: string[] = prev?.sampleDates ? [...prev.sampleDates] : [];
    for (const pt of metric.data) {
      const d = dateFromPoint(pt);
      if (d && !sampleDates.includes(d) && sampleDates.length < 5) sampleDates.push(d);
    }
    unknownAcc.set(name, {
      name,
      sampleCount: (prev?.sampleCount || 0) + metric.data.length,
      units: metric.units || prev?.units,
      sampleDates: sampleDates.length ? sampleDates : undefined,
    });
    return;
  }

  if (!stats.knownMetrics.includes(name)) {
    stats.knownMetrics.push(name);
  }

  const domain = domainOf(name)!;
  const pts = metric.data;

  switch (domain) {
    case 'cgm':
      mergeCgm(data, pts, metric.units, stats);
      break;
    case 'bloodPressure':
      mergeBloodPressure(data, pts, stats);
      break;
    case 'weight':
      if (name === 'body_mass_index' || name === 'bmi') {
        mergeWeight(data, pts, stats, 'bmi');
      } else {
        mergeWeight(data, pts, stats, 'mass');
      }
      break;
    case 'bodyFat':
      mergeBodyFat(data, pts, stats);
      break;
    case 'hrv':
      mergeHrv(data, pts, stats);
      break;
    case 'restingHr':
      mergeDailyHr(data, pts, stats, 'restingHr');
      break;
    case 'walkingHr':
      mergeDailyHr(data, pts, stats, 'walkingHr');
      break;
    case 'steps':
      mergeSteps(data, pts, stats);
      break;
    case 'sleep':
      mergeSleep(data, pts, stats);
      break;
    case 'watch':
      mergeWatchMetric(data, name, pts, stats);
      break;
    default:
      // 理论上不会到
      unknownAcc.set(name, {
        name,
        sampleCount: pts.length,
        units: metric.units,
      });
  }
}

/**
 * 将 HAE 文件集合增量合并进已有 HealthData（就地修改）
 */
export function mergeHaeIntoData(
  data: HealthData,
  files: HaeFileInput[],
  options: HaeMergeOptions = {}
): HaeImportStats {
  const stats: HaeImportStats = {
    sourceFormat: 'empty',
    files: [],
    totalAdded: 0,
    totalUpdated: 0,
    totalSkipped: 0,
    byDomain: {},
    knownMetrics: [],
    unknownMetrics: [],
    notes: [],
  };

  if (!files?.length) {
    stats.notes.push('未提供文件');
    return stats;
  }

  const parsed = parseHaeInputs(files);
  stats.sourceFormat = parsed.sourceFormat;
  stats.files = parsed.files;
  stats.notes.push(...parsed.notes);

  const unknownAcc = new Map<string, HaeUnknownMetric>();
  // includeUnknown：v1.40 仍只上报，不落库
  if (options.includeUnknown?.length) {
    stats.notes.push(
      `includeUnknown 已记录但 v1.40 不落库: ${options.includeUnknown.join(', ')}`
    );
  }

  for (const metric of parsed.metrics) {
    applyMetric(data, metric, stats, unknownAcc);
  }

  const includeWorkouts = options.includeWorkouts !== false;
  if (parsed.workouts?.length) {
    if (includeWorkouts) {
      mergeWorkouts(data, parsed.workouts, stats);
    } else {
      stats.notes.push(`已跳过 ${parsed.workouts.length} 条 workouts（includeWorkouts=false）`);
    }
  }

  stats.unknownMetrics = [...unknownAcc.values()].sort((a, b) => a.name.localeCompare(b.name));
  stats.knownMetrics.sort();

  finalizeData(data);
  return stats;
}

/** 便捷：单段 JSON 文本 */
export function mergeHaeJsonIntoData(
  data: HealthData,
  text: string,
  options?: HaeMergeOptions
): HaeImportStats {
  return mergeHaeIntoData(data, [{ name: 'export.json', text }], options);
}
