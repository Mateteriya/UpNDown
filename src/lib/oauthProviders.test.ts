import { describe, expect, it } from 'vitest';
import {
  isVkidOAuthAvailableHere,
  needsVkidLanBridge,
  listVisibleOAuthProviders,
  VKID_CANONICAL_HOST,
} from './oauthProviders';
import { isSafeLanAuthCallbackUrl } from './vkidDirectOAuth';

describe('needsVkidLanBridge', () => {
  it('false only on VK canonical host', () => {
    expect(needsVkidLanBridge(VKID_CANONICAL_HOST)).toBe(false);
    expect(needsVkidLanBridge('www.up2down.online')).toBe(false);
  });

  it('true on LAN, localhost, RU mirror, vercel preview', () => {
    expect(needsVkidLanBridge('localhost')).toBe(true);
    expect(needsVkidLanBridge('127.0.0.1')).toBe(true);
    expect(needsVkidLanBridge('192.168.1.113')).toBe(true);
    expect(needsVkidLanBridge('10.0.0.5')).toBe(true);
    expect(needsVkidLanBridge('up2down.ru')).toBe(true);
    expect(needsVkidLanBridge('up-n-down.vercel.app')).toBe(true);
  });
});

describe('isVkidOAuthAvailableHere (legacy = !needs bridge)', () => {
  it('true only on canonical', () => {
    expect(isVkidOAuthAvailableHere('192.168.1.113')).toBe(false);
    expect(isVkidOAuthAvailableHere('up2down.online')).toBe(true);
  });
});

describe('isSafeLanAuthCallbackUrl', () => {
  it('allows LAN and mirrors', () => {
    expect(isSafeLanAuthCallbackUrl('http://192.168.1.10:3001/play/auth-callback.html')).toBe(true);
    expect(isSafeLanAuthCallbackUrl('https://up2down.ru/auth-callback.html')).toBe(true);
    expect(isSafeLanAuthCallbackUrl('https://evil.com/auth-callback.html')).toBe(false);
  });
});

describe('listVisibleOAuthProviders', () => {
  it('RU always includes VK ID · Mail.ru', () => {
    expect(listVisibleOAuthProviders('ru')).toContain('custom:vkid');
  });
});
