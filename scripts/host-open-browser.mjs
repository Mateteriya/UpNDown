/**
 * Без Rust/Tauri: убить старые порты, поднять сервер, открыть панель в браузере.
 *
 *   npm run host:app          — если сервер уже жив: только открыть /host (партия не рвётся)
 *                             иначе kill портов + server:start + открыть /host
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

function openHostPanel() {
  const open = spawn('cmd', ['/c', 'start', '', `http://127.0.0.1:${port}/host`], {
    detached: true,
    stdio: 'ignore',
  });
  open.unref();
  console.log(`[host:app] Открыто http://127.0.0.1:${port}/host`);
}

async function lanServerUp() {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/version`, { cache: 'no-store' });
    if (!r.ok) return false;
    const j = await r.json();
    const build = typeof j.build === 'string' ? j.build : '';
    const lanPanel = j.panelSnippet === 'lan-ui' || j.hostPanel === true || j.profile === 'lan';
    return build.startsWith('host-panel-') && lanPanel;
  } catch {
    return false;
  }
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

if (await lanServerUp()) {
  console.log(
    '[host:app] Сервер уже работает — не перезапускаю (комната и игроки остаются).\n' +
      '    Если нужен чистый старт: npm run host:kill  затем снова npm run host:app',
  );
  openHostPanel();
  process.exit(0);
}

killHostPorts();

const server = spawn('npm', ['run', 'server:start'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, GAME_DIST: join(root, 'dist-host') },
});

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    if (await lanServerUp()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const ok = await waitReady();
if (ok) {
  openHostPanel();
} else {
  console.error('[host:app] Сервер не поднялся с новой панелью. Смотрите лог выше.');
}

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
