/**
 * Онлайн через локальный / VPS WebSocket-сервер (без Supabase в партии).
 */

import { v4 as uuidv4 } from 'uuid';
import { getWsUrl, isServerAuthoritativeOnline, isWsProtocolV2 } from './onlineTransport';
import type { GameState } from '../game/GameEngine';
import type {
  CreateRoomOptions,
  GameRoomRow,
  HostResolveAbsentChoice,
  PlayerSlot,
  PublicWaitingRoomRow,
  RoomPeekResult,
  UpdateRoomStateOptions,
} from './onlineGameSupabase';
import { normalizeCreateRoomOptions } from './roomSettlement';

type RoomListener = (row: GameRoomRow) => void;
type SubscribeStatusListener = (status: string) => void;

export type GameStatePush = {
  roomId: string;
  revision: number;
  state: GameState;
  playerSlots?: PlayerSlot[];
  roomPhase?: string | null;
};

type GameStateListener = (push: GameStatePush) => void;

const REQUEST_TIMEOUT_MS = 25_000;

let socket: WebSocket | null = null;
let connectPromise: Promise<WebSocket> | null = null;
const pending = new Map<
  string,
  { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
>();
const roomListeners = new Map<string, Set<RoomListener>>();
const roomStatusListeners = new Map<string, Set<SubscribeStatusListener>>();
const gameStateListeners = new Map<string, Set<GameStateListener>>();

function notifyRoomStatus(roomId: string, status: string): void {
  const set = roomStatusListeners.get(roomId);
  if (!set) return;
  for (const fn of set) fn(status);
}

function resubscribeAllRooms(ws: WebSocket): void {
  for (const roomId of roomListeners.keys()) {
    try {
      ws.send(JSON.stringify({ type: 'subscribe_room', roomId }));
      notifyRoomStatus(roomId, 'SUBSCRIBED');
    } catch {
      notifyRoomStatus(roomId, 'CHANNEL_ERROR');
    }
  }
}

function wsBaseUrl(): string {
  const u = getWsUrl();
  if (!u) throw new Error('VITE_WS_URL не задан');
  return u;
}

function onSocketMessage(ev: MessageEvent): void {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
  } catch {
    return;
  }

  if (msg.type === 'room_snapshot' && msg.room && typeof msg.room === 'object') {
    const room = msg.room as GameRoomRow;
    const set = roomListeners.get(room.id);
    if (set) for (const fn of set) fn(room);
  }

  if (msg.type === 'room_meta' && msg.room && typeof msg.room === 'object') {
    const room = msg.room as GameRoomRow;
    const set = roomListeners.get(room.id);
    if (set) for (const fn of set) fn(room);
  }

  if (msg.type === 'game_state' && typeof msg.roomId === 'string' && msg.state) {
    const push: GameStatePush = {
      roomId: msg.roomId,
      revision: typeof msg.revision === 'number' ? msg.revision : 0,
      state: msg.state as GameState,
      playerSlots: msg.playerSlots as PlayerSlot[] | undefined,
      roomPhase: (msg.roomPhase as string | null) ?? null,
    };
    const set = gameStateListeners.get(push.roomId);
    if (set) for (const fn of set) fn(push);
  }

  const requestId = msg.requestId as string | undefined;
  if (requestId && pending.has(requestId)) {
    const p = pending.get(requestId)!;
    clearTimeout(p.timer);
    pending.delete(requestId);
    p.resolve(msg);
  }
}

function waitForSocketOpen(ws: WebSocket): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve(ws);
      return;
    }
    const done = () => {
      ws.removeEventListener('open', onOpen);
      ws.removeEventListener('error', onFail);
      ws.removeEventListener('close', onFail);
    };
    const onOpen = () => {
      done();
      resolve(ws);
    };
    const onFail = () => {
      done();
      reject(new Error('Соединение с игровым сервером прервано'));
    };
    ws.addEventListener('open', onOpen);
    ws.addEventListener('error', onFail);
    ws.addEventListener('close', onFail);
  });
}

function openNewSocket(): Promise<WebSocket> {
  if (connectPromise) return connectPromise;

  connectPromise = new Promise((resolve, reject) => {
    const url = wsBaseUrl();
    const ws = new WebSocket(url);
    const failTimer = setTimeout(() => {
      ws.close();
      connectPromise = null;
      reject(new Error(`Нет подключения к игровому серверу (${url}). Запустите: npm run server:dev`));
    }, 12_000);

    ws.onopen = () => {
      clearTimeout(failTimer);
      socket = ws;
      connectPromise = null;
      if (roomListeners.size > 0) resubscribeAllRooms(ws);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(failTimer);
      socket = null;
      connectPromise = null;
      reject(new Error(`WebSocket ошибка (${url})`));
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      connectPromise = null;
      for (const [, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new Error('Соединение с игровым сервером закрыто'));
      }
      pending.clear();
      for (const roomId of roomListeners.keys()) {
        notifyRoomStatus(roomId, 'TIMED_OUT');
      }
    };
    ws.onmessage = onSocketMessage;
  });

  return connectPromise;
}

function ensureSocket(): Promise<WebSocket> {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (socket?.readyState === WebSocket.CONNECTING) return waitForSocketOpen(socket);
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    try {
      socket.close();
    } catch {
      /* ignore */
    }
  }
  socket = null;
  return openNewSocket();
}

async function sendRequest<T extends Record<string, unknown>>(payload: Record<string, unknown>): Promise<T> {
  /** HTTP/LAN без secure context: crypto.randomUUID часто недоступен в мобильных браузерах */
  const requestId =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : uuidv4();

  const dispatch = (ws: WebSocket) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('Таймаут игрового сервера'));
      }, REQUEST_TIMEOUT_MS);
      pending.set(requestId, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      try {
        ws.send(JSON.stringify({ ...payload, requestId }));
      } catch (e) {
        pending.delete(requestId);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error('Нет связи с сервером'));
      }
    });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await dispatch(await ensureSocket());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const retriable =
        attempt === 0 &&
        !msg.includes('Таймаут') &&
        (msg.includes('закрыто') ||
          msg.includes('прервано') ||
          msg.includes('WebSocket') ||
          msg.includes('подключения') ||
          msg.includes('Нет связи'));
      if (!retriable) throw e;
      socket = null;
      connectPromise = null;
    }
  }
  throw new Error('Нет связи с игровым сервером');
}

export async function wsCreateRoom(
  hostUserId: string,
  hostDisplayName: string,
  hostShortLabel?: string,
  hostAvatarDataUrl?: string | null,
  roomOpts?: CreateRoomOptions,
): Promise<{ room: GameRoomRow } | { error: string }> {
  const normalized = normalizeCreateRoomOptions(roomOpts);
  const res = await sendRequest<{
    ok?: boolean;
    error?: string;
    room?: GameRoomRow;
  }>({
    type: 'create_room',
    playerId: hostUserId,
    displayName: hostDisplayName,
    shortLabel: hostShortLabel ?? null,
    avatarDataUrl: hostAvatarDataUrl ?? null,
    settlementMode: normalized.settlementMode,
    buyIn: normalized.buyIn,
    roomKind: normalized.roomKind,
    hostDedicated: roomOpts?.hostDedicated === true,
  /** LAN WS: только server-authoritative v2. */
    ...(isServerAuthoritativeOnline() ? { protocolVersion: 2 } : {}),
  });
  if (!res.ok || !res.room) return { error: res.error ?? 'Не удалось создать комнату' };
  return { room: res.room };
}

export async function wsJoinRoom(
  code: string,
  userId: string,
  displayName: string,
  shortLabel?: string,
  avatarDataUrl?: string | null,
): Promise<{ roomId: string; mySlotIndex: number; room: GameRoomRow } | { error: string }> {
  const res = await sendRequest<{
    ok?: boolean;
    error?: string;
    room?: GameRoomRow;
    roomId?: string;
    mySlotIndex?: number;
  }>({
    type: 'join_room',
    code,
    playerId: userId,
    displayName,
    shortLabel: shortLabel ?? null,
    avatarDataUrl: avatarDataUrl ?? null,
  });
  if (!res.ok || !res.room || res.roomId == null || res.mySlotIndex == null) {
    return { error: res.error ?? 'Не удалось войти в комнату' };
  }
  return { roomId: res.roomId, mySlotIndex: res.mySlotIndex, room: res.room };
}

export async function wsRecoverJoinByCode(
  code: string,
  userId: string,
): Promise<{ roomId: string; mySlotIndex: number; room: GameRoomRow } | null> {
  try {
    const res = await sendRequest<{
      ok?: boolean;
      room?: GameRoomRow;
      roomId?: string;
      mySlotIndex?: number;
    }>({ type: 'recover_join', code, playerId: userId });
    if (!res.ok || !res.room || res.roomId == null || res.mySlotIndex == null) return null;
    return { roomId: res.roomId, mySlotIndex: res.mySlotIndex, room: res.room };
  } catch {
    return null;
  }
}

async function wsFetchRoom(roomId: string): Promise<GameRoomRow | null> {
  const res = await sendRequest<{ ok?: boolean; room?: GameRoomRow }>({
    type: 'get_room',
    roomId,
  });
  return res.room ?? null;
}

export async function wsGetRoom(roomId: string): Promise<GameRoomRow | null> {
  try {
    return await wsFetchRoom(roomId);
  } catch {
    return null;
  }
}

export const wsGetRoomQuick = wsGetRoom;
export const wsGetRoomForSyncPoll = wsGetRoom;

export async function wsUpdateRoomPlayerSlots(
  roomId: string,
  playerSlots: PlayerSlot[],
): Promise<{ error?: string; room?: GameRoomRow }> {
  const res = await sendRequest<{ ok?: boolean; error?: string; room?: GameRoomRow }>({
    type: 'update_slots',
    roomId,
    playerSlots,
  });
  if (!res.ok) return { error: res.error ?? 'update_slots_failed' };
  return { room: res.room };
}

export async function wsUpdateDisplayName(
  roomId: string,
  playerId: string,
  displayName: string,
): Promise<{ error?: string; room?: GameRoomRow }> {
  const res = await sendRequest<{ ok?: boolean; error?: string; room?: GameRoomRow }>({
    type: 'update_display_name',
    roomId,
    playerId,
    displayName: displayName.trim().slice(0, 17),
  });
  if (!res.ok) return { error: res.error ?? 'update_display_name_failed' };
  return { room: res.room };
}

export async function wsUpdateRoomState(
  roomId: string,
  gameState: GameState,
  playerSlots?: PlayerSlot[],
  opts?: UpdateRoomStateOptions,
): Promise<{ error?: string; room?: GameRoomRow; conflict?: boolean }> {
  const res = await sendRequest<{
    ok?: boolean;
    error?: string;
    room?: GameRoomRow;
    conflict?: boolean;
  }>({
    type: 'update_state',
    roomId,
    gameState,
    playerSlots,
    roomPhase: opts?.roomPhase,
    expectedRevision: opts?.expectedRevision,
  });
  if (res.conflict) return { conflict: true, room: res.room };
  if (!res.ok) return { error: res.error ?? 'Не удалось сохранить ход' };
  return { room: res.room };
}

export async function wsLeaveRoom(roomId: string, userId: string): Promise<{ error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'leave_room',
    roomId,
    playerId: userId,
  });
  return res.ok ? {} : { error: res.error ?? 'leave_failed' };
}

export function wsSubscribeToGameState(
  roomId: string,
  onUpdate: GameStateListener,
): () => void {
  let set = gameStateListeners.get(roomId);
  if (!set) {
    set = new Set();
    gameStateListeners.set(roomId, set);
  }
  set.add(onUpdate);
  return () => {
    set?.delete(onUpdate);
    if (set?.size === 0) gameStateListeners.delete(roomId);
  };
}

export function wsSubscribeToRoom(
  roomId: string,
  onUpdate: (row: GameRoomRow) => void,
  onSubscribeStatus?: SubscribeStatusListener,
): () => void {
  let set = roomListeners.get(roomId);
  if (!set) {
    set = new Set();
    roomListeners.set(roomId, set);
  }
  set.add(onUpdate);
  if (onSubscribeStatus) {
    let statusSet = roomStatusListeners.get(roomId);
    if (!statusSet) {
      statusSet = new Set();
      roomStatusListeners.set(roomId, statusSet);
    }
    statusSet.add(onSubscribeStatus);
    onSubscribeStatus('SUBSCRIBED');
  }

  void ensureSocket()
    .then((ws) => {
      ws.send(JSON.stringify({ type: 'subscribe_room', roomId }));
    })
    .catch(() => onSubscribeStatus?.('CHANNEL_ERROR'));

  return () => {
    set?.delete(onUpdate);
    if (set?.size === 0) roomListeners.delete(roomId);
    if (onSubscribeStatus) {
      roomStatusListeners.get(roomId)?.delete(onSubscribeStatus);
      if (roomStatusListeners.get(roomId)?.size === 0) roomStatusListeners.delete(roomId);
    }
  };
}

export async function wsPeekRoomByCode(code: string): Promise<RoomPeekResult> {
  try {
    const res = await sendRequest<Record<string, unknown>>({
      type: 'peek_room',
      code,
    });
    return {
      ok: !!res.ok,
      error: typeof res.error === 'string' ? res.error : undefined,
      code: typeof res.code === 'string' ? res.code : undefined,
      status: res.status as RoomPeekResult['status'],
      settlement_mode: res.settlement_mode as RoomPeekResult['settlement_mode'],
      buy_in: (res.buy_in as number | null) ?? null,
      room_kind: res.room_kind as RoomPeekResult['room_kind'],
      human_count: typeof res.human_count === 'number' ? res.human_count : undefined,
    };
  } catch {
    return { ok: false, error: 'not_found' };
  }
}

export async function wsListPublicWaitingRooms(limit = 40): Promise<{
  ok: boolean;
  rooms: PublicWaitingRoomRow[];
  error?: string;
}> {
  try {
    const res = await sendRequest<{ ok?: boolean; rooms?: GameRoomRow[]; error?: string }>({
      type: 'list_public_waiting',
      p_limit: limit,
    });
    const rows = (res.rooms ?? []).map((r) => ({
      id: r.id,
      code: r.code,
      settlement_mode: (r.settlement_mode ?? 'accuracy_bonus') as PublicWaitingRoomRow['settlement_mode'],
      buy_in: r.buy_in ?? null,
      room_kind: (r.room_kind ?? 'public') as PublicWaitingRoomRow['room_kind'],
      updated_at: r.updated_at,
      human_count: (r.player_slots ?? []).filter((s) => s.userId).length,
    }));
    return { ok: true, rooms: rows };
  } catch (e) {
    return { ok: false, rooms: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function wsHeartbeatPresence(_roomId: string, _userId: string): Promise<void> {
  /* no-op */
}

export async function wsHostPingRoom(roomId: string): Promise<{ error?: string; room?: GameRoomRow }> {
  const room = await wsGetRoom(roomId);
  return room ? { room } : { error: 'not_found' };
}

export async function wsV2StartGame(roomId: string, playerId: string): Promise<{ ok: boolean; error?: string; revision?: number }> {
  const res = await sendRequest<{ ok?: boolean; error?: string; revision?: number }>({
    type: 'start_game',
    roomId,
    playerId,
  });
  return { ok: !!res.ok, error: res.error, revision: res.revision };
}

export async function wsV2PlaceBid(
  roomId: string,
  seat: number,
  bid: number,
  playerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'place_bid',
    roomId,
    seat,
    bid,
    playerId,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2PlayCard(
  roomId: string,
  seat: number,
  card: import('../game/types').Card,
  playerId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'play_card',
    roomId,
    seat,
    card,
    playerId,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2TakePause(roomId: string, playerId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'take_pause',
    roomId,
    playerId,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2ReturnFromPause(roomId: string, playerId: string): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'return_from_pause',
    roomId,
    playerId,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2HostReturnSlot(
  roomId: string,
  hostId: string,
  seat: number,
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'host_return_slot',
    roomId,
    hostId,
    seat,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2TransferHost(
  roomId: string,
  hostId: string,
  newHostUserId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'transfer_host',
    roomId,
    hostId,
    newHostUserId,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsV2HostResolveAbsent(
  roomId: string,
  hostId: string,
  choice: HostResolveAbsentChoice,
): Promise<{ ok: boolean; error?: string }> {
  const res = await sendRequest<{ ok?: boolean; error?: string }>({
    type: 'host_resolve_absent',
    roomId,
    playerId: hostId,
    choice,
  });
  return { ok: !!res.ok, error: res.error };
}

export async function wsReturnSlotToPlayer(
  roomId: string,
  slotIndex: number,
  hostId?: string,
): Promise<{ error?: string }> {
  if (isWsProtocolV2() && hostId) {
    const r = await wsV2HostReturnSlot(roomId, hostId, slotIndex);
    return r.ok ? {} : { error: r.error };
  }
  return { error: 'На LAN-сервере возврат слота пока не поддерживается' };
}

export async function wsTakePauseInRoom(
  roomId: string,
  userId: string,
  _displayName: string,
  _shortLabel?: string,
): Promise<{ error?: string }> {
  if (isWsProtocolV2()) {
    const r = await wsV2TakePause(roomId, userId);
    return r.ok ? {} : { error: r.error };
  }
  return { error: 'На LAN-сервере пауза пока не поддерживается' };
}

export async function wsTransferHostRoom(
  roomId: string,
  newHostUserId: string,
  hostId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isWsProtocolV2() && hostId) {
    return wsV2TransferHost(roomId, hostId, newHostUserId);
  }
  return { ok: false, error: 'На LAN-сервере смена хоста пока не поддерживается' };
}

export async function wsHostResolveAbsent(
  roomId: string,
  choice: HostResolveAbsentChoice,
  hostId?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (isWsProtocolV2() && hostId) {
    return wsV2HostResolveAbsent(roomId, hostId, choice);
  }
  return { ok: false, error: 'На LAN-сервере решение по absent пока не поддерживается' };
}
