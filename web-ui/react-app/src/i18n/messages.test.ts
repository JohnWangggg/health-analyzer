import { describe, expect, it } from 'vitest';
import { MESSAGE_KEYS, t, type MessageKey } from './messages';

describe('i18n messages', () => {
  const sampleKeys: MessageKey[] = [
    'brand',
    'nav.overview',
    'overview.title',
    'overview.loadFixture',
    'shell.sessionReady',
    'trends.title',
    'trends.domain.steps',
    'reports.title',
    'reports.copied',
    'reports.kind.visit',
    'data.softQuota.title',
    'data.softQuota.step.cgm',
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
