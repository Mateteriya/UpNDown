import type { GameState } from './GameEngine';
import { getTakenFromDealPoints } from './scoring';

/** Доля раздач в партии, где заказ игрока совпал с взятыми взятками. */
export function getBidAccuracyInGame(dealHistory: GameState['dealHistory'], playerIndex: number): number {
  if (!dealHistory?.length) return 0;
  let met = 0;
  for (const deal of dealHistory) {
    const bid = deal.bids[playerIndex];
    const points = deal.points[playerIndex];
    if (bid == null) continue;
    const taken = getTakenFromDealPoints(bid, points);
    if (bid === taken) met++;
  }
  return Math.round((met / dealHistory.length) * 100);
}
