import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Меняйте при обновлении панели — по значению видно, что сервер перезапущен с новым кодом. */
export const SERVER_HTTP_BUILD = 'host-panel-2026-06-06-installer';

export function hostHtmlPath(): string {
  const pub = (process.env.UPDOWN_HOST_PUBLIC ?? '').trim();
  if (pub) return join(pub, 'host.html');
  try {
    const dir = dirname(fileURLToPath(import.meta.url));
    return join(dir, '..', 'public', 'host.html');
  } catch {
    return join(process.cwd(), 'public', 'host.html');
  }
}

const FALLBACK_HTML = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"/><title>Up&amp;Down — хост</title></head>
<body style="font-family:system-ui;background:#0f172a;color:#f8fafc;padding:24px">
<h1>Панель хоста (резерв)</h1>
<p>Файл host.html не найден. Переустановите сервер из репозитория. Сборка: ${SERVER_HTTP_BUILD}</p>
<p><a href="/api/info" style="color:#22d3ee">/api/info</a></p>
</body></html>`;

function loadHostPanelHtml(): Buffer {
  try {
    const path = hostHtmlPath();
    const data = readFileSync(path);
    console.log(`[updown-server] Панель хоста загружена (${SERVER_HTTP_BUILD}): ${path}`);
    return data;
  } catch {
    console.error(`[updown-server] Не найден ${hostHtmlPath()} — резервная страница`);
    return Buffer.from(FALLBACK_HTML, 'utf8');
  }
}

export function serveHostPanel(res: import('node:http').ServerResponse): void {
  const html = loadHostPanelHtml();
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'X-UpDown-Build': SERVER_HTTP_BUILD,
  });
  res.end(html);
}
