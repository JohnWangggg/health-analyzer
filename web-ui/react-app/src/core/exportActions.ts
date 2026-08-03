/**
 * Analysis export (JSON / CSV zip / snapshot) via lib buildExportBundle.
 * Local download only — no network.
 */
import {
  buildExportBundle,
  joinCsvBundle,
  type FullAnalysis,
} from '@health-analyzer/lib';
import { zipSync, strToU8 } from 'fflate';
import { dayStamp, downloadBlob, downloadText } from './download';

export type ExportKind = 'json' | 'csv' | 'snapshot';

export function exportAnalysisJson(analysis: FullAnalysis): string {
  const bundle = buildExportBundle(analysis);
  const name = `health-analysis-${dayStamp()}.json`;
  downloadText(name, bundle.analysisJson, 'application/json');
  return name;
}

export function exportAnalysisSnapshotJson(analysis: FullAnalysis): string {
  const bundle = buildExportBundle(analysis);
  const name = `health-snapshot-${dayStamp()}.json`;
  downloadText(name, bundle.snapshotJson, 'application/json');
  return name;
}

/**
 * Prefer ZIP of CSVs (fflate). Falls back to joined .txt if zip fails.
 */
export function exportAnalysisCsv(analysis: FullAnalysis): {
  filename: string;
  format: 'zip' | 'txt';
} {
  const bundle = buildExportBundle(analysis);
  const day = dayStamp();
  try {
    const files: Record<string, Uint8Array> = {};
    for (const f of bundle.csvFiles) {
      files[f.filename] = strToU8(f.content);
    }
    const zipped = zipSync(files);
    const filename = `health-analysis-csv-${day}.zip`;
    downloadBlob(
      filename,
      new Blob([zipped], { type: 'application/zip' }),
    );
    return { filename, format: 'zip' };
  } catch {
    const joined = joinCsvBundle(bundle.csvFiles);
    const filename = `health-analysis-csv-${day}.txt`;
    downloadText(filename, joined, 'text/plain;charset=utf-8');
    return { filename, format: 'txt' };
  }
}
