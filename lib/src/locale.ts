/** UI / analysis copy locale helpers */

export type AppLocale = 'zh-CN' | 'zh-TW' | 'en';

export type LocaleOptions = { locale?: AppLocale | string };

/**
 * Normalize UI / navigator locale tags.
 * - en* → en
 * - zh-TW / zh-HK / zh-Hant → zh-TW
 * - else → zh-CN
 *
 * Analysis bilingual copy (createL / pickLocale): zh-TW currently shares
 * the same Simplified Chinese medical/analysis body as zh-CN; short section
 * headers / insight titles may be traditionalized via zh-tw-map.ts.
 * Full UI chrome uses Traditional Chinese in web-ui/public/i18n.js.
 */
export function normalizeLocale(v?: string | null): AppLocale {
  if (v == null || v === '') return 'zh-CN';
  const s = String(v).trim();
  const lower = s.toLowerCase().replace(/_/g, '-');
  if (s === 'en' || lower === 'en' || lower.startsWith('en-')) return 'en';
  if (
    lower === 'zh-tw' ||
    lower.startsWith('zh-tw') ||
    lower === 'zh-hk' ||
    lower.startsWith('zh-hk') ||
    lower.includes('hant')
  ) {
    return 'zh-TW';
  }
  return 'zh-CN';
}

/**
 * Pick zh or en string for analysis copy.
 * Uses en only when locale === 'en'; zh-CN and zh-TW both use the zh string
 * (Traditional medical/analysis translation deferred).
 */
export function pickLocale(locale: AppLocale, zh: string, en: string): string {
  return locale === 'en' ? en : zh;
}

/**
 * Locale picker: callable as L(zh, en), also L.t(zh, en) and L.locale.
 * Accepts raw UI locale strings (normalized internally).
 */
export type LFn = ((zh: string, en: string) => string) & {
  t: (zh: string, en: string) => string;
  locale: AppLocale;
};

export function createL(localeInput: AppLocale | string | null | undefined = 'zh-CN'): LFn {
  const locale = normalizeLocale(localeInput);
  const pick = (zh: string, en: string) => pickLocale(locale, zh, en);
  const fn = ((zh: string, en: string) => pick(zh, en)) as LFn;
  fn.t = pick;
  fn.locale = locale;
  return fn;
}
