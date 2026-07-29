/** UI / analysis copy locale helpers */
export type AppLocale = 'zh-CN' | 'zh-TW' | 'en';
export type LocaleOptions = {
    locale?: AppLocale | string;
};
/**
 * Normalize UI / navigator locale tags.
 * - en* → en
 * - zh-TW / zh-HK / zh-Hant → zh-TW
 * - else → zh-CN
 *
 * Analysis bilingual copy (createL / pickLocale):
 * - en → English string
 * - zh-CN → Simplified Chinese
 * - zh-TW → Traditional via phrase dictionary (zh-tw-map), not full OpenCC
 * Full UI chrome uses Traditional Chinese in web-ui/public/i18n.js.
 */
export declare function normalizeLocale(v?: string | null): AppLocale;
/**
 * Pick zh or en string for analysis copy.
 * - en → en
 * - zh-TW → traditionalize zh phrase dictionary
 * - else → zh (Simplified)
 */
export declare function pickLocale(locale: AppLocale, zh: string, en: string): string;
/**
 * Locale picker: callable as L(zh, en), also L.t(zh, en) and L.locale.
 * Accepts raw UI locale strings (normalized internally).
 */
export type LFn = ((zh: string, en: string) => string) & {
    t: (zh: string, en: string) => string;
    locale: AppLocale;
};
export declare function createL(localeInput?: AppLocale | string | null | undefined): LFn;
//# sourceMappingURL=locale.d.ts.map