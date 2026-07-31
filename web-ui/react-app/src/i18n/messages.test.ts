import { describe, expect, it } from 'vitest';
import { t, type MessageKey } from './messages';

describe('i18n messages', () => {
  const keys: MessageKey[] = [
    'brand',
    'nav.overview',
    'overview.title',
    'overview.loadFixture',
  ];

  it('zh-CN and en both define shell keys', () => {
    for (const k of keys) {
      expect(t('zh-CN', k).length).toBeGreaterThan(0);
      expect(t('en', k).length).toBeGreaterThan(0);
      expect(t('en', k)).not.toBe(t('zh-CN', k));
    }
  });
});
