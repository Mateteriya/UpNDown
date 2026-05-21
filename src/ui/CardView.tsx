/**
 * Отображение карты
 */

import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Card } from '../game/types';
import { useTheme } from '../contexts/ThemeContext';
import type { CardTheme } from '../lib/cardPaletteLock';
import { getCardThemeV3Variant } from '../lib/cardThemeSpec';
import { JACK_CAT_BY_SUIT, QUEEN_IMAGE_BY_SUIT, KING_IMAGE_BY_SUIT, ACE_IMAGE_BY_SUIT, isCardImageCached, markCardImageLoaded } from '../cardAssets';

/** Ранги: 6–10 числовые, J/Q/K/A фигуры */
const RANK_NUMERIC = ['6', '7', '8', '9', '10'] as const;
type RankNumeric = (typeof RANK_NUMERIC)[number];

/** Раскладка пипов по рядам [верх, ..., низ] — как на настоящих картах */
const PIP_LAYOUT: Record<RankNumeric, number[]> = {
  '6': [3, 3],
  '7': [3, 1, 3],
  '8': [3, 2, 3],
  '9': [3, 3, 3],
  '10': [4, 2, 4],
};

/** Сетка для руки ПК: 3 столбца; в 1 и 3 — по 4 ряда (0..3), во 2-м — 2 ряда (0 = между 1–2, 1 = между 3–4). col: 0=лев, 1=центр, 2=прав; row для центра только 0 или 1. */
const PIP_GRID_POSITIONS: Record<RankNumeric, { col: 0 | 1 | 2; row: number }[]> = {
  '6': [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }],
  '7': [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 2, row: 2 }],
  '8': [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 2, row: 1 }, { col: 0, row: 3 }, { col: 1, row: 1 }, { col: 2, row: 3 }],
  '9': [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }],
  '10': [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 2, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }, { col: 1, row: 1 }, { col: 2, row: 2 }, { col: 2, row: 3 }],
};

/** Процент позиций по сетке: столбцы 15% / 50% / 85%; центр-столбец ряды 25%, 75%. Ряды 1 и 3 столбцов считаются динамически по используемым рядам (равные отступы). */
const COL_X = [15, 50, 85] as const;
const CENTER_ROW_Y = [25, 75] as const;

/** Для ранга возвращает отсортированный список индексов рядов, используемых в столбцах 0 и 2 (без дубликатов). */
function getUsedOuterRows(rank: RankNumeric): number[] {
  const positions = PIP_GRID_POSITIONS[rank];
  const rows = new Set<number>();
  positions.forEach(({ col, row }) => { if (col !== 1) rows.add(row); });
  return [...rows].sort((a, b) => a - b);
}

function isNumericRank(r: string): r is RankNumeric {
  return RANK_NUMERIC.includes(r as RankNumeric);
}

/** Подпись фигуры: J→В, Q→Д, K→К, A→Т */
const FACE_LABEL: Record<string, string> = {
  J: 'В',
  Q: 'Д',
  K: 'К',
  A: 'Т',
};

/** Плейсхолдер до загрузки картинки фигурной карты; скрывается после onLoad. Использует глобальный кэш — при повторном появлении карты (напр. на столе) сразу показывает картинку без «перезагрузки». */
function CardFaceImage({
  src,
  alt,
  className,
  style,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [loaded, setLoaded] = useState(() => (src ? isCardImageCached(src) : false));
  const handleLoad = () => {
    if (src) markCardImageLoaded(src);
    setLoaded(true);
  };
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', minHeight: '100%' }}>
      {!loaded && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(145deg, rgba(248,250,252,0.95) 0%, rgba(226,232,240,0.9) 100%)',
            borderRadius: '8%',
          }}
        />
      )}
      <img
        {...rest}
        src={src}
        alt={alt}
        className={className}
        loading={(rest as { loading?: HTMLImageElement['loading'] }).loading ?? 'eager'}
        decoding="async"
        style={{ ...style, width: style?.width ?? '100%', height: style?.height ?? '100%', objectFit: 'contain', opacity: loaded ? 1 : 0, transition: 'opacity 0.2s ease-out' }}
        onLoad={handleLoad}
      />
    </span>
  );
}

export interface CardViewProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Подсветка козыря на столе — мягкий цвет */
  isTrumpOnTable?: boolean;
  /** Двойная рамка (бордюр + outline). При false — одна рамка */
  doubleBorder?: boolean;
  /** Козырь на колоде — объём, блеск, мерцание */
  trumpOnDeck?: boolean;
  /** При trumpOnDeck: вкл — полная интенсивность, выкл — в 1.5–2 раза слабее */
  trumpDeckHighlightOn?: boolean;
  /** Козырь на руках: при выкл. подсветки — то же свечение карты, что у козыря на колоде без подсветки, но без свечения от рамок */
  isTrumpInHand?: boolean;
  /** Вкл. доп. подсветки козырей (для isTrumpInHand и козыря на колоде) */
  trumpHighlightOn?: boolean;
  /** Масштаб карты (размеры, padding, border-radius) */
  scale?: number;
  /** Масштаб символов (ранг, масть). По умолчанию = scale */
  contentScale?: number;
  /** Не показывать картинку валета-кота (по умолчанию кот показывается везде, кроме колоды) */
  hideJackCat?: boolean;
  /** На ПК/планшете у валетов, дам, королей и тузов: два угла (слева ранг+масть, справа внизу только масть укрупнённая). Для карт на столе при compact */
  showDesktopFaceIndices?: boolean;
  /** Только мобильная рука: индекс масти в правом нижнем углу в 1.5 раза мельче */
  suitIndexInHandMobile?: boolean;
  /** Только карты на столе в мобильной: индекс значения в 1.3 раза мельче */
  tableCardMobile?: boolean;
  /** Мобильная рука на этапе заказа: не затемнять, подсветить и чуть укрупнить */
  biddingHighlightMobile?: boolean;
  /** ПК: этап заказа — не затемнять карты руки, показывать в полной яркости */
  biddingHighlightPC?: boolean;
  /** Показывать неоновые границы между зоной индексов и зоной пипов (6–10, рука ПК). Привязано к опции «доп. подсветка». */
  showPipZoneBorders?: boolean;
  /** true = стили только для ПК (тонкие рамки некозырей, козыри в руке/на столе без подсветки, туз крестей обводка). На мобильной передавать false. */
  pcCardStyles?: boolean;
  /** Рамки в 2 раза тоньше (для руки в мобильной версии). */
  thinBorder?: boolean;
  /** Принудительная неоновая белая подсветка козыря на руке в мобильной/планшетной версии. */
  forceMobileTrumpGlow?: boolean;
  /** false = не подсвечивать козырь на руке (например когда ход не у пользователя). По умолчанию true. */
  mobileTrumpGlowActive?: boolean;
  /** true = карта доступна для хода (в масть или козырь при отсутствии масти) — подсвечивать в мобильной руке. */
  highlightAsValidPlay?: boolean;
  /** true = этап заказа взяток и это козырь в руке — показывать проходящий блеск раз в секунду. */
  mobileTrumpShineBidding?: boolean;
  /** Моб. рука в нахлёсте: палец ведут по ряду — карта под пальцем чуть ниже и крупнее (без отдельного клика). */
  mobileHandPeekLift?: boolean;
  /** Моб. нахлёст + недоступная карта: касания идут на слот под кнопкой (жест «пианино» по ряду). */
  mobileOverlapHandPointerPassthrough?: boolean;
  /** Лаборатория / демо: принудительно тёмный лист (устар.; лучше labCardTheme). */
  labDarkCardFace?: boolean;
  /** Лаборатория: тема карт как в игре (standard / dark / legacy / neo), без смены глобального контекста. */
  labCardTheme?: CardTheme;
  /** Лаборатория: палитра варианта III по масти (сравнение колонок). */
  labDarkSuitVariant?:
    | 'default'
    | 'clubs-v3'
    | 'clubs-v3-gray'
    | 'spades-v3'
    | 'spades-v3-deep'
    | 'spades-v3-gray'
    | 'hearts-v3'
    | 'hearts-v3-deep'
    | 'diamonds-v3-gray'
    | 'diamonds-v3-deep';
}

/** #RRGGBB + альфа для box-shadow (к rgb(...) суффикс не применяется — тень молча пропадает). */
function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '').trim();
  const norm =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${norm}${a}`;
}

const suitColorLight: Record<string, string> = {
  '♠': '#0f172a',
  '♥': '#c41e3a',  /* черви: насыщенный красный */
  '♦': '#ea580c',  /* буби: оранжевый */
  '♣': '#3b0764',  /* крести: ультрафиолетовый */
};
const suitColorDark: Record<string, string> = {
  '♠': 'rgb(136, 33, 200)',
  '♥': 'rgb(227, 33, 33)',
  '♦': 'rgb(237, 182, 27)',
  '♣': 'rgb(34, 17, 3)',
};

/** Тёмный лист (моб. рука, стол, колода): палитра по масти — одна на все зоны. */
const MOBILE_DARK_SUIT_PALETTE_BY_SUIT: Record<
  Card['suit'],
  { border: string; boxShadow: string; ringColor: string; background: string; color: string }
> = {
  '♠': {
    border: '1px solid rgb(75, 11, 238)',
    ringColor: '#4b0bee',
    boxShadow: 'rgb(75, 11, 238) 0 0 0 2px',
    background:
      'linear-gradient(145deg, #0c041f 0%, rgb(3, 12, 28) 20%, rgb(20, 17, 102) 40%, rgb(39, 10, 79) 60%, rgb(6, 21, 45) 80%, rgb(15, 23, 42) 100%)',
    color: 'rgb(75, 11, 238)',
  },
  '♥': {
    border: '1px solid #dd2aa899',
    ringColor: '#dd2aa8',
    boxShadow: '#dd2aa899 0 0 0 2px',
    background:
      'linear-gradient(145deg, rgb(66, 16, 127) 0%, rgba(34, 5, 57, 0.7) 20%, rgb(29, 10, 95) 40%, rgba(79, 7, 33, 0.51) 60%, rgb(29, 10, 57) 80%, rgb(53, 9, 68) 100%)',
    color: '#f131b8b0',
  },
  '♦': {
    border: '1px solid rgb(128, 66, 15)',
    ringColor: '#80420f',
    boxShadow: 'rgb(128, 66, 15) 0 0 0 2px',
    background:
      'linear-gradient(145deg, rgb(1, 18, 3) 0%, rgb(100, 32, 11) 20%, rgba(39, 27, 3, 0.83) 40%, rgb(65, 44, 7) 60%, rgba(55, 15, 4, 0.68) 80%, rgb(71, 32, 7) 100%)',
    color: 'rgba(203, 130, 25, 0.91)',
  },
  '♣': {
    border: '1px solid rgb(8, 94, 86)',
    ringColor: '#085e56',
    boxShadow: 'rgb(8, 94, 86) 0 0 0 2px',
    background:
      'linear-gradient(145deg, rgb(47, 17, 4) 0%, rgb(32, 6, 63) 20%, rgb(9, 7, 66) 40%, rgb(57, 28, 9) 60%, rgb(31, 17, 90) 80%, rgb(6, 87, 58) 100%)',
    color: '#16995e',
  },
};

/** Неоновые цвета рамочек по мастям — двойная рамка (бордюр + outline), чёткая */
const suitNeonBorder: Record<string, { border: string; outline: string }> = {
  '♠': { border: '#22d3ee', outline: '0 0 0 2px #22d3ee' },
  '♥': { border: '#f43f5e', outline: '0 0 0 2px #f43f5e' },   /* черви: насыщенный красный */
  '♦': { border: '#fb923c', outline: '0 0 0 2px #fb923c' },   /* буби: оранжевый */
  '♣': { border: '#5b21b6', outline: '0 0 0 2px #5b21b6' },   /* крести: ультрафиолетовый глубокий космический тёмный */
};

/** Тёмная тема (ПК / запасной фон): общий градиент без палитры по масти */
const CARD_BG_DARK = 'linear-gradient(145deg, #0f172a 0%, #1e293b 20%, #312e81 40%, #334155 60%, #1e293b 80%, #0f172a 100%)';
const CARD_BG_DARK_TRUMP = 'linear-gradient(145deg, #1e293b 0%, #312e81 25%, #4338ca 50%, #334155 75%, #1e293b 100%)';
const CARD_BG_DARK_HIGHLIGHT = 'linear-gradient(145deg, #1e293b 0%, #334155 30%, #475569 50%, #334155 70%, #1e293b 100%)';

/** Глубокий фиолет ♣: рамка и глифы (тёмный, но с читаемым фиолетовым тоном). */
const LEGACY_CLUBS_V3_INK = '#221040';

const LEGACY_CLUBS_V3_BG =
  'linear-gradient(145deg, #4a3470 0%, #5e4890 18%, #7260a8 36%, #8c7ac0 52%, #7260a8 68%, #5e4890 84%, #4a3470 100%)';

const LEGACY_CLUBS_V3_BG_INSET =
  'inset 0 0 14px rgba(167, 139, 250, 0.16), inset 0 1px 6px rgba(248, 244, 255, 0.58)';

/** Легаси ♣ III: воздушный фиолетовый градиент + глубокие фиолетовые глифы. */
export const MOBILE_DARK_SUIT_PALETTE_CLUBS_V3: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♣'] = {
  border: `3px solid ${LEGACY_CLUBS_V3_INK}`,
  ringColor: '#5b21b6',
  boxShadow: [
    '0 0 0 2px #5b21b6',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.52)',
    '0 0 12px #5b21b6bb',
    '0 0 20px #5b21b666',
    LEGACY_CLUBS_V3_BG_INSET,
  ].join(', '),
  background: LEGACY_CLUBS_V3_BG,
  color: LEGACY_CLUBS_V3_INK,
};

/** Обводка козыря ♣ на столе (легаси III). */
export const MOBILE_DARK_CLUBS_V3_TRUMP_OUTLINE = '2px solid rgba(210, 190, 255, 0.94)';

/** Некозырные ♣ III: тот же лёгкий фон и inset; снаружи тоньше. */
export const MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♣'] = {
  border: `1px solid ${LEGACY_CLUBS_V3_INK}`,
  ringColor: '#5b21b6',
  boxShadow: [
    '0 0 0 1px #5b21b6',
    '0 0 6px rgba(91, 33, 182, 0.35)',
    '0 2px 8px rgba(0,0,0,0.28)',
    LEGACY_CLUBS_V3_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_CLUBS_V3.background,
  color: MOBILE_DARK_SUIT_PALETTE_CLUBS_V3.color,
};

/** Нео ♣ III: серый лист, те же глифы и неон, что легаси. */
const CLUBS_V3_GRAY_BG_INSET =
  'inset 0 0 14px #5b21b633, inset 0 1px 6px rgba(255,255,255,0.52)';

export const MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♣'] = {
  border: `3px solid ${LEGACY_CLUBS_V3_INK}`,
  ringColor: '#5b21b6',
  boxShadow: [
    '0 0 0 2px #5b21b6',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.52)',
    '0 0 12px #5b21b6bb',
    '0 0 20px #5b21b666',
    CLUBS_V3_GRAY_BG_INSET,
  ].join(', '),
  background: CARD_BG_DARK_HIGHLIGHT,
  color: LEGACY_CLUBS_V3_INK,
};

export const MOBILE_DARK_CLUBS_V3_GRAY_TRUMP_OUTLINE = '2px solid rgba(200, 220, 160, 0.92)';

export const MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♣'] = {
  border: `1px solid ${LEGACY_CLUBS_V3_INK}`,
  ringColor: '#5b21b6',
  boxShadow: [
    '0 0 0 1px #5b21b6',
    '0 0 6px rgba(91, 33, 182, 0.35)',
    '0 2px 8px rgba(0,0,0,0.28)',
    CLUBS_V3_GRAY_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY.background,
  color: MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY.color,
};

/** Глубокий красный ♥: рамка и глифы (насыщеннее, читаемо на розовом листе). */
const LEGACY_HEARTS_V3_INK = '#5c1018';

const LEGACY_HEARTS_V3_BG =
  'linear-gradient(145deg, #64304a 0%, #884468 18%, #a85c84 36%, #c878a0 52%, #a85c84 68%, #884468 84%, #64304a 100%)';

const LEGACY_HEARTS_V3_BG_INSET =
  'inset 0 0 14px rgba(244, 88, 152, 0.26), inset 0 1px 6px rgba(255, 232, 240, 0.62)';

/** Легаси ♥ III: воздушный розово-красно-малиновый градиент + тёмно-красные глифы. */
export const MOBILE_DARK_SUIT_PALETTE_HEARTS_V3: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♥'] = {
  border: `3px solid ${LEGACY_HEARTS_V3_INK}`,
  ringColor: '#dd2aa8',
  boxShadow: [
    '0 0 0 2px #dd2aa8',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.52)',
    '0 0 12px #dd2aa8bb',
    '0 0 20px #dd2aa866',
    LEGACY_HEARTS_V3_BG_INSET,
  ].join(', '),
  background: LEGACY_HEARTS_V3_BG,
  color: LEGACY_HEARTS_V3_INK,
};

/** Обводка козыря ♥ на столе (легаси III). */
export const MOBILE_DARK_HEARTS_V3_TRUMP_OUTLINE = '2px solid rgba(255, 170, 190, 0.92)';

export const MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♥'] = {
  border: `1px solid ${LEGACY_HEARTS_V3_INK}`,
  ringColor: '#dd2aa8',
  boxShadow: [
    '0 0 0 1px #dd2aa8',
    '0 0 6px rgba(221, 42, 168, 0.36)',
    '0 2px 8px rgba(0,0,0,0.28)',
    LEGACY_HEARTS_V3_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_HEARTS_V3.background,
  color: MOBILE_DARK_SUIT_PALETTE_HEARTS_V3.color,
};

/** ♥ III-deep (Нео): как ♠ — тёмный красный градиент, светлые глифы. */
const LEGACY_HEARTS_V3_DEEP_BG =
  'linear-gradient(145deg, #140208 0%, #28040c 18%, #4a0818 36%, #6b1028 52%, #4a0c20 68%, #2a0814 84%, #180408 100%)';

const LEGACY_HEARTS_V3_DEEP_BG_INSET =
  'inset 0 0 14px rgba(221, 42, 168, 0.26), inset 0 1px 6px rgba(255, 180, 200, 0.36)';

export const MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♥'] = {
  border: '3px solid rgb(40, 10, 22)',
  ringColor: '#dd2aa8',
  boxShadow: [
    '0 0 0 2px #dd2aa8',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.48)',
    '0 0 12px #dd2aa8bb',
    '0 0 20px #dd2aa866',
    LEGACY_HEARTS_V3_DEEP_BG_INSET,
  ].join(', '),
  background: LEGACY_HEARTS_V3_DEEP_BG,
  color: 'rgb(220, 150, 168)',
};

export const MOBILE_DARK_HEARTS_V3_DEEP_TRUMP_OUTLINE = '2px solid rgba(255, 210, 220, 0.9)';

export const MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♥'] = {
  border: '1px solid rgb(40, 10, 22)',
  ringColor: '#dd2aa8',
  boxShadow: [
    '0 0 0 1px #dd2aa8',
    '0 0 6px rgba(221, 42, 168, 0.38)',
    '0 2px 8px rgba(0,0,0,0.28)',
    LEGACY_HEARTS_V3_DEEP_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP.background,
  color: MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP.color,
};

/**
 * Легаси ♠ III: серебристый воздушный лист + глубоко-чёрные глифы (без золота/янтаря ♦).
 */
const SPADES_V3_GRAY_INK = '#0a0a0c';

const SPADES_V3_GRAY_RING = '#6a7280';

const SPADES_V3_GRAY_BG =
  'linear-gradient(145deg, #36363c 0%, #484850 18%, #5a5a64 36%, #72727e 52%, #5a5a64 68%, #484850 84%, #36363c 100%)';

const SPADES_V3_GRAY_BG_INSET =
  'inset 0 0 14px rgba(160, 168, 184, 0.18), inset 0 1px 6px rgba(248, 250, 252, 0.52)';

export const MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♠'] = {
  border: `3px solid ${SPADES_V3_GRAY_INK}`,
  ringColor: SPADES_V3_GRAY_RING,
  boxShadow: [
    `0 0 0 2px ${SPADES_V3_GRAY_RING}`,
    '0 0 0 1px rgba(255,255,255,0.75)',
    '0 0 18px rgba(255,255,255,0.4)',
    '0 0 12px #6a7280aa',
    '0 0 20px #6a728066',
    SPADES_V3_GRAY_BG_INSET,
  ].join(', '),
  background: SPADES_V3_GRAY_BG,
  color: SPADES_V3_GRAY_INK,
};

export const MOBILE_DARK_SPADES_V3_GRAY_TRUMP_OUTLINE = '2px solid rgba(52, 56, 64, 0.9)';

export const MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♠'] = {
  border: `1px solid ${SPADES_V3_GRAY_INK}`,
  ringColor: SPADES_V3_GRAY_RING,
  boxShadow: [
    `0 0 0 1px ${SPADES_V3_GRAY_RING}`,
    '0 0 6px rgba(106, 114, 128, 0.32)',
    '0 2px 8px rgba(0,0,0,0.28)',
    SPADES_V3_GRAY_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY.background,
  color: MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY.color,
};

/** Нео ♠ III: тёмный фиолетово-индиго градиент (не чёрно-синий лист II), светлые глифы. */
const SPADES_V3_DEEP_BG =
  'linear-gradient(145deg, #0c0818 0%, #16102c 18%, #241848 36%, #342a88 52%, #281e70 68%, #160e2c 84%, #0c0818 100%)';

const SPADES_V3_DEEP_BG_INSET =
  'inset 0 0 14px rgba(109, 63, 238, 0.28), inset 0 1px 6px rgba(200, 188, 255, 0.38)';

const SPADES_V3_DEEP_BORDER = '#4b0bee';

export const MOBILE_DARK_SUIT_PALETTE_SPADES_V3: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♠'] = {
  border: `3px solid ${SPADES_V3_DEEP_BORDER}`,
  ringColor: '#4b0bee',
  boxShadow: [
    '0 0 0 2px #4b0bee',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.48)',
    '0 0 12px #4b0beebb',
    '0 0 20px #4b0bee66',
    SPADES_V3_DEEP_BG_INSET,
  ].join(', '),
  background: SPADES_V3_DEEP_BG,
  color: 'rgb(167, 139, 250)',
};

/** Обводка козыря ♠ на столе (нео, градиент). */
export const MOBILE_DARK_SPADES_V3_TRUMP_OUTLINE = '2px solid rgba(103, 232, 249, 0.88)';

export const MOBILE_DARK_SUIT_PALETTE_SPADES_V3_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♠'] = {
  border: `1px solid ${SPADES_V3_DEEP_BORDER}`,
  ringColor: '#4b0bee',
  boxShadow: [
    '0 0 0 1px #4b0bee',
    '0 0 6px rgba(75, 11, 238, 0.38)',
    '0 2px 8px rgba(0,0,0,0.28)',
    SPADES_V3_DEEP_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_SPADES_V3.background,
  color: MOBILE_DARK_SUIT_PALETTE_SPADES_V3.color,
};

/** Легаси ♦ III: светлый жёлто-серый градиент + сочные рыже-красные глифы. */
const DIAMONDS_V3_GRAY_INK = '#6e1a10';

const DIAMONDS_V3_GRAY_RING = '#d85848';

const DIAMONDS_V3_GRAY_BG =
  'linear-gradient(145deg, #64562e 0%, #82743e 18%, #a09050 36%, #c0b078 52%, #a09050 68%, #82743e 84%, #64562e 100%)';

const DIAMONDS_V3_GRAY_BG_INSET =
  'inset 0 0 14px rgba(252, 210, 110, 0.24), inset 0 1px 6px rgba(255, 253, 245, 0.65)';

export const MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♦'] = {
  border: `3px solid ${DIAMONDS_V3_GRAY_INK}`,
  ringColor: DIAMONDS_V3_GRAY_RING,
  boxShadow: [
    `0 0 0 2px ${DIAMONDS_V3_GRAY_RING}`,
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.52)',
    '0 0 12px #d85848bb',
    '0 0 20px #d8584866',
    DIAMONDS_V3_GRAY_BG_INSET,
  ].join(', '),
  background: DIAMONDS_V3_GRAY_BG,
  color: DIAMONDS_V3_GRAY_INK,
};

export const MOBILE_DARK_DIAMONDS_V3_GRAY_TRUMP_OUTLINE = '2px solid rgba(236, 168, 148, 0.94)';

export const MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♦'] = {
  border: `1px solid ${DIAMONDS_V3_GRAY_INK}`,
  ringColor: DIAMONDS_V3_GRAY_RING,
  boxShadow: [
    `0 0 0 1px ${DIAMONDS_V3_GRAY_RING}`,
    '0 0 6px rgba(216, 88, 72, 0.42)',
    '0 2px 8px rgba(0,0,0,0.28)',
    DIAMONDS_V3_GRAY_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY.background,
  color: MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY.color,
};

/** Нео ♦ III: как ♠ — тёмный янтарный градиент, светлые глифы. */
const DIAMONDS_V3_DEEP_BG =
  'linear-gradient(145deg, #140804 0%, #281004 18%, #4a2810 36%, #6b4018 52%, #4a3010 68%, #2a1808 84%, #180c04 100%)';

const DIAMONDS_V3_DEEP_BG_INSET =
  'inset 0 0 14px rgba(234, 88, 12, 0.26), inset 0 1px 6px rgba(255, 210, 160, 0.36)';

export const MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♦'] = {
  border: '3px solid rgb(48, 20, 8)',
  ringColor: '#ea580c',
  boxShadow: [
    '0 0 0 2px #ea580c',
    '0 0 0 1px rgba(255,255,255,0.85)',
    '0 0 18px rgba(255,255,255,0.48)',
    '0 0 12px #ea580cbb',
    '0 0 20px #ea580c66',
    DIAMONDS_V3_DEEP_BG_INSET,
  ].join(', '),
  background: DIAMONDS_V3_DEEP_BG,
  color: 'rgb(255, 195, 130)',
};

export const MOBILE_DARK_DIAMONDS_V3_DEEP_TRUMP_OUTLINE = '2px solid rgba(255, 210, 160, 0.9)';

export const MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP_PLAIN: (typeof MOBILE_DARK_SUIT_PALETTE_BY_SUIT)['♦'] = {
  border: '1px solid rgb(48, 20, 8)',
  ringColor: '#ea580c',
  boxShadow: [
    '0 0 0 1px #ea580c',
    '0 0 6px rgba(234, 88, 12, 0.38)',
    '0 2px 8px rgba(0,0,0,0.28)',
    DIAMONDS_V3_DEEP_BG_INSET,
  ].join(', '),
  background: MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP.background,
  color: MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP.color,
};

/** Козырь: усиление цветного кольца (ringColor — hex), короткий ореол через hexWithAlpha. */
function darkSuitTrumpAccent(baseRing: string, ringColor: string, strength: 'off' | 'soft' | 'on') {
  if (strength === 'off') return `${baseRing}, 0 2px 8px rgba(0,0,0,0.24)`;
  const o = strength === 'on' ? 1 : 0.65;
  const spreadPx = strength === 'on' ? 3 : 2;
  return [
    baseRing,
    `0 0 0 ${spreadPx}px ${ringColor}`,
    `0 0 6px ${hexWithAlpha(ringColor, 0.58 * o)}`,
    `0 0 10px ${hexWithAlpha(ringColor, 0.42 * o)}`,
    '0 2px 8px rgba(0,0,0,0.28)',
  ].join(', ');
}

/** Тёмная рука: карта доступна для хода (не козырь) — заметное кольцо масти, слабее козыря. */
function darkSuitValidPlayAccent(baseRing: string, ringColor: string) {
  return [
    baseRing,
    `0 0 0 3px ${ringColor}`,
    `0 0 8px ${hexWithAlpha(ringColor, 0.88)}`,
    `0 0 16px ${hexWithAlpha(ringColor, 0.58)}`,
    `inset 0 0 14px ${hexWithAlpha(ringColor, 0.28)}`,
    '0 2px 10px rgba(0,0,0,0.32)',
  ].join(', ');
}

/** Козырь + доступный ход: кольцо козыря и акцент «можно играть» вместе. */
function darkSuitTrumpValidPlayAccent(baseRing: string, ringColor: string) {
  return [
    baseRing,
    `0 0 0 4px ${ringColor}`,
    `0 0 10px ${hexWithAlpha(ringColor, 0.95)}`,
    `0 0 20px ${hexWithAlpha(ringColor, 0.68)}`,
    `inset 0 0 16px ${hexWithAlpha(ringColor, 0.34)}`,
    '0 2px 12px rgba(0,0,0,0.36)',
  ].join(', ');
}

/** Моб. рука: кольца тоньше стола (0.5px база; акценты хода/козыря — на 1px уже, чем на столе). */
function darkSuitHandBorder(ringColor: string) {
  return `0.5px solid ${ringColor}`;
}

function darkSuitHandRing(ringColor: string, spreadPx = 0.5) {
  return `${ringColor} 0 0 0 ${spreadPx}px`;
}

function darkSuitTrumpAccentHand(baseRing: string, ringColor: string, strength: 'off' | 'soft' | 'on') {
  if (strength === 'off') return `${baseRing}, 0 2px 8px rgba(0,0,0,0.24)`;
  const o = strength === 'on' ? 1 : 0.65;
  const spreadPx = strength === 'on' ? 1 : 0.5;
  return [
    baseRing,
    `0 0 0 ${spreadPx}px ${ringColor}`,
    `0 0 5px ${hexWithAlpha(ringColor, 0.58 * o)}`,
    `0 0 9px ${hexWithAlpha(ringColor, 0.42 * o)}`,
    '0 2px 8px rgba(0,0,0,0.28)',
  ].join(', ');
}

/** Доступный ход в руке: нейтральная база + лёгкий тон масти (♦ ♥ не ярче ♠ ♣). */
function darkSuitValidPlayAccentHand(baseRing: string, ringColor: string) {
  return [
    baseRing,
    '0 0 0 1px rgba(255, 255, 255, 0.58)',
    `0 0 7px ${hexWithAlpha(ringColor, 0.38)}`,
    `0 0 14px ${hexWithAlpha(ringColor, 0.22)}`,
    'inset 0 0 12px rgba(255, 255, 255, 0.16)',
    '0 2px 10px rgba(0,0,0,0.32)',
  ].join(', ');
}

function darkSuitTrumpValidPlayAccentHand(baseRing: string, ringColor: string) {
  return [
    baseRing,
    '0 0 0 2px rgba(255, 255, 255, 0.62)',
    `0 0 9px ${hexWithAlpha(ringColor, 0.48)}`,
    `0 0 18px ${hexWithAlpha(ringColor, 0.28)}`,
    'inset 0 0 14px rgba(255, 255, 255, 0.18)',
    '0 2px 12px rgba(0,0,0,0.36)',
  ].join(', ');
}

export function CardView({ card, onClick, disabled, compact, isTrumpOnTable, doubleBorder = true, trumpOnDeck, trumpDeckHighlightOn = true, isTrumpInHand, trumpHighlightOn = true, scale = 1, contentScale, hideJackCat = false, showDesktopFaceIndices = false, suitIndexInHandMobile = false, tableCardMobile = false, biddingHighlightMobile = false, biddingHighlightPC = false, showPipZoneBorders = true, pcCardStyles = true, thinBorder = false, forceMobileTrumpGlow = false, mobileTrumpGlowActive = true, highlightAsValidPlay = false, mobileTrumpShineBidding = false, mobileHandPeekLift = false, mobileOverlapHandPointerPassthrough = false, labDarkCardFace = false, labCardTheme, labDarkSuitVariant = 'default' }: CardViewProps) {
  const { theme, cardTheme } = useTheme();
  const inLab = labDarkCardFace || labCardTheme !== undefined;
  const effectiveCardTheme: CardTheme = labCardTheme ?? (labDarkCardFace ? 'dark' : cardTheme);
  const mobileFace = !pcCardStyles;
  /** Тёмный лист: темы dark/legacy/neo, старый neon+мобила */
  const isDark =
    (effectiveCardTheme !== 'standard' && mobileFace) || (theme === 'neon' && mobileFace);
  const themeV3FromGame =
    effectiveCardTheme === 'legacy' || effectiveCardTheme === 'neo'
      ? getCardThemeV3Variant(effectiveCardTheme, card.suit)
      : null;
  const activeV3 =
    inLab && labDarkSuitVariant !== 'default' ? labDarkSuitVariant : themeV3FromGame;
  const suitClubsV3 = mobileFace && activeV3 === 'clubs-v3';
  const clubsV3Gray = mobileFace && activeV3 === 'clubs-v3-gray';
  const spadesV3Gray = mobileFace && activeV3 === 'spades-v3-gray';
  const spadesV3Deep =
    mobileFace && (activeV3 === 'spades-v3-deep' || activeV3 === 'spades-v3');
  const diamondsV3Gray = mobileFace && activeV3 === 'diamonds-v3-gray';
  const diamondsV3Deep = mobileFace && activeV3 === 'diamonds-v3-deep';
  const legacyHeartsV3 = mobileFace && activeV3 === 'hearts-v3';
  const legacyHeartsV3Deep = mobileFace && activeV3 === 'hearts-v3-deep';
  const legacyClubsV3 = suitClubsV3 || clubsV3Gray;
  const legacySuitV3 =
    suitClubsV3 ||
    clubsV3Gray ||
    spadesV3Gray ||
    spadesV3Deep ||
    diamondsV3Gray ||
    diamondsV3Deep ||
    legacyHeartsV3 ||
    legacyHeartsV3Deep;
  const mobileDarkSuitFace =
    isDark &&
    !pcCardStyles &&
    (suitIndexInHandMobile || tableCardMobile || trumpOnDeck);
  const mobileDarkHand = mobileDarkSuitFace && suitIndexInHandMobile;
  const mobileDarkTable = mobileDarkSuitFace && tableCardMobile;
  const mobileDarkDeck = mobileDarkSuitFace && !!trumpOnDeck;
  const legacySuitV3TrumpFace =
    legacySuitV3 &&
    ((mobileDarkTable && !!isTrumpOnTable) ||
      (mobileDarkHand && !!isTrumpInHand) ||
      mobileDarkDeck);
  const legacyClubsV3TrumpLit =
    suitClubsV3 && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const clubsV3GrayTrumpLit =
    clubsV3Gray && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const spadesV3GrayTrumpLit =
    spadesV3Gray && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const spadesV3DeepTrumpLit =
    spadesV3Deep && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const legacyHeartsV3TrumpLit =
    legacyHeartsV3 && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const legacyHeartsV3DeepTrumpLit =
    legacyHeartsV3Deep && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const diamondsV3GrayTrumpLit =
    diamondsV3Gray && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const diamondsV3DeepTrumpLit =
    diamondsV3Deep && mobileDarkTable && !!isTrumpOnTable && trumpHighlightOn;
  const legacySuitV3TrumpLit =
    legacyClubsV3TrumpLit ||
    clubsV3GrayTrumpLit ||
    spadesV3GrayTrumpLit ||
    spadesV3DeepTrumpLit ||
    legacyHeartsV3TrumpLit ||
    legacyHeartsV3DeepTrumpLit ||
    diamondsV3GrayTrumpLit ||
    diamondsV3DeepTrumpLit;
  /** Нео: все IV масти III — одна «полная» рамка (как у пик), не только козырь. */
  const neoV3FullPalette =
    effectiveCardTheme === 'neo' &&
    (spadesV3Deep || diamondsV3Deep || legacyHeartsV3Deep || clubsV3Gray);
  const useSuitV3FullFace = legacySuitV3TrumpFace || neoV3FullPalette;
  const darkSuitFace = mobileDarkSuitFace
    ? suitClubsV3
      ? useSuitV3FullFace
        ? MOBILE_DARK_SUIT_PALETTE_CLUBS_V3
        : MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_PLAIN
      : clubsV3Gray
        ? useSuitV3FullFace
          ? MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY
          : MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY_PLAIN
        : spadesV3Gray
        ? useSuitV3FullFace
          ? MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY
          : MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY_PLAIN
        : spadesV3Deep
          ? useSuitV3FullFace
            ? MOBILE_DARK_SUIT_PALETTE_SPADES_V3
            : MOBILE_DARK_SUIT_PALETTE_SPADES_V3_PLAIN
          : diamondsV3Gray
          ? useSuitV3FullFace
            ? MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY
            : MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY_PLAIN
          : diamondsV3Deep
            ? useSuitV3FullFace
              ? MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP
              : MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP_PLAIN
            : legacyHeartsV3Deep
              ? useSuitV3FullFace
                ? MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP
                : MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP_PLAIN
              : legacyHeartsV3
                ? useSuitV3FullFace
                  ? MOBILE_DARK_SUIT_PALETTE_HEARTS_V3
                  : MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_PLAIN
                : MOBILE_DARK_SUIT_PALETTE_BY_SUIT[card.suit]
    : null;
  const isMobileDarkTrump =
    !!darkSuitFace &&
    ((mobileDarkTable && !!isTrumpOnTable) ||
      (mobileDarkHand && !!isTrumpInHand) ||
      mobileDarkDeck);
  /** Тёмный лист: дама ♠ — лёгкий контур центрального PNG (тёмный рисунок на тёмном фоне) */
  const darkQueenSpadesFaceGlow =
    mobileDarkSuitFace && card.rank === 'Q' && card.suit === '♠' && spadesV3Deep;
  const cs = contentScale ?? scale;
  const suitColor = isDark ? suitColorDark : suitColorLight;
  const color = darkSuitFace?.color ?? suitColor[card.suit];
  const neon = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
  /** Тёмная тема: рамки карт — цвет индексов (suitColor), иначе неон */
  const borderColor = isDark ? color : neon.border;
  const bw = compact ? 52 : 70;
  const bh = compact ? 76 : 100;
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);
  const baseShadow = doubleBorder ? neon.outline : 'none';
  const isMobileHandTrump = mobileTrumpGlowActive && (forceMobileTrumpGlow || (!pcCardStyles && !!isTrumpInHand));
  /** Допустимый ход на руке (в тёмном листе — акцент цветом кольца масти, без белого перелива). */
  const showValidPlayHandHighlight = !!highlightAsValidPlay && !pcCardStyles;
  const darkHandValidPlayHighlight = mobileDarkHand && showValidPlayHandHighlight;
  const darkHandValidPlayTrump = darkHandValidPlayHighlight && !!isTrumpInHand;
  const showMobileHandHighlight = isMobileHandTrump || showValidPlayHandHighlight;
  /** Торги: обычные карты руки — без «disabled-лаванды» и без неоновой рамки по масти (видно масть для заказа) */
  const mobileBiddingPlainHand =
    biddingHighlightMobile && suitIndexInHandMobile && !pcCardStyles && !showMobileHandHighlight;
  const dimMobileUnplayable =
    suitIndexInHandMobile && !pcCardStyles && disabled && !biddingHighlightMobile;
  const isNonTrumpWithHighlight = pcCardStyles && doubleBorder && !trumpOnDeck && !(isTrumpOnTable && trumpHighlightOn) && !(isTrumpInHand && trumpHighlightOn);
  const isTableNumericTrump = isTrumpOnTable && compact && showDesktopFaceIndices && !tableCardMobile && isNumericRank(card.rank);
  const isTrumpOnTableDim = pcCardStyles && isTrumpOnTable && !trumpHighlightOn;
  const isPcTableAceClubs =
    pcCardStyles &&
    compact &&
    showDesktopFaceIndices &&
    !tableCardMobile &&
    card.rank === 'A' &&
    card.suit === '♣';
  const aceClubsImgClass =
    card.suit === '♣' && pcCardStyles
      ? `card-ace-clubs-img${isPcTableAceClubs ? ' card-ace-clubs-img--pc-table' : ''}`
      : undefined;
  let trumpShadow =
    isTrumpOnTable && trumpHighlightOn && !mobileDarkTable
      ? isPcTableAceClubs
        ? `${baseShadow}, 0 0 0 1px rgba(255,255,255,0.72), 0 0 8px ${neon.border}55, 0 2px 6px rgba(0,0,0,0.12)`
        : `${baseShadow}, 0 0 0 1px rgba(255,255,255,0.85), 0 0 18px rgba(255,255,255,0.52), 0 0 12px ${neon.border}bb, 0 0 20px ${neon.border}66, inset 0 0 14px ${neon.border}33, inset 0 1px 6px rgba(255,255,255,0.52)`
      : baseShadow;
  if (trumpOnDeck && mobileDarkDeck) {
    trumpShadow = 'none';
  } else if (trumpOnDeck) {
    const q = trumpDeckHighlightOn ? 1 : 0.28;
    const neonMult = trumpDeckHighlightOn ? 0.7 : 0.68;
    const whiteMult = trumpDeckHighlightOn ? 0.82 : 0.75;
    const deckOutlineShadow = trumpDeckHighlightOn ? baseShadow : `0 0 0 2px ${neon.border}aa`;
    trumpShadow = [
      deckOutlineShadow,
      `0 0 0 1px rgba(255,255,255,${(0.25 * q + 0.15) * whiteMult})`,
      `0 0 ${20 * q}px ${neon.border}${Math.round(0xcc * q * neonMult).toString(16).padStart(2, '0')}`,
      `0 0 ${36 * q}px ${neon.border}${Math.round(0x99 * q * neonMult).toString(16).padStart(2, '0')}`,
      `0 4px ${16 * q}px rgba(0,0,0,${0.25 + 0.08 * q})`,
      `inset 0 2px ${8 * q}px rgba(255,255,255,${(0.15 + 0.12 * q) * whiteMult})`,
      `inset 0 -1px ${4 * q}px rgba(0,0,0,${0.08 + 0.06 * q})`,
    ].join(', ');
  } else if (pcCardStyles && ((isTrumpInHand || isTrumpOnTableDim) && !trumpHighlightOn)) {
    const q = 0.35;
    const whiteMult = 0.8;
    trumpShadow = isPcTableAceClubs && isTrumpOnTableDim
      ? `0 0 0 1px rgba(255,255,255,0.55), 0 2px 6px rgba(0,0,0,0.1)`
      : [
          `0 0 0 1px rgba(255,255,255,${(0.25 * q + 0.15) * whiteMult})`,
          `0 4px ${18 * q}px rgba(0,0,0,${0.28 + 0.08 * q})`,
          `inset 0 2px ${10 * q}px rgba(255,255,255,${(0.18 + 0.12 * q) * whiteMult})`,
          `inset 0 -1px ${4 * q}px rgba(0,0,0,${0.08 + 0.06 * q})`,
        ].join(', ');
  } else if (isTableNumericTrump) {
    trumpShadow = [
      baseShadow,
      '0 0 0 1px rgba(255,255,255,0.85)',
      '0 0 18px rgba(255,255,255,0.52)',
      `0 0 10px ${neon.border}88`,
      `0 0 18px ${neon.border}55`,
      '0 3px 10px rgba(0,0,0,0.25)',
      'inset 0 1px 6px rgba(255,255,255,0.52)',
      'inset 0 -1px 2px rgba(0,0,0,0.1)',
    ].join(', ');
  } else if (pcCardStyles && isTrumpInHand && trumpHighlightOn) {
    trumpShadow = isDark
      ? `${baseShadow}, 0 0 0 1px rgba(255,255,255,0.25), 0 0 12px ${borderColor}66, 0 0 16px ${borderColor}44, inset 0 0 8px ${borderColor}22`
      : `${baseShadow}, 0 0 0 1px rgba(255,255,255,0.85), 0 0 18px rgba(255,255,255,0.52), 0 0 12px ${neon.border}bb, 0 0 20px ${neon.border}66, inset 0 0 14px ${neon.border}33, inset 0 1px 6px rgba(255,255,255,0.52)`;
  } else if (isNonTrumpWithHighlight) {
    trumpShadow = `0 0 0 1px ${neon.border}`;
  } else if (showMobileHandHighlight && !mobileDarkHand) {
    /* Козыри в руке (заказ/первый ход во взятке) или доступные для хода карты в мобильной версии */
    trumpShadow = isDark
      ? [
          `0 0 0 1px rgba(255,255,255,0.3)`,
          `0 0 12px ${borderColor}66`,
          `0 2px 8px rgba(0,0,0,0.2)`,
          `inset 0 0 8px ${borderColor}22`,
        ].join(', ')
      : [
          `0 0 0 1px rgba(255,255,255,0.95)`,
          `0 0 16px rgba(255,255,255,0.5)`,
          `0 2px 8px rgba(0,0,0,0.12)`,
          `inset 0 0 14px rgba(255,255,255,0.95)`,
          `inset 0 0 34px rgba(255,255,255,0.68)`,
          `inset 0 0 58px rgba(255,255,255,0.35)`,
        ].join(', ');
  }

  /* Кольцо в box-shadow только у подсветки «козырь/можно ходить» — иначе дублирует border+outline на обрезанном краю */
  const mobileHandHighlightRing =
    suitIndexInHandMobile && trumpHighlightOn && showMobileHandHighlight && !darkSuitFace
      ? `0 0 0 1px ${neon.border}`
      : '';
  const baseCardShadow = biddingHighlightPC
    ? `${trumpShadow}, 0 0 12px rgba(255,255,255,0.38)`
    : mobileHandHighlightRing ? (trumpShadow === 'none' ? mobileHandHighlightRing : `${trumpShadow}, ${mobileHandHighlightRing}`) : trumpShadow;

  const mobileDarkHandTrumpAccentOn =
    mobileTrumpShineBidding ||
    forceMobileTrumpGlow ||
    (!!isTrumpInHand && (isMobileHandTrump || showValidPlayHandHighlight));
  const mobileDarkTrumpLit =
    isMobileDarkTrump &&
    ((mobileDarkDeck && trumpDeckHighlightOn) ||
      (mobileDarkTable && trumpHighlightOn) ||
      (mobileDarkHand && !!isTrumpInHand));

  const darkSuitBoxShadow = darkSuitFace
    ? (() => {
        const ring = darkSuitFace.boxShadow;
        const ringHex = darkSuitFace.ringColor;
        if (mobileDarkDeck) {
          return darkSuitTrumpAccent(
            ring,
            darkSuitFace.ringColor,
            trumpDeckHighlightOn ? 'on' : 'soft',
          );
        }
        if (mobileDarkTable && isMobileDarkTrump) {
          return darkSuitTrumpAccent(
            ring,
            darkSuitFace.ringColor,
            trumpHighlightOn && doubleBorder ? 'on' : 'soft',
          );
        }
        if (mobileDarkHand && isMobileDarkTrump) {
          if (legacySuitV3) {
            if (darkHandValidPlayTrump) {
              return darkSuitTrumpValidPlayAccentHand(ring, ringHex);
            }
            return darkSuitTrumpAccentHand(ring, ringHex, mobileDarkHandTrumpAccentOn ? 'on' : 'soft');
          }
          const handRing = darkSuitHandRing(ringHex);
          if (darkHandValidPlayTrump) {
            return darkSuitTrumpValidPlayAccentHand(handRing, ringHex);
          }
          return darkSuitTrumpAccentHand(handRing, ringHex, mobileDarkHandTrumpAccentOn ? 'on' : 'soft');
        }
        if (mobileDarkHand) {
          /* Легаси/нео III на руке: тот же «воздушный» лист, что в лабе на столе (не только 0.5px кольцо). */
          if (legacySuitV3) {
            if (darkHandValidPlayHighlight) {
              return darkSuitValidPlayAccentHand(ring, ringHex);
            }
            if (mobileBiddingPlainHand) {
              return `${ring}, 0 2px 10px rgba(0,0,0,0.42)`;
            }
            return ring;
          }
          const handRing = darkSuitHandRing(ringHex);
          if (darkHandValidPlayHighlight) {
            return darkSuitValidPlayAccentHand(handRing, ringHex);
          }
          if (mobileBiddingPlainHand) {
            return `${handRing}, 0 2px 10px rgba(0,0,0,0.42)`;
          }
          return handRing;
        }
        /* стол, некозырь; легаси ♣ III — только палитра, без лишнего «утолщения» тени */
        if (legacySuitV3 && mobileDarkTable && !isMobileDarkTrump) {
          return ring;
        }
        return trumpHighlightOn && doubleBorder
          ? `${ring}, 0 0 8px ${hexWithAlpha(ringHex, 0.28)}, 0 2px 8px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)`
          : `${ring}, 0 2px 8px rgba(0,0,0,0.24)`;
      })()
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'card-view-root',
        mobileDarkHand ? 'card-dark-mobile-hand' : null,
        darkHandValidPlayHighlight ? 'card-dark-hand-playable' : null,
        darkHandValidPlayTrump ? 'card-dark-hand-playable-trump' : null,
        mobileDarkSuitFace && isMobileDarkTrump ? 'card-dark-suit-trump' : null,
        trumpOnDeck
          ? trumpDeckHighlightOn
            ? 'trump-on-deck trump-on-deck--full'
            : 'trump-on-deck trump-on-deck--dim'
          : null,
        pcCardStyles && (isTrumpInHand || isTrumpOnTableDim) && !trumpHighlightOn ? 'trump-in-hand-dim' : null,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        width: w,
        height: h,
        minWidth: w,
        minHeight: h,
        padding: Math.round(4 * scale),
        margin: suitIndexInHandMobile && !pcCardStyles && compact ? 0 : compact ? Math.round(2 * scale) : Math.round(4 * scale),
        /* В мобильной руке при подсветке: цветная рамка по масти (и для козырей тоже при вкл. подсветки); иначе козырь/доступный ход — белая рамка */
        border: darkSuitFace
          ? mobileDarkHand && (darkHandValidPlayTrump || darkHandValidPlayHighlight)
            ? `1px solid rgba(255, 255, 255, 0.58)`
            : mobileDarkHand
              ? legacySuitV3
                ? useSuitV3FullFace
                  ? `1px solid ${darkSuitFace.ringColor}`
                  : darkSuitFace.border
                : darkSuitHandBorder(darkSuitFace.ringColor)
              : darkSuitFace.border
          : showMobileHandHighlight && thinBorder
          ? (suitIndexInHandMobile && trumpHighlightOn ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.98)')
          : showMobileHandHighlight
          ? '3px solid rgba(255,255,255,0.98)'
          : mobileBiddingPlainHand && thinBorder
            ? (isDark ? '2px solid rgba(203, 213, 225, 0.72)' : '2px solid rgba(100, 116, 139, 0.88)')
            : (thinBorder ? `1px solid ${borderColor}` : (trumpOnDeck && !trumpDeckHighlightOn ? `2px solid ${borderColor}bb` : (doubleBorder ? (isNonTrumpWithHighlight ? `2px solid ${borderColor}` : `3px solid ${borderColor}`) : `2px solid ${borderColor}`))),
        outline: darkSuitFace
          ? mobileDarkHand
            ? darkHandValidPlayTrump
              ? `1px solid ${darkSuitFace.ringColor}`
              : mobileDarkTrumpLit
                ? `0.5px solid ${darkSuitFace.ringColor}`
                : darkHandValidPlayHighlight
                  ? '0.5px solid rgba(255, 255, 255, 0.5)'
                  : 'none'
            : legacyClubsV3TrumpLit
              ? MOBILE_DARK_CLUBS_V3_TRUMP_OUTLINE
              : clubsV3GrayTrumpLit
                ? MOBILE_DARK_CLUBS_V3_GRAY_TRUMP_OUTLINE
                : spadesV3GrayTrumpLit
                ? MOBILE_DARK_SPADES_V3_GRAY_TRUMP_OUTLINE
                : spadesV3DeepTrumpLit
                  ? MOBILE_DARK_SPADES_V3_TRUMP_OUTLINE
                  : diamondsV3GrayTrumpLit
                  ? MOBILE_DARK_DIAMONDS_V3_GRAY_TRUMP_OUTLINE
                  : diamondsV3DeepTrumpLit
                    ? MOBILE_DARK_DIAMONDS_V3_DEEP_TRUMP_OUTLINE
                    : legacyHeartsV3TrumpLit
                      ? MOBILE_DARK_HEARTS_V3_TRUMP_OUTLINE
                      : legacyHeartsV3DeepTrumpLit
                        ? MOBILE_DARK_HEARTS_V3_DEEP_TRUMP_OUTLINE
              : darkHandValidPlayTrump
                ? `3px solid ${darkSuitFace.ringColor}`
                : mobileDarkTrumpLit
                  ? `2px solid ${darkSuitFace.ringColor}`
                  : darkHandValidPlayHighlight
                    ? `2px solid ${darkSuitFace.ringColor}`
                    : 'none'
          : thinBorder
          ? (suitIndexInHandMobile && trumpHighlightOn && showMobileHandHighlight ? `1px solid ${borderColor}cc` : 'none')
          : (trumpOnDeck ? (trumpDeckHighlightOn ? `2px solid ${borderColor}ee` : `1px solid ${borderColor}99`) : (isTrumpOnTable && trumpHighlightOn && !mobileDarkSuitFace) ? `2px solid rgba(200,220,160,0.92)` : (doubleBorder ? (isNonTrumpWithHighlight ? `1px solid ${borderColor}cc` : `2px solid ${borderColor}cc`) : 'none')),
        outlineOffset: legacySuitV3TrumpLit ? 2 : darkSuitFace ? 1 : trumpOnDeck ? 1 : (suitIndexInHandMobile && trumpHighlightOn) ? 1 : (isTrumpOnTable && trumpHighlightOn) ? 2 : 0,
        borderRadius: mobileDarkSuitFace
          ? Math.round(6 * scale)
          : Math.round(8 * scale),
        boxShadow:
          darkSuitBoxShadow ??
          (biddingHighlightMobile && suitIndexInHandMobile && !pcCardStyles
            ? mobileBiddingPlainHand
              ? isDark
                ? '0 0 0 1px rgba(226, 232, 240, 0.38), 0 2px 10px rgba(0,0,0,0.42)'
                : '0 0 0 1px rgba(51, 65, 85, 0.35), 0 2px 8px rgba(0,0,0,0.1)'
              : baseCardShadow
            : biddingHighlightMobile
              ? `${trumpShadow}, 0 0 10px ${neon.border}88, 0 0 16px ${neon.border}44`
              : baseCardShadow),
        background: darkSuitFace
          ? suitClubsV3
            ? MOBILE_DARK_SUIT_PALETTE_CLUBS_V3.background
            : clubsV3Gray
              ? MOBILE_DARK_SUIT_PALETTE_CLUBS_V3_GRAY.background
              : spadesV3Gray
              ? MOBILE_DARK_SUIT_PALETTE_SPADES_V3_GRAY.background
              : spadesV3Deep
                ? MOBILE_DARK_SUIT_PALETTE_SPADES_V3.background
                : diamondsV3Gray
                ? MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_GRAY.background
                : diamondsV3Deep
                  ? MOBILE_DARK_SUIT_PALETTE_DIAMONDS_V3_DEEP.background
                  : legacyHeartsV3Deep
                    ? MOBILE_DARK_SUIT_PALETTE_HEARTS_V3_DEEP.background
                    : legacyHeartsV3
                      ? MOBILE_DARK_SUIT_PALETTE_HEARTS_V3.background
                      : darkSuitFace.background
          : isDark
          ? (trumpOnDeck ? CARD_BG_DARK_TRUMP : (trumpHighlightOn && isTrumpOnTable) ? CARD_BG_DARK_HIGHLIGHT : (trumpHighlightOn && isTrumpInHand) ? CARD_BG_DARK_TRUMP : CARD_BG_DARK)
          : trumpOnDeck
            ? (trumpDeckHighlightOn
                ? `linear-gradient(145deg, ${neon.border}50 0%, #ffffff 30%, #f1f5f9 70%, ${neon.border}25 100%)`
                : `linear-gradient(145deg, ${neon.border}28 0%, #ffffff 38%, #f5f7fa 72%, ${neon.border}12 100%)`)
            : pcCardStyles && (isTrumpInHand || isTrumpOnTableDim) && !trumpHighlightOn
              ? `linear-gradient(145deg, ${neon.border}38 0%, #ffffff 35%, #f5f7fa 68%, ${neon.border}18 100%)`
              : isTableNumericTrump
                ? `linear-gradient(145deg, ${neon.border}38 0%, #ffffff 35%, #f5f7fa 70%, ${neon.border}20 100%)`
                : pcCardStyles && ((isTrumpOnTable && trumpHighlightOn) || (isTrumpInHand && trumpHighlightOn))
                  ? `linear-gradient(145deg, ${neon.border}38 0%, #f8fafc 35%, #e2e8f0 100%)`
                  : showMobileHandHighlight
                    ? 'linear-gradient(145deg, #ffffff 0%, #fdfefe 32%, #edf2f7 62%, #d7e0ea 100%)'
                    : dimMobileUnplayable
                      ? 'linear-gradient(145deg, rgb(146, 140, 161), rgb(237, 236, 234))'
                      : 'linear-gradient(145deg, #f8fafc, #e2e8f0)',
        color,
        fontSize: Math.round((compact ? 12 : 14) * cs),
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: trumpOnDeck ? 1 : biddingHighlightMobile ? 1 : biddingHighlightPC ? 1 : isMobileHandTrump ? 1 : dimMobileUnplayable ? 1 : disabled ? 0.6 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
        /* Торги на мобильной руке: без scale; тени — лёгкое кольцо (plain) или baseCardShadow (козырь/подсветка) */
        ...(biddingHighlightMobile && !(suitIndexInHandMobile && !pcCardStyles)
          ? { transform: 'scale(1.06)', transformOrigin: 'center bottom' }
          : {}),
        ...(darkHandValidPlayHighlight
          ? {
              transform: 'translateY(-4px) scale(1.05)',
              transformOrigin: 'center bottom',
              zIndex: 12,
            }
          : {}),
        ...(mobileHandPeekLift && suitIndexInHandMobile && !pcCardStyles
          ? {
              transform: 'translateY(9px) scale(1.065)',
              transformOrigin: 'center bottom',
              transition: 'transform 0.05s ease-out, box-shadow 0.15s',
              willChange: 'transform',
              zIndex: 26,
            }
          : {}),
        position: 'relative',
        zIndex: suitIndexInHandMobile ? (mobileHandPeekLift ? 26 : 6) : undefined,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        overflow: 'hidden',
        touchAction: suitIndexInHandMobile ? 'manipulation' : undefined,
        ...(mobileOverlapHandPointerPassthrough ? { pointerEvents: 'none' as const } : {}),
      }}
      onMouseEnter={e => {
        if (!disabled && !mobileDarkSuitFace) {
          const n = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
          e.currentTarget.style.transform = 'translateY(-4px)';
          const hoverShadow = isTrumpOnTable
            ? `0 4px 12px rgba(0,0,0,0.25), ${n.outline}, 0 0 14px ${n.border}99`
            : `0 4px 12px rgba(0,0,0,0.25), ${n.outline}`;
          e.currentTarget.style.boxShadow = hoverShadow;
        }
      }}
      onMouseLeave={e => {
        if (mobileDarkSuitFace) return;
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = darkSuitBoxShadow ?? baseCardShadow;
      }}
    >
      {/* Блеск-отблеск: козыри в руке при заказе (раз в ~4 с) и доступные для хода карты при нашем ходе (раз в ~5 с) */}
      {(!mobileDarkHand || !!isTrumpInHand) &&
        (mobileTrumpShineBidding || (highlightAsValidPlay && !pcCardStyles && !!isTrumpInHand)) && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 5,
            borderRadius: Math.round(8 * scale),
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '40%',
              height: '100%',
              pointerEvents: 'none',
              background: isDark
                ? 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 35%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.12) 65%, transparent 100%)'
                : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.45) 35%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.45) 65%, transparent 100%)',
              animation: highlightAsValidPlay && !pcCardStyles && isTrumpInHand
                ? 'card-trump-shine 5s ease-in-out infinite'
                : 'card-trump-shine 4s ease-in-out infinite',
            }}
          />
        </span>
      )}
      {/* Белое неоновое свечение на поверхности карты для фигурных козырей на столе (только при вкл. подсветки) */}
      {isTrumpOnTable && trumpHighlightOn && compact && !tableCardMobile && !isNumericRank(card.rank) && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            borderRadius: Math.round(8 * scale),
            boxShadow: 'inset 0 0 24px rgba(255,255,255,0.42), inset 0 0 12px rgba(255,255,255,0.28)',
            border: '1px solid rgba(255,255,255,0.6)',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Бейдж «К» только на ПК; в мобильной версии — то же позиционирование, что у некозырей (без доп. элемента) */}
      {isTrumpOnTable && !isNumericRank(card.rank) && !tableCardMobile && !trumpOnDeck && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            zIndex: 10,
            fontSize: 10,
            fontWeight: 700,
            color: neon.border,
            opacity: 0.9,
            textShadow: `0 0 3px ${neon.border}99`,
          }}
          aria-label="Козырь"
        >
          К
        </span>
      )}
      {/* Карты 6–10 на столе (ПК) козырь: умеренная подсветка (без перебора), только при вкл. подсветки */}
      {isTrumpOnTable && trumpHighlightOn && compact && showDesktopFaceIndices && !tableCardMobile && isNumericRank(card.rank) && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 0,
            borderRadius: Math.round(8 * scale),
            background: `linear-gradient(145deg, ${neon.border}35 0%, #ffffff 35%, #f5f7fa 70%, ${neon.border}18 100%)`,
            boxShadow: [
              `inset 0 0 24px rgba(255,255,255,0.42)`,
              `inset 0 0 12px rgba(255,255,255,0.28)`,
              `0 0 0 1px rgba(255,255,255,0.75)`,
              `0 0 16px rgba(255,255,255,0.44)`,
              `0 0 8px ${neon.border}77`,
              `0 0 14px ${neon.border}44`,
              `0 2px 8px rgba(0,0,0,0.2)`,
              `inset 0 1px 6px rgba(255,255,255,0.5)`,
              `0 0 0 1px ${neon.border}99`,
            ].join(', '),
            border: `1px solid rgba(255,255,255,0.62)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Карты на столе (ПК): те же правила, что на руках — 4 угла, сетка пипов, границы; не для мобильной руки и не для козыря на колоде */}
      {compact && showDesktopFaceIndices && !tableCardMobile && !suitIndexInHandMobile && (!trumpOnDeck || pcCardStyles) && isNumericRank(card.rank) && (() => {
        const kTable = 1.2;
        const topRightTable = -4; /* верхний правый индекс масти чуть повыше (блок 2 — карты на столе) */
        return (
          <>
            <span style={{ position: 'absolute', top: -1, left: Math.round(3 * scale), fontSize: Math.round(14 * kTable * cs), fontWeight: 700, lineHeight: 1, zIndex: 1 }}>
              {card.rank}
            </span>
            <span style={{ position: 'absolute', top: topRightTable, right: Math.round(3 * scale), fontSize: Math.round(18 * kTable * cs), fontWeight: 700, lineHeight: 1, zIndex: 1 }}>
              {card.suit}
            </span>
            <span style={{ position: 'absolute', bottom: -3, left: Math.round(3 * scale), fontSize: Math.round(18 * kTable * cs), fontWeight: 700, lineHeight: 1, zIndex: 1 }}>
              {card.suit}
            </span>
            <span style={{ position: 'absolute', bottom: -2, right: Math.round(3 * scale), fontSize: Math.round(14 * kTable * cs), fontWeight: 700, lineHeight: 1, zIndex: 1 }}>
              {card.rank}
            </span>
          </>
        );
      })()}
      {/* Мобильная версия: простой центр без пипов (6–10) или индекс+фигура (В/Д/К/Т) */}
      {compact ? (
        isNumericRank(card.rank) ? (
          showDesktopFaceIndices && !tableCardMobile && !suitIndexInHandMobile && (!trumpOnDeck || pcCardStyles) ? null : (suitIndexInHandMobile || tableCardMobile || (trumpOnDeck && !pcCardStyles)) ? (
          /* Мобильная версия 6–10 (рука/стол мобильный или козырь на колоде только на мобильном): индексы масти как у фигур, значение по центру. На ПК козырь на колоде не сюда. */
          (() => {
            const faceK = 0.65;
            const suitBase = 24 * 1.5 * faceK * cs;
            const useMobileLayoutNum = suitIndexInHandMobile || tableCardMobile || (trumpOnDeck && !pcCardStyles);
            const suitSize = suitIndexInHandMobile ? suitBase / 1.5 : useMobileLayoutNum ? (suitBase / 1.4) * 1.1 : suitBase;
            const suitSizeFinal = suitSize / 1.1; /* тот же размер, что у нижнего индекса масти у фигур (J/Q/K) */
            const suitIndexScaleTrumpDeckMobile = (trumpOnDeck && !pcCardStyles) ? 1.18 : 1; /* мобильная: козырь на колоде — индексы масти чуть крупнее */
            const topSuitScaleTableMobile = tableCardMobile ? 1.15 : 1; /* мобильный стол 6–10: верхний индекс масти немного крупнее */
            const topLeftTable = 2; /* как у фигур: верхний левый индекс */
            const topLeftFinal = (trumpOnDeck && !pcCardStyles) ? topLeftTable - 2 : topLeftTable - 1; /* козырь на колоде мобильный: верхний индекс повыше */
            /* Легаси ♣ 6–10: верхний левый глиф — чуть выше и левее (не neo clubs-v3-gray) */
            const topLeftSuitTop = suitClubsV3 ? topLeftFinal - 2 : topLeftFinal;
            const topLeftSuitLeft = suitClubsV3 ? 2 : 3;
            /* Позиция нижнего правого индекса масти — та же формула, что у фигурных карт в мобильной версии */
            const suitBottom = suitIndexInHandMobile ? -2.5 : -3;
            const suitBottomFinal = suitBottom - 1.5;
            const bottomRightLift = suitBottomFinal + 1;
            /* В руке пользователя (мобильная) центральный индекс значения ещё в 1.1×1.1 раз мельче */
            const rankCenterSize = Math.round((28 / 1.3 / 1.1) * (suitIndexInHandMobile ? 1 / 1.1 / 1.1 : 1) * cs);
            return (
              <>
                <span style={{ position: 'absolute', top: topLeftSuitTop, left: topLeftSuitLeft, zIndex: 2, fontSize: Math.round((suitSizeFinal / 1.4 / 1.1) * suitIndexScaleTrumpDeckMobile * topSuitScaleTableMobile), fontWeight: 700, lineHeight: 1.1 }}>
                  {card.suit}
                </span>
                <span style={{ position: 'absolute', bottom: bottomRightLift, right: 3, zIndex: 2, fontSize: Math.round((suitSizeFinal / 1.1) * suitIndexScaleTrumpDeckMobile), fontWeight: 700, lineHeight: 1 }}>
                  {card.suit}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 'auto', marginBottom: 'auto', fontSize: rankCenterSize, fontWeight: 800, lineHeight: 1, position: 'relative', zIndex: 1 }}>
                  {card.rank}
                </span>
              </>
            );
          })()
          ) : (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0,
              lineHeight: 1,
              marginTop: 'auto',
              marginBottom: 'auto',
            }}
          >
            <span style={{ fontSize: Math.round(12 * cs), fontWeight: 700 }}>{card.rank}</span>
            <span style={{ fontSize: Math.round(18 * cs), lineHeight: 1 }}>{card.suit}</span>
          </span>
          )
        ) : (card.rank === 'J' && !hideJackCat && JACK_CAT_BY_SUIT[card.suit]) || (card.rank === 'Q' && QUEEN_IMAGE_BY_SUIT[card.suit]) || (card.rank === 'K' && KING_IMAGE_BY_SUIT[card.suit]) || (card.rank === 'A' && ACE_IMAGE_BY_SUIT[card.suit]) ? (
          showDesktopFaceIndices ? (
            (() => {
              const faceK = 0.65;
              const suitBase = 24 * 1.5 * faceK * cs;
              /* Мобильная раскладка только при мобильной руке/столе или козыре на колоде на мобильном; на ПК козырь на колоде = те же настройки, что карты на столе ПК */
              const useMobileLayout = (suitIndexInHandMobile || tableCardMobile) || (trumpOnDeck && !pcCardStyles);
              const isAceMobile = card.rank === 'A' && useMobileLayout;
              const isBlackSuit = card.suit === '♠' || card.suit === '♣';
              const isFaceBlackMobile = (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') && isBlackSuit && useMobileLayout;
              const suitSize = suitIndexInHandMobile ? suitBase / 1.5 : useMobileLayout ? (suitBase / 1.4) * 1.1 : suitBase;
              /* Мобильная раскладка: один размер индекса масти для всех мастей, в 1.1 раз мельче */
              const suitSizeFinal = useMobileLayout && (card.rank === 'A' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K')
                ? suitSize / 1.1
                : isAceMobile ? (isBlackSuit ? suitSize * 0.855 : suitSize * 0.874) : isFaceBlackMobile ? suitSize * 0.855 : suitSize;
              const suitIndexScaleTrumpDeckMobile = (trumpOnDeck && !pcCardStyles) ? 1.18 : 1; /* мобильная: козырь на колоде — индекс масти чуть крупнее */
              const rankBase = 18 * 1.21 * faceK * cs;
              const rankSize = suitIndexInHandMobile ? rankBase / 1.3 / 1.2 : useMobileLayout ? (rankBase / 1.3 / 1.2) * 1.2 : rankBase;
              const indexScaleTable = !useMobileLayout ? 1.2 : 1; /* ПК (стол и козырь на колоде): индексы в 1.2 раза крупнее */
              const suitBottom = suitIndexInHandMobile ? -2.5 : -3;
              const isFaceMobile = useMobileLayout && (card.rank === 'A' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K');
              const suitBottomFinal = isFaceMobile ? suitBottom - 1.5 : suitBottom;
              const bottomRightLift = isFaceMobile && (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A')
                ? suitBottomFinal + 1
                : suitBottomFinal;
              const topLeftTable = !useMobileLayout ? 0 : 2;
              const topLeftFinal = useMobileLayout ? topLeftTable - 1 : topLeftTable;
              const isMobileHandOrTable = suitIndexInHandMobile || tableCardMobile;
              /* Туз крестей в мобильной руке: фиксированное смещение вне зависимости от темы */
              const aceClubsMobileHandLift = card.rank === 'A' && card.suit === '♣' && suitIndexInHandMobile && useMobileLayout;
              /*
               * Явные оффсеты центра фигур/тузов по режимам.
               * Значения и приоритеты сохранены как были:
               * 1) A♣ в мобильной руке
               * 2) любая карта в мобильной руке
               * 3) мобильный стол / мобильная раскладка
               * 4) ПК-раскладка (с масштабом)
               */
              const centerFaceTransformDesktop = 'scale(1.44) translateY(3px)';
              const centerFaceOffsetMobileHand = 4;
              const centerFaceOffsetMobileLayout = 2;
              const centerFaceOffsetAceClubsMobileHand = -2;
              const centerFaceTransform =
                aceClubsMobileHandLift
                  ? `translateY(${centerFaceOffsetAceClubsMobileHand}px)`
                  : suitIndexInHandMobile
                    ? `translateY(${centerFaceOffsetMobileHand}px)`
                    : useMobileLayout
                      ? `translateY(${centerFaceOffsetMobileLayout}px)`
                      : centerFaceTransformDesktop;
              return (
            <>
              <span className="card-face-value-index" style={{ position: 'absolute', top: topLeftFinal, left: 3, zIndex: 2, fontSize: Math.round(rankSize * indexScaleTable), fontWeight: 900, lineHeight: 1.1 }}>
                {FACE_LABEL[card.rank] ?? card.rank}
              </span>
              <span
                className={isAceMobile ? (isBlackSuit ? 'card-ace-suit-index-mobile card-ace-suit-black' : 'card-ace-suit-index-mobile') : undefined}
                style={{ position: 'absolute', bottom: bottomRightLift, right: isMobileHandOrTable ? 3 : 1, zIndex: 2, fontSize: Math.round((suitSizeFinal * indexScaleTable) / (isMobileHandOrTable ? 1.1 : 1) * suitIndexScaleTrumpDeckMobile), fontWeight: 700, lineHeight: 1 }}
              >
                {card.suit}
              </span>
              <span style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto', position: 'relative', zIndex: 1,
                transform: centerFaceTransform,
              }}>
                {card.rank === 'A' ? (
                  <span
                    className={useMobileLayout ? 'card-ace-central-drawing' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: suitIndexInHandMobile ? '96%' : useMobileLayout ? '94%' : '92%', height: suitIndexInHandMobile ? '76%' : useMobileLayout ? '74%' : '72%', minHeight: suitIndexInHandMobile ? '76%' : useMobileLayout ? '74%' : '72%',
                      ...(card.suit === '♥' && !useMobileLayout && !mobileDarkHand
                        ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' }
                        : {}),
                    }}
                  >
                    <CardFaceImage
                      className={useMobileLayout ? `card-ace-central-img${aceClubsImgClass ? ` ${aceClubsImgClass}` : ''}` : aceClubsImgClass}
                      src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`}
                      alt="Т"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }}
                    />
                  </span>
                ) : (
                  <CardFaceImage
                    className={
                      card.rank === 'Q' && darkQueenSpadesFaceGlow ? 'card-queen-spades-dark-face' : undefined
                    }
                    src={card.rank === 'J' ? `/cards/${JACK_CAT_BY_SUIT[card.suit]}` : card.rank === 'Q' ? `/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}` : `/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[card.suit])}`}
                    alt={FACE_LABEL[card.rank] ?? card.rank}
                    style={{ maxWidth: suitIndexInHandMobile ? '96%' : useMobileLayout ? '94%' : '92%', maxHeight: suitIndexInHandMobile ? '76%' : useMobileLayout ? '74%' : '72%', objectFit: 'contain' }}
                  />
                )}
              </span>
            </>
              );
            })()
          ) : card.rank === 'J' ? (
            <>
              <span className="card-face-value-index" style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 900, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <CardFaceImage src={`/cards/${JACK_CAT_BY_SUIT[card.suit]}`} alt="В" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
              </span>
            </>
          ) : card.rank === 'Q' ? (
            <>
              <span className="card-face-value-index" style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 900, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <CardFaceImage
                  className={darkQueenSpadesFaceGlow ? 'card-queen-spades-dark-face' : undefined}
                  src={`/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}`}
                  alt="Д"
                  style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }}
                />
              </span>
            </>
          ) : card.rank === 'K' ? (
            <>
              <span className="card-face-value-index" style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 900, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <CardFaceImage src={`/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[card.suit])}`} alt="К" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
              </span>
            </>
          ) : (
            <>
              <span className="card-face-value-index" style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 900, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '95%', height: '85%', minHeight: '85%', marginTop: 'auto', marginBottom: 'auto',
                ...(card.suit === '♥' && !mobileDarkHand
                  ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' }
                  : {}),
              }}>
                <CardFaceImage className={aceClubsImgClass} src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`} alt="Т" style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }} />
              </span>
            </>
          )
        ) : (
          <>
            <span
              style={{
                position: 'absolute',
                top: 2,
                left: 4,
                fontSize: Math.round(10 * cs),
                fontWeight: 700,
                lineHeight: 1.1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
              }}
            >
              <span className={(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? 'card-face-value-index' : undefined} style={(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? { fontWeight: 900, fontSize: Math.round(10 * 1.21 * cs) } : undefined}>{FACE_LABEL[card.rank] ?? card.rank}</span>
              <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
            </span>
            <span
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0,
                lineHeight: 1,
                marginTop: 'auto',
                marginBottom: 'auto',
              }}
            >
              <span className="card-face-value-index" style={{ fontSize: Math.round(11 * cs), fontWeight: 900 }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
              <span style={{ fontSize: Math.round(12 * cs), lineHeight: 1 }}>{card.suit}</span>
            </span>
          </>
        )
      ) : (
        <>
          {/* Десктоп: рука игрока. Для 6–10: индексы крупнее (1.44×), раскладка — значение левый верх/правый низ, масть правый верх/левый низ. Фигуры — без увеличения. */}
          {!compact && isNumericRank(card.rank) ? (
            (() => {
              const k = 1.44; /* ещё крупнее в 1.2 раза относительно базовых 14/18 */
              return (
                <>
                  <span style={{ position: 'absolute', top: 0, left: Math.round(3 * scale), fontSize: Math.round(14 * k * cs), fontWeight: 700, lineHeight: 1 }}>
                    {card.rank}
                  </span>
                  <span style={{ position: 'absolute', top: -4, right: Math.round(3 * scale), fontSize: Math.round(18 * k * cs), fontWeight: 700, lineHeight: 1 }}>
                    {card.suit}
                  </span>
                  <span style={{ position: 'absolute', bottom: -1, left: Math.round(3 * scale), fontSize: Math.round(18 * k * cs), fontWeight: 700, lineHeight: 1 }}>
                    {card.suit}
                  </span>
                  <span style={{ position: 'absolute', bottom: -1, right: Math.round(3 * scale), fontSize: Math.round(14 * k * cs), fontWeight: 700, lineHeight: 1 }}>
                    {card.rank}
                  </span>
                </>
              );
            })()
          ) : (
            <>
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: Math.round(3 * scale),
                  fontSize: (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? Math.round(18 * cs) : Math.round(14 * cs),
                  fontWeight: 700,
                  lineHeight: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                }}
              >
                {(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? (
                  <>
                    <span className="card-face-value-index" style={{ fontWeight: 900, fontSize: Math.round(18 * 1.21 * cs) }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
                    <span style={{ fontSize: Math.round(18 * cs) }}>{card.suit}</span>
                  </>
                ) : (
                  <>
                    <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                    <span style={{ fontSize: Math.round(18 * cs) }}>{card.suit}</span>
                  </>
                )}
              </span>
              <span
                style={{
                  position: 'absolute',
                  bottom: (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? -4 : -1,
                  right: Math.round(3 * scale),
                  fontSize: Math.round(14 * cs),
                  fontWeight: 700,
                  lineHeight: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                }}
              >
                {(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? (
                  <span style={{ fontSize: Math.round(24 * 1.5 * cs) }}>{card.suit}</span>
                ) : (
                  <>
                    <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                    <span style={{ fontSize: Math.round(18 * cs) }}>{card.suit}</span>
                  </>
                )}
              </span>
            </>
          )}
        </>
      )}
      {/* Центр: пипы (6–10) — рука ПК и карты на столе (ПК). Мобильную руку не трогаем (suitIndexInHandMobile). */}
      {((!compact || (compact && showDesktopFaceIndices && !tableCardMobile && !suitIndexInHandMobile && (!trumpOnDeck || pcCardStyles))) && isNumericRank(card.rank)) ? (
        /* Рука ПК / стол ПК: сетка 3 колонки, те же правила; для compact — меньший размер пипов */
        (() => {
          const pipSize = compact ? Math.round(10 * 1.2 * cs) : Math.round(12 * 1.2 * cs);
          const rank = card.rank as RankNumeric;
          const positions = PIP_GRID_POSITIONS[rank];
          const usedOuterRows = getUsedOuterRows(rank);
          const outerRowToY = (row: number): number => {
            const idx = usedOuterRows.indexOf(row);
            if (idx === -1) return 50;
            return ((idx + 1) / (usedOuterRows.length + 1)) * 100;
          };
          const neonLineStyle: React.CSSProperties = {
            position: 'absolute',
            left: 0,
            right: 0,
            height: 1,
            background: `linear-gradient(90deg, transparent 0%, ${neon.border} 15%, ${neon.border} 85%, transparent 100%)`,
            boxShadow: `0 0 4px ${neon.border}, 0 0 8px ${neon.border}99`,
            pointerEvents: 'none',
          };
          /* Подсветка от линий к центру зоны пипов */
          const glowToCenterStyle: React.CSSProperties = {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            background: `linear-gradient(180deg, ${neon.border}1e 0%, ${neon.border}0a 22%, transparent 48%, transparent 52%, ${neon.border}0a 78%, ${neon.border}1e 100%)`,
            pointerEvents: 'none',
            borderRadius: 1,
          };
          return (
            <span
              style={{
                position: 'absolute',
                left: '12%',
                right: '12%',
                top: '20%',
                bottom: '20%',
                pointerEvents: 'none',
                lineHeight: 1,
                zIndex: 1,
              }}
            >
              {showPipZoneBorders && !(trumpOnDeck && !trumpDeckHighlightOn) && !(isTrumpInHand && !trumpHighlightOn) && !(isTrumpOnTableDim) && (
                <>
                  <span style={glowToCenterStyle} aria-hidden />
                  <span style={{ ...neonLineStyle, top: 0 }} aria-hidden />
                  <span style={{ ...neonLineStyle, bottom: 0 }} aria-hidden />
                </>
              )}
              {positions.map(({ col, row }, i) => {
                const x = COL_X[col];
                const y = col === 1
                  ? (rank === '6' ? (row === 0 ? outerRowToY(0) : outerRowToY(2))
                    : rank === '7' && row === 0 ? outerRowToY(1)
                    : rank === '8' ? (row === 0 ? outerRowToY(0) : outerRowToY(3))
                    : rank === '9' ? outerRowToY(row)
                    : rank === '10' ? (row === 0 ? (outerRowToY(0) + outerRowToY(1)) / 2 : (outerRowToY(2) + outerRowToY(3)) / 2)
                    : row === 1 ? outerRowToY(1) : CENTER_ROW_Y[0])
                  : outerRowToY(row);
                return (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                      fontSize: pipSize,
                      fontWeight: 600,
                    }}
                  >
                    {card.suit}
                  </span>
                );
              })}
            </span>
          );
        })()
      ) : !compact ? (
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              lineHeight: 1,
              marginTop: 'auto',
              marginBottom: 'auto',
            }}
          >
            {isNumericRank(card.rank) ? (
              PIP_LAYOUT[card.rank].map((count, rowIdx) => (
                <span
                  key={rowIdx}
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: 1,
                    fontSize: Math.round(12 * cs),
                    lineHeight: 1,
                  }}
                >
                  {Array.from({ length: count }, (_, i) => (
                    <span key={i}>{card.suit}</span>
                  ))}
                </span>
              ))
            ) : card.rank === 'J' && !hideJackCat && JACK_CAT_BY_SUIT[card.suit] ? (
              <CardFaceImage
                src={`/cards/${JACK_CAT_BY_SUIT[card.suit]}`}
                alt="В"
                style={{
                  maxWidth: '98%',
                  maxHeight: '78%',
                  objectFit: 'contain',
                }}
              />
            ) : card.rank === 'Q' && QUEEN_IMAGE_BY_SUIT[card.suit] ? (
              <CardFaceImage
                src={`/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}`}
                alt="Д"
                style={{
                  maxWidth: '98%',
                  maxHeight: '78%',
                  objectFit: 'contain',
                }}
              />
            ) : card.rank === 'K' && KING_IMAGE_BY_SUIT[card.suit] ? (
              <CardFaceImage
                src={`/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[card.suit])}`}
                alt="К"
                style={{
                  maxWidth: '98%',
                  maxHeight: '78%',
                  objectFit: 'contain',
                }}
              />
            ) : card.rank === 'A' && ACE_IMAGE_BY_SUIT[card.suit] ? (
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '98%', height: '78%', minHeight: '78%',
                ...(card.suit === '♥' && !mobileDarkHand
                  ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' }
                  : {}),
              }}>
                <CardFaceImage
                  className={aceClubsImgClass}
                  src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`}
                  alt="Т"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }}
                />
              </span>
            ) : (
              <>
                <span className="card-face-value-index" style={{ fontSize: Math.round(20 * cs), fontWeight: 900 }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(24 * cs), lineHeight: 1 }}>{card.suit}</span>
              </>
            )}
          </span>
      ) : null}
    </button>
  );
}
