/**
 * Перед `tauri dev`: освободить порты; если нет bundle — поднять server:dev.
 * Если есть host-desktop/bundle (после prep), сервер запускает само окно Tauri.
 */
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 3001);
const bundleServer = join(root, 'host-desktop', 'bundle', 'server.cjs');
const url = `http://127.0.0.1:${port}/api/version`;

spawnSync(
  'powershell',
  ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'kill-host-ports.ps1')],
  { stdio: 'inherit' },
);

function waitReady(tries = 40) {
  return fetch(url, { cache: 'no-store' })
    .then((r) => r.json())
    .then((j) => j.hostPanel === true)
    .catch(() => false)
    .then((ok) => {
      if (ok) return true;
      if (tries <= 0) return false;
      return new Promise((r) => setTimeout(r, 500)).then(() => waitReady(tries - 1));
    });
}

if (existsSync(bundleServer)) {
  console.log('[host-desktop] bundle найден — сервер стартует из окна Tauri');
  process.exit(0);
}

console.log('[host-desktop] bundle нет — npm run server:dev (для разработки без prep)');

const child = spawn('npm', ['run', 'server:dev'], {
  cwd: root,
  detached: true,
  stdio: 'ignore',
  shell: true,
  env: { ...process.env, GAME_DIST: join(root, 'dist-host') },
});
child.unref();

const ok = await waitReady();
if (!ok) {
  console.error('[host-desktop] Сервер не ответил на', url);
  process.exit(1);
}
console.log('[host-desktop] Сервер готов:', url.replace('/api/version', '/host'));
