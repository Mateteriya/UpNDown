import { createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Корень репо: не зависеть от cwd (`npm run server:dev` стартует из server/). */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_GAME_DIST = join(REPO_ROOT, 'dist-host');
const FALLBACK_GAME_DIST = join(REPO_ROOT, 'dist');
const CWD_GAME_DIST = join(process.cwd(), 'dist-host');
const CWD_FALLBACK_DIST = join(process.cwd(), 'dist');

export function resolveGameDistDir(): string {
  const fromEnv = (process.env.GAME_DIST ?? '').trim();
  if (fromEnv) return fromEnv;
  if (existsSync(join(DEFAULT_GAME_DIST, 'index.html'))) return DEFAULT_GAME_DIST;
  if (existsSync(join(CWD_GAME_DIST, 'index.html'))) return CWD_GAME_DIST;
  if (existsSync(join(FALLBACK_GAME_DIST, 'index.html'))) return FALLBACK_GAME_DIST;
  return CWD_FALLBACK_DIST;
}

function gameDistDir(): string {
  return resolveGameDistDir();
}

export function isGameDistAvailable(): boolean {
  return existsSync(join(gameDistDir(), 'index.html'));
}

/** URL страницы игры для QR (один порт с панелью, если собран dist). */
export function lanGameAppUrl(primaryIp: string, httpPort: number, fallbackGamePort: number): string {
  if (isGameDistAvailable()) {
    return `http://${primaryIp}:${httpPort}/play/`;
  }
  return `http://${primaryIp}:${fallbackGamePort}/`;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.webmanifest': 'application/manifest+json',
};

function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  return MIME[path.slice(dot)] ?? 'application/octet-stream';
}

/**
 * Старые/корневые URL без `/play/` (логотип `/icon-192.png`, `/МЕНЮ/…`, `/cards/…`).
 * Телефон иначе получает 404, хотя файлы лежат в dist-host.
 */
const STATIC_FILE_EXT =
  /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|wav|mp3|ogg|json|webmanifest|map|txt|mp4|webm)$/i;

function decodeRelPath(rel: string): string {
  try {
    return decodeURIComponent(rel);
  } catch {
    return rel;
  }
}

function isSafeDistRel(rel: string): boolean {
  if (!rel || rel.includes('..')) return false;
  if (rel.startsWith('api/') || rel === 'api') return false;
  return true;
}

function serveDistFile(
  req: IncomingMessage,
  res: ServerResponse,
  root: string,
  relRaw: string,
): boolean {
  const rel = decodeRelPath(relRaw);
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end();
    return true;
  }

  let file = normalize(join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return true;
  }

  const missing = !existsSync(file) || statSync(file).isDirectory();
  if (missing) {
    /** SPA fallback только для навигаций. Отдавать HTML вместо .js/.css — ломает всех клиентов разом. */
    if (/\.(js|mjs|cjs|css|map|json|png|jpe?g|webp|gif|svg|ico|woff2?|webmanifest|wasm|mp3|wav|ogg)$/i.test(rel)) {
      res.writeHead(404, { 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }
    file = join(root, 'index.html');
  }

  const servingHtml = file.endsWith('index.html') || mimeFor(file).startsWith('text/html');
  const hashedAsset = /[/\\]assets[/\\][^/\\]+-[A-Za-z0-9_-]{6,}\.[a-z0-9]+$/i.test(file);
  res.writeHead(200, {
    'Content-Type': mimeFor(file),
    'Cache-Control': servingHtml
      ? 'no-store'
      : hashedAsset
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=600',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}

/** Раздача `npm run build` из /play/ — для установщика без второго терминала. */
export function tryServeGameStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const root = normalize(gameDistDir());
  if (!existsSync(join(root, 'index.html'))) return false;

  const path = (() => {
    try {
      return decodeURIComponent(pathname);
    } catch {
      return pathname;
    }
  })();

  if (path.startsWith('/play')) {
    const rel = path.replace(/^\/play\/?/, '') || 'index.html';
    return serveDistFile(req, res, root, rel);
  }

  /* Любой существующий static из dist-host с корня сайта (без /play/). */
  if (STATIC_FILE_EXT.test(path)) {
    const rel = path.replace(/^\//, '');
    if (!isSafeDistRel(rel)) return false;
    const file = normalize(join(root, decodeRelPath(rel)));
    if (file.startsWith(root) && existsSync(file) && !statSync(file).isDirectory()) {
      return serveDistFile(req, res, root, rel);
    }
  }

  return false;
}
