/**
 * Dual-track warehouse persist.
 *
 * Primary: persistHealthDataSharded — legacy-compatible sharded-v1
 *   (clear domainChunks + put full chunk set from splitHealthDataShards).
 * Experimental: persistHealthDataSimple — core|full only; requires force.
 *
 * After soft-quota eviction, optional keep-N auto-trim (prefs) or forceKeepWindows.
 */
import type { HealthData } from '@health-analyzer/lib';
import { IDB_CONTRACT, openLegacyHistoryDb } from './idbContract';
import { loadAndAnalyzeWarehouse } from './warehouseLoad';
import {
  getCgmKeepMonths,
  getYearKeepYears,
  isWarehouseAutoTrimEnabled,
} from './warehouseKeepPrefs';
import {
  applyKeepWindowsToSplit,
  type KeepWindowsMeta,
} from './warehouseKeepWindows';
import {
  REACT_CORE_FULL_LAYOUT,
  warehouseCoreOnlyWriteBlockedReason,
} from './warehouseSafety';
import {
  WH_HARD_BYTES,
  WH_LAYOUT_SHARDED,
  WH_SOFT_BYTES,
  applySoftQuotaEviction,
  approxJsonBytes,
  buildDomainChunkRows,
  countHealthRecords,
  inferDateRange,
  reassembleFromSplit,
  splitHealthDataShards,
} from './warehouseShards';

const WH_CHUNK_CORE = 'core|full';
const WAREHOUSE_POLICY = IDB_CONTRACT.warehousePolicyVersion;

export type PersistWarehouseResult =
  | {
      ok: true;
      approxBytes: number;
      recordCount: number;
      dateRange: { start: string; end: string } | null;
      layout: string;
      chunkCount: number;
      softWarn?: boolean;
      trimmed?: boolean;
      removedCgm?: number;
      removedMonths?: number;
      removedBp?: number;
      removedWeight?: number;
      removedSleep?: number;
      removedSteps?: number;
      removedHrv?: number;
      removedWorkouts?: number;
      removedYears?: number;
      /** Keep-N window trim applied on this write */
      keepTrimmed?: boolean;
      droppedMonthCount?: number;
      droppedYearCount?: number;
      droppedMonths?: string[];
      droppedYearsByDomain?: Record<string, string[]>;
    }
  | { ok: false; reason: string };

export type PersistShardedOptions = {
  grantIfNeeded?: boolean;
  batchId?: string | null;
  /**
   * When true, apply keep-N windows after soft quota even if auto-trim pref is off.
   * Used by applyKeepWindowsToStoredWarehouse.
   */
  forceKeepWindows?: boolean;
};

function countDroppedYears(meta: KeepWindowsMeta | null): number {
  if (!meta) return 0;
  return Object.values(meta.droppedYearsByDomain).reduce(
    (n, ys) => n + ys.length,
    0,
  );
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
 * Legacy-compatible full warehouse write (sharded-v1).
 * Clears domainChunks then writes complete chunk set — no mixed-state with old shards.
 */
export async function persistHealthDataSharded(
  healthData: HealthData,
  opts?: PersistShardedOptions,
): Promise<PersistWarehouseResult> {
  if (!healthData || typeof healthData !== 'object') {
    return { ok: false, reason: 'no_data' };
  }

  if (opts?.grantIfNeeded !== false) {
    await grantWarehouseConsent();
  }

  let split;
  try {
    split = splitHealthDataShards(healthData);
  } catch (e) {
    return {
      ok: false,
      reason: `clone_failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Soft quota: drop oldest domain shards (legacy chain)
  const evict = applySoftQuotaEviction(split);

  // Keep-N: opt-in auto-trim after persist, or forceKeepWindows (manual apply)
  let keepMeta: KeepWindowsMeta | null = null;
  if (opts?.forceKeepWindows || isWarehouseAutoTrimEnabled()) {
    keepMeta = applyKeepWindowsToSplit(split, {
      keepMonths: getCgmKeepMonths(),
      keepYears: getYearKeepYears(),
    });
  }

  if (split.totalBytes > WH_HARD_BYTES) {
    return { ok: false, reason: 'quota_hard' };
  }

  const payload = reassembleFromSplit(split);
  const recordCount = countHealthRecords(payload);
  const dateRange = inferDateRange(payload);
  const now = new Date().toISOString();
  const rows = buildDomainChunkRows(split, {
    batchId: opts?.batchId ?? null,
    now,
  });

  const db = await openLegacyHistoryDb();
  try {
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

    const meta = {
      ...(metaRow || {}),
      id: IDB_CONTRACT.metaId,
      consent,
      dateRange,
      totalApproxBytes: split.totalBytes,
      totalRecordCount: recordCount,
      lastWrittenAt: now,
      lastImportBatchId: opts?.batchId ?? metaRow?.lastImportBatchId ?? null,
      layout: WH_LAYOUT_SHARDED,
      codec: 'json',
      cgmMonths: split.months.map((m) => m.month),
      bpYears: split.bpYears.map((y) => y.year),
      weightYears: split.weightYears.map((y) => y.year),
      sleepYears: split.sleepYears.map((y) => y.year),
      stepsYears: split.stepsYears.map((y) => y.year),
      hrvYears: split.hrvYears.map((y) => y.year),
      restingHrYears: split.restingHrYears.map((y) => y.year),
      walkingHrYears: split.walkingHrYears.map((y) => y.year),
      workoutsYears: split.workoutsYears.map((y) => y.year),
      ecgYears: split.ecgYears.map((y) => y.year),
      watchDailyYears: split.watchDailyYears.map((y) => y.year),
      notes: (() => {
        const notes: string[] = [];
        if (evict.removedMonths) notes.push('cgm_months_evicted_for_quota');
        if (evict.removedBp || evict.removedWeight)
          notes.push('bp_weight_years_evicted_for_quota');
        if (evict.removedSleep || evict.removedSteps)
          notes.push('sleep_steps_years_evicted_for_quota');
        if (
          evict.removedHrv ||
          evict.removedRestingHr ||
          evict.removedWalkingHr
        )
          notes.push('hrv_hr_years_evicted_for_quota');
        if (
          evict.removedWorkouts ||
          evict.removedEcg ||
          evict.removedWatchDaily
        )
          notes.push('workouts_ecg_watch_years_evicted_for_quota');
        if (keepMeta?.trimmed) notes.push('keep_windows_trimmed');
        if (!notes.length && split.totalBytes > WH_SOFT_BYTES)
          notes.push('soft_quota_exceeded');
        return notes;
      })(),
    };

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['domainChunks', 'warehouseMeta'],
        'readwrite',
      );
      const store = tx.objectStore('domainChunks');
      // Same as history-db: clear then write full set (no orphan domain shards)
      store.clear();
      for (const row of rows) store.put(row);
      tx.objectStore('warehouseMeta').put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const droppedYearCount = countDroppedYears(keepMeta);

    return {
      ok: true,
      approxBytes: split.totalBytes,
      recordCount,
      dateRange,
      layout: WH_LAYOUT_SHARDED,
      chunkCount: rows.length,
      softWarn: split.totalBytes > WH_SOFT_BYTES,
      trimmed: evict.trimmed,
      removedCgm: evict.removedCgm,
      removedMonths: evict.removedMonths,
      removedBp: evict.removedBp,
      removedWeight: evict.removedWeight,
      removedSleep: evict.removedSleep,
      removedSteps: evict.removedSteps,
      removedHrv: evict.removedHrv,
      removedWorkouts: evict.removedWorkouts,
      removedYears: evict.removedYears,
      keepTrimmed: keepMeta?.trimmed ?? false,
      droppedMonthCount: keepMeta?.droppedMonths.length ?? 0,
      droppedYearCount,
      droppedMonths: keepMeta?.droppedMonths,
      droppedYearsByDomain: keepMeta?.droppedYearsByDomain,
    };
  } finally {
    db.close();
  }
}

/**
 * Load assembled warehouse, apply keep-N windows (always; not only when auto-trim on),
 * rewrite sharded-v1. Soft quota still runs first inside persist.
 */
export async function applyKeepWindowsToStoredWarehouse(): Promise<
  PersistWarehouseResult | { ok: false; reason: 'empty' }
> {
  const loaded = await loadAndAnalyzeWarehouse();
  if (!loaded?.data) {
    return { ok: false, reason: 'empty' };
  }
  return persistHealthDataSharded(loaded.data, {
    grantIfNeeded: true,
    forceKeepWindows: true,
  });
}

/**
 * @deprecated core|full-only — blocked without force (P0 mix risk with domain shards)
 */
export async function persistHealthDataSimple(
  healthData: HealthData,
  opts?: { grantIfNeeded?: boolean; force?: boolean },
): Promise<PersistWarehouseResult> {
  if (!opts?.force) {
    return { ok: false, reason: warehouseCoreOnlyWriteBlockedReason() };
  }
  if (!healthData || typeof healthData !== 'object') {
    return { ok: false, reason: 'no_data' };
  }

  const bytes = approxJsonBytes(healthData);
  if (bytes > WH_HARD_BYTES) {
    return { ok: false, reason: 'quota_hard' };
  }

  if (opts?.grantIfNeeded !== false) {
    await grantWarehouseConsent();
  }

  const db = await openLegacyHistoryDb();
  try {
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
    const recordCount = countHealthRecords(healthData);
    const payload = JSON.parse(JSON.stringify(healthData)) as HealthData;

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['domainChunks', 'warehouseMeta'],
        'readwrite',
      );
      // force path still clears orphans to avoid mix if someone enables it
      tx.objectStore('domainChunks').clear();
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
        notes: [REACT_CORE_FULL_LAYOUT, 'experimental_force_only'],
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      ok: true,
      approxBytes: bytes,
      recordCount,
      dateRange,
      layout: REACT_CORE_FULL_LAYOUT,
      chunkCount: 1,
    };
  } finally {
    db.close();
  }
}
