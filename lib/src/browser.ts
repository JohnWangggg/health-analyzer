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
  getDate,
  getHour,
  parseRecordLine,
  parseAppleDate,
  getLocalToday,
  isFutureDate,
} from './parser';

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
} from './stats';

export { DEFAULT_RECOVERY_WEIGHTS } from './types';
export type { RecoveryWeights } from './types';

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
  MAIN_PROMPT_TEMPLATE,
} from './prompts/llm-prompt';

export {
  buildAnalysisSnapshot,
  compareSnapshots,
} from './snapshot';

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
} from './export';

export {
  parseWeightScaleCsv,
  parseBloodPressureCsv,
  mergeExternalCsvIntoData,
} from './csv-import';

// 兼容历史 lib.js：calcBpStats 别名
export { calcBloodPressureStats as calcBpStats } from './stats';
