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
});
