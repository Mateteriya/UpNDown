/**
 * Оболочка «космической приборной панели»: LED, орбиты, L-скобы.
 * Используется в модалках итогов и рейтинга.
 */

import type { ReactNode } from 'react';

export interface CosmicCockpitProps {
  children: ReactNode;
  className?: string;
  /** Компактнее по вертикали (рейтинг) */
  dense?: boolean;
}

export function CosmicCockpit({ children, className, dense }: CosmicCockpitProps) {
  return (
    <div
      className={['cosmic-cockpit', dense ? 'cosmic-cockpit--dense' : '', className].filter(Boolean).join(' ')}
    >
      <span className="cosmic-cockpit__led cosmic-cockpit__led--tl" aria-hidden />
      <span className="cosmic-cockpit__led cosmic-cockpit__led--tr" aria-hidden />
      <span className="cosmic-cockpit__led cosmic-cockpit__led--bl" aria-hidden />
      <span className="cosmic-cockpit__led cosmic-cockpit__led--br" aria-hidden />
      <span className="cosmic-cockpit__orbit cosmic-cockpit__orbit--a" aria-hidden />
      <span className="cosmic-cockpit__orbit cosmic-cockpit__orbit--b" aria-hidden />
      <span className="cosmic-cockpit__star cosmic-cockpit__star--1" aria-hidden />
      <span className="cosmic-cockpit__star cosmic-cockpit__star--2" aria-hidden />
      <span className="cosmic-cockpit__star cosmic-cockpit__star--3" aria-hidden />
      <div className="cosmic-cockpit__content">{children}</div>
    </div>
  );
}

export type GameOverCloudSave = 'none' | 'pending' | 'ok' | 'fail' | 'no-auth';

export function CosmicPhysButton({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  title,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary';
  type?: 'button';
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type={type}
      className={`cosmic-phys-btn cosmic-phys-btn--${variant}`}
      onClick={onClick}
      title={title}
    >
      <span className="cosmic-phys-btn__rim" aria-hidden />
      <span className="cosmic-phys-btn__face">{children}</span>
    </button>
  );
}

/** Стеклянный крестик закрытия (модалки, ЛК) */
export function CosmicGlassClose({
  onClick,
  className,
  label = 'Закрыть',
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={['cosmic-glass-close', className].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label={label}
    >
      <span className="cosmic-glass-close__bezel" aria-hidden />
      <span className="cosmic-glass-close__shine" aria-hidden />
      <span className="cosmic-glass-close__glyph" aria-hidden>
        ×
      </span>
    </button>
  );
}

/** Полупрозрачная стеклянная кнопка */
export function CosmicGlassButton({
  children,
  onClick,
  className,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button';
}) {
  return (
    <button
      type={type}
      className={['cosmic-glass-btn', className].filter(Boolean).join(' ')}
      onClick={onClick}
    >
      <span className="cosmic-glass-btn__shine" aria-hidden />
      <span className="cosmic-glass-btn__label">{children}</span>
    </button>
  );
}
