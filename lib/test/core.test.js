/**
 * health-analyzer 核心库单元测试
 * 运行：npm test（tsc → .test-dist → node）
 * 不依赖 jest；仅用 node:assert
 */
'use strict';

const assert = require('node:assert/strict');

const lib = require('../.test-dist/index.js');
const {
  parseRecordLine,
  parseHealthXml,
  parseHealthXmlAsync,
  parseBytesStream,
  parseEcgCsv,
  analyzeAll,
  calcCgmStats,
  calcBloodPressureStats,
  calcWeightStats,
  calcWatchStats,
  calcWorkoutStats,
  calcEcgStats,
  enrichEcgWithContext,
  calcRecoveryWeek,
  calcRecoveryWeeks,
  recomputeRecovery,
  normalizeRecoveryWeights,
  DEFAULT_RECOVERY_WEIGHTS,
  attachRecoveryBaseline,
  workoutTypeLabel,
  generateLLMPrompt,
  generateDataOnly,
  formatAnalysisForLLM,
  SHORT_SYSTEM_PROMPT,
  MAIN_PROMPT_TEMPLATE,
  getDate,
  getHour,
  parseAppleDate,
  getLocalToday,
  isFutureDate,
  buildAnalysisSnapshot,
  compareSnapshots,
  detectCrossSignals,
  formatCrossSignalsForLLM,
  buildExportBundle,
  generateWeeklyReportMarkdown,
  generateVisitSummaryMarkdown,
  buildInsightBullets,
  generateInsightsOnlyPrompt,
  parseWeightScaleCsv,
  parseBloodPressureCsv,
  mergeExternalCsvIntoData,
  createEmptyData,
  normalizeLocale,
  pickLocale,
  createL,
} = lib;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      throw new Error(`test "${name}" 返回了 Promise，请用 await testAsync`);
    }
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

function suite(title) {
  console.log(`\n${title}`);
}

function emptyAvailability() {
  return {
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
  };
}

function emptyDataQuality(referenceDate = '2026-07-23') {
  return {
    referenceDate,
    skippedFutureCount: 0,
    futureSampleDates: [],
  };
}

function makeMinimalAnalysis(overrides = {}) {
  const data = {
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
    dataAvailability: emptyAvailability(),
    dataQuality: emptyDataQuality(),
    ...(overrides.data || {}),
  };
  if (overrides.dataAvailability) {
    data.dataAvailability = { ...data.dataAvailability, ...overrides.dataAvailability };
  }
  if (!data.dataQuality) {
    data.dataQuality = emptyDataQuality();
  }
  if (!data.watchDaily) data.watchDaily = {};
  if (!data.workouts) data.workouts = [];
  return {
    data,
    cgmStats: overrides.cgmStats ?? null,
    bpStats: overrides.bpStats ?? null,
    weightStats: overrides.weightStats ?? null,
    watchStats: overrides.watchStats ?? null,
    workoutStats: overrides.workoutStats ?? null,
    ecgStats: overrides.ecgStats ?? null,
    recoveryWeek: overrides.recoveryWeek ?? null,
    recoveryWeeks: overrides.recoveryWeeks ?? null,
    hrvByDate: overrides.hrvByDate ?? {},
    restingHrByDate: overrides.restingHrByDate ?? {},
    walkingHrByDate: overrides.walkingHrByDate ?? {},
    stepsByDate: overrides.stepsByDate ?? {},
    sleepByDate: overrides.sleepByDate ?? {},
    dateRange: overrides.dateRange ?? { start: '2026-07-01', end: '2026-07-10' },
    generatedAt: overrides.generatedAt ?? '2026-07-23T00:00:00.000Z',
  };
}

const SAMPLE_XML = [
  '<HealthData>',
  '<Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="80" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
  '<Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="120" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.0" startDate="2026-07-01 08:00:00 +0800" sourceName="CGM Sensor"/>',
  '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="9.9" startDate="2026-07-01 09:00:00 +0800" sourceName="Fingerstick"/>',
  '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 23:00:00 +0800" endDate="2026-07-02 00:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-07-01 22:00:00 +0800" endDate="2026-07-01 23:00:00 +0800" sourceName="iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierStepCount" value="1000" startDate="2026-07-01 12:00:00 +0800" sourceName="John的Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierStepCount" value="800" startDate="2026-07-01 12:00:00 +0800" sourceName="John的iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierActiveEnergyBurned" value="320" startDate="2026-07-03 10:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierAppleExerciseTime" value="25" startDate="2026-07-03 10:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKCategoryTypeIdentifierAppleStandHour" value="HKCategoryValueAppleStandHourStood" startDate="2026-07-03 10:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKCategoryTypeIdentifierAppleStandHour" value="HKCategoryValueAppleStandHourStood" startDate="2026-07-03 11:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKCategoryTypeIdentifierAppleStandHour" value="HKCategoryValueAppleStandHourIdle" startDate="2026-07-03 12:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierTimeInDaylight" value="40" startDate="2026-07-03 14:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierOxygenSaturation" value="0.975" startDate="2026-07-03 02:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierOxygenSaturation" value="0.94" startDate="2026-07-03 03:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierOxygenSaturation" value="0.98" startDate="2026-07-03 14:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierRespiratoryRate" value="14" startDate="2026-07-03 02:30:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierVO2Max" value="38.5" startDate="2026-07-03 09:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierHeartRate" value="58" startDate="2026-07-03 03:15:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierAppleSleepingWristTemperature" value="36.4" startDate="2026-07-03 05:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances" value="1.2" startDate="2026-07-01 05:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances" value="1.5" startDate="2026-07-02 05:00:00 +0800" sourceName="Apple Watch"/>',
  '<Record type="HKQuantityTypeIdentifierAppleSleepingBreathingDisturbances" value="2.1" startDate="2026-07-03 05:00:00 +0800" sourceName="Apple Watch"/>',
  '<Workout workoutActivityType="HKWorkoutActivityTypeWalking" duration="30.5" durationUnit="min" sourceName="Apple Watch" startDate="2026-07-03 18:00:00 +0800" endDate="2026-07-03 18:30:30 +0800">',
  '  <MetadataEntry key="HKAverageMETs" value="4.2 kcal/hr·kg"/>',
  '  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="120.5" unit="kcal"/>',
  '  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="2.5" unit="km"/>',
  '  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="118" minimum="100" maximum="140" unit="count/min"/>',
  '</Workout>',
  '</HealthData>',
].join('\n');

// ===========================================================================
(async () => {
  // -------------------------------------------------------------------------
  suite('parseRecordLine');
  test('解析 value / source / type', () => {
    const record = parseRecordLine(
      `<Record value='72' startDate="2026-07-01 08:00:00 +0800" type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch"/>`,
    );
    assert.ok(record);
    assert.equal(record.value, '72');
    assert.equal(record.source, 'Apple Watch');
    assert.equal(record.type, 'HKQuantityTypeIdentifierRestingHeartRate');
  });

  test('缺少 type 或 startDate 返回 null', () => {
    assert.equal(parseRecordLine(`<Record value="1" startDate="2026-07-01 00:00:00 +0800"/>`), null);
    assert.equal(parseRecordLine(`<Record type="HKQuantityTypeIdentifierStepCount" value="1"/>`), null);
  });

  // -------------------------------------------------------------------------
  suite('日期工具');
  test('getDate / getHour / parseAppleDate', () => {
    assert.equal(getDate('2026-07-01 08:30:00 +0800'), '2026-07-01');
    assert.equal(getHour('2026-07-01 08:30:00 +0800'), 8);
    const a = parseAppleDate('2026-07-01 08:00:00 +0800');
    const b = parseAppleDate('2026-07-01 09:00:00 +0800');
    assert.ok(Number.isFinite(a));
    assert.equal(b - a, 3600 * 1000);
  });

  // -------------------------------------------------------------------------
  suite('血压收缩+舒张配对');
  test('同时间戳合并为一条完整记录', () => {
    const data = parseHealthXml(SAMPLE_XML);
    assert.equal(data.bloodPressure.length, 1);
    assert.equal(data.bloodPressure[0].systolic, 120);
    assert.equal(data.bloodPressure[0].diastolic, 80);
    assert.equal(data.bloodPressure[0].date, '2026-07-02');
  });

  test('仅有一侧时不产出完整记录', () => {
    const onlySys = parseHealthXml(
      `<HealthData>
<Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="120" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>
</HealthData>`,
    );
    assert.equal(onlySys.bloodPressure.length, 0);

    const onlyDia = parseHealthXml(
      `<HealthData>
<Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="80" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>
</HealthData>`,
    );
    assert.equal(onlyDia.bloodPressure.length, 0);
  });

  test('不同时间戳各自配对并按时间排序', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="130" startDate="2026-07-03 20:00:00 +0800" sourceName="iPhone"/>',
      '<Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="85" startDate="2026-07-03 20:00:00 +0800" sourceName="iPhone"/>',
      '<Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="118" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
      '<Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="76" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.bloodPressure.length, 2);
    assert.equal(data.bloodPressure[0].systolic, 118);
    assert.equal(data.bloodPressure[1].systolic, 130);
  });

  // -------------------------------------------------------------------------
  suite('CGM 源过滤');
  test('接受 cgm / libre / glucose / 欧态；拒绝指尖血等', () => {
    const data = parseHealthXml(SAMPLE_XML);
    // Fingerstick 不含允许关键词 → 过滤；CGM Sensor 保留
    assert.equal(data.cgm.length, 1);
    assert.equal(data.cgm[0].value, 5.0);
    assert.equal(data.dataAvailability.hasCgm, true);
  });

  test('libre / 欧态 / Glucose 源均收录', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.2" startDate="2026-07-01 09:00:00 +0800" sourceName="FreeStyle Libre"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.4" startDate="2026-07-01 10:00:00 +0800" sourceName="欧态动态血糖"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.6" startDate="2026-07-01 11:00:00 +0800" sourceName="Glucose Monitor"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="6.0" startDate="2026-07-01 12:00:00 +0800" sourceName="iPhone"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="6.1" startDate="2026-07-01 13:00:00 +0800" sourceName="Health"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.cgm.length, 3);
    assert.deepEqual(
      data.cgm.map((p) => p.value),
      [5.2, 5.4, 5.6],
    );
  });

  // -------------------------------------------------------------------------
  suite('睡眠时长');
  test('Watch 睡眠按小时累计；非 Watch 忽略', () => {
    const data = parseHealthXml(SAMPLE_XML);
    assert.equal(data.sleep['2026-07-01'].core, 1);
    assert.equal(data.sleep['2026-07-01'].deep || 0, 0); // iPhone deep 被忽略
    assert.equal(data.dataAvailability.hasSleep, true);
  });

  test('多阶段时长与 total（awake 不计入 total）', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 23:00:00 +0800" endDate="2026-07-02 00:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepDeep" startDate="2026-07-02 00:00:00 +0800" endDate="2026-07-02 00:30:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepREM" startDate="2026-07-02 00:30:00 +0800" endDate="2026-07-02 01:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAwake" startDate="2026-07-02 01:00:00 +0800" endDate="2026-07-02 01:15:00 +0800" sourceName="Apple Watch"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.sleep['2026-07-01'].core, 1);
    assert.equal(data.sleep['2026-07-01'].total, 1);
    assert.equal(data.sleep['2026-07-02'].deep, 0.5);
    assert.equal(data.sleep['2026-07-02'].rem, 0.5);
    assert.equal(data.sleep['2026-07-02'].awake, 0.25);
    assert.equal(data.sleep['2026-07-02'].total, 1);
  });

  test('缺少 endDate 的睡眠被忽略', () => {
    const data = parseHealthXml(
      `<HealthData>
<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 23:00:00 +0800" sourceName="Apple Watch"/>
</HealthData>`,
    );
    assert.deepEqual(data.sleep, {});
  });

  // -------------------------------------------------------------------------
  suite('步数 watch/iphone max');
  test('分别累加并取 max', () => {
    const data = parseHealthXml(SAMPLE_XML);
    assert.equal(data.steps['2026-07-01'].watch, 1000);
    assert.equal(data.steps['2026-07-01'].iphone, 800);
    assert.equal(data.steps['2026-07-01'].max, 1000);
  });

  test('多段累加后 max 取较大源', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="3000" startDate="2026-07-05 08:00:00 +0800" sourceName="John 的 Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="1500" startDate="2026-07-05 12:00:00 +0800" sourceName="John 的 Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="4000" startDate="2026-07-05 09:00:00 +0800" sourceName="John 的 iPhone"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="2000" startDate="2026-07-05 18:00:00 +0800" sourceName="John 的 iPhone"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.steps['2026-07-05'].watch, 4500);
    assert.equal(data.steps['2026-07-05'].iphone, 6000);
    assert.equal(data.steps['2026-07-05'].max, 6000);
  });

  // -------------------------------------------------------------------------
  suite('日期过滤 startDate/endDate');
  test('过滤后仅保留区间内记录', () => {
    const filtered = parseHealthXml(SAMPLE_XML, { startDate: '2026-07-05', endDate: '2026-07-15' });
    assert.equal(filtered.cgm.length, 0);
    assert.equal(filtered.weight.length, 1);
    assert.equal(filtered.bloodPressure.length, 0);
  });

  test('startDate / endDate / 双侧闭区间', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-01 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="71" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="72" startDate="2026-07-20 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.0" startDate="2026-07-05 08:00:00 +0800" sourceName="CGM"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.5" startDate="2026-07-15 08:00:00 +0800" sourceName="CGM"/>',
      '</HealthData>',
    ].join('\n');

    assert.equal(parseHealthXml(xml).weight.length, 3);
    assert.equal(parseHealthXml(xml, { startDate: '2026-07-10' }).weight.length, 2);
    assert.equal(parseHealthXml(xml, { endDate: '2026-07-10' }).weight.length, 2);

    const both = parseHealthXml(xml, { startDate: '2026-07-05', endDate: '2026-07-15' });
    assert.equal(both.weight.length, 1);
    assert.equal(both.weight[0].value, 71);
    assert.equal(both.cgm.length, 2);
  });

  // -------------------------------------------------------------------------
  suite('calcCgmStats TIR / maxRises');
  test('空数组返回 null', () => {
    assert.equal(calcCgmStats([]), null);
  });

  test('TIR 与高低血糖占比', () => {
    const points = [
      { datetime: '2026-07-01 00:00:00 +0800', value: 2.8 },
      { datetime: '2026-07-01 00:05:00 +0800', value: 3.5 },
      { datetime: '2026-07-01 00:10:00 +0800', value: 4.5 },
      { datetime: '2026-07-01 00:15:00 +0800', value: 5.0 },
      { datetime: '2026-07-01 00:20:00 +0800', value: 6.0 },
      { datetime: '2026-07-01 00:25:00 +0800', value: 7.0 },
      { datetime: '2026-07-01 00:30:00 +0800', value: 8.0 },
      { datetime: '2026-07-01 00:35:00 +0800', value: 9.0 },
      { datetime: '2026-07-01 00:40:00 +0800', value: 11.0 },
      { datetime: '2026-07-01 00:45:00 +0800', value: 12.0 },
    ];
    const stats = calcCgmStats(points);
    assert.ok(stats);
    assert.equal(stats.overall.count, 10);
    assert.equal(stats.overall.pctBelow39, 20);
    assert.equal(stats.overall.pctBelow30, 10);
    assert.equal(stats.overall.pctInRange, 60);
    assert.equal(stats.overall.pctAbove100, 20);
    assert.equal(stats.overall.pctAbove78, 40);
  });

  test('maxRises 30min 捕捉窗口内最大上升', () => {
    const cgmStats = calcCgmStats([
      { datetime: '2026-07-01 00:00:00 +0800', value: 4 },
      { datetime: '2026-07-01 00:10:00 +0800', value: 7 },
      { datetime: '2026-07-01 00:20:00 +0800', value: 5 },
    ]);
    assert.equal(cgmStats.maxRises['30min'].rise, 3);
  });

  test('maxRises 窗口外不计入；更长窗口覆盖', () => {
    const cgm2 = calcCgmStats([
      { datetime: '2026-07-01 00:00:00 +0800', value: 4 },
      { datetime: '2026-07-01 00:40:00 +0800', value: 10 },
      { datetime: '2026-07-01 00:50:00 +0800', value: 6 },
      { datetime: '2026-07-01 01:00:00 +0800', value: 9 },
    ]);
    assert.equal(cgm2.maxRises['30min'].rise, 3);
    assert.equal(cgm2.maxRises['60min'].rise, 6);
  });

  test('分日统计', () => {
    const stats = calcCgmStats([
      { datetime: '2026-07-01 08:00:00 +0800', value: 5 },
      { datetime: '2026-07-02 08:00:00 +0800', value: 6 },
      { datetime: '2026-07-02 09:00:00 +0800', value: 7 },
    ]);
    assert.equal(stats.daily['2026-07-01'].count, 1);
    assert.equal(stats.daily['2026-07-02'].count, 2);
    assert.equal(stats.daily['2026-07-02'].mean, 6.5);
  });

  // -------------------------------------------------------------------------
  suite('calcBloodPressureStats');
  test('空记录返回 null；highest/lowest/mean7d', () => {
    assert.equal(calcBloodPressureStats([]), null);
    // mean7d: 从最新日往回 7 天（含边界）。07-08 - 7d = 07-01，三条均在窗内
    const records = [
      { datetime: '2026-06-20 08:00:00 +0800', date: '2026-06-20', systolic: 100, diastolic: 65 },
      { datetime: '2026-07-05 08:00:00 +0800', date: '2026-07-05', systolic: 140, diastolic: 90 },
      { datetime: '2026-07-08 08:00:00 +0800', date: '2026-07-08', systolic: 85, diastolic: 55 },
    ];
    const stats = calcBloodPressureStats(records);
    assert.equal(stats.highest.systolic, 140);
    assert.equal(stats.lowest.systolic, 85);
    // 7 天窗：[07-01, 07-08] → 仅 07-05 与 07-08
    assert.equal(stats.mean7d.count, 2);
    assert.equal(stats.mean7d.lowCount, 1);
    // 30 天窗会包含 06-20
    assert.equal(stats.mean30d.count, 3);
  });

  // -------------------------------------------------------------------------
  suite('generateLLMPrompt 边界声明与无数据维度');
  test('含边界声明；不含硬编码药名/旧章节数', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const prompt = generateLLMPrompt(analysis);
    assert.match(prompt, /CGM 动态血糖/);
    assert.match(prompt, /CGM 不能单独用于诊断/);
    assert.match(prompt, /最近 90 天/);
    assert.match(prompt, /指尖血复核|指尖血/);
    assert.match(prompt, /数据使用边界声明/);
    assert.match(prompt, /不替代医生门诊/);
    assert.equal(prompt.includes('COZAAR'), false);
    assert.equal(prompt.includes('11 个章节'), false);
  });

  test('无 CGM 时不生成 TIR/最大上升明细段', () => {
    const bp = [
      { datetime: '2026-07-02 08:00:00 +0800', date: '2026-07-02', systolic: 120, diastolic: 80 },
    ];
    const analysis = makeMinimalAnalysis({
      data: {
        cgm: [],
        bloodPressure: bp,
        weight: [],
        hrv: {},
        hrvOvernight: {},
        restingHr: {},
        walkingHr: {},
        steps: {},
        sleep: {},
        ecg: [],
        dataAvailability: { ...emptyAvailability(), hasBloodPressure: true },
      },
      bpStats: calcBloodPressureStats(bp),
      dateRange: { start: '2026-07-02', end: '2026-07-02' },
    });
    const formatted = formatAnalysisForLLM(analysis);
    assert.match(formatted, /CGM 动态血糖 \| ❌/);
    assert.equal(formatted.includes('TIR (3.9-10.0 mmol/L)'), false);
    assert.equal(formatted.includes('最大血糖上升'), false);
    assert.equal(formatted.includes('## CGM 动态血糖\n'), false);
    assert.match(formatted, /## 血压/);
  });

  test('无体重/HRV/ECG 时不编造对应明细章节', () => {
    const analysis = makeMinimalAnalysis({
      data: {
        cgm: [{ datetime: '2026-07-01 08:00:00 +0800', value: 5.2 }],
        bloodPressure: [],
        weight: [],
        hrv: {},
        hrvOvernight: {},
        restingHr: {},
        walkingHr: {},
        steps: {},
        sleep: {},
        ecg: [],
        dataAvailability: { ...emptyAvailability(), hasCgm: true },
      },
      cgmStats: calcCgmStats([{ datetime: '2026-07-01 08:00:00 +0800', value: 5.2 }]),
      dateRange: { start: '2026-07-01', end: '2026-07-01' },
    });
    const formatted = formatAnalysisForLLM(analysis);
    assert.match(formatted, /## CGM 动态血糖/);
    assert.equal(/## 体重\n/.test(formatted), false);
    assert.equal(/## HRV 心率变异性\n/.test(formatted), false);
    assert.equal(/## ECG 心电图\n/.test(formatted), false);
    assert.equal(/## 血压\n/.test(formatted), false);
  });

  test('generateDataOnly / SHORT_SYSTEM_PROMPT / MAIN_PROMPT_TEMPLATE', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    assert.equal(typeof generateDataOnly, 'function');
    const dataOnly = generateDataOnly(analysis);
    assert.match(dataOnly, /数据可用性/);
    assert.match(dataOnly, /跨维度提示/);
    assert.ok(dataOnly.includes(formatAnalysisForLLM(analysis)));
    assert.ok(typeof SHORT_SYSTEM_PROMPT === 'string' && SHORT_SYSTEM_PROMPT.length > 20);
    assert.ok(typeof MAIN_PROMPT_TEMPLATE === 'string' && MAIN_PROMPT_TEMPLATE.includes('{ANALYSIS_JSON}'));
  });

  test('个人上下文注入提示词；空上下文不添加章节', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const emptyPrompt = generateLLMPrompt(analysis, {});
    assert.equal(emptyPrompt.includes('个人背景（用户自述'), false);
    const ctx = {
      age: 42,
      sex: '男',
      medications: '氯沙坦钾',
      targetWeightKg: 70,
      focus: '血压与恢复',
    };
    const withCtx = generateLLMPrompt(analysis, ctx);
    assert.match(withCtx, /个人背景（用户自述/);
    assert.match(withCtx, /氯沙坦钾/);
    assert.match(withCtx, /目标体重/);
    assert.match(withCtx, /血压与恢复/);
    const dataOnly = generateDataOnly(analysis, ctx);
    assert.match(dataOnly, /氯沙坦钾/);
    assert.match(dataOnly, /数据可用性/);
  });

  // -------------------------------------------------------------------------
  suite('analyzeAll 集成');
  test('dateRange / stepsByDate 使用 max', () => {
    const data = parseHealthXml(SAMPLE_XML);
    const analysis = analyzeAll(data);
    assert.deepEqual(analysis.dateRange, { start: '2026-07-01', end: '2026-07-10' });
    assert.ok(analysis.cgmStats);
    assert.ok(analysis.bpStats);
    assert.equal(analysis.stepsByDate['2026-07-01'], 1000);
    assert.ok(analysis.generatedAt);
  });

  // -------------------------------------------------------------------------
  suite('Watch 日汇总');
  test('解析活动/血氧/呼吸/VO2/腕温/夜间心率/呼吸紊乱', () => {
    const data = parseHealthXml(SAMPLE_XML);
    assert.equal(data.dataAvailability.hasWatchActivity, true);
    assert.equal(data.dataAvailability.hasSpO2, true);
    assert.equal(data.dataAvailability.hasVo2Max, true);
    assert.equal(data.dataAvailability.hasRespiratoryRate, true);
    assert.equal(data.dataAvailability.hasWristTemp, true);
    assert.equal(data.dataAvailability.hasBreathingDisturbance, true);
    const w = data.watchDaily['2026-07-03'];
    assert.ok(w);
    assert.equal(w.activeKcal, 320);
    assert.equal(w.exerciseMin, 25);
    assert.equal(w.spo2Count, 3);
    // 夜 97.5+94，日 98
    assert.equal(w.spo2NightCount, 2);
    assert.equal(w.spo2DayCount, 1);
    assert.ok(Math.abs(w.spo2NightMin - 94) < 0.01);
    assert.ok(Math.abs(w.spo2DayMin - 98) < 0.01);
    assert.equal(w.vo2Max, 38.5);
    assert.equal(w.rrCount, 1);
    assert.equal(w.nightHrCount, 1);
    assert.equal(w.wristTempCount, 1);
    assert.equal(w.breathingDisturbance, 2.1);
    assert.equal(data.watchDaily['2026-07-01'].breathingDisturbance, 1.2);
    assert.equal(data.watchDaily['2026-07-02'].breathingDisturbance, 1.5);
    assert.equal(w.standHoursStood, 2);
    assert.equal(w.standHoursIdle, 1);
    assert.equal(w.daylightMin, 40);
  });

  test('解析 Workout 会话与统计', () => {
    const data = parseHealthXml(SAMPLE_XML);
    assert.equal(data.dataAvailability.hasWorkouts, true);
    assert.equal(data.workouts.length, 1);
    const s = data.workouts[0];
    assert.equal(s.activityType, 'Walking');
    assert.equal(s.activityLabel, '步行');
    assert.equal(workoutTypeLabel('Running'), '跑步');
    assert.ok(Math.abs(s.durationMin - 30.5) < 0.01);
    assert.ok(Math.abs(s.activeKcal - 120.5) < 0.01);
    assert.ok(Math.abs(s.distanceKm - 2.5) < 0.01);
    assert.equal(s.hrAvg, 118);
    assert.equal(s.hrMax, 140);
    const ws = calcWorkoutStats(data.workouts);
    assert.ok(ws);
    assert.equal(ws.count, 1);
    assert.equal(ws.byType[0].activityType, 'Walking');
    assert.equal(ws.byType[0].activityLabel, '步行');
  });

  test('calcWatchStats 7 日摘要与 VO2 变化', () => {
    const stats = calcWatchStats({
      '2026-07-01': {
        activeKcal: 200,
        exerciseMin: 10,
        standMin: 30,
        daylightMin: 0,
        spo2Sum: 96,
        spo2Count: 1,
        spo2Min: 96,
        spo2NightSum: 96,
        spo2NightCount: 1,
        spo2NightMin: 96,
        spo2DaySum: 0,
        spo2DayCount: 0,
        spo2DayMin: Infinity,
        rrSum: 14,
        rrCount: 1,
        nightHrSum: 55,
        nightHrCount: 1,
        vo2Max: 37,
        wristTempSum: 36.2,
        wristTempCount: 1,
        breathingDisturbance: 1.0,
      },
      '2026-07-08': {
        activeKcal: 400,
        exerciseMin: 30,
        standMin: 60,
        daylightMin: 20,
        spo2Sum: 194,
        spo2Count: 2,
        spo2Min: 93,
        spo2NightSum: 93,
        spo2NightCount: 1,
        spo2NightMin: 93,
        spo2DaySum: 101,
        spo2DayCount: 1,
        spo2DayMin: 101,
        rrSum: 15,
        rrCount: 1,
        nightHrSum: 60,
        nightHrCount: 1,
        vo2Max: 39,
        wristTempSum: 36.5,
        wristTempCount: 1,
        breathingDisturbance: 2.4,
      },
    });
    assert.ok(stats);
    assert.equal(stats.dayCount, 2);
    assert.equal(stats.vo2Latest, 39);
    assert.equal(stats.vo2Earliest, 37);
    assert.equal(stats.vo2Delta, 2);
    assert.equal(stats.spo2DayCount, 2);
    assert.equal(stats.spo2NightMin7d, 93);
    assert.ok(stats.exerciseMinMean7d != null && stats.exerciseMinMean7d >= 10);
    assert.ok(stats.spo2Mean7d != null);
    assert.equal(stats.breathingDisturbanceDayCount, 2);
    assert.equal(stats.breathingDisturbanceLatest, 2.4);
    assert.ok(stats.breathingDisturbanceMean7d != null);
    assert.ok(Math.abs(stats.breathingDisturbanceMean7d - 1.7) < 0.01);
  });

  test('analyzeAll / 提示词 / 洞察含 Watch 与 Workout', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    assert.ok(analysis.watchStats);
    assert.ok(analysis.watchStats.dayCount >= 1);
    assert.ok(analysis.watchStats.vo2Latest === 38.5);
    assert.equal(analysis.watchStats.breathingDisturbanceDayCount, 3);
    assert.equal(analysis.watchStats.breathingDisturbanceLatest, 2.1);
    assert.ok(analysis.watchStats.breathingDisturbanceMean7d != null);
    assert.ok(analysis.workoutStats);
    assert.equal(analysis.workoutStats.count, 1);
    assert.ok(analysis.recoveryWeek);
    assert.ok(analysis.recoveryWeeks);
    assert.ok(analysis.recoveryWeeks.length >= 1);
    assert.ok(analysis.recoveryWeeks.length <= 12);
    const lastWeek = analysis.recoveryWeeks[analysis.recoveryWeeks.length - 1];
    assert.equal(lastWeek.weekEnd, analysis.recoveryWeek.weekEnd);
    assert.equal(lastWeek.recoveryScore, analysis.recoveryWeek.recoveryScore);
    const formatted = formatAnalysisForLLM(analysis);
    assert.match(formatted, /Apple Watch/);
    assert.match(formatted, /血氧 SpO₂/);
    assert.match(formatted, /VO₂/);
    assert.match(formatted, /睡眠呼吸紊乱/);
    assert.match(formatted, /Workout/);
    assert.match(formatted, /步行|Walking/);
    assert.match(formatted, /负荷与恢复/);
    const bullets = buildInsightBullets(analysis);
    const titles = bullets.map((b) => b.title).join(' ');
    // 摘要最多保留 7 条，呼吸紊乱等中性项可能被裁切；至少应覆盖 Watch/恢复/训练之一
    assert.ok(/Watch 活动|血氧|VO₂|夜间心率|呼吸|腕温|睡眠呼吸紊乱|Workout|负荷|恢复/.test(titles));
    assert.ok(/负荷|恢复|Workout|Watch/.test(titles));
    const snap = buildAnalysisSnapshot(analysis);
    assert.ok(snap.metrics.watchDayCount >= 1);
    assert.equal(snap.metrics.vo2Latest, 38.5);
    assert.ok(snap.metrics.workoutCount30d >= 1);
    const bundle = buildExportBundle(analysis);
    assert.ok(bundle.csvFiles.some((f) => f.filename === 'watch_daily.csv'));
    const watchCsv = bundle.csvFiles.find((f) => f.filename === 'watch_daily.csv');
    assert.ok(watchCsv.content.includes('breathing_disturbance'));
    assert.ok(watchCsv.content.includes('2.1'));
    assert.ok(bundle.csvFiles.some((f) => f.filename === 'workouts.csv'));
  });

  test('calcRecoveryWeeks 多周序列长度与顺序', () => {
    const sleepByDate = {};
    const stepsByDate = {};
    const hrvByDate = {};
    const restingHrByDate = {};
    // 约 14 周连续睡眠 / 步数 / HRV，便于得到默认 12 周点
    for (let i = 0; i < 100; i++) {
      const d = new Date(Date.UTC(2026, 3, 1)); // 2026-04-01
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      sleepByDate[date] = { total: 7 + (i % 5) * 0.1, core: 4, deep: 1.5, rem: 1.5, awake: 0.3 };
      stepsByDate[date] = 6000 + i * 10;
      hrvByDate[date] = { allMean: 35 + (i % 7), overnightMean: 40, count: 10 };
      restingHrByDate[date] = 58 + (i % 4);
    }
    const end = '2026-07-09';
    const start = '2026-04-01';
    const partial = {
      dateRange: { start, end },
      hrvByDate,
      restingHrByDate,
      stepsByDate,
      sleepByDate,
      watchStats: null,
      workoutStats: null,
    };
    const weeks12 = calcRecoveryWeeks(partial, { weeks: 12 });
    assert.ok(weeks12);
    assert.equal(weeks12.length, 12);
    assert.equal(weeks12[weeks12.length - 1].weekEnd, end);
    // 最旧 → 最新
    for (let i = 1; i < weeks12.length; i++) {
      assert.ok(weeks12[i].weekEnd > weeks12[i - 1].weekEnd);
    }
    // 每周步进 7 天
    assert.equal(weeks12[weeks12.length - 2].weekEnd, '2026-07-02');
    const weeks4 = calcRecoveryWeeks(partial, { weeks: 4 });
    assert.ok(weeks4);
    assert.equal(weeks4.length, 4);
    const latest = calcRecoveryWeek(partial);
    assert.ok(latest);
    assert.equal(latest.recoveryScore, weeks12[weeks12.length - 1].recoveryScore);
    assert.equal(latest.loadScore, weeks12[weeks12.length - 1].loadScore);

    const analysis = analyzeAll({
      ...createEmptyData(),
      sleep: sleepByDate,
      steps: Object.fromEntries(
        Object.entries(stepsByDate).map(([d, v]) => [d, { watch: v, iphone: 0, max: v }])
      ),
      hrv: Object.fromEntries(
        Object.entries(hrvByDate).map(([d, h]) => [d, [h.allMean, h.allMean + 1]])
      ),
      restingHr: restingHrByDate,
    });
    assert.ok(analysis.recoveryWeeks);
    assert.ok(analysis.recoveryWeeks.length >= 4);
    assert.ok(analysis.recoveryWeeks.length <= 12);
    const md = formatAnalysisForLLM(analysis);
    assert.match(md, /多周恢复\/负荷趋势/);
    const bundle = buildExportBundle(analysis);
    assert.ok(bundle.csvFiles.some((f) => f.filename === 'recovery_weeks.csv'));
    // 多周历史足够时应有个人基线字段
    assert.ok(analysis.recoveryWeek);
    assert.equal(typeof analysis.recoveryWeek.baselineRecoveryMedian, 'number');
    assert.equal(typeof analysis.recoveryWeek.vsBaselineDelta, 'number');
    assert.match(md, /近几周恢复分中位|相对基线/);
  });

  test('attachRecoveryBaseline：≥4 周先验时写入中位与 delta', () => {
    const prior = [50, 52, 48, 50, 51]; // median 50
    const weeks = prior.map((score, i) => ({
      weekEnd: `2026-06-${String(1 + i * 7).padStart(2, '0')}`,
      recoveryScore: score,
      loadScore: 40,
      hrvMean7d: 40,
      nightHrMean7d: 55,
      exerciseMinMean7d: 20,
      sleepMean7d: 7,
      workoutCount7d: 1,
    }));
    const week = {
      weekEnd: '2026-07-09',
      hrvMean7d: 20,
      nightHrMean7d: 70,
      restingHrMean7d: 60,
      exerciseMinMean7d: 10,
      workoutCount7d: 0,
      workoutDuration7d: 0,
      sleepMean7d: 5,
      stepsMean7d: 3000,
      standHoursMean7d: null,
      daylightMinMean7d: null,
      spo2NightMean7d: null,
      recoveryScore: 30,
      loadScore: 20,
      statusLabel: '恢复指标偏弱，优先睡眠与减负',
      statusTone: 'watch',
      baselineRecoveryMedian: null,
      vsBaselineDelta: null,
    };
    const attached = attachRecoveryBaseline(week, weeks);
    assert.equal(attached.baselineRecoveryMedian, 50);
    assert.equal(attached.vsBaselineDelta, -20);
    assert.match(attached.statusLabel, /低于近几周中位/);

    const high = attachRecoveryBaseline({ ...week, recoveryScore: 70 }, weeks);
    assert.equal(high.vsBaselineDelta, 20);
    assert.match(high.statusLabel, /高于近几周中位/);

    // 先验不足 4 周 → 无基线
    const few = attachRecoveryBaseline(week, weeks.slice(0, 3));
    assert.equal(few.baselineRecoveryMedian, null);
    assert.equal(few.vsBaselineDelta, null);
    assert.equal(few.statusLabel, week.statusLabel);

    // |delta| < 8 不改 statusLabel 措辞
    const mild = attachRecoveryBaseline({ ...week, recoveryScore: 54 }, weeks);
    assert.equal(mild.baselineRecoveryMedian, 50);
    assert.equal(mild.vsBaselineDelta, 4);
    assert.ok(!/高于近几周中位|低于近几周中位/.test(mild.statusLabel));
  });

  test('calcRecoveryWeek 历史足够时产出 baseline delta', () => {
    const sleepByDate = {};
    const stepsByDate = {};
    const hrvByDate = {};
    const restingHrByDate = {};
    // 前 ~10 周：HRV/睡眠稳定偏高 → 恢复分偏高；最后 7 日压低
    for (let i = 0; i < 84; i++) {
      const d = new Date(Date.UTC(2026, 3, 1));
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      const late = i >= 77; // 最后 7 天
      sleepByDate[date] = {
        total: late ? 5.0 : 7.8,
        core: 4,
        deep: late ? 0.5 : 1.5,
        rem: 1.5,
        awake: 0.3,
      };
      stepsByDate[date] = late ? 2000 : 7000;
      hrvByDate[date] = {
        allMean: late ? 18 : 45,
        overnightMean: late ? 20 : 48,
        count: 10,
      };
      restingHrByDate[date] = late ? 68 : 55;
    }
    const partial = {
      dateRange: { start: '2026-04-01', end: '2026-06-23' },
      hrvByDate,
      restingHrByDate,
      stepsByDate,
      sleepByDate,
      watchStats: null,
      workoutStats: null,
    };
    const weeks = calcRecoveryWeeks(partial, { weeks: 12 });
    assert.ok(weeks && weeks.length >= 5);
    const latest = calcRecoveryWeek(partial, { recoveryWeeks: weeks });
    assert.ok(latest);
    assert.ok(latest.baselineRecoveryMedian != null);
    assert.ok(latest.vsBaselineDelta != null);
    // 末周恢复应明显低于历史中位
    assert.ok(latest.vsBaselineDelta <= -8, `expected large negative delta, got ${latest.vsBaselineDelta}`);
    assert.match(latest.statusLabel, /低于近几周中位/);

    const analysis = analyzeAll({
      ...createEmptyData(),
      sleep: sleepByDate,
      steps: Object.fromEntries(
        Object.entries(stepsByDate).map(([d, v]) => [d, { watch: v, iphone: 0, max: v }])
      ),
      hrv: Object.fromEntries(
        Object.entries(hrvByDate).map(([d, h]) => [d, [h.allMean, h.allMean + 1]])
      ),
      restingHr: restingHrByDate,
    });
    assert.ok(analysis.recoveryWeek?.baselineRecoveryMedian != null);
    assert.ok((analysis.recoveryWeek?.vsBaselineDelta ?? 0) <= -8);
    const promptMd = formatAnalysisForLLM(analysis);
    assert.match(promptMd, /近几周恢复分中位|相对基线|低于近几周中位/);
  });

  test('RecoveryWeights：极端 HRV 权重使 recoveryScore 按预期偏移', () => {
    // 高 HRV + 偏低睡眠：等权时取中；拉高 hrv 权重应抬高恢复分
    const sleepByDate = {};
    const stepsByDate = {};
    const hrvByDate = {};
    const restingHrByDate = {};
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(2026, 6, 1));
      d.setUTCDate(d.getUTCDate() + i);
      const date = d.toISOString().slice(0, 10);
      // 睡眠偏短 → 睡眠分约 5/8*100≈62.5；HRV 高 → (55-15)/45*100≈89
      sleepByDate[date] = { total: 5.0, core: 3, deep: 0.8, rem: 1.0, awake: 0.4 };
      stepsByDate[date] = 5000;
      hrvByDate[date] = { allMean: 55, overnightMean: 58, count: 10 };
      restingHrByDate[date] = 58;
    }
    const partial = {
      dateRange: { start: '2026-07-01', end: '2026-07-14' },
      hrvByDate,
      restingHrByDate,
      stepsByDate,
      sleepByDate,
      watchStats: null,
      workoutStats: null,
    };
    const equal = calcRecoveryWeek(partial, { skipBaseline: true });
    assert.ok(equal && equal.recoveryScore != null);

    const highHrv = calcRecoveryWeek(partial, {
      skipBaseline: true,
      recoveryWeights: { hrv: 10, sleep: 0.1, nightHr: 0.1, spo2Night: 0.1 },
    });
    assert.ok(highHrv && highHrv.recoveryScore != null);
    assert.ok(
      highHrv.recoveryScore > equal.recoveryScore,
      `extreme hrv weight should raise recoveryScore: equal=${equal.recoveryScore} highHrv=${highHrv.recoveryScore}`
    );

    const lowHrv = calcRecoveryWeek(partial, {
      skipBaseline: true,
      recoveryWeights: { hrv: 0.1, sleep: 10, nightHr: 0.1, spo2Night: 0.1 },
    });
    assert.ok(lowHrv && lowHrv.recoveryScore != null);
    assert.ok(
      lowHrv.recoveryScore < equal.recoveryScore,
      `low hrv / high sleep weight should lower recoveryScore when sleep is weak: equal=${equal.recoveryScore} lowHrv=${lowHrv.recoveryScore}`
    );

    // 默认权重 / 全 1.0 与省略权重一致
    const withDefault = calcRecoveryWeek(partial, {
      skipBaseline: true,
      recoveryWeights: DEFAULT_RECOVERY_WEIGHTS,
    });
    assert.equal(withDefault.recoveryScore, equal.recoveryScore);
    assert.equal(withDefault.loadScore, equal.loadScore);

    // recomputeRecovery 与 calc 路径一致
    const recomputed = recomputeRecovery(partial, {
      recoveryWeights: { hrv: 10, sleep: 0.1 },
    });
    assert.ok(recomputed.recoveryWeek);
    assert.equal(recomputed.recoveryWeek.recoveryScore, highHrv.recoveryScore);

    // normalize：非正数回退默认
    const n = normalizeRecoveryWeights({ hrv: -1, sleep: 2 });
    assert.equal(n.hrv, 1);
    assert.equal(n.sleep, 2);
  });

  test('generateWeeklyReportMarkdown 含关键章节', () => {
    const analysis = analyzeAll({
      ...createEmptyData(),
      sleep: {
        '2026-07-04': { total: 7.2, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
        '2026-07-05': { total: 6.8, core: 4, deep: 1.0, rem: 1.4, awake: 0.4 },
        '2026-07-06': { total: 7.5, core: 4, deep: 1.3, rem: 1.6, awake: 0.2 },
        '2026-07-07': { total: 7.0, core: 4, deep: 1.1, rem: 1.5, awake: 0.3 },
        '2026-07-08': { total: 7.1, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
        '2026-07-09': { total: 6.9, core: 4, deep: 1.0, rem: 1.4, awake: 0.4 },
        '2026-07-10': { total: 7.3, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
      },
      steps: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, { watch: 8000, iphone: 0, max: 8000 }]
        )
      ),
      hrv: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, [40, 42]]
        )
      ),
      restingHr: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, 58]
        )
      ),
      workouts: [
        {
          startDate: '2026-07-08 18:00:00 +0800',
          endDate: '2026-07-08 18:40:00 +0800',
          date: '2026-07-08',
          activityType: 'HKWorkoutActivityTypeWalking',
          activityLabel: '步行',
          durationMin: 40,
          activeKcal: 180,
          distanceKm: 3.2,
          hrAvg: 120,
          hrMin: 90,
          hrMax: 140,
          avgMets: 4.5,
          indoor: false,
          source: 'Apple Watch',
        },
      ],
    });
    const md = generateWeeklyReportMarkdown(analysis, { age: 40, focus: '恢复' });
    assert.match(md, /本周健康监测周报/);
    assert.match(md, /负荷与恢复/);
    assert.match(md, /监测摘要/);
    assert.match(md, /关键跨维度信号/);
    assert.match(md, /本周数据速览/);
    assert.match(md, /HRV/);
    assert.match(md, /Workout 本周场次/);
    assert.match(md, /步行|Walking/);
    assert.match(md, /边界声明/);
    assert.match(md, /非医疗诊断|非诊断/);
    assert.match(md, /个人背景|年龄|恢复/);
    // v1.17 模板：目录 + emoji 章节标记
    assert.match(md, /目录/);
    assert.match(md, /🧭|📋|⚠️/);
    assert.equal(typeof generateWeeklyReportMarkdown, 'function');
  });

  test('generateWeeklyReportMarkdown EN locale sections', () => {
    const analysis = analyzeAll({
      ...createEmptyData(),
      sleep: {
        '2026-07-04': { total: 7.2, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
        '2026-07-05': { total: 6.8, core: 4, deep: 1.0, rem: 1.4, awake: 0.4 },
        '2026-07-06': { total: 7.5, core: 4, deep: 1.3, rem: 1.6, awake: 0.2 },
        '2026-07-07': { total: 7.0, core: 4, deep: 1.1, rem: 1.5, awake: 0.3 },
        '2026-07-08': { total: 7.1, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
        '2026-07-09': { total: 6.9, core: 4, deep: 1.0, rem: 1.4, awake: 0.4 },
        '2026-07-10': { total: 7.3, core: 4, deep: 1.2, rem: 1.5, awake: 0.3 },
      },
      steps: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, { watch: 8000, iphone: 0, max: 8000 }]
        )
      ),
      hrv: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, [40, 42]]
        )
      ),
      restingHr: Object.fromEntries(
        ['2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'].map(
          (d) => [d, 58]
        )
      ),
    });
    const md = generateWeeklyReportMarkdown(analysis, { age: 40, focus: 'recovery' }, { locale: 'en' });
    assert.match(md, /Weekly|Recovery|Disclaimer|Boundary/i);
    assert.match(md, /Monitoring summary|Load & Recovery|Boundary/i);
    assert.doesNotMatch(md, /本周健康监测周报/);
    assert.doesNotMatch(md, /边界声明/);
  });

  test('generateVisitSummaryMarkdown 门诊一页纸中英', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const zh = generateVisitSummaryMarkdown(analysis, { age: 42, focus: '血压' });
    assert.match(zh, /门诊快速评估一页纸|一页纸/);
    assert.match(zh, /核心指标|监测要点|边界声明/);
    assert.match(zh, /非诊断|不替代门诊/);
    const en = generateVisitSummaryMarkdown(analysis, null, { locale: 'en' });
    assert.match(en, /Clinic visit one-pager|one-pager/i);
    assert.match(en, /Key metrics|Disclaimer|Not a diagnosis/i);
    assert.doesNotMatch(en, /门诊快速评估一页纸/);
  });

  test('睡眠呼吸紊乱抬升可产生信号', () => {
    const emptyDay = (bd) => ({
      activeKcal: 100,
      exerciseMin: 10,
      standMin: 20,
      daylightMin: 0,
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
      breathingDisturbance: bd,
    });
    const watchDaily = {};
    // 前半低、后半抬升（满足相对基线启发式）
    const vals = [1.0, 1.1, 1.0, 1.2, 2.0, 2.4, 2.6, 2.8];
    vals.forEach((v, i) => {
      const d = `2026-07-${String(i + 1).padStart(2, '0')}`;
      watchDaily[d] = emptyDay(v);
    });
    const analysis = makeMinimalAnalysis({
      watchStats: calcWatchStats(watchDaily),
      data: { watchDaily },
      dateRange: { start: '2026-07-01', end: '2026-07-08' },
    });
    const signals = detectCrossSignals(analysis);
    const bd = signals.filter((s) => /睡眠呼吸紊乱/.test(s.title));
    assert.ok(bd.length >= 1, 'expected breathing disturbance signal');
  });

  test('呼吸紊乱×夜段血氧：同日联合 → watch', () => {
    const day = (bd, nightMean, nightMin) => ({
      activeKcal: 100,
      exerciseMin: 10,
      standMin: 20,
      daylightMin: 0,
      spo2Sum: nightMean,
      spo2Count: 1,
      spo2Min: nightMin,
      spo2NightSum: nightMean,
      spo2NightCount: 1,
      spo2NightMin: nightMin,
      spo2DaySum: 97,
      spo2DayCount: 1,
      spo2DayMin: 97,
      rrSum: 0,
      rrCount: 0,
      nightHrSum: 0,
      nightHrCount: 0,
      wristTempSum: 0,
      wristTempCount: 0,
      breathingDisturbance: bd,
    });
    const watchDaily = {
      '2026-07-01': day(1.0, 96, 95),
      '2026-07-02': day(1.1, 96, 95),
      '2026-07-03': day(1.0, 96, 95),
      '2026-07-04': day(1.2, 95, 94),
      // 紊乱抬升 + 夜段血氧偏低（同日）
      '2026-07-05': day(2.2, 91, 90),
      '2026-07-06': day(2.4, 90, 89),
    };
    const analysis = makeMinimalAnalysis({
      watchStats: calcWatchStats(watchDaily),
      data: { watchDaily },
      dateRange: { start: '2026-07-01', end: '2026-07-06' },
    });
    const signals = detectCrossSignals(analysis);
    const joint = signals.filter((s) => /呼吸紊乱.*夜段血氧|夜段血氧.*呼吸紊乱/.test(s.title));
    assert.ok(joint.length >= 1, 'expected BD×night SpO2 joint signal, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(joint[0].severity, 'watch');
    assert.ok(joint.some((s) => s.dimensions.includes('睡眠呼吸紊乱') && s.dimensions.includes('血氧')));
  });

  test('呼吸紊乱×夜段血氧：7 日联合 → watch', () => {
    const day = (bd, nightMean, nightMin) => ({
      activeKcal: 120,
      exerciseMin: 15,
      standMin: 30,
      daylightMin: 10,
      spo2Sum: nightMean,
      spo2Count: 1,
      spo2Min: nightMin,
      spo2NightSum: nightMean,
      spo2NightCount: 1,
      spo2NightMin: nightMin,
      spo2DaySum: 97,
      spo2DayCount: 1,
      spo2DayMin: 97,
      rrSum: 0,
      rrCount: 0,
      nightHrSum: 0,
      nightHrCount: 0,
      wristTempSum: 0,
      wristTempCount: 0,
      breathingDisturbance: bd,
    });
    const watchDaily = {};
    // 前半紊乱低、夜氧正常；后半紊乱抬升、夜氧均值 <95 / 最低 <92
    const rows = [
      [1.0, 97, 96],
      [1.0, 97, 96],
      [1.1, 96, 95],
      [1.0, 97, 96],
      [2.0, 93, 91],
      [2.3, 92, 90],
      [2.5, 92, 90],
      [2.6, 91, 89],
    ];
    rows.forEach(([bd, nm, nmin], i) => {
      watchDaily[`2026-07-${String(i + 1).padStart(2, '0')}`] = day(bd, nm, nmin);
    });
    const analysis = makeMinimalAnalysis({
      watchStats: calcWatchStats(watchDaily),
      data: { watchDaily },
      dateRange: { start: '2026-07-01', end: '2026-07-08' },
    });
    const signals = detectCrossSignals(analysis);
    const joint7 = signals.filter((s) => /近 7 日呼吸紊乱偏高且夜段血氧/.test(s.title));
    assert.ok(joint7.length >= 1, 'expected 7d BD×SpO2 signal, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(joint7[0].severity, 'watch');

    const bullets = buildInsightBullets(analysis);
    const jointBullet = bullets.filter((b) => /呼吸紊乱与夜段血氧/.test(b.title));
    assert.ok(jointBullet.length >= 1, 'expected insight bullet for BD×night SpO2');
  });

  test('CGM×睡眠：同日低值偏多+睡眠偏短 → watch', () => {
    const dayStats = {
      mean: 4.2,
      std: 0.8,
      cv: 19,
      min: 3.1,
      max: 6.0,
      count: 24,
      pctBelow39: 25,
      pctAbove78: 0,
      pctAbove100: 0,
    };
    const analysis = makeMinimalAnalysis({
      cgmStats: {
        overall: {
          ...dayStats,
          count: 48,
          timeRange: '2026-07-04 至 2026-07-05',
          pctBelow30: 0,
          pctInRange: 75,
        },
        firstDayDate: null,
        firstDay: null,
        stable: null,
        daily: {
          '2026-07-05': dayStats,
        },
        maxRises: {
          '30min': { rise: 0, time: '' },
          '60min': { rise: 0, time: '' },
          '120min': { rise: 0, time: '' },
        },
      },
      sleepByDate: {
        '2026-07-05': { total: 5.2, core: 3, deep: 1, rem: 1, awake: 0.2 },
      },
      stepsByDate: { '2026-07-05': 5000 },
      dateRange: { start: '2026-07-05', end: '2026-07-05' },
    });
    const signals = detectCrossSignals(analysis);
    const hit = signals.filter((s) => s.title === '睡眠偏短且 CGM 低值偏多');
    assert.ok(hit.length >= 1, 'expected CGM×sleep short signal, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(hit[0].severity, 'watch');
    assert.equal(hit[0].date, '2026-07-05');
    assert.ok(hit[0].dimensions.includes('CGM') && hit[0].dimensions.includes('睡眠'));
  });

  test('CGM×活动：同日高血糖读数+低步数 → info', () => {
    const dayStats = {
      mean: 8.5,
      std: 1.2,
      cv: 14,
      min: 6.0,
      max: 11.0,
      count: 20,
      pctBelow39: 0,
      pctAbove78: 40,
      pctAbove100: 5,
    };
    const analysis = makeMinimalAnalysis({
      cgmStats: {
        overall: {
          ...dayStats,
          timeRange: '2026-07-06',
          pctBelow30: 0,
          pctInRange: 50,
        },
        firstDayDate: null,
        firstDay: null,
        stable: null,
        daily: { '2026-07-06': dayStats },
        maxRises: {
          '30min': { rise: 0, time: '' },
          '60min': { rise: 0, time: '' },
          '120min': { rise: 0, time: '' },
        },
      },
      stepsByDate: { '2026-07-06': 1500 },
      sleepByDate: {
        '2026-07-06': { total: 7.5, core: 4, deep: 1.5, rem: 1.5, awake: 0.3 },
      },
      dateRange: { start: '2026-07-06', end: '2026-07-06' },
    });
    const signals = detectCrossSignals(analysis);
    const hit = signals.filter((s) => s.title === '高血糖读数日活动偏低');
    assert.ok(hit.length >= 1, 'expected CGM×steps signal, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(hit[0].severity, 'info');
    assert.ok(hit[0].dimensions.includes('CGM') && hit[0].dimensions.includes('步数'));
  });

  test('CGM×睡眠：稳定期低值偏多+近7日睡眠偏短 → info', () => {
    const seg = {
      mean: 5.0,
      std: 1.0,
      cv: 20,
      min: 3.2,
      max: 8.0,
      count: 120,
      timeRange: '2026-07-01 至 2026-07-07',
      pctBelow39: 8,
      pctBelow30: 0,
      pctInRange: 85,
      pctAbove78: 5,
      pctAbove100: 0,
    };
    const sleepByDate = {};
    for (let i = 1; i <= 7; i++) {
      const d = `2026-07-0${i}`;
      sleepByDate[d] = { total: 5.0 + (i % 3) * 0.1, core: 3, deep: 1, rem: 1, awake: 0.2 };
    }
    const analysis = makeMinimalAnalysis({
      cgmStats: {
        overall: seg,
        firstDayDate: null,
        firstDay: null,
        stable: seg,
        daily: {},
        maxRises: {
          '30min': { rise: 0, time: '' },
          '60min': { rise: 0, time: '' },
          '120min': { rise: 0, time: '' },
        },
      },
      sleepByDate,
      dateRange: { start: '2026-07-01', end: '2026-07-07' },
    });
    const signals = detectCrossSignals(analysis);
    const hit = signals.filter((s) => /稳定期 CGM 低值偏多且近 7 日睡眠偏短/.test(s.title));
    assert.ok(hit.length >= 1, 'expected multi-day CGM×sleep, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(hit[0].severity, 'info');
  });

  test('insights：CGM×睡眠/活动至多一条', () => {
    const lowDay = {
      mean: 4.0,
      std: 0.9,
      cv: 22,
      min: 3.0,
      max: 6.5,
      count: 24,
      pctBelow39: 22,
      pctAbove78: 0,
      pctAbove100: 0,
    };
    const highDay = {
      mean: 8.8,
      std: 1.0,
      cv: 11,
      min: 6.5,
      max: 11.2,
      count: 20,
      pctBelow39: 0,
      pctAbove78: 35,
      pctAbove100: 8,
    };
    const sleepByDate = {
      '2026-07-05': { total: 5.0, core: 3, deep: 1, rem: 1, awake: 0.2 },
      '2026-07-06': { total: 7.0, core: 4, deep: 1.5, rem: 1.5, awake: 0.2 },
    };
    for (let i = 1; i <= 7; i++) {
      const d = `2026-07-${String(i).padStart(2, '0')}`;
      if (!sleepByDate[d]) {
        sleepByDate[d] = { total: 5.1, core: 3, deep: 1, rem: 1, awake: 0.2 };
      }
    }
    const analysis = makeMinimalAnalysis({
      cgmStats: {
        overall: {
          mean: 5.5,
          std: 1.2,
          cv: 22,
          min: 3.0,
          max: 11.2,
          count: 200,
          timeRange: '2026-07-01 至 2026-07-07',
          pctBelow39: 8,
          pctBelow30: 0,
          pctInRange: 80,
          pctAbove78: 10,
          pctAbove100: 2,
        },
        firstDayDate: null,
        firstDay: null,
        stable: {
          mean: 5.5,
          std: 1.2,
          cv: 22,
          min: 3.0,
          max: 11.2,
          count: 180,
          timeRange: '2026-07-02 至 2026-07-07',
          pctBelow39: 7,
          pctBelow30: 0,
          pctInRange: 80,
          pctAbove78: 10,
          pctAbove100: 2,
        },
        daily: {
          '2026-07-05': lowDay,
          '2026-07-06': highDay,
        },
        maxRises: {
          '30min': { rise: 0, time: '' },
          '60min': { rise: 0, time: '' },
          '120min': { rise: 0, time: '' },
        },
      },
      sleepByDate,
      stepsByDate: {
        '2026-07-05': 6000,
        '2026-07-06': 1200,
      },
      dateRange: { start: '2026-07-01', end: '2026-07-07' },
    });
    const signals = detectCrossSignals(analysis);
    const cgmJoints = signals.filter(
      (s) =>
        s.dimensions.includes('CGM') &&
        (s.dimensions.includes('睡眠') || s.dimensions.includes('步数'))
    );
    assert.ok(cgmJoints.length >= 2, 'expected multiple CGM joint signals for cap test');

    const bullets = buildInsightBullets(analysis);
    const cgmJointBullets = bullets.filter(
      (b) =>
        /睡眠偏短且 CGM|高血糖读数日活动偏低|稳定期 CGM 低值偏多且近 7 日睡眠|夜段 CGM 偏低/.test(
          b.title
        )
    );
    assert.ok(cgmJointBullets.length <= 1, 'at most one CGM×sleep/activity insight, got: ' + cgmJointBullets.map((b) => b.title).join('; '));
    assert.ok(cgmJointBullets.length === 1, 'expected exactly one CGM joint insight when signals fire');
  });

  test('CGM×夜 HR：夜段均值低+全日低值偏多+夜心率偏高 → info', () => {
    const dayStats = {
      mean: 4.3,
      std: 0.7,
      cv: 16,
      min: 3.2,
      max: 6.0,
      count: 30,
      pctBelow39: 18,
      pctAbove78: 0,
      pctAbove100: 0,
    };
    const cgm = [];
    // 0–5 点偏低读数
    for (let h = 0; h < 6; h++) {
      cgm.push({ datetime: `2026-07-08 ${String(h).padStart(2, '0')}:15:00 +0800`, value: 3.5 });
    }
    // 白天正常，保证全日 count 与 pctBelow39
    for (let h = 8; h < 20; h++) {
      cgm.push({
        datetime: `2026-07-08 ${String(h).padStart(2, '0')}:00:00 +0800`,
        value: h % 3 === 0 ? 3.6 : 5.0,
      });
    }
    const watchDaily = {
      '2026-07-08': {
        activeKcal: 200,
        exerciseMin: 20,
        standMin: 40,
        daylightMin: 30,
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
        nightHrSum: 80 * 10,
        nightHrCount: 10,
        wristTempSum: 0,
        wristTempCount: 0,
        breathingDisturbance: null,
      },
    };
    const analysis = makeMinimalAnalysis({
      cgmStats: {
        overall: {
          ...dayStats,
          timeRange: '2026-07-08',
          pctBelow30: 0,
          pctInRange: 80,
        },
        firstDayDate: null,
        firstDay: null,
        stable: null,
        daily: { '2026-07-08': dayStats },
        maxRises: {
          '30min': { rise: 0, time: '' },
          '60min': { rise: 0, time: '' },
          '120min': { rise: 0, time: '' },
        },
      },
      watchStats: calcWatchStats(watchDaily),
      data: { cgm, watchDaily },
      restingHrByDate: {
        '2026-07-02': 60,
        '2026-07-03': 61,
        '2026-07-04': 59,
        '2026-07-05': 60,
        '2026-07-06': 62,
        '2026-07-07': 60,
        '2026-07-08': 61,
      },
      dateRange: { start: '2026-07-08', end: '2026-07-08' },
    });
    const signals = detectCrossSignals(analysis);
    const hit = signals.filter((s) => /夜段 CGM 偏低且夜间心率偏高/.test(s.title));
    assert.ok(hit.length >= 1, 'expected night CGM×HR signal, got: ' + signals.map((s) => s.title).join('; '));
    assert.equal(hit[0].severity, 'info');
  });

  test('calcEcgStats 分类计数', () => {
    const stats = calcEcgStats([
      { datetime: '2026-07-01 10:00:00 +0800', classification: '窦性心律' },
      { datetime: '2026-07-02 10:00:00 +0800', classification: '高心率' },
      { datetime: '2026-07-03 10:00:00 +0800', classification: '窦性心律' },
      { datetime: '2026-07-04 10:00:00 +0800', classification: '记录结果不佳' },
    ]);
    assert.ok(stats);
    assert.equal(stats.count, 4);
    assert.equal(stats.sinusCount, 2);
    assert.equal(stats.highHrCount, 1);
    assert.equal(stats.inconclusiveCount, 1);
    assert.equal(stats.latest.classification, '记录结果不佳');
    assert.equal(stats.highHrByHour[10], 1);
    assert.equal(stats.highHrNearWorkoutCount, 0);
    assert.equal(stats.highHrRestingWindowCount, 1);
    assert.deepEqual(stats.recentHighHr, ['2026-07-02 10:00:00 +0800']);
  });

  test('enrichEcgWithContext 训练邻域与夜间非运动窗', () => {
    const workouts = [
      {
        startDate: '2026-07-10 18:00:00 +0800',
        date: '2026-07-10',
        activityType: 'Running',
        activityLabel: '跑步',
        durationMin: 40,
      },
      {
        startDate: '2026-07-12 07:00:00 +0800',
        date: '2026-07-12',
        activityType: 'TraditionalStrengthTraining',
        activityLabel: '力量',
        durationMin: 50,
      },
    ];
    const ecg = [
      // 训练后 1h（白天）→ near，非 resting（非 22–08 且 near）
      { datetime: '2026-07-10 19:00:00 +0800', classification: '高心率' },
      // 训练前 90min（白天）→ near
      { datetime: '2026-07-10 16:30:00 +0800', classification: '高心率' },
      // 同日白天但距训练 >2h → 非 near → resting
      { datetime: '2026-07-10 12:00:00 +0800', classification: '高心率' },
      // 夜间 23 点、无附近训练 → resting；byHour[23]
      { datetime: '2026-07-11 23:15:00 +0800', classification: '高心率' },
      // 清晨 6 点且在力量训练 ±2h → near 且 night → resting
      { datetime: '2026-07-12 06:30:00 +0800', classification: '高心率' },
      // 窦性不计入
      { datetime: '2026-07-12 08:00:00 +0800', classification: '窦性心律' },
      // High Heart Rate 英文分类
      { datetime: '2026-07-13 14:00:00 +0800', classification: 'High Heart Rate' },
    ];

    const ctx = enrichEcgWithContext(ecg, workouts);
    assert.equal(ctx.highHrByHour[19], 1);
    assert.equal(ctx.highHrByHour[16], 1);
    assert.equal(ctx.highHrByHour[12], 1);
    assert.equal(ctx.highHrByHour[23], 1);
    assert.equal(ctx.highHrByHour[6], 1);
    assert.equal(ctx.highHrByHour[14], 1);
    // near: 19:00, 16:30, 06:30 → 3
    assert.equal(ctx.highHrNearWorkoutCount, 3);
    // resting: 12:00 (!near), 23:15 (night), 06:30 (night), 14:00 (!near) → 4
    // 19:00 与 16:30 白天 near 不计 resting
    assert.equal(ctx.highHrRestingWindowCount, 4);
    assert.equal(ctx.recentHighHr.length, 5);
    assert.equal(ctx.recentHighHr[ctx.recentHighHr.length - 1], '2026-07-13 14:00:00 +0800');

    const stats = calcEcgStats(ecg, workouts);
    assert.ok(stats);
    assert.equal(stats.highHrCount, 6);
    assert.equal(stats.highHrNearWorkoutCount, 3);
    assert.equal(stats.highHrRestingWindowCount, 4);
  });

  test('enrichEcgWithContext 无 workout 时全部计非运动窗', () => {
    const ctx = enrichEcgWithContext(
      [
        { datetime: '2026-07-01 15:00:00 +0800', classification: '高心率' },
        { datetime: '2026-07-02 03:00:00 +0800', classification: '高心率' },
      ],
      []
    );
    assert.equal(ctx.highHrNearWorkoutCount, 0);
    assert.equal(ctx.highHrRestingWindowCount, 2);
    assert.equal(ctx.highHrByHour[15], 1);
    assert.equal(ctx.highHrByHour[3], 1);
    assert.equal(ctx.highHrOnLowActivityCount, 0);
    assert.equal(ctx.highHrOnHighActivityCount, 0);
  });

  test('enrichEcgWithContext 高心率×同日活动（低/高活动日）', () => {
    const ecg = [
      // 低活动：步数 1200、锻炼 5
      { datetime: '2026-07-01 10:00:00 +0800', classification: '高心率' },
      // 低活动：步数 800、无锻炼字段
      { datetime: '2026-07-02 11:00:00 +0800', classification: '高心率' },
      // 高活动：步数 10000
      { datetime: '2026-07-03 12:00:00 +0800', classification: '高心率' },
      // 高活动：锻炼 30（步数中等）
      { datetime: '2026-07-04 13:00:00 +0800', classification: '高心率' },
      // 高活动：训练 ±2h
      { datetime: '2026-07-05 18:30:00 +0800', classification: '高心率' },
      // 窦性不计
      { datetime: '2026-07-06 09:00:00 +0800', classification: '窦性心律' },
    ];
    const workouts = [
      {
        startDate: '2026-07-05 18:00:00 +0800',
        date: '2026-07-05',
        activityType: 'Running',
        activityLabel: '跑步',
        durationMin: 35,
      },
    ];
    const activity = {
      stepsByDate: {
        '2026-07-01': 1200,
        '2026-07-02': 800,
        '2026-07-03': 10000,
        '2026-07-04': 5000,
        '2026-07-05': 4000,
      },
      watchDaily: {
        '2026-07-01': { exerciseMin: 5 },
        '2026-07-03': { exerciseMin: 15 },
        '2026-07-04': { exerciseMin: 30 },
        '2026-07-05': { exerciseMin: 8 },
      },
    };
    const ctx = enrichEcgWithContext(ecg, workouts, activity);
    assert.equal(ctx.highHrOnLowActivityCount, 2);
    // 高：10000 步、锻炼30、训练邻域 → 3
    assert.equal(ctx.highHrOnHighActivityCount, 3);
    assert.equal(ctx.highHrNearWorkoutCount, 1);

    const stats = calcEcgStats(ecg, workouts, activity);
    assert.ok(stats);
    assert.equal(stats.highHrCount, 5);
    assert.equal(stats.highHrOnLowActivityCount, 2);
    assert.equal(stats.highHrOnHighActivityCount, 3);
  });

  test('detectCrossSignals 低活动日高心率 ECG → watch', () => {
    const analysis = analyzeAll({
      ...createEmptyData(),
      ecg: [
        { datetime: '2026-07-01 10:00:00 +0800', classification: '高心率' },
        { datetime: '2026-07-02 11:00:00 +0800', classification: '高心率' },
        { datetime: '2026-07-03 12:00:00 +0800', classification: '窦性心律' },
      ],
      steps: {
        '2026-07-01': { watch: 1500, iphone: 0, max: 1500 },
        '2026-07-02': { watch: 900, iphone: 0, max: 900 },
        '2026-07-03': { watch: 2000, iphone: 0, max: 2000 },
      },
      watchDaily: {
        '2026-07-01': {
          activeKcal: 50,
          exerciseMin: 3,
          standMin: 10,
          daylightMin: 0,
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
        },
        '2026-07-02': {
          activeKcal: 40,
          exerciseMin: 2,
          standMin: 8,
          daylightMin: 0,
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
        },
      },
    });
    assert.ok(analysis.ecgStats);
    assert.equal(analysis.ecgStats.highHrOnLowActivityCount, 2);
    const signals = detectCrossSignals(analysis);
    const low = signals.filter((s) => /低活动日仍出现高心率 ECG/.test(s.title));
    assert.ok(low.length >= 1, 'expected low-activity high-HR signal');
    assert.equal(low[0].severity, 'watch');

    const md = formatAnalysisForLLM(analysis);
    assert.match(md, /高心率×活动日/);
  });

  test('detectCrossSignals 高心率训练关联 → info', () => {
    const analysis = analyzeAll({
      ...createEmptyData(),
      ecg: [
        { datetime: '2026-07-10 18:30:00 +0800', classification: '高心率' },
        { datetime: '2026-07-11 18:45:00 +0800', classification: '高心率' },
        { datetime: '2026-07-12 19:00:00 +0800', classification: '窦性心律' },
      ],
      workouts: [
        {
          startDate: '2026-07-10 18:00:00 +0800',
          date: '2026-07-10',
          activityType: 'Running',
          activityLabel: '跑步',
          durationMin: 40,
        },
        {
          startDate: '2026-07-11 18:00:00 +0800',
          date: '2026-07-11',
          activityType: 'Running',
          activityLabel: '跑步',
          durationMin: 35,
        },
      ],
    });
    const signals = detectCrossSignals(analysis);
    assert.ok(
      signals.some((s) => s.title.includes('训练时段') && s.severity === 'info'),
      'expected training-window high-HR info signal'
    );
  });

  test('detectCrossSignals 非运动时段高心率 → watch', () => {
    const analysis = analyzeAll({
      ...createEmptyData(),
      ecg: [
        { datetime: '2026-07-10 23:10:00 +0800', classification: '高心率' },
        { datetime: '2026-07-11 02:20:00 +0800', classification: '高心率' },
        { datetime: '2026-07-12 07:00:00 +0800', classification: '高心率' },
      ],
      workouts: [],
    });
    const signals = detectCrossSignals(analysis);
    assert.ok(
      signals.some((s) => s.title.includes('非运动时段') && s.severity === 'watch'),
      'expected non-exercise high-HR watch signal'
    );
  });

  // -------------------------------------------------------------------------
  suite('晨重 / 体脂 / CGM 分桶 / 血压晨晚');
  test('calcWeightStats 同日取晨起为趋势', () => {
    const stats = calcWeightStats([
      { datetime: '2026-07-21 07:30:00 +0800', date: '2026-07-21', value: 66.5 },
      { datetime: '2026-07-21 22:00:00 +0800', date: '2026-07-21', value: 67.6 },
      { datetime: '2026-07-22 07:35:00 +0800', date: '2026-07-22', value: 66.9, bodyFat: 22.1 },
    ]);
    assert.equal(stats.dayCount, 2);
    assert.equal(stats.latestTrend.weight, 66.9);
    assert.equal(stats.daily[0].trend.value, 66.5);
    assert.equal(stats.daily[0].evening.value, 67.6);
    assert.equal(stats.bodyFatLatest, 22.1);
  });

  test('BodyFatPercentage 合并到同日体重', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="OMRON Plus"/>',
      '<Record type="HKQuantityTypeIdentifierBodyFatPercentage" value="0.224" startDate="2026-07-10 08:00:30 +0800" sourceName="OMRON Plus"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="69.5" startDate="2026-07-11 08:00:00 +0800" sourceName="OMRON Plus"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml, { referenceDate: '2026-07-23' });
    assert.equal(data.dataAvailability.hasBodyFat, true);
    assert.ok(data.weight[0].bodyFat > 22 && data.weight[0].bodyFat < 23);
    const analysis = analyzeAll(data);
    assert.ok(analysis.weightStats.bodyFatLatest > 0);
  });

  test('CGM 稳定期排除首日', () => {
    const points = [];
    for (let i = 0; i < 10; i++) {
      points.push({ datetime: `2026-07-08 0${i % 10}:00:00 +0800`, value: 3.0 });
    }
    for (let i = 0; i < 10; i++) {
      points.push({ datetime: `2026-07-09 1${i % 10}:00:00 +0800`, value: 5.5 });
    }
    const stats = calcCgmStats(points);
    assert.equal(stats.firstDayDate, '2026-07-08');
    assert.ok(stats.firstDay.mean < 3.5);
    assert.ok(stats.stable.mean > 5);
    assert.ok(stats.stable.pctBelow39 < 1);
  });

  test('血压晨晚分层', () => {
    const stats = calcBloodPressureStats([
      { datetime: '2026-07-20 07:30:00 +0800', date: '2026-07-20', systolic: 100, diastolic: 70 },
      { datetime: '2026-07-20 21:00:00 +0800', date: '2026-07-20', systolic: 110, diastolic: 75 },
      { datetime: '2026-07-21 07:30:00 +0800', date: '2026-07-21', systolic: 98, diastolic: 68 },
      { datetime: '2026-07-21 22:00:00 +0800', date: '2026-07-21', systolic: 105, diastolic: 72 },
    ]);
    assert.ok(stats.morning7d);
    assert.ok(stats.evening7d);
    assert.equal(stats.morning7d.count, 2);
    assert.equal(stats.evening7d.count, 2);
    assert.ok(stats.morning7d.systolic < stats.evening7d.systolic);
  });

  // -------------------------------------------------------------------------
  suite('未来日期过滤');
  test('默认排除晚于 referenceDate 的体重，并统计跳过条数', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="99" startDate="2026-12-31 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="68.5" startDate="2026-07-14 08:00:00 +0800" sourceName="Scale"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml, { referenceDate: '2026-07-23' });
    assert.equal(data.weight.length, 2);
    assert.equal(data.weight[data.weight.length - 1].value, 68.5);
    assert.equal(data.dataQuality.skippedFutureCount, 1);
    assert.ok(data.dataQuality.futureSampleDates.includes('2026-12-31'));
    assert.equal(data.dataQuality.referenceDate, '2026-07-23');
  });

  test('allowFuture:true 时保留未来记录', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="99" startDate="2027-01-01 08:00:00 +0800" sourceName="Scale"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml, { referenceDate: '2026-07-23', allowFuture: true });
    assert.equal(data.weight.length, 1);
    assert.equal(data.dataQuality.skippedFutureCount, 0);
  });

  test('isFutureDate / getLocalToday', () => {
    assert.equal(isFutureDate('2026-07-24', '2026-07-23'), true);
    assert.equal(isFutureDate('2026-07-23', '2026-07-23'), false);
    assert.equal(isFutureDate('2026-07-22', '2026-07-23'), false);
    assert.match(getLocalToday(), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('提示词含未来日期排除说明', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="99" startDate="2026-12-01 08:00:00 +0800" sourceName="Scale"/>',
      '</HealthData>',
    ].join('\n');
    const analysis = analyzeAll(parseHealthXml(xml, { referenceDate: '2026-07-23' }));
    const prompt = generateLLMPrompt(analysis);
    assert.match(prompt, /未来日期已排除|跳过/);
    assert.match(prompt, /2026-12-01/);
  });

  // -------------------------------------------------------------------------
  suite('snapshot / signals / export');
  test('buildAnalysisSnapshot 与 compareSnapshots', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const snap = buildAnalysisSnapshot(analysis, { label: 't1' });
    assert.ok(snap.id);
    assert.equal(snap.label, 't1');
    assert.equal(snap.metrics.weightLatest, 70);
    assert.ok(snap.metrics.cgmMean > 0);
    const later = buildAnalysisSnapshot(analysis);
    later.metrics.weightLatest = 68;
    later.metrics.cgmMean = (snap.metrics.cgmMean || 0) + 0.5;
    const diffs = compareSnapshots(snap, later);
    const w = diffs.find((d) => d.key === 'weightLatest');
    assert.ok(w);
    assert.equal(w.delta, -2);
  });

  test('detectCrossSignals：低睡眠+低步数', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 01:00:00 +0800" endDate="2026-07-01 06:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="1000" startDate="2026-07-01 12:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="15" startDate="2026-07-01 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="90" startDate="2026-07-01 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="40" startDate="2026-07-02 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="60" startDate="2026-07-02 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="42" startDate="2026-07-03 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="62" startDate="2026-07-03 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="38" startDate="2026-07-04 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="61" startDate="2026-07-04 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="41" startDate="2026-07-05 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="59" startDate="2026-07-05 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="39" startDate="2026-07-06 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="60" startDate="2026-07-06 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="40" startDate="2026-07-07 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="61" startDate="2026-07-07 08:00:00 +0800" sourceName="Apple Watch"/>',
      '</HealthData>',
    ].join('\n');
    const analysis = analyzeAll(parseHealthXml(xml));
    const signals = detectCrossSignals(analysis);
    assert.ok(Array.isArray(signals));
    assert.ok(signals.some((s) => s.title.includes('低睡眠') || s.title.includes('恢复压力')));
    const md = formatCrossSignalsForLLM(signals);
    assert.match(md, /跨维度提示/);
  });

  test('buildExportBundle 产出 JSON 与 CSV', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const bundle = buildExportBundle(analysis);
    assert.match(bundle.analysisJson, /"dateRange"/);
    assert.match(bundle.snapshotJson, /"metrics"/);
    assert.ok(bundle.csvFiles.length >= 2);
    assert.ok(bundle.csvFiles.some((f) => f.filename === 'summary_metrics.csv'));
    assert.ok(bundle.csvFiles.some((f) => f.filename === 'weight.csv'));
  });

  test('buildInsightBullets 产出人话摘要', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML, { referenceDate: '2026-07-23' }));
    const bullets = buildInsightBullets(analysis);
    assert.ok(Array.isArray(bullets) && bullets.length >= 1);
    assert.ok(bullets.some((b) => b.title && b.detail));
    const prompt = generateLLMPrompt(analysis);
    assert.match(prompt, /自动监测摘要/);
  });

  test('buildInsightBullets locale:en 输出英文标题', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML, { referenceDate: '2026-07-23' }));
    const bullets = buildInsightBullets(analysis, { locale: 'en' });
    assert.ok(Array.isArray(bullets) && bullets.length >= 1);
    const titles = bullets.map((b) => b.title).join(' ');
    assert.match(titles, /Coverage|Weight|CGM|data coverage|Glucose|Blood pressure|Watch/i);
    assert.ok(!/数据覆盖|体重趋势|血糖（CGM）/.test(titles), 'default Chinese titles should not appear with locale:en');
  });

  test('formatAnalysisForLLM default zh 含数据可用性；locale:en 含 Data availability', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const zh = formatAnalysisForLLM(analysis);
    assert.match(zh, /数据可用性/);
    assert.match(zh, /维度|是否存在|数据量/);

    const en = formatAnalysisForLLM(analysis, { locale: 'en' });
    assert.match(en, /Data availability|Availability/i);
    assert.ok(!/数据可用性/.test(en), 'en format should not require Chinese availability header');
    assert.match(en, /Dimension|Available|Volume|records|days/i);
  });

  test('generateLLMPrompt locale:en 含英文角色或数据节标题', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML));
    const prompt = generateLLMPrompt(analysis, null, { locale: 'en' });
    assert.match(prompt, /Role & Task|Raw data & statistics|Data availability|You are a rigorous/i);
    assert.ok(
      /Role & Task|clinical data analyst/i.test(prompt) || /Data availability/i.test(prompt),
      'expected English role instructions or data section header'
    );
    // Backward-compatible: userContext as 2nd arg without options still zh
    const zhDefault = generateLLMPrompt(analysis, { age: 40, focus: 'BP' });
    assert.match(zhDefault, /角色与任务|数据可用性|个人背景/);
  });

  test('detectCrossSignals locale:en 输出英文信号标题', () => {
    const xml = [
      '<HealthData>',
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 01:00:00 +0800" endDate="2026-07-01 06:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="1000" startDate="2026-07-01 12:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="15" startDate="2026-07-01 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="90" startDate="2026-07-01 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="40" startDate="2026-07-02 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="60" startDate="2026-07-02 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="42" startDate="2026-07-03 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="62" startDate="2026-07-03 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="38" startDate="2026-07-04 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="61" startDate="2026-07-04 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="41" startDate="2026-07-05 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="59" startDate="2026-07-05 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="39" startDate="2026-07-06 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="60" startDate="2026-07-06 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" value="40" startDate="2026-07-07 08:00:00 +0800" sourceName="Apple Watch"/>',
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" value="61" startDate="2026-07-07 08:00:00 +0800" sourceName="Apple Watch"/>',
      '</HealthData>',
    ].join('\n');
    const analysis = analyzeAll(parseHealthXml(xml));
    const signals = detectCrossSignals(analysis, { locale: 'en' });
    assert.ok(Array.isArray(signals) && signals.length >= 1);
    assert.ok(
      signals.some(
        (s) =>
          /short sleep|low activity|recovery stress/i.test(s.title)
      ),
      'expected English signal title, got: ' + signals.map((s) => s.title).join('; ')
    );
    const md = formatCrossSignalsForLLM(signals, { locale: 'en' });
    assert.match(md, /Cross-domain signals/i);
  });

  test('generateInsightsOnlyPrompt 为短提示', () => {
    const analysis = analyzeAll(parseHealthXml(SAMPLE_XML, { referenceDate: '2026-07-23' }));
    const short = generateInsightsOnlyPrompt(analysis, { prefix: '## 个人背景\n用药测试' });
    assert.match(short, /个人健康自我监测摘要|自动监测摘要/);
    assert.match(short, /用药测试/);
    assert.ok(short.length < generateLLMPrompt(analysis).length);
  });

  test('欧姆龙类 CSV 解析与合并', () => {
    const wCsv = [
      '测量日期时间,成员名,体重,体脂肪率,骨骼肌率,基础代谢,BMI,身体年龄,内脏脂肪指数,状态',
      '2026-07-10 08:00:00,Chris,70.0,22.5,35.0,1600,23.0,35,7.0,',
      '2026-07-11 08:00:00,Chris,69.5,22.1,35.2,1590,22.8,34,6.5,',
    ].join('\n');
    const bpCsv = [
      '测量日期时间,成员名,高压,低压,脉搏,误动作,臂带缠绕过松,不规则脉波',
      '2026-07-10 07:30:00,Chris,120,80,70,否,否,否',
    ].join('\n');
    const weights = parseWeightScaleCsv(wCsv);
    assert.equal(weights.length, 2);
    assert.equal(weights[0].bodyFat, 22.5);
    const bps = parseBloodPressureCsv(bpCsv);
    assert.equal(bps.length, 1);
    assert.equal(bps[0].systolic, 120);

    const data = createEmptyData('2026-07-23');
    data.weight.push({
      datetime: '2026-07-10 08:00:00 +0800',
      date: '2026-07-10',
      value: 70,
    });
    data.dataAvailability.hasWeight = true;
    const merge = mergeExternalCsvIntoData(data, { weightCsvText: wCsv, bpCsvText: bpCsv });
    assert.ok(merge.weightAdded >= 1 || merge.weightUpdated >= 1);
    assert.equal(merge.bpAdded, 1);
    assert.ok(data.weight.some((w) => w.bodyFat != null));
    assert.equal(data.bloodPressure.length, 1);
  });

  // -------------------------------------------------------------------------
  suite('parseEcgCsv');
  test('中英文元数据头', () => {
    const ecgZh = parseEcgCsv(
      '记录日期,2026-07-01 10:00:00 +0800\n分类,窦性心律\n设备,"Apple Watch"\n0.1\n',
    );
    assert.equal(ecgZh.classification, '窦性心律');
    assert.match(ecgZh.datetime, /2026-07-01/);

    const ecgEn = parseEcgCsv(
      'Record Date,2026-07-02 11:00:00 +0800\nClassification,Sinus Rhythm\nDevice,"Apple Watch Series 9"\n-0.05\n',
    );
    assert.equal(ecgEn.classification, 'Sinus Rhythm');
    assert.match(ecgEn.datetime, /2026-07-02/);
  });

  // -------------------------------------------------------------------------
  suite('parseHealthXmlAsync / parseBytesStream 与同步一致');
  await testAsync('async string 与 sync 一致', async () => {
    assert.equal(typeof parseHealthXmlAsync, 'function');
    const data = parseHealthXml(SAMPLE_XML);
    const asyncData = await parseHealthXmlAsync(SAMPLE_XML);
    assert.equal(asyncData.bloodPressure.length, data.bloodPressure.length);
    assert.deepEqual(asyncData.bloodPressure[0], data.bloodPressure[0]);
    assert.equal(asyncData.cgm.length, data.cgm.length);
    assert.equal(asyncData.steps['2026-07-01'].max, data.steps['2026-07-01'].max);
    assert.equal(asyncData.sleep['2026-07-01'].core, data.sleep['2026-07-01'].core);
  });

  await testAsync('async Uint8Array 与 sync 一致', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(SAMPLE_XML);
    const byteData = await parseHealthXmlAsync(bytes);
    assert.equal(byteData.cgm.length, 1);
    assert.equal(byteData.bloodPressure[0].systolic, 120);
  });

  await testAsync('parseBytesStream 能扫到多条 Record', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(SAMPLE_XML);
    let recordCount = 0;
    await parseBytesStream(bytes, () => {
      recordCount++;
    });
    assert.ok(recordCount >= 5);
  });

  await testAsync('async 日期过滤与 sync 一致', async () => {
    const opts = { startDate: '2026-07-05', endDate: '2026-07-15' };
    const syncF = parseHealthXml(SAMPLE_XML, opts);
    const asyncF = await parseHealthXmlAsync(SAMPLE_XML, opts);
    assert.equal(asyncF.cgm.length, syncF.cgm.length);
    assert.equal(asyncF.weight.length, syncF.weight.length);
    assert.equal(asyncF.bloodPressure.length, syncF.bloodPressure.length);
  });

  // -------------------------------------------------------------------------
  suite('normalizeLocale / pickLocale / createL');
  test('normalizeLocale: en* → en', () => {
    assert.equal(normalizeLocale('en'), 'en');
    assert.equal(normalizeLocale('en-US'), 'en');
    assert.equal(normalizeLocale('en_GB'), 'en');
  });

  test('normalizeLocale: zh-TW / zh-HK / zh-Hant → zh-TW', () => {
    assert.equal(normalizeLocale('zh-TW'), 'zh-TW');
    assert.equal(normalizeLocale('zh-tw'), 'zh-TW');
    assert.equal(normalizeLocale('zh_TW'), 'zh-TW');
    assert.equal(normalizeLocale('zh-HK'), 'zh-TW');
    assert.equal(normalizeLocale('zh-hk'), 'zh-TW');
    assert.equal(normalizeLocale('zh-Hant'), 'zh-TW');
    assert.equal(normalizeLocale('zh-Hant-TW'), 'zh-TW');
  });

  test('normalizeLocale: default / zh-CN → zh-CN', () => {
    assert.equal(normalizeLocale(null), 'zh-CN');
    assert.equal(normalizeLocale(undefined), 'zh-CN');
    assert.equal(normalizeLocale(''), 'zh-CN');
    assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
    assert.equal(normalizeLocale('zh'), 'zh-CN');
    assert.equal(normalizeLocale('ja'), 'zh-CN');
  });

  test('pickLocale: en uses en; zh-CN and zh-TW use zh', () => {
    assert.equal(pickLocale('en', '简体', 'English'), 'English');
    assert.equal(pickLocale('zh-CN', '简体', 'English'), '简体');
    assert.equal(pickLocale('zh-TW', '简体', 'English'), '简体');
  });

  test('createL: zh-TW keeps locale and picks zh strings', () => {
    const L = createL('zh-TW');
    assert.equal(L.locale, 'zh-TW');
    assert.equal(L('中文文案', 'English copy'), '中文文案');
    const Len = createL('en-US');
    assert.equal(Len.locale, 'en');
    assert.equal(Len('中文文案', 'English copy'), 'English copy');
  });

  // -------------------------------------------------------------------------
  console.log(`\n────────────────────────────────`);
  console.log(`结果: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('core tests passed');
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
