/**
 * Онлайн v2: тонкий контекст — сервер authoritative, без optimistic/poll/heal.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Card } from '../game/types';
import { playerAtLeftFrom, type GameState, type PlayerCount } from '../game/GameEngine';
import { getPlayerProfile, saveUnfinishedOnlineGame } from '../game/persistence';
import { rotateStateForPlayer } from '../game/rotateState';
import { TRICK_COMPLETE_HOLD_MS } from '../game/onlineTimings';
import {
  createRoom as apiCreateRoom,
  joinRoom as apiJoinRoom,
  recoverJoinByCode,
  getRoom,
  updateRoomPlayerSlots,
  subscribeToRoom,
  leaveRoom as apiLeaveRoom,
  pushPlayerDisplayName,
  normalizeRoomPhase,
  type PlayerSlot,
  type GameRoomRow,
  type GameRoomPhase,
  type HostResolveAbsentChoice,
  type CreateRoomOptions,
} from '../lib/onlineGameApi';
import type { SettlementMode } from '../game/partySettlement';
import { DEFAULT_CASUAL_SETTLEMENT } from '../lib/roomSettlement';
import type { RoomKind } from '../lib/roomSettlement';
import {
  saveOnlineSession,
  clearOnlineSession,
  loadOnlineSession,
  markLobbyUiOpen,
  isOnlineAutoRestoreSuppressed,
} from '../lib/onlineSession';
import { loadLastOnlineParty, clearLastOnlineParty, saveLastOnlineParty } from '../lib/lastOnlineParty';
import {
  addIgnoredRoomForAutoRestore,
  isRoomIgnoredForAutoRestore,
  removeIgnoredRoomForAutoRestore,
} from '../lib/onlineIgnoredRooms';
import { getOnlinePlayerId } from '../lib/deviceId';
import { isWsOnlineConfigured } from '../lib/onlineTransport';
import { ONLINE_ROOM_AVATAR_MAX_CHARS, prepareAvatarForOnlineRoom } from '../lib/avatarImage';
import {
  wsSubscribeToGameState,
  wsV2StartGame,
  wsV2PlaceBid,
  wsV2PlayCard,
  wsV2TakePause,
  wsV2ReturnFromPause,
  wsV2HostReturnSlot,
  wsV2TransferHost,
  wsV2HostResolveAbsent,
  type GameStatePush,
} from '../lib/onlineGameWsV2';
import {
  OnlineGameContext,
  type OnlineGameContextValue,
  type OnlineStatus,
} from './OnlineGameContext';

/** Слоты в live-push без data-URL: не затираем уже известные аватары. */
function mergePlayerSlotsKeepAvatars(prev: PlayerSlot[], next: PlayerSlot[]): PlayerSlot[] {
  const prevBy = new Map(prev.map((s) => [s.slotIndex, s]));
  return next.map((s) => {
    if (s.avatarDataUrl) return s;
    const old = prevBy.get(s.slotIndex);
    if (old?.avatarDataUrl) return { ...s, avatarDataUrl: old.avatarDataUrl };
    return s;
  });
}

function applyRoomRow(
  row: GameRoomRow,
  setters: {
    setRoomId: (v: string | null) => void;
    setCode: (v: string | null) => void;
    setStatus: (v: OnlineStatus) => void;
    setPlayerSlots: React.Dispatch<React.SetStateAction<PlayerSlot[]>>;
    setHostUserId: (v: string | null) => void;
    setRoomPhase: (v: GameRoomPhase) => void;
    setSettlementMode: (v: SettlementMode) => void;
    setBuyIn: (v: number | null) => void;
    setRoomKind: (v: RoomKind) => void;
    setMaxPlayers: (v: PlayerCount) => void;
    setCanonicalState: (v: GameState | null) => void;
    revisionRef: React.MutableRefObject<number>;
  },
): void {
  setters.setRoomId(row.id);
  setters.setCode(row.code);
  setters.setStatus(row.status === 'playing' ? 'playing' : row.status === 'finished' ? 'finished' : 'waiting');
  setters.setPlayerSlots((prev) =>
    mergePlayerSlotsKeepAvatars(prev, (row.player_slots as PlayerSlot[]) ?? []),
  );
  setters.setHostUserId(row.host_user_id ?? null);
  setters.setRoomPhase(normalizeRoomPhase(row));
  setters.setSettlementMode((row.settlement_mode as SettlementMode) ?? DEFAULT_CASUAL_SETTLEMENT);
  setters.setBuyIn(row.buy_in ?? null);
  setters.setRoomKind((row.room_kind as RoomKind) ?? 'private');
  const fromState =
    row.game_state && typeof row.game_state === 'object' && Array.isArray((row.game_state as GameState).players)
      ? ((row.game_state as GameState).players.length === 3 ? 3 : 4)
      : null;
  setters.setMaxPlayers(row.max_players === 3 || fromState === 3 ? 3 : 4);
  if (row.game_state && typeof row.game_state === 'object') {
    const rev = row.game_state_revision ?? 0;
    if (rev > setters.revisionRef.current) {
      setters.revisionRef.current = rev;
      setters.setCanonicalState(row.game_state as GameState);
    }
  } else if (row.status === 'waiting') {
    setters.setCanonicalState(null);
    setters.revisionRef.current = row.game_state_revision ?? 0;
  }
}

export function OnlineGameProviderV2({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const onlinePlayerId = useMemo(() => getOnlinePlayerId(user?.id), [user?.id]);
  const lanWs = isWsOnlineConfigured();

  const [status, setStatus] = useState<OnlineStatus>('idle');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [myServerIndex, setMyServerIndex] = useState(0);
  const [playerSlots, setPlayerSlots] = useState<PlayerSlot[]>([]);
  const [canonicalState, setCanonicalState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [roomPhase, setRoomPhase] = useState<GameRoomPhase>('lobby');
  const [settlementMode, setSettlementMode] = useState<SettlementMode>(DEFAULT_CASUAL_SETTLEMENT);
  const [buyIn, setBuyIn] = useState<number | null>(null);
  const [roomKind, setRoomKind] = useState<RoomKind>('private');
  const [maxPlayers, setMaxPlayers] = useState<PlayerCount>(4);
  const [onlineHydratedFromStorage, setOnlineHydratedFromStorage] = useState(false);
  const [userOnPause, setUserOnPause] = useState(false);
  const [playerLeftToast, setPlayerLeftToast] = useState<string | null>(null);
  const [userLeftTemporarily, setUserLeftTemporarily] = useState(false);
  const [lastPartyHintVersion, setLastPartyHintVersion] = useState(0);
  const [absentUntil] = useState<string | null>(null);
  const [absentSlotIndex] = useState<number | null>(null);

  const revisionRef = useRef(-1);
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
  const statusRef = useRef(status);
  statusRef.current = status;
  const deviceIdRef = useRef(onlinePlayerId);
  deviceIdRef.current = onlinePlayerId;

  const setters = useMemo(
    () => ({
      setRoomId,
      setCode,
      setStatus,
      setPlayerSlots,
      setHostUserId,
      setRoomPhase,
      setSettlementMode,
      setBuyIn,
      setRoomKind,
      setMaxPlayers,
      setCanonicalState,
      revisionRef,
    }),
    [],
  );

  const displayState = useMemo(
    () => (canonicalState ? rotateStateForPlayer(canonicalState, myServerIndex) : null),
    [canonicalState, myServerIndex],
  );

  const playInFlightRef = useRef(false);
  const bidInFlightRef = useRef(false);
  const emptyHandHealAtRef = useRef(0);
  const pendingStuckHealAtRef = useRef(0);
  const turnDesyncHealAtRef = useRef(0);
  const roomPullInFlightRef = useRef(false);

  const applyGameStatePush = useCallback((push: GameStatePush) => {
    if (push.roomId !== roomIdRef.current) return;
    if (push.revision <= revisionRef.current) return;
    revisionRef.current = push.revision;
    setCanonicalState(push.state);
    if (push.playerSlots) {
      setPlayerSlots((prev) => mergePlayerSlotsKeepAvatars(prev, push.playerSlots!));
    }
    if (push.roomPhase) {
      setRoomPhase(normalizeRoomPhase({ status: 'playing', room_phase: push.roomPhase }));
    }
    setStatus('playing');
  }, []);

  const applyRoom = useCallback((row: GameRoomRow) => {
    if (roomIdRef.current != null && row.id !== roomIdRef.current) return;
    applyRoomRow(row, setters);
  }, [setters]);

  const forceHealRoom = useCallback(
    (reason: string) => {
      if (!roomId) return;
      if (roomPullInFlightRef.current) return;
      console.warn('[online-v2] heal', reason);
      roomPullInFlightRef.current = true;
      revisionRef.current = -1;
      void getRoom(roomId)
        .then((r) => {
          if (r) applyRoom(r);
        })
        .finally(() => {
          roomPullInFlightRef.current = false;
        });
    },
    [roomId, applyRoom],
  );

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    let healTimer: ReturnType<typeof setTimeout> | null = null;
    const healFromServer = (force = false) => {
      if (cancelled) return;
      if (roomPullInFlightRef.current) return;
      roomPullInFlightRef.current = true;
      if (force) revisionRef.current = -1;
      void getRoom(roomId)
        .then((r) => {
          if (!cancelled && r) applyRoom(r);
        })
        .finally(() => {
          roomPullInFlightRef.current = false;
        });
    };
    const unsubRoom = subscribeToRoom(roomId, applyRoom, (status) => {
      if (cancelled) return;
      // После обрыва Wi‑Fi/фона на телефоне без pull UI не догоняет комнату.
      if (status !== 'SUBSCRIBED' && status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT') return;
      if (healTimer) clearTimeout(healTimer);
      healTimer = setTimeout(
        () => {
          healTimer = null;
          // На reconnect всегда тянем снимок заново (revision мог «застыть»).
          healFromServer(status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT');
        },
        status === 'SUBSCRIBED' ? 0 : 250,
      );
    });
    const unsubState = wsSubscribeToGameState(roomId, applyGameStatePush);
    healFromServer(true);
    return () => {
      cancelled = true;
      if (healTimer) clearTimeout(healTimer);
      unsubRoom();
      unsubState();
    };
  }, [roomId, applyRoom, applyGameStatePush]);

  /** Пустая рука при «моём» ходе в playing — почти всегда рассинхрон; лечим pull с сервера. */
  useEffect(() => {
    if (status !== 'playing' || !canonicalState || !roomId) return;
    if (canonicalState.phase !== 'playing') return;
    if (canonicalState.pendingTrickCompletion) return;
    if (canonicalState.currentPlayerIndex !== myServerIndex) return;
    const anyCardsLeft = canonicalState.players.some((p) => (p.hand?.length ?? 0) > 0);
    if (!anyCardsLeft) return;
    const hand = canonicalState.players[myServerIndex]?.hand;
    if (!hand || hand.length > 0) return;
    const now = Date.now();
    if (now - emptyHandHealAtRef.current < 2000) return;
    emptyHandHealAtRef.current = now;
    forceHealRoom('empty-hand-on-turn');
  }, [status, canonicalState, myServerIndex, roomId, forceHealRoom]);

  /**
   * Взятка «залипла» в pending на клиенте (пропущен completeTrick push) —
   * руки не кликаются, панель может врать «ваш ход». Тянем снимок после hold+запас.
   * На ПК (часто хост + Vite) push иногда теряется чаще — чуть короче запас.
   */
  useEffect(() => {
    if (status !== 'playing' || !canonicalState?.pendingTrickCompletion || !roomId) return;
    const pendingKey = `${canonicalState.dealNumber}-${canonicalState.pendingTrickCompletion.leaderIndex}-${canonicalState.pendingTrickCompletion.winnerIndex}-${canonicalState.pendingTrickCompletion.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    const waitMs = TRICK_COMPLETE_HOLD_MS + (isCoarsePointer ? 1800 : 900);
    const timer = window.setTimeout(() => {
      const now = Date.now();
      if (now - pendingStuckHealAtRef.current < waitMs) return;
      pendingStuckHealAtRef.current = now;
      forceHealRoom(`pending-stuck:${pendingKey}`);
    }, waitMs);
    return () => window.clearTimeout(timer);
  }, [status, canonicalState, roomId, forceHealRoom]);

  /** Vite/dev: если «мой ход» и revision не двигается ~2.5с — мягкий pull. На LAN host:app только мешает: думаешь над картой — getRoom ~100KB и браузер клинит. */
  useEffect(() => {
    if (lanWs) return;
    if (status !== 'playing' || !canonicalState || !roomId) return;
    if (canonicalState.phase !== 'playing') return;
    if (canonicalState.pendingTrickCompletion) return;
    if (canonicalState.currentPlayerIndex !== myServerIndex) return;
    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (isCoarsePointer) return;
    const revAtStart = revisionRef.current;
    const timer = window.setTimeout(() => {
      if (revisionRef.current !== revAtStart) return;
      forceHealRoom('pc-turn-stale-revision');
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [status, canonicalState, myServerIndex, roomId, forceHealRoom, lanWs]);

  /**
   * Мой ход по canonical, взятка не pending, в руке есть карты, но в display
   * уже «как будто сходили» в эту взятку — классический рассинхрон 3p/rotate.
   */
  useEffect(() => {
    if (status !== 'playing' || !canonicalState || !roomId) return;
    if (canonicalState.phase !== 'playing') return;
    if (canonicalState.pendingTrickCompletion) return;
    if (canonicalState.currentPlayerIndex !== myServerIndex) return;
    const hand = canonicalState.players[myServerIndex]?.hand;
    if (!hand || hand.length === 0) return;

    const display = rotateStateForPlayer(canonicalState, myServerIndex);
    const n = display.players.length === 3 ? 3 : 4;
    const alreadyPlayed = display.currentTrick.some((_, trickCardIndex) =>
      playerAtLeftFrom(display.trickLeaderIndex, trickCardIndex, n) === 0,
    );
    if (!alreadyPlayed) return;

    const now = Date.now();
    if (now - turnDesyncHealAtRef.current < 2500) return;
    turnDesyncHealAtRef.current = now;
    forceHealRoom('turn-but-already-played-display');
  }, [status, canonicalState, myServerIndex, roomId, forceHealRoom]);

  useEffect(() => {
    if (authLoading) return;
    if (!onlinePlayerId && !lanWs) {
      setOnlineHydratedFromStorage(true);
      return;
    }
    let saved = loadOnlineSession();
    if (!saved && lanWs) {
      const last = loadLastOnlineParty();
      if (last?.roomId && !isRoomIgnoredForAutoRestore(last.roomId)) {
        saveOnlineSession(last.roomId, onlinePlayerId, last.code);
        saved = loadOnlineSession();
      }
    }
    if (!saved) {
      setOnlineHydratedFromStorage(true);
      return;
    }
    if (isOnlineAutoRestoreSuppressed()) {
      setOnlineHydratedFromStorage(true);
      return;
    }
    void getRoom(saved.roomId).then((room) => {
      const liveHere =
        roomIdRef.current === saved.roomId &&
        (statusRef.current === 'playing' || statusRef.current === 'waiting');
      if (!room) {
        if (liveHere) {
          setOnlineHydratedFromStorage(true);
          return;
        }
        clearOnlineSession();
        clearLastOnlineParty();
        setLastPartyHintVersion((v) => v + 1);
        setOnlineHydratedFromStorage(true);
        return;
      }
      const slots = (room.player_slots ?? []) as PlayerSlot[];
      const me = slots.find((s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId);
      if (!me) {
        if (liveHere) {
          setOnlineHydratedFromStorage(true);
          return;
        }
        clearOnlineSession();
        clearLastOnlineParty();
        setLastPartyHintVersion((v) => v + 1);
        setOnlineHydratedFromStorage(true);
        return;
      }
      applyRoom(room);
      setMyServerIndex(me.slotIndex);
      setOnlineHydratedFromStorage(true);
    });
  }, [authLoading, onlinePlayerId, lanWs, applyRoom]);

  useEffect(() => {
    if (!roomId || !code || !onlinePlayerId) return;
    saveLastOnlineParty(roomId, code);
  }, [roomId, code, onlinePlayerId]);

  useEffect(() => {
    if (status !== 'playing' || !roomId) {
      setUserOnPause(false);
    }
  }, [status, roomId]);

  const createRoom = useCallback(
    async (
      userId: string,
      displayName: string,
      shortLabel?: string,
      roomOpts?: CreateRoomOptions,
    ): Promise<{ ok: boolean; error?: string }> => {
      const res = await apiCreateRoom(userId, displayName, shortLabel, getPlayerProfile().avatarDataUrl, roomOpts);
      if ('error' in res) return { ok: false, error: res.error };
      applyRoom(res.room);
      setMyServerIndex(0);
      saveOnlineSession(res.room.id, deviceIdRef.current, res.room.code);
      markLobbyUiOpen(true);
      setStatus('waiting');
      return { ok: true };
    },
    [applyRoom],
  );

  const joinRoom = useCallback(
    async (joinCode: string, userId: string, displayName: string, shortLabel?: string) => {
      const res = await apiJoinRoom(joinCode, userId, displayName, shortLabel, getPlayerProfile().avatarDataUrl);
      if ('error' in res) return { ok: false as const, error: res.error };
      applyRoom(res.room);
      setMyServerIndex(res.mySlotIndex);
      saveOnlineSession(res.roomId, deviceIdRef.current, res.room.code);
      markLobbyUiOpen(true);
      setStatus('waiting');
      return { ok: true as const };
    },
    [applyRoom],
  );

  const recoverJoinIfAlreadyInRoom = useCallback(async (joinCode: string) => {
    const res = await recoverJoinByCode(joinCode, onlinePlayerId);
    if (!res) return false;
    applyRoom(res.room);
    setMyServerIndex(res.mySlotIndex);
    saveOnlineSession(res.roomId, deviceIdRef.current, res.room.code);
    setStatus(res.room.status === 'playing' ? 'playing' : 'waiting');
    return true;
  }, [onlinePlayerId, applyRoom]);

  const disconnectLocal = useCallback(() => {
    revisionRef.current = -1;
    setRoomId(null);
    setCode(null);
    setStatus('idle');
    setCanonicalState(null);
    setPlayerSlots([]);
    setError(null);
    setUserOnPause(false);
    setUserLeftTemporarily(false);
    setOnlineHydratedFromStorage(true);
    clearOnlineSession();
    clearLastOnlineParty();
    setLastPartyHintVersion((v) => v + 1);
    markLobbyUiOpen(false);
  }, []);

  const leaveRoom = useCallback(async () => {
    const rid = roomId;
    const roomCode = code;
    const st = status;
    if (rid && roomCode && st === 'playing') {
      saveUnfinishedOnlineGame(rid, roomCode);
    }
    const uid = onlinePlayerId;
    disconnectLocal();
    if (!rid || !uid) return;
    try {
      await apiLeaveRoom(rid, uid);
    } catch {
      /* локально уже вышли */
    }
  }, [roomId, code, status, onlinePlayerId, disconnectLocal]);

  const refreshRoom = useCallback(async () => {
    if (!roomId) return;
    const r = await getRoom(roomId);
    if (r) applyRoom(r);
  }, [roomId, applyRoom]);

  const resyncRoomAggressive = useCallback(async () => {
    await refreshRoom();
  }, [refreshRoom]);

  const startGame = useCallback(async (): Promise<boolean> => {
    if (!roomId || myServerIndex !== 0) {
      setError('Начать игру может ведущий (слот 0).');
      return false;
    }
    const res = await wsV2StartGame(roomId, onlinePlayerId);
    if (!res.ok) {
      setError(res.error ?? 'Не удалось начать игру');
      return false;
    }
    setStatus('playing');
    setRoomPhase('playing');
    for (let i = 0; i < 8; i++) {
      const row = await getRoom(roomId);
      if (row?.game_state && typeof row.game_state === 'object') {
        applyRoom(row);
        break;
      }
      await new Promise((r) => setTimeout(r, i < 3 ? 80 : 200));
    }
    return true;
  }, [roomId, myServerIndex, onlinePlayerId, applyRoom]);

  const sendBid = useCallback(
    async (bid: number): Promise<boolean> => {
      if (!roomId || bidInFlightRef.current) return false;
      bidInFlightRef.current = true;
      try {
        const res = await wsV2PlaceBid(roomId, myServerIndex, bid, onlinePlayerId);
        if (!res.ok) {
          // not_your_turn / wrong_phase = клиент отстал; без resync UI залипает на торгах.
          revisionRef.current = -1;
          setError(res.error ?? 'Заказ не принят');
          await refreshRoom();
          return false;
        }
        if (res.state && typeof res.revision === 'number') {
          applyGameStatePush({
            roomId,
            revision: res.revision,
            state: res.state,
            playerSlots: res.playerSlots,
            roomPhase: res.roomPhase ?? null,
          });
        } else {
          await refreshRoom();
        }
        return true;
      } finally {
        bidInFlightRef.current = false;
      }
    },
    [roomId, myServerIndex, onlinePlayerId, refreshRoom, applyGameStatePush],
  );

  const sendPlay = useCallback(
    async (card: Card): Promise<boolean> => {
      if (!roomId || playInFlightRef.current) return false;
      playInFlightRef.current = true;
      try {
        const res = await wsV2PlayCard(roomId, myServerIndex, card, onlinePlayerId);
        if (!res.ok) {
          revisionRef.current = -1;
          setError(res.error ?? 'Ход не принят');
          await refreshRoom();
          return false;
        }
        if (res.state && typeof res.revision === 'number') {
          applyGameStatePush({
            roomId,
            revision: res.revision,
            state: res.state,
            playerSlots: res.playerSlots,
            roomPhase: res.roomPhase ?? null,
          });
        } else {
          await refreshRoom();
        }
        return true;
      } finally {
        playInFlightRef.current = false;
      }
    },
    [roomId, myServerIndex, onlinePlayerId, refreshRoom, applyGameStatePush],
  );

  const sendCompleteTrick = useCallback(async () => true, []);
  const sendStartNextDeal = useCallback(async () => true, []);
  const sendState = useCallback(async () => false, []);

  const tryRestoreSession = useCallback(async (): Promise<{ ok: boolean; roomFinished?: boolean; error?: string }> => {
    let saved = loadOnlineSession();
    const last = loadLastOnlineParty();
    if (!saved && last?.roomId && !isRoomIgnoredForAutoRestore(last.roomId)) {
      saveOnlineSession(last.roomId, deviceIdRef.current, last.code);
      saved = loadOnlineSession();
    }
    if (saved && isRoomIgnoredForAutoRestore(saved.roomId)) {
      clearOnlineSession();
      return {
        ok: false,
        error:
          'Эта комната отключена от автопродолжения. Войдите по коду через «Онлайн» или дождитесь приглашения.',
      };
    }
    if (!saved) {
      if (last?.roomId && isRoomIgnoredForAutoRestore(last.roomId)) {
        return {
          ok: false,
          error:
            'Эта комната отключена от автопродолжения. Введите код вручную в «Онлайн» или создайте новую комнату.',
        };
      }
      return {
        ok: false,
        error:
          'Нет сохранённой онлайн-сессии. Откройте «Онлайн» и войдите по коду или создайте комнату.',
      };
    }

    const wipeAnchors = () => {
      clearOnlineSession();
      clearLastOnlineParty();
      setLastPartyHintVersion((v) => v + 1);
    };

    const room = await getRoom(saved.roomId);
    if (!room) {
      wipeAnchors();
      return { ok: false, error: 'Комната не найдена' };
    }
    if (room.status === 'finished') {
      wipeAnchors();
      return { ok: false, roomFinished: true };
    }
    const me = (room.player_slots ?? []).find(
      (s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId,
    );
    if (me) {
      applyRoom(room);
      setMyServerIndex(me.slotIndex);
      saveOnlineSession(saved.roomId, deviceIdRef.current, room.code ?? last?.code);
      removeIgnoredRoomForAutoRestore(saved.roomId);
      return { ok: true };
    }

    if (last?.code) {
      const recovered = await recoverJoinIfAlreadyInRoom(last.code);
      if (recovered) {
        removeIgnoredRoomForAutoRestore(saved.roomId);
        return { ok: true };
      }
      const prof = getPlayerProfile();
      const name = prof.displayName?.trim() || 'Игрок';
      const shortLabel = user?.email ? user.email.replace(/@.*$/, '').slice(-8) : undefined;
      const jr = await apiJoinRoom(last.code, onlinePlayerId, name, shortLabel, prof.avatarDataUrl ?? undefined);
      if (!('error' in jr)) {
        applyRoom(jr.room);
        setMyServerIndex(jr.mySlotIndex);
        saveOnlineSession(jr.roomId, deviceIdRef.current, jr.room.code);
        removeIgnoredRoomForAutoRestore(jr.roomId);
        return { ok: true };
      }
    }

    wipeAnchors();
    return { ok: false, error: 'В этой комнате нет вашего места. Войдите по коду заново через «Онлайн».' };
  }, [onlinePlayerId, applyRoom, recoverJoinIfAlreadyInRoom, user?.email]);

  const forgetLastOnlineParty = useCallback(() => {
    clearLastOnlineParty();
    setLastPartyHintVersion((v) => v + 1);
  }, []);

  const stopAutoRestoreForCurrentRoom = useCallback(async () => {
    if (roomId) addIgnoredRoomForAutoRestore(roomId);
    await leaveRoom();
  }, [roomId, leaveRoom]);

  const syncMySlotDisplayName = useCallback(
    async (displayName: string) => {
      if (!roomId) return;
      await pushPlayerDisplayName(roomId, onlinePlayerId, displayName);
      await refreshRoom();
    },
    [roomId, onlinePlayerId, refreshRoom],
  );

  const syncMySlotAvatar = useCallback(async () => {
    if (!roomId) return;
    const raw = getPlayerProfile().avatarDataUrl ?? undefined;
    const avatar = await prepareAvatarForOnlineRoom(raw ?? null, ONLINE_ROOM_AVATAR_MAX_CHARS);
    const slots = playerSlots.map((s) =>
      s.userId === onlinePlayerId
        ? { ...s, ...(avatar != null && avatar !== '' ? { avatarDataUrl: avatar } : { avatarDataUrl: null }) }
        : s,
    );
    await updateRoomPlayerSlots(roomId, slots, onlinePlayerId);
    await refreshRoom();
  }, [roomId, playerSlots, onlinePlayerId, refreshRoom]);

  const profileSyncedRoomRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomId || (status !== 'waiting' && status !== 'playing')) return;
    if (profileSyncedRoomRef.current === roomId) return;
    profileSyncedRoomRef.current = roomId;
    const name = getPlayerProfile().displayName?.trim();
    if (name) void syncMySlotDisplayName(name);
    void syncMySlotAvatar();
  }, [roomId, status, syncMySlotDisplayName, syncMySlotAvatar]);

  const takePause = useCallback(async () => {
    if (!roomId) return false;
    const res = await wsV2TakePause(roomId, onlinePlayerId);
    if (!res.ok) {
      setError(res.error ?? 'Пауза не удалась');
      return false;
    }
    setUserOnPause(true);
    await refreshRoom();
    return true;
  }, [roomId, onlinePlayerId, refreshRoom]);

  const returnSlotToPlayer = useCallback(
    async (slotIndex: number) => {
      if (!roomId || hostUserId !== onlinePlayerId) return false;
      const res = await wsV2HostReturnSlot(roomId, onlinePlayerId, slotIndex);
      if (!res.ok) {
        setError(res.error ?? 'Не удалось вернуть слот');
        return false;
      }
      await refreshRoom();
      return true;
    },
    [roomId, hostUserId, refreshRoom],
  );

  const returnFromPause = useCallback(async () => {
    if (!roomId) return false;
    const res = await wsV2ReturnFromPause(roomId, onlinePlayerId);
    if (!res.ok) {
      setError(res.error ?? 'Не удалось вернуться');
      return false;
    }
    setUserOnPause(false);
    await refreshRoom();
    return true;
  }, [roomId, onlinePlayerId, refreshRoom]);

  const transferHostTo = useCallback(
    async (newHostUserId: string, roomIdForRpc?: string | null) => {
      const rid = roomIdForRpc ?? roomId;
      if (!rid) return { ok: false as const, error: 'Нет комнаты' };
      const res = await wsV2TransferHost(rid, onlinePlayerId, newHostUserId);
      if (!res.ok) return { ok: false as const, error: res.error };
      await refreshRoom();
      return { ok: true as const };
    },
    [roomId, onlinePlayerId, refreshRoom],
  );

  const hostResolveAbsentChoice = useCallback(
    async (choice: HostResolveAbsentChoice) => {
      if (!roomId) return false;
      const res = await wsV2HostResolveAbsent(roomId, onlinePlayerId, choice);
      if (!res.ok) {
        setError(res.error ?? 'Ошибка');
        return false;
      }
      await refreshRoom();
      return true;
    },
    [roomId, onlinePlayerId, refreshRoom],
  );

  const value: OnlineGameContextValue = {
    status,
    roomId,
    code,
    myServerIndex,
    playerSlots,
    canonicalState,
    displayState,
    error,
    createRoom,
    joinRoom,
    recoverJoinIfAlreadyInRoom,
    leaveRoom,
    refreshRoom,
    resyncRoomAggressive,
    syncMySlotDisplayName,
    syncMySlotAvatar,
    startGame,
    sendBid,
    sendPlay,
    sendCompleteTrick,
    sendStartNextDeal,
    sendState,
    tryRestoreSession,
    forgetLastOnlineParty,
    stopAutoRestoreForCurrentRoom,
    lastPartyHintVersion,
    returnSlotToPlayer,
    userOnPause,
    takePause,
    returnFromPause,
    playerLeftToast,
    clearPlayerLeftToast: () => setPlayerLeftToast(null),
    clearError: () => setError(null),
    userLeftTemporarily,
    setUserLeftTemporarily,
    onlineHydratedFromStorage,
    roomPhase,
    hostUserId,
    absentUntil,
    absentSlotIndex,
    transferHostTo,
    hostResolveAbsentChoice,
    settlementMode,
    buyIn,
    roomKind,
      maxPlayers,
    onlinePlayerId,
  };

  return <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>;
}
