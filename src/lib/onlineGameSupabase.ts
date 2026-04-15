/**
 * Онлайн-игра через Supabase (временный вариант).
 * Таблица game_rooms, Realtime для подписки на изменения.
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameState } from '../game/GameEngine';
import { getTakenFromDealPoints } from '../game/scoring';

export interface PlayerSlot {
  /** Отсутствует или null = слот ИИ */
  userId?: string | null;
  /** Идентификатор устройства — используем для устойчивой идентификации слота на одном и том же девайсе */
  deviceId?: string | null;
  displayName: string;
  slotIndex: number;
  /** Data URL аватарки игрока (синхронизируется при входе и смене фото) */
  avatarDataUrl?: string | null;
  /** Короткая метка (например часть email), чтобы различать игроков с одинаковым именем */
  shortLabel?: string | null;
  /** Если слот заменён на ИИ вручную через «Взять паузу» — id пользователя, который может вернуться */
  replacedUserId?: string | null;
  /** Имя игрока, ушедшего на ручную паузу (для возврата в слот) */
  replacedDisplayName?: string | null;
  /** Слот переведён в ИИ именно вручную через «Взять паузу». */
  pausedByUser?: boolean | null;
  /** Время возврата слота игроку (ISO). */
  reclaimed_at?: string | null;
}

export interface GameRoomRow {
  id: string;
  code: string;
  host_user_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  game_state: GameState | null;
  /** С сервера (триггер): растёт только при изменении game_state, не при правках только слотов. */
  game_state_revision?: number;
  player_slots: PlayerSlot[];
  created_at: string;
  updated_at: string;
}

const TABLE = 'game_rooms';
const PRESENCE_TABLE = 'game_room_presence';
const CHAT_TABLE = 'game_room_chat_messages';
const CODE_LENGTH = 6;
const DISCONNECT_THRESHOLD_MS = 60_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Огромный data URL аватара раздувает INSERT/UPDATE и на мобильной сети даёт таймауты. */
function capAvatarDataUrl(url: string | null | undefined, maxLen = 24_000): string | null | undefined {
  if (url == null || url === '') return url;
  return url.length <= maxLen ? url : undefined;
}

function generateCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

function joinBackoffMs(attempt: number): number {
  return Math.min(400, 40 + attempt * 22 + Math.floor(Math.random() * 50));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Короткая пауза между повторами: длинные ретраи при плохой сети только удлиняют создание комнаты и ходы. */
function roomRetryDelayMs(attempt: number): number {
  return Math.min(650, 40 + attempt * 120 + Math.floor(Math.random() * 90));
}

function isRetryableNetworkMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('load failed') ||
    m.includes('networkerror') ||
    m.includes('err_connection_reset') ||
    m.includes('connection reset') ||
    m.includes('econnreset') ||
    (m.includes('network') && m.includes('error')) ||
    m.includes('fetch') && m.includes('fail') ||
    m.includes('timeout') ||
    m.includes('aborted') ||
    m.includes('bad gateway') ||
    m.includes('service unavailable')
  );
}

function isRetryableReadFailure(
  error: { message?: string; code?: string; details?: string } | null,
  hasData: boolean
): boolean {
  if (hasData) return false;
  if (!error) return true;
  const c = error.code ?? '';
  if (c === 'PGRST116') return false;
  if (c === '42501' || c === 'PGRST301') return false;
  return isRetryableNetworkMessage(error.message ?? '') || isRetryableNetworkMessage(String(error.details ?? ''));
}

function isRetryableWriteFailure(error: { message?: string; code?: string; details?: string } | null): boolean {
  if (!error) return true;
  const c = error.code ?? '';
  if (c === '42501' || c === 'PGRST301' || c === '23505' || c === 'PGRST116') return false;
  return isRetryableNetworkMessage(error.message ?? '') || isRetryableNetworkMessage(String(error.details ?? ''));
}

/** Чтение: короткие повторы. Запись: при 52 с на попытку три ретрая = минуты ожидания — достаточно двух. */
const ROOM_READ_MAX_ATTEMPTS = 3;
const ROOM_WRITE_MAX_ATTEMPTS = 2;

const JOIN_WALL_CLOCK_MS = 48_000;

/** Первая запись game_state (крупный JSON) на мобильной сети; вторая попытка короче. */
const GAME_MUTATION_FIRST_MS = 55_000;
const GAME_MUTATION_RETRY_MS = 18_000;
function gameMutationAbort(attempt: number): AbortSignal {
  const ms = attempt === 0 ? GAME_MUTATION_FIRST_MS : GAME_MUTATION_RETRY_MS;
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function') {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function isAbortLike(err: { message?: string; name?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('abort') || m.includes('signal') || m.includes('timeout');
}

/** Тяжёлые read после мутаций (getRoom) — оставляем запас. */
const LOBBY_REST_TIMEOUT_MS = 20_000;
/** Создание комнаты, join, быстрые get по id: не держать 20 с на запрос — на телефоне это «минута до лобби». */
const LOBBY_FAST_TIMEOUT_MS = 8_000;
/** RPC updown_join_waiting_room: короткий предел — при подвисании быстрее REST-цикл join (без минут ожидания). */
const LOBBY_JOIN_RPC_TIMEOUT_MS = 9_000;
function lobbyRestAbortSignal(): AbortSignal {
  if (
    typeof AbortSignal !== 'undefined' &&
    typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function'
  ) {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(LOBBY_REST_TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), LOBBY_REST_TIMEOUT_MS);
  return c.signal;
}
function lobbyJoinRpcAbortSignal(): AbortSignal {
  if (
    typeof AbortSignal !== 'undefined' &&
    typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function'
  ) {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(LOBBY_JOIN_RPC_TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), LOBBY_JOIN_RPC_TIMEOUT_MS);
  return c.signal;
}

function lobbyFastAbortSignal(): AbortSignal {
  if (
    typeof AbortSignal !== 'undefined' &&
    typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function'
  ) {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(LOBBY_FAST_TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), LOBBY_FAST_TIMEOUT_MS);
  return c.signal;
}

/** getRoom по id для лобби/join: короткий таймаут, без тройных 20 с ретраев. */
async function getRoomForLobby(roomId: string): Promise<GameRoomRow | null> {
  if (!supabase) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', roomId)
        .abortSignal(lobbyFastAbortSignal())
        .single();
      if (data && !error) return data as GameRoomRow;
      if (error?.code === 'PGRST116') return null;
      if (attempt === 0 && (isAbortLike(error) || isRetryableReadFailure(error, !!data))) {
        await sleep(120);
        continue;
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && (isRetryableNetworkMessage(msg) || isAbortLike(e as { message?: string; name?: string }))) {
        await sleep(120);
        continue;
      }
      return null;
    }
  }
  return null;
}

/** После успешного RPC слот уже в БД; один облом getRoom не должен уводить в долгий цикл. */
async function getRoomWithJoinRetries(roomId: string): Promise<GameRoomRow | null> {
  for (let i = 0; i < 12; i++) {
    const room = await getRoomForLobby(roomId);
    if (room) return room;
    await sleep(50 + i * 30);
  }
  return null;
}

/** Опрос во время игры: короткий таймаут, чтобы один подвисший GET не держал roomPollInFlight 20+ с и не откладывал все следующие тики. */
const SYNC_POLL_GET_TIMEOUT_MS = 5_000;
function syncPollRestAbortSignal(): AbortSignal {
  if (
    typeof AbortSignal !== 'undefined' &&
    typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function'
  ) {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(SYNC_POLL_GET_TIMEOUT_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), SYNC_POLL_GET_TIMEOUT_MS);
  return c.signal;
}

/** Создать комнату. Возвращает roomId и code или ошибку. */
export async function createRoom(
  hostUserId: string,
  hostDisplayName: string,
  hostShortLabel?: string,
  hostAvatarDataUrl?: string | null
): Promise<{ room: GameRoomRow } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };

  const avatar = capAvatarDataUrl(hostAvatarDataUrl ?? undefined);

  let lastMessage = 'Не удалось создать комнату';
  for (let round = 0; round < 3; round++) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const playerSlots: PlayerSlot[] = [
        {
          userId: hostUserId,
          displayName: hostDisplayName.slice(0, 17),
          slotIndex: 0,
          ...(hostShortLabel != null && hostShortLabel !== ''
            ? { shortLabel: hostShortLabel.slice(0, 12) }
            : {}),
          ...(avatar != null && avatar !== '' ? { avatarDataUrl: avatar } : {}),
        },
      ];

      // Без отдельного abortSignal на чтение: глобальный fetch в supabase.ts ограничивает висящие запросы.
      const { data, error } = await supabase
        .from(TABLE)
        .insert({
          code,
          host_user_id: hostUserId,
          status: 'waiting',
          game_state: null,
          player_slots: playerSlots,
        })
        .select('*')
        .abortSignal(lobbyFastAbortSignal())
        .single();

      if (error) {
        if ((error as { code?: string }).code === '23505') continue;
        if (isAbortLike(error)) {
          await sleep(joinBackoffMs(attempt));
          continue;
        }
        lastMessage = error.message;
        break;
      }
      if (data) return { room: data as GameRoomRow };
    }
    if (round < 2) await sleep(150 + round * 100);
  }

  return { error: lastMessage };
}

/**
 * Ответ join мог не дойти (обрыв/VPN/провайдер), а слот на сервере уже занят — без повторного INSERT.
 * Также вызывается из лобби после таймаута «Вход…».
 */
export async function recoverJoinByCode(
  code: string,
  userId: string
): Promise<{ roomId: string; mySlotIndex: number; room: GameRoomRow } | null> {
  if (!supabase) return null;
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('code', normalizedCode)
      .abortSignal(lobbyFastAbortSignal())
      .maybeSingle();
    if (error || !data) return null;
    const row = data as GameRoomRow;
    if (row.status === 'finished') return null;
    const slots = (row.player_slots as PlayerSlot[]) || [];
    const me = slots.find((s) => s.userId != null && s.userId === userId);
    if (!me) return null;
    return { roomId: row.id, mySlotIndex: me.slotIndex, room: row };
  } catch {
    return null;
  }
}

/** Найти комнату по коду и присоединиться через SQL-функцию (атомарно). */
export async function joinRoom(
  code: string,
  userId: string,
  displayName: string,
  shortLabel?: string,
  avatarDataUrl?: string | null
): Promise<{ roomId: string; mySlotIndex: number; room: GameRoomRow } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };

  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { error: 'Введите код комнаты' };

  const av = capAvatarDataUrl(avatarDataUrl ?? undefined);

  const already = await recoverJoinByCode(normalizedCode, userId);
  if (already) return already;

  /** Атомарный вход в waiting (RPC + миграция с полем room в JSON — без лишнего getRoom). */
  const { data: rpcRaw, error: rpcError } = await supabase
    .rpc('updown_join_waiting_room', {
      p_code: normalizedCode,
      p_user_id: userId,
      p_display_name: displayName,
      p_short_label: shortLabel ?? null,
      p_avatar_data_url: av ?? null,
    })
    .abortSignal(lobbyJoinRpcAbortSignal());
  if (!rpcError && rpcRaw && typeof rpcRaw === 'object') {
    const payload = rpcRaw as {
      ok?: boolean;
      error?: string;
      room_id?: string;
      my_slot_index?: number;
      room?: GameRoomRow;
    };
    if (payload.ok === true && typeof payload.room_id === 'string') {
      const idx = typeof payload.my_slot_index === 'number' ? payload.my_slot_index : 0;
      if (payload.room && typeof payload.room === 'object' && 'id' in payload.room) {
        return { roomId: payload.room.id, mySlotIndex: idx, room: payload.room as GameRoomRow };
      }
      const room = await getRoomWithJoinRetries(payload.room_id);
      if (room) {
        return { roomId: room.id, mySlotIndex: idx, room };
      }
    }
    if (payload.ok === false) {
      if (payload.error === 'not_found') return { error: 'Комната не найдена' };
      if (payload.error === 'room_full') return { error: 'Комната заполнена' };
      /* not_waiting — ниже обычный цикл (playing / reclaim и т.д.) */
    }
  }

  const MAX_ATTEMPTS = 24;
  const joinStarted = Date.now();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() - joinStarted > JOIN_WALL_CLOCK_MS) {
      return {
        error:
          'Время ожидания входа истекло. Проверьте интернет и нажмите «Присоединиться» ещё раз.',
      };
    }

    const { data: fullRow, error: fetchError } = await supabase
      .from(TABLE)
      .select('*')
      .eq('code', normalizedCode)
      .abortSignal(lobbyFastAbortSignal())
      .single();

    if (fetchError) {
      if (isAbortLike(fetchError)) {
        await sleep(joinBackoffMs(attempt));
        continue;
      }
      if ((fetchError as { code?: string }).code === 'PGRST116') return { error: 'Комната не найдена' };
      return { error: fetchError.message };
    }
    if (!fullRow) return { error: 'Комната не найдена' };
    const row = fullRow as GameRoomRow;
    const slots = (row.player_slots as PlayerSlot[]) || [];
    const stamp = row.updated_at;

    if (row.status === 'finished') {
      return { error: 'Комната уже завершена' };
    }

    // Игра уже идёт: возврат с ручной паузы, повторный вход тем же аккаунтом или место ИИ (свободный слот)
    if (row.status === 'playing') {
      const reclaimSlot = slots.find((s) => s.replacedUserId === userId);
      if (reclaimSlot != null) {
        const newSlots = slots.map((s) =>
          s.slotIndex === reclaimSlot.slotIndex
            ? {
                ...s,
                userId,
                displayName: displayName.slice(0, 17),
                slotIndex: s.slotIndex,
                replacedUserId: undefined,
                replacedDisplayName: undefined,
                pausedByUser: undefined,
                ...(shortLabel != null && shortLabel !== '' ? { shortLabel: shortLabel.slice(0, 12) } : {}),
                ...(av != null && av !== '' ? { avatarDataUrl: av } : {}),
              }
            : s
        );
        const { data: updated, error: updateError } = await supabase
          .from(TABLE)
          .update({ player_slots: newSlots })
          .eq('id', row.id)
          .eq('updated_at', stamp)
          .select('*')
          .abortSignal(lobbyFastAbortSignal())
          .maybeSingle();
        if (updateError || !updated) {
          await sleep(joinBackoffMs(attempt));
          continue;
        }
        return { roomId: row.id, mySlotIndex: reclaimSlot.slotIndex, room: updated as GameRoomRow };
      }

      const already = slots.find((s) => s.userId != null && s.userId === userId);
      if (already) {
        return { roomId: row.id, mySlotIndex: already.slotIndex, room: row };
      }

      const free = slots.find((s) => s.userId == null && (s.replacedUserId == null || s.replacedUserId === undefined));
      if (!free) {
        return {
          error:
            'Игра уже идёт и все четыре места заняты. Дождитесь окончания раздачи или создайте новую комнату.',
        };
      }

      const newSlots = slots.map((s) =>
        s.slotIndex === free.slotIndex
          ? {
              ...s,
              userId,
              displayName: displayName.slice(0, 17),
              slotIndex: s.slotIndex,
              replacedUserId: undefined,
              replacedDisplayName: undefined,
              pausedByUser: undefined,
              ...(shortLabel != null && shortLabel !== '' ? { shortLabel: shortLabel.slice(0, 12) } : {}),
              ...(av != null && av !== '' ? { avatarDataUrl: av } : {}),
            }
          : s
      );
      const { data: updated, error: updateError } = await supabase
        .from(TABLE)
        .update({ player_slots: newSlots })
        .eq('id', row.id)
        .eq('updated_at', stamp)
        .select('*')
        .abortSignal(lobbyRestAbortSignal())
        .maybeSingle();
      if (updateError || !updated) {
        await sleep(joinBackoffMs(attempt));
        continue;
      }
      return { roomId: row.id, mySlotIndex: free.slotIndex, room: updated as GameRoomRow };
    }

    // Лобби (waiting): идемпотентный вход + оптимистичная блокировка по updated_at (не теряем игроков при одновременном join)
    const alreadyWaiting = slots.find((s) => s.userId != null && s.userId === userId);
    if (alreadyWaiting) {
      return { roomId: row.id, mySlotIndex: alreadyWaiting.slotIndex, room: row };
    }
    if (slots.length >= 4) return { error: 'Комната заполнена' };

    const mySlotIndex = slots.length;
    const newSlots: PlayerSlot[] = [
      ...slots,
      {
        userId,
        displayName: displayName.slice(0, 17),
        slotIndex: mySlotIndex,
        ...(shortLabel != null && shortLabel !== '' ? { shortLabel: shortLabel.slice(0, 12) } : {}),
        ...(av != null && av !== '' ? { avatarDataUrl: av } : {}),
      },
    ];

    const { data: updated, error: updateError } = await supabase
      .from(TABLE)
      .update({ player_slots: newSlots })
      .eq('id', row.id)
      .eq('updated_at', stamp)
      .select('*')
      .abortSignal(lobbyFastAbortSignal())
      .maybeSingle();

    if (updateError || !updated) {
      await sleep(joinBackoffMs(attempt));
      continue;
    }
    const finalSlots = (updated.player_slots as PlayerSlot[]) || [];
    const me = finalSlots.find((s) => s.userId === userId);
    const idx = me?.slotIndex ?? mySlotIndex;
    return { roomId: row.id, mySlotIndex: idx, room: updated as GameRoomRow };
  }

  return {
    error:
      'Не удалось войти из‑за одновременных запросов. Нажмите «Присоединиться» ещё раз.',
  };
}

/** Получить текущее состояние комнаты (с повторами при обрыве TLS/сети — иначе опрос и ИИ-хост «зависают» без game_state). */
export async function getRoom(roomId: string): Promise<GameRoomRow | null> {
  if (!supabase) return null;
  for (let attempt = 0; attempt < ROOM_READ_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', roomId)
        .abortSignal(lobbyRestAbortSignal())
        .single();
      if (data && !error) return data as GameRoomRow;
      if (error?.code === 'PGRST116') return null;
      if (!isRetryableReadFailure(error, !!data) || attempt === ROOM_READ_MAX_ATTEMPTS - 1) return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!isRetryableNetworkMessage(msg) || attempt === ROOM_READ_MAX_ATTEMPTS - 1) return null;
    }
    await sleep(roomRetryDelayMs(attempt));
  }
  return null;
}

/**
 * Лёгкое чтение для интервального опроса в игре: не цепляет длинные ретраи getRoom — следующий тик придёт через ~1.5 с.
 */
export async function getRoomForSyncPoll(roomId: string): Promise<GameRoomRow | null> {
  if (!supabase) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', roomId)
        .abortSignal(syncPollRestAbortSignal())
        .single();
      if (data && !error) return data as GameRoomRow;
      if (error?.code === 'PGRST116') return null;
      if (attempt === 0 && (isAbortLike(error) || isRetryableReadFailure(error, !!data))) {
        await sleep(200);
        continue;
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 0 && isRetryableNetworkMessage(msg)) {
        await sleep(200);
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Обновить только слоты в комнате (для синхронизации имён в лобби). Не трогает game_state и status. */
export async function updateRoomPlayerSlots(roomId: string, playerSlots: PlayerSlot[]): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const { error } = await supabase
    .from(TABLE)
    .update({ player_slots: playerSlots })
    .eq('id', roomId)
    .abortSignal(lobbyFastAbortSignal());
  return error ? { error: error.message } : {};
}

export type UpdateRoomStateOptions = {
  /**
   * Ожидаемая ревизия game_state на сервере до этого UPDATE (колонка game_state_revision).
   * Если за это время другой клиент уже записал состояние — строка не обновится → conflict.
   */
  expectedRevision?: number;
};

/** Обновить состояние игры в комнате. Возвращает актуальную строку — чтобы сразу выровнять updated_at и не затирать ходы устаревшим Realtime. */
export async function updateRoomState(
  roomId: string,
  gameState: GameState,
  playerSlots?: PlayerSlot[],
  opts?: UpdateRoomStateOptions
): Promise<{ error?: string; room?: GameRoomRow; conflict?: boolean }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const payload: Record<string, unknown> = { game_state: gameState, status: 'playing' };
  if (playerSlots) payload.player_slots = playerSlots;
  /**
   * По умолчанию ВЫКЛ: без миграции game_state_revision UPDATE с .eq(revision) падает или даёт вечные конфликты.
   * Включить после применения supabase/migrations/20250401120000_game_rooms_state_revision.sql:
   * VITE_ONLINE_REVISION_LOCK=true
   */
  const revLockEnv = import.meta.env.VITE_ONLINE_REVISION_LOCK as string | undefined;
  const revisionLockEnabled =
    typeof revLockEnv === 'string' && ['1', 'true', 'on', 'yes'].includes(revLockEnv.trim().toLowerCase());
  const useRevLock =
    revisionLockEnabled &&
    opts?.expectedRevision !== undefined &&
    opts.expectedRevision >= 0 &&
    Number.isFinite(opts.expectedRevision);
  let lastMessage = 'Не удалось сохранить состояние. Проверьте связь.';
  for (let attempt = 0; attempt < ROOM_WRITE_MAX_ATTEMPTS; attempt++) {
    try {
      let q = supabase.from(TABLE).update(payload).eq('id', roomId);
      if (useRevLock) {
        q = q.eq('game_state_revision', opts!.expectedRevision!);
      }
      const { data, error } = await q.select('*').abortSignal(gameMutationAbort(attempt));
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0 && !error) {
        return { room: rows[0] as GameRoomRow };
      }
      /* 0 строк при блокировке по revision = другой клиент успел записать раньше */
      if (useRevLock && !error && rows.length === 0) {
        const r = await getRoom(roomId);
        return { conflict: true, room: r ?? undefined };
      }
      /* PostgREST иногда не возвращает строку при update+select (RLS/представление) — подтягиваем явно. */
      if (!error && rows.length === 0) {
        const r = await getRoom(roomId);
        if (r?.status === 'playing' && r.game_state != null) return { room: r };
      }
      if (error) {
        lastMessage = error.message || lastMessage;
        if (!isRetryableWriteFailure(error)) return { error: lastMessage };
        if (attempt === ROOM_WRITE_MAX_ATTEMPTS - 1) return { error: lastMessage };
      } else if (attempt === ROOM_WRITE_MAX_ATTEMPTS - 1) {
        return { error: lastMessage };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastMessage = isRetryableNetworkMessage(msg)
        ? 'Нет связи с сервером (обрыв соединения). Повторите или проверьте сеть.'
        : msg;
      if (!isRetryableNetworkMessage(msg) || attempt === ROOM_WRITE_MAX_ATTEMPTS - 1) {
        return { error: lastMessage };
      }
    }
    await sleep(roomRetryDelayMs(attempt));
  }
  return { error: lastMessage };
}

export interface MatchPlayerInsert {
  match_id: string;
  slot_index: number;
  user_id: string | null;
  display_name: string;
  is_ai: boolean;
  final_score: number;
  bid_accuracy: number | null;
  interrupted: boolean;
  is_rated: boolean;
  replaced_user_id: string | null;
  place: number | null;
}

export async function finishMatch(
  roomId: string,
  code: string,
  snapshot: GameState,
  playerSlots: PlayerSlot[]
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const players = snapshot.players;
  const dealsCount = snapshot.dealNumber;
  const bh = snapshot.dealHistory ?? [];
  const calcAcc = (pi: number) => {
    if (!bh.length) return null;
    let met = 0;
    for (const d of bh) {
      const bid = d.bids[pi];
      const pts = d.points[pi];
      if (bid == null) continue;
      const taken = Math.max(0, Math.round((pts + Math.abs(pts)) / 20));
      if (bid === taken) met++;
    }
    return Math.round((met / bh.length) * 100);
  };
  const order = players.map((p, i) => ({ i, s: p.score })).sort((a, b) => b.s - a.s);
  const placeByIndex: Record<number, number> = {};
  let prevScore: number | null = null;
  let prevPlace = 0;
  order.forEach((row, idx) => {
    const score = row.s;
    const place = prevScore === null ? 1 : (score === prevScore ? prevPlace : idx + 1);
    placeByIndex[row.i] = place;
    prevScore = score;
    prevPlace = place;
  });
  const payload = players.map((p, i) => {
    const slot = playerSlots.find(s => s.slotIndex === i) as PlayerSlot | undefined;
    const userId = slot?.userId ?? null;
    const isAi = !userId;
    const interrupted = !!slot?.replacedUserId;
    const isRated = !interrupted;
    const acc = calcAcc(i);
    return {
      slot_index: i,
      user_id: userId,
      display_name: slot?.displayName ?? p.name,
      is_ai: isAi,
      final_score: p.score,
      bid_accuracy: acc,
      interrupted,
      is_rated: isRated,
      replaced_user_id: slot?.replacedUserId ?? null,
      place: placeByIndex[i] ?? null,
    };
  });
  const rpc = await supabase.rpc('finish_game', {
    p_room_id: roomId,
    p_code: code,
    p_deals_count: dealsCount,
    p_players: payload,
  } as any);
  if (rpc.error) return { ok: false, error: rpc.error.message };
  return { ok: true };
}

/** Завершённая офлайн-партия в истории аккаунта (без влияния на рейтинговую сводку — is_rated=false на сервере). */
export async function recordOfflineMatchFinish(
  snapshot: GameState,
  displayName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth.user) return { ok: false, error: 'Не выполнен вход' };

  const players = snapshot.players;
  const order = players.map((p, i) => ({ i, s: p.score })).sort((a, b) => b.s - a.s);
  const placeByIndex: Record<number, number> = {};
  let prevScore: number | null = null;
  let prevPlace = 0;
  order.forEach((row, idx) => {
    const score = row.s;
    const place = prevScore === null ? 1 : (score === prevScore ? prevPlace : idx + 1);
    placeByIndex[row.i] = place;
    prevScore = score;
    prevPlace = place;
  });
  const humanPlace = placeByIndex[0];
  if (humanPlace == null) return { ok: false, error: 'Нет данных места' };

  const bh = snapshot.dealHistory ?? [];
  let bidAccuracy = 0;
  if (bh.length) {
    let met = 0;
    for (const d of bh) {
      const bid = d.bids[0];
      const pts = d.points[0];
      if (bid == null) continue;
      const taken = getTakenFromDealPoints(bid, pts);
      if (bid === taken) met++;
    }
    bidAccuracy = Math.round((met / bh.length) * 100);
  }

  const { error } = await supabase.rpc('record_offline_match', {
    p_deals_count: snapshot.dealNumber,
    p_final_score: players[0]?.score ?? 0,
    p_place: humanPlace,
    p_display_name: displayName.slice(0, 80),
    p_bid_accuracy: bidAccuracy,
  } as Record<string, unknown>);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export interface MatchHistoryItem {
  id: string;
  code: string;
  finished_at: string;
  deals_count: number | null;
  place: number | null;
  final_score: number | null;
  interrupted: boolean;
  is_rated: boolean;
  /** true — запись из record_offline_match; онлайн-матчи после миграции = false */
  is_offline: boolean;
}

function matchHistorySelectWithOffline(): string {
  return 'match_id:match_id, final_score, interrupted, is_rated, place:place, matches:matches!inner(id, code, finished_at, deals_count, is_offline)';
}

function matchHistorySelectWithoutOffline(): string {
  return 'match_id:match_id, final_score, interrupted, is_rated, place:place, matches:matches!inner(id, code, finished_at, deals_count)';
}

function mapMatchHistoryRows(data: unknown[]): MatchHistoryItem[] {
  return (data as any[]).map((row) => ({
    id: row.matches.id as string,
    code: row.matches.code as string,
    finished_at: row.matches.finished_at as string,
    deals_count: row.matches.deals_count ?? null,
    place: (row as any).place ?? null,
    final_score: row.final_score ?? null,
    interrupted: !!row.interrupted,
    is_rated: !!row.is_rated,
    is_offline: !!row.matches?.is_offline,
  }));
}

/** История матчей; без колонки matches.is_offline на БД повторяем запрос без неё (иначе PostgREST падает и список пустой). */
export async function getMyMatchHistory(userId: string, limit = 20): Promise<MatchHistoryItem[]> {
  if (!supabase) return [];
  const run = (select: string) =>
    supabase!
      .from('match_players')
      .select(select)
      .eq('user_id', userId)
      .order('finished_at', { referencedTable: 'matches', ascending: false })
      .limit(limit);

  let { data, error } = await run(matchHistorySelectWithOffline());
  if (error) {
    const msg = (error.message || '').toLowerCase();
    const code = String((error as { code?: string }).code || '');
    const noOfflineCol =
      msg.includes('is_offline') ||
      msg.includes('does not exist') ||
      code === '42703';
    if (noOfflineCol) {
      const second = await run(matchHistorySelectWithoutOffline());
      data = second.data;
      error = second.error;
    }
  }
  if (error || !data) return [];
  return mapMatchHistoryRows(data as unknown[]);
}

export interface RatingSummary {
  games: number;
  ratedGames: number;
  wins: number;
  points: number;
}

export async function getMyRatingSummary(userId: string): Promise<RatingSummary | null> {
  if (!supabase) return null;
  const withOffline = await supabase
    .from('match_players')
    .select('final_score, interrupted, is_rated, place, matches:matches!inner(is_offline)')
    .eq('user_id', userId);
  let rows: any[] | null = withOffline.data as any[] | null;
  let err = withOffline.error;
  if (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('is_offline') || msg.includes('does not exist')) {
      const plain = await supabase
        .from('match_players')
        .select('final_score, interrupted, is_rated, place')
        .eq('user_id', userId);
      rows = plain.data as any[] | null;
      err = plain.error;
    }
  }
  if (err || !rows) return null;
  let games = 0, rated = 0, wins = 0, pts = 0;
  for (const r of rows) {
    if (r.matches?.is_offline) continue;
    games++;
    if (r.is_rated) {
      rated++;
      if (r.place === 1) wins++;
      if (r.place === 1) pts += 20;
      else if (r.place === 2) pts += 5;
    }
  }
  return { games, ratedGames: rated, wins, points: pts };
}

/** Подписаться на изменения строки комнаты. Возвращает функцию отписки. */
export function subscribeToRoom(
  roomId: string,
  onUpdate: (row: GameRoomRow) => void,
  onSubscribeStatus?: (status: string) => void
): () => void {
  const client = supabase;
  if (!client) return () => {};

  const channel = client
    .channel(`room:${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: TABLE, filter: `id=eq.${roomId}` },
      (payload) => {
        const row = payload.new as GameRoomRow;
        if (row) onUpdate(row);
      }
    )
    .subscribe((status) => {
      onSubscribeStatus?.(status);
    });

  return () => {
    client.removeChannel(channel);
  };
}

/** Взять паузу: игрок сам вручную передаёт свой слот ИИ (слот сохраняет replacedUserId для возврата). */
export async function takePauseInRoom(
  roomId: string,
  userId: string,
  displayName: string,
  shortLabel?: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const room = await getRoom(roomId);
  if (!room) return { error: 'Комната не найдена' };
  const slots = (room.player_slots as PlayerSlot[]) || [];
  const idx = slots.findIndex((s) => s.userId === userId);
  if (idx === -1) return { error: 'Вы не в этой комнате' };
  const slot = slots[idx];
  const newSlots = slots.map((s, i) =>
    i === idx
      ? {
          ...s,
          replacedUserId: s.userId,
          replacedDisplayName: s.displayName ?? displayName.slice(0, 17),
          pausedByUser: true,
          userId: null,
          /* Имя не меняем — в UI показываем метку «ИИ» */
          ...(shortLabel != null && shortLabel !== '' ? { shortLabel: undefined } : {}),
        }
      : s
  );
  const { error } = await supabase.from(TABLE).update({ player_slots: newSlots }).eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Вернуть слот игроку после ручной паузы. Только для слотов с replacedUserId. */
export async function returnSlotToPlayer(roomId: string, slotIndex: number): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const room = await getRoom(roomId);
  if (!room) return { error: 'Комната не найдена' };
  const slots = (room.player_slots as PlayerSlot[]) || [];
  const slot = slots[slotIndex];
  if (!slot || slot.replacedUserId == null) return { error: 'Слот не для возврата' };
  const newSlots = slots.map((s, i) =>
    i === slotIndex
      ? {
          ...s,
          userId: s.replacedUserId,
          displayName: s.replacedDisplayName ?? s.displayName,
          replacedUserId: undefined,
          replacedDisplayName: undefined,
          pausedByUser: undefined,
          reclaimed_at: new Date().toISOString(),
        }
      : s
  );
  const { error } = await supabase.from(TABLE).update({ player_slots: newSlots }).eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Выйти из комнаты (удалить себя из player_slots). Если хост вышел — комната остаётся. */
export async function leaveRoom(roomId: string, userId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const room = await getRoom(roomId);
  if (!room) return {};

  const slots = (room.player_slots as PlayerSlot[]) || [];
  const newSlots = slots
    .filter((s) => s.userId != null && s.userId !== userId)
    .map((s, i) => ({ ...s, slotIndex: i }));
  if (newSlots.length === slots.length) return {};

  const { error } = await supabase
    .from(TABLE)
    .update({ player_slots: newSlots })
    .eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Отметить присутствие в комнате (вызывать периодически при игре). */
export async function heartbeatPresence(roomId: string, userId: string): Promise<void> {
  if (!supabase || !roomId || !userId) return;
  const now = new Date().toISOString();
  await supabase.from(PRESENCE_TABLE).upsert(
    { room_id: roomId, user_id: userId, last_seen: now },
    { onConflict: 'room_id,user_id' }
  );
}

/** Получить последнее время присутствия по комнате: userId -> last_seen (ISO строка). */
export async function getPresence(roomId: string): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from(PRESENCE_TABLE)
    .select('user_id, last_seen')
    .eq('room_id', roomId);
  if (error) return {};
  const out: Record<string, string> = {};
  for (const row of (data as any[]) || []) {
    const uid = (row as { user_id: string; last_seen: string }).user_id;
    const seen = (row as { user_id: string; last_seen: string }).last_seen;
    if (uid && seen) out[uid] = seen;
  }
  return out;
}

export interface RoomChatMessageRow {
  id: string;
  room_id: string;
  user_id: string;
  display_name: string;
  body: string;
  created_at: string;
}

/** История чата комнаты (последние сообщения, по возрастанию времени). */
export async function fetchRoomChatMessages(roomId: string, limit = 100): Promise<RoomChatMessageRow[]> {
  if (!supabase || !roomId) return [];
  const { data, error } = await supabase
    .from(CHAT_TABLE)
    .select('id, room_id, user_id, display_name, body, created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error || !data) return [];
  return data as RoomChatMessageRow[];
}

/** Отправить сообщение в чат комнаты (RLS: только участник слота). */
export async function sendRoomChatMessage(
  roomId: string,
  userId: string,
  displayName: string,
  body: string
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const trimmed = body.trim();
  if (!trimmed) return { error: 'Пустое сообщение' };
  if (trimmed.length > 500) return { error: 'Не более 500 символов' };
  const { error } = await supabase.from(CHAT_TABLE).insert({
    room_id: roomId,
    user_id: userId,
    display_name: displayName.trim().slice(0, 40) || 'Игрок',
    body: trimmed,
  });
  return error ? { error: error.message } : {};
}

/** Подписка на новые сообщения чата (INSERT). */
export function subscribeRoomChat(
  roomId: string,
  onInsert: (row: RoomChatMessageRow) => void,
  onSubscribeStatus?: (status: string) => void
): () => void {
  const client = supabase;
  if (!client || !roomId) return () => {};

  const channel = client
    .channel(`room-chat:${roomId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: CHAT_TABLE, filter: `room_id=eq.${roomId}` },
      (payload) => {
        const row = payload.new as RoomChatMessageRow;
        if (row?.id) onInsert(row);
      }
    )
    .subscribe((status) => onSubscribeStatus?.(status));

  return () => {
    client.removeChannel(channel);
  };
}

export const DISCONNECT_THRESHOLD_MS_EXPORT = DISCONNECT_THRESHOLD_MS;
