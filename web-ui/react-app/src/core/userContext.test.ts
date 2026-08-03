import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  EMPTY_USER_CONTEXT,
  clearUserContext,
  getUserContextForPrompt,
  loadUserContext,
  normalizeUserContext,
  saveUserContext,
  type UserContext,
} from './userContext';

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

describe('userContext', () => {
  it('defaults to empty when key missing', () => {
    expect(loadUserContext()).toEqual(EMPTY_USER_CONTEXT);
  });

  it('save/load round-trips legacy field names', () => {
    const ctx: UserContext = {
      age: 40,
      sex: '男',
      heightCm: 175,
      medications: '氯沙坦钾 50mg',
      conditions: '高血压自述',
      targetWeightKg: 70,
      focus: '夜间血压',
      notes: '可选备注',
    };
    saveUserContext(ctx);
    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.age).toBe(40);
    expect(parsed.heightCm).toBe(175);
    expect(parsed.targetWeightKg).toBe(70);
    expect(parsed.medications).toBe('氯沙坦钾 50mg');
    expect(loadUserContext()).toEqual(ctx);
  });

  it('clear removes storage key and load returns empty', () => {
    saveUserContext({ age: 30, sex: '女' });
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    clearUserContext();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(loadUserContext()).toEqual(EMPTY_USER_CONTEXT);
  });

  it('invalid JSON falls back to empty without throw', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    expect(loadUserContext()).toEqual(EMPTY_USER_CONTEXT);
  });

  it('normalize coerces blank strings and non-numbers', () => {
    expect(
      normalizeUserContext({
        age: '41',
        sex: '  ',
        heightCm: 'nope',
        medications: '  metformin  ',
        focus: '',
      }),
    ).toEqual({
      age: 41,
      sex: null,
      heightCm: null,
      medications: 'metformin',
      conditions: null,
      targetWeightKg: null,
      focus: null,
      notes: null,
    });
  });

  it('getUserContextForPrompt reads storage', () => {
    saveUserContext({ age: 55, focus: '恢复' });
    expect(getUserContextForPrompt()).toEqual(
      expect.objectContaining({ age: 55, focus: '恢复' }),
    );
  });

  it('save is no-op safe when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem() {
          throw new Error('blocked');
        },
        setItem() {
          throw new Error('blocked');
        },
        removeItem() {
          throw new Error('blocked');
        },
      },
      configurable: true,
      writable: true,
    });
    expect(() => saveUserContext({ age: 1 })).not.toThrow();
    expect(() => clearUserContext()).not.toThrow();
    expect(loadUserContext()).toEqual(EMPTY_USER_CONTEXT);
  });
});
