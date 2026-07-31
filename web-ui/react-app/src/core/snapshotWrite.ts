/**
 * Save compact analysis snapshot into legacy `snapshots` store.
 * Uses lib buildAnalysisSnapshot — no custom metrics.
 */
import {
  buildAnalysisSnapshot,
  type FullAnalysis,
} from '@health-analyzer/lib';
import { openLegacyHistoryDb, IDB_CONTRACT } from './idbContract';

const MAX_SNAPSHOTS = 30;

export type SavedSnapshotRef = {
  id: string;
  savedAt: string;
  label?: string;
  dateRange: { start: string; end: string };
};

export async function saveAnalysisSnapshot(
  analysis: FullAnalysis,
  options?: { label?: string },
): Promise<SavedSnapshotRef> {
  const snap = buildAnalysisSnapshot(analysis, {
    label: options?.label,
  });

  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains('snapshots')) {
      throw new Error('snapshots store missing');
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put(snap);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    // keep-N like history-db (by savedAt oldest first)
    const all = await new Promise<Array<{ id: string; savedAt: string }>>(
      (resolve, reject) => {
        const tx = db.transaction('snapshots', 'readonly');
        const req = tx.objectStore('snapshots').getAll();
        req.onsuccess = () =>
          resolve((req.result as Array<{ id: string; savedAt: string }>) || []);
        req.onerror = () => reject(req.error);
      },
    );
    if (all.length > MAX_SNAPSHOTS) {
      const extra = [...all]
        .sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)))
        .slice(0, all.length - MAX_SNAPSHOTS);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        for (const s of extra) tx.objectStore('snapshots').delete(s.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    return {
      id: snap.id,
      savedAt: snap.savedAt,
      label: snap.label,
      dateRange: { ...snap.dateRange },
    };
  } finally {
    db.close();
  }
}

export function snapshotDbName(): string {
  return IDB_CONTRACT.name;
}
