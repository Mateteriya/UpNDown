/**
 * Собирает сервер комнат в один server.mjs для установщика (без tsx в рантайме).
 */
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'host-desktop', 'bundle');
const outfile = join(outDir, 'server.cjs');

mkdirSync(outDir, { recursive: true });

const stubTunnel = join(root, 'server', 'src', 'stubs', 'tunnelManager.stub.ts');
const stubUpnp = join(root, 'server', 'src', 'stubs', 'upnpHelper.stub.ts');

await esbuild.build({
  entryPoints: [join(root, 'server', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  sourcemap: false,
  logLevel: 'info',
  banner: {
    js: '/* Up&Down LAN server bundle */',
  },
  plugins: [
    {
      name: 'lan-installer-stubs',
      setup(build) {
        build.onResolve({ filter: /tunnelManager\.js$/ }, (args) => {
          if (args.importer.includes('server/src') || args.importer.includes('server\\src')) {
            return { path: stubTunnel };
          }
        });
        build.onResolve({ filter: /upnpHelper\.js$/ }, (args) => {
          if (args.importer.includes('server/src') || args.importer.includes('server\\src')) {
            return { path: stubUpnp };
          }
        });
      },
    },
  ],
});

console.log('[bundle-lan-server] OK →', outfile);
