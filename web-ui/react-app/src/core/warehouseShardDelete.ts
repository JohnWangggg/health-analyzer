/**
 * List / delete domain shards in shared warehouse (legacy-compatible ids).
 * CGM months: cgm|YYYY-MM · year domains: bloodPressure|YYYY etc.
 */
import { IDB_CONTRACT, openLegacyHistoryDb } from './idbContract';
import { reassembleFromChunks } from './warehouseLoad';
import {
  WH_LAYOUT_SHARDED,
  approxJsonBytes,
  countHealthRecords,
  inferDateRange,
} from './warehouseShards';

export const YEAR_DOMAINS = [
  'bloodPressure',
  'weight',
  'sleep',
  'steps',
  'hrv',
  'restingHr',
  'walkingHr',
  'workouts',
  'ecg',
  'watchDaily',
] as const;

export type YearDomain = (typeof YEAR_DOMAINS)[number];

export type ShardListItem = {
  id: string;
  domain: string;
  shard: string;
  approxBytes: number;
  recordCount: number;
};

export type DomainShardGroup = {
  domain: string;
  kind: 'cgm-month' | 'year' | 'other';
  items: ShardListItem[];
};

export type DeleteShardsResult =
  | {
      ok: true;
      deleted: string[];
      remainingCount: number;
    }
  | { ok: false; reason: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function normalizeMonths(months: string | string[]): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const raw of Array.isArray(months) ? months : [months]) {
    const m = String(raw || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(m) && !seen[m]) {
      seen[m] = true;
      out.push(m);
    }
  }
  return out;
}

function normalizeYears(years: string | string[]): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const raw of Array.isArray(years) ? years : [years]) {
    const y = String(raw || '').slice(0, 4);
    if (/^\d{4}$/.test(y) && !seen[y]) {
      seen[y] = true;
      out.push(y);
    }
  }
  return out;
}

function isYearDomain(d: string): d is YearDomain {
  return (YEAR_DOMAINS as readonly string[]).includes(d);
}

function fillShardYearLists(
  meta: Record<string, unknown>,
  remaining: Array<Record<string, unknown>>,
): void {
  const shards = (domain: string) =>
    remaining
      .filter((c) => c && c.domain === domain)
      .map((c) => String(c.shard || ''))
      .filter(Boolean)
      .sort();
  meta.cgmMonths = shards('cgm');
  meta.bpYears = shards('bloodPressure');
  meta.weightYears = shards('weight');
  meta.sleepYears = shards('sleep');
  meta.stepsYears = shards('steps');
  meta.hrvYears = shards('hrv');
  meta.restingHrYears = shards('restingHr');
  meta.walkingHrYears = shards('walkingHr');
  meta.workoutsYears = shards('workouts');
  meta.ecgYears = shards('ecg');
  meta.watchDailyYears = shards('watchDaily');
}

function recomputeMetaAfterDeletes(
  prevMeta: Record<string, unknown>,
  remaining: Array<Record<string, unknown>>,
  note: string,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const next: Record<string, unknown> = {
    ...prevMeta,
    id: IDB_CONTRACT.metaId,
  };
  const assembled = reassembleFromChunks(
    remaining as Array<{
      id?: string;
      domain?: string;
      shard?: string;
      payload?: unknown;
      approxBytes?: number;
    }>,
  );
  if (assembled?.data) {
    next.totalApproxBytes = remaining.reduce(
      (s, c) => s + (Number(c.approxBytes) || 0),
      0,
    );
    next.totalRecordCount = countHealthRecords(assembled.data);
    next.dateRange = inferDateRange(assembled.data);
    next.layout = assembled.legacy ? 'legacy-full' : WH_LAYOUT_SHARDED;
    fillShardYearLists(next, remaining);
  } else {
    next.totalApproxBytes = remaining.reduce(
      (s, c) => s + (Number(c.approxBytes) || 0),
      0,
    );
    next.totalRecordCount = 0;
    next.dateRange = null;
    fillShardYearLists(next, remaining);
  }
  next.lastWrittenAt = now;
  next.notes = note ? [note] : [];
  return next;
}

/** List non-core domain shards grouped for UI. */
export async function listDomainShardGroups(): Promise<DomainShardGroup[]> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains('domainChunks')) return [];
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction('domainChunks', 'readonly');
      const req = tx.objectStore('domainChunks').getAll();
      req.onsuccess = () => resolve((req.result as unknown[]) || []);
      req.onerror = () => reject(req.error);
    });
    const byDomain = new Map<string, ShardListItem[]>();
    for (const raw of rows) {
      const c = asRecord(raw);
      if (!c || !c.id) continue;
      const domain = String(c.domain || '');
      if (!domain || domain === 'core') continue;
      const item: ShardListItem = {
        id: String(c.id),
        domain,
        shard: String(c.shard || ''),
        approxBytes: Number(c.approxBytes) || approxJsonBytes(c.payload),
        recordCount: Number(c.recordCount) || 0,
      };
      const list = byDomain.get(domain) || [];
      list.push(item);
      byDomain.set(domain, list);
    }
    const groups: DomainShardGroup[] = [];
    for (const [domain, items] of byDomain) {
      items.sort((a, b) => a.shard.localeCompare(b.shard));
      const kind: DomainShardGroup['kind'] =
        domain === 'cgm'
          ? 'cgm-month'
          : isYearDomain(domain)
            ? 'year'
            : 'other';
      groups.push({ domain, kind, items });
    }
    groups.sort((a, b) => a.domain.localeCompare(b.domain));
    return groups;
  } finally {
    db.close();
  }
}

async function deleteChunkIds(
  idSet: Record<string, string>,
  note: string,
): Promise<DeleteShardsResult> {
  const ids = Object.keys(idSet);
  if (!ids.length) return { ok: false, reason: 'empty' };

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
    const consent = asRecord(metaRow?.consent);
    if (!consent?.granted) {
      return { ok: false, reason: 'no_consent' };
    }

    // Phase 1: delete
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('domainChunks', 'readwrite');
      const store = tx.objectStore('domainChunks');
      for (const id of ids) store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // Phase 2: recompute meta from remaining
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(
        ['domainChunks', 'warehouseMeta'],
        'readwrite',
      );
      const allReq = tx.objectStore('domainChunks').getAll();
      allReq.onsuccess = () => {
        const remaining = ((allReq.result as unknown[]) || [])
          .map((r) => asRecord(r))
          .filter((c): c is Record<string, unknown> => !!c && !!c.id)
          .filter((c) => !idSet[String(c.id)]);
        const next = recomputeMetaAfterDeletes(
          metaRow || { id: IDB_CONTRACT.metaId },
          remaining,
          note,
        );
        tx.objectStore('warehouseMeta').put(next);
      };
      allReq.onerror = () => reject(allReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    return {
      ok: true,
      deleted: Object.values(idSet),
      remainingCount: -1,
    };
  } finally {
    db.close();
  }
}

/** Delete CGM month shards (ids cgm|YYYY-MM). */
export async function deleteCgmMonthShards(
  months: string | string[],
): Promise<DeleteShardsResult> {
  const list = normalizeMonths(months);
  if (!list.length) return { ok: false, reason: 'invalid_month' };
  const idSet: Record<string, string> = {};
  for (const m of list) idSet[`cgm|${m}`] = m;
  const note =
    list.length === 1
      ? `cgm_month_deleted:${list[0]}`
      : `cgm_months_deleted:${list.join(',')}`;
  return deleteChunkIds(idSet, note);
}

/** Delete yearly shards for a domain (ids domain|YYYY). */
export async function deleteDomainYearShards(
  domain: string,
  years: string | string[],
): Promise<DeleteShardsResult> {
  const dom = String(domain || '');
  if (!isYearDomain(dom)) return { ok: false, reason: 'invalid_domain' };
  const list = normalizeYears(years);
  if (!list.length) return { ok: false, reason: 'invalid_year' };
  const idSet: Record<string, string> = {};
  for (const y of list) idSet[`${dom}|${y}`] = y;
  const note =
    list.length === 1
      ? `${dom}_year_deleted:${list[0]}`
      : `${dom}_years_deleted:${list.join(',')}`;
  return deleteChunkIds(idSet, note);
}

/**
 * Delete by full chunk ids (e.g. from multi-select UI).
 * Only allows cgm|* and known year-domain|* patterns.
 */
export async function deleteShardIds(
  chunkIds: string[],
): Promise<DeleteShardsResult> {
  const idSet: Record<string, string> = {};
  for (const raw of chunkIds) {
    const id = String(raw || '');
    const mCgm = id.match(/^cgm\|(\d{4}-\d{2})$/);
    if (mCgm) {
      idSet[id] = mCgm[1]!;
      continue;
    }
    const mYear = id.match(/^([a-zA-Z]+)\|(\d{4})$/);
    if (mYear && isYearDomain(mYear[1]!)) {
      idSet[id] = mYear[2]!;
      continue;
    }
  }
  if (!Object.keys(idSet).length) {
    return { ok: false, reason: 'invalid_ids' };
  }
  const note = `shards_deleted:${Object.keys(idSet).join(',')}`;
  return deleteChunkIds(idSet, note);
}
