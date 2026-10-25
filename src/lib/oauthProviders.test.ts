import { describe, expect, it } from 'vitest';
import { isVkidOAuthAvailableHere, needsVkidLanBridge, listVisibleOAuthProviders } from './oauthProviders';

describe('needsVkidLanBridge', () => {
  it('true on localhost and LAN IPs (party host :3001)', () => {
    expect(needsVkidLanBridge('localhost')).toBe(true);
    expect(needsVkidLanBridge('127.0.0.1')).toBe(true);
    expect(needsVkidLanBridge('192.168.1.113')).toBe(true);
    expect(needsVkidLanBridge('10.0.0.5')).toBe(true);
  });

  it('false on public hostnames', () => {
    expect(needsVkidLanBridge('up2down.online')).toBe(false);
    expect(needsVkidLanBridge('up-n-down.vercel.app')).toBe(false);
  });
});

describe('isVkidOAuthAvailableHere (legacy = !needs bridge)', () => {
  it('false on LAN, true on public', () => {
    expect(isVkidOAuthAvailableHere('192.168.1.113')).toBe(false);
    expect(isVkidOAuthAvailableHere('up2down.online')).toBe(true);
  });
});

describe('listVisibleOAuthProviders', () => {
  it('RU always includes VK ID · Mail.ru (LAN uses public bridge)', () => {
    expect(listVisibleOAuthProviders('ru')).toContain('custom:vkid');
  });
});
