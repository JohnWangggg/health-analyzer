# 部署指南

**语言 / Language：** **中文** | [English](./en/DEPLOY.md)

将 **`web-ui/public/`**（**React 在根路径**）托管到任意静态 Web 服务器即可。

### 生产形态（v2.5+）

发布前必须构建 React 到 public 根：

```bash
cd health-analyzer
npm run react:install
npm run react:export-cutover   # 默认 base=/ ；写 404.html；legacy/ 仅跳转 stub
# GitHub Pages 部署 job 会设 GITHUB_PAGES_DEPLOY=true → base=/<repo>/
```

| URL | 内容 |
|-----|------|
| `/` 或 Pages 上 `/<repo>/` | **生产默认** React 壳 |
| `.../legacy/` | **不是**可运行旧版；自动跳回 React 根 |

**应用版本回退：** 回退 Git/Pages 到上一成功部署，或恢复发版前备份的 `web-ui/public/` 静态树。  
**本机数据恢复：** 见 **[DATA_RECOVERY.md](./DATA_RECOVERY.md)**（备份导入、重导 ZIP、清除站点数据影响）。

历史双轨说明见 **[DUAL_TRACK_UI.md](./DUAL_TRACK_UI.md)**（迁移档案）。`react:export-next`（`/next/`）已废弃。

## 选项 1：本地 Python 快速预览

```bash
cd health-analyzer
npm run react:export-cutover
cd web-ui/public
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000  （React）
```

## 选项 2：本地 Node 服务器

```bash
npx serve health-analyzer/web-ui/public
# 或
npx http-server health-analyzer/web-ui/public -p 8000
```

## 选项 3：部署到 GitHub Pages

本仓库使用 Actions：`export-cutover` 后上传 `web-ui/public`（见 `.github/workflows/deploy.yml`）。  
项目页 URL 形如 `https://<USER>.github.io/health-analyzer/`。

发版前建议：

```bash
npm run test:release   # lib + cutover + smoke + FHIR HL7 + e2e-react
npm run react:privacy  # hits=0
```

## 核心库构建

修改 `lib/src/**` 后：

```bash
cd lib && npm test && npm run build
# → dist/*.js + dist/browser.iife.js（FHIR 脚本 / smoke 使用）
```

## 主包体积说明（v2.5.6+）

四工作区已 **按路由 code-split**（`React.lazy`），并拆出 `vendor-react` / `health-lib` 稳定 chunk：

| Chunk（约） | 角色 |
|-------------|------|
| `index-*.js` | 壳 + 路由入口（约数 KB gzip） |
| `vendor-react-*.js` | React / react-dom / react-router |
| `health-lib-*.js` | `@health-analyzer/lib` 内核 |
| `OverviewPage` / `TrendsPage` / … | 各工作区按需加载 |
| ECharts 相关 | 仍不预缓存，进趋势页再拉 |
| `OverviewAdvancedTools-*.js` | 总览高级工具（idle 后加载；v2.5.7+） |

生产构建不应再因单一主包 &gt;500KB 报警；图表 chunk 仍按需。

## 相关

- 数据恢复：`docs/DATA_RECOVERY.md`  
- 迁移状态：`docs/LEGACY_PARITY.md`  
