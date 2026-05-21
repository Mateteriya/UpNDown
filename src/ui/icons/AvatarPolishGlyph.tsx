/**
 * Глиф «космическое преображение» для кнопки 3D-финиш (объёмный, светящийся).
 */

import { useId } from 'react';

export interface AvatarPolishGlyphProps {
  className?: string;
}

export function AvatarPolishGlyph({ className }: AvatarPolishGlyphProps) {
  const gid = useId().replace(/:/g, '');

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient id={`apg-${gid}`} x1="2" y1="1" x2="22" y2="23" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a5f3fc" />
          <stop offset="0.4" stopColor="#e9d5ff" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <linearGradient id={`apgHi-${gid}`} x1="8" y1="4" x2="16" y2="14" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#67e8f9" stopOpacity="0.2" />
        </linearGradient>
        <radialGradient id={`apgCore-${gid}`} cx="12" cy="10.5" r="5.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fdf4ff" />
          <stop offset="0.35" stopColor="#f0abfc" />
          <stop offset="0.7" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#22d3ee" />
        </radialGradient>
        <filter id={`apgVol-${gid}`} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="0.6" stdDeviation="0.4" floodColor="#ffffff" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="1.4" stdDeviation="1.1" floodColor="#0f172a" floodOpacity="0.55" />
          <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#67e8f9" floodOpacity="0.95" />
        </filter>
      </defs>
      <g filter={`url(#apgVol-${gid})`}>
        <ellipse
          cx="12"
          cy="12"
          rx="8.5"
          ry="3.4"
          stroke={`url(#apg-${gid})`}
          strokeWidth="1.45"
          strokeLinecap="round"
          transform="rotate(-32 12 12)"
        />
        <ellipse
          cx="12"
          cy="12"
          rx="7"
          ry="2.8"
          stroke={`url(#apg-${gid})`}
          strokeWidth="1.15"
          strokeLinecap="round"
          opacity="0.75"
          transform="rotate(38 12 12)"
        />
        <path
          d="M12 6.2c2.8 0 4.2 1.6 4.2 3.4 0 1.5-1 2.4-2.6 2.8 2.1.4 3.4 1.7 3.4 3.6 0 2.2-2.1 3.8-4.9 3.8"
          stroke={`url(#apg-${gid})`}
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <path
          d="M12 4.6l1.05 3.2h3.25l-2.63 1.92 1.05 3.2L12 10.4 9.33 12.92l1.05-3.2-2.63-1.92h3.25z"
          fill={`url(#apgCore-${gid})`}
        />
        <path
          d="M12 5.4l.35 1.1h1.15l-.93.68.35 1.1L12 7.35 10.98 8.28l.35-1.1-.93-.68h1.15z"
          fill={`url(#apgHi-${gid})`}
          opacity="0.92"
        />
        <circle cx="5.2" cy="7.2" r="1.05" fill="#e0f2fe" />
        <circle cx="18.4" cy="8.6" r="0.85" fill="#f5d0fe" />
        <circle cx="17.2" cy="17.8" r="0.95" fill="#ddd6fe" />
        <path
          d="M12 14v2.4M10.2 15.8l1.8 1.2 1.8-1.2"
          stroke="#e0f2fe"
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
