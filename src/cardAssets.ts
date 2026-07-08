/**
 * Пути к PNG фигурных карт и предзагрузка для быстрого отображения.
 */

const JACK_CAT_BY_SUIT: Record<string, string> = {
  '♠': 'jack-cat-hat-spades.png',
  '♥': 'jack-cat-hat-hearts.png',
  '♦': 'jack-cat-hat-diamonds.png',
  '♣': 'jack-cat-hat-clubs.png',
};

const QUEEN_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Дама Пики.png',
  '♥': 'Дама Черви.png',
  '♦': 'Дама Буби.png',
  '♣': 'Дама Крести.png',
};

const KING_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Король Пики.png',
  '♥': 'Король Черви.png',
  '♦': 'Король Буби.png',
  '♣': 'Король Крести.png',
};

const ACE_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Туз Пик.png',
  '♥': 'Туз Червей.png',
  '♦': 'Туз Бубей.png',
  '♣': 'Туз Крестей.png',
};

function getAllCardImagePaths(): string[] {
  const paths: string[] = [];
  const add = (name: string) => paths.push(`/cards/${encodeURIComponent(name)}`);
  Object.values(JACK_CAT_BY_SUIT).forEach(add);
  Object.values(QUEEN_IMAGE_BY_SUIT).forEach(add);
  Object.values(KING_IMAGE_BY_SUIT).forEach(add);
  Object.values(ACE_IMAGE_BY_SUIT).forEach(add);
  return paths;
}

const CARD_IMAGE_PATHS = getAllCardImagePaths();

/** Кэш URL картинок, уже загруженных в браузере. Используется, чтобы не показывать плейсхолдер при повторном появлении карты (напр. со стола). */
const loadedImageUrls = new Set<string>();

export function isCardImageCached(src: string): boolean {
  return loadedImageUrls.has(src);
}

export function markCardImageLoaded(src: string): void {
  if (src) loadedImageUrls.add(src);
}

/** Русские буквы фигур: J→В, Q→Д, K→К, A→Т */
export const FACE_RANK_LABEL: Record<string, string> = {
  J: 'В',
  Q: 'Д',
  K: 'К',
  A: 'Т',
};

const FACE_RANKS = new Set(['J', 'Q', 'K', 'A']);

export function isFaceRank(rank: string): rank is 'J' | 'Q' | 'K' | 'A' {
  return FACE_RANKS.has(rank);
}

export function getFaceRankLabel(rank: string): string {
  return FACE_RANK_LABEL[rank] ?? rank;
}

/** PNG фигурной карты для мини-иллюстрации рядом с козырем. */
export function getFaceCardImageSrc(rank: string, suit: string): string | null {
  if (rank === 'J' && JACK_CAT_BY_SUIT[suit]) {
    return `/cards/${JACK_CAT_BY_SUIT[suit]}`;
  }
  if (rank === 'Q' && QUEEN_IMAGE_BY_SUIT[suit]) {
    return `/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[suit])}`;
  }
  if (rank === 'K' && KING_IMAGE_BY_SUIT[suit]) {
    return `/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[suit])}`;
  }
  if (rank === 'A' && ACE_IMAGE_BY_SUIT[suit]) {
    return `/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[suit])}`;
  }
  return null;
}

/**
 * Предзагрузка всех картинок фигурных карт в фоне.
 * Вызывать при монтировании экрана игры (GameTable).
 */
export function preloadCardImages(): void {
  if (typeof window === 'undefined') return;
  CARD_IMAGE_PATHS.forEach((src) => {
    const img = new Image();
    img.onload = () => markCardImageLoaded(src);
    img.src = src;
  });
}

export { JACK_CAT_BY_SUIT, QUEEN_IMAGE_BY_SUIT, KING_IMAGE_BY_SUIT, ACE_IMAGE_BY_SUIT };
