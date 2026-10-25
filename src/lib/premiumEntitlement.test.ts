import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getPremiumSessionOverride,
  isPremiumEntitled,
  isPremiumUserIdAllowlisted,
  parsePremiumUserIds,
  setPremiumSessionOverride,
} from './premiumEntitlement';

describe('premiumEntitlement', () => {
  afterEach(() => {
    setPremiumSessionOverride(false);
    vi.unstubAllEnvs();
  });

  it('parses user id allowlist', () => {
    vi.stubEnv('VITE_PREMIUM_USER_IDS', 'aaa, bbb ;ccc');
    expect(parsePremiumUserIds()).toEqual(new Set(['aaa', 'bbb', 'ccc']));
    expect(isPremiumUserIdAllowlisted('bbb')).toBe(true);
    expect(isPremiumUserIdAllowlisted('zzz')).toBe(false);
  });

  it('session override entitles without user', () => {
    expect(isPremiumEntitled(null)).toBe(false);
    setPremiumSessionOverride(true);
    expect(getPremiumSessionOverride()).toBe(true);
    expect(isPremiumEntitled(null)).toBe(true);
  });
});
