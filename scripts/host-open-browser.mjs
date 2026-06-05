/**
 * Без Rust/Tauri: убить старые порты, поднять сервер, открыть панель в браузере.
 * npm run host:app
 */
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distHost = join(root, 'dist-host', 'index.html');
const port = Number(process.env.PORT ?? 3001);

if (!existsSync(distHost)) {
  console.warn('[host:app] Нет dist-host — QR не заработает. Выполните: npm run build:host-game');
} else {
  console.log('[host:app] Игра для QR: dist-host OK');
}

spawnSync('powershell', [
  '-ExecutionPolicy',
  'Bypass',
  '-File',
  join(root, 'scripts', 'kill-host-ports.ps1'),
], { stdio: 'inherit', cwd: root });

const server = spawn('npm', ['run', 'server:dev'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, GAME_DIST: join(root, 'dist-host') },
});

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/version`, { cache: 'no-store' });
      const j = await r.json();
      if (j.build?.includes('host-panel-2026-06-06') && j.panelSnippet === 'lan-ui') {
        return true;
      }
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const ok = await waitReady();
if (ok) {
  const open = spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${port}/host`], {
    detached: true,
    stdio: 'ignore',
  });
  open.unref();
  console.log(`[host:app] Открыто http://127.0.0.1:${port}/host`);
} else {
  console.error('[host:app] Сервер не поднялся с новой панелью. Смотрите лог выше.');
}

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
