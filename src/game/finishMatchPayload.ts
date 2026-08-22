/**
 * Payload конца партии (очки, места, история) — один расчёт для WS-сервера и клиента.
 */

import type { DealResult, GameState } from './GameEngine';
import { computePartySettlement, type SettlementMode } from './partySettlement';

export type FinishSlot = {
  slotIndex: number;
  userId?: string | null;
  displayName?: string;
  shortLabel?: string | null;
  replacedUserId?: string | null;
};

export type FinishPlayerRow = {
  slot_index: number;
  user_id: string | null;
  display_name: string;
  is_ai: boolean;
  final_score: number;
  bid_accuracy: number | null;
  interrupted: boolean;
  is_rated: boolean;
  replaced_user_id: string | null;
  place: number | null;
};

export type FinishGameDealHistoryEntry = {
  dealNumber: number;
  bids: number[];
  points: number[];
  takens?: number[];
};

export function dealResultsToFinishRpcPayload(bh: readonly DealResult[]): FinishGameDealHistoryEntry[] {
  return bh.map((d) => ({
    dealNumber: d.dealNumber,
    bids: d.bids,
    points: d.points,
    ...(d.takens ? { takens: d.takens } : {}),
  }));
}

export function chipsBySlotFromState(
  snapshot: GameState,
  settlementMode: string | null | undefined,
  buyIn: number | null | undefined,
): Record<string, number> | null {
  const mode = settlementMode ?? snapshot.settlementMode ?? 'accuracy_bonus';
  const n = snapshot.players.length;
  if (n !== 3 && n !== 4) return null;
  const settle = computePartySettlement(snapshot.dealHistory ?? [], n, mode as SettlementMode, {
    buyIn: buyIn ?? snapshot.buyIn ?? undefined,
  });
  const chips: Record<string, number> = {};
  for (const row of settle.rows) chips[String(row.playerIndex)] = row.chips;
  return Object.keys(chips).length ? chips : null;
}

export function buildFinishMatchPlayers(
  snapshot: GameState,
  playerSlots: FinishSlot[],
  dealHistory?: GameState['dealHistory'],
): FinishPlayerRow[] {
  const players = snapshot.players;
  const bh = dealHistory ?? snapshot.dealHistory ?? [];
  const calcAcc = (pi: number) => {
    if (!bh.length) return null;
    let met = 0;
    for (const d of bh) {
      const bid = d.bids[pi];
      const pts = d.points[pi];
      if (bid == null) continue;
      const taken =
        d.takens?.[pi] != null
          ? d.takens[pi]!
          : Math.max(0, Math.round((pts + Math.abs(pts)) / 20));
      if (bid === taken) met++;
    }
    return Math.round((met / bh.length) * 100);
  };
  const order = players.map((p, i) => ({ i, s: p.score })).sort((a, b) => b.s - a.s);
  const placeByIndex: Record<number, number> = {};
  let prevScore: number | null = null;
  let prevPlace = 0;
  order.forEach((row, idx) => {
    const score = row.s;
    const place = prevScore === null ? 1 : score === prevScore ? prevPlace : idx + 1;
    placeByIndex[row.i] = place;
    prevScore = score;
    prevPlace = place;
  });
  return players.map((p, i) => {
    const slot = playerSlots.find((s) => s.slotIndex === i);
    const userId = slot?.userId ?? null;
    const isAi = !userId;
    const interrupted = !!slot?.replacedUserId;
    return {
      slot_index: i,
      user_id: userId,
      display_name: (() => {
        const fromSlot = slot?.displayName?.trim() || slot?.shortLabel?.trim() || '';
        const fromPlayer = (p.name || '').trim();
        return (fromSlot || fromPlayer || 'Игрок').slice(0, 80);
      })(),
      is_ai: isAi,
      final_score: p.score,
      bid_accuracy: calcAcc(i),
      interrupted,
      is_rated: !interrupted,
      replaced_user_id: slot?.replacedUserId ?? null,
      place: placeByIndex[i] ?? null,
    };
  });
}
