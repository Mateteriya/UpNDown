/**
 * Отображение карты
 */

import type { Card } from '../game/types';

interface CardViewProps {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  compact?: boolean;
  /** Подсветка козыря на столе — мягкий цвет */
  isTrumpOnTable?: boolean;
  /** Двойная рамка (бордюр + outline). При false — одна рамка */
  doubleBorder?: boolean;
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

export function CardView({ card, onClick, disabled, compact, isTrumpOnTable, doubleBorder = true }: CardViewProps) {
  const color = suitColor[card.suit];
  const neon = suitNeonBorder[card.suit] ?? suitNeonBorder['♠'];
  const w = compact ? 52 : 70;
  const h = compact ? 76 : 100;
  const baseShadow = doubleBorder ? neon.outline : 'none';
  const trumpShadow = isTrumpOnTable
    ? `${baseShadow}, 0 0 14px ${neon.border}dd, 0 0 22px ${neon.border}77, inset 0 0 14px ${neon.border}33`
    : baseShadow;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        width: w,
        height: h,
        minWidth: w,
        minHeight: h,
        padding: 4,
        margin: compact ? 2 : 4,
        border: doubleBorder ? `3px solid ${neon.border}` : `2px solid ${neon.border}`,
        outline: (doubleBorder && isTrumpOnTable) ? `2px solid ${neon.border}cc` : 'none',
        outlineOffset: isTrumpOnTable ? 2 : 0,
        borderRadius: 8,
        boxShadow: trumpShadow,
        background: isTrumpOnTable
          ? `linear-gradient(145deg, ${neon.border}38 0%, #f8fafc 35%, #e2e8f0 100%)`
          : 'linear-gradient(145deg, #f8fafc, #e2e8f0)',
        color,
        fontSize: compact ? 12 : 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'transform 0.15s, box-shadow 0.15s',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 1.2,
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
      <span>{card.rank}</span>
      <span style={{ fontSize: compact ? 18 : 24 }}>{card.suit}</span>
    </button>
  );
}
