/**
 * Сборка игры для QR с одного порта сервера: http://IP:3001/play/
 * npm run build:host-game → dist-host/
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
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
  plugins: [react(), injectSupabaseUrlHtml()],
});
