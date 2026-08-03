/**
 * Wipe local health-related storage (legacy clearAllLocalHealthData parity).
 * Clears IndexedDB health stores + health localStorage keys; keeps theme/locale UI prefs.
 */
import { openLegacyHistoryDb, IDB_CONTRACT } from './idbContract';

/** Health-related localStorage keys (legacy HEALTH_LOCAL_STORAGE_KEYS + React extras). */
export const HEALTH_LOCAL_STORAGE_KEYS = [
  'health-analyzer-user-context-v1',
  'health-analyzer-include-sensitive-ctx',
  'health-analyzer-include-events-ctx',
  'health-analyzer-recovery-weights',
  'health-analyzer-signal-prefs-v1',
  'health-analyzer-cgm-keep-months',
  'health-analyzer-year-keep-years',
  'health-analyzer-warehouse-auto-trim',
  'health-analyzer-llm-copy-ack',
  'health-analyzer-insight-coach',
  'health-analyzer-chart-range',
  'health-analyzer-chart-primary',
  'health-analyzer-chart-compare',
  'health-analyzer-chart-baseline',
  'health-analyzer-chart-events',
  'health-analyzer-chart-presets',
  'health-analyzer-fhir-patient-persistent-id',
  'ha-react-overview-kpi-open',
  'ha-react-overview-domains-open',
  'ha-react-kpi-visibility',
  'ha-react-trend-range-days',
] as const;

const STORES_TO_CLEAR = [
  'snapshots',
  'weeklyReports',
  'healthEvents',
  'importBatches',
  'domainChunks',
  'warehouseMeta',
] as const;

export type ClearLocalHealthResult = {
  clearedKeys: string[];
  clearedStores: string[];
};

export async function clearAllLocalHealthData(): Promise<ClearLocalHealthResult> {
  const clearedKeys: string[] = [];
  for (const key of HEALTH_LOCAL_STORAGE_KEYS) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem(key) != null) {
        localStorage.removeItem(key);
        clearedKeys.push(key);
      }
    } catch {
      /* ignore */
    }
  }
  try {
    sessionStorage.removeItem('health-analyzer-date-filter-start');
    sessionStorage.removeItem('health-analyzer-date-filter-end');
    sessionStorage.removeItem('health-analyzer-dashboard-mode');
  } catch {
    /* ignore */
  }

  const clearedStores: string[] = [];
  const db = await openLegacyHistoryDb();
  try {
    const names = STORES_TO_CLEAR.filter((n) => db.objectStoreNames.contains(n));
    if (names.length) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(names, 'readwrite');
        for (const n of names) {
          tx.objectStore(n).clear();
          clearedStores.push(n);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  } finally {
    db.close();
  }

  return { clearedKeys, clearedStores };
}

export function clearLocalDbName(): string {
  return IDB_CONTRACT.name;
}
