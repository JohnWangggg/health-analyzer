/**
 * Local ZIP → export.xml extraction using npm `fflate` (no CDN).
 * Mirrors lib extractXmlFromZip selection rules without rewriting stats.
 */
import { unzipSync } from 'fflate';
import { parseHealthXml, parseEcgCsv, analyzeAll } from '@health-analyzer/lib';
import { summarizeAnalysis, type ParseAnalyzeResult } from './HealthCoreAdapter';

function decodeZipEntryName(name: string): string {
  const key = String(name || '');
  const bytes = new Uint8Array(key.length);
  for (let i = 0; i < key.length; i++) bytes[i] = key.charCodeAt(i) & 0xff;
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (decoded.includes('\ufffd')) return key;
    return decoded;
  } catch {
    return key;
  }
}

function isHealthExportXmlName(name: string): boolean {
  const base = (String(name).split('/').pop() || String(name)).trim();
  if (/export_cda\.xml$/i.test(base)) return false;
  if (/^export\.xml$/i.test(base)) return true;
  if (/导出\.xml$/i.test(base) || /匯出\.xml$/i.test(base)) return true;
  return false;
}

export type ZipExtractResult = {
  xmlText: string;
  xmlFileName: string;
  ecgCount: number;
};

/** Unzip bytes and pick Apple Health export.xml (or 导出.xml). */
export function extractHealthXmlFromZipBytes(u8: Uint8Array): ZipExtractResult {
  const unzipped = unzipSync(u8);
  const decoded: Record<string, Uint8Array> = {};
  for (const key of Object.keys(unzipped)) {
    const name = decodeZipEntryName(key);
    decoded[name] = unzipped[key]!;
  }

  const xmlKeys = Object.keys(decoded).filter((k) => /\.xml$/i.test(k));
  const xmlFile =
    xmlKeys.find(
      (k) => isHealthExportXmlName(k) && !/export_cda\.xml$/i.test(k),
    ) ||
    xmlKeys.find((k) => /导出\.xml$/i.test(k) || /匯出\.xml$/i.test(k)) ||
    xmlKeys
      .filter((k) => !/export_cda\.xml$/i.test(k))
      .sort(
        (a, b) => (decoded[b]?.byteLength || 0) - (decoded[a]?.byteLength || 0),
      )[0];

  if (!xmlFile || !decoded[xmlFile]) {
    const sample = Object.keys(decoded).slice(0, 10).join(', ');
    throw new Error(
      `ZIP 中未找到 export.xml / 导出.xml。示例条目: ${sample || '(empty)'}`,
    );
  }

  const xmlText = new TextDecoder('utf-8').decode(decoded[xmlFile]);
  const ecgKeys = Object.keys(decoded).filter(
    (k) => /electrocardiograms/i.test(k) && /\.csv$/i.test(k),
  );

  return {
    xmlText,
    xmlFileName: xmlFile,
    ecgCount: ecgKeys.length,
  };
}

/**
 * Parse ZIP (or raw XML string path handled elsewhere) into full analysis via lib.
 * ECG CSVs inside zip are parsed with lib parseEcgCsv when present.
 */
export function analyzeHealthZipBytes(
  u8: Uint8Array,
  options?: { locale?: string | null },
): ParseAnalyzeResult & { xmlFileName: string; ecgCount: number } {
  const extracted = extractHealthXmlFromZipBytes(u8);
  const data = parseHealthXml(extracted.xmlText);

  // Attach ECG from zip entries (same kernel as legacy path)
  const unzipped = unzipSync(u8);
  for (const key of Object.keys(unzipped)) {
    const name = decodeZipEntryName(key);
    if (!/electrocardiograms/i.test(name) || !/\.csv$/i.test(name)) continue;
    try {
      const text = new TextDecoder('utf-8').decode(unzipped[key]!);
      const ecg = parseEcgCsv(text);
      if (ecg && Array.isArray(data.ecg)) {
        data.ecg.push(ecg as never);
      }
    } catch {
      /* skip bad ecg csv */
    }
  }

  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
    xmlFileName: extracted.xmlFileName,
    ecgCount: extracted.ecgCount,
  };
}

export async function analyzeHealthZipFile(
  file: File,
  options?: { locale?: string | null },
): Promise<ParseAnalyzeResult & { xmlFileName: string; ecgCount: number }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return analyzeHealthZipBytes(buf, options);
}
