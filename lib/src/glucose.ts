/**
 * 血糖单位识别与 mmol/L 规范化
 * Apple Health 常见 unit：mmol/L、mg/dL
 */

export type GlucoseUnitKind = 'mmol/L' | 'mg/dL' | 'unknown';

/** 1 mmol/L ≈ 18.0182 mg/dL（IUPAC） */
export const MGDL_PER_MMOL = 18.0182;

export function classifyGlucoseUnit(unit?: string | null): GlucoseUnitKind {
  if (unit == null || !String(unit).trim()) return 'unknown';
  const u = String(unit).toLowerCase().replace(/\s+/g, '');
  if (
    u.includes('mmol') ||
    u === 'mmoll' ||
    u === 'mmol' ||
    u === 'mm' ||
    u === 'm/m' // rare
  ) {
    return 'mmol/L';
  }
  if (
    (u.includes('mg') && (u.includes('dl') || u.includes('d/l'))) ||
    u === 'mgdl' ||
    u === 'mg/dl'
  ) {
    return 'mg/dL';
  }
  return 'unknown';
}

export function toMmolL(value: number, kind: Exclude<GlucoseUnitKind, 'unknown'>): number {
  if (!Number.isFinite(value)) return value;
  if (kind === 'mg/dL') return value / MGDL_PER_MMOL;
  return value;
}

/**
 * 无 unit 时用数值分布粗推断（启发式，非诊断）。
 * 典型 CGM：mmol/L 中位多在 4–12；mg/dL 中位多在 70–180。
 * 中位 ≥40 → mg/dL；中位 ≤25 → mmol/L；中间带 unknown。
 */
export function inferGlucoseUnitFromValues(values: number[]): GlucoseUnitKind {
  const v = values.filter((x) => Number.isFinite(x));
  if (!v.length) return 'unknown';
  const sorted = [...v].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  if (med >= 40) return 'mg/dL';
  if (med <= 25) return 'mmol/L';
  return 'unknown';
}

export function emptyCgmUnitInfo(): import('./types').CgmUnitInfo {
  return {
    rawUnits: [],
    mmolCount: 0,
    convertedMgDlCount: 0,
    unknownUnitCount: 0,
    inferredFromValues: false,
    reliable: true,
    canonicalUnit: 'mmol/L',
  };
}

export function noteRawUnit(
  info: import('./types').CgmUnitInfo,
  unit?: string | null
): void {
  const u = unit == null ? '' : String(unit).trim();
  const label = u || '(missing)';
  if (!info.rawUnits.includes(label)) info.rawUnits.push(label);
}
