/**
 * Космогенез Junior / Galaxy: 3 игрока, 4 стихии × 5 сил = 20 кристаллов.
 */

export type ElementId = 'fire' | 'water' | 'earth' | 'air';

export type CrystalTier = 'spark' | 'warm' | 'storm' | 'comet' | 'nova';

export interface Crystal {
  element: ElementId;
  tier: CrystalTier;
}

export const TIER_POWER: Record<CrystalTier, number> = {
  spark: 1,
  warm: 2,
  storm: 3,
  comet: 4,
  nova: 5,
};

export const ALL_TIERS: CrystalTier[] = ['spark', 'warm', 'storm', 'comet', 'nova'];
export const ALL_ELEMENTS: ElementId[] = ['fire', 'water', 'earth', 'air'];

/** Тур «Галактика»: 13 базовых + 2 особых */
export const KID_DEALS_TOTAL = 15;

export const KID_PLAYER_COUNT = 3;

export type KidDealKind =
  | 'normal'
  | 'calm'
  | 'blind'
  | 'finale'
  | 'void-day'
  | 'double-shard';

export function crystalKey(c: Crystal): string {
  return `${c.element}:${c.tier}`;
}

export function sameCrystal(a: Crystal, b: Crystal): boolean {
  return a.element === b.element && a.tier === b.tier;
}

export function kidHandSize(dealNumber: number): number {
  if (dealNumber <= 5) return dealNumber;
  if (dealNumber === 6) return 5;
  if (dealNumber <= 10) return 11 - dealNumber;
  if (dealNumber === 13) return 5;
  if (dealNumber <= 15) return 3;
  return 3;
}

export function kidDealKind(dealNumber: number): KidDealKind {
  if (dealNumber === 11) return 'calm';
  if (dealNumber === 12) return 'blind';
  if (dealNumber === 13) return 'finale';
  if (dealNumber === 14) return 'void-day';
  if (dealNumber === 15) return 'double-shard';
  return 'normal';
}

/** Осколки за точный заказ в этом раунде */
export function kidShardsForExactDeal(dealNumber: number): number {
  return kidDealKind(dealNumber) === 'double-shard' ? 2 : 1;
}

export function kidDealPhaseLabel(dealNumber: number): string {
  if (dealNumber <= 5) {
    const w = ['', 'Один', 'Два', 'Три', 'Четыре', 'Пять'];
    return `Восход · ${w[dealNumber]}`;
  }
  if (dealNumber === 6) return 'Пик · пять ✦';
  if (dealNumber <= 10) {
    const w = ['', 'Один', 'Два', 'Три', 'Четыре'];
    return `Закат · ${w[11 - dealNumber]}`;
  }
  if (dealNumber === 11) return 'Тишина · без главной';
  if (dealNumber === 12) return 'Слепой заказ ✦';
  if (dealNumber === 13) return 'Финал · пять ✦';
  if (dealNumber === 14) return 'День без Хаоса ✦';
  return 'Двойной осколок ✦✦';
}

export function kidDealHasDominant(dealNumber: number): boolean {
  const k = kidDealKind(dealNumber);
  return k === 'normal' || k === 'finale' || k === 'blind';
}
