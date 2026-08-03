/**
 * Recovery / load weight presets — same localStorage key as legacy app.js.
 */
import {
  DEFAULT_RECOVERY_WEIGHTS,
  RECOVERY_WEIGHT_PRESETS,
  type RecoveryWeightPresetId,
  type RecoveryWeights,
} from '@health-analyzer/lib';

/** Same key as web-ui/public/legacy/app.js RECOVERY_WEIGHTS_KEY. */
export const RECOVERY_WEIGHTS_KEY = 'health-analyzer-recovery-weights';

export type { RecoveryWeights, RecoveryWeightPresetId };

export const RECOVERY_PRESET_IDS: RecoveryWeightPresetId[] = [
  'balanced',
  'recoveryFirst',
  'training',
  'weightLoss',
];

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Normalize partial weights to full RecoveryWeights. */
export function normalizeRecoveryWeights(
  raw: unknown,
): RecoveryWeights {
  const base = { ...DEFAULT_RECOVERY_WEIGHTS };
  if (!raw || typeof raw !== 'object') return base;
  const o = raw as Record<string, unknown>;
  return {
    hrv: num(o.hrv, base.hrv),
    sleep: num(o.sleep, base.sleep),
    nightHr: num(o.nightHr, base.nightHr),
    spo2Night: num(o.spo2Night, base.spo2Night),
    exercise: num(o.exercise, base.exercise),
    workout: num(o.workout, base.workout),
    steps: num(o.steps, base.steps),
  };
}

export function loadRecoveryWeights(): RecoveryWeights {
  try {
    const raw = safeGet(RECOVERY_WEIGHTS_KEY);
    if (!raw) return { ...DEFAULT_RECOVERY_WEIGHTS };
    return normalizeRecoveryWeights(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_RECOVERY_WEIGHTS };
  }
}

export function saveRecoveryWeights(weights: RecoveryWeights): RecoveryWeights {
  const w = normalizeRecoveryWeights(weights);
  safeSet(RECOVERY_WEIGHTS_KEY, JSON.stringify(w));
  return w;
}

export function applyRecoveryPreset(
  id: RecoveryWeightPresetId,
): RecoveryWeights {
  const preset =
    RECOVERY_WEIGHT_PRESETS[id] || RECOVERY_WEIGHT_PRESETS.balanced;
  return saveRecoveryWeights({ ...preset });
}

export function matchRecoveryPreset(
  weights: RecoveryWeights,
): RecoveryWeightPresetId | null {
  const keys = Object.keys(DEFAULT_RECOVERY_WEIGHTS) as (keyof RecoveryWeights)[];
  for (const id of RECOVERY_PRESET_IDS) {
    const p = RECOVERY_WEIGHT_PRESETS[id];
    if (keys.every((k) => Math.abs((p[k] ?? 0) - (weights[k] ?? 0)) < 1e-6)) {
      return id;
    }
  }
  return null;
}
