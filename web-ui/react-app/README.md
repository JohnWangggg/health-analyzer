# React 生产壳（唯一产品入口）

**Vite + React 19 + TypeScript** — 本地优先健康 OS **默认且唯一 UI**。

| 路径 | 角色 |
|------|------|
| **`/`（cutover 到 `../public/` 根）** | **生产默认** |
| **`/legacy/`（`../public/legacy/`）** | **仅跳转 stub** — 旧 UI 已删除，**不是**回滚应用 |

应用版本回退：上一成功部署 / 备份的静态 `public/` / Git。  
本机数据恢复：仓库根 [`docs/DATA_RECOVERY.md`](../../docs/DATA_RECOVERY.md)。  
迁移档案：[`docs/DUAL_TRACK_UI.md`](../../docs/DUAL_TRACK_UI.md)。

## 快速开始

在 **仓库根** `health-analyzer/`：

```bash
npm run react:install
npm run react:dev                 # 开发
npm run react:export-cutover      # 发布：React → public 根
npm run react:test
npm run react:privacy
npm run test:e2e:react            # 生产形态静态根 e2e（= test:e2e）
npm run test:cutover-layout       # 根 React 形态 + legacy stub 门禁
# 勿使用 test:e2e:dual（已删除）
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
- 主题：light / dark / system · 语言：zh-CN / zh-TW / en
- 导入：夹具 · XML（Worker）· ZIP（fflate）· 文件夹 · HAE（可取消）
- 数据仓：sharded-v1 **整仓替换** 读写 + keep-N + 分片清理
- 快照：`buildAnalysisSnapshot` → IndexedDB `snapshots`
- 图表：ECharts 懒加载（不预缓存图表 chunk）+ 表回退
- 报告：visit / weekly / clinical Markdown · FHIR 本机归档/交换
- 隐私：self-only PWA + `privacy-scan.mjs`；SW 更新需用户确认

## 回退与恢复（非 `/legacy/`）

| 目标 | 做法 |
|------|------|
| 应用版本 | Git/Pages 回退，或恢复上一 `web-ui/public/` 产物 |
| 本机健康数据 | 数据页备份导入，或重新导入 Apple Health ZIP |
| 站点数据被清 | 同上；见 `docs/DATA_RECOVERY.md` |
