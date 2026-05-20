/**
 * Лаборатория тёмного листа и тем карт (мобильный вид CardView).
 * Маршрут: /demo/cards-dark (sessionStorage updown-devMode=1).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card, Rank, Suit } from '../game/types';
import { RANKS, SUITS } from '../game/deck';
import type { CardTheme } from '../lib/cardPaletteLock';
import { LEGACY_THEME_SUIT_CAPTION, NEO_THEME_SUIT_CAPTION } from '../lib/cardThemeSpec';
import { CardView } from './CardView';

const LAB_CLUBS_TRUMP_RANK: Rank = '10';
const LAB_SPADES_TRUMP_RANK: Rank = '10';
const LAB_HEARTS_TRUMP_RANK: Rank = '10';
const LAB_LEGACY_TRUMP_RANK: Rank = '10';

const ALL_CLUB_CARDS: Card[] = RANKS.map((rank) => ({ suit: '♣', rank }));
const ALL_SPADE_CARDS: Card[] = RANKS.map((rank) => ({ suit: '♠', rank }));
const ALL_HEART_CARDS: Card[] = RANKS.map((rank) => ({ suit: '♥', rank }));
const ALL_DIAMOND_CARDS: Card[] = RANKS.map((rank) => ({ suit: '♦', rank }));

const HAND_BY_SUIT: Card[] = [
  { suit: '♠', rank: '10' },
  { suit: '♥', rank: 'K' },
  { suit: '♦', rank: '8' },
  { suit: '♣', rank: 'A' },
];

const themePanelBase: CSSProperties = {
  marginBottom: 36,
  padding: '22px 24px 28px',
  borderRadius: 14,
  background: 'linear-gradient(165deg, rgba(30, 41, 59, 0.92) 0%, rgba(15, 23, 42, 0.96) 100%)',
};

const legacyPanelStyle: CSSProperties = {
  ...themePanelBase,
  border: '2px solid rgba(251, 146, 60, 0.45)',
  boxShadow: '0 0 32px rgba(234, 88, 12, 0.08)',
};

const neoPanelStyle: CSSProperties = {
  ...themePanelBase,
  border: '2px solid rgba(34, 211, 238, 0.45)',
  boxShadow: '0 0 32px rgba(34, 211, 238, 0.12)',
};

const suitBlockStyle: CSSProperties = {
  marginTop: 28,
  paddingTop: 20,
  borderTop: '1px solid rgba(71, 85, 105, 0.45)',
};

const suitTitleStyle: CSSProperties = {
  margin: '0 0 6px',
  fontSize: 15,
  fontWeight: 700,
  color: '#f1f5f9',
};

const suitCaptionStyle: CSSProperties = {
  margin: '0 0 14px',
  fontSize: 12,
  color: '#94a3b8',
  lineHeight: 1.45,
  maxWidth: 640,
};

const deckGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'flex-start',
};

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '24px 28px 48px',
  boxSizing: 'border-box',
  maxWidth: 1120,
  margin: '0 auto',
};

const sectionStyle: CSSProperties = {
  marginBottom: 36,
  padding: '18px 20px',
  borderRadius: 12,
  border: '1px solid rgba(71, 85, 105, 0.55)',
  background: 'rgba(30, 41, 59, 0.45)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 14,
  alignItems: 'flex-end',
};

const clubsLabCompareRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 20,
  alignItems: 'flex-start',
  justifyContent: 'center',
};

const clubsLabColumnStyle: CSSProperties = {
  flex: '1 1 300px',
  maxWidth: 440,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 10,
};

const clubsLabGridStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  justifyContent: 'center',
};

const sectionH2: CSSProperties = {
  fontSize: 16,
  color: '#94a3b8',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

interface CardDarkLabPageProps {
  onBack: () => void;
}

function ThemeSuitRow({
  themeId,
  suit,
  highlightOn,
  trumpRank,
  captions,
}: {
  themeId: CardTheme;
  suit: Suit;
  highlightOn: boolean;
  trumpRank: Rank;
  captions: Record<Suit, string>;
}) {
  const cards: Card[] = RANKS.map((rank) => ({ suit, rank }));

  return (
    <div style={suitBlockStyle}>
      <h3 style={suitTitleStyle}>{suit} — 9 карт</h3>
      <p style={suitCaptionStyle}>{captions[suit]}</p>
      <div style={deckGridStyle}>
        {cards.map((card) => {
          const isTrump = highlightOn && card.rank === trumpRank;
          return (
            <CardView
              key={`${themeId}-${suit}-${card.rank}`}
              card={card}
              compact
              scale={0.66}
              contentScale={1.35}
              showDesktopFaceIndices
              tableCardMobile
              pcCardStyles={false}
              doubleBorder={highlightOn}
              isTrumpOnTable={isTrump}
              trumpHighlightOn={highlightOn}
              labCardTheme={themeId}
            />
          );
        })}
      </div>
    </div>
  );
}

export function CardDarkLabPage({ onBack }: CardDarkLabPageProps) {
  const [highlightOn, setHighlightOn] = useState(true);

  return (
    <div style={pageStyle}>
      <header style={{ marginBottom: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 14px',
            fontSize: 14,
            borderRadius: 8,
            border: '1px solid #475569',
            background: '#334155',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          ← Демо карт
        </button>
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Лаборатория: темы и проработки карт</h1>
      </header>

      <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.55, marginBottom: 24 }}>
        Две панели колод — <strong style={{ color: '#fb923c' }}>Легаси</strong> и{' '}
        <strong style={{ color: '#22d3ee' }}>Нео</strong> (как при удержании лампы в игре). Янтарный градиент у бубен
        не удалён — он в <strong style={{ color: '#22d3ee' }}>Нео</strong>. Ниже — проработки по мастям (II vs III).{' '}
        <code>cardThemeSpec.ts</code>
      </p>

      <section style={{ ...sectionStyle, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
          <span style={{ fontWeight: 600, color: '#cbd5e1' }}>Доп. подсветка (как в игре)</span>
          <button
            type="button"
            onClick={() => setHighlightOn((v) => !v)}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid rgba(34, 211, 238, 0.5)',
              background: highlightOn ? 'rgba(34, 211, 238, 0.15)' : '#334155',
              color: highlightOn ? '#22d3ee' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {highlightOn ? 'Подсветка вкл' : 'Подсветка выкл'}
          </button>
        </div>
      </section>

      {/* ——— Панель ЛЕГАСИ (36 карт) ——— */}
      <section style={legacyPanelStyle}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: '#fb923c',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Легаси
        </h2>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5, maxWidth: 720 }}>
          <code>labCardTheme=&quot;legacy&quot;</code> — лист III: ♦ жёлтый, ♥ розовый, ♣ фиолет, ♠ серебро + чёрные глифы.
        </p>
        {SUITS.map((suit) => (
          <ThemeSuitRow
            key={`legacy-${suit}`}
            themeId="legacy"
            suit={suit}
            highlightOn={highlightOn}
            trumpRank={LAB_LEGACY_TRUMP_RANK}
            captions={LEGACY_THEME_SUIT_CAPTION}
          />
        ))}
      </section>

      <section style={neoPanelStyle}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: '#22d3ee',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          Нео
        </h2>
        <p style={{ color: '#cbd5e1', fontSize: 13, margin: '10px 0 0', lineHeight: 1.5, maxWidth: 720 }}>
          <code>labCardTheme=&quot;neo&quot;</code> — ♠ <strong>сине-фиолетовый градиент</strong>, ♦{' '}
          <strong>янтарный градиент</strong>, ♥ <strong>тёмно-красный градиент</strong>; ♣ — серый III.
        </p>
        {SUITS.map((suit) => (
          <ThemeSuitRow
            key={`neo-${suit}`}
            themeId="neo"
            suit={suit}
            highlightOn={highlightOn}
            trumpRank={LAB_LEGACY_TRUMP_RANK}
            captions={NEO_THEME_SUIT_CAPTION}
          />
        ))}
      </section>

      <p
        style={{
          color: '#64748b',
          fontSize: 12,
          margin: '-20px 0 32px',
          paddingLeft: 4,
          fontStyle: 'italic',
        }}
      >
        ↓ Ниже — сохранённые проработки по мастям (сравнение вариантов).
      </p>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Рука (мобильный вид)</h2>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14 }}>
          Сверху — светлый лист; снизу — тёмный лист по мастям (♠ ♥ ♦ ♣)
        </p>
        <div style={{ ...rowStyle, marginBottom: 20 }}>
          {HAND_BY_SUIT.map((card, i) => (
            <CardView
              key={`hand-light-${i}`}
              card={card}
              compact
              scale={0.85}
              pcCardStyles={false}
              thinBorder
              suitIndexInHandMobile
              trumpHighlightOn={highlightOn}
              labDarkCardFace={false}
            />
          ))}
        </div>
        <div style={rowStyle}>
          {HAND_BY_SUIT.map((card, i) => (
            <CardView
              key={`hand-dark-${i}`}
              card={card}
              compact
              scale={0.85}
              pcCardStyles={false}
              thinBorder
              suitIndexInHandMobile
              trumpHighlightOn={highlightOn}
              labDarkCardFace
            />
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Стол (мобильный вид)</h2>
        <div style={rowStyle}>
          {HAND_BY_SUIT.map((card, i) => (
            <CardView
              key={`table-light-${i}`}
              card={card}
              compact
              scale={0.98}
              showDesktopFaceIndices
              tableCardMobile
              pcCardStyles={false}
              doubleBorder={highlightOn}
              trumpHighlightOn={highlightOn}
              isTrumpOnTable={card.suit === '♠'}
              labDarkCardFace={false}
            />
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: 12, margin: '16px 0 10px' }}>
          Тёмный лист (♠ — козырь на столе с лёгким акцентом; остальные — как в руке)
        </p>
        <div style={rowStyle}>
          {HAND_BY_SUIT.map((card, i) => (
            <CardView
              key={`table-dark-${i}`}
              card={card}
              compact
              scale={0.98}
              showDesktopFaceIndices
              tableCardMobile
              pcCardStyles={false}
              doubleBorder={highlightOn}
              trumpHighlightOn={highlightOn}
              isTrumpOnTable={highlightOn && card.suit === '♠'}
              labDarkCardFace
            />
          ))}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Вариант III — все крести ♣</h2>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          Слева — тёмный лист (II), справа — III (воздушный фиолетовый градиент + глубокий фиолет глифов). Козырь —{' '}
          <strong style={{ color: '#94a3b8', fontWeight: 600 }}>{LAB_CLUBS_TRUMP_RANK}</strong>.
        </p>
        <div style={clubsLabCompareRowStyle}>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>Сейчас (II)</p>
            <div style={clubsLabGridStyle}>
              {ALL_CLUB_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_CLUBS_TRUMP_RANK;
                return (
                  <CardView
                    key={`clubs-v2-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                  />
                );
              })}
            </div>
          </div>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>Вариант III</p>
            <div style={clubsLabGridStyle}>
              {ALL_CLUB_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_CLUBS_TRUMP_RANK;
                return (
                  <CardView
                    key={`clubs-v3-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="clubs-v3"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Вариант III — все пики ♠</h2>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          II vs III легаси (серебристый лист + чёрные глифы) vs III нео (сине-фиолетовый). Козырь —{' '}
          <strong style={{ color: '#94a3b8', fontWeight: 600 }}>{LAB_SPADES_TRUMP_RANK}</strong>.
        </p>
        <div style={clubsLabCompareRowStyle}>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>Сейчас (II)</p>
            <div style={clubsLabGridStyle}>
              {ALL_SPADE_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_SPADES_TRUMP_RANK;
                return (
                  <CardView
                    key={`spades-v2-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                  />
                );
              })}
            </div>
          </div>
          <div style={{ ...clubsLabColumnStyle, flex: '1 1 260px', maxWidth: 320 }}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              III легаси (серебро)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_SPADE_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_SPADES_TRUMP_RANK;
                return (
                  <CardView
                    key={`spades-v3-gray-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="spades-v3-gray"
                  />
                );
              })}
            </div>
          </div>
          <div style={{ ...clubsLabColumnStyle, flex: '1 1 260px', maxWidth: 320 }}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              III нео (градиент)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_SPADE_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_SPADES_TRUMP_RANK;
                return (
                  <CardView
                    key={`spades-v3-deep-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="spades-v3-deep"
                    labCardTheme="neo"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Вариант III — все буби ♦</h2>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          II vs III легаси (жёлто-серый градиент + рыже-красные глифы). Тёмный янтарный градиент — «Нео». Козырь —{' '}
          <strong style={{ color: '#94a3b8', fontWeight: 600 }}>10</strong>.
        </p>
        <div style={clubsLabCompareRowStyle}>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>Сейчас (II)</p>
            <div style={clubsLabGridStyle}>
              {ALL_DIAMOND_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === '10';
                return (
                  <CardView
                    key={`diamonds-v2-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                  />
                );
              })}
            </div>
          </div>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              III легаси (жёлто-серый)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_DIAMOND_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === '10';
                return (
                  <CardView
                    key={`diamonds-v3-gray-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="diamonds-v3-gray"
                  />
                );
              })}
            </div>
          </div>
          <div style={clubsLabColumnStyle}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              III нео (градиент)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_DIAMOND_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === '10';
                return (
                  <CardView
                    key={`diamonds-v3-deep-${card.rank}`}
                    card={card}
                    compact
                    scale={0.72}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="diamonds-v3-deep"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Вариант III — все черви ♥ (проработка)</h2>
        <p style={{ color: '#64748b', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          Три колонки: II, <strong>легаси hearts-v3</strong> (розово-малиновый градиент + тёмно-красные глифы — в «Легаси»), черновик
          «как пики» (hearts-v3-deep). Козырь —{' '}
          <strong style={{ color: '#94a3b8', fontWeight: 600 }}>{LAB_HEARTS_TRUMP_RANK}</strong>.
        </p>
        <div style={clubsLabCompareRowStyle}>
          <div style={{ ...clubsLabColumnStyle, flex: '1 1 260px', maxWidth: 320 }}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>Сейчас (II)</p>
            <div style={clubsLabGridStyle}>
              {ALL_HEART_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_HEARTS_TRUMP_RANK;
                return (
                  <CardView
                    key={`hearts-v2-${card.rank}`}
                    card={card}
                    compact
                    scale={0.64}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                  />
                );
              })}
            </div>
          </div>
          <div style={{ ...clubsLabColumnStyle, flex: '1 1 260px', maxWidth: 320 }}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              III легаси (в теме «Легаси»)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_HEART_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_HEARTS_TRUMP_RANK;
                return (
                  <CardView
                    key={`hearts-v3-${card.rank}`}
                    card={card}
                    compact
                    scale={0.64}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="hearts-v3"
                  />
                );
              })}
            </div>
          </div>
          <div style={{ ...clubsLabColumnStyle, flex: '1 1 260px', maxWidth: 320 }}>
            <p style={{ color: '#64748b', fontSize: 11, margin: 0, textAlign: 'center' }}>
              Черновик «как ♠» (не в легаси)
            </p>
            <div style={clubsLabGridStyle}>
              {ALL_HEART_CARDS.map((card) => {
                const isTrump = highlightOn && card.rank === LAB_HEARTS_TRUMP_RANK;
                return (
                  <CardView
                    key={`hearts-v3-deep-${card.rank}`}
                    card={card}
                    compact
                    scale={0.64}
                    contentScale={1.35}
                    showDesktopFaceIndices
                    tableCardMobile
                    pcCardStyles={false}
                    doubleBorder={highlightOn}
                    isTrumpOnTable={isTrump}
                    trumpHighlightOn={highlightOn}
                    labDarkCardFace
                    labDarkSuitVariant="hearts-v3-deep"
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionH2}>Козырь на колоде (моб.)</h2>
        <div style={rowStyle}>
          <CardView
            card={{ suit: '♥', rank: 'A' }}
            disabled
            compact
            scale={0.98}
            showDesktopFaceIndices
            tableCardMobile
            pcCardStyles={false}
            trumpOnDeck
            trumpDeckHighlightOn={highlightOn}
            trumpHighlightOn={highlightOn}
            doubleBorder={highlightOn}
            labDarkCardFace={false}
          />
          <CardView
            card={{ suit: '♥', rank: 'A' }}
            disabled
            compact
            scale={0.98}
            showDesktopFaceIndices
            tableCardMobile
            pcCardStyles={false}
            trumpOnDeck
            trumpDeckHighlightOn={highlightOn}
            trumpHighlightOn={highlightOn}
            doubleBorder={highlightOn}
            labDarkCardFace
          />
        </div>
      </section>

      <p style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
        Яндекс.Браузер: при «Тёмная тема для сайтов» отключите опцию — иначе внешняя перекраска не совпадёт с этой
        лабораторией.
      </p>
    </div>
  );
}
