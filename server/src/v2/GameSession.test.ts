import { describe, expect, it } from 'vitest';
import { aiBid, aiPlay } from '../../../src/game/ai.js';
import { RoomStore } from '../rooms.js';
import { GameSession } from './GameSession.js';
import type { GameState } from '../../../src/game/GameEngine.js';

function firstPlayableCard(state: GameState, seat: number) {
  const card = aiPlay(state, seat, 'amateur');
  if (card) return card;
  return state.players[seat].hand[0];
}

describe('GameSession v2', () => {
  it('start_game → place_bid → play_card increments revision', () => {
    const store = new RoomStore();
    const room = store.createRoom({
      hostUserId: 'user-0',
      displayName: 'Юг',
      protocolVersion: 2,
    });
    store.joinRoom({ code: room.code, userId: 'user-1', displayName: 'Север' });
    store.joinRoom({ code: room.code, userId: 'user-2', displayName: 'Запад' });
    store.joinRoom({ code: room.code, userId: 'user-3', displayName: 'Восток' });

    const session = new GameSession(room.id, store);
    const start = session.startGame('user-0');
    expect(start.revision).toBe(1);
    expect(start.state.phase).toBe('bidding');

    let state = start.state;
    let revision = start.revision;

    while (state.phase === 'bidding' || state.phase === 'dark-bidding') {
      const seat = state.currentPlayerIndex;
      const slotUser = `user-${seat}`;
      const bid = aiBid(state, seat);
      const commit = session.placeBid(seat, bid, slotUser);
      expect(commit.revision).toBeGreaterThan(revision);
      revision = commit.revision;
      state = commit.state;
      if (revision > 20) break;
    }

    expect(state.phase).toBe('playing');

    for (let trick = 0; trick < 4; trick++) {
      for (let i = 0; i < 4; i++) {
        state = (store.getById(room.id)?.game_state ?? state) as GameState;
        if (state.pendingTrickCompletion) break;
        const seat = state.currentPlayerIndex;
        const card = firstPlayableCard(state, seat);
        const commit = session.playCard(seat, card, `user-${seat}`);
        expect(commit.revision).toBeGreaterThan(revision);
        revision = commit.revision;
        state = commit.state;
      }
      if (state.pendingTrickCompletion) {
        const commit = session.runCompleteTrick();
        expect(commit).not.toBeNull();
        revision = commit!.revision;
        state = commit!.state;
      }
    }

    expect(revision).toBeGreaterThanOrEqual(5);
  });
});
