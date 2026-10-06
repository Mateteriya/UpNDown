/**
 * Клиентская таблица уровней ELO (open ladder).
 * Не требует миграций — отображение поверх player_ratings.elo.
 */

export type EloTierId =
  | 'novice'
  | 'amateur'
  | 'regular'
  | 'adept'
  | 'expert'
  | 'master'
  | 'legend';

export interface EloTierDef {
  id: EloTierId;
  /** Нижняя граница включительно */
  minElo: number;
  /** Верхняя граница исключительно; null = без потолка */
  maxElo: number | null;
}

/** Старт ELO в продукте = 1000. */
export const ELO_TIERS: readonly EloTierDef[] = [
  { id: 'novice', minElo: 0, maxElo: 900 },
  { id: 'amateur', minElo: 900, maxElo: 1000 },
  { id: 'regular', minElo: 1000, maxElo: 1100 },
  { id: 'adept', minElo: 1100, maxElo: 1200 },
  { id: 'expert', minElo: 1200, maxElo: 1350 },
  { id: 'master', minElo: 1350, maxElo: 1500 },
  { id: 'legend', minElo: 1500, maxElo: null },
] as const;

export function eloTierFor(elo: number): EloTierDef {
  const n = Number.isFinite(elo) ? elo : 1000;
  for (let i = ELO_TIERS.length - 1; i >= 0; i--) {
    const t = ELO_TIERS[i]!;
    if (n >= t.minElo) return t;
  }
  return ELO_TIERS[0]!;
}

export function eloTierProgress(elo: number): {
  tier: EloTierDef;
  next: EloTierDef | null;
  /** 0..1 внутри текущего тира */
  progressInTier: number;
  pointsToNext: number | null;
} {
  const tier = eloTierFor(elo);
  const idx = ELO_TIERS.findIndex((t) => t.id === tier.id);
  const next = idx >= 0 && idx < ELO_TIERS.length - 1 ? ELO_TIERS[idx + 1]! : null;
  if (!next || tier.maxElo == null) {
    return { tier, next: null, progressInTier: 1, pointsToNext: null };
  }
  const span = tier.maxElo - tier.minElo;
  const into = Math.max(0, Math.min(span, elo - tier.minElo));
  return {
    tier,
    next,
    progressInTier: span > 0 ? into / span : 1,
    pointsToNext: Math.max(0, Math.ceil(tier.maxElo - elo)),
  };
}
