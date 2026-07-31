import { describe, expect, it } from 'vitest';
import type { HealthData } from '@health-analyzer/lib';
import {
  applyKeepWindowsToSplit,
  forecastKeepDrops,
  keysToDropForKeepN,
} from './warehouseKeepWindows';
import {
  recomputeSplitTotalBytes,
  splitHealthDataShards,
  type ShardSplit,
} from './warehouseShards';

function emptySplit(partial: Partial<ShardSplit> = {}): ShardSplit {
  const split = {
    core: {} as ShardSplit['core'],
    months: [],
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
    coreBytes: 10,
    totalBytes: 10,
    ...partial,
  } as ShardSplit;
  recomputeSplitTotalBytes(split);
  return split;
}

describe('keysToDropForKeepN', () => {
  it('drops oldest prefix when over keep-N', () => {
    expect(keysToDropForKeepN(['2020', '2021', '2022', '2023'], 2)).toEqual([
      '2020',
      '2021',
    ]);
    expect(keysToDropForKeepN(['2023', '2020', '2022'], 2)).toEqual(['2020']);
  });

  it('returns empty when within keep-N', () => {
    expect(keysToDropForKeepN(['2022', '2023'], 3)).toEqual([]);
    expect(keysToDropForKeepN([], 3)).toEqual([]);
  });
});

describe('forecastKeepDrops', () => {
  it('forecasts month and year drops independently', () => {
    const { monthDrop, yearDrops } = forecastKeepDrops(
      {
        cgmMonths: [
          '2024-01',
          '2024-02',
          '2024-03',
          '2024-04',
          '2024-05',
          '2024-06',
        ],
        bpYears: ['2019', '2020', '2021', '2022', '2023'],
        weightYears: ['2022', '2023'],
        sleepYears: [],
      },
      { keepMonths: 3, keepYears: 2 },
    );
    expect(monthDrop).toEqual(['2024-01', '2024-02', '2024-03']);
    expect(yearDrops.bpYears).toEqual(['2019', '2020', '2021']);
    expect(yearDrops.weightYears).toBeUndefined();
    expect(yearDrops.sleepYears).toBeUndefined();
  });
});

describe('applyKeepWindowsToSplit', () => {
  it('keeps newest N CGM months and drops oldest', () => {
    const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05'].map(
      (month) => ({
        month,
        points: [{ datetime: `${month}-15 00:00:00 +0000`, value: 100 }],
        approxBytes: 100,
        recordCount: 1,
      }),
    );
    const split = emptySplit({ months });
    const meta = applyKeepWindowsToSplit(split, {
      keepMonths: 3,
      keepYears: 5,
    });
    expect(meta.trimmed).toBe(true);
    expect(meta.droppedMonths).toEqual(['2024-01', '2024-02']);
    expect(split.months.map((m) => m.month)).toEqual([
      '2024-03',
      '2024-04',
      '2024-05',
    ]);
    expect(meta.afterBytes).toBeLessThan(meta.beforeBytes);
  });

  it('keeps newest N years per domain independently', () => {
    const yearRow = (year: string, bytes = 50) => ({
      year,
      points: [{ datetime: `${year}-06-01 00:00:00 +0000` }],
      approxBytes: bytes,
      recordCount: 1,
    });
    const weightRow = (year: string) => ({
      year,
      weight: [{ datetime: `${year}-01-01` }],
      bodyFat: [] as unknown[],
      payload: { weight: [{ datetime: `${year}-01-01` }], bodyFat: [] },
      approxBytes: 40,
      recordCount: 1,
    });
    const split = emptySplit({
      bpYears: [
        yearRow('2018'),
        yearRow('2019'),
        yearRow('2020'),
        yearRow('2021'),
      ],
      weightYears: [weightRow('2020'), weightRow('2021'), weightRow('2022')],
    });
    const meta = applyKeepWindowsToSplit(split, {
      keepMonths: 6,
      keepYears: 2,
    });
    expect(meta.trimmed).toBe(true);
    expect(meta.droppedYearsByDomain.bpYears).toEqual(['2018', '2019']);
    expect(meta.droppedYearsByDomain.weightYears).toEqual(['2020']);
    expect(split.bpYears.map((y) => y.year)).toEqual(['2020', '2021']);
    expect(split.weightYears.map((y) => y.year)).toEqual(['2021', '2022']);
  });

  it('no-op when already within windows', () => {
    const split = emptySplit({
      months: [
        {
          month: '2024-06',
          points: [],
          approxBytes: 10,
          recordCount: 0,
        },
      ],
      bpYears: [
        {
          year: '2023',
          points: [],
          approxBytes: 10,
          recordCount: 0,
        },
      ],
    });
    const meta = applyKeepWindowsToSplit(split, {
      keepMonths: 6,
      keepYears: 3,
    });
    expect(meta.trimmed).toBe(false);
    expect(meta.droppedMonths).toEqual([]);
    expect(Object.keys(meta.droppedYearsByDomain)).toHaveLength(0);
  });

  it('works on synthetic HealthData via splitHealthDataShards', () => {
    const data = {
      cgm: [
        { datetime: '2023-01-15 00:00:00 +0000', value: 100 },
        { datetime: '2023-02-15 00:00:00 +0000', value: 101 },
        { datetime: '2023-03-15 00:00:00 +0000', value: 102 },
        { datetime: '2023-04-15 00:00:00 +0000', value: 103 },
      ],
      bloodPressure: [
        { datetime: '2019-06-01 00:00:00 +0000', systolic: 120, diastolic: 80 },
        { datetime: '2020-06-01 00:00:00 +0000', systolic: 121, diastolic: 80 },
        { datetime: '2021-06-01 00:00:00 +0000', systolic: 122, diastolic: 80 },
        { datetime: '2022-06-01 00:00:00 +0000', systolic: 123, diastolic: 80 },
      ],
      weight: [],
      bodyFat: [],
      sleep: {},
      steps: {},
      hrv: {},
      hrvOvernight: {},
      restingHr: {},
      walkingHr: {},
      workouts: [],
      ecg: [],
      watchDaily: {},
    } as unknown as HealthData;

    const split = splitHealthDataShards(data);
    expect(split.months.length).toBe(4);
    expect(split.bpYears.length).toBe(4);

    const meta = applyKeepWindowsToSplit(split, {
      keepMonths: 2,
      keepYears: 2,
    });
    expect(meta.trimmed).toBe(true);
    expect(meta.droppedMonths).toEqual(['2023-01', '2023-02']);
    expect(split.months.map((m) => m.month)).toEqual(['2023-03', '2023-04']);
    expect(meta.droppedYearsByDomain.bpYears).toEqual(['2019', '2020']);
    expect(split.bpYears.map((y) => y.year)).toEqual(['2021', '2022']);
  });
});
