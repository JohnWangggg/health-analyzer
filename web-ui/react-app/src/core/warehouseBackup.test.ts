import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDB_CONTRACT, openEmptyLegacySchemaDb } from './idbContract';
import { analyzeHealthXml } from './HealthCoreAdapter';
import { grantWarehouseConsent, persistHealthDataSharded } from './warehousePersist';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';
import {
  BACKUP_MAGIC,
  decryptBackupCipher,
  encryptBackupPayload,
  exportWarehouseBackup,
  importWarehouseBackup,
} from './warehouseBackup';

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

describe('warehouseBackup crypto', () => {
  it('encrypt/decrypt roundtrip preserves payload', async () => {
    const payload = { hello: 'world', n: 42, nested: { a: true } };
    const cipher = await encryptBackupPayload(payload, 'test-pass-ok');
    expect(cipher.ciphertextB64.length).toBeGreaterThan(10);
    expect(cipher.iterations).toBe(210_000);
    const back = await decryptBackupCipher(cipher, 'test-pass-ok');
    expect(back).toEqual(payload);
  });

  it('wrong passphrase fails decrypt', async () => {
    const cipher = await encryptBackupPayload({ x: 1 }, 'correct-pass');
    await expect(decryptBackupCipher(cipher, 'wrong-pass')).rejects.toThrow(
      /decrypt_failed/,
    );
  });

  it('short passphrase rejected', async () => {
    await expect(encryptBackupPayload({}, 'ab')).rejects.toThrow(
      /passphrase_too_short/,
    );
  });
});

describe('warehouseBackup IDB export/import', () => {
  it('plaintext export/import restores CGM warehouse', async () => {
    await resetDb();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data, summary } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    expect(summary.counts.cgm).toBeGreaterThan(0);
    await grantWarehouseConsent();
    const written = await persistHealthDataSharded(data, {
      grantIfNeeded: false,
    });
    expect(written.ok).toBe(true);

    const envelope = await exportWarehouseBackup({ includeSnapshots: true });
    expect(envelope.magic).toBe(BACKUP_MAGIC);
    expect(envelope.formatVersion).toBe(1);
    expect(envelope.encryption).toBe('none');
    if (envelope.encryption !== 'none') throw new Error('expected none');
    expect(Array.isArray(envelope.payload.domainChunks)).toBe(true);
    expect(envelope.payload.domainChunks.length).toBeGreaterThan(0);

    await resetDb();

    const r = await importWarehouseBackup(envelope);
    expect(r.ok).toBe(true);
    expect(r.chunkCount).toBeGreaterThan(0);

    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded).not.toBeNull();
    expect(loaded!.summary.counts.cgm).toBe(summary.counts.cgm);
    expect(loaded!.summary.kpis.cgmMean).toBeCloseTo(
      summary.kpis.cgmMean ?? 0,
      2,
    );
  });

  it('encrypted export/import with passphrase', async () => {
    await resetDb();
    const xml = readFileSync(FIXTURE, 'utf8');
    const { data, summary } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    await grantWarehouseConsent();
    await persistHealthDataSharded(data, { grantIfNeeded: false });

    const envelope = await exportWarehouseBackup({
      passphrase: 'secret-pass-9',
    });
    expect(envelope.encryption).toBe('passphrase-aes-gcm');

    await resetDb();

    await expect(
      importWarehouseBackup(envelope, { passphrase: 'bad' }),
    ).rejects.toThrow();

    const r = await importWarehouseBackup(envelope, {
      passphrase: 'secret-pass-9',
    });
    expect(r.ok).toBe(true);
    const loaded = await loadAndAnalyzeWarehouse({ locale: 'zh-CN' });
    expect(loaded!.summary.counts.cgm).toBe(summary.counts.cgm);
  });

  it('rejects invalid magic', async () => {
    await expect(
      importWarehouseBackup({ magic: 'nope', formatVersion: 1 }),
    ).rejects.toThrow(/invalid_backup_magic/);
  });
});
