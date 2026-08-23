import { describe, expect, it } from 'vitest';
import { RoomStore } from './rooms';
import { GameSession } from './v2/GameSession';
import { buildFinishMatchPlayers } from '../../src/game/finishMatchPayload';
import type { GameState } from '../../src/game/GameEngine';

describe('buildFinishMatchPlayers', () => {
  it('takes scores from engine state, not a spoofed client list', () => {
    const store = new RoomStore();
    const room = store.createRoom({
      hostUserId: 'user-0',
      displayName: 'Юг',
      protocolVersion: 2,
      createdByIp: '10.0.0.1',
    });
    store.joinRoom({ code: room.code, userId: 'user-1', displayName: 'Север' });
    const start = new GameSession(room.id, store).startGame('user-0');
    const state: GameState = {
      ...start.state,
      phase: 'game-complete',
      players: start.state.players.map((p, i) => ({ ...p, score: i === 0 ? 80 : 10, hand: [] })),
    };
    const rows = buildFinishMatchPlayers(state, start.room.player_slots ?? []);
    expect(rows[0]?.final_score).toBe(80);
    expect(rows[0]?.user_id).toBe('user-0');
    expect(rows[1]?.final_score).toBe(10);
  });
});

describe('RoomStore creator IP', () => {
  it('drops the IP count when the room is pruned', () => {
    const store = new RoomStore();
    const a = store.createRoom({
      hostUserId: 'h',
      displayName: 'H',
      createdByIp: '1.2.3.4',
    });
    expect(store.countRoomsByCreatorIp('1.2.3.4')).toBe(1);
    store.pruneStale({
      finishedMaxAgeMs: 0,
      waitingMaxAgeMs: 0,
      playingMaxAgeMs: 0,
    });
    expect(store.getById(a.id)).toBeNull();
    expect(store.countRoomsByCreatorIp('1.2.3.4')).toBe(0);
  });
});
