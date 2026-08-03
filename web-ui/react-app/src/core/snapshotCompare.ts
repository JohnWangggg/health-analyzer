/**
 * Load two snapshots and compare numeric metrics (ring-diff).
 */
import { openLegacyHistoryDb } from './idbContract';

export type SnapshotMetrics = Record<string, number | string | null | undefined>;

export type SnapshotDetail = {
  id: string;
  savedAt: string;
  label: string;
  dateRange: { start?: string; end?: string } | null;
  metrics: SnapshotMetrics;
};

export type MetricDelta = {
  key: string;
  a: number | null;
  b: number | null;
  delta: number | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function getSnapshotDetail(
  id: string,
): Promise<SnapshotDetail | null> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains('snapshots')) return null;
    const row = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readonly');
      const req = tx.objectStore('snapshots').get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    if (!row) return null;
    const o = asRecord(row) || {};
    const metricsRaw = asRecord(o.metrics) || {};
    const metrics: SnapshotMetrics = {};
    for (const [k, v] of Object.entries(metricsRaw)) {
      metrics[k] = v as SnapshotMetrics[string];
    }
    const dr = asRecord(o.dateRange);
    return {
      id: String(o.id ?? id),
      savedAt: String(o.savedAt ?? ''),
      label:
        (typeof o.label === 'string' && o.label) ||
        (typeof o.title === 'string' && o.title) ||
        id,
      dateRange: dr
        ? {
            start: typeof dr.start === 'string' ? dr.start : undefined,
            end: typeof dr.end === 'string' ? dr.end : undefined,
          }
        : null,
      metrics,
    };
  } finally {
    db.close();
  }
}

/** Compare metrics of A vs B (B − A for numeric keys present in either). */
export function diffSnapshotMetrics(
  a: SnapshotMetrics,
  b: SnapshotMetrics,
): MetricDelta[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: MetricDelta[] = [];
  for (const key of [...keys].sort()) {
    const na = num(a[key]);
    const nb = num(b[key]);
    if (na == null && nb == null) continue;
    out.push({
      key,
      a: na,
      b: nb,
      delta: na != null && nb != null ? nb - na : null,
    });
  }
  return out;
}
