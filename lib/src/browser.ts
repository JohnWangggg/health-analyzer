/**
 * 浏览器 IIFE 入口
 * esbuild: format=iife, globalName=HealthAnalyzer
 * 产出挂载 window.HealthAnalyzer / globalThis.HealthAnalyzer
 */

export {
  parseHealthXml,
  parseHealthXmlAsync,
  parseXmlStream,
  parseBytesStream,
  parseEcgCsv,
  extractXmlFromZip,
  createEmptyData,
  processRecord,
  finalizeData,
  finalizeCgmUnits,
  getDate,
  getHour,
  parseRecordLine,
  parseAppleDate,
  getLocalToday,
  isFutureDate,
} from './parser';

export {
  classifyGlucoseUnit,
  toMmolL,
  inferGlucoseUnitFromValues,
  MGDL_PER_MMOL,
} from './glucose';

export {
  analyzeAll,
  calcCgmStats,
  calcBloodPressureStats,
  calcWeightStats,
  calcWatchStats,
  calcWorkoutStats,
  calcEcgStats,
  enrichEcgWithContext,
  calcRecoveryWeek,
  calcRecoveryWeeks,
  recomputeRecovery,
  normalizeRecoveryWeights,
  summarizeHrvByDay,
  attachRecoveryBaseline,
  calendarWindowEndInclusive,
  countDaysWithData,
  addDaysIso,
  daysBetween,
} from './stats';

export { DEFAULT_RECOVERY_WEIGHTS, RECOVERY_WEIGHT_PRESETS } from './types';
export type { RecoveryWeights, RecoveryWeightPresetId } from './types';

export {
  processWorkoutBlock,
  processXmlLine,
  shortWorkoutType,
  workoutTypeLabel,
  mergeEcgEntries,
  xmlAttr,
} from './parser';

export {
  generateLLMPrompt,
  generateDataOnly,
  formatAnalysisForLLM,
  formatUserContext,
  SHORT_SYSTEM_PROMPT,
  SHORT_SYSTEM_PROMPT_EN,
  MAIN_PROMPT_TEMPLATE,
  MAIN_PROMPT_TEMPLATE_EN,
} from './prompts/llm-prompt';

export {
  buildAnalysisSnapshot,
  compareSnapshots,
} from './snapshot';

export {
  normalizeLocale,
  pickLocale,
  createL,
} from './locale';
export type { AppLocale, LFn, LocaleOptions } from './locale';

export {
  toTraditionalTitle,
  toTraditionalText,
  traditionalizeMarkdownHeadings,
  traditionalizeAnalysisCopy,
} from './zh-tw-map';

export {
  detectCrossSignals,
  formatCrossSignalsForLLM,
} from './signals';

export {
  buildInsightBullets,
  formatInsightsForLLM,
  generateInsightsOnlyPrompt,
} from './insights';

export {
  buildExportBundle,
  joinCsvBundle,
  generateWeeklyReportMarkdown,
  generateVisitSummaryMarkdown,
} from './export';

export {
  parseWeightScaleCsv,
  parseBloodPressureCsv,
  mergeExternalCsvIntoData,
} from './csv-import';

// 兼容历史 lib.js：calcBpStats 别名
export { calcBloodPressureStats as calcBpStats } from './stats';
