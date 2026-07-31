/**
 * Без Rust/Tauri: убить старые порты, поднять сервер, открыть панель в браузере.
 *
 *   npm run host:app          — kill портов + server:dev + открыть /host
 *   npm run host:app -- kill  — только освободить 3001–3003
 *   npm run host:kill         — то же, что kill
 */
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distHost = join(root, 'dist-host', 'index.html');
const port = Number(process.env.PORT ?? 3001);
const arg = (process.argv[2] ?? '').trim().toLowerCase();

function killHostPorts() {
  spawnSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'kill-host-ports.ps1')],
    { stdio: 'inherit', cwd: root },
  );
}

if (arg === 'kill' || arg === '--kill' || arg === '-k') {
  killHostPorts();
  console.log('[host:app] Только kill — сервер не поднимаю. Старт: npm run host:app');
  process.exit(0);
}

if (!existsSync(distHost)) {
  console.warn('[host:app] Нет dist-host — QR не заработает. Выполните: npm run build:host-game');
} else {
  console.log('[host:app] Игра для QR: dist-host OK');
}

killHostPorts();

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
      // Любая актуальная сборка host-panel-* + новая панель (не старый туннель-UI)
      if (typeof j.build === 'string' && j.build.startsWith('host-panel-') && j.panelSnippet === 'lan-ui') {
        return true;
      }
    } catch {
      /* retry */
    }
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
