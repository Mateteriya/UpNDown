/**
 * In-memory лимиты для публичного WS.
 * Env: WS_MAX_ROOMS, WS_MAX_SOCKETS, WS_MAX_ROOMS_PER_IP,
 * WS_CREATE_PER_MIN, WS_JOIN_PER_MIN, WS_MSG_PER_SEC, WS_TRUST_PROXY.
 */

export const WS_MAX_PAYLOAD_BYTES = 256_000;

export type WsLimitConfig = {
  maxRooms: number;
  maxSockets: number;
  maxRoomsPerIp: number;
  createPerMin: number;
  joinPerMin: number;
  msgPerSec: number;
};

export function readWsLimitConfig(): WsLimitConfig {
  const n = (key: string, fallback: number) => {
    const raw = Number(process.env[key] ?? '');
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
  };
  return {
    maxRooms: n('WS_MAX_ROOMS', 80),
    maxSockets: n('WS_MAX_SOCKETS', 400),
    maxRoomsPerIp: n('WS_MAX_ROOMS_PER_IP', 8),
    createPerMin: n('WS_CREATE_PER_MIN', 6),
    joinPerMin: n('WS_JOIN_PER_MIN', 20),
    msgPerSec: n('WS_MSG_PER_SEC', 40),
  };
}

/**
 * X-Forwarded-For только если явно включено или Node слушает loopback (за Caddy).
 * LAN на 0.0.0.0 — не доверяем клиентскому заголовку.
 */
export function readTrustProxy(): boolean {
  const raw = (process.env.WS_TRUST_PROXY ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  const host = (process.env.HOST ?? '').trim();
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

type Bucket = { resetAt: number; count: number };

export class WsRateLimiter {
  private readonly createBuckets = new Map<string, Bucket>();
  private readonly joinBuckets = new Map<string, Bucket>();
  private readonly msgBuckets = new Map<string, Bucket>();
  private socketCount = 0;

  constructor(private readonly cfg: WsLimitConfig) {}

  get config(): WsLimitConfig {
    return this.cfg;
  }

  onSocketOpen(): boolean {
    if (this.socketCount >= this.cfg.maxSockets) return false;
    this.socketCount += 1;
    return true;
  }

  onSocketClose(): void {
    this.socketCount = Math.max(0, this.socketCount - 1);
  }

  allowMessage(ip: string): boolean {
    return this.hit(this.msgBuckets, ip || 'unknown', 1000, this.cfg.msgPerSec);
  }

  allowCreate(
    ip: string,
    roomCount: number,
    roomsForIp: number,
  ): { ok: true } | { ok: false; error: string } {
    if (roomCount >= this.cfg.maxRooms) return { ok: false, error: 'server_full' };
    if (roomsForIp >= this.cfg.maxRoomsPerIp) return { ok: false, error: 'too_many_rooms' };
    if (!this.hit(this.createBuckets, ip || 'unknown', 60_000, this.cfg.createPerMin)) {
      return { ok: false, error: 'rate_limited' };
    }
    return { ok: true };
  }

  allowJoin(ip: string): boolean {
    return this.hit(this.joinBuckets, ip || 'unknown', 60_000, this.cfg.joinPerMin);
  }

  private hit(map: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
    const now = Date.now();
    let b = map.get(key);
    if (!b || now >= b.resetAt) {
      b = { resetAt: now + windowMs, count: 0 };
      map.set(key, b);
    }
    if (b.count >= max) return false;
    b.count += 1;
    return true;
  }
}

export function clientIpFromUpgrade(
  req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } },
  trustProxy = readTrustProxy(),
): string {
  if (trustProxy) {
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0]!.trim();
    if (Array.isArray(xf) && typeof xf[0] === 'string') return xf[0].split(',')[0]!.trim();
  }
  return (req.socket?.remoteAddress ?? '').replace(/^::ffff:/, '');
}
