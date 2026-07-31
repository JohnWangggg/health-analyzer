# Dual-track UI: legacy PWA + React Health OS preview

**Baseline tip (migration start):** `cb1685d` (v2.1 legacy)  
**React track status:** phases **0–6 product gates** shipped in `web-ui/react-app` (design shell, four workspaces, ECharts trends, reports, IDB status, privacy/PWA).  
**Production default entry:** still **`web-ui/public`** (legacy). Cutover deferred until operators choose to switch deploy root.

## Default production path (unchanged)

| Path | Role |
|------|------|
| `web-ui/public/` | **Default shippable PWA** — deploy this directory as today |
| Root scripts | `npm run smoke`, `npm run test:e2e`, `npm run test:lib`, `npm run test:fhir*` stay the regression gate |

Do **not** replace production `/` with React until cutover is explicitly decided. IndexedDB warehouse schema remains owned by `history-db.js`.

## React preview track

| Path | Role |
|------|------|
| `web-ui/react-app/` | Vite + React + TypeScript Health OS shell |
| `web-ui/react-app/dist/` | Preview build only (not mixed into legacy CSS) |

### Scripts (from repo root)

```bash
npm run react:install   # npm install in web-ui/react-app
npm run react:dev       # Vite dev server
npm run react:build     # production build → web-ui/react-app/dist
npm run react:preview   # vite preview (127.0.0.1:4173)
npm run react:privacy   # scan dist for forbidden third-party hosts
npm run react:parity    # adapter fixture parity (vitest)
npm run react:test      # all react-app vitest suites
```

### What shipped (phases 3–6)

| Phase | Content |
|-------|---------|
| 3 | Design tokens (CSS variables), Button/Card/Badge/Sheet, **desktop sidebar + mobile bottom nav** driven by `workspaceStore` active route, light/dark/system theme |
| 4a | Overview: freshness, priority card, KPIs from adapter summary |
| 4b | Trends: **lazy local ECharts** (`echarts` npm chunk) + data-table fallback via `extractTrendSeries` |
| 4c | Reports: visit / weekly / clinical Markdown via lib generators through adapter |
| 4d | Data: source/span/storage + IDB contract probe (stores + indexes match legacy) |
| 5 | Privacy scan clean; PWA self-only precache; ECharts not in Overview first-paint entry (separate `echarts-*.js` chunk) |
| 6 | Dual-track scripts/docs; **default entry remains legacy**; switch = deploy `react-app/dist` instead of `public` (revert by redeploying `public`) |

### Architecture boundary

- `HealthCoreAdapter` → `parseHealthXml` / `analyzeAll` / report builders / trend series maps
- No React reimplementation of stats
- IDB empty-create mirrors `history-db.js` indexes (`idbContract.test.ts` lock)

### IndexedDB contract

| Constant | Value |
|----------|--------|
| `DB_NAME` | `health-analyzer-history` |
| `DB_VERSION` | `5` |
| Stores | `snapshots`, `weeklyReports`, `healthEvents`, `importBatches`, `warehouseMeta`, `domainChunks` |
| Indexes | healthEvents: `date`+`createdAt`; importBatches: `createdAt`; domainChunks: `domain`+`updatedAt` |

### Privacy model

Health raw data stays in the browser, Workers, and IndexedDB only. No CDN for app assets, no analytics, no cloud health API. ECharts and icons are npm-bundled.

### Cutover / rollback (phase 6)

1. **Today (default):** serve `web-ui/public`.
2. **Preview React:** `npm run react:build && npm run react:preview` (or static host `web-ui/react-app/dist`).
3. **Optional cutover:** point static hosting root at `web-ui/react-app/dist` after gates pass.
4. **Rollback (one cycle):** point hosting root back at `web-ui/public`; legacy tree is never deleted by this track.

Local preference hook (`ui-shell=legacy|react`) may be added later; until cutover, production deploys continue to serve `web-ui/public`.

## Out of scope (still deferred)

Full More-page parity, every chart type, CommandPalette, full axe/visual matrix, force schema migration, Next.js/cloud. ECharts need not replace every legacy sparkline.
