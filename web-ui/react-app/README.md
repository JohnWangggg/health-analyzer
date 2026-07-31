# React 生产壳（Strategy A 默认入口）

**Vite + React 19 + TypeScript** — 本地优先健康 OS **默认 UI**。

| 路径 | 角色 |
|------|------|
| **`/`（本应用 cutover 到 `../public/` 根）** | **生产默认** |
| **`/legacy/`（`../public/legacy/`）** | 旧版 PWA **回滚** |

完整说明见仓库 **[docs/DUAL_TRACK_UI.md](../../docs/DUAL_TRACK_UI.md)**。

## 快速开始

在 **仓库根** `health-analyzer/`：

```bash
npm run react:install
npm run react:dev                 # 开发
npm run react:export-cutover      # 发布：React → public 根
npm run react:test
npm run react:privacy
npm run test:e2e:react            # 生产形态静态根 e2e
npm run test:cutover-layout       # 根 React + /legacy/ 结构门禁
```

在本包：

```bash
npm install
npm run dev
npm run build && npm run preview
npm run test
npm run privacy
npm run export-cutover
```

`export-next`（`/next/`）已废弃，仅兼容保留。

## 功能摘要

- 路由：`/` 总览 · `/trends` · `/reports` · `/data`
- 主题：light / dark / system
- 导入：夹具 · XML（Worker）· ZIP（fflate）· HAE（JSON/CSV）
- 数据仓：sharded-v1 读写 + keep-N MVP
- 快照：`buildAnalysisSnapshot` → IndexedDB `snapshots`
- 图表：ECharts 懒加载 + 表回退
- 报告：visit / weekly / clinical Markdown
- 隐私：self-only PWA + `privacy-scan.mjs`；SW 不 fallback `/legacy/`

## 回滚

打开 **`/legacy/`**，或壳内「关于」→ 打开旧版回滚。
