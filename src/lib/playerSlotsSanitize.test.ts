import { describe, expect, it } from 'vitest';
import {
  decideJoinWhilePlaying,
  dedupePlayerSlotsByUserId,
  type PlayerSlot,
} from './onlineGameSupabase';

function slot(partial: Partial<PlayerSlot> & Pick<PlayerSlot, 'slotIndex' | 'displayName'>): PlayerSlot {
  return { userId: null, ...partial };
}

describe('decideJoinWhilePlaying', () => {
  const seats: PlayerSlot[] = [
    slot({ slotIndex: 0, displayName: 'Хост', userId: 'host' }),
    slot({ slotIndex: 1, displayName: 'Гость', userId: 'guest' }),
    slot({ slotIndex: 2, displayName: 'ИИ Запад', userId: null }),
  ];

  it('returns already when the account is in a seat', () => {
    expect(decideJoinWhilePlaying(seats, 'host')).toEqual({ action: 'already', slotIndex: 0 });
  });

  it('reclaims a paused seat instead of occupying AI', () => {
    const paused: PlayerSlot[] = [
      slot({ slotIndex: 0, displayName: 'Хост', userId: 'host' }),
      slot({
        slotIndex: 1,
        displayName: 'ИИ Север',
        userId: null,
        replacedUserId: 'guest',
        pausedByUser: true,
      }),
      slot({ slotIndex: 2, displayName: 'ИИ Запад', userId: null }),
    ];
    expect(decideJoinWhilePlaying(paused, 'guest')).toEqual({ action: 'reclaim', slotIndex: 1 });
  });

  it('does not sit in the vacant AI seat on F5/restore', () => {
    const d = decideJoinWhilePlaying(seats, 'someone-else');
    expect(d.action).toBe('reject');
  });
});

describe('dedupePlayerSlotsByUserId', () => {
  it('keeps the earlier seat and restores later duplicate to native AI', () => {
    const duped: PlayerSlot[] = [
      slot({ slotIndex: 0, displayName: 'Анна', userId: 'anna', avatarDataUrl: 'data:a' }),
      slot({ slotIndex: 1, displayName: 'Боря', userId: 'borya' }),
      slot({ slotIndex: 2, displayName: 'Анна', userId: 'anna', avatarDataUrl: 'data:a' }),
    ];
    const out = dedupePlayerSlotsByUserId(duped);
    expect(out[0]?.userId).toBe('anna');
    expect(out[1]?.userId).toBe('borya');
    expect(out[2]?.userId).toBeNull();
    expect(out[2]?.displayName).toBe('ИИ Запад');
  });

  it('is a no-op when userIds are unique', () => {
    const seats: PlayerSlot[] = [
      slot({ slotIndex: 0, displayName: 'А', userId: 'a' }),
      slot({ slotIndex: 2, displayName: 'ИИ Запад', userId: null }),
    ];
    expect(dedupePlayerSlotsByUserId(seats)).toBe(seats);
  });
});
