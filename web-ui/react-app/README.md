# React preview shell（双轨）

并行的 **Vite + React 19 + TypeScript** 应用，用于 Health OS UI 现代化预览。

| 轨 | 路径 | 角色 |
|----|------|------|
| **Legacy（生产默认）** | `../public/` | 线上部署目录；勿删除 |
| **React 预览** | 本目录 | 工程壳 + adapter + 四工作区 |

完整说明见仓库 **[docs/DUAL_TRACK_UI.md](../../docs/DUAL_TRACK_UI.md)**。

## 快速开始

在 **仓库根** `health-analyzer/`：

```bash
npm run react:install
npm run react:dev
# 或
npm run react:build && npm run react:preview
npm run react:test
npm run react:privacy
npm run test:e2e:react
npm run react:export-next   # 挂到 public/next/
```

在本包：

```bash
npm install
npm run dev
npm run build && npm run preview
npm run test
npm run privacy
npm run export-next
```

## 功能摘要

- 路由：`/` 总览 · `/trends` · `/reports` · `/data`
- 主题：light / dark / system
- 导入：夹具 · XML（Worker）· ZIP（fflate）· HAE（JSON/CSV）
- 数据仓：加载 reassemble；写入简化 `core|full`（需用户点「写入数据仓」）
- 快照：`buildAnalysisSnapshot` → IndexedDB `snapshots`
- 图表：ECharts 懒加载 + 表回退
- 报告：visit / weekly / clinical Markdown
- 隐私：self-only PWA + `privacy-scan.mjs`

## 目录

```text
src/
  core/           # Adapter、Worker、ZIP、HAE、IDB
  pages/          # 四工作区
  components/ui/  # Button Card Badge Sheet …
  components/charts/
  stores/         # workspace 导航状态
  store/          # 健康会话 Zustand
  layout/         # AppShell
  theme/
  styles/
scripts/
  privacy-scan.mjs
  export-next.mjs
```

## 约束

- 不重写 `lib` 统计 / FHIR / 隐私文案
- 不强制迁移 IDB schema（契约见 `idbContract.ts`）
- 生产默认入口仍为 legacy，除非运维切换部署根目录

## 浏览器

现代 Chromium / Safari / Firefox。Tailwind v4 全量未接入；样式为 CSS 变量 + 系统字体。
