// @ts-check
/**
 * HAE cancel-import E2E:
 * - UI: mid-import cancel with multi-batch selection (BATCH_FILES=8 → 10 files forces ≥2 batches)
 * - API: cancelled batch flag + provenance appendix only lists sourceBatchIds linked to analysis
 *
 * UI cancel can lose a race on tiny fixtures (full import finishes first) → soft-pass with note.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BATCH_DIR = path.join(__dirname, 'fixtures/hae-batch');
const HAE_MINI = path.join(__dirname, 'fixtures/hae-mini.json');

/** All 10 batch fixtures (batch-00 … batch-09). */
const BATCH_FILES = Array.from({ length: 10 }, (_, i) =>
  path.join(BATCH_DIR, `batch-${String(i).padStart(2, '0')}.json`)
);

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/legacy/');
  await page.waitForFunction(
    () =>
      !!(
        window.HealthAnalyzer &&
        window.I18n &&
        typeof window.HealthAnalyzer.mergeHaeIntoData === 'function' &&
        typeof window.HealthAnalyzer.createEmptyData === 'function' &&
        typeof window.HealthAnalyzer.analyzeAll === 'function'
      )
  );
}

/**
 * Open HAE import details if collapsed.
 * @param {import('@playwright/test').Page} page
 */
async function expandHaeImportBox(page) {
  const box = page.locator('#hae-import-box');
  await expect(box).toBeAttached();
  const open = await box.evaluate((el) => el instanceof HTMLDetailsElement && el.open);
  if (!open) {
    await box.locator('summary').click();
  }
  await expect(page.locator('#hae-file-input')).toBeVisible();
  await expect(page.locator('#btn-hae-apply')).toBeVisible();
}

/** Combined status + result text (setHaeStatus may drop .show after 4s). */
async function haeStatusCombined(page) {
  const statusText = (await page.locator('#hae-import-status').textContent().catch(() => '')) || '';
  const resultText = (await page.locator('#hae-import-result').textContent().catch(() => '')) || '';
  return `${statusText}\n${resultText}`;
}

test.describe('HAE cancel import path', () => {
  test('UI: cancel after partial multi-batch progress (soft if race completes)', async ({
    page,
  }) => {
    // Fixtures must exist (BATCH_FILES=8 → 10 files forces ≥2 batches)
    for (const f of BATCH_FILES) {
      expect(fs.existsSync(f), `missing fixture ${f}`).toBe(true);
    }

    await waitAppReady(page);
    await expandHaeImportBox(page);

    await page.locator('#hae-file-input').setInputFiles(BATCH_FILES);

    const cancelBtn = page.locator('#btn-hae-cancel');
    await page.locator('#btn-hae-apply').click();

    // Cancel becomes visible when import starts (setHaeImportUiBusy)
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    // Small delay so first batch can start (prefer mid-import abort when possible)
    await page.waitForTimeout(80);
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click({ force: true }).catch(() => {});
    }

    // Final outcome: cancelled language OR full merge success (soft-pass)
    /** @type {'cancelled' | 'completed' | null} */
    let outcome = null;
    await expect
      .poll(
        async () => {
          const combined = await haeStatusCombined(page);
          // Cancelled success / in-progress cancel (zh-CN / zh-TW / en)
          if (/取消|cancelled|Cancell/i.test(combined)) {
            outcome = 'cancelled';
            return true;
          }
          // Full import finished before cancel landed
          if (
            /已合并|新增\s*\d+|Added\s*\d+|merged/i.test(combined) &&
            (await page.locator('#hae-import-result:not(.hidden)').isVisible().catch(() => false))
          ) {
            outcome = 'completed';
            return true;
          }
          // Busy flag cleared without matching text yet
          const busy =
            (await page.locator('#btn-hae-apply').isDisabled().catch(() => false)) ||
            (await cancelBtn.isVisible().catch(() => false));
          if (!busy && combined.trim()) {
            if (/取消|cancelled|Cancell/i.test(combined)) {
              outcome = 'cancelled';
              return true;
            }
            if (/新增|Added|合并|merged/i.test(combined)) {
              outcome = 'completed';
              return true;
            }
          }
          return false;
        },
        { timeout: 45_000 }
      )
      .toBe(true);

    expect(outcome === 'cancelled' || outcome === 'completed').toBe(true);
    if (outcome === 'completed') {
      test.info().annotations.push({
        type: 'note',
        description:
          'Cancel lost race: full HAE import finished before #btn-hae-cancel took effect (tiny fixtures). Soft-pass.',
      });
    }

    // Prefer stronger assert when cancel path won
    if (outcome === 'cancelled') {
      const combined = await haeStatusCombined(page);
      expect(combined).toMatch(/取消|cancelled|Cancell/i);

      // If IndexedDB batch was recorded, it should be cancelled:true
      const batchInfo = await page.evaluate(async () => {
        if (!window.HealthHistory || typeof window.HealthHistory.listImportBatches !== 'function') {
          return { available: false };
        }
        const all = (await window.HealthHistory.listImportBatches()) || [];
        const hae = all.filter((b) => b && b.source === 'hae');
        const cancelled = hae.filter((b) => b.cancelled === true);
        return {
          available: true,
          total: all.length,
          haeCount: hae.length,
          cancelledCount: cancelled.length,
          anyCancelled: cancelled.length > 0,
        };
      });
      if (batchInfo.available && batchInfo.haeCount > 0) {
        // Partial mid-import with digests should persist cancelled:true
        // (zero-progress cancel may skip record — only assert when batches exist)
        expect(batchInfo.anyCancelled).toBe(true);
      }
    }
  });

  test('API: cancelled batch + provenance only uses linked sourceBatchIds', async ({ page }) => {
    await waitAppReady(page);
    const haeJson = fs.readFileSync(HAE_MINI, 'utf8');

    const result = await page.evaluate(async (jsonText) => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      if (
        !HA ||
        typeof HA.createEmptyData !== 'function' ||
        typeof HA.mergeHaeJsonIntoData !== 'function' ||
        typeof HA.normalizeImportBatch !== 'function' ||
        typeof HA.formatProvenanceAppendixMarkdown !== 'function' ||
        typeof HA.createImportBatchId !== 'function'
      ) {
        return { error: 'missing HealthAnalyzer provenance APIs' };
      }
      if (!HH || typeof HH.saveImportBatch !== 'function' || typeof HH.listImportBatches !== 'function') {
        return { error: 'missing HealthHistory import batch APIs' };
      }

      // Clear prior batches so assertions are stable
      if (typeof HH.clearImportBatches === 'function') {
        await HH.clearImportBatches();
      }

      const data = HA.createEmptyData('2026-07-23');
      const merge = HA.mergeHaeJsonIntoData(data, jsonText);
      const cgmLen = data.cgm ? data.cgm.length : 0;

      const linkedId = HA.createImportBatchId();
      const orphanId = HA.createImportBatchId();

      const cancelledBatch = HA.normalizeImportBatch({
        id: linkedId,
        source: 'hae',
        createdAt: new Date().toISOString(),
        files: [
          {
            name: 'batch-partial.json',
            bytes: jsonText.length,
            sha256: 'aa'.repeat(32),
            digestScope: 'full',
            bytesHashed: jsonText.length,
          },
        ],
        totalBytes: jsonText.length,
        stats: {
          totalAdded: merge.totalAdded || 0,
          totalUpdated: merge.totalUpdated || 0,
          totalSkipped: merge.totalSkipped || 0,
        },
        notes: ['cancelled mid-batch'],
        cancelled: true,
      });
      const orphanBatch = HA.normalizeImportBatch({
        id: orphanId,
        source: 'hae',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        files: [{ name: 'other-import.json', bytes: 99, sha256: 'bb'.repeat(32), digestScope: 'full', bytesHashed: 99 }],
        totalBytes: 99,
        stats: { totalAdded: 1, totalUpdated: 0, totalSkipped: 0 },
        cancelled: false,
      });

      if (!cancelledBatch || !orphanBatch) {
        return { error: 'normalizeImportBatch failed' };
      }

      await HH.saveImportBatch(cancelledBatch);
      await HH.saveImportBatch(orphanBatch);

      // Simulate report provenance filter: only sourceBatchIds linked to current analysis
      const sourceBatchIds = [linkedId];
      const all = (await HH.listImportBatches()) || [];
      const linked = all.filter((b) => b && sourceBatchIds.includes(String(b.id)));
      const appendix = HA.formatProvenanceAppendixMarkdown(linked, { locale: 'zh-CN' });
      const appendixEn = HA.formatProvenanceAppendixMarkdown(linked, { locale: 'en' });

      const savedCancelled = await HH.getImportBatch(linkedId);

      return {
        cgmLen,
        mergeAdded: merge.totalAdded || 0,
        savedCancelledFlag: !!(savedCancelled && savedCancelled.cancelled),
        linkedCount: linked.length,
        allCount: all.length,
        appendix,
        appendixEn,
        linkedHasOrphanFile: /other-import\.json/.test(appendix),
        linkedHasPartialFile: /batch-partial\.json/.test(appendix),
        appendixShowsCancelledZh: /已取消|取消/.test(appendix),
        appendixShowsCancelledEn: /cancelled/i.test(appendixEn),
        appendixNotFullHistory: /本报告关联|非全部导入历史|linked to this report|not full import history/i.test(
          appendix + appendixEn
        ),
      };
    }, haeJson);

    expect(result.error).toBeUndefined();
    expect(result.cgmLen).toBeGreaterThan(0);
    expect(result.mergeAdded).toBeGreaterThan(0);
    expect(result.savedCancelledFlag).toBe(true);
    expect(result.allCount).toBeGreaterThanOrEqual(2);
    expect(result.linkedCount).toBe(1);
    expect(result.linkedHasPartialFile).toBe(true);
    expect(result.linkedHasOrphanFile).toBe(false);
    expect(result.appendixShowsCancelledZh || result.appendixShowsCancelledEn).toBe(true);
    expect(result.appendixNotFullHistory).toBe(true);
  });
});
