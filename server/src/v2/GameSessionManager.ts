/**
 * Менеджер v2-сессий: таймеры взятки/раздачи и ИИ.
 */

import type { WebSocket } from 'ws';
import type { GameRoomRow } from '../protocol.js';
import type { RoomStore } from '../rooms.js';
import { tryAiStep } from './AiDriver.js';
import { GameSession, type GameStateCommit } from './GameSession.js';
import type { GameStatePush } from './protocol.js';

const TICK_MS = 180;

export type BroadcastGameState = (push: GameStatePush) => void;

export class GameSessionManager {
  private sessions = new Map<string, GameSession>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly store: RoomStore,
    private readonly broadcast: BroadcastGameState,
  ) {}

  start(): void {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
  }

  getOrCreate(roomId: string): GameSession {
    let s = this.sessions.get(roomId);
    if (!s) {
      s = new GameSession(roomId, this.store);
      this.sessions.set(roomId, s);
    }
    return s;
  }

  remove(roomId: string): void {
    this.sessions.delete(roomId);
  }

  isV2Room(room: GameRoomRow | null): boolean {
    return room?.protocol_version === 2;
  }

  private listV2Playing(): GameRoomRow[] {
    return [...this.allRooms()].filter(
      (r) => r.protocol_version === 2 && r.status === 'playing' && r.game_state,
    );
  }

  private allRooms(): GameRoomRow[] {
    return this.store.listAll();
  }

  private emit(commit: GameStateCommit): void {
    this.broadcast({
      type: 'game_state',
      roomId: commit.room.id,
      revision: commit.revision,
      state: commit.state,
      playerSlots: commit.room.player_slots,
      roomPhase: commit.room.room_phase ?? null,
    });
  }

  tick(): void {
    for (const room of this.listV2Playing()) {
      try {
        this.tickRoom(room);
      } catch (e) {
        console.error('[v2-session]', room.code, e);
      }
    }
  }

  private tickRoom(room: GameRoomRow): void {
    const session = this.getOrCreate(room.id);
    const state = room.game_state as import('../../../src/game/GameEngine.js').GameState;

    session.syncTrickTimer(state);
    session.syncDealTimer(state);

    if (state.pendingTrickCompletion && session.trickCompleteAt != null) {
      if (Date.now() >= session.trickCompleteAt) {
        const commit = session.runCompleteTrick();
        if (commit) this.emit(commit);
      }
      return;
    }

    if (state.phase === 'deal-complete' && session.dealNextAt != null) {
      if (Date.now() >= session.dealNextAt) {
        const commit = session.runStartNextDeal();
        if (commit) this.emit(commit);
      }
      return;
    }

    if (state.pendingTrickCompletion || state.phase === 'deal-complete') return;

    const aiNext = tryAiStep(state, room.player_slots ?? []);
    if (aiNext && aiNext !== state) {
      const commit = session.applyAiMove(aiNext);
      this.emit(commit);
    }
  }
}
