import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import {
  getMenuCapsuleGlyphOnly,
  setMenuCapsuleGlyphOnly,
  hasSeenSoloMapHint,
  markSoloMapHintSeen,
  type MenuSectionId,
} from '../lib/menuSectionPrefs';
import { MODE_LEGENDS } from '../lib/modeLegends';
import {
  ModeLabelHoloOrbitHybridRings,
  ModeLabelHoloWedge,
} from './mode-label-lab/ModeLabelLabVariants';
import { PlayerAvatar } from './PlayerAvatar';
import { MenuSignedIdentityMark, type MenuSignedStatus } from './MenuSignedIdentityMark';
import { MenuMapTipDismiss } from './MenuMapTipDismiss';
import { t, useT } from '../i18n';

const PC_MENU_MQ = '(min-width: 1025px)';

const MODE_LEGEND_AUTO_CLOSE_MS = 20000;
/** Длительность плавного сворачивания (fade → height → снятие класса). */
const MODE_LEGEND_CLOSE_ANIM_MS = 300;
const MODE_LEGEND_ART_COMPACT_DELAY_MS = 2600;
const SOLO_MAP_TIP_AUTO_MS = 7500;

/** Solo-офлайн каплюля: короткие ролики CTA (только без Continue). */
const OFFLINE_SOLO_PILL_LABEL_MS = 2600;

/** Снять focus после touch — иначе WebKit рисует серый tap/focus-квадрат (часто сверху страницы). */
function blurAfterTouch(e: PointerEvent<HTMLElement>) {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    e.currentTarget.blur();
  }
}

function useCyclingLabel(labels: readonly string[], enabled: boolean, intervalMs: number): string {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled || labels.length < 2) {
      setIndex(0);
      return;
    }
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % labels.length);
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, labels, intervalMs]);

  return labels[enabled ? index % labels.length : 0] ?? labels[0];
}

function useModeLegendAutoClose() {
  const [legendOpen, setLegendOpen] = useState(false);
  const [legendClosing, setLegendClosing] = useState(false);
  const legendOpenRef = useRef(false);
  const legendClosingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  legendOpenRef.current = legendOpen;
  legendClosingRef.current = legendClosing;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const clearAnimTimer = useCallback(() => {
    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current);
      animTimerRef.current = null;
    }
  }, []);

  const closeLegend = useCallback(() => {
    clearCloseTimer();
    if (!legendOpenRef.current || legendClosingRef.current) return;

    setLegendClosing(true);
    clearAnimTimer();
    const closeMs =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : MODE_LEGEND_CLOSE_ANIM_MS;
    animTimerRef.current = setTimeout(() => {
      setLegendOpen(false);
      setLegendClosing(false);
      animTimerRef.current = null;
    }, closeMs);
  }, [clearAnimTimer, clearCloseTimer]);

  const toggleLegend = useCallback(() => {
    if (legendClosingRef.current) return;

    if (legendOpenRef.current) {
      closeLegend();
      return;
    }

    setLegendOpen(true);
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      closeLegend();
    }, MODE_LEGEND_AUTO_CLOSE_MS);
  }, [clearCloseTimer, closeLegend]);

  useEffect(
    () => () => {
      clearCloseTimer();
      clearAnimTimer();
    },
    [clearAnimTimer, clearCloseTimer],
  );

  return { legendOpen, legendClosing, toggleLegend, closeLegend };
}

function useLegendArtCompact(open: boolean) {
  const [artExpanded, setArtExpanded] = useState(true);
  const compactTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCompactTimer = useCallback(() => {
    if (compactTimerRef.current) {
      clearTimeout(compactTimerRef.current);
      compactTimerRef.current = null;
    }
  }, []);

  const scheduleCompact = useCallback(() => {
    clearCompactTimer();
    compactTimerRef.current = setTimeout(() => {
      setArtExpanded(false);
      compactTimerRef.current = null;
    }, MODE_LEGEND_ART_COMPACT_DELAY_MS);
  }, [clearCompactTimer]);

  const expandArt = useCallback(() => {
    setArtExpanded(true);
    scheduleCompact();
  }, [scheduleCompact]);

  useEffect(() => {
    if (!open) {
      clearCompactTimer();
      setArtExpanded(true);
      return;
    }

    setArtExpanded(true);
    scheduleCompact();
    return clearCompactTimer;
  }, [open, scheduleCompact, clearCompactTimer]);

  useEffect(
    () => () => {
      clearCompactTimer();
    },
    [clearCompactTimer],
  );

  return { artExpanded, expandArt };
}

type MenuCapsuleVariant =
  | 'online'
  | 'newOnline'
  | 'newOffline'
  | 'resumeOnline'
  | 'resumeOffline'
  | 'offline'
  | 'rules'
  | 'account'
  | 'profile'
  | 'rating'
  | 'history'
  | 'auth'
  | 'soon'
  | 'link';

function GlyphMenuOnline() {
  const coreFillId = `menu-online-core-${useId().replace(/:/g, '')}`;

  return (
    <svg className="menu-capsule-glyph-svg menu-capsule-glyph-svg--online" viewBox="0 0 44 44" aria-hidden="true">
      <defs>
        <radialGradient id={coreFillId} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor="#f3e8ff" />
          <stop offset="28%" stopColor="#d8b4fe" />
          <stop offset="62%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#5b21b6" />
        </radialGradient>
      </defs>
      <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <circle cx="22" cy="22" r="11" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" strokeDasharray="3 4" />
      <circle className="menu-capsule-glyph-orbit menu-capsule-glyph-orbit--a" cx="22" cy="7" r="3.2" fill="currentColor" />
      <circle className="menu-capsule-glyph-orbit menu-capsule-glyph-orbit--b" cx="35" cy="26" r="2.8" fill="currentColor" />
      <circle className="menu-capsule-glyph-orbit menu-capsule-glyph-orbit--c" cx="11" cy="28" r="2.6" fill="currentColor" />
      <circle className="menu-online-glyph__core-glow" cx="22" cy="22" r="6.3" />
      <circle className="menu-online-glyph__core-ring" cx="22" cy="22" r="5.3" fill="none" strokeWidth="0.95" />
      <circle className="menu-online-glyph__core" cx="22" cy="22" r="4.5" fill={`url(#${coreFillId})`} />
    </svg>
  );
}

function GlyphMenuResume() {
  return (
    <svg className="menu-capsule-glyph-svg menu-capsule-glyph-svg--resume" viewBox="0 0 44 44" aria-hidden="true">
      <path
        className="menu-glyph-accent menu-glyph-accent--arc"
        d="M30 14a12 12 0 1 0 2.4 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--arrow"
        d="M30 8v6h-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon
        className="menu-glyph-accent menu-glyph-accent--play"
        points="14,22 22,16 22,20 28,20 28,24 22,24 22,28"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

function GlyphMenuNewSession() {
  return (
    <svg className="menu-capsule-glyph-svg menu-capsule-glyph-svg--new-session" viewBox="0 0 44 44" aria-hidden="true">
      <path
        className="menu-glyph-accent menu-glyph-accent--frame"
        d="M10 28 V16 a4 4 0 0 1 4-4 h16 a4 4 0 0 1 4 4 v12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.55"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--base"
        d="M8 28 h28"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      <circle
        className="menu-glyph-accent menu-glyph-accent--ring"
        cx="22"
        cy="20"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.75"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--plus"
        d="M22 16 v8 M18 20 h8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        className="menu-capsule-glyph-orbit menu-capsule-glyph-orbit--a menu-glyph-accent menu-glyph-accent--beam"
        d="M22 8 v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--roof"
        d="M17 10 l5-3 5 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.65"
      />
      <circle className="menu-glyph-accent menu-glyph-accent--sat" cx="30" cy="12" r="1.8" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function GlyphMenuNewParty() {
  return (
    <svg className="menu-capsule-glyph-svg menu-capsule-glyph-svg--new-party" viewBox="0 0 44 44" aria-hidden="true">
      <rect
        className="menu-glyph-accent menu-glyph-accent--card-a"
        x="11"
        y="14"
        width="12"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.55"
        transform="rotate(-12 17 22)"
      />
      <rect
        className="menu-glyph-accent menu-glyph-accent--card-b"
        x="21"
        y="12"
        width="12"
        height="16"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        transform="rotate(10 27 20)"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--marks"
        d="M15 18 h4 M26 17 h4"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        className="menu-glyph-accent menu-glyph-accent--star"
        d="M22 7 l1.6 4.8 4.9.4-3.7 3.2 1.1 4.8-3.9-2.3-3.9 2.3 1.1-4.8-3.7-3.2 4.9-.4z"
        fill="currentColor"
        opacity="0.88"
      />
      <circle
        className="menu-glyph-accent menu-glyph-accent--plus-ring"
        cx="22"
        cy="34"
        r="5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.88"
      />
      {/* Швейцарский крест: равные толстые перекладины */}
      <path
        className="menu-glyph-accent menu-glyph-accent--plus"
        d="M20.2 30.2h3.6v2h2v3.6h-2v2h-3.6v-2h-2v-3.6h2z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function GlyphMenuOffline() {
  return (
    <svg
      className="menu-capsule-glyph-svg menu-capsule-glyph-svg--offline-bot"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      <circle
        className="menu-offline-bot__ring"
        cx="22"
        cy="22"
        r="17.5"
        fill="none"
        strokeWidth="1"
        strokeDasharray="2 5"
      />
      <circle
        className="menu-capsule-glyph-orbit menu-offline-bot__orbit menu-offline-bot__orbit--a"
        cx="22"
        cy="7"
        r="2.4"
      />
      <circle
        className="menu-capsule-glyph-orbit menu-offline-bot__orbit menu-offline-bot__orbit--b"
        cx="35"
        cy="26"
        r="2.2"
      />
      <circle
        className="menu-capsule-glyph-orbit menu-offline-bot__orbit menu-offline-bot__orbit--c"
        cx="11"
        cy="28"
        r="2.1"
      />
      <path className="menu-offline-bot__mast" d="M22 6.6v3.1" strokeWidth="1.3" strokeLinecap="round" />
      <circle className="menu-offline-bot__mast-tip" cx="22" cy="5.9" r="0.85" />
      <path
        className="menu-offline-bot__helmet"
        d="M14.5 12.2H29.5L31 14.5V24L29.5 26.5H14.5L13 24V14.5Z"
        strokeWidth="1.5"
        strokeLinejoin="miter"
      />
      <rect className="menu-offline-bot__visor" x="14.6" y="16.9" width="14.8" height="4.4" rx="0.55" />
      <path className="menu-offline-bot__scan" d="M15.4 19.1h13.2" strokeWidth="0.9" strokeLinecap="round" />
      <path className="menu-offline-bot__cheek menu-offline-bot__cheek--l" d="M13.1 18.2v5.8" strokeWidth="0.9" strokeLinecap="round" />
      <path className="menu-offline-bot__cheek menu-offline-bot__cheek--r" d="M30.9 18.2v5.8" strokeWidth="0.9" strokeLinecap="round" />
      <rect className="menu-offline-bot__collar" x="18.4" y="26.3" width="7.2" height="2.2" rx="0.45" />
      <path className="menu-offline-bot__torso" d="M11.8 29.4h20.4" strokeWidth="1.35" strokeLinecap="round" />
      <path
        className="menu-offline-bot__shoulder"
        d="M9.2 31.6h25.6"
        fill="none"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <circle className="menu-offline-bot__core-ring" cx="22" cy="33.1" r="2.05" fill="none" strokeWidth="1.05" />
      <circle className="menu-offline-bot__core" cx="22" cy="33.1" r="0.78" />
    </svg>
  );
}

function GlyphMenuRules() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M22 7l2.2 6.6H31l-5.4 4 2.2 6.6L22 20.8l-5.8 3.4 2.2-6.6-5.4-4h6.8z"
        fill="currentColor"
        opacity="0.35"
      />
      <rect x="12" y="24" width="20" height="13" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 28.5h12M16 32h9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="22" cy="18" r="2.6" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function GlyphMenuAccount() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <polygon
        points="22,5 34,11 34,27 22,33 10,27 10,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.55"
      />
      <circle cx="22" cy="17" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14 28c1.2-3 4.5-5 8-5s6.8 2 8 5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function GlyphMenuProfile() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="10" y="12" width="24" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="22" cy="21" r="5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M14 32c1.5-3.5 4.8-5.5 8-5.5s6.5 2 8 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
      <circle cx="32" cy="14" r="4" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M32 12v4M30 14h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function GlyphMenuRating() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 8l2.8 6.5 7 .9-5.1 4.5 1.5 6.9L22 23.5l-6.2 3.3 1.5-6.9-5.1-4.5 7-.9z" fill="currentColor" opacity="0.85" />
      <circle cx="22" cy="22" r="14" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.35" strokeDasharray="2 3" />
      <path d="M8 34h28" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function GlyphMenuHistory() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="11" y="9" width="22" height="26" rx="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M16 15h12M16 20h12M16 25h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.75" />
      <circle cx="30" cy="30" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M30 27v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function GlyphMenuAuth() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="24" r="10" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M22 18v6l3.5 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="18" y="8" width="8" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M20 8V6a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function GlyphMenuSoon() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <polygon
        points="22,6 26,16 36,16 28,22 31,32 22,26 13,32 16,22 8,16 18,16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.45"
      />
      <rect x="17" y="20" width="10" height="8" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M20 20v-2a2 2 0 0 1 4 0v2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function GlyphMenuLink() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M16 24a6 6 0 0 1 0-8.5l2-2a6 6 0 0 1 8.5 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M28 20a6 6 0 0 1 0 8.5l-2 2a6 6 0 0 1-8.5 0" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M18 26l8-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

const GLYPHS: Record<MenuCapsuleVariant, ReactNode> = {
  online: <GlyphMenuOnline />,
  newOnline: <GlyphMenuNewSession />,
  newOffline: <GlyphMenuNewParty />,
  resumeOnline: <GlyphMenuResume />,
  resumeOffline: <GlyphMenuResume />,
  offline: <GlyphMenuOffline />,
  rules: <GlyphMenuRules />,
  account: <GlyphMenuAccount />,
  profile: <GlyphMenuProfile />,
  rating: <GlyphMenuRating />,
  history: <GlyphMenuHistory />,
  auth: <GlyphMenuAuth />,
  soon: <GlyphMenuSoon />,
  link: <GlyphMenuLink />,
};

export type MenuCapsuleButtonProps = {
  variant: MenuCapsuleVariant;
  title: string;
  hint?: string;
  /** Мелкая подпись над title (напр. «Кабинет»). */
  eyebrow?: string;
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
  /** Вместо глифа — аватар профиля. */
  avatarName?: string;
  avatarDataUrl?: string | null;
  /** profile/account: WAVE / online-stamp поверх аватара. */
  identityStatus?: MenuSignedStatus;
  /** Стрелки на капсуле: свернуть до глифа / развернуть. */
  collapsible?: boolean;
  /** Ключ localStorage для свёртки (обязателен при collapsible). */
  collapseId?: string;
};

export function MenuCapsuleButton({
  variant,
  title,
  hint,
  eyebrow,
  disabled,
  href,
  onClick,
  compact,
  avatarName,
  avatarDataUrl,
  identityStatus,
  collapsible,
  collapseId,
}: MenuCapsuleButtonProps) {
  const [glyphOnly, setGlyphOnly] = useState(() =>
    collapsible && collapseId ? getMenuCapsuleGlyphOnly(collapseId) : false,
  );

  const toggleGlyphOnly = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!collapseId) return;
      setGlyphOnly((on) => {
        const next = !on;
        setMenuCapsuleGlyphOnly(collapseId, next);
        return next;
      });
    },
    [collapseId],
  );

  const className = [
    'menu-capsule',
    `menu-capsule--${variant}`,
    compact ? 'menu-capsule--compact' : '',
    disabled ? 'menu-capsule--disabled' : '',
    avatarName ? 'menu-capsule--with-avatar' : '',
    glyphOnly ? 'menu-capsule--glyph-only' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className={['menu-capsule__glyph', avatarName ? 'menu-capsule__glyph--avatar' : ''].filter(Boolean).join(' ')}>
        {avatarName && identityStatus ? (
          <MenuSignedIdentityMark
            status={identityStatus}
            name={avatarName}
            avatarDataUrl={avatarDataUrl}
            sizePx={compact ? 36 : 42}
            surface="capsule"
            onOpenCabinet={() => onClick?.()}
          />
        ) : avatarName ? (
          <PlayerAvatar name={avatarName} avatarDataUrl={avatarDataUrl} sizePx={compact ? 36 : 42} />
        ) : (
          GLYPHS[variant]
        )}
      </span>
      <span className="menu-capsule__body">
        {eyebrow ? <span className="menu-capsule__eyebrow">{eyebrow}</span> : null}
        <span className="menu-capsule__title">{title}</span>
        {hint ? <span className="menu-capsule__hint">{hint}</span> : null}
      </span>
    </>
  );

  const main =
    href && !disabled ? (
      <a className={className} href={href} onPointerUp={blurAfterTouch}>
        {body}
      </a>
    ) : (
      <button type="button" className={className} disabled={disabled} onClick={onClick} onPointerUp={blurAfterTouch}>
        {body}
      </button>
    );

  if (!collapsible || !collapseId) return main;

  return (
    <div
      className={['menu-capsule-shell', glyphOnly ? 'menu-capsule-shell--glyph-only' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {main}
      <button
        type="button"
        className="menu-capsule__fold"
        aria-label={glyphOnly ? 'Развернуть капсулу' : 'Свернуть капсулу до значка'}
        aria-pressed={glyphOnly}
        onClick={toggleGlyphOnly}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={blurAfterTouch}
      >
        <span className="menu-capsule__fold-arrows" aria-hidden="true">
          {glyphOnly ? '››' : '‹‹'}
        </span>
      </button>
    </div>
  );
}

export type MenuPlaySplitCapsuleProps = {
  mode: 'online' | 'offline';
  canResume: boolean;
  satelliteCode?: string | null;
  onResume: () => void;
  onMain: () => void;
  /**
   * Слот вместо smile-arc под глифом.
   * `false` — скрыть дугу; ReactNode — заменить; `undefined` — дуга / ПК-дефолт.
   */
  modeLabelSlot?: ReactNode | false;
  /** Доп. слой внутри shell (клин / watermark). */
  shellDecor?: ReactNode;
  /**
   * ПК (≥1025): авто-надписи режима (онлайн = симбиоз 2+3, офлайн = клин).
   * Лаб отключает (`false`) и задаёт слоты сама.
   */
  pcModeLabels?: boolean;
};

type SplitCapsuleTone = 'resumeOnline' | 'resumeOffline' | 'actionOnline' | 'actionOffline';

function MenuOnlineCosmicUfo({ domeGradientId }: { domeGradientId: string }) {
  return (
    <span className="menu-online-cosmic-ufo" aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false" aria-hidden>
        <defs>
          <radialGradient id={domeGradientId} cx="50%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#ecfeff" />
            <stop offset="45%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#0891b2" />
          </radialGradient>
        </defs>
        <ellipse cx="12" cy="13.4" rx="7.8" ry="2" fill="#22d3ee" opacity="0.9" />
        <ellipse cx="12" cy="10.8" rx="4.6" ry="2.7" fill={`url(#${domeGradientId})`} />
        <ellipse cx="12" cy="13.2" rx="8.8" ry="0.85" fill="none" stroke="#c4b5fd" strokeWidth="0.7" opacity="0.88" />
        <circle cx="8.2" cy="13.8" r="0.65" fill="#f0abfc" opacity="0.95" />
        <circle cx="12" cy="14.1" r="0.7" fill="#a5f3fc" />
        <circle cx="15.8" cy="13.8" r="0.65" fill="#f0abfc" opacity="0.95" />
      </svg>
    </span>
  );
}

function MenuOnlineCosmicSatellite({ bodyGradientId }: { bodyGradientId: string }) {
  return (
    <span className="menu-online-cosmic-satellite" aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%" focusable="false" aria-hidden>
        <defs>
          <radialGradient id={bodyGradientId} cx="34%" cy="28%" r="68%">
            <stop offset="0%" stopColor="#f3e8ff" />
            <stop offset="38%" stopColor="#c084fc" />
            <stop offset="100%" stopColor="#6b21a8" />
          </radialGradient>
        </defs>
        <ellipse
          cx="12"
          cy="12.6"
          rx="9.6"
          ry="2.35"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="1.05"
          opacity="0.92"
          transform="rotate(-17 12 12.6)"
        />
        <ellipse
          cx="12"
          cy="12.6"
          rx="9.6"
          ry="2.35"
          fill="none"
          stroke="#c084fc"
          strokeWidth="0.55"
          opacity="0.78"
          transform="rotate(-17 12 12.6)"
        />
        <circle cx="12" cy="11.8" r="4.2" fill={`url(#${bodyGradientId})`} />
      </svg>
    </span>
  );
}

/** Клоны фоновых ПК-НЛО внутри окошка: совпадают с полётом, клип рамкой/глифами. */
function MenuOnlinePortholeUfos() {
  const hostRef = useRef<HTMLDivElement>(null);
  const craftRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let raf = 0;
    const tick = () => {
      if (!document.hidden) {
        const sources = document.querySelectorAll<HTMLElement>(
          '.menu-screen__pc-ufos > .menu-screen__pc-ufo',
        );
        const hostRect = host.getBoundingClientRect();
        sources.forEach((src, i) => {
          const craft = craftRefs.current[i];
          if (!craft) return;
          const r = src.getBoundingClientRect();
          const cs = getComputedStyle(src);
          craft.style.width = `${Math.max(0, r.width)}px`;
          craft.style.height = `${Math.max(0, r.height)}px`;
          craft.style.opacity = cs.opacity;
          craft.style.filter = cs.filter;
          craft.style.transform = `translate3d(${r.left - hostRect.left}px, ${r.top - hostRect.top}px, 0)`;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="menu-online-porthole-ufos" ref={hostRef} aria-hidden="true">
      <span
        className="menu-online-porthole-ufos__craft menu-online-porthole-ufos__craft--cyan"
        ref={(el) => {
          craftRefs.current[0] = el;
        }}
      >
        <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
          <ellipse cx="24" cy="18" rx="16" ry="4" fill="#22d3ee" opacity="0.85" />
          <ellipse cx="24" cy="13" rx="10" ry="6" fill="#a5f3fc" />
          <ellipse
            cx="24"
            cy="17.5"
            rx="18"
            ry="1.6"
            fill="none"
            stroke="#c4b5fd"
            strokeWidth="1.2"
            opacity="0.9"
          />
          <circle cx="16" cy="19" r="1.4" fill="#f0abfc" />
          <circle cx="24" cy="20" r="1.5" fill="#ecfeff" />
          <circle cx="32" cy="19" r="1.4" fill="#f0abfc" />
        </svg>
      </span>
      <span
        className="menu-online-porthole-ufos__craft menu-online-porthole-ufos__craft--magenta"
        ref={(el) => {
          craftRefs.current[1] = el;
        }}
      >
        <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
          <ellipse cx="24" cy="16" rx="18" ry="5" fill="#a855f7" opacity="0.75" />
          <ellipse cx="24" cy="12" rx="8" ry="5.5" fill="#f5d0fe" />
          <path d="M6 16 Q24 22 42 16" fill="none" stroke="#67e8f9" strokeWidth="1.1" opacity="0.85" />
          <circle cx="14" cy="17.5" r="1.2" fill="#22d3ee" />
          <circle cx="24" cy="18.5" r="1.3" fill="#fef08a" />
          <circle cx="34" cy="17.5" r="1.2" fill="#22d3ee" />
        </svg>
      </span>
      <span
        className="menu-online-porthole-ufos__craft menu-online-porthole-ufos__craft--gold"
        ref={(el) => {
          craftRefs.current[2] = el;
        }}
      >
        <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
          <path d="M8 18 L24 6 L40 18 L32 20 L24 10 L16 20 Z" fill="#fbbf24" opacity="0.92" />
          <ellipse cx="24" cy="19" rx="14" ry="3.2" fill="#f59e0b" opacity="0.8" />
          <circle cx="18" cy="19.5" r="1.1" fill="#ecfeff" />
          <circle cx="24" cy="20.2" r="1.2" fill="#a5f3fc" />
          <circle cx="30" cy="19.5" r="1.1" fill="#ecfeff" />
        </svg>
      </span>
    </div>
  );
}

function MenuOnlineCosmicDecor({ portholeUfos = false }: { portholeUfos?: boolean }) {
  const ufoDomeGradientId = useId().replace(/:/g, '');
  const satelliteBodyGradientId = useId().replace(/:/g, '');

  return (
    <>
      <div className="menu-online-cosmic-stars" aria-hidden="true">
        {/*
          Клип — в .stars (едет с капсулой); «небо» — в .__sky
          (компенсирует bob, чтобы звёзды оставались в мировых координатах).
        */}
        <div className="menu-online-cosmic-stars__sky">
          <div className="menu-online-cosmic-stars__layer menu-online-cosmic-stars__layer--a" />
          <div className="menu-online-cosmic-stars__layer menu-online-cosmic-stars__layer--b" />
          <div className="menu-online-cosmic-stars__layer menu-online-cosmic-stars__layer--c" />
        </div>
        {portholeUfos ? <MenuOnlinePortholeUfos /> : null}
      </div>
      <span className="menu-online-cosmic-ufo-host" aria-hidden="true">
        <span className="menu-online-cosmic-ufo-flight">
          <MenuOnlineCosmicUfo domeGradientId={ufoDomeGradientId} />
        </span>
      </span>
      <span className="menu-online-cosmic-satellite-host" aria-hidden="true">
        <span className="menu-online-cosmic-satellite-flight">
          <MenuOnlineCosmicSatellite bodyGradientId={satelliteBodyGradientId} />
        </span>
      </span>
    </>
  );
}

function SplitCapsuleHalf({
  side,
  tone,
  glyph,
  title,
  hint,
  satelliteCode,
  onClick,
}: {
  side: 'resume' | 'main';
  tone: SplitCapsuleTone;
  glyph?: ReactNode;
  title: string;
  hint: string;
  satelliteCode?: string | null;
  onClick: () => void;
}) {
  const showSatellite = side === 'resume' && satelliteCode;
  return (
    <button
      type="button"
      className={[
        'menu-split-capsule__half',
        `menu-split-capsule__half--${side}`,
        `menu-split-capsule__half--${tone}`,
      ].join(' ')}
      onClick={onClick}
      onPointerUp={blurAfterTouch}
      aria-label={showSatellite ? `Продолжить, комната ${satelliteCode}` : undefined}
    >
      {showSatellite ? (
        <span className="menu-split-capsule__satellite" aria-hidden="true">
          <span className="menu-split-capsule__satellite-ring" />
          <span className="menu-split-capsule__satellite-code">{satelliteCode}</span>
        </span>
      ) : null}
      {glyph ? (
        <span className="menu-split-capsule__glyph menu-split-capsule__glyph--stack">{glyph}</span>
      ) : null}
      <span className="menu-split-capsule__body">
        <span
          className={[
            'menu-split-capsule__title',
            side === 'main'
              ? `menu-split-capsule__title--new menu-split-capsule__title--new-${tone === 'actionOnline' ? 'online' : 'offline'}`
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {title}
        </span>
        <span className="menu-split-capsule__hint">{hint}</span>
      </span>
    </button>
  );
}

function ModeLabelSplitFlat({ mode }: { mode: 'online' | 'offline' }) {
  const t = useT();
  const keyLetter = mode === 'online' ? t('menu.modeKeyOnline') : t('menu.modeKeyOffline');

  return (
    <>
      <span className="menu-mode-label__chip-o">{t('menu.modeChip')}</span>
      <span className={`menu-mode-label__key menu-mode-label__key--${mode}`}>{keyLetter}</span>
      <span className={`menu-mode-label__sep menu-mode-label__sep--${mode}`} aria-hidden="true">
        ·
      </span>
      <span className={`menu-mode-label__tail menu-mode-label__tail--${mode}`}>{t('menu.modeTail')}</span>
    </>
  );
}

function ModeLabelSmileArc({ mode }: { mode: 'online' | 'offline' }) {
  const uid = useId().replace(/:/g, '');
  const pathId = `${uid}-path`;
  const fillTextId = `${uid}-fill-text`;
  const fillPillId = `${uid}-fill-pill`;
  const fillRimId = `${uid}-fill-rim`;
  const t = useT();
  const keyLetter = mode === 'online' ? t('menu.modeKeyOnline') : t('menu.modeKeyOffline');
  /** Одна дуга для pill и текста; буквы в центр stroke — через translate у <g>. */
  const arcPathD = 'M 16,24 A 36,36 0 0,0 84,24';
  const pillPathD = 'M 22,24 A 36,36 0 0,0 78,24';

  return (
    <>
      <svg
        className={`menu-split-capsule__mode-arc menu-split-capsule__mode-arc--${mode}`}
        viewBox="0 10 100 28"
        preserveAspectRatio="xMidYMin meet"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        pointerEvents="none"
      >
        <defs>
          <path id={pathId} d={arcPathD} fill="none" />
          {mode === 'online' ? (
            <>
              <linearGradient id={fillPillId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(48 22 88)" stopOpacity="0.94" />
                <stop offset="45%" stopColor="rgb(36 14 72)" stopOpacity="0.96" />
                <stop offset="100%" stopColor="rgb(18 8 42)" stopOpacity="0.97" />
              </linearGradient>
              <linearGradient id={fillTextId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="12%" stopColor="#14b8a6" />
                <stop offset="24%" stopColor="#38bdf8" />
                <stop offset="36%" stopColor="#0ea5e9" />
                <stop offset="48%" stopColor="#a3ff48" />
                <stop offset="58%" stopColor="#3b82f6" />
                <stop offset="68%" stopColor="#6366f1" />
                <stop offset="78%" stopColor="#9333ea" />
                <stop offset="88%" stopColor="#c084fc" />
                <stop offset="100%" stopColor="#22d3ee" />
                <animate attributeName="x1" values="-40%;0%;-40%" dur="17.5s" repeatCount="indefinite" />
                <animate attributeName="x2" values="60%;100%;60%" dur="17.5s" repeatCount="indefinite" />
              </linearGradient>
            </>
          ) : (
            <>
              <linearGradient id={fillPillId} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(72 48 124)" stopOpacity="0.96" />
                <stop offset="45%" stopColor="rgb(60 40 108)" stopOpacity="0.97" />
                <stop offset="100%" stopColor="rgb(44 28 88)" stopOpacity="0.98" />
              </linearGradient>
              <linearGradient
                id={fillRimId}
                gradientUnits="userSpaceOnUse"
                x1="-50"
                y1="24"
                x2="50"
                y2="24"
                spreadMethod="repeat"
              >
                <stop offset="0%" stopColor="#4c1d95" />
                <stop offset="20%" stopColor="#6366f1" />
                <stop offset="40%" stopColor="#7c6af0" />
                <stop offset="55%" stopColor="#8b5cf6" />
                <stop offset="75%" stopColor="#6d28d9" />
                <stop offset="100%" stopColor="#4c1d95" />
                <animate attributeName="x1" values="-50;50;-50" dur="3.4s" repeatCount="indefinite" />
                <animate attributeName="x2" values="50;150;50" dur="3.4s" repeatCount="indefinite" />
              </linearGradient>
              <linearGradient id={fillTextId} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff5cbf" />
                <stop offset="14%" stopColor="#ff3d9a" />
                <stop offset="28%" stopColor="#f0abfc" />
                <stop offset="44%" stopColor="#ff4db8" />
                <stop offset="58%" stopColor="#e879f9" />
                <stop offset="72%" stopColor="#ff2d6f" />
                <stop offset="86%" stopColor="#ff7ac8" />
                <stop offset="100%" stopColor="#d946ef" />
                <animate attributeName="x1" values="-35%;0%;-35%" dur="17.5s" repeatCount="indefinite" />
                <animate attributeName="x2" values="65%;100%;65%" dur="17.5s" repeatCount="indefinite" />
              </linearGradient>
            </>
          )}
        </defs>
        <path
          className={`menu-split-capsule__mode-arc-pill-rim menu-split-capsule__mode-arc-pill-rim--${mode}`}
          d={pillPathD}
          fill="none"
          stroke={mode === 'offline' ? `url(#${fillRimId})` : undefined}
          strokeWidth={mode === 'offline' ? 14.8 : undefined}
        />
        <path
          className={`menu-split-capsule__mode-arc-pill menu-split-capsule__mode-arc-pill--${mode}`}
          d={pillPathD}
          fill="none"
          stroke={`url(#${fillPillId})`}
        />
        {/* textPath сажает baseline на путь; буквы визуально ниже — поднимаем в центр stroke */}
        <g transform="translate(0 -6.5)">
          <text
            className={`menu-split-capsule__mode-arc-text menu-split-capsule__mode-arc-text--${mode}`}
            fill={`url(#${fillTextId})`}
          >
            <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
              <tspan className="menu-split-capsule__mode-arc-chip-o">{t('menu.modeChip')}</tspan>
              <tspan className={`menu-split-capsule__mode-arc-key menu-split-capsule__mode-arc-key--${mode}`}>
                {keyLetter}
              </tspan>
              <tspan className={`menu-split-capsule__mode-arc-sep menu-split-capsule__mode-arc-sep--${mode}`} dx="0.12em">
                ·
              </tspan>
              <tspan className={`menu-split-capsule__mode-arc-tail menu-split-capsule__mode-arc-tail--${mode}`} dx="0.08em">
                {t('menu.modeTail')}
              </tspan>
            </textPath>
          </text>
        </g>
      </svg>
      <span
        className={`menu-split-capsule__mode-label-flat menu-split-capsule__mode-label-flat--${mode} menu-split-capsule__mode-label-flat--split`}
        aria-hidden="true"
      >
        <ModeLabelSplitFlat mode={mode} />
      </span>
    </>
  );
}

function ModeLegendPanel({
  mode,
  panelId,
  legendOpen,
  onClose,
  onPlay,
}: {
  mode: 'online' | 'offline';
  panelId: string;
  legendOpen: boolean;
  onClose: () => void;
  /** Solo: быстрый переход в лобби / офлайн-игру из легенды. */
  onPlay?: () => void;
}) {
  const t = useT();
  const legend = MODE_LEGENDS[mode];
  const { artExpanded, expandArt } = useLegendArtCompact(legendOpen);
  const playLabel = mode === 'online' ? t('menu.toLobby') : t('menu.play');
  const kicker = mode === 'online' ? t('menu.legendOnlineKicker') : t('menu.legendOfflineKicker');
  const title = mode === 'online' ? t('menu.legendOnlineTitle') : t('menu.legendOfflineTitle');
  const body = mode === 'online' ? t('menu.legendOnlineBody') : t('menu.legendOfflineBody');

  return (
    <div className={`menu-split-capsule__legend menu-split-capsule__legend--${mode}`} id={panelId}>
      <div className="menu-split-capsule__legend-inner">
        <div className="menu-split-capsule__legend-shimmer" aria-hidden="true" />
        <button
          type="button"
          className="menu-split-capsule__legend-close"
          onClick={onClose}
          aria-label={t('menu.legendCollapseAria')}
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="menu-split-capsule__legend-kicker">{kicker}</p>
        <div className="menu-split-capsule__legend-head">
          <button
            type="button"
            className={[
              'menu-split-capsule__legend-art-wrap',
              artExpanded ? '' : 'menu-split-capsule__legend-art-wrap--compact',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={expandArt}
            aria-label={artExpanded ? t('menu.legendArt') : t('menu.legendArtExpand')}
          >
            <img
              className="menu-split-capsule__legend-art"
              src={legend.artUrl}
              alt=""
              decoding="async"
              draggable={false}
            />
          </button>
          <h3 className="menu-split-capsule__legend-title">{title}</h3>
        </div>
        <p className="menu-split-capsule__legend-body">{body}</p>
        <div className="menu-split-capsule__legend-actions">
          {onPlay ? (
            <button
              type="button"
              className="menu-split-capsule__legend-play"
              onClick={() => {
                onClose();
                onPlay();
              }}
            >
              {playLabel}
            </button>
          ) : null}
          <button type="button" className="menu-split-capsule__legend-collapse" onClick={onClose}>
            {t('menu.legendCollapse')}
          </button>
        </div>
      </div>
    </div>
  );
}

function SplitCapsuleModeCrest({
  mode,
  modeLabel,
  glyph,
  legendOpen,
  onGlyphClick,
  legendPanelId,
  showModeLabel = true,
  modeLabelSlot,
  glyphAriaLabel,
  legendEnabled = true,
}: {
  mode: 'online' | 'offline';
  modeLabel: string;
  glyph: ReactNode;
  legendOpen: boolean;
  onGlyphClick: () => void;
  legendPanelId: string;
  /** Smile-arc под глифом (в solo скрываем — там каплюля-watermark). */
  showModeLabel?: boolean;
  /** Лаб: заменить дугу. `false` — ничего; ReactNode — кастом. */
  modeLabelSlot?: ReactNode | false;
  /** Переопределение aria-label глифа (напр. ПК: сразу в Онлайн). */
  glyphAriaLabel?: string;
  /** false — глиф не управляет панелью легенды (ПК Онлайн). */
  legendEnabled?: boolean;
}) {
  const glyphAria =
    glyphAriaLabel ??
    (legendOpen ? t('menu.legendCollapseNamed', { name: modeLabel }) : t('menu.legendWhat', { name: modeLabel }));

  let labelNode: ReactNode = null;
  if (modeLabelSlot === false) {
    labelNode = null;
  } else if (modeLabelSlot !== undefined) {
    labelNode = modeLabelSlot;
  } else if (showModeLabel) {
    labelNode = <ModeLabelSmileArc mode={mode} />;
  }

  return (
    <div className="menu-split-capsule__mode-crest-anchor" aria-label={modeLabel}>
      <span className="menu-split-capsule__mode-crest-beam" aria-hidden="true" />
      <div className="menu-split-capsule__mode-crest-stack">
        <div className="menu-split-capsule__mode-crest-head">
          <span className={`menu-split-capsule__mode-dot menu-split-capsule__mode-dot--${mode}`} aria-hidden="true" />
          <div className="menu-split-capsule__mode-glyph-cluster">
            <button
              type="button"
              className={`menu-split-capsule__mode-glyph-btn menu-split-capsule__mode-glyph menu-split-capsule__mode-glyph--${mode}${legendOpen ? ' menu-split-capsule__mode-glyph--legend-open' : ''}`}
              onClick={onGlyphClick}
              onPointerUp={blurAfterTouch}
              aria-expanded={legendEnabled ? legendOpen : undefined}
              aria-controls={legendEnabled ? legendPanelId : undefined}
              aria-label={glyphAria}
            >
              {glyph}
            </button>
            {labelNode}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MenuPlaySplitCapsule({
  mode,
  canResume,
  satelliteCode,
  onResume,
  onMain,
  modeLabelSlot,
  shellDecor,
  pcModeLabels = true,
}: MenuPlaySplitCapsuleProps) {
  const t = useT();
  const mainVariant: MenuCapsuleVariant = mode === 'online' ? 'online' : 'offline';
  const resumeVariant: MenuCapsuleVariant = mode === 'online' ? 'resumeOnline' : 'resumeOffline';
  const modeLabel = mode === 'online' ? t('menu.legendOnlineTitle') : t('menu.legendOfflineTitle');
  const { legendOpen, legendClosing, toggleLegend, closeLegend } = useModeLegendAutoClose();
  const legendPanelId = useId();
  const mapTipId = useId();
  const pillMapTipId = useId();
  const [mapTipOpen, setMapTipOpen] = useState(false);
  const [pillMapTipOpen, setPillMapTipOpen] = useState(false);
  const [showGlyphMapHint, setShowGlyphMapHint] = useState(() => !hasSeenSoloMapHint('glyph'));
  const [showPillMapHint, setShowPillMapHint] = useState(() => !hasSeenSoloMapHint('pill'));
  /** Пока открыт guest-тултип — не рендерим офлайн-пунктиры (иначе SVG рисуется поверх). */
  const [guestMapTipOpen, setGuestMapTipOpen] = useState(false);

  useEffect(() => {
    const onGuestTip = (e: Event) => {
      const open = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open);
      setGuestMapTipOpen(open);
    };
    window.addEventListener('menu-guest-map-tip', onGuestTip);
    return () => window.removeEventListener('menu-guest-map-tip', onGuestTip);
  }, []);
  const mapTipTimerRef = useRef<number | null>(null);
  const pillMapTipTimerRef = useRef<number | null>(null);
  const offlinePillLabels = useMemo(
    () => [t('menu.offlinePill'), t('menu.withAi'), t('menu.play')] as const,
    [t],
  );
  const soloOfflinePillLabel = useCyclingLabel(
    offlinePillLabels,
    !canResume && mode === 'offline',
    OFFLINE_SOLO_PILL_LABEL_MS,
  );

  const dismissGlyphMapHint = useCallback(() => {
    if (!showGlyphMapHint) return;
    markSoloMapHintSeen('glyph');
    setShowGlyphMapHint(false);
    setMapTipOpen(false);
    if (mapTipTimerRef.current != null) {
      window.clearTimeout(mapTipTimerRef.current);
      mapTipTimerRef.current = null;
    }
  }, [showGlyphMapHint]);

  const dismissPillMapHint = useCallback(() => {
    if (!showPillMapHint) return;
    markSoloMapHintSeen('pill');
    setShowPillMapHint(false);
    setPillMapTipOpen(false);
    if (pillMapTipTimerRef.current != null) {
      window.clearTimeout(pillMapTipTimerRef.current);
      pillMapTipTimerRef.current = null;
    }
  }, [showPillMapHint]);

  const handleSoloGlyphClick = useCallback(() => {
    dismissGlyphMapHint();
    toggleLegend();
  }, [dismissGlyphMapHint, toggleLegend]);

  const handleSoloPillClick = useCallback(() => {
    dismissPillMapHint();
    onMain();
  }, [dismissPillMapHint, onMain]);

  const clearMapTipTimer = useCallback(() => {
    if (mapTipTimerRef.current != null) {
      window.clearTimeout(mapTipTimerRef.current);
      mapTipTimerRef.current = null;
    }
  }, []);

  const clearPillMapTipTimer = useCallback(() => {
    if (pillMapTipTimerRef.current != null) {
      window.clearTimeout(pillMapTipTimerRef.current);
      pillMapTipTimerRef.current = null;
    }
  }, []);

  const closeMapTip = useCallback(() => {
    setMapTipOpen(false);
    clearMapTipTimer();
  }, [clearMapTipTimer]);

  const closePillMapTip = useCallback(() => {
    setPillMapTipOpen(false);
    clearPillMapTipTimer();
  }, [clearPillMapTipTimer]);

  const openMapTip = useCallback(() => {
    setPillMapTipOpen(false);
    clearPillMapTipTimer();
    setMapTipOpen(true);
    clearMapTipTimer();
    mapTipTimerRef.current = window.setTimeout(() => {
      setMapTipOpen(false);
      mapTipTimerRef.current = null;
    }, SOLO_MAP_TIP_AUTO_MS);
  }, [clearMapTipTimer, clearPillMapTipTimer]);

  const openPillMapTip = useCallback(() => {
    setMapTipOpen(false);
    clearMapTipTimer();
    setPillMapTipOpen(true);
    clearPillMapTipTimer();
    pillMapTipTimerRef.current = window.setTimeout(() => {
      setPillMapTipOpen(false);
      pillMapTipTimerRef.current = null;
    }, SOLO_MAP_TIP_AUTO_MS);
  }, [clearMapTipTimer, clearPillMapTipTimer]);

  useEffect(
    () => () => {
      clearMapTipTimer();
      clearPillMapTipTimer();
    },
    [clearMapTipTimer, clearPillMapTipTimer],
  );

  useEffect(() => {
    if (legendOpen) {
      closeMapTip();
      closePillMapTip();
    }
  }, [legendOpen, closeMapTip, closePillMapTip]);

  const [isPcMenu, setIsPcMenu] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PC_MENU_MQ).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(PC_MENU_MQ);
    const sync = () => setIsPcMenu(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /** ПК: глиф «Онлайн» сразу открывает страницу; легенда — на странице Онлайн. */
  const onlinePcDirectOpen = mode === 'online' && isPcMenu;
  const handleOnlineGlyphClick = onlinePcDirectOpen ? onMain : toggleLegend;

  /** ПК split: онлайн = клин+кольца; офлайн = только клин. Мобилка — smile-arc. */
  const usePcModeDecor = pcModeLabels && isPcMenu && canResume;
  const resolvedModeLabelSlot: ReactNode | false | undefined = usePcModeDecor
    ? mode === 'online'
      ? <ModeLabelHoloOrbitHybridRings mode="online" />
      : false
    : modeLabelSlot;
  const resolvedShellDecor: ReactNode | undefined = usePcModeDecor
    ? <ModeLabelHoloWedge mode={mode} />
    : shellDecor;
  const pcModeClass = usePcModeDecor
    ? mode === 'online'
      ? 'menu-split-capsule--pc-mode-hybrid'
      : 'menu-split-capsule--pc-mode-holo'
    : '';

  const rootClassName = [
    'menu-split-capsule',
    'menu-split-capsule--b4',
    `menu-split-capsule--${mode}`,
    pcModeClass,
    legendOpen && !onlinePcDirectOpen ? 'menu-split-capsule--legend-open' : '',
    legendClosing && !onlinePcDirectOpen ? 'menu-split-capsule--legend-closing' : '',
    canResume ? '' : 'menu-split-capsule--solo',
  ]
    .filter(Boolean)
    .join(' ');

  if (!canResume) {
    const pillLabel = mode === 'online' ? t('menu.legendOnlineTitle') : soloOfflinePillLabel;
    const pillAria =
      mode === 'online' ? t('menu.openOnlineLobby') : t('menu.startOffline');
    return (
      <div
        className={[
          rootClassName,
          'menu-split-capsule--solo-glyph',
          mapTipOpen || pillMapTipOpen ? 'menu-split-capsule--map-tip-open' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className="menu-split-capsule__shell">
          {mode === 'online' ? <MenuOnlineCosmicDecor portholeUfos={isPcMenu} /> : null}
          <div className="menu-split-capsule__solo-glyph-slot" aria-hidden="true" />
          <div
            className={`menu-split-capsule__solo-watermark menu-split-capsule__solo-watermark--${mode}`}
            aria-hidden="true"
          >
            <span className="menu-split-capsule__solo-watermark-scan" />
            <span className="menu-split-capsule__solo-watermark-ghost">
              {mode === 'online' ? t('menu.legendOnlineTitle').toUpperCase() : t('menu.legendOfflineTitle').toUpperCase()}
            </span>
            <span className="menu-split-capsule__solo-watermark-glitch menu-split-capsule__solo-watermark-glitch--a">
              {mode === 'online' ? t('menu.legendOnlineTitle') : t('menu.legendOfflineTitle')}
            </span>
            <span className="menu-split-capsule__solo-watermark-glitch menu-split-capsule__solo-watermark-glitch--b">
              {mode === 'online' ? t('menu.legendOnlineTitle') : t('menu.legendOfflineTitle')}
            </span>
          </div>
          <button
            type="button"
            className={`menu-split-capsule__solo-watermark-main menu-split-capsule__solo-watermark-main--${mode}`}
            onClick={mode === 'offline' ? handleSoloPillClick : onMain}
            onPointerUp={blurAfterTouch}
            aria-label={pillAria}
          >
            <span
              key={pillLabel}
              className={[
                'menu-split-capsule__solo-watermark-main-text',
                mode === 'offline' ? 'menu-split-capsule__solo-watermark-main-text--swap' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              {pillLabel}
            </span>
          </button>
          {!onlinePcDirectOpen ? (
            <ModeLegendPanel
              mode={mode}
              panelId={legendPanelId}
              legendOpen={legendOpen}
              onClose={closeLegend}
              onPlay={onMain}
            />
          ) : null}
          <SplitCapsuleModeCrest
            mode={mode}
            modeLabel={modeLabel}
            glyph={GLYPHS[mainVariant]}
            legendOpen={onlinePcDirectOpen ? false : legendOpen}
            onGlyphClick={mode === 'offline' ? handleSoloGlyphClick : handleOnlineGlyphClick}
            legendPanelId={legendPanelId}
            showModeLabel={false}
            glyphAriaLabel={onlinePcDirectOpen ? t('menu.openOnline') : undefined}
            legendEnabled={!onlinePcDirectOpen}
          />
          {mode === 'offline' && !isPcMenu && !legendOpen && showGlyphMapHint && !guestMapTipOpen && !pillMapTipOpen ? (
            <div className="menu-split-capsule__solo-map-hint">
              <svg
                className="menu-split-capsule__solo-map-hint__svg"
                viewBox="0 0 168 78"
                width="168"
                height="78"
                focusable="false"
                aria-hidden="true"
              >
                <defs>
                  {/*
                    Перелив строго по L: горизонт L→R, вертикаль сверху вниз.
                    Градиент двигаем ВПРАВО / ВНИЗ (иначе визуально кажется наоборот).
                    period = длина тайла + spreadMethod=repeat → без дёрганого сброса.
                  */}
                  <linearGradient
                    id="solo-map-hint-flow-h"
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="16"
                    x2="120"
                    y2="16"
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
                      to="120 0"
                      dur="4s"
                      repeatCount="indefinite"
                      calcMode="linear"
                    />
                  </linearGradient>
                  <linearGradient
                    id="solo-map-hint-flow-v"
                    gradientUnits="userSpaceOnUse"
                    x1="108"
                    y1="0"
                    x2="108"
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
                <path
                  className="menu-split-capsule__solo-map-hint__path menu-split-capsule__solo-map-hint__path--h"
                  d="M8 16 H100"
                  fill="none"
                  stroke="url(#solo-map-hint-flow-h)"
                  strokeLinecap="round"
                />
                {/* Угловая точка отдельно — без Q и без стыка двух stroke в одной координате */}
                <circle
                  className="menu-split-capsule__solo-map-hint__corner"
                  cx="108"
                  cy="16"
                  r="1.3"
                  fill="url(#solo-map-hint-flow-h)"
                />
                <path
                  className="menu-split-capsule__solo-map-hint__path menu-split-capsule__solo-map-hint__path--v"
                  d="M108 24 V46.5"
                  fill="none"
                  stroke="url(#solo-map-hint-flow-v)"
                  strokeLinecap="round"
                />
                <circle
                  className="menu-split-capsule__solo-map-hint__origin"
                  cx="8"
                  cy="16"
                  r="1.3"
                  fill="url(#solo-map-hint-flow-h)"
                />
                <polygon
                  className="menu-split-capsule__solo-map-hint__tri"
                  points="108,46.5 120.8,69.8 95.2,69.8"
                  fill="rgba(12, 4, 28, 0.72)"
                  stroke="url(#solo-map-hint-flow-v)"
                  strokeWidth="1.45"
                  strokeLinejoin="round"
                />
                <text
                  className="menu-split-capsule__solo-map-hint__q"
                  x="108"
                  y="63.1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ?
                </text>
              </svg>
              <button
                type="button"
                className="menu-split-capsule__solo-map-hint__hit"
                aria-expanded={mapTipOpen}
                aria-controls={mapTipId}
                aria-label={t('menu.soloGlyphAria')}
                onPointerUp={blurAfterTouch}
                onClick={(e) => {
                  e.stopPropagation();
                  if (mapTipOpen) closeMapTip();
                  else openMapTip();
                }}
              />
              {mapTipOpen ? (
                <div
                  id={mapTipId}
                  className="menu-split-capsule__solo-map-tip game-table-tooltip-cosmic"
                  role="tooltip"
                >
                  <p className="game-table-tooltip-cosmic-body-text menu-split-capsule__solo-map-tip__text">
                    {t('menu.soloMapTip')}
                  </p>
                  <MenuMapTipDismiss onDismiss={closeMapTip} onHideHint={dismissGlyphMapHint} />
                </div>
              ) : null}
            </div>
          ) : null}
          {mode === 'offline' && !isPcMenu && !legendOpen && showPillMapHint && !guestMapTipOpen && !mapTipOpen ? (
            <div className="menu-split-capsule__solo-map-hint menu-split-capsule__solo-map-hint--pill">
              <svg
                className="menu-split-capsule__solo-map-hint__svg"
                viewBox="0 0 148 92"
                width="148"
                height="92"
                focusable="false"
                aria-hidden="true"
              >
                <defs>
                  {/* От пилюли: влево, затем вверх */}
                  <linearGradient
                    id="solo-map-pill-flow-h"
                    gradientUnits="userSpaceOnUse"
                    x1="0"
                    y1="58"
                    x2="120"
                    y2="58"
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
                    id="solo-map-pill-flow-v"
                    gradientUnits="userSpaceOnUse"
                    x1="78"
                    y1="0"
                    x2="78"
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
                      to="0 -120"
                      dur="4s"
                      repeatCount="indefinite"
                      calcMode="linear"
                    />
                  </linearGradient>
                </defs>
                <path
                  className="menu-split-capsule__solo-map-hint__path menu-split-capsule__solo-map-hint__path--h"
                  d="M132 58 H86"
                  fill="none"
                  stroke="url(#solo-map-pill-flow-h)"
                  strokeLinecap="round"
                />
                <circle
                  className="menu-split-capsule__solo-map-hint__corner"
                  cx="78"
                  cy="58"
                  r="1.3"
                  fill="url(#solo-map-pill-flow-h)"
                />
                <path
                  className="menu-split-capsule__solo-map-hint__path menu-split-capsule__solo-map-hint__path--v"
                  d="M78 50 V22"
                  fill="none"
                  stroke="url(#solo-map-pill-flow-v)"
                  strokeLinecap="round"
                />
                <circle
                  className="menu-split-capsule__solo-map-hint__origin menu-split-capsule__solo-map-hint__origin--pill"
                  cx="140"
                  cy="58"
                  r="2.15"
                  fill="none"
                  stroke="url(#solo-map-pill-flow-h)"
                  strokeWidth="1.35"
                />
                <circle
                  className="menu-split-capsule__solo-map-hint__dot"
                  cx="78"
                  cy="12"
                  r="10.5"
                  fill="rgba(12, 4, 28, 0.72)"
                  stroke="url(#solo-map-pill-flow-v)"
                  strokeWidth="1.45"
                />
                <text
                  className="menu-split-capsule__solo-map-hint__q menu-split-capsule__solo-map-hint__q--pill"
                  x="78"
                  y="13.2"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  ?
                </text>
              </svg>
              <button
                type="button"
                className="menu-split-capsule__solo-map-hint__hit menu-split-capsule__solo-map-hint__hit--pill"
                aria-expanded={pillMapTipOpen}
                aria-controls={pillMapTipId}
                aria-label={t('menu.soloPillAria')}
                onPointerUp={blurAfterTouch}
                onClick={(e) => {
                  e.stopPropagation();
                  if (pillMapTipOpen) closePillMapTip();
                  else openPillMapTip();
                }}
              />
              {pillMapTipOpen ? (
                <div
                  id={pillMapTipId}
                  className="menu-split-capsule__solo-map-tip menu-split-capsule__solo-map-tip--pill game-table-tooltip-cosmic"
                  role="tooltip"
                >
                  <p className="game-table-tooltip-cosmic-body-text menu-split-capsule__solo-map-tip__text">
                    {t('menu.soloPillTip')}
                  </p>
                  <MenuMapTipDismiss onDismiss={closePillMapTip} onHideHint={dismissPillMapHint} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const hasSatellite = mode === 'online' && Boolean(satelliteCode);
  const resumeTone: SplitCapsuleTone = mode === 'online' ? 'resumeOnline' : 'resumeOffline';
  const actionTone: SplitCapsuleTone = mode === 'online' ? 'actionOnline' : 'actionOffline';

  return (
    <div
      className={[
        rootClassName,
        hasSatellite ? 'menu-split-capsule--has-satellite' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="menu-split-capsule__shell">
        {mode === 'online' ? <MenuOnlineCosmicDecor portholeUfos={isPcMenu} /> : null}
        {resolvedShellDecor}
        <div className="menu-split-capsule__actions">
          <SplitCapsuleHalf
            side="main"
            tone={actionTone}
            glyph={GLYPHS[mode === 'online' ? 'newOnline' : 'newOffline']}
            title={mode === 'online' ? t('menu.newSession') : t('menu.newDeal')}
            hint={mode === 'online' ? t('menu.newSessionHint') : t('menu.newDealHint')}
            onClick={onMain}
          />
          <span className="menu-split-capsule__beam" aria-hidden="true" />
          <SplitCapsuleHalf
            side="resume"
            tone={resumeTone}
            glyph={GLYPHS[resumeVariant]}
            title={t('menu.continue')}
            hint={mode === 'online' ? t('menu.continueOnlineHint') : t('menu.continueOfflineHint')}
            satelliteCode={satelliteCode}
            onClick={onResume}
          />
        </div>
        {!onlinePcDirectOpen ? (
          <ModeLegendPanel mode={mode} panelId={legendPanelId} legendOpen={legendOpen} onClose={closeLegend} />
        ) : null}
        <SplitCapsuleModeCrest
          mode={mode}
          modeLabel={modeLabel}
          glyph={GLYPHS[mainVariant]}
          legendOpen={onlinePcDirectOpen ? false : legendOpen}
          onGlyphClick={handleOnlineGlyphClick}
          legendPanelId={legendPanelId}
          modeLabelSlot={resolvedModeLabelSlot}
          glyphAriaLabel={onlinePcDirectOpen ? t('menu.openOnline') : undefined}
          legendEnabled={!onlinePcDirectOpen}
        />
      </div>
    </div>
  );
}

export type MenuSectionProps = {
  sectionId: MenuSectionId;
  children: ReactNode;
  compact?: boolean;
  /** Режим «без слов» — кнопка под онлайн-капсулой (мобилка, при раздвоении). */
  glyphsOnly: boolean;
};

export function MenuSection({ children, compact, glyphsOnly }: MenuSectionProps) {
  return (
    <section
      className={[
        'menu-screen__section',
        compact ? 'menu-screen__section--compact' : '',
        glyphsOnly ? 'menu-screen__section--glyphs-only' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Играть"
    >
      <div className="menu-screen__section-body">{children}</div>
    </section>
  );
}
