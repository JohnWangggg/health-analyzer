/**
 * Apple Health XML 解析器
 * 支持同步与异步流式解析，无需外部依赖
 */

import {
  RawRecord,
  HealthData,
  BloodPressureRecord,
  ERecordSummary,
  WatchDaySummary,
  WorkoutSession,
} from './types';

/** 从 datetime 字符串提取日期部分 */
export function getDate(dt: string): string {
  return dt.slice(0, 10);
}

/** 从 datetime 字符串提取小时 */
export function getHour(dt: string): number {
  return parseInt(dt.slice(11, 13), 10);
}

/** 将 Apple Health 的 +0800 时区格式转换为 JS 更稳定的 ISO 格式。 */
export function parseAppleDate(dt: string): number {
  const normalized = dt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  return Date.parse(normalized);
}

/** 本地日历「今天」YYYY-MM-DD（用于排除误录的未来日期） */
export function getLocalToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const MAX_FUTURE_SAMPLES = 8;

function noteSkippedFuture(data: HealthData, date: string): void {
  data.dataQuality.skippedFutureCount += 1;
  const samples = data.dataQuality.futureSampleDates;
  if (!samples.includes(date) && samples.length < MAX_FUTURE_SAMPLES) {
    samples.push(date);
    samples.sort();
  }
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
  // 兼容旧/不完整对象
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

/** 从 XML 行取属性 */
export function xmlAttr(line: string, name: string): string | undefined {
  const match = line.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`));
  return match?.[2];
}

/** HKWorkoutActivityTypeWalking → Walking */
export function shortWorkoutType(raw: string): string {
  return raw.replace(/^HKWorkoutActivityType/, '') || raw || 'Other';
}

/** Workout 类型中文名 */
const WORKOUT_TYPE_ZH: Record<string, string> = {
  Walking: '步行',
  Running: '跑步',
  Hiking: '徒步',
  Cycling: '骑行',
  Swimming: '游泳',
  Yoga: '瑜伽',
  Dance: '舞蹈',
  Elliptical: '椭圆机',
  Stairs: '爬楼梯',
  StairClimbing: '爬楼梯机',
  FunctionalStrengthTraining: '功能性力量',
  TraditionalStrengthTraining: '传统力量',
  HighIntensityIntervalTraining: '高强度间歇',
  CoreTraining: '核心训练',
  Flexibility: '柔韧',
  Cooldown: '放松整理',
  MixedCardio: '混合有氧',
  Other: '其他',
};

export function workoutTypeLabel(activityType: string): string {
  if (!activityType) return '其他';
  return WORKOUT_TYPE_ZH[activityType] || activityType;
}

/** 日期是否晚于参考日（均 YYYY-MM-DD 字符串比较） */
export function isFutureDate(date: string, referenceDate: string): boolean {
  return Boolean(date && referenceDate && date > referenceDate);
}

/**
 * 解析单个 Record 行的属性
 */
export function parseRecordLine(line: string): RawRecord | null {
  const type = xmlAttr(line, 'type');
  const startDate = xmlAttr(line, 'startDate');

  if (!type || !startDate) return null;
  return {
    type,
    source: xmlAttr(line, 'sourceName') ?? '',
    startDate,
    endDate: xmlAttr(line, 'endDate'),
    value: xmlAttr(line, 'value') ?? '',
  };
}

/** 解析过程中血压配对用的内部 Map（WeakMap 避免污染 HealthData） */
const bpMaps = new WeakMap<HealthData, Map<string, BloodPressureRecord>>();

function getBpMap(data: HealthData): Map<string, BloodPressureRecord> {
  let map = bpMaps.get(data);
  if (!map) {
    map = new Map();
    bpMaps.set(data, map);
  }
  return map;
}

/** 创建空的 HealthData 容器 */
export function createEmptyData(referenceDate?: string): HealthData {
  const ref = referenceDate || getLocalToday();
  const data: HealthData = {
    cgm: [],
    bloodPressure: [],
    weight: [],
    bodyFat: [],
    hrv: {},
    hrvOvernight: {},
    restingHr: {},
    walkingHr: {},
    steps: {},
    sleep: {},
    watchDaily: {},
    workouts: [],
    ecg: [],
    dataAvailability: {
      hasCgm: false,
      hasBloodPressure: false,
      hasWeight: false,
      hasBodyFat: false,
      hasHrv: false,
      hasHeartRate: false,
      hasSteps: false,
      hasSleep: false,
      hasEcg: false,
      hasSpO2: false,
      hasRespiratoryRate: false,
      hasVo2Max: false,
      hasWatchActivity: false,
      hasWristTemp: false,
      hasBreathingDisturbance: false,
      hasWorkouts: false,
    },
    dataQuality: {
      referenceDate: ref,
      skippedFutureCount: 0,
      futureSampleDates: [],
    },
  };
  bpMaps.set(data, new Map());
  return data;
}

export interface ProcessRecordOptions {
  startDate?: string;
  endDate?: string;
  /**
   * 是否保留未来日期记录。默认 false：跳过 startDate 的日历日晚于 referenceDate 的记录。
   * 用于过滤健康 App 中误录的未来体重等。
   */
  allowFuture?: boolean;
  /** 判定「今天」的参考日 YYYY-MM-DD；默认本地今天 */
  referenceDate?: string;
}

/**
 * 处理单条 Record，写入 data
 */
export function processRecord(
  rec: RawRecord,
  data: HealthData,
  startDateOrOptions?: string | ProcessRecordOptions,
  endDateMaybe?: string
): void {
  // 兼容旧签名 processRecord(rec, data, startDate?, endDate?)
  let startDate: string | undefined;
  let endDate: string | undefined;
  let allowFuture = false;
  let referenceDate = data.dataQuality?.referenceDate || getLocalToday();

  if (startDateOrOptions && typeof startDateOrOptions === 'object') {
    startDate = startDateOrOptions.startDate;
    endDate = startDateOrOptions.endDate;
    allowFuture = Boolean(startDateOrOptions.allowFuture);
    if (startDateOrOptions.referenceDate) {
      referenceDate = startDateOrOptions.referenceDate;
    }
  } else {
    startDate = startDateOrOptions;
    endDate = endDateMaybe;
  }

  // 确保 dataQuality 存在（旧数据/测试桩）
  if (!data.dataQuality) {
    data.dataQuality = {
      referenceDate,
      skippedFutureCount: 0,
      futureSampleDates: [],
    };
  }

  const rdate = rec.startDate;
  const date = getDate(rdate);

  if (startDate && date < startDate) return;
  if (endDate && date > endDate) return;

  // 默认丢弃未来日期（误操作录入的远期体重等）
  if (!allowFuture && isFutureDate(date, referenceDate)) {
    noteSkippedFuture(data, date);
    return;
  }

  const numericValue = Number.parseFloat(rec.value);
  // 分类型 Record 的 value 非数字（睡眠阶段 / 站立小时等）
  const isCategory =
    rec.type === 'HKCategoryTypeIdentifierSleepAnalysis' ||
    rec.type === 'HKCategoryTypeIdentifierAppleStandHour';
  if (!Number.isFinite(numericValue) && !isCategory) {
    return;
  }

  if (rec.type === 'HKQuantityTypeIdentifierBloodGlucose') {
    const sourceLower = rec.source.toLowerCase();
    if (
      rec.source.includes('欧态') ||
      sourceLower.includes('cgm') ||
      sourceLower.includes('libre') ||
      sourceLower.includes('glucose')
    ) {
      data.cgm.push({ datetime: rdate, value: numericValue });
      data.dataAvailability.hasCgm = true;
    }
  } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureSystolic') {
    const map = getBpMap(data);
    const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
    record.systolic = numericValue;
    map.set(rdate, record);
    data.dataAvailability.hasBloodPressure = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierBloodPressureDiastolic') {
    const map = getBpMap(data);
    const record = map.get(rdate) ?? { datetime: rdate, date, systolic: 0, diastolic: 0 };
    record.diastolic = numericValue;
    map.set(rdate, record);
  } else if (rec.type === 'HKQuantityTypeIdentifierBodyMass') {
    data.weight.push({ datetime: rdate, date, value: numericValue });
    data.dataAvailability.hasWeight = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierBodyFatPercentage') {
    // Apple Health 常以 0–1 小数存储；若 >1 则视为已是百分数
    const pct = numericValue <= 1 ? numericValue * 100 : numericValue;
    if (Number.isFinite(pct) && pct > 0 && pct < 80) {
      data.bodyFat.push({ datetime: rdate, date, value: pct, source: rec.source });
      data.dataAvailability.hasBodyFat = true;
    }
  } else if (rec.type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') {
    if (!data.hrv[date]) data.hrv[date] = [];
    data.hrv[date].push(numericValue);
    if (getHour(rdate) < 9) {
      if (!data.hrvOvernight[date]) data.hrvOvernight[date] = [];
      data.hrvOvernight[date].push(numericValue);
    }
    data.dataAvailability.hasHrv = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierRestingHeartRate') {
    data.restingHr[date] = numericValue;
    data.dataAvailability.hasHeartRate = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierWalkingHeartRateAverage') {
    data.walkingHr[date] = numericValue;
    data.dataAvailability.hasHeartRate = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierStepCount') {
    if (!data.steps[date]) {
      data.steps[date] = { watch: 0, iphone: 0, max: 0 };
    }
    if (rec.source.includes('Watch')) {
      data.steps[date].watch += numericValue;
    } else if (rec.source.includes('iPhone')) {
      data.steps[date].iphone += numericValue;
    }
    data.dataAvailability.hasSteps = true;
  } else if (rec.type === 'HKCategoryTypeIdentifierSleepAnalysis') {
    if (!rec.source.includes('Watch')) return;
    if (!rec.endDate) return;
    try {
      const startMs = parseAppleDate(rdate);
      const endMs = parseAppleDate(rec.endDate);
      const durationSec = (endMs - startMs) / 1000;
      if (!Number.isFinite(durationSec) || durationSec <= 0) return;
      if (!data.sleep[date]) {
        data.sleep[date] = { total: 0, deep: 0, rem: 0, core: 0, awake: 0 };
      }
      const hours = durationSec / 3600;
      switch (rec.value) {
        case 'HKCategoryValueSleepAnalysisAsleepDeep':
          data.sleep[date].deep += hours;
          data.sleep[date].total += hours;
          break;
        case 'HKCategoryValueSleepAnalysisAsleepREM':
          data.sleep[date].rem += hours;
          data.sleep[date].total += hours;
          break;
        case 'HKCategoryValueSleepAnalysisAsleepCore':
          data.sleep[date].core += hours;
          data.sleep[date].total += hours;
          break;
        case 'HKCategoryValueSleepAnalysisAwake':
          data.sleep[date].awake += hours;
          break;
      }
      data.dataAvailability.hasSleep = true;
    } catch {
      // ignore malformed
    }
  } else if (rec.type === 'HKCategoryTypeIdentifierAppleStandHour') {
    const w = ensureWatchDay(data, date);
    if (/Stood/i.test(rec.value)) {
      w.standHoursStood += 1;
      data.dataAvailability.hasWatchActivity = true;
    } else if (/Idle/i.test(rec.value)) {
      w.standHoursIdle += 1;
    }
  } else if (rec.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const w = ensureWatchDay(data, date);
    w.activeKcal += numericValue;
    data.dataAvailability.hasWatchActivity = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierAppleExerciseTime') {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const w = ensureWatchDay(data, date);
    w.exerciseMin += numericValue; // 每条多为 1 分钟
    data.dataAvailability.hasWatchActivity = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierAppleStandTime') {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const w = ensureWatchDay(data, date);
    w.standMin += numericValue;
    data.dataAvailability.hasWatchActivity = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierTimeInDaylight') {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const w = ensureWatchDay(data, date);
    w.daylightMin += numericValue;
  } else if (rec.type === 'HKQuantityTypeIdentifierOxygenSaturation') {
    if (!Number.isFinite(numericValue) || numericValue <= 0) return;
    const pct = numericValue <= 1.5 ? numericValue * 100 : numericValue;
    if (pct < 50 || pct > 100) return;
    const w = ensureWatchDay(data, date);
    w.spo2Sum += pct;
    w.spo2Count += 1;
    w.spo2Min = Math.min(w.spo2Min, pct);
    // 夜段 0–8 点 vs 日段 8–24 点（睡眠相关偏低多落在夜段）
    const hour = getHour(rdate);
    if (hour >= 0 && hour < 8) {
      w.spo2NightSum += pct;
      w.spo2NightCount += 1;
      w.spo2NightMin = Math.min(w.spo2NightMin, pct);
    } else {
      w.spo2DaySum += pct;
      w.spo2DayCount += 1;
      w.spo2DayMin = Math.min(w.spo2DayMin, pct);
    }
    data.dataAvailability.hasSpO2 = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierRespiratoryRate') {
    if (!Number.isFinite(numericValue) || numericValue < 5 || numericValue > 40) return;
    const w = ensureWatchDay(data, date);
    w.rrSum += numericValue;
    w.rrCount += 1;
    data.dataAvailability.hasRespiratoryRate = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierVO2Max') {
    if (!Number.isFinite(numericValue) || numericValue < 10 || numericValue > 90) return;
    const w = ensureWatchDay(data, date);
    w.vo2Max = numericValue;
    data.dataAvailability.hasVo2Max = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierAppleSleepingWristTemperature') {
    if (!Number.isFinite(numericValue) || numericValue < 30 || numericValue > 40) return;
    const w = ensureWatchDay(data, date);
    w.wristTempSum += numericValue;
    w.wristTempCount += 1;
    data.dataAvailability.hasWristTemp = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances') {
    if (!Number.isFinite(numericValue)) return;
    const w = ensureWatchDay(data, date);
    w.breathingDisturbance = numericValue;
    data.dataAvailability.hasBreathingDisturbance = true;
  } else if (rec.type === 'HKQuantityTypeIdentifierHeartRate') {
    // 仅累加夜间 00:00–06:00，控制内存
    if (!Number.isFinite(numericValue) || numericValue < 30 || numericValue > 220) return;
    const hour = getHour(rdate);
    if (hour >= 0 && hour < 6) {
      const w = ensureWatchDay(data, date);
      w.nightHrSum += numericValue;
      w.nightHrCount += 1;
    }
  }
}

/**
 * 解析完整 <Workout>...</Workout> 或自关闭 Workout 行，写入 data.workouts
 */
export function processWorkoutBlock(
  block: string,
  data: HealthData,
  options: ProcessRecordOptions = {}
): void {
  if (!data.workouts) data.workouts = [];
  const headMatch = block.match(/<Workout\b[^>]*>/);
  const head = headMatch ? headMatch[0] : block;
  const startDate = xmlAttr(head, 'startDate');
  if (!startDate) return;

  const date = getDate(startDate);
  const allowFuture = Boolean(options.allowFuture);
  const referenceDate = options.referenceDate || data.dataQuality?.referenceDate || getLocalToday();
  if (!data.dataQuality) {
    data.dataQuality = { referenceDate, skippedFutureCount: 0, futureSampleDates: [] };
  }
  if (!allowFuture && isFutureDate(date, referenceDate)) {
    noteSkippedFuture(data, date);
    return;
  }
  if (options.startDate && date < options.startDate) return;
  if (options.endDate && date > options.endDate) return;

  let durationMin = parseFloat(xmlAttr(head, 'duration') || '');
  const durationUnit = (xmlAttr(head, 'durationUnit') || 'min').toLowerCase();
  if (!Number.isFinite(durationMin) || durationMin <= 0) return;
  if (durationUnit.startsWith('sec') || durationUnit === 's') durationMin /= 60;
  else if (durationUnit.startsWith('hr') || durationUnit === 'h') durationMin *= 60;

  const activityType = shortWorkoutType(xmlAttr(head, 'workoutActivityType') || 'Other');
  const session: WorkoutSession = {
    startDate,
    endDate: xmlAttr(head, 'endDate'),
    date,
    activityType,
    activityLabel: workoutTypeLabel(activityType),
    durationMin,
    source: xmlAttr(head, 'sourceName'),
  };

  // Metadata
  const metsM = block.match(/key="HKAverageMETs"\s+value="([0-9.]+)/);
  if (metsM) {
    const v = parseFloat(metsM[1]);
    if (Number.isFinite(v)) session.avgMets = v;
  }
  const indoorM = block.match(/key="HKIndoorWorkout"\s+value="([01])"/);
  if (indoorM) session.indoor = indoorM[1] === '1';

  // Statistics: ActiveEnergy / Distance / HeartRate
  const statRe = /<WorkoutStatistics\b[^>]*>/g;
  let sm: RegExpExecArray | null;
  while ((sm = statRe.exec(block)) !== null) {
    const tag = sm[0];
    const st = xmlAttr(tag, 'type') || '';
    if (st.includes('ActiveEnergyBurned')) {
      const sum = parseFloat(xmlAttr(tag, 'sum') || '');
      if (Number.isFinite(sum) && sum > 0) session.activeKcal = sum;
    } else if (st.includes('DistanceWalkingRunning') || st.includes('DistanceCycling')) {
      const sum = parseFloat(xmlAttr(tag, 'sum') || '');
      const unit = (xmlAttr(tag, 'unit') || 'km').toLowerCase();
      if (Number.isFinite(sum) && sum > 0) {
        session.distanceKm = unit === 'm' ? sum / 1000 : sum;
      }
    } else if (st.includes('HeartRate')) {
      const avg = parseFloat(xmlAttr(tag, 'average') || '');
      const min = parseFloat(xmlAttr(tag, 'minimum') || '');
      const max = parseFloat(xmlAttr(tag, 'maximum') || '');
      if (Number.isFinite(avg)) session.hrAvg = avg;
      if (Number.isFinite(min)) session.hrMin = min;
      if (Number.isFinite(max)) session.hrMax = max;
    }
  }

  data.workouts.push(session);
  data.dataAvailability.hasWorkouts = true;
}

/** 多行 Workout 解析状态 */
export interface ParseLineState {
  workoutBuf: string[] | null;
}

export function createParseLineState(): ParseLineState {
  return { workoutBuf: null };
}

/**
 * 统一处理 XML 行：Record + 跨行 Workout
 */
export function processXmlLine(
  line: string,
  data: HealthData,
  options: ProcessRecordOptions,
  state: ParseLineState
): void {
  if (state.workoutBuf) {
    state.workoutBuf.push(line);
    if (line.indexOf('</Workout>') !== -1) {
      processWorkoutBlock(state.workoutBuf.join('\n'), data, options);
      state.workoutBuf = null;
    }
    return;
  }

  if (line.indexOf('<Workout ') !== -1 || line.indexOf('<Workout\t') !== -1) {
    const trimmed = line.trim();
    if (/\/>\s*$/.test(trimmed)) {
      processWorkoutBlock(line, data, options);
    } else {
      state.workoutBuf = [line];
    }
    return;
  }

  if (line.indexOf('<Record ') !== -1 || line.indexOf('<Record\t') !== -1) {
    const rec = parseRecordLine(line);
    if (rec && rec.value !== '') processRecord(rec, data, options);
  }
}

export function flushParseLineState(
  state: ParseLineState,
  data: HealthData,
  options: ProcessRecordOptions
): void {
  if (state.workoutBuf && state.workoutBuf.length) {
    processWorkoutBlock(state.workoutBuf.join('\n'), data, options);
    state.workoutBuf = null;
  }
}

/**
 * 将体脂点合并到同日体重记录：优先同一天时间最近的一条
 */
function mergeBodyFatIntoWeight(data: HealthData): void {
  if (!data.bodyFat?.length || !data.weight?.length) return;
  const fatByDate: Record<string, { datetime: string; value: number }[]> = {};
  for (const f of data.bodyFat) {
    if (!fatByDate[f.date]) fatByDate[f.date] = [];
    fatByDate[f.date].push({ datetime: f.datetime, value: f.value });
  }
  for (const w of data.weight) {
    if (w.bodyFat != null) continue;
    const list = fatByDate[w.date];
    if (!list?.length) continue;
    let best = list[0];
    let bestDiff = Math.abs(parseAppleDate(w.datetime) - parseAppleDate(best.datetime));
    for (let i = 1; i < list.length; i++) {
      const diff = Math.abs(parseAppleDate(w.datetime) - parseAppleDate(list[i].datetime));
      if (diff < bestDiff) {
        best = list[i];
        bestDiff = diff;
      }
    }
    // 仅当 3 小时内认为同次称重
    if (bestDiff <= 3 * 3600 * 1000) {
      w.bodyFat = best.value;
    }
  }
}

/**
 * 后处理：步数 max、血压配对完成、排序、体脂合并
 */
export function finalizeData(data: HealthData): void {
  for (const date in data.steps) {
    data.steps[date].max = Math.max(data.steps[date].watch, data.steps[date].iphone);
  }

  const map = bpMaps.get(data);
  if (map && map.size > 0) {
    // 解析阶段写入 Map；与已有 bloodPressure（如外部 CSV）合并
    const byDt = new Map<string, (typeof data.bloodPressure)[0]>();
    for (const r of data.bloodPressure || []) {
      byDt.set(r.datetime, { ...r });
    }
    for (const r of map.values()) {
      const cur = byDt.get(r.datetime) || {
        datetime: r.datetime,
        date: r.date,
        systolic: 0,
        diastolic: 0,
      };
      if (r.systolic > 0) cur.systolic = r.systolic;
      if (r.diastolic > 0) cur.diastolic = r.diastolic;
      byDt.set(r.datetime, cur);
    }
    data.bloodPressure = [...byDt.values()].filter((r) => r.systolic > 0 && r.diastolic > 0);
    bpMaps.delete(data);
  } else {
    data.bloodPressure = (data.bloodPressure || []).filter((r) => r.systolic > 0 && r.diastolic > 0);
    if (map) bpMaps.delete(data);
  }
  data.bloodPressure.sort((a, b) => a.datetime.localeCompare(b.datetime));
  data.cgm.sort((a, b) => a.datetime.localeCompare(b.datetime));
  data.weight.sort((a, b) => a.datetime.localeCompare(b.datetime));
  if (data.bodyFat) {
    data.bodyFat.sort((a, b) => a.datetime.localeCompare(b.datetime));
  }
  mergeBodyFatIntoWeight(data);
  if (data.bodyFat?.length) data.dataAvailability.hasBodyFat = true;
  // 清理空的 Watch 日（仅被创建但无有效累加）
  if (data.watchDaily) {
    for (const d of Object.keys(data.watchDaily)) {
      const w = data.watchDaily[d];
      if (
        w.activeKcal === 0 &&
        w.exerciseMin === 0 &&
        w.standMin === 0 &&
        w.spo2Count === 0 &&
        w.rrCount === 0 &&
        w.nightHrCount === 0 &&
        w.wristTempCount === 0 &&
        w.vo2Max == null &&
        w.breathingDisturbance == null &&
        w.daylightMin === 0 &&
        (w.standHoursStood || 0) === 0 &&
        (w.standHoursIdle || 0) === 0
      ) {
        delete data.watchDaily[d];
      } else {
        if (w.spo2Min === Infinity) w.spo2Min = 0;
        if (w.spo2NightMin === Infinity) w.spo2NightMin = 0;
        if (w.spo2DayMin === Infinity) w.spo2DayMin = 0;
      }
    }
  }
  if (data.workouts?.length) {
    data.workouts.sort((a, b) => a.startDate.localeCompare(b.startDate));
    data.dataAvailability.hasWorkouts = true;
  }
}

export interface ParseHealthXmlOptions {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;
  onProgress?: (progress: number) => void;
  /** 默认 false：排除日历日晚于 referenceDate 的记录 */
  allowFuture?: boolean;
  /** 判定「今天」YYYY-MM-DD；默认本地今天；单测可注入 */
  referenceDate?: string;
}

/**
 * 同步解析（小文件）
 */
export function parseHealthXml(
  xmlText: string,
  options: ParseHealthXmlOptions = {}
): HealthData {
  const { startDate, endDate, onProgress, allowFuture, referenceDate } = options;
  const data = createEmptyData(referenceDate);
  const recOpts: ProcessRecordOptions = {
    startDate,
    endDate,
    allowFuture,
    referenceDate: data.dataQuality.referenceDate,
  };
  const state = createParseLineState();
  const lines = xmlText.split('\n');
  const total = lines.length;
  const reportEvery = Math.max(1, Math.floor(total / 100));

  for (let i = 0; i < total; i++) {
    processXmlLine(lines[i], data, recOpts, state);
    if (onProgress && i % reportEvery === 0) {
      onProgress(i / total);
    }
  }
  flushParseLineState(state, data, recOpts);

  finalizeData(data);
  if (onProgress) onProgress(1);
  return data;
}

export type OnRecordCallback = (rec: RawRecord, lineIndex: number) => void;
export type OnProgressCallback = (progress: number) => void;

export interface StreamParseResult {
  totalLines: number;
  totalBytes: number;
}

/**
 * 按字符串流式扫描 Record 行（同步扫描，返回 Promise 以统一 API）
 */
function parseStringStream(
  text: string,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  let pos = 0;
  const len = text.length;
  let lastReport = 0;
  let i = 0;

  while (pos < len) {
    let endPos = text.indexOf('\n', pos);
    if (endPos === -1) endPos = len;
    const line = text.substring(pos, endPos);
    pos = endPos + 1;

    if (line.indexOf('<Record ') !== -1 || line.indexOf('<Record\t') !== -1) {
      const rec = parseRecordLine(line);
      if (rec && rec.value !== '') {
        onRecord(rec, i);
      }
    }
    i++;

    if (i - lastReport > 5000) {
      lastReport = i;
      if (onProgress) onProgress(pos / len);
    }
  }
  if (onProgress) onProgress(1);
  return Promise.resolve({ totalLines: i, totalBytes: len });
}

/**
 * 字节流式解析：TextDecoder 按块解码，处理跨块行边界，周期性 yield 主线程
 */
export async function parseBytesStream(
  bytes: Uint8Array | ArrayBuffer,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const decoder = new TextDecoder('utf-8');
  const totalBytes = view.byteLength;
  const chunkSize = 4 * 1024 * 1024; // 4MB

  let pendingLine = '';
  let i = 0;
  let lastYield = Date.now();

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = view.subarray(offset, Math.min(offset + chunkSize, totalBytes));
    let text = decoder.decode(chunk, { stream: true });
    text = pendingLine + text;
    pendingLine = '';

    const lines = text.split('\n');
    if (offset + chunkSize < totalBytes) {
      pendingLine = lines.pop() ?? '';
    }

    for (const line of lines) {
      if (line.indexOf('<Record ') !== -1 || line.indexOf('<Record\t') !== -1) {
        const rec = parseRecordLine(line);
        if (rec && rec.value !== '') {
          onRecord(rec, i);
        }
      }
      i++;
    }

    const processed = offset + chunk.byteLength;
    if (onProgress) onProgress(processed / totalBytes);

    if (Date.now() - lastYield > 50) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }

  if (pendingLine) {
    if (pendingLine.indexOf('<Record ') !== -1 || pendingLine.indexOf('<Record\t') !== -1) {
      const rec = parseRecordLine(pendingLine);
      if (rec && rec.value !== '') onRecord(rec, i);
    }
  }

  if (onProgress) onProgress(1);
  return { totalLines: i, totalBytes };
}

/**
 * 异步流式解析 XML（字符串或字节）
 */
export async function parseXmlStream(
  source: string | Uint8Array | ArrayBuffer,
  onRecord: OnRecordCallback,
  onProgress?: OnProgressCallback
): Promise<StreamParseResult> {
  if (typeof source === 'string') {
    return parseStringStream(source, onRecord, onProgress);
  }
  return parseBytesStream(source, onRecord, onProgress);
}

/**
 * 高层 API：异步解析（用于大文件 / Uint8Array）
 */
/**
 * 按行回调扫描 XML（字符串或字节），供异步解析含 Workout 块
 */
async function forEachXmlLine(
  source: string | Uint8Array | ArrayBuffer,
  onLine: (line: string) => void,
  onProgress?: OnProgressCallback
): Promise<void> {
  if (typeof source === 'string') {
    let pos = 0;
    const len = source.length;
    let i = 0;
    let lastReport = 0;
    while (pos < len) {
      let endPos = source.indexOf('\n', pos);
      if (endPos === -1) endPos = len;
      onLine(source.substring(pos, endPos));
      pos = endPos + 1;
      i++;
      if (i - lastReport > 5000) {
        lastReport = i;
        if (onProgress) onProgress(pos / len);
      }
    }
    if (onProgress) onProgress(1);
    return;
  }

  const view = source instanceof Uint8Array ? source : new Uint8Array(source);
  const decoder = new TextDecoder('utf-8');
  const totalBytes = view.byteLength;
  const chunkSize = 4 * 1024 * 1024;
  let pendingLine = '';
  let lastYield = Date.now();

  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = view.subarray(offset, Math.min(offset + chunkSize, totalBytes));
    let text = decoder.decode(chunk, { stream: true });
    text = pendingLine + text;
    pendingLine = '';
    const lines = text.split('\n');
    if (offset + chunkSize < totalBytes) {
      pendingLine = lines.pop() ?? '';
    }
    for (const line of lines) onLine(line);
    if (onProgress) onProgress((offset + chunk.byteLength) / totalBytes);
    if (Date.now() - lastYield > 50) {
      await new Promise((r) => setTimeout(r, 0));
      lastYield = Date.now();
    }
  }
  if (pendingLine) onLine(pendingLine);
  if (onProgress) onProgress(1);
}

export async function parseHealthXmlAsync(
  source: string | Uint8Array | ArrayBuffer,
  options: ParseHealthXmlOptions = {}
): Promise<HealthData> {
  const { startDate, endDate, onProgress, allowFuture, referenceDate } = options;
  const data = createEmptyData(referenceDate);
  const recOpts: ProcessRecordOptions = {
    startDate,
    endDate,
    allowFuture,
    referenceDate: data.dataQuality.referenceDate,
  };
  const state = createParseLineState();

  await forEachXmlLine(
    source,
    (line) => processXmlLine(line, data, recOpts, state),
    onProgress
  );
  flushParseLineState(state, data, recOpts);

  finalizeData(data);
  return data;
}

/**
 * 解析 ECG CSV（Apple Watch ECG 导出）
 * 兼容中英文元数据头
 */
export function parseEcgCsv(text: string): ERecordSummary {
  const lines = text.split('\n');
  const summary: ERecordSummary = {
    datetime: '',
    classification: 'unknown',
  };

  for (const line of lines) {
    const trimmed = line.trim();
    // 中文
    if (trimmed.startsWith('记录日期,')) {
      summary.datetime = trimmed.replace('记录日期,', '').trim();
    } else if (trimmed.startsWith('分类,')) {
      summary.classification = trimmed.replace('分类,', '').trim();
    } else if (trimmed.startsWith('设备,')) {
      summary.device = trimmed.replace('设备,', '').replace(/"/g, '').trim();
    } else if (trimmed.startsWith('症状,')) {
      const s = trimmed.replace('症状,', '').trim();
      if (s) summary.symptoms = s;
    }
    // 英文变体
    else if (/^Record Date,/i.test(trimmed) || /^Date,/i.test(trimmed)) {
      summary.datetime = trimmed.replace(/^[^,]+,/, '').trim();
    } else if (/^Classification,/i.test(trimmed)) {
      summary.classification = trimmed.replace(/^[^,]+,/, '').trim();
    } else if (/^Device,/i.test(trimmed)) {
      summary.device = trimmed.replace(/^[^,]+,/, '').replace(/"/g, '').trim();
    } else if (/^Symptoms,/i.test(trimmed)) {
      const s = trimmed.replace(/^[^,]+,/, '').trim();
      if (s) summary.symptoms = s;
    }

    // 采样行以数字或负号开头时跳过
    if (/^-?\d/.test(trimmed) && trimmed.includes('.')) {
      break;
    }
  }

  // 文件名回退：ecg_2026-03-26.csv
  if (!summary.datetime) {
    // no-op
  }

  return summary;
}

/**
 * 批量解析 ECG CSV 文本列表，去重后排序
 */
export function mergeEcgEntries(
  existing: ERecordSummary[] | undefined,
  texts: string[]
): ERecordSummary[] {
  const list = [...(existing || [])];
  const seen = new Set(list.map((e) => `${e.datetime}|${e.classification}`));
  for (const text of texts) {
    if (!text || (!text.includes('分类') && !/Classification/i.test(text))) continue;
    const s = parseEcgCsv(text);
    if (!s.datetime && s.classification === 'unknown') continue;
    const k = `${s.datetime}|${s.classification}`;
    if (seen.has(k)) continue;
    seen.add(k);
    list.push(s);
  }
  list.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)));
  return list;
}

/**
 * 从 zip 包提取 export.xml 字节与 ECG 条目
 * 依赖 globalThis.fflate（浏览器中由 fflate.min.js 提供）
 */
export async function extractXmlFromZip(zipFile: {
  arrayBuffer(): Promise<ArrayBuffer>;
}): Promise<{
  xmlBytes: Uint8Array;
  ecgEntries: { filename: string; text: string }[];
  xmlFileName: string;
}> {
  const g = globalThis as typeof globalThis & {
    fflate?: {
      unzipSync: (data: Uint8Array) => Record<string, Uint8Array>;
    };
  };
  if (typeof g.fflate === 'undefined') {
    throw new Error('fflate 库未加载');
  }

  const buf = await zipFile.arrayBuffer();
  const unzipped = g.fflate.unzipSync(new Uint8Array(buf));

  // 修复 macOS ZIP 文件名 UTF-8 编码问题
  const decodedEntries: Record<string, Uint8Array> = {};
  for (const key of Object.keys(unzipped)) {
    const bytes = new Uint8Array(key.length);
    for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
    let decoded: string;
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      decoded = key;
    }
    if (decoded.includes('\ufffd')) decoded = key;
    decodedEntries[decoded] = unzipped[key];
  }

  const xmlKeys = Object.keys(decodedEntries).filter((k) => /\.xml$/i.test(k));
  const xmlFile =
    xmlKeys.find((k) => k.endsWith('export.xml') && !k.endsWith('export_cda.xml')) ||
    xmlKeys.find((k) => /导出\.xml$/i.test(k)) ||
    xmlKeys
      .filter((k) => !k.endsWith('export_cda.xml'))
      .sort((a, b) => decodedEntries[b].byteLength - decodedEntries[a].byteLength)[0];

  if (!xmlFile) {
    const fileList = Object.keys(decodedEntries).slice(0, 10).join(', ');
    throw new Error(`ZIP 包中未找到 export.xml 或 导出.xml。前 10 个文件: ${fileList}`);
  }

  return {
    xmlBytes: decodedEntries[xmlFile],
    ecgEntries: Object.keys(decodedEntries)
      .filter((k) => /electrocardiograms/i.test(k) && k.endsWith('.csv'))
      .map((k) => ({
        filename: k,
        text: new TextDecoder('utf-8').decode(decodedEntries[k]),
      })),
    xmlFileName: xmlFile,
  };
}

/**
 * 从 File 读取文本
 */
export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
