# Agent 协作约定（health-analyzer）

## 角色分工

| 角色 | 模型建议 | 职责 | 不要做 |
|------|----------|------|--------|
| **UI 审美主力** | `kimi-code` | 视觉层级、间距/配色/动效、交互手感、组件观感、桌面/移动差异化「好不好看、好不好用」 | 大段业务逻辑、解析器、统计、测试脚手架、文档翻译、git 推送、大范围 i18n 词条搬运 |
| **全能辅助（默认）** | Grok / 当前会话主模型 | 架构与实现杂活：lib 逻辑、接线、测试、构建、文档、i18n 词条与 locale 管线、CSS 功能布局落地、合并冲突、提交推送 | 不要把「纯审美微调」全堆给 Grok 而不分派；也不要让 kimi 写半个后端 |

## 协作流程

1. **Grok 先拆任务**：把「审美/交互」与「逻辑/杂活」切开。  
2. **kimi 只收 UI 切片**：prompt 里写清文件范围（通常 `web-ui/public/styles.css`、`index.html` 局部、少量 `app.js` 交互），并写「不要改 lib/、不要 commit」。  
3. **Grok 并行或随后做杂活**：locale、测试、README、SW 缓存、导出/分析 API、把 kimi 产物接到数据流。  
4. **Grok 统一验收**：`npm test` / `npm run build` / 手动扫一眼关键交互，再 commit & push。

## kimi 任务写法模板

```
你是 UI 审美与交互优化主力。只改 web-ui/public 下样式与交互表现。
范围：styles.css / index.html（结构微调）/ app.js 仅限 UI 状态类（折叠、焦点、动画）。
不要：lib/src、测试大改、文档翻译、git commit。
目标：【一句话审美目标】
约束：保留 data-i18n、无障碍、prefers-reduced-motion。
```

## 原则

- **Token 效率**：kimi 不做「翻译 150 个词条 / 写 500 行测试」这类杂活。  
- **单一真相**：业务与统计只在 `lib/src`；UI 只消费 `window.HealthAnalyzer`。  
- **用户说「继续」**：Grok 默认推进功能 + 接线；若涉及明显视觉升级，再短派 kimi。
