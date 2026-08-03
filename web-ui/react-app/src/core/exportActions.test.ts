import { describe, expect, it } from 'vitest';
import { analyzeAll, createEmptyData, parseHealthXml } from '@health-analyzer/lib';
import fixtureXml from '../../../../e2e/fixtures/minimal-export.xml?raw';
import { buildExportBundle } from '@health-analyzer/lib';

describe('export bundle (lib)', () => {
  it('buildExportBundle yields json + csv files for fixture', () => {
    const data = parseHealthXml(fixtureXml);
    const analysis = analyzeAll(data, { locale: 'zh-CN' });
    const bundle = buildExportBundle(analysis);
    expect(bundle.analysisJson.length).toBeGreaterThan(100);
    expect(bundle.snapshotJson.length).toBeGreaterThan(20);
    expect(bundle.csvFiles.length).toBeGreaterThan(0);
    expect(bundle.csvFiles[0]!.filename).toMatch(/\.csv$/);
  });

  it('empty data still builds bundle', () => {
    const analysis = analyzeAll(createEmptyData(), { locale: 'zh-CN' });
    const bundle = buildExportBundle(analysis);
    expect(typeof bundle.analysisJson).toBe('string');
  });
});
