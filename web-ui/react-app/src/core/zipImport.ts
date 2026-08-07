/**
 * Local ZIP → Apple Health export extraction using npm `fflate` (no CDN).
 *
 * Large exports (export.xml / 导出.xml often 500MB+) exceed the JS engine
 * max string length (~512MB). Always keep XML as Uint8Array and parse via
 * `parseHealthXmlAsync` (chunked TextDecoder), never `TextDecoder.decode` of
 * the whole file on the hot path.
 */
import { unzipSync } from 'fflate';
import {
  parseHealthXml,
  parseHealthXmlAsync,
  parseEcgCsv,
  analyzeAll,
  type HealthData,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type ParseAnalyzeResult } from './HealthCoreAdapter';

/** V8 / JS engines reject strings longer than ~512MiB (0x1fffffe8). */
export const MAX_XML_STRING_CHARS = 0x1fffffe8;

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

function isEcgCsvName(name: string): boolean {
  return /electrocardiograms/i.test(name) && /\.csv$/i.test(name);
}

/** Keep export XML + ECG CSVs; drop CDA / workout GPX to save RAM. */
function shouldExtractZipEntry(rawName: string): boolean {
  const name = decodeZipEntryName(rawName);
  if (/export_cda\.xml$/i.test(name)) return false;
  if (/workout-routes/i.test(name)) return false;
  if (/\.xml$/i.test(name)) return true;
  if (isEcgCsvName(name)) return true;
  return false;
}

export type ZipExtractResult = {
  /** Prefer this for parse — never requires a full JS string. */
  xmlBytes: Uint8Array;
  xmlFileName: string;
  ecgCount: number;
  /**
   * Only set when XML is safely below max string length (fixtures / small exports).
   * Large real-world exports leave this undefined.
   */
  xmlText?: string;
  /** ECG CSV texts extracted in the same unzip pass. */
  ecgCsvTexts: string[];
};

function pickHealthXmlKey(
  decoded: Record<string, Uint8Array>,
): string | undefined {
  const xmlKeys = Object.keys(decoded).filter((k) => /\.xml$/i.test(k));
  return (
    xmlKeys.find(
      (k) => isHealthExportXmlName(k) && !/export_cda\.xml$/i.test(k),
    ) ||
    xmlKeys.find((k) => /导出\.xml$/i.test(k) || /匯出\.xml$/i.test(k)) ||
    xmlKeys
      .filter((k) => !/export_cda\.xml$/i.test(k))
      .sort(
        (a, b) => (decoded[b]?.byteLength || 0) - (decoded[a]?.byteLength || 0),
      )[0]
  );
}

/**
 * Unzip bytes and pick Apple Health export.xml (or 导出.xml).
 * Skips export_cda.xml and workout-routes to avoid ~hundreds of MB extra RAM.
 */
export function extractHealthXmlFromZipBytes(u8: Uint8Array): ZipExtractResult {
  const unzipped = unzipSync(u8, {
    filter: (file) => shouldExtractZipEntry(file.name || ''),
  });
  const decoded: Record<string, Uint8Array> = {};
  for (const key of Object.keys(unzipped)) {
    const name = decodeZipEntryName(key);
    decoded[name] = unzipped[key]!;
  }

  const xmlFile = pickHealthXmlKey(decoded);
  if (!xmlFile || !decoded[xmlFile]) {
    const sample = Object.keys(decoded).slice(0, 10).join(', ');
    throw new Error(
      `ZIP 中未找到 export.xml / 导出.xml。示例条目: ${sample || '(empty)'}`,
    );
  }

  const xmlBytes = decoded[xmlFile]!;
  const ecgKeys = Object.keys(decoded).filter(isEcgCsvName);
  const ecgCsvTexts: string[] = [];
  for (const k of ecgKeys) {
    try {
      ecgCsvTexts.push(new TextDecoder('utf-8').decode(decoded[k]!));
    } catch {
      /* skip unreadable csv */
    }
  }

  let xmlText: string | undefined;
  // Leave headroom under the engine limit (also avoids huge peak RAM for split('\n')).
  if (xmlBytes.byteLength < MAX_XML_STRING_CHARS * 0.9) {
    try {
      xmlText = new TextDecoder('utf-8').decode(xmlBytes);
    } catch {
      xmlText = undefined;
    }
  }

  return {
    xmlBytes,
    xmlFileName: xmlFile,
    ecgCount: ecgKeys.length,
    xmlText,
    ecgCsvTexts,
  };
}

export type ZipAnalyzeOptions = {
  locale?: string | null;
  onProgress?: (
    phase: 'unzip' | 'parse' | 'ecg' | 'analyze',
    ratio: number,
  ) => void;
};

function attachEcgCsvs(data: HealthData, texts: string[]): void {
  if (!Array.isArray(data.ecg)) return;
  for (const text of texts) {
    try {
      const ecg = parseEcgCsv(text);
      if (ecg) data.ecg.push(ecg as never);
    } catch {
      /* skip bad ecg csv */
    }
  }
}

/**
 * Async ZIP analyze — production path for real Apple Health exports.
 * Uses chunked byte parse so 500MB+ 导出.xml works.
 */
export async function analyzeHealthZipBytesAsync(
  u8: Uint8Array,
  options?: ZipAnalyzeOptions,
): Promise<ParseAnalyzeResult & { xmlFileName: string; ecgCount: number }> {
  options?.onProgress?.('unzip', 0);
  const extracted = extractHealthXmlFromZipBytes(u8);
  options?.onProgress?.('unzip', 1);

  options?.onProgress?.('parse', 0);
  const data = await parseHealthXmlAsync(extracted.xmlBytes, {
    onProgress: (p: number) => options?.onProgress?.('parse', p),
  });
  options?.onProgress?.('parse', 1);

  options?.onProgress?.('ecg', 0);
  attachEcgCsvs(data, extracted.ecgCsvTexts);
  options?.onProgress?.('ecg', 1);

  options?.onProgress?.('analyze', 0);
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  options?.onProgress?.('analyze', 1);

  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
    xmlFileName: extracted.xmlFileName,
    ecgCount: extracted.ecgCount,
  };
}

/**
 * Sync path for small fixtures/tests.
 * Large exports must use {@link analyzeHealthZipBytesAsync}.
 */
export function analyzeHealthZipBytes(
  u8: Uint8Array,
  options?: { locale?: string | null },
): ParseAnalyzeResult & { xmlFileName: string; ecgCount: number } {
  const extracted = extractHealthXmlFromZipBytes(u8);
  if (!extracted.xmlText) {
    const mb = (extracted.xmlBytes.byteLength / (1024 * 1024)).toFixed(0);
    throw new Error(
      `export.xml 过大（${mb}MB），无法同步整串解析（引擎字符串上限约 512MB）。` +
        `请使用页面 ZIP 导入（异步字节流）或 analyzeHealthZipBytesAsync。`,
    );
  }
  const data = parseHealthXml(extracted.xmlText);
  attachEcgCsvs(data, extracted.ecgCsvTexts);
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
  options?: ZipAnalyzeOptions,
): Promise<ParseAnalyzeResult & { xmlFileName: string; ecgCount: number }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return analyzeHealthZipBytesAsync(buf, options);
}

/** Friendly message when a raw XML File is too large for string APIs. */
export function xmlTooLargeMessage(byteLength: number): string {
  const mb = (byteLength / (1024 * 1024)).toFixed(0);
  return (
    `XML 约 ${mb}MB，超过浏览器字符串上限（约 512MB），无法整文件读成文本。` +
    `请直接导入原始 ZIP（会按字节流式解析），或拆分/精简导出。`
  );
}
