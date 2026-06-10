/**
 * Сборка игры для QR с одного порта сервера: http://IP:3001/play/
 * npm run build:host-game → dist-host/
 */
import { defineConfig } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  define: {
    'import.meta.env.VITE_WS_PROTOCOL': JSON.stringify('v2'),
    'import.meta.env.VITE_ONLINE_TRANSPORT': JSON.stringify('ws'),
  },
  base: '/play/',
  build: {
    outDir: 'dist-host',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
    },
  },
  plugins: [react()],
});
