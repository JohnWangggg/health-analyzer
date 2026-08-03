# 苹果健康数据分析 PWA

**语言 / Language：** **[中文文档](docs/README.md)** · **[English docs](docs/en/README.md)**

本地隐私优先 · 跨平台 · 零服务器

把 iPhone「健康」App 导出的数据包（ZIP / XML）在浏览器内解析、统计，并生成可粘贴到豆包 / ChatGPT / Claude 等大模型的标准化提示词。纯前端 PWA，无后端。

> **English:** Privacy-first Apple Health export analyzer (ZIP/XML) that runs entirely in the browser, builds stats and recovery insights, and generates paste-ready LLM prompts. Full documentation: [docs/en/README.md](docs/en/README.md) · deploy [docs/en/DEPLOY.md](docs/en/DEPLOY.md) · prompts [docs/en/PROMPT_DESIGN.md](docs/en/PROMPT_DESIGN.md).

在线演示（GitHub Pages）：部署成功后见仓库 Actions / Pages 地址，形如  
`https://<USER>.github.io/health-analyzer/`

## 5 分钟上手

### 用户端

1. iPhone「健康」App → 头像 → **导出健康数据** → 得到 ZIP  
2. 浏览器打开本应用 → 选择 ZIP 上传（手机点选即可）  
3. 在 **分析概览** 查看 KPI；可选填写个人背景（用药/关注点，仅本机）  
4. 点 **复制完整提示词**（概览按钮或底部吸底栏）  
5. 粘贴到豆包 / Kimi / ChatGPT 等 → 得到结构化分析报告  

可选：

- 限制分析日期范围  
- 查看跨维度提示、趋势图（可滑动读数）  
- 导出 JSON / CSV、保存摘要到本机历史做环比  
- 切换浅色 / 深色 / 跟随系统外观  
- 顶栏切换 **中文 / English** 界面语言  


### 开发者端

```bash
# 1. 构建核心库（修改 lib/src 后必须执行）
cd health-analyzer/lib
npm install
npm test
npm run build   # tsc + lib/dist/browser.iife.js（FHIR/smoke；非旧 UI）

# 2. 发布树：React 为 public 根（唯一产品入口）
cd ..
npm install
npm run react:install
npm run react:export-cutover      # → web-ui/public/ 根 = React + 404.html

# 3. 本地预览
cd web-ui/public && python3 -m http.server 8000
# http://localhost:8000        → React（生产默认）
# http://localhost:8000/legacy/ → 仅跳回首页（旧 UI 已删除）

# 4. 仓库根：smoke + E2E（主门禁）
cd ../..
npx playwright install chromium   # 首次
npm run smoke                     # cutover 形态 + schema 引用 + browser IIFE
npm run test:e2e:react            # 根 React E2E（= npm run test:e2e）
# 勿再使用 test:e2e:dual（已删除；见 docs/DATA_RECOVERY.md）

# 5. 开发 React 源码
npm run react:dev
npm run react:test

# 6. 部署：CI 会 export-cutover 后发布 web-ui/public
```

## 产品入口（v2.5+ · 仅 React）

| URL | 内容 |
|-----|------|
| **`/`** | **生产默认** React 壳（总览 / 趋势 / 报告 / 数据） |
| **`/legacy/`** | **不是回滚应用** — 仅说明页并跳回 `/` |

发布命令：`npm run react:export-cutover`（产物在 `web-ui/public/`）。  
**应用版本回退**：Git/Pages 回退到上一成功部署，或保留上一静态 `public/` 产物 — **不要**依赖 `/legacy/`。  
**本机数据恢复**：备份导出/导入、重新导入 Health ZIP — 见 [`docs/DATA_RECOVERY.md`](docs/DATA_RECOVERY.md)。  
GitHub Pages 项目页 base=`/<repo>/`（见 `export-cutover.mjs` + deploy workflow）。

### 能力一览（生产路径）

- ✅ 导入：夹具 · XML · ZIP · 文件夹 · HAE（可取消）  
- ✅ 总览：KPI 显隐/排序 · 数据质量 · 提示词 · 个人背景 · 事件 · CSV · 恢复权重 · 大屏  
- ✅ 趋势：多域 · 时间范围 · **双指标对比** · **图表预设** · ECharts 懒加载  
- ✅ 报告 / 导出 / FHIR 本机归档+交换 · 数据仓 sharded-v1 · 备份 · 隐私清除 · 快照环比  
- ✅ 工程：cutover 门禁 · **e2e-react** · privacy 扫描 · FHIR HL7  
- ℹ️ Schema 权威：`web-ui/idb-schema/history-db.reference.js`  
- ℹ️ 迁移记录：[`docs/LEGACY_PARITY.md`](docs/LEGACY_PARITY.md) · 恢复：[`docs/DATA_RECOVERY.md`](docs/DATA_RECOVERY.md)

说明文档：[`docs/DEPLOY.md`](docs/DEPLOY.md) · [`docs/README.md`](docs/README.md) · [`docs/DUAL_TRACK_UI.md`](docs/DUAL_TRACK_UI.md)（历史）

---

## 核心特性


- ✅ **100% 本地计算**，健康明细不上传服务器  
- ✅ 跨平台：Windows / Mac / Linux / iOS / Android 浏览器  
- ✅ PWA 可安装、离线可用（SW network-first）  
- ✅ 自动识别：CGM / 血压 / 体重 / HRV / 心率 / 步数 / 睡眠 / ECG / Watch 活动·血氧·VO₂·腕温  

- ✅ 三档提示词：完整 / 仅数据 / 简短系统提示  
- ✅ 个人背景注入提示词（localStorage；可选剥离用药/病史）  
- ✅ 跨维度启发式提示 + Canvas 趋势图  
- ✅ JSON / CSV（ZIP）导出；IndexedDB 历史摘要环比  
- ✅ Web Worker 解析大 XML（失败回退主线程）  
- ✅ 深色模式（跟随系统或手动切换）  
- ✅ 结果概览 KPI + 吸底「复制完整提示词」  
- ✅ **自动排除未来日期记录**（如误录的远期体重），并在概览/提示词中提示  
- ✅ **晨起体重趋势**（同日去重）、**体脂**解析与图表  
- ✅ **CGM 首日 / 稳定期**分桶；**血压晨间 / 晚间**分层  
- ✅ **自动监测摘要**（可点进明细）+ KPI 状态色 + 结果顶栏导航  
- ✅ 提示词信任条（已含摘要 / 字数）+ **只复制摘要**短提示  
- ✅ 图表时间范围 chips（7/30/90/全部）  
- ✅ 解析失败可 **重试并保留设置**  
- ✅ 吸底 **复制摘要**；图表范围本地记忆  
- ✅ 可选合并 **体脂秤 / 血压计 CSV**（欧姆龙类中文表头）  
- ✅ **Apple Watch 日汇总**：活动能量 / 锻炼 / 站立 / 血氧（夜/日分段） / 呼吸 / VO₂ max / 腕温 / 夜间心率  
- ✅ **Workout 会话**：类型（中文）/ 时长 / 能量 / 距离 / 心率，与 HRV 恢复信号联动  
- ✅ **近 7 日负荷/恢复仪表**、**多周恢复/负荷趋势**、**站立小时 / 日照**  
- ✅ **ECG 分类统计**（ZIP/文件夹）+ 高心率与训练/时段关联  
- ✅ **睡眠呼吸紊乱**日序列与趋势提示  
- ✅ **联合信号**：呼吸紊乱×夜段血氧、高心率 ECG×低/高活动日  
- ✅ **一键导出本周 Markdown 报告**；恢复分对比近几周中位基线  
- ✅ **可调恢复评分权重**（localStorage）+ **周报本机历史**（IndexedDB）  
- ✅ **CGM×睡眠/活动**联合信号（短睡+低值、高读数+低步数等）  
- ✅ **响应式自适应 UI**（移动端优先、安全区、吸底 CTA、窄屏布局）  
- ✅ **桌面结果侧栏导航**（≥1100px 固定左侧轨、可折叠、键盘上下切换、滚动高亮；窄屏顶栏 pills）  
- ✅ **界面与文档 i18n**（`docs/` / `docs/en/`；UI 支持 **简体 / 繁體 / English**）  
- ✅ **分析内容双语**（摘要 / 信号 / 周报 / LLM 提示词随语言；繁體 UI 下分析文案暂与简体共用）  
- ✅ **门诊一页纸**导出（极简 Markdown，便于门诊沟通）  
- ✅ **快捷键** ⌘/Ctrl+Shift+C 复制完整提示词（有分析结果时）  
- ✅ **视觉系统**（teal/slate、柔光背景、精致卡片/KPI、毛玻璃导航与暗色校准）  





## 项目结构

```
health-analyzer/
├── lib/                      # TypeScript 内核（解析/统计/提示词/导出）
├── web-ui/
│   ├── public/               # ★ 部署根（GitHub Pages / wrangler）
│   │   ├── index.html …      # React（export-cutover 产物，gitignore）
│   │   ├── 404.html          # SPA 深链（GitHub Pages）
│   │   └── legacy/           # 仅跳转 stub（旧 UI 已删除，非回滚应用）
│   ├── idb-schema/           # IndexedDB 契约权威参考
│   └── react-app/            # ★ React 源码（生产默认壳）
├── e2e/                      # 历史 Playwright（旧 /legacy/ 目标；默认不跑）
├── e2e-react/                # ★ 主门禁：根 React Playwright
├── e2e-dual/                 # 历史双轨仓 E2E（已退役；脚本已删除）
└── docs/                     # 中文 + docs/en/ 英文 · DATA_RECOVERY.md
```

详见 [docs/README.md](docs/README.md) · [docs/en/README.md](docs/en/README.md)

## 部署到 GitHub Pages

推送到 `main` 后：

1. **test** job：`lib` 测试 + `react:export-cutover`（base=`/`，供 e2e）+ smoke + Playwright  
2. **deploy** job：再次 `export-cutover`，并设 `GITHUB_PAGES_DEPLOY=true` → base=`/<repo>/`，生成 `404.html`，上传 `web-ui/public/`

```bash
cd health-analyzer
git push origin main
```

仓库 **Settings → Pages → Source** 选 **GitHub Actions**。  
访问：`https://<USER>.github.io/health-analyzer/`（资产路径带 repo 前缀）。  
版本回退：Git/Pages 回退上一成功部署（`/legacy/` 不会恢复旧 UI）。  
本机数据：[`docs/DATA_RECOVERY.md`](docs/DATA_RECOVERY.md)。

本地静态预览（base=`/`）：

```bash
npm run react:export-cutover
npx serve web-ui/public -l 8080
```

## 部署到 Cloudflare

纯静态 PWA，可用 **Cloudflare Workers 静态资源**（`wrangler`）或 **Cloudflare Pages**。与 GitHub Pages 可并存（同一 `web-ui/public` 产物）。

### wrangler（Workers 静态资源）

根目录 [`wrangler.toml`](wrangler.toml) 已将 `assets.directory` 指向 `./web-ui/public`。

```bash
# 先构建浏览器包（修改 lib/ 后必做）
cd lib && npm ci && npm test && npm run build && cd ..

# 本地预览 / 部署
npx wrangler dev
npx wrangler deploy
```

可选：在 `wrangler.toml` 中取消注释 `not_found_handling = "single-page-application"`，使未知路径回退到 `index.html`（本应用以相对路径为主，默认可不启用）。

### Cloudflare Pages

- **Build command:** `cd lib && npm ci && npm test && npm run build`
- **Build output directory:** `web-ui/public`
- Root directory 保持仓库根（或按 Pages 项目设置指向 `health-analyzer` 子目录时，路径相应调整）

也可只上传已构建的 `web-ui/public`（build 留空）。详见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 文档

中文：

- [docs/README.md](docs/README.md) — 功能、局限、扩展路线  
- [docs/DEPLOY.md](docs/DEPLOY.md) — 部署与自定义  
- [docs/PROMPT_DESIGN.md](docs/PROMPT_DESIGN.md) — 提示词工程  

English:

- [docs/en/README.md](docs/en/README.md) — features, limits, roadmap  
- [docs/en/DEPLOY.md](docs/en/DEPLOY.md) — deploy & customization  
- [docs/en/PROMPT_DESIGN.md](docs/en/PROMPT_DESIGN.md) — prompt design  

## 版本要点（近期）

| 版本 | 内容 |
|------|------|
| v2.2-dual | **双轨 React MVP 预览**（非可切主）：四工作区、Adapter、Worker/ZIP/HAE、快照、`/next`；仓写入 **sharded-v1**（与 legacy 分片兼容，整仓替换）；PWA 壳层 precache / 更新确认。见 `docs/DUAL_TRACK_UI.md` |
| v2.1 | 本地 ECharts 趋势增强；手机趋势筛选 Sheet；更多五页；健康大屏模式 |
| v2.0 | 个人健康驾驶舱视觉系统；桌面 12 栏大屏与手机任务流；数据新鲜度、快捷工作区、可键盘浏览图表与交互可靠性加固 |
| v1.92 | 今日仓状态卡片；趋势区本机仓范围提示；真机大包基线说明 |
| v1.91 | 仓分片搜索过滤；导入溯源时间线 |
| v1.90 | 批次→分片反向索引；离线横幅与更新提示加固 |
| v1.89 | 软配额预估裁剪；仓面板导入批次关联 |
| v1.88 | 全部分片 keep-N；旧 core 升级；分片清单导出；perf:warehouse |
| v1.87 | 训练/ECG/手表日汇总年分片；仓分片折叠分组 |
| v1.86 | HRV/静息/步行心率按年分片 |
| v1.85 | 睡眠/步数按年分片；仓状态摘要下载 |
| v1.84 | 复制仓状态摘要（仅元数据）；年分片 auto-trim E2E |
| v1.83 | 保存后可选自动 keep-N 裁剪（CGM 月 + BP/体重年，默认关） |
| v1.82 | 双域一并保留近 N 年；perf --json；手测清单覆盖年分片 |
| v1.81 | 血压/体重年分片「仅保留近 N 年」可配置（1/2/3/5） |
| v1.80 | 仓面板血压/体重年分片列表与多选删除 |
| v1.79 | 血压/体重按年分片；CGM 保留近 N 个月可配置（3/6/12/24）；解析性能基线 `npm run perf:parse` |
| v1.78 | CGM 月分片批量删除：多选、全选、仅保留近 6 个月 |
| v1.77 | 仓面板可手动删除单个 CGM 月分片并刷新元数据/分析 |
| v1.76 | 仓面板展示布局与 CGM 月分片列表（条数/体积） |
| v1.75 | 原始仓 CGM 按月分片（core + cgm\|YYYY-MM）；超软配额按最旧月份淘汰 |
| v1.74 | 键盘可达（跳过链接 + E2E）；真实设备手测清单 `docs/MANUAL_QA.md` |
| v1.73 | 四任务流 E2E；200% 缩放可用性加固与验收 |
| v1.72 | 今日优先关注单结论；390/834/1440 响应式验收 E2E |
| v1.71 | 趋势视图预设；备份可选口令 AES-GCM 加密（PBKDF2） |
| v1.70 | 趋势双指标同图叠加（同单位共轴 / 异单位双 Y）；仓超软配额时自动裁最旧 CGM |
| v1.69 | 数据仓加固：分域占用、配额条、浏览器配额估算、仅清仓、上传区/概览恢复入口、备份往返 E2E |
| v1.68 | 本机原始数据仓（opt-in）：授权后持久化 HealthData、刷新自动恢复、明文备份、清除含仓 |
| v1.67 | 趋势工作台 MVP：主/对比指标、个人基线、事件标记、图表结论摘要；偏好 localStorage 记忆 |
| v1.66 | 信息架构：今日/趋势/报告/更多工作区；桌面侧栏 + 手机底栏；FHIR/历史移入「更多」 |
| v1.65 | 匿名分享批次 ID 不透明重映射；门禁拦截姓名型 batch id；HL7 jar 固定版本+SHA-256 |
| v1.64 | CI/release 强制官方 HL7 校验（`test:fhir:ci` / `test:release`；Java 21 + validator_cli） |
| v1.63 | 个人转交伪名 ID：本机生成/持久化 UUID；门禁拒绝弱 ID；UI 生成·复制·轮换 |
| v1.62 | 匿名分享净化：移除 sourceName 扩展/note 与导入文件名；门禁拦截泄漏 |
| v1.61 | 逐条保留 sourceName；Device 按样本来源高置信度映射；`stripPrivateFhirExtensions` 供 HL7 校验导出 Bundle |
| v1.60 | CI/本地可选官方 HL7 `validator_cli` 离线校验合成 fixture（`-tx n/a`，无个人数据） |
| v1.59 | Device 仅高置信度 Watch/iPhone；外部交换分匿名分享/个人转交；门禁拒绝误标 Device |
| v1.58 | FHIR 导出分档：本地归档 / 外部交换；后者经独立 R4 交换门禁（非 HL7 Java 校验器） |
| v1.57 | FHIR 可选 Device（Apple Watch / iPhone / HAE / 聚合）+ Observation.device 引用 |
| v1.56 | FHIR 日汇总日期精度 Period；Patient 默认无固定 identifier；birthDate 仅年 |
| v1.55 | FHIR 可选本机伪名 Patient（默认无身份） |
| v1.54 | FHIR 结构夹具离线自检（`npm run test:fhir`，不上送健康数据） |
| v1.53 | FHIR 按领域细粒度导入批次 Provenance；Observation source-batch-ids 扩展 |
| v1.52.1 | FHIR Bundle urn:uuid fullUrl；日汇总 effectivePeriod；腕温本地编码 |
| v1.52 | FHIR 夜心率 / 呼吸频率 Observation |
| v1.51 | FHIR 腕温 Observation + Bundle 结构自检（非官方校验器） |
| v1.50 | FHIR 增加 VO₂/呼吸紊乱；可选 AGP SVG DocumentReference |
| v1.49 | FHIR 导出扩展 SpO2/睡眠 + 可选就诊文档 DocumentReference |
| v1.48 | 试验性本机 FHIR Observation+Provenance Bundle 导出 |
| v1.47 | 本报告来源预览；HAE 取消导入 E2E |
| v1.46.1 | 报告附录仅关联本分析 sourceBatchIds；哈希标明 full/前1MiB |
| v1.46 | HAE 分批/总量上限/可取消；本机导入批次可追溯；HAE UI E2E |
| v1.45 | 周报/提示词可选事件时间线（默认脱敏） |
| v1.44 | 结果页事件时间对照；就诊 HTML 可打印 AGP SVG |
| v1.43 | HAE 合并 Worker + 结果页 AGP 14 日分位带状图 |
| v1.42 | AGP 小时分位、HAE 索引去重、临床/事件 E2E 回归 |
| v1.41.1 | 验收 P1：临床报告默认不附带事件；家庭血压须短间隔双测才算规范流程 |
| v1.41 | 本机事件时间线（手动记录 + 可选用药导入）；复盘仅时间对照非因果 |
| v1.40 | Health Auto Export JSON/CSV 增量导入、去重统计、未知指标清单 |
| v1.39 | 规范化就诊复盘报告：CGM 14 天质量门槛、家庭血压流程、信号证据、可打印 HTML |
| v1.38 | 摘要明细与体重洞察近 7 自然日 |
| v1.37 | 信号自然日窗口、SW 预缓存 unzip-worker、清除后 E2E |
| v1.36 | 单位不可靠暂停阈值解读、KPI 自然日窗、清除重置结果、ZIP Worker |
| v1.35 | 大型 ZIP 内存保护（选择性解压/体积与条目上限）与导入诊断；隐私一键清除与提示词复制确认 |
| v1.34 | CGM 单位 mmol/L 规范化、时间加权 TIR 与覆盖降级 |
| v1.33 | Playwright E2E 冒烟（页面/语言/最小 XML 解析） |
| v1.32 | 扩展繁体词库覆盖洞察/门诊残缺短语、smoke 抽检 |
| v1.31 | zh-TW 分析文案繁体化（createL 词库）、CI smoke |
| v1.30 | 上传区/CSV 合并说明/洞察引导 i18n |
| v1.29 | 解析进度/安装/历史对比/周报 i18n、信号严重度筛选 |
| v1.28 | KPI 状态截断/质量横幅 i18n、信号空态筛选条、语言切换补全 |
| v1.27 | 恢复 statusLabel 随界面语言、跨维度信号分类开关 |
| v1.26 | 恢复分维度子分条、无 ECG 导入提示 |
| v1.25 | 弹窗/KPI/明细 i18n、恢复构成面板、图表质感、CF 文档、CI 复用 |
| v1.24 | 结果首屏层级、恢复预设、图表 i18n、版本提示、指标说明、繁中标题 |
| v1.23 | 视觉系统升级（teal/slate、光斑背景、KPI/卡片/暗色质感） |
| v1.22 | 门诊一页纸导出、复制提示词快捷键、空状态文案 i18n |
| v1.21 | 侧栏可折叠/键盘导航、信任条 i18n、简繁英 UI、AGENTS 协作分工 |
| v1.20 | LLM 提示词双语、桌面左侧结果导航轨、滚动高亮 |
| v1.19 | 分析内容双语（insights / signals / weekly）、周报 EN、reduced-motion |
| v1.18 | 响应式自适应 UI、界面/文档 i18n 与中英双语文档（`docs/en/*`） |
| v1.17 | 可调恢复权重、周报 IndexedDB 历史、CGM×睡眠/活动联合信号 |
| v1.16 | 周报 MD 导出、恢复基线、BD×夜血氧、ECG×活动日关联 |
| v1.15 | 多周恢复趋势、ECG×训练时段关联、睡眠呼吸紊乱序列 |
| v1.14 | 周恢复仪表、站立/日照、ECG 统计、Workout 中文类型 |
| v1.13 | Workout 会话、血氧夜/日分段、活动×HRV×夜 HR 恢复信号 |
| v1.12 | Watch 日汇总（活动/血氧/呼吸/VO₂/腕温/夜 HR）、KPI·图表·提示词·导出 |
| v1.11 | 吸底复制摘要、图表范围记忆、外部 CSV 合并 |
| v1.10 | 只复制摘要、图表时间 chips、失败重试保留设置 |
| v1.9 | 摘要→明细/曲线、复制 toast、首次引导 |
| v1.8 | 摘要可跳转、提示词信任条、解析阶段进度、暗色徽章对比 |
| v1.7 | 自动监测摘要、KPI 状态色、结果导航与上传区收起、体验打磨 |
| v1.6 | 晨起体重趋势、体脂、CGM 首日/稳定期、血压晨晚分层 |
| v1.5.1 | 默认排除未来日期记录（防误录体重等），质量提示写入 UI/提示词 |
| v1.5 | 深色模式、图表图例/读数、安装步骤引导、文档同步 |
| v1.4 | 结果概览 KPI、吸底复制、移动端主路径、明细折叠 |
| v1.3 | 跨维度信号、JSON/CSV 导出、IndexedDB 历史环比 |
| v1.2 | 个人背景、Canvas 图、Worker 解析 |
| v1.1 | TS 单源构建、CI 门禁、摘要补齐 |



---

## 版本要点（Strategy A 起 · 持续更新）

> 每次主线推送在此追加。完整双轨/仓设计见 `docs/DUAL_TRACK_UI.md`、`docs/DATA_CENTER_v1.68.md`。

| 版本 / Commit | 要点 |
|---------------|------|
| **v2.3-cutover** `b2178b6` | **Strategy A**：生产默认 React `/`；旧版迁入 `public/legacy/`；`react:export-cutover`；CI/e2e 重定向 |
| `3b08429` | 文档/package 口径对齐：新版默认、legacy 仅回滚 |
| `9bc090a` | React **仓库备份/恢复**（legacy 兼容 AES-GCM / 明文 `.hae-backup.json`） |
| `80d5b02` | React **分片多选清理**（CGM 月 / 年域） |
| `b2e7363` | 分片删除 e2e 硬路径；总览导入进度 / 会话就绪条 |
| `2e99eec` | 明文+**加密备份 e2e**；趋势域 `data-has-data` / 空域切换 |
| `f58d6fc` | 报告空态 CTA + meta；Keep-N **一键预设** |
| **v2.3.1** `bb9a6d4` | GitHub Pages **base=/<repo>/** + `404.html` SPA；总览 **复制大模型提示词**；中英文 README 版本要点表 |
| **v2.3.2** `9fd9f57` | React **个人背景**（legacy 同 localStorage 键）+ **今日快照**条；提示词注入上下文 |
| **v2.3.3** `68901ec` | React **敏感上下文开关**：复制提示词时可选剥离用药/病史（键 `health-analyzer-include-sensitive-ctx`，与 legacy 一致；默认包含） |
| **v2.4** `6229d49` | **产品路径完整迁入 React**：事件时间线 · CSV 合并 · 恢复权重 · 大屏 TV · JSON/CSV/快照导出 · FHIR 本机归档 · 报告 HTML/敏感选项 |
| **v2.4.1** `39a4a08` | Pages **白屏防护**：启动占位 + 8s 恢复按钮；SW/chunk 失效自动清缓存；navigateFallback 兼容 project base |
| **v2.4.2** `349d7a3` | **Legacy 软弃用**：`docs/LEGACY_PARITY.md`；`/legacy/` 顶栏弃用条；About 折叠回滚入口 |
| **v2.5** `2fb7f01` | **删除完整 legacy UI**：仅留 `/legacy/` 跳转；P0 日期过滤/事件/清除/FHIR exchange；schema 迁 `idb-schema/`；CI 只跑 e2e-react |
| **v2.5.1** `f58a184` | 趋势**双指标对比** · **文件夹导入** · **HAE 取消** · **快照环比** |
| **v2.5.2** `844528b` | 图表**预设** · HAE **用药→事件** · **离线横幅** |
| **v2.5.3** `de5c116` | **繁體中文 UI**（zh-CN 詞庫派生）· 分析語言隨界面 · 大屏全屏+焦點手動切換 |
| **v2.5.4** `6db3304` | **数据质量横幅** · **KPI 排序** · **PWA 安装提示** |
| **v2.5.5** | **发布口径纠偏**：`/legacy/` 明确为跳转 stub（非回滚应用）；删除 `test:e2e:dual` 假通过脚本；新增 [`docs/DATA_RECOVERY.md`](docs/DATA_RECOVERY.md)（备份/重导 ZIP/清站点数据/Git 部署回退）；About 与文档对齐 |
| **v2.5.6** | **首屏 code-split**：四工作区 `React.lazy` 路由拆分 + `vendor-react` / `health-lib` 稳定 chunk；入口主包约 19KB（gzip ~7KB），消除 &gt;500KB 单包告警 |
| **v2.5.7** | **总览二级懒加载**：日期过滤/个人背景/事件/CSV/恢复权重 idle 后挂载独立 chunk，Overview 关键路径更短 |
| **v2.5.8** | **UI 基础设施 + 大屏 P0**：修大屏 248px 栅格塌陷（1440 E2E）；接入 Motion / Lucide / AutoAnimate / Vaul；恢复环、导航图标、总览工具降级与手机抽屉 |
