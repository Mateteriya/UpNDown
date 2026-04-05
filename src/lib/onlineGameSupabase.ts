/**
 * Онлайн-игра через Supabase (временный вариант).
 * Таблица game_rooms, Realtime для подписки на изменения.
 */

import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameState } from '../game/GameEngine';

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

/** Без AbortSignal.timeout (старые WebView / Safari) — иначе create/join падают ещё до fetch. */
const LOBBY_REQUEST_MS = 15_000;
const JOIN_WALL_CLOCK_MS = 60_000;

function lobbyAbort(): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as unknown as { timeout?: (ms: number) => AbortSignal }).timeout === 'function') {
    return (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout(LOBBY_REQUEST_MS);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), LOBBY_REQUEST_MS);
  return c.signal;
}

/** Первая запись game_state (руки) — мобильная сеть; вторая попытка только при сбое — короткая, иначе 52×2 с ≈ две минуты «Запуск…». */
const GAME_MUTATION_FIRST_MS = 38_000;
const GAME_MUTATION_RETRY_MS = 14_000;
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

      // INSERT один на запрос — не обрезаем 14 с: на слабой сети иначе «не создаётся комната»;
      // глобальный fetch в supabase.ts (~55 с) всё равно ограничивает висящие запросы.
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
        .single();

      if (error) {
        if ((error as { code?: string }).code === '23505') continue;
        lastMessage = error.message;
        break;
      }
      if (data) return { room: data as GameRoomRow };
    }
    if (round < 2) await sleep(150 + round * 100);
  }

  return { error: lastMessage };
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
      .abortSignal(lobbyAbort())
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
          .abortSignal(lobbyAbort())
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
        .abortSignal(lobbyAbort())
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
      .abortSignal(lobbyAbort())
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
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', roomId).single();
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

/** Обновить только слоты в комнате (для синхронизации имён в лобби). Не трогает game_state и status. */
export async function updateRoomPlayerSlots(roomId: string, playerSlots: PlayerSlot[]): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const { error } = await supabase.from(TABLE).update({ player_slots: playerSlots }).eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Обновить состояние игры в комнате. Возвращает актуальную строку — чтобы сразу выровнять updated_at и не затирать ходы устаревшим Realtime. */
export async function updateRoomState(
  roomId: string,
  gameState: GameState,
  playerSlots?: PlayerSlot[]
): Promise<{ error?: string; room?: GameRoomRow }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const payload: Record<string, unknown> = { game_state: gameState, status: 'playing' };
  if (playerSlots) payload.player_slots = playerSlots;
  let lastMessage = 'Не удалось сохранить состояние. Проверьте связь.';
  for (let attempt = 0; attempt < ROOM_WRITE_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await supabase
        .from(TABLE)
        .update(payload)
        .eq('id', roomId)
        .select('*')
        .abortSignal(gameMutationAbort(attempt))
        .single();
      if (data && !error) return { room: data as GameRoomRow };
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

export interface MatchHistoryItem {
  id: string;
  code: string;
  finished_at: string;
  deals_count: number | null;
  place: number | null;
  final_score: number | null;
  interrupted: boolean;
  is_rated: boolean;
}

export async function getMyMatchHistory(userId: string, limit = 20): Promise<MatchHistoryItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('match_players')
    .select('match_id:match_id, final_score, interrupted, is_rated, place:place, matches:matches!inner(id, code, finished_at, deals_count)')
    .eq('user_id', userId)
    .order('finished_at', { referencedTable: 'matches', ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as any[]).map(row => ({
    id: row.matches.id as string,
    code: row.matches.code as string,
    finished_at: row.matches.finished_at as string,
    deals_count: row.matches.deals_count ?? null,
    place: (row as any).place ?? null,
    final_score: row.final_score ?? null,
    interrupted: !!row.interrupted,
    is_rated: !!row.is_rated,
  }));
}

export interface RatingSummary {
  games: number;
  ratedGames: number;
  wins: number;
  points: number;
}

export async function getMyRatingSummary(userId: string): Promise<RatingSummary | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('match_players')
    .select('final_score, interrupted, is_rated, place')
    .eq('user_id', userId);
  if (error || !data) return null;
  let games = 0, rated = 0, wins = 0, pts = 0;
  for (const r of data as any[]) {
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

export const DISCONNECT_THRESHOLD_MS_EXPORT = DISCONNECT_THRESHOLD_MS;
