import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CGM_KEEP_MONTHS_DEFAULT,
  CGM_KEEP_MONTHS_KEY,
  CGM_KEEP_MONTHS_OPTIONS,
  YEAR_KEEP_YEARS_DEFAULT,
  YEAR_KEEP_YEARS_KEY,
  YEAR_KEEP_YEARS_OPTIONS,
  WAREHOUSE_AUTO_TRIM_KEY,
  getCgmKeepMonths,
  getYearKeepYears,
  isWarehouseAutoTrimEnabled,
  setCgmKeepMonths,
  setYearKeepYears,
  setWarehouseAutoTrimEnabled,
} from './warehouseKeepPrefs';

const store = new Map<string, string>();

function installMockLocalStorage() {
  store.clear();
  const mock = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key() {
      return null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mock,
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  installMockLocalStorage();
});

afterEach(() => {
  store.clear();
});

describe('warehouseKeepPrefs', () => {
  it('defaults when keys missing', () => {
    expect(getCgmKeepMonths()).toBe(CGM_KEEP_MONTHS_DEFAULT);
    expect(getYearKeepYears()).toBe(YEAR_KEEP_YEARS_DEFAULT);
    expect(isWarehouseAutoTrimEnabled()).toBe(false);
  });

  it('set/get CGM keep months only accepts options', () => {
    expect(setCgmKeepMonths(3)).toBe(3);
    expect(localStorage.getItem(CGM_KEEP_MONTHS_KEY)).toBe('3');
    expect(getCgmKeepMonths()).toBe(3);

    expect(setCgmKeepMonths(99)).toBe(CGM_KEEP_MONTHS_DEFAULT);
    expect(getCgmKeepMonths()).toBe(CGM_KEEP_MONTHS_DEFAULT);

    for (const n of CGM_KEEP_MONTHS_OPTIONS) {
      expect(setCgmKeepMonths(n)).toBe(n);
      expect(getCgmKeepMonths()).toBe(n);
    }
  });

  it('set/get year keep years only accepts options', () => {
    expect(setYearKeepYears(2)).toBe(2);
    expect(localStorage.getItem(YEAR_KEEP_YEARS_KEY)).toBe('2');
    expect(getYearKeepYears()).toBe(2);

    expect(setYearKeepYears(7)).toBe(YEAR_KEEP_YEARS_DEFAULT);
    for (const n of YEAR_KEEP_YEARS_OPTIONS) {
      expect(setYearKeepYears(n)).toBe(n);
    }
  });

  it('auto-trim only on when localStorage is "1"', () => {
    expect(isWarehouseAutoTrimEnabled()).toBe(false);
    setWarehouseAutoTrimEnabled(true);
    expect(localStorage.getItem(WAREHOUSE_AUTO_TRIM_KEY)).toBe('1');
    expect(isWarehouseAutoTrimEnabled()).toBe(true);
    setWarehouseAutoTrimEnabled(false);
    expect(localStorage.getItem(WAREHOUSE_AUTO_TRIM_KEY)).toBe('0');
    expect(isWarehouseAutoTrimEnabled()).toBe(false);

    localStorage.setItem(WAREHOUSE_AUTO_TRIM_KEY, 'true');
    expect(isWarehouseAutoTrimEnabled()).toBe(false);
  });

  it('invalid stored values fall back to defaults', () => {
    localStorage.setItem(CGM_KEEP_MONTHS_KEY, 'nope');
    localStorage.setItem(YEAR_KEEP_YEARS_KEY, '0');
    expect(getCgmKeepMonths()).toBe(CGM_KEEP_MONTHS_DEFAULT);
    expect(getYearKeepYears()).toBe(YEAR_KEEP_YEARS_DEFAULT);
  });
});
