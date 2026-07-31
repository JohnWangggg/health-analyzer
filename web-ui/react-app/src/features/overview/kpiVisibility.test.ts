import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  KPI_IDS,
  KPI_VISIBILITY_KEY,
  getKpiVisibility,
  isKpiVisible,
  setKpiVisibility,
  type KpiId,
} from './kpiVisibility';

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

describe('kpiVisibility', () => {
  it('defaults all true when key missing', () => {
    const vis = getKpiVisibility();
    for (const id of KPI_IDS) {
      expect(vis[id]).toBe(true);
      expect(isKpiVisible(id)).toBe(true);
    }
  });

  it('setKpiVisibility merges partial and persists JSON', () => {
    const next = setKpiVisibility({ weight: false, steps: false });
    expect(next.weight).toBe(false);
    expect(next.steps).toBe(false);
    expect(next.cgm).toBe(true);
    expect(next.recovery).toBe(true);
    expect(next.restingHr).toBe(true);

    const raw = localStorage.getItem(KPI_VISIBILITY_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<KpiId, boolean>;
    expect(parsed.weight).toBe(false);
    expect(parsed.cgm).toBe(true);

    expect(getKpiVisibility().weight).toBe(false);
    expect(isKpiVisible('weight')).toBe(false);
    expect(isKpiVisible('cgm')).toBe(true);
  });

  it('round-trip: hide then show cgm', () => {
    setKpiVisibility({ cgm: false });
    expect(isKpiVisible('cgm')).toBe(false);
    setKpiVisibility({ cgm: true });
    expect(isKpiVisible('cgm')).toBe(true);
  });

  it('invalid JSON falls back to all true', () => {
    localStorage.setItem(KPI_VISIBILITY_KEY, 'not-json{');
    const vis = getKpiVisibility();
    for (const id of KPI_IDS) {
      expect(vis[id]).toBe(true);
    }
  });

  it('non-boolean / unknown keys are ignored; missing ids stay true', () => {
    localStorage.setItem(
      KPI_VISIBILITY_KEY,
      JSON.stringify({ weight: false, cgm: 'yes', foo: false }),
    );
    const vis = getKpiVisibility();
    expect(vis.weight).toBe(false);
    expect(vis.cgm).toBe(true);
    expect(vis.steps).toBe(true);
    expect(vis.recovery).toBe(true);
    expect(vis.restingHr).toBe(true);
  });

  it('setKpiVisibility ignores non-boolean partial values', () => {
    setKpiVisibility({ weight: false });
    // @ts-expect-error intentional bad partial
    const next = setKpiVisibility({ weight: 'nope', steps: true });
    expect(next.weight).toBe(false);
    expect(next.steps).toBe(true);
  });

  it('isKpiVisible returns true when storage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem() {
          throw new Error('denied');
        },
        setItem() {
          throw new Error('denied');
        },
      },
      configurable: true,
      writable: true,
    });
    expect(getKpiVisibility().cgm).toBe(true);
    expect(isKpiVisible('cgm')).toBe(true);
    const next = setKpiVisibility({ cgm: false });
    expect(next.cgm).toBe(false);
  });
});
