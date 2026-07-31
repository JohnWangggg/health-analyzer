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
  | 'trends.domain.cgmDailyMean'
  | 'reports.title'
  | 'reports.lead'
  | 'reports.emptyTitle'
  | 'reports.emptyDesc'
  | 'reports.kind.visit'
  | 'reports.kind.weekly'
  | 'reports.kind.clinical'
  | 'reports.copy'
  | 'reports.download'
  | 'reports.chars'
  | 'reports.viaAdapter'
  | 'reports.copied'
  | 'reports.copyFail'
  | 'reports.downloaded'
  | 'data.softQuota.title'
  | 'data.softQuota.lead'
  | 'data.softQuota.note'
  | 'data.softQuota.approx'
  | 'data.softQuota.lastWritten'
  | 'data.softQuota.step.cgm'
  | 'data.softQuota.step.bpWeight'
  | 'data.softQuota.step.sleepSteps'
  | 'data.softQuota.step.hrvHr'
  | 'data.softQuota.step.workoutsEcgWatch'
  | 'data.keepN.title'
  | 'data.keepN.lead'
  | 'data.keepN.cgmMonths'
  | 'data.keepN.yearYears'
  | 'data.keepN.autoTrim'
  | 'data.keepN.forecast'
  | 'data.keepN.forecastNeedProbe'
  | 'data.keepN.apply'
  | 'data.keepN.applying'
  | 'data.keepN.applied'
  | 'data.keepN.noop'
  | 'data.keepN.empty'
  | 'data.keepN.fail'
  | 'data.keepN.sharedPrefs';

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
  'reports.title': '报告',
  'reports.lead':
    '选择类型 → 预览 Markdown → 复制或下载。内核：visit / weekly / clinical 生成器。',
  'reports.emptyTitle': '请先在总览加载数据',
  'reports.emptyDesc':
    '报告预览通过 HealthCoreAdapter → lib 报告生成器，不在 UI 重写统计。',
  'reports.kind.visit': '门诊一页纸',
  'reports.kind.weekly': '周报',
  'reports.kind.clinical': '临床复盘',
  'reports.copy': '复制 Markdown',
  'reports.download': '下载 .md',
  'reports.chars': '字符数',
  'reports.viaAdapter': '经适配器调用 lib',
  'reports.copied': '已复制到剪贴板（仅本机，未上传）',
  'reports.copyFail': '复制失败：请手动选择预览文本',
  'reports.downloaded': '已下载 {filename}',
  'data.softQuota.title': '软配额（写入时）',
  'data.softQuota.lead':
    '超软配额时，写入路径 persistHealthDataSharded 会按固定顺序淘汰最旧分片。策略说明，非诊断。',
  'data.softQuota.note':
    '写入时自动生效；下方 keep-N 可主动裁剪窗口（与 legacy 共用 localStorage）。',
  'data.softQuota.approx': '约占用',
  'data.softQuota.lastWritten': '最近写入',
  'data.softQuota.step.cgm': 'CGM 月片',
  'data.softQuota.step.bpWeight': '血压 / 体重年片',
  'data.softQuota.step.sleepSteps': '睡眠 / 步数年片',
  'data.softQuota.step.hrvHr': 'HRV / 静息 / 步行心率年片',
  'data.softQuota.step.workoutsEcgWatch': '训练 / ECG / 手表日汇总年片',
  'data.keepN.title': '保留窗口 keep-N',
  'data.keepN.lead':
    '仅保留最近 N 个月 CGM 与 N 年各域年片。与 legacy 共用偏好键；应用会整仓 sharded-v1 重写。非诊断。',
  'data.keepN.cgmMonths': 'CGM 保留月数',
  'data.keepN.yearYears': '年片保留年数',
  'data.keepN.autoTrim': '写入后自动 keep-N（默认关）',
  'data.keepN.forecast': '预估将删除：{months} 个 CGM 月 · {years} 个年片',
  'data.keepN.forecastNeedProbe': '先「读取本地仓库」可预估删除量',
  'data.keepN.apply': '对仓库应用 keep-N',
  'data.keepN.applying': '应用中…',
  'data.keepN.applied': '已应用：删除 {months} 月 + {years} 年片',
  'data.keepN.noop': '已在窗口内，无需删除',
  'data.keepN.empty': '仓库为空或未授权，无法应用',
  'data.keepN.fail': '应用失败',
  'data.keepN.sharedPrefs': 'prefs 与 legacy 共享',
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
  'reports.title': 'Reports',
  'reports.lead':
    'Pick a type → preview Markdown → copy or download. Core: visit / weekly / clinical generators.',
  'reports.emptyTitle': 'Load data on Overview first',
  'reports.emptyDesc':
    'Report preview goes through HealthCoreAdapter → lib generators; UI does not recompute stats.',
  'reports.kind.visit': 'Visit one-pager',
  'reports.kind.weekly': 'Weekly report',
  'reports.kind.clinical': 'Clinical review',
  'reports.copy': 'Copy Markdown',
  'reports.download': 'Download .md',
  'reports.chars': 'chars',
  'reports.viaAdapter': 'Via adapter → lib',
  'reports.copied': 'Copied to clipboard (local only, not uploaded)',
  'reports.copyFail': 'Copy failed — select preview text manually',
  'reports.downloaded': 'Downloaded {filename}',
  'data.softQuota.title': 'Soft quota (on write)',
  'data.softQuota.lead':
    'When over soft quota, persistHealthDataSharded evicts oldest shards in a fixed order. Policy only — not a diagnosis.',
  'data.softQuota.note':
    'Automatic on write; keep-N below can trim windows (prefs shared with legacy).',
  'data.softQuota.approx': 'Approx. size',
  'data.softQuota.lastWritten': 'Last written',
  'data.softQuota.step.cgm': 'CGM months',
  'data.softQuota.step.bpWeight': 'BP / weight years',
  'data.softQuota.step.sleepSteps': 'Sleep / steps years',
  'data.softQuota.step.hrvHr': 'HRV / resting / walking HR years',
  'data.softQuota.step.workoutsEcgWatch': 'Workouts / ECG / watch daily years',
  'data.keepN.title': 'Keep-N windows',
  'data.keepN.lead':
    'Keep newest N CGM months and N years per domain. Prefs shared with legacy; apply rewrites sharded-v1. Not a diagnosis.',
  'data.keepN.cgmMonths': 'CGM keep months',
  'data.keepN.yearYears': 'Year-shard keep years',
  'data.keepN.autoTrim': 'Auto keep-N after write (off by default)',
  'data.keepN.forecast': 'Would drop: {months} CGM months · {years} year shards',
  'data.keepN.forecastNeedProbe': 'Probe local warehouse first to estimate drops',
  'data.keepN.apply': 'Apply keep-N to warehouse',
  'data.keepN.applying': 'Applying…',
  'data.keepN.applied': 'Applied: dropped {months} months + {years} year shards',
  'data.keepN.noop': 'Already within windows — nothing dropped',
  'data.keepN.empty': 'Warehouse empty or no consent',
  'data.keepN.fail': 'Apply failed',
  'data.keepN.sharedPrefs': 'prefs shared with legacy',
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
