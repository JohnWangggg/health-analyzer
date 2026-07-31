/**
 * Read-only load of legacy domainChunks → HealthData (mirrors history-db reassemble).
 * Does not grant consent, write shards, or change schema.
 */
import { analyzeAll, type FullAnalysis, type HealthData } from '@health-analyzer/lib';
import { openLegacyHistoryDb, IDB_CONTRACT } from './idbContract';
import { readWarehouseMetaView } from './legacyHistoryRead';
import { summarizeAnalysis, type AnalysisSummary } from './HealthCoreAdapter';
import { REACT_CORE_FULL_LAYOUT } from './warehouseSafety';

const WH_CHUNK_HEALTH = 'healthData|full';
const WH_CHUNK_CORE = 'core|full';

type ChunkRow = {
  id?: string;
  domain?: string;
  shard?: string;
  payload?: unknown;
  approxBytes?: number;
  layout?: string;
};

function clonePlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export type ReassembleOptions = {
  /**
   * When true, return core payload only and do not overlay domain shards.
   * Used for react-core-full-v1 and to avoid mixed-state ghost data.
   */
  coreOnly?: boolean;
  /** meta.layout hint from warehouseMeta */
  metaLayout?: string | null;
};

/** Port of history-db.js reassembleFromChunks (read path only). */
export function reassembleFromChunks(
  allChunks: ChunkRow[],
  options?: ReassembleOptions,
): { data: HealthData; legacy: boolean; layout: string } | null {
  if (!allChunks?.length) return null;

  const legacy = allChunks.find(
    (c) => c && c.id === WH_CHUNK_HEALTH && c.payload,
  );
  if (legacy) {
    return {
      data: clonePlain(legacy.payload) as HealthData,
      legacy: true,
      layout: 'legacy-full',
    };
  }

  const core = allChunks.find(
    (c) => c && (c.id === WH_CHUNK_CORE || c.domain === 'core'),
  );
  if (!core || !core.payload) return null;
  const data = clonePlain(core.payload) as HealthData;

  const coreOnly =
    options?.coreOnly === true ||
    options?.metaLayout === REACT_CORE_FULL_LAYOUT ||
    core.layout === REACT_CORE_FULL_LAYOUT;

  if (coreOnly) {
    return {
      data,
      legacy: false,
      layout: options?.metaLayout || core.layout || REACT_CORE_FULL_LAYOUT,
    };
  }

  const byDomain = (domain: string) =>
    allChunks
      .filter((c) => c && c.domain === domain && c.payload != null)
      .sort((a, b) =>
        String(a.shard || '').localeCompare(String(b.shard || '')),
      );

  const cgmChunks = byDomain('cgm').filter((c) => Array.isArray(c.payload));
  if (cgmChunks.length) {
    data.cgm = [];
    cgmChunks.forEach((c) => {
      data.cgm = data.cgm.concat(c.payload as never[]);
    });
  } else if (!Array.isArray(data.cgm)) data.cgm = [];

  const bpChunks = byDomain('bloodPressure').filter((c) =>
    Array.isArray(c.payload),
  );
  if (bpChunks.length) {
    data.bloodPressure = [];
    bpChunks.forEach((c) => {
      data.bloodPressure = data.bloodPressure.concat(c.payload as never[]);
    });
  } else if (!Array.isArray(data.bloodPressure)) data.bloodPressure = [];

  const weightChunks = byDomain('weight');
  if (weightChunks.length) {
    data.weight = [];
    data.bodyFat = [];
    weightChunks.forEach((c) => {
      const p = c.payload;
      if (Array.isArray(p)) data.weight = data.weight.concat(p as never[]);
      else if (p && typeof p === 'object') {
        const o = p as { weight?: unknown[]; bodyFat?: unknown[] };
        if (Array.isArray(o.weight))
          data.weight = data.weight.concat(o.weight as never[]);
        if (Array.isArray(o.bodyFat))
          data.bodyFat = data.bodyFat.concat(o.bodyFat as never[]);
      }
    });
  } else {
    if (!Array.isArray(data.weight)) data.weight = [];
    if (!Array.isArray(data.bodyFat)) data.bodyFat = [];
  }

  const mergeMap = (domain: string, field: keyof HealthData) => {
    const chunks = byDomain(domain).filter(
      (c) => c.payload && typeof c.payload === 'object' && !Array.isArray(c.payload),
    );
    if (chunks.length) {
      const map: Record<string, unknown> = {};
      chunks.forEach((c) => Object.assign(map, c.payload as object));
      (data as unknown as Record<string, unknown>)[field as string] = map;
    } else {
      const cur = (data as unknown as Record<string, unknown>)[field as string];
      if (!cur || typeof cur !== 'object' || Array.isArray(cur)) {
        (data as unknown as Record<string, unknown>)[field as string] = {};
      }
    }
  };

  mergeMap('sleep', 'sleep');
  mergeMap('steps', 'steps');
  mergeMap('restingHr', 'restingHr');
  mergeMap('walkingHr', 'walkingHr');
  mergeMap('watchDaily', 'watchDaily');

  const hrvChunks = byDomain('hrv');
  if (hrvChunks.length) {
    data.hrv = {};
    data.hrvOvernight = {};
    hrvChunks.forEach((c) => {
      const p = c.payload as Record<string, unknown> | null;
      if (!p || typeof p !== 'object' || Array.isArray(p)) return;
      if (p.hrv && typeof p.hrv === 'object')
        Object.assign(data.hrv, p.hrv as object);
      if (p.hrvOvernight && typeof p.hrvOvernight === 'object')
        Object.assign(data.hrvOvernight, p.hrvOvernight as object);
      if (!p.hrv && !p.hrvOvernight) Object.assign(data.hrv, p);
    });
  } else {
    if (!data.hrv || typeof data.hrv !== 'object') data.hrv = {};
    if (!data.hrvOvernight || typeof data.hrvOvernight !== 'object')
      data.hrvOvernight = {};
  }

  const arrDomain = (domain: string, field: 'workouts' | 'ecg') => {
    const chunks = byDomain(domain).filter((c) => Array.isArray(c.payload));
    if (chunks.length) {
      (data as unknown as Record<string, unknown[]>)[field] = [];
      chunks.forEach((c) => {
        (data as unknown as Record<string, unknown[]>)[field] = (
          data as unknown as Record<string, unknown[]>
        )[field].concat(c.payload as unknown[]);
      });
    } else if (!Array.isArray((data as unknown as Record<string, unknown>)[field])) {
      (data as unknown as Record<string, unknown>)[field] = [];
    }
  };
  arrDomain('workouts', 'workouts');
  arrDomain('ecg', 'ecg');

  return { data, legacy: false, layout: 'sharded-v1' };
}

export type WarehouseLoadResult = {
  data: HealthData;
  analysis: FullAnalysis;
  summary: AnalysisSummary;
  layout: string;
  consentGranted: boolean;
  chunkCount: number;
};

/**
 * Load warehouse if consent granted; analyze via lib analyzeAll.
 * Returns null when no consent or empty warehouse.
 */
export async function loadAndAnalyzeWarehouse(options?: {
  locale?: string | null;
}): Promise<WarehouseLoadResult | null> {
  const meta = await readWarehouseMetaView();
  if (!meta.consentGranted) {
    return null;
  }

  const db = await openLegacyHistoryDb();
  let chunks: ChunkRow[] = [];
  try {
    if (!db.objectStoreNames.contains('domainChunks')) {
      return null;
    }
    chunks = await new Promise((resolve, reject) => {
      const tx = db.transaction('domainChunks', 'readonly');
      const req = tx.objectStore('domainChunks').getAll();
      req.onsuccess = () => resolve((req.result as ChunkRow[]) || []);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }

  // Prefer meta.layout; also core-only if only core chunk exists (no domain shards)
  const domainShardCount = chunks.filter(
    (c) => c.domain && c.domain !== 'core' && c.id !== WH_CHUNK_CORE,
  ).length;
  const assembled = reassembleFromChunks(chunks, {
    metaLayout: meta.layout,
    coreOnly:
      meta.layout === REACT_CORE_FULL_LAYOUT ||
      // pure core-only warehouse (no domain shards) — use core as-is
      (domainShardCount === 0 && !!chunks.find((c) => c.id === WH_CHUNK_CORE)),
  });
  if (!assembled?.data) return null;

  const analysis = analyzeAll(assembled.data, {
    locale: options?.locale ?? null,
  });
  return {
    data: assembled.data,
    analysis,
    summary: summarizeAnalysis(analysis),
    layout: assembled.layout,
    consentGranted: true,
    chunkCount: chunks.length,
  };
}

/** Write-compatible: ensure we only open contract DB name (for tests). */
export function warehouseContractName(): string {
  return IDB_CONTRACT.name;
}
