import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AI_BOT_AVATAR_VARIANT_COUNT,
  aiBotVariantIndexForOfflineBotId,
  assignUniqueAiBotVariantsForTable,
  getAiBotAvatarUrl,
  getOfflineAiBotAvatarPick,
  isOfflineAiBotId,
  isOnlineAiControlledSlot,
  listAiBotAvatarUrls,
  offlineAiBotAvatarKey,
  resolveAiBotAvatarVariantIndex,
  setOfflineAiBotAvatarPick,
} from './aiBotAvatars';

describe('getAiBotAvatarUrl', () => {
  it('encodes Cyrillic paths', () => {
    expect(getAiBotAvatarUrl('novice', 0)).toBe('/ИИ-боты/%D0%9D%D0%BE%D0%B2%D0%B8%D1%87%D0%BE%D0%BA.jpg');
    expect(getAiBotAvatarUrl('amateur', 1)).toBe('/ИИ-боты/%D0%9B%D1%8E%D0%B1%D0%B8%D1%82%D0%B5%D0%BB%D1%8C%201.jpg');
  });

  it('has six variants per difficulty', () => {
    expect(listAiBotAvatarUrls('expert')).toHaveLength(AI_BOT_AVATAR_VARIANT_COUNT);
    expect(getAiBotAvatarUrl('expert', 5)).toBe(
      `/ИИ-боты/${encodeURIComponent('Эксперт 5.jpg')}`,
    );
  });
});

describe('assignUniqueAiBotVariantsForTable', () => {
  it('assigns different variants when all three AI share one level', () => {
    const map = assignUniqueAiBotVariantsForTable([
      { key: 'ai1', difficulty: 'amateur', sortOrder: 0 },
      { key: 'ai2', difficulty: 'amateur', sortOrder: 1 },
      { key: 'ai3', difficulty: 'amateur', sortOrder: 2 },
    ]);
    expect(new Set([map.ai1, map.ai2, map.ai3]).size).toBe(3);
  });
});

describe('isOfflineAiBotId', () => {
  it('recognizes offline bot ids', () => {
    expect(isOfflineAiBotId('ai2')).toBe(true);
    expect(isOfflineAiBotId('human')).toBe(false);
  });
});

describe('isOnlineAiControlledSlot', () => {
  it('true for vacant AI slot', () => {
    expect(isOnlineAiControlledSlot({ userId: null })).toBe(true);
  });

  it('false for active human', () => {
    expect(isOnlineAiControlledSlot({ userId: 'u1', replacedUserId: null })).toBe(false);
  });

  it('true when human paused (replacedUserId set)', () => {
    expect(isOnlineAiControlledSlot({ userId: null, replacedUserId: 'u1' })).toBe(true);
  });
});

describe('resolveAiBotAvatarVariantIndex', () => {
  it('prefers custom pick over table assignment', () => {
    expect(
      resolveAiBotAvatarVariantIndex({
        seatKey: 'ai2',
        tableAssignments: { ai2: 1 },
        customPick: 4,
        fallbackVariant: 0,
      }),
    ).toBe(4);
  });
});

describe('offline avatar picks', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });
  });

  it('stores and reads pick by bot id', () => {
    setOfflineAiBotAvatarPick('ai1', 3);
    expect(getOfflineAiBotAvatarPick('ai1')).toBe(3);
    expect(getOfflineAiBotAvatarPick('ai2')).toBeNull();
  });
});

describe('variant indexes', () => {
  it('maps offline bots to 0..2', () => {
    expect(aiBotVariantIndexForOfflineBotId('ai1')).toBe(0);
    expect(aiBotVariantIndexForOfflineBotId('ai3')).toBe(2);
    expect(offlineAiBotAvatarKey('ai2')).toBe('ai2');
  });
});
