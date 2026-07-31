import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeHealthZipBytes,
  extractHealthXmlFromZipBytes,
} from './zipImport';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

describe('zipImport', () => {
  it('extracts export.xml from a local fflate zip of the fixture', () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      'export.xml': new Uint8Array(xml),
      'readme.txt': strToU8('ignore me'),
    });
    const extracted = extractHealthXmlFromZipBytes(zipped);
    expect(extracted.xmlFileName).toMatch(/export\.xml$/i);
    expect(extracted.xmlText).toContain('HealthData');
  });

  it('analyzes zipped fixture via lib (same CGM count path as XML)', () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      'export.xml': new Uint8Array(xml),
    });
    const result = analyzeHealthZipBytes(zipped, { locale: 'zh-CN' });
    expect(result.summary.counts.cgm).toBeGreaterThan(0);
    expect(result.summary.domainPresence.weight).toBe(true);
    expect(result.analysis.dateRange.end).toBeTruthy();
  });

  it('accepts 导出.xml entry name', () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      '导出.xml': new Uint8Array(xml),
    });
    const extracted = extractHealthXmlFromZipBytes(zipped);
    expect(extracted.xmlText).toContain('HKQuantityTypeIdentifier');
  });
});
