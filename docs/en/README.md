# Apple Health Data Analyzer PWA

> Local · privacy-first · cross-platform · zero server

A pure front-end PWA that parses iPhone Apple Health exports (ZIP / XML), computes summaries, and generates standardized prompts you can paste into Doubao / ChatGPT / Claude / Gemini and similar LLM apps.

**Language:** [中文](../README.md) | **English**

## Core features

- ✅ **100% on-device**: XML parse, stats, and prompt generation run in the browser — nothing uploaded
- ✅ **Zero-dependency deploy**: host the single `web-ui/public/` folder on any static server
- ✅ **Cross-platform**: desktop (Windows / Mac / Linux) and mobile (iOS Safari / Android Chrome)
- ✅ **Installable PWA**: add to Home Screen; offline via Service Worker (network-first + cache fallback)
- ✅ **Adaptive data sections**: only generate chapters for metrics you actually have (CGM, BP, weight, Watch, etc.)
- ✅ **Apple Watch daily rollups**: active energy, exercise minutes, SpO₂ (night/day bands), respiratory rate, VO₂ max, wrist temperature, overnight HR (aggregated at parse time — full raw HR series is not stored)
- ✅ **Workout sessions**: parse `<Workout>` blocks (localized type labels, duration, kcal, distance, avg/max HR); CSV export and recovery-related signals
- ✅ **7-day recovery dashboard**: heuristic score from recent HRV / night HR / exercise / workouts / sleep / stand hours / daylight
- ✅ **Multi-week recovery & load trends**: default 12-week series, charts, and prompt tables
- ✅ **ECG classification stats**: `electrocardiograms/*.csv` from ZIP or folder; high-HR events linked to training ±2h vs non-exercise windows
- ✅ **Sleep breathing disturbance**: daily series, 7-day mean, relative-elevation heuristics
- ✅ **Joint signals**: breathing disturbance × night SpO₂; high-HR ECG × same-day steps/exercise; CGM × sleep/activity (short sleep + lows, high readings + low steps, etc.)
- ✅ **One-click weekly Markdown report**; recovery score vs recent multi-week median baseline
- ✅ **Tunable recovery weights** (localStorage) + weekly-report history on device (IndexedDB)
- ✅ **Three prompt modes**: full (with guidance) / data-only / short system prompt
- ✅ **Multiple outputs**: clipboard, `.md` download, JSON / CSV (ZIP) export
- ✅ **Personal context**: meds / target weight / focus areas injected into prompts (localStorage)
- ✅ **Cross-metric hints + trend charts + history compare** (IndexedDB snapshots)
- ✅ **Results overview KPIs** + sticky bottom “Copy full prompt”
- ✅ **Dark mode**: system follow or manual light / dark / auto
- ✅ **Responsive / adaptive UI**: mobile-first layout, safe-area insets, collapsible detail, sticky CTAs
- ✅ **UI & docs i18n**: bilingual documentation (`docs/` + `docs/en/`); UI language resources under `web-ui/public/i18n/`
- ✅ **Health Auto Export incremental import**: multi-file JSON/CSV or folder merge on-device, dedupe stats, unknown-metrics list (full ZIP still supported)

## Project layout

```
health-analyzer/
├── lib/                          # TypeScript core (parse / stats / prompts / export)
│   ├── src/
│   │   ├── types.ts
│   │   ├── parser.ts
│   │   ├── stats.ts
│   │   ├── signals.ts
│   │   ├── snapshot.ts
│   │   ├── weekly-report.ts
│   │   ├── csv-import.ts
│   │   ├── export.ts
│   │   ├── prompts/
│   │   │   └── llm-prompt.ts
│   │   └── index.ts
│   ├── scripts/build-browser.mjs
│   └── test/
├── web-ui/public/                # Deployable PWA static assets
│   ├── index.html
│   ├── styles.css
│   ├── app.js / charts.js / history-db.js
│   ├── lib.js                    # Built from lib/src — do not edit by hand
│   ├── parse-worker.js
│   ├── sw.js / manifest.json
│   ├── i18n/                     # UI locale resources
│   └── icons/
└── docs/
    ├── README.md                 # Chinese docs (this project’s default)
    ├── DEPLOY.md
    ├── PROMPT_DESIGN.md
    └── en/                       # English docs
        ├── README.md
        ├── DEPLOY.md
        └── PROMPT_DESIGN.md
```

## Quick start

### End-user flow

1. **Export from iPhone**  
   Health app → profile photo → **Export All Health Data** → save `export.zip` (or similar).

2. **Open the PWA**  
   Open the deployed app in a browser (or install to Home Screen). Default import is Apple Health ZIP (XML / folder under “other import methods”).

3. **Upload & parse**  
   Tap to pick (mobile) or drag-and-drop (desktop). Large files use a Web Worker (falls back to main thread on failure).

4. **Review overview**  
   KPI cards, data availability, expandable detail, cross-metric hints, trend charts (swipe for values). Optional JSON/CSV export and snapshot history for week-over-week compare.

5. **Generate prompts**  
   Full / data-only / short system prompt; optional personal context and cross-metric hints.

6. **Paste into an LLM**  
   Use overview or sticky bar **Copy full prompt** → Doubao / Kimi / ChatGPT / Claude / Gemini. Always cross-check the model’s report against your raw numbers.

### Health Auto Export (HAE) incremental import (v1.40)

When you prefer scheduled **Health Auto Export** dumps (JSON/CSV) over re-exporting a full Apple Health ZIP every time:

1. **Prefer** automated HAE export to **iCloud Drive** (JSON or CSV; multi-file per metric is fine).
2. In the app, open **Health Auto Export incremental import**, pick files or a folder → **Merge HAE data**.
3. After merge you’ll see **added / updated / skipped** counts; unmapped metrics appear in an **unknown-metrics list** (awareness only; checked names are recorded as intent—v1.40 still does not store unknown series).
4. Still **local-only**; full Apple Health ZIP / XML / folder import remains supported and can complement HAE (ZIP once, HAE for deltas).
5. **Not a substitute for clinical care**—stats and prompts are for personal review and visit prep, not diagnosis or treatment.

### Developer flow

```bash
cd lib
npm install
npm test
npm run build     # emits web-ui/public/legacy/lib.js

cd ../web-ui/public
python3 -m http.server 8000
# open http://localhost:8000
```

Push to `main` runs CI tests/build then deploys GitHub Pages (see [DEPLOY.md](./DEPLOY.md)).

## Design highlights

### 1. Adaptive sections from data availability

Chapters are driven by booleans on `dataAvailability`:

```ts
hasCgm: boolean;            // → CGM section
hasBloodPressure: boolean;  // → blood pressure
hasWeight: boolean;         // → weight
hasHrv: boolean;            // → HRV
hasHeartRate: boolean;      // → heart rate
hasSteps: boolean;          // → steps
hasSleep: boolean;          // → sleep
hasEcg: boolean;            // → ECG
// Watch / workout / recovery fields similarly gate UI, charts, and prompt tables
```

Typical phone-only exports have steps / sleep / HRV / HR / weight and skip CGM / BP / ECG.

### 2. Local-first architecture

```
┌─────────────────────────────────────────┐
│ Browser (user device)                   │
│  File pick / drop                       │
│  → FileReader → ArrayBuffer             │
│  → fflate (local) unzip                 │
│  → streaming XML parser (<Record> /     │
│     <Workout> / ECG CSVs)               │
│  → stats (mean / SD / CV / TIR / …)     │
│  → signals + recovery + weekly report   │
│  → prompt templates                     │
│  → render / copy / download             │
└─────────────────────────────────────────┘
         │ (no health detail upload)
         ▼
   user pastes prompt into LLM of choice
```

### 3. Streaming parse + progress

Large XML (tens of thousands of records) is scanned line-by-line with ~1% progress updates so the UI stays responsive. Optional date-range filter reduces work further.

### 4. PWA offline

Service Worker caches static assets (network-first for HTML/JS/CSS). After install, launch from Home Screen offline.

### 5. Responsive UI

Layout adapts across phone and desktop: safe-area padding, sticky copy bar, compact KPI grids, chart height/chips on narrow viewports, reduced-motion respect.

## Comparison

| | This app | Python scripts | Online SaaS |
|---|---|---|---|
| Privacy | ✅ Fully local | ⚠️ Local CLI | ❌ Upload |
| Mobile | ✅ Browser | ❌ Termux-class | ✅ Login required |
| Cross-platform | ✅ Any modern browser | ⚠️ Needs Python | ✅ Browser |
| Deploy | ✅ Static host | ✅ Single script | ✅ Hosted |
| LLM integration | ✅ Prompt generation | ❌ DIY | ✅ Often built-in |
| Offline | ✅ PWA | ✅ | ❌ |

## Tech stack

- **Core**: TypeScript only in `lib/src`, esbuild IIFE → `web-ui/public/legacy/lib.js`
- **ZIP**: local `fflate.min.js` (no CDN)
- **PWA**: Service Worker + manifest + SVG icons
- **UI**: vanilla CSS (responsive + dark mode); overview KPIs / sticky CTAs
- **Storage**: full detail in memory by default; localStorage (context, theme, recovery weights, chart range); IndexedDB (summary history, weekly reports)

## Build

```bash
cd lib
npm install
npm test
npm run build
```

Change parse/stats/prompts only under `lib/src/**`, then rebuild. Do not hand-edit `web-ui/public/legacy/lib.js`.

## Limits & caveats

1. **Not medical advice** — stats and LLM prompts do not replace clinical judgment.
2. **External devices** (Omron, etc.) may differ in algorithms; CSV merge is best-effort.
3. **Very large exports** — prefer the on-page date-range filter if over ~100k records.
4. **LLM output must be verified** against your raw data.
5. **iOS Safari** — prefer iOS 16+ for File API / PWA behavior.
6. **Future-dated records** are dropped by default (e.g. mistyped future weight); skip count is shown — still delete bad entries in Health.

## Roadmap (selected)

Done recently includes: Watch daily rollups, workouts, recovery dashboard & multi-week trends, ECG stats, breathing disturbance, joint signals, weekly MD report, tunable recovery weights, weekly-report history, CGM×sleep/activity signals, responsive UI polish, bilingual docs / i18n scaffolding, Health Auto Export JSON/CSV incremental import with dedupe stats and unknown-metrics listing.

Still open:

- [ ] Custom prompt templates
- [ ] Multi-user / family member datasets
- [ ] Direct Doubao / ChatGPT API (user-supplied keys)

## Related docs

- [DEPLOY.md](./DEPLOY.md) — hosting & customization  
- [PROMPT_DESIGN.md](./PROMPT_DESIGN.md) — prompt engineering  
- [Chinese docs index](../README.md)

## License

MIT License
