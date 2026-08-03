# Dual-track UI → Strategy A cutover（**迁移档案**）

> **状态（v2.5.5+）：历史档案，不是现行发布承诺。**  
> 生产 **仅 React `/`**。`/legacy/` 仅为跳转 stub（旧 UI 已删除）。  
> **应用回退** = 上一静态部署 / Git — **不是**打开 `/legacy/`。  
> **`test:e2e:dual` 已删除**（勿再引用为通过门禁）。  
> 本机数据恢复与门禁清单见 **[DATA_RECOVERY.md](./DATA_RECOVERY.md)** · 部署见 **[DEPLOY.md](./DEPLOY.md)**。

本地优先、无 CDN、无埋点。分析内核仍是 `@health-analyzer/lib` / Workers / IndexedDB。

| 项 | 值（现行） |
|----|-----|
| **生产默认入口** | **React 壳** 位于 `web-ui/public/` **根路径 `/`**（`npm run react:export-cutover`） |
| **`/legacy/`** | **仅跳转 stub**（`public/legacy/index.html` → 回首页）；**不是**可运行旧版 |
| **React 源码** | `web-ui/react-app/` |
| **废弃** | `/next/`；`test:e2e:dual`；以旧 UI 为目标的 `test:e2e` legacy 套件 |
| **文档定位** | 本文记录 **迁移过程**；产品路径以根 README + DATA_RECOVERY 为准 |

---

## 1. 发布树一览（现行）

```text
web-ui/public/                 # 部署目录（wrangler / Pages）
├─ index.html, assets/, sw…    # React（cutover 构建产物，gitignore）
├─ CUTOVER_STAMP.txt
└─ legacy/                     # 仅 index.html 跳转 stub
web-ui/idb-schema/             # IDB 契约权威参考
web-ui/react-app/              # React 源码
```

| 路径 | 角色 |
|------|------|
| `/` | **唯一产品入口**（React） |
| `/legacy/` | 说明页并跳回 `/` |
| `web-ui/react-app/` | 现代壳源码 |

---

## 2. 脚本（现行）

```bash
# 生产发布（必须）
npm run react:export-cutover   # 默认 base=/；写 404.html；legacy/ 仅 stub
# GitHub Pages 部署：GITHUB_PAGES_DEPLOY=true → base=/<repo>/

# 开发
npm run react:dev
npm run react:test
npm run react:privacy

# 门禁
npm run smoke                  # cutover 形态 + schema + browser IIFE
npm run test:e2e               # = test:e2e:react（根 React）
npm run test:e2e:react
# test:e2e:dual — 已删除，勿引用

# 废弃
npm run react:export-next      # 仅 /next/ 预览，勿作默认
```

---

## 3. 回退（现行 · 非 `/legacy/`）

1. **应用版本**：Git/Pages 回退上一成功部署，或恢复发版前备份的 `web-ui/public/`
2. **本机数据**：数据页备份导入，或重新导入 Apple Health ZIP（见 DATA_RECOVERY.md）
3. 打开 `/legacy/` **不会**恢复旧 UI

---

## 4. 已交付功能面（React 产品路径）

### 4.1 应用壳（阶段 3）

| 能力 | 实现 |
|------|------|
| 桌面侧栏 + 手机底栏 | `workspaceStore` 同源 `active` |
| 主题 light / dark / system | `ThemeProvider` + CSS 变量 |
| UI primitives | Button · Card · Badge · Sheet · Empty/Loading/Error |
| 无 CDN 字体 | 系统字体栈 |

### 4.2 四工作区（阶段 4）

| 页 | 行为 |
|----|------|
| **总览** | **状态带**（`StatusBand`）/ **信号列表**（`SignalList`）/ 新鲜度 / KPI；夹具；**XML / ZIP / HAE**；Worker；**加载/写入仓（sharded-v1）**；快照。路径：`web-ui/react-app/src/features/overview/StatusBand.tsx`、`SignalList.tsx` |
| **趋势** | **域切换器**（`domain-switcher` + `trend-domain-*`）+ 本地 **ECharts 懒加载** + 表回退（ECharts **不**进 SW 首装 precache） |
| **报告** | 门诊一页纸 / 周报 / 临床复盘 + 复制/下载 .md |
| **数据** | IDB 契约探测；快照列表；warehouseMeta 只读 |

### 4.3 导入与 I/O

| 路径 | 模块 | 说明 |
|------|------|------|
| XML | `HealthCoreAdapter.analyzeXml(Async)` | Worker：`analyze.worker.ts`，失败回退主线程 |
| ZIP | `zipImport.ts` + npm **fflate** | 选 `export.xml` / `导出.xml`；可选 ECG CSV |
| HAE | `haeImport.ts` → `mergeHaeIntoData` | JSON/CSV，可叠在当前 `HealthData` |
| 仓加载 | `warehouseLoad.ts` | consent；reassemble；`react-core-full-v1` **core-only** |
| 仓写入 | `warehousePersist.ts` + `warehouseShards.ts` | **sharded-v1** 全量替换（legacy 兼容） |
| 快照 | `snapshotWrite.ts` | `buildAnalysisSnapshot` → `snapshots` keep-30 |

### 4.4 隐私 / PWA（阶段 5）

- `vite-plugin-pwa`：壳层 precache only；**排除** echarts/TrendChart；无 source map；`registerType: 'prompt'`
- `scripts/privacy-scan.mjs`：禁 CDN/analytics 等
- ECharts 路由懒加载 + 非首装预缓存

### 4.5 内核边界与 IDB

- **禁止**在 React 重写 parse/stats/FHIR。
- IDB：`health-analyzer-history` **v5**；indexes 与 `history-db.js` 对齐（`idbContract.test.ts` 锁源码 + fake-indexeddb 内省）。
- React 写入时已做软配额多域 eviction（全链路）；**交互 keep-N / 硬配额面板仍 legacy**。

### 4.6 测试矩阵

| 命令 | 覆盖 |
|------|------|
| `npm run react:test` | Adapter parity、IDB schema、ZIP、HAE、仓 load/persist、快照、workspace |
| `npm run test:e2e:react` | 夹具/路由/Sheet、XML+ZIP、快照列表、HAE+仓往返（Chromium :4174） |
| ~~`npm run test:e2e:dual`~~ | **已删除**（v2.5.5）。历史：同域 React↔legacy 交叉 E2E 骨架；`e2e-dual/` 目录仅作档案，默认 CI 不跑 |
| `npm run smoke` / `test:e2e` | **Legacy 不回归** |

---

## 5. 源码地图（`web-ui/react-app/src`）

```text
core/
  HealthCoreAdapter.ts    # parse/analyze/report/series 边界
  analyze.worker.ts       # module Worker
  parseWorkerClient.ts
  zipImport.ts
  haeImport.ts
  idbContract.ts          # 契约 + empty-create
  legacyHistoryRead.ts    # 快照/meta 只读
  warehouseLoad.ts        # reassemble + analyze
  warehousePersist.ts     # core|full 写入
  snapshotWrite.ts
components/ui/            # 设计 primitives
components/charts/        # TrendChart（lazy echarts）
features/overview/        # StatusBand · SignalList（总览密度 MVP+）
features/data/            # SoftQuotaPanel · KeepNPanel
core/warehouseKeepPrefs.ts / warehouseKeepWindows.ts
pages/                    # Overview Trends Reports Data
stores/workspaceStore.ts
store/useHealthStore.ts
layout/AppShell.tsx
theme/ThemeProvider.tsx
styles/                   # CSS 变量 tokens（非 Tailwind 全量）
```

---

## 6. 架构示意

```mermaid
flowchart LR
  U[用户文件 XML/ZIP/HAE] --> A[HealthCoreAdapter / Workers]
  A --> L["@health-analyzer/lib"]
  L --> S[Zustand useHealthStore]
  S --> O[Overview]
  S --> T[Trends + ECharts lazy]
  S --> R[Reports]
  S --> D[Data / IDB]
  D <--> IDB[(IndexedDB history v5)]
  SW[Service Worker self-only] --> Shell[React shell cache]
```

全程无后端、无登录、无云健康 API。

---

## 7. 提交里程碑（便于对照 git）

| Commit | 内容 |
|--------|------|
| `801cbb1` | React 壳 + adapter + privacy + 双轨文档初版 |
| `6367f07` | IDB empty schema 与 legacy indexes 对齐 |
| `cad4ade` | 阶段 3–6：侧栏/底栏、四工作区、ECharts、报告 |
| `cc0dbc9` | XML Worker、IDB 只读、`/next` export、偏好键 |
| `19a7ca7` | ZIP、仓加载、快照、`e2e-react` |
| `dd55e05` | HAE、仓写入、进度文案 |
| `8d9ca0a` | legacy 兼容 sharded-v1 仓写入（React） |
| `01cd038` | echarts tree-shake、CGM 软驱逐、总览密度初版 |
| `bf0c8b8` | BP/体重软驱逐、壳 i18n、总览 insight strip |
| `89b54a1` | 睡眠/步数软驱逐 + 数据仓页密度 |
| `846d680` | **软配额全链路**（CGM→BP/体重→睡眠/步数→HRV→训练/ECG/手表）写入时完成 |
| `8055486` | 总览状态带 / 信号列表 / 趋势 domain-switcher + 壳层会话 chip / Trends i18n |
| `5dcb9f6` | 报告 i18n + SoftQuotaPanel 只读 |
| `b958b6d` | keep-N 核心 + KeepNPanel + 总览工具栏主/次折叠 |
| `fcace80` | 同域交叉 e2e 骨架 + 总览 KPI 折叠 + 数据页 i18n |
| `936ed79` | dual C legacy→React + Trends sleep/HRV + Alt+1–4 工作区快捷键 |
| *(本提交)* | **dual D 往返 + KPI 显隐 prefs + KPI→Trends 深链** |

---

## 8. 定位、P0/P1 与非目标

**可宣布：** 生产默认入口为 **React `/`**；**完整 legacy UI 已删除**（`/legacy/` 仅跳转）。  
**schema：** `web-ui/idb-schema/history-db.reference.js`。  
**细节：** [`LEGACY_PARITY.md`](LEGACY_PARITY.md)。

| 项 | 状态 |
|----|------|
| 生产默认 cutover 到 React 根路径 | **已做**（`react:export-cutover`） |
| Tailwind v4 / 全量 shadcn | **未上**；CSS 变量 + 自有 primitives |
| 仓按月/年分片 + keep-N + 分片多选删除 | React：**写入 + keep-N + ShardCleanupPanel 多选删除**；legacy 仍可作对照 |
| 高品质健康大屏 UI | **已做 MVP**（顶栏进入、时钟/焦点轮播、Esc 退出；非可编辑栅格） |
| 加密备份 UI 迁入 React | **已做 MVP**（`warehouseBackup` + Data 页 `BackupPanel`；legacy 格式兼容） |
| JSON/CSV/快照 + FHIR 本机归档 | **已做**（Data 页 ExportPanel / FhirExportPanel） |
| 事件时间线 / CSV 合并 / 恢复权重 | **已做**（Overview 折叠面板；IDB/localStorage 与 legacy 共用） |

### P0 — 共享数据仓互通（历史目标 · 旧 UI 已删除）

| 问题（曾） | 仅写 `core\|full` 时，legacy 分片会覆盖 core → 混态。 |
|------|------|
| **当前写入** | `persistHealthDataSharded`：与 history-db 一致 **clear domainChunks + put 全量 sharded-v1 分片**。 |
| **读取** | `layout=sharded-v1` 或存在 domain 分片 → 合并分片。 |
| **交叉 E2E** | ~~`test:e2e:dual`~~ **已删除**；现行门禁为 `test:e2e:react`。 |
| **后续** | 首屏路由拆分等性能优化；勿再恢复 dual 假通过脚本。 |

### P1 工程

| 项 | 状态 |
|----|------|
| ECharts 不进 SW 首装 precache | 壳层 JS 白名单 + ignore charts/components/axis… |
| 生产关闭 source map | `build.sourcemap: false` |
| SW 更新用户确认 | `registerType: 'prompt'` + `PwaUpdateBanner` |
| echarts/core 按需构建 | **已做**（Line + Grid + Tooltip + DataZoom） |
| 软配额全链路（CGM→BP/体重→睡眠/步数→HRV→训练/ECG/手表） | **已做**（写入时，`846d680`） |
| 交互 keep-N（React） | **已做 MVP**：`warehouseKeepPrefs` / `warehouseKeepWindows` / `KeepNPanel`；auto-trim 默认关；与 legacy 共用 localStorage |
| 壳层 i18n 中/英 | **已做**（`ha-react-ui-locale`，导航/总览键） |
| 总览状态带 / 信号列表 / 趋势工作台密度 | **已合入**；工具栏折叠 + KPI/域折叠（默认展开） |
| 报告页 i18n + 数据页软配额/keep-N 面板 | **已做**；数据页文案 i18n **本轮** |
| 同域交叉仓 E2E | **已退役**（`test:e2e:dual` 删除；旧 UI 不存在） |
| 可编辑大屏栅格 / 手机完整单任务产品 | **未做** |


---

## 9. 相关文档

- 总览与上手：`README.md`、`docs/README.md`
- 手工 QA：`docs/MANUAL_QA.md`（含双轨检查项）
- 数据中心 / 分片权威：`docs/DATA_CENTER_v1.68.md`、`web-ui/idb-schema/history-db.reference.js`
- 本机恢复 / 发布门禁：`docs/DATA_RECOVERY.md`
- 包内说明：`web-ui/react-app/README.md`
