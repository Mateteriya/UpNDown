/**
 * Песочница обликов кнопки «Поддержать» — только /mode-label-lab.
 * Прод-меню не трогает.
 */

import type { ReactNode } from 'react';
import { SwissLabGlyph } from './GuestSwissLab';

type SupportLabVariant =
  | 'current'
  | 'aurora'
  | 'jewel'
  | 'ribbon'
  | 'pulse'
  | 'plus'
  | 'handshake'
  | 'hybrid1';

type Card = {
  id: SupportLabVariant;
  title: string;
  blurb: string;
  perf: string;
};

const CARDS: Card[] = [
  {
    id: 'current',
    title: 'Сейчас',
    blurb: 'Эталон link-капсулы, но с общей типографикой лаба (для честного сравнения).',
    perf: 'базовый',
  },
  {
    id: 'aurora',
    title: 'A · Aurora chip',
    blurb: 'Градиент рамки cyan→violet→gold, матовое тело, статичный spark.',
    perf: 'отлично · почти статика',
  },
  {
    id: 'jewel',
    title: 'B · Neon outline jewel',
    blurb: 'Прозрачное тело, одна неоновая обводка, «ювелирная» кромка.',
    perf: 'отлично · без анимации',
  },
  {
    id: 'ribbon',
    title: 'C · Gift ribbon',
    blurb: 'Тёплый «спасибо»: лента + глиф подарка, золото/розовый акцент.',
    perf: 'отлично · SVG статика',
  },
  {
    id: 'pulse',
    title: 'D · Pulse gem',
    blurb: 'Aurora + едва заметное дыхание рамки (~8s). Off при reduced-motion.',
    perf: 'осторожно · 1 opacity cycle',
  },
  {
    id: 'plus',
    title: 'E · Plus mark',
    blurb: 'Та же aurora-база, в конце фразы стильный «+» (не эмодзи).',
    perf: 'отлично · статика',
  },
  {
    id: 'handshake',
    title: 'F · Handshake',
    blurb: 'Глиф рукопожатия (SVG) + фраза; корпус в духе jewel.',
    perf: 'отлично · SVG статика',
  },
  {
    id: 'hybrid1',
    title: 'G · Hybrid 1',
    blurb:
      'Рамка/фон/надпись как F; глиф — крест «4 · teal + пульс» из лаба; в конце фразы только spark как у B.',
    perf: 'хорошо · 1 pulse cycle с креста',
  },
];

function SparkGlyph(): ReactNode {
  return (
    <svg className="support-lab-btn__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
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

function GiftGlyph(): ReactNode {
  return (
    <svg className="support-lab-btn__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
      <rect x="4.5" y="10" width="15" height="10" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4.5 14.2h15" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 10v10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 10c-2.2-2.8-5.2-2.4-5.2-.4C6.8 11.4 9.2 12 12 10Zm0 0c2.2-2.8 5.2-2.4 5.2-.4 0 1.8-2.4 2.4-5.2.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LinkGlyph(): ReactNode {
  return (
    <svg className="support-lab-btn__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M10 14a4 4 0 0 0 5.66 0l2.12-2.12a4 4 0 1 0-5.66-5.66L11 7.34"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M14 10a4 4 0 0 0-5.66 0L6.22 12.12a4 4 0 1 0 5.66 5.66L13 16.66"
      />
    </svg>
  );
}

function PlusGlyph(): ReactNode {
  return (
    <svg className="support-lab-btn__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
      <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
      <path
        d="M12 7.2v9.6M7.2 12h9.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Стилизованное рукопожатие — линии, не эмодзи */
function HandshakeGlyph(): ReactNode {
  return (
    <svg className="support-lab-btn__icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.2 11.2 9.4 9l2.3 2.2 1.6-1.5a1.4 1.4 0 0 1 1.9 0l.4.4"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4.8 13.1c1.1-.2 2.5.2 3.5 1.1l.3.3c.7.7 1.8.8 2.6.2l1.1-.8 2.2 2.1c.6.6 1.5.7 2.2.3l2.3-1.4"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.1 14.4c.55.55 1.35.7 2.05.4M11.2 15.6c.5.45 1.2.55 1.85.3"
      />
    </svg>
  );
}

/** Мини-звёздочки в хвосте фразы — тот же язык, что spark-глиф у B */
function SparkTail(): ReactNode {
  return (
    <svg
      className="support-lab-btn__spark-tail"
      viewBox="0 0 24 24"
      width="18"
      height="18"
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

function glyphFor(variant: SupportLabVariant): ReactNode {
  if (variant === 'ribbon') return <GiftGlyph />;
  if (variant === 'current') return <LinkGlyph />;
  if (variant === 'plus') return <PlusGlyph />;
  if (variant === 'handshake') return <HandshakeGlyph />;
  if (variant === 'hybrid1') return <SwissLabGlyph stage="s4" />;
  return <SparkGlyph />;
}

function SupportLabButton({ variant }: { variant: SupportLabVariant }) {
  const showTailPlus = variant === 'plus';
  const showSparkTail = variant === 'hybrid1';

  return (
    <button type="button" className={`support-lab-btn support-lab-btn--${variant}`}>
      <span className="support-lab-btn__glyph" aria-hidden>
        {glyphFor(variant)}
      </span>
      <span className="support-lab-btn__body">
        <span className="support-lab-btn__label">
          <span className="support-lab-btn__label-text">поддержать проект</span>
          {showTailPlus ? <span className="support-lab-btn__plus">+</span> : null}
          {showSparkTail ? <SparkTail /> : null}
        </span>
      </span>
      {variant === 'aurora' || variant === 'pulse' || variant === 'plus' ? (
        <span className="support-lab-btn__sheen" aria-hidden />
      ) : null}
      {variant === 'jewel' || variant === 'handshake' || variant === 'hybrid1' ? (
        <span className="support-lab-btn__rim" aria-hidden />
      ) : null}
      {variant === 'ribbon' || variant === 'hybrid1' ? (
        <span className="support-lab-btn__ribbon" aria-hidden />
      ) : null}
    </button>
  );
}

function SupportLabCard({ card }: { card: Card }) {
  return (
    <div className="support-lab__card">
      <div className="support-lab__card-meta">
        <p className="support-lab__card-title">{card.title}</p>
        <p className="support-lab__card-blurb">{card.blurb}</p>
        <p className="support-lab__card-perf">{card.perf}</p>
      </div>
      <div className="support-lab__stage" aria-label={card.title}>
        <SupportLabButton variant={card.id} />
      </div>
    </div>
  );
}

export function SupportButtonLabSection(): ReactNode {
  return (
    <section className="mode-label-lab__section mode-label-lab__section--featured support-lab">
      <div className="mode-label-lab__section-head">
        <span className="mode-label-lab__badge">support · выбор</span>
        <h2>Кнопка «Поддержать» — варианты облика</h2>
        <p>
          Одна фраза без дубля. G — гибрид F + крест s4 (teal) из лаба + spark из B. Прод не меняется.
        </p>
      </div>
      <div className="support-lab__grid">
        {CARDS.map((card) => (
          <SupportLabCard key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}
