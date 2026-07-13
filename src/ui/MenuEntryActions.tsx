import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { MENU_OFFLINE_LEGEND_ART_URL, MENU_ONLINE_LEGEND_ART_URL } from '../lib/menuAssets';

const MODE_LEGEND_AUTO_CLOSE_MS = 25000;
const MODE_LEGEND_ART_COMPACT_DELAY_MS = 2600;

const MODE_LEGENDS = {
  online: {
    kicker: 'Космический зал',
    title: 'Онлайн',
    body: 'Живые партии через комнаты и лобби: создавайте столы, подключайтесь к друзьям, играйте в общем зале. Рейтинг и прогресс сохраняются, когда вы в аккаунте.',
    artUrl: MENU_ONLINE_LEGEND_ART_URL,
  },
  offline: {
    kicker: 'Экипаж ИИ',
    title: 'Офлайн',
    body: 'Игра на вашем устройстве без сети: быстрый старт против ботов, настройка сложности ИИ и продолжение сохранённой партии в любой момент.',
    artUrl: MENU_OFFLINE_LEGEND_ART_URL,
  },
} as const;

function useModeLegendAutoClose() {
  const [legendOpen, setLegendOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeLegend = useCallback(() => {
    setLegendOpen(false);
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const toggleLegend = useCallback(() => {
    setLegendOpen((open) => {
      if (open) {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        return false;
      }
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      closeTimerRef.current = setTimeout(() => {
        setLegendOpen(false);
        closeTimerRef.current = null;
      }, MODE_LEGEND_AUTO_CLOSE_MS);
      return true;
    });
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  return { legendOpen, toggleLegend, closeLegend };
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
  | 'training'
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
          <stop offset="0%" stopColor="#fef9c3" />
          <stop offset="28%" stopColor="#67e8f9" />
          <stop offset="62%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#6d28d9" />
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
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M30 14a12 12 0 1 0 2.4 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path d="M30 8v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="14,22 22,16 22,20 28,20 28,24 22,24 22,28" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function GlyphMenuNewSession() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M10 28 V16 a4 4 0 0 1 4-4 h16 a4 4 0 0 1 4 4 v12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.55"
      />
      <path d="M8 28 h28" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45" />
      <circle cx="22" cy="20" r="7" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.75" />
      <path d="M22 16 v8 M18 20 h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path
        className="menu-capsule-glyph-orbit menu-capsule-glyph-orbit--a"
        d="M22 8 v4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path d="M17 10 l5-3 5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <circle cx="30" cy="12" r="1.8" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function GlyphMenuNewParty() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="11" y="14" width="12" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.55" transform="rotate(-12 17 22)" />
      <rect x="21" y="12" width="12" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" transform="rotate(10 27 20)" />
      <path d="M15 18 h4 M26 17 h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
      <path
        d="M22 7 l1.6 4.8 4.9.4-3.7 3.2 1.1 4.8-3.9-2.3-3.9 2.3 1.1-4.8-3.7-3.2 4.9-.4z"
        fill="currentColor"
        opacity="0.88"
      />
      <circle cx="22" cy="30" r="2.2" fill="currentColor" opacity="0.75" />
      <path d="M22 32 v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
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

function GlyphMenuTraining() {
  return (
    <svg className="menu-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 6l2.5 7.5H32l-6 4.5 2.5 7.5L22 24l-6.5 1.5 2.5-7.5-6-4.5h7.5z" fill="currentColor" opacity="0.35" />
      <rect x="12" y="26" width="20" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 30h12M16 33h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="22" cy="22" r="3" fill="currentColor" opacity="0.9" />
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
  training: <GlyphMenuTraining />,
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
  disabled?: boolean;
  href?: string;
  onClick?: () => void;
  compact?: boolean;
};

export function MenuCapsuleButton({
  variant,
  title,
  hint,
  disabled,
  href,
  onClick,
  compact,
}: MenuCapsuleButtonProps) {
  const className = [
    'menu-capsule',
    `menu-capsule--${variant}`,
    compact ? 'menu-capsule--compact' : '',
    disabled ? 'menu-capsule--disabled' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <>
      <span className="menu-capsule__glyph">{GLYPHS[variant]}</span>
      <span className="menu-capsule__body">
        <span className="menu-capsule__title">{title}</span>
        {hint ? <span className="menu-capsule__hint">{hint}</span> : null}
      </span>
    </>
  );

  if (href && !disabled) {
    return (
      <a className={className} href={href}>
        {body}
      </a>
    );
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {body}
    </button>
  );
}

export type MenuPlaySplitCapsuleProps = {
  mode: 'online' | 'offline';
  canResume: boolean;
  satelliteCode?: string | null;
  onResume: () => void;
  onMain: () => void;
};

type SplitCapsuleTone = 'resumeOnline' | 'resumeOffline' | 'actionOnline' | 'actionOffline';

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

function ModeLabelSmileArc({ mode, modeLabel }: { mode: 'online' | 'offline'; modeLabel: string }) {
  const uid = useId().replace(/:/g, '');
  const pathId = `${uid}-path`;
  const fillId = `${uid}-fill`;
  const label = modeLabel.toLocaleUpperCase('ru-RU');

  return (
    <svg
      className={`menu-split-capsule__mode-arc menu-split-capsule__mode-arc--${mode}`}
      viewBox="0 21 100 11"
      preserveAspectRatio="xMidYMin meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <path id={pathId} d="M 14,22 A 34,34 0 0,0 86,22" fill="none" />
        {mode === 'online' ? (
          <linearGradient id={fillId} x1="8%" y1="0%" x2="92%" y2="0%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="14%" stopColor="#e0f2fe" />
            <stop offset="28%" stopColor="#67e8f9" />
            <stop offset="42%" stopColor="#e9d5ff" />
            <stop offset="54%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="66%" stopColor="#f472b6" />
            <stop offset="80%" stopColor="#fcd34d" />
            <stop offset="100%" stopColor="#fef08a" />
          </linearGradient>
        ) : (
          <linearGradient id={fillId} x1="8%" y1="0%" x2="92%" y2="0%">
            <stop offset="0%" stopColor="#6ee7b7" />
            <stop offset="16%" stopColor="#ccfbf1" />
            <stop offset="32%" stopColor="#2dd4bf" />
            <stop offset="48%" stopColor="#ffffff" stopOpacity="0.92" />
            <stop offset="62%" stopColor="#22d3ee" />
            <stop offset="78%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#a7f3d0" />
          </linearGradient>
        )}
      </defs>
      <text
        className={`menu-split-capsule__mode-arc-text menu-split-capsule__mode-arc-text--${mode}`}
        fill={`url(#${fillId})`}
      >
        <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
          {label}
        </textPath>
      </text>
    </svg>
  );
}

function ModeLegendPanel({
  mode,
  panelId,
  legendOpen,
  onClose,
}: {
  mode: 'online' | 'offline';
  panelId: string;
  legendOpen: boolean;
  onClose: () => void;
}) {
  const legend = MODE_LEGENDS[mode];
  const { artExpanded, expandArt } = useLegendArtCompact(legendOpen);

  return (
    <div className={`menu-split-capsule__legend menu-split-capsule__legend--${mode}`} id={panelId}>
      <div className="menu-split-capsule__legend-inner">
        <div className="menu-split-capsule__legend-shimmer" aria-hidden="true" />
        <button
          type="button"
          className="menu-split-capsule__legend-close"
          onClick={onClose}
          aria-label="Свернуть легенду"
        >
          <span aria-hidden="true">×</span>
        </button>
        <p className="menu-split-capsule__legend-kicker">{legend.kicker}</p>
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
            aria-label={artExpanded ? 'Иллюстрация режима' : 'Увеличить иллюстрацию'}
          >
            <img
              className="menu-split-capsule__legend-art"
              src={legend.artUrl}
              alt=""
              decoding="async"
              draggable={false}
            />
          </button>
          <h3 className="menu-split-capsule__legend-title">{legend.title}</h3>
        </div>
        <p className="menu-split-capsule__legend-body">{legend.body}</p>
        <button
          type="button"
          className="menu-split-capsule__legend-collapse"
          onClick={onClose}
        >
          Свернуть
        </button>
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
}: {
  mode: 'online' | 'offline';
  modeLabel: string;
  glyph: ReactNode;
  legendOpen: boolean;
  onGlyphClick: () => void;
  legendPanelId: string;
}) {
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
              aria-expanded={legendOpen}
              aria-controls={legendPanelId}
              aria-label={legendOpen ? `Свернуть легенду «${modeLabel}»` : `Что такое «${modeLabel}»`}
            >
              {glyph}
            </button>
            <ModeLabelSmileArc mode={mode} modeLabel={modeLabel} />
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
}: MenuPlaySplitCapsuleProps) {
  const mainVariant: MenuCapsuleVariant = mode === 'online' ? 'online' : 'offline';
  const resumeVariant: MenuCapsuleVariant = mode === 'online' ? 'resumeOnline' : 'resumeOffline';
  const modeLabel = mode === 'online' ? 'Онлайн' : 'Офлайн';
  const { legendOpen, toggleLegend, closeLegend } = useModeLegendAutoClose();
  const legendPanelId = useId();

  const rootClassName = [
    'menu-split-capsule',
    'menu-split-capsule--b4',
    `menu-split-capsule--${mode}`,
    legendOpen ? 'menu-split-capsule--legend-open' : '',
    canResume ? '' : 'menu-split-capsule--solo',
  ]
    .filter(Boolean)
    .join(' ');

  if (!canResume) {
    const soloTitle = mode === 'online' ? 'Онлайн' : 'Офлайн против ИИ';
    const soloHint = mode === 'online' ? 'комнаты и зал столов' : 'быстрый старт';

    return (
      <div className={rootClassName}>
        <div className="menu-split-capsule__shell">
          <button type="button" className="menu-split-capsule__solo-action" onClick={onMain}>
            <span className="menu-split-capsule__solo-spacer" aria-hidden="true" />
            <span className="menu-split-capsule__solo-body">
              <span className="menu-split-capsule__title">{soloTitle}</span>
              <span className="menu-split-capsule__hint">{soloHint}</span>
            </span>
            <span className="menu-split-capsule__solo-spacer" aria-hidden="true" />
          </button>
          <ModeLegendPanel mode={mode} panelId={legendPanelId} legendOpen={legendOpen} onClose={closeLegend} />
          <SplitCapsuleModeCrest
            mode={mode}
            modeLabel={modeLabel}
            glyph={GLYPHS[mainVariant]}
            legendOpen={legendOpen}
            onGlyphClick={toggleLegend}
            legendPanelId={legendPanelId}
          />
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
        <div className="menu-split-capsule__actions">
          <SplitCapsuleHalf
            side="main"
            tone={actionTone}
            glyph={GLYPHS[mode === 'online' ? 'newOnline' : 'newOffline']}
            title={mode === 'online' ? 'Новая сессия' : 'Новая партия'}
            hint={mode === 'online' ? 'Комнаты и лобби' : 'против ИИ'}
            onClick={onMain}
          />
          <span className="menu-split-capsule__beam" aria-hidden="true" />
          <SplitCapsuleHalf
            side="resume"
            tone={resumeTone}
            glyph={GLYPHS[resumeVariant]}
            title="Продолжить"
            hint={mode === 'online' ? 'в партию' : 'сохранено'}
            satelliteCode={satelliteCode}
            onClick={onResume}
          />
        </div>
        <ModeLegendPanel mode={mode} panelId={legendPanelId} legendOpen={legendOpen} onClose={closeLegend} />
        <SplitCapsuleModeCrest
          mode={mode}
          modeLabel={modeLabel}
          glyph={GLYPHS[mainVariant]}
          legendOpen={legendOpen}
          onGlyphClick={toggleLegend}
          legendPanelId={legendPanelId}
        />
      </div>
    </div>
  );
}

export type MenuSectionProps = {
  label: string;
  children: ReactNode;
  compact?: boolean;
};

export function MenuSection({ label, children, compact }: MenuSectionProps) {
  return (
    <section
      className={['menu-screen__section', compact ? 'menu-screen__section--compact' : '']
        .filter(Boolean)
        .join(' ')}
    >
      <h2 className="menu-screen__section-label">{label}</h2>
      <div className="menu-screen__section-body">{children}</div>
    </section>
  );
}
