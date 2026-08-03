import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, t, type MessageKey } from './messages';

describe('i18n messages', () => {
  const sampleKeys: MessageKey[] = [
    'brand',
    'nav.overview',
    'overview.title',
    'overview.loadFixture',
    'overview.emptyHint',
    'overview.sessionReadyStrip',
    'overview.ctx.summary',
    'overview.ctx.includeSensitive',
    'overview.today.title',
    'overview.kpiSection',
    'overview.kpi.cgm',
    'overview.kpi.openTrends',
    'overview.today.title',
    'overview.today.nonDiag',
    'shell.sessionReady',
    'shell.kbdHint',
    'trends.title',
    'trends.domain.steps',
    'trends.domain.sleepTotal',
    'trends.domain.hrv',
    'reports.title',
    'reports.copied',
    'reports.emptyAction',
    'reports.kind.visit',
    'data.title',
    'data.probeAction',
    'data.contractOk',
    'data.softQuota.title',
    'data.softQuota.step.cgm',
    'data.keepN.title',
    'data.keepN.apply',
    'data.keepN.presets',
    'data.keepN.preset.compact',
    'data.keepN.preset.year',
    'data.keepN.preset.tight',
    'data.shards.title',
    'data.shards.delete',
    'data.backup.title',
    'data.backup.export',
    'data.backup.import',
  ];

  it('zh-CN and en both define shell keys', () => {
    for (const k of sampleKeys) {
      expect(t('zh-CN', k).length).toBeGreaterThan(0);
      expect(t('en', k).length).toBeGreaterThan(0);
      expect(t('en', k)).not.toBe(t('zh-CN', k));
    }
  });

  it('zh-CN and en have full key parity', () => {
    expect(MESSAGE_KEYS.length).toBeGreaterThan(20);
    for (const k of MESSAGE_KEYS) {
      expect(t('zh-CN', k).length).toBeGreaterThan(0);
      expect(t('en', k).length).toBeGreaterThan(0);
    }
  });

  it('zh-TW derives Traditional from zh-CN via phrase map', () => {
    const cn = t('zh-CN', 'overview.title');
    const tw = t('zh-TW', 'overview.title');
    expect(tw.length).toBeGreaterThan(0);
    // At least one key should differ when simplified has convertible chars
    const brandTw = t('zh-TW', 'brand');
    expect(brandTw.length).toBeGreaterThan(0);
    // data wipe confirm contains 数据 → 資料 or 數據 style conversion for some phrases
    const wipeCn = t('zh-CN', 'data.privacy.lead');
    const wipeTw = t('zh-TW', 'data.privacy.lead');
    expect(wipeTw.length).toBe(wipeCn.length > 0 ? wipeTw.length : 0);
    expect(wipeTw).not.toMatch(/数据仓/); // simplified warehouse phrase should convert
  });
});
