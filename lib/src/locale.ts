/** UI / analysis copy locale helpers */

export type AppLocale = 'zh-CN' | 'en';

export type LocaleOptions = { locale?: AppLocale | string };

export function normalizeLocale(v?: string | null): AppLocale {
  if (v === 'en' || (v && v.toLowerCase().startsWith('en'))) return 'en';
  return 'zh-CN';
}

/** Pick zh or en string */
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
