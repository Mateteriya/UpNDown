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
  /** Короткая метка (например часть email), чтобы различать игроков с одинаковым именем */
  shortLabel?: string | null;
  /** Если слот заменён на ИИ из-за отключения — id пользователя, который может вернуться */
  replacedUserId?: string | null;
  /** Имя заменённого игрока (для возврата в слот) */
  replacedDisplayName?: string | null;
}

export interface GameRoomRow {
  id: string;
  code: string;
  host_user_id: string | null;
  status: 'waiting' | 'playing' | 'finished';
  game_state: GameState | null;
  player_slots: PlayerSlot[];
  created_at: string;
  updated_at: string;
}

const TABLE = 'game_rooms';
const PRESENCE_TABLE = 'game_room_presence';
const CODE_LENGTH = 6;
const DISCONNECT_THRESHOLD_MS = 60_000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

export async function markRoomFinished(roomId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const { error } = await supabase.from(TABLE).update({ status: 'finished' }).eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Создать комнату. Возвращает roomId и code или ошибку. */
export async function createRoom(
  hostUserId: string,
  deviceId: string,
  hostDisplayName: string,
  hostShortLabel?: string
): Promise<{ roomId: string; code: string } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const playerSlots: PlayerSlot[] = [
      {
        userId: hostUserId,
        deviceId,
        displayName: hostDisplayName.slice(0, 17),
        slotIndex: 0,
        ...(hostShortLabel != null && hostShortLabel !== ''
          ? { shortLabel: hostShortLabel.slice(0, 12) }
          : {}),
      },
    ];

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        code,
        host_user_id: hostUserId,
        status: 'waiting',
        game_state: null,
        player_slots: playerSlots,
      })
      .select('id, code')
      .single();

    if (error) {
      // 23505 — unique violation, пробуем сгенерировать другой код
      if ((error as any).code === '23505') continue;
      return { error: error.message };
    }
    if (data) return { roomId: data.id, code: data.code };
  }

  return { error: 'Не удалось создать уникальный код комнаты' };
}

/** Найти комнату по коду и присоединиться через SQL-функцию (атомарно). */
export async function joinRoom(
  code: string,
  userId: string,
  deviceId: string,
  displayName: string,
  shortLabel?: string
): Promise<{ roomId: string; mySlotIndex: number } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { error: 'Введите код комнаты' };

  const rpc = await supabase.rpc('join_game_room', {
    p_code: normalizedCode,
    p_user_id: userId,
    p_device_id: deviceId,
    p_display_name: displayName.slice(0, 17),
    p_short_label: shortLabel ?? '',
  });
  if (rpc.error) {
    return { error: rpc.error.message };
  }
  const payload = rpc.data as any;
  if (!payload || typeof payload !== 'object') return { error: 'Некорректный ответ сервера' };
  if (payload.error) return { error: String(payload.error) };
  const roomId = String(payload.room_id ?? '');
  const mySlotIndex = Number(payload.my_slot_index ?? NaN);
  if (!roomId || Number.isNaN(mySlotIndex)) return { error: 'Некорректные данные комнаты' };
  return { roomId, mySlotIndex };
}

/** Получить текущее состояние комнаты. */
export async function getRoom(roomId: string): Promise<GameRoomRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', roomId)
    .single();
  if (error || !data) return null;
  return data as GameRoomRow;
}

/** Получить комнату по коду */
export async function getRoomByCode(code: string): Promise<GameRoomRow | null> {
  if (!supabase) return null;
  const normalized = code.trim().toUpperCase();
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('code', normalized)
    .maybeSingle();
  if (error || !data) return null;
  return data as GameRoomRow;
}
/** Обновить состояние игры в комнате. */
export async function updateRoomState(
  roomId: string,
  gameState: GameState,
  playerSlots?: PlayerSlot[]
): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const payload: Record<string, unknown> = { game_state: gameState, status: 'playing' };
  if (playerSlots) payload.player_slots = playerSlots;
  const { error } = await supabase.from(TABLE).update(payload).eq('id', roomId);
  return error ? { error: error.message } : {};
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
  onUpdate: (row: GameRoomRow) => void
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
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/** Выйти из комнаты (удалить себя из player_slots). Если хост вышел — комната остаётся. */
export async function leaveRoom(roomId: string, deviceId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const room = await getRoom(roomId);
  if (!room) return {};

  const slots = (room.player_slots as PlayerSlot[]) || [];
  const newSlots = slots.filter((s) => s.deviceId != null && s.deviceId !== deviceId);
  if (newSlots.length === slots.length) return {};

  const { error } = await supabase
    .from(TABLE)
    .update({ player_slots: newSlots })
    .eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Отметить присутствие в комнате (вызывать периодически при игре). */
export async function heartbeatPresence(roomId: string, userId: string): Promise<void> {
  if (!supabase) return;
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
