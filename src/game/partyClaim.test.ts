import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildPartyArchiveRecord } from './partyArchive';
import {
  createClaimReceipt,
  formatClaimCardLines,
  readClaimOutbox,
  upsertClaimOutbox,
} from './partyClaim';
import type { DealResult } from './GameEngine';

vi.mock('./persistence', () => ({
  getPlayerProfile: () => ({
    profileId: '11111111-1111-4111-a111-111111111111',
    displayName: 'Вы',
  }),
}));

function deal(): DealResult {
  return { dealNumber: 1, bids: [1, 1, 1, 1], points: [10, 10, 10, 10], takens: [1, 1, 1, 1] };
}

describe('partyClaim', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    });
  });

  it('createClaimReceipt stores viewer snapshot and outbox', () => {
    const arch = buildPartyArchiveRecord(
      {
        dealNumber: 28,
        dealHistory: [deal()],
        players: [
          { name: 'Вы', score: 40 },
          { name: 'A', score: 30 },
          { name: 'B', score: 20 },
          { name: 'C', score: 10 },
        ],
      },
      {
        gameId: 1,
        profileId: '11111111-1111-4111-a111-111111111111',
        matchKey: 'room:abc',
        source: 'online',
      },
    )!;
    const receipt = createClaimReceipt({
      archive: arch,
      email: 'Test@Example.com',
      intent: 'new_account',
    });
    expect(receipt.email).toBe('test@example.com');
    expect(receipt.matchKey).toBe('room:abc');
    expect(receipt.viewer.humanScore).toBe(40);
    expect(receipt.viewer.humanPlace).toBe(1);
    upsertClaimOutbox(receipt);
    expect(readClaimOutbox()).toHaveLength(1);
    const lines = formatClaimCardLines(receipt, 'ru');
    expect(lines.you).toContain('40');
    expect(lines.table).toContain('Вы');
  });
});
