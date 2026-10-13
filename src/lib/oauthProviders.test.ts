import { describe, expect, it } from 'vitest';
import { isVkidOAuthAvailableHere } from './oauthProviders';

describe('isVkidOAuthAvailableHere', () => {
  it('hides VK on localhost and LAN IPs (Party Version host)', () => {
    expect(isVkidOAuthAvailableHere('localhost')).toBe(false);
    expect(isVkidOAuthAvailableHere('127.0.0.1')).toBe(false);
    expect(isVkidOAuthAvailableHere('192.168.1.113')).toBe(false);
    expect(isVkidOAuthAvailableHere('10.0.0.5')).toBe(false);
  });

  it('shows VK on public hostnames', () => {
    expect(isVkidOAuthAvailableHere('up2down.online')).toBe(true);
    expect(isVkidOAuthAvailableHere('up-n-down.vercel.app')).toBe(true);
  });
});
