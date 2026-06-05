/**
 * Подготовка папки host-desktop/bundle для Tauri NSIS (игра + сервер + Node).
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(root, 'host-desktop', 'bundle');

function run(nodeScript) {
  const r = spawnSync(process.execPath, [nodeScript], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runNpm(script) {
  const r = spawnSync('npm', ['run', script], { cwd: root, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log('[stage-host-installer] 1/4 build:host-game');
runNpm('build:host-game');

console.log('[stage-host-installer] 2/4 bundle-lan-server');
run(join(root, 'scripts', 'bundle-lan-server.mjs'));

console.log('[stage-host-installer] 3/4 download-node-win');
run(join(root, 'scripts', 'download-node-win.mjs'));

console.log('[stage-host-installer] 4/4 копируем dist-host и public');
const distHost = join(root, 'dist-host');
if (!existsSync(join(distHost, 'index.html'))) {
  console.error('Нет dist-host/index.html — прервите и выполните npm run build:host-game');
  process.exit(1);
}

mkdirSync(bundle, { recursive: true });
const distDest = join(bundle, 'dist-host');
const publicDest = join(bundle, 'public');
rmSync(distDest, { recursive: true, force: true });
rmSync(publicDest, { recursive: true, force: true });
cpSync(distHost, distDest, { recursive: true });
cpSync(join(root, 'server', 'public'), publicDest, { recursive: true });

if (!existsSync(join(bundle, 'server.cjs'))) {
  console.error('Нет bundle/server.cjs');
  process.exit(1);
}
if (!existsSync(join(bundle, 'node', 'node.exe'))) {
  console.error('Нет bundle/node/node.exe');
  process.exit(1);
}

console.log('[stage-host-installer] Готово:', bundle);
