/**
 * Health events timeline — same IndexedDB store as legacy history-db
 * (`healthEvents`). Local only; co-occurrence review, not causal inference.
 */
import {
  createHealthEventId,
  normalizeHealthEvent,
  type HealthEvent,
  type HealthEventKind,
} from '@health-analyzer/lib';
import { openLegacyHistoryDb, IDB_CONTRACT } from './idbContract';

const STORE = 'healthEvents';
const MAX_EVENTS = 500;

export type { HealthEvent, HealthEventKind };

function eventSortKey(e: { date?: string; createdAt?: string }): string {
  return `${e.date ?? ''}\0${e.createdAt ?? ''}`;
}

export async function listLocalHealthEvents(): Promise<HealthEvent[]> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains(STORE)) return [];
    const rows = await new Promise<HealthEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const list = (req.result as HealthEvent[]) || [];
        list.sort((a, b) => eventSortKey(b).localeCompare(eventSortKey(a)));
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
    return rows;
  } finally {
    db.close();
  }
}

export async function saveLocalHealthEvent(
  partial: Partial<HealthEvent> & { kind: HealthEventKind; date: string },
): Promise<HealthEvent> {
  const id = partial.id || createHealthEventId();
  const record = normalizeHealthEvent({
    ...partial,
    id,
    source: partial.source || 'manual',
    createdAt: partial.createdAt || new Date().toISOString(),
  });
  if (!record) throw new Error('invalid_health_event');

  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains(STORE)) {
      throw new Error('healthEvents store missing');
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const all = await new Promise<HealthEvent[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as HealthEvent[]) || []);
      req.onerror = () => reject(req.error);
    });
    if (all.length > MAX_EVENTS) {
      // Keep newest MAX_EVENTS (date/createdAt ascending = oldest first to drop)
      const byOld = [...all].sort((a, b) =>
        eventSortKey(a).localeCompare(eventSortKey(b)),
      );
      const drop = byOld.slice(0, all.length - MAX_EVENTS);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        for (const e of drop) tx.objectStore(STORE).delete(e.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    return record;
  } finally {
    db.close();
  }
}

export async function deleteLocalHealthEvent(id: string): Promise<void> {
  const db = await openLegacyHistoryDb();
  try {
    if (!db.objectStoreNames.contains(STORE)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function eventsDbName(): string {
  return IDB_CONTRACT.name;
}
