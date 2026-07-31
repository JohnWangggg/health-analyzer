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
  | 'dualTrack';

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
};

const TABLES: Record<AppLocaleUi, Record<MessageKey, string>> = {
  'zh-CN': zh,
  en,
};

export function t(locale: AppLocaleUi, key: MessageKey): string {
  return TABLES[locale][key] || TABLES['zh-CN'][key] || key;
}
