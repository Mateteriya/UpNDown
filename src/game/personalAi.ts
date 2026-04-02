/**
 * Персональный ИИ: профиль по данным игрока (стиль, успешность), совет по заказу.
 * Используется при ручной паузе игрока и для «лучшей версии» себя.
 * @see docs/PERSONAL-AI-CONCEPT.md
 */

import type { GameState } from './GameEngine';
import { getDealOutcomes, type DealOutcomeRecord } from './aiLearning';

export interface PersonalBidProfile {
  /** По ключу (tricksInDeal, trump) — средний заказ при точном попадании */
  avgBidWhenHit: Record<string, number>;
  /** Доля точных попаданий в целом */
  hitRate: number;
  /** Количество раздач в выборке */
  sampleCount: number;
}

const key = (tricks: number, trump: boolean) => `${tricks}-${trump ? 1 : 0}`;

/** Построить профиль заказов по истории раздач. */
export function buildPersonalBidProfile(profileId: string): PersonalBidProfile | null {
  const records = getDealOutcomes(profileId);
  if (records.length < 3) return null;

  const byKey: Record<string, { sum: number; count: number }> = {};
  let hits = 0;
  for (const r of records) {
    const k = key(r.tricksInDeal, r.trump);
    if (!byKey[k]) byKey[k] = { sum: 0, count: 0 };
    if (r.hit) {
      byKey[k].sum += r.bid;
      byKey[k].count += 1;
      hits += 1;
    }
  }

  const avgBidWhenHit: Record<string, number> = {};
  for (const [k, v] of Object.entries(byKey)) {
    if (v.count > 0) avgBidWhenHit[k] = v.sum / v.count;
  }

  return {
    avgBidWhenHit,
    hitRate: records.length > 0 ? hits / records.length : 0,
    sampleCount: records.length,
  };
}

/** Рекомендованный заказ на основе персонального профиля (или null — использовать базовый ИИ). */
export function suggestPersonalBid(
  state: GameState,
  playerIndex: number,
  profileId: string | null
): number | null {
  if (!profileId) return null;
  const profile = buildPersonalBidProfile(profileId);
  if (!profile || profile.sampleCount < 5) return null;

  const { tricksInDeal, trump, bids, dealerIndex } = state;
  const trumpBool = trump != null;
  const k = key(tricksInDeal, trumpBool);
  const suggested = profile.avgBidWhenHit[k];
  if (suggested == null) return null;

  const rounded = Math.round(suggested);
  const dealer = dealerIndex === playerIndex;
  if (dealer) {
    const othersSum = bids
      .map((b, i) => (i !== dealerIndex && b !== null ? b : 0))
      .reduce((a, b) => a + b, 0);
    const forbidden = tricksInDeal - othersSum;
    if (forbidden >= 0 && forbidden <= tricksInDeal && rounded === forbidden) {
      const alt = forbidden === 0 ? 1 : forbidden === tricksInDeal ? tricksInDeal - 1 : forbidden - 1;
      return Math.max(0, Math.min(tricksInDeal, alt));
    }
  }
  return Math.max(0, Math.min(tricksInDeal, rounded));
}
