import { toTraditionalTitle } from '@health-analyzer/lib';

export type AppLocaleUi = 'zh-CN' | 'zh-TW' | 'en';

export type MessageKey =
  | 'brand'
  | 'brandSub'
  | 'nav.overview'
  | 'nav.trends'
  | 'nav.reports'
  | 'nav.data'
  | 'nav.overview.desc'
  | 'nav.trends.desc'
  | 'nav.reports.desc'
  | 'nav.data.desc'
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
  | 'overview.importFolder'
  | 'overview.folder.none'
  | 'overview.haeCancel'
  | 'overview.loadWh'
  | 'overview.persistWh'
  | 'overview.saveSnap'
  | 'overview.clear'
  | 'overview.priority'
  | 'overview.range'
  | 'overview.empty'
  | 'overview.emptyHint'
  | 'overview.empty.step1'
  | 'overview.empty.step2'
  | 'overview.empty.step3'
  | 'overview.loading'
  | 'overview.loadingDetail'
  | 'overview.success.import'
  | 'overview.success.zip'
  | 'overview.success.hae'
  | 'overview.success.warehouse'
  | 'overview.success.csv'
  | 'overview.success.reanalyze'
  | 'overview.success.hint'
  | 'overview.success.openTrends'
  | 'overview.sessionReadyStrip'
  | 'overview.tools.summary'
  | 'overview.tools.more'
  | 'overview.tools.less'
  | 'overview.source'
  | 'overview.snapRecent'
  | 'overview.haeNotes'
  | 'overview.trendStrip.title'
  | 'overview.trendStrip.range'
  | 'overview.signals.kicker'
  | 'overview.signals.title'
  | 'overview.signals.link'
  | 'overview.signals.expand'
  | 'overview.signals.collapse'
  | 'overview.prompt.label'
  | 'overview.prompt.mode.full'
  | 'overview.prompt.mode.data'
  | 'overview.prompt.mode.short'
  | 'overview.prompt.copy'
  | 'overview.prompt.copied'
  | 'overview.prompt.copyFail'
  | 'overview.prompt.noAnalysis'
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
  | 'overview.kpiOrder.up'
  | 'overview.kpiOrder.down'
  | 'overview.quality.title'
  | 'overview.quality.future'
  | 'overview.quality.cgmUnit'
  | 'overview.quality.hint'
  | 'overview.domainsPresentCount'
  | 'overview.today.title'
  | 'overview.today.range'
  | 'overview.today.cgm'
  | 'overview.today.steps'
  | 'overview.today.weight'
  | 'overview.today.recovery'
  | 'overview.today.freshness'
  | 'overview.today.nonDiag'
  | 'overview.today.anomaly'
  | 'overview.today.anomaly.stale'
  | 'overview.ctx.summary'
  | 'overview.ctx.hint'
  | 'overview.ctx.age'
  | 'overview.ctx.sex'
  | 'overview.ctx.height'
  | 'overview.ctx.targetWeight'
  | 'overview.ctx.medications'
  | 'overview.ctx.conditions'
  | 'overview.ctx.focus'
  | 'overview.ctx.notes'
  | 'overview.ctx.save'
  | 'overview.ctx.clear'
  | 'overview.ctx.saved'
  | 'overview.ctx.cleared'
  | 'overview.ctx.saveFail'
  | 'overview.ctx.includeSensitive'
  | 'overview.ctx.includeEvents'
  | 'overview.dateFilter.summary'
  | 'overview.dateFilter.hint'
  | 'overview.dateFilter.start'
  | 'overview.dateFilter.end'
  | 'overview.dateFilter.apply'
  | 'overview.dateFilter.clear'
  | 'overview.dateFilter.applied'
  | 'overview.dateFilter.saved'
  | 'overview.dateFilter.cleared'
  | 'overview.dateFilter.invalid'
  | 'overview.events.summary'
  | 'overview.events.hint'
  | 'overview.events.kind'
  | 'overview.events.date'
  | 'overview.events.title'
  | 'overview.events.note'
  | 'overview.events.add'
  | 'overview.events.refresh'
  | 'overview.events.delete'
  | 'overview.events.empty'
  | 'overview.events.added'
  | 'overview.events.deleted'
  | 'overview.events.needDate'
  | 'overview.events.importMeds'
  | 'overview.events.includeTaken'
  | 'overview.events.medsOk'
  | 'overview.csv.summary'
  | 'overview.csv.hint'
  | 'overview.csv.weight'
  | 'overview.csv.bp'
  | 'overview.csv.apply'
  | 'overview.csv.needFile'
  | 'overview.csv.applied'
  | 'overview.recovery.summary'
  | 'overview.recovery.hint'
  | 'overview.recovery.preset.balanced'
  | 'overview.recovery.preset.recoveryFirst'
  | 'overview.recovery.preset.training'
  | 'overview.recovery.preset.weightLoss'
  | 'overview.recovery.saved'
  | 'overview.recovery.reanalyzed'
  | 'dualTrack'
  | 'shell.sessionReady'
  | 'shell.sessionIdle'
  | 'shell.defaultEntry'
  | 'shell.recoveryTitle'
  | 'shell.recoveryHint'
  | 'shell.kbdHint'
  | 'shell.offline'
  | 'shell.install.body'
  | 'shell.install.action'
  | 'shell.install.dismiss'
  | 'shell.settings'
  | 'shell.aboutBody'
  | 'shell.freshness.idle'
  | 'shell.freshness.today'
  | 'shell.freshness.yesterday'
  | 'shell.freshness.days'
  | 'shell.freshness.stale'
  | 'tv.enter'
  | 'tv.exit'
  | 'tv.dataUpdated'
  | 'tv.dataWaiting'
  | 'tv.focus.metrics'
  | 'tv.focus.signals'
  | 'tv.focus.priority'
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
  | 'trends.range'
  | 'trends.range.days'
  | 'trends.range.all'
  | 'trends.compare'
  | 'trends.compare.none'
  | 'trends.compare.hint'
  | 'trends.presets'
  | 'trends.presets.namePh'
  | 'trends.presets.save'
  | 'trends.presets.delete'
  | 'trends.presets.hint'
  | 'trends.presets.empty'
  | 'reports.title'
  | 'reports.lead'
  | 'reports.emptyTitle'
  | 'reports.emptyDesc'
  | 'reports.emptyAction'
  | 'reports.kind.visit'
  | 'reports.kind.weekly'
  | 'reports.kind.clinical'
  | 'reports.copy'
  | 'reports.download'
  | 'reports.downloadHtml'
  | 'reports.chars'
  | 'reports.viaAdapter'
  | 'reports.localOnly'
  | 'reports.kindRemembered'
  | 'reports.copied'
  | 'reports.copyFail'
  | 'reports.downloaded'
  | 'reports.includeSensitive'
  | 'reports.includeEvents'
  | 'reports.useUserContext'
  | 'data.title'
  | 'data.lead'
  | 'data.leadPrefix'
  | 'data.leadSuffix'
  | 'data.section.status'
  | 'data.section.statusLead'
  | 'data.section.export'
  | 'data.section.exportLead'
  | 'data.section.backup'
  | 'data.section.backupLead'
  | 'data.section.space'
  | 'data.section.spaceLead'
  | 'data.section.privacy'
  | 'data.section.privacyLead'
  | 'data.layout.sharded'
  | 'data.layout.legacy'
  | 'data.layout.unknown'
  | 'data.meta.title'
  | 'data.storageDetail'
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
  | 'data.keepN.presets'
  | 'data.keepN.preset.compact'
  | 'data.keepN.preset.year'
  | 'data.keepN.preset.tight'
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
  | 'data.shards.bytes'
  | 'data.export.title'
  | 'data.export.lead'
  | 'data.export.json'
  | 'data.export.csv'
  | 'data.export.snapshot'
  | 'data.export.needAnalysis'
  | 'data.export.okJson'
  | 'data.export.okCsv'
  | 'data.export.okSnap'
  | 'data.export.fail'
  | 'data.fhir.title'
  | 'data.fhir.badge'
  | 'data.fhir.lead'
  | 'data.fhir.includeDevices'
  | 'data.fhir.export'
  | 'data.fhir.needAnalysis'
  | 'data.fhir.ok'
  | 'data.fhir.fail'
  | 'data.fhir.valOk'
  | 'data.fhir.valWarn'
  | 'data.fhir.tier'
  | 'data.fhir.tier.archive'
  | 'data.fhir.tier.exchange'
  | 'data.fhir.exchangeBlocked'
  | 'data.privacy.title'
  | 'data.privacy.lead'
  | 'data.privacy.action'
  | 'data.privacy.busy'
  | 'data.privacy.confirm'
  | 'data.privacy.ok'
  | 'data.privacy.fail'
  | 'data.compare.title'
  | 'data.compare.lead'
  | 'data.compare.needSnaps'
  | 'data.compare.needTwo'
  | 'data.compare.missing'
  | 'data.compare.ok'
  | 'data.compare.a'
  | 'data.compare.b'
  | 'data.compare.run'
  | 'data.compare.refresh'
  | 'data.compare.metric';

const zh: Record<MessageKey, string> = {
  brand: '健康 OS',
  brandSub: '数据保存在此设备',
  'nav.overview': '总览',
  'nav.trends': '趋势',
  'nav.reports': '报告',
  'nav.data': '数据',
  'nav.overview.desc': '今日状态与优先关注',
  'nav.trends.desc': '指标变化与对比',
  'nav.reports.desc': '门诊与周报',
  'nav.data.desc': '备份、导出与清理',
  theme: '主题',
  'theme.system': '系统',
  'theme.light': '浅色',
  'theme.dark': '深色',
  about: '关于',
  footer: '本地优先 · 无上传 · 数据可备份',
  'shell.defaultEntry': '本应用仅在本机运行，健康明细不上传服务器。',
  'shell.recoveryTitle': '版本回退与本机数据恢复',
  'shell.recoveryHint':
    '旧版界面已移除。应用版本请用上一部署或 Git 回退。本机数据：数据页备份导出/导入，或重新导入 Apple 健康 ZIP。详见 docs/DATA_RECOVERY.md。',
  'overview.title': '今日健康状态',
  'overview.lead':
    '先看恢复与优先关注，再决定是否打开趋势或报告。数据仅保存在此设备，不构成诊断。',
  'overview.loadFixture': '加载演示夹具',
  'overview.importFile': '导入 XML / ZIP',
  'overview.importHae': '导入 HAE',
  'overview.importFolder': '导入文件夹',
  'overview.folder.none': '文件夹中未找到 export.xml / 导出.xml / ZIP',
  'overview.haeCancel': '取消 HAE',
  'overview.loadWh': '加载本机数据',
  'overview.persistWh': '保存到本机',
  'overview.saveSnap': '保存摘要快照',
  'overview.clear': '清除',
  'overview.priority': '优先关注',
  'overview.range': '数据区间',
  'overview.empty': '从一条今日状态开始',
  'overview.emptyHint':
    '导入 iPhone「健康」导出包，或先用演示数据熟悉恢复分与优先关注。数据只留在此设备。',
  'overview.empty.step1': '导入 ZIP / XML，或加载演示',
  'overview.empty.step2': '查看恢复分与今日优先关注',
  'overview.empty.step3': '需要时再打开趋势或报告',
  'overview.loading': '正在解读本机健康数据…',
  'overview.loadingDetail': '解析与统计均在浏览器内完成，不会上传。',
  'overview.success.import': '已加载，可以看今日状态了',
  'overview.success.zip': 'ZIP 导入完成',
  'overview.success.hae': '增量数据已合并',
  'overview.success.warehouse': '已从本机数据恢复',
  'overview.success.csv': '外部 CSV 已合并',
  'overview.success.reanalyze': '已按当前设置重算',
  'overview.success.hint': '恢复分与优先关注已更新 · 数据仅本机',
  'overview.success.openTrends': '打开趋势',
  'overview.sessionReadyStrip': '数据已就绪 · 可保存到本机或查看趋势',
  'overview.tools.summary': '导入与高级工具',
  'overview.tools.more': '更多',
  'overview.tools.less': '收起',
  'overview.source': '来源',
  'overview.snapRecent': '最近快照',
  'overview.haeNotes': '增量导入摘要',
  'overview.trendStrip.title': '近况趋势',
  'overview.trendStrip.range': '趋势天数',
  'overview.signals.kicker': '承接上方优先关注',
  'overview.signals.title': '依据与线索',
  'overview.signals.link': '查看依据与线索',
  'overview.signals.expand': '查看全部 {n} 条',
  'overview.signals.collapse': '收起线索',
  'overview.prompt.label': '大模型提示词',
  'overview.prompt.mode.full': '完整',
  'overview.prompt.mode.data': '仅数据',
  'overview.prompt.mode.short': '简短系统提示',
  'overview.prompt.copy': '复制提示词',
  'overview.prompt.copied': '已复制（{n} 字，仅本机剪贴板）',
  'overview.prompt.copyFail': '复制失败，请手动选择文本',
  'overview.prompt.noAnalysis': '请先加载数据',
  'overview.ctaTrends': '打开趋势',
  'overview.ctaReports': '打开报告',
  'overview.domains': '可用数据类别',
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
  'overview.kpiOrder.up': '上移 KPI',
  'overview.kpiOrder.down': '下移 KPI',
  'overview.quality.title': '数据质量提示',
  'overview.quality.future': '已跳过 {n} 条未来日期记录（常见于误录）',
  'overview.quality.cgmUnit': 'CGM 单位可能不可靠（显示 {unit}），请结合来源核对',
  'overview.quality.hint': '非诊断；仅反映解析器启发式过滤结果。',
  'overview.domainsPresentCount': '{n} 类健康数据可用',
  'overview.today.title': '今日快照',
  'overview.today.range': '区间',
  'overview.today.cgm': 'CGM',
  'overview.today.steps': '步数',
  'overview.today.weight': '体重',
  'overview.today.recovery': '恢复分',
  'overview.today.freshness': '新鲜度',
  'overview.today.nonDiag': '非诊断 · 会话摘要',
  'overview.today.anomaly': '注意',
  'overview.today.anomaly.stale': '数据偏旧，建议重新导入',
  'overview.ctx.summary': '个人背景（注入提示词 · 仅本机）',
  'overview.ctx.hint':
    '用药、目标体重与关注点会写入大模型提示词；保存在本机 localStorage，与旧版共用键，不上传。',
  'overview.ctx.age': '年龄',
  'overview.ctx.sex': '性别自述',
  'overview.ctx.height': '身高 (cm)',
  'overview.ctx.targetWeight': '目标体重 (kg)',
  'overview.ctx.medications': '当前用药',
  'overview.ctx.conditions': '已知情况（自述）',
  'overview.ctx.focus': '本次最想关注',
  'overview.ctx.notes': '其他备注',
  'overview.ctx.save': '保存到本机',
  'overview.ctx.clear': '清除',
  'overview.ctx.saved': '已保存到本机',
  'overview.ctx.cleared': '已清除',
  'overview.ctx.saveFail': '无法写入 localStorage',
  'overview.ctx.includeSensitive': '复制提示词时包含用药与病史',
  'overview.ctx.includeEvents': '复制提示词时包含本机事件（默认关）',
  'overview.dateFilter.summary': '分析日期范围（会话）',
  'overview.dateFilter.hint': '限制当前会话重算的日历窗口；保存在 sessionStorage，不上传。',
  'overview.dateFilter.start': '开始',
  'overview.dateFilter.end': '结束',
  'overview.dateFilter.apply': '应用并重算',
  'overview.dateFilter.clear': '清除范围',
  'overview.dateFilter.applied': '已按日期范围重算',
  'overview.dateFilter.saved': '已保存日期范围（加载数据后生效）',
  'overview.dateFilter.cleared': '已清除日期范围',
  'overview.dateFilter.invalid': '开始日期不能晚于结束日期',
  'overview.events.summary': '本机事件时间线（共现复盘）',
  'overview.events.hint':
    '用药变更、旅行、症状等仅用于时间对照，不作因果推断；存 IndexedDB，与旧版共用。',
  'overview.events.kind': '类型',
  'overview.events.date': '日期',
  'overview.events.title': '标题',
  'overview.events.note': '备注',
  'overview.events.add': '添加事件',
  'overview.events.refresh': '刷新',
  'overview.events.delete': '删除',
  'overview.events.empty': '暂无事件',
  'overview.events.added': '已添加',
  'overview.events.deleted': '已删除',
  'overview.events.needDate': '请填写日期',
  'overview.events.importMeds': '导入 HAE 用药 JSON',
  'overview.events.includeTaken': '包含 Taken 记录',
  'overview.events.medsOk': '已导入 {n}/{parsed} 条用药事件',
  'overview.csv.summary': '外部体重 / 血压 CSV 合并',
  'overview.csv.hint':
    '欧姆龙类中文表头 CSV 合并进当前会话后重算；仅本机，不上传。',
  'overview.csv.weight': '体重 / 体脂 CSV',
  'overview.csv.bp': '血压 CSV',
  'overview.csv.apply': '合并并重算',
  'overview.csv.needFile': '请至少选择一个 CSV',
  'overview.csv.applied': '已合并并重算',
  'overview.recovery.summary': '恢复 / 负荷权重预设',
  'overview.recovery.hint':
    '与旧版共用 localStorage 键；切换预设后对当前会话重算恢复分。',
  'overview.recovery.preset.balanced': '均衡',
  'overview.recovery.preset.recoveryFirst': '恢复优先',
  'overview.recovery.preset.training': '训练期',
  'overview.recovery.preset.weightLoss': '减脂期',
  'overview.recovery.saved': '已保存预设',
  'overview.recovery.reanalyzed': '已按新权重重算',
  dualTrack: '本机',
  'shell.sessionReady': '已加载',
  'shell.sessionIdle': '未加载',
  'shell.kbdHint': 'Alt+1–4 切换工作区',
  'shell.offline': '当前离线：本地优先仍可用，数据仓与分析不上传。',
  'shell.install.body': '可将本应用安装到主屏幕，离线打开（数据仍仅本机）。',
  'shell.install.action': '安装',
  'shell.install.dismiss': '稍后',
  'shell.settings': '设置',
  'shell.aboutBody':
    '本地优先健康分析。明细不上传服务器，无第三方埋点。非医疗器械、非诊断。',
  'shell.freshness.idle': '尚未加载数据',
  'shell.freshness.today': '数据截至今天',
  'shell.freshness.yesterday': '数据截至昨天',
  'shell.freshness.days': '数据 {n} 天前',
  'shell.freshness.stale': '数据偏旧 · {n} 天前',
  'tv.enter': '健康大屏',
  'tv.exit': '退出大屏',
  'tv.dataUpdated': '数据截止 {end}',
  'tv.dataWaiting': '等待数据',
  'tv.focus.metrics': '焦点：指标',
  'tv.focus.signals': '焦点：信号',
  'tv.focus.priority': '焦点：优先关注',
  'trends.title': '趋势',
  'trends.lead':
    '一次看一个指标的变化；可切换时间范围，或与另一指标对比。非诊断。',
  'trends.emptyTitle': '还没有可画的趋势',
  'trends.emptyDesc':
    '先在总览导入或加载数据，再回到这里看步数、体重、血糖、睡眠的变化。',
  'trends.points': '点',
  'trends.latest': '最新',
  'trends.table': '数据表',
  'trends.tableHint': '与上方图表同一段数据，便于核对日期与数值。',
  'trends.emptyDomain': '该指标暂无数据，可切换其他指标或重新导入。',
  'trends.switchAvailable': '切换到有数据的指标',
  'trends.colDate': '日期',
  'trends.colValue': '值',
  'trends.domain.steps': '步数',
  'trends.domain.weight': '体重',
  'trends.domain.restingHr': '静息心率',
  'trends.domain.cgmDailyMean': 'CGM 日均',
  'trends.domain.sleepTotal': '睡眠时长',
  'trends.domain.hrv': '心率变异',
  'trends.range': '时间范围',
  'trends.range.days': '近 {n} 日',
  'trends.range.all': '全部',
  'trends.compare': '叠加对比',
  'trends.compare.none': '仅当前',
  'trends.compare.hint': '可选第二指标，同图对照',
  'trends.presets': '我的视图',
  'trends.presets.namePh': '例如：血糖近 30 日',
  'trends.presets.save': '保存当前',
  'trends.presets.delete': '删除此视图',
  'trends.presets.hint': '记住指标、对比与时间范围，下次一键恢复',
  'trends.presets.empty': '还没有保存的视图',
  'reports.title': '报告',
  'reports.lead':
    '选择门诊一页纸、周报或临床复盘，预览后复制或下载。全文仅在本机生成。',
  'reports.emptyTitle': '还没有可写的报告',
  'reports.emptyDesc':
    '总览有数据后，可生成门诊一页纸、周报或临床复盘，全文仅在本机。',
  'reports.emptyAction': '去总览加载数据',
  'reports.kind.visit': '门诊一页纸',
  'reports.kind.weekly': '周报',
  'reports.kind.clinical': '临床复盘',
  'reports.copy': '复制全文',
  'reports.download': '下载 .md',
  'reports.downloadHtml': '下载 HTML',
  'reports.chars': '字数',
  'reports.viaAdapter': '本机生成',
  'reports.localOnly': '仅本机',
  'reports.kindRemembered': '已记住此报告类型',
  'reports.copied': '已复制到剪贴板（仅本机，未上传）',
  'reports.copyFail': '复制失败：请手动选择预览文本',
  'reports.downloaded': '已下载 {filename}',
  'reports.includeSensitive': '临床复盘含用药/病史',
  'reports.includeEvents': '报告含本机事件（时间共现）',
  'reports.useUserContext': '注入个人背景',
  'data.title': '数据',
  'data.lead':
    '管理本机健康数据：查看状态、导出与备份、控制占用，以及清除隐私数据。全部留在此设备。',
  'data.leadPrefix': '管理本机健康数据与备份。存储位置：',
  'data.leadSuffix':
    '。保存时会完整更新本机数据；可选用口令加密备份。',
  'data.section.status': '当前状态',
  'data.section.statusLead': '会话来源、区间与本机存储概况。',
  'data.section.export': '导出与交换',
  'data.section.exportLead': '把分析导出为文件，或生成本机 FHIR 归档。',
  'data.section.backup': '备份与恢复',
  'data.section.backupLead': '加密或明文备份文件，仅保存在你的设备。',
  'data.section.space': '空间与清理',
  'data.section.spaceLead': '限制保留时长、清理旧分段，避免本机空间吃紧。',
  'data.section.privacy': '隐私清除',
  'data.section.privacyLead': '一键移除本机健康数据；不可撤销。',
  'data.layout.sharded': '分段存储',
  'data.layout.legacy': '旧布局',
  'data.layout.unknown': '未知',
  'data.meta.title': '本机仓概况',
  'data.storageDetail': '存储 {name} · 版本 {version}',
  'data.source': '当前来源',
  'data.sourceEmpty': '尚未加载数据',
  'data.sourceDesc': '本次会话中的导入或本机读取结果。',
  'data.span': '数据区间',
  'data.spanCounts':
    '血糖 {cgm} · 体重 {weight} · 步数日 {stepsDays}',
  'data.spanEmpty': '加载数据后显示',
  'data.bytes': '本次占用（约）',
  'data.bytesDesc': '当前会话在内存中的近似大小。',
  'data.backup': '备份',
  'data.backupDesc': '本机加密备份（可选口令），文件留在你的设备。',
  'data.backupBadge': '可选加密 · 本机文件',
  'data.backup.title': '本机备份',
  'data.backup.lead':
    '导出或导入本机健康数据备份。可选口令加密；文件不上传。非诊断。',
  'data.backup.pass': '备份口令（可选）',
  'data.backup.passHint': '留空则明文；填写则加密（至少 4 位）',
  'data.backup.includeSnapshots': '包含摘要快照',
  'data.backup.includeEvents': '包含健康事件',
  'data.backup.includeReports': '包含周报',
  'data.backup.includeBatches': '包含导入批次',
  'data.backup.export': '导出备份',
  'data.backup.import': '导入备份',
  'data.backup.exporting': '导出中…',
  'data.backup.importing': '导入中…',
  'data.backup.exportOk': '备份已导出并开始下载',
  'data.backup.importOk': '备份已导入',
  'data.backup.fail': '备份失败',
  'data.probe': '本机数据状态',
  'data.probeBusy': '读取中…',
  'data.probeAction': '刷新本机状态',
  'data.contractOk': '存储正常',
  'data.contractFail': '存储不完整',
  'data.consentGranted': '已授权',
  'data.consentDenied': '未授权',
  'data.meta.consent': '授权',
  'data.meta.span': '跨度',
  'data.meta.approx': '约占用',
  'data.meta.records': '记录数',
  'data.meta.lastWritten': '最近写入',
  'data.snapshots': '摘要快照（{count}）',
  'data.snapshotsEmpty': '尚无快照（可在总览保存摘要）。',
  'data.snapLabel': '标签',
  'data.snapSavedAt': '保存时间',
  'data.snapRange': '区间',
  'data.softQuota.title': '空间管理（写入时）',
  'data.softQuota.lead':
    '本机空间紧张时，保存会按固定顺序先清理较旧的分段数据。策略说明，非诊断。',
  'data.softQuota.note':
    '保存时自动生效；下方「保留窗口」可主动限制保留时长。',
  'data.softQuota.approx': '约占用',
  'data.softQuota.lastWritten': '最近写入',
  'data.softQuota.step.cgm': '血糖月数据',
  'data.softQuota.step.bpWeight': '血压 / 体重年数据',
  'data.softQuota.step.sleepSteps': '睡眠 / 步数年数据',
  'data.softQuota.step.hrvHr': 'HRV / 静息 / 步行心率年数据',
  'data.softQuota.step.workoutsEcgWatch': '训练 / 心电 / 手表日汇总',
  'data.keepN.title': '保留窗口',
  'data.keepN.lead':
    '只保留最近 N 个月血糖与 N 年其他年数据。应用后会完整更新本机数据。非诊断。',
  'data.keepN.cgmMonths': 'CGM 保留月数',
  'data.keepN.yearYears': '年片保留年数',
  'data.keepN.autoTrim': '写入后自动 keep-N（默认关）',
  'data.keepN.presets': '快捷预设',
  'data.keepN.preset.compact': '默认 · 6月 / 3年',
  'data.keepN.preset.year': '一年 CGM · 12月 / 5年',
  'data.keepN.preset.tight': '紧凑 · 3月 / 1年',
  'data.keepN.forecast': '预估将删除：{months} 个 CGM 月 · {years} 个年片',
  'data.keepN.forecastNeedProbe': '先「读取本地仓库」可预估删除量',
  'data.keepN.apply': '对仓库应用 keep-N',
  'data.keepN.applying': '应用中…',
  'data.keepN.applied': '已应用：删除 {months} 月 + {years} 年片',
  'data.keepN.noop': '已在窗口内，无需删除',
  'data.keepN.empty': '仓库为空或未授权，无法应用',
  'data.keepN.fail': '应用失败',
  'data.keepN.sharedPrefs': '偏好保存在本机',
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
  'data.export.title': '分析导出',
  'data.export.lead':
    '下载完整分析 JSON、CSV（ZIP）或摘要快照。仅本机生成，不上传。',
  'data.export.json': '导出 JSON',
  'data.export.csv': '导出 CSV ZIP',
  'data.export.snapshot': '导出摘要快照',
  'data.export.needAnalysis': '请先在总览加载数据',
  'data.export.okJson': '已下载 {name}',
  'data.export.okCsv': '已下载 {name}（{fmt}）',
  'data.export.okSnap': '已下载摘要 {name}',
  'data.export.fail': '导出失败',
  'data.fhir.title': 'FHIR 本机归档',
  'data.fhir.badge': '试验性 · R4 形',
  'data.fhir.lead':
    '生成本地 FHIR R4 形 Bundle（local-archive）。非医院对接、不上传。',
  'data.fhir.includeDevices': '包含设备资源（Watch/iPhone）',
  'data.fhir.export': '下载 FHIR JSON',
  'data.fhir.needAnalysis': '请先在总览加载数据',
  'data.fhir.ok': '已下载 {name} · Observation {n} · {val}',
  'data.fhir.fail': 'FHIR 导出失败',
  'data.fhir.valOk': '自检通过',
  'data.fhir.valWarn': '自检 {n} 条提示',
  'data.fhir.tier': '导出档位',
  'data.fhir.tier.archive': '本机归档',
  'data.fhir.tier.exchange': '外部交换（匿名）',
  'data.fhir.exchangeBlocked': '交换门禁未通过（{n} 条），未下载',
  'data.privacy.title': '清除本机健康数据',
  'data.privacy.lead': '清空 IndexedDB 仓/快照/事件/批次与健康相关 localStorage。保留主题与界面语言。不可撤销。',
  'data.privacy.action': '一键清除',
  'data.privacy.busy': '清除中…',
  'data.privacy.confirm': '确认清除本机全部健康数据？会话与数据仓将清空，此操作不可撤销。',
  'data.privacy.ok': '已清除 {keys} 个键 · {stores} 个 store',
  'data.privacy.fail': '清除失败',
  'data.compare.title': '快照环比',
  'data.compare.lead': '选择两个本机摘要快照，比较数值指标（B−A）。非诊断。',
  'data.compare.needSnaps': '至少需要 2 条快照（总览「保存摘要快照」）。',
  'data.compare.needTwo': '请选择两个快照',
  'data.compare.missing': '无法读取快照详情',
  'data.compare.ok': '已比较（参考 {n} 个指标字段）',
  'data.compare.a': '快照 A（较早）',
  'data.compare.b': '快照 B（较新）',
  'data.compare.run': '比较',
  'data.compare.refresh': '刷新列表',
  'data.compare.metric': '指标',
};

const en: Record<MessageKey, string> = {
  brand: 'Health OS',
  brandSub: 'Data stays on this device',
  'nav.overview': 'Overview',
  'nav.trends': 'Trends',
  'nav.reports': 'Reports',
  'nav.data': 'Data',
  'nav.overview.desc': 'Today status & priorities',
  'nav.trends.desc': 'Metric trends & compare',
  'nav.reports.desc': 'Visit & weekly notes',
  'nav.data.desc': 'Backup, export & cleanup',
  theme: 'Theme',
  'theme.system': 'System',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  about: 'About',
  footer: 'Local-first · no upload · backup your data',
  'shell.defaultEntry': 'Runs only on this device — health details are never uploaded.',
  'shell.recoveryTitle': 'Version rollback & local data recovery',
  'shell.recoveryHint':
    'Old UI is gone. Roll app versions via prior deploy or Git. Local data: Data-page backup export/import, or re-import Apple Health ZIP. See docs/DATA_RECOVERY.md.',
  'overview.title': "Today's health status",
  'overview.lead':
    'Start with recovery and priorities, then open trends or reports. Data stays on this device — not a diagnosis.',
  'overview.loadFixture': 'Load demo fixture',
  'overview.importFile': 'Import XML / ZIP',
  'overview.importHae': 'Import HAE',
  'overview.importFolder': 'Import folder',
  'overview.folder.none': 'No export.xml / 导出.xml / ZIP found in folder',
  'overview.haeCancel': 'Cancel HAE',
  'overview.loadWh': 'Load on-device data',
  'overview.persistWh': 'Save on this device',
  'overview.saveSnap': 'Save snapshot',
  'overview.clear': 'Clear',
  'overview.priority': 'Priority',
  'overview.range': 'Date range',
  'overview.empty': 'Start with today’s status',
  'overview.emptyHint':
    'Import an iPhone Health export, or load the demo first. Recovery score and priorities stay on this device.',
  'overview.empty.step1': 'Import ZIP / XML, or load the demo',
  'overview.empty.step2': 'Review recovery score and today’s priority',
  'overview.empty.step3': 'Open trends or reports when you need more',
  'overview.loading': 'Reading your on-device health data…',
  'overview.loadingDetail': 'Parse and stats run in the browser — nothing is uploaded.',
  'overview.success.import': 'Loaded — today’s status is ready',
  'overview.success.zip': 'ZIP import finished',
  'overview.success.hae': 'Incremental data merged',
  'overview.success.warehouse': 'Restored from on-device data',
  'overview.success.csv': 'External CSV merged',
  'overview.success.reanalyze': 'Reanalyzed with current settings',
  'overview.success.hint': 'Recovery score and priorities updated · stays on-device',
  'overview.success.openTrends': 'Open trends',
  'overview.sessionReadyStrip': 'Ready · save on this device or open trends',
  'overview.tools.summary': 'Import & advanced tools',
  'overview.tools.more': 'More',
  'overview.tools.less': 'Less',
  'overview.source': 'Source',
  'overview.snapRecent': 'Latest snapshot',
  'overview.haeNotes': 'Incremental import notes',
  'overview.trendStrip.title': 'Recent trends',
  'overview.trendStrip.range': 'Trend window',
  'overview.signals.kicker': 'Evidence for the priority above',
  'overview.signals.title': 'Signals & clues',
  'overview.signals.link': 'See evidence & clues',
  'overview.signals.expand': 'View all {n}',
  'overview.signals.collapse': 'Show less',
  'overview.prompt.label': 'LLM prompt',
  'overview.prompt.mode.full': 'Full',
  'overview.prompt.mode.data': 'Data only',
  'overview.prompt.mode.short': 'Short system',
  'overview.prompt.copy': 'Copy prompt',
  'overview.prompt.copied': 'Copied ({n} chars, local clipboard only)',
  'overview.prompt.copyFail': 'Copy failed — select text manually',
  'overview.prompt.noAnalysis': 'Load data first',
  'overview.ctaTrends': 'Open trends',
  'overview.ctaReports': 'Open reports',
  'overview.domains': 'Available data types',
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
  'overview.kpiOrder.up': 'Move KPI up',
  'overview.kpiOrder.down': 'Move KPI down',
  'overview.quality.title': 'Data quality notes',
  'overview.quality.future': 'Skipped {n} future-dated records (often typos)',
  'overview.quality.cgmUnit': 'CGM unit may be unreliable (shown as {unit}); verify source',
  'overview.quality.hint': 'Non-diagnostic; reflects parser heuristics only.',
  'overview.domainsPresentCount': '{n} health data types available',
  'overview.today.title': 'Today snapshot',
  'overview.today.range': 'Range',
  'overview.today.cgm': 'CGM',
  'overview.today.steps': 'Steps',
  'overview.today.weight': 'Weight',
  'overview.today.recovery': 'Recovery',
  'overview.today.freshness': 'Freshness',
  'overview.today.nonDiag': 'Non-diagnostic · session snapshot',
  'overview.today.anomaly': 'Note',
  'overview.today.anomaly.stale': 'Data is stale — re-import recommended',
  'overview.ctx.summary': 'Personal context (prompt only · local)',
  'overview.ctx.hint':
    'Meds, goals, and focus go into the LLM prompt; saved in localStorage (same key as legacy). Not uploaded.',
  'overview.ctx.age': 'Age',
  'overview.ctx.sex': 'Sex (self-described)',
  'overview.ctx.height': 'Height (cm)',
  'overview.ctx.targetWeight': 'Target weight (kg)',
  'overview.ctx.medications': 'Medications',
  'overview.ctx.conditions': 'Known conditions (self-reported)',
  'overview.ctx.focus': 'Focus this time',
  'overview.ctx.notes': 'Notes',
  'overview.ctx.save': 'Save locally',
  'overview.ctx.clear': 'Clear',
  'overview.ctx.saved': 'Saved on this device',
  'overview.ctx.cleared': 'Cleared',
  'overview.ctx.saveFail': 'Could not write localStorage',
  'overview.ctx.includeSensitive': 'Include medications & conditions in the prompt',
  'overview.ctx.includeEvents': 'Include local events in the prompt (off by default)',
  'overview.dateFilter.summary': 'Analysis date range (session)',
  'overview.dateFilter.hint': 'Limit reanalysis to a calendar window; stored in sessionStorage only.',
  'overview.dateFilter.start': 'Start',
  'overview.dateFilter.end': 'End',
  'overview.dateFilter.apply': 'Apply & reanalyze',
  'overview.dateFilter.clear': 'Clear range',
  'overview.dateFilter.applied': 'Reanalyzed with date range',
  'overview.dateFilter.saved': 'Date range saved (applies after load)',
  'overview.dateFilter.cleared': 'Date range cleared',
  'overview.dateFilter.invalid': 'Start date must not be after end date',
  'overview.events.summary': 'Local events timeline (co-occurrence)',
  'overview.events.hint':
    'Med changes, travel, symptoms — co-occurrence only, not causal. IndexedDB shared with legacy.',
  'overview.events.kind': 'Kind',
  'overview.events.date': 'Date',
  'overview.events.title': 'Title',
  'overview.events.note': 'Note',
  'overview.events.add': 'Add event',
  'overview.events.refresh': 'Refresh',
  'overview.events.delete': 'Delete',
  'overview.events.empty': 'No events yet',
  'overview.events.added': 'Added',
  'overview.events.deleted': 'Deleted',
  'overview.events.needDate': 'Date required',
  'overview.events.importMeds': 'Import HAE meds JSON',
  'overview.events.includeTaken': 'Include Taken logs',
  'overview.events.medsOk': 'Imported {n}/{parsed} medication events',
  'overview.csv.summary': 'External weight / BP CSV merge',
  'overview.csv.hint':
    'Merge scale/BP CSV into the current session and reanalyze. Local only.',
  'overview.csv.weight': 'Weight / body-fat CSV',
  'overview.csv.bp': 'Blood pressure CSV',
  'overview.csv.apply': 'Merge & reanalyze',
  'overview.csv.needFile': 'Pick at least one CSV',
  'overview.csv.applied': 'Merged and reanalyzed',
  'overview.recovery.summary': 'Recovery / load weight presets',
  'overview.recovery.hint':
    'Same localStorage key as legacy; applying a preset reanalyzes the session.',
  'overview.recovery.preset.balanced': 'Balanced',
  'overview.recovery.preset.recoveryFirst': 'Recovery first',
  'overview.recovery.preset.training': 'Training',
  'overview.recovery.preset.weightLoss': 'Weight loss',
  'overview.recovery.saved': 'Preset saved',
  'overview.recovery.reanalyzed': 'Reanalyzed with new weights',
  dualTrack: 'On-device',
  'shell.sessionReady': 'Ready',
  'shell.sessionIdle': 'Idle',
  'shell.kbdHint': 'Alt+1–4 switch workspace',
  'shell.offline': 'Offline: local-first still works; warehouse & analysis stay on-device.',
  'shell.install.body': 'Install to home screen for offline open (data stays on-device).',
  'shell.install.action': 'Install',
  'shell.install.dismiss': 'Later',
  'shell.settings': 'Settings',
  'shell.aboutBody':
    'Local-first health analysis. Details never leave this device; no third-party analytics. Not a medical device or diagnosis.',
  'shell.freshness.idle': 'No data loaded',
  'shell.freshness.today': 'Data through today',
  'shell.freshness.yesterday': 'Data through yesterday',
  'shell.freshness.days': 'Data {n} days ago',
  'shell.freshness.stale': 'Stale · {n} days ago',
  'tv.enter': 'TV mode',
  'tv.exit': 'Exit TV',
  'tv.dataUpdated': 'Data through {end}',
  'tv.dataWaiting': 'Waiting for data',
  'tv.focus.metrics': 'Focus: metrics',
  'tv.focus.signals': 'Focus: signals',
  'tv.focus.priority': 'Focus: priority',
  'trends.title': 'Trends',
  'trends.lead':
    'Follow one metric at a time; change the range or compare with another. Not a diagnosis.',
  'trends.emptyTitle': 'No trends to draw yet',
  'trends.emptyDesc':
    'Import or load data on Overview first, then come back for steps, weight, glucose, and sleep.',
  'trends.points': 'pts',
  'trends.latest': 'Latest',
  'trends.table': 'Data table',
  'trends.tableHint': 'Same series as the chart — handy for checking dates and values.',
  'trends.emptyDomain':
    'No data for this metric — switch metric or re-import.',
  'trends.switchAvailable': 'Switch to a metric with data',
  'trends.colDate': 'Date',
  'trends.colValue': 'Value',
  'trends.domain.steps': 'Steps',
  'trends.domain.weight': 'Weight',
  'trends.domain.restingHr': 'Resting HR',
  'trends.domain.cgmDailyMean': 'CGM daily mean',
  'trends.domain.sleepTotal': 'Sleep total',
  'trends.domain.hrv': 'HRV',
  'trends.range': 'Time range',
  'trends.range.days': 'Last {n} days',
  'trends.range.all': 'All',
  'trends.compare': 'Compare overlay',
  'trends.compare.none': 'This only',
  'trends.compare.hint': 'Optional second metric on the same chart',
  'trends.presets': 'My views',
  'trends.presets.namePh': 'e.g. Glucose last 30d',
  'trends.presets.save': 'Save current',
  'trends.presets.delete': 'Delete this view',
  'trends.presets.hint': 'Remember metric, compare, and range for one-tap restore',
  'trends.presets.empty': 'No saved views yet',
  'reports.title': 'Reports',
  'reports.lead':
    'Choose a visit one-pager, weekly report, or clinical review — preview, then copy or download. Generated only on this device.',
  'reports.emptyTitle': 'No report to write yet',
  'reports.emptyDesc':
    'Once Overview has data, generate a visit one-pager, weekly note, or clinical review — on this device only.',
  'reports.emptyAction': 'Load data on Overview',
  'reports.kind.visit': 'Visit one-pager',
  'reports.kind.weekly': 'Weekly report',
  'reports.kind.clinical': 'Clinical review',
  'reports.copy': 'Copy text',
  'reports.download': 'Download .md',
  'reports.downloadHtml': 'Download HTML',
  'reports.chars': 'chars',
  'reports.viaAdapter': 'On-device',
  'reports.localOnly': 'On this device only',
  'reports.kindRemembered': 'Remembered this report type',
  'reports.copied': 'Copied to clipboard (local only, not uploaded)',
  'reports.copyFail': 'Copy failed — select preview text manually',
  'reports.downloaded': 'Downloaded {filename}',
  'reports.includeSensitive': 'Clinical review includes meds/history',
  'reports.includeEvents': 'Include local events (co-occurrence)',
  'reports.useUserContext': 'Include personal context',
  'data.title': 'Data',
  'data.lead':
    'Manage on-device health data: status, export & backup, space controls, and privacy wipe. Everything stays on this device.',
  'data.leadPrefix': 'Manage on-device health data and backups. Storage: ',
  'data.leadSuffix':
    '. Saving fully updates local data; optional passphrase encryption for backups.',
  'data.section.status': 'Current status',
  'data.section.statusLead': 'Session source, range, and local storage overview.',
  'data.section.export': 'Export & exchange',
  'data.section.exportLead': 'Export analysis files or a local FHIR archive.',
  'data.section.backup': 'Backup & restore',
  'data.section.backupLead': 'Encrypted or plain backup files — on your device only.',
  'data.section.space': 'Space & cleanup',
  'data.section.spaceLead': 'Limit retention and remove old segments when space is tight.',
  'data.section.privacy': 'Privacy wipe',
  'data.section.privacyLead': 'Remove local health data in one step. Irreversible.',
  'data.layout.sharded': 'Segmented storage',
  'data.layout.legacy': 'Legacy layout',
  'data.layout.unknown': 'Unknown',
  'data.meta.title': 'Local store overview',
  'data.storageDetail': 'Store {name} · v{version}',
  'data.source': 'Current source',
  'data.sourceEmpty': 'No data loaded yet',
  'data.sourceDesc': 'Import or local read for this session.',
  'data.span': 'Date range',
  'data.spanCounts':
    'Glucose {cgm} · weight {weight} · step days {stepsDays}',
  'data.spanEmpty': 'Shown after data is loaded',
  'data.bytes': 'Session size (approx.)',
  'data.bytesDesc': 'Approximate in-memory size for this session.',
  'data.backup': 'Backup',
  'data.backupDesc':
    'On-device backup with optional passphrase — files stay on your device.',
  'data.backupBadge': 'Optional encryption · local file',
  'data.backup.title': 'On-device backup',
  'data.backup.lead':
    'Export or import local health backups. Optional passphrase; nothing is uploaded. Not a diagnosis.',
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
  'data.backup.importOk': 'Backup imported',
  'data.backup.fail': 'Backup failed',
  'data.probe': 'On-device status',
  'data.probeBusy': 'Reading…',
  'data.probeAction': 'Refresh status',
  'data.contractOk': 'Storage OK',
  'data.contractFail': 'Storage incomplete',
  'data.consentGranted': 'Granted',
  'data.consentDenied': 'Not granted',
  'data.meta.consent': 'Consent',
  'data.meta.span': 'Span',
  'data.meta.approx': 'Approx. size',
  'data.meta.records': 'Records',
  'data.meta.lastWritten': 'Last written',
  'data.snapshots': 'Summary snapshots ({count})',
  'data.snapshotsEmpty':
    'No snapshots yet (save a summary on Overview).',
  'data.snapLabel': 'Label',
  'data.snapSavedAt': 'Saved at',
  'data.snapRange': 'Range',
  'data.softQuota.title': 'Space management (on save)',
  'data.softQuota.lead':
    'When local space is tight, save clears older segments in a fixed order. Policy only — not a diagnosis.',
  'data.softQuota.note':
    'Applies automatically on save; use retention windows below to trim longer history.',
  'data.softQuota.approx': 'Approx. size',
  'data.softQuota.lastWritten': 'Last written',
  'data.softQuota.step.cgm': 'CGM months',
  'data.softQuota.step.bpWeight': 'BP / weight years',
  'data.softQuota.step.sleepSteps': 'Sleep / steps years',
  'data.softQuota.step.hrvHr': 'HRV / resting / walking HR years',
  'data.softQuota.step.workoutsEcgWatch': 'Workouts / ECG / watch daily years',
  'data.keepN.title': 'Keep-N windows',
  'data.keepN.lead':
    'Keep only the newest N glucose months and N years of other yearly data. Applying updates on-device storage. Not a diagnosis.',
  'data.keepN.cgmMonths': 'CGM keep months',
  'data.keepN.yearYears': 'Year-shard keep years',
  'data.keepN.autoTrim': 'Auto keep-N after write (off by default)',
  'data.keepN.presets': 'Presets',
  'data.keepN.preset.compact': 'Default · 6 mo / 3 yr',
  'data.keepN.preset.year': 'Year CGM · 12 mo / 5 yr',
  'data.keepN.preset.tight': 'Tight · 3 mo / 1 yr',
  'data.keepN.forecast': 'Would drop: {months} CGM months · {years} year shards',
  'data.keepN.forecastNeedProbe': 'Probe local warehouse first to estimate drops',
  'data.keepN.apply': 'Apply keep-N to warehouse',
  'data.keepN.applying': 'Applying…',
  'data.keepN.applied': 'Applied: dropped {months} months + {years} year shards',
  'data.keepN.noop': 'Already within windows — nothing dropped',
  'data.keepN.empty': 'Warehouse empty or no consent',
  'data.keepN.fail': 'Apply failed',
  'data.keepN.sharedPrefs': 'prefs stay on this device',
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
  'data.export.title': 'Analysis export',
  'data.export.lead':
    'Download full analysis JSON, CSV (ZIP), or a compact snapshot. Generated locally only.',
  'data.export.json': 'Export JSON',
  'data.export.csv': 'Export CSV ZIP',
  'data.export.snapshot': 'Export snapshot',
  'data.export.needAnalysis': 'Load data on Overview first',
  'data.export.okJson': 'Downloaded {name}',
  'data.export.okCsv': 'Downloaded {name} ({fmt})',
  'data.export.okSnap': 'Downloaded snapshot {name}',
  'data.export.fail': 'Export failed',
  'data.fhir.title': 'FHIR local archive',
  'data.fhir.badge': 'Experimental · R4-shaped',
  'data.fhir.lead':
    'Build a local FHIR R4-shaped Bundle (local-archive). Not hospital exchange; no upload.',
  'data.fhir.includeDevices': 'Include Device resources (Watch/iPhone)',
  'data.fhir.export': 'Download FHIR JSON',
  'data.fhir.needAnalysis': 'Load data on Overview first',
  'data.fhir.ok': 'Downloaded {name} · Observation {n} · {val}',
  'data.fhir.fail': 'FHIR export failed',
  'data.fhir.valOk': 'self-check OK',
  'data.fhir.valWarn': 'self-check {n} notes',
  'data.fhir.tier': 'Export tier',
  'data.fhir.tier.archive': 'Local archive',
  'data.fhir.tier.exchange': 'External exchange (anonymous)',
  'data.fhir.exchangeBlocked': 'Exchange gate failed ({n}); not downloaded',
  'data.privacy.title': 'Wipe local health data',
  'data.privacy.lead': 'Clears IndexedDB warehouse/snapshots/events/batches and health localStorage. Keeps theme & UI locale. Irreversible.',
  'data.privacy.action': 'Wipe all',
  'data.privacy.busy': 'Wiping…',
  'data.privacy.confirm': 'Wipe all local health data? Session and warehouse will be empty. This cannot be undone.',
  'data.privacy.ok': 'Cleared {keys} keys · {stores} stores',
  'data.privacy.fail': 'Wipe failed',
  'data.compare.title': 'Snapshot compare',
  'data.compare.lead': 'Pick two local summary snapshots and compare numeric metrics (B−A). Non-diagnostic.',
  'data.compare.needSnaps': 'Need at least 2 snapshots (Overview “Save snapshot”).',
  'data.compare.needTwo': 'Select two snapshots',
  'data.compare.missing': 'Could not load snapshot detail',
  'data.compare.ok': 'Compared (ref {n} metric fields)',
  'data.compare.a': 'Snapshot A (earlier)',
  'data.compare.b': 'Snapshot B (newer)',
  'data.compare.run': 'Compare',
  'data.compare.refresh': 'Refresh list',
  'data.compare.metric': 'Metric',
};

const TABLES: Record<'zh-CN' | 'en', Record<MessageKey, string>> = {
  'zh-CN': zh,
  en,
};

/**
 * Resolve UI string. zh-TW is derived from zh-CN via lib phrase map (same as analysis).
 */
export function t(locale: AppLocaleUi, key: MessageKey): string {
  if (locale === 'zh-TW') {
    const base = TABLES['zh-CN'][key] || key;
    try {
      return toTraditionalTitle(base);
    } catch {
      return base;
    }
  }
  return TABLES[locale][key] || TABLES['zh-CN'][key] || key;
}

/** All message keys — used by parity tests. */
export const MESSAGE_KEYS = Object.keys(zh) as MessageKey[];
