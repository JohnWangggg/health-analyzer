/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libSrc = path.resolve(__dirname, '../../lib/src/index.ts');

/** Production default base=/ ; optional VITE_BASE=/next/ for deprecated preview export */
const base = process.env.VITE_BASE || '/';

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // User confirms refresh — avoid mid-import SW takeover
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '健康 OS',
        short_name: '健康 OS',
        description: '本地优先健康分析（React 生产壳；/legacy/ 仅跳转说明页）',
        lang: 'zh-CN',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Shell + workspace pages + vendor; chart / echarts/* still on demand
        globPatterns: [
          '**/*.{css,html,ico,png,svg,woff2,webmanifest,json}',
          '**/index-*.js',
          '**/rolldown-runtime-*.js',
          '**/workbox-window*.js',
          '**/parseWorkerClient-*.js',
          '**/analyze.worker-*.js',
          '**/vendor-react-*.js',
          '**/health-lib-*.js',
          '**/useHealthStore-*.js',
          '**/OverviewPage-*.js',
          '**/OverviewAdvancedTools-*.js',
          '**/TrendsPage-*.js',
          '**/ReportsPage-*.js',
          '**/DataPage-*.js',
        ],
        globIgnores: [
          '**/*.map',
          '**/echarts-*.js',
          '**/TrendChart-*.js',
          '**/charts-*.js',
          '**/components-*.js',
          '**/renderers-*.js',
          '**/core-*.js',
          '**/axisHelper-*.js',
          '**/axisNiceTicks-*.js',
          '**/createSeriesData-*.js',
          '**/graphic-*.js',
          '**/Image-*.js',
        ],
        navigateFallback: 'index.html',
        // Do not SPA-fallback API or legacy rollback (match with or without project base)
        navigateFallbackDenylist: [
          /^\/api\//,
          /\/legacy(?:\/|$)/,
          /\/assets\//,
        ],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],

  resolve: {
    alias: {
      '@health-analyzer/lib': libSrc,
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: false,
  },
  build: {
    // P1: no public source maps in shippable dist
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        /**
         * Stable vendor / kernel chunks so route pages stay smaller and
         * browser cache survives app-only edits.
         */
        manualChunks(id) {
          if (
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/react/') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'vendor-react';
          }
          // Kernel via alias @health-analyzer/lib → lib/src
          if (
            id.includes('/lib/src/') ||
            id.endsWith('/lib/src/index.ts') ||
            id.includes(`${path.sep}lib${path.sep}src${path.sep}`)
          ) {
            return 'health-lib';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
