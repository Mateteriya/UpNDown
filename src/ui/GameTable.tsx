/**
 * Игровой стол Up&Down
 * @see TZ.md раздел 7.3
 */

import type { CSSProperties } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '../game/GameEngine';
import {
  createGame,
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
import { loadGameStateFromStorage, saveGameStateToStorage, updateLocalRating, getLocalRating } from '../game/persistence';
import { aiBid, aiPlay } from '../game/ai';
import { getTrickWinner } from '../game/rules';
import { calculateDealPoints, getTakenFromDealPoints } from '../game/scoring';
import { preloadCardImages } from '../cardAssets';
import { CardView } from './CardView';
import { PlayerAvatar } from './PlayerAvatar';
import { PlayerInfoPanel } from './PlayerInfoPanel';
import type { Card } from '../game/types';

interface GameTableProps {
  gameId: number;
  playerDisplayName?: string;
  playerAvatarDataUrl?: string | null;
  onExit: () => void;
  onNewGame?: () => void;
}

/** Задержка перед завершением взятки — 4‑я карта показывается в слоте */
const FOURTH_CARD_SLOT_PAUSE_MS = 550;
/** Пауза с картами на столе — 4‑й игрок положил карту на своё место */
const LAST_TRICK_CARDS_PAUSE_MS = 1200;
/** Пауза с миганием панельки взявшего взятку */
const LAST_TRICK_WINNER_PAUSE_MS = 800;
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
}: {
  snapshot: GameState;
  gameId: number;
  onNewGame: () => void;
  onExit: () => void;
  onOpenTable: () => void;
}) {
  const [showExpanded, setShowExpanded] = useState(false);
  const humanIdx = 0;
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
        <button type="button" onClick={onNewGame} style={gameOverButtonPrimaryStyle}>
          Новая партия
        </button>
      </div>
    </div>
  );
}

function GameTable({ gameId, playerDisplayName, playerAvatarDataUrl, onExit, onNewGame }: GameTableProps) {
  const isMobileOrTablet = useIsMobileOrTablet();
  const isMobile = useIsMobile();
  const [state, setState] = useState<GameState | null>(null);
  const [trickPauseUntil, setTrickPauseUntil] = useState(0);
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [bidPanelVisible, setBidPanelVisible] = useState(false);
  const [trumpHighlightOn, setTrumpHighlightOn] = useState(true);
  const [lastTrickCollectingPhase, setLastTrickCollectingPhase] = useState<'idle' | 'slots' | 'winner' | 'collapsing' | 'button'>('idle');
  const [showDealResultsButton, setShowDealResultsButton] = useState(false);
  const [dealResultsExpanded, setDealResultsExpanded] = useState(false);
  const [lastDealResultsSnapshot, setLastDealResultsSnapshot] = useState<GameState | null>(null);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);
  const [gameOverSnapshot, setGameOverSnapshot] = useState<GameState | null>(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const [selectedPlayerForInfo, setSelectedPlayerForInfo] = useState<number | null>(null);
  const [showDealerTooltip, setShowDealerTooltip] = useState(false);
  const [showYourTurnPrompt, setShowYourTurnPrompt] = useState(false);
  const yourTurnPromptTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yourTurnPromptIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCompletedTrickRef = useRef<unknown>(null);

  useEffect(() => {
    const t = setTimeout(preloadCardImages, 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showDealerTooltip) return;
    const t = setTimeout(() => setShowDealerTooltip(false), 2000);
    return () => clearTimeout(t);
  }, [showDealerTooltip]);
  /** После первого появления кнопка «Результаты» больше не скрывается до конца партии */
  const dealResultsButtonEverShownRef = useRef(false);
  /** ПК: имя в блоке «Заказывает/Сейчас ход» ограничено CSS (max-width + перенос строки) */

  useEffect(() => {
    const restored = loadGameStateFromStorage();
    const humanName = playerDisplayName?.trim() && playerDisplayName !== 'Вы' ? playerDisplayName : 'Вы';
    if (restored) {
      const synced = { ...restored, players: restored.players.map((p, i) => i === 0 ? { ...p, name: humanName } : p) };
      setState(synced);
    } else {
      let s = createGame(4, 'classical', humanName);
      s = startDeal(s);
      setState(s);
    }
    setTrickPauseUntil(0);
    setShowLastTrickModal(false);
    setBidPanelVisible(false);
    setShowDealResultsButton(false);
    dealResultsButtonEverShownRef.current = false;
    setDealResultsExpanded(false);
    setLastDealResultsSnapshot(null);
    setGameOverSnapshot(null);
    setShowGameOverModal(false);
  }, [gameId, playerDisplayName]);

  useEffect(() => {
    if (state !== null) {
      saveGameStateToStorage(state);
    }
  }, [state]);

  useEffect(() => {
    if (dealResultsExpanded && isMobile) {
      document.body.classList.add('deal-results-modal-open-mobile');
      return () => document.body.classList.remove('deal-results-modal-open-mobile');
    }
  }, [dealResultsExpanded, isMobile]);

  const humanIdx = 0;
  const isHumanTurn = state?.phase === 'playing' && state.currentPlayerIndex === humanIdx;
  const isHumanBidding = (state?.phase === 'bidding' || state?.phase === 'dark-bidding') && state.currentPlayerIndex === humanIdx;

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
    setState(prev => prev && placeBid(prev, humanIdx, bid));
  }, [humanIdx]);

  const handleBidRef = useRef(handleBid);
  handleBidRef.current = handleBid;

  const COLLAPSING_MS = 750;
  useLayoutEffect(() => {
    if (!state?.lastCompletedTrick) {
      lastCompletedTrickRef.current = null;
      setLastTrickCollectingPhase('idle');
      return;
    }
    const trick = state.lastCompletedTrick;
    const isLastTrickOfDeal = state.players.every(p => p.hand.length === 0);
    if (lastCompletedTrickRef.current !== trick && !dealResultsButtonEverShownRef.current) {
      setShowDealResultsButton(false);
    }
    if (lastCompletedTrickRef.current === trick) return;
    lastCompletedTrickRef.current = trick;
    setTrickPauseUntil(Date.now() + TRICK_PAUSE_MS);
    const t = setTimeout(() => {
      setTrickPauseUntil(0);
      setState(prev => {
        if (prev?.phase === 'deal-complete') {
          const next = startNextDeal(prev);
          return next ?? prev;
        }
        return prev ?? null;
      });
    }, TRICK_PAUSE_MS);
    let viewDelay: number | undefined;
    let winnerDelay: number | undefined;
    let collapseDelay: number | undefined;
    if (isLastTrickOfDeal) {
      setLastTrickCollectingPhase('slots');
      viewDelay = window.setTimeout(() => {
        setLastTrickCollectingPhase('winner');
        winnerDelay = window.setTimeout(() => {
          setLastTrickCollectingPhase('collapsing');
          collapseDelay = window.setTimeout(() => {
            setLastTrickCollectingPhase('button');
            if (state.dealNumber === 28) {
              setGameOverSnapshot(state);
              setShowGameOverModal(true);
              const maxScore = Math.max(...state.players.map(p => p.score));
              const humanWon = state.players[0].score === maxScore;
              let bidAccuracy = 0;
              if (state.dealHistory?.length) {
                let met = 0;
                for (const d of state.dealHistory) {
                  const bid = d.bids[0];
                  const pts = d.points[0];
                  if (bid == null) continue;
                  const taken = getTakenFromDealPoints(bid, pts);
                  if (bid === taken) met++;
                }
                bidAccuracy = Math.round((met / state.dealHistory.length) * 100);
              }
              updateLocalRating(humanWon, undefined, bidAccuracy);
            } else {
              setShowDealResultsButton(true);
              dealResultsButtonEverShownRef.current = true;
              setLastDealResultsSnapshot(state);
            }
          }, COLLAPSING_MS);
        }, LAST_TRICK_WINNER_PAUSE_MS);
      }, LAST_TRICK_CARDS_PAUSE_MS);
    } else {
      setLastTrickCollectingPhase('idle');
    }
    return () => {
      clearTimeout(t);
      if (viewDelay) clearTimeout(viewDelay);
      if (winnerDelay) clearTimeout(winnerDelay);
      if (collapseDelay) clearTimeout(collapseDelay);
    };
  }, [state?.lastCompletedTrick, state?.players]);

  useEffect(() => {
    if (!state?.pendingTrickCompletion) return;
    const t = setTimeout(() => {
      setState(prev => prev && completeTrick(prev));
    }, FOURTH_CARD_SLOT_PAUSE_MS);
    return () => clearTimeout(t);
  }, [state?.pendingTrickCompletion]);

  const isAITurn =
    !!state &&
    !state.pendingTrickCompletion &&
    (state.phase === 'bidding' || state.phase === 'dark-bidding' || state.phase === 'playing') &&
    !isHumanPlayer(state, state.currentPlayerIndex);

  const accelerateAI = useCallback(() => {
    if (!state) return;
    const idx = state.currentPlayerIndex;
    if (state.phase === 'bidding' || state.phase === 'dark-bidding') {
      const bid = aiBid(state, idx);
      setState(prev => prev && placeBid(prev, idx, bid));
    } else if (state.phase === 'playing') {
      const card = aiPlay(state, idx);
      if (card) setState(prev => prev && playCard(prev, idx, card));
    }
  }, [state]);

  useEffect(() => {
    if (!isAITurn || !state) return;
    const iv = setInterval(() => {
      setState(s => {
        if (!s) return s;
        const idx = s.currentPlayerIndex;
        if (s.phase === 'bidding' || s.phase === 'dark-bidding') {
          const bid = aiBid(s, idx);
          return placeBid(s, idx, bid);
        }
        if (s.phase === 'playing') {
          const card = aiPlay(s, idx);
          return card ? playCard(s, idx, card) : s;
        }
        return s;
      });
    }, 650);
    return () => clearInterval(iv);
  }, [isAITurn, state?.phase, state?.currentPlayerIndex]);

  if (!state) return <div style={{ padding: 20 }}>Загрузка...</div>;

  return (
    <div className={`game-table-root${isMobile ? ' viewport-mobile' : ''}`} style={tableLayoutStyle}>
      {isMobileOrTablet && showDealerTooltip && (
        <div className="dealer-tooltip-toast" role="status" aria-live="polite">
          Сдающий
        </div>
      )}
      <div style={tableStyle}>
      <header className="game-header" style={headerStyle}>
        <div style={headerLeftWrapStyle}>
          <div style={headerMenuButtonsWrapStyle}>
            <button
              type="button"
              className="header-exit-btn"
              onClick={onExit}
              style={exitBtnStyle}
              title="В меню"
              aria-label="В меню"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </button>
            {onNewGame && (
              <button
                type="button"
                className="header-new-game-btn"
                onClick={() => setShowNewGameConfirm(true)}
                style={newGameBtnStyle}
                title="Новая партия"
                aria-label="Новая партия"
              >
                ↻
              </button>
            )}
          </div>
          {isMobile && (state.phase === 'bidding' || state.phase === 'dark-bidding') && (
            <div className="first-move-badge" style={firstMoveBadgeStyle}>
              <span className="first-move-num" style={firstMoveLabelStyle}>I:</span>
              <span style={firstMoveValueStyle}>{state.players[state.trickLeaderIndex].name}</span>
            </div>
          )}
        </div>
        <div style={headerRightWrapStyle}>
          <div style={headerRightTopRowStyle}>
            {showDealResultsButton && (
              <button
                type="button"
                onClick={() => setDealResultsExpanded(true)}
                style={dealResultsButtonStyle}
                className="deal-results-btn"
                title="Результаты раздачи"
                aria-label="Показать результаты раздачи"
              >
                Σ
              </button>
            )}
            <div style={dealNumberBadgeStyle} className="deal-number-badge">
              <span style={dealNumberLabelStyle}>Раздача</span>
              <span style={dealNumberValueStyle}><span className="deal-num-symbol" aria-hidden>№</span><span className="deal-num-value">{state.dealNumber}</span></span>
            </div>
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
          </div>
          {(getDealType(state.dealNumber) === 'no-trump' || getDealType(state.dealNumber) === 'dark') ? (
            <div style={{
              ...gameInfoModePanelStyle,
              ...(!isMobile ? {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
              } : {}),
            }}>
              <span style={{
                ...gameInfoLabelStyle,
                ...(!isMobile ? { marginBottom: 0, fontSize: 11, lineHeight: 1 } : {}),
              }}>Режим</span>
              <span style={{
                ...gameInfoValueStyle,
                ...(!isMobile ? { fontSize: 14, lineHeight: 1 } : {}),
              }}>
                {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : state.phase === 'dark-bidding' ? 'Тёмная (вслепую)' : 'Тёмная'}
              </span>
            </div>
          ) : (
            <div style={gameInfoCardsPanelStyle}>
              <span style={{ ...gameInfoLabelStyle, marginBottom: 0, fontSize: 10, lineHeight: 1 }}>Карт</span>
              <span style={{ ...gameInfoValueStyle, fontSize: 13, lineHeight: 1 }}>
                {state.tricksInDeal} {state.tricksInDeal === 1 ? 'карта' : state.tricksInDeal < 5 ? 'карты' : 'карт'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div className={isMobile ? 'game-table-block game-table-block-mobile' : undefined} style={gameTableBlockStyle}>
      {isMobile ? (
        /* Мобильная раскладка: Север+Запад над столом, стол вертикальный, Восток+Юг под столом */
        <>
          <div className="game-mobile-top-row" style={{ ...gameInfoTopRowStyle, justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div className="game-info-left-col" style={gameInfoLeftColumnStyle}>
              {(state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                <div className="game-info-left-section" style={gameInfoLeftSectionStyle}>
                  {state.phase === 'playing' && (
                    <div style={{ ...gameInfoBadgeStyle, ...gameInfoActiveBadgeStyle }}>
                      <span style={gameInfoLabelStyle}>Сейчас ход</span>
                      <span style={{ ...gameInfoValueStyle, color: '#22c55e' }}>{state.players[state.currentPlayerIndex].name}</span>
                    </div>
                  )}
                  {(state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                    <div style={{ ...gameInfoBadgeStyle, ...gameInfoBiddingBadgeStyle }}>
                      <span style={gameInfoLabelStyle}>Заказывает</span>
                      <span style={{ ...gameInfoValueStyle, color: '#f59e0b' }}>
                        {state.players[state.currentPlayerIndex].name}
                        {state.phase === 'dark-bidding' && ' (вслепую)'}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="game-mobile-slot-west" style={{ display: 'flex', flexShrink: 0 }}>
              <OpponentSlot state={state} index={2} position="left" inline compactMode={isMobileOrTablet}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 2}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 2}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
              />
            </div>
            <div className="game-mobile-slot-north" style={{ position: 'relative', display: 'flex', flexShrink: 0 }}>
              <OpponentSlot state={state} index={1} position="top" inline compactMode={isMobileOrTablet}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 1}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 1}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
              />
            </div>
          </div>
          <div className="game-center-spacer-top" style={centerAreaSpacerTopStyle} aria-hidden />
          <div className="game-mobile-table-and-hand" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0, width: '100%', padding: 0, boxSizing: 'border-box' }}>
          <div className="game-center-area game-mobile-center" style={{ ...centerAreaStyle, flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'stretch', width: '100%', maxWidth: '100%', gap: 12, marginLeft: 0, marginRight: 0, transform: 'translateX(-28px)', ...(isAITurn ? { cursor: 'pointer' } : {}) }}
            onClick={isAITurn ? accelerateAI : undefined}
            onKeyDown={e => { if (isAITurn && e.key === ' ') { e.preventDefault(); accelerateAI(); } }}
            role={isAITurn ? 'button' : undefined}
            tabIndex={isAITurn ? 0 : undefined}
            title={isAITurn ? 'Нажмите, чтобы ускорить ход ИИ' : undefined}>
            <div className="game-center-table" style={{ ...centerStyle, flex: 1, minWidth: 0 }}>
        <div style={{ ...tableOuterStyle, ...(trumpHighlightOn ? tableOuterStyleWithHighlight : {}) }}>
          <div style={{ ...tableSurfaceStyle, ...(trumpHighlightOn ? tableSurfaceStyleWithHighlight : {}) }}>
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
                      padding: '4px 10px',
                      fontSize: 14,
                      fontWeight: 600,
                      background: 'transparent',
                      whiteSpace: 'nowrap',
                      zIndex: 1,
                      border: '1px solid rgba(34, 211, 238, 0.85)',
                      borderRadius: 14,
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
            <div className="game-center-east game-mobile-east" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(isMobile ? {} : { minWidth: 60 }) }}>
              <OpponentSlot state={state} index={3} position="right" inline compactMode={isMobileOrTablet}
                collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
                winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 3}
                currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 3}
                firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
                firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
                isMobile={true}
                onAvatarClick={setSelectedPlayerForInfo}
                onDealerBadgeClick={() => setShowDealerTooltip(true)}
              />
            </div>
      </div>
      <div className="game-mobile-hand-attached" style={{ width: '100%', maxWidth: 800, flexShrink: 0, minWidth: 0 }}>
        <div className={state.currentPlayerIndex === humanIdx ? 'player-hand-your-turn' : undefined} style={handFrameStyleMobile}>
          <div style={{ ...handStyle, overflow: 'hidden', justifyContent: 'center', paddingLeft: 10, paddingRight: 10, borderRadius: 10 }}>
            {state.players[humanIdx].hand
              .slice()
              .sort((a, b) => cardSort(a, b, state.trump))
              .map((card, i) => {
                const handLen = state.players[humanIdx].hand.length;
                const overlap = handLen >= 9 ? 5 : handLen >= 7 ? 3 : handLen >= 6 ? 2 : 0;
                const isValidPlay = state.phase === 'playing' && state.currentPlayerIndex === humanIdx && state.currentTrick.length > 0 && validPlays.some(c => c.suit === card.suit && c.rank === card.rank);
                return (
                <div key={`${card.suit}-${card.rank}-${i}`} style={{ marginRight: overlap ? -overlap : 0, flexShrink: 0, overflow: 'hidden', borderRadius: 6, position: 'relative', zIndex: isValidPlay ? 1 : 0, padding: 2 }}>
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
                  showPipZoneBorders={false}
                  pcCardStyles={false}
                  thinBorder={true}
                  onClick={() => {
                    if (!state.pendingTrickCompletion && isHumanTurn && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)) {
                      setState(prev => prev && playCard(prev, humanIdx, card));
                    }
                  }}
                  disabled={!!state.pendingTrickCompletion || !isHumanTurn || !validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
                />
                </div>
              );})}
          </div>
        </div>
      </div>
      </div>
      <div className="game-mobile-bottom-row" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
        <div className="game-mobile-player-wrap game-mobile-player" style={{ flex: 1, minWidth: 0, width: '100%', maxWidth: 800 }}>
      <div className="game-mobile-player-panel" style={{
        ...playerStyle,
        ...(dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')
          ? { visibility: 'hidden' as const, pointerEvents: 'none' as const, opacity: 0 }
          : {}),
      }}>
        <div className={['game-mobile-player-info', 'user-player-panel', state.currentPlayerIndex === humanIdx ? 'player-info-panel-your-turn' : '', (state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? 'first-mover-bidding-panel' : ''].filter(Boolean).join(' ')} style={{
          ...playerInfoPanelStyle,
          position: 'relative',
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
          ...(dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === humanIdx ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
          ...(getCurrentTrickLeaderIndex(state) === humanIdx ? currentTrickLeaderGlowStyle : {}),
          ...((state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? (() => {
            const base = state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : null;
            const baseShadow = base?.boxShadow ?? playerInfoPanelStyle.boxShadow;
            return { boxShadow: [baseShadow, firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') };
          })() : {}),
        }}>
          <div style={playerInfoHeaderStyle}>
            <button
              type="button"
              onClick={() => setSelectedPlayerForInfo(0)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', lineHeight: 0 }}
              title="Информация об игроке"
              aria-label={`Информация об игроке ${state.players[humanIdx].name}`}
            >
              <PlayerAvatar name={state.players[humanIdx].name} avatarDataUrl={playerAvatarDataUrl} sizePx={isMobileOrTablet ? 34 : 38} />
            </button>
            <span style={playerNameDealerWrapStyle}>
              <span
                className={['player-panel-name', isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding) ? 'your-turn-prompt' : ''].filter(Boolean).join(' ')}
                style={{
                  ...playerNameStyle,
                  ...(state.currentPlayerIndex === humanIdx && !showYourTurnPrompt ? nameActiveMobileStyle : {}),
                  ...(isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding) ? yourTurnPromptStyle : {}),
                }}
              >
                {isMobile && showYourTurnPrompt && (isHumanTurn || isHumanBidding)
                  ? (state.phase === 'playing' ? 'Ваш ход!' : 'Ваш заказ!')
                  : state.players[humanIdx].name}
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
          <div className="player-stats-row" style={playerStatsRowStyle}>
            <div className="player-score-badge" style={playerStatBadgeScoreStyle}>
              <span style={playerStatLabelStyle}>Очки</span>
              <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
            </div>
            <TrickSlotsDisplay
              bid={state.bids[humanIdx] ?? null}
              tricksTaken={state.players[humanIdx].tricksTaken}
              variant="player"
              collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
              compactMode={isMobileOrTablet}
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
        </div>
      </div>
      </div>
      </div>
      <div style={centerAreaSpacerBottomStyle} aria-hidden />
        </>
      ) : (
        <>
      <div className="game-info-row" style={gameInfoTopRowStyle}>
          <div className="game-info-left-col" style={gameInfoLeftColumnStyle}>
            {!isMobileOrTablet && (state.phase === 'bidding' || state.phase === 'dark-bidding') && (
              <div className="first-move-badge first-move-badge-above-block" style={firstMoveBadgeStyle}>
                <span className="first-move-num" style={firstMoveLabelStyle}>Первый ход:</span>
                <span style={firstMoveValueStyle}>{state.players[state.trickLeaderIndex].name}</span>
              </div>
            )}
            {(state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') && (
              <div className="game-info-left-section" style={gameInfoLeftSectionStyle}>
                {state.phase === 'playing' && (
                  <div style={{ ...gameInfoBadgeStyle, ...gameInfoActiveBadgeStyle }}>
                    <span style={gameInfoLabelStyle}>Сейчас ход</span>
                    <span className="game-info-value-name" style={{ ...gameInfoValueStyle, color: '#22c55e' }}>{state.players[state.currentPlayerIndex].name}</span>
                  </div>
                )}
                {(state.phase === 'bidding' || state.phase === 'dark-bidding') && (
                  <div style={{ ...gameInfoBadgeStyle, ...gameInfoBiddingBadgeStyle }}>
                    <span style={gameInfoLabelStyle}>Заказывает</span>
                    <span className="game-info-value-name" style={{ ...gameInfoValueStyle, color: '#f59e0b' }}>
                      {state.players[state.currentPlayerIndex].name}
                      {state.phase === 'dark-bidding' && ' (вслепую)'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        <div style={gameInfoTopRowSpacerStyle} aria-hidden />
        <div style={gameInfoNorthSlotWrapper} aria-hidden />
        <div style={gameInfoNorthSlotWrapperAbsolute}>
          <OpponentSlot state={state} index={1} position="top" inline compactMode={isMobileOrTablet}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 1}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 1}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
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
        <div className="game-center-west" style={opponentSideWrapWestStyle}>
          <OpponentSlot state={state} index={2} position="left" inline compactMode={isMobileOrTablet}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 2}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 2}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
          />
        </div>
        <div className="game-center-table" style={centerStyle}>
        <div style={{ ...tableOuterStyle, ...(trumpHighlightOn ? tableOuterStyleWithHighlight : {}) }}>
          <div style={{ ...tableSurfaceStyle, ...(trumpHighlightOn ? tableSurfaceStyleWithHighlight : {}) }}>
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
        <div className="game-center-east" style={opponentSideWrapEastStyle}>
          <OpponentSlot state={state} index={3} position="right" inline compactMode={isMobileOrTablet}
            collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
            winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 3}
            currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 3}
            firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
            firstMoverBiddingHighlight={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
            onAvatarClick={setSelectedPlayerForInfo}
            onDealerBadgeClick={isMobileOrTablet ? () => setShowDealerTooltip(true) : undefined}
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
                      setState(prev => prev && playCard(prev, humanIdx, card));
                    }
                  }}
                  disabled={!!state.pendingTrickCompletion || !isHumanTurn || !validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
                />
              ))}
          </div>
        </div>
        <div className={['user-player-panel', state.currentPlayerIndex === humanIdx ? 'player-info-panel-your-turn' : '', (state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? 'first-mover-bidding-panel' : ''].filter(Boolean).join(' ') || undefined} style={{
          ...playerInfoPanelStyle,
          position: 'relative',
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
          ...(dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === humanIdx ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
          ...(getCurrentTrickLeaderIndex(state) === humanIdx ? currentTrickLeaderGlowStyle : {}),
          ...((state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx ? (() => {
            const base = state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyleUser : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : null;
            const baseShadow = base?.boxShadow ?? playerInfoPanelStyle.boxShadow;
            return { boxShadow: [baseShadow, firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') };
          })() : {}),
        }}>
          {(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx && (
            <span style={firstBidderLampExternalStyle} title="Первый заказ/ход">
              <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
            </span>
          )}
          <div style={playerInfoHeaderStyle}>
            <button
              type="button"
              onClick={() => setSelectedPlayerForInfo(0)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', lineHeight: 0 }}
              title="Информация об игроке"
              aria-label={`Информация об игроке ${state.players[humanIdx].name}`}
            >
              <PlayerAvatar name={state.players[humanIdx].name} avatarDataUrl={playerAvatarDataUrl} sizePx={isMobileOrTablet ? 34 : 38} />
            </button>
            <span style={playerNameDealerWrapStyle}>
              <span className="player-panel-name" style={playerNameStyle}>{state.players[humanIdx].name}</span>
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
            <div className="player-score-badge" style={playerStatBadgeScoreStyle}>
              <span style={playerStatLabelStyle}>Очки</span>
              <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
            </div>
            <TrickSlotsDisplay
              bid={state.bids[humanIdx] ?? null}
              tricksTaken={state.players[humanIdx].tricksTaken}
              variant="player"
              collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
              compactMode={isMobileOrTablet}
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
        </div>
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
          onKeyDown={e => { if (e.key === 'Escape') { setShowGameOverModal(false); setGameOverSnapshot(null); } }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-over-title"
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34, 211, 238, 0.35)',
              boxShadow: '0 24px 48px rgba(0,0,0,0.5), 0 0 60px rgba(34, 211, 238, 0.15)',
              maxHeight: '95vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <GameOverModal
              snapshot={gameOverSnapshot}
              gameId={gameId}
              onNewGame={() => {
                setShowGameOverModal(false);
                setGameOverSnapshot(null);
                onNewGame?.();
              }}
              onExit={() => {
                setShowGameOverModal(false);
                setGameOverSnapshot(null);
                onExit();
              }}
              onOpenTable={() => {
                setLastDealResultsSnapshot(gameOverSnapshot);
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

      {selectedPlayerForInfo !== null && state && createPortal(
        <PlayerInfoPanel
          state={state}
          playerIndex={selectedPlayerForInfo}
          playerAvatarDataUrl={selectedPlayerForInfo === 0 ? playerAvatarDataUrl : undefined}
          onClose={() => setSelectedPlayerForInfo(null)}
        />,
        document.body
      )}
      </div>

    </div>
  );
}

export default GameTable;

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

function TrickSlotsDisplay({
  bid,
  tricksTaken,
  variant,
  horizontalOnly,
  collectingCards,
  compactMode,
  eastMobileTricks,
}: {
  bid: number | null;
  tricksTaken: number;
  variant: 'opponent' | 'player';
  horizontalOnly?: boolean;
  collectingCards?: boolean;
  compactMode?: boolean;
  /** Только мобильная панель ИИ-Восток: панелька взяток +17%, подпись «Заказ N» вертикально */
  eastMobileTricks?: boolean;
}) {
  const isCompact = variant === 'opponent';
  const slotSize = isCompact ? { w: 44, h: 62 } : { w: 52, h: 76 };

  if (bid === null) {
    const nullWrap = compactMode ? { ...trickCirclesWrapStyle, border: '1px solid rgba(71, 85, 105, 0.5)', background: 'rgba(30, 41, 59, 0.8)', boxShadow: 'none' } : trickSlotsWrapStyle;
    const nullCls = [collectingCards ? 'trick-slots-collecting' : 'trick-slots-normal', eastMobileTricks ? 'trick-slots-east-mobile' : ''].filter(Boolean).join(' ');
    return (
      <div style={nullWrap} className={nullCls}>
        <span className={eastMobileTricks ? 'trick-slots-label-east-mobile' : undefined} style={trickSlotsLabelStyle}>Заказ</span>
        <span style={trickSlotsValueStyle}>—</span>
      </div>
    );
  }

  const extra = Math.max(0, tricksTaken - bid);
  const orderedSlots = bid;
  const totalFilled = tricksTaken;
  const hideCards = !!collectingCards;
  const hasFilledOrder = totalFilled >= bid;

  if (compactMode) {
    const scaleDown = variant === 'player' && bid > 6 ? Math.min(1, 6 / bid) : 1;
    const opponentScaleDown = variant === 'opponent' && bid > 5 ? Math.min(1, 5 / bid) : 1;
    const playerScale = variant === 'player' ? (1.3 * 1.1 * 1.1 * 1.15 / 1.7) : 1;
    const wrapStyle = {
      ...trickCirclesWrapStyle,
      ...(hasFilledOrder ? trickCirclesWrapSuccessStyle : trickCirclesWrapPendingStyle),
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
    const playerCircleSize = variant === 'player' ? (scaleDown < 1 ? Math.max(6, Math.round((baseCircle ?? 18) * scaleDown)) : baseCircle ?? 11) : undefined;
    const opponentCircleSize = variant === 'opponent' && opponentScaleDown < 1 ? Math.max(8, Math.round(14 * opponentScaleDown)) : undefined;
    const circleSize = variant === 'player' ? playerCircleSize : opponentCircleSize;
    const rowStyle = scaleDown < 1
      ? { ...trickCirclesRowStyle, gap: Math.max(2, Math.round(4 * scaleDown)) }
      : opponentScaleDown < 1
        ? { ...trickCirclesRowStyle, gap: Math.max(1, Math.round(4 * opponentScaleDown)) }
        : trickCirclesRowStyle;
    const wrapCls = [hideCards ? 'trick-slots-collecting' : 'trick-slots-normal', eastMobileTricks ? 'trick-slots-east-mobile' : ''].filter(Boolean).join(' ');
    return (
      <div style={wrapStyle} className={wrapCls}>
        <span
          className={eastMobileTricks ? 'trick-slots-label-east-mobile' : undefined}
          style={{
            ...trickSlotsLabelStyle,
            ...(scaleDown < 1 ? { fontSize: Math.max(8, Math.round(9 * scaleDown)) } : {}),
            ...(opponentScaleDown < 1 && !eastMobileTricks ? { fontSize: Math.max(8, Math.round(9 * opponentScaleDown)) } : {}),
          }}
        >
          Заказ {bid}
        </span>
        <div style={rowStyle}>
          {Array.from({ length: orderedSlots }, (_, i) => {
            const filled = i < Math.min(totalFilled, bid) && !hideCards;
            const circleStyle = variant === 'player'
              ? { ...trickCircleBaseStyle, width: circleSize ?? 18, height: circleSize ?? 18 }
              : { ...trickCircleBaseStyle, width: circleSize ?? 14, height: circleSize ?? 14 };
            return (
              <div
                key={`c-${i}`}
                style={{
                  ...circleStyle,
                  ...(filled ? trickCircleFilledStyle : trickCircleEmptyStyle),
                }}
                aria-hidden
              />
            );
          })}
          {extra > 0 && !hideCards && (
            <span style={{
              ...trickCirclesPlusStyle,
              ...(scaleDown < 1 ? { fontSize: Math.max(7, Math.round(10 * scaleDown)) } : {}),
              ...(opponentScaleDown < 1 ? { fontSize: Math.max(7, Math.round(10 * opponentScaleDown)) } : {}),
            }}>+{extra}</span>
          )}
        </div>
      </div>
    );
  }

  const opponentScaleDownPc = variant === 'opponent' && bid > 5 ? Math.min(1, 5 / bid) : 1;
  const effectiveSlotSize =
    variant === 'opponent' && opponentScaleDownPc < 1
      ? { w: Math.max(22, Math.round(44 * opponentScaleDownPc)), h: Math.max(36, Math.round(62 * opponentScaleDownPc)) }
      : slotSize;
  const rowStyle = {
    ...trickSlotsRowStyle,
    ...(horizontalOnly ? { flexWrap: 'nowrap' as const } : {}),
    ...(opponentScaleDownPc < 1 ? { gap: Math.max(2, Math.round(6 * opponentScaleDownPc)) } : {}),
  };
  const wrapStyle = {
    ...trickSlotsWrapStyle,
    ...(hasFilledOrder ? trickSlotsWrapSuccessStyle : trickSlotsWrapPendingStyle),
    ...(opponentScaleDownPc < 1 ? { padding: `${Math.max(2, Math.round(4 * opponentScaleDownPc))}px ${Math.max(4, Math.round(8 * opponentScaleDownPc))}px` } : {}),
  };
  return (
    <div style={wrapStyle} className={hideCards ? 'trick-slots-collecting' : 'trick-slots-normal'}>
      <span style={{
        ...trickSlotsLabelStyle,
        ...(opponentScaleDownPc < 1 ? { fontSize: Math.max(9, Math.round(10 * opponentScaleDownPc)) } : {}),
      }}>Заказ {bid}</span>
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
            <span style={{ ...trickSlotsPlusStyle, ...(opponentScaleDownPc < 1 ? { fontSize: Math.max(9, Math.round(11 * opponentScaleDownPc)) } : {}) }}>+</span>
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
  );
}

function OpponentSlot({
  state,
  index,
  position,
  inline,
  compactMode,
  collectingCards,
  winnerPanelBlink,
  currentTrickLeaderHighlight,
  firstBidderBadge,
  firstMoverBiddingHighlight,
  isMobile,
  avatarDataUrl,
  onAvatarClick,
  onDealerBadgeClick,
}: {
  state: GameState;
  index: number;
  position: 'top' | 'left' | 'right';
  inline?: boolean;
  compactMode?: boolean;
  collectingCards?: boolean;
  winnerPanelBlink?: boolean;
  currentTrickLeaderHighlight?: boolean;
  firstBidderBadge?: boolean;
  firstMoverBiddingHighlight?: boolean;
  /** Только мобильная версия: при ходе ИИ не показывать бейдж «Ходит», выделять имя зелёной неоновой рамкой */
  isMobile?: boolean;
  /** Фото игрока (Data URL), только для человеческого игрока */
  avatarDataUrl?: string | null;
  /** По клику на аватар открыть панель с информацией об игроке */
  onAvatarClick?: (playerIndex: number) => void;
  /** По тапу на компактный бейдж «Сдающий» показать подсказку (мобильная) */
  onDealerBadgeClick?: () => void;
}) {
  const p = state.players[index];
  const isActive = state.currentPlayerIndex === index;
  const isDealer = state.dealerIndex === index;
  const bid = state.bids[index];
  const debugBid = (() => {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('debugOpponentBid');
    if (v == null) return null;
    const n = parseInt(v, 10);
    return (Number.isFinite(n) && n >= 0 && n <= 9) ? n : null;
  })();
  const displayBid = debugBid !== null ? debugBid : bid;
  const mobileActiveName = isMobile && isActive;
  const avatarSizePx = compactMode ? (position === 'right' ? 32 : 32) : 38;
  const eastMobileOnlyAvatar = position === 'right' && isMobile;

  const posStyle = inline
    ? { position: 'relative' as const, top: 'auto', left: 'auto', right: 'auto', transform: 'none' }
    : position === 'top'
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' as const }
    : position === 'left'
    ? { left: 20, top: '50%', transform: 'translateY(-50%)' as const }
    : { right: 20, top: '50%', transform: 'translateY(-50%)' as const };

  const frameStyle = mobileActiveName ? undefined : (isActive ? activeTurnPanelFrameStyle : isDealer ? dealerPanelFrameStyle : undefined);
  const northSlotOverrides = position === 'top' && inline
    ? { width: 'fit-content' as const, minWidth: 'var(--game-table-opponent-slot-width, 180px)' as React.CSSProperties['minWidth'], maxWidth: 'none' as const }
    : {};
  return (
    <div
      className={[position === 'right' ? 'opponent-slot-east' : '', firstMoverBiddingHighlight ? 'first-mover-bidding-panel' : '', isActive ? 'opponent-slot-current-turn' : ''].filter(Boolean).join(' ') || undefined}
      style={{
        ...opponentSlotStyle,
        ...northSlotOverrides,
        ...posStyle,
        ...frameStyle,
        overflow: 'visible',
        ...(winnerPanelBlink ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
        ...(currentTrickLeaderHighlight ? currentTrickLeaderGlowStyle : {}),
        ...(firstMoverBiddingHighlight ? { boxShadow: [(frameStyle?.boxShadow ?? opponentSlotStyle.boxShadow), firstMoverBiddingGlowExtraShadow].filter(Boolean).join(', ') } : {}),
      }}
    >
      {isDealer && (
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
      <div className="opponent-slot-header" style={opponentHeaderStyle}>
        {onAvatarClick ? (
          <button
            type="button"
            onClick={() => onAvatarClick(index)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', lineHeight: 0 }}
            title="Информация об игроке"
            aria-label={`Информация об игроке ${p.name}`}
          >
            <PlayerAvatar name={p.name} avatarDataUrl={avatarDataUrl} sizePx={avatarSizePx} title={p.name} />
          </button>
        ) : (
          <PlayerAvatar name={p.name} avatarDataUrl={avatarDataUrl} sizePx={avatarSizePx} title={p.name} />
        )}
        <span
          className={eastMobileOnlyAvatar ? 'opponent-name-east-mobile' : undefined}
          style={{
            ...opponentNameStyle,
            ...(mobileActiveName ? nameActiveMobileStyle : {}),
            minWidth: 0,
            ...(eastMobileOnlyAvatar
              ? { overflow: 'visible', whiteSpace: 'normal' as const, wordBreak: 'break-word' as const, overflowWrap: 'break-word' as const }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
          }}
        >
          {p.name}
        </span>
        {isActive && !isMobile && <span style={opponentTurnBadgeStyle}>Ходит</span>}
      </div>
      <div style={{
        ...opponentStatsRowStyle,
        ...(position === 'top' && inline ? { flexWrap: 'nowrap' as const } : {}),
        ...(position === 'left' && inline ? { flexDirection: 'row-reverse' as const } : {}),
      }}>
        <TrickSlotsDisplay bid={displayBid} tricksTaken={p.tricksTaken} variant="opponent" horizontalOnly={position === 'top' && inline} collectingCards={collectingCards} compactMode={compactMode} eastMobileTricks={position === 'right' && !!isMobile && displayBid !== null && displayBid > 0} />
        <div className="opponent-score-badge" style={opponentStatBadgeScoreStyle}>
          <span style={opponentStatLabelStyle}>Очки</span>
          <span style={opponentStatValueStyle}>{p.score}</span>
        </div>
      </div>
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
  transform: 'translateY(calc(-1 * var(--game-table-up-offset, 129px)))',
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
  gap: 8,
  padding: '4px 14px 4px',
  borderRadius: '8px 8px 0 0',
  border: '1px solid rgba(139, 92, 246, 0.5)',
  borderBottom: '2px solid rgba(167, 139, 250, 0.9)',
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
  padding: 24,
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
  padding: '20px 24px 24px',
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
  flex: 1,
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

const firstBidderLampBulbStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#fb923c',
  boxShadow: '0 0 8px rgba(251, 146, 60, 0.8)',
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
const trickCirclesWrapSuccessStyle: React.CSSProperties = {
  border: '1px solid rgba(34, 211, 238, 0.6)',
  background: 'linear-gradient(180deg, rgba(34, 211, 238, 0.12) 0%, rgba(34, 197, 94, 0.1) 50%, rgba(30, 41, 59, 0.9) 100%)',
  boxShadow: 'inset 0 0 10px rgba(34, 211, 238, 0.2)',
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

const trickSlotsWrapSuccessStyle: React.CSSProperties = {
  border: '1px solid rgba(34, 197, 94, 0.6)',
  background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.08) 50%, rgba(30, 41, 59, 0.85) 100%)',
  boxShadow: '0 0 0 1px rgba(34, 197, 94, 0.2)',
};

const trickSlotsWrapPendingStyle: React.CSSProperties = {
  border: '1px solid rgba(239, 68, 68, 0.4)',
  boxShadow: '0 0 0 1px rgba(239, 68, 68, 0.12)',
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

/** Мобильная рука: не выходить за правый край окна, при необходимости карты слегка накладываются */
const handFrameStyleMobile: React.CSSProperties = {
  ...handFrameStyle,
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
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

export { GameTable };
