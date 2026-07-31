# Dual-track UI：legacy PWA + React Health OS 预览

本地优先、无 CDN、无埋点。分析内核仍是 `@health-analyzer/lib` / Workers / IndexedDB；React 只负责壳与交互。

| 项 | 值 |
|----|-----|
| **迁移 baseline tip** | `cb1685d`（v2.1 legacy） |
| **生产默认入口** | `web-ui/public/`（legacy PWA） |
| **React 预览包** | `web-ui/react-app/` |
| **同域可选挂载** | `web-ui/public/next/`（`npm run react:export-next`，**gitignore**） |
| **文档版本** | 双轨 **MVP 预览**（非可切主 v3）；P0 共享仓写入已禁用 |
| **定位** | 高完成度 React **预览版**，不是可安全替代 legacy 的生产架构 |

---

## 1. 双轨一览

```text
health-analyzer/
├─ lib/                      # 解析 / 统计 / 报告 / FHIR 内核（勿在 React 重写）
├─ web-ui/
│  ├─ public/                # ★ 生产默认：legacy PWA
│  │  ├─ index.html          # 「试用新版」→ ./next/
│  │  ├─ history-db.js       # IDB schema 权威
│  │  ├─ parse-worker.js …
│  │  └─ next/               # 可选：React 同域导出（构建产物，不入库）
│  └─ react-app/             # ★ React + Vite + TS 预览轨
│     ├─ src/core/           # Adapter / Worker / ZIP / HAE / IDB
│     ├─ src/pages/          # Overview · Trends · Reports · Data
│     └─ scripts/            # privacy-scan · export-next
├─ e2e/                      # legacy Playwright
└─ e2e-react/                # React Playwright（端口 4174）
```

| 路径 | 角色 |
|------|------|
| `web-ui/public/` | **默认部署目录**；smoke / e2e 门禁 |
| `web-ui/react-app/` | 现代壳源码；`npm run react:*` |
| `web-ui/react-app/dist/` | 独立 preview（`base=/`） |
| `web-ui/public/next/` | 同域 `/next/`（`base=/next/`，导出后可删） |

---

## 2. 脚本（仓库根 `health-analyzer/`）

```bash
# Legacy 门禁（生产轨）
npm run smoke
npm run test:e2e
npm run test:lib
npm run test:fhir          # 按需

# React 轨
npm run react:install      # web-ui/react-app 依赖
npm run react:dev          # Vite 开发服
npm run react:build        # → web-ui/react-app/dist
npm run react:preview      # 默认 127.0.0.1:4173
npm run react:test         # Vitest（adapter / IDB / ZIP / HAE / 仓…）
npm run react:parity       # 夹具 parity 子集
npm run react:privacy      # dist 隐私扫描（禁 CDN/分析域）
npm run react:export-next  # base=/next/ → public/next/，并恢复 dist 为 base=/
npm run test:e2e:react     # Playwright React 壳（build + preview :4174）
```

包内亦可：`cd web-ui/react-app && npm run dev|build|test|privacy|export-next`。

---

## 3. 同域双轨（`/next/`）

1. `npm run react:export-next`
2. 静态服务 **`web-ui/public`**（与线上一致）
3. 打开 `/`（legacy）或点顶栏 **「试用新版」** → `/next/`
4. React「关于」→ **返回 legacy**（`../`）

### 偏好键

`localStorage['ha-ui-shell'] = 'react' | 'legacy'`

- React 关于面板可写入。
- Legacy `index.html`：**仅当** 偏好为 `react` **且** `HEAD ./next/index.html` 成功时跳转（e2e 不设偏好，不误跳）。

### 回滚

删除 `web-ui/public/next/` 或清除偏好；生产根目录始终可只部署 `public/` 本体。

---

## 4. 已交付功能面

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
| **总览** | 新鲜度 / 优先 / KPI；夹具；**XML / ZIP / HAE**；Worker；**加载仓**；**写入仓已禁用（P0）**；快照 |
| **趋势** | 本地 **ECharts 懒加载** + 表回退（ECharts **不**进 SW 首装 precache） |
| **报告** | 门诊一页纸 / 周报 / 临床复盘 + 复制/下载 .md |
| **数据** | IDB 契约探测；快照列表；warehouseMeta 只读 |

### 4.3 导入与 I/O

| 路径 | 模块 | 说明 |
|------|------|------|
| XML | `HealthCoreAdapter.analyzeXml(Async)` | Worker：`analyze.worker.ts`，失败回退主线程 |
| ZIP | `zipImport.ts` + npm **fflate** | 选 `export.xml` / `导出.xml`；可选 ECG CSV |
| HAE | `haeImport.ts` → `mergeHaeIntoData` | JSON/CSV，可叠在当前 `HealthData` |
| 仓加载 | `warehouseLoad.ts` | consent；reassemble；`react-core-full-v1` **core-only** |
| 仓写入 | `warehousePersist.ts` | **产品禁用**（`WAREHOUSE_SHARED_WRITE_ENABLED=false`） |
| 快照 | `snapshotWrite.ts` | `buildAnalysisSnapshot` → `snapshots` keep-30 |

### 4.4 隐私 / PWA（阶段 5）

- `vite-plugin-pwa`：壳层 precache only；**排除** echarts/TrendChart；无 source map；`registerType: 'prompt'`
- `scripts/privacy-scan.mjs`：禁 CDN/analytics 等
- ECharts 路由懒加载 + 非首装预缓存

### 4.5 内核边界与 IDB

- **禁止**在 React 重写 parse/stats/FHIR。
- IDB：`health-analyzer-history` **v5**；indexes 与 `history-db.js` 对齐（`idbContract.test.ts` 锁源码 + fake-indexeddb 内省）。
- React **不**做分片 keep-N / 硬配额驱逐；大规模仓仍用 legacy 数据中心。

### 4.6 测试矩阵

| 命令 | 覆盖 |
|------|------|
| `npm run react:test` | Adapter parity、IDB schema、ZIP、HAE、仓 load/persist、快照、workspace |
| `npm run test:e2e:react` | 夹具/路由/Sheet、XML+ZIP、快照列表、HAE+仓往返（Chromium :4174） |
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

---

## 8. 定位、P0/P1 与非目标

**可宣布：** 现代双轨架构 **MVP / 预览** 完成。  
**不可宣布：** 架构升级项目完成、新版可替代旧版、可切默认生产入口。

| 项 | 状态 |
|----|------|
| Tailwind v4 / 全量 shadcn | **未上**；CSS 变量 + 自有 primitives |
| 生产默认 cutover 到 React | **未做** |
| 仓按月/年分片 + keep-N | **仅 legacy** |
| 高品质健康大屏 UI | **未做**（仍为功能壳） |
| HAE 未知指标落库 / CommandPalette | 未做 |

### P0 — 共享数据仓互通（阻断切主）

| 问题 | 仅写 `core\|full` 时，若 DB 仍有 legacy 分片，读取会用分片覆盖 core 字段 → 混态。 |
|------|------|
| **当前处置** | `WAREHOUSE_SHARED_WRITE_ENABLED=false`；UI「写入数据仓」**禁用**；无 `force` 拒绝写入。 |
| **读取安全** | `meta.layout === react-core-full-v1` 时 **core-only**，不叠 domain 分片。 |
| **长期修复** | 共享完整分片序列化 + 配额模块；双向兼容 E2E。**勿**默认清空旧分片。 |
| **生产建议** | 真实旧仓用户用 **legacy 数据管理** 写仓。 |

### P1 工程

| 项 | 状态 |
|----|------|
| ECharts 不进 SW 首装 precache | `globPatterns` 白名单壳层 JS + ignore echarts/TrendChart |
| 生产关闭 source map | `build.sourcemap: false` |
| SW 更新用户确认 | `registerType: 'prompt'` + `PwaUpdateBanner` |
| echarts/core 按需构建 | **未做** |

---

## 9. 相关文档

- 总览与上手：`README.md`、`docs/README.md`
- 手工 QA：`docs/MANUAL_QA.md`（含双轨检查项）
- 数据中心 / 分片权威：`docs/DATA_CENTER_v1.68.md`、`web-ui/public/history-db.js`
- 包内说明：`web-ui/react-app/README.md`
