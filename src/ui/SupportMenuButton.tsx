/**
 * Кнопка «Поддержать проект» на главной / в кабинете.
 * Облик: лаб Hybrid 1 (F-shell + крест s4 teal + spark + лента).
 */

import { useId, type ReactNode } from 'react';

type SupportMenuButtonProps = {
  onClick: () => void;
  className?: string;
};

function blurAfterTouch(e: { currentTarget: HTMLElement }) {
  e.currentTarget.blur();
}

function PrismCross({ uid }: { uid: string }): ReactNode {
  return (
    <svg className="support-menu-btn__cross" viewBox="0 0 44 44" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="35%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="30%" stopColor="#38bdf8" />
          <stop offset="60%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f5d0fe" stopOpacity="0.95" />
          <stop offset="35%" stopColor="#a5f3fc" stopOpacity="1" />
          <stop offset="65%" stopColor="#c4b5fd" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${uid}-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fdf4ff" stopOpacity="0.7" />
          <stop offset="50%" stopColor="#a5f3fc" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        x="8"
        y="17.5"
        width="28"
        height="9"
        rx="1.8"
        fill={`url(#${uid}-fill)`}
        stroke={`url(#${uid}-edge)`}
        strokeWidth="1.05"
      />
      <rect
        x="17.5"
        y="8"
        width="9"
        height="28"
        rx="1.8"
        fill={`url(#${uid}-fill)`}
        stroke={`url(#${uid}-edge)`}
        strokeWidth="1.05"
      />
      <rect x="9.4" y="18.2" width="10" height="2.2" rx="1" fill={`url(#${uid}-gloss)`} />
      <rect x="18.9" y="9" width="2" height="10" rx="0.9" fill={`url(#${uid}-gloss)`} />
      <ellipse cx="20.6" cy="12.4" rx="1.2" ry="0.9" fill="#f5d0fe" opacity="0.75" />
      <ellipse cx="23.2" cy="14.2" rx="0.7" ry="0.55" fill="#a5f3fc" opacity="0.8" />
    </svg>
  );
}

function SparkTail(): ReactNode {
  return (
    <svg
      className="support-menu-btn__spark"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 2.2 13.4 8.1 19 9.5l-5.6 1.4L12 16.8l-1.4-5.9L5 9.5l5.6-1.4L12 2.2Z"
        opacity="0.95"
      />
      <circle cx="18.2" cy="5.2" r="1.15" fill="currentColor" opacity="0.7" />
      <circle cx="6.1" cy="17.4" r="0.9" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

export function SupportMenuButton({ onClick, className }: SupportMenuButtonProps) {
  const uid = useId().replace(/:/g, '');

  return (
    <button
      type="button"
      className={['support-menu-btn', className].filter(Boolean).join(' ')}
      onClick={onClick}
      onPointerUp={blurAfterTouch}
    >
      <span className="support-menu-btn__glyph" aria-hidden>
        <span className="support-menu-btn__swiss">
          <span className="support-menu-btn__swiss-rim">
            <span className="support-menu-btn__swiss-depth" />
            <span className="support-menu-btn__swiss-face">
              <PrismCross uid={uid} />
            </span>
          </span>
        </span>
      </span>
      <span className="support-menu-btn__body">
        <span className="support-menu-btn__label">
          <span className="support-menu-btn__label-text">поддержать проект</span>
          <SparkTail />
        </span>
      </span>
      <span className="support-menu-btn__chip-rim" aria-hidden />
      <span className="support-menu-btn__ribbon" aria-hidden />
    </button>
  );
}
