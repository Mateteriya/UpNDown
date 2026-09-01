import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Card } from '../game/types';
import { getFaceCardImageSrc, getFaceRankLabel, isFaceRank } from '../cardAssets';
import { getSuitGlyphColorOnIndicatorTrump } from './CardView';
import { t } from '../i18n';

const INTRO_MS = 2800;
const HINT_AUTO_MS = 2600;
/** Авто-сворачивание подписи «Вся колода на руках» после торгов / по тапу. */
const LABEL_AUTO_MS = 2600;
const DEALER_TOOLTIP_AUTO_MS = 2600;
/** Заливка глифа пик на индикаторе «козырь у сдающего» (только -webkit-text-fill-color). */
const TRUMP_INDICATOR_SPADES_GLYPH_FILL = 'rgb(18 17 19 / 96%)';
/** Заливка глифа бубен — только -webkit-text-fill-color. */
const TRUMP_INDICATOR_DIAMONDS_GLYPH_FILL = 'rgb(217 86 18 / 72%)';
/** Заливка глифа крестей — только -webkit-text-fill-color. */
const TRUMP_INDICATOR_CLUBS_GLYPH_FILL = 'rgb(39 30 73)';

function TrumpRankEmboss({
  children,
  className,
  color,
  fontSize,
  fontWeight = 900,
  spadesTrump = false,
  diamondsTrump = false,
  clubsTrump = false,
  heartsTrump = false,
}: {
  children: ReactNode;
  className?: string;
  color: string;
  fontSize: number;
  fontWeight?: number;
  spadesTrump?: boolean;
  diamondsTrump?: boolean;
  clubsTrump?: boolean;
  heartsTrump?: boolean;
}) {
  return (
    <span
      className={[
        'trump-dealer-held-indicator__rank-emboss',
        spadesTrump ? 'trump-dealer-held-indicator__rank-emboss--spades' : '',
        diamondsTrump ? 'trump-dealer-held-indicator__rank-emboss--diamonds' : '',
        clubsTrump ? 'trump-dealer-held-indicator__rank-emboss--clubs' : '',
        heartsTrump ? 'trump-dealer-held-indicator__rank-emboss--hearts' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--trump-rank-color': color,
          fontSize,
          fontWeight,
          lineHeight: 1,
        } as CSSProperties
      }
    >
      <span className="trump-dealer-held-indicator__rank-emboss-depth" aria-hidden>
        {children}
      </span>
      <span className="trump-dealer-held-indicator__rank-emboss-face">{children}</span>
    </span>
  );
}

type TrumpDealerHeldIndicatorProps = {
  trumpCard: Card;
  dealerName: string;
  dealNumber: number;
  compactTable?: boolean;
  trumpHighlightOn: boolean;
  /** true — торги идут; подпись остаётся развёрнутой до конца торгов. */
  isBiddingPhase: boolean;
};

export function TrumpDealerHeldIndicator({
  trumpCard,
  dealerName,
  dealNumber,
  compactTable,
  trumpHighlightOn,
  isBiddingPhase,
}: TrumpDealerHeldIndicatorProps) {
  const hintId = useId();
  const introKey = `${dealNumber}-${trumpCard.suit}-${trumpCard.rank}`;
  const [labelExpanded, setLabelExpanded] = useState(true);
  const [hintExpanded, setHintExpanded] = useState(true);
  const [dealerTooltipOpen, setDealerTooltipOpen] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  const labelTimerRef = useRef<number | null>(null);
  const dealerTooltipTimerRef = useRef<number | null>(null);
  const trumpGlyphsCollapsed = isBiddingPhase ? false : !labelExpanded;
  const trumpLabelOpen = !trumpGlyphsCollapsed;
  const suitColorVariant = isBiddingPhase
    ? 'bidding'
    : trumpGlyphsCollapsed
      ? 'chip'
      : 'bidding';
  const suitColor = getSuitGlyphColorOnIndicatorTrump(trumpCard.suit, suitColorVariant);
  const suitGlyphFill =
    trumpCard.suit === '♠'
      ? TRUMP_INDICATOR_SPADES_GLYPH_FILL
      : trumpCard.suit === '♦'
        ? TRUMP_INDICATOR_DIAMONDS_GLYPH_FILL
        : trumpCard.suit === '♣'
          ? TRUMP_INDICATOR_CLUBS_GLYPH_FILL
          : suitColor;
  const rankLabel = getFaceRankLabel(trumpCard.rank);
  const faceArtSrc = isFaceRank(trumpCard.rank)
    ? getFaceCardImageSrc(trumpCard.rank, trumpCard.suit)
    : null;

  const clearDealerTooltipTimer = () => {
    if (dealerTooltipTimerRef.current != null) {
      window.clearTimeout(dealerTooltipTimerRef.current);
      dealerTooltipTimerRef.current = null;
    }
  };

  const scheduleDealerTooltipClose = () => {
    clearDealerTooltipTimer();
    dealerTooltipTimerRef.current = window.setTimeout(() => {
      setDealerTooltipOpen(false);
      dealerTooltipTimerRef.current = null;
    }, DEALER_TOOLTIP_AUTO_MS);
  };

  const openDealerTooltip = () => {
    setDealerTooltipOpen(true);
    scheduleDealerTooltipClose();
  };

  const clearHintTimer = () => {
    if (hintTimerRef.current != null) {
      window.clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  };

  const clearLabelTimer = () => {
    if (labelTimerRef.current != null) {
      window.clearTimeout(labelTimerRef.current);
      labelTimerRef.current = null;
    }
  };

  const scheduleHintCollapse = () => {
    clearHintTimer();
    hintTimerRef.current = window.setTimeout(() => {
      setHintExpanded(false);
      setDealerTooltipOpen(false);
      clearDealerTooltipTimer();
      hintTimerRef.current = null;
    }, HINT_AUTO_MS);
  };

  const scheduleLabelCollapse = () => {
    clearLabelTimer();
    labelTimerRef.current = window.setTimeout(() => {
      setLabelExpanded(false);
      labelTimerRef.current = null;
    }, LABEL_AUTO_MS);
  };

  const openHint = () => {
    setHintExpanded(true);
    scheduleHintCollapse();
  };

  const openLabel = () => {
    setLabelExpanded(true);
    setDealerTooltipOpen(false);
    clearDealerTooltipTimer();
    scheduleLabelCollapse();
  };

  const onDeckClick = () => {
    openLabel();
    openHint();
  };

  useLayoutEffect(() => {
    if (isBiddingPhase) {
      clearLabelTimer();
      setLabelExpanded(true);
      return;
    }
    clearLabelTimer();
    setLabelExpanded(false);
  }, [isBiddingPhase]);

  useEffect(() => {
    setHintExpanded(true);
    setDealerTooltipOpen(false);
    clearDealerTooltipTimer();
    clearLabelTimer();
    if (isBiddingPhase) {
      setLabelExpanded(true);
    } else {
      setLabelExpanded(false);
    }
    const introTimer = window.setTimeout(() => {
      setHintExpanded(false);
      setDealerTooltipOpen(false);
      clearDealerTooltipTimer();
    }, INTRO_MS);
    return () => {
      window.clearTimeout(introTimer);
      clearHintTimer();
      clearLabelTimer();
      clearDealerTooltipTimer();
    };
    // Только смена кozыря; isBiddingPhase намеренно не в deps.
  }, [introKey]);

  const deckAriaLabel = trumpLabelOpen
    ? t('table.trumpDealHeld', { rank: trumpCard.rank, suit: trumpCard.suit })
    : t('table.trumpDealTap', { rank: trumpCard.rank, suit: trumpCard.suit });

  return (
    <div
      className={[
        'trump-dealer-held-indicator',
        compactTable ? 'trump-dealer-held-indicator--compact' : '',
        isBiddingPhase ? 'trump-dealer-held-indicator--bidding' : '',
        trumpHighlightOn ? 'trump-dealer-held-indicator--highlight' : '',
        hintExpanded ? 'trump-dealer-held-indicator--hint-open' : '',
        trumpLabelOpen
          ? 'trump-dealer-held-indicator--label-open'
          : 'trump-dealer-held-indicator--label-collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="trump-dealer-held-indicator__corner-stack trump-dealer-held-indicator__corner-stack--table-top">
        <div className="trump-dealer-held-indicator__deck-row">
        <div className="trump-dealer-held-indicator__deck-anchor">
          <span className="online-room-code-badge-iridescent-text trump-dealer-held-indicator__trump-caption">
            козырь
          </span>
          {hintExpanded ? (
            <div
              id={hintId}
              className="game-table-tooltip-cosmic trump-dealer-held-indicator__hint"
              role="region"
              aria-live="polite"
            >
              <p className="game-table-tooltip-cosmic-body-text trump-dealer-held-indicator__hint-line">
                Все карты колоды — на руках; козырь определён последней картой сдающего игрока.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            className={[
              'trump-dealer-held-indicator__deck',
              !trumpGlyphsCollapsed ? 'trump-dealer-held-indicator__deck--bidding' : '',
              trumpCard.suit === '♣' ? 'trump-dealer-held-indicator__deck--clubs' : '',
              trumpGlyphsCollapsed ? 'trump-dealer-held-indicator__deck--collapsed-btn' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={onDeckClick}
            aria-expanded={trumpLabelOpen}
            aria-controls={hintId}
            aria-label={deckAriaLabel}
          >
            {trumpGlyphsCollapsed ? (
              <span className="trump-dealer-held-indicator__deck-border trump-dealer-held-indicator__deck-border--outer">
                <span
                  className={[
                    'trump-dealer-held-indicator__deck-screen',
                    'trump-dealer-held-indicator__deck-screen--chip',
                    trumpCard.suit === '♣' ? 'trump-dealer-held-indicator__deck-screen--clubs' : '',
                    trumpCard.suit === '♠' ? 'trump-dealer-held-indicator__deck-screen--spades' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                      <div
                        className="trump-dealer-held-indicator__trump-face trump-dealer-held-indicator__trump-face--chip"
                        aria-hidden
                      >
                        <span
                          className={[
                            'trump-dealer-held-indicator__trump-suit',
                            'trump-dealer-held-indicator__trump-suit--chip',
                            trumpCard.suit === '♠' ? 'trump-dealer-held-indicator__trump-suit--spades' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{
                            color: suitColor,
                            WebkitTextFillColor: suitGlyphFill,
                            fontSize: compactTable ? 42 : 48,
                            lineHeight: 0.88,
                          }}
                        >
                          {trumpCard.suit}
                        </span>
                      </div>
                      <span className="online-room-code-badge-iridescent-text trump-dealer-held-indicator__trump-tag trump-dealer-held-indicator__trump-tag--chip">
                        козырь
                      </span>
                    </span>
              </span>
            ) : (
              <span className="trump-dealer-held-indicator__deck-screen">
                <div
                  className={[
                    'trump-dealer-held-indicator__trump-face',
                    isBiddingPhase ? 'trump-dealer-held-indicator__trump-face--bidding-row' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden
                >
                  <span
                    className="trump-dealer-held-indicator__trump-suit trump-dealer-held-indicator__trump-suit--open"
                    style={{
                      color: suitColor,
                      WebkitTextFillColor: suitColor,
                      fontSize: compactTable ? 60 : 68,
                      lineHeight: 0.88,
                    }}
                  >
                    {trumpCard.suit}
                  </span>
                  {isBiddingPhase ? (
                  <span
                    className={[
                      'trump-dealer-held-indicator__trump-rank-col',
                      faceArtSrc ? 'trump-dealer-held-indicator__trump-rank-col--face' : '',
                      faceArtSrc && trumpCard.rank === 'A' && trumpCard.suit === '♣'
                        ? 'trump-dealer-held-indicator__trump-rank-col--ace-clubs'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <span
                      className="trump-dealer-held-indicator__trump-rank"
                      style={{
                        color: suitColor,
                        WebkitTextFillColor: suitColor,
                        fontSize: compactTable ? 22 : 24,
                        fontWeight: 700,
                      }}
                    >
                      {rankLabel}
                    </span>
                    {faceArtSrc ? (
                      <span className="trump-dealer-held-indicator__trump-rank-art" aria-hidden>
                        <img
                          src={faceArtSrc}
                          alt=""
                          className="trump-dealer-held-indicator__trump-rank-art-img"
                          width={compactTable ? 22 : 24}
                          height={compactTable ? 22 : 24}
                          decoding="async"
                        />
                      </span>
                    ) : null}
                  </span>
                  ) : (
                  <span
                    className="trump-dealer-held-indicator__trump-rank"
                    style={{
                      color: suitColor,
                      WebkitTextFillColor: suitColor,
                      fontSize: compactTable ? 22 : 24,
                      fontWeight: 700,
                    }}
                  >
                    {rankLabel}
                  </span>
                  )}
                </div>
                <span className="trump-dealer-held-indicator__deck-label">
                  <span className="online-room-code-badge-iridescent-text trump-dealer-held-indicator__deck-label-line">
                    {t('table.wholeDeck')}
                  </span>
                  <span className="online-room-code-badge-iridescent-text trump-dealer-held-indicator__deck-label-line">
                    {t('table.onHands')}
                  </span>
                </span>
              </span>
            )}
          </button>
          {!isBiddingPhase && trumpGlyphsCollapsed ? (
            <div className="trump-dealer-held-indicator__dealer-glyph-wrap trump-dealer-held-indicator__dealer-glyph-wrap--on-chip">
              <div className="trump-dealer-held-indicator__dealer-glyph-chip-anchor">
                <span className="trump-dealer-held-indicator__deck-border trump-dealer-held-indicator__deck-border--outer trump-dealer-held-indicator__deck-border--glyph">
                  <button
                    type="button"
                    className="trump-dealer-held-indicator__dealer-glyph-btn"
                    aria-expanded={dealerTooltipOpen}
                    aria-label={`У кого козырь, ${rankLabel}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dealerTooltipOpen) {
                        setDealerTooltipOpen(false);
                        clearDealerTooltipTimer();
                      } else {
                        openDealerTooltip();
                      }
                    }}
                  >
                    <TrumpRankEmboss
                      className="trump-dealer-held-indicator__dealer-glyph-chip-rank"
                      color={suitColor}
                      fontSize={compactTable ? 20 : 22}
                      spadesTrump={trumpCard.suit === '♠'}
                      diamondsTrump={trumpCard.suit === '♦'}
                      clubsTrump={trumpCard.suit === '♣'}
                      heartsTrump={trumpCard.suit === '♥'}
                    >
                      {rankLabel}
                    </TrumpRankEmboss>
                  </button>
                </span>
                <span className="trump-dealer-held-indicator__dealer-glyph-q" aria-hidden>
                  ?
                </span>
                {dealerTooltipOpen ? (
                  <div
                    className="game-table-tooltip-cosmic trump-dealer-held-indicator__dealer-tooltip trump-dealer-held-indicator__dealer-tooltip--on-chip"
                    role="tooltip"
                  >
                    <span className="game-table-tooltip-cosmic-body-text trump-dealer-held-indicator__dealer-tooltip-text">
                      {t('table.trumpAtDealer', { name: dealerName })}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

      </div>
      </div>
    </div>
  );
}
