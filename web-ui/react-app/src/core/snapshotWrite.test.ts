import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import { saveAnalysisSnapshot } from './snapshotWrite';
import { listSnapshotSummaries } from './legacyHistoryRead';

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

describe('snapshotWrite', () => {
  it('saves buildAnalysisSnapshot into legacy snapshots store', async () => {
    const db = await openEmptyLegacySchemaDb(
      IDB_CONTRACT.name,
      IDB_CONTRACT.version,
    );
    db.close();

    const xml = readFileSync(FIXTURE, 'utf8');
    const { analysis } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    const ref = await saveAnalysisSnapshot(analysis, { label: 'unit-test' });
    expect(ref.id).toBeTruthy();
    expect(ref.dateRange.end).toBeTruthy();

    const list = await listSnapshotSummaries();
    expect(list.length).toBe(1);
    expect(list[0]!.id).toBe(ref.id);
    expect(list[0]!.label).toMatch(/unit-test|快照/);
  });
});
