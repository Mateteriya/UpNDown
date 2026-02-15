/**
 * Контекст онлайн-игры (Supabase, временный вариант).
 * Комнаты, подписка на состояние, ходы (заказ / карта).
 */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Card } from '../game/types';
import type { GameState } from '../game/GameEngine';
import {
  startDeal,
  startNextDeal,
  placeBid,
  playCard,
  completeTrick,
  createGameOnline,
} from '../game/GameEngine';
import { rotateStateForPlayer } from '../game/rotateState';
import { saveUnfinishedOnlineGame } from '../game/persistence';
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  getRoom,
  updateRoomState,
  subscribeToRoom,
  leaveRoom as apiLeaveRoom,
  heartbeatPresence,
  getPresence,
  DISCONNECT_THRESHOLD_MS_EXPORT as DISCONNECT_MS,
  type PlayerSlot,
  type GameRoomRow,
} from '../lib/onlineGameSupabase';

const ONLINE_SESSION_KEY = 'updown_online_session';

type OnlineStatus = 'idle' | 'waiting' | 'playing' | 'left';

function saveOnlineSession(roomId: string, userId: string) {
  try {
    sessionStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify({ roomId, userId }));
  } catch {
    /* ignore */
  }
}

function clearOnlineSession() {
  try {
    sessionStorage.removeItem(ONLINE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function loadOnlineSession(): { roomId: string; userId: string } | null {
  try {
    const raw = sessionStorage.getItem(ONLINE_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (p && typeof p === 'object' && typeof (p as { roomId?: string }).roomId === 'string' && typeof (p as { userId?: string }).userId === 'string') {
      return { roomId: (p as { roomId: string }).roomId, userId: (p as { userId: string }).userId };
    }
    return null;
  } catch {
    return null;
  }
}

interface OnlineGameContextValue {
  status: OnlineStatus;
  roomId: string | null;
  code: string | null;
  mySlotIndex: number;
  playerSlots: PlayerSlot[];
  /** Каноническое состояние с сервера (для отправки). */
  canonicalState: GameState | null;
  /** Состояние для отображения (повёрнуто так, что я = слот 0). */
  displayState: GameState | null;
  error: string | null;
  createRoom: (userId: string, displayName: string) => Promise<boolean>;
  joinRoom: (code: string, userId: string, displayName: string) => Promise<boolean>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<boolean>;
  sendBid: (bid: number) => Promise<boolean>;
  sendPlay: (card: Card) => Promise<boolean>;
  sendCompleteTrick: () => Promise<boolean>;
  sendStartNextDeal: () => Promise<boolean>;
  /** Обновить состояние на сервере (для ходов ИИ; вызывать только хост). */
  sendState: (state: GameState) => Promise<boolean>;
  /** Попытаться восстановить онлайн-сессию. Возвращает { ok, needReclaim?, roomFinished? }. */
  tryRestoreSession: () => Promise<{ ok: boolean; needReclaim?: boolean; roomFinished?: boolean }>;
  /** Подтвердить возврат в слот (после модалки). */
  confirmReclaim: () => Promise<boolean>;
  /** Отказаться от возврата в партию (очистить сессию, партия остаётся в истории как незавершённая). */
  dismissReclaim: () => void;
  /** Предложение вернуться в слот (показывать модалку). */
  pendingReclaimOffer: { roomId: string; code: string; slotIndex: number; replacedDisplayName: string } | null;
  /** Заменить игрока в слоте на ИИ из-за неактивности (несколько таймаутов хода). Вызывает только хост. */
  replaceInactivePlayer: (slotIndex: number) => Promise<boolean>;
  clearError: () => void;
}

const OnlineGameContext = createContext<OnlineGameContextValue | null>(null);

export function OnlineGameProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [mySlotIndex, setMySlotIndex] = useState(0);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [canonicalState, setCanonicalState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingReclaimOffer, setPendingReclaimOffer] = useState<{
    roomId: string;
    code: string;
    slotIndex: number;
    replacedDisplayName: string;
  } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  const displayState = canonicalState ? rotateStateForPlayer(canonicalState, mySlotIndex) : null;

  const applyRoomRow = useCallback((row: GameRoomRow) => {
    setPlayerSlots(row.player_slots || []);
    setCanonicalState(row.game_state ?? null);
    if (row.code) setCode(row.code);
    if (row.status === 'playing' && row.game_state) setStatus('playing');
  }, []);

  useEffect(() => {
    if (!roomId) return;
    unsubRef.current = subscribeToRoom(roomId, applyRoomRow);
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [roomId, applyRoomRow]);

  const createRoom = useCallback(
    async (userId: string, displayName: string): Promise<boolean> => {
      setError(null);
      const result = await apiCreateRoom(userId, displayName);
      if ('error' in result) {
        setError(result.error);
        return false;
      }
      setRoomId(result.roomId);
      setCode(result.code);
      setMySlotIndex(0);
      setStatus('waiting');
      saveOnlineSession(result.roomId, userId);
      return true;
    },
    []
  );

  const joinRoom = useCallback(
    async (codeInput: string, userId: string, displayName: string): Promise<boolean> => {
      setError(null);
      const result = await apiJoinRoom(codeInput, userId, displayName);
      if ('error' in result) {
        setError(result.error);
        return false;
      }
      setRoomId(result.roomId);
      setMySlotIndex(result.mySlotIndex);
      setStatus('waiting');
      saveOnlineSession(result.roomId, userId);
      const room = await getRoom(result.roomId);
      if (room) applyRoomRow(room);
      return true;
    },
    [applyRoomRow]
  );

  const leaveRoom = useCallback(async () => {
    const rid = roomId;
    const uid = user?.id;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    setRoomId(null);
    setCode(null);
    setCanonicalState(null);
    setPlayerSlots([]);
    setStatus('idle');
    setError(null);
    clearOnlineSession();
    if (rid && uid) await apiLeaveRoom(rid, uid);
  }, [roomId, user?.id]);

  const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!roomId || mySlotIndex !== 0) return false;
    const slots = playerSlots.slice(0, 4);
    if (slots.length < 2) {
      setError('Нужно минимум 2 игрока');
      return false;
    }
    // Добить до 4 слотов: пустые заполняем ИИ
    const fullSlots: PlayerSlot[] = [];
    for (let i = 0; i < 4; i++) {
      const existing = slots.find((s) => s.slotIndex === i);
      if (existing) {
        fullSlots.push(existing);
      } else {
        fullSlots.push({ slotIndex: i, displayName: AI_NAMES[i], userId: null });
      }
    }
    const names: [string, string, string, string] = [
      fullSlots[0].displayName,
      fullSlots[1].displayName,
      fullSlots[2].displayName,
      fullSlots[3].displayName,
    ];
    let state = createGameOnline(names);
    state = startDeal(state);
    const { error: err } = await updateRoomState(roomId, state, fullSlots);
    if (err) {
      setError(err);
      return false;
    }
    setStatus('playing');
    return true;
  }, [roomId, mySlotIndex, playerSlots]);

  // Heartbeat присутствия в игре (чтобы хост мог обнаружить отключившихся)
  useEffect(() => {
    if (status !== 'playing' || !roomId || !user?.id) return;
    heartbeatPresence(roomId, user.id);
    const iv = setInterval(() => heartbeatPresence(roomId, user!.id!), 20_000);
    return () => clearInterval(iv);
  }, [status, roomId, user?.id]);

  // Хост: раз в минуту проверяем присутствие; отключившихся заменяем на ИИ
  useEffect(() => {
    if (status !== 'playing' || !roomId || mySlotIndex !== 0 || !canonicalState) return;
    const run = async () => {
      const presence = await getPresence(roomId);
      const now = Date.now();
      const slots = playerSlots.slice();
      let changed = false;
      const newState = { ...canonicalState, players: canonicalState.players.map((p) => ({ ...p })) };
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot?.userId) continue;
        const seen = presence[slot.userId];
        const lastSeen = seen ? new Date(seen).getTime() : 0;
        if (now - lastSeen < DISCONNECT_MS) continue;
        slots[i] = {
          slotIndex: i,
          displayName: AI_NAMES[i],
          userId: null,
          replacedUserId: slot.userId ?? undefined,
          replacedDisplayName: slot.displayName,
        };
        newState.players[i] = { ...newState.players[i], name: AI_NAMES[i] };
        changed = true;
      }
      if (changed) await updateRoomState(roomId, newState, slots);
    };
    run();
    const iv = setInterval(run, 60_000);
    return () => clearInterval(iv);
  }, [status, roomId, mySlotIndex, canonicalState, playerSlots]);

  // Восстановление онлайн-сессии после обновления страницы (без авто-возврата в слот — показываем модалку)
  useEffect(() => {
    const uid = user?.id;
    if (!uid || roomId || pendingReclaimOffer) return;
    const saved = loadOnlineSession();
    if (!saved || saved.userId !== uid) return;
    let cancelled = false;
    getRoom(saved.roomId).then(async (room) => {
      if (cancelled || !room || room.status !== 'playing') return;
      const slots = (room.player_slots as PlayerSlot[]) || [];
      const me = slots.find((s) => s.userId === uid);
      if (me) {
        setRoomId(room.id);
        setCode(room.code);
        setMySlotIndex(me.slotIndex);
        setPlayerSlots(slots);
        setCanonicalState(room.game_state ?? null);
        setStatus('playing');
        return;
      }
      const reclaimed = slots.find((s) => s.replacedUserId === uid);
      if (reclaimed) {
        setPendingReclaimOffer({
          roomId: room.id,
          code: room.code,
          slotIndex: reclaimed.slotIndex,
          replacedDisplayName: reclaimed.replacedDisplayName ?? 'Игрок',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, roomId, pendingReclaimOffer]);

  const sendBid = useCallback(
    async (bid: number): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const next = placeBid(canonicalState, mySlotIndex, bid);
      const { error: err } = await updateRoomState(roomId, next);
      if (err) {
        setError(err);
        return false;
      }
      return true;
    },
    [roomId, canonicalState, mySlotIndex]
  );

  const sendPlay = useCallback(
    async (card: Card): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const next = playCard(canonicalState, mySlotIndex, card);
      const { error: err } = await updateRoomState(roomId, next);
      if (err) {
        setError(err);
        return false;
      }
      return true;
    },
    [roomId, canonicalState, mySlotIndex]
  );

  const sendCompleteTrick = useCallback(async (): Promise<boolean> => {
    if (!roomId || !canonicalState) return false;
    const next = completeTrick(canonicalState);
    const { error: err } = await updateRoomState(roomId, next);
    if (err) {
      setError(err);
      return false;
    }
    return true;
  }, [roomId, canonicalState]);

  const sendStartNextDeal = useCallback(async (): Promise<boolean> => {
    if (!roomId || !canonicalState) return false;
    const next = startNextDeal(canonicalState);
    if (!next) return false;
    const { error: err } = await updateRoomState(roomId, next);
    if (err) {
      setError(err);
      return false;
    }
    return true;
  }, [roomId, canonicalState]);

  const sendState = useCallback(
    async (newState: GameState): Promise<boolean> => {
      if (!roomId) return false;
      const { error: err } = await updateRoomState(roomId, newState);
      if (err) {
        setError(err);
        return false;
      }
      return true;
    },
    [roomId]
  );

  const tryRestoreSession = useCallback(async (): Promise<{
    ok: boolean;
    needReclaim?: boolean;
    roomFinished?: boolean;
  }> => {
    const uid = user?.id;
    if (!uid || roomId) return { ok: false };
    const saved = loadOnlineSession();
    if (!saved || saved.userId !== uid) return { ok: false };
    const room = await getRoom(saved.roomId);
    if (!room) return { ok: false };
    if (room.status !== 'playing') {
      clearOnlineSession();
      return { ok: false, roomFinished: true };
    }
    const slots = (room.player_slots as PlayerSlot[]) || [];
    const me = slots.find((s) => s.userId === uid);
    if (me) {
      setRoomId(room.id);
      setCode(room.code);
      setMySlotIndex(me.slotIndex);
      setPlayerSlots(slots);
      setCanonicalState(room.game_state ?? null);
      setStatus('playing');
      return { ok: true };
    }
    const reclaimed = slots.find((s) => s.replacedUserId === uid);
    if (reclaimed) {
      setPendingReclaimOffer({
        roomId: room.id,
        code: room.code,
        slotIndex: reclaimed.slotIndex,
        replacedDisplayName: reclaimed.replacedDisplayName ?? 'Игрок',
      });
      return { ok: false, needReclaim: true };
    }
    return { ok: false };
  }, [user?.id, roomId]);

  const confirmReclaim = useCallback(async (): Promise<boolean> => {
    const uid = user?.id;
    const offer = pendingReclaimOffer;
    if (!uid || !offer) return false;
    const room = await getRoom(offer.roomId);
    if (!room || room.status !== 'playing' || !room.game_state) return false;
    const slots = (room.player_slots as PlayerSlot[]) || [];
    const newSlots = slots.map((s) =>
      s.slotIndex === offer.slotIndex
        ? { slotIndex: s.slotIndex, displayName: offer.replacedDisplayName, userId: uid }
        : s
    );
    const { error: err } = await updateRoomState(offer.roomId, room.game_state, newSlots);
    if (err) return false;
    setRoomId(offer.roomId);
    setCode(offer.code);
    setMySlotIndex(offer.slotIndex);
    setPlayerSlots(newSlots);
    setCanonicalState(room.game_state);
    setStatus('playing');
    setPendingReclaimOffer(null);
    return true;
  }, [user?.id, pendingReclaimOffer]);

  const dismissReclaim = useCallback(() => {
    if (pendingReclaimOffer) {
      saveUnfinishedOnlineGame(pendingReclaimOffer.roomId, pendingReclaimOffer.code);
    }
    clearOnlineSession();
    setPendingReclaimOffer(null);
  }, [pendingReclaimOffer]);

  const replaceInactivePlayer = useCallback(
    async (slotIndex: number): Promise<boolean> => {
      if (!roomId || mySlotIndex !== 0 || !canonicalState) return false;
      const slots = playerSlots.slice();
      const slot = slots[slotIndex];
      if (!slot?.userId) return false;
      slots[slotIndex] = {
        slotIndex,
        displayName: AI_NAMES[slotIndex],
        userId: null,
        replacedUserId: slot.userId ?? undefined,
        replacedDisplayName: slot.displayName,
      };
      const newState = {
        ...canonicalState,
        players: canonicalState.players.map((p, i) =>
          i === slotIndex ? { ...p, name: AI_NAMES[slotIndex] } : p
        ),
      };
      const { error: err } = await updateRoomState(roomId, newState, slots);
      if (err) return false;
      return true;
    },
    [roomId, mySlotIndex, canonicalState, playerSlots]
  );

  const clearError = useCallback(() => setError(null), []);

  const value: OnlineGameContextValue = {
    status,
    roomId,
    code,
    mySlotIndex,
    playerSlots,
    canonicalState,
    displayState,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    sendBid,
    sendPlay,
    sendCompleteTrick,
    sendStartNextDeal,
    sendState,
    tryRestoreSession,
    confirmReclaim,
    dismissReclaim,
    pendingReclaimOffer,
    replaceInactivePlayer,
    clearError,
  };

  return (
    <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>
  );
}

export function useOnlineGame(): OnlineGameContextValue {
  const ctx = useContext(OnlineGameContext);
  if (!ctx) throw new Error('useOnlineGame must be used within OnlineGameProvider');
  return ctx;
}
