/**
 * Фирменная «космическая» звезда Up&Down (не круг).
 * Тир по балансу: empty → spark → bright → bold → premium → mythic.
 */

import { useId } from 'react';
import {
  starGlyphTierFromBalance,
  type StarGlyphTier,
} from '../game/starGlyphTier';

export function StarBrandGlyph({
  className,
  size = 40,
  pulse,
  hollow,
  tier: tierProp,
  balance,
}: {
  className?: string;
  size?: number;
  pulse?: boolean;
  /** 0 ★ — контур без заливки (legacy; предпочтительнее balance/tier) */
  hollow?: boolean;
  /** Явный тир (лаба / превью) */
  tier?: StarGlyphTier;
  /** Баланс → тир автоматически */
  balance?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const gCore = `star-core-${uid}`;
  const gRay = `star-ray-${uid}`;
  const gBevel = `star-bevel-${uid}`;
  const gGold = `star-gold-${uid}`;

  const tier: StarGlyphTier =
    tierProp ??
    (hollow
      ? 'empty'
      : balance !== undefined
        ? starGlyphTierFromBalance(balance)
        : 'bright');

  const starPath =
    'M24 4 L28.8 18.2 L44 18.2 L32.1 27.4 L36.6 42 L24 33.2 L11.4 42 L15.9 27.4 L4 18.2 L19.2 18.2 Z';
  const corePath =
    'M24 14.5 L26.2 21.8 L33.8 21.8 L27.8 26.2 L29.8 33.8 L24 29.8 L18.2 33.8 L20.2 26.2 L14.2 21.8 L21.8 21.8 Z';

  const isEmpty = tier === 'empty';
  const showBevel = tier === 'bold' || tier === 'premium' || tier === 'mythic';
  const showPremiumLayers = tier === 'premium' || tier === 'mythic';
  const showMythic = tier === 'mythic';

  return (
    <svg
      className={[
        'star-brand-glyph',
        `star-brand-glyph--tier-${tier}`,
        pulse ? 'star-brand-glyph--pulse' : '',
        isEmpty ? 'star-brand-glyph--hollow' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      data-star-tier={tier}
    >
      <defs>
        <linearGradient id={gCore} x1="8%" y1="6%" x2="92%" y2="94%">
          {tier === 'spark' ? (
            <>
              <stop offset="0%" stopColor="#e2e8f0" />
              <stop offset="40%" stopColor="#94a3b8" />
              <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.85" />
            </>
          ) : tier === 'bold' ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="28%" stopColor="#67e8f9" />
              <stop offset="62%" stopColor="#c4b5fd" />
              <stop offset="100%" stopColor="#f0abfc" />
            </>
          ) : showPremiumLayers ? (
            <>
              <stop offset="0%" stopColor="#fffbeb" />
              <stop offset="22%" stopColor="#67e8f9" />
              <stop offset="48%" stopColor="#a78bfa" />
              <stop offset="72%" stopColor="#f472b6" />
              <stop offset="100%" stopColor="#fbbf24" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#f5f3ff" />
              <stop offset="35%" stopColor="#67e8f9" />
              <stop offset="68%" stopColor="#a78bfa" />
              <stop offset="100%" stopColor="#e879f9" />
            </>
          )}
        </linearGradient>
        <linearGradient id={gRay} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity={showMythic ? 0.35 : 0.15} />
          <stop offset="50%" stopColor="#c4b5fd" stopOpacity={showMythic ? 0.85 : 0.55} />
          <stop offset="100%" stopColor="#f472b6" stopOpacity={showMythic ? 0.35 : 0.15} />
        </linearGradient>
        <linearGradient id={gBevel} x1="20%" y1="10%" x2="80%" y2="90%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={gGold} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {isEmpty ? (
        <>
          <circle
            className="star-brand-glyph__halo"
            cx="24"
            cy="24"
            r="21"
            fill={`url(#${gRay})`}
            opacity="0.35"
          />
          <path
            className="star-brand-glyph__body star-brand-glyph__body--hollow"
            fill="none"
            stroke={`url(#${gCore})`}
            strokeWidth="2.4"
            strokeLinejoin="round"
            d={starPath}
          />
        </>
      ) : (
        <>
          {showMythic ? (
            <circle
              className="star-brand-glyph__aura"
              cx="24"
              cy="24"
              r="22.5"
              fill={`url(#${gGold})`}
              opacity="0.45"
            />
          ) : null}
          <circle
            className="star-brand-glyph__halo"
            cx="24"
            cy="24"
            r={showPremiumLayers ? 22 : 21}
            fill={`url(#${gRay})`}
            opacity={tier === 'spark' ? 0.45 : 1}
          />
          {showBevel ? (
            <path
              className="star-brand-glyph__shadow"
              fill="#1e1b4b"
              opacity="0.28"
              transform="translate(0.8 1.1)"
              d={starPath}
            />
          ) : null}
          <path className="star-brand-glyph__body" fill={`url(#${gCore})`} d={starPath} />
          {showBevel ? (
            <path
              className="star-brand-glyph__bevel"
              fill={`url(#${gBevel})`}
              opacity="0.55"
              d={starPath}
              style={{ mixBlendMode: 'soft-light' }}
            />
          ) : null}
          {tier !== 'spark' ? (
            <path
              className="star-brand-glyph__core"
              fill={showMythic ? '#fffbeb' : '#faf5ff'}
              opacity={tier === 'bright' ? 0.92 : showPremiumLayers ? 0.98 : 0.95}
              d={corePath}
            />
          ) : (
            <path
              className="star-brand-glyph__core star-brand-glyph__core--soft"
              fill="#f1f5f9"
              opacity="0.55"
              d={corePath}
            />
          )}
          {showPremiumLayers ? (
            <path
              className="star-brand-glyph__sheen"
              fill="none"
              stroke={`url(#${gGold})`}
              strokeWidth={showMythic ? 1.6 : 1.15}
              strokeLinejoin="round"
              opacity={showMythic ? 0.9 : 0.7}
              d={starPath}
            />
          ) : null}
        </>
      )}
    </svg>
  );
}
