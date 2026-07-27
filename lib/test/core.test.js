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
  buildInsightBullets,
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
  return {
    data,
    cgmStats: overrides.cgmStats ?? null,
    bpStats: overrides.bpStats ?? null,
    weightStats: overrides.weightStats ?? null,
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
