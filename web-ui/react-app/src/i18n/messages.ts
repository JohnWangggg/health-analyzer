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
  | 'overview.emptyHint'
  | 'overview.sessionReadyStrip'
  | 'overview.ctaTrends'
  | 'overview.ctaReports'
  | 'overview.domains'
  | 'overview.kpiSection'
  | 'overview.kpiVisibility'
  | 'overview.kpi.cgm'
  | 'overview.kpi.weight'
  | 'overview.kpi.steps'
  | 'overview.kpi.recovery'
  | 'overview.kpi.restingHr'
  | 'overview.kpi.points'
  | 'overview.kpi.days'
  | 'overview.kpi.nonDiag'
  | 'overview.kpi.openTrends'
  | 'overview.domainsPresentCount'
  | 'dualTrack'
  | 'shell.sessionReady'
  | 'shell.sessionIdle'
  | 'shell.defaultEntry'
  | 'shell.openLegacy'
  | 'shell.kbdHint'
  | 'trends.title'
  | 'trends.lead'
  | 'trends.emptyTitle'
  | 'trends.emptyDesc'
  | 'trends.points'
  | 'trends.latest'
  | 'trends.table'
  | 'trends.tableHint'
  | 'trends.emptyDomain'
  | 'trends.switchAvailable'
  | 'trends.colDate'
  | 'trends.colValue'
  | 'trends.domain.steps'
  | 'trends.domain.weight'
  | 'trends.domain.restingHr'
  | 'trends.domain.cgmDailyMean'
  | 'trends.domain.sleepTotal'
  | 'trends.domain.hrv'
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
  | 'data.title'
  | 'data.leadPrefix'
  | 'data.leadSuffix'
  | 'data.source'
  | 'data.sourceEmpty'
  | 'data.sourceDesc'
  | 'data.span'
  | 'data.spanCounts'
  | 'data.spanEmpty'
  | 'data.bytes'
  | 'data.bytesDesc'
  | 'data.backup'
  | 'data.backupDesc'
  | 'data.backupBadge'
  | 'data.backup.title'
  | 'data.backup.lead'
  | 'data.backup.pass'
  | 'data.backup.passHint'
  | 'data.backup.includeSnapshots'
  | 'data.backup.includeEvents'
  | 'data.backup.includeReports'
  | 'data.backup.includeBatches'
  | 'data.backup.export'
  | 'data.backup.import'
  | 'data.backup.exporting'
  | 'data.backup.importing'
  | 'data.backup.exportOk'
  | 'data.backup.importOk'
  | 'data.backup.fail'
  | 'data.probe'
  | 'data.probeBusy'
  | 'data.probeAction'
  | 'data.contractOk'
  | 'data.contractFail'
  | 'data.consentGranted'
  | 'data.consentDenied'
  | 'data.meta.consent'
  | 'data.meta.span'
  | 'data.meta.approx'
  | 'data.meta.records'
  | 'data.meta.lastWritten'
  | 'data.snapshots'
  | 'data.snapshotsEmpty'
  | 'data.snapLabel'
  | 'data.snapSavedAt'
  | 'data.snapRange'
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
  | 'data.keepN.sharedPrefs'
  | 'data.shards.title'
  | 'data.shards.lead'
  | 'data.shards.refresh'
  | 'data.shards.delete'
  | 'data.shards.deleting'
  | 'data.shards.empty'
  | 'data.shards.confirm'
  | 'data.shards.deleted'
  | 'data.shards.fail'
  | 'data.shards.selected'
  | 'data.shards.total'
  | 'data.shards.bytes';

const zh: Record<MessageKey, string> = {
  brand: '健康 OS',
  brandSub: '本地优先 · 生产默认入口',
  'nav.overview': '总览',
  'nav.trends': '趋势',
  'nav.reports': '报告',
  'nav.data': '数据',
  theme: '主题',
  'theme.system': '系统',
  'theme.light': '浅色',
  'theme.dark': '深色',
  about: '关于',
  footer: '本地优先 · 无 CDN · 默认 React · 回滚 /legacy/',
  'shell.defaultEntry': '默认入口为本壳',
  'shell.openLegacy': '打开旧版回滚 → /legacy/',
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
  'overview.emptyHint':
    '演示夹具 · XML/ZIP · HAE · 数据仓 — 任选一种导入后即可写仓与看趋势',
  'overview.sessionReadyStrip': '会话已就绪 · 可写仓 / 看趋势',
  'overview.ctaTrends': '打开趋势',
  'overview.ctaReports': '打开报告',
  'overview.domains': '域存在性',
  'overview.kpiSection': '关键指标',
  'overview.kpiVisibility': '显示指标',
  'overview.kpi.cgm': 'CGM 均值',
  'overview.kpi.weight': '最近体重',
  'overview.kpi.steps': '最近步数',
  'overview.kpi.recovery': '恢复分',
  'overview.kpi.restingHr': '静息心率',
  'overview.kpi.points': '点',
  'overview.kpi.days': '天',
  'overview.kpi.nonDiag': '非诊断 · 个人启发式',
  'overview.kpi.openTrends': '在趋势中查看',
  'overview.domainsPresentCount': '{n} 域有数据',
  dualTrack: '双轨',
  'shell.sessionReady': '已加载',
  'shell.sessionIdle': '未加载',
  'shell.kbdHint': 'Alt+1–4 切换工作区',
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
  'trends.switchAvailable': '切换到有数据的指标',
  'trends.colDate': '日期',
  'trends.colValue': '值',
  'trends.domain.steps': '步数',
  'trends.domain.weight': '体重',
  'trends.domain.restingHr': '静息心率',
  'trends.domain.cgmDailyMean': 'CGM 日均',
  'trends.domain.sleepTotal': '睡眠时长',
  'trends.domain.hrv': '心率变异',
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
  'data.title': '数据仓',
  'data.leadPrefix': '会话状态 + 共享 IDB（',
  'data.leadSuffix':
    '）。写入在总览走 sharded-v1 整仓替换；本地可选口令备份与 legacy 兼容。',
  'data.source': '会话来源',
  'data.sourceEmpty': '尚未加载会话数据',
  'data.sourceDesc': '当前 React 会话（adapter 解析结果）。',
  'data.span': '会话跨度',
  'data.spanCounts':
    'CGM {cgm} · 体重 {weight} · 步数日 {stepsDays}',
  'data.spanEmpty': '加载数据后显示',
  'data.bytes': '会话占用（约）',
  'data.bytesDesc': '内存 FullAnalysis 近似。',
  'data.backup': '备份',
  'data.backupDesc':
    '本地 AES-GCM 可选口令；与 legacy .hae-backup.json 兼容。',
  'data.backupBadge': 'AES-GCM · .hae-backup.json',
  'data.backup.title': '仓库备份',
  'data.backup.lead':
    '导出/导入本地数据仓备份。可选口令 AES-GCM 加密；格式兼容 legacy .hae-backup.json。非诊断。',
  'data.backup.pass': '备份口令（可选）',
  'data.backup.passHint': '留空则明文 JSON；填写则加密（至少 4 位）',
  'data.backup.includeSnapshots': '包含摘要快照',
  'data.backup.includeEvents': '包含健康事件',
  'data.backup.includeReports': '包含周报',
  'data.backup.includeBatches': '包含导入批次',
  'data.backup.export': '导出备份',
  'data.backup.import': '导入备份',
  'data.backup.exporting': '导出中…',
  'data.backup.importing': '导入中…',
  'data.backup.exportOk': '备份已导出并开始下载',
  'data.backup.importOk': '备份已导入仓库',
  'data.backup.fail': '备份失败',
  'data.probe': '共享仓库探测',
  'data.probeBusy': '读取中…',
  'data.probeAction': '读取本地仓库',
  'data.contractOk': '契约匹配',
  'data.contractFail': '契约不完整',
  'data.consentGranted': '已授权',
  'data.consentDenied': '未授权',
  'data.meta.consent': 'consent',
  'data.meta.span': '跨度',
  'data.meta.approx': '约占用',
  'data.meta.records': '记录数',
  'data.meta.lastWritten': '最近写入',
  'data.snapshots': '摘要快照（{count}）',
  'data.snapshotsEmpty': '尚无快照（可在 legacy 分析后保存）。',
  'data.snapLabel': '标签',
  'data.snapSavedAt': 'savedAt',
  'data.snapRange': '区间',
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
  'data.shards.title': '分片清理（多选）',
  'data.shards.lead':
    '按域列出非 core 分片，勾选后删除。仅允许 cgm|月 与已知年域|年。需已授权。非诊断。',
  'data.shards.refresh': '刷新分片列表',
  'data.shards.delete': '删除所选',
  'data.shards.deleting': '删除中…',
  'data.shards.empty': '无域分片或未授权/空仓',
  'data.shards.confirm': '确认删除 {n} 个分片？此操作不可撤销。',
  'data.shards.deleted': '已删除 {n} 个分片',
  'data.shards.fail': '分片操作失败',
  'data.shards.selected': '已选 {n}',
  'data.shards.total': '共 {n} 个域分片',
  'data.shards.bytes': '约 {kb} KB',
};

const en: Record<MessageKey, string> = {
  brand: 'Health OS',
  brandSub: 'Local-first · production default',
  'nav.overview': 'Overview',
  'nav.trends': 'Trends',
  'nav.reports': 'Reports',
  'nav.data': 'Data',
  theme: 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  about: 'About',
  footer: 'Local-first · no CDN · React default · rollback /legacy/',
  'shell.defaultEntry': 'This shell is the default entry',
  'shell.openLegacy': 'Open legacy rollback → /legacy/',
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
  'overview.emptyHint':
    'Demo fixture · XML/ZIP · HAE · warehouse — import any source, then persist or open trends',
  'overview.sessionReadyStrip': 'Session ready · persist warehouse / open trends',
  'overview.ctaTrends': 'Open trends',
  'overview.ctaReports': 'Open reports',
  'overview.domains': 'Domains present',
  'overview.kpiSection': 'Key metrics',
  'overview.kpiVisibility': 'Show metrics',
  'overview.kpi.cgm': 'CGM mean',
  'overview.kpi.weight': 'Latest weight',
  'overview.kpi.steps': 'Latest steps',
  'overview.kpi.recovery': 'Recovery score',
  'overview.kpi.restingHr': 'Resting HR',
  'overview.kpi.points': 'pts',
  'overview.kpi.days': 'days',
  'overview.kpi.nonDiag': 'Non-diagnostic · personal heuristic',
  'overview.kpi.openTrends': 'Open in Trends',
  'overview.domainsPresentCount': '{n} domains present',
  dualTrack: 'Dual-track',
  'shell.sessionReady': 'Ready',
  'shell.sessionIdle': 'Idle',
  'shell.kbdHint': 'Alt+1–4 switch workspace',
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
  'trends.switchAvailable': 'Switch to a domain with data',
  'trends.colDate': 'Date',
  'trends.colValue': 'Value',
  'trends.domain.steps': 'Steps',
  'trends.domain.weight': 'Weight',
  'trends.domain.restingHr': 'Resting HR',
  'trends.domain.cgmDailyMean': 'CGM daily mean',
  'trends.domain.sleepTotal': 'Sleep total',
  'trends.domain.hrv': 'HRV',
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
  'data.title': 'Data warehouse',
  'data.leadPrefix': 'Session state + shared IDB (',
  'data.leadSuffix':
    '). Writes on Overview use sharded-v1 full-warehouse replace; local optional-passphrase backup is legacy-compatible.',
  'data.source': 'Session source',
  'data.sourceEmpty': 'No session data loaded yet',
  'data.sourceDesc': 'Current React session (adapter parse result).',
  'data.span': 'Session span',
  'data.spanCounts':
    'CGM {cgm} · weight {weight} · step days {stepsDays}',
  'data.spanEmpty': 'Shown after data is loaded',
  'data.bytes': 'Session size (approx.)',
  'data.bytesDesc': 'In-memory FullAnalysis estimate.',
  'data.backup': 'Backup',
  'data.backupDesc':
    'Local AES-GCM optional passphrase; compatible with legacy .hae-backup.json.',
  'data.backupBadge': 'AES-GCM · .hae-backup.json',
  'data.backup.title': 'Warehouse backup',
  'data.backup.lead':
    'Export/import local warehouse backups. Optional AES-GCM passphrase; format compatible with legacy .hae-backup.json. Not a diagnosis.',
  'data.backup.pass': 'Passphrase (optional)',
  'data.backup.passHint': 'Leave empty for plain JSON; set to encrypt (min 4 chars)',
  'data.backup.includeSnapshots': 'Include summary snapshots',
  'data.backup.includeEvents': 'Include health events',
  'data.backup.includeReports': 'Include weekly reports',
  'data.backup.includeBatches': 'Include import batches',
  'data.backup.export': 'Export backup',
  'data.backup.import': 'Import backup',
  'data.backup.exporting': 'Exporting…',
  'data.backup.importing': 'Importing…',
  'data.backup.exportOk': 'Backup exported — download started',
  'data.backup.importOk': 'Backup imported into warehouse',
  'data.backup.fail': 'Backup failed',
  'data.probe': 'Shared warehouse probe',
  'data.probeBusy': 'Reading…',
  'data.probeAction': 'Read local warehouse',
  'data.contractOk': 'Contract match',
  'data.contractFail': 'Contract incomplete',
  'data.consentGranted': 'Granted',
  'data.consentDenied': 'Not granted',
  'data.meta.consent': 'consent',
  'data.meta.span': 'Span',
  'data.meta.approx': 'Approx. size',
  'data.meta.records': 'Records',
  'data.meta.lastWritten': 'Last written',
  'data.snapshots': 'Summary snapshots ({count})',
  'data.snapshotsEmpty':
    'No snapshots yet (save after analysis in legacy).',
  'data.snapLabel': 'Label',
  'data.snapSavedAt': 'savedAt',
  'data.snapRange': 'Range',
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
  'data.shards.title': 'Shard cleanup (multi-select)',
  'data.shards.lead':
    'List non-core domain shards; select and delete. Only cgm|month and known year-domain|year ids. Requires consent. Not a diagnosis.',
  'data.shards.refresh': 'Refresh shard list',
  'data.shards.delete': 'Delete selected',
  'data.shards.deleting': 'Deleting…',
  'data.shards.empty': 'No domain shards, or unauthorized / empty warehouse',
  'data.shards.confirm': 'Delete {n} shard(s)? This cannot be undone.',
  'data.shards.deleted': 'Deleted {n} shard(s)',
  'data.shards.fail': 'Shard operation failed',
  'data.shards.selected': '{n} selected',
  'data.shards.total': '{n} domain shards',
  'data.shards.bytes': '~{kb} KB',
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
