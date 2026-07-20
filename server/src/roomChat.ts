/**
 * In-memory room chat (WS path). Ring buffer per room; no disk persist (v1).
 */

import { randomUUID } from 'node:crypto';
import type { GameRoomRow, PlayerSlot } from './protocol.js';

export type RoomChatMessage = {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
};

const MAX_BODY = 500;
const MAX_HISTORY = 120;
const MIN_POST_INTERVAL_MS = 700;

function isRoomMember(slots: PlayerSlot[] | undefined, userId: string): boolean {
  for (const s of slots ?? []) {
    if (s.userId === userId) return true;
    if (s.replacedUserId === userId) return true;
  }
  return false;
}

export class RoomChatStore {
  private byRoom = new Map<string, RoomChatMessage[]>();
  private lastPostAt = new Map<string, number>();

  history(roomId: string, limit = MAX_HISTORY): RoomChatMessage[] {
    const list = this.byRoom.get(roomId) ?? [];
    const lim = Math.min(200, Math.max(1, limit));
    if (list.length <= lim) return list.slice();
    return list.slice(list.length - lim);
  }

  post(
    room: GameRoomRow,
    playerId: string,
    displayName: string | undefined,
    body: string,
  ): { message: RoomChatMessage } | { error: string } {
    const uid = (playerId ?? '').trim();
    if (!uid) return { error: 'player_required' };
    if (!isRoomMember(room.player_slots, uid) && room.host_user_id !== uid) {
      return { error: 'not_member' };
    }

    const trimmed = String(body ?? '').trim();
    if (!trimmed) return { error: 'bad_body' };
    if (trimmed.length > MAX_BODY) return { error: 'bad_body' };

    const key = `${room.id}:${uid}`;
    const now = Date.now();
    const prev = this.lastPostAt.get(key) ?? 0;
    if (now - prev < MIN_POST_INTERVAL_MS) return { error: 'rate_limited' };
    this.lastPostAt.set(key, now);

    const message: RoomChatMessage = {
      id: randomUUID(),
      room_id: room.id,
      user_id: uid,
      display_name: (displayName ?? '').trim().slice(0, 40) || 'Игрок',
      body: trimmed,
      created_at: new Date().toISOString(),
    };

    let list = this.byRoom.get(room.id);
    if (!list) {
      list = [];
      this.byRoom.set(room.id, list);
    }
    list.push(message);
    if (list.length > MAX_HISTORY) {
      list.splice(0, list.length - MAX_HISTORY);
    }
    return { message };
  }

  dropRoom(roomId: string): void {
    this.byRoom.delete(roomId);
    for (const key of [...this.lastPostAt.keys()]) {
      if (key.startsWith(`${roomId}:`)) this.lastPostAt.delete(key);
    }
  }
}
