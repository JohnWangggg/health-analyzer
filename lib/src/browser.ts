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
  summarizeHrvByDay,
} from './stats';

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
} from './insights';

export {
  buildExportBundle,
  joinCsvBundle,
} from './export';

// 兼容历史 lib.js：calcBpStats 别名
export { calcBloodPressureStats as calcBpStats } from './stats';
