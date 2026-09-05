/**
 * Типы комнаты: режим итога, buy-in, visibility.
 */

import type { SettlementMode } from '../game/partySettlement';
import type { PlayerCount } from '../game/GameEngine';
import { DEFAULT_BANK_DEMO_BUY_IN } from './productFlags';

export type RoomKind = 'private' | 'public';

export interface CreateRoomOptions {
  maxPlayers?: PlayerCount;
  settlementMode?: SettlementMode;
  buyIn?: number;
  roomKind?: RoomKind;
  /** WS: хост только на панели / отдельном ПК, без слота за столом. */
  hostDedicated?: boolean;
}

export const DEFAULT_CASUAL_SETTLEMENT: SettlementMode = 'accuracy_bonus';

/** 3 только при явном значении 3 (число или строка); иначе 4. */
export function parseMaxPlayers(value: unknown): PlayerCount {
  if (value === 3 || value === '3') return 3;
  return 4;
}

export function normalizeCreateRoomOptions(opts?: CreateRoomOptions): {
  settlementMode: SettlementMode;
  buyIn: number | null;
  roomKind: RoomKind;
  maxPlayers: PlayerCount;
} {
  const settlementMode = opts?.settlementMode ?? DEFAULT_CASUAL_SETTLEMENT;
  const roomKind = opts?.roomKind ?? 'private';
  const maxPlayers = parseMaxPlayers(opts?.maxPlayers);
  if (settlementMode === 'prize_pool') {
    return {
      settlementMode,
      buyIn: opts?.buyIn ?? DEFAULT_BANK_DEMO_BUY_IN,
      roomKind,
      maxPlayers,
    };
  }
  return { settlementMode, buyIn: null, roomKind, maxPlayers };
}

import { t } from '../i18n';

export function settlementModeBadgeLabel(mode: SettlementMode, buyIn: number | null): string {
  if (mode === 'prize_pool') {
    return t('settlement.bank', { n: buyIn ?? DEFAULT_BANK_DEMO_BUY_IN });
  }
  if (mode === 'accuracy_bonus') return t('settlement.accuracy');
  if (mode === 'vs_average') return t('settlement.average');
  return t('settlement.points');
}

export interface PublicWaitingRoomRow {
  id: string;
  code: string;
  settlement_mode: SettlementMode;
  buy_in: number | null;
  room_kind: RoomKind;
  max_players?: PlayerCount;
  human_count: number;
  updated_at?: string;
}

export interface RoomPeekResult {
  ok: boolean;
  error?: string;
  code?: string;
  status?: string;
  settlement_mode?: SettlementMode;
  buy_in?: number | null;
  room_kind?: RoomKind;
  max_players?: PlayerCount;
  human_count?: number;
}
