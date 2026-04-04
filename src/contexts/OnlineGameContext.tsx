/**
 * Контекст онлайн-игры. Принцип: "Я всегда Юг".
 */
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import { v4 as uuidv4 } from 'uuid';
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
import { saveUnfinishedOnlineGame, getPlayerProfile } from '../game/persistence';
import { rotateStateForPlayer } from '../game/rotateState';
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  getRoom,
  updateRoomState,
  updateRoomPlayerSlots,
  subscribeToRoom,
  leaveRoom as apiLeaveRoom,
  returnSlotToPlayer as apiReturnSlotToPlayer,
  takePauseInRoom as apiTakePause,
  heartbeatPresence,
  type PlayerSlot,
  type GameRoomRow,
} from '../lib/onlineGameSupabase';
import { saveOnlineSession, clearOnlineSession, loadOnlineSession } from '../lib/onlineSession';

/** Сообщение при обрыве по таймауту fetch в supabase.ts (~55 с). */
function formatSupabaseNetworkError(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') {
    return 'Нет ответа от Supabase вовремя. Проверьте интернет и VPN. Откройте игру по адресу ПК в Wi‑Fi (http://192.168.…:5173), не localhost. В панели Supabase убедитесь, что проект не на паузе (бесплатный тариф).';
  }
  if (e instanceof Error && (e.name === 'AbortError' || /aborted|abort/i.test(e.message))) {
    return 'Нет ответа от Supabase вовремя. Проверьте интернет, VPN и статус проекта на supabase.com.';
  }
  if (e instanceof TypeError && /failed to fetch|load failed|networkerror/i.test(e.message)) {
    return 'Нет связи с сервером (сеть или блокировка). Проверьте Wi‑Fi/VPN, не используйте localhost с другого устройства — откройте игру по IP ПК в одной сети.';
  }
  return e instanceof Error ? e.message : String(e);
}

// --- Управление Device ID (остается без изменений) ---
const DEVICE_ID_KEY = 'updown_device_id';
function getDeviceId(): string {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    return 'in-memory-device-id';
  }
}

// --- Управление Сессией (остается без изменений) ---
const ONLINE_SESSION_KEY = 'updown_online_session';
type OnlineStatus = 'idle' | 'waiting' | 'playing' | 'left';

type PendingReclaimOffer = {
  roomId: string;
  code: string;
  slotIndex: number;
  replacedDisplayName: string;
};

/** Хотя бы у одного игрока есть карты на руке (раздача уже в состоянии). */
function stateHasDealtHands(state: GameState | null): boolean {
  if (!state) return false;
  return state.players.some((p) => (p.hand?.length ?? 0) > 0);
}

/** Стабильный отпечаток раздачи по рукам в каноническом порядке слотов 0..3. */
function handMultisetFingerprint(state: GameState | null): string {
  if (!state) return '';
  return state.players
    .map((p) =>
      [...(p.hand ?? [])]
        .map((c) => `${c.rank}:${c.suit}`)
        .sort()
        .join(',')
    )
    .join('|');
}

// --- Интерфейс Контекста (остается без изменений) ---
export interface OnlineGameContextValue {
  status: OnlineStatus;
  roomId: string | null;
  code: string | null;
  myServerIndex: number; // ИЗМЕНЕНО: mySlotIndex -> myServerIndex для ясности
  playerSlots: PlayerSlot[];
  canonicalState: GameState | null;
  displayState: GameState | null;
  error: string | null;
  createRoom: (userId: string, displayName: string, shortLabel?: string) => Promise<{ ok: boolean; error?: string }>;
  joinRoom: (code: string, userId: string, displayName: string, shortLabel?: string) => Promise<{ ok: boolean; error?: string }>;
  // ... остальной интерфейс без изменений
  leaveRoom: () => Promise<void>;
  refreshRoom: () => Promise<void>;
  syncMySlotDisplayName: (displayName: string) => Promise<void>;
  /** Обновить аватарку в нашем слоте (после смены фото в профиле). */
  syncMySlotAvatar: () => Promise<void>;
  startGame: () => Promise<boolean>;
  sendBid: (bid: number) => Promise<boolean>;
  sendPlay: (card: Card) => Promise<boolean>;
  sendCompleteTrick: () => Promise<boolean>;
  sendStartNextDeal: () => Promise<boolean>;
  sendState: (state: GameState) => Promise<boolean>;
  tryRestoreSession: () => Promise<{ ok: boolean; needReclaim?: boolean; roomFinished?: boolean; error?: string }>;
  confirmReclaim: () => Promise<boolean>;
  dismissReclaim: () => void;
  pendingReclaimOffer: PendingReclaimOffer | null;
  returnSlotToPlayer: (slotIndex: number) => Promise<boolean>;
  /** Игрок сам вручную взял паузу (передал слот ИИ), может вернуть управление. */
  userOnPause: boolean;
  takePause: () => Promise<boolean>;
  returnFromPause: () => Promise<boolean>;
  playerLeftToast: string | null;
  clearPlayerLeftToast: () => void;
  clearError: () => void;
  userLeftTemporarily: boolean;
  setUserLeftTemporarily: (value: boolean) => void;
}
// --- Конец интерфейса ---

export const OnlineGameContext = createContext<OnlineGameContextValue | null>(null);

export function OnlineGameProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  /** Актуальный roomId для отсечения поздних ответов getRoom после смены/выхода из комнаты (синхронно сбрасывается в leaveRoom). */
  const roomIdRef = useRef<string | null>(roomId);
  roomIdRef.current = roomId;

  // ИЗМЕНЕНО: mySlotIndex -> myServerIndex. Это наш индекс на сервере (0, 1, 2, или 3).
  // Для отображения мы всегда будем на месте 0.
  const [myServerIndex, setMyServerIndex] = useState(0); 

  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [canonicalState, setCanonicalState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [realtimeHealKey, setRealtimeHealKey] = useState(0);
  const [pendingReclaimOffer, setPendingReclaimOffer] = useState<PendingReclaimOffer | null>(null);
  const deviceIdRef = useRef<string>(getDeviceId());
  const unsubRef = useRef<(() => void) | null>(null);
  const realtimeErrorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimePollBurstTimeoutsRef = useRef<number[]>([]);
  
  // Порядок слотов ВЕЗДЕ один и тот же: 0=Юг, 1=Север, 2=Запад, 3=Восток. Не вращаем — только «я» = myServerIndex.
  const displayState = canonicalState ? rotateStateForPlayer(canonicalState, myServerIndex) : null;
  const canonicalStateRef = useRef<GameState | null>(null);
  canonicalStateRef.current = canonicalState;
  const lastSendAtRef = useRef(0);
  /** Время последней строки комнаты с сервера (updated_at), чтобы опрос мог принудительно подтянуть актуальное game_state при «залипании» onlyIfNewer. */
  const lastSeenRoomUpdatedAtMsRef = useRef(0);

  /** Серверное состояние применяем только если оно не старее локального (иначе Realtime/опрос перезатирают ход → карта «забирается назад»). */
  const isServerStateNewerOrEqual = useCallback((server: GameState | null, local: GameState | null): boolean => {
    if (!server) return false;
    if (!local) return true;
    if (server.dealNumber > local.dealNumber) return true;
    if (server.dealNumber < local.dealNumber) return false;
    const phaseOrder = (p: string) => (p === 'bidding' ? 0 : p === 'dark-bidding' ? 1 : p === 'playing' ? 2 : 3);
    if (phaseOrder(server.phase) > phaseOrder(local.phase)) return true;
    if (phaseOrder(server.phase) < phaseOrder(local.phase)) return false;
    const bidsCount = (b: (number | null)[] | undefined) => (b ?? []).filter((x) => x != null).length;
    if (bidsCount(server.bids) > bidsCount(local.bids)) return true;
    if (bidsCount(server.bids) < bidsCount(local.bids)) return false;
    const trickLen = (t: unknown[] | undefined) => (t ?? []).length;
    const tricksTaken = (s: GameState) => s.players.reduce((sum, p) => sum + (p.tricksTaken ?? 0), 0);
    const trickSigSorted = (cards: GameState['currentTrick']) =>
      [...(cards ?? [])].map((c) => `${c.rank}:${c.suit}`).sort().join('|');
    // У клиента ещё 4 карты в конуре + pendingTrickCompletion; другой клиент уже вызвал completeTrick.
    // Раньше сравнивали длину кона раньше суммы взяток → server.length 0 < local 4 ⇒ «сервер старее» и телефон залипал.
    if (
      local.pendingTrickCompletion &&
      !server.pendingTrickCompletion &&
      server.dealNumber === local.dealNumber &&
      server.lastCompletedTrick &&
      trickSigSorted(local.pendingTrickCompletion.cards) === trickSigSorted(server.lastCompletedTrick.cards)
    ) {
      return true;
    }
    const trS = tricksTaken(server);
    const trL = tricksTaken(local);
    if (trS > trL) return true;
    if (trS < trL) return false;
    if (trickLen(server.currentTrick) > trickLen(local.currentTrick)) return true;
    if (trickLen(server.currentTrick) < trickLen(local.currentTrick)) return false;
    // Одна длина взятки, но разные карты на столе — валидно только одно состояние; доверяем серверу (иначе isNewer=false и гость минутами не видит чужой ход).
    const trickSig = (t: GameState['currentTrick']) =>
      (t ?? []).map((c) => `${c.rank}:${c.suit}`).join('|');
    if (
      trickLen(server.currentTrick) === trickLen(local.currentTrick) &&
      trickLen(server.currentTrick) > 0 &&
      trickSig(server.currentTrick) !== trickSig(local.currentTrick)
    ) {
      return true;
    }
    // Тот же прогресс по взяткам/конуру, но разный currentPlayerIndex — чужой ход уже ушёл на сервер.
    if (
      server.phase === 'playing' &&
      local.phase === 'playing' &&
      bidsCount(server.bids) >= 4 &&
      tricksTaken(server) === tricksTaken(local) &&
      trickLen(server.currentTrick) === trickLen(local.currentTrick) &&
      server.currentPlayerIndex !== local.currentPlayerIndex
    ) {
      return true;
    }
    // Руки разошлись при совпадающих метриках выше — почти всегда сервер свежее (было return false → залипание второго клиента).
    if (stateHasDealtHands(local) && stateHasDealtHands(server) && handMultisetFingerprint(server) !== handMultisetFingerprint(local)) {
      return true;
    }
    return true;
  }, []);

  const applyRoomData = useCallback((room: GameRoomRow) => {
    if (!room?.id) return;
    roomIdRef.current = room.id;
    const ts = Date.parse(room.updated_at);
    if (Number.isFinite(ts)) {
      lastSeenRoomUpdatedAtMsRef.current = Math.max(lastSeenRoomUpdatedAtMsRef.current, ts);
    }
    setRoomId(room.id);
    setCode(room.code);
    setPlayerSlots(room.player_slots || []);
    setCanonicalState(room.game_state ?? null);
    if (room.status === 'playing') setStatus('playing');
    else setStatus('waiting');
  }, []);

  const applyRoomDataOnlyIfNewer = useCallback(
    (room: GameRoomRow) => {
      if (!room?.id) return;
      // Подписка Realtime уже с фильтром id=eq.roomId; не сравниваем с ref — иначе при рассинхроне ref/state глушились player_slots (гости «не появлялись» у хоста).
      // В лобби game_state всегда null: сравнение «новизны» по состоянию раздачи ломало доставку player_slots (хост не видел новых игроков).
      if (room.status === 'waiting') {
        applyRoomData(room);
        return;
      }
      const ts = Date.parse(room.updated_at);
      const rowTimestampNewer =
        Number.isFinite(ts) && ts > lastSeenRoomUpdatedAtMsRef.current;
      const serverState = room.game_state ?? null;
      const local = canonicalStateRef.current;
      const isNewer = isServerStateNewerOrEqual(serverState, local);

      const bidNonNull = (b: (number | null)[] | undefined) => (b ?? []).filter((x) => x != null).length;

      // Заказы с другого устройства: эвристика isServerStateNewerOrEqual иногда даёт false (отпечаток рук и т.д.),
      // а ветка !isNewer раньше вообще не подмешивала game_state — второй клиент «не видел» заказы. Тянем полную строку, если на сервере заказы однозначно не отстают.
      if (
        (room.status === 'playing' || room.status === 'finished') &&
        serverState &&
        local &&
        JSON.stringify(serverState.bids) !== JSON.stringify(local.bids)
      ) {
        const nS = bidNonNull(serverState.bids);
        const nL = bidNonNull(local.bids);
        if (nS > nL || (rowTimestampNewer && nS === nL)) {
          applyRoomData(room);
          return;
        }
      }

      // Строка в БД уже новее по времени — доверяем присланному game_state (иначе отпечаток рук/эвристика отсекали чужие ходы → только refresh помогал).
      if (rowTimestampNewer && (room.status === 'playing' || room.status === 'finished')) {
        applyRoomData(room);
        return;
      }
      if (!isNewer) {
        setPlayerSlots(room.player_slots || []);
        setCode(room.code);
        if (room.status === 'playing') setStatus('playing');
        return;
      }
      applyRoomData(room);
    },
    [applyRoomData, isServerStateNewerOrEqual]
  );

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    const rid = roomId;
    const room = await getRoom(rid);
    if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
    applyRoomDataOnlyIfNewer(room);
  }, [roomId, applyRoomDataOnlyIfNewer]);

  useEffect(() => {
    lastSeenRoomUpdatedAtMsRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const unsub = subscribeToRoom(roomId, applyRoomDataOnlyIfNewer, (status) => {
      if (cancelled) return;
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      if (realtimeErrorDebounceRef.current) clearTimeout(realtimeErrorDebounceRef.current);
      realtimeErrorDebounceRef.current = setTimeout(() => {
        realtimeErrorDebounceRef.current = null;
        if (cancelled) return;
        realtimePollBurstTimeoutsRef.current.forEach((id) => clearTimeout(id));
        realtimePollBurstTimeoutsRef.current = [];
        void refreshRoom();
        for (let i = 1; i <= 3; i++) {
          const id = window.setTimeout(() => {
            void refreshRoom();
          }, 400 + i * 1200);
          realtimePollBurstTimeoutsRef.current.push(id);
        }
        setRealtimeHealKey((k) => k + 1);
      }, 400);
    });
    unsubRef.current = unsub;
    return () => {
      cancelled = true;
      unsubRef.current = null;
      realtimePollBurstTimeoutsRef.current.forEach((id) => clearTimeout(id));
      realtimePollBurstTimeoutsRef.current = [];
      if (realtimeErrorDebounceRef.current) {
        clearTimeout(realtimeErrorDebounceRef.current);
        realtimeErrorDebounceRef.current = null;
      }
      unsub();
    };
  }, [roomId, applyRoomDataOnlyIfNewer, refreshRoom, realtimeHealKey]);

  useEffect(() => {
    if (!roomId) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshRoom();
    };
    const onOnline = () => {
      void refreshRoom();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [roomId, refreshRoom]);

  // Лобби — редко; в партии чаще (Realtime на мобильных/ПК иногда запаздывает).
  const ROOM_SYNC_POLL_MS_WAITING = 5500;
  const ROOM_SYNC_POLL_SKIP_WAITING = 2800;
  const ROOM_SYNC_POLL_MS_PLAYING = 1800;
  const ROOM_SYNC_POLL_SKIP_PLAYING = 800;
  const roomSyncSkipRef = useRef(ROOM_SYNC_POLL_SKIP_WAITING);
  roomSyncSkipRef.current = status === 'playing' ? ROOM_SYNC_POLL_SKIP_PLAYING : ROOM_SYNC_POLL_SKIP_WAITING;

  const runRoomSyncPollTick = useCallback(() => {
    if (Date.now() - lastSendAtRef.current < roomSyncSkipRef.current) return;
    const rid = roomIdRef.current;
    if (!rid) return;
    getRoom(rid).then((room) => {
      if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
      const ts = Date.parse(room.updated_at);
      if (Number.isFinite(ts) && ts > lastSeenRoomUpdatedAtMsRef.current) {
        if (room.status === 'waiting') {
          lastSeenRoomUpdatedAtMsRef.current = Math.max(lastSeenRoomUpdatedAtMsRef.current, ts);
          applyRoomData(room);
          return;
        }
        if (room.status === 'playing' || room.status === 'finished') {
          applyRoomData(room);
          return;
        }
      }
      applyRoomDataOnlyIfNewer(room);
    });
  }, [applyRoomData, applyRoomDataOnlyIfNewer]);

  useEffect(() => {
    if (!roomId || (status !== 'waiting' && status !== 'playing')) return;
    const period = status === 'playing' ? ROOM_SYNC_POLL_MS_PLAYING : ROOM_SYNC_POLL_MS_WAITING;
    runRoomSyncPollTick();
    const iv = setInterval(() => runRoomSyncPollTick(), period);
    return () => clearInterval(iv);
  }, [roomId, status, runRoomSyncPollTick]);

  /** После успешного авто-восстановления не дублировать, пока сессия жива. Сбрасывается в leaveRoom и при отсутствии saved. */
  const sessionRestoreOkRef = useRef(false);

  const performSessionRestore = useCallback(
    async (saved: { roomId: string; deviceId: string }): Promise<{ ok: boolean; roomFinished?: boolean; error?: string }> => {
      if (!user?.id) return { ok: false, error: 'Войдите в аккаунт, чтобы продолжить онлайн-партию.' };
      /** Сессия в storage уже не та (успели выйти/войти в другую комнату) — не трогаем UI и не затираем новую сессию. */
      const storageStillThisRoom = (): boolean => {
        const latest = loadOnlineSession();
        return latest != null && latest.roomId === saved.roomId;
      };
      let room: GameRoomRow | null = null;
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          room = await getRoom(saved.roomId);
        } catch {
          return { ok: false, error: 'Нет связи с сервером. Проверьте интернет и попробуйте снова.' };
        }
        if (room) break;
        if (attempt < maxAttempts - 1) await new Promise((r) => setTimeout(r, 350));
      }
      if (!room) {
        if (storageStillThisRoom()) clearOnlineSession();
        return { ok: false, error: 'Комната не найдена или сервер не ответил (проверьте вход в аккаунт и RLS в Supabase).' };
      }
      if (room.status === 'finished') {
        if (storageStillThisRoom()) clearOnlineSession();
        return { ok: false, roomFinished: true };
      }
      const slots = (room.player_slots || []) as PlayerSlot[];
      const meSlot = slots.find((s) => s.userId === user.id || s.replacedUserId === user.id);
      if (!meSlot) {
        if (storageStillThisRoom()) clearOnlineSession();
        return { ok: false, error: 'В этой комнате нет вашего места. Войдите по коду заново.' };
      }
      if (!storageStillThisRoom()) {
        return { ok: false };
      }
      if (saved.deviceId !== deviceIdRef.current) {
        saveOnlineSession(saved.roomId, deviceIdRef.current);
      }
      applyRoomData(room);
      setMyServerIndex(meSlot.slotIndex);
      return { ok: true };
    },
    [applyRoomData, user?.id]
  );

  // При загрузке/обновлении страницы: восстановить онлайн-сессию из sessionStorage (после готовности JWT).
  useEffect(() => {
    if (authLoading || !user?.id) return;
    const saved = loadOnlineSession();
    if (!saved) {
      sessionRestoreOkRef.current = false;
      return;
    }
    if (sessionRestoreOkRef.current) return;
    void performSessionRestore(saved).then((r) => {
      if (r.ok || r.roomFinished) sessionRestoreOkRef.current = true;
    });
  }, [authLoading, user?.id, performSessionRestore]);

  // Если в игре есть слот с replacedUserId === наш user.id (ручная пауза) — предложить вернуть слот.
  useEffect(() => {
    if (status !== 'playing' || !roomId || !user?.id) {
      setPendingReclaimOffer(null);
      return;
    }
    const slot = playerSlots.find((s) => s.replacedUserId === user.id);
    if (slot) {
      setPendingReclaimOffer({
        roomId,
        code: code ?? '',
        slotIndex: slot.slotIndex,
        replacedDisplayName: slot.replacedDisplayName ?? slot.displayName ?? 'Игрок',
      });
    } else {
      setPendingReclaimOffer(null);
    }
  }, [status, roomId, code, user?.id, playerSlots]);

  const createRoom = useCallback(
    async (userId: string, displayName: string, shortLabel?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        setError(null);
        const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
        const result = await apiCreateRoom(userId, displayName, shortLabel, avatarDataUrl);
        if ('error' in result) {
          setError(result.error);
          return { ok: false, error: result.error };
        }
        applyRoomData(result.room);
        saveOnlineSession(result.room.id, deviceIdRef.current);
        setMyServerIndex(0);
        return { ok: true };
      } catch (e) {
        const msg = formatSupabaseNetworkError(e) || 'Ошибка при создании комнаты.';
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [applyRoomData]
  );

  const joinRoom = useCallback(
    async (codeInput: string, userId: string, displayName: string, shortLabel?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        setError(null);
        const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
        const result = await apiJoinRoom(codeInput, userId, displayName, shortLabel, avatarDataUrl);
        if ('error' in result) {
          setError(result.error);
          return { ok: false, error: result.error };
        }
        applyRoomData(result.room);
        setMyServerIndex(result.mySlotIndex);
        saveOnlineSession(result.roomId, deviceIdRef.current);
        return { ok: true };
      } catch (e) {
        const msg = formatSupabaseNetworkError(e) || 'Ошибка при входе в комнату.';
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [applyRoomData]
  );
  
  // --- Остальной код в основном без изменений, просто использует myServerIndex ---
  // ... (leaveRoom, startGame, sendBid, sendPlay и т.д.)
  // ... (Я включу его полностью для простоты копирования)

  const syncMySlotDisplayName = useCallback(
    async (displayName: string) => {
      if (!roomId || status !== 'waiting' || !displayName.trim()) return;
      const slots = playerSlots.slice();
      const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
      if (idx === -1) return;
      const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
      slots[idx] = {
        ...slots[idx],
        displayName: displayName.trim().slice(0, 17),
        ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : {}),
      };
      const { error: err } = await updateRoomPlayerSlots(roomId, slots);
      if (err) setError(err);
      else setPlayerSlots(slots);
    },
    [roomId, status, playerSlots, myServerIndex]
  );

  const syncMySlotAvatar = useCallback(async () => {
    if (!roomId) return;
    const slots = playerSlots.slice();
    const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
    if (idx === -1) return;
    const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
    slots[idx] = { ...slots[idx], ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : { avatarDataUrl: null }) };
    if (status === 'waiting') {
      const { error: err } = await updateRoomPlayerSlots(roomId, slots);
      if (!err) setPlayerSlots(slots);
    } else if (canonicalState) {
      const { error: err, room } = await updateRoomState(roomId, canonicalState, slots);
      if (!err && room) applyRoomData(room);
      else if (!err) setPlayerSlots(slots);
    }
  }, [roomId, status, playerSlots, myServerIndex, canonicalState, applyRoomData]);

  const [userLeftTemporarily, setUserLeftTemporarily] = useState(false);
  const [userOnPause, setUserOnPause] = useState(false);

  useEffect(() => {
    if (status !== 'idle') return;
    (async () => {
      const saved = loadOnlineSession();
      if (!saved || saved.deviceId !== deviceIdRef.current) return;
      const room = await getRoom(saved.roomId);
      if (!room) { clearOnlineSession(); return; }
      const mySlot = (room.player_slots || []).find(s => s.deviceId === deviceIdRef.current || (s.userId && s.userId === user?.id));
      if (mySlot) {
        setRoomId(room.id);
        setMyServerIndex(mySlot.slotIndex);
        applyRoomData(room);
        setStatus(room.status === 'playing' ? 'playing' : 'waiting');
      } else {
        clearOnlineSession();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // --- Остальной код в основном без изменений, просто использует myServerIndex ---
  // ... (leaveRoom, startGame, sendBid, sendPlay и т.д.)
  // ... (Я включу его полностью для простоты копирования)
  
  const leaveRoom = useCallback(async () => {
    const rid = roomId;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    roomIdRef.current = null;
    setRoomId(null); setCode(null); setCanonicalState(null); setPlayerSlots([]); setStatus('idle'); setError(null);
    setMyServerIndex(0);
    sessionRestoreOkRef.current = false;
    setUserLeftTemporarily(false);
    setUserOnPause(false);
    clearOnlineSession();
    if (rid && user?.id) {
      const LEAVE_API_MS = 8000;
      await Promise.race([
        apiLeaveRoom(rid, user.id).then(() => undefined),
        new Promise<void>((resolve) => {
          setTimeout(resolve, LEAVE_API_MS);
        }),
      ]);
    }
  }, [roomId, user?.id]);
  
  const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!roomId || myServerIndex !== 0) return false; // Только хост (индекс 0) может начать
    const slots = playerSlots.slice(0, 4);
    if (slots.length < 2) { setError('Нужно минимум 2 игрока'); return false; }
    
    const fullSlots: PlayerSlot[] = [];
    for (let i = 0; i < 4; i++) {
      const existing = slots.find((s) => s.slotIndex === i);
      if (existing) {
        fullSlots.push(existing);
      } else {
        fullSlots.push({ slotIndex: i, displayName: AI_NAMES[i], userId: null });
      }
    }
    const names: [string, string, string, string] = [ fullSlots[0].displayName, fullSlots[1].displayName, fullSlots[2].displayName, fullSlots[3].displayName, ];
    let state = createGameOnline(names);
    state = startDeal(state);
    const { error: err, room } = await updateRoomState(roomId, state, fullSlots);
    if (err) { setError(err); return false; }
    if (room) applyRoomData(room);
    else {
      setPlayerSlots(fullSlots);
      setCanonicalState(state);
      setStatus('playing');
    }
    return true;
  }, [roomId, myServerIndex, playerSlots, applyRoomData]);

    const sendBid = useCallback(async (bid: number): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        const next = placeBid(prev, myServerIndex, bid);
        setCanonicalState(next);
        lastSendAtRef.current = Date.now();
        const { error: err, room } = await updateRoomState(roomId, next);
        if (err) { setError(err); setCanonicalState(prev); return false; }
        if (room) applyRoomData(room);
        return true;
    }, [roomId, canonicalState, myServerIndex, applyRoomData]);

    const sendPlay = useCallback(async (card: Card): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        const next = playCard(prev, myServerIndex, card);
        setCanonicalState(next);
        lastSendAtRef.current = Date.now();
        const { error: err, room } = await updateRoomState(roomId, next);
        if (err) { setError(err); setCanonicalState(prev); return false; }
        if (room) applyRoomData(room);
        return true;
    }, [roomId, canonicalState, myServerIndex, applyRoomData]);

    const tryRestoreSession = useCallback(async (): Promise<{ ok: boolean; needReclaim?: boolean; roomFinished?: boolean; error?: string }> => {
      const saved = loadOnlineSession();
      if (!saved) return { ok: false, error: 'Сессия не найдена. Откройте онлайн и войдите по коду.' };
      const r = await performSessionRestore(saved);
      if (r.ok || r.roomFinished) sessionRestoreOkRef.current = true;
      return r;
    }, [performSessionRestore]);
  
    // ... Остальной код, который вы можете скопировать из предыдущей версии, он не должен требовать изменений
    // ... confirmReclaim, dismissReclaim, и т.д.
    
    // Я оставлю их здесь для полноты
    const [playerLeftToast, setPlayerLeftToast] = useState<string | null>(null);
    const sendCompleteTrick = useCallback(async (): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const prev = canonicalState;
      const next = completeTrick(canonicalState);
      setCanonicalState(next);
      lastSendAtRef.current = Date.now();
      const { error: err, room } = await updateRoomState(roomId, next);
      if (err) { setError(err); setCanonicalState(prev); return false; }
      if (room) applyRoomData(room);
      return true;
    }, [roomId, canonicalState, applyRoomData]);
    const sendStartNextDeal = useCallback(async (): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const prev = canonicalState;
      const next = startNextDeal(canonicalState);
      if (!next) return false;
      setCanonicalState(next);
      lastSendAtRef.current = Date.now();
      const { error: err, room } = await updateRoomState(roomId, next);
      if (err) { setError(err); setCanonicalState(prev); return false; }
      if (room) applyRoomData(room);
      return true;
    }, [roomId, canonicalState, applyRoomData]);
    const sendState = useCallback(async (newState: GameState): Promise<boolean> => {
      if (!roomId) return false;
      lastSendAtRef.current = Date.now();
      const { error: err, room } = await updateRoomState(roomId, newState);
      if (err) { setError(err); return false; }
      if (room) applyRoomData(room);
      else setCanonicalState(newState);
      return true;
    }, [roomId, applyRoomData]);
    const confirmReclaim = useCallback(async (): Promise<boolean> => {
      if (!roomId || !pendingReclaimOffer || pendingReclaimOffer.roomId !== roomId || !user?.id) return false;
      const { error: err } = await apiReturnSlotToPlayer(roomId, pendingReclaimOffer.slotIndex);
      if (err) { setError(err); return false; }
      setPendingReclaimOffer(null);
      await heartbeatPresence(roomId, user.id);
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, pendingReclaimOffer, user?.id, applyRoomData]);
    const dismissReclaim = useCallback(() => { /* не сбрасываем offer — кнопка «Вернуть игру в свои руки» остаётся доступной */ }, []);
    const returnSlotToPlayer = useCallback(async (slotIndex: number): Promise<boolean> => {
      if (!roomId) return false;
      const { error: err } = await apiReturnSlotToPlayer(roomId, slotIndex);
      if (err) { setError(err); return false; }
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, applyRoomData]);
    const takePause = useCallback(async (): Promise<boolean> => {
      if (!roomId || !user?.id) return false;
      const displayName = playerSlots.find((s) => s.slotIndex === myServerIndex)?.displayName ?? user.email?.split('@')[0] ?? 'Игрок';
      const shortLabel = user.email ? user.email.replace(/@.*$/, '').slice(-8) : undefined;
      const { error: err } = await apiTakePause(roomId, user.id, displayName.slice(0, 17), shortLabel);
      if (err) { setError(err); return false; }
      setUserOnPause(true);
      const room = await getRoom(roomId);
      if (room) applyRoomData(room);
      return true;
    }, [roomId, user?.id, user?.email, myServerIndex, playerSlots]);
    const returnFromPause = useCallback(async (): Promise<boolean> => {
      if (!roomId || !user?.id) {
        setUserOnPause(false);
        return false;
      }
      const slot = playerSlots.find((s) => s.replacedUserId === user.id);
      const slotIndex = slot != null ? slot.slotIndex : myServerIndex;
      const ok = await returnSlotToPlayer(slotIndex);
      setUserOnPause(false);
      if (ok) {
        await heartbeatPresence(roomId, user.id);
        const room = await getRoom(roomId);
        if (room) applyRoomData(room);
      } else {
        setError('Не удалось вернуть управление. Попробуйте ещё раз или обновите страницу.');
      }
      return ok;
    }, [roomId, user?.id, myServerIndex, playerSlots, returnSlotToPlayer, getRoom, applyRoomData]);
    const clearPlayerLeftToast = useCallback(() => setPlayerLeftToast(null), []);
    const clearError = useCallback(() => setError(null), []);


  const value: OnlineGameContextValue = {
    status, roomId, code, myServerIndex, playerSlots, canonicalState, displayState, error, createRoom, joinRoom, leaveRoom, refreshRoom, syncMySlotDisplayName, syncMySlotAvatar, startGame, sendBid, sendPlay, sendCompleteTrick, sendStartNextDeal, sendState, tryRestoreSession, confirmReclaim, dismissReclaim, pendingReclaimOffer, returnSlotToPlayer, userOnPause, takePause, returnFromPause, playerLeftToast, clearPlayerLeftToast, clearError, userLeftTemporarily, setUserLeftTemporarily,
  };

  return (
    <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>
  );
}
