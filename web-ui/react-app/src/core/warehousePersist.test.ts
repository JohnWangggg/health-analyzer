import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import {
  grantWarehouseConsent,
  persistHealthDataSharded,
  persistHealthDataSimple,
} from './warehousePersist';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';
import { WH_LAYOUT_SHARDED } from './warehouseShards';

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
});
