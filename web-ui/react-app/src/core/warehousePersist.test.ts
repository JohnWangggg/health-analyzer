import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import {
  applyKeepWindowsToStoredWarehouse,
  grantWarehouseConsent,
  persistHealthDataSharded,
  persistHealthDataSimple,
} from './warehousePersist';
import {
  setCgmKeepMonths,
  setWarehouseAutoTrimEnabled,
  setYearKeepYears,
} from './warehouseKeepPrefs';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';
import { readWarehouseMetaView } from './legacyHistoryRead';
import { WH_LAYOUT_SHARDED } from './warehouseShards';
import type { HealthData } from '@health-analyzer/lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

const lsStore = new Map<string, string>();

beforeAll(async () => {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  // @ts-expect-error test
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error test
  globalThis.IDBKeyRange = IDBKeyRange;

  // Node test env has no localStorage — keep-N prefs need it
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem(key: string) {
        return lsStore.has(key) ? lsStore.get(key)! : null;
      },
      setItem(key: string, value: string) {
        lsStore.set(key, String(value));
      },
      removeItem(key: string) {
        lsStore.delete(key);
      },
      clear() {
        lsStore.clear();
      },
      key() {
        return null;
      },
      get length() {
        return lsStore.size;
      },
    },
    configurable: true,
    writable: true,
  });
});

beforeEach(() => {
  lsStore.clear();
});

afterEach(async () => {
  lsStore.clear();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_CONTRACT.name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('warehousePersist sharded-v1', () => {
  it('sharded persist + load roundtrip preserves CGM', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();

    const xml = readFileSync(FIXTURE, 'utf8');
    const { data, summary } = analyzeHealthXml(xml, { locale: 'zh-CN' });

    const written = await persistHealthDataSharded(data, {
      grantIfNeeded: true,
    });
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.layout).toBe(WH_LAYOUT_SHARDED);
      expect(written.chunkCount).toBeGreaterThan(1);
      expect(written.recordCount).toBeGreaterThan(0);
    }

    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded).toBeTruthy();
    expect(loaded!.summary.counts.cgm).toBe(summary.counts.cgm);
    expect(loaded!.layout).toBe(WH_LAYOUT_SHARDED);
  });

  it('sharded write clears orphan domain shards from prior mixed state', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    // Seed ghost CGM shard that would poison core-only writes
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['warehouseMeta', 'domainChunks'],
        'readwrite',
      );
      tx.objectStore('warehouseMeta').put({
        id: IDB_CONTRACT.metaId,
        consent: { granted: true },
        layout: 'sharded-v1',
      });
      tx.objectStore('domainChunks').put({
        id: 'cgm|1999-01',
        domain: 'cgm',
        shard: '1999-01',
        payload: [{ datetime: '1999-01-01 00:00:00 +0000', value: 99 }],
      });
      tx.objectStore('domainChunks').put({
        id: 'core|full',
        domain: 'core',
        payload: { ...data, cgm: [] },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    await persistHealthDataSharded(data, { grantIfNeeded: false });
    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded!.data.cgm.every((p) => !String(p.datetime).startsWith('1999'))).toBe(
      true,
    );
    expect(loaded!.summary.counts.cgm).toBe(data.cgm.length);
  });

  it('core-only simple write still blocked without force', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const r = await persistHealthDataSimple(data, { grantIfNeeded: true });
    expect(r.ok).toBe(false);
  });

  it('grant + sharded persist works', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    await grantWarehouseConsent();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const r = await persistHealthDataSharded(data, { grantIfNeeded: false });
    expect(r.ok).toBe(true);
  });

  it('default auto-trim off leaves extra CGM months on persist', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    setWarehouseAutoTrimEnabled(false);
    setCgmKeepMonths(3);

    const data = {
      cgm: ['2023-01', '2023-02', '2023-03', '2023-04', '2023-05'].map(
        (m) => ({
          datetime: `${m}-10 00:00:00 +0000`,
          value: 100,
        }),
      ),
      bloodPressure: [],
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

    const r = await persistHealthDataSharded(data, { grantIfNeeded: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keepTrimmed).toBe(false);
      expect(r.droppedMonthCount).toBe(0);
    }
    const meta = await readWarehouseMetaView();
    expect(meta.cgmMonths?.length).toBe(5);
  });

  it('forceKeepWindows trims even when auto-trim off', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    setWarehouseAutoTrimEnabled(false);
    setCgmKeepMonths(3);
    setYearKeepYears(2);

    const data = {
      cgm: ['2023-01', '2023-02', '2023-03', '2023-04', '2023-05'].map(
        (m) => ({
          datetime: `${m}-10 00:00:00 +0000`,
          value: 100,
        }),
      ),
      bloodPressure: [
        { datetime: '2019-01-01 00:00:00 +0000', systolic: 120, diastolic: 80 },
        { datetime: '2020-01-01 00:00:00 +0000', systolic: 121, diastolic: 80 },
        { datetime: '2021-01-01 00:00:00 +0000', systolic: 122, diastolic: 80 },
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

    const r = await persistHealthDataSharded(data, {
      grantIfNeeded: true,
      forceKeepWindows: true,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keepTrimmed).toBe(true);
      expect(r.droppedMonthCount).toBe(2);
      expect(r.droppedMonths).toEqual(['2023-01', '2023-02']);
      expect(r.droppedYearsByDomain?.bpYears).toEqual(['2019']);
    }
    const meta = await readWarehouseMetaView();
    expect(meta.cgmMonths).toEqual(['2023-03', '2023-04', '2023-05']);
    expect(meta.bpYears).toEqual(['2020', '2021']);
  });

  it('applyKeepWindowsToStoredWarehouse rewrites with keep-N', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    setWarehouseAutoTrimEnabled(false);
    setCgmKeepMonths(3);

    const data = {
      cgm: [
        '2023-01',
        '2023-02',
        '2023-03',
        '2023-04',
        '2023-05',
      ].map((m) => ({
        datetime: `${m}-10 00:00:00 +0000`,
        value: 100,
      })),
      bloodPressure: [],
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

    await persistHealthDataSharded(data, { grantIfNeeded: true });
    expect((await readWarehouseMetaView()).cgmMonths?.length).toBe(5);

    const r = await applyKeepWindowsToStoredWarehouse();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.keepTrimmed).toBe(true);
      expect(r.droppedMonthCount).toBe(2);
    }
    expect((await readWarehouseMetaView()).cgmMonths).toEqual([
      '2023-03',
      '2023-04',
      '2023-05',
    ]);
  });

  it('applyKeepWindowsToStoredWarehouse returns empty when no warehouse', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    const r = await applyKeepWindowsToStoredWarehouse();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('empty');
  });
});
