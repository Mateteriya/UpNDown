/**
 * Отображение карты
 */

import { useState } from 'react';
import type { ImgHTMLAttributes } from 'react';
import type { Card } from '../game/types';
import { useTheme } from '../contexts/ThemeContext';
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
}

const suitColorLight: Record<string, string> = {
  '♠': '#0f172a',
  '♥': '#c41e3a',  /* черви: насыщенный красный */
  '♦': '#ea580c',  /* буби: оранжевый */
  '♣': '#3b0764',  /* крести: ультрафиолетовый */
};
const suitColorDark: Record<string, string> = {
  '♠': '#94a3b8',  /* пики: светло-серебристый для тёмного фона */
  '♥': '#f87171',  /* черви: яркий красный для контраста на тёмном */
  '♦': '#fdba74',  /* буби: яркий янтарный для контраста на тёмном */
  '♣': '#c4b5fd',  /* крести: светло-фиолетовый, отличим от пик */
};

/** Неоновые цвета рамочек по мастям — двойная рамка (бордюр + outline), чёткая */
const suitNeonBorder: Record<string, { border: string; outline: string }> = {
  '♠': { border: '#22d3ee', outline: '0 0 0 2px #22d3ee' },
  '♥': { border: '#f43f5e', outline: '0 0 0 2px #f43f5e' },   /* черви: насыщенный красный */
  '♦': { border: '#fb923c', outline: '0 0 0 2px #fb923c' },   /* буби: оранжевый */
  '♣': { border: '#5b21b6', outline: '0 0 0 2px #5b21b6' },   /* крести: ультрафиолетовый глубокий космический тёмный */
};

/** Тёмная тема: градиент карт — синий и фиолетовый космический оттенок */
const CARD_BG_DARK = 'linear-gradient(145deg, #0f172a 0%, #1e293b 20%, #312e81 40%, #334155 60%, #1e293b 80%, #0f172a 100%)';
const CARD_BG_DARK_TRUMP = 'linear-gradient(145deg, #1e293b 0%, #312e81 25%, #4338ca 50%, #334155 75%, #1e293b 100%)';
const CARD_BG_DARK_HIGHLIGHT = 'linear-gradient(145deg, #1e293b 0%, #334155 30%, #475569 50%, #334155 70%, #1e293b 100%)';

export function CardView({ card, onClick, disabled, compact, isTrumpOnTable, doubleBorder = true, trumpOnDeck, trumpDeckHighlightOn = true, isTrumpInHand, trumpHighlightOn = true, scale = 1, contentScale, hideJackCat = false, showDesktopFaceIndices = false, suitIndexInHandMobile = false, tableCardMobile = false, biddingHighlightMobile = false, biddingHighlightPC = false, showPipZoneBorders = true, pcCardStyles = true, thinBorder = false, forceMobileTrumpGlow = false, mobileTrumpGlowActive = true, highlightAsValidPlay = false, mobileTrumpShineBidding = false }: CardViewProps) {
  const { theme } = useTheme();
  /** Тёмная тема карт — только на мобильной/планшете; на ПК всегда светлый стиль */
  const isDark = theme === 'neon' && !pcCardStyles;
  const cs = contentScale ?? scale;
  const suitColor = isDark ? suitColorDark : suitColorLight;
  const color = suitColor[card.suit];
  const neon = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
  /** Тёмная тема: рамки карт — цвет индексов (suitColor), иначе неон */
  const borderColor = isDark ? color : neon.border;
  const bw = compact ? 52 : 70;
  const bh = compact ? 76 : 100;
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);
  const baseShadow = doubleBorder ? neon.outline : 'none';
  const isMobileHandTrump = mobileTrumpGlowActive && (forceMobileTrumpGlow || (!pcCardStyles && !!isTrumpInHand));
  const showMobileHandHighlight = isMobileHandTrump || (!!highlightAsValidPlay && !pcCardStyles);
  const isNonTrumpWithHighlight = pcCardStyles && doubleBorder && !trumpOnDeck && !(isTrumpOnTable && trumpHighlightOn) && !(isTrumpInHand && trumpHighlightOn);
  const isTableNumericTrump = isTrumpOnTable && compact && showDesktopFaceIndices && !tableCardMobile && isNumericRank(card.rank);
  const isTrumpOnTableDim = pcCardStyles && isTrumpOnTable && !trumpHighlightOn;
  let trumpShadow = isTrumpOnTable && trumpHighlightOn
    ? `${baseShadow}, 0 0 0 1px rgba(255,255,255,0.85), 0 0 18px rgba(255,255,255,0.52), 0 0 12px ${neon.border}bb, 0 0 20px ${neon.border}66, inset 0 0 14px ${neon.border}33, inset 0 1px 6px rgba(255,255,255,0.52)`
    : baseShadow;
  if (trumpOnDeck) {
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
    trumpShadow = [
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
  } else if (showMobileHandHighlight) {
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

  /* Мобильная рука при вкл. подсветке: тонкая цветная обводка по масти (в box-shadow, чтобы не обрезалась обёрткой) */
  const mobileHandHighlightRing = suitIndexInHandMobile && trumpHighlightOn ? `0 0 0 1px ${neon.border}` : '';
  const baseCardShadow = biddingHighlightPC
    ? `${trumpShadow}, 0 0 12px rgba(255,255,255,0.38)`
    : mobileHandHighlightRing ? (trumpShadow === 'none' ? mobileHandHighlightRing : `${trumpShadow}, ${mobileHandHighlightRing}`) : trumpShadow;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={trumpOnDeck ? (trumpDeckHighlightOn ? 'trump-on-deck trump-on-deck--full' : 'trump-on-deck trump-on-deck--dim') : pcCardStyles && (isTrumpInHand || isTrumpOnTableDim) && !trumpHighlightOn ? 'trump-in-hand-dim' : undefined}
      style={{
        width: w,
        height: h,
        minWidth: w,
        minHeight: h,
        padding: Math.round(4 * scale),
        margin: compact ? Math.round(2 * scale) : Math.round(4 * scale),
        /* В мобильной руке при подсветке: цветная рамка по масти (и для козырей тоже при вкл. подсветки); иначе козырь/доступный ход — белая рамка */
        border: showMobileHandHighlight && thinBorder
          ? (suitIndexInHandMobile && trumpHighlightOn ? `1px solid ${borderColor}` : '1px solid rgba(255,255,255,0.98)')
          : showMobileHandHighlight
          ? '3px solid rgba(255,255,255,0.98)'
          : (thinBorder ? `1px solid ${borderColor}` : (trumpOnDeck && !trumpDeckHighlightOn ? `2px solid ${borderColor}bb` : (doubleBorder ? (isNonTrumpWithHighlight ? `2px solid ${borderColor}` : `3px solid ${borderColor}`) : `2px solid ${borderColor}`))),
        outline: thinBorder
          ? (suitIndexInHandMobile && trumpHighlightOn ? `1px solid ${borderColor}cc` : 'none')
          : (trumpOnDeck ? (trumpDeckHighlightOn ? `2px solid ${borderColor}ee` : `1px solid ${borderColor}99`) : (isTrumpOnTable && trumpHighlightOn) ? `2px solid rgba(200,220,160,0.92)` : (doubleBorder ? (isNonTrumpWithHighlight ? `1px solid ${borderColor}cc` : `2px solid ${borderColor}cc`) : 'none')),
        outlineOffset: trumpOnDeck ? 1 : (suitIndexInHandMobile && trumpHighlightOn) ? 1 : (isTrumpOnTable && trumpHighlightOn) ? 2 : 0,
        borderRadius: Math.round(8 * scale),
        boxShadow: biddingHighlightMobile ? undefined : baseCardShadow,
        background: isDark
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
                    : 'linear-gradient(145deg, #f8fafc, #e2e8f0)',
        color,
        fontSize: Math.round((compact ? 12 : 14) * cs),
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: trumpOnDeck ? 1 : biddingHighlightMobile ? 1 : biddingHighlightPC ? 1 : isMobileHandTrump ? 1 : disabled ? 0.6 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
        ...(biddingHighlightMobile ? {
          boxShadow: `${trumpShadow}, 0 0 10px ${neon.border}88, 0 0 16px ${neon.border}44`,
          transform: 'scale(1.06)',
          transformOrigin: 'center bottom',
        } : {}),
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1,
        overflow: 'hidden',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          const n = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
          e.currentTarget.style.transform = 'translateY(-4px)';
          const hoverShadow = isTrumpOnTable
            ? `0 4px 12px rgba(0,0,0,0.25), ${n.outline}, 0 0 14px ${n.border}99`
            : `0 4px 12px rgba(0,0,0,0.25), ${n.outline}`;
          e.currentTarget.style.boxShadow = hoverShadow;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = baseCardShadow;
      }}
    >
      {/* Блеск-отблеск: козыри в руке при заказе (раз в ~4 с) и доступные для хода карты при нашем ходе (раз в ~5 с) */}
      {(mobileTrumpShineBidding || (highlightAsValidPlay && !pcCardStyles && !!isTrumpInHand)) && (
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
            /* Позиция нижнего правого индекса масти — та же формула, что у фигурных карт в мобильной версии */
            const suitBottom = suitIndexInHandMobile ? -2.5 : -3;
            const suitBottomFinal = suitBottom - 1.5;
            const bottomRightLift = suitBottomFinal + 1;
            /* В руке пользователя (мобильная) центральный индекс значения ещё в 1.1×1.1 раз мельче */
            const rankCenterSize = Math.round((28 / 1.3 / 1.1) * (suitIndexInHandMobile ? 1 / 1.1 / 1.1 : 1) * cs);
            return (
              <>
                <span style={{ position: 'absolute', top: topLeftFinal, left: 3, zIndex: 2, fontSize: Math.round((suitSizeFinal / 1.4 / 1.1) * suitIndexScaleTrumpDeckMobile * topSuitScaleTableMobile), fontWeight: 700, lineHeight: 1.1 }}>
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
              /* Туз крестей в тёмной теме на мобильной: центральный рисунок чуть выше */
              const aceClubsDarkMobileLift = card.rank === 'A' && card.suit === '♣' && isDark && useMobileLayout;
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
                /* ПК стол: центральный рисунок чуть ниже — строго по центру */
                ...(!useMobileLayout ? { transform: 'scale(1.44) translateY(3px)' } : {}),
                /* Мобильная рука: 4px вниз; мобильный стол (и козырь на колоде): 2px вниз — по центру */
                /* Туз крестей в тёмной теме на мобильной: приподнять центральный рисунок */
                ...(aceClubsDarkMobileLift ? { transform: 'translateY(-2px)' } : suitIndexInHandMobile ? { transform: 'translateY(4px)' } : useMobileLayout ? { transform: 'translateY(2px)' } : {}),
              }}>
                {card.rank === 'A' ? (
                  <span
                    className={useMobileLayout ? 'card-ace-central-drawing' : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', width: suitIndexInHandMobile ? '96%' : useMobileLayout ? '94%' : '92%', height: suitIndexInHandMobile ? '76%' : useMobileLayout ? '74%' : '72%', minHeight: suitIndexInHandMobile ? '76%' : useMobileLayout ? '74%' : '72%',
                      ...(card.suit === '♥' && !useMobileLayout ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' } : {}),
                    }}
                  >
                    <CardFaceImage
                      className={useMobileLayout ? `card-ace-central-img${card.suit === '♣' && pcCardStyles ? ' card-ace-clubs-img' : ''}` : card.suit === '♣' && pcCardStyles ? 'card-ace-clubs-img' : undefined}
                      src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`}
                      alt="Т"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }}
                    />
                  </span>
                ) : (
                  <CardFaceImage
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
                <CardFaceImage src={`/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}`} alt="Д" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
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
                ...(card.suit === '♥' ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' } : {}),
              }}>
                <CardFaceImage className={card.suit === '♣' && pcCardStyles ? 'card-ace-clubs-img' : undefined} src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`} alt="Т" style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }} />
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
                ...(card.suit === '♥' ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' } : {}),
              }}>
                <CardFaceImage
                  className={card.suit === '♣' && pcCardStyles ? 'card-ace-clubs-img' : undefined}
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
