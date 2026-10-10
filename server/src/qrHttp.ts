import type { IncomingMessage, ServerResponse } from 'node:http';
import QRCode from 'qrcode';
import { buildGuestInviteLandingLink, buildGuestJoinLink } from './joinLink.js';

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
  const preferredIp = (url.searchParams.get('ip') ?? '').trim() || null;
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('code required');
    return true;
  }

  const direct = (url.searchParams.get('direct') ?? '').trim() === '1';
  const link = direct
    ? buildGuestJoinLink(code, httpPort, gameAppPort, undefined, preferredIp)
    : buildGuestInviteLandingLink(code, httpPort, preferredIp) ||
      buildGuestJoinLink(code, httpPort, gameAppPort, undefined, preferredIp);
  if (!link) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('game not ready');
    return true;
  }

  try {
    const png = await QRCode.toBuffer(link, {
      type: 'png',
      width: 360,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#000000', light: '#ffffff' },
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
