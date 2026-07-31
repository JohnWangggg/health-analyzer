export type AppLocaleUi = 'zh-CN' | 'en';

export type MessageKey =
  | 'brand'
  | 'brandSub'
  | 'nav.overview'
  | 'nav.trends'
  | 'nav.reports'
  | 'nav.data'
  | 'theme'
  | 'theme.system'
  | 'theme.light'
  | 'theme.dark'
  | 'about'
  | 'footer'
  | 'overview.title'
  | 'overview.lead'
  | 'overview.loadFixture'
  | 'overview.importFile'
  | 'overview.importHae'
  | 'overview.loadWh'
  | 'overview.persistWh'
  | 'overview.saveSnap'
  | 'overview.clear'
  | 'overview.priority'
  | 'overview.range'
  | 'overview.empty'
  | 'overview.ctaTrends'
  | 'overview.ctaReports'
  | 'overview.domains'
  | 'dualTrack'
  | 'shell.sessionReady'
  | 'shell.sessionIdle'
  | 'trends.title'
  | 'trends.lead'
  | 'trends.emptyTitle'
  | 'trends.emptyDesc'
  | 'trends.points'
  | 'trends.latest'
  | 'trends.table'
  | 'trends.tableHint'
  | 'trends.emptyDomain'
  | 'trends.domain.steps'
  | 'trends.domain.weight'
  | 'trends.domain.restingHr'
  | 'trends.domain.cgmDailyMean';

const zh: Record<MessageKey, string> = {
  brand: '健康 OS · React',
  brandSub: '本地优先预览 · 非默认生产入口',
  'nav.overview': '总览',
  'nav.trends': '趋势',
  'nav.reports': '报告',
  'nav.data': '数据',
  theme: '主题',
  'theme.system': '系统',
  'theme.light': '浅色',
  'theme.dark': '深色',
  about: '关于',
  footer: '本地优先 · 无 CDN · 生产默认仍为 web-ui/public',
  'overview.title': '今日健康状态',
  'overview.lead':
    '本地优先预览：XML/ZIP/HAE · sharded-v1 数据仓 · 报告与趋势。内核经 adapter/lib，非诊断。',
  'overview.loadFixture': '加载演示夹具',
  'overview.importFile': '导入 XML / ZIP',
  'overview.importHae': '导入 HAE',
  'overview.loadWh': '加载数据仓',
  'overview.persistWh': '写入数据仓',
  'overview.saveSnap': '保存摘要快照',
  'overview.clear': '清除',
  'overview.priority': '优先关注',
  'overview.range': '数据区间',
  'overview.empty': '尚未加载数据',
  'overview.ctaTrends': '打开趋势',
  'overview.ctaReports': '打开报告',
  'overview.domains': '域存在性',
  dualTrack: '双轨',
  'shell.sessionReady': '已加载',
  'shell.sessionIdle': '未加载',
  'trends.title': '趋势工作台',
  'trends.lead':
    '单指标主图（ECharts 按需）+ 数据表回退。手机建议一次只比一个指标。',
  'trends.emptyTitle': '请先在总览加载数据',
  'trends.emptyDesc':
    '主趋势与数据表共用 FullAnalysis 日序列（adapter 提取，不重算统计）。',
  'trends.points': '点',
  'trends.latest': '最新',
  'trends.table': '数据表回退',
  'trends.tableHint': '与图表同一序列（extractTrendSeries）。',
  'trends.emptyDomain': '该域暂无点，可切换其他指标或重新导入。',
  'trends.domain.steps': '步数',
  'trends.domain.weight': '体重',
  'trends.domain.restingHr': '静息心率',
  'trends.domain.cgmDailyMean': 'CGM 日均',
};

const en: Record<MessageKey, string> = {
  brand: 'Health OS · React',
  brandSub: 'Local-first preview · not production default',
  'nav.overview': 'Overview',
  'nav.trends': 'Trends',
  'nav.reports': 'Reports',
  'nav.data': 'Data',
  theme: 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  about: 'About',
  footer: 'Local-first · no CDN · production still web-ui/public',
  'overview.title': "Today's health status",
  'overview.lead':
    'Local-first preview: XML/ZIP/HAE · sharded-v1 warehouse · reports & trends. Core via adapter/lib — not a diagnosis.',
  'overview.loadFixture': 'Load demo fixture',
  'overview.importFile': 'Import XML / ZIP',
  'overview.importHae': 'Import HAE',
  'overview.loadWh': 'Load warehouse',
  'overview.persistWh': 'Save warehouse',
  'overview.saveSnap': 'Save snapshot',
  'overview.clear': 'Clear',
  'overview.priority': 'Priority',
  'overview.range': 'Date range',
  'overview.empty': 'No data loaded yet',
  'overview.ctaTrends': 'Open trends',
  'overview.ctaReports': 'Open reports',
  'overview.domains': 'Domains present',
  dualTrack: 'Dual-track',
  'shell.sessionReady': 'Ready',
  'shell.sessionIdle': 'Idle',
  'trends.title': 'Trends workspace',
  'trends.lead':
    'Single-metric chart (ECharts on demand) + table fallback. On mobile, compare one metric at a time.',
  'trends.emptyTitle': 'Load data on Overview first',
  'trends.emptyDesc':
    'Charts and table share FullAnalysis daily series (adapter extract; no re-stats).',
  'trends.points': 'pts',
  'trends.latest': 'Latest',
  'trends.table': 'Table fallback',
  'trends.tableHint': 'Same series as the chart (extractTrendSeries).',
  'trends.emptyDomain':
    'No points for this domain — switch metric or re-import.',
  'trends.domain.steps': 'Steps',
  'trends.domain.weight': 'Weight',
  'trends.domain.restingHr': 'Resting HR',
  'trends.domain.cgmDailyMean': 'CGM daily mean',
};

const TABLES: Record<AppLocaleUi, Record<MessageKey, string>> = {
  'zh-CN': zh,
  en,
};

export function t(locale: AppLocaleUi, key: MessageKey): string {
  return TABLES[locale][key] || TABLES['zh-CN'][key] || key;
}

/** All message keys — used by parity tests. */
export const MESSAGE_KEYS = Object.keys(zh) as MessageKey[];
