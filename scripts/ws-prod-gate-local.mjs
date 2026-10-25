/**
 * Локальный затвор прод-профиля WS: build → start с WS_AUTH=required → /api/ready.
 * Секрет тестовый (не для VPS). Для проверки с боевыми секретами см. docs/WS-SECRETS-MEMO.md.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = process.env.GATE_PORT || '3011';
const cwd = process.cwd();

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

async function fetchReady() {
  const url = `http://127.0.0.1:${PORT}/api/ready`;
  const res = await fetch(url);
  const body = await res.json();
  return { status: res.status, body };
}

await run('npm', ['run', 'server:build']);

const fullSupabase = process.env.GATE_FULL_SUPABASE === '1';
const env = {
  ...process.env,
  NODE_ENV: 'production',
  UPDOWN_MODE: 'prod',
  HOST: '127.0.0.1',
  PORT,
  WS_AUTH: 'required',
  WS_BACKUP_PORTS: 'none',
  ROOM_PERSIST: '1',
  ROOM_PERSIST_PATH: `${cwd}/server/data/gate-rooms.json`,
  SUPABASE_JWT_SECRET:
    process.env.GATE_JWT_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'local-gate-test-secret-not-for-prod',
  PUBLIC_WS_URL: process.env.PUBLIC_WS_URL || `ws://127.0.0.1:${PORT}`,
  // Не наследовать SERVICE_ROLE из shell — иначе ready ходит в облако и падает офлайн.
  SUPABASE_SERVICE_ROLE_KEY: fullSupabase ? process.env.SUPABASE_SERVICE_ROLE_KEY || '' : '',
  SUPABASE_URL: fullSupabase ? process.env.SUPABASE_URL || '' : '',
};

const child = spawn('node', ['server/dist/index.js'], {
  cwd,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: false,
});

let bootLog = '';
child.stdout.on('data', (d) => {
  bootLog += d.toString();
  process.stdout.write(d);
});
child.stderr.on('data', (d) => {
  bootLog += d.toString();
  process.stderr.write(d);
});

let ok = false;
try {
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      const { status, body } = await fetchReady();
      console.log('\n[gate] /api/ready', status, JSON.stringify(body));
      if (
        status === 200 &&
        body?.ready === true &&
        body?.auth === 'required' &&
        body?.jwtConfigured === true
      ) {
        ok = true;
        break;
      }
      if (status === 503 || body?.ready === false) {
        throw new Error(`ready not green: ${JSON.stringify(body)}`);
      }
    } catch (e) {
      if (i === 39) throw e;
    }
  }
} finally {
  child.kill('SIGTERM');
  await sleep(400);
  try {
    child.kill('SIGKILL');
  } catch {
    /* ignore */
  }
}

if (!ok) {
  console.error('[gate] FAIL\n', bootLog.slice(-2000));
  process.exit(1);
}
console.log('[gate] OK — local prod profile accepts WS_AUTH=required + JWT secret');
process.exit(0);
