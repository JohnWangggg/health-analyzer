/**
 * Trend workspace presets: primary domain + optional compare + range days.
 * localStorage key shared naming with legacy chart presets intent.
 */
import type { TrendDomain } from './HealthCoreAdapter';

export const CHART_PRESETS_KEY = 'health-analyzer-chart-presets';
export const MAX_CHART_PRESETS = 12;

export type ChartPreset = {
  id: string;
  name: string;
  domain: TrendDomain;
  compareDomain: TrendDomain | '';
  rangeDays: number;
  savedAt: string;
};

function safeGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function loadChartPresets(): ChartPreset[] {
  try {
    const raw = safeGet(CHART_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === 'object' && p.id && p.domain)
      .map((p) => ({
        id: String(p.id),
        name: String(p.name || p.domain),
        domain: p.domain as TrendDomain,
        compareDomain: (p.compareDomain || '') as TrendDomain | '',
        rangeDays: Number.isFinite(Number(p.rangeDays))
          ? Number(p.rangeDays)
          : 30,
        savedAt: String(p.savedAt || ''),
      }));
  } catch {
    return [];
  }
}

export function saveChartPresetsList(list: ChartPreset[]): ChartPreset[] {
  const next = list.slice(0, MAX_CHART_PRESETS);
  safeSet(CHART_PRESETS_KEY, JSON.stringify(next));
  return next;
}

export function addChartPreset(
  preset: Omit<ChartPreset, 'id' | 'savedAt'> & { id?: string },
): ChartPreset[] {
  const list = loadChartPresets();
  const row: ChartPreset = {
    id: preset.id || `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: preset.name.trim() || preset.domain,
    domain: preset.domain,
    compareDomain: preset.compareDomain || '',
    rangeDays: preset.rangeDays,
    savedAt: new Date().toISOString(),
  };
  // replace same name
  const filtered = list.filter((p) => p.name !== row.name);
  return saveChartPresetsList([row, ...filtered]);
}

export function deleteChartPreset(id: string): ChartPreset[] {
  return saveChartPresetsList(loadChartPresets().filter((p) => p.id !== id));
}
