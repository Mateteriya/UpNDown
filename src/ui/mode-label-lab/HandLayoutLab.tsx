/**
 * Песочница раскладки руки 10–12 на мобильном «слепке» стола.
 * URL: /mode-label-lab — не прод-GameTable.
 *
 * Варианты:
 * - l-frame: одна L-рамка (горизонталь 9 + вертикаль 1–3); шевроны — кнопка свернуть/развернуть
 * - hybrid-b: ≤9 один ряд; 10+ две строки (вторая растёт ВВЕРХ в сукно)
 * - vertical: столбец справа, контент карты развёрнут на 90°
 * - east-tail: 9 в ряду + отдельная вертикальная панель-хвост справа
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../game/types';
import { CardView } from '../CardView';

type HandCount = 6 | 9 | 10 | 11 | 12;
type LabVariant = 'hybrid-b' | 'vertical' | 'east-tail' | 'l-frame';
type PhoneWidth = 'wide' | 'narrow';
/** Декор над крышкой вертикального хвоста (только лаб). */
type EastTailCrestId = 'halo' | 'chevrons' | 'orbit' | 'glyph' | 'aurora' | 'crystal' | 'hybrid';

const EAST_TAIL_CRESTS: {
  id: EastTailCrestId;
  title: string;
  blurb: string;
}[] = [
  {
    id: 'hybrid',
    title: 'Гибрид · шеврон↓ + aurora',
    blurb: 'Один SVG · пульс затемнением · без белого слияния между ▲',
  },
  { id: 'halo', title: 'Корона-дуга', blurb: 'Тонкое halo над верхней кромкой' },
  { id: 'chevrons', title: 'Тройной шеврон', blurb: 'Стела ⌃⌃⌃ — «стек уходит вверх»' },
  { id: 'orbit', title: 'Orbit-pip', blurb: 'Точка на дуге, медленный пробег' },
  { id: 'glyph', title: 'Хвост-иероглиф', blurb: '⋮ в стеклянной капсуле' },
  { id: 'aurora', title: 'Aurora-edge', blurb: 'Перелив только на верхней грани' },
  { id: 'crystal', title: 'Кристалл-шип', blurb: 'Один ромб, лёгкое дыхание' },
];

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
  'l-frame': {
    badge: 'L · одна рамка',
    title: 'Буква L: ряд + продолжение вверх',
    blurb:
      'Шевроны сверху — кнопка: свернуть вертикаль в один ряд с нахлёстом (как в обычной руке) и обратно.',
  },
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
    badge: '9 + Восток · 2 панели',
    title: '9 в ряду · отдельный хвост',
    blurb:
      'Как сейчас в проде: горизонтальная рамка + отдельная вертикальная панелька справа. Для сравнения с L.',
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

function GameHandCard({
  card,
  z,
  marginRight,
  highlightAsValidPlay,
  handPlayableSlideLeft,
}: {
  card: Card;
  z: number;
  marginRight?: number;
  highlightAsValidPlay?: boolean;
  handPlayableSlideLeft?: boolean;
}) {
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
        highlightAsValidPlay={highlightAsValidPlay}
        handPlayableSlideLeft={handPlayableSlideLeft}
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

/**
 * Шевроны как кнопка: свернуть L → один ряд / развернуть обратно.
 * expanded=true — вертикаль видна, стрелки вниз; flat — стрелки вверх.
 */
function LCrestToggleButton({
  expanded,
  onClick,
  docked = false,
}: {
  expanded: boolean;
  onClick: () => void;
  docked?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'hand-layout-lab__l-crest-btn',
        'hand-layout-lab__east-crest',
        'hand-layout-lab__east-crest--chevrons',
        'hand-layout-lab__east-crest--chevrons-lilac',
        expanded
          ? 'hand-layout-lab__l-crest-btn--expanded'
          : 'hand-layout-lab__l-crest-btn--flat',
        docked ? 'hand-layout-lab__l-crest-btn--docked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={expanded}
      aria-label={
        expanded
          ? 'Свернуть вертикальный ряд в одну горизонтальную линию'
          : 'Показать вертикальный ряд (буква L)'
      }
      title={expanded ? 'В один ряд' : 'Развернуть L'}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <svg
        className="hand-layout-lab__east-crest-stack"
        viewBox="0 0 14 36"
        width="14"
        height="36"
        aria-hidden
        focusable="false"
      >
        <path d="M7 9 L1.5 2.5 L12.5 2.5 Z" />
        <path d="M7 20 L1.5 13.5 L12.5 13.5 Z" />
        <path d="M7 31 L1.5 24.5 L12.5 24.5 Z" />
      </svg>
    </button>
  );
}

/** Короткий столбик 1–3 обычных карт (портрет) — «хвост Востока». */
function EastTailCrest({ id }: { id: EastTailCrestId }) {
  if (id === 'halo') {
    return (
      <div className="hand-layout-lab__east-crest hand-layout-lab__east-crest--halo" aria-hidden>
        <svg viewBox="0 0 48 14" width="48" height="14" focusable="false">
          <path
            d="M4 12 C14 2, 34 2, 44 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <path
            d="M10 12 C18 5, 30 5, 38 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.9"
            strokeLinecap="round"
            opacity="0.55"
          />
        </svg>
      </div>
    );
  }
  if (id === 'chevrons' || id === 'hybrid') {
    return (
      <div
        className={[
          'hand-layout-lab__east-crest',
          'hand-layout-lab__east-crest--chevrons',
          'hand-layout-lab__east-crest--chevrons-down',
          id === 'hybrid' ? 'hand-layout-lab__east-crest--chevrons-lilac' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        role="presentation"
        aria-hidden
      >
        <svg
          className="hand-layout-lab__east-crest-stack"
          viewBox="0 0 14 36"
          width="14"
          height="36"
          focusable="false"
        >
          <path d="M7 9 L1.5 2.5 L12.5 2.5 Z" />
          <path d="M7 20 L1.5 13.5 L12.5 13.5 Z" />
          <path d="M7 31 L1.5 24.5 L12.5 24.5 Z" />
        </svg>
      </div>
    );
  }
  if (id === 'orbit') {
    return (
      <div className="hand-layout-lab__east-crest hand-layout-lab__east-crest--orbit" aria-hidden>
        <span className="hand-layout-lab__east-crest-orbit-track" />
        <span className="hand-layout-lab__east-crest-orbit-pip" />
      </div>
    );
  }
  if (id === 'glyph') {
    return (
      <div className="hand-layout-lab__east-crest hand-layout-lab__east-crest--glyph" aria-hidden>
        <span>⋮</span>
      </div>
    );
  }
  if (id === 'crystal') {
    return (
      <div className="hand-layout-lab__east-crest hand-layout-lab__east-crest--crystal" aria-hidden>
        <svg viewBox="0 0 16 16" width="14" height="14" focusable="false">
          <path d="M8 1.5 L13.5 8 L8 14.5 L2.5 8 Z" fill="currentColor" />
        </svg>
      </div>
    );
  }
  /* aurora — класс на колонке, отдельного узла нет */
  return null;
}

/** Короткий столбик 1–3 обычных карт (портрет) — «хвост Востока». */
function EastTailColumn({
  tail,
  crest = null,
}: {
  tail: Card[];
  crest?: EastTailCrestId | null;
}) {
  if (tail.length === 0) return null;
  const gap = tail.length >= 3 ? 3 : 5;
  const withAurora = crest === 'aurora' || crest === 'hybrid';
  return (
    <div
      className={[
        'hand-layout-lab__east-tail',
        withAurora ? 'hand-layout-lab__east-tail--aurora' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Хвост Востока: ${tail.length} карт`}
      style={{ gap }}
    >
      {crest && crest !== 'aurora' ? <EastTailCrest id={crest} /> : null}
      {tail.map((card, i) => (
        <GameHandCard key={`${card.suit}${card.rank}-e-${i}`} card={card} z={i + 1} />
      ))}
    </div>
  );
}

/**
 * Одна L-рамка: горизонталь (до 9) + вертикальное продолжение вверх справа.
 * Шевроны — кнопка: плавно свернуть в один ряд с нахлёстом / развернуть L.
 */
function LFrameHand({
  hand,
  crest = null,
}: {
  hand: Card[];
  crest?: EastTailCrestId | null;
}) {
  const { row, tail } = splitRowAndEastTail(hand);
  const gap = tail.length >= 3 ? 3 : 5;
  const withAurora = crest === 'aurora' || crest === 'hybrid';
  const hasTail = tail.length > 0;
  /** false = L с вертикалью; true = один горизонтальный ряд с нахлёстом */
  const [flat, setFlat] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const armHRef = useRef<HTMLDivElement | null>(null);
  const armVRef = useRef<HTMLDivElement | null>(null);
  const cyanDashRef = useRef<SVGPathElement | null>(null);
  const violetDashRef = useRef<SVGPathElement | null>(null);
  const cyanGlowRef = useRef<SVGPathElement | null>(null);
  const violetGlowRef = useRef<SVGPathElement | null>(null);
  const [garlandPath, setGarlandPath] = useState('');
  const [garlandBox, setGarlandBox] = useState({ w: 1, h: 1 });
  const [garlandReady, setGarlandReady] = useState(false);

  const showVertical = hasTail && !flat;
  const displayHand = showVertical ? row : hand;
  /** L: без нахлёста; flat: обычные правила ряда (без доп. сжатия) */
  const rowOverlapPx = showVertical ? 0 : undefined;

  const toggleFlat = () => {
    const apply = () => setFlat((v) => !v);
    const doc = document as Document & {
      startViewTransition?: (update: () => void) => { finished: Promise<void> };
    };
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(apply);
    } else {
      apply();
    }
  };

  useLayoutEffect(() => {
    if (!hasTail) setFlat(false);
  }, [hasTail]);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const armH = armHRef.current;
    if (!shell || !armH) return;

    const measure = () => {
      const sr = shell.getBoundingClientRect();
      const hr = armH.getBoundingClientRect();
      const vr = showVertical ? armVRef.current?.getBoundingClientRect() : undefined;
      const w = Math.max(1, sr.width);
      const h = Math.max(1, sr.height);
      setGarlandBox({ w, h });

      const rel = (r: DOMRect) => ({
        l: r.left - sr.left,
        t: r.top - sr.top,
        r: r.right - sr.left,
        b: r.bottom - sr.top,
      });
      const H = rel(hr);
      const inset = 1.4;
      const rr = 13;

      if (!vr) {
        setGarlandPath(
          [
            `M ${H.l + rr},${H.t + inset}`,
            `L ${H.r - rr},${H.t + inset}`,
            `Q ${H.r - inset},${H.t + inset} ${H.r - inset},${H.t + rr}`,
            `L ${H.r - inset},${H.b - rr}`,
            `Q ${H.r - inset},${H.b - inset} ${H.r - rr},${H.b - inset}`,
            `L ${H.l + rr},${H.b - inset}`,
            `Q ${H.l + inset},${H.b - inset} ${H.l + inset},${H.b - rr}`,
            `L ${H.l + inset},${H.t + rr}`,
            `Q ${H.l + inset},${H.t + inset} ${H.l + rr},${H.t + inset}`,
            'Z',
          ].join(' '),
        );
        shell.style.setProperty('--l-join-w', '0px');
        return;
      }

      const V = rel(vr);
      const joinW = Math.max(V.r - V.l, 1);
      shell.style.setProperty('--l-join-w', `${joinW}px`);

      const Vt = V.t + inset;
      const Vl = V.l + inset;
      const Ht = H.t + inset;
      const Hl = H.l + inset;
      const Hr = H.r - inset;
      const Hb = H.b - inset;

      setGarlandPath(
        [
          `M ${Hl + rr},${Hb}`,
          `L ${Hr - rr},${Hb}`,
          `Q ${Hr},${Hb} ${Hr},${Hb - rr}`,
          `L ${Hr},${Vt + rr}`,
          `Q ${Hr},${Vt} ${Hr - rr},${Vt}`,
          `L ${Vl + rr},${Vt}`,
          `Q ${Vl},${Vt} ${Vl},${Vt + rr}`,
          `L ${Vl},${Ht}`,
          `L ${Hl + rr},${Ht}`,
          `Q ${Hl},${Ht} ${Hl},${Ht + rr}`,
          `L ${Hl},${Hb - rr}`,
          `Q ${Hl},${Hb} ${Hl + rr},${Hb}`,
          'Z',
        ].join(' '),
      );
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(shell);
    ro?.observe(armH);
    if (showVertical && armVRef.current) ro?.observe(armVRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [hand.length, tail.length, crest, gap, showVertical, flat]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let idleTimer = 0;
    const IDLE_MS = 9000;

    const bumpIdle = () => {
      setGarlandReady(false);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setGarlandReady(true), IDLE_MS);
    };

    bumpIdle();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    shell.addEventListener('pointerdown', bumpIdle, opts);
    shell.addEventListener('wheel', bumpIdle, opts);
    shell.addEventListener('touchstart', bumpIdle, opts);
    window.addEventListener('keydown', bumpIdle);
    return () => {
      window.clearTimeout(idleTimer);
      shell.removeEventListener('pointerdown', bumpIdle, opts);
      shell.removeEventListener('wheel', bumpIdle, opts);
      shell.removeEventListener('touchstart', bumpIdle, opts);
      window.removeEventListener('keydown', bumpIdle);
    };
  }, [hand.length, hasTail, flat]);

  useEffect(() => {
    if (!garlandReady || !garlandPath) return;
    const cyan = cyanDashRef.current;
    const violet = violetDashRef.current;
    const cyanGlow = cyanGlowRef.current;
    const violetGlow = violetGlowRef.current;
    if (!cyan || !violet) return;

    const DASH = 6.5;
    const GAP = 24;
    const PERIOD = DASH + GAP;
    const DURATION_MS = 36000;
    const dashAttr = `${DASH} ${GAP}`;
    for (const p of [cyan, violet, cyanGlow, violetGlow]) {
      if (!p) continue;
      p.removeAttribute('pathLength');
      p.setAttribute('stroke-dasharray', dashAttr);
    }
    const pathLen = Math.max(1, cyan.getTotalLength());

    let raf = 0;
    const tick = () => {
      const travel = (performance.now() / DURATION_MS) * pathLen;
      cyan.style.strokeDashoffset = String(-travel);
      violet.style.strokeDashoffset = String(-travel - PERIOD * 0.5);
      if (cyanGlow) cyanGlow.style.strokeDashoffset = String(-travel);
      if (violetGlow) violetGlow.style.strokeDashoffset = String(-travel - PERIOD * 0.5);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [garlandReady, garlandPath, garlandBox.w, garlandBox.h]);

  return (
    <div
      ref={shellRef}
      className={[
        'hand-layout-lab__l-shell',
        hasTail && showVertical ? 'hand-layout-lab__l-shell--armed' : '',
        hasTail && flat ? 'hand-layout-lab__l-shell--flat' : '',
        withAurora && showVertical ? 'hand-layout-lab__l-shell--aurora' : '',
        'hand-layout-lab__l-shell--your-turn',
        garlandReady ? 'hand-layout-lab__l-shell--garland-on' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={
        showVertical
          ? `L-рука: ${row.length} в ряду + ${tail.length} вверх`
          : flat && hasTail
            ? `Рука: ${hand.length} в одном ряду (свёрнуто)`
            : `Рука: ${displayHand.length} в ряду`
      }
    >
      {hasTail ? (
        <div
          ref={armVRef}
          className={[
            'hand-layout-lab__l-arm-v',
            flat ? 'hand-layout-lab__l-arm-v--collapsed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ gap }}
          aria-hidden={flat}
        >
          {!flat ? <LCrestToggleButton expanded onClick={toggleFlat} /> : null}
          {tail.map((card, i) => (
            <GameHandCard
              key={`${card.suit}${card.rank}-l-${i}`}
              card={card}
              z={i + 1}
            />
          ))}
        </div>
      ) : null}
      <div ref={armHRef} className="hand-layout-lab__l-arm-h">
        {hasTail && showVertical ? (
          <span className="hand-layout-lab__l-join-cap" aria-hidden />
        ) : null}
        {hasTail && flat ? (
          <LCrestToggleButton expanded={false} onClick={toggleFlat} docked />
        ) : null}
        <CurrentStyleRow hand={displayHand} overlapPx={rowOverlapPx} />
      </div>
      {garlandReady && garlandPath ? (
        <svg
          className="hand-layout-lab__l-garland"
          width={garlandBox.w}
          height={garlandBox.h}
          viewBox={`0 0 ${garlandBox.w} ${garlandBox.h}`}
          preserveAspectRatio="xMinYMin meet"
          aria-hidden
          focusable="false"
        >
          <path
            className="hand-layout-lab__l-garland-track"
            d={garlandPath}
            fill="none"
            vectorEffect="nonScalingStroke"
          />
          <path
            ref={cyanGlowRef}
            className="hand-layout-lab__l-garland-glow hand-layout-lab__l-garland-glow--cyan"
            d={garlandPath}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="nonScalingStroke"
          />
          <path
            ref={violetGlowRef}
            className="hand-layout-lab__l-garland-glow hand-layout-lab__l-garland-glow--violet"
            d={garlandPath}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="nonScalingStroke"
          />
          <path
            ref={cyanDashRef}
            className="hand-layout-lab__l-garland-dash hand-layout-lab__l-garland-dash--cyan"
            d={garlandPath}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="nonScalingStroke"
          />
          <path
            ref={violetDashRef}
            className="hand-layout-lab__l-garland-dash hand-layout-lab__l-garland-dash--violet"
            d={garlandPath}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="nonScalingStroke"
          />
        </svg>
      ) : null}
    </div>
  );
}

function HandStrip({
  variant,
  hand,
  crest = null,
}: {
  variant: LabVariant;
  hand: Card[];
  crest?: EastTailCrestId | null;
}) {
  if (variant === 'vertical') return null;

  if (variant === 'l-frame') {
    return (
      <div className="hand-layout-lab__hand-strip hand-layout-lab__hand-strip--l-frame">
        <LFrameHand hand={hand} crest={crest ?? 'hybrid'} />
      </div>
    );
  }

  if (variant === 'east-tail') {
    const { row, tail } = splitRowAndEastTail(hand);
    return (
      <div className="hand-layout-lab__hand-strip hand-layout-lab__hand-strip--east-main">
        <div className="hand-layout-lab__hand-frame hand-layout-lab__hand-frame--east-main">
          <div className="hand-layout-lab__east-row-anchor">
            <CurrentStyleRow hand={row} overlapPx={0} />
            {tail.length > 0 ? <EastTailColumn tail={tail} crest={crest} /> : null}
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
  crest = null,
  crestMeta = null,
}: {
  variant: LabVariant;
  handCount: HandCount;
  faceDeg?: FaceAngleDeg;
  phoneWidth?: PhoneWidth;
  crest?: EastTailCrestId | null;
  crestMeta?: { title: string; blurb: string } | null;
}) {
  const hand = useMemo(() => DEMO_HAND_12.slice(0, handCount), [handCount]);
  const meta = VARIANT_META[variant];
  const { row, tail } = useMemo(() => splitRowAndEastTail(hand), [hand]);
  const eastTailActive = variant === 'east-tail' && tail.length > 0;
  const lFrameActive = variant === 'l-frame' && tail.length > 0;

  const modeHint =
    variant === 'vertical'
      ? `landscape · лицо ${faceDeg > 0 ? '+' : ''}${faceDeg}° · ${handCount} карт`
      : variant === 'l-frame'
        ? lFrameActive
          ? `L · ряд ${row.length} + ↑${tail.length} · шевроны = свернуть/развернуть`
          : `≤9 · только горизонталь`
        : variant === 'east-tail'
          ? eastTailActive
            ? crestMeta
              ? `декор: ${crestMeta.title} · хвост ${tail.length}`
              : `ряд ${row.length} · хвост В ${tail.length} · 2 панели`
            : `≤9 · только ряд (хвоста нет)`
          : handCount <= 9
            ? `≤9 · один ряд как в игре`
            : `10+ · 2 строки вверх в сукно`;

  return (
    <article className="hand-layout-lab__cast-card">
      <div className="hand-layout-lab__cast-head">
        <span className="hand-layout-lab__badge">{crestMeta ? 'декор · Восток' : meta.badge}</span>
        <h3 className="hand-layout-lab__cast-title">{crestMeta ? crestMeta.title : meta.title}</h3>
        <p className="hand-layout-lab__cast-blurb">{crestMeta ? crestMeta.blurb : meta.blurb}</p>
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
        aria-label={`Слепок: ${crestMeta?.title ?? meta.title}`}
      >
        <div className="hand-layout-lab__phone-notch" aria-hidden />
        <div
          className={[
            'hand-layout-lab__table',
            variant === 'vertical' ? 'hand-layout-lab__table--vert' : '',
            variant === 'hybrid-b' && handCount >= 10 ? 'hand-layout-lab__table--two-rows' : '',
            eastTailActive ? 'hand-layout-lab__table--east-tail' : '',
            lFrameActive ? 'hand-layout-lab__table--l-frame' : '',
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
            <HandStrip variant={variant} hand={hand} crest={crest} />
            {variant === 'vertical' ? (
              <p className="hand-layout-lab__vert-note">
                рамка горизонтальная · лицо {faceDeg > 0 ? '+' : ''}
                {faceDeg}°
              </p>
            ) : null}
            {variant === 'east-tail' && eastTailActive ? (
              <p className="hand-layout-lab__vert-note">
                {crestMeta
                  ? `над крышкой · ${crestMeta.title}`
                  : `хвост Востока · ${tail.length} ${
                      tail.length === 1 ? 'карта' : tail.length < 5 ? 'карты' : 'карт'
                    }`}
              </p>
            ) : null}
            {variant === 'l-frame' && lFrameActive ? (
              <p className="hand-layout-lab__vert-note">
                L-рамка · ряд {row.length} + вверх {tail.length}
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
          Сравни идеи на 10–12 картах. Первая — <strong>L-рамка</strong> (горизонталь + продолжение
          вверх одной панелью). Рядом — две строки, 90°, и текущий «отдельный хвост». Прод не
          меняется.
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
          variant="l-frame"
          handCount={handCount}
          phoneWidth={phoneWidth}
          crest="hybrid"
        />
        <PhoneCast
          variant="east-tail"
          handCount={handCount}
          phoneWidth={phoneWidth}
          crest="hybrid"
          crestMeta={{
            title: 'Сейчас в проде · 2 панели',
            blurb: 'Отдельный хвост справа — для сравнения с L',
          }}
        />
        <PhoneCast variant="hybrid-b" handCount={handCount} phoneWidth={phoneWidth} />
        <PhoneCast
          variant="vertical"
          handCount={handCount}
          faceDeg={faceDeg}
          phoneWidth={phoneWidth}
        />
      </div>

      <div className="hand-layout-lab__crest-gallery">
        <div className="mode-label-lab__section-head hand-layout-lab__crest-gallery-head">
          <span className="mode-label-lab__badge">декор · над крышкой</span>
          <h2>Маркер фичи хвоста Востока</h2>
          <p>
            Все варианты — <strong>над верхней кромкой</strong> вертикального ряда (не в зазоре со
            стыком). Сравни на 10–12 картах; прод пока без декора.
          </p>
        </div>
        {handCount < 10 ? (
          <p className="hand-layout-lab__crest-gallery-hint" role="status">
            Выбери 10, 11 или 12 карт выше — иначе хвоста нет и декор не виден.
          </p>
        ) : (
          <div className="hand-layout-lab__casts hand-layout-lab__casts--crests">
            {EAST_TAIL_CRESTS.map((c) => (
              <PhoneCast
                key={c.id}
                variant="east-tail"
                handCount={handCount}
                phoneWidth={phoneWidth}
                crest={c.id}
                crestMeta={{ title: c.title, blurb: c.blurb }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
