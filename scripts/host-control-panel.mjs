/**
 * Панель хозяина Wi‑Fi (кнопки вместо консоли).
 *
 *   npm run host:control
 *   или: Открыть-панель-хоста.cmd
 *
 * http://127.0.0.1:3927 — локально.
 * Один процесс панели + один игровой сервер :3001 (до 22 комнат).
 * Повторный запуск cmd / вторая вкладка — та же панель, без второго сервера.
 * Сборка dist-host — только если файлов нет или по кнопке «Пересобрать».
 * «Старт» поднимает сервер, если он ещё не отвечает на :3001.
 */
import { createServer, request as httpRequest } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UI_HTML = join(dirname(fileURLToPath(import.meta.url)), 'host-control-ui.html');
const PANEL_PORT = Number(process.env.HOST_CONTROL_PORT ?? 3927);
const GAME_PORT = Number(process.env.PORT ?? 3001);
/** Версия API панели — при совпадении повторный host:control только открывает браузер. */
const PANEL_REV = 18;
/** Клубный лимит столов (совпадает с LAN WS_MAX_ROOMS). */
const CLUB_MAX_ROOMS = Number(process.env.HOST_CLUB_MAX_ROOMS ?? process.env.WS_MAX_ROOMS ?? 22);
/** Автостарт игрового сервера после открытия панели (клуб / стойка). */
const CLUB_AUTO_START =
  process.env.HOST_CLUB_AUTO_START === '1' ||
  process.env.HOST_CLUB_AUTO_START === 'true' ||
  process.env.HOST_CONTROL_AUTO_START === '1';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** @type {import('node:child_process').ChildProcess | null} */
let buildProc = null;
/** @type {import('node:child_process').ChildProcess | null} */
let gameProc = null;
/** Защита от двойного Старт из двух вкладок. */
let startingGame = false;
let lastLog = '';
let lastAction = '';
let lastCode = null;

function appendLog(chunk) {
  lastLog += chunk;
  if (lastLog.length > 80_000) lastLog = lastLog.slice(-60_000);
}

function scoreLanIp(ip) {
  if (/^192\.168\.(56|57|59)\./.test(ip)) return 5;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 4; /* WSL / Hyper-V / Docker */
  if (ip.startsWith('192.168.')) return 100;
  if (ip.startsWith('10.')) return 85;
  return 20;
}

function lanIpv4() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    if (!list) continue;
    for (const a of list) {
      if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
  }
  return [...new Set(out)].sort((a, b) => scoreLanIp(b) - scoreLanIp(a));
}

async function gameServerStatus() {
  try {
    const r = await fetch(`http://127.0.0.1:${GAME_PORT}/api/version`, { cache: 'no-store' });
    if (!r.ok) return { up: false, detail: `HTTP ${r.status}` };
    const j = await r.json();
    return { up: true, detail: j };
  } catch (e) {
    return { up: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

function killHostPorts() {
  spawnSync(
    'powershell',
    ['-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'kill-host-ports.ps1')],
    { stdio: 'ignore', cwd: root },
  );
}

/**
 * Windows: npm.cmd без shell даёт spawn EINVAL → 500 на «Получить APK».
 * shell:true + windowsHide — без лишних окон консоли.
 */
function spawnNpm(args, opts = {}) {
  return spawn(npmCmd, args, {
    cwd: root,
    env: process.env,
    windowsHide: true,
    shell: process.platform === 'win32',
    ...opts,
  });
}

function runNpm(script, envExtra = {}) {
  if (buildProc) {
    return Promise.reject(new Error('Уже выполняется другая команда. Дождитесь конца.'));
  }
  lastAction = script;
  lastLog = `$ npm run ${script}\n`;
  lastCode = null;
  return new Promise((resolve) => {
    buildProc = spawnNpm(['run', script], {
      env: { ...process.env, ...envExtra },
    });
    const onChunk = (buf) => appendLog(buf.toString());
    buildProc.stdout?.on('data', onChunk);
    buildProc.stderr?.on('data', onChunk);
    buildProc.on('error', (err) => {
      buildProc = null;
      lastCode = 1;
      appendLog(`\n[ошибка запуска] ${err.message}\n`);
      resolve(1);
    });
    buildProc.on('close', (code) => {
      lastCode = code;
      buildProc = null;
      appendLog(`\n[готово] код выхода: ${code ?? '?'}\n`);
      resolve(code ?? 1);
    });
  });
}

async function waitGameReady(ms = 25_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const st = await gameServerStatus();
    if (st.up) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const ACTIONS = {
  async status() {
    const st = await gameServerStatus();
    const ips = lanIpv4();
    const distOk = existsSync(join(root, 'dist-host', 'index.html'));
    const apkOk = existsSync(join(root, 'dist-host', 'apk', 'updown.apk'));
    return {
      ok: true,
      /** UI: если поля нет / меньше PANEL_REV — устаревшая панель */
      panelRev: PANEL_REV,
      serverUp: st.up,
      server: st.detail,
      lanIps: ips,
      distHost: distOk,
      apkReady: apkOk,
      guestUrls: ips.map((ip) => `http://${ip}:${GAME_PORT}/play/`),
      inviteBaseUrls: ips.map((ip) => `http://${ip}:${GAME_PORT}/join`),
      apkUrls: ips.map((ip) => `http://${ip}:${GAME_PORT}/apk/updown.apk`),
      /** Google OAuth → обратно в LAN (Supabase Redirect URLs), без сайта / VPN */
      oauthRedirectUrls: ips.map((ip) => `http://${ip}:${GAME_PORT}/play/auth-callback.html`),
      oauthSiteUrlParty: ips[0] ? `http://${ips[0]}:${GAME_PORT}/play/` : '',
      oauthWildcardHint: `http://192.168.*.*:${GAME_PORT}/**`,
      maxRooms: CLUB_MAX_ROOMS,
      clubAutoStart: CLUB_AUTO_START,
      busy: !!buildProc || startingGame,
      lastAction,
      lastCode,
    };
  },
  async 'build-game'() {
    const code = await runNpm('build:host-game');
    return { ok: code === 0, code };
  },
  async 'start-party'() {
    if (buildProc) return { ok: false, error: 'Дождитесь конца сборки' };
    if (startingGame) return { ok: false, error: 'Сервер уже запускается — подождите' };
    const already = await gameServerStatus();
    if (already.up) {
      appendLog('\n[сервер уже работает на :' + GAME_PORT + ' — не трогаю]\n');
      return { ok: true, already: true };
    }
    startingGame = true;
    lastAction = 'server:start';
    lastLog = '$ server:start (один процесс на :' + GAME_PORT + ')\n';
    lastCode = null;
    try {
      /* Только зомби на порту — живой сервер сюда не доходит. */
      killHostPorts();
      gameProc = spawnNpm(['run', 'server:start'], {
        env: { ...process.env, GAME_DIST: join(root, 'dist-host') },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const onChunk = (buf) => appendLog(buf.toString());
      gameProc.stdout?.on('data', onChunk);
      gameProc.stderr?.on('data', onChunk);
      gameProc.on('error', (err) => appendLog(`\n[spawn] ${err.message}\n`));
      gameProc.unref();
      const ok = await waitGameReady();
      if (!ok) {
        appendLog('\n[сервер не ответил вовремя]\n');
        return { ok: false, error: 'Сервер не поднялся — смотрите лог' };
      }
      appendLog('\n[сервер готов — один экземпляр]\n');
      return { ok: true };
    } finally {
      startingGame = false;
    }
  },
  async 'stop-server'() {
    const code = await runNpm('host:kill');
    gameProc = null;
    return { ok: code === 0, code };
  },
  async logs() {
    return { ok: true, log: lastLog, busy: !!buildProc, lastAction, lastCode };
  },
  /** Создать папку dist-host/apk и открыть в проводнике — чтобы положить updown.apk */
  async 'prepare-apk-folder'() {
    const dir = join(root, 'dist-host', 'apk');
    mkdirSync(dir, { recursive: true });
    const opened = openFolder(dir);
    appendLog(`\n[apk] папка: ${dir}\n`);
    appendLog(
      opened
        ? '[apk] Откройте проводник → положите сюда файл updown.apk\n'
        : '[apk] Откройте вручную: dist-host/apk/updown.apk\n',
    );
    return {
      ok: true,
      path: dir,
      opened,
      hint:
        'Соберите Android APK (Capacitor) и скопируйте как dist-host/apk/updown.apk — после этого гости качают с /join.',
    };
  },
  /** npm run party:apk — найти/собрать APK и положить в раздачу */
  async 'build-party-apk'() {
    if (buildProc) return { ok: false, error: 'Дождитесь конца другой команды', apkReady: false };
    try {
      lastAction = 'party:apk';
      lastLog = '$ npm run party:apk\n';
      lastCode = null;
      const codeCopy = await runNpm('party:apk');
      if (codeCopy === 0) {
        const apkOk = existsSync(join(root, 'dist-host', 'apk', 'updown.apk'));
        return {
          ok: true,
          apkReady: apkOk,
          hint: apkOk
            ? 'APK в раздаче. Android-гости: QR → «Скачать APK». iPhone — только браузер на /join (APK нельзя).'
            : 'Скрипт завершился, но файл не найден.',
        };
      }
      appendLog('\n[apk] пробуем party:apk --build (нужен Android SDK)…\n');
      const codeBuild = await runNpm('party:apk:build');
      const apkOk = existsSync(join(root, 'dist-host', 'apk', 'updown.apk'));
      if (apkOk) {
        return {
          ok: true,
          apkReady: true,
          hint: 'APK собран. Android качает с /join; iPhone играет в Safari без установки.',
        };
      }
      return {
        ok: false,
        apkReady: false,
        code: codeBuild,
        hint:
          'Автосборки нет (нужен готовый APK или Android Studio). Сейчас откроем папку: положите туда updown.apk — гости Android скачают с QR. iPhone: кнопка «в браузере» на /join, APK не нужен.',
      };
    } catch (e) {
      appendLog(`\n[apk] ${e instanceof Error ? e.message : e}\n`);
      return {
        ok: false,
        apkReady: false,
        error: e instanceof Error ? e.message : String(e),
        hint:
          'Не удалось запустить сборку. Откроем папку apk — положите туда updown.apk вручную. Для iPhone APK не нужен: игра в Safari по QR.',
      };
    }
  },
};

function openFolder(dir) {
  const tries = [
    () => spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore', windowsHide: true }),
    () => spawn('cmd', ['/c', 'start', '', dir], { detached: true, stdio: 'ignore', windowsHide: true }),
  ];
  for (const go of tries) {
    try {
      const child = go();
      child.on('error', () => {});
      child.unref();
      return true;
    } catch (_) {
      /* next */
    }
  }
  return false;
}

function proxyHttp(req, res, targetPath) {
  const headers = { ...req.headers, host: `127.0.0.1:${GAME_PORT}` };
  delete headers['accept-encoding'];
  const preq = httpRequest(
    {
      hostname: '127.0.0.1',
      port: GAME_PORT,
      path: targetPath,
      method: req.method,
      headers,
    },
    (pres) => {
      res.writeHead(pres.statusCode || 502, pres.headers);
      pres.pipe(res);
    },
  );
  preq.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Игровой сервер недоступен — нажмите Старт' }));
    } else {
      res.end();
    }
  });
  req.pipe(preq);
}

function openBrowser(url) {
  const tries = [
    () => spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }),
    () => spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }),
    () =>
      spawn('powershell', ['-NoProfile', '-Command', `Start-Process '${url}'`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }),
  ];
  for (const go of tries) {
    try {
      const child = go();
      child.on('error', () => {});
      child.unref();
      return;
    } catch (_) {
      /* next */
    }
  }
}

function setPanelCors(res) {
  /* Меню на Vite (:5173 с LAN-IP) дергает 127.0.0.1:3927 — без CORS probe «Свой хост» ломается. */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${PANEL_PORT}`);
  setPanelCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    try {
      let html = readFileSync(UI_HTML, 'utf8');
      const stamp = `rev ${PANEL_REV} · ${new Date().toISOString().slice(0, 19)}`;
      /* Явный бейдж + no-store — иначе Chrome держит старый HTML даже с ?v= */
      if (!html.includes('id="panelRevBadge"')) {
        html = html.replace(
          '<div class="pills" id="statusLine">',
          `<div class="panel-rev-badge" id="panelRevBadge" title="Версия UI панели">${stamp}</div>\n      <div class="pills" id="statusLine">`,
        );
      } else {
        html = html.replace(
          /(<div class="panel-rev-badge"[^>]*>)([\s\S]*?)(<\/div>)/,
          `$1${stamp}$3`,
        );
      }
      if (!html.includes('panel-rev-badge{')) {
        html = html.replace(
          '</style>',
          `.panel-rev-badge{margin-left:auto;margin-right:8px;padding:6px 10px;border-radius:999px;font:800 0.68rem/1 var(--font-d);letter-spacing:0.06em;text-transform:uppercase;color:#041018;background:linear-gradient(135deg,#fde68a,#fbbf24 55%,#f472b6);box-shadow:0 0 16px rgba(251,191,36,0.45);white-space:nowrap}\n  </style>`,
        );
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Panel-Rev': String(PANEL_REV),
      });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(e instanceof Error ? e.message : String(e));
    }
    return;
  }

  /* Прокси к игровому серверу: /lan/api/... → /api/... */
  if (url.pathname === '/lan' || url.pathname.startsWith('/lan/')) {
    const targetPath = url.pathname.replace(/^\/lan/, '') || '/';
    proxyHttp(req, res, targetPath + url.search);
    return;
  }

  const m = url.pathname.match(/^\/api\/([a-z0-9-]+)$/);
  if (!m) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const fn = ACTIONS[m[1]];
  if (!fn) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'unknown action' }));
    return;
  }
  try {
    const data = await fn();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
  }
});

server.on('upgrade', (req, socket, head) => {
  const headers = { ...req.headers, host: `127.0.0.1:${GAME_PORT}` };
  const preq = httpRequest({
    hostname: '127.0.0.1',
    port: GAME_PORT,
    path: req.url || '/',
    method: 'GET',
    headers,
  });
  const quiet = (s) => {
    s.on('error', () => {
      try {
        s.destroy();
      } catch (_) {
        /* */
      }
    });
  };
  quiet(socket);
  preq.on('upgrade', (pres, proxySocket, proxyHead) => {
    quiet(proxySocket);
    const lines = ['HTTP/1.1 101 Switching Protocols'];
    for (const [k, v] of Object.entries(pres.headers)) {
      if (v === undefined) continue;
      lines.push(`${k}: ${Array.isArray(v) ? v.join(', ') : v}`);
    }
    lines.push('', '');
    try {
      socket.write(lines.join('\r\n'));
    } catch (_) {
      proxySocket.destroy();
      return;
    }
    if (proxyHead?.length) proxySocket.unshift(proxyHead);
    if (head?.length) socket.unshift(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  preq.on('error', () => {
    try {
      socket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    } catch (_) {
      /* */
    }
    socket.destroy();
  });
  preq.end();
});

function killPanelPort() {
  if (process.platform !== 'win32') return false;
  try {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `$p = Get-NetTCPConnection -LocalPort ${PANEL_PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; if ($p) { $p | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }; 'killed' } else { 'free' }`,
      ],
      { encoding: 'utf8', windowsHide: true },
    );
    const out = (r.stdout || '').trim();
    console.log(`[host:control] порт ${PANEL_PORT}: ${out || r.status}`);
    return /killed/i.test(out);
  } catch (e) {
    console.log('[host:control] не удалось освободить порт:', e instanceof Error ? e.message : e);
    return false;
  }
}

function onPanelListening() {
  const openUrl = `http://127.0.0.1:${PANEL_PORT}/`;
  console.log('');
  console.log('  ┌─────────────────────────────────────────┐');
  console.log(`  │  Панель хоста: ${openUrl.padEnd(22)}│`);
  console.log('  │  Одно окно cmd — не закрывайте.         │');
  console.log('  │  Повторный запуск только откроет браузер│');
  console.log('  └─────────────────────────────────────────┘');
  console.log('');
  openBrowser(openUrl);
}

/**
 * @returns {Promise<{ ok?: boolean, panelRev?: number } | null>}
 */
async function probeExistingPanel() {
  try {
    const r = await fetch(`http://127.0.0.1:${PANEL_PORT}/api/status`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(900),
    });
    if (!r.ok) return null;
    return /** @type {{ ok?: boolean, panelRev?: number }} */ (await r.json());
  } catch {
    return null;
  }
}

let panelListenRetries = 0;
server.on('error', (err) => {
  if (err && /** @type {NodeJS.ErrnoException} */ (err).code === 'EADDRINUSE' && panelListenRetries < 2) {
    panelListenRetries += 1;
    console.log(`[host:control] Порт ${PANEL_PORT} занят — проверяю, не та ли это панель…`);
    void (async () => {
      const existing = await probeExistingPanel();
      if (existing?.ok && Number(existing.panelRev) >= PANEL_REV) {
        const openUrl = `http://127.0.0.1:${PANEL_PORT}/`;
        console.log(`[host:control] Панель уже работает (rev ${existing.panelRev}). Открываю браузер, второй процесс не нужен.`);
        openBrowser(openUrl);
        process.exit(0);
        return;
      }
      console.log(`[host:control] Устаревшая панель — останавливаю и поднимаю rev ${PANEL_REV}…`);
      killPanelPort();
      setTimeout(() => {
        server.listen(PANEL_PORT, '127.0.0.1', onPanelListening);
      }, 700);
    })();
    return;
  }
  console.error('[host:control] Ошибка сервера:', err);
  process.exit(1);
});

const existingPanel = await probeExistingPanel();
if (existingPanel?.ok && Number(existingPanel.panelRev) >= PANEL_REV) {
  const openUrl = `http://127.0.0.1:${PANEL_PORT}/`;
  console.log('');
  console.log(`[host:control] Панель уже запущена (rev ${existingPanel.panelRev}).`);
  console.log(`  Открываю ту же: ${openUrl}`);
  console.log('  Игровой сервер не перезапускаю.');
  console.log('');
  openBrowser(openUrl);
  process.exit(0);
}

if (existingPanel) {
  console.log(
    `[host:control] На :${PANEL_PORT} старая панель (rev ${existingPanel.panelRev ?? '?'}) — обновляю до rev ${PANEL_REV}…`,
  );
  killPanelPort();
  await new Promise((r) => setTimeout(r, 500));
}

server.listen(PANEL_PORT, '127.0.0.1', onPanelListening);
