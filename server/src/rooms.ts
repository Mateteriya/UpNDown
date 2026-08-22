import { randomUUID } from 'node:crypto';
import { parseMaxPlayers, type GameRoomRow, type PlayerSlot } from './protocol.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const AI_NAMES = ['ИИ Юг', 'ИИ Север', 'ИИ Запад', 'ИИ Восток'] as const;

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

/** LAN: профильный JPEG часто >24KB; слишком жёсткий потолок = пустые аватарки у соседей. */
function capAvatar(url: string | null | undefined, max = 160_000): string | null | undefined {
  if (url == null || url === '') return url;
  return url.length <= max ? url : undefined;
}

function normalizeSlots(slots: PlayerSlot[], maxPlayers = 4): PlayerSlot[] {
  const byIndex = new Map<number, PlayerSlot>();
  for (const s of slots) {
    if (typeof s.slotIndex === 'number' && s.slotIndex >= 0 && s.slotIndex < maxPlayers) {
      byIndex.set(s.slotIndex, { ...s, slotIndex: s.slotIndex });
    }
  }
  const out: PlayerSlot[] = [];
  for (let i = 0; i < maxPlayers; i++) {
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

function fullSlotsFromPartial(partial: PlayerSlot[], maxPlayers = 4): PlayerSlot[] {
  const norm = normalizeSlots(partial, maxPlayers);
  const full: PlayerSlot[] = [];
  for (let i = 0; i < maxPlayers; i++) {
    const existing = norm.find((s) => s.slotIndex === i);
    full.push(existing ?? vacantAiSlot(i));
  }
  return full;
}

function roomPlayerCount(room: Pick<GameRoomRow, 'max_players'>): 3 | 4 {
  return room.max_players === 3 ? 3 : 4;
}

export class RoomStore {
  private rooms = new Map<string, GameRoomRow>();
  private codeToId = new Map<string, string>();
  /** roomId → IP создателя; не уходит клиенту. */
  private createdByIp = new Map<string, string>();
  private onMutate: (() => void) | null = null;
  private onRemoveRoom: ((roomId: string) => void) | null = null;

  /** Хук после мутации (persistance / метрики). */
  setOnMutate(fn: (() => void) | null): void {
    this.onMutate = fn;
  }

  /** Хук при удалении комнаты (сессии v2 / host-automation таймеры). */
  setOnRemoveRoom(fn: ((roomId: string) => void) | null): void {
    this.onRemoveRoom = fn;
  }

  private touch(): void {
    try {
      this.onMutate?.();
    } catch (e) {
      /* ignore */
    }
  }

  private deleteRoom(room: GameRoomRow): void {
    this.rooms.delete(room.id);
    this.codeToId.delete(room.code);
    this.createdByIp.delete(room.id);
    try {
      this.onRemoveRoom?.(room.id);
    } catch {
      /* ignore */
    }
  }

  countRoomsByCreatorIp(ip: string): number {
    const key = (ip || '').trim();
    if (!key) return 0;
    let n = 0;
    for (const [roomId, creator] of this.createdByIp) {
      if (creator === key && this.rooms.has(roomId)) n += 1;
    }
    return n;
  }

  setMatchId(roomId: string, matchId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.match_id = matchId;
    this.touch();
  }

  /** Восстановить комнаты с диска (после рестарта). */
  hydrate(rooms: GameRoomRow[]): number {
    let n = 0;
    for (const raw of rooms) {
      if (!raw?.id || !raw?.code) continue;
      const code = String(raw.code).trim().toUpperCase();
      const room: GameRoomRow = {
        ...raw,
        code,
        max_players: raw.max_players === 3 ? 3 : 4,
        player_slots: fullSlotsFromPartial(raw.player_slots ?? [], raw.max_players === 3 ? 3 : 4),
      };
      this.rooms.set(room.id, room);
      this.codeToId.set(code, room.id);
      n += 1;
    }
    return n;
  }

  /**
   * Удалить «висящие» комнаты:
   * - finished старше finishedMaxAgeMs
   * - waiting (лобби) без обновлений дольше waitingMaxAgeMs — мусор зала столов
   * - playing без обновлений дольше playingMaxAgeMs — брошенные партии
   */
  pruneStale(opts: {
    finishedMaxAgeMs: number;
    waitingMaxAgeMs: number;
    playingMaxAgeMs: number;
  }): { finished: number; waiting: number; playing: number } {
    const now = Date.now();
    const finishedCut = now - opts.finishedMaxAgeMs;
    const waitingCut = now - opts.waitingMaxAgeMs;
    const playingCut = now - opts.playingMaxAgeMs;
    const counts = { finished: 0, waiting: 0, playing: 0 };

    for (const room of [...this.rooms.values()]) {
      const t = Date.parse(room.updated_at || room.created_at || '');
      if (!Number.isFinite(t)) continue;

      if (room.status === 'finished' && t <= finishedCut) {
        this.deleteRoom(room);
        counts.finished += 1;
        continue;
      }
      if (room.status === 'waiting' && t <= waitingCut) {
        this.deleteRoom(room);
        counts.waiting += 1;
        continue;
      }
      if (room.status === 'playing' && t <= playingCut) {
        this.deleteRoom(room);
        counts.playing += 1;
      }
    }

    const removed = counts.finished + counts.waiting + counts.playing;
    if (removed) this.touch();
    return counts;
  }

  /** Удалить finished старше maxAgeMs; вернуть число удалённых. */
  pruneFinished(maxAgeMs: number): number {
    return this.pruneStale({
      finishedMaxAgeMs: maxAgeMs,
      waitingMaxAgeMs: Number.POSITIVE_INFINITY,
      playingMaxAgeMs: Number.POSITIVE_INFINITY,
    }).finished;
  }

  /**
   * Публичные лобби для зала столов.
   * Сразу отфильтровываем «протухшие» waiting (без обновлений дольше maxAgeMs),
   * чтобы клиент не видел зомби даже между prune-интервалами.
   */
  listPublicWaiting(maxAgeMs = 90 * 60 * 1000): GameRoomRow[] {
    const cutoff = Date.now() - maxAgeMs;
    return [...this.rooms.values()]
      .filter((r) => {
        if (r.status !== 'waiting' || r.room_phase !== 'lobby' || r.room_kind !== 'public') {
          return false;
        }
        const t = Date.parse(r.updated_at || r.created_at || '');
        return Number.isFinite(t) && t >= cutoff;
      })
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
    maxPlayers?: 3 | 4;
    protocolVersion?: 1 | 2;
    createdByIp?: string;
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
      player_slots: dedicated ? [] : fullSlotsFromPartial([hostSlot], parseMaxPlayers(opts.maxPlayers)),
      created_at: t,
      updated_at: t,
      room_phase: 'lobby',
      settlement_mode: opts.settlementMode ?? 'accuracy_bonus',
      buy_in: opts.buyIn ?? null,
      room_kind: opts.roomKind ?? 'private',
      max_players: parseMaxPlayers(opts.maxPlayers),
    };
    this.rooms.set(id, room);
    this.codeToId.set(code, id);
    const ip = (opts.createdByIp ?? '').trim();
    if (ip) this.createdByIp.set(id, ip);
    this.touch();
    return room;
  }

  recoverJoin(code: string, userId: string): { room: GameRoomRow; mySlotIndex: number } | null {
    const room = this.getByCode(code);
    if (!room || room.status === 'finished') return null;
    const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
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
    this.touch();
    return { room, mySlotIndex: slots[reclaimIdx].slotIndex };
  }

  /** Первый слот в пределах комнаты без живого игрока (ИИ-слоты с userId=null не считаются занятыми). */
  private firstVacantSlotIndex(slots: PlayerSlot[], maxPlayers: 3 | 4): number {
    for (let i = 0; i < maxPlayers; i++) {
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

    const maxPlayers = roomPlayerCount(room);
    const slots = fullSlotsFromPartial(room.player_slots ?? [], maxPlayers);
    const humans = slots.filter((s) => s.userId != null && s.userId !== '');
    if (humans.length >= maxPlayers) return { error: 'Все места заняты людьми' };

    /** Комната с панели ПК (host_dedicated): первый живой игрок — ведущий (слот 0), не «Сервер» на ПК. */
    if (room.host_dedicated && humans.length === 0) {
      room.host_user_id = opts.userId;
    }

    const slotIndex = this.firstVacantSlotIndex(slots, maxPlayers);
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
    room.player_slots = fullSlotsFromPartial(slots, maxPlayers);
    room.updated_at = nowIso();
    this.touch();
    return { room, mySlotIndex: slotIndex };
  }

  leaveRoom(roomId: string, userId: string): { error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return {};

    if (room.status === 'playing') {
      const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
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
      this.touch();
      return {};
    }

    const slots = normalizeSlots(room.player_slots ?? [], roomPlayerCount(room));
    const filtered = slots.filter((s) => s.userId !== userId);
    if (filtered.length === slots.length) {
      return { error: 'Слот не найден' };
    }
    if (filtered.length === 0) {
      this.deleteRoom(room);
      this.touch();
      return {};
    }
    room.player_slots = filtered;
    if (room.host_user_id === userId) {
      room.host_user_id = filtered.find((s) => s.userId)?.userId ?? null;
    }
    room.updated_at = nowIso();
    this.touch();
    return {};
  }

  /**
   * Обновить слоты.
   * Хост — полная замена (нормализованная).
   * Обычный игрок — только свои displayName / shortLabel / avatarDataUrl.
   */
  updatePlayerSlots(
    roomId: string,
    playerSlots: PlayerSlot[],
    actorUserId?: string | null,
  ): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };

    const maxPlayers = roomPlayerCount(room);
    const incoming = fullSlotsFromPartial(normalizeSlots(playerSlots, maxPlayers), maxPlayers);
    const current = fullSlotsFromPartial(room.player_slots ?? [], maxPlayers);
    const actor = (actorUserId ?? '').trim();
    const isHost = !!actor && room.host_user_id === actor;

    if (!actor) {
      return { error: 'player_required' };
    }

    if (isHost) {
      /** Не затирать чужие аватарки, если в snapshot хоста их нет / они не прошли cap. */
      const merged = incoming.map((s) => {
        const prev = current.find((c) => c.slotIndex === s.slotIndex);
        if (s.avatarDataUrl === null) return { ...s, avatarDataUrl: null };
        if (s.avatarDataUrl === undefined) {
          return { ...s, avatarDataUrl: prev?.avatarDataUrl ?? null };
        }
        return {
          ...s,
          avatarDataUrl: capAvatar(s.avatarDataUrl) ?? prev?.avatarDataUrl ?? null,
        };
      });
      room.player_slots = fullSlotsFromPartial(merged, maxPlayers);
    } else {
      const mineIdx = current.findIndex((s) => s.userId === actor);
      if (mineIdx < 0) return { error: 'Слот не найден' };
      const fromClient = incoming.find((s) => s.userId === actor) ?? incoming[mineIdx];
      if (!fromClient) return { error: 'Слот не найден' };
      const next = current.map((s, i) => {
        if (i !== mineIdx) return s;
        return {
          ...s,
          displayName: String(fromClient.displayName ?? s.displayName).slice(0, 17),
          ...(fromClient.shortLabel != null
            ? { shortLabel: String(fromClient.shortLabel).slice(0, 12) }
            : {}),
          avatarDataUrl:
            fromClient.avatarDataUrl === null
              ? null
              : capAvatar(fromClient.avatarDataUrl) ?? s.avatarDataUrl ?? null,
        };
      });
      room.player_slots = fullSlotsFromPartial(next, maxPlayers);
    }

    /** Имена/аватары в лобби не должны сдвигать game_state_revision — иначе ходы и вторая раздача ловят conflict. */
    room.updated_at = nowIso();
    this.touch();
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
    const phase =
      gameState && typeof gameState === 'object'
        ? (gameState as { phase?: string }).phase
        : undefined;
    if (roomPhase === 'finished' || phase === 'game-complete') {
      room.status = 'finished';
      room.room_phase = 'finished';
    } else {
      room.status = 'playing';
      if (roomPhase) room.room_phase = roomPhase;
    }
    if (playerSlots) room.player_slots = fullSlotsFromPartial(playerSlots, roomPlayerCount(room));
    room.game_state_revision = rev + 1;
    room.updated_at = nowIso();
    this.touch();
    return { room };
  }

  takePauseV2(roomId: string, userId: string): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
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
    this.touch();
    return room;
  }

  returnFromPauseV2(roomId: string, userId: string): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    const recovered = this.recoverJoin(room.code, userId);
    if (!recovered) return { error: 'Слот не найден' };
    return recovered.room;
  }

  hostReturnSlotV2(roomId: string, hostId: string, seat: number): GameRoomRow | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Комната не найдена' };
    if (room.host_user_id !== hostId) return { error: 'not_host' };
    const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
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
    this.touch();
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
    const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
    if (!slots.some((s) => s.userId === newHostUserId)) {
      return { error: 'Игрок не в комнате' };
    }
    room.host_user_id = newHostUserId;
    room.updated_at = nowIso();
    this.touch();
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
      const slots = fullSlotsFromPartial(room.player_slots ?? [], roomPlayerCount(room));
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
    this.touch();
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
    if (playerSlots) room.player_slots = fullSlotsFromPartial(playerSlots, roomPlayerCount(room));
    if (opts?.roomPhase) room.room_phase = opts.roomPhase;
    room.game_state_revision = rev + 1;
    room.updated_at = nowIso();
    this.touch();
    return { room };
  }

  peekByCode(code: string): {
    ok: boolean;
    code?: string;
    status?: string;
    settlement_mode?: string;
    buy_in?: number | null;
    room_kind?: string;
    max_players?: 3 | 4;
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
      max_players: roomPlayerCount(room),
      human_count: humans,
    };
  }
}
