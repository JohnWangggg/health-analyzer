/**
 * Dual-track warehouse write (simplified layout) — **gated off by default**.
 *
 * P0: Writing only `core|full` while legacy domain shards remain causes
 * load path to prefer shards over core fields. Product UI must not call
 * this until a shared full-shard writer exists (see warehouseSafety.ts).
 *
 * Unit tests may pass `{ force: true }` to exercise the serializer path.
 */
import type { HealthData } from '@health-analyzer/lib';
import { IDB_CONTRACT, openLegacyHistoryDb } from './idbContract';
import {
  REACT_CORE_FULL_LAYOUT,
  WAREHOUSE_SHARED_WRITE_ENABLED,
  warehouseWriteBlockedReason,
} from './warehouseSafety';

const WH_CHUNK_CORE = 'core|full';
const WAREHOUSE_POLICY = IDB_CONTRACT.warehousePolicyVersion;


export type PersistWarehouseResult =
  | {
      ok: true;
      approxBytes: number;
      recordCount: number;
      dateRange: { start: string; end: string } | null;
    }
  | { ok: false; reason: string };

function approxBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return 0;
  }
}

function countRecords(data: HealthData): number {
  let n = 0;
  n += data.cgm?.length || 0;
  n += data.bloodPressure?.length || 0;
  n += data.weight?.length || 0;
  n += data.bodyFat?.length || 0;
  n += data.workouts?.length || 0;
  n += data.ecg?.length || 0;
  n += Object.keys(data.steps || {}).length;
  n += Object.keys(data.sleep || {}).length;
  n += Object.keys(data.hrv || {}).length;
  n += Object.keys(data.restingHr || {}).length;
  n += Object.keys(data.watchDaily || {}).length;
  return n;
}

function inferDateRange(
  data: HealthData,
): { start: string; end: string } | null {
  const dates: string[] = [];
  const push = (d?: string) => {
    if (d && /^\d{4}-\d{2}-\d{2}/.test(d)) dates.push(d.slice(0, 10));
  };
  for (const p of data.cgm || []) push((p as { datetime?: string }).datetime);
  for (const p of data.weight || []) push((p as { date?: string }).date);
  for (const p of data.bloodPressure || [])
    push((p as { date?: string }).date);
  for (const d of Object.keys(data.steps || {})) push(d);
  for (const d of Object.keys(data.sleep || {})) push(d);
  for (const d of Object.keys(data.hrv || {})) push(d);
  for (const d of Object.keys(data.restingHr || {})) push(d);
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0]!, end: dates[dates.length - 1]! };
}

/** Grant warehouse consent (idempotent). */
export async function grantWarehouseConsent(): Promise<void> {
  const db = await openLegacyHistoryDb();
  try {
    const now = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('warehouseMeta', 'readwrite');
      const store = tx.objectStore('warehouseMeta');
      const getReq = store.get(IDB_CONTRACT.metaId);
      getReq.onsuccess = () => {
        const prev = (getReq.result as Record<string, unknown>) || {
          id: IDB_CONTRACT.metaId,
        };
        const consent = {
          granted: true,
          grantedAt:
            (prev.consent as { grantedAt?: string } | undefined)?.grantedAt ||
            now,
          revokedAt: null,
          policyVersion: WAREHOUSE_POLICY,
        };
        store.put({
          ...prev,
          id: IDB_CONTRACT.metaId,
          consent,
        });
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Persist HealthData as core|full after ensuring consent.
 * Soft cap warn only — hard reject above 200MB JSON approx.
 *
 * @param opts.force — test-only / experimental bypass of product gate
 */
export async function persistHealthDataSimple(
  healthData: HealthData,
  opts?: { grantIfNeeded?: boolean; force?: boolean },
): Promise<PersistWarehouseResult> {
  if (!WAREHOUSE_SHARED_WRITE_ENABLED && !opts?.force) {
    return { ok: false, reason: warehouseWriteBlockedReason() };
  }
  if (!healthData || typeof healthData !== 'object') {
    return { ok: false, reason: 'no_data' };
  }

  const bytes = approxBytes(healthData);
  const HARD = 200 * 1024 * 1024;
  if (bytes > HARD) {
    return { ok: false, reason: 'quota_hard' };
  }

  if (opts?.grantIfNeeded !== false) {
    await grantWarehouseConsent();
  }

  const db = await openLegacyHistoryDb();
  try {
    // verify consent
    const metaRow = await new Promise<Record<string, unknown> | null>(
      (resolve, reject) => {
        const tx = db.transaction('warehouseMeta', 'readonly');
        const req = tx.objectStore('warehouseMeta').get(IDB_CONTRACT.metaId);
        req.onsuccess = () =>
          resolve((req.result as Record<string, unknown>) || null);
        req.onerror = () => reject(req.error);
      },
    );
    const consent = metaRow?.consent as { granted?: boolean } | undefined;
    if (!consent?.granted) {
      return { ok: false, reason: 'no_consent' };
    }

    const now = new Date().toISOString();
    const dateRange = inferDateRange(healthData);
    const recordCount = countRecords(healthData);
    const payload = JSON.parse(JSON.stringify(healthData)) as HealthData;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['domainChunks', 'warehouseMeta'],
        'readwrite',
      );
      tx.objectStore('domainChunks').put({
        id: WH_CHUNK_CORE,
        domain: 'core',
        shard: 'full',
        dateStart: dateRange?.start ?? null,
        dateEnd: dateRange?.end ?? null,
        payload,
        approxBytes: bytes,
        recordCount,
        updatedAt: now,
        codec: 'json',
        layout: REACT_CORE_FULL_LAYOUT,
      });
      tx.objectStore('warehouseMeta').put({
        ...(metaRow || {}),
        id: IDB_CONTRACT.metaId,
        consent,
        dateRange,
        totalApproxBytes: bytes,
        totalRecordCount: recordCount,
        lastWrittenAt: now,
        layout: REACT_CORE_FULL_LAYOUT,
        notes: [
          ...(((metaRow?.notes as string[]) || []).filter(
            (n) => n !== REACT_CORE_FULL_LAYOUT,
          ) || []),
          REACT_CORE_FULL_LAYOUT,
          'experimental_force_only',
        ],
      });

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return { ok: true, approxBytes: bytes, recordCount, dateRange };
  } finally {
    db.close();
  }
}
