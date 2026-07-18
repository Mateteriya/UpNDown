import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { safeLargeCssPlugin } from './vite-plugin-safe-large-css'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        'auth-callback': resolve(__dirname, 'auth-callback.html'),
        'cosmogenesis-demo': resolve(__dirname, 'cosmogenesis-demo.html'),
      },
    },
  },
  plugins: [
    react(),
    safeLargeCssPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      /* Не регистрировать SW в dev — телефон по LAN иначе может тянуть устаревший бандл из кэша вместо Vite */
      devOptions: {
        enabled: false,
      },
      /* Не валить весь build, если какой-то ассет > лимита Workbox */
      showMaximumFileSizeToCacheInBytesWarning: true,
      /* Мелкие иконки в precache; тяжёлые PNG кастов — только runtime */
      includeAssets: ['favicon.ico', 'icon-192.png', 'icon-256.png', 'icon-512.png'],
      manifest: {
        theme_color: '#0f172a',
        icons: [
          { src: '/favicon.ico', sizes: '48x48', type: 'image/x-icon', purpose: 'any' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icon-256.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: '/favicon.ico', sizes: '256x256', type: 'image/x-icon', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // PNG кастов не в precache (МЕНЮ/КАСТ.png ~2.5MB). Иконки — через includeAssets.
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
        globIgnores: ['**/cards/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\/cards\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images-cache',
              expiration: {
                maxEntries: 32,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 год
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /* /МЕНЮ/... в URL обычно percent-encoded */
            urlPattern: /\/(%D0%9C%D0%95%D0%9D%D0%AE|МЕНЮ)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'menu-cast-cache',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/(%D0%9B%D0%9A|ЛК)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'lk-cast-cache',
              expiration: {
                maxEntries: 16,
                maxAgeSeconds: 60 * 60 * 24 * 90,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true, // слушать на всех интерфейсах — доступ с других устройств по IP ноутбука
  },
  preview: {
    host: true, // npm run preview:host — готовый бандл для телефона по Wi‑Fi (быстрее dev)
  },
})
