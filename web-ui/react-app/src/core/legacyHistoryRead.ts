/**
 * Read-only access to legacy history-db stores (same DB contract).
 * Does not write warehouse shards or force schema migration.
 */
import { IDB_CONTRACT, openLegacyHistoryDb } from './idbContract';

export type SnapshotListItem = {
  id: string;
  savedAt: string;
  /** Best-effort range from common snapshot shapes */
  dateRange: { start?: string; end?: string } | null;
  label: string;
};

export type WarehouseMetaView = {
  id: string;
  consentGranted: boolean;
  dateRange: { start?: string; end?: string } | null;
  totalApproxBytes: number | null;
  totalRecordCount: number | null;
  lastImportBatchId: string | null;
  lastWrittenAt: string | null;
  policyVersion: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function pickDateRange(row: Record<string, unknown>): {
  start?: string;
  end?: string;
} | null {
  const dr = asRecord(row.dateRange) || asRecord(asRecord(row.metrics)?.dateRange);
  if (!dr) return null;
  const start = typeof dr.start === 'string' ? dr.start : undefined;
  const end = typeof dr.end === 'string' ? dr.end : undefined;
  if (!start && !end) return null;
  return { start, end };
}

/** List snapshot rows (newest first); metadata only for UI. */
export async function listSnapshotSummaries(
  limit = 20,
): Promise<SnapshotListItem[]> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains('snapshots')) return [];
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').getAll();
      req.onsuccess = () => resolve((req.result as unknown[]) || []);
      req.onerror = () => reject(req.error);
    });
    const items: SnapshotListItem[] = rows
      .map((raw) => {
        const row = asRecord(raw) || {};
        const id = String(row.id ?? '');
        const savedAt = String(row.savedAt ?? '');
        const dateRange = pickDateRange(row);
        const label =
          (typeof row.title === 'string' && row.title) ||
          (typeof row.label === 'string' && row.label) ||
          (dateRange?.end ? `快照 · ${dateRange.end}` : id || '快照');
        return { id, savedAt, dateRange, label };
      })
      .filter((x) => x.id)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .slice(0, limit);
    return items;
  } finally {
    db.close();
  }
}

/** Read primary warehouseMeta row (defaults if missing). */
export async function readWarehouseMetaView(): Promise<WarehouseMetaView> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains('warehouseMeta')) {
      return {
        id: IDB_CONTRACT.metaId,
        consentGranted: false,
        dateRange: null,
        totalApproxBytes: null,
        totalRecordCount: null,
        lastImportBatchId: null,
        lastWrittenAt: null,
        policyVersion: null,
      };
    }
    const row = await new Promise<Record<string, unknown> | null>(
      (resolve, reject) => {
        const tx = db.transaction('warehouseMeta', 'readonly');
        const req = tx.objectStore('warehouseMeta').get(IDB_CONTRACT.metaId);
        req.onsuccess = () =>
          resolve((req.result as Record<string, unknown>) || null);
        req.onerror = () => reject(req.error);
      },
    );
    const consent = asRecord(row?.consent);
    const dr = asRecord(row?.dateRange);
    return {
      id: IDB_CONTRACT.metaId,
      consentGranted: !!(consent && consent.granted),
      dateRange: dr
        ? {
            start: typeof dr.start === 'string' ? dr.start : undefined,
            end: typeof dr.end === 'string' ? dr.end : undefined,
          }
        : null,
      totalApproxBytes:
        typeof row?.totalApproxBytes === 'number' ? row.totalApproxBytes : null,
      totalRecordCount:
        typeof row?.totalRecordCount === 'number' ? row.totalRecordCount : null,
      lastImportBatchId:
        typeof row?.lastImportBatchId === 'string'
          ? row.lastImportBatchId
          : null,
      lastWrittenAt:
        typeof row?.lastWrittenAt === 'string' ? row.lastWrittenAt : null,
      policyVersion:
        typeof asRecord(consent)?.policyVersion === 'string'
          ? String(asRecord(consent)!.policyVersion)
          : IDB_CONTRACT.warehousePolicyVersion,
    };
  } finally {
    db.close();
  }
}
