import { isGameDistAvailable, lanGameAppUrl } from './gameStatic.js';
import { pickGuestLanIp } from './networkInfo.js';

/**
 * Короткая Wi‑Fi ссылка сразу в /play/ (автовход).
 * Если игра с того же порта (/play/), ws/transport не нужны — клиент берёт host из URL.
 */
export function buildGuestJoinLink(
  code: string,
  httpPort: number,
  gameAppPort: number,
  wsOverride?: string,
  preferredIp?: string | null,
): string | null {
  const ip = pickGuestLanIp(preferredIp);
  const gameBase = lanGameAppUrl(ip, httpPort, gameAppPort);
  if (!gameBase || !code) return null;
  try {
    const u = new URL(gameBase);
    u.searchParams.set('code', code.trim().toUpperCase());
    u.searchParams.set('autojoin', '1');
    const samePortPlay =
      isGameDistAvailable() &&
      (u.pathname === '/play' || u.pathname.startsWith('/play/')) &&
      (!u.port || Number(u.port) === httpPort);
    if (samePortPlay && !wsOverride) {
      return u.toString();
    }
    const ws = (wsOverride ?? `ws://${ip}:${httpPort}`).trim();
    u.searchParams.set('ws', ws);
    u.searchParams.set('transport', 'ws');
    u.searchParams.set('wsProtocol', 'v2');
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Лендинг /join?code= — «открыть игру» или deep link в установленный клиент.
 * Для QR предпочтителен этот URL (не silent install, понятный выбор).
 */
export function buildGuestInviteLandingLink(
  code: string,
  httpPort: number,
  preferredIp?: string | null,
): string | null {
  const ip = pickGuestLanIp(preferredIp);
  const c = code.trim().toUpperCase();
  if (!c) return null;
  try {
    const u = new URL(`http://${ip}:${httpPort}/join`);
    u.searchParams.set('code', c);
    return u.toString();
  } catch {
    return null;
  }
}
