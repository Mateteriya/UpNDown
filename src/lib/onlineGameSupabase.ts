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
  displayName: string;
  slotIndex: number;
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

/** Создать комнату. Возвращает roomId и code или ошибку. */
export async function createRoom(
  hostUserId: string,
  hostDisplayName: string
): Promise<{ roomId: string; code: string } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const playerSlots: PlayerSlot[] = [
      { userId: hostUserId, displayName: hostDisplayName.slice(0, 17), slotIndex: 0 },
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
      if (error.code === '23505') continue; // unique violation, retry with new code
      return { error: error.message };
    }
    if (data) return { roomId: data.id, code: data.code };
  }
  return { error: 'Не удалось создать уникальный код комнаты' };
}

/** Найти комнату по коду и присоединиться. Возвращает roomId и мой slotIndex или ошибку. */
export async function joinRoom(
  code: string,
  userId: string,
  displayName: string
): Promise<{ roomId: string; mySlotIndex: number } | { error: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { error: 'Введите код комнаты' };

  const { data: room, error: fetchError } = await supabase
    .from(TABLE)
    .select('id, status, player_slots')
    .eq('code', normalizedCode)
    .single();

  if (fetchError || !room) return { error: 'Комната не найдена' };
  if (room.status !== 'waiting') return { error: 'Игра уже началась' };

  const slots = (room.player_slots as PlayerSlot[]) || [];
  if (slots.some((s) => s.userId != null && s.userId === userId)) {
    return { roomId: room.id, mySlotIndex: slots.find((s) => s.userId === userId)!.slotIndex };
  }
  if (slots.length >= 4) return { error: 'Комната заполнена' };

  const mySlotIndex = slots.length;
  const newSlots: PlayerSlot[] = [
    ...slots,
    { userId, displayName: displayName.slice(0, 17), slotIndex: mySlotIndex },
  ];

  const { error: updateError } = await supabase
    .from(TABLE)
    .update({ player_slots: newSlots })
    .eq('id', room.id);

  if (updateError) return { error: updateError.message };
  return { roomId: room.id, mySlotIndex };
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

/** Выйти из комнаты (удалить себя из player_slots). Если хост вышел — комната остаётся; можно не удалять. */
export async function leaveRoom(roomId: string, userId: string): Promise<{ error?: string }> {
  if (!supabase) return { error: 'Supabase не настроен' };
  const room = await getRoom(roomId);
  if (!room) return {};
  const slots = (room.player_slots as PlayerSlot[]) || [];
  const newSlots = slots.filter((s) => s.userId != null && s.userId !== userId);
  if (newSlots.length === slots.length) return {};
  const { error } = await supabase
    .from(TABLE)
    .update({ player_slots: newSlots })
    .eq('id', roomId);
  return error ? { error: error.message } : {};
}

/** Отметить присутствие в комнате (вызывать периодически при игре). Требуется таблица game_room_presence (room_id, user_id, last_seen). */
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
  for (const row of data || []) {
    const uid = (row as { user_id: string; last_seen: string }).user_id;
    const seen = (row as { user_id: string; last_seen: string }).last_seen;
    if (uid && seen) out[uid] = seen;
  }
  return out;
}

export const DISCONNECT_THRESHOLD_MS_EXPORT = DISCONNECT_THRESHOLD_MS;
