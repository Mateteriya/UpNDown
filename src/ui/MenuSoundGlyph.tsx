import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { subscribeAudioSettings } from '../audio';
import {
  getMenuSoundGlyphId,
  MENU_SOUND_GLYPH_IDS,
  MENU_SOUND_GLYPH_META,
  subscribeMenuSoundGlyph,
  type MenuSoundGlyphId,
} from '../lib/menuSoundGlyph';
import { audioSettingsAreAudible } from './AudioSettingsPanel';
import '../styles/menu-sound-glyph.css';

type GlyphProps = {
  muted?: boolean;
  gradId: string;
};

function PulseOrb({ muted, gradId }: GlyphProps) {
  return (
    <svg className="menu-sound-glyph__svg" viewBox="0 0 24 24" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-a`} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#5eead4" />
          <stop offset="40%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <radialGradient id={`${gradId}-c`} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#c084fc" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#6d28d9" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#2e1065" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill={`url(#${gradId}-c)`} opacity="0.42" />
      <path
        d="M10.2 7.2 6.4 10.2H4.2v3.6h2.2l3.8 3V7.2Z"
        fill={`url(#${gradId}-a)`}
        stroke="#67e8f9"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M14.2 9.2 19 14M19 9.2l-4.8 4.8" stroke="#fb7185" strokeWidth="1.65" strokeLinecap="round" />
      ) : (
        <>
          <path
            d="M14.6 9a3.6 3.6 0 0 1 0 6"
            fill="none"
            stroke={`url(#${gradId}-a)`}
            strokeWidth="1.65"
            strokeLinecap="round"
          />
          <path
            d="M16.8 7.2a6.2 6.2 0 0 1 0 9.6"
            fill="none"
            stroke="#c084fc"
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.95"
          />
          <circle cx="19.2" cy="12" r="1.15" fill="#22d3ee" className="menu-sound-glyph__pulse" />
        </>
      )}
    </svg>
  );
}

function NebulaHorn({ muted, gradId }: GlyphProps) {
  return (
    <svg className="menu-sound-glyph__svg" viewBox="0 0 24 24" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-a`} x1="0%" y1="20%" x2="100%" y2="80%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="40%" stopColor="#e879f9" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
      </defs>
      <ellipse cx="12" cy="12" rx="10" ry="9.4" fill="rgba(76,29,149,0.35)" />
      <path
        d="M5.2 10.4c2.2-1.4 4.6-2.8 7.4-3.1 1.4-.1 2.6.9 2.8 2.2l.5 4.2c.2 1.4-.8 2.7-2.2 3-.9.2-1.9.1-2.8-.2L5.2 13.6v-3.2Z"
        fill={`url(#${gradId}-a)`}
        opacity="0.92"
      />
      <path
        d="M8.2 11.2h2.4M8.6 13h3.2"
        stroke="#0f172a"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.35"
      />
      {muted ? (
        <path d="M16.2 8.6 20 14M20 8.6l-3.8 5.4" stroke="#fda4af" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path
            d="M16.4 8.8c1.8 1.1 2.8 2.6 2.8 4.4s-1 3.3-2.8 4.4"
            fill="none"
            stroke={`url(#${gradId}-a)`}
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M18.6 7.2c2.4 1.5 3.7 3.5 3.7 5.9s-1.3 4.4-3.7 5.9"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.75"
          />
        </>
      )}
    </svg>
  );
}

function CrystalWave({ muted, gradId }: GlyphProps) {
  return (
    <svg className="menu-sound-glyph__svg" viewBox="0 0 24 24" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-a`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <path
        d="M12 3.4 16.6 9.2 12 20.6 7.4 9.2Z"
        fill={`url(#${gradId}-a)`}
        stroke="#f5d0fe"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path d="M12 3.4 12 20.6" stroke="rgba(255,255,255,0.35)" strokeWidth="0.7" />
      <path d="M7.4 9.2h9.2" stroke="rgba(15,23,42,0.25)" strokeWidth="0.8" />
      {muted ? (
        <path d="M17.2 7.5 20.4 16M20.4 7.5 17.2 16" stroke="#fda4af" strokeWidth="1.45" strokeLinecap="round" />
      ) : (
        <>
          <path
            d="M17 8.2c1.5 1.3 2.3 2.8 2.3 4.5S18.5 15.9 17 17.2"
            fill="none"
            stroke="#67e8f9"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M19.2 6.6c2 1.6 3.1 3.6 3.1 6.1s-1.1 4.5-3.1 6.1"
            fill="none"
            stroke="#e879f9"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.8"
          />
        </>
      )}
    </svg>
  );
}

function SatelliteBeep({ muted, gradId }: GlyphProps) {
  return (
    <svg className="menu-sound-glyph__svg" viewBox="0 0 24 24" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-a`} x1="15%" y1="10%" x2="90%" y2="90%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9.8" fill="rgba(30,10,58,0.55)" stroke={`url(#${gradId}-a)`} strokeWidth="0.7" />
      <path
        d="M7.2 14.8c2.6-4.4 6.2-6.8 9.8-7.6"
        fill="none"
        stroke={`url(#${gradId}-a)`}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17.2" cy="7.1" r="1.7" fill="#67e8f9" stroke="#f5d0fe" strokeWidth="0.5" />
      <circle cx="7.4" cy="15" r="1.25" fill="#c084fc" />
      {muted ? (
        <path d="M9.5 8.2 15.8 16M15.8 8.2 9.5 16" stroke="#fda4af" strokeWidth="1.5" strokeLinecap="round" />
      ) : (
        <>
          <path
            d="M14.2 9.4c1.1.9 1.8 2 1.8 3.3"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <path
            d="M12.6 10.2c1.6 1.2 2.6 2.7 2.6 4.5"
            fill="none"
            stroke="#e879f9"
            strokeWidth="1.15"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle cx="16.6" cy="13.4" r="0.85" fill="#fbbf24" className="menu-sound-glyph__pulse" />
        </>
      )}
    </svg>
  );
}

function AuroraBars({ muted, gradId }: GlyphProps) {
  return (
    <svg className="menu-sound-glyph__svg" viewBox="0 0 24 24" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-a`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle
        cx="12"
        cy="12"
        r="9.6"
        fill="rgba(15,6,36,0.65)"
        stroke={`url(#${gradId}-a)`}
        strokeWidth="1.1"
      />
      {muted ? (
        <>
          <rect x="8.2" y="11" width="1.7" height="3.2" rx="0.7" fill="#94a3b8" opacity="0.55" />
          <rect x="11.1" y="9.6" width="1.7" height="5.8" rx="0.7" fill="#94a3b8" opacity="0.45" />
          <rect x="14" y="10.6" width="1.7" height="4" rx="0.7" fill="#94a3b8" opacity="0.5" />
          <path d="M7.6 7.8 16.4 16.6" stroke="#fda4af" strokeWidth="1.55" strokeLinecap="round" />
        </>
      ) : (
        <>
          <rect
            x="7.6"
            y="10.2"
            width="1.8"
            height="5.2"
            rx="0.8"
            fill="#67e8f9"
            className="menu-sound-glyph__bar menu-sound-glyph__bar--a"
          />
          <rect
            x="11.1"
            y="7.6"
            width="1.8"
            height="8.4"
            rx="0.8"
            fill="#e879f9"
            className="menu-sound-glyph__bar menu-sound-glyph__bar--b"
          />
          <rect
            x="14.6"
            y="9"
            width="1.8"
            height="6.4"
            rx="0.8"
            fill="#fbbf24"
            className="menu-sound-glyph__bar menu-sound-glyph__bar--c"
          />
        </>
      )}
    </svg>
  );
}

const GLYPHS: Record<MenuSoundGlyphId, (p: GlyphProps) => ReactElement> = {
  'pulse-orb': PulseOrb,
  'nebula-horn': NebulaHorn,
  'crystal-wave': CrystalWave,
  'satellite-beep': SatelliteBeep,
  'aurora-bars': AuroraBars,
};

export function MenuSoundGlyph({
  id,
  muted = false,
  gradId,
}: {
  id: MenuSoundGlyphId;
  muted?: boolean;
  gradId: string;
}) {
  const Glyph = GLYPHS[id] ?? PulseOrb;
  return (
    <span className={['menu-sound-glyph', muted ? 'menu-sound-glyph--muted' : ''].filter(Boolean).join(' ')}>
      <Glyph muted={muted} gradId={gradId} />
    </span>
  );
}

/** Кнопка-триггер для AudioSettingsPanel.renderToggle (мобилка / ПК). */
export function MenuSoundGlyphToggle({
  open,
  panelId,
  onToggle,
  title,
  label,
  variant = 'mobile',
  onLongPressStudio,
}: {
  open: boolean;
  panelId: string;
  onToggle: () => void;
  title: string;
  /** Подпись (ПК); на мобилке не нужна. */
  label?: string;
  variant?: 'mobile' | 'pc';
  /** Долгий тап (~1.1с) → музыкальная студия (секрет). */
  onLongPressStudio?: () => void;
}) {
  const [glyphId, setGlyphId] = useState<MenuSoundGlyphId>(() => getMenuSoundGlyphId());
  const [muted, setMuted] = useState(() => !audioSettingsAreAudible());
  const gradId = `msg-${useId().replace(/:/g, '')}`;
  const longPressFired = useRef(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => subscribeMenuSoundGlyph(setGlyphId), []);
  useEffect(
    () =>
      subscribeAudioSettings((s) => {
        setMuted(!audioSettingsAreAudible(s));
      }),
    [],
  );

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <button
      type="button"
      className={[
        'menu-sound-btn',
        variant === 'pc' ? 'menu-sound-btn--pc' : '',
        open ? 'menu-sound-btn--open' : '',
        muted ? 'menu-sound-btn--muted' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-label={title}
      title={title}
      onPointerDown={(e) => {
        if (e.button !== 0 || !onLongPressStudio) return;
        longPressFired.current = false;
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true;
          longPressTimer.current = null;
          onLongPressStudio();
        }, 1100);
      }}
      onPointerUp={clearLongPress}
      onPointerLeave={clearLongPress}
      onPointerCancel={clearLongPress}
      onClick={() => {
        if (longPressFired.current) {
          longPressFired.current = false;
          return;
        }
        onToggle();
      }}
    >
      <span className="menu-sound-btn__rim" aria-hidden />
      <span className="menu-sound-btn__glow" aria-hidden />
      <MenuSoundGlyph id={glyphId} muted={muted} gradId={gradId} />
      {label ? (
        <span className="menu-sound-btn__label" aria-hidden>
          {label}
        </span>
      ) : null}
    </button>
  );
}

export { MENU_SOUND_GLYPH_IDS, MENU_SOUND_GLYPH_META };
