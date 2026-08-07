import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeHealthZipBytes,
  analyzeHealthZipBytesAsync,
  extractHealthXmlFromZipBytes,
  MAX_XML_STRING_CHARS,
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
    expect(extracted.xmlBytes.byteLength).toBeGreaterThan(100);
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

  it('async path matches sync for small fixture', async () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      'export.xml': new Uint8Array(xml),
    });
    const sync = analyzeHealthZipBytes(zipped, { locale: 'zh-CN' });
    const asyncR = await analyzeHealthZipBytesAsync(zipped, {
      locale: 'zh-CN',
    });
    expect(asyncR.summary.counts.cgm).toBe(sync.summary.counts.cgm);
    expect(asyncR.summary.domainPresence.weight).toBe(true);
  });

  it('accepts 导出.xml entry name', () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      '导出.xml': new Uint8Array(xml),
    });
    const extracted = extractHealthXmlFromZipBytes(zipped);
    expect(
      extracted.xmlText ||
        new TextDecoder().decode(extracted.xmlBytes),
    ).toContain('HKQuantityTypeIdentifier');
  });

  it('skips export_cda and workout-routes during extract', () => {
    const xml = readFileSync(FIXTURE);
    const zipped = zipSync({
      'apple_health_export/export.xml': new Uint8Array(xml),
      'apple_health_export/export_cda.xml': strToU8('<ClinicalDocument/>'),
      'apple_health_export/workout-routes/route.gpx': strToU8('<gpx/>'),
      'apple_health_export/electrocardiograms/ecg_2026-01-01.csv': strToU8(
        '记录日期,2026-01-01 12:00:00 +0800\n分类,窦性心律\n',
      ),
    });
    const extracted = extractHealthXmlFromZipBytes(zipped);
    expect(extracted.xmlFileName).toMatch(/export\.xml$/i);
    expect(extracted.ecgCount).toBe(1);
    expect(extracted.ecgCsvTexts.length).toBe(1);
    // CDA not retained as chosen XML
    expect(extracted.xmlFileName).not.toMatch(/cda/i);
  });

  it('documents max string threshold constant', () => {
    expect(MAX_XML_STRING_CHARS).toBe(0x1fffffe8);
  });
});
