/**
 * Lightweight Simplified → Traditional map for analysis copy (zh-TW).
 * Not full OpenCC / NLP — phrase dictionary only (longest match first).
 * UI chrome remains fully Traditional in web-ui/public/i18n.js.
 */
/**
 * Convert Simplified Chinese analysis strings to Traditional for zh-TW.
 * Phrase dictionary (longest-first). Idempotent on already-Traditional text.
 * Alias: toTraditionalText.
 */
export declare function toTraditionalTitle(s: string): string;
/** @see toTraditionalTitle */
export declare const toTraditionalText: typeof toTraditionalTitle;
/**
 * Apply toTraditionalTitle to markdown ## / ### heading lines only.
 */
export declare function traditionalizeMarkdownHeadings(md: string): string;
/**
 * Traditionalize free-form analysis body (insights detail, signals, status).
 * Same dictionary as titles; safe to call repeatedly.
 */
export declare function traditionalizeAnalysisCopy(s: string): string;
//# sourceMappingURL=zh-tw-map.d.ts.map