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
        description: '本地优先健康分析（生产默认 React 壳；/legacy/ 为回滚）',
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
        // Shell assets only — chart / echarts/* chunks load on demand
        globPatterns: [
          '**/*.{css,html,ico,png,svg,woff2,webmanifest,json}',
          '**/index-*.js',
          '**/rolldown-runtime-*.js',
          '**/workbox-window*.js',
          '**/parseWorkerClient-*.js',
          '**/analyze.worker-*.js',
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
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
