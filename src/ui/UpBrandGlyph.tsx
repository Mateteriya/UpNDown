/**
 * Фирменный символ UP — стрелка вверх (не слово).
 * В интерфейсе живёт как иконка валюты уважения, рядом с числом: как HP / XP.
 */

import { useId } from 'react';

export function UpBrandGlyph({
  className,
  size = 22,
  pulse,
}: {
  className?: string;
  size?: number;
  pulse?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const gFill = `up-fill-${uid}`;
  const gGlow = `up-glow-${uid}`;

  return (
    <svg
      className={['up-brand-glyph', pulse ? 'up-brand-glyph--pulse' : '', className]
        .filter(Boolean)
        .join(' ')}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gFill} x1="20%" y1="100%" x2="80%" y2="0%">
          <stop offset="0%" stopColor="#a004ad" />
          <stop offset="40%" stopColor="#61077c" />
          <stop offset="78%" stopColor="#3405a5" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id={gGlow} cx="50%" cy="45%" r="58%">
          <stop offset="0%" stopColor="#e19802" stopOpacity="0.45" />
          <stop offset="55%" stopColor="#96028f" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#26017e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="up-brand-glyph__halo" cx="20" cy="20" r="18" fill={`url(#${gGlow})`} />
      {/* Tech arrow shaft + head */}
      <path
        className="up-brand-glyph__body"
        fill={`url(#${gFill})`}
        d="M20 5.5 L30.5 17.2 L24.2 17.2 L24.2 33.5 L15.8 33.5 L15.8 17.2 L9.5 17.2 Z"
      />
      <path
        className="up-brand-glyph__edge"
        fill="none"
        stroke="rgba(255, 210, 140, 0.55)"
        strokeWidth="1.1"
        d="M20 7.2 L28.2 16.2 L23.1 16.2 L23.1 32.2 L16.9 32.2 L16.9 16.2 L11.8 16.2 Z"
      />
      <path
        className="up-brand-glyph__core"
        fill="#ffe8a3"
        opacity="0.92"
        d="M20 11.5 L24.6 16.5 L21.4 16.5 L21.4 28.5 L18.6 28.5 L18.6 16.5 L15.4 16.5 Z"
      />
    </svg>
  );
}

/** Чип-символ: ↑ + значение + метка UP (как HP/XP). */
export function UpBrandMark({
  value,
  signed = false,
  size = 'md',
  pulse,
  className,
  ariaLabel,
}: {
  value?: number;
  /** Показать «+» перед числом */
  signed?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const glyphSize = size === 'xs' ? 12 : size === 'sm' ? 14 : size === 'lg' ? 22 : 18;
  const n =
    value == null
      ? null
      : signed && value > 0
        ? `+${value}`
        : String(value);

  return (
    <span
      className={['up-brand-mark', `up-brand-mark--${size}`, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <UpBrandGlyph size={glyphSize} pulse={pulse} />
      {n != null ? <strong className="up-brand-mark__n">{n}</strong> : null}
      <em className="up-brand-mark__tag">UP</em>
    </span>
  );
}
