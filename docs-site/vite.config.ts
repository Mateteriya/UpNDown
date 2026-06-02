import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

const root = resolve(__dirname);
const brandDir = resolve(root, 'public', 'brand');
const brandSources = [
  { from: resolve(root, '../public/icon-192.png'), to: resolve(brandDir, 'icon-192.png') },
  { from: resolve(root, '../public/icon-512.png'), to: resolve(brandDir, 'icon-512.png') },
];

function syncBrandAssets() {
  mkdirSync(brandDir, { recursive: true });
  for (const { from, to } of brandSources) {
    if (existsSync(from)) cpSync(from, to, { force: true });
  }
}

syncBrandAssets();

function syncRepoDocs() {
  const script = resolve(root, 'scripts/sync-repo-docs.mjs');
  const r = spawnSync(process.execPath, [script], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) {
    console.warn('[portal] sync-repo-docs failed');
  }
}

syncRepoDocs();

export default defineConfig({
  base: '/UpNDown/',
  plugins: [
    react(),
    {
      name: 'sync-brand-assets',
      configureServer() {
        syncBrandAssets();
        syncRepoDocs();
      },
      buildStart() {
        syncBrandAssets();
        syncRepoDocs();
      },
    },
  ],
  root,
  publicDir: resolve(root, 'public'),
  server: {
    port: 5199,
    host: true,
    open: '/',
  },
  preview: {
    port: 5199,
    host: true,
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
  },
});
