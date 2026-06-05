/**
 * Типы комнаты: режим итога, buy-in, visibility.
 */

import type { SettlementMode } from '../game/partySettlement';
import { DEFAULT_BANK_DEMO_BUY_IN } from './productFlags';

export type RoomKind = 'private' | 'public';

export interface CreateRoomOptions {
  settlementMode?: SettlementMode;
  buyIn?: number;
  roomKind?: RoomKind;
  /** WS: хост только на панели / отдельном ПК, без слота за столом. */
  hostDedicated?: boolean;
}

export const DEFAULT_CASUAL_SETTLEMENT: SettlementMode = 'accuracy_bonus';

export function normalizeCreateRoomOptions(opts?: CreateRoomOptions): {
  settlementMode: SettlementMode;
  buyIn: number | null;
  roomKind: RoomKind;
} {
  const settlementMode = opts?.settlementMode ?? DEFAULT_CASUAL_SETTLEMENT;
  const roomKind = opts?.roomKind ?? 'private';
  if (settlementMode === 'prize_pool') {
    return {
      settlementMode,
      buyIn: opts?.buyIn ?? DEFAULT_BANK_DEMO_BUY_IN,
      roomKind,
    };
  }
  return { settlementMode, buyIn: null, roomKind };
}

export function settlementModeBadgeLabel(mode: SettlementMode, buyIn: number | null): string {
  if (mode === 'prize_pool') {
    return `Банк · взнос ${buyIn ?? DEFAULT_BANK_DEMO_BUY_IN} (демо)`;
  }
  if (mode === 'accuracy_bonus') return 'Точный заказ';
  if (mode === 'vs_average') return 'Середина стола';
  return 'Только очки';
}

export interface PublicWaitingRoomRow {
  id: string;
  code: string;
  settlement_mode: SettlementMode;
  buy_in: number | null;
  room_kind: RoomKind;
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
  human_count?: number;
}
