/**
 * Одна команда для домашней вечеринки (без Vite :5173):
 *   npm run party
 *
 * 1) При необходимости собирает dist-host (карты, JS, CSS)
 * 2) Поднимает хост :3001 и открывает панель
 *
 * Играть: http://IP:3001/play/  (QR с панели) — НЕ :5173
 */
import { existsSync, statSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distIndex = join(root, 'dist-host', 'index.html');
const cardsDir = join(root, 'dist-host', 'cards');
const force = process.argv.includes('--rebuild') || process.argv.includes('-f');

function distLooksOk() {
  if (!existsSync(distIndex)) return false;
  if (!existsSync(cardsDir)) return false;
  try {
    const n = statSync(cardsDir).isDirectory();
    return n;
  } catch {
    return false;
  }
}

console.log('');
console.log('══════════════════════════════════════════════════');
console.log('  Up&Down · вечеринка (хост :3001, без Vite)');
console.log('══════════════════════════════════════════════════');
console.log('  Играть с телефонов: QR → http://ВАШ_IP:3001/play/');
console.log('  НЕ открывайте :5173 — это только npm run dev.');
console.log('  На время партии закройте Cursor/IDE — меньше зависаний.');
console.log('══════════════════════════════════════════════════');
console.log('');

if (force || !distLooksOk()) {
  if (force) console.log('[party] --rebuild: пересобираю dist-host…');
  else console.log('[party] Нет полной сборки dist-host — собираю (карты + JS)…');
  const r = spawnSync('npm', ['run', 'build:host-game'], {
    cwd: root,
    shell: true,
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('[party] Сборка не удалась. Исправьте ошибки и снова: npm run party');
    process.exit(r.status ?? 1);
  }
  if (!distLooksOk()) {
    console.error('[party] После сборки нет dist-host/cards — проверьте vite.host.config.ts');
    process.exit(1);
  }
  console.log('[party] dist-host готов.');
} else {
  console.log('[party] dist-host уже есть (карты на месте). Пересборка: npm run party -- --rebuild');
}

const child = spawn('npm', ['run', 'host:app'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: { ...process.env, GAME_DIST: join(root, 'dist-host') },
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGINT', () => {
  child.kill('SIGINT');
});
