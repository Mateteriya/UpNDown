import { isGameDistAvailable, lanGameAppUrl } from './gameStatic.js';
import { listLanIPv4 } from './networkInfo.js';

export function buildGuestJoinLink(
  code: string,
  httpPort: number,
  gameAppPort: number,
  wsOverride?: string,
): string | null {
  const ip = listLanIPv4()[0] ?? '127.0.0.1';
  const gameBase = lanGameAppUrl(ip, httpPort, gameAppPort);
  const ws = (wsOverride ?? `ws://${ip}:${httpPort}`).trim();
  if (!gameBase || !code) return null;
  try {
    const u = new URL(gameBase);
    u.searchParams.set('code', code.trim().toUpperCase());
    u.searchParams.set('ws', ws);
    u.searchParams.set('transport', 'ws');
    return u.toString();
  } catch {
    return null;
  }
}
