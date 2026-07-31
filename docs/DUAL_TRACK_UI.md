# Dual-track UI: legacy PWA + React Health OS preview

**Baseline tip (migration start):** `cb1685d` (v2.1 legacy)  
**React track status:** phases **0–6** + follow-on (XML import/Worker, IDB read, `/next` export).  
**Production default entry:** still **`web-ui/public`** (legacy).

## Default production path (unchanged)

| Path | Role |
|------|------|
| `web-ui/public/` | **Default shippable PWA** |
| Root scripts | `npm run smoke`, `npm run test:e2e`, `npm run test:lib`, `npm run test:fhir*` |

## React preview track

| Path | Role |
|------|------|
| `web-ui/react-app/` | Vite + React + TypeScript source |
| `web-ui/react-app/dist/` | Standalone preview build (`base=/`) |
| `web-ui/public/next/` | **Optional** same-host export (`base=/next/`, gitignored) |

### Scripts (repo root)

```bash
npm run react:install
npm run react:dev
npm run react:build
npm run react:preview
npm run react:privacy
npm run react:parity
npm run react:test
npm run react:export-next   # build base=/next/ → web-ui/public/next/
npm run test:e2e:react      # Playwright React shell smoke (port 4174)
```


### Same-host dual-track (`/next/`)

1. `npm run react:export-next`
2. Serve `web-ui/public` as today.
3. Open **legacy** `/` or click header **「试用新版」** → `/next/`.
4. React shell → 关于 → **返回 legacy**（`../`）或设置 `localStorage ha-ui-shell`.

**Preference key:** `localStorage['ha-ui-shell'] = 'react' | 'legacy'`  
- React 关于面板可写入偏好。  
- Legacy `index.html` 仅在偏好为 `react` **且** `./next/index.html` 可访问时跳转（e2e 默认不设置，不误跳）。

**Rollback:** delete `web-ui/public/next/` or clear preference; production root stays `public/`.

### Feature surface (shipped)

| Area | Behavior |
|------|----------|
| Shell | Desktop sidebar + mobile bottom nav (`workspaceStore`), Sheet, theme |
| Overview | Fixture + **XML/ZIP import** (local `fflate`) + Worker-first XML analyze |
| Overview | **Load warehouse** (consent + reassemble domainChunks) + **save snapshot** |
| Trends | Lazy local ECharts + table fallback |
| Reports | visit / weekly / clinical via lib |
| Data | IDB contract probe + snapshots / warehouseMeta (read-only list) |
| Privacy | Self-only PWA; privacy-scan; no CDN |
| Tests | `npm run react:test` · `npm run test:e2e:react` (Playwright on preview :4174) |


### Architecture boundary

- `HealthCoreAdapter` → lib parse/analyze/report/series  
- Module Worker `analyze.worker.ts` (fallback main thread)  
- IDB empty-create + indexes locked to `history-db.js`  
- No force schema migration; no stats reimplementation in React  

### Privacy

Health data stays in browser / Worker / IndexedDB only.

## Out of scope (still deferred)

HAE merge pipeline in React, warehouse **write**/shard trim UI, CommandPalette, Tailwind/shadcn full suite, production default cutover without operator decision.

