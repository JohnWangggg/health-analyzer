# 苹果健康数据分析 PWA

本地隐私优先 · 跨平台 · 零服务器

一款把 iPhone 苹果健康 App 导出的数据包（ZIP / XML）解析、统计、并生成可粘贴到豆包 / ChatGPT / Claude 等大模型平台的标准化提示词的纯前端 PWA 应用。

## 5 分钟上手

### 用户端

1. iPhone "健康" App → 头像 → 导出健康数据 → 得到 `apple_health_export.zip`
2. 在浏览器打开本应用 → 选择"📦 ZIP" → 拖入文件 → 等待解析
3. 查看"数据可用性"和"关键统计摘要"
4. 切换到"完整提示词" → 点击"📋 复制"
5. 粘贴到豆包 / Kimi / ChatGPT → 得到完整分析报告

### 开发者端

```bash
# 1. 启动本地预览
cd health-analyzer/web-ui/public
python3 -m http.server 8000

# 2. 浏览器打开 http://localhost:8000

# 3. 部署（详见 docs/DEPLOY.md）
# 静态文件直接拷贝到任意 Web 服务器即可
```

## 核心特性

- ✅ 100% 本地计算，零数据上传
- ✅ 跨平台（Windows / Mac / Linux / iOS / Android）
- ✅ PWA 可安装，离线可用
- ✅ 自动检测用户有哪些数据类型（CGM / 血压 / 体重 / HRV / 心率 / 步数 / 睡眠 / ECG）
- ✅ 三档提示词：完整 / 仅数据 / 简短系统提示
- ✅ 一键复制或下载为 .md
- ✅ 无后端，零服务器成本

## 项目结构

```
health-analyzer/
├── lib/             # TypeScript 核心库（可被其他前端复用）
├── web-ui/public/   # PWA 静态资源（直接部署即可）
└── docs/            # 完整文档
```

详见 [docs/README.md](docs/README.md)

## 部署到 GitHub Pages（推荐）

本项目已内置 GitHub Actions 工作流，推送到 `main` 分支即可自动部署。

### 一次性配置

1. 在 GitHub 上新建一个空仓库（建议命名为 `health-analyzer`），**不要**勾选 "Add a README"
2. 在本地执行（将 `<USER>` 替换为你的 GitHub 用户名）：

   ```bash
   cd health-analyzer
   git remote add origin git@github.com:<USER>/health-analyzer.git
   git push -u origin main
   ```

3. 进入 GitHub 仓库 → **Settings** → **Pages** → **Source** 选择 **GitHub Actions**
4. 等待 Actions 跑完（约 1–2 分钟），访问：

   ```
   https://<USER>.github.io/health-analyzer/
   ```

> 部署时仅上传 `web-ui/public/` 目录；PWA 的资源全部使用相对路径，可直接在子路径下工作。

### 更新内容

以后改完代码只需：

```bash
git add -A
git commit -m "update: ..."
git push
```

Actions 会自动重新部署。

## 文档

- [docs/README.md](docs/README.md) — 项目说明、功能、限制、未来扩展
- [docs/DEPLOY.md](docs/DEPLOY.md) — 6 种部署方案 + 自定义指南
- [docs/PROMPT_DESIGN.md](docs/PROMPT_DESIGN.md) — 提示词工程设计

## 许可

MIT License