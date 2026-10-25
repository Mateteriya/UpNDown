/**
 * Умный глиф ★ по балансу.
 * Границы: 0 · 1–9 · 10–100 · 101–999 · 1000–9999 · 10000+.
 */

export type StarGlyphTier =
  | 'empty'
  | 'spark'
  | 'bright'
  | 'bold'
  | 'premium'
  | 'mythic';

export function starGlyphTierFromBalance(balance: number): StarGlyphTier {
  const n = Math.max(0, Math.floor(Number.isFinite(balance) ? balance : 0));
  if (n <= 0) return 'empty';
  if (n < 10) return 'spark';
  if (n <= 100) return 'bright';
  if (n <= 999) return 'bold';
  if (n <= 9999) return 'premium';
  return 'mythic';
}

export type StarGlyphTierLabSample = {
  tier: StarGlyphTier;
  /** Типичный баланс для превью в лабе */
  sample: number;
  rangeLabel: string;
  titleRu: string;
  titleEn: string;
  blurbRu: string;
  blurbEn: string;
};

/** Все тиры для /star-glyph-lab — смотреть до финальной полировки в игре */
export const STAR_GLYPH_TIER_LAB_SAMPLES: readonly StarGlyphTierLabSample[] = [
  {
    tier: 'empty',
    sample: 0,
    rangeLabel: '0',
    titleRu: 'Пустая',
    titleEn: 'Hollow',
    blurbRu: 'Нет звёзд — контур, полая внутри',
    blurbEn: 'No stars — outline only',
  },
  {
    tier: 'spark',
    sample: 5,
    rangeLabel: '1–9',
    titleRu: 'Искра',
    titleEn: 'Spark',
    blurbRu: 'Заполнена, но спокойнее и проще текущей яркой',
    blurbEn: 'Filled, quieter than the current bright look',
  },
  {
    tier: 'bright',
    sample: 42,
    rangeLabel: '10–100',
    titleRu: 'Яркая',
    titleEn: 'Bright',
    blurbRu: 'Как сейчас у вас в слоте — базовый яркий глиф',
    blurbEn: 'Current bright glyph (table default)',
  },
  {
    tier: 'bold',
    sample: 350,
    rangeLabel: '101–999',
    titleRu: 'Выпуклая',
    titleEn: 'Bold',
    blurbRu: 'Жирнее, объёмнее, чуть «выпуклая»',
    blurbEn: 'Bolder, more convex volume',
  },
  {
    tier: 'premium',
    sample: 2500,
    rangeLabel: '1000–9999',
    titleRu: 'Премиум 3D',
    titleEn: 'Premium 3D',
    blurbRu: 'Пышнее, сильный 3D, премиальный блеск',
    blurbEn: 'Fuller, strong 3D, premium sheen',
  },
  {
    tier: 'mythic',
    sample: 12000,
    rangeLabel: '10000+',
    titleRu: 'Мифик',
    titleEn: 'Mythic',
    blurbRu: 'Самый красивый глиф — максимум сияния',
    blurbEn: 'Top-tier glyph — maximum radiance',
  },
] as const;
