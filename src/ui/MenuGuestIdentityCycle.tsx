/**
 * Guest («без входа»): цикл из 4 глифов для чипа аватарки на главном меню.
 * Порядок: пустое кольцо → △? → грустный смайл → швейцарский крест.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MenuMapTipDismiss } from './MenuMapTipDismiss';
import { useT } from '../i18n';

export type GuestGlyphId = 'empty' | 'tri' | 'sad' | 'swiss';

const GUEST_CYCLE_MS = 4200;
/** Крест «+» — дольше, чтобы успеть увидеть пульс варианта 3. */
const GUEST_SWISS_MS = 12500;

export const GUEST_GLYPH_ORDER: { id: GuestGlyphId; label: string }[] = [
  { id: 'empty', label: 'пустое кольцо' },
  { id: 'tri', label: '△ ?' },
  { id: 'sad', label: 'грустный смайл' },
  { id: 'swiss', label: 'швейцарский крест' },
];

function SwissEmptyCross({ uid }: { uid: string }) {
  /* Вариант 3 (лаб): голубой fill + кислотно-розовая обводка. */
  return (
    <svg className="menu-guest-cycle__swiss" viewBox="0 0 44 44" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-swiss-fill`} x1="0%" y1="0%" x2="35%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="28%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#0ea5e9" />
          <stop offset="78%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#0369a1" />
        </linearGradient>
        <linearGradient id={`${uid}-swiss-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="40%" stopColor="#e0f2fe" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect
        className="menu-guest-cycle__swiss-pink"
        x="8"
        y="17.5"
        width="28"
        height="9"
        rx="1.8"
        fill="none"
        stroke="#ff2ec8"
        strokeWidth="1.35"
        strokeOpacity="0.95"
      />
      <rect
        className="menu-guest-cycle__swiss-pink"
        x="17.5"
        y="8"
        width="9"
        height="28"
        rx="1.8"
        fill="none"
        stroke="#ff2ec8"
        strokeWidth="1.35"
        strokeOpacity="0.95"
      />
      <rect
        x="8"
        y="17.5"
        width="28"
        height="9"
        rx="1.8"
        fill={`url(#${uid}-swiss-fill)`}
      />
      <rect
        x="17.5"
        y="8"
        width="9"
        height="28"
        rx="1.8"
        fill={`url(#${uid}-swiss-fill)`}
      />
      <rect x="9.4" y="18.2" width="10" height="2.4" rx="1" fill={`url(#${uid}-swiss-gloss)`} />
      <rect x="18.9" y="9" width="2" height="10.5" rx="0.9" fill={`url(#${uid}-swiss-gloss)`} />
      <ellipse cx="21.2" cy="12.8" rx="1.4" ry="1.1" fill="#ff7ae8" opacity="0.95" />
    </svg>
  );
}

function FaceSadPuzzled({ uid }: { uid: string }) {
  return (
    <svg className="menu-guest-cycle__face" viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-face-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <radialGradient id={`${uid}-face-plate`} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15.5" fill={`url(#${uid}-face-plate)`} opacity="0.85" />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="0.45"
        opacity="0.38"
      />
      <path
        d="M10.5 13.2c1.8-2.2 5.2-2.6 7.2-0.6"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="2.05"
        strokeLinecap="round"
      />
      <path
        d="M23 15.2c1.5-0.9 4.2-0.7 5.8 0.5"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="1.9"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx="14.2" cy="18.5" r="1.85" fill="#e9d5ff" />
      <circle cx="14.2" cy="18.5" r="1.1" fill="#67e8f9" opacity="0.85" />
      <circle cx="25.8" cy="18.8" r="1.85" fill="#e9d5ff" />
      <circle cx="25.8" cy="18.8" r="1.1" fill="#f472b6" opacity="0.85" />
      <path
        d="M15.5 27.2c2.2-2 6.8-2 9 0"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EliteTriangle({ uid }: { uid: string }) {
  return (
    <svg className="menu-guest-cycle__tri" viewBox="0 0 48 44" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-tri-fill`} x1="50%" y1="0%" x2="42%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="18%" stopColor="#fb923c" />
          <stop offset="38%" stopColor="#f43f5e" />
          <stop offset="58%" stopColor="#e879f9" />
          <stop offset="78%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#4c1d95" />
        </linearGradient>
        <linearGradient id={`${uid}-tri-edge`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="28%" stopColor="#fb7185" />
          <stop offset="55%" stopColor="#c084fc" />
          <stop offset="78%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id={`${uid}-tri-gloss`} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#fde68a" stopOpacity="0.28" />
          <stop offset="40%" stopColor="#fb923c" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-tri-q`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffbeb" />
          <stop offset="40%" stopColor="#fde68a" />
          <stop offset="75%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <path
        d="M24 4 L44 40 H4 Z"
        fill={`url(#${uid}-tri-fill)`}
        stroke={`url(#${uid}-tri-edge)`}
        strokeWidth="1.7"
        strokeLinejoin="round"
        opacity="0.96"
      />
      <path
        d="M24 7.5 L39.2 37 H8.8 Z"
        fill={`url(#${uid}-tri-gloss)`}
        stroke="none"
        opacity="0.55"
      />
      <path
        d="M24 8.5 L38.5 36.5 H9.5 Z"
        fill="none"
        stroke="#fde68a"
        strokeWidth="0.55"
        strokeLinejoin="round"
        opacity="0.28"
      />
      <path
        d="M18 22 L30 22"
        fill="none"
        stroke="#67e8f9"
        strokeWidth="0.45"
        strokeLinecap="round"
        opacity="0.28"
      />
      <text
        x="24"
        y="32"
        textAnchor="middle"
        className="menu-guest-cycle__tri-q"
        fill={`url(#${uid}-tri-q)`}
      >
        ?
      </text>
    </svg>
  );
}

function renderGuestGlyph(id: GuestGlyphId, uid: string): { node: ReactNode; ringMod: string } {
  if (id === 'tri') {
    return {
      ringMod: 'menu-guest-cycle__ring--tri',
      node: <EliteTriangle uid={uid} />,
    };
  }
  if (id === 'empty') {
    return {
      ringMod: 'menu-guest-cycle__ring--empty',
      node: (
        <span className="menu-guest-cycle__void" aria-hidden>
          <span className="menu-guest-cycle__void-sheen" />
        </span>
      ),
    };
  }
  if (id === 'sad') {
    return {
      ringMod: 'menu-guest-cycle__ring--sad',
      node: (
        <span className="menu-guest-cycle__well menu-guest-cycle__well--sad" aria-hidden>
          <FaceSadPuzzled uid={uid} />
        </span>
      ),
    };
  }
  return {
    ringMod: 'menu-guest-cycle__ring--swiss',
    node: (
      <span className="menu-guest-cycle__well" aria-hidden>
        <SwissEmptyCross uid={uid} />
      </span>
    ),
  };
}

function useGuestPhaseIndex() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = GUEST_GLYPH_ORDER[phase]?.id;
    const ms = id === 'swiss' ? GUEST_SWISS_MS : GUEST_CYCLE_MS;
    const t = window.setTimeout(() => {
      setPhase((p) => (p + 1) % GUEST_GLYPH_ORDER.length);
    }, ms);
    return () => window.clearTimeout(t);
  }, [phase]);
  return phase;
}

type MenuGuestIdentityCycleProps = {
  className?: string;
  /** Показывать ли подпись текущего глифа (для лаба). */
  showCaption?: boolean;
  /** Пунктир L: влево → вниз (как у офлайн-глифа). По умолчанию да. */
  showMapHint?: boolean;
  /** Скрыть guest-пунктир навсегда (свитч в тултипе / после клика по аватарке). */
  onHideMapHint?: () => void;
};

/**
 * Офлайн-глиф: H = 92, V = 22.5 → здесь H/2 = 46, V×2 = 45 (+2).
 * Направление: от глифа влево, затем вниз; на конце крупный квадрат с «?».
 * Тултип — portal в body, чтобы пунктиры офлайна не перекрывали.
 */
function GuestMapHint({ uid, onHideMapHint }: { uid: string; onHideMapHint?: () => void }) {
  const t = useT();
  const flowH = `${uid}-guest-map-h`;
  const flowV = `${uid}-guest-map-v`;
  const tipId = `${uid}-guest-map-tip`;
  const hitRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const sync = (on: boolean) => {
      document.documentElement.classList.toggle('menu-guest-map-tip-open', on);
      document.body.classList.toggle('menu-guest-map-tip-open', on);
      window.dispatchEvent(new CustomEvent('menu-guest-map-tip', { detail: { open: on } }));
    };
    sync(tipOpen);
    return () => sync(false);
  }, [tipOpen]);

  useLayoutEffect(() => {
    if (!tipOpen || !hitRef.current) {
      setTipPos(null);
      return;
    }
    const update = () => {
      const r = hitRef.current!.getBoundingClientRect();
      setTipPos({ top: r.bottom + 10, left: r.left + r.width / 2 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [tipOpen]);

  useEffect(() => {
    if (!tipOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTipOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.menu-guest-map-hint') || t.closest('.menu-guest-map-hint__tip')) return;
      setTipOpen(false);
    };
    const autoClose = window.setTimeout(() => setTipOpen(false), 7500);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.clearTimeout(autoClose);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [tipOpen]);

  const tip =
    tipOpen && tipPos
      ? createPortal(
          <div
            ref={tipRef}
            id={tipId}
            className="menu-guest-map-hint__tip menu-guest-map-hint__tip--portal game-table-tooltip-cosmic"
            role="tooltip"
            style={{ top: tipPos.top, left: tipPos.left }}
          >
            <p className="game-table-tooltip-cosmic-body-text menu-guest-map-hint__tip-text">{t('menu.guestTip')}</p>
            <MenuMapTipDismiss
              onDismiss={() => setTipOpen(false)}
              onHideHint={() => {
                setTipOpen(false);
                onHideMapHint?.();
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <span className={['menu-guest-map-hint', tipOpen ? 'menu-guest-map-hint--tip-open' : ''].filter(Boolean).join(' ')}>
      <svg
        className="menu-guest-map-hint__svg"
        viewBox="-4 0 68 86"
        width="68"
        height="86"
        focusable="false"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={flowH}
            gradientUnits="userSpaceOnUse"
            x1="0"
            y1="10"
            x2="120"
            y2="10"
            spreadMethod="repeat"
          >
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="16%" stopColor="#e879f9" />
            <stop offset="32%" stopColor="#38bdf8" />
            <stop offset="48%" stopColor="#2563eb" />
            <stop offset="64%" stopColor="#f472b6" />
            <stop offset="80%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#a78bfa" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="0 0"
              to="-120 0"
              dur="4s"
              repeatCount="indefinite"
              calcMode="linear"
            />
          </linearGradient>
          <linearGradient
            id={flowV}
            gradientUnits="userSpaceOnUse"
            x1="8"
            y1="0"
            x2="8"
            y2="120"
            spreadMethod="repeat"
          >
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="16%" stopColor="#e879f9" />
            <stop offset="32%" stopColor="#38bdf8" />
            <stop offset="48%" stopColor="#2563eb" />
            <stop offset="64%" stopColor="#f472b6" />
            <stop offset="80%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#a78bfa" />
            <animateTransform
              attributeName="gradientTransform"
              type="translate"
              from="0 0"
              to="0 120"
              dur="4s"
              repeatCount="indefinite"
              calcMode="linear"
            />
          </linearGradient>
        </defs>
        {/* H: 54→8 = 46 (½ от офлайн 92); полый origin правее старта */}
        <path
          className="menu-guest-map-hint__path menu-guest-map-hint__path--h"
          d="M54 10 H8"
          fill="none"
          stroke={`url(#${flowH})`}
          strokeLinecap="round"
        />
        <circle className="menu-guest-map-hint__corner" cx="8" cy="10" r="1.3" fill={`url(#${flowH})`} />
        {/* V: 18→65 = 47 */}
        <path
          className="menu-guest-map-hint__path menu-guest-map-hint__path--v"
          d="M8 18 V65"
          fill="none"
          stroke={`url(#${flowV})`}
          strokeLinecap="round"
        />
        <circle
          className="menu-guest-map-hint__origin menu-guest-map-hint__origin--core"
          cx="60"
          cy="10"
          r="2.15"
          fill="#a78bfa"
          stroke={`url(#${flowH})`}
          strokeWidth="1.35"
        />
        {/* квадрат ~1.4× от исходных 12 (после уменьшения −20% от 21) */}
        <rect
          className="menu-guest-map-hint__square"
          x="-0.5"
          y="65"
          width="17"
          height="17"
          rx="2"
          fill="rgba(12, 4, 28, 0.72)"
          stroke={`url(#${flowV})`}
          strokeWidth="1.5"
        />
        <text
          className="menu-guest-map-hint__q"
          x="8"
          y="74"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          ?
        </text>
      </svg>
      <span
        ref={hitRef}
        role="button"
        tabIndex={0}
        className="menu-guest-map-hint__hit"
        aria-expanded={tipOpen}
        aria-controls={tipId}
        aria-label="Подсказка: профиль и аккаунт не заданы"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setTipOpen((v) => !v);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e: KeyboardEvent<HTMLElement>) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.stopPropagation();
          e.preventDefault();
          setTipOpen((v) => !v);
        }}
      />
      {tip}
    </span>
  );
}

export function MenuGuestIdentityCycle({
  className,
  showCaption = false,
  showMapHint = true,
  onHideMapHint,
}: MenuGuestIdentityCycleProps) {
  const t = useT();
  const rawId = useId();
  const uid = `mgc${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const phase = useGuestPhaseIndex();
  const active = GUEST_GLYPH_ORDER[phase]!;

  return (
    <span
      className={['menu-guest-cycle', className].filter(Boolean).join(' ')}
      title={t('menu.identityGuest')}
    >
      {showMapHint ? <GuestMapHint uid={uid} onHideMapHint={onHideMapHint} /> : null}
      <span className="menu-guest-cycle__stage" aria-hidden>
        {GUEST_GLYPH_ORDER.map((g, i) => {
          const rendered = renderGuestGlyph(g.id, `${uid}-${g.id}`);
          return (
            <span
              key={g.id}
              className={[
                'menu-guest-cycle__ring',
                'menu-guest-cycle__layer',
                i === phase ? 'menu-guest-cycle__layer--on' : 'menu-guest-cycle__layer--off',
                rendered.ringMod,
              ].join(' ')}
            >
              {rendered.node}
            </span>
          );
        })}
      </span>
      {showCaption ? (
        <span className="menu-guest-cycle__caption">
          сейчас: <strong>{active.label}</strong>
        </span>
      ) : null}
    </span>
  );
}
