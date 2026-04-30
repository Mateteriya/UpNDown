import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Ref,
  type RefObject,
} from 'react';

import {
  DEALS_PER_MATCH,
  getDealType,
  getTricksInDeal,
} from '../game/GameEngine';

import './deal-track-lab-orbit-tooltip.css';

/** Сколько карт в раздаче — без склонения: «КАРТ: n». */
function formatDealCardsCountLabel(tricks: number): string {
  return `КАРТ: ${tricks}`;
}

/** Для тултипов/aria: «КАРТ: n каждому». */
function formatDealCardsCountPerPlayer(tricks: number): string {
  return `КАРТ: ${tricks} каждому`;
}

/** Краткая подпись раздачи — как `_getDealCellLabel` в `GameTable` (ячейки таблицы). */
function getDealLabel(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  if (type === 'no-trump') return `${dealNumber} БК`;
  if (type === 'dark') return `${dealNumber} Тёмн.`;
  return `${dealNumber} (${formatDealCardsCountLabel(tricks)})`;
}

function formatTricksOnHand(tricks: number): string {
  return formatDealCardsCountLabel(tricks);
}

/** Правая подпись в вертикальной шкале: только карты, для БК/Тёмной добавляем режим. */
function getVerticalRowLabel(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  const base = formatDealCardsCountLabel(tricks);
  if (type === 'no-trump') return `БЕСКОЗЫРКА · ${base}`;
  if (type === 'dark') return `ТЁМНАЯ · ${base}`;
  return base;
}

/** Вторая строка под номером в круге B: режим + разделитель + карт на руках (или только карт). */
function DealCircleCenterCapContent({ dealNumber }: { dealNumber: number }) {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  const hand = formatTricksOnHand(tricks);
  if (type === 'no-trump' || type === 'dark') {
    const mode = type === 'no-trump' ? 'Бескозырка' : 'Тёмная';
    return (
      <>
        <span className="deal-track-lab-circle-center-cap-mode">{mode}</span>
        <span className="deal-track-lab-circle-center-cap-sep" aria-hidden />
        <span className="deal-track-lab-circle-center-cap-hand">{hand}</span>
      </>
    );
  }
  return <span className="deal-track-lab-circle-center-cap-hand">{hand}</span>;
}

const ORBIT_TOOLTIP_ID = 'deal-track-lab-orbit-tooltip';

/** Полная расшифровка для `title`, как `getDealCellTitle` у стола */
function getDealCellTitle(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  if (type === 'no-trump') return `Раздача №${dealNumber} — бескозырка`;
  if (type === 'dark') return `Раздача №${dealNumber} — тёмная`;
  return `Раздача №${dealNumber} — ${formatDealCardsCountLabel(tricks)}`;
}

/** Текст подсказки для шарика на орбите (круг B) — без нативного `title`, позиция задаётся вручную. */
function getOrbitPointTooltipText(dealNumber: number): string {
  const tricks = getTricksInDeal(dealNumber);
  return `${getDealCellTitle(dealNumber)} · ${formatDealCardsCountPerPlayer(tricks)}`;
}

/** Диск 420px, внутренний круг `.deal-track-lab-circle-inner { inset: 72px }` → радиус «дыры» = 210 − 72 (в дизайн-px). */
const ORBIT_DISK_DESIGN_PX = 420;
const ORBIT_INNER_INSET_DESIGN_PX = 72;
const ORBIT_INNER_RADIUS_RATIO =
  (ORBIT_DISK_DESIGN_PX / 2 - ORBIT_INNER_INSET_DESIGN_PX) / ORBIT_DISK_DESIGN_PX;

function getDealHueDegrees(dealNumber: number): number {
  return 186 + ((dealNumber - 1) / Math.max(1, DEALS_PER_MATCH - 1)) * 84;
}

/** Классический `hsl(H, S%, L%)` в CSS-переменные — без hsl(var(--x) …), чтобы градиенты не отбрасывались парсером. */
function orbitTooltipChromeVars(hue: number): CSSProperties {
  const norm = (d: number) => ((Math.round(d) % 360) + 360) % 360;
  const h0 = norm(hue);
  const h2 = norm(hue - 18);
  const h3 = norm(hue - 28);
  return {
    ['--orbit-tip-c0' as string]: `hsl(${h0}, 92%, 68%)`,
    ['--orbit-tip-c1' as string]: `hsl(${h0}, 88%, 58%)`,
    ['--orbit-tip-c2' as string]: `hsl(${h2}, 76%, 50%)`,
    ['--orbit-tip-c3' as string]: `hsl(${h3}, 82%, 52%)`,
  } as CSSProperties;
}

/** Центр тултипа в fixed-координатах: сдвиг от центра шарика вдоль радиуса наружу + лёгкий касательный перебор, без заезда во внутреннюю зону диска. */
function findOrbitTooltipPosition(
  diskRect: DOMRectReadOnly,
  ballRect: DOMRectReadOnly,
  text: string,
  measured?: { w: number; h: number },
): { left: number; top: number } {
  const bx = ballRect.left + ballRect.width / 2;
  const by = ballRect.top + ballRect.height / 2;
  const ballR = Math.max(ballRect.width, ballRect.height) / 2;
  const diskCx = diskRect.left + diskRect.width / 2;
  const diskCy = diskRect.top + diskRect.height / 2;
  const vx = bx - diskCx;
  const vy = by - diskCy;
  const vlen = Math.hypot(vx, vy) || 1;
  const ux = vx / vlen;
  const uy = vy / vlen;
  const px = -uy;
  const py = ux;

  const maxW =
    typeof window === 'undefined' ? 300 : Math.min(300, Math.max(160, window.innerWidth - 24));
  const charsPerLine = Math.max(22, Math.floor(maxW / 7.1));
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  const tw =
    measured?.w ?? Math.min(maxW, Math.max(168, text.length * 6.1 + 40));
  const th = measured?.h ?? 16 + lines * 20;

  const keepOutR = diskRect.width * ORBIT_INNER_RADIUS_RATIO + 10;

  const distDiskCenterToRect = (tcx: number, tcy: number): number => {
    const left = tcx - tw / 2;
    const right = tcx + tw / 2;
    const top = tcy - th / 2;
    const bottom = tcy + th / 2;
    const nx = Math.min(Math.max(diskCx, left), right);
    const ny = Math.min(Math.max(diskCy, top), bottom);
    return Math.hypot(diskCx - nx, diskCy - ny);
  };

  const clearsCenter = (tcx: number, tcy: number) => distDiskCenterToRect(tcx, tcy) >= keepOutR;

  const clamp = (tcx: number, tcy: number) => {
    const pad = 10;
    const hw = tw / 2;
    const hh = th / 2;
    const vw = typeof window === 'undefined' ? 800 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 600 : window.innerHeight;
    return {
      left: Math.min(vw - pad - hw, Math.max(pad + hw, tcx)),
      top: Math.min(vh - pad - hh, Math.max(pad + hh, tcy)),
    };
  };

  for (let d = ballR + 10; d <= 280; d += 4) {
    for (const s of [0, -48, 48, -96, 96] as const) {
      const tcx = bx + ux * d + px * s;
      const tcy = by + uy * d + py * s;
      if (clearsCenter(tcx, tcy)) return clamp(tcx, tcy);
    }
  }
  return clamp(bx + ux * (ballR + 120), by + uy * (ballR + 120));
}

/** Размер шариков раздачи (px) — общий для вертикали, круга и горизонтали; на круге центр: left/top + translate(-50%,-50%). */
const DEAL_TRACK_LAB_POINT_SIZE_PX = 26;

/** При каждом открытии экрана: один быстрый прогон подсветки от 1 до последней раздачи. */
const DEAL_TRACK_LAB_CYCLE_HIGHLIGHT_DEMO = true;
/** Длительность шага автопрогона (мс): меньше = быстрее. */
const DEAL_TRACK_LAB_CYCLE_STEP_MS = 95;
/** Задержка сброса hover с шарика — без неё при переходе между шарами мигание текст/полоска. */
const DEAL_TRACK_LAB_ORBIT_HOVER_LEAVE_MS = 95;

type EngineDealType = ReturnType<typeof getDealType>;

function getDealPointStyle(dealNumber: number): CSSProperties {
  return {
    '--deal-hue': `${getDealHueDegrees(dealNumber).toFixed(1)}`,
  } as CSSProperties;
}

/** Отдельная палитра для вертикальной шкалы: полный спектр (эффект «радуги») по всем 28 раздачам. */
function getVerticalDealHueDegrees(dealNumber: number): number {
  const t = (dealNumber - 1) / Math.max(1, DEALS_PER_MATCH - 1);
  return 6 + t * 348; // почти весь круг hue, без резкого шва на 0/360
}

function getVerticalDealPointStyle(dealNumber: number): CSSProperties {
  const hue = getVerticalDealHueDegrees(dealNumber);
  return {
    '--deal-hue': `${hue.toFixed(1)}`,
  } as CSSProperties;
}

/** Цвет свечения панели строки вертикали (совпадает по hue с шариком). */
function getVerticalDealRowStyle(dealNumber: number): CSSProperties {
  return {
    '--deal-row-hue': `${getVerticalDealHueDegrees(dealNumber).toFixed(1)}`,
  } as CSSProperties;
}

/** Горизонтальная шкала C: отдельный спектр (от холодного циана к мадженте), чтобы отличаться от вертикали. */
function getHorizontalDealHueDegrees(dealNumber: number): number {
  const t = (dealNumber - 1) / Math.max(1, DEALS_PER_MATCH - 1);
  // Почти полный круг hue + лёгкая волна: визуально «конфетнее» и контрастнее между соседями.
  const base = 10 + t * 340;
  const wave = Math.sin(t * Math.PI * 6) * 14;
  const hue = (base + wave + 360) % 360;
  return hue;
}

function getHorizontalDealPointStyle(dealNumber: number): CSSProperties {
  return {
    '--deal-hue': `${getHorizontalDealHueDegrees(dealNumber).toFixed(1)}`,
  } as CSSProperties;
}

type HorizontalDealLabelTone = 'default' | 'active' | 'done';

/** Градиент для блока «КАРТ: n» на горизонтальной шкале: по hue раздачи, несколько переходов. */
function getHorizontalDealCardsLabelStyle(
  dealNumber: number,
  tone: HorizontalDealLabelTone,
): CSSProperties {
  const hue = getHorizontalDealHueDegrees(dealNumber);
  const n = (d: number) => ((Math.round(d) % 360) + 360) % 360;
  const h0 = n(hue);
  const h1 = n(hue + 26);
  const h2 = n(hue + 58);
  const h3 = n(hue + 94);

  const clip = {
    WebkitBackgroundClip: 'text' as const,
    backgroundClip: 'text' as const,
    color: 'transparent',
    WebkitTextFillColor: 'transparent' as const,
  };

  if (tone === 'done') {
    return {
      ...clip,
      backgroundImage: `linear-gradient(96deg, hsl(${h0}, 82%, 95%) 0%, hsl(${h1}, 76%, 89%) 34%, hsl(${h2}, 86%, 82%) 68%, hsl(${h3}, 80%, 93%) 100%)`,
      textShadow: `0 0 18px hsl(${h0} / 0.66), 0 0 30px hsl(${h2} / 0.52), 0 1px 0 rgb(15 23 42 / 0.14)`,
    };
  }

  if (tone === 'active') {
    return {
      ...clip,
      backgroundImage: `linear-gradient(94deg, hsl(${h0}, 100%, 98%) 0%, hsl(${h1}, 94%, 94%) 24%, hsl(${h2}, 100%, 88%) 58%, hsl(${h3}, 96%, 97%) 100%)`,
      textShadow: `0 0 22px hsl(${h0} / 0.78), 0 0 40px hsl(${h2} / 0.64), 0 1px 0 rgb(15 23 42 / 0.1)`,
    };
  }

  return {
    ...clip,
    backgroundImage: `linear-gradient(94deg, hsl(${h0}, 46%, 80%) 0%, hsl(${h1}, 42%, 69%) 34%, hsl(${h2}, 52%, 60%) 68%, hsl(${h3}, 46%, 74%) 100%)`,
    textShadow: `0 0 8px hsl(${h0} / 0.28), 0 0 13px hsl(${h1} / 0.2), 0 1px 0 rgb(15 23 42 / 0.38)`,
  };
}

/** Подпись под горизонтальной шкалой: режим целиком; количество карт — «КАРТ: n» с отдельным градиентом. */
function HorizontalScaleDealLabel({
  dealNumber,
  active,
  done,
  stackedCards,
}: {
  dealNumber: number;
  active: boolean;
  done: boolean;
  stackedCards: boolean;
}) {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  const tone: HorizontalDealLabelTone = active ? 'active' : done ? 'done' : 'default';
  const cardsStyle = getHorizontalDealCardsLabelStyle(dealNumber, tone);

  const cards = (
    <span
      className={`deal-track-lab-h-label-cards ${stackedCards ? 'deal-track-lab-h-label-cards--stacked' : ''}`}
      style={cardsStyle}
    >
      <span className="deal-track-lab-h-label-cards-prefix">КАРТ:</span>
      <span className="deal-track-lab-h-label-cards-num">{tricks}</span>
    </span>
  );

  if (type === 'no-trump') {
    return (
      <>
        <span className="deal-track-lab-h-label-mode">БЕСКОЗЫРКА</span>
        {cards}
      </>
    );
  }

  if (type === 'dark') {
    return (
      <>
        <span className="deal-track-lab-h-label-mode">ТЁМНАЯ</span>
        {cards}
      </>
    );
  }

  return cards;
}

/** Позиция «неон»-пятна на орбите (совпадает с координатой шарика). */
function orbitSpotPosition(
  dealNumber: number,
  totalDeals: number,
  cx: number,
  cy: number,
  ringDotR: number,
): { left: number; top: number } {
  const rad = ((dealNumber - 1) / totalDeals) * Math.PI * 2 - Math.PI / 2;
  return {
    left: cx + Math.cos(rad) * ringDotR,
    top: cy + Math.sin(rad) * ringDotR,
  };
}

function getDealToneClass(type: EngineDealType): string {
  if (type === 'no-trump') return 'deal-track-lab-deck-strip--nt';
  if (type === 'dark') return 'deal-track-lab-deck-strip--dark';
  return 'deal-track-lab-deck-strip--normal';
}

/** Ширина полоски рубашек (px): padding 5+5, карта 8×n, gap 2×(n−1) — как в CSS полоски. */
function dealDeckStripWidthPx(tricks: number): number {
  const n = Math.max(0, tricks);
  return 10 + n * 8 + Math.max(0, n - 1) * 2;
}

/** В центре диска: при 5+ картах уменьшаем scale относительно ширины при 4 картах при базовом масштабе. */
function circleCenterDeckStripScale(tricks: number): number {
  const BASE = 2.68;
  if (tricks <= 4) return BASE;
  return BASE * (dealDeckStripWidthPx(4) / dealDeckStripWidthPx(tricks));
}

function pointGlowClass(type: EngineDealType, active: boolean, done: boolean): string {
  if (active) return 'deal-track-lab-point deal-track-lab-point--active';
  if (!done) return 'deal-track-lab-point deal-track-lab-point--future';
  if (type === 'no-trump')
    return 'deal-track-lab-point deal-track-lab-point--done deal-track-lab-point--nt';
  if (type === 'dark') return 'deal-track-lab-point deal-track-lab-point--done deal-track-lab-point--dark';
  return 'deal-track-lab-point deal-track-lab-point--done deal-track-lab-point--norm';
}

/** Для вертикали всегда используем hue-палитру (без отдельных NT/Dark-фиксированных цветов). */
function pointGlowClassVertical(active: boolean, done: boolean): string {
  if (active) return 'deal-track-lab-point deal-track-lab-point--active';
  if (!done) return 'deal-track-lab-point deal-track-lab-point--future';
  return 'deal-track-lab-point deal-track-lab-point--done deal-track-lab-point--norm';
}

/** Для горизонтали тоже hue-палитра без отдельных NT/Dark-фиксированных цветов. */
function pointGlowClassHorizontal(active: boolean, done: boolean): string {
  if (active) return 'deal-track-lab-point deal-track-lab-point--active';
  if (!done) return 'deal-track-lab-point deal-track-lab-point--future';
  return 'deal-track-lab-point deal-track-lab-point--done deal-track-lab-point--norm';
}

/** Номер раздачи поверх шарика горизонтальной шкалы C. */
function HorizontalScalePointNum({ dealNumber }: { dealNumber: number }) {
  return (
    <span
      className={`deal-track-lab-h-point-num ${dealNumber >= 10 ? 'deal-track-lab-h-point-num--two-digits' : ''}`}
      aria-hidden
    >
      {dealNumber}
    </span>
  );
}

function DealCardBackStrip({
  tricks,
  type,
  compact = false,
  inDiskCenter = false,
  vertical = false,
  verticalDown = false,
  /** Вариант C: раздачи до текущей — неоновая рамка вокруг мини-карт */
  horizontalScalePast = false,
}: {
  tricks: number;
  type: EngineDealType;
  compact?: boolean;
  /** Полоска в `.deal-track-lab-circle-center` — при 5+ картах масштаб уменьшается */
  inDiskCenter?: boolean;
  /** Для горизонтальной шкалы C: выкладка мини-карт вертикальным столбиком. */
  vertical?: boolean;
  /** Для нижней линии горизонтальной шкалы C: столбик карт вниз от линии. */
  verticalDown?: boolean;
  horizontalScalePast?: boolean;
}) {
  return (
    <div
      className={`deal-track-lab-deck-strip ${getDealToneClass(type)} ${compact ? 'deal-track-lab-deck-strip--compact' : ''} ${vertical ? 'deal-track-lab-deck-strip--vertical' : ''} ${verticalDown ? 'deal-track-lab-deck-strip--vertical-down' : ''} ${horizontalScalePast ? 'deal-track-lab-deck-strip--h-scale-past' : ''}`}
      aria-label={`Раздача · ${formatDealCardsCountLabel(tricks)} каждому игроку`}
      style={
        inDiskCenter
          ? ({
              '--deal-disk-strip-scale': String(circleCenterDeckStripScale(tricks)),
            } as CSSProperties)
          : undefined
      }
    >
      {Array.from({ length: tricks }, (_, idx) => (
        <span key={idx} className="deal-track-lab-mini-back" aria-hidden />
      ))}
    </div>
  );
}

type OrbitTooltipState = {
  deal: number;
  text: string;
  left: number;
  top: number;
  accentHue: number;
  /** После монтирования DOM — пересчёт по реальным размерам блока */
  refine?: boolean;
};

/** Радиус орбиты и центр в координатах макета 420×420 (круг B). */
const ORBIT_DOT_R = 176;
const ORBIT_DOT_CX = 210;
const ORBIT_DOT_CY = 210;

type OrbitTrackDiskProps = {
  /** Только основной диск — для позиционирования орбитального тултипа. */
  diskRef?: RefObject<HTMLDivElement | null>;
  interactive: boolean;
  normDeg: number;
  ntDeg: number;
  totalDeals: number;
  deals: readonly number[];
  currentDeal: number;
  hoveredDeal: number | null;
  focusedDeal: number;
  currentOrbitFloor: { left: number; top: number };
  previewOrbitFloor: { left: number; top: number } | null;
  warmOrbitGlowPos: { left: number; top: number } | null;
  orbitTooltipDeal: number | null;
  cancelOrbitHoverLeaveTimer: () => void;
  setHoveredDeal: React.Dispatch<React.SetStateAction<number | null>>;
  setOrbitTooltip: React.Dispatch<React.SetStateAction<OrbitTooltipState | null>>;
  showOrbitTooltip: (deal: number, target: HTMLElement) => void;
  setCurrentDeal: React.Dispatch<React.SetStateAction<number>>;
  orbitHoverLeaveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

function OrbitTrackDisk({
  diskRef,
  interactive,
  normDeg,
  ntDeg,
  totalDeals,
  deals,
  currentDeal,
  hoveredDeal,
  focusedDeal,
  currentOrbitFloor,
  previewOrbitFloor,
  warmOrbitGlowPos,
  orbitTooltipDeal,
  cancelOrbitHoverLeaveTimer,
  setHoveredDeal,
  setOrbitTooltip,
  showOrbitTooltip,
  setCurrentDeal,
  orbitHoverLeaveTimerRef,
}: OrbitTrackDiskProps) {
  return (
    <div
      ref={(interactive ? diskRef : undefined) as Ref<HTMLDivElement> | undefined}
      className="deal-track-lab-circle"
      data-deal-track-lab-disk
      data-orbit-preview={warmOrbitGlowPos != null ? '' : undefined}
      style={
        {
          '--norm-deg': `${normDeg}deg`,
          '--nt-deg': `${ntDeg}deg`,
        } as CSSProperties
      }
    >
      <div className="deal-track-lab-circle-phase" />
      <div className="deal-track-lab-circle-ring-donut" aria-hidden />
      <div
        className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--current"
        aria-hidden
        style={{
          left: currentOrbitFloor.left,
          top: currentOrbitFloor.top,
        }}
      />
      {previewOrbitFloor != null && (
        <div
          className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--hover-preview"
          aria-hidden
          style={{
            left: previewOrbitFloor.left,
            top: previewOrbitFloor.top,
          }}
        />
      )}
      {warmOrbitGlowPos != null && (
        <div
          className="deal-track-lab-circle-warm-orbit-glow"
          aria-hidden
          style={{
            left: warmOrbitGlowPos.left,
            top: warmOrbitGlowPos.top,
          }}
        />
      )}
      <div className="deal-track-lab-circle-inner" />
      <div
        className={
          hoveredDeal != null
            ? 'deal-track-lab-circle-center-spot deal-track-lab-circle-center-spot--lit'
            : 'deal-track-lab-circle-center-spot'
        }
        style={getDealPointStyle(focusedDeal)}
        aria-hidden
      />
      {deals.map((d) => {
        const angle = ((d - 1) / totalDeals) * Math.PI * 2 - Math.PI / 2;
        const x = ORBIT_DOT_CX + Math.cos(angle) * ORBIT_DOT_R;
        const y = ORBIT_DOT_CY + Math.sin(angle) * ORBIT_DOT_R;
        const active = d === currentDeal;
        const done = d < currentDeal;
        const type = getDealType(d);
        const tricks = getTricksInDeal(d);
        const pointClass = pointGlowClass(type, active, done);
        const pointStyle = {
          ...getDealPointStyle(d),
          position: 'absolute' as const,
          left: x,
          top: y,
        };
        if (!interactive) {
          return (
            <span
              key={`c-${d}`}
              className={pointClass}
              style={pointStyle}
              aria-hidden
            />
          );
        }
        return (
          <button
            key={`c-${d}`}
            className={pointClass}
            type="button"
            onClick={() => setCurrentDeal(d)}
            onMouseEnter={(e) => {
              cancelOrbitHoverLeaveTimer();
              setHoveredDeal(d);
              showOrbitTooltip(d, e.currentTarget);
            }}
            onMouseLeave={() => {
              cancelOrbitHoverLeaveTimer();
              orbitHoverLeaveTimerRef.current = setTimeout(() => {
                orbitHoverLeaveTimerRef.current = null;
                setHoveredDeal((prev) => (prev === d ? null : prev));
                setOrbitTooltip((t) => (t?.deal === d ? null : t));
              }, DEAL_TRACK_LAB_ORBIT_HOVER_LEAVE_MS);
            }}
            onFocus={(e) => {
              cancelOrbitHoverLeaveTimer();
              setHoveredDeal(d);
              showOrbitTooltip(d, e.currentTarget);
            }}
            onBlur={() => {
              cancelOrbitHoverLeaveTimer();
              orbitHoverLeaveTimerRef.current = setTimeout(() => {
                orbitHoverLeaveTimerRef.current = null;
                setHoveredDeal((prev) => (prev === d ? null : prev));
                setOrbitTooltip((t) => (t?.deal === d ? null : t));
              }, DEAL_TRACK_LAB_ORBIT_HOVER_LEAVE_MS);
            }}
            aria-label={`${getDealCellTitle(d)}, ${formatDealCardsCountPerPlayer(tricks)}`}
            aria-describedby={orbitTooltipDeal === d ? ORBIT_TOOLTIP_ID : undefined}
            style={pointStyle}
          />
        );
      })}
      <div className="deal-track-lab-circle-center">
        <div className="deal-track-lab-circle-center-label-row">
          <div className="deal-track-lab-circle-center-label-stack">
            <div
              className={
                hoveredDeal != null
                  ? 'deal-track-lab-circle-center-label-lit-wrap deal-track-lab-circle-center-stack-dim'
                  : 'deal-track-lab-circle-center-label-lit-wrap'
              }
              aria-hidden={hoveredDeal != null}
            >
              <div className="deal-track-lab-circle-center-label deal-track-lab-circle-center-label--current-head">
                Текущая раздача
              </div>
            </div>
            <div
              className={
                hoveredDeal == null
                  ? 'deal-track-lab-circle-center-preview-wrap deal-track-lab-circle-center-stack-dim'
                  : 'deal-track-lab-circle-center-preview-wrap'
              }
              aria-hidden={hoveredDeal == null}
            >
              <div className="deal-track-lab-circle-center-label deal-track-lab-circle-center-label--preview-pick">
                Выбрано
              </div>
              <div className="deal-track-lab-circle-center-label-bar" aria-hidden />
            </div>
          </div>
        </div>
        <div className="deal-track-lab-circle-center-num">{focusedDeal}</div>
        <div className="deal-track-lab-circle-center-cap">
          <DealCircleCenterCapContent dealNumber={focusedDeal} />
        </div>
        <DealCardBackStrip
          tricks={getTricksInDeal(focusedDeal)}
          type={getDealType(focusedDeal)}
          inDiskCenter
        />
      </div>
    </div>
  );
}

type OrbitBallGeom = { left: number; top: number; width: number; height: number };
type VerticalTooltipState = { text: string; left: number; top: number };
type HorizontalTooltipState = { text: string; left: number; top: number; placeBelow: boolean };

export function DealTrackLabPage({
  onBack,
  currentDealFromGame,
}: {
  onBack: () => void;
  /** Текущая раздача из реальной игры (для фиксации после демо-прогона). */
  currentDealFromGame?: number;
}) {
  const totalDeals = DEALS_PER_MATCH;
  const normalizeDeal = useCallback(
    (d: number | undefined) => {
      const n = Number.isFinite(d) ? Math.trunc(d as number) : 1;
      return Math.min(totalDeals, Math.max(1, n));
    },
    [totalDeals],
  );
  const [currentDeal, setCurrentDeal] = useState(() => normalizeDeal(currentDealFromGame));
  const [hoveredDeal, setHoveredDeal] = useState<number | null>(null);
  const [orbitTooltip, setOrbitTooltip] = useState<OrbitTooltipState | null>(null);
  const [verticalTooltip, setVerticalTooltip] = useState<VerticalTooltipState | null>(null);
  const [horizontalTooltip, setHorizontalTooltip] = useState<HorizontalTooltipState | null>(null);
  const diskRef = useRef<HTMLDivElement | null>(null);
  const orbitBallGeomRef = useRef<OrbitBallGeom | null>(null);
  const orbitHoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelOrbitHoverLeaveTimer = () => {
    if (orbitHoverLeaveTimerRef.current !== null) {
      clearTimeout(orbitHoverLeaveTimerRef.current);
      orbitHoverLeaveTimerRef.current = null;
    }
  };

  useEffect(() => () => cancelOrbitHoverLeaveTimer(), []);

  useEffect(() => {
    if (orbitTooltip == null) return;
    const hide = () => setOrbitTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [orbitTooltip]);

  useEffect(() => {
    if (horizontalTooltip == null) return;
    const hide = () => setHorizontalTooltip(null);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [horizontalTooltip]);

  const clearOrbitTooltip = useCallback(() => setOrbitTooltip(null), []);
  const clearVerticalTooltip = useCallback(() => setVerticalTooltip(null), []);
  const clearHorizontalTooltip = useCallback(() => setHorizontalTooltip(null), []);

  const showVerticalTooltip = useCallback((deal: number, target: HTMLElement) => {
    const r = target.getBoundingClientRect();
    setVerticalTooltip({
      text: `${getDealCellTitle(deal)} · ${formatDealCardsCountPerPlayer(getTricksInDeal(deal))}`,
      left: r.right + 12,
      top: r.top + r.height / 2,
    });
  }, []);

  const showHorizontalTooltip = useCallback(
    (deal: number, target: HTMLElement, placeBelow: boolean) => {
      const r = target.getBoundingClientRect();
      const text = `${getDealCellTitle(deal)} · ${formatDealCardsCountPerPlayer(getTricksInDeal(deal))}`;
      setHorizontalTooltip({
        text,
        left: r.left + r.width / 2,
        top: placeBelow ? r.bottom + 10 : r.top - 10,
        placeBelow,
      });
    },
    [],
  );

  const showOrbitTooltip = useCallback((deal: number, target: HTMLElement) => {
    const disk = diskRef.current;
    const diskRect = disk?.getBoundingClientRect();
    if (!diskRect) return;
    const br = target.getBoundingClientRect();
    orbitBallGeomRef.current = {
      left: br.left,
      top: br.top,
      width: br.width,
      height: br.height,
    };
    const ballRect = DOMRect.fromRect({
      x: br.left,
      y: br.top,
      width: br.width,
      height: br.height,
    });
    const text = getOrbitPointTooltipText(deal);
    const pos = findOrbitTooltipPosition(diskRect, ballRect, text);
    setOrbitTooltip({
      deal,
      text,
      left: pos.left,
      top: pos.top,
      accentHue: getDealHueDegrees(deal),
      refine: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (orbitTooltip?.refine !== true) return;
    const disk = diskRef.current?.getBoundingClientRect();
    const bg = orbitBallGeomRef.current;
    const el = document.getElementById(ORBIT_TOOLTIP_ID);
    if (!disk || !bg || !el) {
      setOrbitTooltip((t) => (t ? { ...t, refine: false } : t));
      return;
    }
    const ballRect = DOMRect.fromRect({
      x: bg.left,
      y: bg.top,
      width: bg.width,
      height: bg.height,
    });
    const { width: mw, height: mh } = el.getBoundingClientRect();
    const pos = findOrbitTooltipPosition(disk, ballRect, orbitTooltip.text, {
      w: Math.max(1, mw),
      h: Math.max(1, mh),
    });
    setOrbitTooltip((t) =>
      t && t.refine
        ? { ...t, left: pos.left, top: pos.top, refine: false }
        : t,
    );
  }, [orbitTooltip]);

  useEffect(() => {
    if (!DEAL_TRACK_LAB_CYCLE_HIGHLIGHT_DEMO) return;

    // После прогона возвращаемся к «текущей» раздаче игрока в живой партии.
    const targetDeal = normalizeDeal(currentDealFromGame);
    setCurrentDeal(1);

    let rafId = 0;
    let lastTs: number | null = null;
    let elapsed = 0;
    let step = 1;
    const maxStep = Math.max(1, totalDeals);

    const tick = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      elapsed += ts - lastTs;
      lastTs = ts;

      while (elapsed >= DEAL_TRACK_LAB_CYCLE_STEP_MS && step < maxStep) {
        elapsed -= DEAL_TRACK_LAB_CYCLE_STEP_MS;
        step += 1;
      }

      if (step >= maxStep) {
        setCurrentDeal(targetDeal);
        return;
      }

      setCurrentDeal(step);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [totalDeals, currentDealFromGame, normalizeDeal]);

  const deals = useMemo(
    () => Array.from({ length: totalDeals }, (_, i) => i + 1),
    [totalDeals],
  );
  const focusedDeal = hoveredDeal ?? currentDeal;
  const firstLineDeals = useMemo(() => deals.filter((d) => d <= 20), [deals]);
  const secondLineDeals = useMemo(() => deals.filter((d) => d >= 21), [deals]);
  /** Верхняя линия: компактно, но без нахлеста. */
  const H_LINE_STEP_UP_PX = 44;
  const H_LINE_GAP_UP_PX = 4;
  /** Нижняя линия: свободнее, чтобы длинные подписи были с заметным интервалом. */
  const H_LINE_STEP_DOWN_PX = 88;
  const H_LINE_GAP_DOWN_PX = 36;
  const firstLineProgressPct =
    currentDeal <= 1 ? 0 : currentDeal >= 20 ? 100 : ((currentDeal - 1) / (20 - 1)) * 100;
  const secondLineProgressPct =
    currentDeal <= 21 ? 0 : currentDeal >= 28 ? 100 : ((currentDeal - 21) / (28 - 21)) * 100;
  const firstLineWidthPx =
    firstLineDeals.length * H_LINE_STEP_UP_PX + Math.max(0, firstLineDeals.length - 1) * H_LINE_GAP_UP_PX;
  const secondLineWidthPx =
    secondLineDeals.length * H_LINE_STEP_DOWN_PX +
    Math.max(0, secondLineDeals.length - 1) * H_LINE_GAP_DOWN_PX;

  const normDeg = (20 / totalDeals) * 360;
  const ntDeg = (4 / totalDeals) * 360;

  /** Круг B: неон на орбите — два слоя: всегда текущая раздача; при hover на другую — второе пятно. */
  const circleRingDotR = 176;
  const circleCx = 210;
  const circleCy = 210;
  const currentOrbitFloor = orbitSpotPosition(currentDeal, totalDeals, circleCx, circleCy, circleRingDotR);
  const previewOrbitFloor =
    hoveredDeal != null && hoveredDeal !== currentDeal
      ? orbitSpotPosition(hoveredDeal, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  /** Рыжевато-оранжевое свечение от шара под курсором (в т.ч. когда это та же раздача, что и «текущая»). */
  const warmOrbitGlowPos =
    hoveredDeal != null
      ? orbitSpotPosition(hoveredDeal, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;

  return (
    <main
      className="deal-track-lab"
      style={{ '--deal-lab-point-size': `${DEAL_TRACK_LAB_POINT_SIZE_PX}px` } as CSSProperties}
    >
      <div className="deal-track-lab-inner">
        <header className="deal-track-lab-header">
          <div>
            <h1 className="deal-track-lab-title">Лаборатория шкалы раздач (ПК)</h1>
            <p className="deal-track-lab-sub">
              {totalDeals} раздач в партии — те же правила, что в таблице результатов (вверх / плато / вниз /
              бескозырка / тёмная).
            </p>
          </div>
          <button type="button" onClick={onBack} className="deal-track-lab-back">
            Назад
          </button>
        </header>

        <div className="deal-track-lab-panel">
          <div className="deal-track-lab-panel-text">
            Текущая раздача:{' '}
            <strong className="deal-track-lab-accent">{currentDeal}</strong> из {totalDeals}
            <span className="deal-track-lab-panel-hint"> — {getDealLabel(currentDeal)}</span>
          </div>
          <input
            type="range"
            className="deal-track-lab-range"
            min={1}
            max={totalDeals}
            value={currentDeal}
            onChange={(e) => setCurrentDeal(Number(e.target.value))}
            aria-label="Текущий номер раздачи"
          />
        </div>

        <div className="deal-track-lab-grid">
          <section className="deal-track-lab-card">
            <h2 className="deal-track-lab-h2">Вариант A: Вертикальная шкала</h2>
            <p className="deal-track-lab-card-lead">
              Слева — метка строки как в первом столбце таблицы; справа — полная подпись раздачи.
            </p>
            <div className="deal-track-lab-vertical">
              <div className="deal-track-lab-vertical-rail" aria-hidden />
              {deals.map((d) => {
                const active = d === currentDeal;
                const done = d < currentDeal;
                const type = getDealType(d);
                const tricks = getTricksInDeal(d);
                return (
                  <div
                    key={`v-${d}`}
                    className={`deal-track-lab-row ${active ? 'deal-track-lab-row--active' : ''} ${done ? 'deal-track-lab-row--done' : ''}`}
                    style={getVerticalDealRowStyle(d)}
                    onClick={() => setCurrentDeal(d)}
                    onMouseEnter={(e) => {
                      clearOrbitTooltip();
                      setHoveredDeal(d);
                      showVerticalTooltip(d, e.currentTarget);
                    }}
                    onFocus={(e) => {
                      clearOrbitTooltip();
                      setHoveredDeal(d);
                      showVerticalTooltip(d, e.currentTarget);
                    }}
                    onMouseLeave={() => {
                      setHoveredDeal((prev) => (prev === d ? null : prev));
                      clearVerticalTooltip();
                    }}
                    onBlur={() => clearVerticalTooltip()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCurrentDeal(d);
                      }
                    }}
                  >
                    <span className="deal-track-lab-col-label">{d}</span>
                    <span
                      className={
                        active
                          ? 'deal-track-lab-row-text deal-track-lab-row-text--active'
                          : done
                            ? 'deal-track-lab-row-text deal-track-lab-row-text--done'
                            : 'deal-track-lab-row-text'
                      }
                    >
                      {getVerticalRowLabel(d)}
                    </span>
                    <DealCardBackStrip tricks={tricks} type={type} compact />
                    <span
                      className={pointGlowClassVertical(active, done)}
                      style={getVerticalDealPointStyle(d)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <section className="deal-track-lab-card">
            <h2 className="deal-track-lab-h2">Вариант B: Круговая шкала</h2>
            <p className="deal-track-lab-card-lead">
              Визуал по мотивам бейджа «Ровно»: глубже фиолетовый фон, объёмные кольца, кликабельные точки.
            </p>
            <div className="deal-track-lab-circle-legend">
              <span className="deal-track-lab-legend-pill deal-track-lab-legend-pill--normal">Обычная</span>
              <span className="deal-track-lab-legend-pill deal-track-lab-legend-pill--nt">Бескозырка</span>
              <span className="deal-track-lab-legend-pill deal-track-lab-legend-pill--dark">Тёмная</span>
            </div>
            <div className="deal-track-lab-circle-b-row">
              <div className="deal-track-lab-circle-wrap deal-track-lab-circle-wrap--in-row">
                <OrbitTrackDisk
                  diskRef={diskRef}
                  interactive
                  normDeg={normDeg}
                  ntDeg={ntDeg}
                  totalDeals={totalDeals}
                  deals={deals}
                  currentDeal={currentDeal}
                  hoveredDeal={hoveredDeal}
                  focusedDeal={focusedDeal}
                  currentOrbitFloor={currentOrbitFloor}
                  previewOrbitFloor={previewOrbitFloor}
                  warmOrbitGlowPos={warmOrbitGlowPos}
                  orbitTooltipDeal={orbitTooltip?.deal ?? null}
                  cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                  setHoveredDeal={setHoveredDeal}
                  setOrbitTooltip={setOrbitTooltip}
                  showOrbitTooltip={showOrbitTooltip}
                  setCurrentDeal={setCurrentDeal}
                  orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                />
              </div>
              <button
                type="button"
                className="deal-track-lab-orbit-replica-btn"
                aria-label="Показать круговую шкалу на экране"
                onClick={() => {
                  diskRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }}
              >
                <span className="deal-track-lab-orbit-replica-inner" aria-hidden>
                  <OrbitTrackDisk
                    interactive={false}
                    normDeg={normDeg}
                    ntDeg={ntDeg}
                    totalDeals={totalDeals}
                    deals={deals}
                    currentDeal={currentDeal}
                    hoveredDeal={hoveredDeal}
                    focusedDeal={focusedDeal}
                    currentOrbitFloor={currentOrbitFloor}
                    previewOrbitFloor={previewOrbitFloor}
                    warmOrbitGlowPos={warmOrbitGlowPos}
                    orbitTooltipDeal={null}
                    cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                    setHoveredDeal={setHoveredDeal}
                    setOrbitTooltip={setOrbitTooltip}
                    showOrbitTooltip={showOrbitTooltip}
                    setCurrentDeal={setCurrentDeal}
                    orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                  />
                </span>
              </button>
            </div>
          </section>

          <section className="deal-track-lab-card deal-track-lab-card--wide">
            <h2 className="deal-track-lab-h2">Вариант C: Горизонтальная шкала</h2>
            <p className="deal-track-lab-card-lead">
              Линейный прогресс 1→{totalDeals}; подписи совпадают с ячейками таблицы (при наведении —
              полный тултип).
            </p>
            <div className="deal-track-lab-h-scroll">
              <div className="deal-track-lab-h-inner">
                <div
                  className="deal-track-lab-h-lane deal-track-lab-h-lane--up"
                  style={{ '--deal-h-lane-width': `${firstLineWidthPx}px` } as CSSProperties}
                >
                  <div className="deal-track-lab-h-track-bg" />
                  <div
                    className="deal-track-lab-h-track-fill"
                    style={{ width: `${firstLineProgressPct}%` }}
                  />
                  <div
                    className="deal-track-lab-h-dots"
                    style={{
                      gridTemplateColumns: `repeat(${firstLineDeals.length}, ${H_LINE_STEP_UP_PX}px)`,
                      gap: `${H_LINE_GAP_UP_PX}px`,
                    }}
                  >
                    {firstLineDeals.map((d) => {
                      const active = d === currentDeal;
                      const done = d < currentDeal;
                      const type = getDealType(d);
                      const tricks = getTricksInDeal(d);
                      return (
                        <div key={`h1-${d}`} className="deal-track-lab-h-cell">
                          <div className="deal-track-lab-h-point-stack">
                            <button
                              className={pointGlowClassHorizontal(active, done)}
                              style={getHorizontalDealPointStyle(d)}
                              type="button"
                              onClick={() => setCurrentDeal(d)}
                              onMouseEnter={(e) => {
                                clearOrbitTooltip();
                                clearHorizontalTooltip();
                                setHoveredDeal(d);
                                showHorizontalTooltip(d, e.currentTarget, false);
                              }}
                              onMouseLeave={() => {
                                setHoveredDeal((prev) => (prev === d ? null : prev));
                                clearHorizontalTooltip();
                              }}
                              onFocus={(e) => {
                                clearOrbitTooltip();
                                clearHorizontalTooltip();
                                setHoveredDeal(d);
                                showHorizontalTooltip(d, e.currentTarget, false);
                              }}
                              onBlur={() => {
                                setHoveredDeal((prev) => (prev === d ? null : prev));
                                clearHorizontalTooltip();
                              }}
                              aria-label={`${getDealCellTitle(d)}, ${formatDealCardsCountPerPlayer(tricks)}`}
                            >
                              <HorizontalScalePointNum dealNumber={d} />
                            </button>
                            <DealCardBackStrip
                              tricks={tricks}
                              type={type}
                              vertical
                              horizontalScalePast={done}
                            />
                          </div>
                          <div
                            className={
                              active
                                ? 'deal-track-lab-h-label deal-track-lab-h-label--active'
                                : done
                                  ? 'deal-track-lab-h-label deal-track-lab-h-label--done'
                                  : 'deal-track-lab-h-label'
                            }
                          >
                            <HorizontalScaleDealLabel
                              dealNumber={d}
                              active={active}
                              done={done}
                              stackedCards
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div
                  className="deal-track-lab-h-lane deal-track-lab-h-lane--down"
                  style={{ '--deal-h-lane-width': `${secondLineWidthPx}px` } as CSSProperties}
                >
                  <div className="deal-track-lab-h-track-bg" />
                  <div
                    className="deal-track-lab-h-track-fill"
                    style={{ width: `${secondLineProgressPct}%` }}
                  />
                  <div
                    className="deal-track-lab-h-dots"
                    style={{
                      gridTemplateColumns: `repeat(${secondLineDeals.length}, ${H_LINE_STEP_DOWN_PX}px)`,
                      gap: `${H_LINE_GAP_DOWN_PX}px`,
                    }}
                  >
                    {secondLineDeals.map((d) => {
                    const active = d === currentDeal;
                    const done = d < currentDeal;
                    const type = getDealType(d);
                    const tricks = getTricksInDeal(d);
                    return (
                      <div key={`h2-${d}`} className="deal-track-lab-h-cell">
                        <div className="deal-track-lab-h-point-stack">
                          <button
                            className={pointGlowClassHorizontal(active, done)}
                            style={getHorizontalDealPointStyle(d)}
                            type="button"
                            onClick={() => setCurrentDeal(d)}
                            onMouseEnter={(e) => {
                              clearOrbitTooltip();
                              clearHorizontalTooltip();
                              setHoveredDeal(d);
                              showHorizontalTooltip(d, e.currentTarget, true);
                            }}
                            onMouseLeave={() => {
                              setHoveredDeal((prev) => (prev === d ? null : prev));
                              clearHorizontalTooltip();
                            }}
                            onFocus={(e) => {
                              clearOrbitTooltip();
                              clearHorizontalTooltip();
                              setHoveredDeal(d);
                              showHorizontalTooltip(d, e.currentTarget, true);
                            }}
                            onBlur={() => {
                              setHoveredDeal((prev) => (prev === d ? null : prev));
                              clearHorizontalTooltip();
                            }}
                            aria-label={`${getDealCellTitle(d)}, ${formatDealCardsCountPerPlayer(tricks)}`}
                          >
                            <HorizontalScalePointNum dealNumber={d} />
                          </button>
                          <DealCardBackStrip
                            tricks={tricks}
                            type={type}
                            vertical
                            verticalDown
                            horizontalScalePast={done}
                          />
                        </div>
                        <div
                          className={
                            active
                              ? 'deal-track-lab-h-label deal-track-lab-h-label--active'
                              : done
                                ? 'deal-track-lab-h-label deal-track-lab-h-label--done'
                                : 'deal-track-lab-h-label'
                          }
                        >
                          <HorizontalScaleDealLabel
                            dealNumber={d}
                            active={active}
                            done={done}
                            stackedCards={false}
                          />
                        </div>
                      </div>
                    );
                  })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      {orbitTooltip != null &&
        createPortal(
          (() => {
            const sep = ' · ';
            const i = orbitTooltip.text.indexOf(sep);
            const tipMain = i === -1 ? orbitTooltip.text : orbitTooltip.text.slice(0, i);
            const tipSub = i === -1 ? null : orbitTooltip.text.slice(i + sep.length);
            return (
              <div
                id={ORBIT_TOOLTIP_ID}
                role="tooltip"
                className="deal-track-lab-orbit-tooltip"
                style={
                  {
                    position: 'fixed',
                    left: orbitTooltip.left,
                    top: orbitTooltip.top,
                    transform: 'translate(-50%, -50%)',
                    ...orbitTooltipChromeVars(orbitTooltip.accentHue),
                  } as CSSProperties
                }
              >
                <span className="deal-track-lab-orbit-tooltip__shine" aria-hidden />
                <div className="deal-track-lab-orbit-tooltip__inner">
                  <span className="deal-track-lab-orbit-tooltip__rail" aria-hidden />
                  <div className="deal-track-lab-orbit-tooltip__text">
                    <span className="deal-track-lab-orbit-tooltip__main">{tipMain}</span>
                    {tipSub != null && (
                      <>
                        <span className="deal-track-lab-orbit-tooltip__dot" aria-hidden>
                          {' '}
                          ·{' '}
                        </span>
                        <span className="deal-track-lab-orbit-tooltip__sub">{tipSub}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })(),
          document.body,
        )}
      {verticalTooltip != null &&
        createPortal(
          <div
            role="tooltip"
            className="deal-track-lab-vertical-tooltip"
            style={{
              position: 'fixed',
              left: verticalTooltip.left,
              top: verticalTooltip.top,
              transform: 'translate(0, -50%)',
            }}
          >
            {verticalTooltip.text}
          </div>,
          document.body,
        )}
      {horizontalTooltip != null &&
        createPortal(
          <div
            role="tooltip"
            className="deal-track-lab-vertical-tooltip deal-track-lab-horizontal-tooltip"
            style={{
              position: 'fixed',
              left: horizontalTooltip.left,
              top: horizontalTooltip.top,
              transform: horizontalTooltip.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
            }}
          >
            {horizontalTooltip.text}
          </div>,
          document.body,
        )}
    </main>
  );
}
