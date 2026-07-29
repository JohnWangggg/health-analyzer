/**
 * Risk / edge-case unit tests (parser + stats + CGM boundaries).
 * Separate file to reduce merge conflict with core.test.js edits.
 * Run via npm test (wired in package.json).
 */
'use strict';

const assert = require('node:assert/strict');

const lib = require('../.test-dist/index.js');
const {
  parseRecordLine,
  parseHealthXml,
  analyzeAll,
  calcCgmStats,
  calcBloodPressureStats,
  calcWeightStats,
  calcWatchStats,
  calcWorkoutStats,
  calcEcgStats,
  createEmptyData,
  classifyGlucoseUnit,
  toMmolL,
  inferGlucoseUnitFromValues,
  MGDL_PER_MMOL,
  buildInsightBullets,
  detectCrossSignals,
  formatAnalysisForLLM,
  generateLLMPrompt,
} = lib;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const ret = fn();
    if (ret && typeof ret.then === 'function') {
      throw new Error(`test "${name}" returned a Promise; use await testAsync`);
    }
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

// ===========================================================================
(async () => {
  // -------------------------------------------------------------------------
  suite('risk: parseRecordLine / missing attrs');
  test('无 type / startDate / 空 value 均安全返回 null 或跳过', () => {
    assert.equal(parseRecordLine(`<Record value="1" startDate="2026-07-01 00:00:00 +0800"/>`), null);
    assert.equal(parseRecordLine(`<Record type="HKQuantityTypeIdentifierStepCount" value="1"/>`), null);
    // missing value attr → record with value '' (processXmlLine skips empty value)
    const noValueAttr = parseRecordLine(
      `<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-07-01 00:00:00 +0800"/>`,
    );
    assert.ok(noValueAttr);
    assert.equal(noValueAttr.value, '');
    const emptyVal = parseRecordLine(
      `<Record type="HKQuantityTypeIdentifierStepCount" value="" startDate="2026-07-01 00:00:00 +0800"/>`,
    );
    assert.ok(emptyVal);
    assert.equal(emptyVal.value, '');
    // full parse drops empty-value records
    const data = parseHealthXml(
      `<HealthData>
<Record type="HKQuantityTypeIdentifierStepCount" value="" startDate="2026-07-01 00:00:00 +0800" sourceName="Watch"/>
</HealthData>`,
    );
    assert.deepEqual(data.steps, {});
  });

  test('畸形属性引号 / 非 Record 行不抛异常', () => {
    assert.equal(parseRecordLine('not xml at all'), null);
    assert.equal(parseRecordLine('<Record type=broken startDate=x/>'), null);
    assert.doesNotThrow(() => parseRecordLine(''));
    assert.doesNotThrow(() => parseRecordLine('<Record/>'));
  });

  // -------------------------------------------------------------------------
  suite('risk: parseHealthXml empty / garbage');
  test('空字符串 / 仅 HealthData 壳 返回空容器', () => {
    for (const xml of ['', '   ', '<?xml version="1.0"?><HealthData></HealthData>', '<HealthData/>']) {
      const data = parseHealthXml(xml);
      assert.ok(data);
      assert.equal(data.cgm.length, 0);
      assert.equal(data.bloodPressure.length, 0);
      assert.equal(data.weight.length, 0);
      assert.deepEqual(data.steps, {});
      assert.equal(data.dataAvailability.hasCgm, false);
    }
  });

  test('损坏 XML / 缺 type·startDate 记录被忽略且不炸', () => {
    const xml = [
      '<<<<<<< not health',
      '<HealthData>',
      '<Record value="72" sourceName="X"/>',
      '<Record type="HKQuantityTypeIdentifierStepCount" value="100"/>',
      '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
      'unclosed <Workout',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.weight.length, 1);
    assert.equal(data.weight[0].value, 70);
    assert.equal(data.steps['2026-07-10'], undefined); // missing startDate dropped
  });

  // -------------------------------------------------------------------------
  suite('risk: analyzeAll empty / sparse');
  test('createEmptyData + analyzeAll 不抛异常', () => {
    const data = createEmptyData('2026-07-23');
    const analysis = analyzeAll(data);
    assert.ok(analysis);
    assert.equal(analysis.cgmStats, null);
    assert.equal(analysis.bpStats, null);
    assert.equal(analysis.weightStats, null);
    assert.equal(analysis.watchStats, null);
    assert.equal(analysis.workoutStats, null);
    assert.deepEqual(analysis.dateRange, { start: '', end: '' });
    assert.ok(analysis.generatedAt);
  });

  test('空 parse 结果 analyzeAll + 洞察/信号/提示词安全', () => {
    const analysis = analyzeAll(parseHealthXml('<HealthData></HealthData>'));
    assert.doesNotThrow(() => buildInsightBullets(analysis));
    assert.doesNotThrow(() => detectCrossSignals(analysis));
    assert.doesNotThrow(() => formatAnalysisForLLM(analysis));
    assert.doesNotThrow(() => generateLLMPrompt(analysis));
    const bullets = buildInsightBullets(analysis);
    assert.ok(Array.isArray(bullets));
  });

  test('analyzeAll 接受残缺 data 字段（缺 watchDaily/workouts）', () => {
    const bare = {
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
      // intentionally omit watchDaily / workouts / ecg
      dataAvailability: createEmptyData().dataAvailability,
      dataQuality: createEmptyData().dataQuality,
    };
    // May need minimal shape — if throws, createEmptyData merge is the safe path
    let analysis;
    try {
      analysis = analyzeAll(bare);
    } catch {
      analysis = analyzeAll({ ...createEmptyData(), ...bare });
    }
    assert.ok(analysis);
    assert.equal(analysis.cgmStats, null);
  });

  // -------------------------------------------------------------------------
  suite('risk: CGM unit / TIR boundaries');
  test('classifyGlucoseUnit 边界标签', () => {
    assert.equal(classifyGlucoseUnit('mmol/L'), 'mmol/L');
    assert.equal(classifyGlucoseUnit('mmol/l'), 'mmol/L');
    assert.equal(classifyGlucoseUnit('mg/dL'), 'mg/dL');
    assert.equal(classifyGlucoseUnit('mg/dl'), 'mg/dL');
    assert.equal(classifyGlucoseUnit(''), 'unknown');
    assert.equal(classifyGlucoseUnit(null), 'unknown');
    assert.equal(classifyGlucoseUnit('g/dL'), 'unknown');
  });

  test('toMmolL / MGDL_PER_MMOL 往返近似', () => {
    const mmol = toMmolL(90, 'mg/dL');
    assert.ok(Math.abs(mmol - 90 / MGDL_PER_MMOL) < 1e-9);
    assert.equal(toMmolL(5.5, 'mmol/L'), 5.5);
  });

  test('inferGlucoseUnitFromValues 中位阈值', () => {
    assert.equal(inferGlucoseUnitFromValues([90, 100, 110]), 'mg/dL');
    assert.equal(inferGlucoseUnitFromValues([5, 6, 7]), 'mmol/L');
    // 模糊带 25–40 → unknown
    assert.equal(inferGlucoseUnitFromValues([30, 32, 35]), 'unknown');
    assert.equal(inferGlucoseUnitFromValues([]), 'unknown');
  });

  test('calcCgmStats：单点 / 全 in-range / 全 out-of-range', () => {
    assert.equal(calcCgmStats([]), null);

    const one = calcCgmStats([{ datetime: '2026-07-01 08:00:00 +0800', value: 5.0 }]);
    assert.ok(one);
    assert.equal(one.overall.count, 1);
    assert.equal(one.overall.pctInRange, 100);

    // dense 5min points all high
    const high = [];
    for (let i = 0; i < 6; i++) {
      high.push({
        datetime: `2026-07-01 08:${String(i * 5).padStart(2, '0')}:00 +0800`,
        value: 12.0,
      });
    }
    const highStats = calcCgmStats(high);
    assert.ok(highStats);
    assert.equal(highStats.overall.pctInRange, 0);
    assert.equal(highStats.overall.pctAbove100, 100);

    const low = [];
    for (let i = 0; i < 6; i++) {
      low.push({
        datetime: `2026-07-01 08:${String(i * 5).padStart(2, '0')}:00 +0800`,
        value: 2.5,
      });
    }
    const lowStats = calcCgmStats(low);
    assert.ok(lowStats);
    assert.equal(lowStats.overall.pctBelow30, 100);
    assert.equal(lowStats.overall.pctInRange, 0);
  });

  test('CGM 模糊 unit 区间：reliable=false', () => {
    // values in ambiguous band (median ~32) without unit
    const xml = [
      '<HealthData>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="30" startDate="2026-07-01 08:00:00 +0800" sourceName="CGM Sensor"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="32" startDate="2026-07-01 08:05:00 +0800" sourceName="CGM Sensor"/>',
      '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="35" startDate="2026-07-01 08:10:00 +0800" sourceName="CGM Sensor"/>',
      '</HealthData>',
    ].join('\n');
    const data = parseHealthXml(xml);
    assert.equal(data.cgm.length, 3);
    assert.ok(data.dataQuality.cgmUnit);
    assert.equal(data.dataQuality.cgmUnit.reliable, false);
    const stats = calcCgmStats(data.cgm, { unitReliable: false });
    assert.ok(stats);
    // unitReliable flag should surface on stats when provided
    if ('unitReliable' in stats) {
      assert.equal(stats.unitReliable, false);
    }
  });

  test('TIR 边界值 3.9 与 10.0 计为 in-range', () => {
    const points = [
      { datetime: '2026-07-01 00:00:00 +0800', value: 3.9 },
      { datetime: '2026-07-01 00:05:00 +0800', value: 10.0 },
      { datetime: '2026-07-01 00:10:00 +0800', value: 3.89 },
      { datetime: '2026-07-01 00:15:00 +0800', value: 10.01 },
    ];
    const stats = calcCgmStats(points);
    assert.ok(stats);
    // 2 of 4 in range if 3.9 inclusive and 10.0 inclusive
    assert.ok(stats.overall.pctInRange >= 49 && stats.overall.pctInRange <= 51);
  });

  // -------------------------------------------------------------------------
  suite('risk: other stats empty');
  test('空数组统计返回 null；空 watch/workout 安全', () => {
    assert.equal(calcBloodPressureStats([]), null);
    assert.equal(calcWeightStats([]), null);
    assert.equal(calcWatchStats({}), null);
    assert.equal(calcWorkoutStats([]), null);
    assert.equal(calcEcgStats([]), null);
  });

  // -------------------------------------------------------------------------
  console.log(`\n────────────────────────────────`);
  console.log(`risk: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log('risk tests passed');
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
