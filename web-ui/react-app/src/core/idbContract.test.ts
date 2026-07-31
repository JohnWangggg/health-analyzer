/**
 * IDB schema parity: React empty-create must match history-db.js onupgradeneeded.
 * Uses fake-indexeddb for real open/create path + source text lock on legacy file.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  IDB_CONTRACT,
  LEGACY_IDB_STORE_SPECS,
  applyLegacyIdbSchema,
  diffAgainstLegacySchema,
  introspectIdbSchema,
  openEmptyLegacySchemaDb,
} from './idbContract';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_DB_JS = resolve(
  __dirname,
  '../../../public/legacy/history-db.js',
);

const TEST_DB = 'ha-react-idb-schema-parity-test';

beforeAll(async () => {
  // Provide IndexedDB in Node for this suite
  const { indexedDB, IDBKeyRange } = await import('fake-indexeddb');
  // @ts-expect-error attach globals for open path under test
  globalThis.indexedDB = indexedDB;
  // @ts-expect-error IDBKeyRange used by some IDB stacks
  globalThis.IDBKeyRange = IDBKeyRange;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(TEST_DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
});

function extractUpgradeBlock(src: string): string {
  const start = src.indexOf('req.onupgradeneeded');
  expect(start).toBeGreaterThan(-1);
  // Take a generous slice of the upgrade handler
  return src.slice(start, start + 2200);
}

describe('IDB contract vs legacy history-db.js', () => {
  it('constants match history-db.js DB_NAME and DB_VERSION', () => {
    const src = readFileSync(HISTORY_DB_JS, 'utf8');
    expect(src).toMatch(/const DB_NAME = 'health-analyzer-history'/);
    expect(src).toMatch(/const DB_VERSION = 5/);
    expect(IDB_CONTRACT.name).toBe('health-analyzer-history');
    expect(IDB_CONTRACT.version).toBe(5);
  });

  it('LEGACY_IDB_STORE_SPECS lock to history-db.js createObjectStore/createIndex calls', () => {
    const src = readFileSync(HISTORY_DB_JS, 'utf8');
    const block = extractUpgradeBlock(src);

    // Store names (history-db uses constants; values are string literals assigned above)
    expect(src).toMatch(/const STORE = 'snapshots'/);
    expect(src).toMatch(/const STORE_REPORTS = 'weeklyReports'/);
    expect(src).toMatch(/const STORE_EVENTS = 'healthEvents'/);
    expect(src).toMatch(/const STORE_IMPORT_BATCHES = 'importBatches'/);
    expect(src).toMatch(/const STORE_WH_META = 'warehouseMeta'/);
    expect(src).toMatch(/const STORE_WH_CHUNKS = 'domainChunks'/);

    // Indexes exactly as in openDb onupgradeneeded
    expect(block).toMatch(
      /createIndex\(\s*['"]savedAt['"]\s*,\s*['"]savedAt['"]/,
    );
    expect(block).toMatch(
      /createIndex\(\s*['"]weekEnd['"]\s*,\s*['"]weekEnd['"]/,
    );
    expect(block).toMatch(
      /createIndex\(\s*['"]date['"]\s*,\s*['"]date['"]/,
    );
    expect(block).toMatch(
      /createIndex\(\s*['"]createdAt['"]\s*,\s*['"]createdAt['"]/,
    );
    expect(block).toMatch(
      /createIndex\(\s*['"]domain['"]\s*,\s*['"]domain['"]/,
    );
    expect(block).toMatch(
      /createIndex\(\s*['"]updatedAt['"]\s*,\s*['"]updatedAt['"]/,
    );

    // Must NOT use the divergent 'at' index React previously had
    expect(block).not.toMatch(/createIndex\(\s*['"]at['"]/);

    // importBatches must create createdAt index (not bare store only)
    const batchesSection = block.slice(
      block.indexOf('STORE_IMPORT_BATCHES'),
      block.indexOf('STORE_WH_META'),
    );
    expect(batchesSection).toMatch(/createIndex\(\s*['"]createdAt['"]/);

    // domainChunks must create updatedAt
    const chunksSection = block.slice(block.indexOf('STORE_WH_CHUNKS'));
    expect(chunksSection).toMatch(/createIndex\(\s*['"]updatedAt['"]/);

    // Our exported specs enumerate the same indexes
    const healthEvents = LEGACY_IDB_STORE_SPECS.find(
      (s) => s.name === 'healthEvents',
    )!;
    expect(healthEvents.indexes.map((i) => i.name).sort()).toEqual([
      'createdAt',
      'date',
    ]);
    const importBatches = LEGACY_IDB_STORE_SPECS.find(
      (s) => s.name === 'importBatches',
    )!;
    expect(importBatches.indexes.map((i) => i.name)).toEqual(['createdAt']);
    const domainChunks = LEGACY_IDB_STORE_SPECS.find(
      (s) => s.name === 'domainChunks',
    )!;
    expect(domainChunks.indexes.map((i) => i.name).sort()).toEqual([
      'domain',
      'updatedAt',
    ]);
  });

  it('empty create via openEmptyLegacySchemaDb yields legacy indexes/keyPaths', async () => {
    const db = await openEmptyLegacySchemaDb(TEST_DB, IDB_CONTRACT.version);
    try {
      expect(db.version).toBe(5);
      const actual = introspectIdbSchema(db);
      const mismatches = diffAgainstLegacySchema(actual);
      expect(mismatches).toEqual([]);
      expect(actual.map((s) => s.name).sort()).toEqual(
        [...IDB_CONTRACT.stores].sort(),
      );

      // Spot-check critical stores
      const events = actual.find((s) => s.name === 'healthEvents')!;
      expect(events.keyPath).toBe('id');
      expect(events.indexes.map((i) => i.name).sort()).toEqual([
        'createdAt',
        'date',
      ]);
      expect(events.indexes.find((i) => i.name === 'at')).toBeUndefined();

      const batches = actual.find((s) => s.name === 'importBatches')!;
      expect(batches.indexes.map((i) => i.name)).toEqual(['createdAt']);

      const chunks = actual.find((s) => s.name === 'domainChunks')!;
      expect(chunks.indexes.map((i) => i.name).sort()).toEqual([
        'domain',
        'updatedAt',
      ]);
    } finally {
      db.close();
    }
  });

  it('applyLegacyIdbSchema is idempotent (no throw on second open without upgrade)', async () => {
    const db1 = await openEmptyLegacySchemaDb(TEST_DB);
    db1.close();
    const db2 = await openEmptyLegacySchemaDb(TEST_DB);
    try {
      // second open at same version: onupgradeneeded should not fire;
      // apply is still safe if called manually on existing stores
      applyLegacyIdbSchema(db2);
      expect(diffAgainstLegacySchema(introspectIdbSchema(db2))).toEqual([]);
    } finally {
      db2.close();
    }
  });
});
