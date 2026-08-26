import { defineConfig } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { labSfxWritePlugin } from './vite-plugin-lab-sfx-write'
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
    labSfxWritePlugin(), // POST /__updown_lab_sfx writes public/audio/sfx
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
        // Бандл + все офлайн-картинки: карты, аватары ИИ, касты/легенды меню.
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
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/host/, /auth-callback\.html/, /cosmogenesis-demo\.html/],
        runtimeCaching: [
          {
            urlPattern: /\/(?:favicon\.ico|icon-\d+\.png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'shell-icons-cache',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/cards\/.+/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images-cache',
              expiration: {
                maxEntries: 64,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/(%D0%98%D0%98-%D0%B1%D0%BE%D1%82%D1%8B|ИИ-боты)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'ai-bot-avatars-cache',
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/(%D0%9C%D0%95%D0%9D%D0%AE|МЕНЮ)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'menu-cast-cache',
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 24,
                maxAgeSeconds: 60 * 60 * 24 * 365,
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
