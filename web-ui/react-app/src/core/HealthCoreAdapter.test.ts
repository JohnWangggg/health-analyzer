import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeHealthXml,
  analyzeHealthXmlViaLibDirect,
  buildReportPreview,
  extractTrendSeries,
  healthCore,
  summarizeAnalysis,
} from './HealthCoreAdapter';
import { parseHealthXml, analyzeAll } from '@health-analyzer/lib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(
  __dirname,
  '../../../../e2e/fixtures/minimal-export.xml',
);

describe('HealthCoreAdapter parity', () => {
  const xml = readFileSync(FIXTURE, 'utf8');

  it('loads the in-repo minimal-export fixture', () => {
    expect(xml).toContain('HealthData');
    expect(xml.length).toBeGreaterThan(100);
  });

  it('adapter summary matches direct lib parse+analyze on the same fixture', () => {
    const viaAdapter = healthCore.analyzeXml(xml, { locale: 'zh-CN' });
    const viaHelper = analyzeHealthXml(xml, { locale: 'zh-CN' });
    const viaDirect = analyzeHealthXmlViaLibDirect(xml, { locale: 'zh-CN' });

    const data = parseHealthXml(xml);
    const analysis = analyzeAll(data, { locale: 'zh-CN' });
    const viaLibSummary = summarizeAnalysis(analysis);

    const strip = (s: typeof viaAdapter.summary) => {
      const { generatedAt: _g, freshnessDays: _f, ...rest } = s;
      return rest;
    };

    expect(strip(viaAdapter.summary)).toEqual(strip(viaHelper.summary));
    expect(strip(viaAdapter.summary)).toEqual(strip(viaDirect.summary));
    expect(strip(viaAdapter.summary)).toEqual(strip(viaLibSummary));

    expect(viaAdapter.summary.domainPresence.cgm).toBe(true);
    expect(viaAdapter.summary.domainPresence.weight).toBe(true);
    expect(viaAdapter.summary.domainPresence.bloodPressure).toBe(true);
    expect(viaAdapter.summary.domainPresence.steps).toBe(true);
    expect(viaAdapter.summary.domainPresence.sleep).toBe(true);
    expect(viaAdapter.summary.counts.cgm).toBeGreaterThan(0);
    expect(viaAdapter.summary.counts.weight).toBeGreaterThan(0);
    expect(viaAdapter.summary.dateRange.start).toBeTruthy();
    expect(viaAdapter.summary.dateRange.end).toBeTruthy();
    expect(viaAdapter.analysis).toBeTruthy();
  });

  it('extractTrendSeries returns fixture-driven points without re-stats', () => {
    const { analysis } = analyzeHealthXml(xml);
    const steps = extractTrendSeries(analysis, 'steps');
    expect(steps.points.length).toBeGreaterThan(0);
    expect(steps.points[0]!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isFinite(steps.points[0]!.value)).toBe(true);

    const weight = extractTrendSeries(analysis, 'weight');
    expect(weight.points.length).toBeGreaterThan(0);

    const cgm = extractTrendSeries(analysis, 'cgmDailyMean');
    expect(cgm.points.length).toBeGreaterThan(0);
  });

  it('buildReportPreview calls lib report builders (non-empty markdown)', () => {
    const { analysis } = analyzeHealthXml(xml, { locale: 'zh-CN' });
    for (const kind of ['visit', 'weekly', 'clinical'] as const) {
      const report = buildReportPreview(analysis, kind, { locale: 'zh-CN' });
      expect(report.markdown.length).toBeGreaterThan(40);
      expect(report.title.length).toBeGreaterThan(0);
      // must look like markdown produced by lib, not an empty stub
      expect(report.markdown).toMatch(/^#/m);
    }
    // Same path as adapter class
    const viaClass = healthCore.report(analysis, 'visit', { locale: 'zh-CN' });
    expect(viaClass.markdown).toBe(
      buildReportPreview(analysis, 'visit', { locale: 'zh-CN' }).markdown,
    );
  });

  it('adapter is a thin wrapper (same analysis object shape keys)', () => {
    const { analysis } = analyzeHealthXml(xml);
    const keys = Object.keys(analysis).sort();
    expect(keys).toContain('dateRange');
    expect(keys).toContain('cgmStats');
    expect(keys).toContain('bpStats');
    expect(keys).toContain('weightStats');
    expect(keys).toContain('data');
    expect(keys).toContain('recoveryWeek');
  });
});
