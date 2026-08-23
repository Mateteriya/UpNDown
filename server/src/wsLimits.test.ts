import { describe, expect, it } from 'vitest';
import { clientIpFromUpgrade, WsRateLimiter, readWsLimitConfig } from './wsLimits';

describe('WsRateLimiter', () => {
  it('counts rooms from caller, not an internal leaky counter', () => {
    const lim = new WsRateLimiter({
      ...readWsLimitConfig(),
      maxRoomsPerIp: 2,
      createPerMin: 100,
      maxRooms: 80,
    });
    expect(lim.allowCreate('1.1.1.1', 1, 2)).toEqual({ ok: false, error: 'too_many_rooms' });
    expect(lim.allowCreate('1.1.1.1', 1, 1).ok).toBe(true);
  });
});

describe('clientIpFromUpgrade', () => {
  it('ignores X-Forwarded-For when trustProxy is false', () => {
    const ip = clientIpFromUpgrade(
      { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '10.0.0.8' } },
      false,
    );
    expect(ip).toBe('10.0.0.8');
  });

  it('uses first X-Forwarded-For hop when trustProxy is true', () => {
    const ip = clientIpFromUpgrade(
      { headers: { 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, socket: { remoteAddress: '10.0.0.8' } },
      true,
    );
    expect(ip).toBe('9.9.9.9');
  });
});
