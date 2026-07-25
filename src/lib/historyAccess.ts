/**
 * Free / premium доступ к деталям раздач в архиве.
 * @see docs/PLAN-RATING-ELO-HISTORY-TIERS.md
 */

import type { DealResult } from '../game/GameEngine';
import { FREE_FULL_DEAL_LIMIT, PREMIUM_HISTORY_ENABLED } from './productFlags';

/** Лёгкий срез: номер + очки (без bids/takens). */
export type LightDealResult = {
  dealNumber: number;
  points: number[];
  bids?: undefined;
  takens?: undefined;
  _light?: true;
};

export type GatedDealRow = DealResult | LightDealResult;

export function isPremiumHistory(): boolean {
  return PREMIUM_HISTORY_ENABLED;
}

export function freeFullDealLimit(): number {
  return FREE_FULL_DEAL_LIMIT;
}

export function isFullDealRow(d: GatedDealRow): d is DealResult {
  return Array.isArray((d as DealResult).bids);
}

/** Последние N раздач полные; более ранние — только points (и для уже сжатых в облаке). */
export function gateDealHistoryForViewer(
  deals: readonly DealResult[],
  opts?: { premium?: boolean; fullLimit?: number },
): GatedDealRow[] {
  const premium = opts?.premium ?? isPremiumHistory();
  if (premium || deals.length === 0) return [...deals];

  const limit = opts?.fullLimit ?? freeFullDealLimit();
  const fullFrom = Math.max(0, deals.length - limit);

  return deals.map((d, i) => {
    const alreadyLight = !Array.isArray(d.bids);
    if (alreadyLight) {
      return {
        dealNumber: d.dealNumber,
        points: Array.isArray(d.points) ? [...d.points] : [],
        _light: true as const,
      };
    }
    if (i >= fullFrom) return d;
    return {
      dealNumber: d.dealNumber,
      points: [...d.points],
      _light: true as const,
    };
  });
}
