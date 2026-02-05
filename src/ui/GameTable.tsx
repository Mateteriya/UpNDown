/**
 * Игровой стол Up&Down
 * @see TZ.md раздел 7.3
 */

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GameState } from '../game/GameEngine';
import {
  createGame,
  startDeal,
  startNextDeal,
  getTricksInDeal,
  getDealType,
  placeBid,
  playCard,
  getValidPlays,
  isHumanPlayer,
} from '../game/GameEngine';

function getNextDealLabel(dealNumber: number): string {
  const next = dealNumber + 1;
  const cards = getTricksInDeal(next);
  const type = getDealType(next);
  const cardsStr = cards === 1 ? '1 карта' : cards < 5 ? `${cards} карты` : `${cards} карт`;
  if (type === 'no-trump') return `№${next} Бескозырка (${cardsStr})`;
  if (type === 'dark') return `№${next} Тёмная (${cardsStr})`;
  return `№${next} (${cardsStr})`;
}
import { calculateDealPoints } from '../game/scoring';
import { aiBid, aiPlay } from '../game/ai';
import { CardView } from './CardView';
import type { Card } from '../game/types';

interface GameTableProps {
  gameId: number;
  onExit: () => void;
}

const TRICK_PAUSE_MS = 2000;

const SUIT_COLORS: Record<string, string> = {
  '♠': '#22d3ee',
  '♥': '#f472b6',
  '♦': '#fbbf24',
  '♣': '#34d399',
};

const trumpHighlightBtnStyle: CSSProperties = {
  padding: '6px 12px',
  background: 'transparent',
  border: '1px solid #475569',
  borderRadius: 6,
  color: '#94a3b8',
  cursor: 'pointer',
  fontSize: 12,
};

export function GameTable({ gameId, onExit }: GameTableProps) {
  const [state, setState] = useState<GameState | null>(null);
  const [trickPauseUntil, setTrickPauseUntil] = useState(0);
  const [showLastTrickModal, setShowLastTrickModal] = useState(false);
  const [bidPanelVisible, setBidPanelVisible] = useState(false);
  const [trumpHighlightOn, setTrumpHighlightOn] = useState(true);
  const lastCompletedTrickRef = useRef<unknown>(null);

  useEffect(() => {
    let s = createGame(4, 'classical', 'Вы');
    s = startDeal(s);
    setState(s);
    setTrickPauseUntil(0);
    setShowLastTrickModal(false);
    setBidPanelVisible(false);
  }, [gameId]);

  const humanIdx = 0;
  const isHumanTurn = state?.phase === 'playing' && state.currentPlayerIndex === humanIdx;
  const isHumanBidding = (state?.phase === 'bidding' || state?.phase === 'dark-bidding') && state.currentPlayerIndex === humanIdx;

  useEffect(() => {
    if (isHumanBidding && (state?.phase === 'bidding' || state?.phase === 'dark-bidding')) {
      const t = setTimeout(() => setBidPanelVisible(true), 80);
      return () => clearTimeout(t);
    }
    setBidPanelVisible(false);
  }, [isHumanBidding, state?.phase]);

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

  useEffect(() => {
    if (!state?.lastCompletedTrick) {
      lastCompletedTrickRef.current = null;
      return;
    }
    const trick = state.lastCompletedTrick;
    if (lastCompletedTrickRef.current === trick) return;
    lastCompletedTrickRef.current = trick;
    setTrickPauseUntil(Date.now() + TRICK_PAUSE_MS);
    const t = setTimeout(() => setTrickPauseUntil(0), TRICK_PAUSE_MS);
    return () => clearTimeout(t);
  }, [state?.lastCompletedTrick]);

  const isAITurn =
    !!state &&
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
        <button onClick={onExit} style={exitBtnStyle}>← В меню</button>
        <button
          type="button"
          onClick={() => setTrumpHighlightOn(v => !v)}
          style={trumpHighlightBtnStyle}
          title={trumpHighlightOn ? 'Доп. подсветка козырей вкл' : 'Доп. подсветка козырей выкл'}
        >
          {trumpHighlightOn ? '✦ Подсветка вкл' : '○ Подсветка выкл'}
        </button>
      </header>

      {(state.phase === 'bidding' || state.phase === 'dark-bidding' || state.phase === 'playing') && (
        <div style={gameInfoTopRowStyle}>
          <div style={gameInfoLeftSectionStyle}>
            <div style={gameInfoBadgeStyle}>
              <span style={gameInfoLabelStyle}>Первый ход</span>
              <span style={gameInfoValueStyle}>{state.players[state.trickLeaderIndex].name}</span>
            </div>
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
          <div style={gameInfoNorthSlotWrapper}>
            <OpponentSlot state={state} index={1} position="top" inline />
          </div>
          <div style={gameInfoRightSectionStyle}>
            <div style={gameInfoBadgeStyle}>
              <span style={gameInfoLabelStyle}>Раздача</span>
              <span style={gameInfoValueStyle}>№{state.dealNumber}</span>
            </div>
            <div style={gameInfoBadgeStyle}>
              <span style={gameInfoLabelStyle}>Карт</span>
              <span style={gameInfoValueStyle}>
                {state.tricksInDeal} {state.tricksInDeal === 1 ? 'карта' : state.tricksInDeal < 5 ? 'карты' : 'карт'}
              </span>
            </div>
            {getDealType(state.dealNumber) === 'no-trump' && (
              <div style={{ ...gameInfoBadgeStyle, ...gameInfoSpecialBadgeStyle }}>
                <span style={gameInfoLabelStyle}>Режим</span>
                <span style={gameInfoValueStyle}>Бескозырка</span>
              </div>
            )}
            {getDealType(state.dealNumber) === 'dark' && (
              <div style={{ ...gameInfoBadgeStyle, ...gameInfoSpecialBadgeStyle }}>
                <span style={gameInfoLabelStyle}>Режим</span>
                <span style={gameInfoValueStyle}>
                  {state.phase === 'dark-bidding' ? 'Тёмная (вслепую)' : 'Тёмная'}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={centerAreaSpacerTopStyle} aria-hidden />

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
        <div style={opponentSideWrapStyle}>
          <OpponentSlot state={state} index={2} position="left" inline />
        </div>
        <div style={centerStyle}>
        <div style={tableOuterStyle}>
          <div style={tableSurfaceStyle}>
            {state.trumpCard && (
              <div style={trumpStyle}>
                <span style={{ fontSize: 12, color: 'rgba(34, 211, 238, 0.9)', textShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }}>Козырь</span>
                <CardView card={state.trumpCard} disabled compact doubleBorder={trumpHighlightOn} />
              </div>
            )}
            <div style={trickStyle}>
              {(state.currentTrick.length > 0
                ? state.currentTrick
                : state.lastCompletedTrick && Date.now() < trickPauseUntil
                  ? state.lastCompletedTrick.cards
                  : []
              ).map((card, i) => (
                <CardView
                  key={`${card.suit}-${card.rank}-${i}`}
                  card={card}
                  compact
                  doubleBorder={trumpHighlightOn}
                  isTrumpOnTable={trumpHighlightOn && state.trump !== null && card.suit === state.trump}
                />
              ))}
            </div>
            {state.lastCompletedTrick && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowLastTrickModal(true); }}
                style={lastTrickButtonStyle}
              >
                Последняя взятка
              </button>
            )}
          </div>
        </div>
        </div>
        <div style={opponentSideWrapStyle}>
          <OpponentSlot state={state} index={3} position="right" inline />
        </div>
      </div>

      <div style={centerAreaSpacerBottomStyle} aria-hidden />

      <div style={playerSpacerStyle} aria-hidden />

      <div style={playerStyle}>
        <div style={{
          ...playerInfoPanelStyle,
          ...(state.currentPlayerIndex === humanIdx ? activeTurnPanelFrameStyle : state.dealerIndex === humanIdx ? dealerPanelFrameStyle : undefined),
        }}>
          <div style={playerInfoHeaderStyle}>
            <span style={playerNameStyle}>{state.players[humanIdx].name}</span>
            {state.dealerIndex === humanIdx && (
              <span style={dealerLampStyle} title="Сдающий">
                <span style={dealerLampBulbStyle} /> Сдающий
              </span>
            )}
            {state.currentPlayerIndex === humanIdx && (
              <span style={yourTurnBadgeStyle}>Ваш ход</span>
            )}
          </div>
          <div style={playerStatsRowStyle}>
            <div style={playerStatBadgeStyle}>
              <span style={playerStatLabelStyle}>Заказ</span>
              <span style={playerStatValueStyle}>{state.bids[humanIdx] ?? '—'}</span>
            </div>
            <div style={playerStatBadgeStyle}>
              <span style={playerStatLabelStyle}>Взяток</span>
              <span style={playerStatValueStyle}>{state.players[humanIdx].tricksTaken}</span>
            </div>
            <div style={playerStatBadgeStyle}>
              <span style={playerStatLabelStyle}>Очки</span>
              <span style={playerStatValueStyle}>{state.players[humanIdx].score}</span>
            </div>
            {((getDealType(state.dealNumber) === 'normal' && state.trump) ||
              (getDealType(state.dealNumber) === 'dark' && state.phase !== 'dark-bidding' && state.trump)) && (
              <div style={playerTrumpBadgeStyle}>
                <span style={playerStatLabelStyle}>Козырь</span>
                <span style={{
                  ...playerStatValueStyle,
                  fontSize: 22,
                  color: SUIT_COLORS[state.trump!] ?? '#f8fafc',
                  textShadow: `0 0 8px ${SUIT_COLORS[state.trump!] ?? '#f8fafc'}66`,
                }}>{state.trump}</span>
              </div>
            )}
          </div>
        </div>
        <div style={handStyle}>
          {state.players[humanIdx].hand
            .slice()
            .sort((a, b) => cardSort(a, b, state.trump))
            .map((card, i) => (
              <CardView
                key={`${card.suit}-${card.rank}-${i}`}
                card={card}
                doubleBorder={trumpHighlightOn}
                onClick={() => {
                  if (isHumanTurn && validPlays.some(c => c.suit === card.suit && c.rank === card.rank)) {
                    setState(prev => prev && playCard(prev, humanIdx, card));
                  }
                }}
                disabled={!isHumanTurn || !validPlays.some(c => c.suit === card.suit && c.rank === card.rank)}
              />
            ))}
        </div>
      </div>

      {state.phase === 'deal-complete' && Date.now() >= trickPauseUntil && (
        <DealCompleteOverlay
          state={state}
          onNextDeal={() => {
            const next = state && startNextDeal(state);
            setState(next ?? state);
          }}
          onExit={onExit}
        />
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

      {isHumanBidding && bidPanelVisible && (
        <div className="bid-panel-bottom" style={bidSidePanelStyle} aria-label="Выбор заказа">
          <div style={bidSidePanelTitle}>
            {state.phase === 'dark-bidding' ? 'Заказ в тёмную' : 'Ваш заказ'}
          </div>
          <div style={bidSidePanelSubtitle}>
            {state.phase === 'dark-bidding' ? 'Вслепую, 0–9 взяток' : `0–${state.tricksInDeal} взяток`}
          </div>
          <div style={bidSidePanelGrid}>
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
  );
}

function OpponentSlot({
  state,
  index,
  position,
  inline,
}: {
  state: GameState;
  index: number;
  position: 'top' | 'left' | 'right';
  inline?: boolean;
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
  return (
    <div style={{ ...opponentSlotStyle, ...posStyle, ...frameStyle }}>
      <div style={opponentHeaderStyle}>
        <span style={opponentNameStyle}>{p.name}</span>
        {isDealer && (
          <span style={dealerLampStyle} title="Сдающий">
            <span style={dealerLampBulbStyle} /> Сдающий
          </span>
        )}
        {isActive && <span style={opponentTurnBadgeStyle}>Ходит</span>}
      </div>
      <div style={opponentStatsRowStyle}>
        <div style={opponentStatBadgeStyle}>
          <span style={opponentStatLabelStyle}>Заказ</span>
          <span style={opponentStatValueStyle}>{bid ?? '—'}</span>
        </div>
        <div style={opponentStatBadgeStyle}>
          <span style={opponentStatLabelStyle}>Взяток</span>
          <span style={opponentStatValueStyle}>{p.tricksTaken}</span>
        </div>
        <div style={opponentStatBadgeStyle}>
          <span style={opponentStatLabelStyle}>Карт</span>
          <span style={opponentStatValueStyle}>{p.hand.length}</span>
        </div>
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

function DealCompleteOverlay({
  state,
  onNextDeal,
  onExit,
}: {
  state: GameState;
  onNextDeal: () => void;
  onExit: () => void;
}) {
  const bids = state.bids as number[];
  const isPartyComplete = state.dealNumber >= 28;
  return (
    <div style={modalOverlay}>
      <div style={modalContent}>
        <h3>{isPartyComplete ? 'Партия завершена' : `Раздача ${state.dealNumber} завершена`}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {state.players.map((p, i) => {
            const pts = bids[i] !== null ? calculateDealPoints(bids[i], p.tricksTaken) : 0;
            const sign = pts >= 0 ? '+' : '';
            return (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
                <span>{p.name}</span>
                <span>Заказ: {bids[i]}, Взято: {p.tricksTaken} → {sign}{pts}</span>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 16 }}>
          Итого: {state.players.map(p => `${p.name}: ${p.score}`).join(' | ')}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!isPartyComplete && (
            <button onClick={onNextDeal} style={{ ...buttonStyle, background: '#22c55e' }}>
              Следующая раздача {getNextDealLabel(state.dealNumber)}
            </button>
          )}
          <button onClick={onExit} style={buttonStyle}>В меню</button>
        </div>
      </div>
    </div>
  );
}

function cardSort(a: Card, b: Card, trump: string | null): number {
  const suitOrder: Record<string, number> = { '♠': 0, '♥': 1, '♣': 2, '♦': 3 };
  const getSuitOrder = (s: string) => {
    const base = suitOrder[s] ?? 4;
    if (trump && s === trump) return -1;
    return base;
  };
  const rankOrder: Record<string, number> = {
    '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
    'J': 5, 'Q': 6, 'K': 7, 'A': 8,
  };
  const suitDiff = getSuitOrder(a.suit) - getSuitOrder(b.suit);
  if (suitDiff !== 0) return suitDiff;
  return rankOrder[b.rank] - rankOrder[a.rank];
}

const tableLayoutStyle: React.CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
  color: '#f8fafc',
};

const TABLE_GAP = 48;
const PLAYER_AREA_HEIGHT = 260;

const tableStyle: React.CSSProperties = {
  flex: 1,
  position: 'relative',
  padding: 20,
  paddingBottom: 0,
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 16,
  flexWrap: 'wrap',
  gap: 12,
  flexShrink: 0,
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
  height: PLAYER_AREA_HEIGHT,
  flexShrink: 0,
};

const gameInfoTopRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  alignItems: 'stretch',
  gap: 16,
  marginBottom: 12,
  flexShrink: 0,
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
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  flexShrink: 0,
  transform: 'translateY(32px)',
};

const gameInfoRightSectionStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  alignItems: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  border: '1px solid rgba(56, 189, 248, 0.5)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)',
  background: 'linear-gradient(135deg, rgba(30, 64, 175, 0.9) 0%, rgba(59, 130, 246, 0.85) 50%, rgba(34, 211, 238, 0.9) 100%)',
};

const gameInfoSpecialBadgeStyle: React.CSSProperties = {
  background: 'rgba(99, 102, 241, 0.25)',
  borderColor: 'rgba(99, 102, 241, 0.6)',
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
};

const opponentSideWrapStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 140,
  maxWidth: 180,
};

const opponentSlotStyle: React.CSSProperties = {
  position: 'absolute',
  padding: '12px 16px',
  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(71, 85, 105, 0.6)',
  minWidth: 140,
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const dealerPanelFrameStyle: React.CSSProperties = {
  border: '1px solid rgba(56, 189, 248, 0.6)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 12px rgba(56, 189, 248, 0.35)',
};

const activeTurnPanelFrameStyle: React.CSSProperties = {
  border: '1px solid rgba(251, 146, 60, 0.45)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08), 0 0 10px rgba(251, 146, 60, 0.2)',
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

const dealerLampBulbStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#38bdf8',
  boxShadow: '0 0 8px rgba(56, 189, 248, 0.8)',
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
  padding: 18,
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
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 16,
  width: 576,
  minWidth: 576,
  height: 250,
  minHeight: 250,
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

const trumpStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
};

const trickStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  flexWrap: 'wrap',
  justifyContent: 'center',
};

const lastTrickButtonStyle: React.CSSProperties = {
  padding: '8px 20px',
  marginTop: 4,
  borderRadius: 8,
  border: '1px solid rgba(34, 211, 238, 0.4)',
  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.9) 0%, rgba(15, 23, 42, 0.95) 100%)',
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
  padding: 20,
  background: 'linear-gradient(0deg, #1e293b 0%, transparent 100%)',
  zIndex: 5,
};

const playerInfoPanelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  marginBottom: 14,
  padding: '14px 20px',
  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.95) 0%, rgba(15, 23, 42, 0.98) 100%)',
  borderRadius: 12,
  border: '1px solid rgba(71, 85, 105, 0.6)',
  boxShadow: '0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
  maxWidth: 420,
  marginLeft: 'auto',
  marginRight: 'auto',
};

const playerInfoHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
};

const playerNameStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#f8fafc',
  letterSpacing: '0.3px',
};

const yourTurnBadgeStyle: React.CSSProperties = {
  padding: '4px 12px',
  borderRadius: 20,
  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.5px',
  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)',
};

const playerStatsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
};

const playerStatBadgeStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  minWidth: 56,
  padding: '6px 14px',
  background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.7) 0%, rgba(30, 41, 59, 0.8) 100%)',
  borderRadius: 8,
  border: '1px solid rgba(71, 85, 105, 0.5)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
};

const playerTrumpBadgeStyle: React.CSSProperties = {
  ...playerStatBadgeStyle,
  padding: '8px 16px',
  minWidth: 60,
};

const playerStatLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.8px',
  marginBottom: 2,
};

const playerStatValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#f8fafc',
};

const handStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: 0,
};

const bidSidePanelStyle: React.CSSProperties = {
  position: 'fixed',
  bottom: 24,
  left: 24,
  zIndex: 100,
  padding: '16px 20px',
  background: 'linear-gradient(180deg, #22d3ee 0%, #06b6d4 40%, #14b8a6 80%, #0d9488 100%)',
  border: '2px solid rgba(139, 92, 246, 0.7)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.2), 0 0 12px rgba(139, 92, 246, 0.3)',
  borderRadius: 12,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 8,
};

const bidSidePanelTitle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  color: '#4c1d95',
  letterSpacing: '0.5px',
  textShadow: '0 1px 2px rgba(255,255,255,0.3)',
};

const bidSidePanelSubtitle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
  color: '#4c1d95',
  marginBottom: 4,
  textShadow: '0 1px 2px rgba(255,255,255,0.3)',
};

const bidSidePanelGrid: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 6,
  justifyContent: 'center',
  maxWidth: 220,
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
