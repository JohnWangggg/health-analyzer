const assert = require('node:assert/strict');
const {
  parseRecordLine,
  parseHealthXml,
  analyzeAll,
  calcCgmStats,
  generateLLMPrompt,
} = require('../.test-dist/index.js');

const record = parseRecordLine(
  `<Record value='72' startDate="2026-07-01 08:00:00 +0800" type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch"/>`,
);
assert.equal(record.value, '72');
assert.equal(record.source, 'Apple Watch');

const xml = [
  '<HealthData>',
  '<Record type="HKQuantityTypeIdentifierBloodPressureDiastolic" value="80" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierBodyMass" value="70" startDate="2026-07-10 08:00:00 +0800" sourceName="Scale"/>',
  '<Record type="HKQuantityTypeIdentifierBloodPressureSystolic" value="120" startDate="2026-07-02 08:00:00 +0800" sourceName="iPhone"/>',
  '<Record type="HKQuantityTypeIdentifierBloodGlucose" value="5.0" startDate="2026-07-01 08:00:00 +0800" sourceName="CGM Sensor"/>',
  '<Record type="HKCategoryTypeIdentifierSleepAnalysis" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2026-07-01 23:00:00 +0800" endDate="2026-07-02 00:00:00 +0800" sourceName="Apple Watch"/>',
  '</HealthData>',
].join('\n');
const data = parseHealthXml(xml);
assert.equal(data.bloodPressure.length, 1);
assert.deepEqual(data.bloodPressure[0].systolic, 120);
assert.deepEqual(data.bloodPressure[0].diastolic, 80);
assert.equal(data.sleep['2026-07-01'].core, 1);
assert.equal(data.dataAvailability.hasCgm, true);

const analysis = analyzeAll(data);
assert.deepEqual(analysis.dateRange, { start: '2026-07-01', end: '2026-07-10' });
const prompt = generateLLMPrompt(analysis);
assert.match(prompt, /CGM 动态血糖/);
assert.match(prompt, /CGM 不能单独用于诊断/);
assert.match(prompt, /最近 90 天/);
assert.equal(prompt.includes('COZAAR'), false);
assert.equal(prompt.includes('11 个章节'), false);

const cgmStats = calcCgmStats([
  { datetime: '2026-07-01 00:00:00 +0800', value: 4 },
  { datetime: '2026-07-01 00:10:00 +0800', value: 7 },
  { datetime: '2026-07-01 00:20:00 +0800', value: 5 },
]);
assert.equal(cgmStats.maxRises['30min'].rise, 3);

console.log('core tests passed');
