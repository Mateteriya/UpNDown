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
        if (state.phase !== 'playing' || state.pendingTrickCompletion) break;
        const seat = state.currentPlayerIndex;
        const card = firstPlayableCard(state, seat);
        if (!card) break;
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

  it('start_game allowed for host not in seat 0 after transfer', () => {
    const store = new RoomStore();
    const room = store.createRoom({
      hostUserId: 'user-0',
      displayName: 'Юг',
      protocolVersion: 2,
    });
    store.joinRoom({ code: room.code, userId: 'user-1', displayName: 'Север' });
    store.transferHostV2(room.id, 'user-0', 'user-1');
    const session = new GameSession(room.id, store);
    expect(() => session.startGame('user-0')).toThrow(/not_host/);
    const start = session.startGame('user-1');
    expect(start.revision).toBe(1);
  });

  it('returnFromPauseV2 restores paused seat', () => {
    const store = new RoomStore();
    const room = store.createRoom({
      hostUserId: 'user-0',
      displayName: 'Юг',
      protocolVersion: 2,
    });
    store.joinRoom({ code: room.code, userId: 'user-1', displayName: 'Север' });
    store.commitGameStateV2(room.id, { phase: 'playing' }, undefined, 'playing');
    const paused = store.takePauseV2(room.id, 'user-1');
    expect('error' in paused).toBe(false);
    const back = store.returnFromPauseV2(room.id, 'user-1');
    expect('error' in back).toBe(false);
    if ('error' in back) return;
    const slot = back.player_slots.find((s) => s.userId === 'user-1');
    expect(slot?.pausedByUser).toBeFalsy();
  });

  it('updatePlayerSlots: non-host can only edit own identity fields', () => {
    const store = new RoomStore();
    const room = store.createRoom({
      hostUserId: 'user-0',
      displayName: 'Юг',
      protocolVersion: 2,
    });
    store.joinRoom({ code: room.code, userId: 'user-1', displayName: 'Север' });
    const slots = store.getById(room.id)!.player_slots.map((s) =>
      s.userId === 'user-1' ? { ...s, displayName: 'Новое', avatarDataUrl: 'data:tiny' } : { ...s, displayName: 'Хак' },
    );
    const updated = store.updatePlayerSlots(room.id, slots, 'user-1');
    expect('error' in updated).toBe(false);
    if ('error' in updated) return;
    expect(updated.player_slots.find((s) => s.userId === 'user-1')?.displayName).toBe('Новое');
    expect(updated.player_slots.find((s) => s.userId === 'user-0')?.displayName).toBe('Юг');
  });
});
