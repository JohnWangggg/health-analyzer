import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import { grantWarehouseConsent, persistHealthDataSharded } from './warehousePersist';
import {
  deleteCgmMonthShards,
  deleteDomainYearShards,
  deleteShardIds,
  listDomainShardGroups,
} from './warehouseShardDelete';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';
import type { HealthData } from '@health-analyzer/lib';

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

async function resetDb() {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(IDB_CONTRACT.name);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
  const db = await openEmptyLegacySchemaDb(
    IDB_CONTRACT.name,
    IDB_CONTRACT.version,
  );
  db.close();
}

function seedMultiMonthCgm(base: HealthData): HealthData {
  const data = JSON.parse(JSON.stringify(base)) as HealthData;
  const extra = [
    { datetime: '2024-01-15 12:00:00 +0000', value: 5.5 },
    { datetime: '2024-02-15 12:00:00 +0000', value: 5.6 },
    { datetime: '2025-06-01 08:00:00 +0000', value: 6.1 },
  ];
  data.cgm = [...(data.cgm || []), ...extra] as HealthData['cgm'];
  return data;
}

describe('warehouseShardDelete', () => {
  it('lists CGM month groups after sharded persist', async () => {
    await resetDb();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    const seeded = seedMultiMonthCgm(data);
    await grantWarehouseConsent();
    const w = await persistHealthDataSharded(seeded, { grantIfNeeded: false });
    expect(w.ok).toBe(true);

    const groups = await listDomainShardGroups();
    const cgm = groups.find((g) => g.domain === 'cgm');
    expect(cgm).toBeTruthy();
    expect(cgm!.kind).toBe('cgm-month');
    expect(cgm!.items.length).toBeGreaterThanOrEqual(2);
    expect(cgm!.items.every((i) => i.id.startsWith('cgm|'))).toBe(true);
  });

  it('deleteCgmMonthShards removes selected months', async () => {
    await resetDb();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    const seeded = seedMultiMonthCgm(data);
    await grantWarehouseConsent();
    await persistHealthDataSharded(seeded, { grantIfNeeded: false });

    const before = await listDomainShardGroups();
    const months = before
      .find((g) => g.domain === 'cgm')!
      .items.map((i) => i.shard)
      .sort();
    expect(months.length).toBeGreaterThanOrEqual(2);
    const drop = months[0]!;

    const r = await deleteCgmMonthShards(drop);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const after = await listDomainShardGroups();
    const afterMonths =
      after.find((g) => g.domain === 'cgm')?.items.map((i) => i.shard) || [];
    expect(afterMonths).not.toContain(drop);
    expect(afterMonths.length).toBe(months.length - 1);

    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded).not.toBeNull();
  });

  it('deleteShardIds rejects invalid and accepts valid ids', async () => {
    await resetDb();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    await grantWarehouseConsent();
    await persistHealthDataSharded(seedMultiMonthCgm(data), {
      grantIfNeeded: false,
    });
    const groups = await listDomainShardGroups();
    const id = groups.find((g) => g.domain === 'cgm')!.items[0]!.id;
    const bad = await deleteShardIds(['core|full', 'nope']);
    expect(bad.ok).toBe(false);
    const ok = await deleteShardIds([id]);
    expect(ok.ok).toBe(true);
  });

  it('deleteDomainYearShards invalid domain fails cleanly', async () => {
    const r = await deleteDomainYearShards('notADomain', '2024');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('invalid_domain');
  });
});
