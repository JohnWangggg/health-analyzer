/**
 * Warehouse backup export/import — format-compatible with legacy history-db.js v1.71+.
 * magic: health-analyzer-backup · formatVersion 1 · optional passphrase AES-GCM.
 */
import { IDB_CONTRACT, openLegacyHistoryDb } from './idbContract';
import { reassembleFromChunks } from './warehouseLoad';
import {
  WH_LAYOUT_SHARDED,
  approxJsonBytes,
  countHealthRecords,
  inferDateRange,
} from './warehouseShards';

export const BACKUP_MAGIC = 'health-analyzer-backup';
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_PBKDF2_ITERS = 210_000;

export type BackupCipher = {
  saltB64: string;
  ivB64: string;
  iterations: number;
  ciphertextB64: string;
};

export type BackupEnvelope =
  | {
      magic: typeof BACKUP_MAGIC;
      formatVersion: number;
      exportedAt: string;
      app: { name: string; dataCenter: string };
      encryption: 'none';
      payload: BackupPayloadBody;
    }
  | {
      magic: typeof BACKUP_MAGIC;
      formatVersion: number;
      exportedAt: string;
      app: { name: string; dataCenter: string };
      encryption: 'passphrase-aes-gcm';
      cipher: BackupCipher;
    };

export type BackupPayloadBody = {
  warehouseMeta?: Record<string, unknown> | null;
  domainChunks: unknown[];
  snapshots?: unknown[];
  weeklyReports?: unknown[];
  healthEvents?: unknown[];
  importBatches?: unknown[];
};

export type ExportBackupOptions = {
  includeSnapshots?: boolean;
  includeEvents?: boolean;
  includeReports?: boolean;
  includeBatches?: boolean;
  passphrase?: string;
};

export type ImportBackupOptions = {
  regrantConsent?: boolean;
  passphrase?: string;
};

function b64FromBytes(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function bytesFromB64(b64: string): Uint8Array {
  const bin = atob(String(b64 || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function requireSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('webcrypto_unavailable');
  return subtle;
}

async function deriveBackupKey(
  passphrase: string,
  saltBytes: Uint8Array,
): Promise<CryptoKey> {
  const subtle = requireSubtle();
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey(
    'raw',
    enc.encode(String(passphrase || '')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as BufferSource,
      iterations: BACKUP_PBKDF2_ITERS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Pure crypto — exported for unit tests. */
export async function encryptBackupPayload(
  payloadObj: unknown,
  passphrase: string,
): Promise<BackupCipher> {
  if (!passphrase || String(passphrase).length < 4) {
    throw new Error('passphrase_too_short');
  }
  const subtle = requireSubtle();
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payloadObj));
  const key = await deriveBackupKey(passphrase, salt);
  const cipherBuf = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return {
    saltB64: b64FromBytes(salt),
    ivB64: b64FromBytes(iv),
    iterations: BACKUP_PBKDF2_ITERS,
    ciphertextB64: b64FromBytes(cipherBuf),
  };
}

/** Pure crypto — exported for unit tests. */
export async function decryptBackupCipher(
  cipher: BackupCipher,
  passphrase: string | undefined,
): Promise<BackupPayloadBody> {
  if (!cipher?.ciphertextB64 || !cipher.saltB64 || !cipher.ivB64) {
    throw new Error('invalid_cipher');
  }
  if (!passphrase) throw new Error('passphrase_required');
  const subtle = requireSubtle();
  const salt = bytesFromB64(cipher.saltB64);
  const iv = bytesFromB64(cipher.ivB64);
  const ct = bytesFromB64(cipher.ciphertextB64);
  try {
    const key = await deriveBackupKey(passphrase, salt);
    const plainBuf = await subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      key,
      ct as BufferSource,
    );
    return JSON.parse(new TextDecoder().decode(plainBuf)) as BackupPayloadBody;
  } catch {
    throw new Error('decrypt_failed');
  }
}

function idbGetAll(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve((req.result as unknown[]) || []);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(storeName)) {
      resolve(undefined);
      return;
    }
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Export warehouse (+ optional side stores) as legacy-compatible backup envelope.
 */
export async function exportWarehouseBackup(
  opts?: ExportBackupOptions,
): Promise<BackupEnvelope> {
  const options = opts || {};
  const db = await openLegacyHistoryDb();
  try {
    const meta =
      ((await idbGet(db, 'warehouseMeta', IDB_CONTRACT.metaId)) as Record<
        string,
        unknown
      > | null) || null;
    const domainChunks = await idbGetAll(db, 'domainChunks');
    const payload: BackupPayloadBody = {
      warehouseMeta: meta,
      domainChunks,
    };
    if (options.includeSnapshots) {
      try {
        payload.snapshots = await idbGetAll(db, 'snapshots');
      } catch {
        payload.snapshots = [];
      }
    }
    if (options.includeReports) {
      try {
        payload.weeklyReports = await idbGetAll(db, 'weeklyReports');
      } catch {
        payload.weeklyReports = [];
      }
    }
    if (options.includeEvents) {
      try {
        payload.healthEvents = await idbGetAll(db, 'healthEvents');
      } catch {
        payload.healthEvents = [];
      }
    }
    if (options.includeBatches) {
      try {
        payload.importBatches = await idbGetAll(db, 'importBatches');
      } catch {
        payload.importBatches = [];
      }
    }

    const base = {
      magic: BACKUP_MAGIC as typeof BACKUP_MAGIC,
      formatVersion: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      app: { name: 'health-analyzer', dataCenter: 'v1.71' },
    };

    const pass =
      options.passphrase != null ? String(options.passphrase) : '';
    if (pass) {
      const cipher = await encryptBackupPayload(payload, pass);
      return { ...base, encryption: 'passphrase-aes-gcm', cipher };
    }
    return { ...base, encryption: 'none', payload };
  } finally {
    db.close();
  }
}

async function applyBackupPayload(
  body: BackupPayloadBody,
  opts?: ImportBackupOptions,
): Promise<{ ok: true; layout: string; chunkCount: number }> {
  if (!body || typeof body !== 'object') {
    throw new Error('missing_payload');
  }
  const chunks = Array.isArray(body.domainChunks) ? body.domainChunks : [];
  const assembled = reassembleFromChunks(
    chunks as Array<{
      id?: string;
      domain?: string;
      shard?: string;
      payload?: unknown;
      approxBytes?: number;
    }>,
  );
  if (!assembled?.data) {
    throw new Error('backup_missing_health_data');
  }

  const db = await openLegacyHistoryDb();
  try {
    const now = new Date().toISOString();
    const toWrite: Array<Record<string, unknown>> = [];
    if (assembled.legacy) {
      const first = chunks[0] as Record<string, unknown> | undefined;
      if (first) {
        toWrite.push({
          ...first,
          id: 'healthData|full',
          domain: 'healthData',
          shard: 'full',
          updatedAt: now,
        });
      }
    } else {
      for (const c of chunks) {
        const row = c as Record<string, unknown> | null;
        if (row && row.id) {
          toWrite.push({ ...row, updatedAt: now });
        }
      }
    }

    const storeNames = ['domainChunks', 'warehouseMeta'];
    if (body.snapshots) storeNames.push('snapshots');
    if (body.weeklyReports) storeNames.push('weeklyReports');
    if (body.healthEvents) storeNames.push('healthEvents');
    if (body.importBatches) storeNames.push('importBatches');
    const unique = storeNames.filter(
      (n, i) =>
        storeNames.indexOf(n) === i && db.objectStoreNames.contains(n),
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(unique, 'readwrite');
      const chunkStore = tx.objectStore('domainChunks');
      chunkStore.clear();
      for (const c of toWrite) chunkStore.put(c);

      const prevMeta = (body.warehouseMeta || {}) as Record<string, unknown>;
      const meta: Record<string, unknown> = {
        ...prevMeta,
        id: IDB_CONTRACT.metaId,
      };
      if (opts?.regrantConsent !== false) {
        const prevConsent = prevMeta.consent as
          | { grantedAt?: string }
          | undefined;
        meta.consent = {
          granted: true,
          grantedAt: prevConsent?.grantedAt || now,
          revokedAt: null,
          policyVersion: IDB_CONTRACT.warehousePolicyVersion,
        };
      }
      meta.totalApproxBytes =
        toWrite.reduce(
          (s, c) => s + (Number(c.approxBytes) || 0),
          0,
        ) || approxJsonBytes(assembled.data);
      meta.totalRecordCount = countHealthRecords(assembled.data);
      meta.dateRange = inferDateRange(assembled.data);
      meta.lastWrittenAt = now;
      meta.layout = assembled.legacy ? 'legacy-full' : WH_LAYOUT_SHARDED;
      meta.cgmMonths = toWrite
        .filter((c) => c.domain === 'cgm')
        .map((c) => String(c.shard || ''))
        .filter(Boolean)
        .sort();
      meta.bpYears = toWrite
        .filter((c) => c.domain === 'bloodPressure')
        .map((c) => String(c.shard || ''))
        .filter(Boolean)
        .sort();
      meta.weightYears = toWrite
        .filter((c) => c.domain === 'weight')
        .map((c) => String(c.shard || ''))
        .filter(Boolean)
        .sort();
      tx.objectStore('warehouseMeta').put(meta);

      const putAll = (store: string, rows: unknown[] | undefined) => {
        if (!rows || !unique.includes(store)) return;
        const s = tx.objectStore(store);
        s.clear();
        for (const row of rows) {
          const r = row as { id?: string } | null;
          if (r && r.id) s.put(row);
        }
      };
      putAll('snapshots', body.snapshots);
      putAll('weeklyReports', body.weeklyReports);
      putAll('healthEvents', body.healthEvents);
      putAll('importBatches', body.importBatches);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      ok: true,
      layout: assembled.legacy ? 'legacy-full' : WH_LAYOUT_SHARDED,
      chunkCount: toWrite.length,
    };
  } finally {
    db.close();
  }
}

/**
 * Import backup envelope into shared IDB (replaces warehouse chunks).
 */
export async function importWarehouseBackup(
  envelope: unknown,
  opts?: ImportBackupOptions,
): Promise<{ ok: true; layout: string; chunkCount: number }> {
  const env = envelope as BackupEnvelope | null;
  if (!env || env.magic !== BACKUP_MAGIC) {
    throw new Error('invalid_backup_magic');
  }
  if (Number(env.formatVersion) !== BACKUP_FORMAT_VERSION) {
    throw new Error('unsupported_backup_version');
  }
  const enc = env.encryption || 'none';
  if (enc === 'none') {
    if (env.encryption !== 'none') throw new Error('missing_payload');
    return applyBackupPayload(env.payload, opts);
  }
  if (enc === 'passphrase-aes-gcm') {
    if (env.encryption !== 'passphrase-aes-gcm') {
      throw new Error('invalid_cipher');
    }
    const body = await decryptBackupCipher(env.cipher, opts?.passphrase);
    return applyBackupPayload(body, opts);
  }
  throw new Error('unsupported_encryption');
}

/** Download helper for UI (browser only). */
export function downloadBackupJson(
  envelope: BackupEnvelope,
  filename?: string,
): void {
  const encTag =
    envelope.encryption === 'passphrase-aes-gcm' ? '-enc' : '';
  const name =
    filename ||
    `health-analyzer-backup${encTag}-${new Date().toISOString().slice(0, 10)}.hae-backup.json`;
  const blob = new Blob([JSON.stringify(envelope, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.click();
  URL.revokeObjectURL(url);
}
