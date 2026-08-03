/**
 * Personal UserContext — shared localStorage key with legacy app.js.
 * SSR / localStorage-safe: try/catch; invalid JSON falls back to empty.
 */

/** Same key as web-ui/public/legacy/app.js CTX_STORAGE_KEY. */
export const STORAGE_KEY = 'health-analyzer-user-context-v1';

/** Mirrors lib UserContext (types.ts). */
export type UserContext = {
  age?: number | null;
  sex?: string | null;
  heightCm?: number | null;
  medications?: string | null;
  conditions?: string | null;
  targetWeightKg?: number | null;
  focus?: string | null;
  notes?: string | null;
};

export const EMPTY_USER_CONTEXT: UserContext = {
  age: null,
  sex: null,
  heightCm: null,
  medications: null,
  conditions: null,
  targetWeightKg: null,
  focus: null,
  notes: null,
};

function safeGetItem(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota / private mode */
  }
}

function safeRemoveItem(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Normalize unknown JSON into a stable UserContext shape. */
export function normalizeUserContext(raw: unknown): UserContext {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_USER_CONTEXT };
  const o = raw as Record<string, unknown>;
  return {
    age: numOrNull(o.age),
    sex: textOrNull(o.sex),
    heightCm: numOrNull(o.heightCm),
    medications: textOrNull(o.medications),
    conditions: textOrNull(o.conditions),
    targetWeightKg: numOrNull(o.targetWeightKg),
    focus: textOrNull(o.focus),
    notes: textOrNull(o.notes),
  };
}

/** Load UserContext from localStorage (legacy-compatible). */
export function loadUserContext(): UserContext {
  try {
    const raw = safeGetItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_USER_CONTEXT };
    return normalizeUserContext(JSON.parse(raw));
  } catch {
    return { ...EMPTY_USER_CONTEXT };
  }
}

/** Persist UserContext to localStorage (legacy-compatible JSON). */
export function saveUserContext(ctx: UserContext): void {
  try {
    const normalized = normalizeUserContext(ctx);
    safeSetItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore */
  }
}

/** Clear form storage key (legacy removeItem). */
export function clearUserContext(): void {
  safeRemoveItem(STORAGE_KEY);
}

/**
 * Context injected into LLM prompts.
 * Strategy A: same as full stored context (no sensitive strip yet).
 * Maps null → undefined for lib UserContext typing.
 */
export function getUserContextForPrompt(): {
  age?: number;
  sex?: string;
  heightCm?: number;
  medications?: string;
  conditions?: string;
  targetWeightKg?: number;
  focus?: string;
  notes?: string;
} {
  const c = loadUserContext();
  const out: {
    age?: number;
    sex?: string;
    heightCm?: number;
    medications?: string;
    conditions?: string;
    targetWeightKg?: number;
    focus?: string;
    notes?: string;
  } = {};
  if (c.age != null) out.age = c.age;
  if (c.sex) out.sex = c.sex;
  if (c.heightCm != null) out.heightCm = c.heightCm;
  if (c.medications) out.medications = c.medications;
  if (c.conditions) out.conditions = c.conditions;
  if (c.targetWeightKg != null) out.targetWeightKg = c.targetWeightKg;
  if (c.focus) out.focus = c.focus;
  if (c.notes) out.notes = c.notes;
  return out;
}
