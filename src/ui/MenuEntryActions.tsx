import { useCallback, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import { MenuGuestIdentityCycle } from './MenuGuestIdentityCycle';
import { MenuMapTipDismiss } from './MenuMapTipDismiss';
import { useMenuAccountSignOutRequest } from './MenuAccountSessionChrome';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';
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
  | 'signOut'
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
    <svg
      className="menu-capsule-glyph-svg menu-capsule-glyph-svg--auth"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      {/* Outer warp ring */}
      <circle
        cx="23"
        cy="22"
        r="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.32"
        strokeDasharray="3.2 4.2"
      />
      {/* Portal disc */}
      <circle cx="23" cy="22" r="10.5" fill="currentColor" opacity="0.16" />
      <circle cx="23" cy="22" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.35" />
      <circle cx="23" cy="22" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.7" opacity="0.55" />
      {/* Bold enter chevron */}
      <path
        d="M7 22h12.5"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M15.2 14.8 24.4 22 15.2 29.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Core spark */}
      <circle cx="23" cy="22" r="2.35" fill="currentColor" />
    </svg>
  );
}

function GlyphMenuSignOut() {
  return (
    <svg
      className="menu-capsule-glyph-svg menu-capsule-glyph-svg--sign-out"
      viewBox="0 0 44 44"
      aria-hidden="true"
    >
      {/* Outer warp ring */}
      <circle
        cx="23"
        cy="22"
        r="15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        opacity="0.32"
        strokeDasharray="3.2 4.2"
      />
      {/* Portal disc */}
      <circle cx="23" cy="22" r="10.5" fill="currentColor" opacity="0.16" />
      <circle cx="23" cy="22" r="10.5" fill="none" stroke="currentColor" strokeWidth="2.35" />
      <circle cx="23" cy="22" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.7" opacity="0.55" />
      {/* Exit chevron ← left, toward label */}
      <path d="M37 22H24.5" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path
        d="M28.8 14.8 19.6 22 28.8 29.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23" cy="22" r="2.35" fill="currentColor" />
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
  signOut: <GlyphMenuSignOut />,
  soon: <GlyphMenuSoon />,
  link: <GlyphMenuLink />,
};

/** Глиф «выйти» — крестик × в цветах двери / стрелки. */
function MenuEdgeSignOutGlyph() {
  const uid = useId().replace(/:/g, '');
  /* Плюс → 45° = ×; насыщенный цвет, без белёсого блика */
  const cross = 'M-1.55-6.2h3.1v4.65h4.65v3.1h-4.65v4.65h-3.1v-4.65h-4.65v-3.1h4.65z';
  return (
    <svg className="menu-capsule__signout-svg" viewBox="0 0 20 20" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-body`} x1="12%" y1="4%" x2="88%" y2="96%">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="28%" stopColor="#06b6d4" />
          <stop offset="52%" stopColor="#7c3aed" />
          <stop offset="76%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
        <linearGradient id={`${uid}-spec`} x1="20%" y1="0%" x2="70%" y2="80%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.75" />
          <stop offset="45%" stopColor="#8b5cf6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#9d174d" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <g transform="translate(10 10) rotate(45)">
        <path fill="#1e0538" opacity="0.55" transform="translate(0.4 0.55)" d={cross} />
        <path fill={`url(#${uid}-body)`} opacity="0.28" d={cross} />
        <path
          fill="none"
          stroke={`url(#${uid}-edge)`}
          strokeWidth="2.15"
          strokeLinejoin="round"
          d={cross}
        />
        <path fill={`url(#${uid}-body)`} d={cross} />
        <path
          fill="none"
          stroke={`url(#${uid}-body)`}
          strokeWidth="1.35"
          strokeLinejoin="round"
          d={cross}
        />
        <path fill={`url(#${uid}-spec)`} opacity="0.55" d="M-1.05-5.75h2.1v2.55h-2.1z" />
      </g>
    </svg>
  );
}

/** Глиф «войти» — стрелка в дверь (тот же цветовой стек, что у «выйти»). */
/** Глиф «войти» — кольцо с разрывом на западе; на hover — полное кольцо + перелив. */
function MenuEdgeSignInGlyph() {
  const uid = useId().replace(/:/g, '');
  const cx = 10;
  const cy = 10;
  const r = 8.55;
  const gapDeg = 42;
  const gapPct = (gapDeg / 360) * 100;
  const arcPct = 100 - gapPct;
  const dashOffset = 50 - gapPct / 2;
  return (
    <svg className="menu-capsule__signin-svg" viewBox="0 0 20 20" focusable="false" aria-hidden>
      <defs>
        {/* покой: статичный градиент, без анимации */}
        <linearGradient id={`${uid}-ring`} x1="12%" y1="4%" x2="88%" y2="96%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="35%" stopColor="#a78bfa" />
          <stop offset="70%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <linearGradient id={`${uid}-ring-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.95" />
          <stop offset="40%" stopColor="#c084fc" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f472b6" stopOpacity="1" />
        </linearGradient>
        {/* hover-перелив — виден только когда opacity>0 */}
        <linearGradient id={`${uid}-ring-flow`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#67e8f9">
            <animate
              attributeName="stop-color"
              values="#67e8f9;#fbbf24;#e879f9;#a78bfa;#22d3ee;#f472b6;#67e8f9"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="50%" stopColor="#e879f9">
            <animate
              attributeName="stop-color"
              values="#e879f9;#22d3ee;#fde68a;#c084fc;#38bdf8;#e879f9"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#a78bfa">
            <animate
              attributeName="stop-color"
              values="#a78bfa;#f472b6;#67e8f9;#fbbf24;#e879f9;#a78bfa"
              dur="1.5s"
              repeatCount="indefinite"
            />
          </stop>
          <animateTransform
            attributeName="gradientTransform"
            type="rotate"
            from="0 10 10"
            to="360 10 10"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="38%" cy="32%" r="58%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.75" />
          <stop offset="22%" stopColor="#a5f3fc" stopOpacity="0.55" />
          <stop offset="48%" stopColor="#a78bfa" stopOpacity="0.35" />
          <stop offset="78%" stopColor="#4c1d95" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-dome`} cx="42%" cy="30%" r="55%">
          <stop offset="0%" stopColor="#fdf4ff" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#67e8f9" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1e0538" stopOpacity="0.45" />
        </radialGradient>
        <linearGradient id={`${uid}-star`} x1="18%" y1="8%" x2="86%" y2="92%">
          <stop offset="0%" stopColor="#ecfeff">
            <animate
              attributeName="stop-color"
              values="#ecfeff;#f0abfc;#67e8f9;#e9d5ff;#ecfeff"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="40%" stopColor="#a5f3fc">
            <animate
              attributeName="stop-color"
              values="#a5f3fc;#c084fc;#f9a8d4;#38bdf8;#a5f3fc"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#e879f9">
            <animate
              attributeName="stop-color"
              values="#e879f9;#22d3ee;#f0abfc;#a78bfa;#e879f9"
              dur="3.2s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
      </defs>

      <circle cx={cx} cy={cy} r="4.55" fill={`url(#${uid}-dome)`} opacity="0.9" />
      <circle cx={cx} cy={cy} r="4.2" fill={`url(#${uid}-glow)`} opacity="0.92" />
      <ellipse cx="8.15" cy="7.55" rx="1.35" ry="0.85" fill="#a5f3fc" opacity="0.55" />

      {/* покой: кольцо с разрывом на западе */}
      <g className="menu-capsule__signin-ring-gap">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${uid}-ring-edge)`}
          strokeWidth="1.25"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${arcPct} ${gapPct}`}
          strokeDashoffset={dashOffset}
        />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${uid}-ring)`}
          strokeWidth="0.95"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${arcPct} ${gapPct}`}
          strokeDashoffset={dashOffset}
        />
      </g>

      {/* hover: полное сомкнутое кольцо + цветовой перелив */}
      <g className="menu-capsule__signin-ring-closed">
        {/* цветная подложка кольца на пике (не белый диск) */}
        <circle
          className="menu-capsule__signin-ring-bloom"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${uid}-ring-flow)`}
          strokeWidth="2.55"
          strokeLinecap="round"
          opacity="0.55"
        />
        <circle
          className="menu-capsule__signin-ring-edge"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${uid}-ring-edge)`}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle
          className="menu-capsule__signin-ring-flow"
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#${uid}-ring-flow)`}
          strokeWidth="1.15"
          strokeLinecap="round"
        />
      </g>

      <g className="menu-capsule__signin-star">
        <path
          fill="none"
          stroke={`url(#${uid}-star)`}
          strokeWidth="1.35"
          strokeLinecap="round"
          d="M10 4.15v1.35M10 14.5v1.35M4.15 10h1.35M14.5 10h1.35"
          opacity="0.95"
        />
        <path
          fill="none"
          stroke={`url(#${uid}-star)`}
          strokeWidth="0.85"
          strokeLinecap="round"
          d="M5.85 5.85l0.95 0.95M13.2 13.2l0.95 0.95M13.2 5.85l-0.95 0.95M5.85 13.2l0.95-0.95"
          opacity="0.7"
        />
        <path
          fill="#1e0538"
          opacity="0.4"
          transform="translate(0.22 0.28)"
          d="M10 5.05 11.15 8.45 14.4 9.4 11.15 10.35 10 13.75 8.85 10.35 5.6 9.4 8.85 8.45Z"
        />
        <path
          fill={`url(#${uid}-star)`}
          d="M10 4.85 11.2 8.4 14.55 9.4 11.2 10.4 10 13.95 8.8 10.4 5.45 9.4 8.8 8.4Z"
        />
        <path
          fill="#ecfeff"
          opacity="0.92"
          d="M10 7.05 10.7 8.95 12.6 9.55 10.7 10.15 10 12.05 9.3 10.15 7.4 9.55 9.3 8.95Z"
        >
          <animate attributeName="opacity" values="0.75;1;0.75" dur="2.2s" repeatCount="indefinite" />
        </path>
        <circle cx={cx} cy={cy} r="1.05" fill="#fdf4ff">
          <animate attributeName="r" values="0.9;1.2;0.9" dur="2.2s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r="0.45" fill="#fff" opacity="0.95" />
      </g>
    </svg>
  );
}

type SignInSpark = {
  x: number;
  y: number;
  s: number;
  delay: number;
  dur: number;
  kind: 'dot' | 'star';
};

/** Стрелка: переливы → хрусталь; звёзды на валу пружинят, над ней — нет. */
function MenuSignInMidArrow() {
  const uid = useId().replace(/:/g, '');
  /* кончик — сплошной конус (остриё 58.8,11); вал — нитка из кружочков */
  const tipCone = 'M46.9 6.55 58.8 11 46.9 15.45Z';
  /* бусины вала до основания конуса; ry чуть больше — компенсирует preserveAspectRatio:none */
  const shaftBeads: { x: number; r: number }[] = [];
  for (let x = 2.1, i = 0; x <= 45.6; x += 2.45, i += 1) {
    shaftBeads.push({ x, r: i % 3 === 1 ? 0.92 : 0.72 });
  }
  /* только над стрелкой — без пружины */
  const aboveStars: { x: number; y: number; s: number; delay: number; dur: number }[] = [
    { x: 10, y: 3.2, s: 0.55, delay: 0.2, dur: 2.8 },
    { x: 18, y: 2.1, s: 0.7, delay: 0.9, dur: 3.1 },
    { x: 27, y: 3.6, s: 0.5, delay: 1.5, dur: 2.6 },
    { x: 35, y: 1.8, s: 0.75, delay: 0.4, dur: 3.4 },
    { x: 43, y: 3.0, s: 0.6, delay: 1.1, dur: 2.9 },
    { x: 51, y: 2.4, s: 0.65, delay: 0.7, dur: 3.2 },
  ];
  /* прямо на линии стрелки — пружинят вместе с ней */
  const onStars: { x: number; y: number; s: number; delay: number; dur: number }[] = [
    { x: 11, y: 11, s: 0.42, delay: 0.15, dur: 2.7 },
    { x: 20, y: 11, s: 0.5, delay: 0.55, dur: 3.0 },
    { x: 29, y: 11, s: 0.45, delay: 1.0, dur: 2.5 },
    { x: 38, y: 11, s: 0.52, delay: 0.35, dur: 3.2 },
    { x: 46, y: 11, s: 0.4, delay: 0.8, dur: 2.8 },
  ];

  const renderStar = (
    sp: { x: number; y: number; s: number; delay: number; dur: number },
    i: number,
    keyPrefix: string,
  ) => (
    <g key={`${keyPrefix}-${i}`} transform={`translate(${sp.x} ${sp.y}) scale(${sp.s})`} opacity="0.15">
      <animate
        attributeName="opacity"
        values="0.1;0.15;0.75;1;0.55;0.12;0.1"
        keyTimes="0;0.35;0.48;0.58;0.7;0.85;1"
        dur="7.2s"
        begin={`${sp.delay}s`}
        repeatCount="indefinite"
      />
      <path
        fill="#ecfeff"
        d="M0 -2.4 0.55 -0.55 2.4 0 0.55 0.55 0 2.4 -0.55 0.55 -2.4 0 -0.55 -0.55Z"
      />
      <path
        fill="#f0abfc"
        opacity="0.85"
        d="M0 -1.15 0.28 -0.28 1.15 0 0.28 0.28 0 1.15 -0.28 0.28 -1.15 0 -0.28 -0.28Z"
      >
        <animate
          attributeName="fill"
          values="#f0abfc;#67e8f9;#fde68a;#e879f9;#f0abfc"
          dur={sp.dur}
          repeatCount="indefinite"
        />
      </path>
    </g>
  );

  const renderBeads = (className: string, paint: string, rScale: number, opacity?: number) => (
    <g className={className} opacity={opacity}>
      {shaftBeads.map((b, i) => (
        <ellipse
          key={`${className}-bead-${i}`}
          cx={b.x}
          cy={11}
          rx={b.r * rScale}
          ry={b.r * rScale * 1.45}
          fill={paint}
        />
      ))}
    </g>
  );

  const gradientDefs = (
    <defs>
      <linearGradient id={`${uid}-flow`} x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#22d3ee" />
        <stop offset="45%" stopColor="#a78bfa" />
        <stop offset="100%" stopColor="#f0abfc" />
      </linearGradient>
      {/* тот же edge+flow, что у сомкнутого кольца — единая реакция */}
      <linearGradient id={`${uid}-react-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#a5f3fc" stopOpacity="0.95" />
        <stop offset="40%" stopColor="#c084fc" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#f472b6" stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${uid}-react`} x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#67e8f9">
          <animate
            attributeName="stop-color"
            values="#67e8f9;#fbbf24;#e879f9;#a78bfa;#22d3ee;#f472b6;#67e8f9"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="50%" stopColor="#e879f9">
          <animate
            attributeName="stop-color"
            values="#e879f9;#22d3ee;#fde68a;#c084fc;#38bdf8;#e879f9"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </stop>
        <stop offset="100%" stopColor="#a78bfa">
          <animate
            attributeName="stop-color"
            values="#a78bfa;#f472b6;#67e8f9;#fbbf24;#e879f9;#a78bfa"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </stop>
        {/* вдоль вала — тот же хроматический цикл, что вращается в кольце */}
        <animateTransform
          attributeName="gradientTransform"
          type="translate"
          values="-0.85 0;0.85 0;-0.85 0"
          dur="1.6s"
          repeatCount="indefinite"
        />
      </linearGradient>
      {/* яркая «подложка» под переливом — общий фон яркости со стрелкой↔кольцом */}
      <linearGradient id={`${uid}-react-bloom`} x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
        <stop offset="35%" stopColor="#fdf4ff" stopOpacity="0.85" />
        <stop offset="65%" stopColor="#e0f2fe" stopOpacity="0.9" />
        <stop offset="100%" stopColor="#fae8ff" stopOpacity="0.88" />
      </linearGradient>
      <linearGradient id={`${uid}-crystal`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
        <stop offset="35%" stopColor="#a5f3fc" stopOpacity="0.55" />
        <stop offset="62%" stopColor="#e9d5ff" stopOpacity="0.7" />
        <stop offset="100%" stopColor="#fdf4ff" stopOpacity="0.9" />
      </linearGradient>
      <linearGradient id={`${uid}-glint`} x1="0%" y1="50%" x2="100%" y2="50%">
        <stop offset="0%" stopColor="#fff" stopOpacity="0" />
        <stop offset="42%" stopColor="#fff" stopOpacity="0">
          <animate attributeName="offset" values="0.15;0.55;0.15" dur="3.8s" repeatCount="indefinite" />
        </stop>
        <stop offset="50%" stopColor="#a5f3fc" stopOpacity="0.85">
          <animate attributeName="offset" values="0.28;0.68;0.28" dur="3.8s" repeatCount="indefinite" />
        </stop>
        <stop offset="58%" stopColor="#e879f9" stopOpacity="0">
          <animate attributeName="offset" values="0.4;0.8;0.4" dur="3.8s" repeatCount="indefinite" />
        </stop>
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  );

  return (
    <span className="menu-capsule__signin-mid-arrow-wrap">
      {/* аура сверху — не пружинит */}
      <svg
        className="menu-capsule__signin-mid-arrow-aura"
        viewBox="0 0 64 18"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden
      >
        {aboveStars.map((sp, i) => renderStar(sp, i, 'above'))}
      </svg>

      {/* вал + звёзды на нём — пружина */}
      <svg
        className="menu-capsule__signin-mid-arrow"
        viewBox="0 0 64 18"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden
      >
        {gradientDefs}

        {renderBeads(`menu-capsule__signin-mid-arrow__crystal`, `url(#${uid}-crystal)`, 1.35, 0.28)}
        <path
          className="menu-capsule__signin-mid-arrow__crystal"
          d={tipCone}
          fill={`url(#${uid}-crystal)`}
          stroke="none"
          opacity="0.22"
        />

        {renderBeads(`menu-capsule__signin-mid-arrow__shaft`, `url(#${uid}-flow)`, 1, 0.95)}
        <path
          className="menu-capsule__signin-mid-arrow__shaft"
          d={tipCone}
          fill={`url(#${uid}-flow)`}
          stroke="none"
          opacity="0.95"
        />

        {renderBeads(`menu-capsule__signin-mid-arrow__glint`, `url(#${uid}-glint)`, 0.78, 0.8)}
        <path
          className="menu-capsule__signin-mid-arrow__glint"
          d={tipCone}
          fill={`url(#${uid}-glint)`}
          stroke="none"
          opacity="0.75"
        />

        {/* реакция: bloom → edge → flow; на пике в центре — жирнее + яркий фон */}
        {renderBeads(`menu-capsule__signin-mid-arrow__react-bloom`, `url(#${uid}-react-bloom)`, 1.45)}
        <path
          className="menu-capsule__signin-mid-arrow__react-bloom"
          d={tipCone}
          fill={`url(#${uid}-react-bloom)`}
          stroke="none"
        />
        {renderBeads(`menu-capsule__signin-mid-arrow__react-edge`, `url(#${uid}-react-edge)`, 1.18)}
        <path
          className="menu-capsule__signin-mid-arrow__react-edge"
          d={tipCone}
          fill={`url(#${uid}-react-edge)`}
          stroke="none"
        />
        {renderBeads(`menu-capsule__signin-mid-arrow__react`, `url(#${uid}-react)`, 1)}
        <path
          className="menu-capsule__signin-mid-arrow__react"
          d={tipCone}
          fill={`url(#${uid}-react)`}
          stroke="none"
        />

        {onStars.map((sp, i) => renderStar(sp, i, 'on'))}
      </svg>
    </span>
  );
}

/** Разлёт цветных точек/звёзд наружу — только на пике 6.2s (не на курсорном hover). */
const SIGNIN_PEAK_BURST: { deg: number; color: string; size: number; kind: 'dot' | 'star' }[] = [
  { deg: -12, color: '#67e8f9', size: 2.5, kind: 'dot' },
  { deg: 8, color: '#f0abfc', size: 2.2, kind: 'dot' },
  { deg: 28, color: '#fbbf24', size: 2.4, kind: 'star' },
  { deg: 48, color: '#a78bfa', size: 2.1, kind: 'dot' },
  { deg: 68, color: '#38bdf8', size: 2.3, kind: 'dot' },
  { deg: 88, color: '#e879f9', size: 2.5, kind: 'star' },
  { deg: 108, color: '#fde68a', size: 2.0, kind: 'dot' },
  { deg: 128, color: '#c4b5fd', size: 2.3, kind: 'dot' },
  { deg: 148, color: '#22d3ee', size: 2.4, kind: 'star' },
  { deg: 168, color: '#fb7185', size: 2.1, kind: 'dot' },
  { deg: 188, color: '#67e8f9', size: 2.2, kind: 'dot' },
  { deg: 208, color: '#f0abfc', size: 2.5, kind: 'star' },
  { deg: 228, color: '#fbbf24', size: 2.0, kind: 'dot' },
  { deg: 248, color: '#a78bfa', size: 2.3, kind: 'dot' },
  { deg: 268, color: '#38bdf8', size: 2.4, kind: 'dot' },
  { deg: 288, color: '#e879f9', size: 2.1, kind: 'star' },
  { deg: 308, color: '#fde68a', size: 2.2, kind: 'dot' },
  { deg: 328, color: '#c4b5fd', size: 2.4, kind: 'dot' },
  { deg: 348, color: '#22d3ee', size: 1.9, kind: 'dot' },
  { deg: 18, color: '#fb7185', size: 1.8, kind: 'dot' },
  { deg: 78, color: '#67e8f9', size: 1.85, kind: 'dot' },
  { deg: 158, color: '#f0abfc', size: 1.9, kind: 'dot' },
  { deg: 238, color: '#fbbf24', size: 1.8, kind: 'dot' },
  { deg: 318, color: '#a78bfa', size: 1.85, kind: 'dot' },
];

function MenuSignInPeakBurst() {
  return (
    <span className="menu-capsule__signin-peak-burst" aria-hidden="true">
      {SIGNIN_PEAK_BURST.map((sp, i) => (
        <span
          key={i}
          className="menu-capsule__signin-peak-burst__ray"
          style={{ transform: `rotate(${sp.deg}deg)` }}
        >
          <span
            className={[
              'menu-capsule__signin-peak-burst__spark',
              sp.kind === 'star' ? 'menu-capsule__signin-peak-burst__spark--star' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{
              width: sp.size,
              height: sp.size,
              background: sp.color,
            }}
          />
        </span>
      ))}
    </span>
  );
}

/** Электрическая вспышка в стыке стрелка → кольцо. */
function MenuSignInConnectFlash() {
  const uid = useId().replace(/:/g, '');
  return (
    <span className="menu-capsule__signin-connect" aria-hidden="true">
      <svg className="menu-capsule__signin-connect__svg" viewBox="0 0 40 28" focusable="false">
        <defs>
          <linearGradient id={`${uid}-bolt`} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#67e8f9">
              <animate
                attributeName="stop-color"
                values="#67e8f9;#fde68a;#e879f9;#67e8f9"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="55%" stopColor="#f0abfc">
              <animate
                attributeName="stop-color"
                values="#f0abfc;#22d3ee;#fbbf24;#f0abfc"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#fbbf24">
              <animate
                attributeName="stop-color"
                values="#fbbf24;#a78bfa;#67e8f9;#fbbf24"
                dur="0.7s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
        </defs>
        <path
          className="menu-capsule__signin-connect__bolt"
          d="M2 15 9 9 12 18 18 7 23 17 29 10 37 14"
          stroke={`url(#${uid}-bolt)`}
          strokeWidth="1.35"
        />
        <path
          className="menu-capsule__signin-connect__bolt"
          d="M3 13 10 16 14 8 20 15 26 11 34 13"
          stroke={`url(#${uid}-bolt)`}
          strokeWidth="0.85"
          opacity="0.75"
        />
        <circle cx="36" cy="13.5" r="2.2" fill="#ecfeff" opacity="0.9">
          <animate attributeName="r" values="1.4;2.6;1.4" dur="0.55s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;1;0.55" dur="0.55s" repeatCount="indefinite" />
        </circle>
        <circle cx="36" cy="13.5" r="4.5" fill="none" stroke="#a5f3fc" strokeWidth="0.6" opacity="0.7">
          <animate attributeName="r" values="2.5;5.5;2.5" dur="0.55s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0.15;0.8" dur="0.55s" repeatCount="indefinite" />
        </circle>
      </svg>
    </span>
  );
}

/** Общий перелив для мини-глифов под «в аккаунт». */
function SignInMiniGradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stopColor="#67e8f9">
        <animate
          attributeName="stop-color"
          values="#67e8f9;#a5b4fc;#f0abfc;#67e8f9"
          dur="3.4s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="50%" stopColor="#a5b4fc">
        <animate
          attributeName="stop-color"
          values="#a5b4fc;#e9d5ff;#67e8f9;#a5b4fc"
          dur="3.4s"
          repeatCount="indefinite"
        />
      </stop>
      <stop offset="100%" stopColor="#f0abfc">
        <animate
          attributeName="stop-color"
          values="#f0abfc;#67e8f9;#a5b4fc;#f0abfc"
          dur="3.4s"
          repeatCount="indefinite"
        />
      </stop>
    </linearGradient>
  );
}

/** Мини-конвертик — тот же перелив, что у «в аккаунт». */
function MenuSignInMiniMail() {
  const uid = useId().replace(/:/g, '');
  const g = `${uid}-g`;
  return (
    <svg className="menu-capsule__action-mini__svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <SignInMiniGradient id={g} />
      </defs>
      <rect
        x="1.5"
        y="3.25"
        width="13"
        height="9.5"
        rx="1.4"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.35"
      />
      <path
        d="M2.1 4.1 8 8.35 13.9 4.1"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.35"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Мини-ключ: ушко + стержень + зубцы — читается как ключ. */
function MenuSignInMiniKey() {
  const uid = useId().replace(/:/g, '');
  const g = `${uid}-g`;
  return (
    <svg className="menu-capsule__action-mini__svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <SignInMiniGradient id={g} />
      </defs>
      {/* ушко */}
      <circle cx="4.6" cy="8" r="3.15" fill="none" stroke={`url(#${g})`} strokeWidth="1.4" />
      <circle cx="4.6" cy="8" r="1.15" fill="none" stroke={`url(#${g})`} strokeWidth="1.25" />
      {/* стержень */}
      <path
        d="M7.6 7.15H14.2v1.7H12.55v1.85h-1.45V8.85H9.55v2.15H8.1V7.15Z"
        fill={`url(#${g})`}
      />
    </svg>
  );
}

/** Мини-онлайн: ядро + орбиты. */
function MenuSignInMiniOnline() {
  const uid = useId().replace(/:/g, '');
  const g = `${uid}-g`;
  return (
    <svg className="menu-capsule__action-mini__svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <SignInMiniGradient id={g} />
      </defs>
      <circle cx="8" cy="8" r="5.6" fill="none" stroke={`url(#${g})`} strokeWidth="1.1" opacity="0.55" />
      <circle
        cx="8"
        cy="8"
        r="3.5"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.15"
        strokeDasharray="1.6 1.8"
      />
      <circle cx="8" cy="8" r="1.55" fill={`url(#${g})`} />
      <circle cx="8" cy="2.35" r="1.05" fill={`url(#${g})`} />
      <circle cx="13.1" cy="10.2" r="0.9" fill={`url(#${g})`} />
      <circle cx="3.2" cy="10.6" r="0.85" fill={`url(#${g})`} />
    </svg>
  );
}

/** Мини-история: лист + часы. */
function MenuSignInMiniHistory() {
  const uid = useId().replace(/:/g, '');
  const g = `${uid}-g`;
  return (
    <svg className="menu-capsule__action-mini__svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <SignInMiniGradient id={g} />
      </defs>
      <rect
        x="2.4"
        y="1.8"
        width="8.2"
        height="11.2"
        rx="1.2"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.3"
      />
      <path
        d="M4.4 4.4h4.2M4.4 6.6h4.2M4.4 8.8h2.6"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="11.35" cy="11.1" r="3.15" fill="none" stroke={`url(#${g})`} strokeWidth="1.3" />
      <path
        d="M11.35 9.55v1.7l1.25 0.85"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Мини-рейтинг / турниры: звезда. */
function MenuSignInMiniRating() {
  const uid = useId().replace(/:/g, '');
  const g = `${uid}-g`;
  return (
    <svg className="menu-capsule__action-mini__svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <SignInMiniGradient id={g} />
      </defs>
      <path
        d="M8 1.6 9.55 5.55l4.25.45-3.2 2.85.95 4.15L8 10.85l-3.55 2.15.95-4.15-3.2-2.85 4.25-.45Z"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <path
        d="M8 4.1 8.85 6.35l2.35.25-1.8 1.55.55 2.3L8 9.2l-1.95 1.25.55-2.3-1.8-1.55 2.35-.25Z"
        fill={`url(#${g})`}
        opacity="0.9"
      />
    </svg>
  );
}

/** Искры: от надписи → на стрелке → длинный путь к глифу → в обод. */
function MenuSignInSparkTrail() {
  const uid = useId().replace(/:/g, '');
  /*
   * viewBox на всю правую половину (preserveAspectRatio=none).
   * Надписи по центру 1fr; глиф справа (~x 100), обод r≈24 (слот 52).
   */
  const gx = 100;
  const gy = 32;
  const rimR = 24;
  const sparks: SignInSpark[] = [
    /* у колонки надписей */
    { x: 28, y: 26, s: 0.7, delay: 0.05, dur: 1.7, kind: 'dot' },
    { x: 30, y: 31.5, s: 0.9, delay: 0.35, dur: 2.0, kind: 'star' },
    { x: 32, y: 37, s: 0.65, delay: 0.7, dur: 1.6, kind: 'dot' },
    { x: 34, y: 24, s: 0.8, delay: 0.2, dur: 1.9, kind: 'star' },
    { x: 36, y: 33, s: 0.7, delay: 0.55, dur: 1.85, kind: 'dot' },
    /* вдоль стрелки / моста к глифу */
    { x: 42, y: 29, s: 0.85, delay: 0.15, dur: 2.1, kind: 'star' },
    { x: 46, y: 35, s: 0.7, delay: 0.5, dur: 1.8, kind: 'dot' },
    { x: 50, y: 27, s: 0.8, delay: 0.25, dur: 1.95, kind: 'star' },
    { x: 54, y: 34, s: 0.75, delay: 0.7, dur: 1.7, kind: 'dot' },
    { x: 58, y: 30, s: 0.9, delay: 0.1, dur: 2.05, kind: 'star' },
    { x: 62, y: 36, s: 0.7, delay: 0.45, dur: 1.85, kind: 'dot' },
    { x: 66, y: 28, s: 0.85, delay: 0.8, dur: 2.0, kind: 'star' },
    { x: 70, y: 33, s: 0.75, delay: 0.2, dur: 1.75, kind: 'dot' },
    { x: 74, y: 26, s: 0.8, delay: 0.55, dur: 1.9, kind: 'star' },
    { x: 78, y: 35, s: 0.7, delay: 0.35, dur: 2.1, kind: 'dot' },
    { x: 82, y: 30, s: 0.9, delay: 0.65, dur: 1.8, kind: 'star' },
    { x: 86, y: 37, s: 0.7, delay: 0.15, dur: 1.95, kind: 'dot' },
    { x: 90, y: 29, s: 0.85, delay: 0.5, dur: 2.0, kind: 'star' },
    { x: 93, y: 34, s: 0.75, delay: 0.85, dur: 1.7, kind: 'dot' },
  ];

  /* звёздочки в обод */
  const rimSpecs: { deg: number; inset: number; s: number }[] = [
    { deg: -165, inset: 1.2, s: 0.85 },
    { deg: -140, inset: 1.2, s: 0.7 },
    { deg: -118, inset: 1.25, s: 0.8 },
    { deg: -98, inset: 1.3, s: 0.7 },
    { deg: -90, inset: 1.35, s: 0.75 },
    { deg: 90, inset: 1.35, s: 0.75 },
    { deg: 98, inset: 1.3, s: 0.7 },
    { deg: 118, inset: 1.25, s: 0.8 },
    { deg: 140, inset: 1.2, s: 0.7 },
    { deg: 165, inset: 1.2, s: 0.85 },
    { deg: -55, inset: 2.35, s: 0.55 },
    { deg: -28, inset: 2.5, s: 0.5 },
    { deg: 28, inset: 2.5, s: 0.5 },
    { deg: 55, inset: 2.35, s: 0.55 },
  ];
  rimSpecs.forEach((spec, i) => {
    const a = (spec.deg * Math.PI) / 180;
    const rr = rimR - spec.inset;
    sparks.push({
      x: gx + Math.cos(a) * rr,
      y: gy + Math.sin(a) * rr,
      s: spec.s,
      delay: (i * 0.1) % 1.15,
      dur: 1.65 + (i % 4) * 0.12,
      kind: i % 2 === 0 ? 'star' : 'dot',
    });
  });

  return (
    <svg
      className="menu-capsule__signin-trail__svg"
      viewBox="0 0 118 64"
      preserveAspectRatio="none"
      focusable="false"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-arrow`} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#22d3ee">
            <animate
              attributeName="stop-color"
              values="#22d3ee;#a78bfa;#e879f9;#67e8f9;#22d3ee"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </stop>
          <stop offset="100%" stopColor="#f0abfc">
            <animate
              attributeName="stop-color"
              values="#f0abfc;#67e8f9;#e879f9;#22d3ee;#f0abfc"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </stop>
        </linearGradient>
        <linearGradient id={`${uid}-spark`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ecfeff" />
          <stop offset="45%" stopColor="#a5f3fc" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>

      {sparks.map((sp, i) => {
        const twinkle = (
          <animate
            attributeName="opacity"
            values="0.2;1;0.35;0.95;0.25"
            dur={`${sp.dur}s`}
            begin={`${sp.delay}s`}
            repeatCount="indefinite"
          />
        );
        if (sp.kind === 'dot') {
          return (
            <circle
              key={`d-${i}`}
              className="menu-capsule__signin-trail__spark"
              cx={sp.x}
              cy={sp.y}
              r={sp.s * 0.85}
              fill={`url(#${uid}-spark)`}
              opacity="0.7"
            >
              {twinkle}
            </circle>
          );
        }
        const k = sp.s * 1.15;
        return (
          <path
            key={`s-${i}`}
            className="menu-capsule__signin-trail__spark"
            fill={`url(#${uid}-spark)`}
            opacity="0.8"
            d={`M${sp.x} ${sp.y - 1.5 * k} L${sp.x + 0.4 * k} ${sp.y - 0.35 * k} L${sp.x + 1.5 * k} ${sp.y} L${sp.x + 0.4 * k} ${sp.y + 0.35 * k} L${sp.x} ${sp.y + 1.5 * k} L${sp.x - 0.4 * k} ${sp.y + 0.35 * k} L${sp.x - 1.5 * k} ${sp.y} L${sp.x - 0.4 * k} ${sp.y - 0.35 * k}Z`}
          >
            {twinkle}
          </path>
        );
      })}
    </svg>
  );
}


/** Цифровая шестерёнка — насыщенный цвет, объём без белёсого блика. */
function MenuCabinetSettingsGlyph({ className = 'menu-capsule__settings-svg' }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      focusable="false"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${uid}-body`} x1="14%" y1="6%" x2="86%" y2="94%">
          <stop offset="0%" stopColor="#0e7490" />
          <stop offset="28%" stopColor="#06b6d4" />
          <stop offset="52%" stopColor="#7c3aed" />
          <stop offset="76%" stopColor="#c026d3" />
          <stop offset="100%" stopColor="#be185d" />
        </linearGradient>
        <linearGradient id={`${uid}-core`} x1="22%" y1="12%" x2="78%" y2="92%">
          <stop offset="0%" stopColor="#0891b2" />
          <stop offset="50%" stopColor="#9333ea" />
          <stop offset="100%" stopColor="#db2777" />
        </linearGradient>
        <linearGradient id={`${uid}-emboss`} x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.55" />
          <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Тень «низа» — выпуклость */}
      <path
        fill="#1e0538"
        fillRule="evenodd"
        opacity="0.55"
        transform="translate(0 0.7)"
        d="M10.35 2.15h3.3l.42 2.05a7.2 7.2 0 0 1 1.72.71l1.78-.95 2.33 2.33-.95 1.78c.3.53.54 1.11.71 1.72l2.05.42v3.3l-2.05.42a7.2 7.2 0 0 1-.71 1.72l.95 1.78-2.33 2.33-1.78-.95a7.2 7.2 0 0 1-1.72.71l-.42 2.05h-3.3l-.42-2.05a7.2 7.2 0 0 1-1.72-.71l-1.78.95-2.33-2.33.95-1.78a7.2 7.2 0 0 1-.71-1.72L2.15 13.65v-3.3l2.05-.42c.17-.61.41-1.19.71-1.72l-.95-1.78 2.33-2.33 1.78.95c.53-.3 1.11-.54 1.72-.71l.42-2.05ZM12 7.35a4.65 4.65 0 1 0 0 9.3 4.65 4.65 0 0 0 0-9.3Z"
      />
      <path
        fill={`url(#${uid}-body)`}
        fillRule="evenodd"
        d="M10.35 2.15h3.3l.42 2.05a7.2 7.2 0 0 1 1.72.71l1.78-.95 2.33 2.33-.95 1.78c.3.53.54 1.11.71 1.72l2.05.42v3.3l-2.05.42a7.2 7.2 0 0 1-.71 1.72l.95 1.78-2.33 2.33-1.78-.95a7.2 7.2 0 0 1-1.72.71l-.42 2.05h-3.3l-.42-2.05a7.2 7.2 0 0 1-1.72-.71l-1.78.95-2.33-2.33.95-1.78a7.2 7.2 0 0 1-.71-1.72L2.15 13.65v-3.3l2.05-.42c.17-.61.41-1.19.71-1.72l-.95-1.78 2.33-2.33 1.78.95c.53-.3 1.11-.54 1.72-.71l.42-2.05ZM12 7.35a4.65 4.65 0 1 0 0 9.3 4.65 4.65 0 0 0 0-9.3Z"
      />
      {/* Верхний цветной блик (не белый) */}
      <path
        fill={`url(#${uid}-emboss)`}
        fillRule="evenodd"
        opacity="0.55"
        d="M10.35 2.15h3.3l.42 2.05a7.2 7.2 0 0 1 1.72.71l1.78-.95 2.33 2.33-.95 1.78c.3.53.54 1.11.71 1.72l2.05.42v3.3l-2.05.42a7.2 7.2 0 0 1-.71 1.72l.95 1.78-2.33 2.33-1.78-.95a7.2 7.2 0 0 1-1.72.71l-.42 2.05h-3.3l-.42-2.05a7.2 7.2 0 0 1-1.72-.71l-1.78.95-2.33-2.33.95-1.78a7.2 7.2 0 0 1-.71-1.72L2.15 13.65v-3.3l2.05-.42c.17-.61.41-1.19.71-1.72l-.95-1.78 2.33-2.33 1.78.95c.53-.3 1.11-.54 1.72-.71l.42-2.05ZM12 7.35a4.65 4.65 0 1 0 0 9.3 4.65 4.65 0 0 0 0-9.3Z"
      />
      <circle cx="12" cy="12.35" r="2.55" fill="#1e0538" opacity="0.45" />
      <circle cx="12" cy="12" r="2.55" fill={`url(#${uid}-core)`} />
      <circle
        cx="12"
        cy="12"
        r="2.55"
        fill="none"
        stroke="#5b21b6"
        strokeOpacity="0.7"
        strokeWidth="0.75"
      />
    </svg>
  );
}

export type MenuCapsuleButtonProps = {
  variant: MenuCapsuleVariant;
  title: string;
  hint?: string;
  /** Мелкая подпись над title (напр. «Кабинет»). */
  eyebrow?: string;
  /** Справа в шапке от eyebrow (напр. «профиль» / «аккаунт»), через разделитель. */
  eyebrowAside?: string;
  /** ПК-кабинет: шестерёнка сразу после имени (без контейнера, со спином). */
  showSettingsGlyph?: boolean;
  /** ПК: «выйти» справа в вертикальном ободе (модалка через MenuAccountSessionChrome). */
  showTitleSignOut?: boolean;
  /** ПК: текстовая кнопка «Войти» + глиф справа (гость / профиль → AuthModal). */
  showSignInAction?: boolean;
  onSignIn?: () => void;
  /** ПК-кабинет: строка под именем (email / статус). */
  metaLine?: string;
  /** Тон meta-строки. */
  metaTone?: 'email' | 'profile' | 'guest';
  /** ПК-кабинет: модификатор стиля по статусу личности. */
  cabinetIdentity?: 'guest' | 'profile' | 'account';
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
  /** Вместо глифа — аватар профиля. */
  avatarName?: string;
  avatarDataUrl?: string | null;
  /** profile/account: WAVE / online-stamp поверх аватара. */
  identityStatus?: MenuSignedStatus;
  /** Гость: цикл из 4 глифов (как мобильный чип). */
  guestGlyphCycle?: boolean;
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
  eyebrowAside,
  showSettingsGlyph,
  showTitleSignOut,
  showSignInAction,
  onSignIn,
  metaLine,
  metaTone,
  cabinetIdentity,
  disabled,
  href,
  onClick,
  compact,
  avatarName,
  avatarDataUrl,
  identityStatus,
  guestGlyphCycle,
  collapsible,
  collapseId,
}: MenuCapsuleButtonProps) {
  const tUi = useT();
  const requestSignOut = useMenuAccountSignOutRequest();
  const [glyphOnly, setGlyphOnly] = useState(() =>
    collapsible && collapseId ? getMenuCapsuleGlyphOnly(collapseId) : false,
  );
  const settingsTipId = useId().replace(/:/g, '');
  const signOutTipId = useId().replace(/:/g, '');
  const signInActionTipId = useId().replace(/:/g, '');
  const signInMiniTipId = useId().replace(/:/g, '');
  const guestGlyphTipId = useId().replace(/:/g, '');
  const guestTitleTipId = useId().replace(/:/g, '');
  const settingsAnchorRef = useRef<HTMLSpanElement | null>(null);
  const signOutAnchorRef = useRef<HTMLSpanElement | null>(null);
  const signInActionAnchorRef = useRef<HTMLSpanElement | null>(null);
  const signInMiniMailRef = useRef<HTMLSpanElement | null>(null);
  const signInMiniKeyRef = useRef<HTMLSpanElement | null>(null);
  const signInMiniOnlineRef = useRef<HTMLSpanElement | null>(null);
  const signInMiniHistoryRef = useRef<HTMLSpanElement | null>(null);
  const signInMiniRatingRef = useRef<HTMLSpanElement | null>(null);
  const guestGlyphAnchorRef = useRef<HTMLSpanElement | null>(null);
  const guestTitleAnchorRef = useRef<HTMLSpanElement | null>(null);
  const [settingsTipOpen, setSettingsTipOpen] = useState(false);
  const [signOutTipOpen, setSignOutTipOpen] = useState(false);
  const [signInActionTipOpen, setSignInActionTipOpen] = useState(false);
  const [signInMiniTip, setSignInMiniTip] = useState<
    null | 'mail' | 'key' | 'online' | 'history' | 'rating'
  >(null);
  const [guestGlyphTipOpen, setGuestGlyphTipOpen] = useState(false);
  const [guestTitleTipOpen, setGuestTitleTipOpen] = useState(false);

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

  const showEdgeSignOut = Boolean(showTitleSignOut && requestSignOut);
  const showEndRail = Boolean(showSignInAction && onSignIn);

  const className = [
    'menu-capsule',
    `menu-capsule--${variant}`,
    compact ? 'menu-capsule--compact' : '',
    disabled ? 'menu-capsule--disabled' : '',
    avatarName || guestGlyphCycle ? 'menu-capsule--with-avatar' : '',
    guestGlyphCycle ? 'menu-capsule--with-guest-cycle' : '',
    showEndRail ? 'menu-capsule--with-actions' : '',
    showEndRail ? 'menu-capsule--with-signin' : '',
    showEndRail ? 'menu-capsule--split' : '',
    showSettingsGlyph ? 'menu-capsule--with-settings' : '',
    showEdgeSignOut ? 'menu-capsule--with-signout' : '',
    glyphOnly ? 'menu-capsule--glyph-only' : '',
    cabinetIdentity ? `menu-capsule--id-${cabinetIdentity}` : '',
    metaTone ? `menu-capsule--meta-${metaTone}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const glyphSlot = guestGlyphCycle ? (
    <span
      ref={guestGlyphAnchorRef}
      className="menu-capsule__glyph menu-capsule__glyph--avatar menu-capsule__glyph--guest-cycle"
      aria-label={tUi('menu.guestTip')}
      aria-describedby={guestGlyphTipOpen ? guestGlyphTipId : undefined}
      onMouseEnter={() => setGuestGlyphTipOpen(true)}
      onMouseLeave={() => setGuestGlyphTipOpen(false)}
      onFocus={() => setGuestGlyphTipOpen(true)}
      onBlur={() => setGuestGlyphTipOpen(false)}
    >
      <MenuGuestIdentityCycle showMapHint={false} tipTitle={false} className="menu-capsule__guest-cycle" />
      <MenuCapsuleCosmicTip
        open={guestGlyphTipOpen}
        anchorRef={guestGlyphAnchorRef}
        tipId={guestGlyphTipId}
        text={tUi('menu.guestTip')}
        wide
      />
    </span>
  ) : (
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
  );

  const identityBody = (
    <span className="menu-capsule__body">
      {eyebrow || eyebrowAside ? (
        <span className="menu-capsule__eyebrow-row">
          {eyebrow ? <span className="menu-capsule__eyebrow">{eyebrow}</span> : null}
          {eyebrow && eyebrowAside ? (
            <span className="menu-capsule__eyebrow-sep" aria-hidden="true" />
          ) : null}
          {eyebrowAside ? (
            <span className="menu-capsule__eyebrow-aside">{eyebrowAside}</span>
          ) : null}
        </span>
      ) : null}
      <span className="menu-capsule__title-row">
        {cabinetIdentity === 'guest' ? (
          <span
            ref={guestTitleAnchorRef}
            className="menu-capsule__title menu-capsule__title--guest"
            aria-label={tUi('menu.cabinetGuestTitleTip')}
            aria-describedby={guestTitleTipOpen ? guestTitleTipId : undefined}
            onMouseEnter={() => setGuestTitleTipOpen(true)}
            onMouseLeave={() => setGuestTitleTipOpen(false)}
            onFocus={() => setGuestTitleTipOpen(true)}
            onBlur={() => setGuestTitleTipOpen(false)}
          >
            {title}
            <MenuCapsuleCosmicTip
              open={guestTitleTipOpen}
              anchorRef={guestTitleAnchorRef}
              tipId={guestTitleTipId}
              text={tUi('menu.cabinetGuestTitleTip')}
            />
          </span>
        ) : (
          <span className="menu-capsule__title">{title}</span>
        )}
        {showSettingsGlyph ? (
          <span
            ref={settingsAnchorRef}
            className="menu-capsule__title-settings"
            aria-label={tUi('menu.cabinetSettingsTip')}
            aria-describedby={settingsTipOpen ? settingsTipId : undefined}
            onMouseEnter={() => setSettingsTipOpen(true)}
            onMouseLeave={() => setSettingsTipOpen(false)}
          >
            <MenuCabinetSettingsGlyph className="menu-capsule__title-settings-svg" />
            <MenuCapsuleCosmicTip
              open={settingsTipOpen}
              anchorRef={settingsAnchorRef}
              tipId={settingsTipId}
              text={tUi('menu.cabinetSettingsTip')}
              preferBelow
            />
          </span>
        ) : null}
      </span>
      {metaLine ? (
        <span
          className={[
            'menu-capsule__meta',
            metaTone ? `menu-capsule__meta--${metaTone}` : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {metaTone === 'email' ? (
            <span className="menu-capsule__meta-pulse" aria-hidden="true" />
          ) : (
            <span className="menu-capsule__meta-mark" aria-hidden="true" />
          )}
          <span className="menu-capsule__meta-text">{metaLine}</span>
        </span>
      ) : null}
      {hint ? <span className="menu-capsule__hint">{hint}</span> : null}
    </span>
  );

  const endRail = showEndRail ? (
    <span
      ref={signInActionAnchorRef}
      role="button"
      tabIndex={0}
      className={[
        'menu-capsule__rail',
        'menu-capsule__rail--end',
        'menu-capsule__half',
        'menu-capsule__half--end',
        signInMiniTip ? 'menu-capsule__rail--end--over-mini' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={tUi('menu.accountSignInAria')}
      aria-describedby={
        signInActionTipOpen && !signInMiniTip ? signInActionTipId : undefined
      }
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setSignInActionTipOpen(false);
        setSignInMiniTip(null);
        onSignIn?.();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        setSignInActionTipOpen(false);
        setSignInMiniTip(null);
        onSignIn?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => setSignInActionTipOpen(true)}
      onMouseLeave={() => {
        setSignInActionTipOpen(false);
        setSignInMiniTip(null);
      }}
      onFocus={() => setSignInActionTipOpen(true)}
      onBlur={() => {
        setSignInActionTipOpen(false);
        setSignInMiniTip(null);
      }}
    >
      <span className="menu-capsule__signin-trail" aria-hidden="true">
        <MenuSignInSparkTrail />
      </span>
      <span className="menu-capsule__action-copy">
        <span className="menu-capsule__action menu-capsule__action--primary">
          {tUi('menu.cabinetSignInAction')}
        </span>
        <span className="menu-capsule__action-arrow" aria-hidden="true">
          <MenuSignInMidArrow />
        </span>
        <span className="menu-capsule__action-foot">
          <span className="menu-capsule__action menu-capsule__action--sub">
            {tUi('menu.cabinetSignInActionSub')}
          </span>
          <span className="menu-capsule__action-minis">
            {(
              [
                {
                  id: 'mail' as const,
                  ref: signInMiniMailRef,
                  tip: 'menu.cabinetSignInMiniMailTip' as const,
                  Glyph: MenuSignInMiniMail,
                },
                {
                  id: 'key' as const,
                  ref: signInMiniKeyRef,
                  tip: 'menu.cabinetSignInMiniKeyTip' as const,
                  Glyph: MenuSignInMiniKey,
                },
                {
                  id: 'online' as const,
                  ref: signInMiniOnlineRef,
                  tip: 'menu.cabinetSignInMiniOnlineTip' as const,
                  Glyph: MenuSignInMiniOnline,
                },
                {
                  id: 'history' as const,
                  ref: signInMiniHistoryRef,
                  tip: 'menu.cabinetSignInMiniHistoryTip' as const,
                  Glyph: MenuSignInMiniHistory,
                },
                {
                  id: 'rating' as const,
                  ref: signInMiniRatingRef,
                  tip: 'menu.cabinetSignInMiniRatingTip' as const,
                  Glyph: MenuSignInMiniRating,
                },
              ] as const
            ).map(({ id, ref, tip, Glyph }) => {
              const tipDomId = `${signInMiniTipId}-${id}`;
              const open = signInMiniTip === id;
              return (
                <span
                  key={id}
                  ref={ref}
                  className="menu-capsule__action-mini"
                  aria-label={tUi(tip)}
                  aria-describedby={open ? tipDomId : undefined}
                  onMouseEnter={() => setSignInMiniTip(id)}
                  onMouseLeave={() => setSignInMiniTip(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Glyph />
                  <MenuCapsuleCosmicTip
                    open={open}
                    anchorRef={ref}
                    tipId={tipDomId}
                    text={tUi(tip)}
                    preferBelow
                  />
                </span>
              );
            })}
          </span>
        </span>
      </span>
      <MenuSignInConnectFlash />
      <span className="menu-capsule__signin-flow">
        <span className="menu-capsule__glyph menu-capsule__glyph--signin">
          <span className="menu-capsule__signin">
            <MenuEdgeSignInGlyph />
            <span className="menu-capsule__signin-glass" />
            <MenuSignInPeakBurst />
          </span>
        </span>
      </span>
      <MenuCapsuleCosmicTip
        open={signInActionTipOpen && !signInMiniTip}
        anchorRef={signInActionAnchorRef}
        tipId={signInActionTipId}
        text={tUi('menu.cabinetSignInActionTip')}
        detail={tUi('menu.cabinetSignInActionTipDetail')}
        wide
      />
    </span>
  ) : null;

  const body = showEndRail ? (
    <>
      <span className="menu-capsule__half menu-capsule__half--start">
        {glyphSlot}
        {identityBody}
      </span>
      <span className="menu-capsule__seam" aria-hidden="true">
        <span className="menu-capsule__seam__lane menu-capsule__seam__lane--side">
          <span className="menu-capsule__seam__track" />
        </span>
        <span className="menu-capsule__seam__lane menu-capsule__seam__lane--mid">
          <span className="menu-capsule__seam__track" />
          <span className="menu-capsule__seam__scan" />
          <span className="menu-capsule__seam__node">
            <span className="menu-capsule__seam__node-ring" />
            <span className="menu-capsule__seam__node-core" />
          </span>
        </span>
        <span className="menu-capsule__seam__lane menu-capsule__seam__lane--side">
          <span className="menu-capsule__seam__track" />
        </span>
      </span>
      {endRail}
    </>
  ) : (
    <>
      {glyphSlot}
      {identityBody}
      {showEdgeSignOut ? (
        <span
          ref={signOutAnchorRef}
          role="button"
          tabIndex={0}
          className="menu-capsule__glyph menu-capsule__glyph--signout"
          aria-label={tUi('menu.accountSignOutAria')}
          aria-describedby={signOutTipOpen ? signOutTipId : undefined}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSignOutTipOpen(false);
            requestSignOut?.();
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            e.stopPropagation();
            setSignOutTipOpen(false);
            requestSignOut?.();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseEnter={() => setSignOutTipOpen(true)}
          onMouseLeave={() => setSignOutTipOpen(false)}
          onFocus={() => setSignOutTipOpen(true)}
          onBlur={() => setSignOutTipOpen(false)}
        >
          <span className="menu-capsule__signout">
            <MenuEdgeSignOutGlyph />
            <span className="menu-capsule__signout-glass" />
          </span>
          <MenuCapsuleCosmicTip
            open={signOutTipOpen}
            anchorRef={signOutAnchorRef}
            tipId={signOutTipId}
            text={tUi('menu.accountSignOutTip')}
          />
        </span>
      ) : null}
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
