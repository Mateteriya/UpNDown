import type { IncomingMessage, ServerResponse } from 'node:http';
import QRCode from 'qrcode';
import { buildGuestJoinLink } from './joinLink.js';

export async function tryServeJoinQr(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  httpPort: number,
  gameAppPort: number,
): Promise<boolean> {
  if (path !== '/api/qr' || req.method !== 'GET') return false;

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const code = (url.searchParams.get('code') ?? '').trim().toUpperCase();
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('code required');
    return true;
  }

  const link = buildGuestJoinLink(code, httpPort, gameAppPort);
  if (!link) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('game not ready');
    return true;
  }

  try {
    const png = await QRCode.toBuffer(link, {
      type: 'png',
      width: 280,
      margin: 1,
      color: { dark: '#120e08', light: '#e8b84a' },
    });
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    });
    res.end(png);
  } catch {
    res.writeHead(500);
    res.end();
  }
  return true;
}
