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
} from './parser';

export {
  analyzeAll,
  calcCgmStats,
  calcBloodPressureStats,
  summarizeHrvByDay,
} from './stats';

export {
  generateLLMPrompt,
  generateDataOnly,
  formatAnalysisForLLM,
  SHORT_SYSTEM_PROMPT,
  MAIN_PROMPT_TEMPLATE,
} from './prompts/llm-prompt';

// 兼容历史 lib.js：calcBpStats 别名
export { calcBloodPressureStats as calcBpStats } from './stats';
