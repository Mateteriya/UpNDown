/**
 * Лендинг приглашения: /join?code=XXXX
 * — открыть игру в браузере (/play/)
 * — deep link в установленное приложение (updown://)
 * — опционально APK с хоста (dist-host/apk/updown.apk)
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildGuestJoinLink } from './joinLink.js';
import {
  buildAppJoinDeepLinkHtml,
  buildApkMissingHtml,
  buildApkReadyHtml,
} from './joinLandingHtml.js';
import { resolveGameDistDir } from './gameStatic.js';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Спец. хост всегда обещает путь раздачи APK; если файла нет — /apk отдаст инструкцию. */
function partyApkHref(): string {
  return '/apk/updown.apk';
}

function apkDir(): string {
  return join(resolveGameDistDir(), 'apk');
}

function isLocalApkReady(): boolean {
  try {
    return existsSync(join(apkDir(), 'updown.apk'));
  } catch {
    return false;
  }
}

export function tryServeJoinLanding(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  httpPort: number,
  gameAppPort: number,
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (path !== '/join' && path !== '/invite') return false;

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const code = (url.searchParams.get('code') ?? url.searchParams.get('room') ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  const playLink = code ? buildGuestJoinLink(code, httpPort, gameAppPort) : null;
  const appLink = code ? `updown://join?code=${encodeURIComponent(code)}&autojoin=1` : 'updown://join';
  const html = buildAppJoinDeepLinkHtml({
    code: code || null,
    playHref: playLink || '/play/',
    appHref: appLink,
    apkHref: partyApkHref(),
    apkReady: isLocalApkReady(),
    escapeHtml,
  });

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  res.end(html);
  return true;
}

function formatMb(bytes: number): string {
  return `~${(bytes / (1024 * 1024)).toFixed(bytes >= 50 * 1024 * 1024 ? 0 : 1)} МБ`;
}

function sendBinaryFile(
  req: IncomingMessage,
  res: ServerResponse,
  file: string,
  size: number,
  contentType: string,
  filename: string,
): void {
  req.setTimeout(0);
  res.setTimeout(0);

  const rangeRaw = req.headers.range;
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (rangeRaw) {
    const m = /^bytes=(\d*)-(\d*)$/i.exec(rangeRaw.trim());
    if (m) {
      if (m[1] !== '') start = Number(m[1]);
      if (m[2] !== '') end = Number(m[2]);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end >= size || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${size}`,
          'Accept-Ranges': 'bytes',
        });
        res.end();
        return;
      }
      status = 206;
    }
  }

  const chunkSize = end - start + 1;
  const headers: Record<string, string | number> = {
    'Content-Type': contentType,
    'Content-Length': chunkSize,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    /* fetch() со страницы /apk */
    'Access-Control-Allow-Origin': '*',
  };
  if (status === 206) {
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }

  res.writeHead(status, headers);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const stream = createReadStream(file, { start, end, highWaterMark: 1024 * 256 });
  const onClose = () => {
    stream.destroy();
  };
  req.on('close', onClose);
  stream.on('error', () => {
    req.off('close', onClose);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end();
    } else {
      res.destroy();
    }
  });
  stream.on('end', () => req.off('close', onClose));
  stream.pipe(res);
}

/**
 * /apk — страница со скачиванием через blob;
 * /apk/updown.apk | /apk/updown.zip — файлы.
 */
export function tryServePartyApk(req: IncomingMessage, res: ServerResponse, path: string): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  if (
    path !== '/apk' &&
    path !== '/apk/' &&
    path !== '/apk/updown.apk' &&
    path !== '/apk/updown.zip'
  ) {
    return false;
  }

  const dir = apkDir();
  const apkFile = join(dir, 'updown.apk');
  const zipFile = join(dir, 'updown.zip');

  if (!existsSync(apkFile)) {
    const html = buildApkMissingHtml(escapeHtml);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    if (req.method !== 'HEAD') res.end(html);
    else res.end();
    return true;
  }

  try {
    if (path === '/apk' || path === '/apk/') {
      const st = statSync(apkFile);
      const zipReady = existsSync(zipFile);
      const html = buildApkReadyHtml({
        apkHref: '/apk/updown.apk',
        zipHref: '/apk/updown.zip',
        zipReady,
        sizeLabel: formatMb(st.size),
        escapeHtml,
      });
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      if (req.method !== 'HEAD') res.end(html);
      else res.end();
      return true;
    }

    if (path === '/apk/updown.zip') {
      if (!existsSync(zipFile)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('ZIP ещё не собран. Используйте кнопку «Скачать и сохранить».');
        return true;
      }
      const st = statSync(zipFile);
      sendBinaryFile(req, res, zipFile, st.size, 'application/zip', 'updown.zip');
      return true;
    }

    const st = statSync(apkFile);
    /* octet-stream: меньше шансов, что Chrome «съест» загрузку после диалога Safe Browsing */
    sendBinaryFile(req, res, apkFile, st.size, 'application/octet-stream', 'updown.apk');
  } catch {
    res.writeHead(500);
    res.end();
  }
  return true;
}
