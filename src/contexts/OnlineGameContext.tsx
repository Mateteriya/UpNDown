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
  recoverJoinByCode,
  getRoom,
  getRoomForSyncPoll,
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

function bidsArraySig(b: (number | null)[] | undefined): string {
  return (b ?? []).map((x) => (x == null ? 'n' : String(x))).join(',');
}

/** Лёгкий отпечаток для сравнения «тот же прогресс игры» без JSON.stringify всего state (Realtime/опрос вызывают это очень часто). */
function gameStateMergeFingerprint(s: GameState | null): string {
  if (!s) return '';
  const trick = s.currentTrick ?? [];
  const trickSig = trick.map((c) => `${c.rank}:${c.suit}`).join('|');
  const dh = s.dealHistory ?? [];
  const dhSig = dh.length === 0 ? '0' : `${dh.length}:${dh[dh.length - 1]?.dealNumber ?? 0}`;
  const pend = s.pendingTrickCompletion
    ? [...(s.pendingTrickCompletion.cards ?? [])]
        .map((c) => `${c.rank}:${c.suit}`)
        .sort()
        .join('|')
    : '';
  const tricksSum = s.players.reduce((sum, p) => sum + (p.tricksTaken ?? 0), 0);
  return [
    s.dealNumber,
    s.phase,
    bidsArraySig(s.bids),
    tricksSum,
    trick.length,
    trickSig,
    s.currentPlayerIndex,
    s.dealerIndex,
    handMultisetFingerprint(s),
    s.players.map((p) => p.score).join(','),
    dhSig,
    pend,
  ].join('#');
}

/** PostgREST иногда отдаёт bigint как строку — без числа ломается ветка по game_state_revision */
function parseGameStateRevision(raw: unknown): number | undefined {
  if (raw == null || raw === '') return undefined;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && !Number.isNaN(n) ? n : undefined;
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
  /** Если «Вход…» оборвался, а на сервере вы уже в слотах — подтянуть комнату по коду */
  recoverJoinIfAlreadyInRoom: (code: string) => Promise<boolean>;
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
  /** Активный update game_state в Supabase — пока >0, игнорируем устаревшие строки из опроса/Realtime (сброс заказа, откат стола). */
  const gameWriteInFlightRef = useRef(0);
  /** Время последней строки комнаты с сервера (updated_at), чтобы опрос мог принудительно подтянуть актуальное game_state при «залипании» onlyIfNewer. */
  const lastSeenRoomUpdatedAtMsRef = useRef(0);
  /** Последняя применённая game_state_revision с сервера (колонка + триггер в БД); -1 = ещё не было. */
  const lastAppliedGameStateRevisionRef = useRef(-1);
  /** Не запускать второй getRoom, пока предыдущий тик опроса не завершился (медленный телефон). */
  const roomPollInFlightRef = useRef(false);

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
    const incoming = room.game_state ?? null;
    // playing без game_state в payload бывает при гонках Realtime/опроса — нельзя затирать уже принятый стол (хост после старта, гость после merge).
    if (room.status === 'playing' && incoming == null && canonicalStateRef.current != null) {
      setStatus('playing');
      const r = parseGameStateRevision(room.game_state_revision);
      if (r !== undefined) {
        lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r);
      }
      return;
    }
    setCanonicalState(incoming);
    if (room.status === 'playing') setStatus(incoming != null ? 'playing' : 'waiting');
    else setStatus('waiting');
    const r2 = parseGameStateRevision(room.game_state_revision);
    if (r2 !== undefined) {
      lastAppliedGameStateRevisionRef.current = Math.max(lastAppliedGameStateRevisionRef.current, r2);
    }
  }, []);

  /** Лобби: слоты и код без подмены game_state (updated_at от аватаров не трогает стол). */
  const mergeLobbyFieldsFromRoom = useCallback((room: GameRoomRow) => {
    if (!room?.id) return;
    // Иначе merge-only оставляет status=playing и пустой стол (висит UI после гонок revision/Realtime).
    if (room.status === 'playing' && room.game_state && !canonicalStateRef.current) {
      applyRoomData(room);
      return;
    }
    roomIdRef.current = room.id;
    const ts = Date.parse(room.updated_at);
    if (Number.isFinite(ts)) {
      lastSeenRoomUpdatedAtMsRef.current = Math.max(lastSeenRoomUpdatedAtMsRef.current, ts);
    }
    setRoomId(room.id);
    setCode(room.code);
    setPlayerSlots(room.player_slots || []);
    if (room.status === 'playing') {
      setStatus(room.game_state != null || canonicalStateRef.current != null ? 'playing' : 'waiting');
    } else setStatus('waiting');
  }, [applyRoomData]);

  const applyRoomDataOnlyIfNewer = useCallback(
    (room: GameRoomRow) => {
      if (!room?.id) return;
      // Пока updateRoomState ещё в полёте, опрос часто отдаёт старый waiting — не сбрасываем уже посчитанную раздачу.
      // Но слоты/код всё равно подмешиваем — иначе голый return глотает join друзей и Realtime.
      if (room.status === 'waiting' && gameWriteInFlightRef.current > 0) {
        const local = canonicalStateRef.current;
        if (local && stateHasDealtHands(local)) {
          mergeLobbyFieldsFromRoom(room);
          return;
        }
      }
      // Подписка Realtime уже с фильтром id=eq.roomId; не сравниваем с ref — иначе при рассинхроне ref/state глушились player_slots (гости «не появлялись» у хоста).
      // В лобби game_state всегда null: сравнение «новизны» по состоянию раздачи ломало доставку player_slots (хост не видел новых игроков).
      if (room.status === 'waiting') {
        applyRoomData(room);
        return;
      }
      // Финиш и итоговые очки — всегда тянем строку целиком (эвристика «новее» могла отсечь обновление таблицы/модалки).
      if (room.status === 'finished') {
        applyRoomData(room);
        return;
      }
      const serverState = room.game_state ?? null;
      // Гость / второй клиент: пока локально нет стола — всегда полная строка (не merge-only по rev/timestamp).
      if (room.status === 'playing' && serverState != null && canonicalStateRef.current == null) {
        applyRoomData(room);
        return;
      }

      /** Игра идёт, в строке есть JSON стола — единый простой путь (без веток revision/timestamp: они давали «залипание» минутами). */
      if (room.status === 'playing' && serverState) {
        const local = canonicalStateRef.current;
        const bidNonNullGuard = (b: (number | null)[] | undefined) => (b ?? []).filter((x) => x != null).length;

        if (gameWriteInFlightRef.current > 0 && local) {
          if (
            (local.phase === 'bidding' || local.phase === 'dark-bidding') &&
            (serverState.phase === 'bidding' || serverState.phase === 'dark-bidding') &&
            bidNonNullGuard(serverState.bids) < bidNonNullGuard(local.bids)
          ) {
            mergeLobbyFieldsFromRoom(room);
            return;
          }
          if (
            local.phase === 'playing' &&
            serverState.phase === 'playing' &&
            (serverState.currentTrick ?? []).length < (local.currentTrick ?? []).length
          ) {
            mergeLobbyFieldsFromRoom(room);
            return;
          }
        }

        const fpLocal = local ? gameStateMergeFingerprint(local) : '';
        const fpServer = gameStateMergeFingerprint(serverState);
        if (local != null && fpServer === fpLocal) {
          mergeLobbyFieldsFromRoom(room);
          return;
        }
        if (gameWriteInFlightRef.current > 0) {
          mergeLobbyFieldsFromRoom(room);
          return;
        }
        applyRoomData(room);
        return;
      }

      /** playing, но game_state в ответе пустой — только слоты/мета */
      if (room.status === 'playing') {
        mergeLobbyFieldsFromRoom(room);
        return;
      }

      applyRoomData(room);
    },
    [applyRoomData, mergeLobbyFieldsFromRoom]
  );

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    const rid = roomId;
    const room = await getRoom(rid);
    if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
    applyRoomDataOnlyIfNewer(room);
  }, [roomId, applyRoomDataOnlyIfNewer]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    const unsub = subscribeToRoom(roomId, applyRoomDataOnlyIfNewer, (status) => {
      if (cancelled) return;
      if (status === 'SUBSCRIBED') {
        void refreshRoom();
        return;
      }
      if (status === 'CLOSED') {
        return;
      }
      if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      if (realtimeErrorDebounceRef.current) clearTimeout(realtimeErrorDebounceRef.current);
      realtimeErrorDebounceRef.current = setTimeout(() => {
        realtimeErrorDebounceRef.current = null;
        if (cancelled) return;
        realtimePollBurstTimeoutsRef.current.forEach((id) => clearTimeout(id));
        realtimePollBurstTimeoutsRef.current = [];
        void refreshRoom();
        const idA = window.setTimeout(() => void refreshRoom(), 400);
        const idB = window.setTimeout(() => void refreshRoom(), 1000);
        realtimePollBurstTimeoutsRef.current.push(idA, idB);
        setRealtimeHealKey((k) => k + 1);
      }, 250);
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
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshRoom();
    };
    const onOnline = () => {
      void refreshRoom();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [roomId, refreshRoom]);

  // Realtime + периодический getRoom: мобильный WebView часто не получает postgres_changes — опрос основной канал доставки.
  const ROOM_SYNC_POLL_MS_WAITING = 700;
  const ROOM_SYNC_POLL_SKIP_WAITING = 0;
  const ROOM_SYNC_POLL_MS_PLAYING_BIDDING = 280;
  const ROOM_SYNC_POLL_MS_PLAYING_OTHER = 420;
  const ROOM_SYNC_POLL_SKIP_PLAYING = 0;
  const roomSyncSkipRef = useRef(ROOM_SYNC_POLL_SKIP_WAITING);
  roomSyncSkipRef.current = status === 'playing' ? ROOM_SYNC_POLL_SKIP_PLAYING : ROOM_SYNC_POLL_SKIP_WAITING;

  const runRoomSyncPollTick = useCallback(() => {
    if (Date.now() - lastSendAtRef.current < roomSyncSkipRef.current) return;
    const rid = roomIdRef.current;
    if (!rid) return;
    if (roomPollInFlightRef.current) return;
    roomPollInFlightRef.current = true;
    void getRoomForSyncPoll(rid)
      .then((room) => {
        if (!room?.id || room.id !== rid || roomIdRef.current !== rid) return;
        if (room.status === 'waiting') {
          applyRoomData(room);
          return;
        }
        applyRoomDataOnlyIfNewer(room);
      })
      .finally(() => {
        roomPollInFlightRef.current = false;
      });
  }, [applyRoomData, applyRoomDataOnlyIfNewer]);

  useEffect(() => {
    if (!roomId || (status !== 'waiting' && status !== 'playing')) return;
    const phase = canonicalState?.phase;
    const period =
      status === 'waiting'
        ? ROOM_SYNC_POLL_MS_WAITING
        : phase === 'bidding' || phase === 'dark-bidding'
          ? ROOM_SYNC_POLL_MS_PLAYING_BIDDING
          : ROOM_SYNC_POLL_MS_PLAYING_OTHER;
    runRoomSyncPollTick();
    // И в лобби, и в игре: Realtime часто «зелёный», но события не доходят до второго устройства — без опроса ходы не синхронизируются.
    const iv = setInterval(() => runRoomSyncPollTick(), period);
    return () => clearInterval(iv);
  }, [roomId, status, canonicalState?.phase, runRoomSyncPollTick]);

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

  // F5 / возврат в приложение: одна точка восстановления из sessionStorage (не дублировать вторым эффектом).
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
        sessionRestoreOkRef.current = true;
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
        sessionRestoreOkRef.current = true;
        return { ok: true };
      } catch (e) {
        const msg = formatSupabaseNetworkError(e) || 'Ошибка при входе в комнату.';
        setError(msg);
        return { ok: false, error: msg };
      }
    },
    [applyRoomData]
  );

  const recoverJoinIfAlreadyInRoom = useCallback(
    async (codeInput: string): Promise<boolean> => {
      if (!user?.id) return false;
      const r = await recoverJoinByCode(codeInput, user.id);
      if (!r) return false;
      setError(null);
      applyRoomData(r.room);
      setMyServerIndex(r.mySlotIndex);
      saveOnlineSession(r.roomId, deviceIdRef.current);
      sessionRestoreOkRef.current = true;
      return true;
    },
    [user?.id, applyRoomData]
  );
  
  // --- Остальной код в основном без изменений, просто использует myServerIndex ---
  // ... (leaveRoom, startGame, sendBid, sendPlay и т.д.)
  // ... (Я включу его полностью для простоты копирования)

  const syncMySlotDisplayName = useCallback(
    async (displayName: string) => {
      if (!roomId || status !== 'waiting' || !displayName.trim()) return;
      // Всегда мержим в актуальный список с сервера — иначе локальный [только хост] затирает гостей при гонке с Realtime.
      const fresh = await getRoom(roomId);
      if (!fresh?.id || fresh.id !== roomId) return;
      const slots = ((fresh.player_slots as PlayerSlot[]) || []).slice();
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
      else applyRoomData({ ...fresh, player_slots: slots });
    },
    [roomId, status, myServerIndex, applyRoomData]
  );

  const syncMySlotAvatar = useCallback(async () => {
    if (!roomId) return;
    const avatarDataUrl = getPlayerProfile().avatarDataUrl ?? undefined;
    if (status === 'waiting') {
      const fresh = await getRoom(roomId);
      if (!fresh?.id || fresh.id !== roomId) return;
      const slots = ((fresh.player_slots as PlayerSlot[]) || []).slice();
      const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
      if (idx === -1) return;
      slots[idx] = {
        ...slots[idx],
        ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : { avatarDataUrl: null }),
      };
      const { error: err } = await updateRoomPlayerSlots(roomId, slots);
      if (!err) applyRoomData({ ...fresh, player_slots: slots });
    } else if (canonicalState) {
      const slots = playerSlots.slice();
      const idx = slots.findIndex((s) => s.slotIndex === myServerIndex);
      if (idx === -1) return;
      slots[idx] = { ...slots[idx], ...(avatarDataUrl != null && avatarDataUrl !== '' ? { avatarDataUrl } : { avatarDataUrl: null }) };
      gameWriteInFlightRef.current += 1;
      try {
        const exp =
          lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
        const { error: err, room, conflict } = await updateRoomState(roomId, canonicalState, slots, {
          expectedRevision: exp,
        });
        if (conflict && room?.game_state != null) applyRoomData(room);
        else if (!err && room) applyRoomData(room);
        else if (!err) setPlayerSlots(slots);
      } finally {
        gameWriteInFlightRef.current -= 1;
      }
    }
  }, [roomId, status, playerSlots, myServerIndex, canonicalState, applyRoomData]);

  const [userLeftTemporarily, setUserLeftTemporarily] = useState(false);
  const [userOnPause, setUserOnPause] = useState(false);

  const leaveRoom = useCallback(async () => {
    const rid = roomId;
    if (unsubRef.current) {
      unsubRef.current();
      unsubRef.current = null;
    }
    roomIdRef.current = null;
    lastAppliedGameStateRevisionRef.current = -1;
    lastSeenRoomUpdatedAtMsRef.current = 0;
    setRoomId(null); setCode(null); setCanonicalState(null); setPlayerSlots([]); setStatus('idle'); setError(null);
    setMyServerIndex(0);
    sessionRestoreOkRef.current = false;
    setUserLeftTemporarily(false);
    setUserOnPause(false);
    clearOnlineSession();
    if (rid && user?.id) {
      void apiLeaveRoom(rid, user.id).catch(() => {});
    }
  }, [roomId, user?.id]);
  
  const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!roomId || myServerIndex !== 0) {
      if (roomId && myServerIndex !== 0) {
        setError('Начать игру может только хост (создатель комнаты).');
      }
      return false;
    }
    const humans = playerSlots.filter((s) => s.userId != null && s.userId !== '');
    if (humans.length < 1) {
      setError('В комнате нет игроков. Обновите экран или зайдите по коду снова.');
      return false;
    }

    const prevSlots = playerSlots.slice();
    const prevCanonical = canonicalStateRef.current;

    gameWriteInFlightRef.current += 1;
    try {
      const fullSlots: PlayerSlot[] = [];
      for (let i = 0; i < 4; i++) {
        const existing = playerSlots.find((s) => s.slotIndex === i);
        if (existing) {
          fullSlots.push(existing);
        } else {
          fullSlots.push({ slotIndex: i, displayName: AI_NAMES[i], userId: null });
        }
      }
      const names: [string, string, string, string] = [ fullSlots[0].displayName, fullSlots[1].displayName, fullSlots[2].displayName, fullSlots[3].displayName, ];
      let state = createGameOnline(names);
      state = startDeal(state);
      canonicalStateRef.current = state;
      setPlayerSlots(fullSlots);
      setCanonicalState(state);
      setStatus('playing');

      const exp =
        lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
      const { error: err, room, conflict } = await updateRoomState(roomId, state, fullSlots, {
        expectedRevision: exp,
      });
      if (conflict) {
        void getRoom(roomId).then((r) => {
          if (r) applyRoomData(r);
        });
        setError('Не удалось начать: данные комнаты успели измениться. Нажмите «Начать игру» ещё раз.');
        canonicalStateRef.current = prevCanonical ?? null;
        setPlayerSlots(prevSlots);
        setCanonicalState(prevCanonical ?? null);
        setStatus('waiting');
        return false;
      }
      if (err) {
        setError(err);
        canonicalStateRef.current = prevCanonical ?? null;
        setPlayerSlots(prevSlots);
        setCanonicalState(prevCanonical ?? null);
        setStatus('waiting');
        return false;
      }
      if (room) applyRoomData(room);
      return true;
    } finally {
      gameWriteInFlightRef.current -= 1;
    }
  }, [roomId, myServerIndex, playerSlots, applyRoomData]);

    const sendBid = useCallback(async (bid: number): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        gameWriteInFlightRef.current += 1;
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const base = canonicalStateRef.current;
            if (!base) return false;
            const next = placeBid(base, myServerIndex, bid);
            canonicalStateRef.current = next;
            setCanonicalState(next);
            lastSendAtRef.current = Date.now();
            const exp =
              lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
            const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
              expectedRevision: exp,
            });
            if (conflict && room?.game_state != null && attempt === 0) {
              applyRoomData(room);
              continue;
            }
            if (conflict) {
              setError('Заказ не сохранился: стол обновился. Попробуйте снова.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (err) {
              setError(err);
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (room) applyRoomData(room);
            return true;
          }
          return false;
        } finally {
          gameWriteInFlightRef.current -= 1;
        }
    }, [roomId, canonicalState, myServerIndex, applyRoomData]);

    const sendPlay = useCallback(async (card: Card): Promise<boolean> => {
        if (!roomId || !canonicalState) return false;
        const prev = canonicalState;
        gameWriteInFlightRef.current += 1;
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            const base = canonicalStateRef.current;
            if (!base) return false;
            let next: GameState;
            try {
              next = playCard(base, myServerIndex, card);
            } catch {
              if (attempt === 0) {
                setError('Сейчас этой картой ходить нельзя.');
                return false;
              }
              setError('Ход не удался после синхронизации стола.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            canonicalStateRef.current = next;
            setCanonicalState(next);
            lastSendAtRef.current = Date.now();
            const exp =
              lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
            const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
              expectedRevision: exp,
            });
            if (conflict && room?.game_state != null && attempt === 0) {
              applyRoomData(room);
              continue;
            }
            if (conflict) {
              setError('Ход не сохранился: другой игрок успел изменить стол. Попробуйте снова.');
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (err) {
              setError(err);
              canonicalStateRef.current = prev;
              setCanonicalState(prev);
              return false;
            }
            if (room) applyRoomData(room);
            return true;
          }
          return false;
        } finally {
          gameWriteInFlightRef.current -= 1;
        }
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
      gameWriteInFlightRef.current += 1;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const base = canonicalStateRef.current;
          if (!base) return false;
          const next = completeTrick(base);
          canonicalStateRef.current = next;
          setCanonicalState(next);
          lastSendAtRef.current = Date.now();
          const exp =
            lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
          const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
            expectedRevision: exp,
          });
          if (conflict && room?.game_state != null && attempt === 0) {
            applyRoomData(room);
            continue;
          }
          if (conflict) {
            setError('Не удалось завершить взятку: стол изменился.');
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (err) {
            setError(err);
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (room) applyRoomData(room);
          return true;
        }
        return false;
      } finally {
        gameWriteInFlightRef.current -= 1;
      }
    }, [roomId, canonicalState, applyRoomData]);
    const sendStartNextDeal = useCallback(async (): Promise<boolean> => {
      if (!roomId || !canonicalState) return false;
      const prev = canonicalState;
      gameWriteInFlightRef.current += 1;
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const base = canonicalStateRef.current;
          if (!base) return false;
          const next = startNextDeal(base);
          if (!next) return false;
          canonicalStateRef.current = next;
          setCanonicalState(next);
          lastSendAtRef.current = Date.now();
          const exp =
            lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
          const { error: err, room, conflict } = await updateRoomState(roomId, next, undefined, {
            expectedRevision: exp,
          });
          if (conflict && room?.game_state != null && attempt === 0) {
            applyRoomData(room);
            continue;
          }
          if (conflict) {
            setError('Не удалось начать следующую раздачу: стол изменился.');
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (err) {
            setError(err);
            canonicalStateRef.current = prev;
            setCanonicalState(prev);
            return false;
          }
          if (room) applyRoomData(room);
          return true;
        }
        return false;
      } finally {
        gameWriteInFlightRef.current -= 1;
      }
    }, [roomId, canonicalState, applyRoomData]);
    const sendState = useCallback(async (newState: GameState): Promise<boolean> => {
      if (!roomId) return false;
      canonicalStateRef.current = newState;
      lastSendAtRef.current = Date.now();
      gameWriteInFlightRef.current += 1;
      try {
        const exp =
          lastAppliedGameStateRevisionRef.current >= 0 ? lastAppliedGameStateRevisionRef.current : undefined;
        const { error: err, room, conflict } = await updateRoomState(roomId, newState, undefined, {
          expectedRevision: exp,
        });
        if (conflict && room?.game_state != null) {
          applyRoomData(room);
          return false;
        }
        if (err) {
          setError(err);
          return false;
        }
        if (room) applyRoomData(room);
        else {
          canonicalStateRef.current = newState;
          setCanonicalState(newState);
        }
        return true;
      } finally {
        gameWriteInFlightRef.current -= 1;
      }
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
    status, roomId, code, myServerIndex, playerSlots, canonicalState, displayState, error, createRoom, joinRoom, recoverJoinIfAlreadyInRoom, leaveRoom, refreshRoom, syncMySlotDisplayName, syncMySlotAvatar, startGame, sendBid, sendPlay, sendCompleteTrick, sendStartNextDeal, sendState, tryRestoreSession, confirmReclaim, dismissReclaim, pendingReclaimOffer, returnSlotToPlayer, userOnPause, takePause, returnFromPause, playerLeftToast, clearPlayerLeftToast, clearError, userLeftTemporarily, setUserLeftTemporarily,
  };

  return (
    <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>
  );
}
