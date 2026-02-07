/**
 * Игровой стол Up&Down
 * @see TZ.md раздел 7.3
 */

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '../game/GameEngine';
import {
  createGame,
  startDeal,
  startNextDeal,
  getDealType,
  placeBid,
  playCard,
  completeTrick,
  getValidPlays,
  isHumanPlayer,
} from '../game/GameEngine';
import { aiBid, aiPlay } from '../game/ai';
import { getTrickWinner } from '../game/rules';
import { calculateDealPoints } from '../game/scoring';
import { CardView } from './CardView';
import type { Card } from '../game/types';

interface GameTableProps {
  gameId: number;
  onExit: () => void;
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

function getTrickCardSlotStyle(playerIdx: number): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', display: 'flex', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' };
  const offsetEdge = 'var(--trick-slot-offset-edge, 17px)';
  const offsetWestEast = 'var(--trick-slot-offset-west-east, 101px)';
  const nsOffset = 'var(--trick-slot-ns-offset-x, 28px)';
  switch (playerIdx) {
    case 0: return { ...base, bottom: offsetEdge, left: '50%', transform: `translateX(calc(-50% + ${nsOffset}))` };   // Юг — правее
    case 1: return { ...base, top: offsetEdge, left: '50%', transform: `translateX(calc(-50% - ${nsOffset}))` };      // Север — левее
    case 2: return { ...base, left: offsetWestEast, top: '50%', transform: 'translateY(-50%)' };  // Запад — ближе к центру
    case 3: return { ...base, right: offsetWestEast, top: '50%', transform: 'translateY(-50%)' }; // Восток — ближе к центру
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

/** Трансформ слота от центра (left:50% top:50%) — для анимации сбора карт к победителю */
function getTrickSlotTransform(playerIdx: number): string {
  const ns = 'var(--trick-slot-ns-offset-x, 28px)';
  switch (playerIdx) {
    case 0: return `translate(-50%, -50%) translateY(32%) translateX(${ns})`;   // Юг — правее
    case 1: return `translate(-50%, -50%) translateY(-32%) translateX(calc(-1 * ${ns}))`;  // Север — левее
    case 2: return 'translate(-50%, -50%) translateX(-30%)';  // Запад
    case 3: return 'translate(-50%, -50%) translateX(30%)';   // Восток
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
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1400px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1400px)');
    const handler = () => setMatch(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return match;
}

function GameTable({ gameId, onExit }: GameTableProps) {
  const isMobileOrTablet = useIsMobileOrTablet();
  const [state, setState] = useState<GameState | null>(null);
  const [trickPauseUntil, setTrickPauseUntil] = useState(0);
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [bidPanelVisible, setBidPanelVisible] = useState(false);
  const [trumpHighlightOn, setTrumpHighlightOn] = useState(true);
  const [lastTrickCollectingPhase, setLastTrickCollectingPhase] = useState<'idle' | 'slots' | 'winner' | 'collapsing' | 'button'>('idle');
  const [showDealResultsButton, setShowDealResultsButton] = useState(false);
  const [dealResultsExpanded, setDealResultsExpanded] = useState(false);
  const [lastDealResultsSnapshot, setLastDealResultsSnapshot] = useState<GameState | null>(null);
  const lastCompletedTrickRef = useRef<unknown>(null);

  useEffect(() => {
    let s = createGame(4, 'classical', 'Вы');
    s = startDeal(s);
    setState(s);
    setTrickPauseUntil(0);
    setShowLastTrickModal(false);
    setBidPanelVisible(false);
    setShowDealResultsButton(false);
    setDealResultsExpanded(false);
    setLastDealResultsSnapshot(null);
  }, [gameId]);

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
    if (lastCompletedTrickRef.current !== trick) {
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
    let viewDelay: ReturnType<typeof setTimeout> | undefined;
    let winnerDelay: ReturnType<typeof setTimeout> | undefined;
    let collapseDelay: ReturnType<typeof setTimeout> | undefined;
    if (isLastTrickOfDeal) {
      setLastTrickCollectingPhase('slots');
      viewDelay = window.setTimeout(() => {
        setLastTrickCollectingPhase('winner');
        winnerDelay = window.setTimeout(() => {
          setLastTrickCollectingPhase('collapsing');
          collapseDelay = window.setTimeout(() => {
            setLastTrickCollectingPhase('button');
            setShowDealResultsButton(true);
            setLastDealResultsSnapshot(state);
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
    <div style={tableLayoutStyle}>
      <div style={tableStyle}>
      <header style={headerStyle}>
        <div style={headerLeftWrapStyle}>
          <button onClick={onExit} style={exitBtnStyle}>← В меню</button>
          <div style={firstMoveBadgeStyle}>
            <span style={firstMoveLabelStyle}>Первый ход</span>
            <span style={firstMoveValueStyle}>{state.players[state.trickLeaderIndex].name}</span>
          </div>
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
            <div style={dealNumberBadgeStyle}>
              <span style={dealNumberLabelStyle}>Раздача</span>
              <span style={dealNumberValueStyle}>№{state.dealNumber}</span>
            </div>
            <button
            type="button"
            onClick={() => setTrumpHighlightOn(v => !v)}
          style={{
            ...trumpHighlightBtnStyle,
            ...(trumpHighlightOn
              ? {
                  borderColor: 'rgba(34, 211, 238, 0.9)',
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
          <div style={gameInfoCardsPanelStyle}>
            <span style={{ ...gameInfoLabelStyle, marginBottom: 0, fontSize: 10, lineHeight: 1 }}>Карт</span>
            <span style={{ ...gameInfoValueStyle, fontSize: 13, lineHeight: 1 }}>
              {state.tricksInDeal} {state.tricksInDeal === 1 ? 'карта' : state.tricksInDeal < 5 ? 'карты' : 'карт'}
            </span>
          </div>
          {isMobileOrTablet && (getDealType(state.dealNumber) === 'no-trump' || getDealType(state.dealNumber) === 'dark') && (
            <div style={{ ...gameInfoModePanelStyle, marginTop: 6 }}>
              <span style={gameInfoLabelStyle}>Режим</span>
              <span style={gameInfoValueStyle}>
                {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : state.phase === 'dark-bidding' ? 'Тёмная (вслепую)' : 'Тёмная'}
              </span>
            </div>
          )}
        </div>
      </header>

      <div style={gameTableBlockStyle}>
      <div style={gameInfoTopRowStyle}>
          <div style={gameInfoLeftColumnStyle}>
            {(state.phase === 'playing' || state.phase === 'bidding' || state.phase === 'dark-bidding') && (
              <div style={gameInfoLeftSectionStyle}>
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
            {(getDealType(state.dealNumber) === 'no-trump' || getDealType(state.dealNumber) === 'dark') && !isMobileOrTablet && (
              <div style={gameInfoModePanelStyle}>
                <span style={gameInfoLabelStyle}>Режим</span>
                <span style={gameInfoValueStyle}>
                  {getDealType(state.dealNumber) === 'no-trump' ? 'Бескозырка' : state.phase === 'dark-bidding' ? 'Тёмная (вслепую)' : 'Тёмная'}
                </span>
              </div>
            )}
          </div>
        <div style={gameInfoTopRowSpacerStyle} aria-hidden />
        <div style={gameInfoNorthSlotWrapper} aria-hidden />
        <div style={gameInfoNorthSlotWrapperAbsolute}>
          <OpponentSlot
          state={state}
          index={1}
          position="top"
          inline
          compactMode={isMobileOrTablet}
          collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
          winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 1}
          currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 1}
          firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 1}
        />
        </div>
        <div style={gameInfoTopRowSpacerStyle} aria-hidden />
        </div>

      <div className="game-center-spacer-top" style={centerAreaSpacerTopStyle} aria-hidden />

      <div
        style={{
          ...centerAreaStyle,
          ...(isAITurn ? { cursor: 'pointer' } : {}),
        }}
        onClick={isAITurn ? accelerateAI : undefined}
        onKeyDown={e => { if (isAITurn && e.key === ' ') { e.preventDefault(); accelerateAI(); } }}
        role={isAITurn ? 'button' : undefined}
        tabIndex={isAITurn ? 0 : undefined}
        title={isAITurn ? 'Нажмите, чтобы ускорить ход ИИ' : undefined}
      >
        <div style={opponentSideWrapWestStyle}>
          <OpponentSlot
          state={state}
          index={2}
          position="left"
          inline
          compactMode={isMobileOrTablet}
          collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
          winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 2}
          currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 2}
          firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 2}
        />
        </div>
        <div style={centerStyle}>
        <div style={tableOuterStyle}>
          <div style={tableSurfaceStyle}>
            {state.trumpCard && (
              <DeckWithTrump
                tricksInDeal={state.tricksInDeal}
                trumpCard={state.trumpCard}
                trumpHighlightOn={trumpHighlightOn}
                dealerIndex={state.dealerIndex}
                compactTable={isMobileOrTablet}
              />
            )}
            <div style={trickStyle}>
              {state.currentTrick.length > 0 ? (
                state.currentTrick.map((card, i) => {
                  const leader = state.trickLeaderIndex;
                  const playerIdx = getTrickPlayerIndex(leader, i);
                  const slotStyle = getTrickCardSlotStyle(playerIdx);
                  return (
                    <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                      <CardView
                        card={card}
                        compact
                        scale={isMobileOrTablet ? 0.98 : 1.18}
                        contentScale={isMobileOrTablet ? 1.8 : undefined}
                        doubleBorder={trumpHighlightOn}
                        isTrumpOnTable={trumpHighlightOn && state.trump !== null && card.suit === state.trump}
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
                          transform: collectToWinner ? getTrickSlotTransform(winnerIdx) : getTrickSlotTransform(playerIdx),
                          transition: collectToWinner ? `transform ${CARD_COLLECT_MS}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` : 'none',
                        }}
                      >
                        {showCardBack ? (
                          <div style={{ ...cardBackStyle, width: cardW, height: cardH }} aria-hidden />
                        ) : (
                          <CardView
                            card={card}
                            compact
                            scale={cardScale}
                            contentScale={isMobileOrTablet ? 1.5 : undefined}
                            doubleBorder={trumpHighlightOn}
                            isTrumpOnTable={trumpHighlightOn && state.trump !== null && card.suit === state.trump}
                          />
                        )}
                      </div>
                    );
                  })
                ) : (
                  state.lastCompletedTrick.cards.map((card, i) => {
                    const leader = state.lastCompletedTrick!.leaderIndex;
                    const playerIdx = getTrickPlayerIndex(leader, i);
                    const slotStyle = getTrickCardSlotStyle(playerIdx);
                    return (
                      <div key={`${card.suit}-${card.rank}-${i}`} style={slotStyle}>
                        <CardView
                          card={card}
                          compact
                          scale={isMobileOrTablet ? 0.98 : 1.18}
                          contentScale={isMobileOrTablet ? 1.5 : undefined}
                          doubleBorder={trumpHighlightOn}
                          isTrumpOnTable={trumpHighlightOn && state.trump !== null && card.suit === state.trump}
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
          </div>
        </div>
        </div>
        <div style={opponentSideWrapEastStyle}>
          <OpponentSlot
          state={state}
          index={3}
          position="right"
          inline
          compactMode={isMobileOrTablet}
          collectingCards={dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing')}
          winnerPanelBlink={dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === 3}
          currentTrickLeaderHighlight={getCurrentTrickLeaderIndex(state) === 3}
          firstBidderBadge={(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === 3}
        />
        </div>
        {dealJustCompleted && (lastTrickCollectingPhase === 'slots' || lastTrickCollectingPhase === 'winner' || lastTrickCollectingPhase === 'collapsing') && (
          <DealResultsScreen state={state} isCollapsing={lastTrickCollectingPhase === 'collapsing'} />
        )}
      </div>

      <div style={centerAreaSpacerBottomStyle} aria-hidden />
      </div>

      <div style={playerSpacerStyle} aria-hidden />

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
                  isTrumpOnTable={trumpHighlightOn && state.trump !== null && card.suit === state.trump}
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
        <div style={{
          ...playerInfoPanelStyle,
          position: 'relative',
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyle : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
          ...(dealJustCompleted && lastTrickCollectingPhase === 'winner' && state.lastCompletedTrick?.winnerIndex === humanIdx ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
          ...(getCurrentTrickLeaderIndex(state) === humanIdx ? currentTrickLeaderGlowStyle : {}),
        }}>
          {(state.phase === 'bidding' || state.phase === 'dark-bidding') && state.bids.some(b => b === null) && state.trickLeaderIndex === humanIdx && (
            <span style={firstBidderLampExternalStyle} title="Первый заказ/ход">
              <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
            </span>
          )}
          <div style={playerInfoHeaderStyle}>
            <span style={playerNameDealerWrapStyle}>
              <span style={playerNameStyle}>{state.players[humanIdx].name}</span>
              {state.dealerIndex === humanIdx && (
                <span style={dealerLampStyle} title="Сдающий">
                  <span style={dealerLampBulbStyle} /> Сдающий
                </span>
              )}
            </span>
            {state.currentPlayerIndex === humanIdx && (
              <span style={yourTurnBadgeStyle}>
                {(state.phase === 'bidding' || state.phase === 'dark-bidding') ? 'Ваш заказ' : 'Ваш ход'}
              </span>
            )}
          </div>
          <div style={playerStatsRowStyle}>
            <div style={playerStatBadgeScoreStyle}>
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
                          ...bidSidePanelButton,
                          ...(disabled ? bidSidePanelButtonDisabled : {}),
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

      {dealResultsExpanded && lastDealResultsSnapshot && createPortal(
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
          onClick={() => setDealResultsExpanded(false)}
          onKeyDown={e => { if (e.key === 'Escape') setDealResultsExpanded(false); }}
          role="button"
          tabIndex={0}
          aria-label="Закрыть"
        >
          <div
            style={{
              position: 'relative',
              width: 'min(96vw, 800px)',
              minWidth: 500,
              maxHeight: '98vh',
              overflow: 'visible',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ transform: 'scale(1.35)', transformOrigin: 'center center', flexShrink: 0 }}>
              <DealResultsScreen state={lastDealResultsSnapshot} variant="modal" />
            </div>
            <button
              type="button"
              onClick={() => setDealResultsExpanded(false)}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 32,
                height: 32,
                borderRadius: '50%',
                border: '1px solid rgba(34, 211, 238, 0.5)',
                background: 'rgba(15, 23, 42, 0.9)',
                color: '#22d3ee',
                cursor: 'pointer',
                fontSize: 18,
              }}
            >
              ×
            </button>
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
          onClose={() => setShowLastTrickModal(false)}
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

function DealResultsScreen({ state, isCollapsing = false, variant = 'overlay' }: { state: GameState; isCollapsing?: boolean; variant?: 'overlay' | 'modal' }) {
  const bids = state.bids as number[];
  const players = state.players;
  const baseStyle = variant === 'modal' ? dealResultsModalStyle : dealResultsOverlayStyle;
  const scores = players.map(p => p.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore;
  const humanIdx = 0;
  const sorted = [...players].map((p, i) => ({ ...p, idx: i })).sort((a, b) => b.score - a.score);
  const renderPanel = (idx: number) => {
    const bid = bids[idx] ?? 0;
    const taken = players[idx].tricksTaken;
    const points = calculateDealPoints(bid, taken);
    const score = players[idx].score;
    const side = PLAYER_POSITIONS.find(p => p.idx === idx)!.side;
    const panelPos = variant === 'modal' ? undefined : getDealResultsPanelPosition(side);
    return (
      <div key={idx} style={{ ...dealResultsPanelStyle, ...(panelPos ?? {}) }}>
        <div style={dealResultsPanelTitleStyle}>{players[idx].name}</div>
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
          <span style={{
            ...dealResultsValueStyle,
            ...(variant === 'modal' && score === maxScore && range > 0 ? dealResultsValueLeaderStyle : {}),
          }}>{score}</span>
        </div>
      </div>
    );
  };

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
        <div style={dealResultsModalFlexStyle}>
          <div style={dealResultsModalRow1Style}>{renderPanel(0)}</div>
          <div style={dealResultsModalRow2Style}>
            {[1, 2, 3].map(i => renderPanel(i))}
          </div>
          <div style={dealResultsModalRow3Style}>
            <div style={dealResultsChartWrapStyle}>
              <div style={dealResultsChartTitleStyle}>Общий счёт • Раздача №{state.dealNumber}</div>
              <div style={dealResultsChartBarsStyle}>
                {sorted.map((p, rank) => {
                  const barPct = (range === 0 || range < 0) ? 100 : ((p.score - minScore) / range) * 100;
                  const isLeader = p.score === maxScore && maxScore > minScore;
                  const isHuman = p.idx === humanIdx;
                  return (
                    <div key={p.idx} style={dealResultsChartRowStyle}>
                      <span style={{
                        ...dealResultsChartNameStyle,
                        ...(isHuman ? { color: '#22d3ee', fontWeight: 700 } : {}),
                      }}>
                        <span style={dealResultsChartRankStyle}>{rank + 1}.</span>
                        {p.name}
                      </span>
                      <span style={{
                        ...dealResultsChartScoreStyle,
                        ...(isLeader ? { color: '#22d3ee', fontWeight: 800 } : {}),
                      }}>
                        {p.score >= 0 ? '+' : ''}{p.score}
                      </span>
                      <div style={dealResultsChartBarBgStyle}>
                        <div
                          style={{
                            ...dealResultsChartBarFillStyle,
                            width: `${barPct}%`,
                            ...(isLeader ? dealResultsChartBarLeaderStyle : {}),
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
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
          <div key={idx} className={sideClass} style={{ ...dealResultsPanelStyle, ...panelPos }}>
            <div style={dealResultsPanelTitleStyle}>{players[idx].name}</div>
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
}: {
  bid: number | null;
  tricksTaken: number;
  variant: 'opponent' | 'player';
  horizontalOnly?: boolean;
  collectingCards?: boolean;
  compactMode?: boolean;
}) {
  const isCompact = variant === 'opponent';
  const slotSize = isCompact ? { w: 44, h: 62 } : { w: 52, h: 76 };

  if (bid === null) {
    const nullWrap = compactMode ? { ...trickCirclesWrapStyle, border: '1px solid rgba(71, 85, 105, 0.5)', background: 'rgba(30, 41, 59, 0.8)', boxShadow: 'none' } : trickSlotsWrapStyle;
    return (
      <div style={nullWrap} className={collectingCards ? 'trick-slots-collecting' : 'trick-slots-normal'}>
        <span style={trickSlotsLabelStyle}>Заказ</span>
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
    const wrapStyle = {
      ...trickCirclesWrapStyle,
      ...(hasFilledOrder ? trickCirclesWrapSuccessStyle : trickCirclesWrapPendingStyle),
      ...(variant === 'player' ? {
        position: 'absolute' as const,
        right: 14,
        top: '50%',
        padding: '2px 6px',
        transform: 'translateY(-50%) scale(1.7)',
        transformOrigin: 'right center',
      } : {}),
    };
    return (
      <div style={wrapStyle} className={hideCards ? 'trick-slots-collecting' : 'trick-slots-normal'}>
        <span style={trickSlotsLabelStyle}>Заказ {bid}</span>
        <div style={trickCirclesRowStyle}>
          {Array.from({ length: orderedSlots }, (_, i) => {
            const filled = i < Math.min(totalFilled, bid) && !hideCards;
            const circleStyle = variant === 'player' ? { ...trickCircleBaseStyle, width: 18, height: 18 } : trickCircleBaseStyle;
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
            <span style={trickCirclesPlusStyle}>+{extra}</span>
          )}
        </div>
      </div>
    );
  }

  const rowStyle = { ...trickSlotsRowStyle, ...(horizontalOnly ? { flexWrap: 'nowrap' as const } : {}) };
  const wrapStyle = { ...trickSlotsWrapStyle, ...(hasFilledOrder ? trickSlotsWrapSuccessStyle : trickSlotsWrapPendingStyle) };
  return (
    <div style={wrapStyle} className={hideCards ? 'trick-slots-collecting' : 'trick-slots-normal'}>
      <span style={trickSlotsLabelStyle}>Заказ {bid}</span>
      <div style={rowStyle}>
        {Array.from({ length: orderedSlots }, (_, i) => {
          const filled = i < totalFilled;
          const useCardBack = filled && !hideCards;
          return (
            <div
              key={`o-${i}`}
              style={{
                ...trickSlotBaseStyle,
                width: slotSize.w,
                height: slotSize.h,
                ...(useCardBack ? { ...cardBackStyle, width: slotSize.w, height: slotSize.h } : (filled && !hideCards) ? trickSlotFilledStyle : trickSlotEmptyStyle),
              }}
            />
          );
        })}
        {extra > 0 && (
          <>
            <span style={trickSlotsPlusStyle}>+</span>
            {Array.from({ length: extra }, (_, i) => (
              <div
                key={`e-${i}`}
                style={{
                  ...trickSlotBaseStyle,
                  width: slotSize.w,
                  height: slotSize.h,
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
}) {
  const p = state.players[index];
  const isActive = state.currentPlayerIndex === index;
  const isDealer = state.dealerIndex === index;
  const bid = state.bids[index];

  const posStyle = inline
    ? { position: 'relative' as const, top: 'auto', left: 'auto', right: 'auto', transform: 'none' }
    : position === 'top'
    ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' as const }
    : position === 'left'
    ? { left: 20, top: '50%', transform: 'translateY(-50%)' as const }
    : { right: 20, top: '50%', transform: 'translateY(-50%)' as const };

  const frameStyle = isActive ? activeTurnPanelFrameStyle : isDealer ? dealerPanelFrameStyle : undefined;
  const northSlotOverrides = position === 'top' && inline
    ? { width: 'fit-content' as const, minWidth: 'var(--game-table-opponent-slot-width, 180px)' as React.CSSProperties['minWidth'], maxWidth: 'none' as const }
    : {};
  return (
    <div
      style={{
        ...opponentSlotStyle,
        ...northSlotOverrides,
        ...posStyle,
        ...frameStyle,
        overflow: 'visible',
        ...(winnerPanelBlink ? { animation: 'winnerPanelBlink 0.5s ease-in-out 2' } : {}),
        ...(currentTrickLeaderHighlight ? currentTrickLeaderGlowStyle : {}),
      }}
    >
      {isDealer && (
        <span style={dealerLampExternalStyle} title="Сдающий">
          <span style={dealerLampBulbStyle} /> Сдающий
        </span>
      )}
      {firstBidderBadge && (
        <span style={firstBidderLampExternalStyle} title="Первый заказ/ход">
          <span style={firstBidderLampBulbStyle} /> Первый заказ/ход
        </span>
      )}
      <div style={opponentHeaderStyle}>
        <span style={opponentNameStyle}>{p.name}</span>
        {isActive && <span style={opponentTurnBadgeStyle}>Ходит</span>}
      </div>
      <div style={{
        ...opponentStatsRowStyle,
        ...(position === 'top' && inline ? { flexWrap: 'nowrap' as const } : {}),
        ...(position === 'left' && inline ? { flexDirection: 'row-reverse' as const } : {}),
      }}>
        <TrickSlotsDisplay bid={bid} tricksTaken={p.tricksTaken} variant="opponent" horizontalOnly={position === 'top' && inline} collectingCards={collectingCards} compactMode={compactMode} />
        <div style={opponentStatBadgeScoreStyle}>
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
}: {
  tricksInDeal: number;
  trumpCard: Card;
  trumpHighlightOn: boolean;
  dealerIndex: number;
  compactTable?: boolean;
}) {
  const cardsDealt = tricksInDeal * 4;
  const cardsUnderTrump = Math.max(0, 36 - cardsDealt - 1);
  const numLayers = cardsUnderTrump === 0 ? 1 : Math.min(5, 2 + Math.floor(cardsUnderTrump / 8));

  const cornerStyle: React.CSSProperties = (() => {
    const base = 20;
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
    <div style={{ ...deckStackWrapStyle, width: Math.round(64 * deckScale), height: Math.round(96 * deckScale), ...cornerStyle }}>
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
        <CardView card={trumpCard} disabled compact scale={deckScale} contentScale={compactTable ? 1.5 : undefined} doubleBorder={trumpHighlightOn} trumpOnDeck trumpDeckHighlightOn={trumpHighlightOn} />
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
  onClose,
}: {
  trick: { cards: Card[]; winnerIndex: number };
  players: GameState['players'];
  trump: string | null;
  trumpHighlightOn: boolean;
  doubleBorder: boolean;
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
              doubleBorder={doubleBorder}
              isTrumpOnTable={trumpHighlightOn && trump !== null && card.suit === trump}
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
  gap: 12,
};

const firstMoveBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  padding: '6px 14px',
  borderRadius: 8,
  border: '1px solid rgba(139, 92, 246, 0.5)',
  background: 'linear-gradient(135deg, rgba(88, 28, 135, 0.85) 0%, rgba(67, 56, 202, 0.8) 100%)',
  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
};

const firstMoveLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const firstMoveValueStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#f8fafc',
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
  padding: '12px 18px',
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
  padding: '8px 16px',
  background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.7) 0%, rgba(30, 41, 59, 0.8) 100%)',
  borderRadius: 10,
  border: '1px solid rgba(71, 85, 105, 0.5)',
  minWidth: 100,
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
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.6px',
  marginBottom: 4,
};

const gameInfoValueStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#f8fafc',
};

const exitBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#334155',
  border: '1px solid #475569',
  borderRadius: 8,
  color: '#f8fafc',
  cursor: 'pointer',
  fontSize: 14,
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
  overflow: 'hidden',
};

const MODAL_GAP = 8;
const MODAL_ROW_GAP = 22;
const dealResultsModalFlexStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  minHeight: 0,
  padding: `${MODAL_GAP}px 16px`,
  gap: MODAL_ROW_GAP,
  boxSizing: 'border-box',
  overflow: 'hidden',
};

const dealResultsModalRow1Style: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  flexShrink: 0,
};

const dealResultsModalRow2Style: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-around',
  alignItems: 'center',
  flexShrink: 0,
  gap: 20,
};

const dealResultsModalRow3Style: React.CSSProperties = {
  flex: '0 1 auto',
  minHeight: 0,
  display: 'flex',
  justifyContent: 'center',
  overflow: 'hidden',
};

const dealResultsChartWrapStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 360,
  height: 'auto',
  padding: '12px 14px',
  background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(3, 7, 18, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(34, 211, 238, 0.4)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 0 12px rgba(34, 211, 238, 0.15)',
};

const dealResultsChartTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: '#22d3ee',
  marginBottom: 10,
  textAlign: 'center',
  letterSpacing: '0.5px',
  textTransform: 'uppercase',
};

const dealResultsChartBarsStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const dealResultsChartRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 8,
};

const dealResultsChartNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#94a3b8',
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const dealResultsChartRankStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  minWidth: 14,
};

const dealResultsChartScoreStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#f8fafc',
  minWidth: 36,
  textAlign: 'right',
};

const dealResultsChartBarBgStyle: React.CSSProperties = {
  gridColumn: '1 / -1',
  height: 8,
  borderRadius: 4,
  background: 'rgba(15, 23, 42, 0.9)',
  overflow: 'hidden',
  border: '1px solid rgba(34, 211, 238, 0.25)',
};

const dealResultsChartBarFillStyle: React.CSSProperties = {
  height: '100%',
  borderRadius: 3,
  background: 'linear-gradient(90deg, rgba(34, 211, 238, 0.5) 0%, rgba(34, 211, 238, 0.8) 100%)',
  transition: 'width 0.5s ease-out',
};

const dealResultsChartBarLeaderStyle: React.CSSProperties = {
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

const dealResultsPanelTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#22d3ee',
  marginBottom: 8,
  textAlign: 'center',
  letterSpacing: '0.5px',
};

const dealResultsRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  fontSize: 11,
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

const opponentHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
  flexWrap: 'wrap',
};

const opponentNameStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: '#f8fafc',
  letterSpacing: '0.2px',
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

const bidSidePanelButtonDisabled: React.CSSProperties = {
  background: 'rgba(88, 28, 40, 0.5)',
  border: '1px solid rgba(88, 28, 40, 0.6)',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'not-allowed',
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
