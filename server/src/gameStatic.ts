import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

const DEFAULT_GAME_DIST = join(process.cwd(), 'dist-host');
const FALLBACK_GAME_DIST = join(process.cwd(), 'dist');

function resolveGameDist(): string {
  const fromEnv = (process.env.GAME_DIST ?? '').trim();
  if (fromEnv) return fromEnv;
  if (existsSync(join(DEFAULT_GAME_DIST, 'index.html'))) return DEFAULT_GAME_DIST;
  return FALLBACK_GAME_DIST;
}

function gameDistDir(): string {
  return resolveGameDist();
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
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

function mimeFor(path: string): string {
  const dot = path.lastIndexOf('.');
  return MIME[path.slice(dot)] ?? 'application/octet-stream';
}

/** Раздача `npm run build` из /play/ — для установщика без второго терминала. */
export function tryServeGameStatic(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
): boolean {
  if (!pathname.startsWith('/play')) return false;
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;

  const root = normalize(gameDistDir());
  if (!existsSync(join(root, 'index.html'))) return false;

  let rel = pathname.replace(/^\/play\/?/, '') || 'index.html';
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

  if (!existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, 'index.html');
  }

  res.writeHead(200, {
    'Content-Type': mimeFor(file),
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  createReadStream(file).pipe(res);
  return true;
}
