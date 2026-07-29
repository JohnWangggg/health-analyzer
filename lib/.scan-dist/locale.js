"use strict";
/** UI / analysis copy locale helpers */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeLocale = normalizeLocale;
exports.pickLocale = pickLocale;
exports.createL = createL;
const zh_tw_map_1 = require("./zh-tw-map");
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
function normalizeLocale(v) {
    if (v == null || v === '')
        return 'zh-CN';
    const s = String(v).trim();
    const lower = s.toLowerCase().replace(/_/g, '-');
    if (s === 'en' || lower === 'en' || lower.startsWith('en-'))
        return 'en';
    if (lower === 'zh-tw' ||
        lower.startsWith('zh-tw') ||
        lower === 'zh-hk' ||
        lower.startsWith('zh-hk') ||
        lower.includes('hant')) {
        return 'zh-TW';
    }
    return 'zh-CN';
}
/**
 * Pick zh or en string for analysis copy.
 * - en → en
 * - zh-TW → traditionalize zh phrase dictionary
 * - else → zh (Simplified)
 */
function pickLocale(locale, zh, en) {
    if (locale === 'en')
        return en;
    if (locale === 'zh-TW')
        return (0, zh_tw_map_1.toTraditionalTitle)(zh);
    return zh;
}
function createL(localeInput = 'zh-CN') {
    const locale = normalizeLocale(localeInput);
    const pick = (zh, en) => pickLocale(locale, zh, en);
    const fn = ((zh, en) => pick(zh, en));
    fn.t = pick;
    fn.locale = locale;
    return fn;
}
//# sourceMappingURL=locale.js.map