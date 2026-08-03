import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  RECOVERY_WEIGHTS_KEY,
  applyRecoveryPreset,
  loadRecoveryWeights,
  matchRecoveryPreset,
  normalizeRecoveryWeights,
  saveRecoveryWeights,
} from './recoveryWeights';

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

describe('recoveryWeights', () => {
  it('defaults to balanced when missing', () => {
    const w = loadRecoveryWeights();
    expect(w.hrv).toBe(1);
    expect(matchRecoveryPreset(w)).toBe('balanced');
  });

  it('applies recoveryFirst preset and persists key', () => {
    const w = applyRecoveryPreset('recoveryFirst');
    expect(w.hrv).toBeGreaterThan(1);
    expect(localStorage.getItem(RECOVERY_WEIGHTS_KEY)).toBeTruthy();
    expect(matchRecoveryPreset(loadRecoveryWeights())).toBe('recoveryFirst');
  });

  it('normalize fills missing fields', () => {
    const w = normalizeRecoveryWeights({ hrv: 2 });
    expect(w.hrv).toBe(2);
    expect(w.sleep).toBe(1);
  });

  it('save/load round-trip', () => {
    saveRecoveryWeights({
      hrv: 1.1,
      sleep: 1.1,
      nightHr: 1,
      spo2Night: 1,
      exercise: 1,
      workout: 1,
      steps: 1,
    });
    expect(loadRecoveryWeights().hrv).toBe(1.1);
  });
});
