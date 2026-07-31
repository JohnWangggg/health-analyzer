import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import {
  grantWarehouseConsent,
  persistHealthDataSimple,
} from './warehousePersist';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';

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

describe('warehousePersist', () => {
  it('persist + load roundtrip via core|full', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();

    const xml = readFileSync(FIXTURE, 'utf8');
    const { data, summary } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    expect(summary.counts.cgm).toBeGreaterThan(0);

    // force: product write is gated; tests exercise serializer only
    const written = await persistHealthDataSimple(data, {
      grantIfNeeded: true,
      force: true,
    });
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.recordCount).toBeGreaterThan(0);
      expect(written.approxBytes).toBeGreaterThan(100);
    }

    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded).toBeTruthy();
    expect(loaded!.summary.counts.cgm).toBe(summary.counts.cgm);
    expect(loaded!.consentGranted).toBe(true);
  });

  it('fails without consent when grantIfNeeded false', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const r = await persistHealthDataSimple(data, {
      grantIfNeeded: false,
      force: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no_consent');
  });

  it('product path blocks write without force', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const r = await persistHealthDataSimple(data, { grantIfNeeded: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/disabled_until_shared_shard_writer/);
  });

  it('grantWarehouseConsent enables subsequent forced persist', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();
    await grantWarehouseConsent();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml);
    const r = await persistHealthDataSimple(data, {
      grantIfNeeded: false,
      force: true,
    });
    expect(r.ok).toBe(true);
  });
});
