/**
 * Демо-страница карт для ПК: подбор стилей по категориям.
 * Категории: рука игрока, карты на столе, анимация после раздачи, козырь на колоде.
 * После подбора стили внедряются в приложение только для ПК (мобильную не трогаем).
 */

import { useState } from 'react';
import type { Card } from '../game/types';
import { CardView } from './CardView';

/** Примеры карт для демо (все масти и типы) — блоки 2–4 */
const DEMO_CARDS: Card[] = [
  { suit: '♠', rank: '6' },
  { suit: '♥', rank: '10' },
  { suit: '♦', rank: 'Q' },
  { suit: '♦', rank: '8' },
  { suit: '♣', rank: 'A' },
];

/** Все 16 фигурных карт (В, Д, К, Т × 4 масти) для блока «Карты на руках игрока (ПК)» */
const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];
const FACE_RANKS: Card['rank'][] = ['J', 'Q', 'K', 'A'];
const HAND_DEMO_CARDS_FACES: Card[] = FACE_RANKS.flatMap(rank =>
  SUITS.map(suit => ({ suit, rank }))
);

/** Карты 6–10 для теста «доп. подсветка» (все элементы, на которых она видна) */
const NUMERIC_RANKS: Card['rank'][] = ['6', '7', '8', '9', '10'];
const HIGHLIGHT_TEST_CARDS: Card[] = NUMERIC_RANKS.map((rank, i) => ({
  suit: SUITS[i % 4],
  rank,
}));

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '24px 32px',
  boxSizing: 'border-box',
};

const headerStyle: React.CSSProperties = {
  marginBottom: 32,
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 48,
  padding: '20px 24px',
  borderRadius: 12,
  border: '1px solid rgba(71, 85, 105, 0.5)',
  background: 'rgba(30, 41, 59, 0.4)',
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  color: '#94a3b8',
  marginBottom: 16,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const cardRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 12,
  alignItems: 'center',
};

interface CardsDemoPageProps {
  onBack: () => void;
}

export function CardsDemoPage({ onBack }: CardsDemoPageProps) {
  const [highlightOn, setHighlightOn] = useState(true);

  return (
    <div className="cards-demo-page" style={pageStyle}>
      <header style={headerStyle}>
        <button
          type="button"
          onClick={onBack}
          style={{
            padding: '8px 16px',
            fontSize: 14,
            borderRadius: 8,
            border: '1px solid #475569',
            background: '#334155',
            color: '#f8fafc',
            cursor: 'pointer',
          }}
        >
          ← В меню
        </button>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Демо карт (ПК)</h1>
        <span style={{ color: '#64748b', fontSize: 14 }}>
          Подбор стилей для рук, стола, анимации и козыря. Мобильная версия не затрагивается.
        </span>
      </header>

      {/* На что влияет опция «доп. подсветка» В ИГРЕ — все варианты для теста */}
      <section style={{ ...sectionStyle, borderColor: 'rgba(34, 211, 238, 0.6)', background: 'rgba(15, 23, 42, 0.6)', display: 'flex', gap: 20, alignItems: 'stretch' }}>
        <div style={{ flexShrink: 0, width: 52, minHeight: 420, position: 'sticky', top: 24, alignSelf: 'flex-start' }}>
          <button
            type="button"
            onClick={() => setHighlightOn(v => !v)}
            title={highlightOn ? 'Выключить дополнительную подсветку' : 'Включить дополнительную подсветку'}
            style={{
              width: '100%',
              minHeight: 420,
              padding: '16px 8px',
              borderRadius: 10,
              border: '2px solid rgba(34, 211, 238, 0.6)',
              background: highlightOn ? 'rgba(34, 211, 238, 0.12)' : '#334155',
              color: highlightOn ? '#22d3ee' : '#94a3b8',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
              letterSpacing: '0.5px',
              boxShadow: highlightOn ? '0 0 16px rgba(34, 211, 238, 0.2)' : 'none',
            }}
          >
            {highlightOn ? 'Подсветка вкл' : 'Подсветка выкл'}
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={sectionTitleStyle}>На что влияет опция «доп. подсветка» в игре</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Переключайте кнопку слева «Подсветка вкл/выкл» и проверяйте все варианты ниже.
        </p>
        <ol style={{ color: '#e2e8f0', fontSize: 12, marginBottom: 20, paddingLeft: 22, lineHeight: 1.5 }}>
          <li>Все карты: при вкл — двойная рамка (3px + outline); при выкл — одинарная (2px).</li>
          <li>Козырь на столе: при вкл — обводка, тень, градиент, значок «К»; при выкл — нет.</li>
          <li>Карты 6–10: при вкл — неоновые линии и градиент в зоне пипов; при выкл — нет.</li>
          <li>Козырь на колоде: при вкл — двойная рамка и полное свечение; при выкл — одинарная и ослабленное.</li>
        </ol>

        <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>1. Все карты — двойная / одинарная рамка</p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Рука (ПК) и стол (ПК):</p>
        <div style={cardRowStyle}>
          {[DEMO_CARDS[0], DEMO_CARDS[1], DEMO_CARDS[2]].map((card, i) => (
            <CardView key={`all-hand-${i}`} card={card} scale={1} doubleBorder={highlightOn} showPipZoneBorders={highlightOn} />
          ))}
          {[DEMO_CARDS[0], DEMO_CARDS[1], DEMO_CARDS[2]].map((card, i) => (
            <CardView key={`all-table-${i}`} card={card} compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} showPipZoneBorders={highlightOn} />
          ))}
        </div>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16, marginBottom: 6, fontWeight: 600 }}>2. Козырь на столе</p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>При вкл — мощная подсветка; при выкл — то же свечение без рамок, как у козырей в руке:</p>
        <div style={cardRowStyle}>
          <CardView card={{ suit: '♥', rank: 'K' }} compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} isTrumpOnTable={true} trumpHighlightOn={highlightOn} showPipZoneBorders={highlightOn} />
          <CardView card={{ suit: '♦', rank: '8' }} compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} isTrumpOnTable={true} trumpHighlightOn={highlightOn} showPipZoneBorders={highlightOn} />
          <CardView card={{ suit: '♠', rank: '10' }} compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} isTrumpOnTable={false} trumpHighlightOn={highlightOn} showPipZoneBorders={highlightOn} />
        </div>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16, marginBottom: 6, fontWeight: 600 }}>3. Карты 6–10 — неоновые линии и градиент в зоне пипов</p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>На руках (ПК):</p>
        <div style={cardRowStyle}>
          {HIGHLIGHT_TEST_CARDS.map((card, i) => (
            <CardView key={`hl-hand-${i}`} card={card} scale={1} doubleBorder={highlightOn} showPipZoneBorders={highlightOn} />
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: 11, marginTop: 8, marginBottom: 6 }}>На столе (ПК):</p>
        <div style={cardRowStyle}>
          {HIGHLIGHT_TEST_CARDS.map((card, i) => (
            <CardView key={`hl-table-${i}`} card={card} compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} showPipZoneBorders={highlightOn} />
          ))}
        </div>

        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 16, marginBottom: 6, fontWeight: 600 }}>4. Козырь на колоде</p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>При вкл — двойная рамка и полное свечение; при выкл — одинарная и ослабленное. Фигура (туз) и карты 6–10:</p>
        <p style={{ color: '#64748b', fontSize: 11, marginTop: 12, marginBottom: 6, fontWeight: 600 }}>5. Козыри на руках</p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>При выкл. подсветки козыри в руке (масть ♠ в примере) — то же свечение карты, что у козыря на колоде без подсветки, но без свечения от рамок:</p>
        <div style={{ ...cardRowStyle, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 8 }}>
          {(['♠', '♥', '♦', '♣'] as const).map(suit => (
            <div key={suit} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: suit === '♠' ? 'rgba(34, 211, 238, 0.9)' : '#64748b' }}>{suit === '♠' ? 'Козырь в руке' : 'Не козырь'}</span>
              <CardView
                card={{ suit, rank: '10' }}
                scale={1}
                doubleBorder={highlightOn}
                showDesktopFaceIndices={true}
                showPipZoneBorders={highlightOn}
                isTrumpInHand={suit === '♠'}
                trumpHighlightOn={highlightOn}
              />
            </div>
          ))}
        </div>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 6 }}>Козырь на колоде (для сравнения):</p>
        <div style={{ ...cardRowStyle, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'rgba(34, 211, 238, 0.9)', textShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }}>Козырь</span>
            <CardView card={{ suit: '♠', rank: 'A' }} disabled compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} trumpOnDeck trumpDeckHighlightOn={highlightOn} />
          </div>
          {HIGHLIGHT_TEST_CARDS.map((card, i) => (
            <div key={`deck-${i}`} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, color: 'rgba(34, 211, 238, 0.9)', textShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }}>Козырь</span>
              <CardView card={card} disabled compact showDesktopFaceIndices={true} tableCardMobile={false} scale={1.18} doubleBorder={highlightOn} trumpOnDeck trumpDeckHighlightOn={highlightOn} />
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* 1. Фигурные карты на руках игрока (ПК) */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>1. Фигурные карты на руках игрока (ПК)</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Все 16 карт (В, Д, К, Т × 4 масти). scale=1, без compact. Подсветка — кнопкой выше.
        </p>
        <p style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>При выкл. подсветки карты масти ♠ — козыри в руке (свечение без рамок).</p>
        <div style={{ ...cardRowStyle, padding: '14px 18px', borderRadius: 14, border: '1px solid rgba(34, 211, 238, 0.5)', background: 'rgba(15, 23, 42, 0.6)', boxShadow: '0 0 20px rgba(34, 211, 238, 0.12)' }}>
          {HAND_DEMO_CARDS_FACES.map((card, i) => (
            <CardView
              key={`hand-${card.suit}-${card.rank}-${i}`}
              card={card}
              scale={1}
              doubleBorder={highlightOn}
              showDesktopFaceIndices={true}
              showPipZoneBorders={highlightOn}
              isTrumpInHand={card.suit === '♠'}
              trumpHighlightOn={highlightOn}
            />
          ))}
        </div>
      </section>

      {/* 2. Карты на столе (ход игроков) */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>2. Карты на столе (ход игроков)</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Все 16 фигурных карт (В, Д, К, Т × 4 масти). compact, showDesktopFaceIndices, scale=1.18, tableCardMobile=false. Без козыря (isTrumpOnTable не передаётся).
        </p>
        <div style={cardRowStyle}>
          {HAND_DEMO_CARDS_FACES.map((card, i) => (
            <CardView
              key={`table-${card.suit}-${card.rank}-${i}`}
              card={card}
              compact
              showDesktopFaceIndices={true}
              tableCardMobile={false}
              scale={1.18}
              doubleBorder={true}
              showPipZoneBorders={highlightOn}
            />
          ))}
        </div>
      </section>

      {/* 3. Карты при анимации после завершения раздачи */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>3. Анимация после завершения раздачи</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          Те же параметры, что и карты на столе (слот взятки). Здесь можно проверить тени/масштаб при сборе к победителю.
        </p>
        <div style={cardRowStyle}>
          {DEMO_CARDS.map((card, i) => (
            <CardView
              key={`trick-${card.suit}-${card.rank}-${i}`}
              card={card}
              compact
              showDesktopFaceIndices={true}
              tableCardMobile={false}
              scale={1.18}
              doubleBorder={true}
              isTrumpOnTable={i === 2}
              showPipZoneBorders={highlightOn}
            />
          ))}
        </div>
      </section>

      {/* 4. Козырь на колоде */}
      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>4. Козырь на колоде</h2>
        <p style={{ color: '#94a3b8', fontSize: 13, marginBottom: 12 }}>
          trumpOnDeck, trumpDeckHighlightOn, scale=1.18 (deckScale ПК), compact, showDesktopFaceIndices.
        </p>
        <div style={{ ...cardRowStyle, position: 'relative', minHeight: 120 }}>
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Имитация стопки: задники не рендерим, только подпись и козырь как в DeckWithTrump */}
            <span style={{ display: 'block', fontSize: 16, color: 'rgba(34, 211, 238, 0.9)', textShadow: '0 0 8px rgba(34, 211, 238, 0.5)', marginBottom: 4 }}>
              Козырь
            </span>
            <CardView
              card={DEMO_CARDS[4]}
              disabled
              compact
              showDesktopFaceIndices={true}
              tableCardMobile={false}
              scale={1.18}
              doubleBorder={true}
              trumpOnDeck
              trumpDeckHighlightOn={true}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
