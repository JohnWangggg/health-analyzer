import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import {
  loadAndAnalyzeWarehouse,
  reassembleFromChunks,
} from './warehouseLoad';
import { analyzeHealthXml } from './HealthCoreAdapter';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

beforeAll(async () => {
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  // @ts-expect-error test
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error test
  globalThis.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_CONTRACT.name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
});

describe('warehouseLoad', () => {
  it('reassembleFromChunks merges core + cgm shards', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const corePayload = {
      ...data,
      cgm: [],
    };
    const assembled = reassembleFromChunks([
      { id: 'core|full', domain: 'core', payload: corePayload },
      { id: 'cgm|2026-07', domain: 'cgm', shard: '2026-07', payload: data.cgm },
    ]);
    expect(assembled).toBeTruthy();
    expect(assembled!.data.cgm.length).toBe(data.cgm.length);
    expect(assembled!.layout).toBe('sharded-v1');
  });

  it('loadAndAnalyzeWarehouse returns null without consent', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    const r = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(r).toBeNull();
  });

  it('loadAndAnalyzeWarehouse analyzes seeded warehouse with consent', async () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['warehouseMeta', 'domainChunks'],
        'readwrite',
      );
      tx.objectStore('warehouseMeta').put({
        id: IDB_CONTRACT.metaId,
        consent: { granted: true, grantedAt: new Date().toISOString() },
        totalRecordCount: 10,
        totalApproxBytes: 1000,
      });
      tx.objectStore('domainChunks').put({
        id: 'core|full',
        domain: 'core',
        payload: data,
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const r = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(r).toBeTruthy();
    expect(r!.summary.counts.cgm).toBeGreaterThan(0);
    expect(r!.consentGranted).toBe(true);
    expect(r!.chunkCount).toBe(1);
  });
});
