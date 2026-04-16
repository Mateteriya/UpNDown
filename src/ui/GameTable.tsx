/**
 * Игровой стол Up&Down
 * @see TZ.md раздел 7.3
 */

import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AIDifficulty, GameState } from '../game/GameEngine';
import {
  createGame,
  createGameOnline,
  startDeal,
  startNextDeal,
  getDealType,
  getTricksInDeal,
  placeBid,
  playCard,
  completeTrick,
  getValidPlays,
  isHumanPlayer,
} from '../game/GameEngine';
import { loadGameStateFromStorage, saveGameStateToStorage, updateLocalRating, getLocalRating, getPlayerProfile } from '../game/persistence';
import { logDealOutcome } from '../game/aiLearning';
import { aiBid, aiPlay } from '../game/ai';
import {
  getAiDifficulty,
  persistAllOfflineAiDifficulties,
  persistOfflineAiDifficultyForBotId,
} from '../game/aiSettings';
import { AiDifficultyControl, HeaderRoomExitIcon } from './AiDifficultyControl';
import { getTrickWinner } from '../game/rules';
import { getCanonicalIndexForDisplay, rotateStateForPlayer } from '../game/rotateState';
import { calculateDealPoints, getTakenFromDealPoints } from '../game/scoring';
import { preloadCardImages } from '../cardAssets';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineGame } from '../contexts/useOnlineGame';
import { heartbeatPresence, recordOfflineMatchFinish } from '../lib/onlineGameSupabase';
import { isPersonalAiReplacementEnabled } from '../lib/featureFlags';
import { CardView } from './CardView';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerInfoPanel, type PlayerInfoPanelProps } from './PlayerInfoPanel';
import { TableChatDock } from './TableChatDock';
import type { Card } from '../game/types';

function getCompassLabel(idx: number): 'Юг' | 'Север' | 'Запад' | 'Восток' {
  switch (idx) {
    case 0: return 'Юг';
    case 1: return 'Север';
    case 2: return 'Запад';
    case 3: return 'Восток';
    default: return 'Юг';
  }
}

const USER_PANEL_GARLAND_DURATION_MS = 18000;
/** Мобильная рамка карт — медленнее базовой (меньше «скорость» огоньков) */
const USER_PANEL_GARLAND_HAND_DURATION_MS = 36000;
/** ПК: гирлянда после простоя пользователя (см. useEffect); мобильная панель — фиксированная задержка */
const USER_PANEL_GARLAND_IDLE_PC_MS = 7500;
/** ПК: усиленное напоминание о ходе после длительного простоя (тот же сброс по активности, что и гирлянда) */
const USER_PANEL_STRONG_NUDGE_IDLE_PC_MS = 12500;
const USER_PANEL_GARLAND_DELAY_MOBILE_MS = 9000;
const USER_PANEL_GARLAND_PATH_UNITS = 100;
/** Половина периода штриха (2.3 + 7.7), чередование голубой / сиреневый */
const USER_PANEL_GARLAND_VIOLET_PHASE = 5;
/** Пороги layout viewport (CSS px) — только при ровно 9 карт в руке (любой режим раздачи). */
const MOBILE_HAND_9_WIDE412_MIN_VW = 412;
const MOBILE_HAND_9_WIDE_MIN_VW = 400;
const MOBILE_HAND_9_MID_MIN_VW = 370;
const MOBILE_HAND_9_OVERLAP_MIN_VW = 330;
/** 313–329: средний нахлёст; ≤312 — максимальное сжатие ряда */
const MOBILE_HAND_9_ULTRA_TIGHT_MAX_VW = 312;
const MOBILE_HAND_9_OVERLAP_BASE_PX = 5;
const MOBILE_HAND_9_OVERLAP_TIGHT313_PX = 7;
const MOBILE_HAND_9_OVERLAP_ULTRA312_PX = 10;
/** 8 карт: ступени как у 9 карт только при очень узком экране — иначе 8 влезают без «девяткиного» нахлёста */
const MOBILE_HAND_8_NARROW_MAX_VW = 300;
/** ≤7 карт: сильный нахлёст при очень узком viewport (<292) */
const MOBILE_HAND_ULTRA_NARROW_MAX_VW = 292;
/** Базовый горизонтальный inset (3× от 6px); при vw < 400 — 24px — см. @media (max-width: 399px) в index.css */
const MOBILE_SOUTH_STRIP_INSET_PX = 18;
const MOBILE_SOUTH_STRIP_INSET_NARROW_PX = 24;
/** Сумма горизонтальных отступов обёртки стола (--game-header-padding слева+справа в @media max-width 600px). */
const MOBILE_TABLE_INNER_PAD_X_PX = 6;

function mobileSouthStripInsetPx(vw: number): number {
  return vw < 400 ? MOBILE_SOUTH_STRIP_INSET_NARROW_PX : MOBILE_SOUTH_STRIP_INSET_PX;
}
/** Компактная карта в руке: CardView bw=52, scale=0.72 */
const MOBILE_HAND_CARD_BODY_W = Math.round(52 * 0.72);
/** Моб. нахлёст: жест «пианино» — мягкий вход (disabled-кнопки не получают события, слушаем capture на ряду) */
const MOBILE_OVERLAP_SCRUB_ACTIVATE_DIST = 7;
const MOBILE_OVERLAP_SCRUB_ACTIVATE_DX = 5;
const MOBILE_OVERLAP_SCRUB_HOLD_MS = 220;
const MOBILE_OVERLAP_SCRUB_HOLD_NUDGE = 3;
const MOBILE_OVERLAP_SCRUB_LINGER_MS = 1000;

/**
 * Подгонка ряда под ширину колонки: сначала увеличиваем нахлёст, иначе scale<1.
 * Без overflow:hidden — карты остаются видимыми.
 */
function getMobileHandRowFit(
  vw: number,
  handLen: number,
  baseOverlap: number,
  slotPadding: number,
): { overlapPx: number; rowScale: number } {
  const inset = mobileSouthStripInsetPx(vw);
  /* Ряд живёт внутри table padding + attached + frame insets + padding-right корня */
  const gutter = inset * 4 + 2 + MOBILE_TABLE_INNER_PAD_X_PX;
  const inner = Math.max(48, vw - gutter);
  const slotOuter = MOBILE_HAND_CARD_BODY_W + 2 * slotPadding;
  if (handLen <= 0) return { overlapPx: 0, rowScale: 1 };
  if (handLen === 1) return { overlapPx: 0, rowScale: 1 };
  const maxO = Math.max(baseOverlap, slotOuter - 4);
  for (let o = Math.max(0, baseOverlap); o <= maxO; o++) {
    const w = handLen * slotOuter - (handLen - 1) * o;
    if (w <= inner) return { overlapPx: o, rowScale: 1 };
  }
  const wFull = handLen * slotOuter - (handLen - 1) * maxO;
  const rowScale = wFull > 0 ? Math.min(1, inner / wFull) : 1;
  return { overlapPx: maxO, rowScale };
}

function readMobileHandLayoutWidthPx(): number {
  if (typeof window === 'undefined') return 400;
  const vv = window.visualViewport;
  const w =
    vv != null && Number.isFinite(vv.width) && vv.width > 0 ? vv.width : window.innerWidth;
  return Math.max(0, Math.round(w));
}

/** Нахлёст между соседними картами (px), если карт < 9 — без порогов по ширине экрана */
function mobileHandOverlapBetweenCardsPx(handLen: number): number {
  if (handLen < 6) return 0;
  if (handLen >= 9) return MOBILE_HAND_9_OVERLAP_BASE_PX;
  if (handLen >= 7) return 3;
  return 2;
}

type MobileNineCardHandLayout = {
  /** Доп. классы на .game-mobile-hand-attached (кроме narrow). */
  attachExtraClass: string | null;
  /** Сузить блок руки под ряд (fit-content + align-self center). */
  useNarrowAttach: boolean;
  frameStyleExtra: CSSProperties;
  slotPadding: number;
  overlapPx: number;
};

/**
 * Раскладка мобильной руки. 9 карт — ступени по vw; 8 при vw≤MOBILE_HAND_8_NARROW_MAX_VW — те же нахлёсты, что у девятки;
 * ≤7 при vw<292 — сжатый ряд с нахлёстом.
 */
function getMobileNineCardHandLayout(vw: number, handLen: number): MobileNineCardHandLayout {
  const box = { boxSizing: 'border-box' as const };
  /** Только вертикаль — иначе перетираем padding-inline у моб. рамки (зазор карт от бордера). */
  const pv = (tb: string): CSSProperties => ({ paddingTop: tb, paddingBottom: tb, ...box });
  /** Минимум вертикали рамки (раньше 2px «съедал» отступы). */
  const vUltra = '5px';
  const vTight = vw < 360 ? '6px' : '5px';
  if (handLen === 8 && vw <= MOBILE_HAND_8_NARROW_MAX_VW) {
    if (vw >= MOBILE_HAND_9_OVERLAP_MIN_VW) {
      return {
        attachExtraClass: 'game-mobile-hand--9-overlap330',
        useNarrowAttach: true,
        frameStyleExtra: pv('5px'),
        slotPadding: 0,
        overlapPx: MOBILE_HAND_9_OVERLAP_BASE_PX,
      };
    }
    if (vw > MOBILE_HAND_9_ULTRA_TIGHT_MAX_VW) {
      return {
        attachExtraClass: 'game-mobile-hand--9-tight313',
        useNarrowAttach: true,
        frameStyleExtra: pv(vTight),
        slotPadding: 0,
        overlapPx: MOBILE_HAND_9_OVERLAP_TIGHT313_PX,
      };
    }
    return {
      attachExtraClass: 'game-mobile-hand--9-ultra312',
      useNarrowAttach: true,
      frameStyleExtra: pv(vUltra),
      slotPadding: 0,
      overlapPx: MOBILE_HAND_9_OVERLAP_ULTRA312_PX,
    };
  }
  if (handLen <= 7 && handLen >= 1 && vw < MOBILE_HAND_ULTRA_NARROW_MAX_VW) {
    const overlapPx =
      handLen >= 7 ? MOBILE_HAND_9_OVERLAP_ULTRA312_PX : handLen >= 5 ? 8 : handLen >= 3 ? 6 : 4;
    return {
      attachExtraClass: 'game-mobile-hand--9-ultra312',
      useNarrowAttach: true,
      frameStyleExtra: pv(vUltra),
      slotPadding: 0,
      overlapPx,
    };
  }
  if (handLen !== 9) {
    return {
      attachExtraClass: null,
      useNarrowAttach: false,
      frameStyleExtra: {},
      slotPadding: 2,
      overlapPx: mobileHandOverlapBetweenCardsPx(handLen),
    };
  }
  if (vw >= MOBILE_HAND_9_WIDE412_MIN_VW) {
    return {
      attachExtraClass: 'game-mobile-hand--9-wide400',
      useNarrowAttach: false,
      frameStyleExtra: pv('6px'),
      slotPadding: 2,
      overlapPx: 0,
    };
  }
  if (vw >= MOBILE_HAND_9_WIDE_MIN_VW) {
    return {
      attachExtraClass: 'game-mobile-hand--9-wide411',
      useNarrowAttach: false,
      frameStyleExtra: pv('6px'),
      slotPadding: 1,
      overlapPx: 0,
    };
  }
  if (vw >= MOBILE_HAND_9_MID_MIN_VW) {
    return {
      attachExtraClass: 'game-mobile-hand--9-mid370',
      useNarrowAttach: false,
      frameStyleExtra: pv('5px'),
      slotPadding: 0,
      overlapPx: 0,
    };
  }
  if (vw >= MOBILE_HAND_9_OVERLAP_MIN_VW) {
    return {
      attachExtraClass: 'game-mobile-hand--9-overlap330',
      useNarrowAttach: true,
      frameStyleExtra: pv('5px'),
      slotPadding: 0,
      overlapPx: MOBILE_HAND_9_OVERLAP_BASE_PX,
    };
  }
  if (vw > MOBILE_HAND_9_ULTRA_TIGHT_MAX_VW) {
    return {
      attachExtraClass: 'game-mobile-hand--9-tight313',
      useNarrowAttach: true,
      frameStyleExtra: pv(vTight),
      slotPadding: 0,
      overlapPx: MOBILE_HAND_9_OVERLAP_TIGHT313_PX,
    };
  }
  return {
    attachExtraClass: 'game-mobile-hand--9-ultra312',
    useNarrowAttach: true,
    frameStyleExtra: pv(vUltra),
    slotPadding: 0,
    overlapPx: MOBILE_HAND_9_OVERLAP_ULTRA312_PX,
  };
}

type GarlandTickSubscriber = {
  getCyan: () => SVGRectElement | null;
  getViolet: () => SVGRectElement | null;
  getDurationMs: () => number;
};

const garlandSubscribers = new Map<number, GarlandTickSubscriber>();
let garlandSubscriberId = 1;
let garlandSharedRaf = 0;
let garlandReducedMotionMq: MediaQueryList | null = null;

function garlandSharedTick() {
  garlandSharedRaf = 0;
  if (garlandSubscribers.size === 0) return;

  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    garlandSharedRaf = requestAnimationFrame(garlandSharedTick);
    return;
  }

  const reduced = typeof window !== 'undefined' && (garlandReducedMotionMq?.matches ?? false);
  if (reduced) {
    for (const sub of garlandSubscribers.values()) {
      sub.getCyan()?.style.setProperty('stroke-dashoffset', '0');
      sub.getViolet()?.style.setProperty('stroke-dashoffset', String(USER_PANEL_GARLAND_VIOLET_PHASE));
    }
  } else {
    const now = performance.now();
    for (const sub of garlandSubscribers.values()) {
      const d = Math.max(4000, sub.getDurationMs());
      const travel = (now / d) * USER_PANEL_GARLAND_PATH_UNITS;
      sub.getCyan()?.style.setProperty('stroke-dashoffset', String(-travel));
      sub.getViolet()?.style.setProperty('stroke-dashoffset', String(-travel + USER_PANEL_GARLAND_VIOLET_PHASE));
    }
  }

  garlandSharedRaf = requestAnimationFrame(garlandSharedTick);
}

function garlandSubscribe(sub: GarlandTickSubscriber): number {
  if (typeof window !== 'undefined' && !garlandReducedMotionMq) {
    garlandReducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  }
  const id = garlandSubscriberId++;
  garlandSubscribers.set(id, sub);
  if (garlandSharedRaf === 0) {
    garlandSharedRaf = requestAnimationFrame(garlandSharedTick);
  }
  return id;
}

function garlandUnsubscribe(id: number) {
  garlandSubscribers.delete(id);
  if (garlandSubscribers.size === 0 && garlandSharedRaf !== 0) {
    cancelAnimationFrame(garlandSharedRaf);
    garlandSharedRaf = 0;
  }
}

/** Гирлянда по контуру — один общий rAF на все экземпляры; durationMs для разной скорости (рука медленнее). */
function UserPanelGarlandOverlay({ durationMs = USER_PANEL_GARLAND_DURATION_MS }: { durationMs?: number } = {}) {
  const cyanGarlandRef = useRef<SVGRectElement | null>(null);
  const violetGarlandRef = useRef<SVGRectElement | null>(null);
  const durationRef = useRef(durationMs);
  durationRef.current = durationMs;

  useEffect(() => {
    const id = garlandSubscribe({
      getCyan: () => cyanGarlandRef.current,
      getViolet: () => violetGarlandRef.current,
      getDurationMs: () => durationRef.current,
    });
    return () => garlandUnsubscribe(id);
  }, []);

  return (
    <svg className="user-panel-garland" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
      {/* Геометрия: по бокам путь шире (меньше x / больше width), сверху/снизу как раньше */}
      <rect
        className="user-panel-garland-track"
        vectorEffect="nonScalingStroke"
        x="0.65"
        y="2.25"
        width="98.7"
        height="95.5"
        rx="11.5"
        ry="11.5"
        fill="none"
        stroke="rgba(100, 170, 255, 0.34)"
      />
      <rect
        ref={cyanGarlandRef}
        className="user-panel-garland-dash user-panel-garland-dash--cyan"
        vectorEffect="nonScalingStroke"
        x="0.65"
        y="2.25"
        width="98.7"
        height="95.5"
        rx="11.5"
        ry="11.5"
        fill="none"
        strokeLinecap="butt"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray="2.3 7.7"
        strokeDashoffset={0}
      />
      <rect
        ref={violetGarlandRef}
        className="user-panel-garland-dash user-panel-garland-dash--violet"
        vectorEffect="nonScalingStroke"
        x="0.65"
        y="2.25"
        width="98.7"
        height="95.5"
        rx="11.5"
        ry="11.5"
        fill="none"
        strokeLinecap="butt"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray="2.3 7.7"
        strokeDashoffset={USER_PANEL_GARLAND_VIOLET_PHASE}
      />
    </svg>
  );
}

/** Лидер по очкам в партии при max > min; при полном равенстве счёта — без подсветки. */
function isPartyScoreLeader(state: GameState, playerIndex: number): boolean {
  if (state.players.length < 2) return false;
  const scores = state.players.map((p) => p.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  return maxScore > minScore && state.players[playerIndex].score === maxScore;
}
interface GameTableProps {
  gameId: number;
  playerDisplayName?: string;
  playerAvatarDataUrl?: string | null;
  onExit: () => void;
  onNewGame?: () => void;
  /** Открыть модалку профиля (имя и фото) — для кнопки «Сменить фото» в меню аватара. */
  onOpenProfileModal?: () => void;
}

/** Сколько мс карты остаются на столе после 4‑го хода, чтобы все успели увидеть (прогрузка, онлайн). */
const FOURTH_CARD_SLOT_PAUSE_MS = 2000;
/** Пауза с картами на столе (последняя взятка раздачи) — чтобы все успели увидеть карты. */
const LAST_TRICK_CARDS_PAUSE_MS = 2000;
/** Пауза с миганием панельки взявшего взятку */
const LAST_TRICK_WINNER_PAUSE_MS = 800;
/** Длительность фазы «таблица сворачивается в кнопку» */
const DEAL_RESULTS_COLLAPSING_MS = 750;
const TRICK_PAUSE_MS = 5500;

const NEXT_PLAYER_LEFT = [2, 3, 1, 0] as const;
function getTrickPlayerIndex(trickLeaderIndex: number, cardIndex: number): number {
  let p = trickLeaderIndex;
  for (let i = 0; i < cardIndex; i++) p = NEXT_PLAYER_LEFT[p];
  return p;
}

function getTrickCardSlotStyle(playerIdx: number, isMobileOrTablet: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  };
  if (isMobileOrTablet) {
    const hw = 'var(--trick-slot-half-w, 26px)';
    const hh = 'var(--trick-slot-half-h, 38px)';
    const g = 'var(--trick-slot-gap, 2px)';
    const gridX = 'var(--trick-slot-grid-offset-x, 0)';
    const mobileBase = { ...base, left: '50%', top: '50%' };
    switch (playerIdx) {
      case 2: return { ...mobileBase, transform: `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(-50% - ${hh} - ${g}))` };
      case 1: return { ...mobileBase, transform: `translate(calc(${g} + ${gridX}), calc(-50% - ${hh} - ${g}))` };
      case 3: return { ...mobileBase, transform: `translate(calc(${g} + ${gridX}), calc(${g}))` };
      case 0: return { ...mobileBase, transform: `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(${g}))` };
      default: return { ...mobileBase, transform: `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(${g}))` };
    }
  }
  // ПК: позиционирование по сторонам стола (bottom/top/left/right)
  const offsetEdge = 'var(--trick-slot-offset-edge, 17px)';
  const offsetWestEast = 'var(--trick-slot-offset-west-east, 101px)';
  const nsOffset = 'var(--trick-slot-ns-offset-x, 28px)';
  switch (playerIdx) {
    case 0: return { ...base, bottom: offsetEdge, left: '50%', transform: `translateX(calc(-50% + ${nsOffset}))` };
    case 1: return { ...base, top: offsetEdge, left: '50%', transform: `translateX(calc(-50% - ${nsOffset}))` };
    case 2: return { ...base, left: offsetWestEast, top: '50%', transform: 'translateY(-50%)' };
    case 3: return { ...base, right: offsetWestEast, top: '50%', transform: 'translateY(-50%)' };
    default: return { ...base, bottom: offsetEdge, left: '50%', transform: 'translateX(-50%)' };
  }
}

/** Индекс игрока, чья карта пока наивысшая во взятке (или null) */
function getCurrentTrickLeaderIndex(state: GameState): number | null {
  if (state.phase !== 'playing' || state.currentTrick.length === 0) return null;
  const winnerOffset = getTrickWinner(
    state.currentTrick,
    state.currentTrick[0].suit,
    state.trump ?? undefined
  );
  return getTrickPlayerIndex(state.trickLeaderIndex, winnerOffset);
}

/** Трансформ слота — для анимации сбора карт к победителю; те же позиции, что и getTrickCardSlotStyle */
function getTrickSlotTransform(playerIdx: number, isMobileOrTablet: boolean): string {
  if (isMobileOrTablet) {
    const hw = 'var(--trick-slot-half-w, 26px)';
    const hh = 'var(--trick-slot-half-h, 38px)';
    const g = 'var(--trick-slot-gap, 2px)';
    const gridX = 'var(--trick-slot-grid-offset-x, 0)';
    switch (playerIdx) {
      case 2: return `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(-50% - ${hh} - ${g}))`;
      case 1: return `translate(calc(${g} + ${gridX}), calc(-50% - ${hh} - ${g}))`;
      case 3: return `translate(calc(${g} + ${gridX}), calc(${g}))`;
      case 0: return `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(${g}))`;
      default: return `translate(calc(-50% - ${hw} - ${g} + ${gridX}), calc(${g}))`;
    }
  }
  const ns = 'var(--trick-slot-ns-offset-x, 28px)';
  switch (playerIdx) {
    case 0: return `translate(-50%, -50%) translateY(32%) translateX(${ns})`;
    case 1: return `translate(-50%, -50%) translateY(-32%) translateX(calc(-1 * ${ns}))`;
    case 2: return 'translate(-50%, -50%) translateX(-30%)';
    case 3: return 'translate(-50%, -50%) translateX(30%)';
    default: return `translate(-50%, -50%) translateY(32%) translateX(${ns})`;
  }
}

/** Подсветка панельки игрока, чья карта пока наивысшая во взятке — слабый оранжево-жёлтый неон от границ вовнутрь */
const currentTrickLeaderGlowStyle: CSSProperties = {
  boxShadow: [
    'inset 0 0 20px rgba(251, 191, 36, 0.25)',
    'inset 0 0 0 1px rgba(251, 146, 60, 0.4)',
  ].join(', '),
};

/** Подсветка панельки игрока, которому достаётся текущая взятка (пока карты на столе). */
const trickWinnerGlowStyle: CSSProperties = {
  boxShadow: [
    'inset 0 0 24px rgba(34, 197, 94, 0.35)',
    'inset 0 0 0 2px rgba(34, 197, 94, 0.6)',
  ].join(', '),
};

/** Дополнительные тени для подсветки первого ходящего во время заказа — добавляются к существующему boxShadow панели */
const firstMoverBiddingGlowExtraShadow = [
  'inset 0 0 32px rgba(139, 92, 246, 0.28)',
  'inset 0 0 0 1px rgba(167, 139, 250, 0.45)',
].join(', ');

const trumpHighlightBtnStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '8px 14px',
  background: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(34, 211, 238, 0.55)',
  borderRadius: 8,
  color: 'rgba(34, 211, 238, 0.9)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 8px rgba(34, 211, 238, 0.15)',
  transition: 'box-shadow 0.2s, border-color 0.2s, color 0.2s',
};

/** Градиент кольца аватара оппонента: заказ на руке выполнен ровно (кольцо без пульса) */
const AVATAR_ORDER_RING_GRADIENT_EXACT =
  'linear-gradient(145deg, #f5e6ff 0%, #d8b4fe 22%, #a78bfa 45%, #818cf8 68%, #38bdf8 100%)';

/** «Нападающий» — tie-dye в CSS: .opponent-avatar-order-ring--chasing (фон + вращающийся ::after) */

function useIsMobileOrTablet() {
  /* Слоты взятки: при ≤1024px — сетка 2×2 (мобильные/планшеты), при >1024px — ПК: карты по сторонам стола */
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const handler = () => setMatch(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return match;
}

/** Только мобильная версия (<600px). Планшет и ПК = false. */
function useIsMobile() {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const handler = () => setMatch(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return match;
}

/** Модалка «Партия завершена»: праздничный экран → по «Подробнее» развёрнутый вид с таблицей, статистикой, рейтингом */
function GameOverModal({
  snapshot,
  gameId,
  onNewGame,
  onExit,
  onOpenTable,
  hideNewGame,
  /** Онлайн: индекс места на сервере (0–3); офлайн не передавать — «человек» в snapshot на месте 0. */
  viewerCanonicalSlotIndex,
}: {
  snapshot: GameState;
  gameId: number;
  onNewGame: () => void;
  onExit: () => void;
  onOpenTable: () => void;
  hideNewGame?: boolean;
  viewerCanonicalSlotIndex?: number | null;
}) {
  const [showExpanded, setShowExpanded] = useState(false);
  const humanIdx = viewerCanonicalSlotIndex ?? 0;
  const players = snapshot.players;
  const sorted = [...players]
    .map((p, i) => ({ ...p, idx: i }))
    .sort((a, b) => b.score - a.score);
  const maxScore = sorted[0]?.score ?? 0;
  const winners = sorted.filter(p => p.score === maxScore);
  const isTie = winners.length > 1;
  const humanPlace = sorted.findIndex(p => p.idx === humanIdx) + 1;
  const localRating = getLocalRating();

  const dealHistory = snapshot.dealHistory ?? [];
  /** Для каждого игрока — доля раздач (0..1), где заказ совпал с взятками (точное попадание) */
  const bidAccuracyPerPlayer = [0, 1, 2, 3].map(pi => {
    let metCount = 0;
    for (const deal of dealHistory) {
      const bid = deal.bids[pi];
      const points = deal.points[pi];
      const taken = getTakenFromDealPoints(bid, points);
      if (bid === taken) metCount++;
    }
    return dealHistory.length > 0 ? Math.round((metCount / dealHistory.length) * 100) : 0;
  });
  const bestAccuracy = bidAccuracyPerPlayer.length > 0 ? Math.max(...bidAccuracyPerPlayer) : 0;

  if (!showExpanded) {
    return (
      <div style={gameOverCelebrationWrapStyle}>
        <div className="game-over-celebration-glow" style={gameOverCelebrationInnerStyle}>
          <h2 style={gameOverCelebrationTitleStyle}>Партия завершена</h2>
          {isTie ? (
            <p style={gameOverCelebrationWinnerStyle}>
              Ничья между {winners.map(w => w.name).join(' и ')}
            </p>
          ) : (
            <>
              <p style={gameOverCelebrationWinnerStyle}>Победитель: {winners[0]?.name}</p>
              {winners[0]?.idx === humanIdx && <p style={gameOverCelebrationSuperStyle}>Супер!</p>}
            </>
          )}
          <button
            type="button"
            onClick={() => setShowExpanded(true)}
            style={gameOverButtonPrimaryStyle}
          >
            Подробнее
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={gameOverExpandedWrapStyle}>
      <h2 style={gameOverExpandedTitleStyle} id="game-over-title">Итоги партии</h2>
      <p style={gameOverPartyIdStyle}>Партия №{gameId}</p>
      <div style={gameOverTableWrapStyle}>
        <table style={gameOverTableStyle}>
          <thead>
            <tr>
              <th style={gameOverThStyle}>Место</th>
              <th style={gameOverThStyle}>Игрок</th>
              <th style={gameOverThStyle}>Очки</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, rank) => (
              <tr key={p.idx} style={p.idx === humanIdx ? gameOverTrHumanStyle : undefined}>
                <td style={gameOverTdStyle}>{rank + 1}</td>
                <td style={gameOverTdStyle}>{p.name}</td>
                <td style={gameOverTdStyle}>{p.score >= 0 ? '+' : ''}{p.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={gameOverStatsWrapStyle}>
        <div style={gameOverStatsTitleStyle}>Точность заказов</div>
        <div style={gameOverStatsHintStyle}>доля раздач, где заказ совпал с результатом (взяток взято ровно столько, сколько заказано)</div>
        {players.map((p, i) => (
          <div key={i} style={gameOverStatsRowWithBarStyle}>
            <span style={{ flexShrink: 0, ...(i === humanIdx ? gameOverStatsNameHumanStyle : undefined) }}>{p.name}</span>
            <div style={gameOverProgressTrackStyle} role="progressbar" aria-valuenow={bidAccuracyPerPlayer[i]} aria-valuemin={0} aria-valuemax={100} aria-label={`Точность заказов: ${bidAccuracyPerPlayer[i]}%`}>
              <div style={{ ...(bidAccuracyPerPlayer[i] === bestAccuracy ? gameOverProgressFillBestStyle : gameOverProgressFillStyle), width: `${bidAccuracyPerPlayer[i]}%` }} />
            </div>
            <span style={{ ...gameOverStatsValueStyle, flexShrink: 0 }}>{bidAccuracyPerPlayer[i]}%</span>
          </div>
        ))}
      </div>
      <div style={gameOverRatingWrapStyle}>
        <div style={gameOverStatsTitleStyle}>Ваш рейтинг</div>
        <div style={gameOverStatsRowStyle}>
          <span style={gameOverStatsValueStyle}>Место в этой партии: {humanPlace}</span>
        </div>
        <div style={gameOverStatsRowStyle}>
          <span style={gameOverStatsValueStyle}>Игр сыграно: {localRating.gamesPlayed}</span>
        </div>
        <div style={gameOverStatsRowStyle}>
          <span style={gameOverStatsValueStyle}>Побед: {localRating.wins}{localRating.gamesPlayed > 0 ? ` (${Math.round((localRating.wins / localRating.gamesPlayed) * 100)}%)` : ''}</span>
        </div>
        {localRating.bidAccuracyCount > 0 && (
          <div style={gameOverStatsRowStyle}>
            <span style={gameOverStatsValueStyle}>Средняя точность заказов: {Math.round(localRating.bidAccuracySum / localRating.bidAccuracyCount)}%</span>
          </div>
        )}
        <div style={gameOverRatingPlaceholderStyle}>Глобальный рейтинг — скоро</div>
      </div>
      <div style={gameOverButtonsWrapStyle}>
        <button type="button" onClick={onExit} style={gameOverButtonSecondaryStyle}>
          В меню
        </button>
        <button type="button" onClick={onOpenTable} style={gameOverButtonSecondaryStyle} title="Таблица результатов по раздачам">
          Открыть таблицу
        </button>
        {!hideNewGame && (
          <button type="button" onClick={onNewGame} style={gameOverButtonPrimaryStyle}>
            Новая партия
          </button>
        )}
      </div>
    </div>
  );
}

/** Сумма заказов vs число взяток в раздаче — цвет цифры «Заказ» на ПК (равенство суммы заказов и T по правилам не бывает) */
type DealOrderComparePc = 'over' | 'under';

function difficultyForAiPlayMove(online: boolean, st: GameState, playerIndex: number): AIDifficulty {
  if (online) return getAiDifficulty();
  return st.players[playerIndex]?.aiDifficulty ?? getAiDifficulty();
}

function GameTable({ gameId, playerDisplayName, playerAvatarDataUrl, onExit, onNewGame, onOpenProfileModal }: GameTableProps) {
  const { theme, toggleTheme } = useTheme();
  const { user } = useAuth();
  const userRef = useRef(user);
  userRef.current = user;
  const online = useOnlineGame();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const isWaitingInRoom = !!(online.roomId && online.status === 'waiting');
  const waitingState = useMemo(() => {
    if (!isWaitingInRoom) return null;
    const names: [string, string, string, string] = [0, 1, 2, 3].map((i) => {
      const s = online.playerSlots.find((sl) => sl.slotIndex === i);
      return s ? s.displayName : '—';
    }) as [string, string, string, string];
    return createGameOnline(names);
  }, [isWaitingInRoom, online.playerSlots]);
  /** Только комната + статус «идёт игра». Не требовать displayState: иначе краткий null канона после старта даёт isOnline=false и стол берёт localState вместо сервера — рассинхрон и «тормоза». */
  const isOnline = !!(online.roomId && online.status === 'playing');
  const offlineMode = !isOnline && !isWaitingInRoom;
  const isMobileOrTablet = useIsMobileOrTablet();
  const isMobile = useIsMobile();
  const [mobileHandLayoutVw, setMobileHandLayoutVw] = useState(readMobileHandLayoutWidthPx);
  useLayoutEffect(() => {
    const upd = () => setMobileHandLayoutVw(readMobileHandLayoutWidthPx());
    upd();
    window.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('resize', upd);
    window.visualViewport?.addEventListener('scroll', upd);
    return () => {
      window.removeEventListener('resize', upd);
      window.visualViewport?.removeEventListener('resize', upd);
      window.visualViewport?.removeEventListener('scroll', upd);
    };
  }, []);
  const showTableChat = !!(online.roomId && (isOnline || isWaitingInRoom) && user?.id);
  const [localState, setLocalState] = useState<GameState | null>(null);
  const [startingFromWaiting, setStartingFromWaiting] = useState(false);
  const prevOnlineAiDriveKeyRef = useRef<string | null>(null);
  const onlineAiSendFailsRef = useRef(0);
  const [onlineAiDriveRetry, setOnlineAiDriveRetry] = useState(0);
  const latestCanonicalForAiRef = useRef<GameState | null>(null);
  const latestCanonicalRef = useRef<GameState | null>(null);
  const myServerIndexForLogRef = useRef(0);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const [takingPause, setTakingPause] = useState(false);
  const [returningFromPause, setReturningFromPause] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);
  const state = isWaitingInRoom
    ? (waitingState ? rotateStateForPlayer(waitingState, online.myServerIndex) : null)
    : (isOnline ? online.displayState : localState);
  /**
   * Онлайн: displayState — новый объект при каждом опросе Supabase, хотя взятка та же.
   * Зависимость useEffect от pendingTrickCompletion по ссылке сбрасывала таймер completeTrick каждые ~280ms → стол «висел» с 4 картами минутами.
   */
  const pendingTrickCompletionKey =
    state?.pendingTrickCompletion == null
      ? null
      : `${state.dealNumber}-${state.pendingTrickCompletion.leaderIndex}-${state.pendingTrickCompletion.winnerIndex}-${state.pendingTrickCompletion.allPlayed}-${state.pendingTrickCompletion.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
  /** В онлайне и в ожидании: один и тот же порядок «вид из моего места» (0=я внизу) и имена из playerSlots по canonical-индексу. Если слоты ещё не подгрузились — хотя бы «я» из профиля. */
  const stateForRender = useMemo(() => {
    if (!state) return null;
    const slots = online.playerSlots;
    const me = online.myServerIndex;
    if (!isOnline && !isWaitingInRoom) return state;
    const base = {
      ...state,
      players: state.players.map((p, i) => ({
        ...p,
        name:
          i === 0
            ? (playerDisplayName?.trim() || 'Игрок')
            : (slots.length ? (slots.find((s) => s.slotIndex === getCanonicalIndexForDisplay(i, me))?.displayName ?? p.name) : p.name),
      })),
    };
    if (isWaitingInRoom) {
      return { ...base, dealerIndex: -1 };
    }
    return base;
  }, [state, isOnline, isWaitingInRoom, online.playerSlots, online.myServerIndex, playerDisplayName]);
  const stateToShow = stateForRender ?? state;
  const dealContractStats = useMemo(() => {
    if (!stateToShow) {
      return {
        allBidsPlaced: false,
        totalOrders: 0,
        totalTricks: 0,
        tricksInDeal: 0,
        cardsWord: 'карт' as string,
        orderCompare: null as DealOrderComparePc | null,
      };
    }
    const s = stateToShow;
    const allBidsPlaced = s.bids.length === 4 && s.bids.every((b) => b != null);
    const totalOrders = allBidsPlaced ? (s.bids as number[]).reduce((a, b) => a + b, 0) : 0;
    const totalTricks = s.players.reduce((sum, p) => sum + (p.tricksTaken ?? 0), 0);
    const tricksInDeal = s.tricksInDeal;
    const cardsWord = tricksInDeal === 1 ? 'карта' : tricksInDeal < 5 ? 'карты' : 'карт';
    const orderCompare: DealOrderComparePc | null = !allBidsPlaced
      ? null
      : totalOrders > tricksInDeal
        ? 'over'
        : 'under';
    return { allBidsPlaced, totalOrders, totalTricks, tricksInDeal, cardsWord, orderCompare };
  }, [stateToShow]);
  const setState = useCallback((updater: React.SetStateAction<GameState | null>) => {
    if (typeof updater === 'function') setLocalState(prev => updater(prev));
    else setLocalState(updater);
  }, []);
  /** Офлайн: кнопка «ИИ» в шапке — один уровень всем ботам */
  const offlineApplyAllAiFromHeader = useCallback((level: AIDifficulty) => {
    persistAllOfflineAiDifficulties(level);
    setLocalState((prev) => {
      if (!prev || prev.players[0]?.id !== 'human') return prev;
      return {
        ...prev,
        players: prev.players.map((p) =>
          p.id === 'ai1' || p.id === 'ai2' || p.id === 'ai3' ? { ...p, aiDifficulty: level } : p
        ),
      };
    });
  }, []);
  const [trickPauseUntil, setTrickPauseUntil] = useState(0);
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [bidPanelVisible, setBidPanelVisible] = useState(false);
  const [trumpHighlightOn, setTrumpHighlightOn] = useState(true);
  /** ПК: гирлянда — через USER_PANEL_GARLAND_IDLE_PC_MS бездействия (pointer/key), не с начала хода мгновенно */
  const [userTurnGarlandReady, setUserTurnGarlandReady] = useState(false);
  /** ПК: усиленный сигнал «пора ходить» после USER_PANEL_STRONG_NUDGE_IDLE_PC_MS простоя */
  const [userTurnStrongNudgePc, setUserTurnStrongNudgePc] = useState(false);
  /** Мобильная панель юга: та же гирлянда, через USER_PANEL_GARLAND_DELAY_MOBILE_MS, только playing и пока нет pendingTrickCompletion. */
  const [userTurnGarlandReadyMobile, setUserTurnGarlandReadyMobile] = useState(false);
  const [lastTrickCollectingPhase, setLastTrickCollectingPhase] = useState<'idle' | 'slots' | 'winner' | 'collapsing' | 'button'>('idle');
  const [showDealResultsButton, setShowDealResultsButton] = useState(false);
  const [dealResultsExpanded, setDealResultsExpanded] = useState(false);
  const [lastDealResultsSnapshot, setLastDealResultsSnapshot] = useState<GameState | null>(null);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showHomeConfirm, setShowHomeConfirm] = useState(false);
  const [gameOverSnapshot, setGameOverSnapshot] = useState<GameState | null>(null);
  /** Для онлайна — канонический снимок + слот; иначе dealHistory и players расходятся по индексам. */
  const [gameOverViewerSlot, setGameOverViewerSlot] = useState<number | null>(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const startFromWaitingLockRef = useRef(false);
  const [selectedPlayerForInfo, setSelectedPlayerForInfo] = useState<number | null>(null);
  const [showDealerTooltip, setShowDealerTooltip] = useState(false);
  const [showFirstMoveTooltip, setShowFirstMoveTooltip] = useState(false);
  const [showDealContractHelp, setShowDealContractHelp] = useState(false);
  /** ПК: пояснение к бейджу «Бескозырка» на торгах */
  const [showPcNoTrumpModeTooltip, setShowPcNoTrumpModeTooltip] = useState(false);
  /** ПК: пояснение к бейджу «Тёмная» на торгах */
  const [showPcDarkModeTooltip, setShowPcDarkModeTooltip] = useState(false);
  /** Мобильная бескозырка/тёмная: одна кнопка, чередование «режим» ↔ «карт/заказ». */
  const [mobileSpecialDealBadgeFace, setMobileSpecialDealBadgeFace] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [mobileOverlapScrubPeek, setMobileOverlapScrubPeek] = useState<number | null>(null);
  const mobileOverlapSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const suppressMobileOverlapClickRef = useRef(false);
  const mobileOverlapScrubPointerLockRef = useRef<number | null>(null);
  const mobileOverlapHandRowRef = useRef<HTMLDivElement | null>(null);
  const mobileOverlapScrubClearPeekTimeoutRef = useRef<number | null>(null);
  const [showYourTurnPrompt, setShowYourTurnPrompt] = useState(false);
  /** Офлайн, ≤1024px: клик по имени бота — попап уровня (якорь для портала) */
  const yourTurnPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yourTurnPromptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCompletedTrickRef = useRef<unknown>(null);
  const stateRef = useRef<GameState | null>(null);
  if (state) stateRef.current = state;

  useEffect(() => {
    const t = setTimeout(preloadCardImages, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showDealerTooltip) return;
    const t = setTimeout(() => setShowDealerTooltip(false), 2000);
    return () => clearTimeout(t);
  }, [showDealerTooltip]);
  useEffect(() => {
    if (!showFirstMoveTooltip) return;
    const t = setTimeout(() => setShowFirstMoveTooltip(false), 4000);
    return () => clearTimeout(t);
  }, [showFirstMoveTooltip]);
  useEffect(() => {
    if (!showDealContractHelp) return;
    const t = setTimeout(() => setShowDealContractHelp(false), 5500);
    return () => clearTimeout(t);
  }, [showDealContractHelp]);

  useEffect(() => {
    if (!showPcNoTrumpModeTooltip) return;
    if (
      isMobile ||
      !state ||
      getDealType(state.dealNumber) !== 'no-trump' ||
      dealContractStats.allBidsPlaced
    ) {
      setShowPcNoTrumpModeTooltip(false);
    }
  }, [showPcNoTrumpModeTooltip, isMobile, state, dealContractStats.allBidsPlaced]);

  useEffect(() => {
    if (!showPcNoTrumpModeTooltip) return;
    const t = setTimeout(() => setShowPcNoTrumpModeTooltip(false), 9000);
    return () => clearTimeout(t);
  }, [showPcNoTrumpModeTooltip]);

  useEffect(() => {
    if (!showPcDarkModeTooltip) return;
    if (
      isMobile ||
      !state ||
      getDealType(state.dealNumber) !== 'dark' ||
      dealContractStats.allBidsPlaced
    ) {
      setShowPcDarkModeTooltip(false);
    }
  }, [showPcDarkModeTooltip, isMobile, state, dealContractStats.allBidsPlaced]);

  useEffect(() => {
    if (!showPcDarkModeTooltip) return;
    const t = setTimeout(() => setShowPcDarkModeTooltip(false), 9000);
    return () => clearTimeout(t);
  }, [showPcDarkModeTooltip]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefersReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setMobileSpecialDealBadgeFace(0);
  }, [state?.dealNumber]);

  useEffect(() => {
    if (!isMobile || prefersReducedMotion || !state) return;
    const k = getDealType(state.dealNumber);
    if (k !== 'no-trump' && k !== 'dark') return;
    const id = window.setInterval(() => setMobileSpecialDealBadgeFace((f) => 1 - f), 3200);
    return () => window.clearInterval(id);
  }, [isMobile, prefersReducedMotion, state?.dealNumber]);
  /** После первого появления кнопка «Результаты» больше не скрывается до конца партии */
  const dealResultsButtonEverShownRef = useRef(false);
  /** Одна отправка завершённой офлайн-партии на сервер за монтаж игры (история аккаунта). */
  const offlineMatchRecordedRef = useRef(false);
  /** Номер раздачи, для которой уже запущена анимация результатов (один раз на раздачу, без повторов при опросе). */
  const lastAnimatedDealNumberRef = useRef<number | null>(null);
  /** Таймеры анимации результатов; очищаем только в том запуске эффекта, который их создал. */
  const dealResultsTimeoutsRef = useRef<{ main?: number; slots?: number; winner?: number; collapse?: number }>({});
  const dealResultsRunIdRef = useRef(0);
  const dealResultsTimeoutsRunIdRef = useRef(0);

  useEffect(() => {
    if (isOnline || isWaitingInRoom) return;
    const prof = getPlayerProfile();
    const humanName = prof.displayName?.trim() && prof.displayName !== 'Вы' ? prof.displayName : 'Вы';
    const restored = loadGameStateFromStorage();
    if (restored) {
      const synced = { ...restored, players: restored.players.map((p, i) => (i === 0 ? { ...p, name: humanName } : p)) };
      setLocalState(synced);
    } else {
      let s = createGame(4, 'classical', humanName);
      s = startDeal(s);
      setLocalState(s);
    }
    setTrickPauseUntil(0);
    setShowLastTrickModal(false);
    setBidPanelVisible(false);
    setShowDealResultsButton(false);
    dealResultsButtonEverShownRef.current = false;
    offlineMatchRecordedRef.current = false;
    lastAnimatedDealNumberRef.current = null;
    setDealResultsExpanded(false);
    setLastDealResultsSnapshot(null);
    setGameOverSnapshot(null);
    setShowGameOverModal(false);
  }, [gameId, isOnline, isWaitingInRoom]);

  useEffect(() => {
    if (isOnline || isWaitingInRoom) return;
    const humanName = playerDisplayName?.trim() && playerDisplayName !== 'Вы' ? playerDisplayName : 'Вы';
    setLocalState((prev) => {
      if (!prev) return prev;
      if (prev.players[0]?.name === humanName) return prev;
      return { ...prev, players: prev.players.map((p, i) => (i === 0 ? { ...p, name: humanName } : p)) };
    });
  }, [playerDisplayName, isOnline, isWaitingInRoom]);

  useEffect(() => {
    if (isOnline || isWaitingInRoom || state === null) return;
    saveGameStateToStorage(state);
  }, [state, isOnline, isWaitingInRoom]);

  useEffect(() => {
    if (isOnline || isWaitingInRoom) return;
    const flush = () => {
      const s = stateRef.current;
      if (s) saveGameStateToStorage(s);
    };
    window.addEventListener('pagehide', flush);
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [isOnline, isWaitingInRoom]);

  const waitingRefreshDoneRef = useRef(false);
  useEffect(() => {
    waitingRefreshDoneRef.current = false;
  }, [online.roomId]);

  useEffect(() => {
    if (!isWaitingInRoom || !online.roomId || !online.refreshRoom) return;
    if (waitingRefreshDoneRef.current) return;
    const t = setTimeout(() => {
      waitingRefreshDoneRef.current = true;
      online.refreshRoom();
    }, 120);
    return () => clearTimeout(t);
  }, [isWaitingInRoom, online.roomId, online.refreshRoom]);

  useEffect(() => {
    if (dealResultsExpanded && isMobile) {
      document.body.classList.add('deal-results-modal-open-mobile');
      return () => document.body.classList.remove('deal-results-modal-open-mobile');
    }
  }, [dealResultsExpanded, isMobile]);

  const humanIdx = isOnline || isWaitingInRoom ? 0 : 0;
  const isHumanTurn = state?.phase === 'playing' && state.currentPlayerIndex === humanIdx;
  const isHumanBidding = (state?.phase === 'bidding' || state?.phase === 'dark-bidding') && state.currentPlayerIndex === humanIdx;

  useLayoutEffect(() => {
    if (!isMobile || !state) return;
    const len = state.players[humanIdx].hand.length;
    const arr = mobileOverlapSlotRefs.current;
    if (arr.length > len) arr.length = len;
  }, [isMobile, state, humanIdx]);

  useEffect(() => {
    return () => {
      const t = mobileOverlapScrubClearPeekTimeoutRef.current;
      if (t != null) window.clearTimeout(t);
    };
  }, []);

  const handleMobileHandRowPointerDownCapture = useCallback(
    (e: ReactPointerEvent<Element>) => {
      if (!isMobile || prefersReducedMotion) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const pointerId = e.pointerId;
      if (mobileOverlapScrubPointerLockRef.current != null) return;
      mobileOverlapScrubPointerLockRef.current = pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const startTime = performance.now();
      let scrubbing = false;
      let lastPeek: number | null = null;
      let finished = false;

      const pickIndex = (cx: number, cy: number): number | null => {
        if (typeof document !== 'undefined' && document.elementFromPoint) {
          const hit = document.elementFromPoint(cx, cy);
          if (hit) {
            const slot = hit.closest('[data-mobile-hand-slot]');
            if (slot instanceof HTMLElement) {
              const raw = slot.getAttribute('data-mobile-hand-slot');
              const n = raw != null ? Number.parseInt(raw, 10) : NaN;
              if (Number.isFinite(n)) return n;
            }
          }
        }
        const slots = mobileOverlapSlotRefs.current;
        for (let i = slots.length - 1; i >= 0; i--) {
          const el = slots[i];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return i;
        }
        let best: number | null = null;
        let bestDx = Infinity;
        for (let i = 0; i < slots.length; i++) {
          const el = slots[i];
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (cy < r.top - 40 || cy > r.bottom + 40) continue;
          const mx = (r.left + r.right) / 2;
          const d = Math.abs(cx - mx);
          if (d < bestDx) {
            bestDx = d;
            best = i;
          }
        }
        return best;
      };

      const applyPeek = (cx: number, cy: number) => {
        const idx = pickIndex(cx, cy);
        if (idx == null) return;
        if (idx !== lastPeek) {
          lastPeek = idx;
          setMobileOverlapScrubPeek(idx);
        }
      };

      const clearPeek = () => {
        lastPeek = null;
        setMobileOverlapScrubPeek(null);
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        const rowEl = mobileOverlapHandRowRef.current;
        if (rowEl && typeof rowEl.releasePointerCapture === 'function') {
          try {
            if (rowEl.hasPointerCapture?.(pointerId)) rowEl.releasePointerCapture(pointerId);
          } catch {
            /* release after target detached */
          }
        }
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onEnd, true);
        document.removeEventListener('pointercancel', onEnd, true);
        if (scrubbing && lastPeek != null) {
          const lingerIdx = lastPeek;
          mobileOverlapScrubClearPeekTimeoutRef.current = window.setTimeout(() => {
            mobileOverlapScrubClearPeekTimeoutRef.current = null;
            setMobileOverlapScrubPeek((cur) => (cur === lingerIdx ? null : cur));
          }, MOBILE_OVERLAP_SCRUB_LINGER_MS);
        } else {
          clearPeek();
        }
        if (scrubbing) {
          suppressMobileOverlapClickRef.current = true;
          window.setTimeout(() => {
            suppressMobileOverlapClickRef.current = false;
          }, 450);
        }
        scrubbing = false;
        mobileOverlapScrubPointerLockRef.current = null;
      };

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || finished) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const dist = Math.hypot(dx, dy);
        const elapsed = performance.now() - startTime;
        if (!scrubbing) {
          const activate =
            dist >= MOBILE_OVERLAP_SCRUB_ACTIVATE_DIST ||
            Math.abs(dx) >= MOBILE_OVERLAP_SCRUB_ACTIVATE_DX ||
            (elapsed >= MOBILE_OVERLAP_SCRUB_HOLD_MS && dist >= MOBILE_OVERLAP_SCRUB_HOLD_NUDGE);
          if (!activate) return;
          scrubbing = true;
          const rowEl = mobileOverlapHandRowRef.current;
          if (rowEl && typeof rowEl.setPointerCapture === 'function') {
            try {
              rowEl.setPointerCapture(pointerId);
            } catch {
              /* already captured elsewhere */
            }
          }
          applyPeek(ev.clientX, ev.clientY);
        }
        applyPeek(ev.clientX, ev.clientY);
      };

      const onEnd = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        finish();
      };

      document.addEventListener('pointermove', onMove, { passive: true, capture: true });
      document.addEventListener('pointerup', onEnd, { capture: true });
      document.addEventListener('pointercancel', onEnd, { capture: true });
    },
    [isMobile, prefersReducedMotion],
  );

  const isUserActiveTurnForGarland =
    !isMobileOrTablet &&
    !!state &&
    trumpHighlightOn &&
    state.currentPlayerIndex === humanIdx;
  useEffect(() => {
    if (!isUserActiveTurnForGarland) {
      setUserTurnGarlandReady(false);
      setUserTurnStrongNudgePc(false);
      return;
    }
    setUserTurnGarlandReady(false);
    setUserTurnStrongNudgePc(false);
    let garlandTimeoutId: number | undefined;
    let strongNudgeTimeoutId: number | undefined;
    /** Базовая точка для порога «заметного» движения мыши (сброс усиленной подсветки) */
    let lastMoveX = -1;
    let lastMoveY = -1;
    const armIdleTimers = () => {
      if (garlandTimeoutId !== undefined) window.clearTimeout(garlandTimeoutId);
      if (strongNudgeTimeoutId !== undefined) window.clearTimeout(strongNudgeTimeoutId);
      garlandTimeoutId = window.setTimeout(() => setUserTurnGarlandReady(true), USER_PANEL_GARLAND_IDLE_PC_MS);
      strongNudgeTimeoutId = window.setTimeout(() => setUserTurnStrongNudgePc(true), USER_PANEL_STRONG_NUDGE_IDLE_PC_MS);
    };
    const armStrongNudgeTimerOnly = () => {
      if (strongNudgeTimeoutId !== undefined) window.clearTimeout(strongNudgeTimeoutId);
      strongNudgeTimeoutId = window.setTimeout(() => setUserTurnStrongNudgePc(true), USER_PANEL_STRONG_NUDGE_IDLE_PC_MS);
    };
    const onUserActivity = () => {
      lastMoveX = -1;
      lastMoveY = -1;
      setUserTurnGarlandReady(false);
      setUserTurnStrongNudgePc(false);
      armIdleTimers();
    };
    /** Существенный сдвиг курсора снимает только усиленную подсветку хода; гирлянда по таймеру 7.5 с не сбрасывается */
    const MOUSE_MOVE_STRONG_NUDGE_CLEAR_PX = 12;
    const onMouseMoveDismissStrongNudgePc = (e: MouseEvent) => {
      if (lastMoveX < 0) {
        lastMoveX = e.clientX;
        lastMoveY = e.clientY;
        return;
      }
      const dx = e.clientX - lastMoveX;
      const dy = e.clientY - lastMoveY;
      const thresh = MOUSE_MOVE_STRONG_NUDGE_CLEAR_PX;
      if (dx * dx + dy * dy < thresh * thresh) return;
      lastMoveX = e.clientX;
      lastMoveY = e.clientY;
      setUserTurnStrongNudgePc(false);
      armStrongNudgeTimerOnly();
    };
    armIdleTimers();
    const moveListenerOpts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', onUserActivity, true);
    window.addEventListener('keydown', onUserActivity, true);
    window.addEventListener('mousemove', onMouseMoveDismissStrongNudgePc, moveListenerOpts);
    return () => {
      window.removeEventListener('pointerdown', onUserActivity, true);
      window.removeEventListener('keydown', onUserActivity, true);
      window.removeEventListener('mousemove', onMouseMoveDismissStrongNudgePc, moveListenerOpts);
      if (garlandTimeoutId !== undefined) window.clearTimeout(garlandTimeoutId);
      if (strongNudgeTimeoutId !== undefined) window.clearTimeout(strongNudgeTimeoutId);
    };
  }, [isUserActiveTurnForGarland]);

  const isUserActiveTurnForGarlandMobile =
    isMobile &&
    !!state &&
    trumpHighlightOn &&
    state.phase === 'playing' &&
    state.currentPlayerIndex === humanIdx &&
    !state.pendingTrickCompletion;
  useEffect(() => {
    if (!isUserActiveTurnForGarlandMobile) {
      setUserTurnGarlandReadyMobile(false);
      return;
    }
    setUserTurnGarlandReadyMobile(false);
    const id = window.setTimeout(() => setUserTurnGarlandReadyMobile(true), USER_PANEL_GARLAND_DELAY_MOBILE_MS);
    return () => window.clearTimeout(id);
  }, [isUserActiveTurnForGarlandMobile]);

  const dealJustCompleted = !!state?.lastCompletedTrick && state.players.every(p => p.hand.length === 0);
  const shouldShowBidPanel = isHumanBidding && !dealJustCompleted && state?.phase !== 'deal-complete';

  useEffect(() => {
    if (shouldShowBidPanel) {
      const t = setTimeout(() => setBidPanelVisible(true), 140);
      return () => clearTimeout(t);
    }
    setBidPanelVisible(false);
  }, [shouldShowBidPanel]);

  /** Мобильная: через 3.5 с бездействия — «Ваш ход!»/«Ваш заказ!», затем каждые 3.5 с чередование с именем (мигание) */
  useEffect(() => {
    if (!isMobile || !state) return;
    const isUserTurnToAct =
      state.currentPlayerIndex === humanIdx &&
      (state.phase === 'playing' ||
        ((state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids[humanIdx] === null));
    if (isUserTurnToAct) {
      yourTurnPromptTimeoutRef.current = setTimeout(() => {
        setShowYourTurnPrompt(true);
        yourTurnPromptIntervalRef.current = setInterval(
          () => setShowYourTurnPrompt(p => !p),
          3500
        );
      }, 3500);
      return () => {
        if (yourTurnPromptTimeoutRef.current) clearTimeout(yourTurnPromptTimeoutRef.current);
        yourTurnPromptTimeoutRef.current = null;
        if (yourTurnPromptIntervalRef.current) clearInterval(yourTurnPromptIntervalRef.current);
        yourTurnPromptIntervalRef.current = null;
        setShowYourTurnPrompt(false);
      };
    }
    setShowYourTurnPrompt(false);
    return () => {
      if (yourTurnPromptTimeoutRef.current) clearTimeout(yourTurnPromptTimeoutRef.current);
      yourTurnPromptTimeoutRef.current = null;
    };
  }, [isMobile, state?.currentPlayerIndex, state?.phase, state?.bids, humanIdx]);

  const validPlays = state && isHumanTurn ? getValidPlays(state, humanIdx) : [];

  const invalidBid =
    state && isHumanBidding && state.dealerIndex === humanIdx &&
    state.bids[1] !== null && state.bids[2] !== null && state.bids[3] !== null
      ? state.tricksInDeal - (state.bids[1]! + state.bids[2]! + state.bids[3]!)
      : null;

  const handleBid = useCallback((bid: number) => {
    if (isOnline) {
      online.sendBid(bid);
      return;
    }
    setLocalState(prev => prev && placeBid(prev, humanIdx, bid));
  }, [humanIdx, isOnline, online]);

  const handleBidRef = useRef(handleBid);
  handleBidRef.current = handleBid;

  const handleExit = useCallback(() => {
    onExit();
  }, [onExit]);

  const handleHomeClick = useCallback(() => {
    if (isOnline || isWaitingInRoom) {
      setShowHomeConfirm(true);
    } else {
      onExit();
    }
  }, [isOnline, isWaitingInRoom, onExit]);

  const handleHomeConfirm = useCallback(async () => {
    setShowHomeConfirm(false);
    await online.leaveRoom?.();
    onExit();
  }, [online, onExit]);

  const handleLeaveRoomClick = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleExitConfirm = useCallback(async () => {
    if (isWaitingInRoom || isOnline) await online.leaveRoom();
    setShowExitConfirm(false);
    onExit();
  }, [isOnline, isWaitingInRoom, online, onExit]);

  const handleStartFromWaiting = useCallback(async () => {
    if (startFromWaitingLockRef.current) return;
    startFromWaitingLockRef.current = true;
    setStartingFromWaiting(true);
    try {
      await online.startGame();
    } finally {
      startFromWaitingLockRef.current = false;
      setStartingFromWaiting(false);
    }
  }, [online]);

  useEffect(() => {
    if (!online.playerLeftToast) return;
    const t = setTimeout(() => online.clearPlayerLeftToast(), 5000);
    return () => clearTimeout(t);
  }, [online.playerLeftToast, online.clearPlayerLeftToast]);

  // Онлайн: отправка heartbeat для актуального presence во время партии.
  useEffect(() => {
    if (!isOnline || !online.roomId || !user?.id) return;
    const roomId = online.roomId;
    const userId = user.id;
    heartbeatPresence(roomId, userId);
    const iv = setInterval(() => {
      if (roomId && userId) heartbeatPresence(roomId, userId);
    }, 25_000);
    return () => clearInterval(iv);
  }, [isOnline, online.roomId, user?.id]);

  const dealJustCompletedKey =
    state?.lastCompletedTrick && state.players.every((p) => p.hand.length === 0)
      ? state.dealNumber
      : null;

  useLayoutEffect(() => {
    const runId = ++dealResultsRunIdRef.current;
    const timeouts = dealResultsTimeoutsRef.current;

    if (dealJustCompletedKey === null) {
      lastCompletedTrickRef.current = null;
      lastAnimatedDealNumberRef.current = null;
      setLastTrickCollectingPhase('idle');
      return () => {};
    }

    if (lastAnimatedDealNumberRef.current === dealJustCompletedKey) return () => {};

    lastAnimatedDealNumberRef.current = dealJustCompletedKey;
    if (!dealResultsButtonEverShownRef.current) setShowDealResultsButton(false);
    lastCompletedTrickRef.current = stateRef.current?.lastCompletedTrick ?? null;

    const clearStoredTimeouts = () => {
      if (timeouts.main != null) clearTimeout(timeouts.main);
      if (timeouts.slots != null) clearTimeout(timeouts.slots);
      if (timeouts.winner != null) clearTimeout(timeouts.winner);
      if (timeouts.collapse != null) clearTimeout(timeouts.collapse);
      timeouts.main = timeouts.slots = timeouts.winner = timeouts.collapse = undefined;
    };
    clearStoredTimeouts();

    dealResultsTimeoutsRunIdRef.current = runId;
    setTrickPauseUntil(Date.now() + TRICK_PAUSE_MS);
    timeouts.main = window.setTimeout(() => {
      timeouts.main = undefined;
      setTrickPauseUntil(0);
      const current = stateRef.current;
      if (current?.phase === 'deal-complete') {
        if (isOnline) onlineRef.current?.sendStartNextDeal?.();
        else
          setLocalState((prev) =>
            prev?.phase === 'deal-complete' ? startNextDeal(prev) ?? prev : prev ?? null
          );
      }
    }, TRICK_PAUSE_MS);

    setLastTrickCollectingPhase('slots');
    timeouts.slots = window.setTimeout(() => {
      timeouts.slots = undefined;
      setLastTrickCollectingPhase('winner');
      timeouts.winner = window.setTimeout(() => {
        timeouts.winner = undefined;
        setLastTrickCollectingPhase('collapsing');
        timeouts.collapse = window.setTimeout(() => {
          timeouts.collapse = undefined;
          setLastTrickCollectingPhase('button');
          const o = onlineRef.current;
          const canonicalSnap = o?.canonicalState;
          const snap = canonicalSnap ?? stateRef.current;
          if (snap?.dealNumber === 28) {
            setGameOverSnapshot(snap);
            setGameOverViewerSlot(canonicalSnap != null ? o.myServerIndex : null);
            setShowGameOverModal(true);
            if (!canonicalSnap && snap) {
              const maxScore = Math.max(...snap.players.map((p) => p.score));
              const humanWon = snap.players[0].score === maxScore;
              let bidAccuracy = 0;
              if (snap.dealHistory?.length) {
                let met = 0;
                for (const d of snap.dealHistory) {
                  const bid = d.bids[0];
                  const pts = d.points[0];
                  if (bid == null) continue;
                  const taken = getTakenFromDealPoints(bid, pts);
                  if (bid === taken) met++;
                }
                bidAccuracy = Math.round((met / snap.dealHistory.length) * 100);
              }
              updateLocalRating(humanWon, undefined, bidAccuracy);
              if (userRef.current?.id && !offlineMatchRecordedRef.current) {
                offlineMatchRecordedRef.current = true;
                const name =
                  playerDisplayName?.trim() && playerDisplayName !== 'Вы'
                    ? playerDisplayName
                    : getPlayerProfile().displayName?.trim() || 'Вы';
                void recordOfflineMatchFinish(snap, name).then((r) => {
                  if (!r.ok) offlineMatchRecordedRef.current = false;
                });
              }
            }
          } else if (snap) {
            setShowDealResultsButton(true);
            dealResultsButtonEverShownRef.current = true;
            setLastDealResultsSnapshot(
              canonicalSnap && o
                ? rotateStateForPlayer(snap, o.myServerIndex)
                : snap,
            );
            const dh = snap.dealHistory;
            if (dh?.length) {
              const last = dh[dh.length - 1];
              const myIdx = isOnline ? myServerIndexForLogRef.current : 0;
              const bid = last.bids[myIdx] ?? 0;
              const points = last.points[myIdx] ?? 0;
              const taken = getTakenFromDealPoints(bid, points);
              const profileId = getPlayerProfile().profileId;
              if (profileId) {
                logDealOutcome(profileId, snap.dealNumber, snap.tricksInDeal, !!snap.trump, bid, taken, points);
              }
            }
          }
        }, DEAL_RESULTS_COLLAPSING_MS);
      }, LAST_TRICK_WINNER_PAUSE_MS);
    }, LAST_TRICK_CARDS_PAUSE_MS);

    return () => {
      if (dealResultsTimeoutsRunIdRef.current === runId) {
        clearStoredTimeouts();
      }
    };
  }, [dealJustCompletedKey, isOnline, playerDisplayName]);

  useEffect(() => {
    if (pendingTrickCompletionKey == null) return;
    const t = setTimeout(() => {
      if (isOnline) {
        void online.sendCompleteTrick();
      } else {
        setLocalState(prev => prev && completeTrick(prev));
      }
    }, FOURTH_CARD_SLOT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [pendingTrickCompletionKey, isOnline, online.sendCompleteTrick]);

  // Онлайн: ход бота только если в player_slots у текущего места userId пустой, либо слота ещё нет, но имя в game_state — встроенный бот («ИИ …»). Иначе при лаге слотов хост не подменяет ход человека.
  const currentPlayerSlot = online.canonicalState ? online.playerSlots.find((s) => s.slotIndex === online.canonicalState!.currentPlayerIndex) : undefined;
  const canonicalAiTurn =
    !!online.canonicalState &&
    (online.canonicalState.players[online.canonicalState.currentPlayerIndex]?.name ?? '').startsWith('ИИ ');
  const seatIsAiSlot =
    currentPlayerSlot != null && (currentPlayerSlot.userId == null || currentPlayerSlot.userId === '');
  const isOnlineAiTurn =
    isOnline &&
    !!online.canonicalState &&
    !online.canonicalState.pendingTrickCompletion &&
    (online.canonicalState.phase === 'bidding' ||
      online.canonicalState.phase === 'dark-bidding' ||
      online.canonicalState.phase === 'playing') &&
    (seatIsAiSlot || (currentPlayerSlot == null && canonicalAiTurn));

  const isAITurn =
    (isOnline && isOnlineAiTurn) ||
    (!isOnline &&
      !!state &&
      !state.pendingTrickCompletion &&
      (state.phase === 'bidding' || state.phase === 'dark-bidding' || state.phase === 'playing') &&
      !isHumanPlayer(state, state.currentPlayerIndex));

  const accelerateAI = useCallback(() => {
    if (!state) return;
    const idx = state.currentPlayerIndex;
    if (state.phase === 'bidding' || state.phase === 'dark-bidding') {
      const bid = aiBid(state, idx);
      setState(prev => prev && placeBid(prev, idx, bid));
    } else if (state.phase === 'playing') {
      const card = aiPlay(state, idx, difficultyForAiPlayMove(isOnline, state, idx));
      if (card) setState(prev => prev && playCard(prev, idx, card));
    }
  }, [state, isOnline]);

  /** Офлайн: тикер ИИ. В онлайне состояние с сервера — локальный setState не обновляет стол (ход ИИ шлёт sendState отдельным эффектом). */
  useEffect(() => {
    if (isOnline || !isAITurn || !state) return;
    const iv = setInterval(() => {
      setState(s => {
        if (!s) return s;
        const idx = s.currentPlayerIndex;
        if (s.phase === 'bidding' || s.phase === 'dark-bidding') {
          const bid = aiBid(s, idx);
          return placeBid(s, idx, bid);
        }
        if (s.phase === 'playing') {
          const card = aiPlay(s, idx, difficultyForAiPlayMove(false, s, idx));
          return card ? playCard(s, idx, card) : s;
        }
        return s;
      });
    }, 650);
    return () => clearInterval(iv);
  }, [isOnline, isAITurn, state?.phase, state?.currentPlayerIndex]);

  if (isOnline && online.canonicalState) {
    latestCanonicalForAiRef.current = online.canonicalState;
    latestCanonicalRef.current = online.canonicalState;
    myServerIndexForLogRef.current = online.myServerIndex ?? 0;
  }
  // Онлайн: ход бота шлёт только хост (слот 0). Два открытых клиента с одним аккаунтом редки; два разных — оба слали sendState → конфликты ревизий и откаты ходов человека.
  // Нельзя отменять ход по «ключу уже обработан»: при новой ссылке canonicalState с тем же ключом cleanup снимает таймер, а ранний return не ставил новый — ИИ замирал.
  useEffect(() => {
    if (!isOnlineAiTurn || !online.canonicalState || !online.sendState) return;
    if (online.myServerIndex !== 0) return;
    const c = online.canonicalState;
    const scheduleKey = `${c.dealNumber}-${c.phase}-${c.currentPlayerIndex}-${c.bids?.join(',')}-${c.currentTrick?.length}`;
    if (prevOnlineAiDriveKeyRef.current !== scheduleKey) {
      prevOnlineAiDriveKeyRef.current = scheduleKey;
      onlineAiSendFailsRef.current = 0;
    }
    const sendStateFn = online.sendState;
    const tid = window.setTimeout(async () => {
      const current = latestCanonicalForAiRef.current;
      if (!current) return;
      const currentKey = `${current.dealNumber}-${current.phase}-${current.currentPlayerIndex}-${current.bids?.join(',')}-${current.currentTrick?.length}`;
      if (currentKey !== scheduleKey) return;
      const playerIdx = current.currentPlayerIndex;
      const slotsNow = onlineRef.current.playerSlots;
      const uid = userRef.current?.id;
      const replacedByMe = slotsNow.find((s) => s.slotIndex === playerIdx)?.replacedUserId === uid;
      const personalProfileId =
        replacedByMe && isPersonalAiReplacementEnabled(uid) ? (getPlayerProfile().profileId ?? undefined) : undefined;
      let next: GameState | null = null;
      if (current.phase === 'bidding' || current.phase === 'dark-bidding') {
        const bid = aiBid(current, playerIdx, personalProfileId);
        next = placeBid(current, playerIdx, bid);
      } else if (current.phase === 'playing') {
        const card = aiPlay(current, playerIdx, getAiDifficulty());
        if (card) next = playCard(current, playerIdx, card);
        else {
          onlineAiSendFailsRef.current += 1;
          if (onlineAiSendFailsRef.current <= 8) {
            window.setTimeout(() => setOnlineAiDriveRetry((n) => n + 1), 400);
          }
          return;
        }
      }
      if (next) {
        const ok = await sendStateFn(next);
        if (!ok) {
          onlineAiSendFailsRef.current += 1;
          if (onlineAiSendFailsRef.current <= 8) {
            window.setTimeout(() => setOnlineAiDriveRetry((n) => n + 1), 500);
          }
        }
      }
    }, 150);
    return () => window.clearTimeout(tid);
  }, [isOnlineAiTurn, online.canonicalState, online.sendState, onlineAiDriveRetry]);

  const showReclaimBar = (isOnline || (online.roomId && online.status === 'playing')) && online.pendingReclaimOffer && online.confirmReclaim;
  if (!state) {
    return (
      <>
        <div style={{ padding: 20 }}>Загрузка...</div>
        {showReclaimBar && (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998, padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))', background: 'linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(15,23,42,0.99) 100%)', borderTop: '1px solid rgba(34, 211, 238, 0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button type="button" disabled={reclaiming} onClick={async () => { setReclaiming(true); await online.confirmReclaim?.(); setReclaiming(false); }} style={{ padding: '14px 24px', fontSize: 16, fontWeight: 600, borderRadius: 10, border: '2px solid rgba(34, 211, 238, 0.6)', background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)', color: '#f8fafc', cursor: reclaiming ? 'wait' : 'pointer' }}>
              {reclaiming ? 'Возврат…' : 'Вернуть игру в свои руки'}
            </button>
          </div>
        )}
      </>
    );
  }

  const displayState = stateToShow as GameState;
  const offlineAiNamePickEnabled = offlineMode && displayState.players[0]?.id === 'human';
  /** Офлайн-бот: уровень ИИ в той же панели, что и инфо (ПК и мобильная/планшет ≤1024) */
  const playerInfoOfflineAiDifficultyPicker: PlayerInfoPanelProps['offlineAiDifficultyPicker'] =
    !offlineAiNamePickEnabled || selectedPlayerForInfo == null
      ? undefined
      : (() => {
          const idx = selectedPlayerForInfo;
          const id = displayState.players[idx]?.id;
          if (id !== 'ai1' && id !== 'ai2' && id !== 'ai3') return undefined;
          return {
            current: displayState.players[idx]?.aiDifficulty ?? getAiDifficulty(),
            onSelect: (level: AIDifficulty) => {
              const botId = state.players[idx]?.id;
              if (botId === 'ai1' || botId === 'ai2' || botId === 'ai3')
                persistOfflineAiDifficultyForBotId(botId, level);
              setLocalState((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  players: prev.players.map((p, i) =>
                    i === idx ? { ...p, aiDifficulty: level } : p,
                  ),
                };
              });
            },
          };
        })();
  const biddingPhaseMobileClass =
    isMobile && (displayState.phase === 'bidding' || displayState.phase === 'dark-bidding')
      ? ' game-phase-bidding'
      : '';
  /** Бескозырка (раздачи 21–24): цветовая тема в CSS (.deal-type-no-trump) — мобильная и ПК */
  const dealTypeNoTrump = getDealType(displayState.dealNumber) === 'no-trump';
  const dealTypeDark = getDealType(displayState.dealNumber) === 'dark';
  /** ПК: кликабельный бейдж «Бескозырка» с тултипом, пока идут торги */
  const pcNoTrumpModeBadgeAsButton =
    !isMobile && dealTypeNoTrump && !dealContractStats.allBidsPlaced;
  /** ПК: кликабельный бейдж «Тёмная» с тултипом, пока идут торги */
  const pcDarkModeBadgeAsButton =
    !isMobile && dealTypeDark && !dealContractStats.allBidsPlaced;

  /** Юг: «заказ на руке ровно» (в т.ч. заказ 0 при 0 взяток) — то же условие, что exact-кольцо аватара; не во время анимации слотов взятки */
  const humanCollectingTrickSlots =
    dealJustCompleted &&
    (lastTrickCollectingPhase === 'slots' ||
      lastTrickCollectingPhase === 'winner' ||
      lastTrickCollectingPhase === 'collapsing');
  const humanBidForOrderRingRaw = state.bids[humanIdx] ?? state.players[humanIdx].bid;
  const humanBidForOrderRingN =
    humanBidForOrderRingRaw == null || Number.isNaN(Number(humanBidForOrderRingRaw))
      ? null
      : Number(humanBidForOrderRingRaw);
  const humanTricksTakenForOrderRing = (() => {
    const n = Number(state.players[humanIdx].tricksTaken);
    return Number.isFinite(n) ? n : 0;
  })();
  const userOrderRingExact =
    humanBidForOrderRingN !== null &&
    !humanCollectingTrickSlots &&
    humanTricksTakenForOrderRing === humanBidForOrderRingN;
  /** Мобильная панель Юга: градиентная рамка как у аватара при выполненном на руках заказе без перебора */
  const userMobilePanelOrderExactGlow = isMobile && userOrderRingExact;

  /**
   * Аватар пользователя с кольцом заказа — как у OpponentSlot: span с градиентом СНАРУЖИ, внутри button → аватар.
   * Если кольцо вложить в button, браузер часто обрезает padding/фон («кольца не видно»).
   */
  const renderUserPlayerAvatar = (avatarSizePx: number) => {
    const p = state.players[humanIdx];
    const bidN = humanBidForOrderRingN;
    const tt = humanTricksTakenForOrderRing;
    const orderRingExact = userOrderRingExact;
    const orderRingChasing =
      (state.phase === 'playing' || state.phase === 'trick-complete') &&
      bidN !== null &&
      !humanCollectingTrickSlots &&
      tt < bidN;
    const orderRingMode: 'exact' | 'chasing' | null = orderRingExact
      ? 'exact'
      : orderRingChasing
        ? 'chasing'
        : null;
    const innerCls = orderRingMode ? 'player-avatar-order-ring-inner' : undefined;
    /** ПК: при «заказ на руке ровно» — чуть крупнее лицо + толще ободок (padding снаружи) */
    const avatarFaceSizePx =
      orderRingMode === 'exact' && !isMobileOrTablet ? avatarSizePx + 3 : avatarSizePx;
    const avatarBtnStyle: CSSProperties = {
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      display: 'inline-flex',
      lineHeight: 0,
    };
    const title = online.roomId ? 'Меню (пауза, информация)' : 'Информация об игроке';
    const ariaLabel = online.roomId ? `Меню ${p.name}` : `Информация об игроке ${p.name}`;
    const face = (
      <PlayerAvatar
        name={displayState.players[humanIdx].name}
        avatarDataUrl={playerAvatarDataUrl}
        sizePx={avatarFaceSizePx}
        className={innerCls}
      />
    );
    const avatarRootCls = 'user-player-avatar-root';
    const avatarButton = (
      <button
        type="button"
        className={avatarRootCls}
        onClick={() => (online.roomId ? setShowAvatarMenu(true) : setSelectedPlayerForInfo(0))}
        style={avatarBtnStyle}
        title={title}
        aria-label={ariaLabel}
      >
        {face}
      </button>
    );
    if (!orderRingMode) return avatarButton;
    const ringPaddingNarrow = isMobile;
    const wrapStyle: CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      /* exact: на ПК ободок 6px с каждой стороны; на мобильной/планшете — 5px */
      padding:
        orderRingMode === 'exact'
          ? isMobileOrTablet
            ? 5
            : 6
          : ringPaddingNarrow
            ? 4
            : 4,
      boxSizing: 'border-box',
      lineHeight: 0,
      ...(orderRingMode === 'exact' ? { background: AVATAR_ORDER_RING_GRADIENT_EXACT } : {}),
      position: 'relative',
      zIndex: 2,
    };
    const wrapCls =
      orderRingMode === 'exact'
        ? 'opponent-avatar-order-ring opponent-avatar-order-ring--exact'
        : 'opponent-avatar-order-ring opponent-avatar-order-ring--chasing';
    /* Масштаб 1.2 снаружи: пульс chasing крутит transform на внутреннем span — не смешиваем с scale */
    return (
      <span className="user-player-avatar-order-scale-wrap user-player-avatar-root">
        <span className={wrapCls} style={wrapStyle}>
          {avatarButton}
        </span>
      </span>
    );
  };

  /* Мобильная вёрстка (viewport-mobile при width ≤600px): рука внизу, слоты взятки в сетке 2×2, козырь на колоде; стили в index.css @media (max-width: 1024px) .game-table-root.viewport-mobile */
  return (
    <div className={`game-table-root${isMobile ? ' viewport-mobile' : ''}${showTableChat && isMobile ? ' game-mobile-table-chat' : ''}${trumpHighlightOn ? ' trump-highlight-on' : ''}${biddingPhaseMobileClass}${dealTypeNoTrump ? ' deal-type-no-trump' : ''}`} style={{ ...tableLayoutStyle, ...(isOnline && online.pendingReclaimOffer ? { paddingBottom: 80 } : {}) }}>
      {isOnline && online.userOnPause && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pause-overlay-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            padding: 24,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '2px solid rgba(34, 211, 238, 0.5)',
              padding: 32,
              maxWidth: 360,
              width: '100%',
              textAlign: 'center',
            }}
          >
            <h2 id="pause-overlay-title" style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 700, color: '#e2e8f0' }}>
              Вы на паузе
            </h2>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: '#94a3b8' }}>
              За вас играет ИИ. Верните управление, когда будете готовы.
            </p>
            <button
              type="button"
              disabled={returningFromPause}
              onClick={async () => {
                setReturningFromPause(true);
                await online.returnFromPause?.();
                setReturningFromPause(false);
              }}
              style={{
                padding: '14px 24px',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid rgba(34, 211, 238, 0.5)',
                background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                color: '#f8fafc',
                cursor: returningFromPause ? 'wait' : 'pointer',
                opacity: returningFromPause ? 0.8 : 1,
              }}
            >
              {returningFromPause ? 'Возврат…' : 'Вернуть управление'}
            </button>
          </div>
        </div>
      )}
      {online.roomId && showAvatarMenu && !online.userOnPause && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Меню игрока"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 10003,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 16px calc(120px + env(safe-area-inset-bottom, 0px))',
          }}
          onClick={() => setShowAvatarMenu(false)}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34, 211, 238, 0.35)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
              minWidth: 280,
              maxWidth: 320,
              maxHeight: 'min(85vh, 420px)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <PlayerAvatar name={playerDisplayName || state?.players[0]?.name || 'Вы'} avatarDataUrl={playerAvatarDataUrl} sizePx={52} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: '#f8fafc', marginBottom: 2 }}>
                    {playerDisplayName || state?.players[0]?.name || 'Вы'}
                  </div>
                  {state && (
                    <div style={{ fontSize: 13, color: '#94a3b8' }}>
                      Очки: <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{state.players[0].score}</span>
                      {state.bids[0] != null && (
                        <> · Текущий заказ: <span style={{ color: '#e2e8f0' }}>{state.bids[0]}</span></>
                      )}
                      {state.phase === 'playing' && (
                        <> · Взяток: <span style={{ color: '#e2e8f0' }}>{state.players[0].tricksTaken}</span></>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding: '12px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', WebkitOverflowScrolling: 'touch' as const, flex: '1 1 auto', minHeight: 0 }}>
              {onOpenProfileModal && (
                <button
                  type="button"
                  onClick={() => { onOpenProfileModal(); setShowAvatarMenu(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(34,211,238,0.4)',
                    background: 'rgba(34,211,238,0.12)',
                    color: '#67e8f9',
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(34,211,238,0.2)';
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.6)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(34,211,238,0.12)';
                    e.currentTarget.style.borderColor = 'rgba(34,211,238,0.4)';
                  }}
                >
                  <span aria-hidden>📷</span> Сменить фото
                </button>
              )}
              <button
                type="button"
                onClick={() => { setSelectedPlayerForInfo(0); setShowAvatarMenu(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: '1px solid rgba(148,163,184,0.3)',
                  background: 'rgba(51,65,85,0.6)',
                  color: '#e2e8f0',
                  fontSize: 15,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(71,85,105,0.8)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.5)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(51,65,85,0.6)';
                  e.currentTarget.style.borderColor = 'rgba(148,163,184,0.3)';
                }}
              >
                <span aria-hidden>ℹ️</span> Подробнее об игроке
              </button>
              {online.status === 'playing' && online.takePause && (
                <button
                  type="button"
                  disabled={takingPause}
                  onClick={async () => {
                    setTakingPause(true);
                    await online.takePause?.();
                    setTakingPause(false);
                    setShowAvatarMenu(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(251,146,60,0.4)',
                    background: takingPause ? 'rgba(251,146,60,0.2)' : 'rgba(251,146,60,0.15)',
                    color: '#fb923c',
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: takingPause ? 'wait' : 'pointer',
                    opacity: takingPause ? 0.8 : 1,
                    transition: 'background 0.2s, border-color 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (!takingPause) {
                      e.currentTarget.style.background = 'rgba(251,146,60,0.25)';
                      e.currentTarget.style.borderColor = 'rgba(251,146,60,0.6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = takingPause ? 'rgba(251,146,60,0.2)' : 'rgba(251,146,60,0.15)';
                    e.currentTarget.style.borderColor = 'rgba(251,146,60,0.4)';
                  }}
                >
                  <span aria-hidden>⏸</span> {takingPause ? 'Пауза…' : 'Взять паузу'}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {isOnline && online.playerLeftToast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: 8,
            background: '#1e293b',
            border: '1px solid rgba(34,211,238,0.4)',
            color: '#f8fafc',
            zIndex: 10000,
            fontSize: 14,
            maxWidth: '90%',
            textAlign: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          Игрок {online.playerLeftToast} покинул игру. Партия продолжается с ИИ вместо него.
        </div>
      )}
      {(isOnline || (online.roomId && online.status === 'playing')) && online.pendingReclaimOffer && online.confirmReclaim && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 9998,
            padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
            background: 'linear-gradient(180deg, rgba(15,23,42,0.97) 0%, rgba(15,23,42,0.99) 100%)',
            borderTop: '1px solid rgba(34, 211, 238, 0.4)',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            disabled={reclaiming}
            onClick={async () => {
              setReclaiming(true);
              await online.confirmReclaim?.();
              setReclaiming(false);
            }}
            style={{
              padding: '14px 24px',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 10,
              border: '2px solid rgba(34, 211, 238, 0.6)',
              background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
              color: '#f8fafc',
              cursor: reclaiming ? 'wait' : 'pointer',
              boxShadow: '0 0 16px rgba(34, 211, 238, 0.25)',
              opacity: reclaiming ? 0.9 : 1,
            }}
            aria-label="Вернуть игру в свои руки"
          >
            {reclaiming ? 'Возврат…' : 'Вернуть игру в свои руки'}
          </button>
        </div>
      )}
      {isMobileOrTablet && showDealerTooltip && (
        <div className="dealer-tooltip-toast toast-with-close" role="status" aria-live="polite">
          Сдающий
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setShowDealerTooltip(false)}
            aria-label="Закрыть подсказку"
          >
            ×
          </button>
        </div>
      )}
      {isMobile && showFirstMoveTooltip && state && (state.phase === 'bidding' || state.phase === 'dark-bidding') && (
        <div className="first-move-tooltip-toast dealer-tooltip-toast toast-with-close first-move-tooltip-toast-dismissible" role="status" aria-live="polite">
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setShowFirstMoveTooltip(false)}
            aria-label="Закрыть подсказку"
          >
            ×
          </button>
          <div className="first-move-tooltip-name">{displayState.players[state.trickLeaderIndex].name}</div>
          <div style={{ fontSize: 12, opacity: 0.9 }}>У данного игрока будет первый ход в этой раздаче</div>
        </div>
      )}
      {!isMobile && showPcNoTrumpModeTooltip && state && getDealType(state.dealNumber) === 'no-trump' && (
        <div
          className="dealer-tooltip-toast toast-with-close no-trump-mode-pc-tooltip"
          role="dialog"
          aria-modal="false"
          aria-labelledby="no-trump-mode-pc-tooltip-title"
        >
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setShowPcNoTrumpModeTooltip(false)}
            aria-label="Закрыть подсказку"
          >
            ×
          </button>
          <div id="no-trump-mode-pc-tooltip-title" className="no-trump-mode-pc-tooltip-title">
            Режим «Бескозырка»
          </div>
          <div className="no-trump-mode-pc-tooltip-body">
            В этой партии четыре раздачи подряд (№21–№24) идут без козыря: при раздаче козырь не назначается, старшинство в масти как обычно. Сейчас вы в одной из этих раздач — закажите взятки как в обычном раунде.
          </div>
        </div>
      )}
      {!isMobile && showPcDarkModeTooltip && state && getDealType(state.dealNumber) === 'dark' && (
        <div
          className="dealer-tooltip-toast toast-with-close dark-mode-pc-tooltip"
          role="dialog"
          aria-modal="false"
          aria-labelledby="dark-mode-pc-tooltip-title"
        >
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setShowPcDarkModeTooltip(false)}
            aria-label="Закрыть подсказку"
          >
            ×
          </button>
          <div id="dark-mode-pc-tooltip-title" className="dark-mode-pc-tooltip-title">
            Режим «Тёмная»
          </div>
          <div className="dark-mode-pc-tooltip-body">
            В этой партии четыре раздачи подряд (№25–№28) — «тёмные»: сначала все игроки делают заказ, не видя своих карт. После того как заказы приняты, карты сдаются, козырь определяется последней картой у сдающего, и раздача идёт как обычно. Сейчас вы на этапе заказа — ориентируйтесь на счёт партии и договорённости за столом.
          </div>
        </div>
      )}
      {showDealContractHelp && state && (
        <div className="first-move-tooltip-toast dealer-tooltip-toast deal-contract-tooltip-toast toast-with-close" role="status" aria-live="polite">
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setShowDealContractHelp(false)}
            aria-label="Закрыть подсказку"
          >
            ×
          </button>
          {dealContractStats.allBidsPlaced ? (
            <>
              <div className="deal-contract-tooltip-heading" style={{ fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>
                Текущая раздача
              </div>
              {isMobile ? (
                <div
                  className="deal-contract-tooltip-mobile-summary"
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    marginBottom: 10,
                    color: '#f8fafc',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.35,
                  }}
                >
                  Заказ: {dealContractStats.totalOrders}; Взяток: {dealContractStats.totalTricks}/{dealContractStats.tricksInDeal}
                </div>
              ) : null}
              {displayState.players.map((p, i) => (
                <div key={i} className="deal-contract-tooltip-player" style={{ fontSize: 13, opacity: 0.95, marginBottom: 4 }}>
                  {p.name}: заказ {displayState.bids[i] ?? '—'}, взяток {p.tricksTaken}
                </div>
              ))}
              <div
                className="deal-contract-tooltip-footer"
                style={{ marginTop: 10, fontSize: 12, opacity: 0.88, lineHeight: 1.45 }}
              >
                Сумма заказов — {dealContractStats.totalOrders}, сыграно взяток — {dealContractStats.totalTricks} из {dealContractStats.tricksInDeal}. Сумма заказов может не совпадать с числом взяток — это нормально.
                {getDealType(state.dealNumber) !== 'no-trump' && getDealType(state.dealNumber) !== 'dark' ? (
                  <> Карт у каждого: {dealContractStats.tricksInDeal} ({dealContractStats.cardsWord}).</>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <div className="deal-contract-tooltip-heading" style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>
                Размер раздачи
              </div>
              <div className="deal-contract-tooltip-body" style={{ fontSize: 13, opacity: 0.95, lineHeight: 1.45 }}>
                В этой раздаче у каждого по {dealContractStats.tricksInDeal} {dealContractStats.cardsWord} на руке (всего {dealContractStats.tricksInDeal * 4} карт). Когда все игроки сделают заказы, бейдж покажет сумму заказов и взятых взяток — нажмите снова для списка по игрокам.
              </div>
            </>
          )}
        </div>
      )}
      <div style={tableStyle}>
      <header className="game-header" style={headerStyle}>
        <div style={headerLeftWrapStyle}>
          <div style={headerMenuButtonsWrapStyle}>
            {isMobile && !isWaitingInRoom && (state.phase === 'bidding' || state.phase === 'dark-bidding') ? (
              <div className="first-move-badge-hang-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                <div className="header-menu-buttons-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="header-exit-btn"
                    onClick={handleHomeClick}
                    style={exitBtnStyle}
                    title="В меню"
                    aria-label="В меню"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  </button>
                  {(isOnline || isWaitingInRoom) && (
                    <button
                      type="button"
                      className={['header-exit-btn', isMobile ? 'header-room-exit-btn' : ''].filter(Boolean).join(' ')}
                      onClick={handleLeaveRoomClick}
                      style={exitBtnStyle}
                      title={isWaitingInRoom ? 'Выйти из комнаты' : 'Выйти из комнаты (сессия сбросится)'}
                      aria-label="Выйти из комнаты"
                    >
                      {isMobile ? <HeaderRoomExitIcon /> : <span style={{ fontSize: 14 }}>Выйти</span>}
                    </button>
                  )}
                  {onNewGame && !isOnline && !isWaitingInRoom && (
                    <button
                      type="button"
                      className="header-new-game-btn"
                      onClick={() => setShowNewGameConfirm(true)}
                      style={newGameBtnStyle}
                      title="Обновить — новая партия"
                      aria-label="Обновить — новая партия"
                    >
                      ↻
                    </button>
                  )}
                  <AiDifficultyControl
                    layout="mobile"
                    offlineApplyDifficultyToAllBots={offlineMode ? offlineApplyAllAiFromHeader : undefined}
                  />
                </div>
                <button
                  type="button"
                  className="first-move-badge first-move-badge-clickable first-move-badge-below-home"
                  style={{ ...firstMoveBadgeStyle, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
                  onClick={() => setShowFirstMoveTooltip(true)}
                  title={`${displayState.players[state.trickLeaderIndex].name} — у данного игрока будет первый ход в этой раздаче`}
                  aria-label={`Первый ход: ${displayState.players[state.trickLeaderIndex].name}. Нажмите для подсказки`}
                >
                  <span className="first-move-num" style={firstMoveLabelStyle}>I:</span>
                  <span style={firstMoveValueStyle}>{displayState.players[state.trickLeaderIndex].name}</span>
                </button>
              </div>
            ) : isMobile ? (
              <div className="header-menu-buttons-row" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  className="header-exit-btn"
                  onClick={handleHomeClick}
                  style={exitBtnStyle}
                  title="В меню"
                  aria-label="В меню"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </button>
                {(isOnline || isWaitingInRoom) && (
                  <button
                    type="button"
                    className={['header-exit-btn', isMobile ? 'header-room-exit-btn' : ''].filter(Boolean).join(' ')}
                    onClick={handleLeaveRoomClick}
                    style={exitBtnStyle}
                    title={isWaitingInRoom ? 'Выйти из комнаты' : 'Выйти из комнаты (сессия сбросится)'}
                    aria-label="Выйти из комнаты"
                  >
                    {isMobile ? <HeaderRoomExitIcon /> : <span style={{ fontSize: 14 }}>Выйти</span>}
                  </button>
                )}
                {onNewGame && !isOnline && !isWaitingInRoom && (
                  <button
                    type="button"
                    className="header-new-game-btn"
                    onClick={() => setShowNewGameConfirm(true)}
                    style={newGameBtnStyle}
                    title="Обновить — новая партия"
                    aria-label="Обновить — новая партия"
                  >
                    ↻
                  </button>
                )}
                <AiDifficultyControl
                  layout="mobile"
                  offlineApplyDifficultyToAllBots={offlineMode ? offlineApplyAllAiFromHeader : undefined}
                />
              </div>
            ) : (
              <div
                className="header-menu-buttons-col-pc"
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}
              >
                <button
                  type="button"
                  className="header-exit-btn"
                  onClick={handleHomeClick}
                  style={exitBtnStyle}
                  title="В меню"
                  aria-label="В меню"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </button>
                {(isOnline || isWaitingInRoom) && (
                  <button
                    type="button"
                    className="header-exit-btn"
                    onClick={handleLeaveRoomClick}
                    style={exitBtnStyle}
                    title={isWaitingInRoom ? 'Выйти из комнаты' : 'Выйти из комнаты (сессия сбросится)'}
                    aria-label="Выйти из комнаты"
                  >
                    <span style={{ fontSize: 14 }}>Выйти</span>
                  </button>
                )}
                {onNewGame && !isOnline && !isWaitingInRoom && (
                  <button
                    type="button"
                    className="header-new-game-btn"
                    onClick={() => setShowNewGameConfirm(true)}
                    style={newGameBtnStyle}
                    title="Обновить — новая партия"
                    aria-label="Обновить — новая партия"
                  >
                    ↻
                  </button>
                )}
                <AiDifficultyControl
                  layout="pc"
                  offlineApplyDifficultyToAllBots={offlineMode ? offlineApplyAllAiFromHeader : undefined}
                />
              </div>
            )}
          </div>
        </div>
        <div style={headerRightWrapStyle}>
          <div style={headerRightTopRowStyle}>
            {!isWaitingInRoom && (showDealResultsButton || (state.dealHistory && state.dealHistory.length > 0)) && (
              <button
                type="button"
                onClick={() => {
                  setLastDealResultsSnapshot(state);
                  setDealResultsExpanded(true);
                }}
                style={dealResultsButtonStyle}
                className="deal-results-btn"
                title="Результаты раздачи"
                aria-label="Показать результаты раздачи"
              >
                Σ
              </button>
            )}
            {!isWaitingInRoom && (
            <div style={dealNumberBadgeStyle} className="deal-number-badge">
              <span style={dealNumberLabelStyle}>Раздача</span>
              <span style={dealNumberValueStyle}><span className="deal-num-symbol" aria-hidden>№</span><span className="deal-num-value">{state.dealNumber}</span></span>
            </div>
            )}
            {!isWaitingInRoom && (
            <button
            type="button"
            onClick={() => setTrumpHighlightOn(v => !v)}
          style={{
            ...trumpHighlightBtnStyle,
            ...(trumpHighlightOn
              ? {
                  border: '1px solid rgba(34, 211, 238, 0.9)',
                  color: '#5eead4',
                  boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.4), 0 0 12px rgba(94, 234, 212, 0.4), 0 0 18px rgba(34, 211, 238, 0.25)',
                }
              : { color: 'rgba(251, 146, 60, 0.7)' }),
          }}
          title={trumpHighlightOn ? 'Выключить дополнительную подсветку' : 'Включить дополнительную подсветку'}
        >
          <svg
            width="18"
            height="20"
            viewBox="0 0 18 20"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={!trumpHighlightOn ? 'trump-btn-lamp-off' : undefined}
            style={trumpHighlightOn ? { filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.6)) drop-shadow(0 0 8px rgba(94, 234, 212, 0.5))' } : undefined}
          >
            <path d="M9 2c-3.3 0-6 2.7-6 6 0 2.2 1.2 4.1 3 5.2v2.3c0 .6.4 1 1 1h4c.6 0 1-.4 1-1v-2.3c1.8-1.1 3-3 3-5.2 0-3.3-2.7-6-6-6z" />
            <path d="M9 15v2" />
            <path d="M6 19h6" />
          </svg>
          {trumpHighlightOn ? 'Выключить' : 'Включить'}
        </button>
            )}
            {isMobile && (
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={theme === 'neon' ? 'Стандарт' : 'Неоновая'}
                aria-label={theme === 'neon' ? 'Переключить на стандартную тему' : 'Переключить на неоновую тему'}
                style={{
                  width: 32,
                  height: 28,
                  padding: 4,
                  borderRadius: 8,
                  border: '1px solid rgba(34, 211, 238, 0.55)',
                  background: 'rgba(15, 23, 42, 0.9)',
                  color: theme === 'neon' ? '#67e8f9' : '#fbbf24',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 8px rgba(34, 211, 238, 0.15)',
                }}
              >
                {theme === 'neon' ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}>
                    <text x="12" y="17" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">S</text>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ filter: 'drop-shadow(0 0 4px rgba(34,211,238,0.8))' }}>
                    <circle cx="12" cy="12" r="6" />
                  </svg>
                )}
              </button>
            )}
          </div>
          {isOnline && online.myServerIndex === 0 && online.returnSlotToPlayer && online.playerSlots.some((s) => s.replacedUserId) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 6 }}>
              {online.playerSlots.map((s) =>
                s.replacedUserId && s.replacedDisplayName ? (
                  <button
                    key={s.slotIndex}
                    type="button"
                    onClick={() => online.returnSlotToPlayer?.(s.slotIndex)}
                    style={{
                      padding: '6px 12px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid rgba(34, 211, 238, 0.5)',
                      background: 'rgba(14, 116, 144, 0.4)',
                      color: '#e2e8f0',
                      cursor: 'pointer',
                    }}
                    title={`Вернуть управление игроку ${s.replacedDisplayName}`}
                  >
                    Вернуть {s.replacedDisplayName}
                  </button>
                ) : null
              )}
            </div>
          )}
          {(getDealType(state.dealNumber) === 'no-trump' || getDealType(state.dealNumber) === 'dark') ? (
            isMobile ? (
              <button
                type="button"
                className="game-info-deal-contract-panel game-info-cards-panel"
                style={gameInfoDealContractPanelStyle}
                onClick={() => setShowDealContractHelp(true)}
                title={
                  dealContractStats.allBidsPlaced
                    ? `Режим: ${getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : 'Тёмная'}. Заказ: ${dealContractStats.totalOrders}; Взяток: ${dealContractStats.totalTricks}/${dealContractStats.tricksInDeal}. Нажмите — подробности`
                    : `Режим: ${getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : 'Тёмная'}. В раздаче ${dealContractStats.tricksInDeal} ${dealContractStats.cardsWord} у каждого. Нажмите — подробности`
                }
                aria-label={
                  dealContractStats.allBidsPlaced
                    ? `Режим ${getDealType(state.dealNumber) === 'no-trump' ? 'бескозырка' : 'тёмная'}. Заказ ${dealContractStats.totalOrders}, взяток ${dealContractStats.totalTricks} из ${dealContractStats.tricksInDeal}. Показать по игрокам`
                    : `Режим ${getDealType(state.dealNumber) === 'no-trump' ? 'бескозырка' : 'тёмная'}. В раздаче ${dealContractStats.tricksInDeal} ${dealContractStats.cardsWord} у каждого. Показать по игрокам`
                }
              >
                {prefersReducedMotion ? (
                  <span
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 2,
                      width: '100%',
                      minHeight: 28,
                    }}
                  >
                    <span className="deal-contract-line deal-contract-mobile-mode-alternate" style={dealContractMobileModeAlternateLineStyle}>
                      {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : 'Тёмная'}
                    </span>
                    {dealContractStats.allBidsPlaced ? (
                      <span
                        className="deal-contract-line deal-contract-line-mobile-split"
                        style={dealContractLineMobileSplitOuterStyle}
                      >
                        <span className="deal-contract-mobile-order" style={dealContractMobileOrderStyle}>
                          З: {dealContractStats.totalOrders}
                        </span>
                        <span className="deal-contract-mobile-sep" style={dealContractMobileSepStyle} aria-hidden="true">
                          ;{' '}
                        </span>
                        <DealContractMobileTricksNumbers
                          taken={dealContractStats.totalTricks}
                          dealTotal={dealContractStats.tricksInDeal}
                        />
                      </span>
                    ) : (
                      <>
                        <span className="deal-contract-label" style={dealContractCardsLabelStyle}>
                          Карт
                        </span>
                        <span className="deal-contract-value" style={dealContractCardsValueStyle}>
                          {dealContractStats.tricksInDeal} {dealContractStats.cardsWord}
                        </span>
                      </>
                    )}
                  </span>
                ) : mobileSpecialDealBadgeFace === 0 ? (
                  <span
                    className="deal-contract-line deal-contract-mobile-mode-alternate"
                    style={{ ...dealContractMobileAlternateSlotStyle, ...dealContractMobileModeAlternateLineStyle }}
                  >
                    {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : 'Тёмная'}
                  </span>
                ) : dealContractStats.allBidsPlaced ? (
                  <span style={dealContractMobileAlternateSlotStyle}>
                    <span
                      className="deal-contract-line deal-contract-line-mobile-split"
                      style={dealContractLineMobileSplitOuterStyle}
                    >
                      <span className="deal-contract-mobile-order" style={dealContractMobileOrderStyle}>
                        З: {dealContractStats.totalOrders}
                      </span>
                      <span className="deal-contract-mobile-sep" style={dealContractMobileSepStyle} aria-hidden="true">
                        ;{' '}
                      </span>
                      <DealContractMobileTricksNumbers
                        taken={dealContractStats.totalTricks}
                        dealTotal={dealContractStats.tricksInDeal}
                      />
                    </span>
                  </span>
                ) : (
                  <span style={dealContractMobileAlternateSlotStyle}>
                    <>
                      <span className="deal-contract-label" style={dealContractCardsLabelStyle}>
                        Карт
                      </span>
                      <span className="deal-contract-value" style={dealContractCardsValueStyle}>
                        {dealContractStats.tricksInDeal} {dealContractStats.cardsWord}
                      </span>
                    </>
                  </span>
                )}
              </button>
            ) : pcNoTrumpModeBadgeAsButton ? (
              <button
                type="button"
                className="game-info-mode-panel game-info-mode-panel-pc-no-trump-bidding"
                style={{
                  ...gameInfoModePanelStyle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  font: 'inherit',
                  textAlign: 'inherit',
                  cursor: 'pointer',
                  border: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
                onClick={() => {
                  setShowDealContractHelp(false);
                  setShowPcDarkModeTooltip(false);
                  setShowPcNoTrumpModeTooltip(true);
                }}
                title="Что значит бескозырка в этой партии"
                aria-label="Пояснение: четыре раздачи подряд без козыря (номера 21–24)"
              >
                <div className="game-info-mode-panel-head" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className="game-info-mode-panel-tag"
                    style={{
                      ...gameInfoLabelStyle,
                      marginBottom: 0,
                      fontSize: 11,
                      lineHeight: 1,
                    }}
                  >
                    Режим
                  </span>
                  <span
                    className="game-info-mode-panel-name"
                    style={{
                      ...gameInfoValueStyle,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    Бескозырка
                  </span>
                </div>
              </button>
            ) : pcDarkModeBadgeAsButton ? (
              <button
                type="button"
                className="game-info-mode-panel game-info-mode-panel-pc-dark-bidding"
                style={{
                  ...gameInfoModePanelStyle,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  font: 'inherit',
                  textAlign: 'inherit',
                  cursor: 'pointer',
                  border: 'none',
                  appearance: 'none',
                  WebkitAppearance: 'none',
                }}
                onClick={() => {
                  setShowDealContractHelp(false);
                  setShowPcNoTrumpModeTooltip(false);
                  setShowPcDarkModeTooltip(true);
                }}
                title="Что значит тёмная раздача в этой партии"
                aria-label="Пояснение: четыре раздачи с заказом до раздачи карт (номера 25–28)"
              >
                <div className="game-info-mode-panel-head" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className="game-info-mode-panel-tag game-info-dark-mode-tag"
                    style={{
                      ...gameInfoLabelStyle,
                      marginBottom: 0,
                      fontSize: 11,
                      lineHeight: 1,
                      ...gameInfoDarkModeTagLabelOverride,
                    }}
                  >
                    Режим
                  </span>
                  <span
                    className="game-info-mode-panel-name game-info-dark-mode-name"
                    style={{
                      ...gameInfoValueStyle,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    Тёмная
                  </span>
                </div>
              </button>
            ) : (
              <div
                className={`game-info-mode-panel${
                  getDealType(state.dealNumber) === 'no-trump'
                    ? ' game-info-mode-panel-pc-no-trump-wrap'
                    : ' game-info-mode-panel-pc-dark-wrap'
                }`}
                style={{
                  ...gameInfoModePanelStyle,
                  flexDirection: dealContractStats.allBidsPlaced ? 'column' : 'row',
                  alignItems: dealContractStats.allBidsPlaced ? 'stretch' : 'center',
                  gap: dealContractStats.allBidsPlaced ? 8 : 6,
                  padding: dealContractStats.allBidsPlaced ? '8px 12px' : '6px 12px',
                }}
              >
                <div className="game-info-mode-panel-head" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    className={`game-info-mode-panel-tag${getDealType(state.dealNumber) === 'dark' ? ' game-info-dark-mode-tag' : ''}`}
                    style={{
                      ...gameInfoLabelStyle,
                      marginBottom: 0,
                      fontSize: 11,
                      lineHeight: 1,
                      ...(getDealType(state.dealNumber) === 'dark' ? gameInfoDarkModeTagLabelOverride : {}),
                    }}
                  >
                    Режим
                  </span>
                  <span
                    className={`game-info-mode-panel-name${getDealType(state.dealNumber) === 'dark' ? ' game-info-dark-mode-name' : ''}`}
                    style={{
                      ...gameInfoValueStyle,
                      fontSize: 14,
                      lineHeight: 1,
                    }}
                  >
                    {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : 'Тёмная'}
                  </span>
                </div>
                {dealContractStats.allBidsPlaced ? (
                  <button
                    type="button"
                    className="game-info-deal-contract-panel game-info-deal-contract-panel--in-mode"
                    style={{ ...gameInfoDealContractPanelStyle, padding: '5px 10px', minHeight: 30 }}
                    onClick={() => setShowDealContractHelp(true)}
                    title="Подробности по игрокам"
                    aria-label={`Заказ ${dealContractStats.totalOrders}, взяток ${dealContractStats.totalTricks} из ${dealContractStats.tricksInDeal}. Показать по игрокам`}
                  >
                    {dealContractStats.orderCompare != null ? (
                      <DealContractPcSummaryLine
                        totalOrders={dealContractStats.totalOrders}
                        totalTricks={dealContractStats.totalTricks}
                        tricksInDeal={dealContractStats.tricksInDeal}
                        orderCompare={dealContractStats.orderCompare}
                      />
                    ) : (
                      <span className="deal-contract-line" style={dealContractLineTextStyle}>
                        Заказ: {dealContractStats.totalOrders}; Взяток: {dealContractStats.totalTricks}/{dealContractStats.tricksInDeal}
                      </span>
                    )}
                  </button>
                ) : null}
              </div>
            )
          ) : (
            <button
              type="button"
              className="game-info-deal-contract-panel game-info-cards-panel"
              style={gameInfoDealContractPanelStyle}
              onClick={() => setShowDealContractHelp(true)}
              title={
                dealContractStats.allBidsPlaced
                  ? isMobile
                    ? `Заказ: ${dealContractStats.totalOrders}; Взяток: ${dealContractStats.totalTricks}/${dealContractStats.tricksInDeal}. Нажмите — подробности по игрокам`
                    : 'Подробности по игрокам'
                  : 'Сколько карт в раздаче'
              }
              aria-label={
                dealContractStats.allBidsPlaced
                  ? `Заказ ${dealContractStats.totalOrders}, взяток ${dealContractStats.totalTricks} из ${dealContractStats.tricksInDeal}. Показать по игрокам`
                  : `В раздаче ${dealContractStats.tricksInDeal} ${dealContractStats.cardsWord} у каждого`
              }
            >
              {dealContractStats.allBidsPlaced ? (
                isMobile ? (
                  <span
                    className="deal-contract-line deal-contract-line-mobile-split"
                    style={dealContractLineMobileSplitOuterStyle}
                  >
                    <span className="deal-contract-mobile-order" style={dealContractMobileOrderStyle}>
                      З: {dealContractStats.totalOrders}
                    </span>
                    <span className="deal-contract-mobile-sep" style={dealContractMobileSepStyle} aria-hidden="true">
                      ;{' '}
                    </span>
                    <DealContractMobileTricksNumbers
                      taken={dealContractStats.totalTricks}
                      dealTotal={dealContractStats.tricksInDeal}
                    />
                  </span>
                ) : dealContractStats.orderCompare != null ? (
                  <DealContractPcSummaryLine
                    totalOrders={dealContractStats.totalOrders}
                    totalTricks={dealContractStats.totalTricks}
                    tricksInDeal={dealContractStats.tricksInDeal}
                    orderCompare={dealContractStats.orderCompare}
                  />
                ) : (
                  <span className="deal-contract-line" style={dealContractLineTextStyle}>
                    Заказ: {dealContractStats.totalOrders}; Взяток: {dealContractStats.totalTricks}/{dealContractStats.tricksInDeal}
                  </span>
                )
              ) : (
                <>
                  <span className="deal-contract-label" style={dealContractCardsLabelStyle}>
                    Карт
                  </span>
                  <span className="deal-contract-value" style={dealContractCardsValueStyle}>
                    {dealContractStats.tricksInDeal} {dealContractStats.cardsWord}
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </header>

      <div className={isMobile ? 'game-table-block game-table-block-mobile' : undefined} style={gameTableBlockStyle}>
      {isMobile ? (
        /* Мобильная раскладка: Север+Запад над столом, стол вертикальный, Восток+Юг под столом */
        <>
          <div className="game-mobile-upper-board" style={gameMobileUpperBoardStyle}>
            <div className="game-info-left-col" style={gameInfoLeftColumnStyle}>
              {!isWaitingInRoom && (state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                <div className="game-info-left-section" style={gameInfoLeftSectionStyle}>
            {!isWaitingInRoom && state.phase === 'playing' && (
                    <div style={{ ...gameInfoBadgeStyle, ...gameInfoActiveBadgeStyle }}>
                      <span style={gameInfoLabelStyle}>Сейчас ход</span>
                      <span style={{ ...gameInfoValueStyle, color: '#22c55e' }}>{displayState.players[state.currentPlayerIndex].name}</span>
                    </div>
                  )}
                  {(state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                    <div style={{ ...gameInfoBadgeStyle, ...gameInfoBiddingBadgeStyle }}>
                      <span style={gameInfoLabelStyle}>Заказывает</span>
                      <span style={{ ...gameInfoValueStyle, color: '#f59e0b' }}>
                        {displayState.players[state.currentPlayerIndex].name}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="game-mobile-top-row" style={{ ...gameInfoTopRowStyle, justifyContent: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
            <div className="game-mobile-slot-west" style={{ display: 'flex', flexShrink: 0 }}>
              <OpponentSlot state={displayState} index={2} position="left" inline compactMode={isMobileOrTablet}
                avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(2, online.myServerIndex))?.avatarDataUrl ?? undefined}
                replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(2, online.myServerIndex))?.replacedUserId}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 2}
                trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 2}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 2}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
                offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
              />
            </div>
            <div className="game-mobile-slot-north" style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
              <OpponentSlot state={displayState} index={1} position="top" inline compactMode={isMobileOrTablet}
                avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(1, online.myServerIndex))?.avatarDataUrl ?? undefined}
                replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(1, online.myServerIndex))?.replacedUserId}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 1}
                trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 1}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 1}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
                offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
              />
            </div>
            </div>
          </div>
          <div className="game-center-spacer-top" style={centerAreaSpacerTopStyle} aria-hidden />
          <div className="game-mobile-table-and-hand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0, width: '100%', padding: 0, boxSizing: 'border-box' }}>
          <div
            className="game-center-area game-mobile-center"
            style={{
              ...centerAreaStyle,
              flexDirection: 'row',
              flexWrap: 'nowrap',
              alignItems: 'flex-start',
              width: '100%',
              maxWidth: '100%',
              gap: 12,
              marginLeft: 0,
              marginRight: 0,
              ...(isAITurn ? { cursor: 'pointer' } : {}),
            }}
            onClick={isAITurn ? accelerateAI : undefined}
            onKeyDown={e => { if (isAITurn && e.key === ' ') { e.preventDefault(); accelerateAI(); } }}
            role={isAITurn ? 'button' : undefined}
            tabIndex={isAITurn ? 0 : undefined}
            title={isAITurn ? 'Нажмите, чтобы ускорить ход ИИ' : undefined}>
            <div className="game-center-table" style={{ ...centerStyle, flex: 1, minWidth: 0 }}>
        <div style={{ ...tableOuterStyle, ...(trumpHighlightOn ? tableOuterStyleWithHighlight : {}) }}>
          <div style={{ ...tableSurfaceStyle, ...(trumpHighlightOn ? tableSurfaceStyleWithHighlight : {}) }}>
            {isWaitingInRoom && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, zIndex: 10 }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>Код комнаты: <strong style={{ color: '#22d3ee', letterSpacing: 2 }}>{online.code || '—'}</strong></p>
                {online.error && <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{online.error}</p>}
                {online.myServerIndex === 0 && (
                  <button
                    type="button"
                    disabled={
                      startingFromWaiting ||
                      !online.playerSlots.some((s) => s.userId != null && s.userId !== '')
                    }
                    onClick={handleStartFromWaiting}
                    style={{
                      padding: '14px 24px',
                      fontSize: 16,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: '1px solid rgba(34, 211, 238, 0.5)',
                      background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      opacity: online.playerSlots.some((s) => s.userId != null && s.userId !== '') ? 1 : 0.6,
                    }}
                  >
                    {startingFromWaiting ? 'Запуск…' : online.playerSlots.length >= 4 ? 'Начать игру' : 'Начать игру с ИИ'}
                  </button>
                )}
                {online.myServerIndex !== 0 && <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Ожидание старта от хоста…</p>}
              </div>
            )}
            {state.trumpCard && (
              <DeckWithTrump
                tricksInDeal={state.tricksInDeal}
                trumpCard={state.trumpCard}
                trumpHighlightOn={trumpHighlightOn}
                dealerIndex={state.dealerIndex}
                compactTable={isMobileOrTablet}
                forceDeckTopLeft={isMobile}
                pcCardStyles={!isMobileOrTablet}
              />
            )}
            <div style={trickStyle}>
              {state.currentTrick.length > 0 ? (
                state.currentTrick.map((card, i) => {
                  const leader = state.trickLeaderIndex;
                  const playerIdx = getTrickPlayerIndex(leader, i);
                  const slotStyle = getTrickCardSlotStyle(playerIdx, isMobileOrTablet);
                  return (
                    <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                      <CardView
                        card={card}
                        compact
                        showDesktopFaceIndices={true}
                        tableCardMobile={isMobileOrTablet}
                        scale={isMobileOrTablet ? 0.98 : 1.18}
                        contentScale={isMobileOrTablet ? 1.5 : undefined}
                        doubleBorder={trumpHighlightOn}
                        isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)}
                        trumpHighlightOn={trumpHighlightOn}
                        pcCardStyles={!isMobileOrTablet}
                      />
                    </div>
                  );
                })
              ) : state.lastCompletedTrick && Date.now() < trickPauseUntil && lastTrickCollectingPhase !== 'button' ? (
                dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') ? (
                  state.lastCompletedTrick.cards.map((card, i) => {
                    const leader = state.lastCompletedTrick!.leaderIndex;
                    const playerIdx = getTrickPlayerIndex(leader, i);
                    const winnerIdx = state.lastCompletedTrick!.winnerIndex;
                    const collectToWinner = lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing';
                    const showCardBack = lastTrickCollectingPhase === 'collapsing';
                    const CARD_COLLECT_MS = 500;
                    const cardScale = isMobileOrTablet ? 0.98 : 1.18;
                    const cardW = Math.round(52 * cardScale);
                    const cardH = Math.round(76 * cardScale);
                    return (
                      <div
                        key={`${card.suit}-${card.rank}-${i}`}
                        style={{
                          position: 'absolute',
                          left: '50%',
                          top: '50%',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          pointerEvents: 'none',
                          zIndex: i,
                          transform: collectToWinner ? getTrickSlotTransform(winnerIdx, isMobileOrTablet) : getTrickSlotTransform(playerIdx, isMobileOrTablet),
                          transition: collectToWinner ? `transform ${CARD_COLLECT_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` : 'none',
                        }}
                      >
                        {showCardBack ? (
                          <div style={{ ...cardBackStyle, width: cardW, height: cardH }} aria-hidden />
                        ) : (
                          <CardView
                            card={card}
                            compact
                            showDesktopFaceIndices={true}
                            tableCardMobile={isMobileOrTablet}
                            scale={cardScale}
                            contentScale={isMobileOrTablet ? 1.5 : undefined}
                            doubleBorder={trumpHighlightOn}
                            isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)}
                            trumpHighlightOn={trumpHighlightOn}
                            pcCardStyles={!isMobileOrTablet}
                          />
                        )}
                      </div>
                    );
                  })
                ) : (
                  state.lastCompletedTrick.cards.map((card, i) => {
                    const leader = state.lastCompletedTrick!.leaderIndex;
                    const playerIdx = getTrickPlayerIndex(leader, i);
                    const slotStyle = getTrickCardSlotStyle(playerIdx, isMobileOrTablet);
                    return (
                      <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                        <CardView
                          card={card}
                          compact
                          showDesktopFaceIndices={true}
                          tableCardMobile={isMobileOrTablet}
                          scale={isMobileOrTablet ? 0.98 : 1.18}
                          contentScale={isMobileOrTablet ? 1.5 : undefined}
                          doubleBorder={trumpHighlightOn}
                          isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)}
                          trumpHighlightOn={trumpHighlightOn}
                          pcCardStyles={!isMobileOrTablet}
                        />
                      </div>
                    );
                  })
                )
              ) : null}
            </div>
            {state.lastCompletedTrick && (
              <button
                type="button"
                className={
                  state.dealerIndex === 3 ? 'last-trick-btn last-trick-btn-left' :
                  state.dealerIndex === 1 ? 'last-trick-btn last-trick-btn-left-mobile-only' :
                  'last-trick-btn'
                }
                onClick={e => { e.stopPropagation(); setShowLastTrickModal(true); }}
                style={{
                  ...lastTrickButtonStyle,
                  ...(state.dealerIndex === 3 ? { left: 12, right: 'auto' } : {}),
                }}
              >
                Последняя взятка
              </button>
            )}
            {isMobile && shouldShowBidPanel && bidPanelVisible && (
              <div className="bid-panel-mobile-on-table-wrap" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'flex-end', paddingBottom: 12, paddingLeft: 8, paddingRight: 8, zIndex: 15, pointerEvents: 'none' }}>
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span
                    className="bid-panel-mobile-badge"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      padding: '2px 6px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'transparent',
                      whiteSpace: 'nowrap',
                      zIndex: 1,
                      border: '1px solid rgba(34, 211, 238, 0.85)',
                      borderRadius: 10,
                    }}
                  >
                    <span className="bid-panel-mobile-badge-text">
                      {state.phase === 'dark-bidding' ? 'Заказ в тёмную' : 'Сколько хотите взять взяток:'}
                    </span>
                  </span>
                  <div
                    className="bid-panel bid-panel-inline bid-panel-bottom bid-panel-mobile-inline"
                    style={{
                      ...bidPanelInlineStyle,
                      padding: '10px 14px',
                      gap: 8,
                      pointerEvents: 'auto',
                    }}
                    aria-label="Выбор заказа"
                  >
                    <div className="bid-panel-grid bid-panel-mobile-grid" style={bidSidePanelGrid}>
                    {isMobile ? (
                      (() => {
                        const n = state.tricksInDeal;
                        const bidOrder = Array.from({ length: n + 1 }, (_, i) => i);
                        return (
                          <>
                            {bidOrder.map((i) => {
                              const disabled = invalidBid === i;
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  className="bid-panel-btn bid-panel-btn-mobile"
                                  disabled={disabled}
                                  onMouseDown={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                                  onClick={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                                  style={{
                                    ...bidSidePanelButtonMobile,
                                    ...(disabled ? bidSidePanelButtonDisabledMobile : {}),
                                  }}
                                  title={disabled ? `Запрещено: сумма заказов будет ${state.tricksInDeal}` : undefined}
                                >
                                  {i}
                                </button>
                              );
                            })}
                            <span key="ph1" className="bid-panel-mobile-placeholder" aria-hidden />
                            <span key="ph2" className="bid-panel-mobile-placeholder" aria-hidden />
                          </>
                        );
                      })()
                    ) : (
                      Array.from({ length: state.tricksInDeal + 1 }, (_, i) => {
                        const disabled = invalidBid === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            className="bid-panel-btn"
                            disabled={disabled}
                            onMouseDown={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                            onClick={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                            style={{
                              ...bidSidePanelButton,
                              ...(disabled ? bidSidePanelButtonDisabled : {}),
                            }}
                            title={disabled ? `Запрещено: сумма заказов будет ${state.tricksInDeal}` : undefined}
                          >
                            {i}
                          </button>
                        );
                      })
                    )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
        {dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') && !isMobile && (
          <DealResultsScreen state={state} isCollapsing={lastTrickCollectingPhase === 'collapsing'} isMobile={!isMobile ? false : undefined} />
        )}
            <div className="game-center-east game-mobile-east" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <OpponentSlot state={displayState} index={3} position="right" inline compactMode={isMobileOrTablet}
                avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(3, online.myServerIndex))?.avatarDataUrl ?? undefined}
                replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(3, online.myServerIndex))?.replacedUserId}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 3}
                trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 3}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 3}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
                offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
              />
            </div>
          </div>
      {(() => {
        const mobileHandLen = state.players[humanIdx].hand.length;
        const m9 = getMobileNineCardHandLayout(mobileHandLayoutVw, mobileHandLen);
        const fit = getMobileHandRowFit(
          mobileHandLayoutVw,
          mobileHandLen,
          m9.overlapPx,
          m9.slotPadding,
        );
        const overlapPx = fit.overlapPx;
        let rowScale = fit.rowScale;
        const ultra312Class = m9.attachExtraClass === 'game-mobile-hand--9-ultra312';
        if (ultra312Class && mobileHandLayoutVw > 329) {
          rowScale *= 0.97;
        }
        const rowTransform = rowScale < 0.998 ? `scale(${rowScale})` : undefined;
        const overlapScrubEnabled = isMobile && overlapPx > 0 && !prefersReducedMotion;
        return (
      <div
        className={[
          'game-mobile-hand-attached',
          m9.attachExtraClass,
          m9.useNarrowAttach ? 'game-mobile-hand--narrow-vw' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: '100%',
          maxWidth: '100%',
          flexShrink: 0,
          boxSizing: 'border-box',
        }}
      >
        <div
          className={['game-mobile-hand-frame', state.currentPlayerIndex === humanIdx ? 'player-hand-your-turn' : ''].filter(Boolean).join(' ')}
          style={{
            ...handFrameStyleMobile,
            ...m9.frameStyleExtra,
          }}
        >
          <div
            ref={mobileOverlapHandRowRef}
            className="game-mobile-hand-row"
            onPointerDownCapture={overlapScrubEnabled ? handleMobileHandRowPointerDownCapture : undefined}
            onClickCapture={(e) => {
              if (suppressMobileOverlapClickRef.current) {
                suppressMobileOverlapClickRef.current = false;
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            style={{
              ...handStyle,
              overflow: 'visible',
              justifyContent: 'center',
              boxSizing: 'border-box',
              width: 'max-content',
              maxWidth: '100%',
              borderRadius: 10,
              touchAction: overlapScrubEnabled ? ('none' as const) : undefined,
              ...(rowTransform
                ? { transform: rowTransform, transformOrigin: 'center bottom' as const }
                : {}),
            }}
          >
            {state.players[humanIdx].hand
              .slice()
              .sort((a, b) => cardSort(a, b, state.trump))
              .map((card, i) => {
                const marginRight = overlapPx > 0 && i < mobileHandLen - 1 ? -overlapPx : 0;
                const isValidPlay = state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length > 0 && validPlays.some(c => c.suit === card.suit && c.rank === card.rank);
                const handCardZ =
                  isMobile && state.currentPlayerIndex === humanIdx ? (isValidPlay ? 3 : 2) : isValidPlay ? 1 : 0;
                const overlapPeek = overlapScrubEnabled && mobileOverlapScrubPeek === i;
                const handCardDisabled =
                  !!state.pendingTrickCompletion || !isHumanTurn || !validPlays.some(c => c.suit === card.suit && c.rank === card.rank);
                return (
                <div
                  key={`${card.suit}-${card.rank}-${i}`}
                  data-mobile-hand-slot={overlapScrubEnabled ? i : undefined}
                  ref={
                    overlapScrubEnabled
                      ? (el) => {
                          const arr = mobileOverlapSlotRefs.current;
                          while (arr.length <= i) arr.push(null);
                          arr[i] = el;
                        }
                      : undefined
                  }
                  style={{
                    marginRight,
                    flexShrink: 0,
                    overflow: overlapScrubEnabled ? ('visible' as const) : 'hidden',
                    borderRadius: 6,
                    position: 'relative',
                    zIndex: handCardZ + (overlapPx > 0 ? i : 0) + (overlapPeek ? 50 : 0),
                    padding: m9.slotPadding,
                    ...(isMobile && state.currentPlayerIndex === humanIdx
                      ? ({ '--hand-wave-index': i + 1 } as CSSProperties)
                      : {}),
                  }}
                >
                <CardView
                  card={card}
                  scale={0.72}
                  contentScale={1.5}
                  compact
                  showDesktopFaceIndices={true}
                  suitIndexInHandMobile={true}
                  biddingHighlightMobile={isMobile && (state.phase === 'bidding' || state.phase === 'dark-bidding')}
                  doubleBorder={false}
                  isTrumpOnTable={false}
                  trumpHighlightOn={trumpHighlightOn}
                  isTrumpInHand={state.trump !== null && card.suit === state.trump}
                  forceMobileTrumpGlow={isMobileOrTablet && state.trump !== null && card.suit === state.trump && (state.phase === 'bidding' || state.phase === 'dark-bidding' || (state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length === 0))}
                  mobileTrumpGlowActive={state.phase === 'bidding' || state.phase === 'dark-bidding' || (state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length === 0)}
                  highlightAsValidPlay={state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length > 0 && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
                  mobileTrumpShineBidding={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.trump !== null && card.suit === state.trump}
                  mobileHandPeekLift={overlapPeek}
                  mobileOverlapHandPointerPassthrough={overlapScrubEnabled && handCardDisabled}
                  showPipZoneBorders={false}
                  pcCardStyles={false}
                  thinBorder={true}
                  onClick={() => {
                    if (!state.pendingTrickCompletion && isHumanTurn && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)) {
                      if (isOnline) online.sendPlay(card);
                      else setLocalState(prev => prev && playCard(prev, humanIdx, card));
                    }
                  }}
                  disabled={handCardDisabled}
                />
                </div>
              );
            })}
          </div>
          {trumpHighlightOn && userTurnGarlandReadyMobile && isUserActiveTurnForGarlandMobile ? (
            <UserPanelGarlandOverlay durationMs={USER_PANEL_GARLAND_HAND_DURATION_MS} />
          ) : null}
        </div>
      </div>
        );
      })()}
      </div>
      <div className="game-mobile-bottom-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
        <div className="game-mobile-player-wrap game-mobile-player" style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: 800 }}>
      <div
        className="game-mobile-player-panel"
        style={{
          ...(() => {
            const { padding: _playerShellPadding, ...rest } = playerStyle;
            return rest;
          })(),
          ...(dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')
            ? { visibility: 'hidden' as const, pointerEvents: 'none' as const, opacity: 0 }
            : {}),
        }}
      >
        <div className={['game-mobile-player-info', 'user-player-panel', userMobilePanelOrderExactGlow ? 'user-player-panel-order-exact' : '', state.currentPlayerIndex === humanIdx ? 'player-info-panel-your-turn' : '', (state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? 'first-mover-bidding-panel' : ''].filter(Boolean).join(' ')} style={{
          ...playerInfoPanelStyle,
          padding: '7px 0',
          position: 'relative',
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
          ...(dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === humanIdx ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
          ...(!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === humanIdx ? trickWinnerGlowStyle : {}),
          ...(getCurrentTrickLeaderIndex(state) === humanIdx ? currentTrickLeaderGlowStyle : {}),
          ...((state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? (() => {
            const base = state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : null;
            const baseShadow = base?.boxShadow ?? playerInfoPanelStyle.boxShadow;
            return { boxShadow: [baseShadow, firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') };
          })() : {}),
        }}>
          <div style={playerInfoHeaderStyle}>
            {renderUserPlayerAvatar(isMobileOrTablet ? 34 : 38)}
            <span style={playerNameDealerWrapStyle}>
              <span
                className={['player-panel-name', isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding) ? 'your-turn-prompt' : ''].filter(Boolean).join(' ')}
                style={{
                  ...playerNameStyle,
                  ...(state.currentPlayerIndex === humanIdx && !showYourTurnPrompt ? nameActiveMobileStyle : {}),
                  ...(isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding) ? yourTurnPromptStyle : {}),
                }}
                title={`${state.players[humanIdx].name} — ${getCompassLabel(humanIdx)}`}
              >
                {isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding)
                  ? (state.phase === 'playing' ? 'Ваш ход!' : 'Ваш заказ!')
                  : displayState.players[humanIdx].name}
              </span>
              {state.dealerIndex === humanIdx && (
                isMobileOrTablet && state.phase === 'playing' ? (
                  <button type="button" className="dealer-badge-compact-mobile" style={{ ...dealerLampStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setShowDealerTooltip(true)} title="Сдающий" aria-label="Сдающий">
                    <span style={dealerLampBulbStyle} /><span className="dealer-badge-text" aria-hidden>Сдающий</span>
                  </button>
                ) : (
                  <span style={dealerLampStyle} title="Сдающий">
                    <span style={dealerLampBulbStyle} /> Сдающий
                  </span>
                )
              )}
              {isMobile && (state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx && (
                <span style={firstBidderLampStyle} title="Первый заказ/ход">
                  <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
                </span>
              )}
            </span>
          </div>
          <div className="player-mobile-south-tricks-column" style={playerStatsRowStyle}>
            <div
              className={['player-score-badge', isPartyScoreLeader(displayState, humanIdx) ? 'score-badge-leader' : ''].filter(Boolean).join(' ')}
              style={playerStatBadgeScoreStyle}
            >
              <span style={playerStatLabelStyle}>Очки</span>
              <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
            </div>
            <TrickSlotsDisplay
              bid={state.bids[humanIdx] ?? null}
              tricksTaken={state.players[humanIdx].tricksTaken}
              variant="player"
              collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
              compactMode={isMobileOrTablet}
              playerMobileWideTricks={isMobile}
              tricksLeftInDeal={tricksRemainingInDeal(state)}
            />
            {shouldShowBidPanel && bidPanelVisible && !isMobile && (
              <div className="bid-panel bid-panel-inline bid-panel-bottom" style={bidPanelInlineStyle} aria-label="Выбор заказа">
                <span className="bid-panel-title bid-panel-title-inline" style={bidPanelInlineTitleStyle}>
                  {state.phase === 'dark-bidding' ? 'Заказ в тёмную' : 'Ваш заказ'}
                </span>
                <div className="bid-panel-grid" style={bidSidePanelGrid}>
                  {Array.from({ length: state.tricksInDeal + 1 }, (_, i) => {
                    const disabled = invalidBid === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        className="bid-panel-btn"
                        disabled={disabled}
                        onMouseDown={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                        onClick={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                        style={{
                          ...bidSidePanelButtonMobile,
                          ...(disabled ? bidSidePanelButtonDisabledMobile : {}),
                        }}
                        title={disabled ? `Запрещено: сумма заказов будет ${state.tricksInDeal}` : undefined}
                      >
                        {i}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {trumpHighlightOn && userTurnGarlandReadyMobile && isUserActiveTurnForGarlandMobile ? (
            <UserPanelGarlandOverlay />
          ) : null}
        </div>
      </div>
      </div>
      {showTableChat && online.roomId && user?.id && (
        <TableChatDock
          variant="mobile"
          roomId={online.roomId}
          userId={user.id}
          displayName={playerDisplayName?.trim() || 'Игрок'}
        />
      )}
      </div>
      <div style={centerAreaSpacerBottomStyle} aria-hidden />
        </>
      ) : (
        <>
      {/* z-index выше .game-header (20): иначе из-за translateY у .game-table-block клики по имени Север перехватывает шапка */}
      <div className="game-info-row" style={{ ...gameInfoTopRowStyle, zIndex: 22 }}>
          <div className="game-info-left-col" style={gameInfoLeftColumnStyle}>
            {!isMobileOrTablet && (state.phase === 'bidding' || state.phase === 'dark-bidding') && (
              <div className="first-move-badge first-move-badge-above-block" style={firstMoveBadgeStyle}>
                <span className="first-move-num" style={firstMoveLabelStyle}>Первый ход:</span>
                <span style={firstMoveValueStyle}>{displayState.players[state.trickLeaderIndex].name}</span>
              </div>
            )}
            {(state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') && (
              <div className="game-info-left-section" style={gameInfoLeftSectionStyle}>
                {state.phase === 'playing' && (
                  <div style={{ ...gameInfoBadgeStyle, ...gameInfoActiveBadgeStyle }}>
                    <span style={gameInfoLabelStyle}>Сейчас ход</span>
                    <span className="game-info-value-name" style={{ ...gameInfoValueStyle, color: '#22c55e' }}>{displayState.players[state.currentPlayerIndex].name}</span>
                  </div>
                )}
                {!isWaitingInRoom && (state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                  <div style={{ ...gameInfoBadgeStyle, ...gameInfoBiddingBadgeStyle }}>
                    <span style={gameInfoLabelStyle}>Заказывает</span>
                    <span className="game-info-value-name" style={{ ...gameInfoValueStyle, color: '#f59e0b' }}>
                      {displayState.players[state.currentPlayerIndex].name}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        <div style={gameInfoTopRowSpacerStyle} aria-hidden />
        <div style={gameInfoNorthSlotWrapper} aria-hidden />
        <div className="game-center-north" style={gameInfoNorthSlotWrapperAbsolute}>
          <OpponentSlot state={displayState} index={1} position="top" inline compactMode={isMobileOrTablet}
            avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(1, online.myServerIndex))?.avatarDataUrl ?? undefined}
            replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(1, online.myServerIndex))?.replacedUserId}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 1}
            trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 1}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 1}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
            offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
          />
        </div>
        <div style={gameInfoTopRowSpacerStyle} aria-hidden />
        </div>
      <div className="game-center-spacer-top" style={centerAreaSpacerTopStyle} aria-hidden />
      <div className="game-center-area" style={{ ...centerAreaStyle, ...(isAITurn ? { cursor: 'pointer' } : {}) }}
        onClick={isAITurn ? accelerateAI : undefined}
        onKeyDown={e => { if (isAITurn && e.key === ' ') { e.preventDefault(); accelerateAI(); } }}
        role={isAITurn ? 'button' : undefined}
        tabIndex={isAITurn ? 0 : undefined}
        title={isAITurn ? 'Нажмите, чтобы ускорить ход ИИ' : undefined}>
        <div className="game-center-west" style={{ ...opponentSideWrapWestStyle, ...(!isMobileOrTablet ? opponentSideWrapPcGrowStyle : {}) }}>
          <OpponentSlot state={displayState} index={2} position="left" inline compactMode={isMobileOrTablet}
            avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(2, online.myServerIndex))?.avatarDataUrl ?? undefined}
            replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(2, online.myServerIndex))?.replacedUserId}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 2}
            trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 2}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 2}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
            offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
          />
        </div>
        <div className="game-center-table" style={centerStyle}>
        <div style={{ ...tableOuterStyle, ...(trumpHighlightOn ? tableOuterStyleWithHighlight : {}) }}>
          <div style={{ ...tableSurfaceStyle, ...(trumpHighlightOn ? tableSurfaceStyleWithHighlight : {}) }}>
            {isWaitingInRoom && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, zIndex: 10 }}>
                <p style={{ margin: 0, color: '#94a3b8', fontSize: 14 }}>Код комнаты: <strong style={{ color: '#22d3ee', letterSpacing: 2 }}>{online.code || '—'}</strong></p>
                {online.error && <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{online.error}</p>}
                {online.myServerIndex === 0 && (
                  <button
                    type="button"
                    disabled={
                      startingFromWaiting ||
                      !online.playerSlots.some((s) => s.userId != null && s.userId !== '')
                    }
                    onClick={handleStartFromWaiting}
                    style={{
                      padding: '14px 24px',
                      fontSize: 16,
                      fontWeight: 600,
                      borderRadius: 8,
                      border: '1px solid rgba(34, 211, 238, 0.5)',
                      background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                      color: '#f8fafc',
                      cursor: 'pointer',
                      opacity: online.playerSlots.some((s) => s.userId != null && s.userId !== '') ? 1 : 0.6,
                    }}
                  >
                    {startingFromWaiting ? 'Запуск…' : online.playerSlots.length >= 4 ? 'Начать игру' : 'Начать игру с ИИ'}
                  </button>
                )}
                {online.myServerIndex !== 0 && <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Ожидание старта от хоста…</p>}
              </div>
            )}
            {state.trumpCard && (
              <DeckWithTrump tricksInDeal={state.tricksInDeal} trumpCard={state.trumpCard} trumpHighlightOn={trumpHighlightOn} dealerIndex={state.dealerIndex} compactTable={isMobileOrTablet} pcCardStyles={!isMobileOrTablet} />
            )}
            <div style={trickStyle}>
              {state.currentTrick.length > 0 ? (
                state.currentTrick.map((card, i) => {
                  const leader = state.trickLeaderIndex;
                  const playerIdx = getTrickPlayerIndex(leader, i);
                  const slotStyle = getTrickCardSlotStyle(playerIdx, isMobileOrTablet);
                  return (
                    <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                      <CardView card={card} compact showDesktopFaceIndices={true} tableCardMobile={isMobileOrTablet} scale={isMobileOrTablet ? 0.98 : 1.18} contentScale={isMobileOrTablet ? 1.8 : undefined}
                        doubleBorder={trumpHighlightOn} isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)} trumpHighlightOn={trumpHighlightOn} showPipZoneBorders={trumpHighlightOn} pcCardStyles={!isMobileOrTablet} />
                    </div>
                  );
                })
              ) : state.lastCompletedTrick && Date.now() < trickPauseUntil && lastTrickCollectingPhase !== 'button' ? (
                dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') ? (
                  state.lastCompletedTrick.cards.map((card, i) => {
                    const leader = state.lastCompletedTrick!.leaderIndex;
                    const playerIdx = getTrickPlayerIndex(leader, i);
                    const winnerIdx = state.lastCompletedTrick!.winnerIndex;
                    const collectToWinner = lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing';
                    const showCardBack = lastTrickCollectingPhase === 'collapsing';
                    const CARD_COLLECT_MS = 500;
                    const cardScale = isMobileOrTablet ? 0.98 : 1.18;
                    const cardW = Math.round(52 * cardScale);
                    const cardH = Math.round(76 * cardScale);
                    return (
                      <div key={`${card.suit}-${card.rank}-${i}`} style={{ position: 'absolute', left: '50%', top: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none', zIndex: i,
                        transform: collectToWinner ? getTrickSlotTransform(winnerIdx, isMobileOrTablet) : getTrickSlotTransform(playerIdx, isMobileOrTablet),
                        transition: collectToWinner ? `transform ${CARD_COLLECT_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` : 'none',
                      }}>
                        {showCardBack ? <div style={{ ...cardBackStyle, width: cardW, height: cardH }} aria-hidden /> : (
                          <CardView card={card} compact showDesktopFaceIndices={true} tableCardMobile={isMobileOrTablet} scale={cardScale} contentScale={isMobileOrTablet ? 1.5 : undefined} doubleBorder={trumpHighlightOn} isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)} trumpHighlightOn={trumpHighlightOn} showPipZoneBorders={trumpHighlightOn} pcCardStyles={!isMobileOrTablet} />
                        )}
                      </div>
                    );
                  })
                ) : (
                  state.lastCompletedTrick.cards.map((card, i) => {
                    const leader = state.lastCompletedTrick!.leaderIndex;
                    const playerIdx = getTrickPlayerIndex(leader, i);
                    const slotStyle = getTrickCardSlotStyle(playerIdx, isMobileOrTablet);
                    return (
                      <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                        <CardView card={card} compact showDesktopFaceIndices={true} tableCardMobile={isMobileOrTablet} scale={isMobileOrTablet ? 0.98 : 1.18} contentScale={isMobileOrTablet ? 1.5 : undefined} doubleBorder={trumpHighlightOn} isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)} trumpHighlightOn={trumpHighlightOn} showPipZoneBorders={trumpHighlightOn} pcCardStyles={!isMobileOrTablet} />
                      </div>
                    );
                  })
                )
              ) : null}
            </div>
            {state.lastCompletedTrick && (
              <button type="button" className={state.dealerIndex === 3 ? 'last-trick-btn last-trick-btn-left' : state.dealerIndex === 1 ? 'last-trick-btn last-trick-btn-left-mobile-only' : 'last-trick-btn'}
                onClick={e => { e.stopPropagation(); setShowLastTrickModal(true); }} style={{ ...lastTrickButtonStyle, ...(state.dealerIndex === 3 ? { left: 12, right: 'auto' } : {}) }}>
                Последняя взятка
              </button>
            )}
          </div>
        </div>
        </div>
        <div className="game-center-east" style={{ ...opponentSideWrapEastStyle, ...(!isMobileOrTablet ? opponentSideWrapPcGrowStyle : {}) }}>
          <OpponentSlot state={displayState} index={3} position="right" inline compactMode={isMobileOrTablet}
            avatarDataUrl={online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(3, online.myServerIndex))?.avatarDataUrl ?? undefined}
            replacedByAi={!!online.playerSlots.find(s => s.slotIndex === getCanonicalIndexForDisplay(3, online.myServerIndex))?.replacedUserId}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 3}
            trickWinnerHighlight={!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === 3}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 3}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
            offlineAiNameStyleByDifficulty={offlineAiNamePickEnabled}
          />
        </div>
        {dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') && !isMobile && (
          <DealResultsScreen state={state} isCollapsing={lastTrickCollectingPhase === 'collapsing'} isMobile={!isMobile ? false : undefined} />
        )}
      </div>
      <div style={centerAreaSpacerBottomStyle} aria-hidden />
        </>
      )}
      </div>

      {!isMobile && <div style={playerSpacerStyle} aria-hidden />}
      {!isMobile && (
      <div
        className={showTableChat ? 'game-pc-table-chat-wrap' : undefined}
        style={
          showTableChat
            ? {
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 12,
                width: '100%',
                flexWrap: 'nowrap',
              }
            : undefined
        }
      >
      <div style={{
        ...playerStyle,
        ...(dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')
          ? { visibility: 'hidden' as const, pointerEvents: 'none' as const, opacity: 0 }
          : {}),
      }}>
        <div className={state.currentPlayerIndex === humanIdx ? 'player-hand-your-turn' : undefined} style={handFrameStyle}>
          <div style={handStyle}>
            {state.players[humanIdx].hand
              .slice()
              .sort((a, b) => cardSort(a, b, state.trump))
              .map((card, i) => (
                <CardView
                  key={`${card.suit}-${card.rank}-${i}`}
                  card={card}
                  scale={isMobileOrTablet ? 1 / (1.3 * 1.1) : 1}
                  contentScale={isMobileOrTablet ? 1.5 : undefined}
                  doubleBorder={trumpHighlightOn}
                  isTrumpOnTable={isMobileOrTablet ? (trumpHighlightOn && state.trump !== null && card.suit === state.trump) : (state.trump !== null && card.suit === state.trump)}
                  trumpHighlightOn={trumpHighlightOn}
                  isTrumpInHand={state.trump !== null && card.suit === state.trump}
                  forceMobileTrumpGlow={isMobileOrTablet && state.trump !== null && card.suit === state.trump && (state.phase === 'bidding' || state.phase === 'dark-bidding' || (state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length === 0))}
                  mobileTrumpGlowActive={state.phase === 'bidding' || state.phase === 'dark-bidding' || (state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length === 0)}
                  highlightAsValidPlay={state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length > 0 && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
                  mobileTrumpShineBidding={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.trump !== null && card.suit === state.trump}
                  showPipZoneBorders={trumpHighlightOn}
                  pcCardStyles={!isMobileOrTablet}
                  biddingHighlightPC={!isMobileOrTablet && (state.phase === 'bidding' || state.phase === 'dark-bidding')}
                  onClick={() => {
                    if (!state.pendingTrickCompletion && isHumanTurn && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)) {
                      if (isOnline) online.sendPlay(card);
                      else setLocalState(prev => prev && playCard(prev, humanIdx, card));
                    }
                  }}
                  disabled={!!state.pendingTrickCompletion || !isHumanTurn || !validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
                />
              ))}
          </div>
        </div>
        <div className={['user-player-panel', state.currentPlayerIndex === humanIdx ? 'player-info-panel-your-turn' : '', (state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? 'first-mover-bidding-panel' : '', !isMobileOrTablet && userTurnStrongNudgePc ? 'user-player-panel-idle-turn-nudge-pc' : ''].filter(Boolean).join(' ') || undefined} style={{
          ...playerInfoPanelStyle,
          position: 'relative',
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
          ...(dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === humanIdx ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
          ...(!!state.pendingTrickCompletion && state.pendingTrickCompletion.winnerIndex === humanIdx ? trickWinnerGlowStyle : {}),
          ...(getCurrentTrickLeaderIndex(state) === humanIdx ? currentTrickLeaderGlowStyle : {}),
          ...((state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? (() => {
            const base = state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : null;
            const baseShadow = base?.boxShadow ?? playerInfoPanelStyle.boxShadow;
            return { boxShadow: [baseShadow, firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') };
          })() : {}),
        }}>
          {!isMobileOrTablet && userOrderRingExact && shouldShowPcOrderOnHandExactBadge(state) ? (
            <span
              className="opponent-badge order-on-hand-badge-pc order-on-hand-badge-pc-user-side"
              style={{
                ...orderOnHandUserPanelSideStyleBase,
                left: userTurnStrongNudgePc ? -4 : 0,
                transform: `translateX(calc(-100% - ${ORDER_ON_HAND_USER_PANEL_GAP_PX}px - ${userTurnStrongNudgePc ? ORDER_ON_HAND_USER_IDLE_NUDGE_EXTRA_PX : 0}px))`,
              }}
              title="Заказ на руке — взяток ровно по заказу"
              role="status"
              aria-label="Заказ на руке"
            >
              <span className="order-on-hand-badge-user-check" style={orderOnHandCheckBulbUserCompactStyle} aria-hidden>
                ✓
              </span>
              <span className="order-on-hand-badge-user-vertical" aria-hidden>
                {'Ровно'.split('').map((ch, i) => (
                  <span key={i} className="order-on-hand-badge-user-vertical-char">
                    {ch}
                  </span>
                ))}
              </span>
            </span>
          ) : null}
          {!isMobileOrTablet && state.currentPlayerIndex === humanIdx && trumpHighlightOn && userTurnGarlandReady ? (
            <>
              <UserPanelGarlandOverlay />
              <button
                type="button"
                className="user-panel-garland-dismiss-hint-pc"
                title="Нажмите здесь или по панели — огоньки ненадолго погаснут"
                aria-label="Ненадолго скрыть бегущую подсветку рамки"
              >
                <span className="user-panel-garland-dismiss-hint-pc-dots" aria-hidden>
                  <span className="user-panel-garland-dismiss-hint-pc-dot user-panel-garland-dismiss-hint-pc-dot--1" />
                  <span className="user-panel-garland-dismiss-hint-pc-dot user-panel-garland-dismiss-hint-pc-dot--2" />
                  <span className="user-panel-garland-dismiss-hint-pc-dot user-panel-garland-dismiss-hint-pc-dot--3" />
                </span>
              </button>
            </>
          ) : null}
          {isMobileOrTablet &&
            (state.phase === 'bidding' || state.phase === 'dark-bidding') &&
            state.bids.some(b => b === null) &&
            state.trickLeaderIndex === humanIdx && (
              <span style={firstBidderLampExternalStyle} title="Первый заказ/ход">
                <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
              </span>
            )}
          {!isMobileOrTablet ? (
            <div className="user-player-panel-pc-layout">
              <div className="user-player-panel-pc-avatar-col">
                <div className="user-player-panel-pc-left-cluster">
                  <div className="user-player-panel-pc-avatar-name-stack">
                    {renderUserPlayerAvatar(38)}
                    <div className="user-player-panel-pc-name-under-avatar">
                      <span className="player-panel-name user-player-panel-pc-name-text" style={playerNameStyle}>{displayState.players[humanIdx].name}</span>
                      {state.dealerIndex === humanIdx &&
                        state.phase !== 'bidding' &&
                        state.phase !== 'dark-bidding' && (
                        <span style={dealerLampStyle} title="Сдающий">
                          <span style={dealerLampBulbStyle} /> Сдающий
                        </span>
                      )}
                    </div>
                  </div>
                  {state.phase !== 'bidding' && state.phase !== 'dark-bidding' && (
                    <div className="user-player-panel-pc-tricks-column">
                      {state.currentPlayerIndex === humanIdx && (
                        <span
                          className={['user-player-panel-pc-your-turn-above-tricks', userTurnStrongNudgePc ? 'user-player-panel-pc-turn-badge-nudge' : ''].filter(Boolean).join(' ')}
                          style={yourTurnBadgeStyle}
                        >
                          Ваш ход
                        </span>
                      )}
                      <TrickSlotsDisplay
                        bid={state.bids[humanIdx] ?? null}
                        tricksTaken={state.players[humanIdx].tricksTaken}
                        variant="player"
                        collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                        compactMode={false}
                        playerMobileWideTricks={false}
                        tricksLeftInDeal={tricksRemainingInDeal(state)}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="user-player-panel-pc-main">
                {(state.phase === 'bidding' || state.phase === 'dark-bidding') ? (
                  <div className="user-player-panel-pc-bidding-top-row">
                    <div style={playerInfoHeaderStyle} className="user-player-panel-pc-bidding-badges">
                      {state.bids.some(b => b === null) &&
                        state.trickLeaderIndex === humanIdx && (
                          <span className="first-bidder-lamp-user-pc" style={firstBidderLampUserPanelPcStyle} title="Первый заказ/ход">
                            <span className="first-bidder-lamp-user-pc-bulb" style={firstBidderLampBulbStyle} /> Первый заказ/ход
                          </span>
                        )}
                      {state.currentPlayerIndex === humanIdx && (
                        <span className={userTurnStrongNudgePc ? 'user-player-panel-pc-turn-badge-nudge' : undefined} style={yourTurnBadgeStyle}>Ваш заказ</span>
                      )}
                      {state.dealerIndex === humanIdx && (
                        <span style={dealerLampStyle} title="Сдающий">
                          <span style={dealerLampBulbStyle} /> Сдающий
                        </span>
                      )}
                    </div>
                    <div
                      className={['player-score-badge', 'player-score-badge-pc-above-bid', 'player-score-badge-pc-bidding-row-end', isPartyScoreLeader(displayState, humanIdx) ? 'score-badge-leader' : ''].filter(Boolean).join(' ')}
                      style={playerStatBadgeScoreStyle}
                    >
                      <span style={playerStatLabelStyle}>Очки</span>
                      <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
                    </div>
                  </div>
                ) : (
                  <div className="user-player-panel-pc-playing-top-row user-player-panel-pc-playing-top-row--score-only">
                    <div
                      className={['player-score-badge', 'player-score-badge-pc-above-bid', 'player-score-badge-pc-playing-row-end', isPartyScoreLeader(displayState, humanIdx) ? 'score-badge-leader' : ''].filter(Boolean).join(' ')}
                      style={playerStatBadgeScoreStyle}
                    >
                      <span style={playerStatLabelStyle}>Очки</span>
                      <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
                    </div>
                  </div>
                )}
                <div className="user-player-panel-pc-stats-stack">
                  {shouldShowBidPanel && bidPanelVisible && (
                    <div className="bid-panel bid-panel-inline bid-panel-bottom bid-panel-pc-under-score" style={bidPanelInlineStyle} aria-label="Выбор заказа">
                      <span className="bid-panel-title bid-panel-title-inline" style={bidPanelInlineTitleStyle}>
                        {state.phase === 'dark-bidding' ? 'Заказ в тёмную' : 'Ваш заказ'}
                      </span>
                      <div className="bid-panel-grid" style={bidSidePanelGrid}>
                        {Array.from({ length: state.tricksInDeal + 1 }, (_, i) => {
                          const disabled = invalidBid === i;
                          return (
                            <button
                              key={i}
                              type="button"
                              className="bid-panel-btn"
                              disabled={disabled}
                              onMouseDown={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                              onClick={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                              style={{
                                ...bidSidePanelButtonMobile,
                                ...(disabled ? bidSidePanelButtonDisabledMobile : {}),
                              }}
                              title={disabled ? `Запрещено: сумма заказов будет ${state.tricksInDeal}` : undefined}
                            >
                              {i}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={playerInfoHeaderStyle}>
                {renderUserPlayerAvatar(34)}
                <span style={playerNameDealerWrapStyle}>
                  <span className="player-panel-name" style={playerNameStyle}>{displayState.players[humanIdx].name}</span>
                  {state.dealerIndex === humanIdx && (
                    isMobileOrTablet && state.phase === 'playing' ? (
                      <button type="button" className="dealer-badge-compact-mobile" style={{ ...dealerLampStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => setShowDealerTooltip(true)} title="Сдающий" aria-label="Сдающий">
                        <span style={dealerLampBulbStyle} /><span className="dealer-badge-text" aria-hidden>Сдающий</span>
                      </button>
                    ) : (
                      <span style={dealerLampStyle} title="Сдающий">
                        <span style={dealerLampBulbStyle} /> Сдающий
                      </span>
                    )
                  )}
                </span>
                {state.currentPlayerIndex === humanIdx && (
                  <span style={yourTurnBadgeStyle}>
                    {(state.phase === 'bidding' || state.phase === 'dark-bidding') ? 'Ваш заказ' : 'Ваш ход'}
                  </span>
                )}
              </div>
              <div className="player-stats-row" style={playerStatsRowStyle}>
                <div
                  className={['player-score-badge', isPartyScoreLeader(displayState, humanIdx) ? 'score-badge-leader' : ''].filter(Boolean).join(' ')}
                  style={playerStatBadgeScoreStyle}
                >
                  <span style={playerStatLabelStyle}>Очки</span>
                  <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
                </div>
                <TrickSlotsDisplay
                  bid={state.bids[humanIdx] ?? null}
                  tricksTaken={state.players[humanIdx].tricksTaken}
                  variant="player"
                  collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                  compactMode={isMobileOrTablet}
                  playerMobileWideTricks={isMobile}
                  tricksLeftInDeal={tricksRemainingInDeal(state)}
                />
                {shouldShowBidPanel && bidPanelVisible && (
                  <div className="bid-panel bid-panel-inline bid-panel-bottom" style={bidPanelInlineStyle} aria-label="Выбор заказа">
                    <span className="bid-panel-title bid-panel-title-inline" style={bidPanelInlineTitleStyle}>
                      {state.phase === 'dark-bidding' ? 'Заказ в тёмную' : 'Ваш заказ'}
                    </span>
                    <div className="bid-panel-grid" style={bidSidePanelGrid}>
                      {Array.from({ length: state.tricksInDeal + 1 }, (_, i) => {
                        const disabled = invalidBid === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            className="bid-panel-btn"
                            disabled={disabled}
                            onMouseDown={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                            onClick={e => { e.preventDefault(); if (!disabled) handleBidRef.current(i); }}
                            style={{
                              ...bidSidePanelButtonMobile,
                              ...(disabled ? bidSidePanelButtonDisabledMobile : {}),
                            }}
                            title={disabled ? `Запрещено: сумма заказов будет ${state.tricksInDeal}` : undefined}
                          >
                            {i}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {showTableChat && online.roomId && user?.id && (
        <TableChatDock
          variant="pc"
          roomId={online.roomId}
          userId={user.id}
          displayName={playerDisplayName?.trim() || 'Игрок'}
        />
      )}
      </div>
      )}

      {/* Мобильная панель заказа рендерится в потоке под картами (bid-panel-mobile-inline-wrap), не в портале */}

      {/* На мобильной оверлей итогов раздачи рендерим в портал, чтобы position:fixed считался от viewport (нет предка с transform) */}
      {isMobile && dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') && createPortal(
        <div className="game-table-root viewport-mobile" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
          <DealResultsScreen state={state} isCollapsing={lastTrickCollectingPhase === 'collapsing'} isMobile={true} />
        </div>,
        document.body,
      )}

      {dealResultsExpanded && lastDealResultsSnapshot && createPortal(
        <div
          className={isMobile ? 'deal-results-modal-overlay-mobile' : undefined}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: isMobile ? 'flex-start' : 'center',
            justifyContent: 'center',
            zIndex: 9999,
            overflow: isMobile ? 'hidden' : 'auto',
          }}
          onClick={() => setDealResultsExpanded(false)}
          onKeyDown={e => { if (e.key === 'Escape') setDealResultsExpanded(false); }}
          role="button"
          tabIndex={0}
          aria-label="Закрыть"
        >
          <div
            style={{
              position: 'relative',
              width: isMobile ? '100%' : 'min(96vw, 800px)',
              minWidth: isMobile ? 0 : 500,
              maxWidth: isMobile ? '100%' : undefined,
              maxHeight: isMobile ? '100%' : '98vh',
              overflow: isMobile ? 'hidden' : 'visible',
              display: 'flex',
              flexDirection: 'column',
              alignItems: isMobile ? 'stretch' : 'center',
              justifyContent: 'center',
              padding: isMobile ? 12 : 20,
              minHeight: isMobile ? '100%' : undefined,
              height: isMobile ? '100%' : undefined,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              transform: isMobile ? 'none' : 'scale(1.35)',
              transformOrigin: 'center center',
              flexShrink: 0,
              width: isMobile ? '100%' : undefined,
              maxWidth: isMobile ? '100%' : undefined,
              height: isMobile ? '100%' : undefined,
              display: isMobile ? 'flex' : undefined,
              flexDirection: isMobile ? 'column' : undefined,
              minHeight: 0,
            }}>
              <DealResultsScreen state={lastDealResultsSnapshot} variant="modal" isMobile={isMobile} onClose={() => setDealResultsExpanded(false)} />
            </div>
          </div>
        </div>,
        document.body,
      )}
      {showLastTrickModal && state.lastCompletedTrick && createPortal(
        <LastTrickModal
          trick={state.lastCompletedTrick}
          players={state.players}
          trump={state.trump}
          trumpHighlightOn={trumpHighlightOn}
          doubleBorder={trumpHighlightOn}
          showDesktopFaceIndices={true}
          pcCardStyles={!isMobileOrTablet}
          onClose={() => setShowLastTrickModal(false)}
        />,
        document.body
      )}

      {showGameOverModal && gameOverSnapshot && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Escape') { setShowGameOverModal(false); setGameOverSnapshot(null); setGameOverViewerSlot(null); } }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-over-title"
        >
          <div
            style={{
              position: 'relative',
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34, 211, 238, 0.35)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 60px rgba(34, 211, 238, 0.15)',
              maxHeight: '95vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Закрыть"
              onClick={() => {
                setShowGameOverModal(false);
                setGameOverSnapshot(null);
                setGameOverViewerSlot(null);
              }}
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 2,
                width: 36,
                height: 36,
                border: 'none',
                borderRadius: 8,
                background: 'rgba(15, 23, 42, 0.65)',
                color: '#94a3b8',
                fontSize: 22,
                lineHeight: 1,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
            <GameOverModal
              snapshot={gameOverSnapshot}
              gameId={gameId}
              viewerCanonicalSlotIndex={gameOverViewerSlot}
              onNewGame={async () => {
                setShowGameOverModal(false);
                setGameOverSnapshot(null);
                setGameOverViewerSlot(null);
                if (isOnline && online.leaveRoom) {
                  await online.leaveRoom();
                }
                onNewGame?.();
              }}
              onExit={async () => {
                setShowGameOverModal(false);
                setGameOverSnapshot(null);
                setGameOverViewerSlot(null);
                if (isOnline && online.leaveRoom) await online.leaveRoom();
                handleExit();
              }}
              onOpenTable={() => {
                const v = gameOverViewerSlot;
                setLastDealResultsSnapshot(
                  v != null ? rotateStateForPlayer(gameOverSnapshot, v) : gameOverSnapshot,
                );
                setDealResultsExpanded(true);
                /* панель «Итоги партии» не закрываем — после закрытия таблицы пользователь снова её увидит */
              }}
            />
          </div>
        </div>,
        document.body,
      )}
      {showNewGameConfirm && onNewGame && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowNewGameConfirm(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowNewGameConfirm(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-game-confirm-title"
        >
          <div
            style={newGameConfirmModalStyle}
            onClick={e => e.stopPropagation()}
          >
            <p id="new-game-confirm-title" style={newGameConfirmTextStyle}>
              Текущая партия будет сброшена. Начать новую?
            </p>
            <div style={newGameConfirmButtonsStyle}>
              <button
                type="button"
                onClick={() => setShowNewGameConfirm(false)}
                style={newGameConfirmCancelBtnStyle}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewGameConfirm(false);
                  onNewGame();
                }}
                style={newGameConfirmOkBtnStyle}
              >
                Начать заново
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showExitConfirm && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowExitConfirm(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowExitConfirm(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exit-confirm-title"
        >
          <div
            style={newGameConfirmModalStyle}
            onClick={e => e.stopPropagation()}
          >
            <p id="exit-confirm-title" style={newGameConfirmTextStyle}>
              {isWaitingInRoom
                ? 'Выйти из комнаты? Сессия сбросится, вернуться в эту партию будет нельзя.'
                : 'Выйти из игры? Вы покинете комнату. Вернуться в эту партию будет нельзя.'}
            </p>
            <div style={newGameConfirmButtonsStyle}>
              <button
                type="button"
                onClick={() => setShowExitConfirm(false)}
                style={newGameConfirmCancelBtnStyle}
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleExitConfirm()}
                style={newGameConfirmOkBtnStyle}
              >
                Выйти
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showHomeConfirm && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setShowHomeConfirm(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowHomeConfirm(false); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-confirm-title"
        >
          <div
            style={{ ...newGameConfirmModalStyle, maxWidth: 400 }}
            onClick={e => e.stopPropagation()}
          >
            <p id="home-confirm-title" style={newGameConfirmTextStyle}>
              Выйти в меню? Вы покинете партию. Вернуться в эту партию будет нельзя.
            </p>
            <div style={newGameConfirmButtonsStyle}>
              <button
                type="button"
                onClick={() => setShowHomeConfirm(false)}
                style={newGameConfirmCancelBtnStyle}
              >
                Остаться
              </button>
              <button
                type="button"
                onClick={() => handleHomeConfirm()}
                style={newGameConfirmOkBtnStyle}
              >
                В меню
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectedPlayerForInfo !== null && state && createPortal(
        <PlayerInfoPanel
          state={displayState}
          playerIndex={selectedPlayerForInfo}
          playerAvatarDataUrl={selectedPlayerForInfo === 0 ? playerAvatarDataUrl : undefined}
          onClose={() => setSelectedPlayerForInfo(null)}
          offlineAiDifficultyPicker={playerInfoOfflineAiDifficultyPicker}
        />,
        document.body
      )}
      </div>

    </div>
  );
}

const PLAYER_POSITIONS = [
  { idx: 0, side: 'bottom' as const, name: 'Юг' },
  { idx: 1, side: 'top' as const, name: 'Север' },
  { idx: 2, side: 'left' as const, name: 'Запад' },
  { idx: 3, side: 'right' as const, name: 'Восток' },
];

function DealResultsScreen({ state, isCollapsing = false, variant = 'overlay', isMobile = false, onClose }: { state: GameState; isCollapsing?: boolean; variant?: 'overlay' | 'modal'; isMobile?: boolean; onClose?: () => void }) {
  const [scrollHintVisible, setScrollHintVisible] = useState(variant === 'modal' && isMobile);
  const bids = state.bids as number[];
  const players = state.players;
  const baseStyle = variant === 'modal'
    ? { ...dealResultsModalStyle, ...(isMobile ? dealResultsModalStyleMobile : {}) }
    : dealResultsOverlayStyle;
  const scores = players.map(p => p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;
  const humanIdx = 0;
  const _sorted = [...players].map((p, i) => ({ ...p, idx: i })).sort((a, b) => b.score - a.score);
  const compactModal = variant === 'modal' && isMobile;
  const panelStyle = compactModal ? { ...dealResultsPanelStyle, ...dealResultsPanelStyleMobile } : dealResultsPanelStyle;
  const panelTitleStyle = compactModal ? { ...dealResultsPanelTitleStyle, ...dealResultsPanelTitleStyleMobile } : dealResultsPanelTitleStyle;
  const rowStyle = compactModal ? { ...dealResultsRowStyle, ...dealResultsRowStyleMobile } : dealResultsRowStyle;

  const _renderPanel = (idx: number) => {
    const bid = bids[idx] ?? 0;
    const taken = players[idx].tricksTaken;
    const points = calculateDealPoints(bid, taken);
    const score = players[idx].score;
    const side = PLAYER_POSITIONS.find(p => p.idx === idx)!.side;
    const panelPos = variant === 'modal' ? undefined : getDealResultsPanelPosition(side);
    return (
      <div key={idx} style={{ ...panelStyle, ...(panelPos ?? {}) }}>
        <div style={panelTitleStyle}>{players[idx].name}</div>
        <div style={rowStyle}>
          <span style={dealResultsLabelStyle}>Заказ</span>
          <span style={dealResultsValueStyle}>{bid}</span>
        </div>
        <div style={rowStyle}>
          <span style={dealResultsLabelStyle}>Взяток</span>
          <span style={dealResultsValueStyle}>{taken}</span>
        </div>
        <div style={rowStyle}>
          <span style={dealResultsLabelStyle}>Очки</span>
          <span style={{ ...dealResultsValueStyle, color: points >= 0 ? '#4ade80' : '#f87171' }}>{points >= 0 ? '+' : ''}{points}</span>
        </div>
        <div style={{ ...rowStyle, borderTop: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4, paddingTop: 4 }}>
          <span style={dealResultsLabelTotalStyle}>Итого</span>
          <span style={{
            ...dealResultsValueStyle,
            ...(variant === 'modal' && score === maxScore && range > 0 ? dealResultsValueLeaderStyle : {}),
          }}>{score}</span>
        </div>
      </div>
    );
  };

  /** Краткая подпись раздачи (в ячейке) */
  const _getDealCellLabel = (dealNumber: number) => {
    const type = getDealType(dealNumber);
    const tricks = getTricksInDeal(dealNumber);
    if (type === 'no-trump') return `${dealNumber} БК`;
    if (type === 'dark') return `${dealNumber} Тёмн.`;
    return `${dealNumber} (${tricks} ${tricks === 1 ? 'карта' : tricks < 5 ? 'карты' : 'карт'})`;
  };
  /** Полная расшифровка раздачи для тултипа */
  const getDealCellTitle = (dealNumber: number) => {
    const type = getDealType(dealNumber);
    const tricks = getTricksInDeal(dealNumber);
    if (type === 'no-trump') return `Раздача №${dealNumber} — бескозырка`;
    if (type === 'dark') return `Раздача №${dealNumber} — тёмная`;
    return `Раздача №${dealNumber} — ${tricks} ${tricks === 1 ? 'карта' : tricks < 5 ? 'карты' : 'карт'}`;
  };
  /** Подписи первого столбца таблицы: 1..8, 9×4, 8..1, Б×4, Т×4; последняя строка — Итог */
  const DEAL_COLUMN_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '9', '9', '9', '8', '7', '6', '5', '4', '3', '2', '1', 'Б', 'Б', 'Б', 'Б', 'Т', 'Т', 'Т', 'Т'] as const;
  /** Подпись ячейки первого столбца: на ПК — «Бескозырка»/«Тёмная», на мобильной — Б/Т */
  const getDealColumnLabel = (rowIndex: number) => {
    if (!isMobile) {
      if (rowIndex >= 20 && rowIndex <= 23) return 'Бескозырка';
      if (rowIndex >= 24 && rowIndex <= 27) return 'Тёмная';
    }
    return DEAL_COLUMN_LABELS[rowIndex];
  };

  const dealHistory = state.dealHistory || [];
  const dealColumnWidth = !isMobile ? DEAL_COLUMN_WIDTH_PC : DEAL_COLUMN_WIDTH;
  const playerCellWidth = !isMobile ? PLAYER_CELL_WIDTH_PC : PLAYER_CELL_WIDTH;

  const isOverlayPC = variant === 'overlay' && !isMobile;
  return (
    <div
      className={variant === 'overlay' ? 'deal-results-overlay-animation' : undefined}
      style={{
        ...baseStyle,
        ...(isCollapsing ? dealResultsCollapsingStyle : {}),
      }}
      aria-hidden
    >
      {variant === 'modal' ? (
        <>
          {onClose && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginBottom: 0, paddingTop: 4, gap: 12 }}>
              <div style={{ flex: 1 }} />
              <span style={{
                fontSize: 20,
                fontWeight: 600,
                fontFamily: 'Georgia, "Times New Roman", serif',
                letterSpacing: '0.06em',
                color: 'rgba(34, 211, 238, 0.95)',
                textShadow: '0 0 12px rgba(34, 211, 238, 0.4), 0 1px 0 rgba(0,0,0,0.3)',
              }}>Результаты</span>
              <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    border: '2px solid rgba(34, 211, 238, 0.7)',
                    background: 'rgba(15, 23, 42, 0.95)',
                    color: '#22d3ee',
                    cursor: 'pointer',
                    fontSize: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>
            </div>
          )}
        <div className={!isMobile ? 'deal-results-table-outer-pc' : undefined} style={isMobile ? dealResultsTableOuterMobileStyle : dealResultsTableOuterPCStyle}>
            <div className="deal-results-table-scroll-wrap" style={dealResultsTableScrollWrapStyle}>
              {!isMobile && <div className="deal-results-table-glow-top deal-results-table-glow-pc" style={dealResultsTableGlowPCStripInFlowStyle} aria-hidden />}
              <div
                className="deal-results-table-scroll"
                style={dealResultsTableScrollWrapPCStyle}
                onScroll={() => scrollHintVisible && setScrollHintVisible(false)}
              >
                <div className="deal-results-table-window" style={isMobile ? dealResultsTableWindowStyle : dealResultsTableWindowStylePC}>
                  {isMobile ? (
                    <>
                      <div style={dealResultsTableCaptionStyle}>
                        <span style={{ ...dealResultsTableCaptionZStyle }}>З</span>
                        {' — заказ, '}
                        <span style={{ ...dealResultsTableCaptionOStyle }}>О</span>
                        {' — очки'}
                      </div>
                      <table className="deal-results-table-header-pc" style={{ ...dealResultsTableStyle, minWidth: dealColumnWidth + 8 * playerCellWidth, tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: dealColumnWidth, minWidth: dealColumnWidth }} />
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <col key={i} style={{ width: playerCellWidth, minWidth: playerCellWidth }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr className="deal-results-table-mobile-header-row">
                            <th className="deal-results-table-mobile-deal-th" style={{ ...dealResultsTableThStyle, ...dealResultsTableThDealStyle, minWidth: dealColumnWidth, width: dealColumnWidth }} title="Номер раздачи">
                              <span className="deal-results-table-vertical-label">{'Раздача'.split('').map((c, i) => <span key={i} style={{ display: 'block', lineHeight: 1.15 }}>{c}</span>)}</span>
                            </th>
                            {players.map((p, i) => {
                              const isLeader = range > 0 && p.score === maxScore;
                              return (
                                <th key={i} colSpan={2} className={[i === humanIdx && 'deal-results-cell-human', isLeader && 'deal-results-column-leader deal-results-column-leader-r'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableThStyle, ...dealResultsTableThNameStyle }} title={p.name}>
                                  <span style={dealResultsTableThNameTextStyle}>{p.name}</span>
                                </th>
                              );
                            })}
                          </tr>
                          <tr className="deal-results-table-mobile-header-row">
                            <th style={{ ...dealResultsTableThStyle, ...dealResultsTableThDealStyle, minWidth: dealColumnWidth, width: dealColumnWidth }}></th>
                            {players.map((_, i) => {
                              const isLeader = range > 0 && players[i].score === maxScore;
                              return (
                                <Fragment key={i}>
                                  <th className={isLeader ? 'deal-results-column-leader' : undefined} style={{ ...dealResultsTableThBidStyle, ...(i === 0 ? dealResultsTableThBidFirstStyle : {}), width: playerCellWidth, minWidth: playerCellWidth }} title="Заказ">З</th>
                                  <th className={isLeader ? 'deal-results-column-leader deal-results-column-leader-r' : undefined} style={{ ...dealResultsTableThResultStyle, width: playerCellWidth, minWidth: playerCellWidth }} title="Очки">О</th>
                                </Fragment>
                              );
                            })}
                          </tr>
                        </thead>
                      </table>
                      <div className="deal-results-table-body-scroll-pc" style={dealResultsTableBodyScrollPCStyle} onScroll={() => scrollHintVisible && setScrollHintVisible(false)}>
                        <table className="deal-results-table-body-pc" style={{ ...dealResultsTableStyle, minWidth: dealColumnWidth + 8 * playerCellWidth, tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: dealColumnWidth, minWidth: dealColumnWidth }} />
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                              <col key={i} style={{ width: playerCellWidth, minWidth: playerCellWidth }} />
                            ))}
                          </colgroup>
                          <tbody>
                            {Array.from({ length: 28 }, (_, i) => i + 1).map((dealNum, rowIndex) => {
                              const row = dealHistory.find((r) => r.dealNumber === dealNum);
                              return (
                                <tr key={dealNum}>
                                  <td style={{ ...dealResultsTableTdStyle, ...dealResultsTableTdDealStyle, width: dealColumnWidth, minWidth: dealColumnWidth }} title={getDealCellTitle(dealNum)}>{getDealColumnLabel(rowIndex)}</td>
                                  {row
                                    ? players.map((_, i) => {
                                        const isLeader = range > 0 && players[i].score === maxScore;
                                        return (
                                          <Fragment key={i}>
                                            <td className={isLeader ? 'deal-results-column-leader' : undefined} style={dealResultsTableTdBidStyle}>
                                              {(row as { bids?: number[] }).bids ? (row as { bids: number[] }).bids[i] : '—'}
                                            </td>
                                            <td className={isLeader ? 'deal-results-column-leader deal-results-column-leader-r' : undefined} style={{ ...dealResultsTableTdResultStyle, color: row.points[i] >= 0 ? '#4ade80' : '#f87171' }}>
                                              {row.points[i] >= 0 ? '+' : ''}{row.points[i]}
                                            </td>
                                          </Fragment>
                                        );
                                      })
                                    : players.map((_, i) => {
                                        const isLeader = range > 0 && players[i].score === maxScore;
                                        return (
                                          <Fragment key={i}>
                                            <td className={isLeader ? 'deal-results-column-leader' : undefined} style={dealResultsTableTdBidStyle}>—</td>
                                            <td className={isLeader ? 'deal-results-column-leader deal-results-column-leader-r' : undefined} style={dealResultsTableTdResultStyle}>—</td>
                                          </Fragment>
                                        );
                                      })}
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr>
                              <th colSpan={2} className="deal-results-tfoot-total-mobile" style={{ ...dealResultsTableThStyle, ...dealResultsTableTfootStyle, ...dealResultsTableThDealStyle, ...dealResultsTableThDealFooterStyle, minWidth: dealColumnWidth, width: dealColumnWidth }} title="Итого">Итог</th>
                              {players.map((p, i) => {
                                const isWinner = range > 0 && p.score === maxScore;
                                return (
                                  <Fragment key={i}>
                                    {i > 0 && <td className={isWinner ? 'deal-results-cell-winner deal-results-column-leader' : undefined} style={{ ...dealResultsTableTdBidStyle, ...dealResultsTableTfootStyle }}></td>}
                                    <td className={isWinner ? 'deal-results-cell-winner deal-results-column-leader deal-results-column-leader-r' : undefined} style={{ ...dealResultsTableTdResultStyle, ...dealResultsTableTfootStyle }}>
                                      {p.score >= 0 ? '+' : ''}{p.score}
                                    </td>
                                  </Fragment>
                                );
                              })}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="deal-results-table-body-scroll-pc deal-results-table-unified-scroll-pc" style={dealResultsTableBodyScrollPCStyle} onScroll={() => scrollHintVisible && setScrollHintVisible(false)}>
                      <table className="deal-results-table-unified-pc" style={{ ...dealResultsTableStyle, minWidth: dealColumnWidth + 8 * playerCellWidth, tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: dealColumnWidth, minWidth: dealColumnWidth }} />
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <col key={i} style={{ width: playerCellWidth, minWidth: playerCellWidth }} />
                          ))}
                        </colgroup>
                        <thead>
                          <tr>
                            <th className="deal-results-deal-column-pc" style={{ ...dealResultsTableThStyle, ...dealResultsTableThDealStyle, minWidth: dealColumnWidth, width: dealColumnWidth }} aria-hidden></th>
                            {players.map((p, i) => {
                              const isLeader = range > 0 && p.score === maxScore;
                              return (
                                <th key={i} colSpan={2} className={[i === humanIdx && 'deal-results-cell-human', isLeader && 'deal-results-column-leader'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableThStyle, ...dealResultsTableThNameStyle }} title={p.name}>
                                  <span style={dealResultsTableThNameTextStyle}>{p.name}</span>
                                </th>
                              );
                            })}
                          </tr>
                          <tr>
                            <th className="deal-results-deal-column-pc" style={{ ...dealResultsTableThStyle, ...dealResultsTableThDealStyle, ...dealResultsTableThNumWrapStyle, minWidth: dealColumnWidth, width: dealColumnWidth, textAlign: 'left', paddingLeft: 6 }} title="Номер раздачи">
                              <span style={{ ...dealResultsTableThNumBadgeStyle, width: 20, height: 22, transform: 'none' }}>
                                <span style={{ ...dealResultsTableThNumSymbolStyle, fontSize: 11, transform: 'none' }}>№</span>
                              </span>
                              <span className="deal-results-deal-cell-label"> Раздача</span>
                            </th>
                            {players.map((_, i) => {
                              const isLeader = range > 0 && players[i].score === maxScore;
                              const isHuman = i === humanIdx;
                              return (
                                <Fragment key={i}>
                                  <th className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableThBidStyle, ...(i === 0 ? dealResultsTableThBidFirstStyle : {}), width: playerCellWidth, minWidth: playerCellWidth }} title="Заказ">Заказ</th>
                                  <th className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableThResultStyle, width: playerCellWidth, minWidth: playerCellWidth }} title="Очки">Очки</th>
                                </Fragment>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 28 }, (_, i) => i + 1).map((dealNum, rowIndex) => {
                            const row = dealHistory.find((r) => r.dealNumber === dealNum);
                            return (
                              <tr key={dealNum}>
                                <td className="deal-results-deal-column-pc" style={{ ...dealResultsTableTdStyle, ...dealResultsTableTdDealStyle, width: dealColumnWidth, minWidth: dealColumnWidth }} title={getDealCellTitle(dealNum)}><span className="deal-results-deal-cell-label">{getDealColumnLabel(rowIndex)}</span></td>
                                {row
                                  ? players.map((_, i) => {
                                      const isLeader = range > 0 && players[i].score === maxScore;
                                      const isHuman = i === humanIdx;
                                      return (
                                        <Fragment key={i}>
                                          <td className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={dealResultsTableTdBidStyle}>
                                            {(row as { bids?: number[] }).bids ? (row as { bids: number[] }).bids[i] : '—'}
                                          </td>
                                          <td className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableTdResultStyle, color: row.points[i] >= 0 ? '#4ade80' : '#f87171' }}>
                                            {row.points[i] >= 0 ? '+' : ''}{row.points[i]}
                                          </td>
                                        </Fragment>
                                      );
                                    })
                                  : players.map((_, i) => {
                                      const isLeader = range > 0 && players[i].score === maxScore;
                                      const isHuman = i === humanIdx;
                                      return (
                                        <Fragment key={i}>
                                          <td className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={dealResultsTableTdBidStyle}>—</td>
                                          <td className={[isLeader && 'deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={dealResultsTableTdResultStyle}>—</td>
                                        </Fragment>
                                      );
                                    })}
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr>
                            <th className="deal-results-deal-column-pc" style={{ ...dealResultsTableThStyle, ...dealResultsTableTfootStyle, ...dealResultsTableThDealStyle, ...dealResultsTableThDealFooterStyle, minWidth: dealColumnWidth, width: dealColumnWidth }} title="Итого"><span className="deal-results-deal-cell-label">Итог</span></th>
                            {players.map((p, i) => {
                              const isWinner = range > 0 && p.score === maxScore;
                              const isHuman = i === humanIdx;
                              return (
                                <Fragment key={i}>
                                  <td className={[isWinner && 'deal-results-cell-winner deal-results-column-leader', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={{ ...(i === 0 ? dealResultsTableTdFooterFirstStyle : dealResultsTableTdBidStyle), ...dealResultsTableTfootStyle, ...(i === 0 && dealColumnWidth !== DEAL_COLUMN_WIDTH ? { paddingLeft: dealColumnWidth + DEAL_COLUMN_FOOTER_EXTRA } : {}) }}></td>
                                  <td className={[isWinner && 'deal-results-cell-winner deal-results-column-leader deal-results-column-leader-r', isHuman && 'deal-results-cell-human'].filter(Boolean).join(' ') || undefined} style={{ ...dealResultsTableTdResultStyle, ...dealResultsTableTfootStyle }}>
                                    {p.score >= 0 ? '+' : ''}{p.score}
                                  </td>
                                </Fragment>
                              );
                            })}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
              {isMobile && (
              <>
                <div className="deal-results-table-glow-top" style={dealResultsTableGlowTopStyle} aria-hidden />
                <div className="deal-results-table-glow-bottom" style={dealResultsTableGlowBottomStyle} aria-hidden />
              </>
              )}
              {!isMobile && <div className="deal-results-table-glow-bottom deal-results-table-glow-pc" style={dealResultsTableGlowPCStripInFlowStyle} aria-hidden />}
              {scrollHintVisible && (
                <div className="deal-results-table-scroll-hint" style={dealResultsTableScrollHintWrapStyle} aria-hidden>
                  <span className="deal-results-table-scroll-hint-chevron" style={dealResultsTableScrollHintChevronStyle}>↓</span>
                </div>
              )}
            </div>
        </div>
        </>
      ) : (
        <>
      {PLAYER_POSITIONS.map(({ idx, side }) => {
        const bid = bids[idx] ?? 0;
        const taken = players[idx].tricksTaken;
        const points = calculateDealPoints(bid, taken);
        const score = players[idx].score;
        const panelPos = getDealResultsPanelPosition(side);
        const sideClass = side === 'left' ? 'deal-results-panel-west' : side === 'right' ? 'deal-results-panel-east' : side === 'top' ? 'deal-results-panel-north' : side === 'bottom' ? 'deal-results-panel-south' : undefined;
        return (
          <div key={idx} className={sideClass} style={{ ...dealResultsPanelStyle, ...(isOverlayPC ? dealResultsPanelStyleOverlayPC : {}), ...panelPos }}>
            <div className={isOverlayPC ? 'deal-results-panel-title-overlay' : undefined} style={{ ...dealResultsPanelTitleStyle, ...(isOverlayPC ? dealResultsPanelTitleStyleOverlayPC : {}) }}>{players[idx].name}</div>
            <div style={dealResultsRowStyle}>
              <span style={dealResultsLabelStyle}>Заказ</span>
              <span style={dealResultsValueStyle}>{bid}</span>
            </div>
            <div style={dealResultsRowStyle}>
              <span style={dealResultsLabelStyle}>Взяток</span>
              <span style={dealResultsValueStyle}>{taken}</span>
            </div>
            <div style={dealResultsRowStyle}>
              <span style={dealResultsLabelStyle}>Очки</span>
              <span style={{ ...dealResultsValueStyle, color: points >= 0 ? '#4ade80' : '#f87171' }}>{points >= 0 ? '+' : ''}{points}</span>
            </div>
            <div style={{ ...dealResultsRowStyle, borderTop: '1px solid rgba(34, 211, 238, 0.3)', marginTop: 4, paddingTop: 4 }}>
              <span style={dealResultsLabelTotalStyle}>Итого</span>
              <span style={dealResultsValueStyle}>{score}</span>
            </div>
          </div>
        );
      })}
        </>
      )}
    </div>
  );
}

function getDealResultsPanelPosition(side: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute' };
  switch (side) {
    case 'top': return { ...base, left: '50%', transform: 'translateX(-50%)' };
    case 'bottom': return { ...base, left: '50%', transform: 'translateX(-50%)' };
    case 'left': return { ...base, top: '50%', transform: 'translateY(-50%)' };
    case 'right': return { ...base, top: '50%', transform: 'translateY(-50%)' };
    default: return base;
  }
}

/** Склонение «взятка» (1 взятка, 2 взятки, 5 взяток; 11–14 — всегда взяток). */
function tricksDeclension(n: number): 'взятка' | 'взятки' | 'взяток' {
  const k = Math.abs(Math.trunc(n)) % 100;
  const d = k % 10;
  if (k >= 11 && k <= 14) return 'взяток';
  if (d === 1) return 'взятка';
  if (d >= 2 && d <= 4) return 'взятки';
  return 'взяток';
}

/** «N взятка/взятки/взяток» для подписей и тултипов. */
function tricksPhrase(n: number): string {
  return `${n} ${tricksDeclension(n)}`;
}

/** Сколько взяток ещё не сыграно в раздаче (сумма взятых по всем игрокам = число завершённых взяток). */
function tricksRemainingInDeal(state: { tricksInDeal: number; players: { tricksTaken?: number }[] }): number {
  const played = state.players.reduce((sum, p) => sum + (p.tricksTaken ?? 0), 0);
  return Math.max(0, state.tricksInDeal - played);
}

/** Подсказка для таблички заказа оппонента (title / тап на мобильной). */
function opponentOrderBadgeTitle(bid: number | null, tricksTaken: number): string {
  if (bid == null) {
    return 'Сколько взяток игрок обещает взять в этой раздаче. Пока заказ не сделан.';
  }
  return `Заказ: ${tricksPhrase(bid)}. Уже взято: ${tricksPhrase(tricksTaken)}.`;
}

/** Текст всплывающей подсказки по тапу на заказ оппонента (только мобильная). */
function opponentOrderTapHintText(bid: number | null, tricksTaken: number): string {
  if (bid == null) {
    return 'Заказ ещё не выбран.';
  }
  return `Заказ игрока: ${tricksPhrase(bid)}. Взято: ${tricksPhrase(tricksTaken)}.`;
}

/** Тултип (ПК, число заказа над стопкой взяток соперника). */
function opponentPcStackBidTooltip(bid: number): string {
  return `Обещание в раздаче: ${tricksPhrase(bid)}. Недобор и перебор меняют очки.`;
}

/** Тултип (ПК, число взятых взяток над стопкой). */
function opponentPcStackTakenTooltip(bid: number, tricksTaken: number): string {
  if (tricksTaken < bid) {
    return `Сейчас ${tricksPhrase(tricksTaken)} из ${tricksPhrase(bid)} по заказу.`;
  }
  if (tricksTaken === bid) {
    return `Ровно ${tricksPhrase(bid)} — как заказано.`;
  }
  return `Взято ${tricksPhrase(tricksTaken)} при заказе ${tricksPhrase(bid)}. Справа оранжевым — сверх заказа.`;
}

/** Тултип (ПК, ваш заказ — число слева у панели взяток). */
function playerPcStackBidTooltip(bid: number): string {
  return `Ваш заказ: ${tricksPhrase(bid)}. Недобор и перебор меняют очки.`;
}

function playerPcStackBidTooltipPending(): string {
  return 'Сколько взяток хотите взять — выберите в панели заказа.';
}

/** Тултип (ПК, сколько вы уже взяли взяток). */
function playerPcStackTakenTooltip(bid: number, tricksTaken: number): string {
  if (tricksTaken < bid) {
    return `У вас ${tricksPhrase(tricksTaken)} из ${tricksPhrase(bid)}.`;
  }
  if (tricksTaken === bid) {
    return `Ровно ${tricksPhrase(bid)} — как вы заказали.`;
  }
  return `Взято ${tricksPhrase(tricksTaken)}, заказ ${tricksPhrase(bid)}. Оранжевым — сверх заказа.`;
}

function playerPcStackTakenTooltipPending(tricksTaken: number): string {
  if (tricksTaken === 0) {
    return 'Сколько взяток вы уже забрали в этой раздаче.';
  }
  return `Уже ${tricksPhrase(tricksTaken)}. После заказа сравните с обещанным числом.`;
}

const pcTrickBidFigureStyle: React.CSSProperties = {
  cursor: 'help',
  color: '#fb923c',
  textShadow: '0 1px 2px rgba(0,0,0,0.9), 0 0 6px rgba(234,88,12,0.45), 0 0 1px rgba(185,28,28,0.6)',
};

const pcTrickTakenFigureStyle: React.CSSProperties = {
  cursor: 'help',
  color: '#5eead4',
  textShadow: [
    '0 0 6px rgba(45, 212, 191, 0.95)',
    '0 0 12px rgba(34, 211, 238, 0.75)',
    '0 0 18px rgba(6, 182, 212, 0.45)',
    '0 1px 2px rgba(0,0,0,0.9)',
  ].join(', '),
};

/** ПК, оппонент: «взято» слева — без неона (пока заказ не совпал с взятым). */
const pcTrickTakenPlainOpponentStyle: React.CSSProperties = {
  cursor: 'help',
  color: 'rgba(226, 232, 240, 0.96)',
  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
};

/** ПК: оба числа при ровном попадании в заказ — нежный сиренево-голубой неон */
const pcTrickExactMatchFigureStyle: React.CSSProperties = {
  cursor: 'help',
  color: '#e9d5ff',
  textShadow: [
    '0 0 5px rgba(167, 139, 250, 0.42)',
    '0 0 10px rgba(125, 211, 252, 0.28)',
    '0 1px 2px rgba(0,0,0,0.92)',
  ].join(', '),
};

/** Компактная панель: неон цифр только inline (не зависит от CSS / viewport-класса на корне) */
const mobileCompactNeonDigitExact: React.CSSProperties = {
  cursor: 'help',
  color: '#34d399',
  fontWeight: 900,
  WebkitTextStroke: '0.8px rgba(4, 47, 46, 0.92)',
  textShadow:
    '0 0 10px rgba(52,211,153,0.98), 0 0 20px rgba(16,185,129,0.92), 0 0 30px rgba(34,211,238,0.72), 0 2px 5px rgba(0,0,0,0.92)',
};

/** Компакт: «взято» пока заказ не набран — жёлтый неон */
const mobileCompactNeonDigitChasingTaken: React.CSSProperties = {
  cursor: 'help',
  color: '#fde047',
  fontWeight: 900,
  WebkitTextStroke: '0.78px rgba(66, 32, 6, 0.9)',
  textShadow:
    '0 0 10px rgba(250,204,21,0.98), 0 0 20px rgba(234,179,8,0.88), 0 0 28px rgba(245,158,11,0.62), 0 2px 5px rgba(0,0,0,0.92)',
};

/** Компакт: перебор — обе цифры рыжо-оранжевый неон */
const mobileCompactNeonDigitOver: React.CSSProperties = {
  cursor: 'help',
  color: '#fdba74',
  fontWeight: 900,
  WebkitTextStroke: '0.88px rgba(67, 20, 7, 0.92)',
  textShadow:
    '0 0 12px rgba(251,146,60,0.98), 0 0 22px rgba(249,115,22,0.88), 0 0 20px rgba(234,88,12,0.72), 0 2px 5px rgba(0,0,0,0.92)',
};
const mobileCompactNeonSlashExact: React.CSSProperties = {
  cursor: 'default',
  color: '#6ee7b7',
  fontWeight: 900,
  WebkitTextStroke: '0.55px rgba(4, 47, 46, 0.85)',
  textShadow: '0 0 12px rgba(45,212,191,0.95), 0 0 8px rgba(103,232,249,0.8), 0 1px 2px rgba(0,0,0,0.9)',
  userSelect: 'none',
};
const mobileCompactNeonSlashOver: React.CSSProperties = {
  cursor: 'default',
  color: '#fb923c',
  fontWeight: 900,
  WebkitTextStroke: '0.72px rgba(67, 20, 7, 0.88)',
  textShadow:
    '0 0 12px rgba(251,146,60,0.95), 0 0 18px rgba(249,115,22,0.78), 0 0 10px rgba(234,88,12,0.55), 0 1px 2px rgba(0,0,0,0.9)',
  userSelect: 'none',
};

const mobileCompactNeonSlashChasing: React.CSSProperties = {
  cursor: 'default',
  color: '#facc15',
  fontWeight: 900,
  WebkitTextStroke: '0.62px rgba(66, 32, 6, 0.86)',
  textShadow:
    '0 0 12px rgba(250,204,21,0.95), 0 0 14px rgba(234,179,8,0.8), 0 1px 2px rgba(0,0,0,0.9)',
  userSelect: 'none',
};

/** Компакт: взятки уже на руке, заказ ещё добираем — цифра заказа, бирюзово-целевой неон */
const mobileCompactNeonBidChasing: React.CSSProperties = {
  cursor: 'help',
  color: '#22d3ee',
  fontWeight: 900,
  WebkitTextStroke: '0.72px rgba(8, 47, 73, 0.9)',
  textShadow:
    '0 0 10px rgba(34,211,238,0.96), 0 0 18px rgba(6,182,212,0.82), 0 0 14px rgba(45,212,191,0.58), 0 2px 4px rgba(0,0,0,0.9)',
};

/** ПК: недобор — приглушённый красный (минус по очкам; не кричащий) */
const pcTrickUnderBidFigureStyle: React.CSSProperties = {
  cursor: 'help',
  color: '#fecaca',
  textShadow: [
    '0 0 4px rgba(248, 113, 113, 0.38)',
    '0 0 10px rgba(185, 70, 80, 0.28)',
    '0 1px 2px rgba(0,0,0,0.9)',
  ].join(', '),
};

/** ПК: перебор — тусклый болотно-жёлтый (без минуса в зачёте) */
const pcTrickOverBidFigureStyle: React.CSSProperties = {
  cursor: 'help',
  color: '#c8c89a',
  textShadow: [
    '0 0 5px rgba(154, 166, 95, 0.32)',
    '0 0 11px rgba(120, 125, 72, 0.2)',
    '0 0 16px rgba(90, 95, 55, 0.12)',
    '0 1px 2px rgba(0,0,0,0.88)',
  ].join(', '),
};

/**
 * Пара «взято / заказ» для ПК (порядок цифр одинаковый для игрока и оппонентов).
 * tricksLeftInDeal: при недоборе красная подсветка только если взято + остаток раздачи < заказа.
 */
function PcTrickBidTakenFigures({
  bid,
  tricksTaken,
  audience,
  fontSize,
  style,
  tricksLeftInDeal,
  /** Компактная панель: усиленный неон при взятках на руке (см. tricksOnHandHeavyNeon в TrickSlotsDisplay) */
  exactMatchHeavyNeon,
  /** Мобильная Север/Запад: заказ >6 — цифры в «ушке» столбиком (взято / заказ) */
  mobileNwEarFigures,
}: {
  bid: number | null;
  tricksTaken: number;
  audience: 'opponent' | 'player';
  fontSize: number;
  style?: CSSProperties;
  tricksLeftInDeal?: number;
  exactMatchHeavyNeon?: boolean;
  mobileNwEarFigures?: boolean;
}) {
  const bidTitle =
    bid == null
      ? audience === 'player'
        ? playerPcStackBidTooltipPending()
        : 'Заказ в этой раздаче ещё не сделан.'
      : audience === 'player'
        ? playerPcStackBidTooltip(bid)
        : opponentPcStackBidTooltip(bid);

  const takenTitle =
    bid == null
      ? audience === 'player'
        ? playerPcStackTakenTooltipPending(tricksTaken)
        : `Уже ${tricksPhrase(tricksTaken)}. Число заказа — после его выбора.`
      : audience === 'player'
        ? playerPcStackTakenTooltip(bid, tricksTaken)
        : opponentPcStackTakenTooltip(bid, tricksTaken);

  const bidDisplay = bid == null ? '—' : String(bid);
  const bidSpanStyle: CSSProperties =
    bid == null
      ? {
          ...pcTrickBidFigureStyle,
          cursor: 'help',
          color: 'rgba(148, 163, 184, 0.95)',
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
        }
      : pcTrickBidFigureStyle;

  const slashStyleBase: CSSProperties = {
    cursor: 'default',
    color: 'rgba(148, 163, 184, 0.95)',
    fontWeight: 700,
    textShadow: '0 1px 2px rgba(0,0,0,0.85)',
    userSelect: 'none',
  };

  const bidN = bid == null || Number.isNaN(Number(bid)) ? null : Number(bid);
  const exactMatch = bidN !== null && tricksTaken === bidN;
  const overBid = bidN !== null && tricksTaken > bidN;
  const underBid = bidN !== null && tricksTaken < bidN;
  const underBidPenalize =
    underBid &&
    (tricksLeftInDeal === undefined || (bidN != null && tricksTaken + tricksLeftInDeal < bidN));

  /** Компакт: усиленный неон для панели «взято/заказ» (есть взятки на руке и не жёсткий недобор) */
  const neonOn = !!exactMatchHeavyNeon;
  /** Есть взятки на руке, но заказ ещё не выполнен и не перебор — отдельные стили цифр */
  const chasingHandNeon = neonOn && !overBid && !exactMatch && !underBidPenalize;
  /** С момента первой взятки на руке — класс + чуть крупнее кегль (см. index.css --hand-bold) */
  const handNeonBold = neonOn && tricksTaken >= 1;
  const mobileNeonFiguresCls = neonOn
    ? [
        'trick-bid-taken-figures-neon',
        `trick-bid-taken-figures-neon--${audience}`,
        overBid ? 'trick-bid-taken-figures-neon--overbid' : '',
        handNeonBold ? 'trick-bid-taken-figures-neon--hand-bold' : '',
      ]
        .filter(Boolean)
        .join(' ')
    : undefined;

  const slashNeonBase: CSSProperties = neonOn
    ? overBid
      ? mobileCompactNeonSlashOver
      : exactMatch
        ? mobileCompactNeonSlashExact
        : chasingHandNeon
          ? mobileCompactNeonSlashChasing
          : mobileCompactNeonSlashExact
    : slashStyleBase;
  const slashFinal: CSSProperties = slashNeonBase;

  /** ПК-оппонент: взято / заказ; точно — сирень; перебор — болотно-жёлтый; жёсткий недобор — красный (заказ уже невыполним). */
  if (audience === 'opponent') {
    if (mobileNwEarFigures) {
      let takenFigStyle: CSSProperties = overBid
        ? neonOn
          ? mobileCompactNeonDigitOver
          : pcTrickOverBidFigureStyle
        : exactMatch
          ? neonOn
            ? mobileCompactNeonDigitExact
            : pcTrickExactMatchFigureStyle
          : underBidPenalize
            ? pcTrickUnderBidFigureStyle
            : chasingHandNeon
              ? mobileCompactNeonDigitChasingTaken
              : pcTrickTakenPlainOpponentStyle;
      let bidFigStyle: CSSProperties =
        bid == null
          ? {
              ...pcTrickBidFigureStyle,
              cursor: 'help',
              color: 'rgba(148, 163, 184, 0.95)',
              textShadow: '0 1px 2px rgba(0,0,0,0.85)',
            }
          : overBid
            ? neonOn
              ? mobileCompactNeonDigitOver
              : pcTrickOverBidFigureStyle
            : exactMatch
              ? neonOn
                ? mobileCompactNeonDigitExact
                : pcTrickExactMatchFigureStyle
              : underBidPenalize
                ? pcTrickUnderBidFigureStyle
                : chasingHandNeon
                  ? mobileCompactNeonBidChasing
                  : pcTrickBidFigureStyle;
      const earFont = handNeonBold ? Math.min(12, Math.round(fontSize * 1.08)) : Math.min(11, fontSize + 1);
      return (
        <span
          className={mobileNeonFiguresCls}
          style={{
            display: 'inline-flex',
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'center',
            gap: 3,
            fontSize: earFont,
            fontWeight: neonOn ? 900 : 800,
            letterSpacing: '0.02em',
            lineHeight: 1.1,
            whiteSpace: 'nowrap',
            ...style,
          }}
          aria-hidden
        >
          <span title={takenTitle} style={{ ...takenFigStyle, fontVariantNumeric: 'tabular-nums' }}>
            {tricksTaken}
          </span>
          <span style={slashFinal} aria-hidden>
            /
          </span>
          <span title={bidTitle} style={{ ...bidFigStyle, fontVariantNumeric: 'tabular-nums' }}>
            {bidDisplay}
          </span>
        </span>
      );
    }
    let takenFigStyle: CSSProperties = overBid
      ? neonOn
        ? mobileCompactNeonDigitOver
        : pcTrickOverBidFigureStyle
      : exactMatch
        ? neonOn
          ? mobileCompactNeonDigitExact
          : pcTrickExactMatchFigureStyle
        : underBidPenalize
          ? pcTrickUnderBidFigureStyle
          : chasingHandNeon
            ? mobileCompactNeonDigitChasingTaken
            : pcTrickTakenPlainOpponentStyle;
    let bidFigStyle: CSSProperties =
      bid == null
        ? {
            ...pcTrickBidFigureStyle,
            cursor: 'help',
            color: 'rgba(148, 163, 184, 0.95)',
            textShadow: '0 1px 2px rgba(0,0,0,0.85)',
          }
        : overBid
          ? neonOn
            ? mobileCompactNeonDigitOver
            : pcTrickOverBidFigureStyle
          : exactMatch
            ? neonOn
              ? mobileCompactNeonDigitExact
              : pcTrickExactMatchFigureStyle
            : underBidPenalize
              ? pcTrickUnderBidFigureStyle
              : chasingHandNeon
                ? mobileCompactNeonBidChasing
                : pcTrickBidFigureStyle;

    return (
      <span
        className={mobileNeonFiguresCls}
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 3,
          fontSize: handNeonBold ? Math.min(14, Math.round(fontSize * 1.14)) : fontSize,
          fontWeight: neonOn ? 900 : 800,
          letterSpacing: handNeonBold ? '0.05em' : '0.04em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
          ...style,
        }}
        aria-hidden
      >
        <span title={takenTitle} style={takenFigStyle}>
          {tricksTaken}
        </span>
        <span style={slashFinal} aria-hidden>
          /
        </span>
        <span title={bidTitle} style={bidFigStyle}>
          {bidDisplay}
        </span>
      </span>
    );
  }

  let bidFigPlayer: CSSProperties =
    bid == null
      ? bidSpanStyle
      : overBid
        ? neonOn
          ? mobileCompactNeonDigitOver
          : pcTrickOverBidFigureStyle
        : exactMatch
          ? neonOn
            ? mobileCompactNeonDigitExact
            : pcTrickExactMatchFigureStyle
          : underBidPenalize
            ? pcTrickUnderBidFigureStyle
            : chasingHandNeon
              ? mobileCompactNeonBidChasing
              : pcTrickBidFigureStyle;
  let takenFigPlayer: CSSProperties = overBid
    ? neonOn
      ? mobileCompactNeonDigitOver
      : pcTrickOverBidFigureStyle
    : exactMatch
      ? neonOn
        ? mobileCompactNeonDigitExact
        : pcTrickExactMatchFigureStyle
      : underBidPenalize
        ? pcTrickUnderBidFigureStyle
        : chasingHandNeon
          ? mobileCompactNeonDigitChasingTaken
          : pcTrickTakenFigureStyle;

  /** Как у оппонентов: сначала взято, затем заказ. */
  return (
    <span
      className={mobileNeonFiguresCls}
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: 3,
        fontSize: handNeonBold ? Math.min(14, Math.round(fontSize * 1.14)) : fontSize,
        fontWeight: neonOn ? 900 : 800,
        letterSpacing: handNeonBold ? '0.05em' : '0.04em',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden
    >
      <span title={takenTitle} style={takenFigPlayer}>
        {tricksTaken}
      </span>
      <span style={slashFinal} aria-hidden>
        /
      </span>
      <span title={bidTitle} style={bidFigPlayer}>
        {bidDisplay}
      </span>
    </span>
  );
}

/** Оппонент, компактная табличка: title; на мобильной без подписи «Заказ» — тап открывает короткую подсказку. */
function OpponentBidCompactWrap({
  children,
  wrapStyle,
  wrapCls,
  bid,
  tricksTaken,
  tapHintEnabled,
  ariaLabel,
  orderHintSlot,
}: {
  children: React.ReactNode;
  wrapStyle: CSSProperties;
  wrapCls: string;
  bid: number | null;
  tricksTaken: number;
  tapHintEnabled: boolean;
  ariaLabel?: string;
  /** Мобильная: куда сдвинуть тултип, чтобы не обрезался у края экрана */
  orderHintSlot?: 'north' | 'west' | 'east';
}) {
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    },
    []
  );

  const clearHintTimer = () => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  };

  const showHint = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      if (!tapHintEnabled) return;
      e.stopPropagation();
      if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
      if ('key' in e) e.preventDefault();
      clearHintTimer();
      setHintVisible(true);
      hintTimerRef.current = setTimeout(() => {
        setHintVisible(false);
        hintTimerRef.current = null;
      }, 2600);
    },
    [tapHintEnabled]
  );

  const title = opponentOrderBadgeTitle(bid, tricksTaken);
  const mergedStyle: CSSProperties = { ...wrapStyle, position: 'relative' };
  const hintSlot = orderHintSlot ?? 'north';

  if (tapHintEnabled) {
    return (
      <button
        type="button"
        className={wrapCls}
        style={{
          ...mergedStyle,
          cursor: 'pointer',
          font: 'inherit',
          color: 'inherit',
          WebkitTapHighlightColor: 'transparent',
          border: mergedStyle.border ?? '1px solid transparent',
          background: mergedStyle.background as string | undefined,
          padding: mergedStyle.padding,
          margin: 0,
          borderRadius: mergedStyle.borderRadius,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: mergedStyle.gap ?? 3,
          maxWidth: '100%',
        }}
        title={title}
        aria-label={ariaLabel ?? title}
        onClick={showHint}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') showHint(e);
        }}
      >
        {children}
        {hintVisible ? (
          <span
            className={`opponent-order-hint-popover opponent-order-hint-popover--slot-${hintSlot}`}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              zIndex: 120,
              maxWidth: 240,
              padding: '8px 10px',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: 1.35,
              textAlign: 'center',
              color: '#f1f5f9',
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(56, 189, 248, 0.5)',
              borderRadius: 8,
              boxShadow: '0 4px 20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
              textShadow: '0 1px 2px rgba(0,0,0,0.9)',
              pointerEvents: 'none',
            }}
            role="status"
          >
            {opponentOrderTapHintText(bid, tricksTaken)}
          </span>
        ) : null}
      </button>
    );
  }

  return (
    <div style={mergedStyle} className={wrapCls} title={title} role="status" aria-label={ariaLabel ?? title}>
      {children}
    </div>
  );
}

function TrickSlotsDisplay({
  bid,
  tricksTaken,
  variant,
  horizontalOnly,
  collectingCards,
  compactMode,
  eastMobileTricks,
  opponentMobileHideOrderLabel,
  opponentMobileZeroOrderCross,
  opponentOrderHintSlot,
  playerMobileWideTricks,
  /** Сколько взяток ещё не сыграно в раздаче (для мягкого недобора на ПК). */
  tricksLeftInDeal,
}: {
  bid: number | null;
  tricksTaken: number;
  variant: 'opponent' | 'player';
  horizontalOnly?: boolean;
  collectingCards?: boolean;
  compactMode?: boolean;
  /** Только мобильная панель Восток: +17%; сетка слотов 3×3 (ряды по 3), без числа заказа */
  eastMobileTricks?: boolean;
  /** Только мобильная + оппоненты: без слова «Заказ», только кружочки (у игрока подпись остаётся). */
  opponentMobileHideOrderLabel?: boolean;
  /** Только телефон: при заказе 0 — крестик «ноль взяток» вместо пустой полоски кружков */
  opponentMobileZeroOrderCross?: boolean;
  /** Мобильная: сторона слота оппонента — позиция тултипа заказа у края экрана */
  opponentOrderHintSlot?: 'north' | 'west' | 'east';
  /** Только телефон (viewport-mobile): чуть шире бюджет под кружки заказа у панели игрока (слот Юг). */
  playerMobileWideTricks?: boolean;
  tricksLeftInDeal?: number;
}) {
  const zeroCrossGradId = useId().replace(/:/g, '');
  const isCompact = variant === 'opponent';
  const hideOppOrderWord = Boolean(compactMode && variant === 'opponent' && opponentMobileHideOrderLabel);
  const slotSize = isCompact ? { w: 44, h: 62 } : { w: 52, h: 76 };

  if (bid === null) {
    const nullWrap = compactMode ? { ...trickCirclesWrapStyle, border: '1px solid rgba(71, 85, 105, 0.5)', background: 'rgba(30, 41, 59, 0.8)', boxShadow: 'none' } : trickSlotsWrapStyle;
    const nullCls = [collectingCards ? 'trick-slots-collecting' : 'trick-slots-normal', eastMobileTricks ? 'trick-slots-east-mobile' : ''].filter(Boolean).join(' ');
    const compactNullFigFont = variant === 'player' ? 10 : 9;
    const nullInner = compactMode ? (
      <PcTrickBidTakenFigures
        bid={null}
        tricksTaken={tricksTaken}
        audience={variant}
        fontSize={compactNullFigFont}
        tricksLeftInDeal={tricksLeftInDeal}
        style={{ lineHeight: 1 }}
      />
    ) : (
      <>
        {!hideOppOrderWord && (
          <span className={eastMobileTricks ? 'trick-slots-label-east-mobile' : undefined} style={trickSlotsLabelStyle}>
            Заказ
          </span>
        )}
        <span style={trickSlotsValueStyle}>—</span>
      </>
    );
    if (variant === 'opponent' && compactMode) {
      return (
        <OpponentBidCompactWrap
          wrapStyle={nullWrap}
          wrapCls={nullCls}
          bid={null}
          tricksTaken={tricksTaken}
          tapHintEnabled={hideOppOrderWord}
          ariaLabel={hideOppOrderWord ? 'Заказ ещё не сделан' : undefined}
          orderHintSlot={opponentOrderHintSlot}
        >
          {nullInner}
        </OpponentBidCompactWrap>
      );
    }
    if (variant === 'player' && !compactMode) {
      return (
        <div
          style={{ ...nullWrap, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          className={nullCls}
          role="status"
          aria-label={`Заказ не выбран. Уже ${tricksPhrase(tricksTaken)}.`}
        >
          <PcTrickBidTakenFigures bid={null} tricksTaken={tricksTaken} audience="player" fontSize={11} />
        </div>
      );
    }
    return (
      <div style={nullWrap} className={nullCls} role="status" aria-label={hideOppOrderWord ? 'Заказ ещё не сделан' : undefined}>
        {nullInner}
      </div>
    );
  }

  const extra = Math.max(0, tricksTaken - bid);
  const orderedSlots = bid;
  const totalFilled = tricksTaken;
  const hideCards = !!collectingCards;

  if (compactMode) {
    const bidNum = bid == null || Number.isNaN(Number(bid)) ? null : Number(bid);
    /** Мобильная: заказ 0 — фиксированная зона с крестиком «не брать взятки» (+ перебор, если есть). */
    if (variant === 'opponent' && opponentMobileZeroOrderCross && bid === 0) {
      const zeroTone =
        tricksTaken === 0
          ? trickCirclesWrapPendingStyle
          : !hideCards
            ? trickCirclesWrapMobileOverBidStyle
            : trickCirclesWrapPendingStyle;
      const wrapStyle = {
        ...trickCirclesWrapStyle,
        ...zeroTone,
        minWidth: 34,
      };
      const zeroOrderMet = !hideCards && tricksTaken === 0;
      const zeroOrderOver = !hideCards && tricksTaken > 0;
      const wrapCls = [
        hideCards ? 'trick-slots-collecting' : 'trick-slots-normal',
        eastMobileTricks ? 'trick-slots-east-mobile' : '',
        zeroOrderMet ? 'trick-slots-order-complete' : '',
        zeroOrderOver ? 'trick-slots-order-over' : '',
      ]
        .filter(Boolean)
        .join(' ');
      const zeroRowStyle: CSSProperties = {
        ...trickCirclesRowStyle,
        alignItems: 'center',
        justifyContent: 'center',
      };
      const zeroInner = (
        <>
          <PcTrickBidTakenFigures
            bid={0}
            tricksTaken={tricksTaken}
            audience="opponent"
            fontSize={9}
            tricksLeftInDeal={tricksLeftInDeal}
            exactMatchHeavyNeon={!hideCards && tricksTaken > 0}
            style={{ lineHeight: 1, marginBottom: 2 }}
          />
          <div style={zeroRowStyle}>
            <span className="opponent-zero-order-cross-mobile" title="Заказ: не брать взятки" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <defs>
                  <linearGradient id={zeroCrossGradId} x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#fef3c7" />
                    <stop offset="0.4" stopColor="#fb923c" />
                    <stop offset="1" stopColor="#c2410c" />
                  </linearGradient>
                </defs>
                <path
                  d="M6.25 6.25l11.5 11.5m0-11.5l-11.5 11.5"
                  stroke="rgba(15, 23, 42, 0.6)"
                  strokeWidth="6.25"
                  strokeLinecap="round"
                />
                <path
                  d="M6.25 6.25l11.5 11.5m0-11.5l-11.5 11.5"
                  stroke={`url(#${zeroCrossGradId})`}
                  strokeWidth="4.35"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            {extra > 0 && !hideCards ? (
              <span style={trickCirclesPlusStyle}>+{extra}</span>
            ) : null}
          </div>
        </>
      );
      return (
        <OpponentBidCompactWrap
          wrapStyle={wrapStyle}
          wrapCls={wrapCls}
          bid={bid}
          tricksTaken={tricksTaken}
          tapHintEnabled={hideOppOrderWord}
          ariaLabel={hideOppOrderWord ? opponentOrderBadgeTitle(bid, tricksTaken) : undefined}
          orderHintSlot={opponentOrderHintSlot}
        >
          {zeroInner}
        </OpponentBidCompactWrap>
      );
    }

    let scaleDown = variant === 'player' && bid > 6 ? Math.min(1, 6 / bid) : 1;
    /** Мобильная полоса без «Заказ:» (Север/Запад) — ширина слота; сжатие 5/bid не нужно, масштаб даёт wMax ниже */
    let opponentScaleDown =
      variant === 'opponent' && !eastMobileTricks && bid > 5 && !opponentMobileHideOrderLabel
        ? Math.min(1, 5 / bid)
        : 1;
    /** Мобильная/компакт: один ряд кружков, без роста панели — ужимаем по ширине и высоте. */
    if (compactMode && bid != null && bid > 0) {
      const gap = 4;
      const base = 14;
      const plusW = extra > 0 && !hideCards ? 14 : 0;
      const n = orderedSlots;
      const maxContentH = 17;
      const hS = maxContentH / base;
      if (variant === 'opponent' && eastMobileTricks) {
        /** Восток: до 3 кружков в ряду, до 3 рядов (макс. 9 взяток). */
        const perRow = 3;
        const rows = Math.ceil(n / perRow);
        const naturalW = perRow * base + (perRow - 1) * gap;
        const naturalH = rows * base + Math.max(0, rows - 1) * gap;
        const eastCapRows = 3;
        const eastCapH = eastCapRows * base + (eastCapRows - 1) * gap;
        const wMax = 52;
        const eastExtraW = extra > 0 && !hideCards ? gap + plusW : 0;
        const wS = wMax / Math.max(naturalW + eastExtraW, 1);
        const hRowS = eastCapH / Math.max(naturalH, 1);
        const s = Math.max(0.22, Math.min(1, wS, hRowS, hS));
        opponentScaleDown = Math.min(opponentScaleDown, s);
      } else {
        const naturalW = n * base + Math.max(0, n - 1) * gap + plusW;
        let wMax: number;
        /** Телефон + панель игрока: жёстче лимит по высоте ряда кружков (base=14), иначе при широком заказе s=1 и кружки выпирают по вертикали */
        const hSLocal =
          variant === 'player' && playerMobileWideTricks ? 12 / base : hS;
        if (variant === 'opponent' && hideOppOrderWord) {
          /**
           * Ширина под ряд кружков ≈ половина viewport минус зазор между Север/Запад и паддинги.
           * Раньше 0.44×vw завышал бюджет → opponentScaleDown оставался 1 при узком слоте и кружки не сжимались.
           */
          wMax =
            typeof window !== 'undefined'
              ? Math.max(88, Math.min(196, Math.floor((window.innerWidth - 16) * 0.5 - 32)))
              : 132;
        } else if (variant === 'player') {
          wMax = playerMobileWideTricks ? 168 : 140;
        } else {
          wMax = 400;
        }
        const wS = wMax / Math.max(naturalW, 1);
        const s = Math.max(0.22, Math.min(1, wS, hSLocal));
        if (variant === 'opponent') {
          opponentScaleDown = Math.min(opponentScaleDown, s);
        }
        if (variant === 'player') {
          scaleDown = Math.min(scaleDown, s);
        }
      }
    }
    const playerScale = variant === 'player' ? (1.3 * 1.1 * 1.1 * 1.15 / 1.7) : 1;
    const mobileExactOrder = bidNum != null && bidNum > 0 && !hideCards && tricksTaken === bidNum;
    const mobileOverOrder = bidNum != null && !hideCards && tricksTaken > bidNum;
    const mobileUnderStrict =
      bidNum != null &&
      bidNum > 0 &&
      !hideCards &&
      tricksTaken < bidNum &&
      (tricksLeftInDeal === undefined || tricksTaken + tricksLeftInDeal < bidNum);
    const mobileWrapTone: React.CSSProperties = hideCards
      ? trickCirclesWrapPendingStyle
      : mobileOverOrder
        ? trickCirclesWrapMobileOverBidStyle
        : mobileUnderStrict
          ? trickCirclesWrapMobileUnderStrictStyle
          : trickCirclesWrapPendingStyle;
    const wrapStyle = {
      ...trickCirclesWrapStyle,
      ...mobileWrapTone,
      ...(variant === 'player' && playerMobileWideTricks ? { gap: 2 } : {}),
      ...(variant === 'player' ? {
        position: 'absolute' as const,
        right: 14,
        top: '50%',
        padding: scaleDown < 1 ? `${Math.round(2 * scaleDown * playerScale)}px ${Math.round(6 * scaleDown * playerScale)}px` : `${Math.round(2 * playerScale)}px ${Math.round(6 * playerScale)}px`,
        transform: `translateY(-50%) scale(${playerScale * (scaleDown < 1 ? scaleDown : 1)})`,
        transformOrigin: 'right center',
      } : {}),
      ...(variant === 'opponent' && opponentScaleDown < 1 ? {
        padding: `${Math.max(1, Math.round(4 * opponentScaleDown))}px ${Math.max(2, Math.round(8 * opponentScaleDown))}px`,
      } : {}),
    };
    const baseCircle = variant === 'player' ? Math.round(18 * playerScale) : undefined;
    let playerCircleSize = variant === 'player' ? (scaleDown < 1 ? Math.max(6, Math.round((baseCircle ?? 18) * scaleDown)) : baseCircle ?? 11) : undefined;
    if (variant === 'player' && playerMobileWideTricks && playerCircleSize != null) {
      playerCircleSize = Math.max(6, Math.round(playerCircleSize * 0.94));
    }
    const opponentCircleSize = variant === 'opponent' && opponentScaleDown < 1 ? Math.max(8, Math.round(14 * opponentScaleDown)) : undefined;
    const circleSize = variant === 'player' ? playerCircleSize : opponentCircleSize;
    const rowStyle = scaleDown < 1
      ? { ...trickCirclesRowStyle, gap: Math.max(2, Math.round(4 * scaleDown)) }
      : opponentScaleDown < 1
        ? { ...trickCirclesRowStyle, gap: Math.max(1, Math.round(4 * opponentScaleDown)) }
        : variant === 'player' && playerMobileWideTricks
          ? { ...trickCirclesRowStyle, gap: 3 }
          : trickCirclesRowStyle;
    const eastGap =
      variant === 'opponent' && eastMobileTricks
        ? opponentScaleDown < 1
          ? Math.max(1, Math.round(4 * opponentScaleDown))
          : 4
        : 4;
    const oppCircPx = variant === 'opponent' ? (circleSize ?? 14) : 14;
    const eastPerRow = 3;
    const eastMaxRows = 3;
    const eastGridMaxW =
      variant === 'opponent' && eastMobileTricks
        ? eastPerRow * oppCircPx + (eastPerRow - 1) * eastGap
        : undefined;
    const eastGridMaxH =
      variant === 'opponent' && eastMobileTricks
        ? eastMaxRows * oppCircPx + (eastMaxRows - 1) * eastGap
        : undefined;
    const eastRowStyle: React.CSSProperties =
      variant === 'opponent' && eastMobileTricks
        ? {
            ...trickCirclesRowStyle,
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignContent: 'center',
            alignItems: 'center',
            gap: eastGap,
            maxWidth: eastGridMaxW,
            maxHeight: eastGridMaxH,
            width: 'max-content',
          }
        : rowStyle;
    /**
     * Компактный неон: при любых взятках на руке (карты в слотах), пока не жёсткий недобор.
     * Раньше было только tricks >= bid — из‑за этого неон был почти только при переборе.
     */
    const tricksOnHandHeavyNeon =
      bidNum !== null && !hideCards && tricksTaken > 0 && !mobileUnderStrict;
    const orderCompleteMobile = bidNum !== null && !hideCards && tricksTaken === bidNum;
    const orderOverMobile = bidNum !== null && !hideCards && tricksTaken > bidNum;
    const mobileNwHighBidEar =
      variant === 'opponent' && hideOppOrderWord && !eastMobileTricks && bidNum != null && bidNum > 6;
    const wrapCls = [
      hideCards ? 'trick-slots-collecting' : 'trick-slots-normal',
      eastMobileTricks ? 'trick-slots-east-mobile' : '',
      orderCompleteMobile ? 'trick-slots-order-complete' : '',
      orderOverMobile ? 'trick-slots-order-over' : '',
      mobileUnderStrict ? 'trick-slots-mobile-under-strict' : '',
      playerMobileWideTricks && variant === 'player' ? 'trick-slots-player-mobile-wide' : '',
      mobileNwHighBidEar ? 'trick-slots-mobile-nw-high-bid-ear' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const circlesBlock = (
      <>
        {Array.from({ length: orderedSlots }, (_, i) => {
          const filled = i < Math.min(totalFilled, bid) && !hideCards;
          const circleStyle = variant === 'player'
            ? { ...trickCircleBaseStyle, width: circleSize ?? 18, height: circleSize ?? 18 }
            : { ...trickCircleBaseStyle, width: circleSize ?? 14, height: circleSize ?? 14 };
          return (
            <div
              key={`c-${i}`}
              className={filled && orderOverMobile ? 'trick-circle-filled-order-over' : undefined}
              style={{
                ...circleStyle,
                ...(filled ? trickCircleFilledStyle : trickCircleEmptyStyle),
              }}
              aria-hidden
            />
          );
        })}
      </>
    );
    const extraPlus =
      extra > 0 && !hideCards ? (
        <span
          style={{
            ...trickCirclesPlusStyle,
            ...(scaleDown < 1 ? { fontSize: Math.max(7, Math.round(10 * scaleDown)) } : {}),
            ...(opponentScaleDown < 1 ? { fontSize: Math.max(7, Math.round(10 * opponentScaleDown)) } : {}),
          }}
        >
          +{extra}
        </span>
      ) : null;
    const compactFigFont = variant === 'player' ? 10 : 9;
    const figuresCompact = (
      <PcTrickBidTakenFigures
        bid={bid}
        tricksTaken={tricksTaken}
        audience={variant}
        fontSize={compactFigFont}
        tricksLeftInDeal={tricksLeftInDeal}
        exactMatchHeavyNeon={tricksOnHandHeavyNeon}
        mobileNwEarFigures={!!mobileNwHighBidEar}
        style={
          mobileNwHighBidEar
            ? { lineHeight: 1.05, marginBottom: 0 }
            : { lineHeight: 1, marginBottom: 2 }
        }
      />
    );
    const compactInner = mobileNwHighBidEar ? (
      <div className="trick-slots-mobile-nw-ear-inner">
        <span className="trick-slots-mobile-nw-figures-ear">{figuresCompact}</span>
        <div className="trick-slots-mobile-nw-circles-only" style={rowStyle}>
          {circlesBlock}
          {extraPlus}
        </div>
      </div>
    ) : (
      <>
        {figuresCompact}
        {variant === 'opponent' && eastMobileTricks ? (
          <div
            className="trick-slots-east-mobile-tricks-row"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: eastGap, justifyContent: 'center' }}
          >
            <div className="trick-slots-east-mobile-grid" style={eastRowStyle}>
              {circlesBlock}
            </div>
            {extraPlus}
          </div>
        ) : (
          <div style={rowStyle}>
            {circlesBlock}
            {extraPlus}
          </div>
        )}
      </>
    );
    if (variant === 'opponent') {
      return (
        <OpponentBidCompactWrap
          wrapStyle={wrapStyle}
          wrapCls={wrapCls}
          bid={bid}
          tricksTaken={tricksTaken}
          tapHintEnabled={hideOppOrderWord}
          ariaLabel={hideOppOrderWord ? `Заказ ${tricksPhrase(bid)}, взято ${tricksPhrase(tricksTaken)}` : undefined}
          orderHintSlot={opponentOrderHintSlot}
        >
          {compactInner}
        </OpponentBidCompactWrap>
      );
    }
    return (
      <div style={wrapStyle} className={wrapCls} role="status">
        {compactInner}
      </div>
    );
  }

  /** ПК (не compact): оппоненты — при заказе >5; игрок — по числу видимых слотов (заказ + перебор), чтобы панель не разрасталась */
  const pcSlotScaleDown =
    !compactMode && bid != null && variant === 'opponent' && bid > 5
      ? Math.min(1, 5 / bid)
      : !compactMode && bid != null && variant === 'player' && bid + extra > 5
        ? Math.min(1, 5 / (bid + extra))
        : 1;
  const effectiveSlotSize =
    pcSlotScaleDown < 1
      ? variant === 'opponent'
        ? { w: Math.max(22, Math.round(44 * pcSlotScaleDown)), h: Math.max(36, Math.round(62 * pcSlotScaleDown)) }
        : { w: Math.max(28, Math.round(52 * pcSlotScaleDown)), h: Math.max(42, Math.round(76 * pcSlotScaleDown)) }
      : slotSize;
  const rowStyle = {
    ...trickSlotsRowStyle,
    ...(horizontalOnly ? { flexWrap: 'nowrap' as const } : {}),
    ...(pcSlotScaleDown < 1 ? { gap: Math.max(2, Math.round(6 * pcSlotScaleDown)) } : {}),
  };
  /** ПК: точно в заказ — сирень; перебор — болотно-жёлтый; красный недобор — только если заказ уже невыполним. */
  const pcTrickPanelExactOrder = tricksTaken === bid;
  const pcTrickPanelOverOrder = tricksTaken > bid;
  const pcTrickPanelUnderOrderStrict =
    tricksTaken < bid &&
    (tricksLeftInDeal === undefined || tricksTaken + tricksLeftInDeal < bid);
  const wrapStyle = {
    ...trickSlotsWrapStyle,
    ...(pcTrickPanelExactOrder
      ? trickSlotsWrapPcExactOrderStyle
      : pcTrickPanelOverOrder
        ? trickSlotsWrapPcOverBidStyle
        : pcTrickPanelUnderOrderStrict
          ? trickSlotsWrapPcUnderBidStyle
          : {}),
    ...(pcSlotScaleDown < 1 ? { padding: `${Math.max(2, Math.round(4 * pcSlotScaleDown))}px ${Math.max(4, Math.round(8 * pcSlotScaleDown))}px` } : {}),
  };

  /** Только ПК-оппоненты: узкая «стопка» слотов (полоска слежу снизу видна) + числа заказ/взято поверх. */
  const opponentPcStacked = variant === 'opponent';
  const stripVisiblePx = Math.round(Math.max(9, Math.min(14, effectiveSlotSize.w * 0.28)));
  const stackStepPc = Math.max(5, effectiveSlotSize.w - stripVisiblePx);
  const totalStackSlots = orderedSlots + extra;
  const stackWidthPc =
    totalStackSlots <= 0 ? Math.max(effectiveSlotSize.w, 36) : (totalStackSlots - 1) * stackStepPc + effectiveSlotSize.w;
  const overlayFontPc = Math.max(9, Math.round(11 * pcSlotScaleDown));

  if (opponentPcStacked) {
    /** Зазор между цифрами «заказ/взято» и стопкой слотов (тень у текста тянется вниз). */
    const stackAreaTop = overlayFontPc + Math.max(14, Math.round(overlayFontPc * 0.75));
    return (
      <div
        style={wrapStyle}
        className={[
          hideCards ? 'trick-slots-collecting' : 'trick-slots-normal',
          'trick-slots-opponent-pc-stack',
          pcTrickPanelExactOrder ? 'trick-slots-pc-exact' : '',
          pcTrickPanelOverOrder ? 'trick-slots-pc-over' : '',
          pcTrickPanelUnderOrderStrict ? 'trick-slots-pc-under' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="status"
        aria-label={`Взято ${tricksPhrase(tricksTaken)}, заказ ${tricksPhrase(bid)}`}
      >
        <div
          style={{
            position: 'relative',
            width: stackWidthPc,
            minHeight: stackAreaTop + effectiveSlotSize.h,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              transform: 'translateX(-50%)',
              zIndex: 80,
            }}
          >
            <PcTrickBidTakenFigures
              bid={bid}
              tricksTaken={tricksTaken}
              audience="opponent"
              fontSize={overlayFontPc}
              style={{ lineHeight: 1 }}
              tricksLeftInDeal={tricksLeftInDeal}
            />
          </span>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: stackAreaTop,
              width: stackWidthPc,
              height: effectiveSlotSize.h,
            }}
          >
            {Array.from({ length: orderedSlots }, (_, i) => {
              const filled = i < totalFilled;
              const useCardBack = filled && !hideCards;
              return (
                <div
                  key={`o-${i}`}
                  style={{
                    ...trickSlotBaseStyle,
                    position: 'absolute',
                    left: i * stackStepPc,
                    top: 0,
                    zIndex: i + 1,
                    width: effectiveSlotSize.w,
                    height: effectiveSlotSize.h,
                    ...(useCardBack
                      ? { ...cardBackStyle, width: effectiveSlotSize.w, height: effectiveSlotSize.h }
                      : (filled && !hideCards)
                        ? trickSlotFilledStyle
                        : trickSlotEmptyStyle),
                  }}
                />
              );
            })}
            {extra > 0 &&
              Array.from({ length: extra }, (_, j) => {
                const i = orderedSlots + j;
                return (
                  <div
                    key={`e-${j}`}
                    style={{
                      ...trickSlotBaseStyle,
                      position: 'absolute',
                      left: i * stackStepPc,
                      top: 0,
                      zIndex: i + 1,
                      width: effectiveSlotSize.w,
                      height: effectiveSlotSize.h,
                      ...(hideCards ? trickSlotEmptyStyle : trickSlotExtraStyle),
                    }}
                  />
                );
              })}
          </div>
        </div>
      </div>
    );
  }

  const playerPcFiguresFont = Math.max(10, Math.round(11 * pcSlotScaleDown));
  return (
    <div
      style={wrapStyle}
      className={[
        hideCards ? 'trick-slots-collecting' : 'trick-slots-normal',
        pcTrickPanelExactOrder ? 'trick-slots-pc-exact' : '',
        pcTrickPanelOverOrder ? 'trick-slots-pc-over' : '',
        pcTrickPanelUnderOrderStrict ? 'trick-slots-pc-under' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="status"
      aria-label={`Взято ${tricksPhrase(tricksTaken)}, заказ ${tricksPhrase(bid)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'nowrap' }}>
        <PcTrickBidTakenFigures
          bid={bid}
          tricksTaken={tricksTaken}
          audience="player"
          fontSize={playerPcFiguresFont}
          tricksLeftInDeal={tricksLeftInDeal}
        />
        <div style={rowStyle}>
          {Array.from({ length: orderedSlots }, (_, i) => {
            const filled = i < totalFilled;
            const useCardBack = filled && !hideCards;
            return (
              <div
                key={`o-${i}`}
                style={{
                  ...trickSlotBaseStyle,
                  width: effectiveSlotSize.w,
                  height: effectiveSlotSize.h,
                  ...(useCardBack ? { ...cardBackStyle, width: effectiveSlotSize.w, height: effectiveSlotSize.h } : (filled && !hideCards) ? trickSlotFilledStyle : trickSlotEmptyStyle),
                }}
              />
            );
          })}
          {extra > 0 && (
            <>
              <span style={{ ...trickSlotsPlusStyle, ...(pcSlotScaleDown < 1 ? { fontSize: Math.max(9, Math.round(11 * pcSlotScaleDown)) } : {}) }}>+</span>
              {Array.from({ length: extra }, (_, i) => (
                <div
                  key={`e-${i}`}
                  style={{
                    ...trickSlotBaseStyle,
                    width: effectiveSlotSize.w,
                    height: effectiveSlotSize.h,
                    ...(hideCards ? trickSlotEmptyStyle : trickSlotExtraStyle),
                  }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Мобильные С/З/В: цвет «Очки» — только через класс + CSS !important; из инлайна убираем color / -webkit-text-fill-color. */
function opponentStatStyleWithoutTextColor(style: React.CSSProperties): React.CSSProperties {
  const { color: _c, WebkitTextFillColor: _w, ...rest } = style as React.CSSProperties & { WebkitTextFillColor?: string };
  return rest;
}

/** Бейдж «Ровно» на ПК: только активная игра (розыгрыш / взятка) и все четыре заказа выставлены */
function shouldShowPcOrderOnHandExactBadge(state: GameState): boolean {
  if (state.phase !== 'playing' && state.phase !== 'trick-complete') return false;
  return state.bids.length === 4 && state.bids.every((b) => b != null);
}

function OpponentSlot({
  state,
  index,
  position,
  inline,
  compactMode,
  collectingCards,
  winnerPanelBlink,
  trickWinnerHighlight,
  currentTrickLeaderHighlight,
  firstBidderBadge,
  firstMoverBiddingHighlight,
  isMobile,
  hideDealerBadge,
  avatarDataUrl,
  replacedByAi,
  onAvatarClick,
  onDealerBadgeClick,
  offlineAiNameStyleByDifficulty,
}: {
  state: GameState;
  index: number;
  position: 'top' | 'left' | 'right';
  inline?: boolean;
  compactMode?: boolean;
  collectingCards?: boolean;
  winnerPanelBlink?: boolean;
  /** Подсветка: этому игроку достаётся текущая взятка (карты ещё на столе). */
  trickWinnerHighlight?: boolean;
  currentTrickLeaderHighlight?: boolean;
  firstBidderBadge?: boolean;
  firstMoverBiddingHighlight?: boolean;
  /** Только мобильная версия: при ходе ИИ не показывать бейдж «Ходит», выделять имя зелёной неоновой рамкой */
  isMobile?: boolean;
  /** Скрыть бейдж «Сдающий» (в режиме ожидания) */
  hideDealerBadge?: boolean;
  /** Фото игрока (Data URL), только для человеческого игрока */
  avatarDataUrl?: string | null;
  /** Слот заменён на ИИ (игрок вышел/пауза) — показываем имя ушедшего и метку «ИИ» */
  replacedByAi?: boolean;
  /** По клику на аватар открыть панель с информацией об игроке */
  onAvatarClick?: (playerIndex: number) => void;
  /** По тапу на компактный бейдж «Сдающий» показать подсказку (мобильная) */
  onDealerBadgeClick?: () => void;
  /** Офлайн: раскрасить имя бота по уровню ИИ; карточка и смена уровня — по тапу на аватар (PlayerInfoPanel) */
  offlineAiNameStyleByDifficulty?: boolean;
}) {
  /** Мобильные С/З/В: бейдж «Очки» по умолчанию только цифра; тап разворачивает подпись */
  const [mobileOpponentScoreExpanded, setMobileOpponentScoreExpanded] = useState(false);
  useEffect(() => {
    if (!mobileOpponentScoreExpanded) return;
    const id = window.setTimeout(() => setMobileOpponentScoreExpanded(false), 5000);
    return () => window.clearTimeout(id);
  }, [mobileOpponentScoreExpanded]);
  /** Уникальный id градиента SVG звёздочки «ровно в заказ» (несколько слотов на экране). */
  const exactOrderStarGradientId = useId().replace(/:/g, '');
  const p = state.players[index];
  const scoreLeaderHighlight = isPartyScoreLeader(state, index);
  const isActive = state.currentPlayerIndex === index;
  const isDealer = state.dealerIndex === index;
  const bid = state.bids[index];
  /** QA/вёрстка: ?debugOpponentBid=9 — все соперники; ?debugOpponentBid1=9&debugOpponentBid2=9 — Север и Запад (индексы 1 и 2) */
  const debugBid = (() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const perIndex = params.get(`debugOpponentBid${index}`);
    if (perIndex != null) {
      const n = parseInt(perIndex, 10);
      if (Number.isFinite(n) && n >= 0 && n <= 9) return n;
    }
    const v = params.get('debugOpponentBid');
    if (v == null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= 9 ? n : null;
  })();
  const displayBid = debugBid !== null ? debugBid : bid;
  const showPcOrderOnHandExactBadge = shouldShowPcOrderOnHandExactBadge(state);
  /** Кольцо «заказ на руке» ровно: лавандово-сиреневый градиент, без пульса */
  const avatarOrderRingExact =
    displayBid != null && !collectingCards && p.tricksTaken === displayBid;
  /** Кольцо «ещё нужно добрать взятки»: розыгрыш (и короткая фаза после взятки), взято < заказ */
  const avatarOrderRingChasing =
    (state.phase === 'playing' || state.phase === 'trick-complete') &&
    displayBid != null &&
    !collectingCards &&
    p.tricksTaken < displayBid;
  const avatarOrderRingMode: 'exact' | 'chasing' | null = avatarOrderRingExact
    ? 'exact'
    : avatarOrderRingChasing
      ? 'chasing'
      : null;
  const mobileActiveName = isMobile && isActive;
  /** Мобильный верхний ряд: Запад/Север — особая вёрстка (аватар крупнее, заказ по центру по вертикали). */
  const mobileNwLayout = Boolean(isMobile && inline && (position === 'left' || position === 'top'));
  const avatarSizePx = compactMode
    ? position === 'right'
      ? 32
      : mobileNwLayout
        ? 40
        : 32
    : 38;
  const eastMobileOnlyAvatar = position === 'right' && isMobile;
  /** ПК, слот «Север» над столом: аватар и имя слева, взятки и очки справа (мобильная не трогается). */
  const pcNorthSideBySide = position === 'top' && inline && !compactMode && !isMobile;
  /** ПК Запад/Восток: панель растёт по ширине стопки взяток при переборе. */
  const sideSlotPcGrow = inline && !compactMode && (position === 'left' || position === 'right');
  /** ПК Запад/Восток: «Ходит» вынесен над панелью, не в потоке — не раздувает ширину. */
  const turnBadgeOutsidePc = sideSlotPcGrow && isActive && !isMobile;
  /** ПК, широкий Север: «Ровно» слева от панели — галочка слева, буквы столбиком справа (не таб сверху). */
  const useNorthPcVerticalOrderExactBadge = pcNorthSideBySide && position === 'top';
  /** Слияние бейджа с левой гранью панели Севера (скругления + стык бордюра) */
  const northPcFusedOrderBadge =
    position === 'top' &&
    useNorthPcVerticalOrderExactBadge &&
    avatarOrderRingExact &&
    !isMobile &&
    showPcOrderOnHandExactBadge;

  const posStyle = inline
    ? { position: 'relative' as const, top: 'auto', left: 'auto', right: 'auto', transform: 'none' }
    : position === 'top'
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' as const }
    : position === 'left'
    ? { left: 20, top: '50%', transform: 'translateY(-50%)' as const }
    : { right: 20, top: '50%', transform: 'translateY(-50%)' as const };

  const frameStyle = mobileActiveName ? undefined : (isActive ? activeTurnPanelFrameStyle : isDealer ? dealerPanelFrameStyle : undefined);
  const northSlotOverrides =
    position === 'top' && inline && !isMobile
      ? {
          width: 'fit-content' as const,
          minWidth: (pcNorthSideBySide ? 'min(360px, 94vw)' : 'var(--game-table-opponent-slot-width, 180px)') as React.CSSProperties['minWidth'],
          maxWidth: 'none' as const,
        }
      : {};
  /** Моб. сетка: Запад/Север — равные колонки; слот на 100% ячейки, без инлайна 180px/fit-content. */
  const mobileGridOpponentSlotStretch: React.CSSProperties | undefined =
    isMobile && inline ? { width: '100%', minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' } : undefined;
  return (
    <div
      className={[
        'opponent-slot',
        position === 'right' ? 'opponent-slot-east' : '',
        firstMoverBiddingHighlight ? 'first-mover-bidding-panel' : '',
        isActive ? 'opponent-slot-current-turn' : '',
        northPcFusedOrderBadge ? 'opponent-slot--north-pc-fused-order-badge' : '',
      ]
        .filter(Boolean)
        .join(' ') || undefined}
      style={{
        ...opponentSlotStyle,
        ...(sideSlotPcGrow ? opponentSlotSidePcGrowStyle : {}),
        ...northSlotOverrides,
        ...mobileGridOpponentSlotStretch,
        ...posStyle,
        ...frameStyle,
        overflow: 'visible',
        ...(winnerPanelBlink ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
        ...(trickWinnerHighlight ? trickWinnerGlowStyle : {}),
        ...(currentTrickLeaderHighlight ? currentTrickLeaderGlowStyle : {}),
        ...(firstMoverBiddingHighlight ? { boxShadow: [(frameStyle?.boxShadow ?? opponentSlotStyle.boxShadow), firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') } : {}),
      }}
    >
      {isDealer && !hideDealerBadge && (
        isMobile && state.phase === 'playing' && onDealerBadgeClick ? (
          <button type="button" className={['opponent-badge', 'dealer-badge', 'dealer-badge-compact-mobile'].join(' ')} style={{ ...dealerLampExternalStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={onDealerBadgeClick} title="Сдающий" aria-label="Сдающий">
            <span style={dealerLampBulbStyle} />
            <span className="dealer-badge-text" aria-hidden>Сдающий</span>
          </button>
        ) : (
          <span className={['opponent-badge', 'dealer-badge', isMobile && state.phase === 'playing' ? 'dealer-badge-compact-mobile' : ''].filter(Boolean).join(' ')} style={dealerLampExternalStyle} title="Сдающий">
            <span style={dealerLampBulbStyle} />
            <span className="dealer-badge-text">Сдающий</span>
          </span>
        )
      )}
      {firstBidderBadge && (
        <span className={`opponent-badge first-bidder-badge${position === 'top' || position === 'left' ? ' first-bidder-badge-two-lines' : ''}`} style={firstBidderLampExternalStyle} title="Первый заказ/ход">
          {(position === 'top' || position === 'left') ? (
            <>
              <span className="first-bidder-line1">
                <span style={firstBidderLampBulbStyle} /> Первый:
              </span>
              <span className="first-bidder-line2">заказ/ход</span>
            </>
          ) : (
            <>
              <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
            </>
          )}
        </span>
      )}
      {avatarOrderRingExact && !isMobile && showPcOrderOnHandExactBadge ? (
        useNorthPcVerticalOrderExactBadge ? (
          <span
            className="opponent-badge order-on-hand-badge-pc order-on-hand-badge-pc-north-vertical order-on-hand-badge-pc-north-vertical--fused"
            style={orderOnHandNorthVerticalWrapStyle}
            title="Заказ на руке — взяток ровно по заказу"
            role="status"
            aria-label="Заказ на руке"
          >
            <span className="order-on-hand-badge-pc-north-vertical-inner" style={orderOnHandNorthVerticalInnerStyle}>
              <span className="order-on-hand-badge-pc-north-vertical-check" style={orderOnHandCheckBulbStyle} aria-hidden>
                ✓
              </span>
              <span className="order-on-hand-badge-pc-north-vertical-letters" aria-hidden>
                {'Ровно'.split('').map((ch, i) => (
                  <span key={i} className="order-on-hand-badge-pc-text order-on-hand-badge-pc-north-vertical-char">
                    {ch}
                  </span>
                ))}
              </span>
            </span>
          </span>
        ) : (
          <span
            className={[
              'opponent-badge',
              'order-on-hand-badge-pc',
              position === 'left' || position === 'right' ? 'order-on-hand-badge-pc--bottom' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              position === 'left' || position === 'right'
                ? {
                    ...orderOnHandLampExternalBottomStyle,
                    transform: `translate(-50%, 100%) scale(${ORDER_ON_HAND_OPPONENT_SCALE})`,
                    transformOrigin: 'top center',
                  }
                : {
                    ...orderOnHandLampExternalStyle,
                    left:
                      7 +
                      (!isMobile && isDealer && !hideDealerBadge ? 1 : 0) *
                        Math.round(ORDER_ON_HAND_TOP_BADGE_STEP_PX * ORDER_ON_HAND_OPPONENT_SCALE) +
                      (!isMobile && firstBidderBadge ? 1 : 0) *
                        Math.round(ORDER_ON_HAND_TOP_BADGE_STEP_PX * ORDER_ON_HAND_OPPONENT_SCALE),
                    transform: `translateY(-100%) scale(${ORDER_ON_HAND_OPPONENT_SCALE})`,
                    transformOrigin: 'top left',
                  }
            }
            title="Заказ на руке — взяток ровно по заказу"
            role="status"
            aria-label="Заказ на руке"
          >
            <span style={orderOnHandCheckBulbStyle} aria-hidden>
              ✓
            </span>
            <span className="order-on-hand-badge-pc-text">Ровно</span>
          </span>
        )
      ) : null}
      {turnBadgeOutsidePc ? (
        <span
          className="opponent-turn-badge-outside-pc"
          style={{
            ...opponentTurnBadgeStyle,
            position: 'absolute',
            right: 8,
            left: 'auto',
            bottom: '100%',
            transform: 'translateY(-10px)',
            zIndex: 6,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
          role="status"
          aria-label="Сейчас ходит этот игрок"
        >
          Ходит
        </span>
      ) : null}
      {(() => {
        const avatarBtnStyle: React.CSSProperties = {
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'inline-flex',
          lineHeight: 0,
          position: 'relative',
          zIndex: 2,
          minWidth: 44,
          minHeight: 44,
          alignItems: 'center',
          justifyContent: 'center',
        };
        const isAiSlotBot = p.id === 'ai1' || p.id === 'ai2' || p.id === 'ai3';
        const nameInner = (
          <>
            {p.name}
            {replacedByAi && (
              <span style={{ marginLeft: 4, fontSize: '0.85em', color: '#94a3b8', fontWeight: 500 }} title="Игрок вышел, за него играет ИИ">
                (ИИ)
              </span>
            )}
          </>
        );
        const styleOfflineAiNameByDifficulty = !!offlineAiNameStyleByDifficulty && isAiSlotBot;
        const offlineAiDifficultyForName = styleOfflineAiNameByDifficulty ? (p.aiDifficulty ?? 'amateur') : null;
        const nameStyleMerged: React.CSSProperties = {
          ...opponentNameStyle,
          ...(mobileActiveName && !styleOfflineAiNameByDifficulty ? nameActiveMobileStyle : {}),
          minWidth: 0,
          ...(pcNorthSideBySide ? { maxWidth: 200 } : {}),
          ...(eastMobileOnlyAvatar
            ? { overflow: 'visible', whiteSpace: 'normal' as const, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const }
            : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
        };
        const nameSpan = styleOfflineAiNameByDifficulty && offlineAiDifficultyForName ? (
          <span
            className={[
              'opponent-slot-header-display-name',
              'opponent-name-offline-ai-pick',
              `opponent-name-offline-ai-pick--${offlineAiDifficultyForName}`,
              eastMobileOnlyAvatar ? 'opponent-name-east-mobile' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={nameStyleMerged}
            title={`${p.name} — ${getCompassLabel(index)}. Нажмите на аватар: информация и уровень ИИ`}
          >
            {nameInner}
          </span>
        ) : (
          <span
            className={[eastMobileOnlyAvatar ? 'opponent-name-east-mobile' : '', 'opponent-slot-header-display-name'].filter(Boolean).join(' ') || undefined}
            style={nameStyleMerged}
            title={`${p.name} — ${getCompassLabel(index)}`}
          >
            {nameInner}
          </span>
        );
        const mobileOpponentInline = !!(isMobile && inline && !pcNorthSideBySide);
        const showMobileExactOrderStar = mobileOpponentInline && avatarOrderRingExact;
        const exactStarPathD = 'M12 1.35l2.35 7.15h7.6L15.8 14.1l2.35 7.55L12 17.45l-6.15 4.2 2.35-7.55L2.05 8.5h7.6z';
        const mobileExactOrderStarEl = showMobileExactOrderStar ? (
          <div className="opponent-exact-order-star-with-flash" aria-hidden>
            <span className="opponent-exact-order-star-badge" title="Ровно в заказ" aria-hidden>
              <span className="opponent-exact-order-star-badge__enter" aria-hidden>
                <svg viewBox="0 0 24 24" width="17" height="17" focusable="false" aria-hidden>
                  <defs>
                    <linearGradient id={exactOrderStarGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f5f3ff" />
                      <stop offset="38%" stopColor="#c4b5fd" />
                      <stop offset="72%" stopColor="#8b5cf6" />
                      <stop offset="100%" stopColor="#5b21b6" />
                    </linearGradient>
                  </defs>
                  <path
                    className="opponent-exact-order-star-path"
                    fill={`url(#${exactOrderStarGradientId})`}
                    stroke="currentColor"
                    strokeWidth="0.82"
                    strokeLinejoin="round"
                    d={exactStarPathD}
                  />
                </svg>
              </span>
            </span>
          </div>
        ) : null;
        const nameBlock =
          mobileOpponentInline ? (
            <div
              className={[
                'opponent-slot-header-name-stack-mobile',
                eastMobileOnlyAvatar ? 'opponent-slot-header-name-stack-mobile--east' : '',
              ]
                .filter(Boolean)
                .join(' ') || undefined}
            >
              {nameSpan}
              {mobileExactOrderStarEl}
            </div>
          ) : (
            nameSpan
          );
        const avatarOrderRingInnerCls = avatarOrderRingMode ? 'player-avatar-order-ring-inner' : undefined;
        const avatarOrderRingStyle: React.CSSProperties | undefined = avatarOrderRingMode
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              padding:
                avatarOrderRingMode === 'exact'
                  ? isMobile
                    ? 1
                    : 2
                  : isMobile
                    ? 2
                    : 4,
              boxSizing: 'border-box',
              lineHeight: 0,
              ...(avatarOrderRingMode === 'exact' ? { background: AVATAR_ORDER_RING_GRADIENT_EXACT } : {}),
            }
          : undefined;
        const avatarOrderRingWrapCls =
          avatarOrderRingMode === 'exact'
            ? 'opponent-avatar-order-ring opponent-avatar-order-ring--exact'
            : avatarOrderRingMode === 'chasing'
              ? 'opponent-avatar-order-ring opponent-avatar-order-ring--chasing'
              : undefined;
        const playerAvatarPcAiCls = isAiSlotBot
          ? `player-avatar-ai-offline player-avatar-ai-offline--${p.aiDifficulty ?? 'amateur'}`
          : '';
        const playerAvatarMergedCls = [avatarOrderRingInnerCls, playerAvatarPcAiCls].filter(Boolean).join(' ') || undefined;
        const avatarControl = onAvatarClick ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAvatarClick(index);
            }}
            style={avatarBtnStyle}
            title={isAiSlotBot ? `${p.name} — информация и уровень ИИ` : 'Информация об игроке'}
            aria-label={isAiSlotBot ? `Карточка игрока и уровень ИИ: ${p.name}` : `Информация об игроке ${p.name}`}
          >
            <PlayerAvatar
              name={p.name}
              avatarDataUrl={avatarDataUrl}
              sizePx={avatarSizePx}
              title={`${p.name} — ${getCompassLabel(index)}`}
              className={playerAvatarMergedCls}
            />
          </button>
        ) : (
          <PlayerAvatar
            name={p.name}
            avatarDataUrl={avatarDataUrl}
            sizePx={avatarSizePx}
            title={`${p.name} — ${getCompassLabel(index)}`}
            className={playerAvatarMergedCls}
          />
        );
        const avatarEl =
          avatarOrderRingMode && avatarOrderRingStyle && avatarOrderRingWrapCls ? (
            <span className={avatarOrderRingWrapCls} style={avatarOrderRingStyle}>
              {avatarControl}
            </span>
          ) : (
            avatarControl
          );
        const headerBlock = pcNorthSideBySide ? (
          <div
            className="opponent-slot-header opponent-north-pc-header-split"
            style={{
              ...opponentHeaderStyle,
              marginBottom: 0,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div className="opponent-north-pc-avatar-col">
              {avatarEl}
              <div
                className={['opponent-score-badge opponent-score-badge-side-pc opponent-score-north-pc', scoreLeaderHighlight ? 'score-badge-leader' : ''].filter(Boolean).join(' ')}
                style={opponentStatBadgeScoreStyle}
              >
                <span style={opponentStatLabelStyle}>Очки</span>
                <span style={opponentStatValueStyle}>{p.score}</span>
              </div>
            </div>
            <div className="opponent-north-pc-name-col">
              {nameSpan}
              {isActive && !isMobile && <span style={opponentTurnBadgeStyle}>Ходит</span>}
            </div>
          </div>
        ) : (
          <div className="opponent-slot-header" style={opponentHeaderStyle}>
            {avatarEl}
            {nameBlock}
            {isActive && !isMobile && !turnBadgeOutsidePc ? <span style={opponentTurnBadgeStyle}>Ходит</span> : null}
          </div>
        );
        const opponentScoreMobileSlotClass =
          isMobile && inline
            ? position === 'top'
              ? 'opponent-score-badge--slot-north'
              : position === 'left'
                ? 'opponent-score-badge--slot-west'
                : 'opponent-score-badge--slot-east'
            : undefined;
        const opponentScoreLabelStyleResolved: React.CSSProperties =
          isMobile && inline ? opponentStatStyleWithoutTextColor(opponentStatLabelStyle) : opponentStatLabelStyle;
        const opponentScoreValueStyleResolved: React.CSSProperties =
          isMobile && inline ? opponentStatStyleWithoutTextColor(opponentStatValueStyle) : opponentStatValueStyle;
        const statsBlock = (
          <div
            className={[sideSlotPcGrow ? 'opponent-stats-west-east-pc' : undefined, mobileNwLayout ? 'opponent-slot-stats-mobile-nw' : undefined]
              .filter(Boolean)
              .join(' ') || undefined}
            style={{
              ...opponentStatsRowStyle,
              ...(position === 'top' && inline ? { flexWrap: 'nowrap' as const } : {}),
              ...(position === 'left' && inline && !sideSlotPcGrow ? { flexDirection: 'row-reverse' as const } : {}),
              ...(pcNorthSideBySide
                ? { flex: 1, minWidth: 0, justifyContent: 'flex-end', alignItems: 'center' }
                : {}),
              ...(sideSlotPcGrow
                ? {
                    flexDirection: 'column' as const,
                    alignItems: 'stretch' as const,
                    gap: 8,
                    width: '100%',
                  }
                : {}),
            }}
          >
            <TrickSlotsDisplay
              bid={displayBid}
              tricksTaken={p.tricksTaken}
              variant="opponent"
              horizontalOnly={position === 'top' && inline}
              collectingCards={collectingCards}
              compactMode={compactMode}
              eastMobileTricks={position === 'right' && !!isMobile && displayBid !== null && displayBid > 0}
              opponentMobileHideOrderLabel={!!isMobile}
              opponentMobileZeroOrderCross={!!isMobile}
              opponentOrderHintSlot={position === 'top' ? 'north' : position === 'left' ? 'west' : 'east'}
              tricksLeftInDeal={tricksRemainingInDeal(state)}
            />
            {!pcNorthSideBySide &&
              (isMobile && inline ? (
                <button
                  type="button"
                  className={
                    [
                      'opponent-score-badge',
                      'opponent-score-badge--mobile-toggle',
                      sideSlotPcGrow ? 'opponent-score-badge-side-pc' : '',
                      scoreLeaderHighlight ? 'score-badge-leader' : '',
                      opponentScoreMobileSlotClass,
                      mobileOpponentScoreExpanded
                        ? 'opponent-score-badge--score-expanded'
                        : 'opponent-score-badge--score-label-collapsed',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  style={{
                    ...opponentStatBadgeScoreStyle,
                    cursor: 'pointer',
                    font: 'inherit',
                    margin: 0,
                    boxSizing: 'border-box',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  onClick={e => {
                    e.stopPropagation();
                    setMobileOpponentScoreExpanded(v => !v);
                  }}
                  aria-expanded={mobileOpponentScoreExpanded}
                  title={mobileOpponentScoreExpanded ? 'Скрыть подпись «Очки»' : 'Показать подпись «Очки»'}
                  aria-label={
                    mobileOpponentScoreExpanded
                      ? `Очки игрока ${p.score}, скрыть подпись`
                      : `${p.score} очков, показать подпись`
                  }
                >
                  {mobileOpponentScoreExpanded ? (
                    <span style={opponentScoreLabelStyleResolved}>Очки</span>
                  ) : null}
                  <span style={opponentScoreValueStyleResolved}>{p.score}</span>
                </button>
              ) : (
                <div
                  className={
                    ['opponent-score-badge', sideSlotPcGrow ? 'opponent-score-badge-side-pc' : '', scoreLeaderHighlight ? 'score-badge-leader' : '']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  style={opponentStatBadgeScoreStyle}
                >
                  <span style={opponentStatLabelStyle}>Очки</span>
                  <span style={opponentStatValueStyle}>{p.score}</span>
                </div>
              ))}
          </div>
        );
        if (pcNorthSideBySide) {
          return (
            <div
              className="opponent-slot-north-pc-row"
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {headerBlock}
              {statsBlock}
            </div>
          );
        }
        return (
          <>
            {headerBlock}
            {statsBlock}
          </>
        );
      })()}
    </div>
  );
}

function DeckWithTrump({
  tricksInDeal,
  trumpCard,
  trumpHighlightOn,
  dealerIndex,
  compactTable,
  forceDeckTopLeft,
  pcCardStyles,
}: {
  tricksInDeal: number;
  trumpCard: Card;
  trumpHighlightOn: boolean;
  dealerIndex: number;
  compactTable?: boolean;
  forceDeckTopLeft?: boolean;
  pcCardStyles?: boolean;
}) {
  const cardsDealt = tricksInDeal * 4;
  const cardsUnderTrump = Math.max(0, 36 - cardsDealt - 1);
  const numLayers = cardsUnderTrump === 0 ? 1 : Math.min(5, 2 + Math.floor(cardsUnderTrump / 8));

  const cornerStyle: React.CSSProperties = (() => {
    const base = 20;
    if (forceDeckTopLeft) return { top: base, left: base };
    switch (dealerIndex % 4) {
      case 0: return { left: base, bottom: base };   // Юг — левый нижний
      case 1: return { top: base, right: base };     // Север — правый верхний
      case 2: return { top: base, left: base };      // Запад — левый верхний
      case 3: return { bottom: base, right: base };  // Восток — правый нижний
      default: return { left: base, bottom: base };
    }
  })();

  const deckScale = compactTable ? 1.18 / 1.2 : 1.18;
  const cardBackW = Math.round(52 * deckScale);
  const cardBackH = Math.round(76 * deckScale);
  const stackOffset = Math.round(2 * deckScale);

  return (
    <div className="deck-with-trump-wrap" style={{ ...deckStackWrapStyle, width: Math.round(64 * deckScale), height: Math.round(96 * deckScale), ...cornerStyle }}>
      {Array.from({ length: numLayers }, (_, i) => (
        <div
          key={i}
          style={{
            ...cardBackStyle,
            width: cardBackW,
            height: cardBackH,
            borderRadius: Math.round(8 * deckScale),
            position: 'absolute',
            top: i * stackOffset,
            left: i * stackOffset,
            zIndex: i,
          }}
          aria-hidden
        />
      ))}
      <div
        style={{
          ...trumpStyle,
          position: 'absolute',
          top: (numLayers - 1) * stackOffset,
          left: (numLayers - 1) * stackOffset,
          zIndex: numLayers + 1,
        }}
      >
        <span style={{ fontSize: compactTable ? 14 : 16, color: 'rgba(34, 211, 238, 0.9)', textShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }}>Козырь</span>
        <CardView card={trumpCard} disabled compact showDesktopFaceIndices={true} tableCardMobile={compactTable} scale={compactTable ? 0.98 : deckScale} contentScale={compactTable ? 1.5 : undefined} doubleBorder={trumpHighlightOn} trumpOnDeck trumpDeckHighlightOn={trumpHighlightOn} pcCardStyles={pcCardStyles} />
      </div>
    </div>
  );
}

function LastTrickModal({
  trick,
  players,
  trump,
  trumpHighlightOn,
  doubleBorder,
  showDesktopFaceIndices,
  pcCardStyles,
  onClose,
}: {
  trick: { cards: Card[]; winnerIndex: number };
  players: GameState['players'];
  trump: string | null;
  trumpHighlightOn: boolean;
  doubleBorder: boolean;
  showDesktopFaceIndices?: boolean;
  pcCardStyles?: boolean;
  onClose: () => void;
}) {
  const winnerName = players[trick.winnerIndex]?.name ?? '';
  return (
    <div
      style={modalOverlay}
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div style={modalContent} onClick={e => e.stopPropagation()} role="presentation">
        <h3>Последняя взятка</h3>
        <p style={{ color: '#94a3b8', marginBottom: 16 }}>Взял: {winnerName}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 16 }}>
          {trick.cards.map((card, i) => (
            <CardView
              key={`${card.suit}-${card.rank}-${i}`}
              card={card}
              compact
              showDesktopFaceIndices={showDesktopFaceIndices}
              doubleBorder={doubleBorder}
              isTrumpOnTable={pcCardStyles ? (trump !== null && card.suit === trump) : (trumpHighlightOn && trump !== null && card.suit === trump)}
              trumpHighlightOn={trumpHighlightOn}
              pcCardStyles={pcCardStyles}
            />
          ))}
        </div>
        <button type="button" onClick={onClose} style={buttonStyle}>Закрыть</button>
      </div>
    </div>
  );
}

function cardSort(a: Card, b: Card, _trump: string | null): number {
  const suitOrder: Record<string, number> = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
  const rankOrder: Record<string, number> = {
    '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
    'J': 5, 'Q': 6, 'K': 7, 'A': 8,
  };
  const suitDiff = (suitOrder[a.suit] ?? 4) - (suitOrder[b.suit] ?? 4);
  if (suitDiff !== 0) return suitDiff;
  return rankOrder[b.rank] - rankOrder[a.rank];
}

const tableLayoutStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  height: '100vh',
  maxHeight: '100dvh',
  overflow: 'hidden',
  background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
  color: '#f8fafc',
};

const tableStyle: React.CSSProperties = {
  flex: 1,
  width: '100%',
  minWidth: 0,
  position: 'relative',
  padding: 'var(--game-header-padding-top, 7px) var(--game-header-padding, 20px) 16px var(--game-header-padding, 20px)',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  overflow: 'auto',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  width: '100%',
  marginBottom: 16,
  flexWrap: 'wrap',
  gap: 12,
  flexShrink: 0,
  position: 'relative',
  zIndex: 20,
};

const centerAreaSpacerTopStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const centerAreaSpacerBottomStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
};

const playerSpacerStyle: React.CSSProperties = {
  height: 'var(--game-player-area-height, 260px)',
  flexShrink: 0,
};

const gameTableBlockStyle: React.CSSProperties = {
  marginTop: 'var(--game-table-block-margin-top, 0)',
  transform: 'translateY(calc(-1 * var(--game-table-up-offset, 149px)))',
  flexShrink: 0,
};

const gameInfoTopRowStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'stretch',
  width: '100%',
  height: 'var(--game-table-row-height, 130px)',
  gap: 16,
  marginBottom: 'var(--game-north-table-gap, 12px)',
  flexShrink: 0,
  position: 'relative',
};

const gameMobileUpperBoardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  position: 'relative',
};

const gameInfoTopRowSpacerStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const headerLeftWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const headerMenuButtonsWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
};

const firstMoveBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: '1px 6px 1px',
  borderRadius: 8,
  border: '1px solid rgba(167, 139, 250, 0.7)',
  background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.85) 0%, rgba(67, 56, 202, 0.8) 100%)',
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
};

const firstMoveLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  lineHeight: 1,
};

const firstMoveValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#f8fafc',
  lineHeight: 1,
};

const headerRightWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  gap: 12,
};

const headerRightTopRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

const dealNumberBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: '5px 10px',
  borderRadius: 8,
  border: '1px solid rgba(56, 189, 248, 0.5)',
  background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.8) 0%, rgba(59, 130, 246, 0.75) 100%)',
  boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
};

const dealNumberLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const dealNumberValueStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#f8fafc',
};

const gameInfoLeftColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 5,
  alignItems: 'flex-start',
  flexShrink: 0,
  marginTop: 'var(--game-info-left-margin-top, 77px)',
};

const gameInfoModePanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 14px',
  borderRadius: 10,
  border: '1px solid rgba(99, 102, 241, 0.6)',
  background: 'rgba(99, 102, 241, 0.25)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};

const gameInfoLeftSectionStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: '18px 22px',
  borderRadius: 12,
  border: '1px solid rgba(139, 92, 246, 0.5)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
  background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.9) 0%, rgba(67, 56, 202, 0.85) 50%, rgba(79, 70, 229, 0.9) 100%)',
};

const gameInfoNorthSlotWrapper: React.CSSProperties = {
  width: 'var(--game-table-north-slot-width, 420px)',
  flex: '0 0 var(--game-table-north-slot-width, 420px)',
  pointerEvents: 'none',
  visibility: 'hidden',
};

const gameInfoNorthSlotWrapperAbsolute: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  bottom: 'var(--game-north-slot-bottom, -65px)',
  transform: 'translateX(-50%)',
  display: 'flex',
  flexDirection: 'column-reverse',
  justifyContent: 'flex-start',
  alignItems: 'center',
  width: 'var(--game-table-north-slot-width, 420px)',
  overflow: 'visible',
  pointerEvents: 'auto',
  zIndex: 5,
};

const gameInfoCardsPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: '0 12px',
  height: 28,
  borderRadius: 6,
  border: '1px solid rgba(56, 189, 248, 0.5)',
  background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.85) 0%, rgba(59, 130, 246, 0.8) 100%)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
  flexShrink: 0,
};

/** Интерактивный бейдж: карт в раздаче / заказ и взятки (после всех заказов). */
const gameInfoDealContractPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  flexWrap: 'wrap',
  gap: 8,
  padding: '7px 14px',
  minHeight: 34,
  borderRadius: 9,
  border: '1px solid rgba(45, 212, 191, 0.52)',
  background: 'linear-gradient(145deg, rgba(13, 148, 136, 0.38) 0%, rgba(30, 58, 138, 0.9) 52%, rgba(30, 64, 175, 0.85) 100%)',
  boxShadow: [
    '0 0 20px rgba(34, 211, 238, 0.2)',
    '0 2px 14px rgba(0,0,0,0.26)',
    'inset 0 1px 0 rgba(255,255,255,0.09)',
  ].join(', '),
  flexShrink: 0,
  cursor: 'pointer',
  font: 'inherit',
  color: '#f1f5f9',
  textAlign: 'center',
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
};

const dealContractCardsLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: '#a5f3fc',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const dealContractCardsValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#f8fafc',
  fontVariantNumeric: 'tabular-nums',
};

const dealContractLineTextStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#ecfeff',
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '0.02em',
  lineHeight: 1.25,
};

/** Один слот высоты при чередовании «режим» / «заказ» на мобильной (бескозырка, тёмная). */
const dealContractMobileAlternateSlotStyle: React.CSSProperties = {
  minHeight: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
};

const dealContractMobileModeAlternateLineStyle: React.CSSProperties = {
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.25,
};

/** Мобильная строка «З: N; В: M/T» (M — сыграно взяток, T — всего в раздаче); размер — index.css .deal-contract-line */
const dealContractLineMobileSplitOuterStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'row',
  alignItems: 'baseline',
  gap: 3,
  fontWeight: 700,
  fontVariantNumeric: 'tabular-nums',
  lineHeight: 1.25,
};

const dealContractMobileOrderStyle: React.CSSProperties = {
  color: '#fde68a',
  textShadow: '0 0 10px rgba(251, 191, 36, 0.35)',
};

const dealContractMobileSepStyle: React.CSSProperties = {
  color: 'rgba(241, 245, 249, 0.42)',
};

const dealContractMobileTricksStyle: React.CSSProperties = {
  color: '#5eead4',
  textShadow: '0 0 10px rgba(45, 212, 191, 0.35)',
};

/** Мобильный «В: взято/всего» — число взятых зелёным, всего в раздаче цветом строки (CSS .deal-contract-mobile-tricks-*) */
function DealContractMobileTricksNumbers({ taken, dealTotal }: { taken: number; dealTotal: number }) {
  return (
    <span className="deal-contract-mobile-tricks" style={dealContractMobileTricksStyle}>
      В:{' '}
      <span className="deal-contract-mobile-tricks-taken">{taken}</span>
      <span className="deal-contract-mobile-tricks-slash" aria-hidden="true">
        /
      </span>
      <span className="deal-contract-mobile-tricks-deal">{dealTotal}</span>
    </span>
  );
}

const gameInfoBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '10px 19px',
  background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.7) 0%, rgba(30, 41, 59, 0.8) 100%)',
  borderRadius: 10,
  border: '1px solid rgba(71, 85, 105, 0.5)',
  minWidth: 120,
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};

const gameInfoActiveBadgeStyle: React.CSSProperties = {
  background: 'rgba(34, 197, 94, 0.15)',
  borderColor: 'rgba(34, 197, 94, 0.4)',
};

const gameInfoBiddingBadgeStyle: React.CSSProperties = {
  background: 'rgba(245, 158, 11, 0.12)',
  borderColor: 'rgba(245, 158, 11, 0.4)',
};

const gameInfoLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 5,
};

/** ПК, бейдж «Тёмная»: «Режим» — после spread, иначе остаётся #94a3b8 из gameInfoLabelStyle */
const gameInfoDarkModeTagLabelOverride: React.CSSProperties = {
  color: '#4bc4ec',
  WebkitTextFillColor: '#4bc4ec',
  fontWeight: 700,
};

const gameInfoValueStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: '#f8fafc',
};

const exitBtnStyle: React.CSSProperties = {
  padding: '8px 12px',
  minWidth: 40,
  background: '#334155',
  border: '1px solid #475569',
  borderRadius: 8,
  color: '#f8fafc',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const newGameBtnStyle: React.CSSProperties = {
  ...exitBtnStyle,
  padding: '8px 12px',
  minWidth: 40,
  background: '#1e3a5f',
  borderColor: '#2563eb',
  fontSize: 32,
  lineHeight: 1,
  fontWeight: 400,
};

const newGameConfirmModalStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
  borderRadius: 12,
  padding: 24,
  maxWidth: 360,
  width: '90%',
  border: '1px solid #334155',
  boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
};

const newGameConfirmTextStyle: React.CSSProperties = {
  margin: '0 0 20px',
  color: '#f8fafc',
  fontSize: 16,
  lineHeight: 1.5,
};

const newGameConfirmButtonsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
};

const newGameConfirmCancelBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid #475569',
  background: '#334155',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 14,
};

const newGameConfirmOkBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid #2563eb',
  background: '#1e3a5f',
  color: '#93c5fd',
  cursor: 'pointer',
  fontSize: 14,
};

const gameOverCelebrationWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 280,
  padding: '36px 24px 24px',
};
const gameOverCelebrationInnerStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '32px 40px',
  borderRadius: 16,
  border: '1px solid rgba(34, 211, 238, 0.4)',
  background: 'linear-gradient(180deg, rgba(30, 58, 138, 0.25) 0%, rgba(15, 23, 42, 0.95) 100%)',
  boxShadow: '0 0 40px rgba(34, 211, 238, 0.2), inset 0 0 60px rgba(255, 255, 255, 0.04)',
};
const gameOverCelebrationTitleStyle: React.CSSProperties = {
  margin: '0 0 16px',
  color: '#e2e8f0',
  fontSize: 22,
  fontWeight: 700,
};
const gameOverCelebrationWinnerStyle: React.CSSProperties = {
  margin: '0 0 24px',
  color: '#fcd34d',
  fontSize: 20,
  fontWeight: 600,
  textShadow: '0 0 12px rgba(252, 211, 77, 0.5)',
};
const gameOverCelebrationSuperStyle: React.CSSProperties = {
  margin: '0 0 24px',
  color: '#4ade80',
  fontSize: 18,
  fontWeight: 700,
  textShadow: '0 0 10px rgba(74, 222, 128, 0.5)',
};
const gameOverButtonPrimaryStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: 10,
  border: '2px solid rgba(34, 211, 238, 0.7)',
  background: 'linear-gradient(180deg, rgba(34, 211, 238, 0.2) 0%, rgba(21, 94, 117, 0.3) 100%)',
  color: '#22d3ee',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 600,
  boxShadow: '0 0 16px rgba(34, 211, 238, 0.3)',
};
const gameOverExpandedWrapStyle: React.CSSProperties = {
  padding: '44px 20px 24px 24px',
  maxWidth: 420,
  width: '100%',
  maxHeight: '90vh',
  overflowY: 'auto',
};
const gameOverExpandedTitleStyle: React.CSSProperties = {
  margin: '0 0 16px',
  color: '#e2e8f0',
  fontSize: 20,
  fontWeight: 700,
  textAlign: 'center',
};
const gameOverPartyIdStyle: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  color: '#94a3b8',
  fontWeight: 500,
  textAlign: 'center',
};
const gameOverTableWrapStyle: React.CSSProperties = {
  marginBottom: 20,
  borderRadius: 10,
  overflow: 'hidden',
  border: '1px solid rgba(34, 211, 238, 0.35)',
};
const gameOverTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: 'rgba(15, 23, 42, 0.8)',
};
const gameOverThStyle: React.CSSProperties = {
  padding: '10px 12px',
  textAlign: 'left',
  color: '#94a3b8',
  fontSize: 13,
  fontWeight: 600,
  borderBottom: '1px solid rgba(34, 211, 238, 0.3)',
};
const gameOverTdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: '#e2e8f0',
  fontSize: 14,
  borderBottom: '1px solid rgba(34, 211, 238, 0.15)',
};
const gameOverTrHumanStyle: React.CSSProperties = {
  background: 'rgba(34, 211, 238, 0.12)',
};
const gameOverStatsWrapStyle: React.CSSProperties = {
  marginBottom: 16,
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid rgba(34, 211, 238, 0.25)',
  background: 'rgba(15, 23, 42, 0.6)',
};
const gameOverStatsTitleStyle: React.CSSProperties = {
  margin: '0 0 8px',
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 600,
  textTransform: 'uppercase',
};
const gameOverStatsHintStyle: React.CSSProperties = {
  margin: '0 0 10px',
  color: '#64748b',
  fontSize: 11,
  fontStyle: 'italic',
};
const gameOverStatsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  marginBottom: 4,
  fontSize: 14,
  color: '#e2e8f0',
};
const gameOverStatsRowWithBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 8,
  fontSize: 14,
  color: '#e2e8f0',
};
const gameOverProgressTrackStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  height: 8,
  borderRadius: 4,
  background: 'rgba(30, 27, 75, 0.35)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(129, 140, 248, 0.4)',
  overflow: 'hidden',
  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 2px rgba(0, 0, 0, 0.25), 0 0 12px rgba(129, 140, 248, 0.15)',
};
const gameOverProgressFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 3,
  background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.8) 0%, rgba(139, 92, 246, 0.85) 100%)',
  boxShadow: '0 0 12px rgba(139, 92, 246, 0.5), 0 0 20px rgba(99, 102, 241, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  transition: 'width 0.4s ease-out',
};
const gameOverProgressFillBestStyle: React.CSSProperties = {
  ...gameOverProgressFillStyle,
  background: 'linear-gradient(90deg, rgba(34, 211, 238, 0.5) 0%, rgba(99, 102, 241, 0.85) 50%, rgba(139, 92, 246, 0.9) 100%)',
  boxShadow: '0 0 14px rgba(34, 211, 238, 0.5), 0 0 20px rgba(139, 92, 246, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.35)',
};
const gameOverStatsNameHumanStyle: React.CSSProperties = {
  color: '#22d3ee',
  fontWeight: 600,
};
const gameOverStatsValueStyle: React.CSSProperties = {};
const gameOverRatingWrapStyle: React.CSSProperties = {
  marginBottom: 20,
  padding: '12px 16px',
  borderRadius: 10,
  border: '1px solid rgba(192, 132, 252, 0.35)',
  background: 'rgba(30, 27, 75, 0.3)',
};
const gameOverRatingPlaceholderStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: '#a78bfa',
  fontStyle: 'italic',
};
const gameOverButtonsWrapStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'center',
  flexWrap: 'wrap',
};
const gameOverButtonSecondaryStyle: React.CSSProperties = {
  padding: '12px 24px',
  borderRadius: 10,
  border: '2px solid rgba(148, 163, 184, 0.6)',
  background: 'rgba(51, 65, 85, 0.5)',
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 16,
  fontWeight: 600,
};

const centerAreaStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  position: 'relative',
  zIndex: 10,
  marginTop: 'var(--game-table-center-margin-top, 80px)',
};

const dealResultsOverlayStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'var(--deal-results-overlay-top, 260px)',
  left: '33%',
  right: '33%',
  height: 'var(--deal-results-overlay-height, 320px)',
  zIndex: 15,
  pointerEvents: 'none',
  background: 'linear-gradient(180deg, rgba(3, 7, 18, 0.96) 0%, rgba(15, 23, 42, 0.96) 100%)',
  borderRadius: 20,
  border: '3px solid rgba(34, 211, 238, 0.5)',
  boxShadow: [
    'inset 0 0 80px rgba(0, 0, 0, 0.5)',
    '0 0 0 1px rgba(34, 211, 238, 0.3)',
    '0 0 40px rgba(34, 211, 238, 0.25)',
    '0 0 80px rgba(34, 211, 238, 0.12)',
  ].join(', '),
  animation: 'dealResultsFadeIn 0.5s ease-out',
};

const dealResultsCollapsingStyle: React.CSSProperties = {
  animation: 'dealResultsCollapse 0.75s cubic-bezier(0.33, 0, 0.2, 1) forwards',
  transformOrigin: '50% 100%',
};

const dealResultsModalStyle: React.CSSProperties = {
  ...dealResultsOverlayStyle,
  position: 'relative',
  top: 0,
  left: 0,
  right: 0,
  width: '100%',
  height: 'min(75vh, 510px)',
  minHeight: 450,
  maxHeight: '75vh',
  minWidth: 400,
  pointerEvents: 'auto',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
};


/** Мобильная версия модалки: корень на всю высоту, скролл только у таблицы */
const dealResultsModalStyleMobile: React.CSSProperties = {
  minWidth: 0,
  width: '100%',
  maxWidth: '100%',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const MODAL_GAP = 8;
const MODAL_ROW_GAP = 22;
const MODAL_GAP_MOBILE = 6;
const MODAL_ROW_GAP_MOBILE = 12;
const _dealResultsModalFlexStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  padding: `${MODAL_GAP}px 16px`,
  gap: MODAL_ROW_GAP,
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const _dealResultsModalFlexStyleMobile: React.CSSProperties = {
  padding: `${MODAL_GAP_MOBILE}px 10px`,
  gap: MODAL_ROW_GAP_MOBILE,
  overflow: 'auto',
  minHeight: 0,
};
/** Только для мобильной модалки с таблицей: внешний контейнер не скроллится, скролл только у таблицы */
const dealResultsTableOuterMobileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '4px 8px 10px 4px',
  boxSizing: 'border-box',
};

/** ПК-модалка с таблицей: ширина под таблицу без горизонтального скролла (82 + 8×52 + отступы ≈ 560) */
const dealResultsTableOuterPCStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minHeight: 0,
  overflow: 'hidden',
  padding: '8px 20px 16px',
  boxSizing: 'border-box',
  maxWidth: 720,
  width: '100%',
  marginLeft: 'auto',
  marginRight: 'auto',
};

const _dealResultsModalRow1Style: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  flexShrink: 0,
};

const _dealResultsModalRow2Style: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  flexShrink: 0,
  gap: 20,
};

const _dealResultsModalRow2StyleMobile: React.CSSProperties = {
  gap: 8,
  flexWrap: 'wrap' as const,
  justifyContent: 'center',
};

const _dealResultsModalRow3Style: React.CSSProperties = {
  flex: '0 1 auto',
  minHeight: 0,
  display: 'flex',
  justifyContent: 'center',
  overflow: 'hidden',
};

const _dealResultsModalRow3StyleMobile: React.CSSProperties = {
  flex: '0 0 auto',
  overflow: 'visible',
};

const _dealResultsChartWrapStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  height: 'auto',
  padding: '12px 14px',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.4)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 12px rgba(34, 211, 238, 0.15)',
};

const _dealResultsChartWrapStyleMobile: React.CSSProperties = {
  maxWidth: '100%',
  padding: '10px 12px',
  borderRadius: 10,
};

const _dealResultsChartTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#22d3ee',
  marginBottom: 10,
  textAlign: 'center',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const _dealResultsChartTitleStyleMobile: React.CSSProperties = {
  fontSize: 10,
  marginBottom: 6,
};

const _dealResultsChartRowStyleMobile: React.CSSProperties = {
  gap: 4,
};

const _dealResultsChartBarBgStyleMobile: React.CSSProperties = {
  height: 6,
};

/** Внешний контейнер таблицы (мобильная модалка) */
const _dealResultsTableWrapOuterStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 8px 10px 4px',
  boxSizing: 'border-box',
};
/** Цвет «З» (заказ) в подписи и заголовках столбцов */
const DEAL_RESULTS_Z_COLOR = '#a78bfa';
/** Цвет «О» (очки) в подписи и заголовках столбцов */
const DEAL_RESULTS_O_COLOR = '#2dd4bf';
/** Подпись таблицы: З/О — ярко и наглядно */
const dealResultsTableCaptionStyle: React.CSSProperties = {
  captionSide: 'top',
  fontSize: 13,
  fontWeight: 600,
  paddingBottom: 6,
  textAlign: 'center',
  color: '#cbd5e1',
  letterSpacing: '0.02em',
};
/** Буква «З» в подписи — фиолетовый акцент */
const dealResultsTableCaptionZStyle: React.CSSProperties = {
  color: DEAL_RESULTS_Z_COLOR,
  fontWeight: 800,
  textShadow: `0 0 6px ${DEAL_RESULTS_Z_COLOR}99, 0 0 2px ${DEAL_RESULTS_Z_COLOR}`,
};
/** Буква «О» в подписи — бирюзовый акцент */
const dealResultsTableCaptionOStyle: React.CSSProperties = {
  color: DEAL_RESULTS_O_COLOR,
  fontWeight: 800,
  textShadow: `0 0 6px ${DEAL_RESULTS_O_COLOR}99, 0 0 2px ${DEAL_RESULTS_O_COLOR}`,
};
/** Обёртка индикатора прокрутки: по центру внизу видимой области */
const dealResultsTableScrollHintWrapStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 0,
  right: 0,
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  pointerEvents: 'none',
  zIndex: 3,
};
/** Анимированная стрелка «прокрутите вниз» */
const dealResultsTableScrollHintChevronStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  borderRadius: '50%',
  background: 'rgba(15, 23, 42, 0.9)',
  border: '1px solid rgba(34, 211, 238, 0.5)',
  color: '#22d3ee',
  fontSize: 16,
  fontWeight: 700,
  boxShadow: '0 0 12px rgba(34, 211, 238, 0.3), inset 0 0 8px rgba(34, 211, 238, 0.1)',
};
/** Обёртка скролла: задаёт область, поверх неё — фиксированные полосы подсветки (не скроллятся) */
const dealResultsTableScrollWrapStyle: React.CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
};
/** Скролл: этот блок скроллится */
const _dealResultsTableScrollAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  overflowX: 'auto',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
  boxSizing: 'border-box',
};
/** ПК: внешний контейнер без скролла — внутри шапка (фикс) + область скролла тела */
const dealResultsTableScrollWrapPCStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxSizing: 'border-box',
};
/** ПК: скролл только по tbody+tfoot — скроллбар идёт от строк с результатами */
const dealResultsTableBodyScrollPCStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  width: '100%',
  overflowX: 'auto',
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
  touchAction: 'pan-y',
  boxSizing: 'border-box',
};
/** Полоса неоновой подсветки сверху — не скроллится, привязана к видимой области */
const dealResultsTableGlowTopStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 26,
  pointerEvents: 'none',
  zIndex: 2,
  borderRadius: '11px 11px 0 0',
  background: 'linear-gradient(to bottom, rgba(34, 211, 238, 0.52) 0%, rgba(34, 211, 238, 0.22) 45%, transparent 100%)',
  boxShadow: '0 4px 22px rgba(34, 211, 238, 0.5), 0 0 16px rgba(34, 211, 238, 0.25), inset 0 1px 0 rgba(34, 211, 238, 0.6)',
};
/** Полоса неоновой подсветки снизу — не скроллится, привязана к видимой области */
const dealResultsTableGlowBottomStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: 28,
  pointerEvents: 'none',
  zIndex: 2,
  borderRadius: '0 0 11px 11px',
  background: 'linear-gradient(to top, rgba(34, 211, 238, 0.58) 0%, rgba(34, 211, 238, 0.28) 50%, transparent 100%)',
  boxShadow: '0 -5px 24px rgba(34, 211, 238, 0.55), 0 0 20px rgba(34, 211, 238, 0.28), inset 0 -1px 0 rgba(34, 211, 238, 0.55)',
};
/** ПК: полосы в потоке (сверху и снизу), таблица между ними — не перекрывают контент */
const dealResultsTableGlowPCStripInFlowStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '100%',
  height: 26,
  minHeight: 26,
  pointerEvents: 'none',
};
/** «Окно» таблицы: рамка, глубина, неоновая внутренняя подсветка (полосы сверху/снизу — отдельные div) */
const dealResultsTableWindowStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '100%',
  position: 'relative',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.35)',
  boxShadow: [
    'inset 0 -20px 28px -8px rgba(0, 0, 0, 0.35)',
    '0 0 0 1px rgba(34, 211, 238, 0.2)',
    '0 4px 20px rgba(0, 0, 0, 0.2)',
    'inset 0 16px 24px -8px rgba(34, 211, 238, 0.18)',
    'inset 0 -20px 28px -8px rgba(34, 211, 238, 0.28)',
    'inset 0 0 40px -8px rgba(34, 211, 238, 0.12)',
  ].join(', '),
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)',
  padding: 1,
};
/** ПК: окно без верхней/нижней внутренней подсветки — только одна полоса сверху и одна снизу от glow-div'ов */
const dealResultsTableWindowStylePC: React.CSSProperties = {
  width: '100%',
  minHeight: '100%',
  position: 'relative',
  border: '1px solid rgba(148, 163, 184, 0.4)',
  boxShadow: 'inset 0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 24px rgba(100, 116, 139, 0.12), 0 4px 24px rgba(0, 0, 0, 0.2)',
  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.99) 100%)',
  padding: 1,
};
/** Узкая ширина первого столбца (мобильная) */
const DEAL_COLUMN_WIDTH = 14;
/** Ширина первого столбца на ПК — чтобы вместить «№ Раздача» */
const DEAL_COLUMN_WIDTH_PC = 82;
/** Ширина ячейки заказ/очки (мобильная) */
const PLAYER_CELL_WIDTH = 38;
/** Ширина ячейки заказ/очки на ПК — чтобы вместить «Заказ» и «Очки» */
const PLAYER_CELL_WIDTH_PC = 52;
/** Ширина «визуальной» ячейки Итог: текст может выходить в соседнюю ячейку */
const DEAL_COLUMN_FOOTER_EXTRA = 14;
const dealResultsTableStyle: React.CSSProperties = {
  width: '100%',
  tableLayout: 'fixed',
  minWidth: DEAL_COLUMN_WIDTH + 8 * 38,
  borderCollapse: 'collapse',
  fontSize: 14,
  color: '#e2e8f0',
};
/** Ячейки первого столбца (номер/название раздачи): неоновая подсветка по краю, цифры — серебристый металл */
const dealResultsTableTdDealStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#e2e8f0',
  minWidth: DEAL_COLUMN_WIDTH,
  width: DEAL_COLUMN_WIDTH,
  boxSizing: 'border-box',
  background: 'linear-gradient(to right, rgba(34, 211, 238, 0.12) 0%, transparent 70%)',
  boxShadow: 'inset 2px 0 10px rgba(34, 211, 238, 0.2), inset 0 0 12px rgba(34, 211, 238, 0.06)',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.8), 0 1px 0 rgba(0, 0, 0, 0.15)',
};
/** Заголовки первого столбца (№ и футер Итог): неоновая подсветка по краю, текст — серебристый металл */
const dealResultsTableThDealStyle: React.CSSProperties = {
  color: '#e2e8f0',
  textShadow: '0 0 1px rgba(255, 255, 255, 0.8), 0 1px 0 rgba(0, 0, 0, 0.15)',
  boxShadow: 'inset 2px 0 12px rgba(34, 211, 238, 0.25), inset 0 0 14px rgba(34, 211, 238, 0.08)',
};
/** Обёртка ячейки «№»: только центрирует круглый значок */
const dealResultsTableThNumWrapStyle: React.CSSProperties = {
  padding: 2,
  textAlign: 'center',
  verticalAlign: 'middle',
};
/** Круглая рамка-значок с символом «№»: ширина 14, высота в 1.5 раза больше, сдвиг влево */
const dealResultsTableThNumBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  height: 21,
  borderRadius: '50%',
  border: '1px solid rgba(34, 211, 238, 0.6)',
  background: 'rgba(15, 23, 42, 0.95)',
  boxShadow: 'inset 0 0 6px rgba(34, 211, 238, 0.1)',
  transform: 'translateX(-3px)',
};
/** Символ «№» внутри значка: вытянут по высоте в 1.5 раза */
const dealResultsTableThNumSymbolStyle: React.CSSProperties = {
  display: 'inline-block',
  fontSize: 9,
  fontWeight: 700,
  color: '#94a3b8',
  lineHeight: 1,
  transform: 'scaleY(1.5)',
};
/** Ячейка «Итог»: та же колонка, но overflow вправо, чтобы слово помещалось */
const dealResultsTableThDealFooterStyle: React.CSSProperties = {
  minWidth: DEAL_COLUMN_WIDTH,
  width: DEAL_COLUMN_WIDTH,
  overflow: 'visible',
  whiteSpace: 'nowrap',
  textAlign: 'left',
};
const dealResultsTableThStyle: React.CSSProperties = {
  paddingTop: 8,
  paddingRight: 6,
  paddingBottom: 8,
  paddingLeft: 6,
  textAlign: 'center',
  fontWeight: 700,
  fontSize: 13,
  color: '#22d3ee',
  borderBottom: '2px solid rgba(34, 211, 238, 0.5)',
  background: 'rgba(15, 23, 42, 0.95)',
  whiteSpace: 'nowrap',
};
/** Ячейки с именами игроков: перенос на вторую строку */
const dealResultsTableThNameStyle: React.CSSProperties = {
  whiteSpace: 'normal',
  paddingLeft: 6,
  paddingRight: 6,
};
/** Обёртка текста имени: макс. 2 строки, затем многоточие (только внутренний блок, ячейка не трогается) */
const dealResultsTableThNameTextStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
/** Разделитель слева у ячеек с именами (кроме первой) */
const _dealResultsTableThNameDividerStyle: React.CSSProperties = {
  borderLeft: '2px solid rgba(34, 211, 238, 0.7)',
};
const dealResultsTableTdStyle: React.CSSProperties = {
  paddingTop: 6,
  paddingRight: 4,
  paddingBottom: 6,
  paddingLeft: 4,
  textAlign: 'center' as const,
  borderBottom: '1px solid rgba(34, 211, 238, 0.2)',
};
/** Фон столбца «заказ» (взяток); цифры — в цвете «З» */
const dealResultsTableTdBidStyle: React.CSSProperties = {
  ...dealResultsTableTdStyle,
  background: 'rgba(30, 58, 138, 0.25)',
  paddingLeft: 4,
  paddingRight: 2,
  color: DEAL_RESULTS_Z_COLOR,
  fontWeight: 600,
  textShadow: `0 0 2px ${DEAL_RESULTS_Z_COLOR}e6`,
};
/** Первая ячейка футера: отступ слева под overflow «Итог» из первой колонки */
const dealResultsTableTdFooterFirstStyle: React.CSSProperties = {
  ...dealResultsTableTdBidStyle,
  paddingLeft: DEAL_COLUMN_WIDTH + DEAL_COLUMN_FOOTER_EXTRA,
};
/** Фон столбца «результат» (очки за раздачу); между парой заказ/результат — минимум отступа */
const dealResultsTableTdResultStyle: React.CSSProperties = {
  ...dealResultsTableTdStyle,
  background: 'rgba(21, 94, 117, 0.2)',
  paddingLeft: 2,
  paddingRight: 4,
};
/** Заголовок столбца «З» (заказ): цвет + эффект «окна» */
const dealResultsTableThBidStyle: React.CSSProperties = {
  ...dealResultsTableThStyle,
  color: DEAL_RESULTS_Z_COLOR,
  background: 'rgba(30, 58, 138, 0.4)',
  width: 38,
  minWidth: 38,
  paddingLeft: 4,
  paddingRight: 4,
  boxSizing: 'border-box',
  textShadow: `0 0 4px ${DEAL_RESULTS_Z_COLOR}88`,
  borderRight: '2px solid rgba(34, 211, 238, 0.7)',
  boxShadow: 'inset 0 0 10px rgba(34, 211, 238, 0.08), inset 0 1px 0 rgba(34, 211, 238, 0.2)',
};
/** Левый разделитель только у первой ячейки «З» в строке */
const dealResultsTableThBidFirstStyle: React.CSSProperties = {
  borderLeft: '2px solid rgba(34, 211, 238, 0.7)',
};
/** Заголовок столбца «О» (очки): цвет + эффект «окна» */
const dealResultsTableThResultStyle: React.CSSProperties = {
  ...dealResultsTableThStyle,
  color: DEAL_RESULTS_O_COLOR,
  background: 'rgba(21, 94, 117, 0.35)',
  width: 38,
  minWidth: 38,
  paddingLeft: 5,
  paddingRight: 4,
  borderLeft: '2px solid rgba(34, 211, 238, 0.7)',
  borderRight: '2px solid rgba(34, 211, 238, 0.7)',
  boxSizing: 'border-box',
  textShadow: `0 0 4px ${DEAL_RESULTS_O_COLOR}88`,
  boxShadow: 'inset 0 0 10px rgba(34, 211, 238, 0.08), inset 0 1px 0 rgba(34, 211, 238, 0.2)',
};
const dealResultsTableTfootStyle: React.CSSProperties = {
  paddingTop: 8,
  paddingRight: 6,
  paddingBottom: 8,
  paddingLeft: 6,
  fontWeight: 800,
  fontSize: 14,
  color: '#fcd34d',
  background: 'rgba(30, 41, 59, 0.9)',
  borderTop: '2px solid rgba(34, 211, 238, 0.6)',
};

const _dealResultsChartBarsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const _dealResultsChartRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 8,
};

const _dealResultsChartNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const _dealResultsChartRankStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  minWidth: 14,
};

const _dealResultsChartScoreStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#f8fafc',
  minWidth: 36,
  textAlign: 'right',
};

const _dealResultsChartBarBgStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  height: 8,
  borderRadius: 4,
  background: 'rgba(15, 23, 42, 0.9)',
  overflow: 'hidden',
  border: '1px solid rgba(34, 211, 238, 0.25)',
};

const _dealResultsChartBarFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 3,
  background: 'linear-gradient(90deg, rgba(34, 211, 238, 0.5) 0%, rgba(34, 211, 238, 0.8) 100%)',
  transition: 'width 0.5s ease-out',
};

const _dealResultsChartBarLeaderStyle: React.CSSProperties = {
  background: 'linear-gradient(90deg, rgba(34, 211, 238, 0.7) 0%, #22d3ee 50%, rgba(94, 234, 212, 0.9) 100%)',
  boxShadow: '0 0 8px rgba(34, 211, 238, 0.5)',
};

const dealResultsButtonStyle: React.CSSProperties = {
  position: 'relative',
  width: 36,
  height: 36,
  borderRadius: '50%',
  border: '2px solid rgba(34, 211, 238, 0.6)',
  background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.9) 0%, rgba(59, 130, 246, 0.85) 100%)',
  boxShadow: '0 0 12px rgba(34, 211, 238, 0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#22d3ee',
  fontSize: 14,
  fontWeight: 700,
  flexShrink: 0,
};

const dealResultsPanelStyle: React.CSSProperties = {
  padding: '10px 14px',
  minWidth: 100,
  background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.5)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.2)',
    '0 0 16px rgba(34, 211, 238, 0.15)',
    'inset 0 1px 0 rgba(255,255,255,0.08)',
  ].join(', '),
};

const dealResultsPanelStyleMobile: React.CSSProperties = {
  padding: '6px 10px',
  minWidth: 72,
  borderRadius: 10,
};

const dealResultsPanelTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#22d3ee',
  marginBottom: 8,
  textAlign: 'center',
  letterSpacing: '0.5px',
};

const dealResultsPanelTitleStyleMobile: React.CSSProperties = {
  fontSize: 10,
  marginBottom: 4,
};

/** ПК-оверлей результатов раздачи: только ограничение макс. ширины и перенос длинного имени (короткие имена — компактно) */
const dealResultsPanelStyleOverlayPC: React.CSSProperties = {
  maxWidth: 180,
  minWidth: 0,
  boxSizing: 'border-box',
};
const dealResultsPanelTitleStyleOverlayPC: React.CSSProperties = {
  whiteSpace: 'normal',
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  wordBreak: 'break-word',
  minWidth: 0,
  maxWidth: '100%',
};

const dealResultsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  fontSize: 11,
};

const dealResultsRowStyleMobile: React.CSSProperties = {
  gap: 6,
  fontSize: 10,
};

const dealResultsLabelStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const dealResultsLabelTotalStyle: React.CSSProperties = {
  ...dealResultsLabelStyle,
  color: '#fcd34d',
  fontWeight: 800,
};

const dealResultsValueStyle: React.CSSProperties = {
  color: '#f8fafc',
  fontWeight: 700,
  fontSize: 12,
};

const dealResultsValueLeaderStyle: React.CSSProperties = {
  color: '#22d3ee',
  fontWeight: 800,
  textShadow: '0 0 8px rgba(34, 211, 238, 0.6)',
  background: 'linear-gradient(135deg, rgba(15, 50, 120, 0.85) 0%, rgba(30, 64, 175, 0.9) 50%, rgba(15, 50, 120, 0.85) 100%)',
  padding: '2px 8px',
  borderRadius: 6,
  boxShadow: 'inset 0 0 12px rgba(34, 211, 238, 0.25), 0 0 10px rgba(34, 211, 238, 0.35)',
};

const opponentSideWrapStyle: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'var(--game-table-opponent-side-min, 140px)',
  maxWidth: 'var(--game-table-opponent-side-max, 180px)',
};

const opponentSideWrapWestStyle: React.CSSProperties = {
  ...opponentSideWrapStyle,
  justifyContent: 'flex-end',
  overflow: 'visible',
};

const opponentSideWrapEastStyle: React.CSSProperties = {
  ...opponentSideWrapStyle,
  justifyContent: 'flex-start',
  overflow: 'visible',
};

/** ПК: колонки Запад/Восток могут расширяться вместе со стопкой взяток (перебор заказа). */
const opponentSideWrapPcGrowStyle: React.CSSProperties = {
  maxWidth: 'min(560px, 44vw)',
  flexShrink: 0,
};

/** ПК, боковой слот: ширина по содержимому, не жёстко 180px. */
const opponentSlotSidePcGrowStyle: React.CSSProperties = {
  width: 'fit-content',
  minWidth: 'var(--game-table-opponent-slot-width, 180px)',
  maxWidth: 'none',
};

/** Совпадение бейджа «Ровно» Север с внешним контуром панели оппонента (толщина border слота) */
const OPPONENT_SLOT_PC_BORDER_PX = 1;

const opponentSlotStyle: React.CSSProperties = {
  position: 'absolute',
  padding: '12px 16px',
  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.45)',
  width: 'var(--game-table-opponent-slot-width, 180px)',
  minWidth: 'var(--game-table-opponent-slot-width, 180px)',
  maxWidth: 'var(--game-table-opponent-slot-width, 180px)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.25)',
    '0 0 20px rgba(34, 211, 238, 0.12)',
    '0 4px 20px rgba(0,0,0,0.25)',
    'inset 0 1px 0 rgba(255,255,255,0.08)',
  ].join(', '),
};

const dealerPanelFrameStyle: React.CSSProperties = {
  border: '1px solid rgba(56, 189, 248, 0.6)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.2)',
    '0 0 20px rgba(34, 211, 238, 0.1)',
    '0 0 12px rgba(56, 189, 248, 0.35)',
    '0 4px 20px rgba(0,0,0,0.25)',
    'inset 0 1px 0 rgba(255,255,255,0.08)',
  ].join(', '),
};

const activeTurnPanelFrameStyle: React.CSSProperties = {
  border: '1px solid rgba(251, 146, 60, 0.45)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.2)',
    '0 0 20px rgba(34, 211, 238, 0.1)',
    '0 0 10px rgba(251, 146, 60, 0.2)',
    '0 4px 20px rgba(0,0,0,0.25)',
    'inset 0 1px 0 rgba(255,255,255,0.08)',
  ].join(', '),
};

/** Панель заказа/очков пользователя при его ходе — умеренная белая неоновая подсветка, скруглённая под панель */
const activeTurnPanelFrameStyleUser: React.CSSProperties = {
  borderRadius: 14,
  border: '1px solid rgba(255, 255, 255, 0.75)',
  boxShadow: [
    '0 0 0 1px rgba(220, 240, 255, 0.5)',
    '0 0 16px rgba(255, 255, 255, 0.28)',
    '0 0 32px rgba(200, 230, 255, 0.22)',
    '0 0 48px rgba(180, 220, 255, 0.14)',
    'inset 0 0 24px rgba(255, 255, 255, 0.1)',
    'inset 0 0 48px rgba(200, 230, 255, 0.06)',
    '0 4px 20px rgba(0,0,0,0.25)',
    'inset 0 1px 0 rgba(255,255,255,0.1)',
  ].join(', '),
};

const opponentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
  flexWrap: 'nowrap',
};

const opponentNameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#f8fafc',
  letterSpacing: '0.2px',
};

/** Мобильная версия: имя ходящего (оппонент или пользователь) — только зелёная подсветка, без рамки и без бейджа */
const nameActiveMobileStyle: React.CSSProperties = {
  color: '#22c55e',
  textShadow: '0 0 10px rgba(34, 197, 94, 0.6), 0 0 4px rgba(34, 197, 94, 0.4)',
};

/** Мобильная: подсказка «Ваш ход!» / «Ваш заказ!» — такой же зелёный с неоном, как имена оппонентов при их ходе */
const yourTurnPromptStyle: React.CSSProperties = {
  ...nameActiveMobileStyle,
};

const opponentTurnBadgeStyle: React.CSSProperties = {
  padding: '3px 10px',
  borderRadius: 14,
  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  boxShadow: '0 2px 6px rgba(34, 197, 94, 0.35)',
};

const dealerLampStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 14,
  background: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.6)',
  color: '#7dd3fc',
  fontSize: 11,
  fontWeight: 600,
  boxShadow: '0 0 10px rgba(56, 189, 248, 0.3), inset 0 0 8px rgba(56, 189, 248, 0.08)',
};

const dealerLampExternalStyle: React.CSSProperties = {
  ...dealerLampStyle,
  position: 'absolute',
  top: 0,
  left: 7,
  transform: 'translateY(-100%)',
  whiteSpace: 'nowrap',
  zIndex: 1,
  borderRadius: '14px 14px 0 0',
};

const dealerLampBulbStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#38bdf8',
  boxShadow: '0 0 8px rgba(56, 189, 248, 0.8)',
};

/** Бейджик «Первый заказ/ход» — прикреплён к верхней границе панельки, оранжевый неон */
const firstBidderLampStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 14,
  background: 'rgba(251, 146, 60, 0.12)',
  border: '1px solid rgba(251, 146, 60, 0.6)',
  color: '#fdba74',
  fontSize: 11,
  fontWeight: 600,
  boxShadow: '0 0 10px rgba(251, 146, 60, 0.3), inset 0 0 8px rgba(251, 146, 60, 0.08)',
};

const firstBidderLampExternalStyle: React.CSSProperties = {
  ...firstBidderLampStyle,
  position: 'absolute',
  top: 0,
  left: 7,
  transform: 'translateY(-100%)',
  whiteSpace: 'nowrap',
  zIndex: 1,
  borderRadius: '14px 14px 0 0',
};

/** ПК: «Первый заказ/ход» в строке панели пользователя (правее имени), без вынесения над панель */
const firstBidderLampUserPanelPcStyle: React.CSSProperties = {
  ...firstBidderLampStyle,
  flexShrink: 0,
  whiteSpace: 'nowrap',
};

const firstBidderLampBulbStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#fb923c',
  boxShadow: '0 0 8px rgba(251, 146, 60, 0.8)',
};

/** ПК: бейдж «заказ на руке ровно» — в духе «Сдающий» / «Первый заказ» */
const orderOnHandLampStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '3px 10px',
  borderRadius: 14,
  background: 'rgba(167, 139, 250, 0.12)',
  border: '1px solid rgba(192, 132, 252, 0.62)',
  color: '#e9d5ff',
  fontSize: 11,
  fontWeight: 600,
  boxShadow: '0 0 10px rgba(167, 139, 250, 0.32), inset 0 0 8px rgba(167, 139, 250, 0.08)',
};

const orderOnHandLampExternalStyle: React.CSSProperties = {
  ...orderOnHandLampStyle,
  position: 'absolute',
  top: 0,
  left: 7,
  transform: 'translateY(-100%)',
  whiteSpace: 'nowrap',
  zIndex: 2,
  borderRadius: '14px 14px 0 0',
};

/** ПК Запад/Восток: вкладка «Ровно» снизу панели (не конкурирует с «Сдающий» сверху) */
const orderOnHandLampExternalBottomStyle: React.CSSProperties = {
  ...orderOnHandLampStyle,
  position: 'absolute',
  bottom: 0,
  top: 'auto',
  left: '50%',
  transform: 'translate(-50%, 100%)',
  whiteSpace: 'nowrap',
  zIndex: 2,
  borderRadius: '0 0 14px 14px',
  boxShadow:
    '0 0 10px rgba(167, 139, 250, 0.32), inset 0 0 8px rgba(167, 139, 250, 0.08), 0 6px 14px rgba(0, 0, 0, 0.2)',
};

/** Масштаб бейджа «Ровно»: оппоненты ПК */
const ORDER_ON_HAND_OPPONENT_SCALE = 1.5;
/** ПК Север, вертикальный бейдж: чуть шире только по горизонтали (+5% к ширине после базового scale) */
const ORDER_ON_HAND_NORTH_VERTICAL_WIDTH_BOOST = 1.05;
/** Симметричный горизонтальный padding (место под визуальный вылет после scale при origin center) */
const ORDER_ON_HAND_NORTH_VERTICAL_PAD_INLINE_PX = 10;

/** Внешняя полоса бейджа Север: высота с учётом border слота; ширина по контенту + равные поля слева/справа */
const orderOnHandNorthVerticalWrapStyle: React.CSSProperties = {
  ...orderOnHandLampStyle,
  position: 'absolute',
  right: '100%',
  marginRight: 0,
  top: -OPPONENT_SLOT_PC_BORDER_PX,
  bottom: -OPPONENT_SLOT_PC_BORDER_PX,
  zIndex: 4,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 0,
  padding: `4px ${ORDER_ON_HAND_NORTH_VERTICAL_PAD_INLINE_PX}px`,
  boxSizing: 'border-box',
  borderRadius: 14,
  whiteSpace: 'normal',
};

/** Галочка над «Ровно»; scaleY как у Запад/Восток, scaleX +5% к ширине бейджа */
const orderOnHandNorthVerticalInnerStyle: React.CSSProperties = {
  display: 'inline-flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  flexShrink: 0,
  transform: `scale(${ORDER_ON_HAND_OPPONENT_SCALE * ORDER_ON_HAND_NORTH_VERTICAL_WIDTH_BOOST}, ${ORDER_ON_HAND_OPPONENT_SCALE})`,
  /** center: иначе right center тянет отрисовку влево — кажется, что контент прижат к левому краю бейджа */
  transformOrigin: 'center center',
};

/**
 * Доп. сдвиг translateX влево при усиленной рамке простоя (свечение шире inset ::after).
 * Якорь left: -4 совпадает с inset кольца ::after — бейдж «ездит» вместе с внешней рамкой.
 */
const ORDER_ON_HAND_USER_IDLE_NUDGE_EXTRA_PX = 10;

/** Зазор между отдельным бейджем «Ровно» и панелью пользователя (ПК), пикселей */
const ORDER_ON_HAND_USER_PANEL_GAP_PX = 10;

const orderOnHandUserPanelSideStyleBase: React.CSSProperties = {
  ...orderOnHandLampStyle,
  position: 'absolute',
  left: 0,
  top: 4,
  bottom: 4,
  transformOrigin: 'right center',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  padding: '8px 12px',
  boxSizing: 'border-box',
  whiteSpace: 'normal',
  /** Цельный бейдж со всех сторон — не сращиваем с панелью */
  borderRadius: 14,
  zIndex: 4,
  overflow: 'hidden',
  background: 'linear-gradient(155deg, rgba(52, 14, 158, 0.69) 0%, rgba(54, 167, 201, 0.31) 100%)',
  border: '1px solid rgba(15, 241, 193, 0.58)',
  color: 'rgb(54, 36, 149)',
  fontSize: 11,
  fontWeight: 600,
  /** Двойная внешняя рамка (два spread-кольца + мягкое свечение + внутренний блик) */
  boxShadow: [
    '0 0 0 2px rgba(103, 58, 226, 0.58)',
    '0 0 0 4px rgb(141, 62, 237)',
    '0 0 16px rgba(92, 164, 223, 0.38)',
    'inset 0 0 8px rgba(167, 139, 250, 0.09)',
  ].join(', '),
};

const orderOnHandCheckBulbUserCompactStyle: React.CSSProperties = {
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 800,
  lineHeight: 1,
  color: '#faf5ff',
  background: 'linear-gradient(145deg, #c4b5fd 0%, #7c3aed 100%)',
  boxShadow: '0 0 8px rgba(167, 139, 250, 0.65)',
  flexShrink: 0,
};

/** Шаг сдвига «Ровно» вправо от предыдущих верхних бейджей (Север); с учётом scale(1.5) у оппонентов */
const ORDER_ON_HAND_TOP_BADGE_STEP_PX = 108;

const orderOnHandCheckBulbStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 9,
  fontWeight: 800,
  lineHeight: 1,
  color: '#faf5ff',
  background: 'linear-gradient(145deg, #c4b5fd 0%, #7c3aed 100%)',
  boxShadow: '0 0 10px rgba(167, 139, 250, 0.75)',
  flexShrink: 0,
};

const opponentStatsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const opponentStatBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 44,
  padding: '4px 10px',
  background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.6) 0%, rgba(30, 41, 59, 0.7) 100%)',
  borderRadius: 6,
  border: '1px solid rgba(71, 85, 105, 0.4)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
};

const opponentStatBadgeScoreStyle: React.CSSProperties = {
  ...opponentStatBadgeStyle,
  borderColor: 'rgba(139, 92, 246, 0.5)',
  background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.12) 0%, rgba(30, 41, 59, 0.8) 100%)',
};

const opponentStatLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 1,
};

const opponentStatValueStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#f8fafc',
};

const tableOuterStyle: React.CSSProperties = {
  position: 'relative',
  flexShrink: 0,
  padding: 'var(--game-table-padding, 18px)',
  borderRadius: '24px',
  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.95) 50%, rgba(15, 23, 42, 0.98) 100%)',
  border: '2px solid rgba(34, 211, 238, 0.5)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.3)',
    '0 0 30px rgba(34, 211, 238, 0.15)',
    'inset 0 0 60px rgba(0, 0, 0, 0.5)',
    '0 24px 48px rgba(0, 0, 0, 0.5)',
  ].join(', '),
};

/** В режиме «С подсветкой» — яркое плотное голубое свечение в зоне между двойной рамкой стола */
const tableOuterStyleWithHighlight: React.CSSProperties = {
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.3)',
    '0 0 30px rgba(34, 211, 238, 0.15)',
    'inset 0 0 60px rgba(0, 0, 0, 0.5)',
    'inset 0 0 20px rgba(180, 235, 255, 0.7)',
    'inset 0 0 36px rgba(120, 210, 255, 0.55)',
    '0 24px 48px rgba(0, 0, 0, 0.5)',
  ].join(', '),
};

const tableSurfaceStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  width: 'var(--game-table-surface-width, 576px)',
  minWidth: 0,
  height: 'var(--game-table-surface-height, 250px)',
  minHeight: 'var(--game-table-surface-height, 250px)',
  padding: 36,
  borderRadius: '16px',
  background: [
    'radial-gradient(ellipse 90% 80% at 50% 50%, rgba(34, 211, 238, 0.06) 0%, transparent 50%)',
    'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.9) 50%, rgba(15, 23, 42, 0.95) 100%)',
  ].join(', '),
  border: '1px solid rgba(34, 211, 238, 0.4)',
  boxShadow: [
    'inset 0 0 100px rgba(0, 0, 0, 0.4)',
    'inset 0 0 0 1px rgba(34, 211, 238, 0.1)',
    '0 0 20px rgba(34, 211, 238, 0.1)',
  ].join(', '),
};

/** В режиме «С подсветкой» — неоновый свет от рамки внутрь: центр темнее, у рамок ярче (интенсивность рамок слегка сбавлена) */
const tableSurfaceStyleWithHighlight: React.CSSProperties = {
  background: [
    'radial-gradient(ellipse 100% 100% at 50% 50%, transparent 0%, transparent 78%, rgba(170, 150, 255, 0.08) 88%, rgba(190, 170, 255, 0.24) 95%, rgba(210, 190, 255, 0.4) 100%)',
    'linear-gradient(180deg, rgba(14, 18, 35, 0.99) 0%, rgba(22, 28, 48, 0.97) 50%, rgba(14, 18, 35, 0.99) 100%)',
  ].join(', '),
  border: '1px solid rgba(220, 200, 255, 0.68)',
  boxShadow: [
    'inset 0 0 0 1px rgba(210, 190, 255, 0.42)',
    'inset 0 0 24px rgba(190, 170, 255, 0.4)',
    'inset 0 0 48px rgba(180, 160, 255, 0.28)',
    'inset 0 0 72px rgba(160, 140, 255, 0.12)',
    '0 0 0 1px rgba(180, 160, 255, 0.35)',
    '0 0 24px rgba(160, 180, 255, 0.22)',
    '0 0 48px rgba(140, 160, 255, 0.12)',
  ].join(', '),
};

const centerStyle: React.CSSProperties = {
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
};

const deckStackWrapStyle: React.CSSProperties = {
  position: 'absolute',
  width: 64,
  height: 96,
};

const trickSlotsWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid rgba(251, 146, 60, 0.4)',
  background: 'linear-gradient(180deg, rgba(251, 146, 60, 0.08) 0%, rgba(30, 41, 59, 0.85) 100%)',
};

/** Кружочки-индикаторы взяток (мобильные/планшеты) */
const trickCirclesWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 3,
  padding: '4px 8px',
  borderRadius: 8,
  border: '1px solid rgba(251, 146, 60, 0.5)',
  background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.12) 0%, rgba(245, 158, 11, 0.08) 50%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: 'inset 0 0 8px rgba(251, 191, 36, 0.15)',
};
const trickCirclesWrapPendingStyle: React.CSSProperties = {
  border: '1px solid rgba(251, 191, 36, 0.55)',
  background: 'linear-gradient(180deg, rgba(251, 191, 36, 0.15) 0%, rgba(245, 158, 11, 0.1) 50%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: 'inset 0 0 10px rgba(251, 191, 36, 0.2)',
};

/** Мобильные кружочки: перебор — болотно-жёлтый (как ПК) */
const trickCirclesWrapMobileOverBidStyle: React.CSSProperties = {
  border: '1px solid rgba(130, 135, 78, 0.48)',
  background:
    'linear-gradient(180deg, rgba(115, 118, 72, 0.14) 0%, rgba(95, 98, 58, 0.11) 45%, rgba(48, 52, 38, 0.2) 100%)',
  boxShadow: [
    '0 0 0 1px rgba(110, 115, 68, 0.26)',
    '0 0 10px rgba(140, 145, 85, 0.12)',
    'inset 0 0 14px rgba(100, 105, 65, 0.09)',
  ].join(', '),
};

/** Мобильные кружочки: жёсткий недобор (заказ невыполним) */
const trickCirclesWrapMobileUnderStrictStyle: React.CSSProperties = {
  border: '1px solid rgba(190, 80, 88, 0.38)',
  background:
    'linear-gradient(180deg, rgba(160, 55, 65, 0.1) 0%, rgba(110, 45, 52, 0.09) 48%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: [
    '0 0 0 1px rgba(165, 65, 75, 0.18)',
    'inset 0 0 12px rgba(130, 50, 58, 0.07)',
  ].join(', '),
};
const trickCirclesRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  justifyContent: 'center',
};
const trickCircleBaseStyle: React.CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: '50%',
  flexShrink: 0,
};
const trickCircleEmptyStyle: React.CSSProperties = {
  border: '1px dashed rgba(251, 146, 60, 0.6)',
  background: 'rgba(30, 41, 59, 0.6)',
};
const trickCircleFilledStyle: React.CSSProperties = {
  border: '1px solid rgba(99, 102, 241, 0.7)',
  background: 'radial-gradient(circle at 30% 30%, rgba(199, 210, 254, 0.9) 0%, rgba(99, 102, 241, 0.8) 40%, #1e1b4b 100%)',
  boxShadow: 'inset 0 0 6px rgba(99, 102, 241, 0.4), 0 0 8px rgba(99, 102, 241, 0.5)',
};
const trickCirclesPlusStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(251, 146, 60, 0.9)',
  fontWeight: 700,
  marginLeft: 2,
};

/** ПК: панель взяток — сиренево-голубая при точном попадании (игрок и оппонент) */
const trickSlotsWrapPcExactOrderStyle: React.CSSProperties = {
  border: '1px solid rgba(196, 181, 253, 0.88)',
  background:
    'linear-gradient(180deg, rgba(196, 181, 253, 0.26) 0%, rgba(125, 211, 252, 0.16) 42%, rgba(99, 102, 241, 0.14) 100%)',
  boxShadow: [
    '0 0 0 1px rgba(139, 92, 246, 0.45)',
    '0 0 14px rgba(125, 211, 252, 0.38)',
    '0 0 28px rgba(167, 139, 250, 0.15)',
    'inset 0 0 16px rgba(186, 230, 253, 0.2)',
  ].join(', '),
};

/** ПК: перебор — тусклый болотно-жёлтый (без минуса в зачёте) */
const trickSlotsWrapPcOverBidStyle: React.CSSProperties = {
  border: '1px solid rgba(130, 135, 78, 0.48)',
  background:
    'linear-gradient(180deg, rgba(115, 118, 72, 0.14) 0%, rgba(95, 98, 58, 0.11) 45%, rgba(48, 52, 38, 0.2) 100%)',
  boxShadow: [
    '0 0 0 1px rgba(110, 115, 68, 0.26)',
    '0 0 10px rgba(140, 145, 85, 0.12)',
    'inset 0 0 14px rgba(100, 105, 65, 0.09)',
  ].join(', '),
};

/** ПК: недобор — тусклый «штрафной» красный (минус по очкам), слабее старого pending */
const trickSlotsWrapPcUnderBidStyle: React.CSSProperties = {
  border: '1px solid rgba(190, 80, 88, 0.38)',
  background:
    'linear-gradient(180deg, rgba(160, 55, 65, 0.1) 0%, rgba(110, 45, 52, 0.09) 48%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: [
    '0 0 0 1px rgba(165, 65, 75, 0.18)',
    'inset 0 0 12px rgba(130, 50, 58, 0.07)',
  ].join(', '),
};

const trickSlotsLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const trickSlotsValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#f8fafc',
};

const trickSlotsRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const trickSlotBaseStyle: React.CSSProperties = {
  borderRadius: 4,
  flexShrink: 0,
};

const trickSlotEmptyStyle: React.CSSProperties = {
  border: '1px dashed rgba(251, 146, 60, 0.5)',
  background: 'rgba(30, 41, 59, 0.5)',
};

const trickSlotFilledStyle: React.CSSProperties = {
  border: '1px solid rgba(99, 102, 241, 0.5)',
  boxShadow: 'inset 0 0 6px rgba(99, 102, 241, 0.15), 0 1px 3px rgba(0,0,0,0.25)',
  background: [
    'linear-gradient(145deg, #1e1b4b 0%, #312e81 50%, #134e4a 100%)',
    'radial-gradient(1px 1px at 30% 40%, #e0e7ff 0%, transparent 100%)',
    'radial-gradient(1px 1px at 70% 60%, #c7d2fe 0%, transparent 100%)',
  ].join(', '),
};

const trickSlotExtraStyle: React.CSSProperties = {
  border: '1px solid rgba(251, 146, 60, 0.6)',
  boxShadow: 'inset 0 0 6px rgba(251, 146, 60, 0.1), 0 1px 3px rgba(0,0,0,0.25)',
  background: [
    'linear-gradient(145deg, #422006 0%, #78350f 50%, #134e4a 100%)',
    'radial-gradient(1px 1px at 30% 40%, rgba(251, 146, 60, 0.4) 0%, transparent 100%)',
  ].join(', '),
};

const trickSlotsPlusStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'rgba(251, 146, 60, 0.8)',
  fontWeight: 700,
  marginLeft: 2,
  marginRight: 0,
};

const cardBackStyle: React.CSSProperties = {
  width: 52,
  height: 76,
  borderRadius: 8,
  border: '2px solid rgba(99, 102, 241, 0.5)',
  boxShadow: [
    'inset 0 0 30px rgba(99, 102, 241, 0.15)',
    'inset 0 0 0 1px rgba(255, 255, 255, 0.08)',
    '0 2px 8px rgba(0, 0, 0, 0.3)',
  ].join(', '),
  background: [
    'radial-gradient(1.5px 1.5px at 20% 25%, #fef3c7 0%, transparent 100%)',
    'radial-gradient(1px 1px at 45% 15%, #e0e7ff 0%, transparent 100%)',
    'radial-gradient(2px 2px at 75% 35%, #c7d2fe 0%, transparent 100%)',
    'radial-gradient(1px 1px at 15% 60%, #fce7f3 0%, transparent 100%)',
    'radial-gradient(1.5px 1.5px at 85% 75%, #a5f3fc 0%, transparent 100%)',
    'radial-gradient(1px 1px at 50% 80%, #e0e7ff 0%, transparent 100%)',
    'radial-gradient(ellipse 60% 40% at 50% 30%, rgba(192, 132, 252, 0.4) 0%, transparent 50%)',
    'radial-gradient(circle at 30% 70%, rgba(59, 130, 246, 0.3) 0%, transparent 40%)',
    'radial-gradient(circle at 70% 60%, rgba(236, 72, 153, 0.25) 0%, transparent 35%)',
    'linear-gradient(145deg, #0f0a1e 0%, #1e1b4b 20%, #312e81 40%, #1e3a5f 60%, #0c4a6e 80%, #134e4a 100%)',
  ].join(', '),
  backgroundSize: '100% 100%',
};

const trumpStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
};

const trickStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
};

const lastTrickButtonStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: '1%',
  right: 12,
  padding: '8px 20px',
  borderRadius: 8,
  border: '1px solid rgba(34, 211, 238, 0.4)',
  background: 'transparent',
  color: 'rgba(34, 211, 238, 0.95)',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 12px rgba(34, 211, 238, 0.2)',
};

const playerStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxHeight: 'var(--game-player-area-height, 260px)',
  padding: 'var(--game-header-padding, 20px)',
  paddingTop: 12,
  background: 'linear-gradient(0deg, #1e293b 0%, rgba(30, 41, 59, 0.98) 40%, transparent 100%)',
  zIndex: 10,
  borderTopLeftRadius: 18,
  borderTopRightRadius: 18,
};

const playerInfoPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
  marginBottom: 7,
  padding: '7px 14px',
  background: 'linear-gradient(145deg, rgba(51, 65, 85, 0.9) 0%, rgba(30, 41, 59, 0.95) 30%, rgba(15, 23, 42, 0.98) 70%, rgba(30, 41, 59, 0.95) 100%)',
  borderRadius: 14,
  border: '1px solid rgba(34, 211, 238, 0.6)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.35)',
    '0 0 24px rgba(34, 211, 238, 0.25)',
    '0 0 48px rgba(34, 211, 238, 0.12)',
    '0 8px 32px rgba(0,0,0,0.4)',
    'inset 0 2px 4px rgba(255,255,255,0.12)',
    'inset 0 -2px 6px rgba(0,0,0,0.2)',
  ].join(', '),
  maxWidth: 800,
  marginLeft: 'auto',
  marginRight: 'auto',
};

const playerInfoHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 7,
  flexWrap: 'wrap',
};

const playerNameDealerWrapStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minWidth: 0,
  flex: '1 1 0',
};

const playerNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#f8fafc',
  letterSpacing: '0.3px',
};

const yourTurnBadgeStyle: React.CSSProperties = {
  padding: '2px 10px',
  borderRadius: 14,
  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  color: '#fff',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.5px',
  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
};

const playerStatsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
};

const playerStatBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 53,
  padding: '4px 10px',
  background: 'linear-gradient(145deg, rgba(71, 85, 105, 0.8) 0%, rgba(51, 65, 85, 0.85) 50%, rgba(30, 41, 59, 0.9) 100%)',
  borderRadius: 10,
  border: '1px solid rgba(34, 211, 238, 0.35)',
  boxShadow: [
    'inset 0 1px 2px rgba(255,255,255,0.1)',
    'inset 0 -1px 3px rgba(0,0,0,0.15)',
    '0 2px 8px rgba(0,0,0,0.2)',
    '0 0 12px rgba(34, 211, 238, 0.08)',
  ].join(', '),
};

const playerStatBadgeScoreStyle: React.CSSProperties = {
  ...playerStatBadgeStyle,
  borderColor: 'rgba(139, 92, 246, 0.55)',
  background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.15) 0%, rgba(30, 41, 59, 0.85) 100%)',
};

const playerStatLabelStyle: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 1,
};

const playerStatValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#f8fafc',
};

const handFrameStyle: React.CSSProperties = {
  padding: '5px 12px',
  borderRadius: 14,
  border: '1px solid rgba(34, 211, 238, 0.6)',
  boxShadow: [
    '0 0 0 1px rgba(34, 211, 238, 0.35)',
    '0 0 20px rgba(34, 211, 238, 0.22)',
    '0 0 40px rgba(34, 211, 238, 0.1)',
    '0 6px 24px rgba(0,0,0,0.35)',
    'inset 0 2px 4px rgba(255,255,255,0.1)',
    'inset 0 -2px 6px rgba(0,0,0,0.18)',
  ].join(', '),
  marginBottom: 6,
  transform: 'translateY(3px)',
  maxWidth: 800,
  width: 'fit-content',
  marginLeft: 'auto',
  marginRight: 'auto',
};

/** Мобильная рука: рамка shrink-wrap; padding-inline из index.css (--mobile-south-strip-inset-x). */
const handFrameStyleMobile: React.CSSProperties = {
  ...handFrameStyle,
  width: 'fit-content',
  maxWidth: '100%',
  marginLeft: 'auto',
  marginRight: 'auto',
  padding: undefined,
  paddingTop: 6,
  paddingBottom: 6,
  overflow: 'visible',
  boxSizing: 'border-box',
  position: 'relative',
};

const handStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'nowrap',
  justifyContent: 'center',
  gap: 0,
};

/** Стили панели заказа, встроенной в панель игрока — справа от бейджиков, без увеличения высоты */
const bidPanelInlineStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  borderRadius: 8,
};
const bidPanelInlineTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#4c1d95',
  whiteSpace: 'nowrap',
};

const bidSidePanelGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  gap: 6,
  justifyContent: 'center',
};

const bidSidePanelButton: React.CSSProperties = {
  width: 38,
  height: 38,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  border: '1px solid rgba(34, 197, 94, 0.6)',
  background: 'linear-gradient(180deg, #4ade80 0%, #22c55e 100%)',
  color: '#052e16',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'all 0.15s ease',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.15)',
};

/** Только мобильная версия: кнопки заказа в стиле приложения (cyan/teal, больше подсветки) */
const bidSidePanelButtonMobile: React.CSSProperties = {
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.85)',
  background: 'linear-gradient(180deg, rgba(20, 184, 166, 0.45) 0%, rgba(15, 23, 42, 0.92) 50%, rgba(6, 78, 59, 0.5) 100%)',
  color: '#5eead4',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'transform 0.12s ease, box-shadow 0.2s ease',
  boxShadow: 'inset 0 1px 0 rgba(34, 211, 238, 0.5), inset 0 0 14px rgba(34, 211, 238, 0.15), 0 0 20px rgba(34, 211, 238, 0.45), 0 0 10px rgba(94, 234, 212, 0.3), 0 2px 8px rgba(0,0,0,0.3)',
};

const bidSidePanelButtonDisabled: React.CSSProperties = {
  background: 'rgba(88, 28, 40, 0.5)',
  border: '1px solid rgba(88, 28, 40, 0.6)',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'not-allowed',
};

/** Отключённая кнопка заказа — только мобильная */
const bidSidePanelButtonDisabledMobile: React.CSSProperties = {
  background: 'rgba(30, 41, 59, 0.8)',
  border: '1px solid rgba(71, 85, 105, 0.6)',
  color: 'rgba(148, 163, 184, 0.6)',
  cursor: 'not-allowed',
  boxShadow: 'none',
};

const modalOverlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const modalContent: React.CSSProperties = {
  background: '#1e293b',
  padding: 24,
  borderRadius: 16,
  maxWidth: 400,
  width: '90%',
  border: '1px solid #334155',
  boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
};

const buttonStyle: React.CSSProperties = {
  padding: '10px 20px',
  borderRadius: 8,
  border: '1px solid #475569',
  background: '#334155',
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 14,
};

function DealContractPcSummaryLine({
  totalOrders,
  totalTricks,
  tricksInDeal,
  orderCompare,
}: {
  totalOrders: number;
  totalTricks: number;
  tricksInDeal: number;
  orderCompare: DealOrderComparePc;
}) {
  return (
    <span className="deal-contract-line deal-contract-line-pc-colored" style={dealContractLineTextStyle}>
      <span className="deal-contract-pc-label deal-contract-pc-label-order">Заказ:</span>{' '}
      <span className={`deal-contract-pc-num deal-contract-pc-num-order deal-contract-pc-num-order--${orderCompare}`}>
        {totalOrders}
      </span>
      <span className="deal-contract-pc-label deal-contract-pc-label-tricks">Взяток:</span>{' '}
      <span className="deal-contract-pc-num deal-contract-pc-num-taken">{totalTricks}</span>
      <span className="deal-contract-pc-slash" aria-hidden="true">
        /
      </span>
      <span className="deal-contract-pc-num deal-contract-pc-num-deal">{tricksInDeal}</span>
    </span>
  );
}

export { GameTable };
export default GameTable;
