import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeHaeFiles } from './haeImport';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HAE_MINI = resolve(
  __dirname,
  '../../../../e2e/fixtures/hae-mini.json',
);
const HAE_BATCH0 = resolve(
  __dirname,
  '../../../../e2e/fixtures/hae-batch/batch-00.json',
);

describe('haeImport', () => {
  it('merges hae-mini.json via lib and yields CGM analysis', () => {
    const text = readFileSync(HAE_MINI, 'utf8');
    const r = analyzeHaeFiles([{ name: 'hae-mini.json', text }], {
      locale: 'zh-CN',
    });
    expect(r.stats.totalAdded).toBeGreaterThan(0);
    expect(r.summary.counts.cgm).toBeGreaterThan(0);
    expect(r.summary.domainPresence.cgm).toBe(true);
    expect(r.analysis.dateRange.end).toBeTruthy();
  });

  it('merges batch-00 and can merge second file onto base', () => {
    const a = readFileSync(HAE_BATCH0, 'utf8');
    const first = analyzeHaeFiles([{ name: 'batch-00.json', text: a }], {
      locale: 'zh-CN',
    });
    expect(first.summary.counts.cgm).toBeGreaterThan(0);
    const mini = readFileSync(HAE_MINI, 'utf8');
    const second = analyzeHaeFiles([{ name: 'hae-mini.json', text: mini }], {
      locale: 'zh-CN',
      baseData: first.data,
    });
    // second merge should not wipe prior data domain
    expect(second.summary.counts.cgm).toBeGreaterThanOrEqual(
      first.summary.counts.cgm,
    );
  });
});
