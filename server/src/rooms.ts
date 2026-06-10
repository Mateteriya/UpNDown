import { randomUUID } from 'node:crypto';
import type { GameRoomRow, PlayerSlot } from './protocol.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

function nowIso(): string {
  return new Date().toISOString();
}

function generateCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    let s = '';
    for (let i = 0; i < CODE_LENGTH; i++) {
      s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!existing.has(s)) return s;
  }
  return randomUUID().slice(0, CODE_LENGTH).toUpperCase();
}

function capAvatar(url: string | null | undefined, max = 24_000): string | null | undefined {
  if (url == null || url === '') return url;
  return url.length <= max ? url : undefined;
}

function normalizeSlots(slots: PlayerSlot[]): PlayerSlot[] {
  const byIndex = new Map<number, PlayerSlot>();
  for (const s of slots) {
    if (typeof s.slotIndex === 'number' && s.slotIndex >= 0 && s.slotIndex <= 3) {
      byIndex.set(s.slotIndex, { ...s, slotIndex: s.slotIndex });
    }
  }
  const out: PlayerSlot[] = [];
  for (let i = 0; i < 4; i++) {
    const existing = byIndex.get(i);
    if (existing) out.push(existing);
  }
  return out;
}

function vacantAiSlot(slotIndex: number): PlayerSlot {
  return {
    slotIndex,
    displayName: AI_NAMES[slotIndex] ?? `ИИ ${slotIndex}`,
    userId: null,
  };
}

function fullSlotsFromPartial(partial: PlayerSlot[]): PlayerSlot[] {
  const norm = normalizeSlots(partial);
  const full: PlayerSlot[] = [];
  for (let i = 0; i < 4; i++) {
    const existing = norm.find((s) => s.slotIndex === i);
    full.push(existing ?? vacantAiSlot(i));
  }
  return full;
}

export class RoomStore {
  private rooms = new Map<string, GameRoomRow>();
  private codeToId = new Map<string, string>();

  listPublicWaiting(): GameRoomRow[] {
    return [...this.rooms.values()]
      .filter(
        (r) =>
          r.status === 'waiting' &&
          r.room_phase === 'lobby' &&
          r.room_kind === 'public',
      )
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 40);
  }

  getById(roomId: string): GameRoomRow | null {
    return this.rooms.get(roomId) ?? null;
  }

  listDedicatedActive(): GameRoomRow[] {
    return [...this.rooms.values()].filter(
      (r) => r.host_dedicated === true && r.status !== 'finished',
    );
  }

  getByCode(code: string): GameRoomRow | null {
    const id = this.codeToId.get(code.trim().toUpperCase());
    return id ? this.rooms.get(id) ?? null : null;
  }

  listAll(): GameRoomRow[] {
    return [...this.rooms.values()];
  }

  createRoom(opts: {
    hostUserId: string;
    displayName: string;
    shortLabel?: string;
    avatarDataUrl?: string | null;
    settlementMode?: string;
    buyIn?: number | null;
    roomKind?: string;
    hostDedicated?: boolean;
    protocolVersion?: 1 | 2;
  }): GameRoomRow {
    const codes = new Set(this.codeToId.keys());
    const code = generateCode(codes);
    const id = randomUUID();
    const t = nowIso();
    const dedicated = opts.hostDedicated === true;
    const hostSlot: PlayerSlot = {
      userId: opts.hostUserId,
      displayName: opts.displayName.slice(0, 17),
      slotIndex: 0,
      ...(opts.shortLabel ? { shortLabel: opts.shortLabel.slice(0, 12) } : {}),
      ...(capAvatar(opts.avatarDataUrl) ? { avatarDataUrl: capAvatar(opts.avatarDataUrl) } : {}),
    };
    const room: GameRoomRow = {
      id,
      code,
      host_user_id: opts.hostUserId,
      protocol_version: opts.protocolVersion === 2 ? 2 : 1,
      host_dedicated: dedicated,
      status: 'waiting',
      game_state: null,
      game_state_revision: 0,
      player_slots: dedicated ? [] : [hostSlot],
      created_at: t,
      updated_at: t,
      room_phase: 'lobby',
      settlement_mode: opts.settlementMode ?? 'accuracy_bonus',
      buy_in: opts.buyIn ?? null,
      room_kind: opts.roomKind ?? 'private',
    };
    this.rooms.set(id, room);
    this.codeToId.set(code, id);
    return room;
  }

  recoverJoin(code: string, userId: string): { room: GameRoomRow; mySlotIndex: number } | null {
    const room = this.getByCode(code);
    if (!room || room.status === 'finished') return null;
    const slots = fullSlotsFromPartial(room.player_slots ?? []);
    let idx = slots.findIndex((s) => s.userId === userId);
    if (idx >= 0) {
      return { room, mySlotIndex: slots[idx].slotIndex };
    }
    /** Ручной выход / пауза в партии: слот стал ИИ, но место помечено replacedUserId. */
    const reclaimIdx = slots.findIndex((s) => s.replacedUserId === userId);
    if (reclaimIdx < 0) return null;
    const prev = slots[reclaimIdx];
    const displayName = (prev.replacedDisplayName ?? prev.displayName ?? 'Игрок').slice(0, 17);
    slots[reclaimIdx] = {
      ...prev,
      userId,
      displayName,
      replacedUserId: undefined,
      replacedDisplayName: undefined,
      pausedByUser: false,
      absent: false,
    };
    room.player_slots = slots;
    room.updated_at = nowIso();
    return { room, mySlotIndex: slots[reclaimIdx].slotIndex };
  }

  /** Первый слот 0..3 без живого игрока (ИИ-слоты с userId=null не считаются занятыми). */
  private firstVacantSlotIndex(slots: PlayerSlot[]): number {
    for (let i = 0; i < 4; i++) {
      const s = slots.find((sl) => sl.slotIndex === i);
      if (!s?.userId) return i;
    }
    return -1;
  }

  joinRoom(opts: {
    code: string;
    userId: string;
    displayName: string;
    shortLabel?: string;
    avatarDataUrl?: string | null;
  }): { room: GameRoomRow; mySlotIndex: number } | { error: string } {
    const normalized = opts.code.trim().toUpperCase();
    const existing = this.recoverJoin(normalized, opts.userId);
    if (existing) return existing;

    const room = this.getByCode(normalized);
    if (!room) return { error: 'Комната не найдена' };
    if (room.status === 'playing') {
      return {
        error:
          'Партия уже идёт. Если вас выкинуло — нажмите «Присоединиться» ещё раз (без лишнего выхода). Иначе попросите хоста новую комнату.',
      };
    }
    if (room.status !== 'waiting') return { error: 'Комната уже завершена' };

    const slots = fullSlotsFromPartial(room.player_slots ?? []);
    const humans = slots.filter((s) => s.userId != null && s.userId !== '');
    if (humans.length >= 4) return { error: 'Все места заняты людьми' };

    /** Комната с панели ПК (host_dedicated): первый живой игрок — ведущий (слот 0), не «Сервер» на ПК. */
    if (room.host_dedicated && humans.length === 0) {
      room.host_user_id = opts.userId;
    }

    const slotIndex = this.firstVacantSlotIndex(slots);
    if (slotIndex < 0) return { error: 'Нет свободных мест за столом' };

    const newSlot: PlayerSlot = {
      userId: opts.userId,
      displayName: opts.displayName.slice(0, 17),
      slotIndex,
      ...(opts.shortLabel ? { shortLabel: opts.shortLabel.slice(0, 12) } : {}),
      ...(capAvatar(opts.avatarDataUrl) ? { avatarDataUrl: capAvatar(opts.avatarDataUrl) } : {}),
    };
    const at = slots.findIndex((s) => s.slotIndex === slotIndex);
    if (at >= 0) slots[at] = newSlot;
    else slots.push(newSlot);
    room.player_slots = fullSlotsFromPartial(slots);
    room.updated_at = nowIso();
    return { room, mySlotIndex: slotIndex };
  }

  leaveRoom(roomId: string, userId: string): { error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    if (room.status === 'playing') {
      const slots = fullSlotsFromPartial(room.player_slots ?? []);
      const idx = slots.findIndex((s) => s.userId === userId);
      if (idx < 0) return { error: 'Слот не найден' };
      const left = slots[idx];
      slots[idx] = {
        ...vacantAiSlot(left.slotIndex),
        replacedUserId: userId,
        replacedDisplayName: left.displayName,
        pausedByUser: true,
      };
      room.player_slots = slots;
      room.updated_at = nowIso();
      return {};
    }

    const slots = normalizeSlots(room.player_slots ?? []);
    const filtered = slots.filter((s) => s.userId !== userId);
    if (filtered.length === slots.length) {
      return { error: 'Слот не найден' };
    }
    if (filtered.length === 0) {
      this.rooms.delete(roomId);
      this.codeToId.delete(room.code);
      return {};
    }
    room.player_slots = filtered;
    if (room.host_user_id === userId) {
      room.host_user_id = filtered.find((s) => s.userId)?.userId ?? null;
    }
    room.updated_at = nowIso();
    return {};
  }

  updatePlayerSlots(roomId: string, playerSlots: PlayerSlot[]): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    room.player_slots = fullSlotsFromPartial(normalizeSlots(playerSlots));
    /** Имена/аватары в лобби не должны сдвигать game_state_revision — иначе ходы и вторая раздача ловят conflict. */
    room.updated_at = nowIso();
    return room;
  }

  /** v2: сервер пишет state без expectedRevision от клиента. */
  commitGameStateV2(
    roomId: string,
    gameState: unknown,
    playerSlots?: PlayerSlot[],
    roomPhase?: string,
  ): { room?: GameRoomRow; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    if (room.protocol_version !== 2) return { error: 'room_not_v2' };

    const rev = room.game_state_revision ?? 0;
    room.game_state = gameState;
    room.status = 'playing';
    if (playerSlots) room.player_slots = fullSlotsFromPartial(playerSlots);
    if (roomPhase) room.room_phase = roomPhase;
    room.game_state_revision = rev + 1;
    room.updated_at = nowIso();
    return { room };
  }

  takePauseV2(roomId: string, userId: string): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    const slots = fullSlotsFromPartial(room.player_slots ?? []);
    const idx = slots.findIndex((s) => s.userId === userId);
    if (idx < 0) return { error: 'Слот не найден' };
    const left = slots[idx];
    slots[idx] = {
      ...vacantAiSlot(left.slotIndex),
      replacedUserId: userId,
      replacedDisplayName: left.displayName,
      pausedByUser: true,
    };
    room.player_slots = slots;
    room.updated_at = nowIso();
    return room;
  }

  returnFromPauseV2(roomId: string, userId: string): GameRoomRow | { error: string } {
    const recovered = this.recoverJoin(room.code, userId);
    if (!recovered) return { error: 'Слот не найден' };
    return recovered.room;
  }

  hostReturnSlotV2(roomId: string, hostId: string, seat: number): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    if (room.host_user_id !== hostId) return { error: 'not_host' };
    const slots = fullSlotsFromPartial(room.player_slots ?? []);
    const idx = slots.findIndex((s) => s.slotIndex === seat);
    if (idx < 0) return { error: 'Слот не найден' };
    const s = slots[idx];
    if (!s.replacedUserId) return { error: 'Слот не на паузе' };
    slots[idx] = {
      ...s,
      userId: s.replacedUserId,
      displayName: (s.replacedDisplayName ?? s.displayName).slice(0, 17),
      replacedUserId: undefined,
      replacedDisplayName: undefined,
      pausedByUser: false,
      absent: false,
    };
    room.player_slots = slots;
    room.updated_at = nowIso();
    return room;
  }

  transferHostV2(
    roomId: string,
    hostId: string,
    newHostUserId: string,
  ): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    if (room.host_user_id !== hostId) return { error: 'not_host' };
    const slots = fullSlotsFromPartial(room.player_slots ?? []);
    if (!slots.some((s) => s.userId === newHostUserId)) {
      return { error: 'Игрок не в комнате' };
    }
    room.host_user_id = newHostUserId;
    room.updated_at = nowIso();
    return room;
  }

  hostResolveAbsentV2(
    roomId: string,
    hostId: string,
    choice: 'finish' | 'wait' | 'replace_ai',
  ): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    if (room.host_user_id !== hostId) return { error: 'not_host' };
    if (choice === 'finish') {
      room.status = 'finished';
      room.room_phase = 'finished';
    } else if (choice === 'replace_ai') {
      const slots = fullSlotsFromPartial(room.player_slots ?? []);
      for (let i = 0; i < slots.length; i++) {
        if (slots[i].absent) {
          slots[i] = {
            ...vacantAiSlot(slots[i].slotIndex),
            replacedUserId: slots[i].userId ?? undefined,
            replacedDisplayName: slots[i].displayName,
          };
        }
      }
      room.player_slots = slots;
    }
    room.updated_at = nowIso();
    return room;
  }

  updateRoomState(
    roomId: string,
    gameState: unknown,
    playerSlots?: PlayerSlot[],
    opts?: { roomPhase?: string; expectedRevision?: number },
  ): { room?: GameRoomRow; conflict?: boolean; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };

    if (room.protocol_version === 2) {
      return { error: 'protocol_v2_use_commands', conflict: false };
    }

    const rev = room.game_state_revision ?? 0;
    const exp = opts?.expectedRevision;
    if (exp !== undefined && exp >= 0 && exp !== rev) {
      return { conflict: true, room: { ...room } };
    }

    room.game_state = gameState;
    room.status = 'playing';
    if (playerSlots) room.player_slots = fullSlotsFromPartial(playerSlots);
    if (opts?.roomPhase) room.room_phase = opts.roomPhase;
    room.game_state_revision = rev + 1;
    room.updated_at = nowIso();
    return { room };
  }

  peekByCode(code: string): {
    ok: boolean;
    code?: string;
    status?: string;
    settlement_mode?: string;
    buy_in?: number | null;
    room_kind?: string;
    human_count?: number;
    error?: string;
  } {
    const room = this.getByCode(code);
    if (!room) return { ok: false, error: 'not_found' };
    const humans = (room.player_slots ?? []).filter((s) => s.userId).length;
    return {
      ok: true,
      code: room.code,
      status: room.status,
      settlement_mode: room.settlement_mode ?? undefined,
      buy_in: room.buy_in ?? null,
      room_kind: room.room_kind ?? undefined,
      human_count: humans,
    };
  }
}
