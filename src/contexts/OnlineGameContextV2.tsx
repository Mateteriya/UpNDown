/**
 * Онлайн v2: тонкий контекст — сервер authoritative, без optimistic/poll/heal.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './AuthContext';
import type { Card } from '../game/types';
import type { GameState } from '../game/GameEngine';
import { getPlayerProfile } from '../game/persistence';
import { rotateStateForPlayer } from '../game/rotateState';
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
} from '../lib/onlineSession';
import { loadLastOnlineParty, clearLastOnlineParty, saveLastOnlineParty } from '../lib/lastOnlineParty';
import {
  addIgnoredRoomForAutoRestore,
  isRoomIgnoredForAutoRestore,
} from '../lib/onlineIgnoredRooms';
import { getOnlinePlayerId } from '../lib/deviceId';
import { isWsOnlineConfigured } from '../lib/onlineTransport';
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

type PendingReclaimOffer = {
  roomId: string;
  code: string;
  slotIndex: number;
  replacedDisplayName: string;
};

function applyRoomRow(
  row: GameRoomRow,
  setters: {
    setRoomId: (v: string | null) => void;
    setCode: (v: string | null) => void;
    setStatus: (v: OnlineStatus) => void;
    setPlayerSlots: (v: PlayerSlot[]) => void;
    setHostUserId: (v: string | null) => void;
    setRoomPhase: (v: GameRoomPhase) => void;
    setSettlementMode: (v: SettlementMode) => void;
    setBuyIn: (v: number | null) => void;
    setRoomKind: (v: RoomKind) => void;
    setCanonicalState: (v: GameState | null) => void;
    revisionRef: React.MutableRefObject<number>;
  },
): void {
  setters.setRoomId(row.id);
  setters.setCode(row.code);
  setters.setStatus(row.status === 'playing' ? 'playing' : row.status === 'finished' ? 'finished' : 'waiting');
  setters.setPlayerSlots((row.player_slots as PlayerSlot[]) ?? []);
  setters.setHostUserId(row.host_user_id ?? null);
  setters.setRoomPhase(normalizeRoomPhase(row.room_phase));
  setters.setSettlementMode((row.settlement_mode as SettlementMode) ?? DEFAULT_CASUAL_SETTLEMENT);
  setters.setBuyIn(row.buy_in ?? null);
  setters.setRoomKind((row.room_kind as RoomKind) ?? 'private');
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
  const [onlineHydratedFromStorage, setOnlineHydratedFromStorage] = useState(false);
  const [pendingReclaimOffer, setPendingReclaimOffer] = useState<PendingReclaimOffer | null>(null);
  const [userOnPause, setUserOnPause] = useState(false);
  const [playerLeftToast, setPlayerLeftToast] = useState<string | null>(null);
  const [userLeftTemporarily, setUserLeftTemporarily] = useState(false);
  const [lastPartyHintVersion, setLastPartyHintVersion] = useState(0);
  const [absentUntil] = useState<string | null>(null);
  const [absentSlotIndex] = useState<number | null>(null);

  const revisionRef = useRef(-1);
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = roomId;
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
      setCanonicalState,
      revisionRef,
    }),
    [],
  );

  const displayState = useMemo(
    () => (canonicalState ? rotateStateForPlayer(canonicalState, myServerIndex) : null),
    [canonicalState, myServerIndex],
  );

  const applyGameStatePush = useCallback((push: GameStatePush) => {
    if (push.roomId !== roomIdRef.current) return;
    if (push.revision <= revisionRef.current) return;
    revisionRef.current = push.revision;
    setCanonicalState(push.state);
    if (push.playerSlots) setPlayerSlots(push.playerSlots);
    if (push.roomPhase) setRoomPhase(normalizeRoomPhase(push.roomPhase));
    setStatus('playing');
  }, []);

  const applyRoom = useCallback((row: GameRoomRow) => {
    if (roomIdRef.current != null && row.id !== roomIdRef.current) return;
    applyRoomRow(row, setters);
  }, [setters]);

  useEffect(() => {
    if (!roomId) return;
    const unsubRoom = subscribeToRoom(roomId, applyRoom);
    const unsubState = wsSubscribeToGameState(roomId, applyGameStatePush);
    void getRoom(roomId).then((r) => {
      if (r) applyRoom(r);
    });
    return () => {
      unsubRoom();
      unsubState();
    };
  }, [roomId, applyRoom, applyGameStatePush]);

  useEffect(() => {
    if (authLoading && !lanWs) return;
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
    void getRoom(saved.roomId).then((room) => {
      if (!room) {
        clearOnlineSession();
        setOnlineHydratedFromStorage(true);
        return;
      }
      const slots = (room.player_slots ?? []) as PlayerSlot[];
      const me = slots.find((s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId);
      if (!me) {
        clearOnlineSession();
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
    if (status !== 'playing' || !roomId || !onlinePlayerId) {
      setPendingReclaimOffer(null);
      return;
    }
    const slot = playerSlots.find((s) => s.replacedUserId === onlinePlayerId);
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
  }, [status, roomId, code, onlinePlayerId, playerSlots]);

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
    clearOnlineSession();
  }, []);

  const leaveRoom = useCallback(async () => {
    if (!roomId) return;
    await apiLeaveRoom(roomId, onlinePlayerId);
    disconnectLocal();
  }, [roomId, onlinePlayerId, disconnectLocal]);

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
      if (!roomId) return false;
      const res = await wsV2PlaceBid(roomId, myServerIndex, bid, onlinePlayerId);
      if (!res.ok) {
        setError(res.error ?? 'Заказ не принят');
        return false;
      }
      await refreshRoom();
      return true;
    },
    [roomId, myServerIndex, onlinePlayerId, refreshRoom],
  );

  const sendPlay = useCallback(
    async (card: Card): Promise<boolean> => {
      if (!roomId) return false;
      const res = await wsV2PlayCard(roomId, myServerIndex, card, onlinePlayerId);
      if (!res.ok) {
        setError(res.error ?? 'Ход не принят');
        return false;
      }
      await refreshRoom();
      return true;
    },
    [roomId, myServerIndex, onlinePlayerId, refreshRoom],
  );

  const sendCompleteTrick = useCallback(async () => true, []);
  const sendStartNextDeal = useCallback(async () => true, []);
  const sendState = useCallback(async () => false, []);

  const tryRestoreSession = useCallback(async () => {
    const saved = loadOnlineSession();
    if (!saved) return { ok: false as const };
    const room = await getRoom(saved.roomId);
    if (!room) return { ok: false as const, error: 'Комната не найдена' };
    if (room.status === 'finished') return { ok: false as const, roomFinished: true };
    applyRoom(room);
    const me = (room.player_slots ?? []).find(
      (s) => s.userId === onlinePlayerId || s.replacedUserId === onlinePlayerId,
    );
    if (!me) return { ok: false as const, error: 'Нет вашего слота' };
    setMyServerIndex(me.slotIndex);
    return { ok: true as const };
  }, [onlinePlayerId, applyRoom]);

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
    if (!roomId || status !== 'waiting') return;
    const avatar = getPlayerProfile().avatarDataUrl ?? undefined;
    const slots = playerSlots.map((s) =>
      s.userId === onlinePlayerId ? { ...s, avatarDataUrl: avatar } : s,
    );
    await updateRoomPlayerSlots(roomId, slots);
    await refreshRoom();
  }, [roomId, status, playerSlots, onlinePlayerId, refreshRoom]);

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

  const confirmReclaim = useCallback(async () => {
    return returnFromPause();
  }, [returnFromPause]);

  const dismissReclaim = useCallback(() => setPendingReclaimOffer(null), []);

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
    confirmReclaim,
    dismissReclaim,
    pendingReclaimOffer,
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
    onlinePlayerId,
  };

  return <OnlineGameContext.Provider value={value}>{children}</OnlineGameContext.Provider>;
}
