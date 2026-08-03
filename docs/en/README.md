# Apple Health Data Analyzer PWA

> Local · privacy-first · cross-platform · zero server

Parses iPhone Apple Health exports (ZIP / XML) in the browser, computes summaries, and builds paste-ready LLM prompts. Pure front-end PWA — no backend.

**Language:** [中文](../README.md) | **English**

Live demo (GitHub Pages after deploy):  
`https://<USER>.github.io/health-analyzer/`

---

## Product entry (Strategy A — React is default)

| URL | Role |
|-----|------|
| **`/`** | **Production default** React shell (Overview · Trends · Reports · Data) |
| **`/legacy/`** | Legacy PWA **rollback only** |

Publish: `npm run react:export-cutover` → React at `web-ui/public/` root; `public/legacy/` kept.  
GitHub **project** Pages uses `base=/<repo>/` automatically on deploy (`GITHUB_PAGES_DEPLOY=true`). SPA deep links use `404.html` = `index.html`.

### React default path (migration progress)

- ✅ Import: fixture · XML · ZIP · HAE; progress + session-ready strip  
- ✅ Overview: status band · today snapshot · KPI visibility · **LLM prompt + personal context** (shared localStorage with legacy)  
- ✅ Trends: multi-domain · `data-has-data` tabs · empty-domain switch · lazy ECharts  
- ✅ Reports: visit / weekly / clinical · copy/download · empty CTA to Overview  
- ✅ Warehouse: sharded-v1 R/W · keep-N presets · multi-select shard delete · **backup/restore** (plain + AES-GCM)  
- ✅ Engineering: cutover layout gate · e2e-react · dual warehouse · privacy scan  
- ⏳ Still on `/legacy/` if needed: full FHIR UI, TV dashboard mode, fine-grained recovery-weight UI, etc.

Docs: [`DUAL_TRACK_UI.md`](../DUAL_TRACK_UI.md) · [`DEPLOY.md`](./DEPLOY.md) · Chinese hub [`../README.md`](../README.md)

---

## Core features

- ✅ **100% on-device**: parse, stats, prompts — nothing uploaded  
- ✅ **Static deploy**: host `web-ui/public/` (React root + `legacy/`)  
- ✅ **Cross-platform** desktop & mobile browsers  
- ✅ **PWA**: installable; SW with user-confirm update  
- ✅ Adaptive metrics (CGM, BP, weight, Watch, …)  
- ✅ Apple Watch daily rollups, workouts, ECG, sleep disturbance  
- ✅ 7-day recovery / multi-week load trends (heuristic, not diagnosis)  
- ✅ Weekly / visit / clinical Markdown reports  
- ✅ Three LLM prompt modes (full / data-only / short system)  
- ✅ Clipboard · `.md` download · JSON/CSV export  
- ✅ Personal context (localStorage) · IndexedDB snapshots  
- ✅ Dark mode · i18n (zh-CN / zh-TW / en on legacy UI; React zh/en shell)  
- ✅ Health Auto Export (HAE) incremental merge  

---

## Project layout

```
health-analyzer/
├── lib/                      # TypeScript kernel
├── web-ui/
│   ├── public/               # ★ Deploy root (Pages / wrangler)
│   │   ├── index.html …      # React (export-cutover; gitignored)
│   │   ├── 404.html          # SPA fallback for GitHub Pages
│   │   └── legacy/           # Legacy PWA rollback
│   └── react-app/            # ★ React source (production shell)
├── e2e/ · e2e-react/ · e2e-dual/
└── docs/ · docs/en/
```

---

## Quick start

### End user

1. iPhone Health → profile → **Export All Health Data** → ZIP  
2. Open the deployed app (`/` is React)  
3. Import ZIP / XML / HAE · review Overview KPIs  
4. **Copy LLM prompt** or open Reports · Trends  
5. Optional: save warehouse · backup · keep-N · shard cleanup on **Data**  
6. Rollback: open `/legacy/` if you need the old UI  

### Developer

```bash
cd health-analyzer/lib && npm install && npm test && npm run build
cd .. && npm install && npm run react:install
npm run react:export-cutover          # base=/ for local
# GitHub Pages deploy sets GITHUB_PAGES_DEPLOY=true → base=/<repo>/

npx serve web-ui/public -l 8080
# http://localhost:8080/          → React
# http://localhost:8080/legacy/   → rollback

npm run react:test
npm run smoke && npm run test:cutover-layout
npm run test:e2e:react
```

---

## Deploy

### GitHub Pages (this repo)

On `main` push:

1. **test** job: lib + cutover (base `/`) + smoke + Playwright  
2. **deploy** job: cutover with `GITHUB_PAGES_DEPLOY=true` → `base=/health-analyzer/` (repo name) + `404.html` → upload `web-ui/public/`

Settings → Pages → Source = **GitHub Actions**.  
App: `https://<USER>.github.io/health-analyzer/`  
Legacy: `https://<USER>.github.io/health-analyzer/legacy/`

### Cloudflare / static host

```bash
npm run react:export-cutover   # usually VITE_BASE=/
npx wrangler deploy            # assets.directory = web-ui/public
```

See [DEPLOY.md](./DEPLOY.md).

---

## Version highlights (Strategy A · living changelog)

| Version / commit | Notes |
|------------------|--------|
| **v2.3-cutover** `b2178b6` | React default at `/`; legacy under `public/legacy/`; export-cutover; CI/e2e retarget |
| `3b08429` | Docs/package framing: new replaces old |
| `9bc090a` | React warehouse **backup/restore** (AES-GCM + plain) |
| `80d5b02` | React **multi-select shard cleanup** |
| `b2e7363` | Shard-delete e2e hard path; overview session UX |
| `2e99eec` | Plain + **encrypted backup e2e**; trends domain presence |
| `f58d6fc` | Reports empty CTA/meta; Keep-N one-tap presets |
| **v2.3.1** `bb9a6d4` | Pages **base=/\\<repo\\>/** + `404.html`; Overview **LLM prompt copy**; README zh/en living changelog |
| **v2.3.2** `9fd9f57` | React **personal context** (same localStorage key as legacy) + **today snapshot** strip; inject into LLM prompt |
| **v2.3.3** `68901ec` | React **include-sensitive toggle**: strip meds/conditions from LLM prompt when off (key `health-analyzer-include-sensitive-ctx`, same as legacy; default on) |
| **v2.4**  | **Full product path on React**: events · CSV merge · recovery weights · TV mode · JSON/CSV/snapshot export · FHIR local archive · clinical HTML/sensitive options |

### Release checklist

```bash
npm run react:test
npm run react:export-cutover && npm run test:cutover-layout && npm run smoke
npm run test:e2e:react
```

---

## Design notes

- Local-first; no CDN analytics in React privacy-scan  
- Kernel stays in `lib/`; React uses HealthCoreAdapter only  
- Warehouse: IndexedDB v5 `sharded-v1`, shared with legacy  
- Not a medical device; no diagnosis  

## License

MIT
