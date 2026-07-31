/**
 * IndexedDB warehouse / history contract — shared with legacy `web-ui/public/history-db.js`.
 *
 * Dual-track rule: React shell may OPEN the existing database and READ store names,
 * but must NOT change DB_NAME, DB_VERSION, store names, keyPaths, or force-migrate
 * warehouse chunk formats. Schema evolution remains owned by legacy history-db.js.
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

export type IdbProbeResult = {
  ok: boolean;
  name: string;
  version: number;
  storeNames: string[];
  missingStores: string[];
  note: string;
};

/**
 * Open the legacy history database without creating a divergent schema.
 * If the DB does not exist yet, onupgradeneeded will create the same store names
 * as legacy (compatible empty shell). If a higher future version appears,
 * open at contract version only — never bump version from React.
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
      reject(new Error('IndexedDB open blocked (another tab holds a newer version?)'));
    req.onupgradeneeded = () => {
      const db = req.result;
      // Only create missing stores with the same keyPaths as history-db.js —
      // never rename or drop stores from React.
      if (!db.objectStoreNames.contains('snapshots')) {
        const store = db.createObjectStore('snapshots', { keyPath: 'id' });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('weeklyReports')) {
        const reports = db.createObjectStore('weeklyReports', { keyPath: 'id' });
        reports.createIndex('savedAt', 'savedAt', { unique: false });
        reports.createIndex('weekEnd', 'weekEnd', { unique: false });
      }
      if (!db.objectStoreNames.contains('healthEvents')) {
        const events = db.createObjectStore('healthEvents', { keyPath: 'id' });
        events.createIndex('at', 'at', { unique: false });
      }
      if (!db.objectStoreNames.contains('importBatches')) {
        db.createObjectStore('importBatches', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('warehouseMeta')) {
        db.createObjectStore('warehouseMeta', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('domainChunks')) {
        const chunks = db.createObjectStore('domainChunks', { keyPath: 'id' });
        chunks.createIndex('domain', 'domain', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Probe store names against the dual-track contract (read-only check). */
export async function probeIdbContract(): Promise<IdbProbeResult> {
  const db = await openLegacyHistoryDb();
  try {
    const storeNames = Array.from(db.objectStoreNames).sort();
    const expected = [...IDB_CONTRACT.stores];
    const missingStores = expected.filter((s) => !storeNames.includes(s));
    return {
      ok: missingStores.length === 0,
      name: db.name,
      version: db.version,
      storeNames,
      missingStores,
      note:
        missingStores.length === 0
          ? 'IDB contract matched; no schema force-migration from React shell.'
          : `Missing stores: ${missingStores.join(', ')}`,
    };
  } finally {
    db.close();
  }
}
