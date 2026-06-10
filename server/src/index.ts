/**
 * Локальный игровой сервер Up&Down (WebSocket).
 * Запуск: npm run dev --prefix server
 * Слушает 0.0.0.0 — телефоны в Wi‑Fi подключаются к ws://IP_ПК:3001
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { HostAutomation } from './hostAutomation.js';
import { tryServeGameStatic, isGameDistAvailable } from './gameStatic.js';
import { tryServeJoinQr } from './qrHttp.js';
import { readFileSync } from 'node:fs';
import { SERVER_HTTP_BUILD, serveHostPanel, hostHtmlPath } from './hostPanelHtml.js';
import { buildNetworkStatus, handleNetworkApi } from './networkHttp.js';
import { parseLanBackupPorts } from './lanPorts.js';
import { listLanIPv4 } from './networkInfo.js';
import { RoomStore } from './rooms.js';
import { TunnelManager } from './tunnelManager.js';
import type { ClientMessage, GameRoomRow, ServerMessage } from './protocol.js';
import { GameSessionManager } from './v2/GameSessionManager.js';
import { handleV2GameMessage, isV2GameCommand } from './v2/handlers.js';
import type { GameStatePush } from './v2/protocol.js';

const GAME_APP_PORT = Number(process.env.GAME_APP_PORT ?? 5173);

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';

const store = new RoomStore();
const roomSubscribers = new Map<string, Set<WebSocket>>();

function broadcastGameStateV2(push: GameStatePush): void {
  const subs = roomSubscribers.get(push.roomId);
  if (!subs) return;
  for (const client of subs) {
    send(client, push);
  }
}

const sessionManager = new GameSessionManager(store, broadcastGameStateV2);
sessionManager.start();

const hostAutomation = new HostAutomation(store, (room) => broadcastRoom(room));
hostAutomation.start();

const tunnelManager = new TunnelManager();

process.on('exit', () => tunnelManager.stopAll());

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoom(room: GameRoomRow): void {
  const subs = roomSubscribers.get(room.id);
  if (!subs) return;
  const payload: ServerMessage = { type: 'room_snapshot', room };
  for (const client of subs) {
    send(client, payload);
  }
}

function broadcastRoomMeta(room: GameRoomRow): void {
  const subs = roomSubscribers.get(room.id);
  if (!subs) return;
  const payload: ServerMessage = { type: 'room_meta', room };
  for (const client of subs) {
    send(client, payload);
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
  broadcastGameState: (subs: Set<WebSocket> | undefined, push: GameStatePush) => {
    if (!subs) return;
    for (const client of subs) {
      send(client, push);
    }
  },
  broadcastRoomMeta,
  getSubscribers: (roomId: string) => roomSubscribers.get(roomId),
};

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage;
  try {
    msg = JSON.parse(raw) as ClientMessage;
  } catch {
    send(ws, { type: 'error', error: 'invalid_json' });
    return;
  }

  const { requestId } = msg;

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
      subscribe(ws, msg.roomId);
      const room = store.getById(msg.roomId);
      if (room) send(ws, { type: 'room_snapshot', room, requestId });
      else reply(ws, requestId, { type: 'ok', ok: true });
      return;
    }
    case 'list_public_waiting': {
      const rooms = store.listPublicWaiting();
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
      const recovered = store.recoverJoin(msg.code, msg.playerId);
      if (!recovered) {
        reply(ws, requestId, { type: 'recover_join_result', ok: false });
        return;
      }
      subscribe(ws, recovered.room.id);
      reply(ws, requestId, {
        type: 'recover_join_result',
        ok: true,
        room: recovered.room,
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
        hostDedicated: msg.hostDedicated === true,
        protocolVersion,
      });
      subscribe(ws, room.id);
      broadcastRoom(room);
      reply(ws, requestId, { type: 'create_room_result', ok: true, room });
      return;
    }
    case 'join_room': {
      if (!msg.playerId || !msg.displayName || !msg.code) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'join_params_required' });
        return;
      }
      const recovered = store.recoverJoin(msg.code, msg.playerId);
      if (recovered) {
        subscribe(ws, recovered.room.id);
        broadcastRoom(recovered.room);
        reply(ws, requestId, {
          type: 'join_room_result',
          ok: true,
          room: recovered.room,
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
        room: result.room,
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
      reply(ws, requestId, { type: 'get_room_result', ok: !!room, room: room ?? undefined });
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
      reply(ws, requestId, { type: 'leave_room_result', ok: !err.error, error: err.error });
      return;
    }
    case 'update_slots': {
      if (!msg.roomId || !msg.playerSlots) {
        reply(ws, requestId, { type: 'error', ok: false, error: 'slots_required' });
        return;
      }
      const updated = store.updatePlayerSlots(msg.roomId, msg.playerSlots);
      if ('error' in updated) {
        reply(ws, requestId, { type: 'error', ok: false, error: updated.error });
        return;
      }
      broadcastRoom(updated);
      reply(ws, requestId, { type: 'update_slots_result', ok: true, room: updated });
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
      const updated = store.updatePlayerSlots(msg.roomId, slots);
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
      reply(ws, requestId, { type: 'update_display_name_result', ok: true, room: finalRoom });
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
          room: result.room,
        });
        return;
      }
      if (result.room) broadcastRoom(result.room);
      reply(ws, requestId, { type: 'update_state_result', ok: true, room: result.room });
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

  if (path === '/api/version' && req.method === 'GET') {
    let panelSnippet = '';
    try {
      const html = readFileSync(hostHtmlPath(), 'utf8');
      panelSnippet = html.includes('Игра в сети') ? 'lan-ui' : html.includes('Туннель') ? 'old-ui' : 'unknown-ui';
    } catch {
      panelSnippet = 'no-host-html';
    }
    sendJson(res, 200, {
      build: SERVER_HTTP_BUILD,
      hostPanel: true,
      panelSnippet,
      hostHtmlPath: hostHtmlPath(),
      pid: process.pid,
    });
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
  const wss = new WebSocketServer({ server: httpServer });
  wss.on('connection', (ws) => {
    send(ws, { type: 'hello', ok: true });
    ws.on('message', (data) => {
      const raw = typeof data === 'string' ? data : data.toString('utf8');
      handleMessage(ws, raw);
    });
    ws.on('close', () => unsubscribeAll(ws));
  });
}

function startHttpWsServer(listenPort: number, label: string): void {
  const httpServer = createServer((req, res) => {
    void handleHttp(req, res);
  });
  attachWebSocketServer(httpServer);
  httpServer.listen(listenPort, HOST, () => {
    console.log(`[updown-server] ${label} → http://localhost:${listenPort}/host  ws://…:${listenPort}`);
  });
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[updown-server] Порт ${listenPort} занят — запасной слушатель пропущен`);
      return;
    }
    console.error(`[updown-server] Ошибка порта ${listenPort}:`, err.message);
  });
}

const wsBackupPorts = parseLanBackupPorts(PORT, process.env.WS_BACKUP_PORTS);

startHttpWsServer(PORT, 'Основной');
for (const backupPort of wsBackupPorts) {
  startHttpWsServer(backupPort, `Запасной WS :${backupPort}`);
}

const ip = listLanIPv4()[0] ?? '127.0.0.1';
console.log('');
console.log(`[updown-server] Сборка ${SERVER_HTTP_BUILD}  PID ${process.pid}`);
console.log(`[updown-server] host.html → ${hostHtmlPath()}`);
console.log(`[updown-server] Панель хоста → http://localhost:${PORT}/host`);
console.log(`[updown-server] В Wi‑Fi: http://${ip}:${PORT}/host  ws://${ip}:${PORT}`);
if (isGameDistAvailable()) {
  console.log(`[updown-server] QR и вход: http://${ip}:${PORT}/play/`);
} else {
  console.log(`[updown-server] Для QR: npm run build:host-game  и перезапуск`);
}
if (wsBackupPorts.length) {
  console.log(
    `[updown-server] Запасные WS: ${wsBackupPorts.map((p) => `ws://${ip}:${p}`).join(', ')}`,
  );
}
console.log('[updown-server] Проверка: http://localhost:' + PORT + '/api/version');
console.log('');
