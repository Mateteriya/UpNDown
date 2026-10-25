/**
 * Статус аккаунта за столом.
 * ПК/планшет: top-right под лампой / бейджем 4p.
 * Мобилка: bottom-right под Югом.
 * Гость ПК: plaque → cta (только «Войти») → chip → mini.
 * Гость мобилка: plaque коротко → chip → mini (без cta).
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

/** ПК: полная плашка гостя / «в аккаунте» */
const PC_PLAQUE_MS = 6000;
/** ПК гость: соло-кнопка «Войти» */
const PC_CTA_MS = 4000;
/** Мобилка гость: короткая плашка */
const MOBILE_GUEST_PLAQUE_MS = 2500;
/** Мобилка «в аккаунте» */
const MOBILE_IN_PLAQUE_MS = 3000;
const FOLD_ANIM_MS = 420;
const CHIP_TO_MINI_PC_MS = 12_000;
const CHIP_TO_MINI_MOBILE_MS = 8_000;
const PANEL_W = 220;
const EDGE_PAD = 8;

type ViewMode = 'plaque' | 'cta' | 'chip' | 'mini';

/** top-right — ПК; bottom-right — мобилка. */
export type GameAcctCorner = 'top-right' | 'bottom-right';

export type GameAcctCosmicOrbProps = {
  corner?: GameAcctCorner;
  /** Мобильный landscape: быстрее в micro, чтобы не спорить с рукой. */
  landscapeMicro?: boolean;
  /**
   * Не раскрывать плашку (приветствие после OAuth / модалка входа поверх стола).
   * После снятия quiet остаёмся в mini — не дублируем «в аккаунте».
   */
  quiet?: boolean;
  signedIn: boolean;
  who?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void | Promise<void>;
  onChangeAccount?: () => void | Promise<void>;
};

type PanelPos = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

export function GameAcctCosmicOrb({
  corner = 'top-right',
  landscapeMicro = false,
  quiet = false,
  signedIn,
  who,
  onSignIn,
  onSignOut,
  onChangeAccount,
}: GameAcctCosmicOrbProps) {
  const t = useT();
  const isMobileCorner = corner === 'bottom-right';
  const chipToMiniMs = landscapeMicro
    ? 2800
    : isMobileCorner
      ? CHIP_TO_MINI_MOBILE_MS
      : CHIP_TO_MINI_PC_MS;
  const [mode, setMode] = useState<ViewMode>(() => (quiet ? 'mini' : 'plaque'));
  const [folding, setFolding] = useState(false);
  const [popover, setPopover] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<PanelPos>({ top: 72, right: EDGE_PAD });
  const anchorRef = useRef<HTMLDivElement>(null);
  const autoCollapseRef = useRef<number | null>(null);
  const foldAnimRef = useRef<number | null>(null);
  const ctaTimerRef = useRef<number | null>(null);
  const miniTimerRef = useRef<number | null>(null);
  /** После «Сменить» signOut не должен снова раскрывать гостевую плашку поверх AuthModal. */
  const suppressGuestRevealRef = useRef(false);
  const modeRef = useRef<ViewMode>(mode);
  modeRef.current = mode;

  const whoLabel = who?.trim() || t('playerDossier.acctAnon');
  const titleIn = t('playerDossier.acctIn', { who: whoLabel });
  const titleOut = t('playerDossier.acctOut');

  const clearTimers = () => {
    if (autoCollapseRef.current != null) {
      window.clearTimeout(autoCollapseRef.current);
      autoCollapseRef.current = null;
    }
    if (foldAnimRef.current != null) {
      window.clearTimeout(foldAnimRef.current);
      foldAnimRef.current = null;
    }
    if (ctaTimerRef.current != null) {
      window.clearTimeout(ctaTimerRef.current);
      ctaTimerRef.current = null;
    }
    if (miniTimerRef.current != null) {
      window.clearTimeout(miniTimerRef.current);
      miniTimerRef.current = null;
    }
  };

  const scheduleMini = () => {
    if (miniTimerRef.current != null) window.clearTimeout(miniTimerRef.current);
    miniTimerRef.current = window.setTimeout(() => setMode('mini'), chipToMiniMs);
  };

  const syncPos = () => {
    const el = anchorRef.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const btn = el.querySelector('.game-acct-ind');
    const stack =
      el.closest('.game-acct-pc-anchor') ||
      el.closest('.game-acct-pc-lamp-stack') ||
      el.closest('.game-header-pc-deal-orbit-wrap');
    const overlayOpen = mode === 'plaque' || mode === 'cta';
    const useStack = corner === 'top-right' && overlayOpen && stack instanceof HTMLElement;
    const anchorEl = useStack
      ? stack
      : btn instanceof HTMLElement
        ? btn
        : el;
    const r = anchorEl.getBoundingClientRect();
    const idealRight = Math.max(EDGE_PAD, vw - r.right);
    const maxRight = Math.max(EDGE_PAD, vw - PANEL_W - EDGE_PAD);
    const clampedRight = Math.min(idealRight, maxRight);

    if (corner === 'bottom-right') {
      const bottom = Math.max(EDGE_PAD, vh - r.top + 8);
      setPos({ top: undefined, bottom, left: undefined, right: clampedRight });
    } else {
      const top = Math.max(EDGE_PAD, r.bottom + 8);
      setPos({ top, bottom: undefined, left: undefined, right: clampedRight });
    }
  };

  const finishCollapseToChip = () => {
    setFolding(false);
    setPopover(false);
    setMode('chip');
    scheduleMini();
  };

  /** Сразу в chip (крестик / мобилка / «в аккаунте»). */
  const beginCollapseToChip = () => {
    if (folding) return;
    if (modeRef.current === 'cta') {
      setMode('chip');
      scheduleMini();
      return;
    }
    if (modeRef.current !== 'plaque') return;
    setFolding(true);
    if (foldAnimRef.current != null) window.clearTimeout(foldAnimRef.current);
    foldAnimRef.current = window.setTimeout(finishCollapseToChip, FOLD_ANIM_MS);
  };

  /** ПК гость: plaque → cta. */
  const beginCollapseToCta = () => {
    if (folding || modeRef.current !== 'plaque') return;
    setFolding(true);
    if (foldAnimRef.current != null) window.clearTimeout(foldAnimRef.current);
    foldAnimRef.current = window.setTimeout(() => {
      setFolding(false);
      setPopover(false);
      setMode('cta');
      if (ctaTimerRef.current != null) window.clearTimeout(ctaTimerRef.current);
      ctaTimerRef.current = window.setTimeout(() => {
        setMode('chip');
        scheduleMini();
      }, PC_CTA_MS);
    }, FOLD_ANIM_MS);
  };

  const dismissPanel = () => {
    if (mode === 'plaque' || mode === 'cta') beginCollapseToChip();
    else setPopover(false);
  };

  useEffect(() => {
    return () => clearTimers();
  }, []);

  useEffect(() => {
    clearTimers();
    setFolding(false);
    setPopover(false);

    if (quiet) {
      setMode('mini');
      return () => clearTimers();
    }

    if (suppressGuestRevealRef.current && !signedIn) {
      suppressGuestRevealRef.current = false;
      setMode('mini');
      return () => clearTimers();
    }

    /** После приветствия (quiet→false) снова показываем «в аккаунте» один раз. */
    setMode('plaque');

    const usePcGuestStages = !isMobileCorner && !signedIn;
    const plaqueMs = isMobileCorner
      ? signedIn
        ? MOBILE_IN_PLAQUE_MS
        : MOBILE_GUEST_PLAQUE_MS
      : PC_PLAQUE_MS;

    autoCollapseRef.current = window.setTimeout(() => {
      if (usePcGuestStages) beginCollapseToCta();
      else beginCollapseToChip();
    }, plaqueMs);

    return () => clearTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- статус + угол / LS micro / quiet
  }, [signedIn, corner, landscapeMicro, quiet]);

  useLayoutEffect(() => {
    if (mode === 'plaque' || mode === 'cta' || popover) syncPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, popover, corner]);

  useEffect(() => {
    if (mode !== 'plaque' && mode !== 'cta' && !popover) return;
    const onWin = () => syncPos();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onWin);
    vv?.addEventListener('scroll', onWin);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
      vv?.removeEventListener('resize', onWin);
      vv?.removeEventListener('scroll', onWin);
    };
  }, [mode, popover, corner]);

  const runBusy = async (fn?: () => void | Promise<void>) => {
    if (!fn || busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setPopover(false);
    }
  };

  const overlayOpen = mode === 'plaque' || mode === 'cta';

  const hostClass = [
    'game-acct-dock',
    `game-acct-dock--${mode}`,
    `game-acct-dock--${corner}`,
    signedIn ? 'game-acct-dock--in' : 'game-acct-dock--out',
    overlayOpen ? 'game-acct-dock--plaque-open' : '',
    popover ? 'game-acct-dock--popover' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /** Сменить: двойной обмен по горизонтали (под капсулу-глиф) */
  const GlyphSwitch = () => (
    <svg className="game-acct-act__glyph" viewBox="0 0 32 16" fill="none" aria-hidden>
      <path
        d="M3 5.2h18.5M18.2 2.4L22.2 5.2 18.2 8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M29 10.8H10.5M13.8 13.6 9.8 10.8 13.8 8"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="8" r="1.55" fill="currentColor" opacity="0.9" />
    </svg>
  );
  /** Выйти: шлюз + импульс наружу */
  const GlyphOut = () => (
    <svg className="game-acct-act__glyph" viewBox="0 0 32 16" fill="none" aria-hidden>
      <path
        d="M11 2.4H6.2A2.2 2.2 0 0 0 4 4.6v6.8A2.2 2.2 0 0 0 6.2 13.6H11"
        stroke="currentColor"
        strokeWidth="2.05"
        strokeLinecap="round"
      />
      <path
        d="M13.5 8H27.2m0 0-3.4-3.2M27.2 8l-3.4 3.2"
        stroke="currentColor"
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.2 4.2v7.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
  const GlyphEnter = () => (
    <svg className="game-acct-enter-cap__glyph" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M11 5H8.2A2.2 2.2 0 0 0 6 7.2v9.6A2.2 2.2 0 0 0 8.2 19H11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M13 12h7m0 0-2.5-2.5M20 12l-2.5 2.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
  const GlyphCloseX = () => (
    <svg className="game-acct-x__ico" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7.2 7.2l9.6 9.6M16.8 7.2l-9.6 9.6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );

  const renderArtLayers = () => (
    <>
      <div className="game-acct-art__prism" aria-hidden />
      <div className="game-acct-art__mesh" aria-hidden />
      <div className="game-acct-art__scan" aria-hidden />
      <div className="game-acct-art__rim" aria-hidden />
      <div className="game-acct-art__corners" aria-hidden>
        <span />
        <span />
        <span />
        <span />
      </div>
    </>
  );

  const panelStyle: CSSProperties = {
    top: pos.top,
    bottom: pos.bottom,
    left: pos.left,
    right: pos.right,
  };

  const enterCap = (boost?: boolean) => (
    <button
      type="button"
      className={['game-acct-enter-cap', 'game-acct-enter-cap--shimmer', boost ? 'game-acct-enter-cap--shimmer-boost' : '']
        .filter(Boolean)
        .join(' ')}
      disabled={busy || !onSignIn}
      onClick={() => {
        setPopover(false);
        onSignIn?.();
      }}
    >
      <span className="game-acct-enter-cap__sweep" aria-hidden />
      <span className="game-acct-enter-cap__ico" aria-hidden>
        <GlyphEnter />
      </span>
      <span className="game-acct-enter-cap__label">{t('playerDossier.acctSignInCta')}</span>
    </button>
  );

  const renderCtaOnly = (opts: { folding?: boolean }) => (
    <div
      className={[
        'game-acct-panel',
        'game-acct-panel--out',
        'game-acct-panel--cta-only',
        corner === 'bottom-right' ? 'game-acct-panel--from-bottom' : 'game-acct-panel--from-top',
        opts.folding ? 'game-acct-panel--folding' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-label={t('playerDossier.acctSignInCta')}
      style={panelStyle}
    >
      <button
        type="button"
        className="game-acct-x game-acct-x--cta"
        onClick={dismissPanel}
        aria-label={t('playerDossier.acctCollapse')}
        title={t('playerDossier.acctCollapse')}
      >
        <span className="game-acct-x__ring" aria-hidden />
        <GlyphCloseX />
      </button>
      <div className="game-acct-panel__cta game-acct-panel__cta--solo">{enterCap(true)}</div>
    </div>
  );

  const renderPanel = (opts: { folding?: boolean }) => (
    <div
      className={[
        'game-acct-panel',
        signedIn ? 'game-acct-panel--in' : 'game-acct-panel--out',
        corner === 'bottom-right' ? 'game-acct-panel--from-bottom' : 'game-acct-panel--from-top',
        opts.folding ? 'game-acct-panel--folding' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role={mode === 'plaque' ? 'status' : 'dialog'}
      aria-label={mode === 'plaque' ? undefined : t('playerDossier.acctPopAria')}
      style={panelStyle}
    >
      {renderArtLayers()}
      <div className="game-acct-panel__aurora" aria-hidden />

      <button
        type="button"
        className="game-acct-x"
        onClick={dismissPanel}
        aria-label={mode === 'plaque' ? t('playerDossier.acctCollapse') : t('playerDossier.acctPopClose')}
        title={mode === 'plaque' ? t('playerDossier.acctCollapse') : t('playerDossier.acctPopClose')}
      >
        <span className="game-acct-x__ring" aria-hidden />
        <GlyphCloseX />
      </button>

      <div className="game-acct-panel__body">
        <p className="game-acct-panel__kicker">
          {signedIn ? t('playerDossier.acctOrbKickerIn') : t('playerDossier.acctOrbKickerOut')}
        </p>
        <p className="game-acct-panel__title">{signedIn ? titleIn : titleOut}</p>

        <div className="game-acct-panel__cta">
          {signedIn ? (
            <div className="game-acct-panel__row game-acct-panel__row--caps">
              <button
                type="button"
                className="game-acct-act-cap game-acct-act-cap--switch"
                disabled={busy}
                onClick={() => {
                  clearTimers();
                  setFolding(false);
                  setPopover(false);
                  setMode('mini');
                  void runBusy(onChangeAccount);
                }}
              >
                <span className="game-acct-act-cap__sweep" aria-hidden />
                <span className="game-acct-act-cap__ico" aria-hidden>
                  <GlyphSwitch />
                </span>
                <span className="game-acct-act-cap__label">{t('playerDossier.acctChange')}</span>
              </button>
              <button
                type="button"
                className="game-acct-act-cap game-acct-act-cap--out"
                disabled={busy}
                onClick={() => void runBusy(onSignOut)}
              >
                <span className="game-acct-act-cap__sweep" aria-hidden />
                <span className="game-acct-act-cap__ico" aria-hidden>
                  <GlyphOut />
                </span>
                <span className="game-acct-act-cap__label">{t('playerDossier.acctSignOut')}</span>
              </button>
            </div>
          ) : (
            enterCap(false)
          )}
        </div>
      </div>
    </div>
  );

  const showExpanded =
    !quiet && (mode === 'plaque' || mode === 'cta' || (popover && mode !== 'plaque' && mode !== 'cta'));

  return (
    <div className={hostClass} ref={anchorRef}>
      <button
        type="button"
        className="game-acct-ind"
        onClick={() => {
          if (quiet) return;
          if (mode === 'plaque' || mode === 'cta') {
            beginCollapseToChip();
            return;
          }
          setPopover((v) => !v);
        }}
        aria-label={
          signedIn
            ? t('playerDossier.acctOrbAriaIn', { who: whoLabel })
            : t('playerDossier.acctOrbAriaOut')
        }
        aria-expanded={showExpanded}
        title={signedIn ? titleIn : titleOut}
      >
        <span className="game-acct-ind__stars" aria-hidden />
        <span className="game-acct-ind__ring" aria-hidden>
          <i className="game-acct-ind__sat game-acct-ind__sat--a" />
          <i className="game-acct-ind__sat game-acct-ind__sat--b" />
          <i className="game-acct-ind__sat game-acct-ind__sat--c" />
        </span>
        <span className="game-acct-ind__ring game-acct-ind__ring--inner" aria-hidden>
          <i className="game-acct-ind__sat game-acct-ind__sat--d" />
          <i className="game-acct-ind__sat game-acct-ind__sat--e" />
        </span>
        <span className="game-acct-ind__core" aria-hidden>
          <span className="game-acct-ind__sheen" />
          <span className="game-acct-ind__dot" />
        </span>
      </button>

      {!quiet && typeof document !== 'undefined' && mode === 'plaque'
        ? createPortal(renderPanel({ folding }), document.body)
        : null}
      {!quiet && typeof document !== 'undefined' && mode === 'cta'
        ? createPortal(renderCtaOnly({ folding: false }), document.body)
        : null}
      {!quiet && typeof document !== 'undefined' && popover && mode !== 'plaque' && mode !== 'cta'
        ? createPortal(renderPanel({}), document.body)
        : null}
    </div>
  );
}
