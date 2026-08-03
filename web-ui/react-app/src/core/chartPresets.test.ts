import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHART_PRESETS_KEY,
  addChartPreset,
  deleteChartPreset,
  loadChartPresets,
} from './chartPresets';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => store.delete(k),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => store.clear());

describe('chartPresets', () => {
  it('add/load/delete round-trip', () => {
    expect(loadChartPresets()).toEqual([]);
    addChartPreset({
      name: 'CGM 30d',
      domain: 'cgmDailyMean',
      compareDomain: 'steps',
      rangeDays: 30,
    });
    const list = loadChartPresets();
    expect(list).toHaveLength(1);
    expect(list[0]!.domain).toBe('cgmDailyMean');
    expect(list[0]!.compareDomain).toBe('steps');
    expect(localStorage.getItem(CHART_PRESETS_KEY)).toBeTruthy();
    deleteChartPreset(list[0]!.id);
    expect(loadChartPresets()).toHaveLength(0);
  });

  it('replaces same name', () => {
    addChartPreset({
      name: 'A',
      domain: 'steps',
      compareDomain: '',
      rangeDays: 7,
    });
    addChartPreset({
      name: 'A',
      domain: 'weight',
      compareDomain: '',
      rangeDays: 90,
    });
    const list = loadChartPresets();
    expect(list).toHaveLength(1);
    expect(list[0]!.domain).toBe('weight');
    expect(list[0]!.rangeDays).toBe(90);
  });
});
