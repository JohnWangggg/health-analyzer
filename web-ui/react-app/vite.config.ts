/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const libSrc = path.resolve(__dirname, '../../lib/src/index.ts');

/** Dual-track: set VITE_BASE=/next/ when exporting under web-ui/public/next */
const base = process.env.VITE_BASE || '/';

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // P1: user confirms refresh — avoid mid-import SW takeover
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '健康分析 · React 预览',
        short_name: '健康预览',
        description: '本地优先健康分析 React 预览壳（非生产默认入口）',
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
        // Shell assets only — large chart chunks load on demand (not first-install precache)
        globPatterns: [
          '**/*.{css,html,ico,png,svg,woff2,webmanifest,json}',
          '**/index-*.js',
          '**/rolldown-runtime-*.js',
          '**/workbox-window*.js',
          '**/parseWorkerClient-*.js',
          '**/analyze.worker-*.js',
        ],
        globIgnores: ['**/*.map', '**/echarts-*.js', '**/TrendChart-*.js'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
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
