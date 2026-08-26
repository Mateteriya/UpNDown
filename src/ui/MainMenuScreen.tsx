/**
 * Главное меню — космические капсулы в стиле онлайн-лобби.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import {
  advanceMenuPcCast,
  getMenuPcCastUrlAt,
  isMenuPcCastPinned,
  preloadMenuPcCastUrl,
  resolveMenuCastDisplayUrl,
  setMenuPcCastPinned,
  takeMenuPcCastForMenuVisit,
  type MenuPcCastPick,
} from '../lib/menuAssets';
import { getMenuSectionGlyphsOnly, setMenuSectionGlyphsOnly, hasSeenSoloMapHint, markSoloMapHintSeen } from '../lib/menuSectionPrefs';
import { MenuCapsuleButton, MenuPlaySplitCapsule, MenuSection } from './MenuEntryActions';
import { SupportMenuButton } from './SupportMenuButton';
import { MenuPcDrift } from './MenuPcDrift';
import { PlayerAvatar } from './PlayerAvatar';
import { MenuGuestIdentityCycle } from './MenuGuestIdentityCycle';
import { MenuSignedIdentityMark } from './MenuSignedIdentityMark';
import {
  getMenuIdentityStatus,
  MENU_IDENTITY_STATUS_ARIA,
} from '../lib/menuIdentityStatus';
import { OfflineReadyOrb } from './OfflineReadyOrb';
import { MenuGlassLadder } from './MenuGlassLadder';
import { AudioSettingsPanel } from './AudioSettingsPanel';

const PC_MENU_MQ = '(min-width: 1025px)';
/** Редкий автосвайп каста, пока сидят на главной. */
const PC_CAST_AUTO_MS = 75_000;
const PC_CAST_FADE_MS = 900;

function CastLockGlyph({ locked }: { locked: boolean }) {
  return (
    <svg className="menu-screen__pc-cast-nav-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
      {locked ? (
        <>
          <path
            d="M8 11V8.2A4 4 0 0 1 12 4a4 4 0 0 1 4 4.2V11"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <rect
            x="6"
            y="11"
            width="12"
            height="9"
            rx="2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="12" cy="15.2" r="1.15" fill="currentColor" />
        </>
      ) : (
        <>
          <path
            d="M8 11V8.2A4 4 0 0 1 12 4a4 4 0 0 1 3.85 3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <rect
            x="6"
            y="11"
            width="12"
            height="9"
            rx="2.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <circle cx="12" cy="15.2" r="1.15" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export type MainMenuScreenProps = {
  displayName: string;
  avatarDataUrl?: string | null;
  avatarBgColor?: string | null;
  userEmail?: string | null;
  devMode: boolean;
  canResumeOnline: boolean;
  hasSavedOffline: boolean;
  lastPartyCode: string | null;
  onlineResumeMessage: string | null;
  onTitleDevMode?: () => void;
  onOpenAccount: () => void;
  onOpenSupport?: () => void;
  /** Мобилка: под «Поддержать» — таблица лидеров. */
  onOpenRating?: () => void;
  onResumeOnline: () => void;
  onOpenOnline: () => void;
  onResumeOffline: () => void;
  onOfflinePlay: () => void;
  onOpenRules: () => void;
};

export function MainMenuScreen({
  displayName,
  avatarDataUrl,
  avatarBgColor,
  userEmail,
  devMode,
  canResumeOnline,
  hasSavedOffline,
  lastPartyCode,
  onlineResumeMessage,
  onTitleDevMode,
  onOpenAccount,
  onOpenSupport,
  onOpenRating,
  onResumeOnline,
  onOpenOnline,
  onResumeOffline,
  onOfflinePlay,
  onOpenRules,
}: MainMenuScreenProps) {
  const signedIn = Boolean(userEmail);
  const identityStatus = getMenuIdentityStatus({
    displayName,
    avatarDataUrl,
    userEmail,
  });
  const isGuestIdentity = identityStatus === 'guest';
  const isProfileIdentity = identityStatus === 'profile';
  const isAccountIdentity = identityStatus === 'account';
  /** ПК vs мобилка (layout); каст грузится на обеих. */
  const [isPcMenu, setIsPcMenu] = useState(false);
  const [playGlyphsOnly, setPlayGlyphsOnly] = useState(() => getMenuSectionGlyphsOnly('play'));
  /** «полный вид» через ~7.5 с слегка потухает, чтобы не мешать. */
  const [glyphsToggleDimmed, setGlyphsToggleDimmed] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [showGuestMapHint, setShowGuestMapHint] = useState(() => !hasSeenSoloMapHint('guest'));
  const [pcCastUrl, setPcCastUrl] = useState<string | null>(null);
  const [pcCastPrevUrl, setPcCastPrevUrl] = useState<string | null>(null);
  const [pcCastFading, setPcCastFading] = useState(false);
  const [castPinned, setCastPinned] = useState(() => isMenuPcCastPinned());
  const [castPinConfirmOpen, setCastPinConfirmOpen] = useState(false);
  const pcCastUrlRef = useRef<string | null>(null);
  /** Исходный URL кадра (до mobile resize) — для сравнения смены и prefetch. */
  const pcCastSourceUrlRef = useRef<string | null>(null);
  const castApplyGenRef = useRef(0);
  const castFadeTimerRef = useRef<number | null>(null);
  const castPinConfirmRef = useRef<HTMLDivElement | null>(null);
  const castPinBtnRef = useRef<HTMLButtonElement | null>(null);
  const accountBtnRef = useRef<HTMLButtonElement | null>(null);

  const clearCastFadeTimer = useCallback(() => {
    if (castFadeTimerRef.current != null) {
      window.clearTimeout(castFadeTimerRef.current);
      castFadeTimerRef.current = null;
    }
  }, []);

  const togglePlayGlyphsOnly = useCallback(() => {
    setPlayGlyphsOnly((on) => {
      const next = !on;
      setMenuSectionGlyphsOnly('play', next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!playGlyphsOnly) {
      setGlyphsToggleDimmed(false);
      return;
    }
    setGlyphsToggleDimmed(false);
    const id = window.setTimeout(() => setGlyphsToggleDimmed(true), 7500);
    return () => window.clearTimeout(id);
  }, [playGlyphsOnly]);

  const dismissGuestMapHint = useCallback(() => {
    if (!isGuestIdentity || !showGuestMapHint) return;
    markSoloMapHintSeen('guest');
    setShowGuestMapHint(false);
  }, [isGuestIdentity, showGuestMapHint]);

  const onAccountChipClick = useCallback(() => {
    dismissGuestMapHint();
    if (isPcMenu) {
      onOpenAccount();
      return;
    }
    setAccountExpanded((open) => !open);
  }, [dismissGuestMapHint, isPcMenu, onOpenAccount]);

  const onAccountEnterClick = useCallback(
    (e: MouseEvent | ReactKeyboardEvent) => {
      e.stopPropagation();
      dismissGuestMapHint();
      onOpenAccount();
    },
    [dismissGuestMapHint, onOpenAccount],
  );

  useEffect(() => {
    if (!accountExpanded || isPcMenu) return;
    const onDocPointer = (e: PointerEvent) => {
      const el = accountBtnRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setAccountExpanded(false);
    };
    document.addEventListener('pointerdown', onDocPointer);
    return () => document.removeEventListener('pointerdown', onDocPointer);
  }, [accountExpanded, isPcMenu]);

  const applyCast = useCallback(
    (pick: MenuPcCastPick, withFade: boolean) => {
      const gen = ++castApplyGenRef.current;
      const sourceUrl = pick.url;
      const prevSource = pcCastSourceUrlRef.current;
      const prevDisplay = pcCastUrlRef.current;
      const mobile = typeof window !== 'undefined' && !window.matchMedia(PC_MENU_MQ).matches;

      const commit = (displayUrl: string) => {
        if (gen !== castApplyGenRef.current) return;
        if (withFade && prevSource && prevSource !== sourceUrl && prevDisplay) {
          setPcCastPrevUrl(prevDisplay);
          setPcCastFading(true);
          clearCastFadeTimer();
          castFadeTimerRef.current = window.setTimeout(() => {
            setPcCastPrevUrl(null);
            setPcCastFading(false);
            castFadeTimerRef.current = null;
          }, PC_CAST_FADE_MS);
        }
        pcCastSourceUrlRef.current = sourceUrl;
        pcCastUrlRef.current = displayUrl;
        setPcCastUrl(displayUrl);
        preloadMenuPcCastUrl(getMenuPcCastUrlAt(pick.index + 1));
      };

      if (!mobile) {
        commit(sourceUrl);
        return;
      }
      void resolveMenuCastDisplayUrl(sourceUrl).then(commit);
    },
    [clearCastFadeTimer],
  );

  useEffect(() => {
    const mq = window.matchMedia(PC_MENU_MQ);
    const sync = () => {
      const pc = mq.matches;
      setIsPcMenu(pc);
      if (pc) setAccountExpanded(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const pick = takeMenuPcCastForMenuVisit();
    pcCastUrlRef.current = pick.url;
    setPcCastUrl(pick.url);
    setPcCastPrevUrl(null);
    setPcCastFading(false);
    preloadMenuPcCastUrl(getMenuPcCastUrlAt(pick.index + 1));
    return () => clearCastFadeTimer();
  }, [clearCastFadeTimer]);

  /* Редкий автосвайп: пауза на скрытой вкладке; без reduced-motion; выкл. при закрепе. */
  useEffect(() => {
    if (!pcCastUrl || castPinned) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let timeoutId: number | null = null;
    const clear = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };
    const arm = () => {
      clear();
      if (document.hidden) return;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        applyCast(advanceMenuPcCast(1), true);
      }, PC_CAST_AUTO_MS);
    };
    const onVis = () => {
      if (document.hidden) clear();
      else arm();
    };

    arm();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clear();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [applyCast, castPinned, pcCastUrl]);

  useEffect(() => {
    if (!castPinConfirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCastPinConfirmOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (castPinConfirmRef.current?.contains(t)) return;
      if (castPinBtnRef.current?.contains(t)) return;
      setCastPinConfirmOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [castPinConfirmOpen]);

  const onCastPrev = useCallback(() => {
    setCastPinConfirmOpen(false);
    applyCast(advanceMenuPcCast(-1), true);
  }, [applyCast]);

  const onCastNext = useCallback(() => {
    setCastPinConfirmOpen(false);
    applyCast(advanceMenuPcCast(1), true);
  }, [applyCast]);

  const onCastPinClick = useCallback(() => {
    if (castPinned) {
      setMenuPcCastPinned(false);
      setCastPinned(false);
      setCastPinConfirmOpen(false);
      return;
    }
    setCastPinConfirmOpen((open) => !open);
  }, [castPinned]);

  const onConfirmCastPin = useCallback(() => {
    setMenuPcCastPinned(true);
    setCastPinned(true);
    setCastPinConfirmOpen(false);
  }, []);

  return (
    <main className="menu-screen menu-screen--pc-cinematic">
      {pcCastUrl && isPcMenu ? (
        <>
          <div className="menu-screen__pc-cast" aria-hidden="true">
            {pcCastPrevUrl ? (
              <img
                className="menu-screen__pc-cast-img menu-screen__pc-cast-img--outgoing"
                src={pcCastPrevUrl}
                alt=""
                draggable={false}
              />
            ) : null}
            <img
              className={
                pcCastFading
                  ? 'menu-screen__pc-cast-img menu-screen__pc-cast-img--incoming'
                  : 'menu-screen__pc-cast-img'
              }
              src={pcCastUrl}
              alt=""
              draggable={false}
            />
            <div className="menu-screen__pc-cast-meld" />
          </div>
          <div className="menu-screen__pc-cast-nav" role="group" aria-label="Сменить фон меню">
            <button
              type="button"
              className="menu-screen__pc-cast-nav-btn menu-screen__pc-cast-nav-btn--prev"
              aria-label="Предыдущий фон"
              onClick={onCastPrev}
            >
              <svg className="menu-screen__pc-cast-nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
                <path
                  d="M14.5 5.5 8 12l6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <div className="menu-screen__pc-cast-nav-pin-wrap">
              <button
                ref={castPinBtnRef}
                type="button"
                className={[
                  'menu-screen__pc-cast-nav-btn',
                  'menu-screen__pc-cast-nav-btn--pin',
                  castPinned ? 'menu-screen__pc-cast-nav-btn--pin-on' : '',
                  castPinConfirmOpen ? 'menu-screen__pc-cast-nav-btn--pin-open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={castPinned ? 'Открепить фон меню' : 'Закрепить фон меню'}
                aria-expanded={castPinConfirmOpen}
                aria-haspopup="dialog"
                onClick={onCastPinClick}
              >
                <CastLockGlyph locked={castPinned} />
              </button>

              {castPinConfirmOpen ? (
                <div
                  ref={castPinConfirmRef}
                  className="menu-screen__pc-cast-pin-popover"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="pc-cast-pin-title"
                  aria-describedby="pc-cast-pin-desc"
                >
                  <div className="menu-screen__pc-cast-pin-popover__glow" aria-hidden />
                  <div className="menu-screen__pc-cast-pin-popover__lock" aria-hidden>
                    <CastLockGlyph locked />
                  </div>
                  <p className="menu-screen__pc-cast-pin-popover__eyebrow">Фон меню</p>
                  <h2 id="pc-cast-pin-title" className="menu-screen__pc-cast-pin-popover__title">
                    Закрепить этот кадр?
                  </h2>
                  <p id="pc-cast-pin-desc" className="menu-screen__pc-cast-pin-popover__lead">
                    Автосмена и смена при входе на меню отключатся. Стрелки по-прежнему можно листать вручную.
                  </p>
                  <div className="menu-screen__pc-cast-pin-popover__actions">
                    <button
                      type="button"
                      className="menu-screen__pc-cast-pin-popover__btn menu-screen__pc-cast-pin-popover__btn--primary"
                      onClick={onConfirmCastPin}
                    >
                      Закрепить
                    </button>
                    <button
                      type="button"
                      className="menu-screen__pc-cast-pin-popover__btn menu-screen__pc-cast-pin-popover__btn--ghost"
                      onClick={() => setCastPinConfirmOpen(false)}
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="menu-screen__pc-cast-nav-btn menu-screen__pc-cast-nav-btn--next"
              aria-label="Следующий фон"
              onClick={onCastNext}
            >
              <svg className="menu-screen__pc-cast-nav-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden focusable="false">
                <path
                  d="M9.5 5.5 16 12l-6.5 6.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </>
      ) : null}
      {isPcMenu ? (
        <>
          <div className="menu-screen__pc-stars" aria-hidden="true">
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--far" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--mid-a" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--mid-b" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--near" />
          </div>
          <div className="menu-screen__pc-ufos" aria-hidden="true">
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--cyan">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <ellipse cx="24" cy="18" rx="16" ry="4" fill="#22d3ee" opacity="0.85" />
                <ellipse cx="24" cy="13" rx="10" ry="6" fill="#a5f3fc" />
                <ellipse cx="24" cy="17.5" rx="18" ry="1.6" fill="none" stroke="#c4b5fd" strokeWidth="1.2" opacity="0.9" />
                <circle cx="16" cy="19" r="1.4" fill="#f0abfc" />
                <circle cx="24" cy="20" r="1.5" fill="#ecfeff" />
                <circle cx="32" cy="19" r="1.4" fill="#f0abfc" />
              </svg>
            </span>
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--magenta">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <ellipse cx="24" cy="16" rx="18" ry="5" fill="#a855f7" opacity="0.75" />
                <ellipse cx="24" cy="12" rx="8" ry="5.5" fill="#f5d0fe" />
                <path d="M6 16 Q24 22 42 16" fill="none" stroke="#67e8f9" strokeWidth="1.1" opacity="0.85" />
                <circle cx="14" cy="17" r="1.3" fill="#22d3ee" />
                <circle cx="24" cy="18" r="1.4" fill="#e9d5ff" />
                <circle cx="34" cy="17" r="1.3" fill="#22d3ee" />
              </svg>
            </span>
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--violet">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <ellipse cx="24" cy="17" rx="15" ry="3.8" fill="#7c3aed" opacity="0.8" />
                <ellipse cx="24" cy="12.5" rx="9" ry="5.2" fill="#ddd6fe" />
                <ellipse cx="24" cy="16.5" rx="17" ry="1.4" fill="none" stroke="#22d3ee" strokeWidth="1" opacity="0.75" />
                <circle cx="17" cy="18" r="1.2" fill="#a5f3fc" />
                <circle cx="24" cy="18.5" r="1.3" fill="#f5d0fe" />
                <circle cx="31" cy="18" r="1.2" fill="#a5f3fc" />
              </svg>
            </span>
          </div>
        </>
      ) : (
        <div className="menu-screen__mobile-stars" aria-hidden="true">
          <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--a" />
          <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--b" />
          <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--c" />
        </div>
      )}
      {/* Герой неба вне stars-слоя (z:1) — иначе тонет под stack/кастом */}
      {!isPcMenu ? (
        <div className="menu-screen__mobile-stars__heroes" aria-hidden="true">
          <span className="menu-screen__mobile-stars__hero" />
        </div>
      ) : null}
      <div className="menu-screen__aura" aria-hidden="true">
        <div className="menu-screen__aura-glow" />
        <div className="menu-screen__aura-scrim" />
      </div>
      <div className="menu-screen__stack">
        <div className="menu-screen__pc-topbar">
          <header className="menu-screen__header">
            <div className="menu-screen__brand">
              <span className="menu-screen__brand-mark" aria-hidden="true">
                <span className="menu-screen__brand-mark__halo" />
                <span className="menu-screen__brand-mark__orbit" />
                <span className="menu-screen__brand-mark__frame">
                  <img
                    className="menu-screen__brand-icon"
                    src="/icon-192.png"
                    alt=""
                    width={48}
                    height={48}
                    draggable={false}
                  />
                  <span className="menu-screen__brand-mark__gloss" />
                </span>
                <span className="menu-screen__brand-mark__spark menu-screen__brand-mark__spark--a" />
                <span className="menu-screen__brand-mark__spark menu-screen__brand-mark__spark--b" />
              </span>
              <div className="menu-screen__brand-text">
                <div className="menu-screen__title-row">
                  <span className="menu-screen__title-3d">
                    <span className="menu-screen__title-3d__extrude" aria-hidden="true">
                      Up&amp;Down
                    </span>
                    <h1
                      className="menu-screen__title"
                      onContextMenu={(e) => e.preventDefault()}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || !onTitleDevMode) return;
                        const target = e.currentTarget;
                        const t = window.setTimeout?.(() => onTitleDevMode(), 1200);
                        const clear = () => window.clearTimeout?.(t);
                        target.addEventListener('pointerup', clear, { once: true });
                        target.addEventListener('pointerleave', clear, { once: true });
                      }}
                    >
                      Up&amp;Down
                    </h1>
                  </span>
                  <span className="menu-screen__title-star" aria-hidden="true">
                    <svg className="menu-screen__title-star__svg" viewBox="0 0 32 32" focusable="false">
                      <defs>
                        <linearGradient id="menu-title-star-grad" x1="12%" y1="0%" x2="88%" y2="100%">
                          <stop className="menu-screen__title-star__stop menu-screen__title-star__stop--a" offset="0%" stopColor="#e9d5ff" />
                          <stop className="menu-screen__title-star__stop menu-screen__title-star__stop--b" offset="28%" stopColor="#a78bfa" />
                          <stop className="menu-screen__title-star__stop menu-screen__title-star__stop--c" offset="55%" stopColor="#c084fc" />
                          <stop className="menu-screen__title-star__stop menu-screen__title-star__stop--d" offset="78%" stopColor="#e879f9" />
                          <stop className="menu-screen__title-star__stop menu-screen__title-star__stop--e" offset="100%" stopColor="#67e8f9" />
                        </linearGradient>
                        <radialGradient id="menu-title-star-core-grad" cx="36%" cy="32%" r="58%">
                          <stop offset="0%" stopColor="#f5d0fe" stopOpacity="1" />
                          <stop offset="42%" stopColor="#c084fc" stopOpacity="0.95" />
                          <stop offset="100%" stopColor="#6d28d9" stopOpacity="0.45" />
                        </radialGradient>
                        <radialGradient id="menu-title-star-depth" cx="50%" cy="50%" r="55%">
                          <stop offset="0%" stopColor="#f3e8ff" stopOpacity="0.55" />
                          <stop offset="45%" stopColor="#a78bfa" stopOpacity="0.35" />
                          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0.3" />
                        </radialGradient>
                        {/* Мягкий объём лучей: свет сверху-слева, тень снизу-справа */}
                        <radialGradient id="menu-title-star-shade" cx="30%" cy="26%" r="72%">
                          <stop offset="0%" stopColor="#f5d0fe" stopOpacity="0.42" />
                          <stop offset="48%" stopColor="#c084fc" stopOpacity="0" />
                          <stop offset="100%" stopColor="#2e1065" stopOpacity="0.38" />
                        </radialGradient>
                      </defs>
                      <g className="menu-screen__title-star__burst">
                        {/* Мягкая тень под крестом */}
                        <path
                          className="menu-screen__title-star__shadow"
                          fill="rgba(12, 4, 36, 0.52)"
                          d="M16 1.4 Q16.55 14.2 30.6 16 Q16.55 17.8 16 30.6 Q15.45 17.8 1.4 16 Q15.45 14.2 16 1.4Z"
                          transform="translate(0.7 1.05)"
                        />
                        {/* Главный 4-лучовый spark */}
                        <path
                          fill="url(#menu-title-star-grad)"
                          d="M16 1.2 Q16.55 14.15 30.8 16 Q16.55 17.85 16 30.8 Q15.45 17.85 1.2 16 Q15.45 14.15 16 1.2Z"
                        />
                        <path
                          fill="url(#menu-title-star-depth)"
                          d="M16 1.2 Q16.55 14.15 30.8 16 Q16.55 17.85 16 30.8 Q15.45 17.85 1.2 16 Q15.45 14.15 16 1.2Z"
                        />
                        <path
                          fill="url(#menu-title-star-shade)"
                          d="M16 1.2 Q16.55 14.15 30.8 16 Q16.55 17.85 16 30.8 Q15.45 17.85 1.2 16 Q15.45 14.15 16 1.2Z"
                        />
                        {/* Короткий диагональный крест */}
                        <path
                          fill="url(#menu-title-star-grad)"
                          opacity="0.82"
                          transform="rotate(45 16 16)"
                          d="M16 7.2 Q16.35 14.7 24.8 16 Q16.35 17.3 16 24.8 Q15.65 17.3 7.2 16 Q15.65 14.7 16 7.2Z"
                        />
                        <path
                          fill="url(#menu-title-star-shade)"
                          opacity="0.7"
                          transform="rotate(45 16 16)"
                          d="M16 7.2 Q16.35 14.7 24.8 16 Q16.35 17.3 16 24.8 Q15.65 17.3 7.2 16 Q15.65 14.7 16 7.2Z"
                        />
                      </g>
                      {/* Ядро: объём + лёгкий блик сверху-слева */}
                      <ellipse
                        cx="16.35"
                        cy="16.55"
                        rx="2.7"
                        ry="2.55"
                        fill="rgba(46, 16, 101, 0.35)"
                      />
                      <circle
                        className="menu-screen__title-star__core"
                        cx="16"
                        cy="16"
                        r="2.55"
                        fill="url(#menu-title-star-core-grad)"
                      />
                      <circle cx="15.15" cy="15.2" r="0.85" fill="#f5d0fe" opacity="0.75" />
                      <circle cx="16" cy="16" r="1.05" fill="#e9d5ff" opacity="0.55" />
                    </svg>
                  </span>
                </div>
                <div className="menu-screen__tagline-row">
                  <p className="menu-screen__tagline">Карточная игра на взятки</p>
                </div>
              </div>
            </div>
          </header>

          <button
            ref={accountBtnRef}
            type="button"
            className={[
              'menu-screen__player',
              isGuestIdentity ? 'menu-screen__player--guest' : '',
              isProfileIdentity || isAccountIdentity ? 'menu-screen__player--signed' : '',
              accountExpanded ? 'menu-screen__player--expanded' : 'menu-screen__player--collapsed',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onAccountChipClick}
            aria-label={
              accountExpanded
                ? 'Свернуть кабинет'
                : isGuestIdentity
                  ? MENU_IDENTITY_STATUS_ARIA.guest
                  : isProfileIdentity
                    ? MENU_IDENTITY_STATUS_ARIA.profile
                    : isAccountIdentity
                      ? MENU_IDENTITY_STATUS_ARIA.account
                      : 'Показать кабинет'
            }
            aria-expanded={accountExpanded}
          >
            {isGuestIdentity ? (
              <MenuGuestIdentityCycle showMapHint={showGuestMapHint} onHideMapHint={dismissGuestMapHint} />
            ) : isProfileIdentity || isAccountIdentity ? (
              <MenuSignedIdentityMark
                status={isAccountIdentity ? 'account' : 'profile'}
                name={displayName}
                avatarDataUrl={avatarDataUrl}
                avatarBgColor={avatarBgColor}
                sizePx={44}
                onOpenCabinet={onOpenAccount}
              />
            ) : (
              <span className="menu-screen__player-avatar-ring">
                <PlayerAvatar
                  name={displayName}
                  avatarDataUrl={avatarDataUrl}
                  avatarBgColor={avatarBgColor}
                  sizePx={44}
                  className="menu-screen__player-avatar"
                />
              </span>
            )}
            <span className="menu-screen__player-text">
              {isPcMenu ? (
                <>
                  <span className="menu-screen__player-label">Кабинет</span>
                  <strong className="menu-screen__player-name">{displayName}</strong>
                  <span className="menu-screen__player-sub">
                    {isGuestIdentity
                      ? 'профиль не задан · войти'
                      : signedIn
                        ? 'профиль + аккаунт'
                        : 'профиль · войти в аккаунт'}
                  </span>
                </>
              ) : (
                <>
                  <strong className="menu-screen__player-name">{displayName}</strong>
                  <span
                    className="menu-screen__player-sub menu-screen__player-sub--inline"
                    role="button"
                    tabIndex={0}
                    onClick={onAccountEnterClick}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onAccountEnterClick(e);
                      }
                    }}
                  >
                    {signedIn ? 'открыть кабинет' : 'войти в кабинет'}
                  </span>
                </>
              )}
            </span>
            <span className="menu-screen__player-chev" aria-hidden="true">
              ▸
            </span>
          </button>
        </div>

        {onlineResumeMessage ? (
          <p className="menu-screen__alert" role="alert">
            {onlineResumeMessage}
          </p>
        ) : null}

        <MenuGlassLadder
          signedIn={signedIn}
          youName={displayName}
          onOpenRating={onOpenRating}
        />

        <div className="menu-screen__sections menu-screen__constellation">
          <MenuSection sectionId="play" glyphsOnly={playGlyphsOnly}>
            <MenuPcDrift id="offline" className="menu-screen__drift--offline" movable>
              <MenuPlaySplitCapsule
                mode="offline"
                canResume={hasSavedOffline}
                onResume={onResumeOffline}
                onMain={onOfflinePlay}
              />
            </MenuPcDrift>
            <div className="menu-screen__online-with-glyphs">
              <MenuPcDrift id="online" className="menu-screen__drift--online" movable>
                <MenuPlaySplitCapsule
                  mode="online"
                  canResume={canResumeOnline}
                  satelliteCode={lastPartyCode}
                  onResume={onResumeOnline}
                  onMain={onOpenOnline}
                />
              </MenuPcDrift>
              {!isPcMenu && (hasSavedOffline || canResumeOnline) ? (
                <div className="menu-screen__glyphs-toggle-row">
                  <button
                    type="button"
                    className={[
                      'menu-screen__section-glyphs-toggle',
                      glyphsToggleDimmed ? 'menu-screen__section-glyphs-toggle--dimmed' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-pressed={playGlyphsOnly}
                    aria-label={playGlyphsOnly ? 'Показать подписи капсул' : 'Скрыть подписи капсул'}
                    onClick={togglePlayGlyphsOnly}
                  >
                    {playGlyphsOnly ? 'полный вид' : 'без слов'}
                  </button>
                </div>
              ) : null}
            </div>
            <MenuPcDrift id="account" className="menu-screen__drift--account" movable>
              <MenuCapsuleButton
                variant="account"
                eyebrow="Кабинет"
                title={displayName}
                hint={signedIn ? 'профиль + аккаунт' : 'профиль · войти в аккаунт'}
                avatarName={displayName}
                avatarDataUrl={avatarDataUrl}
                identityStatus={
                  isAccountIdentity ? 'account' : isProfileIdentity ? 'profile' : undefined
                }
                onClick={onOpenAccount}
              />
            </MenuPcDrift>
            {/* ПК: «Поддержать» в дрейфе. На мобиле — только внизу у «Правила», без дубля. */}
            {onOpenSupport && isPcMenu ? (
              <MenuPcDrift id="support" className="menu-screen__drift--support" movable>
                <SupportMenuButton onClick={onOpenSupport} />
              </MenuPcDrift>
            ) : null}
            {isPcMenu ? (
              <MenuPcDrift id="audio" className="menu-screen__drift--audio" movable>
                <AudioSettingsPanel />
              </MenuPcDrift>
            ) : null}
            {isPcMenu ? (
              <MenuPcDrift id="rules-v1" className="menu-screen__drift--rules" movable>
                <MenuCapsuleButton
                  variant="rules"
                  title="Правила игры"
                  hint="как играть"
                  collapsible
                  collapseId="rules"
                  onClick={onOpenRules}
                />
              </MenuPcDrift>
            ) : null}
          </MenuSection>

          {devMode ? (
            <div className="menu-screen__dev">
              <MenuCapsuleButton variant="link" title="Демо карт" href="/demo" compact />
              <MenuCapsuleButton variant="link" title="Лаб: шкала раздач" href="/deal-track-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: цвета ИТОГО" href="/total-color-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: онлайн-UI" href="/online-ui-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: правила" href="/rules-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: аудио SFX" href="/audio-sfx-lab" compact />
              <MenuCapsuleButton variant="link" title="Демо: фишки" href="/scoring-demo" compact />
              <MenuCapsuleButton variant="link" title="Космогенез" href="/cosmogenesis-demo.html" compact />
            </div>
          ) : null}
        </div>

          {pcCastUrl && !isPcMenu ? (
            <div className="menu-screen__mobile-cast">
              <div
                className="menu-screen__mobile-cast__vignette menu-screen__mobile-cast__vignette--top"
                aria-hidden="true"
              />
              <div className="menu-screen__mobile-cast__stage" aria-hidden="true">
                {pcCastPrevUrl ? (
                  <img
                    className="menu-screen__mobile-cast__img menu-screen__mobile-cast__img--outgoing"
                    src={pcCastPrevUrl}
                    alt=""
                    draggable={false}
                    decoding="async"
                    width={512}
                    height={512}
                  />
                ) : null}
                <img
                  className={
                    pcCastFading
                      ? 'menu-screen__mobile-cast__img menu-screen__mobile-cast__img--incoming'
                      : 'menu-screen__mobile-cast__img'
                  }
                  src={pcCastUrl}
                  alt=""
                  draggable={false}
                  decoding="async"
                  width={512}
                  height={512}
                />
                <div className="menu-screen__mobile-cast__meld" />
                <div className="menu-screen__mobile-cast__edge-stars" aria-hidden="true">
                  <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--a" />
                  <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--b" />
                  <div className="menu-screen__mobile-stars__layer menu-screen__mobile-stars__layer--c" />
                </div>
              </div>
              <div
                className="menu-screen__mobile-cast__vignette menu-screen__mobile-cast__vignette--bottom"
                aria-hidden="true"
              />
              <div className="menu-screen__mobile-cast__nav" role="group" aria-label="Сменить фон меню">
                <button
                  type="button"
                  className="menu-screen__pc-cast-nav-btn menu-screen__pc-cast-nav-btn--prev"
                  aria-label="Предыдущий фон"
                  onClick={onCastPrev}
                >
                  <svg className="menu-screen__pc-cast-nav-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
                    <path
                      d="M14.5 5.5 8 12l6.5 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <div className="menu-screen__pc-cast-nav-pin-wrap">
                  <button
                    ref={castPinBtnRef}
                    type="button"
                    className={[
                      'menu-screen__pc-cast-nav-btn',
                      'menu-screen__pc-cast-nav-btn--pin',
                      castPinned ? 'menu-screen__pc-cast-nav-btn--pin-on' : '',
                      castPinConfirmOpen ? 'menu-screen__pc-cast-nav-btn--pin-open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={castPinned ? 'Открепить фон меню' : 'Закрепить фон меню'}
                    aria-expanded={castPinConfirmOpen}
                    aria-haspopup="dialog"
                    onClick={onCastPinClick}
                  >
                    <CastLockGlyph locked={castPinned} />
                  </button>
                  {castPinConfirmOpen ? (
                    <div
                      ref={castPinConfirmRef}
                      className="menu-screen__pc-cast-pin-popover menu-screen__pc-cast-pin-popover--mobile"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="mobile-cast-pin-title"
                      aria-describedby="mobile-cast-pin-desc"
                    >
                      <div className="menu-screen__pc-cast-pin-popover__glow" aria-hidden />
                      <div className="menu-screen__pc-cast-pin-popover__lock" aria-hidden>
                        <CastLockGlyph locked />
                      </div>
                      <p className="menu-screen__pc-cast-pin-popover__eyebrow">Фон меню</p>
                      <h2 id="mobile-cast-pin-title" className="menu-screen__pc-cast-pin-popover__title">
                        Закрепить этот кадр?
                      </h2>
                      <p id="mobile-cast-pin-desc" className="menu-screen__pc-cast-pin-popover__lead">
                        Автосмена и смена при входе на меню отключатся. Стрелки по-прежнему можно листать вручную.
                      </p>
                      <div className="menu-screen__pc-cast-pin-popover__actions">
                        <button
                          type="button"
                          className="menu-screen__pc-cast-pin-popover__btn menu-screen__pc-cast-pin-popover__btn--primary"
                          onClick={onConfirmCastPin}
                        >
                          Закрепить
                        </button>
                        <button
                          type="button"
                          className="menu-screen__pc-cast-pin-popover__btn menu-screen__pc-cast-pin-popover__btn--ghost"
                          onClick={() => setCastPinConfirmOpen(false)}
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="menu-screen__pc-cast-nav-btn menu-screen__pc-cast-nav-btn--next"
                  aria-label="Следующий фон"
                  onClick={onCastNext}
                >
                  <svg className="menu-screen__pc-cast-nav-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden focusable="false">
                    <path
                      d="M9.5 5.5 16 12l-6.5 6.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.85"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}

          {!isPcMenu ? (
            <div className="menu-screen__mobile-rules">
              <MenuCapsuleButton
                variant="rules"
                title="Правила игры"
                hint="как играть"
                collapsible
                collapseId="rules"
                onClick={onOpenRules}
              />
              {onOpenSupport ? (
                <SupportMenuButton onClick={onOpenSupport} />
              ) : null}
              <div className="menu-screen__mobile-audio">
                <AudioSettingsPanel />
              </div>
              {onOpenRating ? (
                <MenuCapsuleButton
                  variant="rating"
                  title="Рейтинг"
                  hint="таблица лидеров"
                  collapsible
                  collapseId="rating"
                  onClick={onOpenRating}
                />
              ) : null}
            </div>
          ) : null}
      </div>
      <OfflineReadyOrb />
    </main>
  );
}
