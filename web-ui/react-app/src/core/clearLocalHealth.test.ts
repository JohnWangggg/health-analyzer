import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import {
  clearAllLocalHealthData,
  HEALTH_LOCAL_STORAGE_KEYS,
} from './clearLocalHealth';
import { openLegacyHistoryDb, IDB_CONTRACT } from './idbContract';

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
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => store.clear());

describe('clearAllLocalHealthData', () => {
  it('removes health localStorage keys and empties IDB stores', async () => {
    localStorage.setItem('health-analyzer-user-context-v1', '{}');
    localStorage.setItem(HEALTH_LOCAL_STORAGE_KEYS[1]!, '1');
    // UI prefs must survive if not in list
    localStorage.setItem('ha-react-ui-locale', 'en');

    const db = await openLegacyHistoryDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['snapshots', 'healthEvents'], 'readwrite');
      tx.objectStore('snapshots').put({
        id: 's1',
        savedAt: new Date().toISOString(),
        dateRange: { start: 'a', end: 'b' },
      });
      tx.objectStore('healthEvents').put({
        id: 'e1',
        kind: 'custom',
        date: '2026-01-01',
        title: 't',
        source: 'manual',
        createdAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const r = await clearAllLocalHealthData();
    expect(r.clearedKeys.length).toBeGreaterThan(0);
    expect(localStorage.getItem('health-analyzer-user-context-v1')).toBeNull();
    expect(localStorage.getItem('ha-react-ui-locale')).toBe('en');

    const db2 = await openLegacyHistoryDb();
    const snaps = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db2.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db2.close();
    expect(snaps).toHaveLength(0);
    expect(IDB_CONTRACT.name).toBe('health-analyzer-history');
  });
});
