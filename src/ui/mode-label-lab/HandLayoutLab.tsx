/**
 * Песочница раскладки руки 10–12 на мобильном «слепке» стола.
 * URL: /mode-label-lab — не прод-GameTable.
 *
 * Варианты:
 * - hybrid-b: ≤9 один ряд; 10+ две строки (вторая растёт ВВЕРХ в сукно)
 * - vertical: столбец справа, контент карты развёрнут на 90°
 * - east-tail: 9 в ряду как обычно; лишние 1–3 — вертикальный «хвост» справа
 *   (место Востока при игре втроём); стол временно уже
 */

import { useMemo, useState } from 'react';
import type { Card } from '../../game/types';
import { CardView } from '../CardView';

type HandCount = 6 | 9 | 10 | 11 | 12;
type LabVariant = 'hybrid-b' | 'vertical' | 'east-tail';
type PhoneWidth = 'wide' | 'narrow';

const HAND_COUNTS: HandCount[] = [6, 9, 10, 11, 12];
/** Широкий слепок ≈ крупные телефоны; узкий — стресс-тест нахлёста / хвоста. */
const PHONE_WIDTH_PX: Record<PhoneWidth, number> = { wide: 340, narrow: 300 };

/** Как в игре: compact × 0.72 */
const HAND_SCALE = 0.72;
/** Compact base 52×76 → после scale (высота нужна для двухстрочного варианта) */
const CARD_H = Math.round(76 * HAND_SCALE);

const DEMO_HAND_12: Card[] = [
  { suit: '♠', rank: 'A' },
  { suit: '♠', rank: 'K' },
  { suit: '♠', rank: '10' },
  { suit: '♥', rank: 'Q' },
  { suit: '♥', rank: '9' },
  { suit: '♥', rank: '7' },
  { suit: '♦', rank: 'J' },
  { suit: '♦', rank: '8' },
  { suit: '♦', rank: '6' },
  { suit: '♣', rank: 'A' },
  { suit: '♣', rank: 'K' },
  { suit: '♣', rank: '10' },
];

const TRICK_DEMO: Card[] = [
  { suit: '♦', rank: '9' },
  { suit: '♠', rank: '7' },
  { suit: '♥', rank: '6' },
];

const VARIANT_META: Record<LabVariant, { badge: string; title: string; blurb: string }> = {
  'hybrid-b': {
    badge: 'гибрид → B',
    title: 'До 9 как сейчас · 10+ две строки',
    blurb:
      'Панель игрока снизу как в игре — её не трогаем. Вторая строка уходит вверх в сукно (над рукой), не вниз в Юг.',
  },
  vertical: {
    badge: 'A · landscape + 90°',
    title: 'Вертикальный столбец',
    blurb:
      'Карта горизонтальная (landscape). Лицо внутри — поворот на 90° (ранг/масть/картинки). Без нахлёста.',
  },
  'east-tail': {
    badge: '9 + Восток',
    title: '9 в ряду · хвост справа',
    blurb:
      'Первые 9 — обычный ряд Юга. Лишние 1–3 — короткий столбик справа (пустое место Востока при 3 игроках). Сукно временно уже.',
  },
};

const MAIN_ROW_MAX = 9;

function splitRowAndEastTail(hand: Card[]): { row: Card[]; tail: Card[] } {
  if (hand.length <= MAIN_ROW_MAX) return { row: hand, tail: [] };
  return {
    row: hand.slice(0, MAIN_ROW_MAX),
    tail: hand.slice(MAIN_ROW_MAX),
  };
}

function splitTwoRows(hand: Card[]): [Card[], Card[]] {
  const top = Math.ceil(hand.length / 2);
  return [hand.slice(0, top), hand.slice(top)];
}

function currentRowOverlapPx(n: number): number {
  if (n <= 5) return 0;
  if (n === 6) return 4;
  if (n === 7) return 10;
  if (n === 8) return 16;
  if (n === 9) return 22;
  return 8;
}

function GameHandCard({ card, z, marginRight }: { card: Card; z: number; marginRight?: number }) {
  return (
    <div className="hand-layout-lab__card-slot" style={{ zIndex: z, marginRight }}>
      <CardView
        card={card}
        compact
        pcCardStyles={false}
        suitIndexInHandMobile
        thinBorder
        scale={HAND_SCALE}
        showPipZoneBorders={false}
        trumpHighlightOn={false}
        mobileTrumpGlowActive={false}
      />
    </div>
  );
}

function CurrentStyleRow({ hand, overlapPx }: { hand: Card[]; overlapPx?: number }) {
  const overlap = overlapPx ?? currentRowOverlapPx(hand.length);
  return (
    <div className="hand-layout-lab__row">
      {hand.map((card, i) => (
        <GameHandCard
          key={`${card.suit}${card.rank}-${i}`}
          card={card}
          z={i + 1}
          marginRight={i < hand.length - 1 ? -overlap : 0}
        />
      ))}
    </div>
  );
}

/**
 * Две строки: нижняя в зоне руки, верхняя нависает над ней в сукно
 * (не занимает место панели Юга).
 */
function TwoRowsHand({ hand }: { hand: Card[] }) {
  const [top, bottom] = splitTwoRows(hand);
  const overlap = Math.max(8, currentRowOverlapPx(Math.max(top.length, bottom.length)) - 2);
  /** Нахлёст строк по вертикали — верхняя «сидит» на нижней и торчит в сукно */
  const rowOverlapY = Math.round(CARD_H * 0.28);

  return (
    <div className="hand-layout-lab__two-rows" style={{ marginTop: -(CARD_H - rowOverlapY) }}>
      <div className="hand-layout-lab__row hand-layout-lab__row--upper">
        {top.map((card, i) => (
          <GameHandCard
            key={`${card.suit}${card.rank}-u-${i}`}
            card={card}
            z={i + 1}
            marginRight={i < top.length - 1 ? -overlap : 0}
          />
        ))}
      </div>
      <div
        className="hand-layout-lab__row hand-layout-lab__row--lower"
        style={{ marginTop: -rowOverlapY }}
      >
        {bottom.map((card, i) => (
          <GameHandCard
            key={`${card.suit}${card.rank}-l-${i}`}
            card={card}
            z={20 + i}
            marginRight={i < bottom.length - 1 ? -overlap : 0}
          />
        ))}
      </div>
    </div>
  );
}

type FaceAngleDeg = 90 | -90;

/**
 * Горизонтальная карта (landscape-рамка) + лицо внутри на ±90°.
 * Без поворота всей карточки снаружи — только labRotateContent90 в CardView.
 */
function SidewaysCard({
  card,
  scale,
  faceDeg,
}: {
  card: Card;
  scale: number;
  faceDeg: FaceAngleDeg;
}) {
  return (
    <div className="hand-layout-lab__sideways">
      <CardView
        card={card}
        compact
        pcCardStyles={false}
        suitIndexInHandMobile
        thinBorder
        scale={scale}
        showPipZoneBorders={false}
        trumpHighlightOn={false}
        mobileTrumpGlowActive={false}
        labRotateContent90
        labFaceRotateDeg={faceDeg}
      />
    </div>
  );
}

function Vertical90Hand({ hand, faceDeg }: { hand: Card[]; faceDeg: FaceAngleDeg }) {
  const scale = 0.65;
  return (
    <div className="hand-layout-lab__vert" style={{ gap: 5 }}>
      {hand.map((card, i) => (
        <SidewaysCard
          key={`${card.suit}${card.rank}-v-${i}`}
          card={card}
          scale={scale}
          faceDeg={faceDeg}
        />
      ))}
    </div>
  );
}

/** Короткий столбик 1–3 обычных карт (портрет) — «хвост Востока». */
function EastTailColumn({ tail }: { tail: Card[] }) {
  if (tail.length === 0) return null;
  const gap = tail.length >= 3 ? 3 : 5;
  return (
    <div
      className="hand-layout-lab__east-tail"
      aria-label={`Хвост Востока: ${tail.length} карт`}
      style={{ gap }}
    >
      <span className="hand-layout-lab__east-tail-label">В</span>
      {tail.map((card, i) => (
        <GameHandCard key={`${card.suit}${card.rank}-e-${i}`} card={card} z={i + 1} />
      ))}
    </div>
  );
}

function HandStrip({ variant, hand }: { variant: LabVariant; hand: Card[] }) {
  if (variant === 'vertical') return null;

  if (variant === 'east-tail') {
    const { row, tail } = splitRowAndEastTail(hand);
    return (
      <div className="hand-layout-lab__hand-strip hand-layout-lab__hand-strip--east-main">
        <div className="hand-layout-lab__hand-frame hand-layout-lab__hand-frame--east-main">
          <div className="hand-layout-lab__east-row-anchor">
            {/* Без «игрового» нахлёста 9-ки: ряд как свободная раскладка */}
            <CurrentStyleRow hand={row} overlapPx={0} />
            {/* Хвост: ровно над правым концом ряда, зазор 2px */}
            {tail.length > 0 ? <EastTailColumn tail={tail} /> : null}
          </div>
        </div>
      </div>
    );
  }

  const twoRows = hand.length >= 10;
  return (
    <div
      className={[
        'hand-layout-lab__hand-strip',
        twoRows ? 'hand-layout-lab__hand-strip--two-rows' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="hand-layout-lab__hand-frame">
        {twoRows ? <TwoRowsHand hand={hand} /> : <CurrentStyleRow hand={hand} />}
      </div>
    </div>
  );
}

function UserSouthPanel() {
  return (
    <div className="hand-layout-lab__user-panel" aria-label="Панель игрока (Юг)">
      <div className="hand-layout-lab__user-avatar" aria-hidden />
      <div className="hand-layout-lab__user-mid">
        <div className="hand-layout-lab__user-name">Вы</div>
        <div className="hand-layout-lab__user-order">
          <span>Заказ</span>
          <strong>4</strong>
        </div>
        <div className="hand-layout-lab__user-tricks">
          <span>Взятки</span>
          <strong>1</strong>
        </div>
      </div>
      <div className="hand-layout-lab__user-score">
        <span>Счёт</span>
        <strong>12</strong>
      </div>
    </div>
  );
}

function OpponentStub({ name, bid, seat }: { name: string; bid: string; seat: 'W' | 'N' }) {
  return (
    <div className={`hand-layout-lab__opp hand-layout-lab__opp--${seat.toLowerCase()}`}>
      <div className="hand-layout-lab__opp-avatar" aria-hidden />
      <div className="hand-layout-lab__opp-meta">
        <span className="hand-layout-lab__opp-name">{name}</span>
        <span className="hand-layout-lab__opp-bid">{bid}</span>
      </div>
    </div>
  );
}

function PhoneCast({
  variant,
  handCount,
  faceDeg = 90,
  phoneWidth = 'wide',
}: {
  variant: LabVariant;
  handCount: HandCount;
  faceDeg?: FaceAngleDeg;
  phoneWidth?: PhoneWidth;
}) {
  const hand = useMemo(() => DEMO_HAND_12.slice(0, handCount), [handCount]);
  const meta = VARIANT_META[variant];
  const { row, tail } = useMemo(() => splitRowAndEastTail(hand), [hand]);
  const eastTailActive = variant === 'east-tail' && tail.length > 0;

  const modeHint =
    variant === 'vertical'
      ? `landscape · лицо ${faceDeg > 0 ? '+' : ''}${faceDeg}° · ${handCount} карт`
      : variant === 'east-tail'
        ? eastTailActive
          ? `ряд ${row.length} · хвост В ${tail.length} · стол уже`
          : `≤9 · только ряд (хвоста нет)`
        : handCount <= 9
          ? `≤9 · один ряд как в игре`
          : `10+ · 2 строки вверх в сукно`;

  return (
    <article className="hand-layout-lab__cast-card">
      <div className="hand-layout-lab__cast-head">
        <span className="hand-layout-lab__badge">{meta.badge}</span>
        <h3 className="hand-layout-lab__cast-title">{meta.title}</h3>
        <p className="hand-layout-lab__cast-blurb">{meta.blurb}</p>
        <p className="hand-layout-lab__mode-chip">{modeHint}</p>
      </div>

      <div
        className={[
          'hand-layout-lab__phone',
          phoneWidth === 'narrow' ? 'hand-layout-lab__phone--narrow' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{ maxWidth: PHONE_WIDTH_PX[phoneWidth] }}
        aria-label={`Слепок: ${meta.title}`}
      >
        <div className="hand-layout-lab__phone-notch" aria-hidden />
        <div
          className={[
            'hand-layout-lab__table',
            variant === 'vertical' ? 'hand-layout-lab__table--vert' : '',
            variant === 'hybrid-b' && handCount >= 10 ? 'hand-layout-lab__table--two-rows' : '',
            eastTailActive ? 'hand-layout-lab__table--east-tail' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <header className="hand-layout-lab__hdr">
            <span>Раздача 15 · {handCount} карт</span>
            <span className="hand-layout-lab__trump">♠ козырь</span>
          </header>

          <div className="hand-layout-lab__top">
            <OpponentStub name="Запад" bid="3/2" seat="W" />
            <OpponentStub name="Север" bid="2/1" seat="N" />
          </div>

          <div className="hand-layout-lab__felt">
            <div className="hand-layout-lab__trick">
              {TRICK_DEMO.map((card, i) => (
                <div
                  key={`${card.suit}${card.rank}-t`}
                  className={`hand-layout-lab__trick-card hand-layout-lab__trick-card--${i}`}
                >
                  <CardView
                    card={card}
                    compact
                    tableCardMobile
                    pcCardStyles={false}
                    thinBorder
                    scale={0.62}
                    showPipZoneBorders={false}
                    trumpHighlightOn={false}
                    mobileTrumpGlowActive={false}
                  />
                </div>
              ))}
            </div>
            <div className="hand-layout-lab__deck-stub" aria-hidden>
              <span />
              <span />
            </div>
            {variant === 'vertical' ? (
              <div className="hand-layout-lab__vert-rail" aria-label="Рука: landscape + лицо 90°">
                <Vertical90Hand hand={hand} faceDeg={faceDeg} />
              </div>
            ) : null}
          </div>

          <div className="hand-layout-lab__stack">
            <HandStrip variant={variant} hand={hand} />
            {variant === 'vertical' ? (
              <p className="hand-layout-lab__vert-note">
                рамка горизонтальная · лицо {faceDeg > 0 ? '+' : ''}
                {faceDeg}°
              </p>
            ) : null}
            {variant === 'east-tail' && eastTailActive ? (
              <p className="hand-layout-lab__vert-note">
                хвост Востока · {tail.length}{' '}
                {tail.length === 1 ? 'карта' : tail.length < 5 ? 'карты' : 'карт'}
              </p>
            ) : null}
            <UserSouthPanel />
          </div>
        </div>
      </div>
    </article>
  );
}

export function HandLayoutLabSection() {
  const [handCount, setHandCount] = useState<HandCount>(12);
  const [faceDeg, setFaceDeg] = useState<FaceAngleDeg>(90);
  const [phoneWidth, setPhoneWidth] = useState<PhoneWidth>('wide');

  return (
    <section className="mode-label-lab__section mode-label-lab__section--featured hand-layout-lab">
      <div className="mode-label-lab__section-head">
        <span className="mode-label-lab__badge">рука · 10–12</span>
        <h2>Слепок стола — раскладка руки</h2>
        <p>
          Три идеи рядом. «9 + Восток» — ряд как обычно, лишние карты столбиком справа (пустое
          место Востока). Узкий/широкий слепок — стресс-тест. Прод не меняется.
        </p>
      </div>

      <div className="hand-layout-lab__controls" role="group" aria-label="Число карт в руке">
        <span className="hand-layout-lab__controls-label">Карт в руке</span>
        <div className="hand-layout-lab__controls-toggle">
          {HAND_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              className={
                handCount === n
                  ? 'hand-layout-lab__count-btn hand-layout-lab__count-btn--active'
                  : 'hand-layout-lab__count-btn'
              }
              aria-pressed={handCount === n}
              onClick={() => setHandCount(n)}
            >
              {n}
              {n === 9 ? <span className="hand-layout-lab__count-meta">эталон</span> : null}
              {n === 12 ? <span className="hand-layout-lab__count-meta">пик</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="hand-layout-lab__controls" role="group" aria-label="Ширина слепка телефона">
        <span className="hand-layout-lab__controls-label">Слепок</span>
        <div className="hand-layout-lab__controls-toggle">
          <button
            type="button"
            className={
              phoneWidth === 'wide'
                ? 'hand-layout-lab__count-btn hand-layout-lab__count-btn--active'
                : 'hand-layout-lab__count-btn'
            }
            aria-pressed={phoneWidth === 'wide'}
            onClick={() => setPhoneWidth('wide')}
          >
            широкий
            <span className="hand-layout-lab__count-meta">{PHONE_WIDTH_PX.wide}px</span>
          </button>
          <button
            type="button"
            className={
              phoneWidth === 'narrow'
                ? 'hand-layout-lab__count-btn hand-layout-lab__count-btn--active'
                : 'hand-layout-lab__count-btn'
            }
            aria-pressed={phoneWidth === 'narrow'}
            onClick={() => setPhoneWidth('narrow')}
          >
            узкий
            <span className="hand-layout-lab__count-meta">{PHONE_WIDTH_PX.narrow}px</span>
          </button>
        </div>
      </div>

      <div className="hand-layout-lab__controls" role="group" aria-label="Угол лица внутри карты">
        <span className="hand-layout-lab__controls-label">Лицо внутри (A)</span>
        <div className="hand-layout-lab__controls-toggle">
          <button
            type="button"
            className={
              faceDeg === 90
                ? 'hand-layout-lab__count-btn hand-layout-lab__count-btn--active'
                : 'hand-layout-lab__count-btn'
            }
            aria-pressed={faceDeg === 90}
            onClick={() => setFaceDeg(90)}
          >
            +90°
          </button>
          <button
            type="button"
            className={
              faceDeg === -90
                ? 'hand-layout-lab__count-btn hand-layout-lab__count-btn--active'
                : 'hand-layout-lab__count-btn'
            }
            aria-pressed={faceDeg === -90}
            onClick={() => setFaceDeg(-90)}
          >
            −90°
          </button>
        </div>
      </div>

      <div className="hand-layout-lab__casts">
        <PhoneCast
          variant="east-tail"
          handCount={handCount}
          phoneWidth={phoneWidth}
        />
        <PhoneCast variant="hybrid-b" handCount={handCount} phoneWidth={phoneWidth} />
        <PhoneCast
          variant="vertical"
          handCount={handCount}
          faceDeg={faceDeg}
          phoneWidth={phoneWidth}
        />
      </div>
    </section>
  );
}
