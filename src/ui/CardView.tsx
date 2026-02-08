/**
 * Отображение карты
 */

import type { Card } from '../game/types';

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

/** Масть → имя файла валета-кота */
const JACK_CAT_BY_SUIT: Record<string, string> = {
  '♠': 'jack-cat-hat-spades.png',
  '♥': 'jack-cat-hat-hearts.png',
  '♦': 'jack-cat-hat-diamonds.png',
  '♣': 'jack-cat-hat-clubs.png',
};

/** Масть → имя файла дамы */
const QUEEN_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Дама Пики.png',
  '♥': 'Дама Черви.png',
  '♦': 'Дама Буби.png',
  '♣': 'Дама Крести.png',
};

/** Масть → имя файла короля */
const KING_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Король Пики.png',
  '♥': 'Король Черви.png',
  '♦': 'Король Буби.png',
  '♣': 'Король Крести.png',
};

/** Масть → имя файла туза */
const ACE_IMAGE_BY_SUIT: Record<string, string> = {
  '♠': 'Туз Пик.png',
  '♥': 'Туз Червей.png',
  '♦': 'Туз Бубей.png',
  '♣': 'Туз Крестей.png',
};

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
}

const suitColor: Record<string, string> = {
  '♠': '#0f172a',
  '♥': '#dc2626',
  '♦': '#dc2626',
  '♣': '#0f172a',
};

/** Неоновые цвета рамочек по мастям — двойная рамка (бордюр + outline), чёткая */
const suitNeonBorder: Record<string, { border: string; outline: string }> = {
  '♠': { border: '#22d3ee', outline: '0 0 0 2px #22d3ee' },
  '♥': { border: '#f472b6', outline: '0 0 0 2px #f472b6' },
  '♦': { border: '#fbbf24', outline: '0 0 0 2px #fbbf24' },
  '♣': { border: '#34d399', outline: '0 0 0 2px #34d399' },
};

export function CardView({ card, onClick, disabled, compact, isTrumpOnTable, doubleBorder = true, trumpOnDeck, trumpDeckHighlightOn = true, scale = 1, contentScale, hideJackCat = false, showDesktopFaceIndices = false, suitIndexInHandMobile = false, tableCardMobile = false }: CardViewProps) {
  const cs = contentScale ?? scale;
  const color = suitColor[card.suit];
  const neon = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
  const bw = compact ? 52 : 70;
  const bh = compact ? 76 : 100;
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);
  const baseShadow = doubleBorder ? neon.outline : 'none';
  let trumpShadow = isTrumpOnTable
    ? `${baseShadow}, 0 0 14px ${neon.border}dd, 0 0 22px ${neon.border}77, inset 0 0 14px ${neon.border}33`
    : baseShadow;
  if (trumpOnDeck) {
    const q = trumpDeckHighlightOn ? 1 : 0.5;
    trumpShadow = [
      baseShadow,
      `0 0 0 1px rgba(255,255,255,${0.3 * q + 0.2})`,
      `0 0 ${20 * q}px ${neon.border}${Math.round(0xcc * q).toString(16).padStart(2, '0')}`,
      `0 0 ${36 * q}px ${neon.border}${Math.round(0x99 * q).toString(16).padStart(2, '0')}`,
      `0 4px ${16 * q}px rgba(0,0,0,${0.3 + 0.1 * q})`,
      `inset 0 2px ${8 * q}px rgba(255,255,255,${0.2 + 0.15 * q})`,
      `inset 0 -1px ${4 * q}px rgba(0,0,0,${0.1 + 0.08 * q})`,
    ].join(', ');
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={trumpOnDeck ? (trumpDeckHighlightOn ? 'trump-on-deck trump-on-deck--full' : 'trump-on-deck trump-on-deck--dim') : undefined}
      style={{
        width: w,
        height: h,
        minWidth: w,
        minHeight: h,
        padding: Math.round(4 * scale),
        margin: compact ? Math.round(2 * scale) : Math.round(4 * scale),
        border: doubleBorder ? `3px solid ${neon.border}` : `2px solid ${neon.border}`,
        outline: trumpOnDeck ? `2px solid ${neon.border}ee` : (doubleBorder && isTrumpOnTable) ? `2px solid ${neon.border}cc` : 'none',
        outlineOffset: trumpOnDeck ? 1 : isTrumpOnTable ? 2 : 0,
        borderRadius: Math.round(8 * scale),
        boxShadow: trumpShadow,
        background: trumpOnDeck
          ? `linear-gradient(145deg, ${neon.border}50 0%, #ffffff 30%, #f1f5f9 70%, ${neon.border}25 100%)`
          : isTrumpOnTable
            ? `linear-gradient(145deg, ${neon.border}38 0%, #f8fafc 35%, #e2e8f0 100%)`
            : 'linear-gradient(145deg, #f8fafc, #e2e8f0)',
        color,
        fontSize: Math.round((compact ? 12 : 14) * cs),
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: trumpOnDeck ? 1 : disabled ? 0.6 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
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
            ? `0 4px 12px rgba(0,0,0,0.25), ${n.outline}, 0 0 18px ${n.border}bb`
            : `0 4px 12px rgba(0,0,0,0.25), ${n.outline}`;
          e.currentTarget.style.boxShadow = hoverShadow;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = '';
        e.currentTarget.style.boxShadow = trumpShadow;
      }}
    >
      {isTrumpOnTable && (
        <span
          style={{
            position: 'absolute',
            top: 2,
            right: 4,
            fontSize: 10,
            fontWeight: 700,
            color: neon.border,
            opacity: 0.9,
            textShadow: `0 0 3px ${neon.border}99`,
          }}
        >
          К
        </span>
      )}
      {/* Мобильная версия: простой центр без пипов (6–10) или индекс+фигура (В/Д/К/Т) */}
      {compact ? (
        isNumericRank(card.rank) ? (
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
        ) : (card.rank === 'J' && !hideJackCat && JACK_CAT_BY_SUIT[card.suit]) || (card.rank === 'Q' && QUEEN_IMAGE_BY_SUIT[card.suit]) || (card.rank === 'K' && KING_IMAGE_BY_SUIT[card.suit]) || (card.rank === 'A' && ACE_IMAGE_BY_SUIT[card.suit]) ? (
          showDesktopFaceIndices ? (
            (() => {
              const faceK = 0.65;
              const suitBase = 24 * 1.5 * faceK * cs;
              const suitSize = suitIndexInHandMobile ? suitBase / 1.5 : tableCardMobile ? (suitBase / 1.4) * 1.1 : suitBase;
              const rankBase = 18 * 1.21 * faceK * cs;
              const rankSize = suitIndexInHandMobile ? rankBase / 1.3 / 1.2 : tableCardMobile ? (rankBase / 1.3 / 1.2) * 1.2 : rankBase;
              const suitBottom = suitIndexInHandMobile ? -2.5 : tableCardMobile ? -3 : -6;
              return (
            <>
              <span style={{ position: 'absolute', top: 2, left: 3, zIndex: 2, fontSize: Math.round(rankSize), fontWeight: 800, lineHeight: 1.1 }}>
                {FACE_LABEL[card.rank] ?? card.rank}
              </span>
              <span style={{ position: 'absolute', bottom: suitBottom, right: 3, zIndex: 2, fontSize: Math.round(suitSize), fontWeight: 700, lineHeight: 1 }}>
                {card.suit}
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto', position: 'relative', zIndex: 1 }}>
                {card.rank === 'A' ? (
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', width: suitIndexInHandMobile ? '96%' : tableCardMobile ? '94%' : '92%', height: suitIndexInHandMobile ? '76%' : tableCardMobile ? '74%' : '72%', minHeight: suitIndexInHandMobile ? '76%' : tableCardMobile ? '74%' : '72%',
                    ...(card.suit === '♥' ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' } : {}),
                  }}>
                    <img src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`} alt="Т" style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }} />
                  </span>
                ) : (
                  <img
                    src={card.rank === 'J' ? `/cards/${JACK_CAT_BY_SUIT[card.suit]}` : card.rank === 'Q' ? `/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}` : `/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[card.suit])}`}
                    alt={FACE_LABEL[card.rank] ?? card.rank}
                    style={{ maxWidth: suitIndexInHandMobile ? '96%' : tableCardMobile ? '94%' : '92%', maxHeight: suitIndexInHandMobile ? '76%' : tableCardMobile ? '74%' : '72%', objectFit: 'contain' }}
                  />
                )}
              </span>
            </>
              );
            })()
          ) : card.rank === 'J' ? (
            <>
              <span style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 800, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <img src={`/cards/${JACK_CAT_BY_SUIT[card.suit]}`} alt="В" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
              </span>
            </>
          ) : card.rank === 'Q' ? (
            <>
              <span style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 800, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <img src={`/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}`} alt="Д" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
              </span>
            </>
          ) : card.rank === 'K' ? (
            <>
              <span style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 800, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, lineHeight: 1, marginTop: 'auto', marginBottom: 'auto' }}>
                <img src={`/cards/${encodeURIComponent(KING_IMAGE_BY_SUIT[card.suit])}`} alt="К" style={{ maxWidth: '95%', maxHeight: '85%', objectFit: 'contain' }} />
              </span>
            </>
          ) : (
            <>
              <span style={{ position: 'absolute', top: 2, left: 4, fontSize: Math.round(10 * 1.21 * cs), fontWeight: 800, lineHeight: 1.1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(12 * cs) }}>{card.suit}</span>
              </span>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '95%', height: '85%', minHeight: '85%', marginTop: 'auto', marginBottom: 'auto',
                ...(card.suit === '♥' ? { borderRadius: '24%', overflow: 'hidden', boxShadow: 'inset 0 0 22px rgba(255,255,255,0.28), inset 0 0 44px rgba(255,182,193,0.22)' } : {}),
              }}>
                <img src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`} alt="Т" style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }} />
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
              <span style={(card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'A') ? { fontWeight: 800, fontSize: Math.round(10 * 1.21 * cs) } : undefined}>{FACE_LABEL[card.rank] ?? card.rank}</span>
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
              <span style={{ fontSize: Math.round(11 * cs), fontWeight: 700 }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
              <span style={{ fontSize: Math.round(12 * cs), lineHeight: 1 }}>{card.suit}</span>
            </span>
          </>
        )
      ) : (
        <>
          {/* Десктоп/планшет: индексы чуть от вертикальных границ */}
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
                <span style={{ fontWeight: 800, fontSize: Math.round(18 * 1.21 * cs) }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
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
              bottom: -1,
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
          {/* Центр: пипы (6–10), валет-кот (J), дама (Q) или фигура (К/Т) */}
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
              <img
                src={`/cards/${JACK_CAT_BY_SUIT[card.suit]}`}
                alt="В"
                style={{
                  maxWidth: '98%',
                  maxHeight: '78%',
                  objectFit: 'contain',
                }}
              />
            ) : card.rank === 'Q' && QUEEN_IMAGE_BY_SUIT[card.suit] ? (
              <img
                src={`/cards/${encodeURIComponent(QUEEN_IMAGE_BY_SUIT[card.suit])}`}
                alt="Д"
                style={{
                  maxWidth: '98%',
                  maxHeight: '78%',
                  objectFit: 'contain',
                }}
              />
            ) : card.rank === 'K' && KING_IMAGE_BY_SUIT[card.suit] ? (
              <img
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
                <img
                  src={`/cards/${encodeURIComponent(ACE_IMAGE_BY_SUIT[card.suit])}`}
                  alt="Т"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', ...(card.suit === '♣' ? { transform: 'scale(1.90)', transformOrigin: 'center' } : {}) }}
                />
              </span>
            ) : (
              <>
                <span style={{ fontSize: Math.round(20 * cs), fontWeight: 700 }}>{FACE_LABEL[card.rank] ?? card.rank}</span>
                <span style={{ fontSize: Math.round(24 * cs), lineHeight: 1 }}>{card.suit}</span>
              </>
            )}
          </span>
        </>
      )}
    </button>
  );
}
