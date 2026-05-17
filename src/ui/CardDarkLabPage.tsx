/**
 * Лаборатория тёмного листа карт (мобильный вид CardView).
 * Маршрут: /demo/cards-dark (требуется sessionStorage updown-devMode=1, как у /demo).
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { Card } from '../game/types';
import { CardView } from './CardView';

const HAND_BY_SUIT: Card[] = [
  { suit: '♠', rank: '10' },
  { suit: '♥', rank: 'K' },
  { suit: '♦', rank: '8' },
  { suit: '♣', rank: 'A' },
];

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#0f172a',
  color: '#f8fafc',
  padding: '24px 28px 48px',
  boxSizing: 'border-box',
  maxWidth: 960,
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

interface CardDarkLabPageProps {
  onBack: () => void;
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
        <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Лаборатория: тёмный лист карт</h1>
      </header>

      <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.55, marginBottom: 24 }}>
        Сравнение светлого и тёмного листа при тех же размерах, что в мобильной игре (<code>compact</code>, без{' '}
        <code>pcCardStyles</code>). В игре тёмный лист включается удержанием лампы «доп. подсветка»; здесь — через
        проп <code>labDarkCardFace</code> + <code>suitIndexInHandMobile</code>. Палитра руки по мастям —{' '}
        <code>MOBILE_DARK_SUIT_PALETTE_BY_SUIT</code> в <code>CardView.tsx</code> (рука и стол; козыри — акцент поверх палитры).
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

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, color: '#94a3b8', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Рука (мобильный вид)
        </h2>
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
        <h2 style={{ fontSize: 16, color: '#94a3b8', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Стол (мобильный вид)
        </h2>
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
        <h2 style={{ fontSize: 16, color: '#94a3b8', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Козырь на колоде (моб.)
        </h2>
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
