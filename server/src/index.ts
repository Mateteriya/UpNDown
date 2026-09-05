/**
 * Локальный игровой сервер Up&Down (WebSocket).
 * Запуск: npm run dev --prefix server
 * Слушает 0.0.0.0 — телефоны в Wi‑Fi подключаются к ws://IP_ПК:3001
 */

import './loadLanEnv.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { HostAutomation } from './hostAutomation.js';
import { tryServeGameStatic, isGameDistAvailable } from './gameStatic.js';
import { tryServeJoinQr } from './qrHttp.js';
import { SERVER_HTTP_BUILD, serveHostPanel, hostHtmlPath } from './hostPanelHtml.js';
import { buildNetworkStatus, handleNetworkApi } from './networkHttp.js';
import { parseLanBackupPorts } from './lanPorts.js';
import { listLanIPv4 } from './networkInfo.js';
import { RoomStore } from './rooms.js';
import {
  FINISHED_MAX_AGE_MS,
  PLAYING_MAX_AGE_MS,
  WAITING_MAX_AGE_MS,
  isRoomPersistEnabled,
  RoomPersist,
} from './roomPersist.js';
import { RoomChatStore } from './roomChat.js';
import { TunnelManager } from './tunnelManager.js';
import { parseMaxPlayers, type ClientMessage, type GameRoomRow, type ServerMessage } from './protocol.js';
import { GameSessionManager } from './v2/GameSessionManager.js';
import { handleV2GameMessage, isV2GameCommand } from './v2/handlers.js';
import type { GameStatePush } from './v2/protocol.js';
import {
  bindPlayerId,
  isJwtConfigured,
  readWsAuthMode,
  verifySupabaseAccessToken,
  wsAuthBootError,
  type WsSocketAuth,
} from './wsAuth.js';
import {
  WS_MAX_PAYLOAD_BYTES,
  clientIpFromUpgrade,
  readTrustProxy,
  readWsLimitConfig,
  WsRateLimiter,
} from './wsLimits.js';
import { isProdProfile } from './prodMode.js';
import { canAccessRoom } from './roomAccess.js';
import { lobbyRoomPublic, projectGameState, projectRoomForViewer, slimPlayerSlots, viewerSeatIndex } from './stateView.js';
import { finishGameFromServer, supabaseAuthReachable, supabaseFinishConfigured } from './matchFinish.js';
import { localReadyStatus } from './readyCheck.js';
import type { GameState } from '../../src/game/GameEngine.js';

const GAME_APP_PORT = Number(process.env.GAME_APP_PORT ?? 5173);

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const WS_AUTH_MODE = readWsAuthMode();
const PROD = isProdProfile();
const TRUST_PROXY = readTrustProxy();
const wsLimits = new WsRateLimiter(readWsLimitConfig());

const bootErr = wsAuthBootError(WS_AUTH_MODE);
if (bootErr) {
  console.error(bootErr);
  process.exit(1);
}

type WsConn = WebSocket & {
  subscribedRooms?: Set<string>;
  updownIp?: string;
  updownAuth?: WsSocketAuth;
};

function connAuth(ws: WebSocket): WsSocketAuth {
  const c = ws as WsConn;
  if (!c.updownAuth) c.updownAuth = { userId: null, authed: false };
  return c.updownAuth;
}

function connIp(ws: WebSocket): string {
  return (ws as WsConn).updownIp ?? '';
}

/** Типы, где playerId должен совпасть с JWT (или разрешён guest в optional). */
const PLAYER_BOUND_TYPES = new Set([
  'create_room',
  'join_room',
  'recover_join',
  'leave_room',
  'chat_post',
  'chat_typing',
  'update_slots',
  'update_display_name',
  'update_state',
  'start_game',
  'place_bid',
  'play_card',
  'take_pause',
  'return_from_pause',
  'host_return_slot',
  'transfer_host',
  'host_resolve_absent',
]);

const store = new RoomStore();
const chatStore = new RoomChatStore();
const roomSubscribers = new Map<string, Set<WebSocket>>();

const roomPersist = isRoomPersistEnabled() ? new RoomPersist(store) : null;
if (roomPersist) {
  const loaded = roomPersist.load();
  store.setOnMutate(() => roomPersist.schedule());
  roomPersist.startPruneInterval();
  roomPersist.startBackupInterval();
  if (loaded > 0) {
    console.log(`[updown-server] Восстановлено комнат с диска: ${loaded} (${roomPersist.filePath})`);
  } else {
    console.log(`[updown-server] Persistence комнат: ${roomPersist.filePath}`);
  }
} else {
  console.log('[updown-server] Persistence комнат выключен (ROOM_PERSIST=0)');
}

console.log(
  `[updown-server] WS_AUTH=${WS_AUTH_MODE}` +
    (isJwtConfigured() ? ' (JWT secret ok)' : ' (SUPABASE_JWT_SECRET не задан)'),
);
console.log(
  `[updown-server] Запись матча/Elo: ${supabaseFinishConfigured() ? 'да (service role)' : 'нет (добавьте SUPABASE_SERVICE_ROLE_KEY в .env.local)'}`,
);
console.log(
  `[updown-server] Limits: rooms≤${wsLimits.config.maxRooms} sockets≤${wsLimits.config.maxSockets} create/min≤${wsLimits.config.createPerMin}`,
);
console.log(
  `[updown-server] profile=${PROD ? 'production' : 'lan'} trustProxy=${TRUST_PROXY} maxPayload=${WS_MAX_PAYLOAD_BYTES}`,
);

function viewerUserId(ws: WebSocket): string | null {
  const a = connAuth(ws);
  return a.authed && a.userId ? a.userId : null;
}

function shouldStripUnknownHands(userId: string | null): boolean {
  return WS_AUTH_MODE === 'required' || !!userId;
}

function sendProjectedPush(ws: WebSocket, push: GameStatePush, room: GameRoomRow | null): void {
  const slimPush: GameStatePush = { ...push, playerSlots: slimPlayerSlots(push.playerSlots) };
  if (!room || !slimPush.state || typeof slimPush.state !== 'object') {
    send(ws, slimPush);
    return;
  }
  const uid = viewerUserId(ws);
  const strip = shouldStripUnknownHands(uid);
  const seat = viewerSeatIndex(room, uid);
  if (seat == null && !strip) {
    send(ws, slimPush);
    return;
  }
  send(ws, { ...slimPush, state: projectGameState(slimPush.state as GameState, seat) });
}

function roomOnWire(
  ws: WebSocket,
  room: GameRoomRow,
  opts?: { keepAvatars?: boolean },
): GameRoomRow {
  const uid = viewerUserId(ws);
  return projectRoomForViewer(room, uid, {
    stripUnknownHands: shouldStripUnknownHands(uid),
    keepAvatars: opts?.keepAvatars,
  });
}

function sendRoomTo(ws: WebSocket, room: GameRoomRow, type: 'room_snapshot' | 'room_meta' = 'room_snapshot'): void {
  send(ws, { type, room: roomOnWire(ws, room) });
}

function broadcastGameStateV2(push: GameStatePush): void {
  const subs = roomSubscribers.get(push.roomId);
  if (!subs) return;
  const room = store.getById(push.roomId);
  for (const client of subs) {
    sendProjectedPush(client, push, room);
  }
}

const finishingRooms = new Set<string>();

function broadcastMatchRecorded(
  roomId: string,
  body: { ok: boolean; matchId?: string; skipped?: boolean; error?: string },
): void {
  broadcastToRoom(roomId, { type: 'match_recorded', roomId, ...body });
}

function onGameComplete(room: GameRoomRow, state: GameState): void {
  if (room.match_id) {
    broadcastMatchRecorded(room.id, { ok: true, matchId: room.match_id });
    return;
  }
  if (finishingRooms.has(room.id)) return;
  finishingRooms.add(room.id);
  void (async () => {
    try {
      const result = await finishGameFromServer(store.getById(room.id) ?? room, state);
      if ('skipped' in result && result.skipped) {
        broadcastMatchRecorded(room.id, { ok: true, skipped: true });
        return;
      }
      if (result.ok && 'matchId' in result) {
        store.setMatchId(room.id, result.matchId);
        broadcastMatchRecorded(room.id, { ok: true, matchId: result.matchId });
        return;
      }
      broadcastMatchRecorded(room.id, { ok: false, error: 'error' in result ? result.error : 'finish_failed' });
    } catch (e) {
      broadcastMatchRecorded(room.id, {
        ok: false,
        error: e instanceof Error ? e.message : 'finish_failed',
      });
    } finally {
      finishingRooms.delete(room.id);
    }
  })();
}

const sessionManager = new GameSessionManager(store, broadcastGameStateV2, onGameComplete);
sessionManager.start();

const hostAutomation = new HostAutomation(store, (room) => broadcastRoom(room));
hostAutomation.start();

store.setOnRemoveRoom((roomId) => {
  sessionManager.remove(roomId);
  hostAutomation.clearRoom(roomId);
});

const tunnelManager = new TunnelManager();

process.on('exit', () => tunnelManager.stopAll());

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== ws.OPEN) return;
  try {
    const raw = JSON.stringify(msg);
    if (raw.length > 80_000) {
      console.warn(`[updown-server] large WS frame ${raw.length} B type=${String(msg.type)}`);
    }
    ws.send(raw);
  } catch (e) {
    console.warn('[updown-server] send failed:', e instanceof Error ? e.message : e);
  }
}

function broadcastRoom(room: GameRoomRow): void {
  const subs = roomSubscribers.get(room.id);
  if (!subs) return;
  for (const client of subs) {
    sendRoomTo(client, room, 'room_snapshot');
  }
}

function broadcastRoomMeta(room: GameRoomRow): void {
  const subs = roomSubscribers.get(room.id);
  if (!subs) return;
  for (const client of subs) {
    sendRoomTo(client, room, 'room_meta');
  }
}

function subscribe(ws: WebSocket, roomId: string): void {
  let set = roomSubscribers.get(roomId);
  if (!set) {
    set = new Set();
    roomSubscribers.set(roomId, set);
  }
  set.add(ws);
  (ws as WebSocket & { subscribedRooms?: Set<string> }).subscribedRooms ??= new Set();
  (ws as WebSocket & { subscribedRooms: Set<string> }).subscribedRooms.add(roomId);
}

function unsubscribeAll(ws: WebSocket): void {
  const rooms = (ws as WebSocket & { subscribedRooms?: Set<string> }).subscribedRooms;
  if (!rooms) return;
  for (const roomId of rooms) {
    roomSubscribers.get(roomId)?.delete(ws);
  }
  rooms.clear();
}

function reply(ws: WebSocket, requestId: string | undefined, body: ServerMessage): void {
  send(ws, { ...body, requestId });
}

const v2Deps = {
  store,
  sessionManager,
  send,
  reply,
  broadcastGameState: (_subs: Set<WebSocket> | undefined, push: GameStatePush) => {
    broadcastGameStateV2(push);
  },
  broadcastRoomMeta,
  getSubscribers: (roomId: string) => roomSubscribers.get(roomId),
  viewState: (ws: WebSocket, room: GameRoomRow, state: GameStatePush['state']) => {
    if (!state || typeof state !== 'object') return state;
    const uid = viewerUserId(ws);
    const strip = shouldStripUnknownHands(uid);
    const seat = viewerSeatIndex(room, uid);
    if (seat == null && !strip) return state;
    return projectGameState(state as GameState, seat);
  },
};

function broadcastToRoom(roomId: string, payload: ServerMessage): void {
  const subs = roomSubscribers.get(roomId);
  if (!subs) return;
  for (const client of subs) {
    send(client, payload);
  }
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(ws, { type: 'error', error: 'invalid_json' });
    return;
  }

  const { requestId } = msg;
  const ip = connIp(ws);

  if (msg.type !== 'ping' && msg.type !== 'auth' && !wsLimits.allowMessage(ip)) {
    reply(ws, requestId, { type: 'error', ok: false, error: 'rate_limited' });
    return;
  }

  if (msg.type === 'auth') {
    void (async () => {
      const token = typeof msg.accessToken === 'string' ? msg.accessToken : '';
      const verified = await verifySupabaseAccessToken(token);
      if ('error' in verified) {
        reply(ws, requestId, { type: 'auth_result', ok: false, error: verified.error });
        return;
      }
      const auth = connAuth(ws);
      auth.userId = verified.userId;
      auth.authed = true;
      reply(ws, requestId, { type: 'auth_result', ok: true });
    })();
    return;
  }

  if (PLAYER_BOUND_TYPES.has(msg.type) || isV2GameCommand(msg.type)) {
    const bound = bindPlayerId(msg.playerId, connAuth(ws), WS_AUTH_MODE);
    if ('error' in bound) {
      reply(ws, requestId, { type: 'error', ok: false, error: bound.error });
      return;
    }
    msg.playerId = bound.playerId;
    if (msg.hostId) msg.hostId = bound.playerId;
  }

  if (isV2GameCommand(msg.type)) {
    handleV2GameMessage(ws, msg, v2Deps);
    return;
  }

  switch (msg.type) {
    case 'ping': {
      send(ws, { type: 'pong', requestId });
      return;
    }
    case 'subscribe_room': {
      if (!msg.roomId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'room_id_required' });
        return;
      }
      const room = store.getById(msg.roomId);
      if (!room) {
        if (WS_AUTH_MODE === 'required') {
          reply(ws, requestId, { type: 'error', ok: false, error: 'room_not_found' });
          return;
        }
        subscribe(ws, msg.roomId);
        reply(ws, requestId, { type: 'ok', ok: true });
        return;
      }
      if (!canAccessRoom(room, connAuth(ws), WS_AUTH_MODE)) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'not_member' });
        return;
      }
      subscribe(ws, msg.roomId);
      send(ws, { type: 'room_snapshot', room: roomOnWire(ws, room), requestId });
      if (room.status === 'finished') {
        send(ws, {
          type: 'match_recorded',
          roomId: room.id,
          ok: true,
          matchId: room.match_id ?? undefined,
          skipped: !room.match_id,
        });
      }
      return;
    }
    case 'list_public_waiting': {
      // Чистим зомби перед ответом залу — не ждём interval.
      store.pruneStale({
        finishedMaxAgeMs: FINISHED_MAX_AGE_MS,
        waitingMaxAgeMs: WAITING_MAX_AGE_MS,
        playingMaxAgeMs: PLAYING_MAX_AGE_MS,
      });
      const rooms = store.listPublicWaiting(WAITING_MAX_AGE_MS).map(lobbyRoomPublic);
      reply(ws, requestId, { type: 'public_rooms', ok: true, rooms });
      return;
    }
    case 'peek_room': {
      if (!msg.code) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'code_required' });
        return;
      }
      const peek = store.peekByCode(msg.code);
      reply(ws, requestId, { type: 'peek_result', ...peek });
      return;
    }
    case 'recover_join': {
      if (!msg.code || !msg.playerId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'recover_params_required' });
        return;
      }
      if (!wsLimits.allowJoin(ip)) {
        reply(ws, requestId, { type: 'recover_join_result', ok: false, error: 'rate_limited' });
        return;
      }
      const recovered = store.recoverJoin(msg.code, msg.playerId);
      if (!recovered) {
        reply(ws, requestId, { type: 'recover_join_result', ok: false });
        return;
      }
      subscribe(ws, recovered.room.id);
      reply(ws, requestId, {
        type: 'recover_join_result',
        ok: true,
        room: roomOnWire(ws, recovered.room, { keepAvatars: true }),
        roomId: recovered.room.id,
        mySlotIndex: recovered.mySlotIndex,
      });
      return;
    }
    case 'create_room': {
      if (!msg.playerId || !msg.displayName) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'player_required' });
        return;
      }
      const createGate = wsLimits.allowCreate(ip, store.listAll().length, store.countRoomsByCreatorIp(ip));
      if (!createGate.ok) {
        reply(ws, requestId, { type: 'create_room_result', ok: false, error: createGate.error });
        return;
      }
      /** LAN: по умолчанию v2 (server-authoritative). Явно protocolVersion: 1 — откат. */
      const protocolVersion = msg.protocolVersion === 1 ? 1 : 2;
      const room = store.createRoom({
        hostUserId: msg.playerId,
        displayName: msg.displayName,
        shortLabel: msg.shortLabel ?? undefined,
        avatarDataUrl: msg.avatarDataUrl,
        settlementMode: msg.settlementMode,
        buyIn: msg.buyIn,
        roomKind: msg.roomKind,
        maxPlayers: parseMaxPlayers(msg.maxPlayers),
        hostDedicated: msg.hostDedicated === true,
        protocolVersion,
        createdByIp: ip,
      });
      subscribe(ws, room.id);
      broadcastRoom(room);
      reply(ws, requestId, { type: 'create_room_result', ok: true, room: roomOnWire(ws, room, { keepAvatars: true }) });
      return;
    }
    case 'join_room': {
      if (!msg.playerId || !msg.displayName || !msg.code) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'join_params_required' });
        return;
      }
      if (!wsLimits.allowJoin(ip)) {
        reply(ws, requestId, { type: 'join_room_result', ok: false, error: 'rate_limited' });
        return;
      }
      const recovered = store.recoverJoin(msg.code, msg.playerId);
      if (recovered) {
        subscribe(ws, recovered.room.id);
        broadcastRoom(recovered.room);
        reply(ws, requestId, {
          type: 'join_room_result',
          ok: true,
          room: roomOnWire(ws, recovered.room, { keepAvatars: true }),
          roomId: recovered.room.id,
          mySlotIndex: recovered.mySlotIndex,
        });
        return;
      }
      const result = store.joinRoom({
        code: msg.code,
        userId: msg.playerId,
        displayName: msg.displayName,
        shortLabel: msg.shortLabel ?? undefined,
        avatarDataUrl: msg.avatarDataUrl,
      });
      if ('error' in result) {
        reply(ws, requestId, { type: 'join_room_result', ok: false, error: result.error });
        return;
      }
      subscribe(ws, result.room.id);
      broadcastRoom(result.room);
      reply(ws, requestId, {
        type: 'join_room_result',
        ok: true,
        room: roomOnWire(ws, result.room, { keepAvatars: true }),
        roomId: result.room.id,
        mySlotIndex: result.mySlotIndex,
      });
      return;
    }
    case 'get_room': {
      if (!msg.roomId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'room_id_required' });
        return;
      }
      const room = store.getById(msg.roomId);
      if (!room) {
        reply(ws, requestId, { type: 'get_room_result', ok: false });
        return;
      }
      if (!canAccessRoom(room, connAuth(ws), WS_AUTH_MODE)) {
        reply(ws, requestId, { type: 'get_room_result', ok: false, error: 'not_member' });
        return;
      }
      reply(ws, requestId, {
        type: 'get_room_result',
        ok: true,
        room: roomOnWire(ws, room),
      });
      return;
    }
    case 'leave_room': {
      if (!msg.roomId || !msg.playerId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'leave_params_required' });
        return;
      }
      const err = store.leaveRoom(msg.roomId, msg.playerId);
      const room = store.getById(msg.roomId);
      if (room) broadcastRoom(room);
      else chatStore.dropRoom(msg.roomId);
      reply(ws, requestId, { type: 'leave_room_result', ok: !err.error, error: err.error });
      return;
    }
    case 'chat_history': {
      if (!msg.roomId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'room_id_required' });
        return;
      }
      const room = store.getById(msg.roomId);
      if (!room) {
        reply(ws, requestId, { type: 'chat_history_result', ok: false, error: 'room_not_found' });
        return;
      }
      if (!canAccessRoom(room, connAuth(ws), WS_AUTH_MODE)) {
        reply(ws, requestId, { type: 'chat_history_result', ok: false, error: 'not_member' });
        return;
      }
      const limit = typeof msg.limit === 'number' ? msg.limit : 120;
      const messages = chatStore.history(msg.roomId, limit);
      reply(ws, requestId, { type: 'chat_history_result', ok: true, messages });
      return;
    }
    case 'chat_post': {
      if (!msg.roomId || !msg.playerId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'chat_params_required' });
        return;
      }
      const room = store.getById(msg.roomId);
      if (!room) {
        reply(ws, requestId, { type: 'chat_post_result', ok: false, error: 'room_not_found' });
        return;
      }
      const posted = chatStore.post(room, msg.playerId, msg.displayName, String(msg.body ?? ''));
      if ('error' in posted) {
        reply(ws, requestId, { type: 'chat_post_result', ok: false, error: posted.error });
        return;
      }
      broadcastToRoom(msg.roomId, {
        type: 'chat_message',
        roomId: msg.roomId,
        message: posted.message,
      });
      reply(ws, requestId, { type: 'chat_post_result', ok: true, message: posted.message });
      return;
    }
    case 'chat_typing': {
      if (!msg.roomId || !msg.playerId) return;
      const room = store.getById(msg.roomId);
      if (!room) return;
      broadcastToRoom(msg.roomId, {
        type: 'chat_typing',
        roomId: msg.roomId,
        user_id: msg.playerId,
        display_name: msg.displayName ?? undefined,
      });
      return;
    }
    case 'update_slots': {
      if (!msg.roomId || !msg.playerSlots) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'slots_required' });
        return;
      }
      if (!msg.playerId) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'player_required' });
        return;
      }
      const updated = store.updatePlayerSlots(msg.roomId, msg.playerSlots, msg.playerId);
      if ('error' in updated) {
        reply(ws, requestId, { type: 'error', ok: false, error: updated.error });
        return;
      }
      broadcastRoom(updated);
      reply(ws, requestId, { type: 'update_slots_result', ok: true, room: roomOnWire(ws, updated) });
      return;
    }
    case 'update_display_name': {
      if (!msg.roomId || !msg.playerId || !msg.displayName) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'name_params_required' });
        return;
      }
      const room = store.getById(msg.roomId);
      if (!room) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'not_found' });
        return;
      }
      const slots = (room.player_slots ?? []).map((s) =>
        s.userId === msg.playerId
          ? { ...s, displayName: String(msg.displayName).trim().slice(0, 17) }
          : s,
      );
      const updated = store.updatePlayerSlots(msg.roomId, slots, msg.playerId);
      if ('error' in updated) {
        reply(ws, requestId, { type: 'error', ok: false, error: updated.error });
        return;
      }
      let finalRoom: typeof updated = updated;
      if (room.status === 'playing' && room.game_state && typeof room.game_state === 'object') {
        const gs = room.game_state as { players?: { name?: string }[] };
        if (Array.isArray(gs.players)) {
          const slot = slots.find((s) => s.userId === msg.playerId);
          if (slot && typeof slot.slotIndex === 'number') {
            const players = gs.players.map((p, i) =>
              i === slot.slotIndex ? { ...p, name: slot.displayName } : p,
            );
            const st = store.updateRoomState(msg.roomId, { ...gs, players }, slots);
            if (st.room) finalRoom = st.room;
          }
        }
      }
      broadcastRoom(finalRoom);
      reply(ws, requestId, { type: 'update_display_name_result', ok: true, room: roomOnWire(ws, finalRoom) });
      return;
    }
    case 'update_state': {
      if (!msg.roomId || msg.gameState == null) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'state_required' });
        return;
      }
      const roomForProto = store.getById(msg.roomId);
      if (roomForProto?.protocol_version === 2) {
        reply(ws, requestId, {
          type: 'update_state_result',
          ok: false,
          error: 'protocol_v2_use_commands',
        });
        return;
      }
      const result = store.updateRoomState(msg.roomId, msg.gameState, msg.playerSlots, {
        roomPhase: msg.roomPhase,
        expectedRevision: msg.expectedRevision,
      });
      if (result.error) {
        reply(ws, requestId, { type: 'update_state_result', ok: false, error: result.error });
        return;
      }
      if (result.conflict) {
        reply(ws, requestId, {
          type: 'update_state_result',
          ok: false,
          conflict: true,
          room: result.room ? roomOnWire(ws, result.room) : result.room,
        });
        return;
      }
      if (result.room) broadcastRoom(result.room);
      reply(ws, requestId, {
        type: 'update_state_result',
        ok: true,
        room: result.room ? roomOnWire(ws, result.room) : result.room,
      });
      return;
    }
    default:
      reply(ws, requestId, { type: 'error', ok: false, error: `unknown_type:${msg.type}` });
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health' && req.method === 'GET') {
    sendJson(res, 200, {
      ok: true,
      rooms: store.listAll().length,
      uptimeSec: Math.round(process.uptime()),
      persist: !!roomPersist,
      auth: WS_AUTH_MODE,
      jwtConfigured: isJwtConfigured(),
    });
    return;
  }

  if (path === '/api/ready' && req.method === 'GET') {
    const local = localReadyStatus();
    let supabaseOk = !local.supabaseConfigured;
    if (local.supabaseConfigured) {
      supabaseOk = await supabaseAuthReachable();
    }
    const ready = local.ready && supabaseOk;
    sendJson(res, ready ? 200 : 503, {
      ...local,
      ready,
      supabaseOk,
    });
    return;
  }

  if (path === '/api/version' && req.method === 'GET') {
    sendJson(res, 200, {
      build: SERVER_HTTP_BUILD,
      hostPanel: !PROD,
      panelSnippet: PROD ? undefined : 'lan-ui',
      pid: process.pid,
      rooms: store.listAll().length,
      persist: !!roomPersist,
      uptimeSec: Math.round(process.uptime()),
      auth: WS_AUTH_MODE,
      profile: PROD ? 'production' : 'lan',
    });
    return;
  }

  if (PROD) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found.\n');
    return;
  }

  if (path === '/api/info' && req.method === 'GET') {
    const net = buildNetworkStatus(PORT, GAME_APP_PORT, tunnelManager);
    const primaryIp = (net.lanIps as string[])[0] ?? '127.0.0.1';
    sendJson(res, 200, {
      port: PORT,
      lanIps: net.lanIps,
      wsUrlLan: net.wsUrlLan,
      wsUrl: (process.env.PUBLIC_WS_URL ?? '').trim() || (net.wsUrlLan as string),
      gameAppUrlLan: net.gameAppUrlLan,
      gameAppUrl: (process.env.PUBLIC_GAME_URL ?? '').trim() || (net.gameAppUrlLan as string),
      hostPanelUrl: `http://${primaryIp}:${PORT}/host`,
      network: net,
    });
    return;
  }

  if (await handleNetworkApi(req, res, path, PORT, GAME_APP_PORT, tunnelManager)) {
    return;
  }

  if (tryServeGameStatic(req, res, path)) return;

  if (await tryServeJoinQr(req, res, path, PORT, GAME_APP_PORT)) return;

  if (path === '/' || path === '/host') {
    serveHostPanel(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(
    `Not found. Панель хоста: http://localhost:${PORT}/host (сборка ${SERVER_HTTP_BUILD}).\n` +
      'Если видите старый текст «game server OK» — остановите сервер (Ctrl+C) и снова: npm run server:dev\n',
  );
}

function attachWebSocketServer(httpServer: ReturnType<typeof createServer>): void {
  const wss = new WebSocketServer({ server: httpServer, maxPayload: WS_MAX_PAYLOAD_BYTES });
  wss.on('connection', (ws, req) => {
    const conn = ws as WsConn;
    conn.updownIp = clientIpFromUpgrade(req, TRUST_PROXY);
    conn.updownAuth = { userId: null, authed: false };
    if (!wsLimits.onSocketOpen()) {
      send(ws, { type: 'hello', ok: false, error: 'server_full' });
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      return;
    }
    send(ws, {
      type: 'hello',
      ok: true,
      authRequired: WS_AUTH_MODE === 'required',
    });
    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      handleMessage(ws, raw);
    });
    const pingIv = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, 25_000);
    pingIv.unref?.();
    ws.on('close', () => {
      clearInterval(pingIv);
      wsLimits.onSocketClose();
      unsubscribeAll(ws);
    });
  });
}

function startHttpWsServer(listenPort: number, label: string, required: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const httpServer = createServer((req, res) => {
      void handleHttp(req, res);
    });
    attachWebSocketServer(httpServer);

    const maxAttempts = required ? 20 : 1;
    let attempts = 0;
    let settled = false;

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };

    const tryListen = (): void => {
      if (httpServer.listening) {
        finish(true);
        return;
      }
      try {
        httpServer.listen(listenPort, HOST);
      } catch (err) {
        httpServer.emit('error', err);
      }
    };

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        attempts += 1;
        if (attempts < maxAttempts) {
          console.warn(
            `[updown-server] Порт ${listenPort} ещё занят, жду… (${attempts}/${maxAttempts})`,
          );
          setTimeout(tryListen, 300);
          return;
        }
        if (required) {
          console.error(
            `[updown-server] Порт ${listenPort} занят — уже крутится другой host:app.\n` +
              'Не запускайте панель второй раз во время партии: это убивает стол у всех.\n' +
              'Откройте http://localhost:3001/host в той же сессии или: npm run host:kill',
          );
          process.exit(1);
        }
        console.warn(`[updown-server] Порт ${listenPort} занят — запасной слушатель пропущен`);
        finish(false);
        return;
      }
      console.error(`[updown-server] Ошибка порта ${listenPort}:`, err.message);
      if (required) process.exit(1);
      finish(false);
    });

    httpServer.on('listening', () => {
      if (PROD) {
        console.log(`[updown-server] ${label} → http://${HOST}:${listenPort}/api/health  ws://…:${listenPort}`);
      } else {
        console.log(`[updown-server] ${label} → http://localhost:${listenPort}/host  ws://…:${listenPort}`);
      }
      finish(true);
    });

    tryListen();
  });
}

const wsBackupPorts = parseLanBackupPorts(PORT, process.env.WS_BACKUP_PORTS);

function printReadyBanner(): void {
  const ip = listLanIPv4()[0] ?? '127.0.0.1';
  console.log('');
  console.log(`[updown-server] Сборка ${SERVER_HTTP_BUILD}  PID ${process.pid}`);
  if (!PROD) {
    console.log(`[updown-server] host.html → ${hostHtmlPath()}`);
    console.log(`[updown-server] Панель хоста → http://localhost:${PORT}/host`);
    console.log(`[updown-server] В Wi‑Fi: http://${ip}:${PORT}/host  ws://${ip}:${PORT}`);
    if (isGameDistAvailable()) {
      console.log(`[updown-server] QR и вход: http://${ip}:${PORT}/play/`);
    } else {
      console.log(`[updown-server] Для QR: npm run build:host-game  и перезапуск`);
    }
  }
  if (wsBackupPorts.length) {
    console.log(
      `[updown-server] Запасные WS: ${wsBackupPorts.map((p) => `ws://${ip}:${p}`).join(', ')}`,
    );
  }
  console.log('[updown-server] Health: http://localhost:' + PORT + '/api/health');
  console.log('[updown-server] Ready:  http://localhost:' + PORT + '/api/ready');
  console.log('[updown-server] Проверка: http://localhost:' + PORT + '/api/version');
  console.log('');
}

void (async () => {
  await startHttpWsServer(PORT, 'Основной', true);
  for (const backupPort of wsBackupPorts) {
    void startHttpWsServer(backupPort, `Запасной WS :${backupPort}`, false);
  }
  printReadyBanner();
})();

function shutdown(signal: string): void {
  console.log(`[updown-server] ${signal} — сохраняем комнаты и выходим`);
  try {
    roomPersist?.flushSync();
    roomPersist?.rotateBackup('shutdown');
  } catch {
    /* ignore */
  }
  try {
    tunnelManager.stopAll();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[updown-server] uncaughtException', err);
  try {
    roomPersist?.flushSync();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[updown-server] unhandledRejection', reason);
  try {
    roomPersist?.flushSync();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
