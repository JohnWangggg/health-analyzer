# Deployment guide

Host everything under `web-ui/public/` on any static web server.

**Language:** [中文](../DEPLOY.md) | **English**

## Option 1: Local Python preview

Good for development:

```bash
cd health-analyzer/web-ui/public
python3 -m http.server 8000
# open http://localhost:8000
```

## Option 2: Local Node server

```bash
npx serve health-analyzer/web-ui/public
# or
npx http-server health-analyzer/web-ui/public -p 8000
```

## Option 3: GitHub Pages (recommended for this repo)

### A. GitHub Actions (current workflow)

On push to `main`, CI runs `npm test` + `npm run build` in `lib/`, then deploys `web-ui/public/`.

1. Repository **Settings → Pages → Source**: **GitHub Actions**
2. Push to `main` (or run the deploy workflow manually)
3. Open `https://<USER>.github.io/<repo>/` (e.g. `https://<USER>.github.io/health-analyzer/`)

```bash
cd health-analyzer
git push origin main
```

> Note: the browser bundle `lib.js` should already be committed after `npm run build`, or regenerated in CI before artifact upload depending on your workflow. The included workflow runs tests/build as a gate, then uploads `./web-ui/public`.

### B. Classic `gh-pages` branch

1. Publish contents of `web-ui/public/` to a `gh-pages` branch  
2. Settings → Pages → Source: `gh-pages`  
3. Visit `https://<your-name>.github.io/<repo>/`

## Option 4: Netlify / Vercel / Cloudflare Pages

1. Sign in (GitHub is fine)  
2. New site → select the repository  
3. Build command: leave empty (or run `cd lib && npm ci && npm run build` if you prefer CI rebuild)  
4. Publish directory: `web-ui/public` (or `health-analyzer/web-ui/public` if the monorepo root is parent)  
5. Deploy → HTTPS URL provided automatically  

## Option 5: Your own VPS

```bash
scp -r health-analyzer/web-ui/public user@server:/var/www/health-analyzer
```

Example nginx:

```nginx
server {
    listen 80;
    server_name health.example.com;
    root /var/www/health-analyzer;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Optional HTTPS:

```bash
certbot --nginx -d health.example.com
```

## Option 6: Fully offline (no host)

Open `index.html` via `file://` on a personal device.

Caveats:

- iOS Safari will not install a PWA from `file://`
- Some File API behavior differs under `file://`
- Service Worker does not register on `file://` (core parse/stats still work)

## Add to Home Screen

After HTTPS (or localhost) deploy:

- **iOS Safari**: Share → **Add to Home Screen**
- **Android Chrome**: menu → **Add to Home Screen** / **Install app**

Then launch from the icon; offline use is supported when SW is active.

## Verify deployment

In the browser console:

```js
HealthAnalyzer.parseHealthXml
```

Should be a function. If `undefined`, `lib.js` failed to load.

## Troubleshooting

| Issue | What to try |
|---|---|
| Parse completes with no metrics | Confirm XML is named `export.xml` or `导出.xml` inside the ZIP |
| ZIP fails to open | Prefer local `fflate.min.js` (already bundled). Fall back to **single XML file** import |
| Folder import does nothing | Needs `webkitdirectory`; desktop Chrome/Edge work best; iOS Safari is file-oriented |
| Blank UI / missing data | Use Chrome 100+ / Safari 16+ |
| Service Worker not registered | Requires HTTPS or `localhost`; plain HTTP sites skip SW (core features still work) |
| Stale UI after deploy | Hard refresh or bump SW `CACHE_NAME`; network-first reduces staleness |

## Customization

### Colors

Edit CSS variables at the top of `web-ui/public/styles.css`:

```css
:root {
  --primary: #2980b9;
  --primary-dark: #1a5276;
  --primary-light: #ebf5fb;
  /* … */
}
```

### Prompt tone / structure

Edit `MAIN_PROMPT_TEMPLATE` in `lib/src/prompts/llm-prompt.ts`, then:

```bash
cd lib && npm run build
```

### New metric dimension

1. Add fields in `lib/src/types.ts`  
2. Parse in `lib/src/parser.ts`  
3. Aggregate in `lib/src/stats.ts` (and signals / weekly report if needed)  
4. Format sections in `lib/src/prompts/llm-prompt.ts` → `formatAnalysisForLLM()`  
5. `cd lib && npm run build`  
6. Render in `web-ui/public/app.js` (`renderSummary`, charts, etc.)  

### UI copy / i18n

Locale resources live under `web-ui/public/i18n/`. Prefer keys over hard-coded strings when extending the UI. Documentation is bilingual: Chinese under `docs/`, English under `docs/en/`.
