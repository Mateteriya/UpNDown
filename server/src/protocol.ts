/** Типы протокола WS (зеркало клиента src/lib/onlineGameWs.ts). */

export type GameRoomPhase = 'lobby' | 'playing' | 'waiting_host_action' | 'waiting_return' | 'finished';

export interface PlayerSlot {
  userId?: string | null;
  displayName: string;
  slotIndex: number;
  avatarDataUrl?: string | null;
  shortLabel?: string | null;
  absent?: boolean | null;
  deviceId?: string | null;
  replacedUserId?: string | null;
  replacedDisplayName?: string | null;
  pausedByUser?: boolean | null;
}

export interface GameRoomRow {
  id: string;
  code: string;
  host_user_id: string | null;
  /** Хост только управляет сервером, не занимает слот за столом (панель Up&Down Host). */
  host_dedicated?: boolean;
  status: 'waiting' | 'playing' | 'finished';
  game_state: unknown;
  game_state_revision?: number;
  player_slots: PlayerSlot[];
  created_at: string;
  updated_at: string;
  room_phase?: GameRoomPhase | string | null;
  settlement_mode?: string | null;
  buy_in?: number | null;
  room_kind?: string | null;
}

export interface ClientMessage {
  type: string;
  requestId?: string;
  playerId?: string;
  roomId?: string;
  code?: string;
  displayName?: string;
  shortLabel?: string | null;
  avatarDataUrl?: string | null;
  settlementMode?: string;
  buyIn?: number | null;
  roomKind?: string;
  /** Создать комнату без слота для создателя (отдельная панель хоста). */
  hostDedicated?: boolean;
  gameState?: unknown;
  playerSlots?: PlayerSlot[];
  roomPhase?: GameRoomPhase;
  hostLastSeenAtNow?: boolean;
  expectedRevision?: number;
}

export interface ServerMessage {
  type: string;
  requestId?: string;
  ok?: boolean;
  error?: string;
  room?: GameRoomRow;
  roomId?: string;
  mySlotIndex?: number;
  conflict?: boolean;
  rooms?: GameRoomRow[];
}
