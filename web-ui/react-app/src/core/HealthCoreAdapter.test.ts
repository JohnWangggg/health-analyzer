import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  analyzeHealthXml,
  analyzeHealthXmlViaLibDirect,
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

    // Raw lib call (proves we did not reimplement stats)
    const data = parseHealthXml(xml);
    const analysis = analyzeAll(data, { locale: 'zh-CN' });
    const viaLibSummary = summarizeAnalysis(analysis);

    // Drop generatedAt (timestamp) for structural compare
    const strip = (s: typeof viaAdapter.summary) => {
      const { generatedAt: _g, ...rest } = s;
      return rest;
    };

    expect(strip(viaAdapter.summary)).toEqual(strip(viaHelper.summary));
    expect(strip(viaAdapter.summary)).toEqual(strip(viaDirect.summary));
    expect(strip(viaAdapter.summary)).toEqual(strip(viaLibSummary));

    // Fixture must surface expected domains
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
    expect(viaAdapter.analysis.cgmStats || viaAdapter.summary.counts.cgm > 0).toBeTruthy();
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
