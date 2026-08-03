import { describe, expect, it } from 'vitest';
import { createEmptyData } from '@health-analyzer/lib';
import {
  filterHealthDataByDate,
  normalizeDateFilter,
} from './dateFilter';

describe('dateFilter', () => {
  it('normalize rejects inverted range', () => {
    expect(() =>
      normalizeDateFilter({ startDate: '2026-06-01', endDate: '2026-05-01' }),
    ).toThrow(/date_range/);
  });

  it('filters cgm and steps by day window', () => {
    const data = createEmptyData();
    data.cgm = [
      { datetime: '2026-01-01T08:00:00', value: 5 },
      { datetime: '2026-03-15T08:00:00', value: 6 },
      { datetime: '2026-06-01T08:00:00', value: 7 },
    ];
    data.steps = {
      '2026-01-01': { watch: 1, iphone: 0, max: 1 },
      '2026-03-15': { watch: 2, iphone: 0, max: 2 },
      '2026-06-01': { watch: 3, iphone: 0, max: 3 },
    };
    const filtered = filterHealthDataByDate(data, {
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(filtered.cgm).toHaveLength(1);
    expect(filtered.cgm[0]!.value).toBe(6);
    expect(Object.keys(filtered.steps)).toEqual(['2026-03-15']);
    // original untouched
    expect(data.cgm).toHaveLength(3);
  });
});
