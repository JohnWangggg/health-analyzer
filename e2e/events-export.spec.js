// @ts-check
/**
 * v1.45 weekly report + LLM prompt: events opt-in (default redacted).
 * Mirrors clinical-privacy.spec.js patterns (page.evaluate + fixture XML).
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures/minimal-export.xml');

/** Distinctive title — must not appear unless includeEvents: true */
const SECRET_TITLE = 'E2E_WEEKLY_SECRET_EVT';
/**
 * Date inside minimal fixture range AND last-7-day weekly window
 * (fixture end ~2026-07-23 → week starts 2026-07-17).
 * 2026-07-15 is in full range but outside the weekly window.
 */
const SECRET_DATE = '2026-07-20';

/** @param {import('@playwright/test').Page} page */
async function waitAppReady(page) {
  await page.goto('/');
  await page.waitForFunction(
    () =>
      !!(
        window.HealthAnalyzer &&
        window.I18n &&
        typeof window.HealthAnalyzer.generateWeeklyReportMarkdown === 'function' &&
        typeof window.HealthAnalyzer.generateLLMPrompt === 'function'
      )
  );
  await page.waitForFunction(
    () =>
      !!(
        window.HealthHistory &&
        typeof window.HealthHistory.saveHealthEvent === 'function' &&
        typeof window.HealthHistory.listHealthEvents === 'function'
      )
  );
}

/**
 * Seed one secret illness event into IndexedDB via HealthHistory.
 * @param {import('@playwright/test').Page} page
 * @param {{ title?: string, date?: string }} [opts]
 */
async function seedSecretEvent(page, opts = {}) {
  const title = opts.title || SECRET_TITLE;
  const date = opts.date || SECRET_DATE;
  await page.evaluate(
    async ({ title, date }) => {
      const HA = window.HealthAnalyzer;
      const HH = window.HealthHistory;
      let event;
      if (typeof HA.normalizeHealthEvent === 'function') {
        event = HA.normalizeHealthEvent({
          kind: 'illness',
          date,
          title,
          source: 'manual',
        });
      }
      if (!event) {
        event = {
          id: `ev_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          kind: 'illness',
          date,
          endDate: '',
          title,
          note: '',
          intensity: null,
          source: 'manual',
          createdAt: new Date().toISOString(),
        };
      }
      await HH.saveHealthEvent(event);
      return event.id;
    },
    { title, date }
  );
}

test.describe('weekly report: events default redaction', () => {
  test('default weekly MD redacts events; includeEvents true surfaces secret + disclaimer', async ({
    page,
  }) => {
    await waitAppReady(page);
    const xmlText = fs.readFileSync(FIXTURE, 'utf8');

    await seedSecretEvent(page);
    const listed = await page.evaluate(async () => {
      const rows = await window.HealthHistory.listHealthEvents();
      return rows.map((r) => r.title);
    });
    expect(listed).toContain(SECRET_TITLE);

    const result = await page.evaluate(
      async ({ xml, secret }) => {
        const HA = window.HealthAnalyzer;
        const analysis = HA.analyzeAll(HA.parseHealthXml(xml));
        const events = await window.HealthHistory.listHealthEvents();

        // 1) Default opts {} — no includeEvents
        const def = HA.generateWeeklyReportMarkdown(analysis, null, {});
        // 2) events present but includeEvents false / omitted → still redacted
        const withEventsNoFlag = HA.generateWeeklyReportMarkdown(analysis, null, {
          events,
        });
        const withEventsFalse = HA.generateWeeklyReportMarkdown(analysis, null, {
          events,
          includeEvents: false,
        });
        // 3) Explicit includeEvents: true → must surface secret when in week window
        const withInclude = HA.generateWeeklyReportMarkdown(analysis, null, {
          includeEvents: true,
          events,
        });
        return {
          dateRange: analysis.dateRange || null,
          defHasSecret: def.includes(secret),
          noFlagHasSecret: withEventsNoFlag.includes(secret),
          falseHasSecret: withEventsFalse.includes(secret),
          includeHasSecret: withInclude.includes(secret),
          includeHasDisclaimer: /不作因果|not causation/i.test(withInclude),
          defLen: def.length,
          includeLen: withInclude.length,
        };
      },
      { xml: xmlText, secret: SECRET_TITLE }
    );

    expect(result.defLen).toBeGreaterThan(100);
    expect(result.defHasSecret).toBe(false);
    expect(result.noFlagHasSecret).toBe(false);
    expect(result.falseHasSecret).toBe(false);
    expect(result.includeHasSecret).toBe(true);
    expect(result.includeHasDisclaimer).toBe(true);
  });
});

test.describe('LLM prompt: events default redaction', () => {
  test('default prompt redacts events; includeEvents true has secret + co-occurrence language', async ({
    page,
  }) => {
    await waitAppReady(page);
    const xmlText = fs.readFileSync(FIXTURE, 'utf8');

    await seedSecretEvent(page);
    const listed = await page.evaluate(async () => {
      const rows = await window.HealthHistory.listHealthEvents();
      return rows.map((r) => r.title);
    });
    expect(listed).toContain(SECRET_TITLE);

    const result = await page.evaluate(
      async ({ xml, secret }) => {
        const HA = window.HealthAnalyzer;
        const analysis = HA.analyzeAll(HA.parseHealthXml(xml));
        const events = await window.HealthHistory.listHealthEvents();

        const def = HA.generateLLMPrompt(analysis, null, {});
        const withEventsNoFlag = HA.generateLLMPrompt(analysis, null, { events });
        const withEventsFalse = HA.generateLLMPrompt(analysis, null, {
          events,
          includeEvents: false,
        });
        const withInclude = HA.generateLLMPrompt(analysis, null, {
          includeEvents: true,
          events,
        });
        return {
          defHasSecret: def.includes(secret),
          noFlagHasSecret: withEventsNoFlag.includes(secret),
          falseHasSecret: withEventsFalse.includes(secret),
          includeHasSecret: withInclude.includes(secret),
          // co-occurrence disclaimer (zh instruction and/or formatEventsMarkdown body)
          includeHasCoOccurrence:
            /时间共现|co-occurrence|不作因果|not causation/i.test(withInclude),
          defLen: def.length,
          includeLen: withInclude.length,
        };
      },
      { xml: xmlText, secret: SECRET_TITLE }
    );

    expect(result.defLen).toBeGreaterThan(100);
    expect(result.defHasSecret).toBe(false);
    expect(result.noFlagHasSecret).toBe(false);
    expect(result.falseHasSecret).toBe(false);
    expect(result.includeHasSecret).toBe(true);
    expect(result.includeHasCoOccurrence).toBe(true);
  });
});

test.describe('events opt-in UI checkboxes', () => {
  test('#weekly-include-events and #ctx-include-events default unchecked if present', async ({
    page,
  }) => {
    await waitAppReady(page);

    const weekly = page.locator('#weekly-include-events');
    if ((await weekly.count()) > 0) {
      await expect(weekly).toBeAttached();
      await expect(weekly).not.toBeChecked();
    }

    const ctx = page.locator('#ctx-include-events');
    if ((await ctx.count()) > 0) {
      await expect(ctx).toBeAttached();
      await expect(ctx).not.toBeChecked();
    }
  });
});
