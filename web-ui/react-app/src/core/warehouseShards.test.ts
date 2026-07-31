import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHealthXml } from './HealthCoreAdapter';
import {
  WH_SOFT_BYTES,
  buildDomainChunkRows,
  evictOldestBpWeightYears,
  evictOldestCgmMonths,
  evictOldestSleepStepsYears,
  reassembleFromSplit,
  splitHealthDataShards,
  type ShardSplit,
} from './warehouseShards';


import { reassembleFromChunks } from './warehouseLoad';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

describe('warehouseShards (legacy-compatible split)', () => {
  it('split → reassembleFromSplit preserves CGM/weight counts', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    expect(split.core.cgm).toEqual([]);
    expect(split.months.length).toBeGreaterThan(0);
    const back = reassembleFromSplit(split);
    expect(back.cgm.length).toBe(data.cgm.length);
    expect(back.weight.length).toBe(data.weight.length);
    expect(back.bloodPressure.length).toBe(data.bloodPressure.length);
  });

  it('chunk rows reassemble via warehouseLoad reassembleFromChunks', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    const rows = buildDomainChunkRows(split);
    expect(rows.some((r) => r.id === 'core|full')).toBe(true);
    expect(rows.some((r) => r.domain === 'cgm')).toBe(true);

    const assembled = reassembleFromChunks(rows, { metaLayout: 'sharded-v1' });
    expect(assembled).toBeTruthy();
    expect(assembled!.data.cgm.length).toBe(data.cgm.length);
    expect(assembled!.layout).toBe('sharded-v1');
  });

  it('core is thin (no domain arrays left in core payload)', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    expect(split.core.cgm.length).toBe(0);
    expect(split.core.bloodPressure.length).toBe(0);
    expect(split.core.weight.length).toBe(0);
  });

  it('evictOldestCgmMonths drops oldest months under soft quota', () => {
    const months = [];
    for (let i = 1; i <= 6; i++) {
      const points = Array.from({ length: 20 }, (_, j) => ({
        datetime: `2020-0${i}-15 00:00:00 +0000`,
        value: j,
      }));
      months.push({
        month: `2020-0${i}`,
        points,
        // Fake large month weight so recompute keeps total above soft until drops
        approxBytes: Math.floor(WH_SOFT_BYTES / 3),
        recordCount: points.length,
      });
    }
    const split = {
      core: {} as ShardSplit['core'],
      months,
      bpYears: [],
      weightYears: [],
      sleepYears: [],
      stepsYears: [],
      hrvYears: [],
      restingHrYears: [],
      walkingHrYears: [],
      workoutsYears: [],
      ecgYears: [],
      watchDailyYears: [],
      coreBytes: 100,
      totalBytes: 100 + months.reduce((s, m) => s + m.approxBytes, 0),
    } as ShardSplit;

    expect(split.totalBytes).toBeGreaterThan(WH_SOFT_BYTES);
    const beforeMonths = split.months.length;
    const ev = evictOldestCgmMonths(split);
    expect(ev.trimmed).toBe(true);
    expect(split.months.length).toBeLessThan(beforeMonths);
    expect(ev.removedMonths).toBeGreaterThan(0);
    expect(split.months[split.months.length - 1]!.month).toBe('2020-06');
  });

  it('evictOldestBpWeightYears drops oldest year when over soft quota', () => {
    const yearSize = Math.floor(WH_SOFT_BYTES / 2.5);
    const mkYear = (year: string) => ({
      year,
      points: [{ datetime: `${year}-06-01`, value: 1 }],
      approxBytes: yearSize,
      recordCount: 1,
    });
    const mkW = (year: string) => ({
      year,
      weight: [{ datetime: `${year}-06-01`, value: 70 }],
      bodyFat: [] as unknown[],
      payload: { weight: [{ datetime: `${year}-06-01`, value: 70 }], bodyFat: [] },
      approxBytes: yearSize,
      recordCount: 1,
    });
    const split = {
      core: {} as ShardSplit['core'],
      months: [],
      bpYears: [mkYear('2018'), mkYear('2019'), mkYear('2020')],
      weightYears: [mkW('2018'), mkW('2020')],
      sleepYears: [],
      stepsYears: [],
      hrvYears: [],
      restingHrYears: [],
      walkingHrYears: [],
      workoutsYears: [],
      ecgYears: [],
      watchDailyYears: [],
      coreBytes: 10,
      totalBytes: 10 + yearSize * 5,
    } as ShardSplit;
    expect(split.totalBytes).toBeGreaterThan(WH_SOFT_BYTES);
    const ev = evictOldestBpWeightYears(split);
    expect(ev.trimmed).toBe(true);
    expect(ev.removedYears).toBeGreaterThan(0);
    // oldest 2018 should be gone or reduced
    expect(split.bpYears.some((y) => y.year === '2020')).toBe(true);
  });

  it('evictOldestSleepStepsYears drops oldest year under soft quota', () => {
    const yearSize = Math.floor(WH_SOFT_BYTES / 2.5);
    const mkMap = (year: string) => ({
      year,
      payload: { [`${year}-01-01`]: { total: 1 } },
      approxBytes: yearSize,
      recordCount: 1,
    });
    const split = {
      core: {} as ShardSplit['core'],
      months: [],
      bpYears: [],
      weightYears: [],
      sleepYears: [mkMap('2017'), mkMap('2018'), mkMap('2019')],
      stepsYears: [mkMap('2017'), mkMap('2019')],
      hrvYears: [],
      restingHrYears: [],
      walkingHrYears: [],
      workoutsYears: [],
      ecgYears: [],
      watchDailyYears: [],
      coreBytes: 10,
      totalBytes: 10 + yearSize * 5,
    } as ShardSplit;
    expect(split.totalBytes).toBeGreaterThan(WH_SOFT_BYTES);
    const ev = evictOldestSleepStepsYears(split);
    expect(ev.trimmed).toBe(true);
    expect(ev.removedYears).toBeGreaterThan(0);
    expect(split.sleepYears.some((y) => y.year === '2019')).toBe(true);
  });

  it('legacy-shaped chunks load same CGM count as React sharded write shape', () => {


    // Simulate: build sharded rows (as React/legacy would write), reassemble
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const split = splitHealthDataShards(data);
    const rows = buildDomainChunkRows(split);
    // legacy reader path (merge shards)
    const a = reassembleFromChunks(rows, { metaLayout: 'sharded-v1' });
    // force-core-only would drop domain data incorrectly — ensure we don't
    const wrong = reassembleFromChunks(rows, {
      metaLayout: 'sharded-v1',
      coreOnly: true,
    });
    expect(a!.data.cgm.length).toBe(data.cgm.length);
    expect(wrong!.data.cgm.length).toBe(0);
  });
});
