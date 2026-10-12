/**
 * Фирменная «космическая» звезда Up&Down (не круг).
 */

import { useId } from 'react';

export function StarBrandGlyph({
  className,
  size = 40,
  pulse,
}: {
  className?: string;
  size?: number;
  pulse?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const gCore = `star-core-${uid}`;
  const gRay = `star-ray-${uid}`;

  return (
    <svg
      className={['star-brand-glyph', pulse ? 'star-brand-glyph--pulse' : '', className]
        .filter(Boolean)
        .join(' ')}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gCore} x1="8%" y1="6%" x2="92%" y2="94%">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="35%" stopColor="#67e8f9" />
          <stop offset="68%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <linearGradient id={gRay} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
          <stop offset="50%" stopColor="#c4b5fd" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <circle className="star-brand-glyph__halo" cx="24" cy="24" r="21" fill={`url(#${gRay})`} />
      <path
        className="star-brand-glyph__body"
        fill={`url(#${gCore})`}
        d="M24 4 L28.8 18.2 L44 18.2 L32.1 27.4 L36.6 42 L24 33.2 L11.4 42 L15.9 27.4 L4 18.2 L19.2 18.2 Z"
      />
      <path
        className="star-brand-glyph__core"
        fill="#faf5ff"
        opacity="0.92"
        d="M24 14.5 L26.2 21.8 L33.8 21.8 L27.8 26.2 L29.8 33.8 L24 29.8 L18.2 33.8 L20.2 26.2 L14.2 21.8 L21.8 21.8 Z"
      />
    </svg>
  );
}
