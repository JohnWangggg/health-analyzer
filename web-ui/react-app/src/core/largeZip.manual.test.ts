/**
 * Optional large-file smoke: RUN_LARGE_ZIP=1 vitest run src/core/largeZip.manual.test.ts
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { analyzeHealthZipBytesAsync } from './zipImport';

const ZIP = '/Users/johnwang/Downloads/导出.zip';

describe.skipIf(!process.env.RUN_LARGE_ZIP || !existsSync(ZIP))(
  'large Apple Health zip (production async path)',
  () => {
    it(
      'analyzeHealthZipBytesAsync loads multi-domain data from real 导出.zip',
      async () => {
        const u8 = new Uint8Array(readFileSync(ZIP));
        const result = await analyzeHealthZipBytesAsync(u8, {
          locale: 'zh-CN',
        });
        const d = result.summary.domainPresence;
        // Must not be ECG-only
        const nonEcg =
          (d.steps ? 1 : 0) +
          (d.weight ? 1 : 0) +
          (d.cgm ? 1 : 0) +
          (d.sleep ? 1 : 0) +
          (d.restingHr ? 1 : 0) +
          (d.hrv ? 1 : 0) +
          (d.workouts ? 1 : 0);
        expect(nonEcg).toBeGreaterThanOrEqual(3);
        expect(d.ecg).toBe(true);
        expect(result.summary.counts.stepsDays).toBeGreaterThan(100);
        expect(result.analysis.dateRange.end).toBeTruthy();
      },
      600_000,
    );
  },
);
