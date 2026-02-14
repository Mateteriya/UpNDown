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

/**
 * Предзагрузка всех картинок фигурных карт в фоне.
 * Вызывать при монтировании экрана игры (GameTable).
 */
export function preloadCardImages(): void {
  if (typeof window === 'undefined') return;
  CARD_IMAGE_PATHS.forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

export { JACK_CAT_BY_SUIT, QUEEN_IMAGE_BY_SUIT, KING_IMAGE_BY_SUIT, ACE_IMAGE_BY_SUIT };
