import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import {
  listSnapshotSummaries,
  readWarehouseMetaView,
} from './legacyHistoryRead';

const TEST_DB = 'ha-legacy-history-read-test';

beforeAll(async () => {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  // @ts-expect-error test globals
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error test globals
  globalThis.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
  // Tests open production contract name — clean both
  for (const name of [TEST_DB, IDB_CONTRACT.name]) {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
});

describe('legacyHistoryRead (read-only)', () => {
  it('lists empty snapshots and default warehouse meta on fresh DB', async () => {
    // Seed contract DB via production open path
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();

    const snaps = await listSnapshotSummaries();
    expect(Array.isArray(snaps)).toBe(true);
    expect(snaps.length).toBe(0);

    const meta = await readWarehouseMetaView();
    expect(meta.id).toBe(IDB_CONTRACT.metaId);
    expect(meta.consentGranted).toBe(false);
  });

  it('reads snapshot rows written with legacy-compatible shape', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        id: 'snap-1',
        savedAt: '2026-07-20T10:00:00.000Z',
        title: '测试快照',
        dateRange: { start: '2026-07-01', end: '2026-07-20' },
      });
      tx.objectStore('snapshots').put({
        id: 'snap-2',
        savedAt: '2026-07-21T10:00:00.000Z',
        label: '较新',
        dateRange: { start: '2026-07-10', end: '2026-07-21' },
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const snaps = await listSnapshotSummaries(10);
    expect(snaps.length).toBe(2);
    // newest first
    expect(snaps[0]!.id).toBe('snap-2');
    expect(snaps[0]!.label).toBe('较新');
    expect(snaps[1]!.dateRange?.end).toBe('2026-07-20');
  });

  it('reads warehouseMeta consent and counts', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('warehouseMeta', 'readwrite');
      tx.objectStore('warehouseMeta').put({
        id: IDB_CONTRACT.metaId,
        consent: { granted: true, policyVersion: 'test-policy' },
        dateRange: { start: '2026-01-01', end: '2026-07-01' },
        totalApproxBytes: 1024 * 1024,
        totalRecordCount: 42,
        lastWrittenAt: '2026-07-01T00:00:00.000Z',
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const meta = await readWarehouseMetaView();
    expect(meta.consentGranted).toBe(true);
    expect(meta.totalRecordCount).toBe(42);
    expect(meta.totalApproxBytes).toBe(1024 * 1024);
    expect(meta.dateRange?.start).toBe('2026-01-01');
    expect(meta.cgmMonths).toBeNull();
    expect(meta.bpYears).toBeNull();
  });

  it('reads optional shard key lists from warehouseMeta', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('warehouseMeta', 'readwrite');
      tx.objectStore('warehouseMeta').put({
        id: IDB_CONTRACT.metaId,
        consent: { granted: true },
        cgmMonths: ['2024-01', '2024-02'],
        bpYears: ['2022', '2023'],
        weightYears: ['2023'],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const meta = await readWarehouseMetaView();
    expect(meta.cgmMonths).toEqual(['2024-01', '2024-02']);
    expect(meta.bpYears).toEqual(['2022', '2023']);
    expect(meta.weightYears).toEqual(['2023']);
    expect(meta.sleepYears).toBeNull();
  });
});
