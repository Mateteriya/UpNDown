/**
 * Сборка игры для QR с одного порта сервера: http://IP:3001/play/
 * npm run build:host-game → dist-host/
 *
 * PWA: карты/шелл кэшируются с хоста — гости не зависят от Vite :5173.
 * Мультиплеер по Wi‑Fi всё равно нужен живой ПК с host:app / party.
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { injectSupabaseUrlHtml } from './vite-plugin-inject-supabase-url';

export default defineConfig({
  define: {
    'import.meta.env.VITE_WS_PROTOCOL': JSON.stringify('v2'),
    'import.meta.env.VITE_ONLINE_TRANSPORT': JSON.stringify('ws'),
    /** Реальный ws:// в runtime = тот же host, что /play/ (см. getWsUrl). */
  },
  base: '/play/',
  build: {
    outDir: 'dist-host',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        /** Google/GitHub: возврат на локальный хост, не на up2down.online */
        'auth-callback': resolve(__dirname, 'auth-callback.html'),
      },
    },
  },
  plugins: [
    react(),
    injectSupabaseUrlHtml(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      showMaximumFileSizeToCacheInBytesWarning: true,
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-256.png', 'icon-512.png'],
      manifest: {
        name: 'Up&Down · LAN',
        short_name: 'Up&Down',
        theme_color: '#0f172a',
        start_url: '/play/',
        scope: '/play/',
        display: 'standalone',
        icons: [
          { src: '/play/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/play/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,css,html,ico,svg,woff2}',
          'cards/**/*.{png,jpg,jpeg,webp,svg}',
          'ИИ-боты/**/*.{jpg,jpeg,png,webp}',
          'МЕНЮ/**/*.{jpg,jpeg,png,webp}',
        ],
        globIgnores: ['**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: null,
      },
    }),
  ],
});
