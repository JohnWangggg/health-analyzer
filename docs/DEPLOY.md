# 部署指南

将 `web-ui/public/` 目录中的所有文件托管到任意静态 Web 服务器即可。

## 选项 1：本地 Python 快速预览

适合开发测试：

```bash
cd health-analyzer/web-ui/public
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000
```

## 选项 2：本地 Node 服务器

```bash
npx serve health-analyzer/web-ui/public
# 或
npx http-server health-analyzer/web-ui/public -p 8000
```

## 选项 3：部署到 GitHub Pages

1. 把 `health-analyzer/web-ui/public/` 推到 GitHub 仓库的 `gh-pages` 分支
2. 在仓库 Settings → Pages → Source 选择 `gh-pages` 分支
3. 访问 `https://<your-name>.github.io/<repo>/`

## 选项 4：部署到 Netlify / Vercel / Cloudflare Pages

1. 注册并登录（GitHub 账号即可）
2. "New Site" → 选择您的仓库
3. Build command: 留空
4. Publish directory: `health-analyzer/web-ui/public`
5. 部署完成，自动获得 HTTPS 域名

## 选项 5：部署到自己的 VPS

```bash
# 复制文件
scp -r health-analyzer/web-ui/public user@server:/var/www/health-analyzer

# 在服务器上配置 nginx
server {
    listen 80;
    server_name health.example.com;
    root /var/www/health-analyzer;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# 可选：HTTPS via certbot
certbot --nginx -d health.example.com
```

## 选项 6：完全离线使用（不部署）

如果只在个人设备上使用，可以直接 `file://` 打开 `index.html`。

但注意：
- iOS Safari 不允许 `file://` 安装 PWA
- 部分 File API 在 `file://` 下行为不同
- Service Worker 在 `file://` 下不生效（不影响核心功能）

## 添加到主屏幕

部署完成后，在移动浏览器中：

- **iOS Safari**：点击底部分享按钮 → "添加到主屏幕"
- **Android Chrome**：右上角菜单 → "添加到主屏幕" 或 "安装应用"

之后会像原生 App 一样从桌面图标启动，并支持离线使用。

## 验证部署

打开浏览器开发者工具的 Console，输入：

```js
HealthAnalyzer.parseHealthXml
```

应返回函数定义。如果显示 `undefined`，说明 `lib.js` 未正确加载。

## 故障排查

| 问题 | 解决方案 |
|---|---|
| 解析后无数据 | 确认 XML 文件名是 `export.xml` 或 `导出.xml` |
| ZIP 上传失败 | 浏览器不允许加载 fflate CDN（公司内网等）—— 改用"📄 单独的 XML 文件"方式 |
| 文件夹上传无反应 | 部分浏览器需用 `<input webkitdirectory>`，桌面 Chrome / Edge 支持，iOS Safari 仅支持文件 |
| 数据不显示 | 检查浏览器版本，建议 Chrome 100+ / Safari 16+ |
| Service Worker 不注册 | HTTPS 或 localhost 是必要条件，HTTP 站点无法注册 SW（核心功能仍可用） |

## 自定义

### 修改配色

编辑 `web-ui/public/styles.css` 顶部的 `:root` 变量：

```css
:root {
  --primary: #2980b9;      /* 主色：按钮/链接 */
  --primary-dark: #1a5276; /* 强调色：标题 */
  --primary-light: #ebf5fb;/* 背景：卡片/块 */
  ...
}
```

### 修改提示词风格

编辑 `web-ui/public/lib.js` 中的 `MAIN_PROMPT_TEMPLATE` 字符串。

### 添加新数据维度

1. 在 `lib/src/types.ts` 添加字段
2. 在 `lib/src/parser.ts` 添加解析逻辑
3. 在 `lib/src/stats.ts` 添加统计函数
4. 在 `lib.js` 中同步修改
5. 在 `app.js` 的 `renderSummary()` 添加渲染
6. 在 `formatAnalysisForLLM()` 添加对应章节