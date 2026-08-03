/**
 * Shared UI locale for shell + analysis (localStorage ha-react-ui-locale).
 */
import type { AppLocaleUi } from './messages';

export const UI_LOCALE_KEY = 'ha-react-ui-locale';

export function readUiLocale(): AppLocaleUi {
  try {
    const v = localStorage.getItem(UI_LOCALE_KEY);
    if (v === 'en' || v === 'zh-CN' || v === 'zh-TW') return v;
  } catch {
    /* ignore */
  }
  return 'zh-CN';
}

/** Locale string for @health-analyzer/lib analyzeAll / prompts. */
export function analysisLocaleFromUi(
  ui: AppLocaleUi = readUiLocale(),
): 'zh-CN' | 'zh-TW' | 'en' {
  return ui;
}
