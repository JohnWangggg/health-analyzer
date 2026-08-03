/**
 * IndexedDB warehouse / history contract — shared with legacy `web-ui/public/legacy/history-db.js`.
 *
 * Dual-track rule: React shell may OPEN the existing database and READ store names,
 * but must NOT change DB_NAME, DB_VERSION, store names, keyPaths, indexes, or
 * force-migrate warehouse chunk formats. Schema evolution remains owned by
 * legacy history-db.js.
 *
 * Empty-shell create (onupgradeneeded) MUST mirror history-db.js openDb exactly.
 * If React created a divergent v5 schema first, legacy open at v5 would not
 * re-run upgrade — a permanent split. Keep this file in lockstep with:
 *   web-ui/idb-schema/history-db.reference.js → openDb → onupgradeneeded
 *   (formerly public/legacy/history-db.js)
 */

export const IDB_CONTRACT = {
  /** Must match history-db.js DB_NAME */
  name: 'health-analyzer-history',
  /** Must match history-db.js DB_VERSION (v5: warehouseMeta + domainChunks) */
  version: 5,
  stores: [
    'snapshots',
    'weeklyReports',
    'healthEvents',
    'importBatches',
    'warehouseMeta',
    'domainChunks',
  ] as const,
  metaId: 'primary',
  warehousePolicyVersion: 'data-center-v1.90.0',
} as const;

/**
 * Exact object-store schema for empty create — must match history-db.js lines
 * that create stores/indexes (keyPath + index names + keyPaths + unique flags).
 */
export type IdbIndexSpec = {
  name: string;
  keyPath: string;
  unique: boolean;
};

export type IdbStoreSpec = {
  name: string;
  keyPath: string;
  indexes: IdbIndexSpec[];
};

/** Canonical empty-create schema (parity with history-db.js onupgradeneeded). */
export const LEGACY_IDB_STORE_SPECS: readonly IdbStoreSpec[] = [
  {
    name: 'snapshots',
    keyPath: 'id',
    indexes: [{ name: 'savedAt', keyPath: 'savedAt', unique: false }],
  },
  {
    name: 'weeklyReports',
    keyPath: 'id',
    indexes: [
      { name: 'savedAt', keyPath: 'savedAt', unique: false },
      { name: 'weekEnd', keyPath: 'weekEnd', unique: false },
    ],
  },
  {
    name: 'healthEvents',
    keyPath: 'id',
    indexes: [
      { name: 'date', keyPath: 'date', unique: false },
      { name: 'createdAt', keyPath: 'createdAt', unique: false },
    ],
  },
  {
    name: 'importBatches',
    keyPath: 'id',
    indexes: [{ name: 'createdAt', keyPath: 'createdAt', unique: false }],
  },
  {
    name: 'warehouseMeta',
    keyPath: 'id',
    indexes: [],
  },
  {
    name: 'domainChunks',
    keyPath: 'id',
    indexes: [
      { name: 'domain', keyPath: 'domain', unique: false },
      { name: 'updatedAt', keyPath: 'updatedAt', unique: false },
    ],
  },
] as const;

export type IdbProbeResult = {
  ok: boolean;
  name: string;
  version: number;
  storeNames: string[];
  missingStores: string[];
  schemaMismatches: string[];
  note: string;
};

/** Apply legacy-compatible empty schema (only creates missing stores). */
export function applyLegacyIdbSchema(db: IDBDatabase): void {
  for (const spec of LEGACY_IDB_STORE_SPECS) {
    if (db.objectStoreNames.contains(spec.name)) continue;
    const store = db.createObjectStore(spec.name, { keyPath: spec.keyPath });
    for (const idx of spec.indexes) {
      store.createIndex(idx.name, idx.keyPath, { unique: idx.unique });
    }
  }
}

/**
 * Introspect an open DB into store/index specs (for parity tests / probe).
 * Uses a readonly transaction; does not mutate data.
 */
export function introspectIdbSchema(db: IDBDatabase): IdbStoreSpec[] {
  const names = Array.from(db.objectStoreNames).sort();
  if (names.length === 0) return [];
  const tx = db.transaction(names, 'readonly');
  const out: IdbStoreSpec[] = [];
  for (const name of names) {
    const store = tx.objectStore(name);
    const keyPath =
      typeof store.keyPath === 'string'
        ? store.keyPath
        : Array.isArray(store.keyPath)
          ? store.keyPath.join(',')
          : '';
    const indexes: IdbIndexSpec[] = [];
    for (const idxName of Array.from(store.indexNames)) {
      const idx = store.index(idxName);
      const idxKeyPath =
        typeof idx.keyPath === 'string'
          ? idx.keyPath
          : Array.isArray(idx.keyPath)
            ? idx.keyPath.join(',')
            : '';
      indexes.push({
        name: idxName,
        keyPath: idxKeyPath,
        unique: idx.unique,
      });
    }
    indexes.sort((a, b) => a.name.localeCompare(b.name));
    out.push({ name, keyPath, indexes });
  }
  // leave tx to auto-complete
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Compare introspected schema to LEGACY_IDB_STORE_SPECS; return mismatch messages. */
export function diffAgainstLegacySchema(actual: IdbStoreSpec[]): string[] {
  const mismatches: string[] = [];
  const expectedByName = new Map(
    LEGACY_IDB_STORE_SPECS.map((s) => [s.name, s]),
  );
  const actualByName = new Map(actual.map((s) => [s.name, s]));

  for (const exp of LEGACY_IDB_STORE_SPECS) {
    const got = actualByName.get(exp.name);
    if (!got) {
      mismatches.push(`missing store: ${exp.name}`);
      continue;
    }
    if (got.keyPath !== exp.keyPath) {
      mismatches.push(
        `store ${exp.name} keyPath: got ${got.keyPath}, expected ${exp.keyPath}`,
      );
    }
    const expIdx = [...exp.indexes].sort((a, b) => a.name.localeCompare(b.name));
    const gotIdx = [...got.indexes].sort((a, b) => a.name.localeCompare(b.name));
    const expNames = expIdx.map((i) => i.name).join(',');
    const gotNames = gotIdx.map((i) => i.name).join(',');
    if (expNames !== gotNames) {
      mismatches.push(
        `store ${exp.name} indexes: got [${gotNames}], expected [${expNames}]`,
      );
    }
    for (const ei of expIdx) {
      const gi = gotIdx.find((x) => x.name === ei.name);
      if (!gi) continue;
      if (gi.keyPath !== ei.keyPath) {
        mismatches.push(
          `store ${exp.name} index ${ei.name} keyPath: got ${gi.keyPath}, expected ${ei.keyPath}`,
        );
      }
      if (gi.unique !== ei.unique) {
        mismatches.push(
          `store ${exp.name} index ${ei.name} unique: got ${gi.unique}, expected ${ei.unique}`,
        );
      }
    }
  }

  for (const name of actualByName.keys()) {
    if (!expectedByName.has(name)) {
      mismatches.push(`unexpected store: ${name}`);
    }
  }
  return mismatches;
}

/**
 * Open the legacy history database without creating a divergent schema.
 * Empty create uses applyLegacyIdbSchema — same stores/indexes as history-db.js.
 */
export function openLegacyHistoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_CONTRACT.name, IDB_CONTRACT.version);
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () =>
      reject(
        new Error(
          'IndexedDB open blocked (another tab holds a newer version?)',
        ),
      );
    req.onupgradeneeded = () => {
      applyLegacyIdbSchema(req.result);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/**
 * Open a throwaway named DB with legacy empty schema (tests only).
 * Does not touch the production DB name unless you pass it.
 */
export function openEmptyLegacySchemaDb(
  name: string,
  version = IDB_CONTRACT.version,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(name, version);
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      applyLegacyIdbSchema(req.result);
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Probe store names + full index schema against the dual-track contract. */
export async function probeIdbContract(): Promise<IdbProbeResult> {
  const db = await openLegacyHistoryDb();
  try {
    const storeNames = Array.from(db.objectStoreNames).sort();
    const expected = [...IDB_CONTRACT.stores];
    const missingStores = expected.filter((s) => !storeNames.includes(s));
    const schemaMismatches = diffAgainstLegacySchema(introspectIdbSchema(db));
    const ok = missingStores.length === 0 && schemaMismatches.length === 0;
    return {
      ok,
      name: db.name,
      version: db.version,
      storeNames,
      missingStores,
      schemaMismatches,
      note: ok
        ? 'IDB contract matched (stores + indexes); no schema force-migration from React shell.'
        : [
            missingStores.length
              ? `Missing stores: ${missingStores.join(', ')}`
              : null,
            schemaMismatches.length
              ? `Schema mismatches: ${schemaMismatches.join('; ')}`
              : null,
          ]
            .filter(Boolean)
            .join(' | '),
    };
  } finally {
    db.close();
  }
}
