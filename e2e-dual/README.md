# e2e-dual — **已退役**

本目录保留 **Strategy A 迁移期** 同域 React ↔ 旧 `/legacy/` UI 的仓交叉 Playwright 用例，仅作历史档案。

| 项 | 状态 |
|----|------|
| `npm run test:e2e:dual` | **已从 package.json 删除**（避免 exit 0 假通过） |
| 目标旧 UI | **已删除**；`public/legacy/` 仅为跳转 stub |
| 现行门禁 | `npm run test:e2e:react`（= `test:e2e`） |

**不要**在 CI 或发布清单中引用本目录为通过门禁。  
本机恢复与回退说明见 `docs/DATA_RECOVERY.md`。
