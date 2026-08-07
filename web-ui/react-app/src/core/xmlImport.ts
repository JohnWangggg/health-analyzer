/**
 * Large raw export.xml import — byte-stream parse (no full-string decode).
 */
import {
  parseHealthXmlAsync,
  analyzeAll,
} from '@health-analyzer/lib';
import { summarizeAnalysis, type ParseAnalyzeResult } from './HealthCoreAdapter';
import { xmlTooLargeMessage } from './zipImport';

export { xmlTooLargeMessage };

export type XmlBytesAnalyzeOptions = {
  locale?: string | null;
  onProgress?: (ratio: number) => void;
};

export async function analyzeHealthXmlBytesAsync(
  bytes: Uint8Array,
  options?: XmlBytesAnalyzeOptions,
): Promise<ParseAnalyzeResult> {
  if (bytes.byteLength === 0) {
    throw new Error('XML 文件为空');
  }
  const data = await parseHealthXmlAsync(bytes, {
    onProgress: options?.onProgress,
  });
  const analysis = analyzeAll(data, { locale: options?.locale ?? null });
  return {
    data,
    analysis,
    summary: summarizeAnalysis(analysis),
  };
}
