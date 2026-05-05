import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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

/** Правая подпись в вертикальной шкале: только карты, для БК/Тёмной добавляем режим. */
function getVerticalRowLabel(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  const base = formatDealCardsCountLabel(tricks);
  if (type === 'no-trump') return `БЕСКОЗЫРКА · ${base}`;
  if (type === 'dark') return `ТЁМНАЯ · ${base}`;
  return base;
}

/** «КАРТ:» + число — число красится отдельно (салатовый акцент). */
function DealCircleCenterCardsLine({ tricks }: { tricks: number }) {
  return (
    <span className="deal-track-lab-circle-center-cap-hand">
      <span className="deal-track-lab-circle-center-cap-hand-prefix">КАРТ:</span>{' '}
      <span className="deal-track-lab-circle-center-cap-num">{tricks}</span>
    </span>
  );
}

/** Вторая строка под номером в круге B: режим + карт на руках (или только карт). */
function DealCircleCenterCapContent({ dealNumber }: { dealNumber: number }) {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  if (type === 'no-trump' || type === 'dark') {
    const mode = type === 'no-trump' ? 'Бескозырка' : 'Тёмная';
    const modeClass =
      'deal-track-lab-circle-center-cap-mode' +
      (type === 'no-trump' ? ' deal-track-lab-circle-center-cap-mode--no-trump' : '');
    return (
      <>
        <span className={modeClass}>{mode}</span>
        <DealCircleCenterCardsLine tricks={tricks} />
      </>
    );
  }
  return <DealCircleCenterCardsLine tricks={tricks} />;
}

export const ORBIT_TOOLTIP_ID = 'deal-track-lab-orbit-tooltip';

/** Полная расшифровка раздачи (`aria-label`, текст кастомных тултипов) — без нативного `title`. */
function getDealCellTitle(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  if (type === 'no-trump') return `Раздача №${dealNumber} — бескозырка`;
  if (type === 'dark') return `Раздача №${dealNumber} — тёмная`;
  return `Раздача №${dealNumber} — ${formatDealCardsCountLabel(tricks)}`;
}

/** Текст подсказки для шарика на орбите (круг B) — без нативного `title`, позиция задаётся вручную. */
export function getOrbitPointTooltipText(dealNumber: number): string {
  const type = getDealType(dealNumber);
  const tricks = getTricksInDeal(dealNumber);
  if (type === 'normal') {
    return `Раздача №${dealNumber} · ${formatDealCardsCountPerPlayer(tricks)}`;
  }
  return `${getDealCellTitle(dealNumber)} · ${formatDealCardsCountPerPlayer(tricks)}`;
}

/** Диск 420px, внутренний круг `.deal-track-lab-circle-inner { inset: 72px }` → радиус «дыры» = 210 − 72 (в дизайн-px). */
const ORBIT_DISK_DESIGN_PX = 420;
const ORBIT_INNER_INSET_DESIGN_PX = 72;
const ORBIT_INNER_RADIUS_RATIO =
  (ORBIT_DISK_DESIGN_PX / 2 - ORBIT_INNER_INSET_DESIGN_PX) / ORBIT_DISK_DESIGN_PX;

/**
 * Цвет шарика орбиты: 1–14 — прежняя линейная прогрессия; 15–28 — плавный сдвиг в фиолет (от оттенка 14-й раздачи).
 */
function getOrbitBallHueDegrees(dealNumber: number): number {
  const last = Math.max(1, DEALS_PER_MATCH - 1);
  const linearHue = (n: number) => 186 + ((n - 1) / last) * 84;
  if (dealNumber <= 14) return linearHue(dealNumber);
  const h14 = linearHue(14);
  const hEnd = 288;
  const span = DEALS_PER_MATCH - 15;
  const t = span <= 0 ? 1 : (dealNumber - 15) / span;
  return h14 + t * (hEnd - h14);
}

/**
 * Hue заливки шарика на круге B: после swap 8–14 несут «логику» бывших 1–7, поэтому для фона
 * подставляем тот же спектр hue, что был у 1–7 (иначе 207–226° при тех же L% выглядят темнее).
 */
function getOrbitCirclePointHueDegrees(dealNumber: number): number {
  if (dealNumber >= 8 && dealNumber <= 14) {
    return getOrbitBallHueDegrees(dealNumber - 7);
  }
  return getOrbitBallHueDegrees(dealNumber);
}

/**
 * Мини-диск в покое: четыре цвета по кругу — голубой → фиолет → синий → лаванда.
 * Синий между фиолетом и сиренью по порядку раздач; hue лаванды ~286° (холодная сирень).
 */
/** синий слот — лазурно-электрический (~218°), дальше от фиолета/лаванды, чем ~242° */
const REPLICA_ORBIT_REST_HUES = [190, 260, 218, 286] as const;

function getReplicaOrbitRestHueDegrees(dealNumber: number): number {
  const i = ((dealNumber - 1) % 4 + 4) % 4;
  return REPLICA_ORBIT_REST_HUES[i];
}

function getOrbitCirclePointStyle(dealNumber: number): CSSProperties {
  return {
    '--deal-hue': `${getOrbitCirclePointHueDegrees(dealNumber).toFixed(1)}`,
  } as CSSProperties;
}

/** Hue цифры на орбите: 1–14 и 15–28 — разные оттенки (задача дизайна). */
export function getOrbitDigitHueDegrees(dealNumber: number): number {
  return dealNumber <= 14 ? 266 : 173;
}

/** Прошедшие 15–23: голубой глиф (циан / бирюза), не тот же hue что у «будущих» 15–28 (266°). */
function getOrbitPast1523DigitHueDegrees(dealNumber: number): number {
  const t = (dealNumber - 15) / (23 - 15);
  return 187 + t * 26;
}

/** Классический `hsl(H, S%, L%)` в CSS-переменные — без hsl(var(--x) …), чтобы градиенты не отбрасывались парсером. */
export function orbitTooltipChromeVars(hue: number): CSSProperties {
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

/** Мин. вынос центра тултипа от центра шарика вдоль радиуса (поверх радиуса шарика), px — дальше от кружка, меньше перекрытий. */
const ORBIT_TOOLTIP_MIN_GAP_BEYOND_BALL_PX = 36;
/** Fallback-вынос, если перебор не нашёл позицию. */
const ORBIT_TOOLTIP_FALLBACK_CENTER_DIST_PX = 148;

/** Центр тултипа в fixed-координатах: сдвиг от центра шарика вдоль радиуса наружу + лёгкий касательный перебор, без заезда во внутреннюю зону диска. */
export function findOrbitTooltipPosition(
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

  /** Мини-диск (~92 px): общий центр-поиск засовывает подсказку в середину экрана и мешает. */
  if (diskRect.width < 155) {
    const pad = 34;
    let tcx = diskRect.right + pad + tw / 2;
    const vwLo = typeof window === 'undefined' ? 9999 : window.innerWidth;
    if (tcx + tw / 2 > vwLo - pad) tcx = diskRect.left - pad - tw / 2;
    return clamp(tcx, by);
  }

  for (let d = ballR + ORBIT_TOOLTIP_MIN_GAP_BEYOND_BALL_PX; d <= 280; d += 4) {
    for (const s of [0, -48, 48, -96, 96] as const) {
      const tcx = bx + ux * d + px * s;
      const tcy = by + uy * d + py * s;
      if (clearsCenter(tcx, tcy)) return clamp(tcx, tcy);
    }
  }
  return clamp(
    bx + ux * (ballR + ORBIT_TOOLTIP_FALLBACK_CENTER_DIST_PX),
    by + uy * (ballR + ORBIT_TOOLTIP_FALLBACK_CENTER_DIST_PX),
  );
}

/** Размер шариков раздачи (px) — общий для вертикали, круга и горизонтали; на круге центр: left/top + translate(-50%,-50%). */
const DEAL_TRACK_LAB_POINT_SIZE_PX = 26;

/**
 * При открытии лаборатории: прогон «текущей» по орбите на основном круге (см. `introRunning` + `orbitSweepDeal`).
 * Вертикаль/горизонталь/мини-диск на целевой раздаче не гоняются — иначе 4 копии тяжёлых обновлений сразу.
 */
const DEAL_TRACK_LAB_CYCLE_HIGHLIGHT_DEMO = true;
/** Длительность шага автопрогона (мс): меньше = быстрее. */
export const DEAL_TRACK_LAB_CYCLE_STEP_MS = 95;
/**
 * Полный диск в модалке: при каждом открытии — быстрый прогон по орбите (отдельное состояние от страницы).
 * Выключить, если на слабых устройствах заметны лаги (в игре можно заменить на прогон только при первом открытии за сессию).
 */
export const DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN = true;
/** Резерв (раньше — шаг модального прогона в мс); сейчас прогон модалки — одна CSS-анимация `transform` (см. `orbitCssRingSweep`). */
export const DEAL_TRACK_LAB_MODAL_CYCLE_STEP_MS = 18;
/** Модалка полного диска: длительность CSS-прогона пятна по орбите (без 28× setState / кадр). */
export const DEAL_TRACK_LAB_MODAL_SWEEP_DURATION_MS = 1050;
/** Задержка сброса hover с шарика — без неё при переходе между шарами мигание текст/полоска. */
export const DEAL_TRACK_LAB_ORBIT_HOVER_LEAVE_MS = 95;
/** После клика по точке орбиты: центр держит превью «Выбрано», затем снова только «текущая раздача». */
const DEAL_TRACK_LAB_ORBIT_CLICK_PREVIEW_HOLD_MS = 1800;

type EngineDealType = ReturnType<typeof getDealType>;

function getDealPointStyle(dealNumber: number): CSSProperties {
  return {
    '--deal-hue': `${getOrbitBallHueDegrees(dealNumber).toFixed(1)}`,
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
export function orbitSpotPosition(
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

export type OrbitTooltipState = {
  deal: number;
  text: string;
  left: number;
  top: number;
  accentHue: number;
  /** После монтирования DOM — пересчёт по реальным размерам блока */
  refine?: boolean;
};

/** Иконка на мини-диске: «развернуть полную шкалу» (стрелки из углов — как fullscreen / больше экрана). */
function DealTrackLabLaunchScaleGlyph({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden
        focusable="false"
        className="deal-track-lab-circle-center-launch-icon-svg"
      >
        <path
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
        />
      </svg>
    </span>
  );
}

/** Радиус орбиты и центр в координатах макета 420×420 (круг B). */
const ORBIT_DOT_R = 176;
const ORBIT_DOT_CX = 210;
const ORBIT_DOT_CY = 210;

/**
 * Плашка «Текущая раздача» на большом диске: дуга (два штриха по одной кривой + textPath).
 * Прямоугольные ::before/::after для этого варианта отключаются классом `--volume-main-plaque--arc`.
 */
function DealTrackLabVolumeMainArcPlaque() {
  const baseId = `dtl-arc-${useId().replace(/:/g, '')}`;
  const curveId = `${baseId}-curve`;
  /* Узкая дуга: «рога» ближе к центру; контрольная точка выше — сильнее закрутка под верх внутреннего круга */
  const d = 'M 56 52 Q 136 9 216 52';

  return (
    <svg
      className="deal-track-lab-volume-main-arc-plaque"
      viewBox="0 0 272 84"
      width="100%"
      style={{ height: 'auto' }}
      aria-hidden
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      <defs>
        <linearGradient
          id={`${baseId}-neon`}
          gradientUnits="userSpaceOnUse"
          x1="20"
          y1="78"
          x2="248"
          y2="2"
        >
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="11%" stopColor="#5eead4" />
          <stop offset="28%" stopColor="#06b6d4" />
          <stop offset="46%" stopColor="#22d3ee" />
          <stop offset="63%" stopColor="#818cf8" />
          <stop offset="80%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#fdf4ff" />
        </linearGradient>
        <linearGradient
          id={`${baseId}-inner`}
          gradientUnits="userSpaceOnUse"
          x1="44"
          y1="82"
          x2="220"
          y2="8"
        >
          <stop offset="0%" stopColor="rgb(58, 46, 140)" />
          <stop offset="28%" stopColor="rgb(42, 32, 115)" />
          <stop offset="58%" stopColor="rgb(28, 22, 82)" />
          <stop offset="100%" stopColor="rgb(14, 11, 48)" />
        </linearGradient>
        <linearGradient
          id={`${baseId}-glyph`}
          gradientUnits="userSpaceOnUse"
          x1="20"
          y1="78"
          x2="248"
          y2="2"
        >
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="11%" stopColor="#5eead4" />
          <stop offset="28%" stopColor="#06b6d4" />
          <stop offset="46%" stopColor="#22d3ee" />
          <stop offset="63%" stopColor="#818cf8" />
          <stop offset="80%" stopColor="#d946ef" />
          <stop offset="100%" stopColor="#fdf4ff" />
        </linearGradient>
        {/* Только размытие — без слияния с исходным штрихом: чёткая рамка сверху */}
        {/* Чуть слабее blur — меньше «мазни» под правым краем подписи («дача») */}
        <filter id={`${baseId}-glow`} x="-45%" y="-45%" width="190%" height="190%">
          <feGaussianBlur stdDeviation="2.25" result="blur" />
        </filter>
        <path id={curveId} d={d} fill="none" />
      </defs>
      {/* Мягкое свечение под неоном: butt — без круглых «шапок» на концах дуги (они усиливали размытие у «дача») */}
      <path
        d={d}
        fill="none"
        stroke={`url(#${baseId}-neon)`}
        strokeWidth={35}
        strokeLinecap="butt"
        strokeLinejoin="round"
        opacity={0.28}
        filter={`url(#${baseId}-glow)`}
      />
      {/* Резкий неоновый обод (заметно тоньше исходных 44/42/30) */}
      <path
        d={d}
        fill="none"
        stroke={`url(#${baseId}-neon)`}
        strokeWidth={32}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={d}
        fill="none"
        stroke={`url(#${baseId}-inner)`}
        strokeWidth={22}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <text
        className="deal-track-lab-volume-main-arc-plaque__glyph"
        fill={`url(#${baseId}-glyph)`}
        dominantBaseline="middle"
        textAnchor="middle"
      >
        <textPath href={`#${curveId}`} startOffset="50%">
          Текущая раздача
        </textPath>
      </text>
    </svg>
  );
}

type OrbitTrackDiskProps = {
  /** Только основной диск (якорь прокрутки); тултип берёт контейнер с `[data-deal-track-lab-disk]` у цели события. */
  diskRef?: RefObject<HTMLDivElement>;
  normDeg: number;
  ntDeg: number;
  totalDeals: number;
  deals: readonly number[];
  currentDeal: number;
  /** Превью в центре («Выбрано»): ход по орбите или удержание после клика. */
  orbitPreviewUiActive: boolean;
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
  /** После клика: превью, затем таймер; по окончании — вернуть `currentDeal` к `revertCurrentDealTo`. */
  beginOrbitClickPreviewHold: (deal: number, revertCurrentDealTo: number) => void;
  /** Снова разрешить превью по hover (новый заход на точку или уход с диска). */
  onOrbitHoverResume: () => void;
  /** Гасит CSS :hover у точек, пока курсор физически остался над ними. */
  orbitCssSuppressHover: boolean;
  /** Удержание превью после клика по точке — розовый акцент номера раздачи. */
  orbitHoldPinkAccent: boolean;
  /** Мини-диск: цифра в центре — кнопка «полная шкала». */
  centerNumOpensLargeScale?: boolean;
  onOpenLargeScale?: () => void;
  largeScaleModalOpen?: boolean;
  replicaLaunchButtonRef?: RefObject<HTMLButtonElement>;
  /** Номера раздач внутри орбитальных шариков — только у крупного диска (не мини-диск / модалка). */
  orbitPointDealNumbers?: boolean;
  /** Только большой диск B: полоска рубашек над строкой «КАРТ:»; у реплики порядок прежний. */
  deckStripAboveCap?: boolean;
  /** Мини-диск: полный спектр hue у орбитальных шаров (не узкий коридор как у большого диска). */
  orbitReplicaSpectrum?: boolean;
  /** Мини-диск в колонке реплики — отдельный класс круга для CSS (состояния шаров не гасятся при hover на виджет). */
  orbitReplica?: boolean;
  /** Игра: клик по точке не меняет раздачу — только просмотр и тултипы. */
  orbitPointsReadOnly?: boolean;
  /** Автопрогон по орбите: без transition на пятнах — позиция следует шагу без «догоняющей» анимации. */
  orbitSweepInstant?: boolean;
  /**
   * Модалка: один плавный круговой прогон подсветки по орбите (только `transform` в CSS, без смены `currentDeal` на каждом кадре).
   * Скрывает обычные React-слои пятен на время анимации.
   */
  orbitCssRingSweep?: { durationMs: number; onEnd: () => void } | null;
  /** Во время быстрого прогона: подкрашивает floor/glow текущим hue шага. */
  orbitSweepNeonHue?: number | null;
  /**
   * Раскладка дуговой плашки «Текущая раздача» и второй строки (бескозырка/тёмная): якорь на фактическую раздачу партии.
   * Без этого при автопрогоне тип раздачи в центре мигал бы (1…28) и дёргал margin/placement плашки.
   */
  centerLabelLayoutDeal?: number;
};

export function OrbitTrackDisk({
  diskRef,
  normDeg,
  ntDeg,
  totalDeals,
  deals,
  currentDeal,
  orbitPreviewUiActive,
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
  beginOrbitClickPreviewHold,
  onOrbitHoverResume,
  orbitCssSuppressHover,
  orbitHoldPinkAccent,
  centerNumOpensLargeScale,
  onOpenLargeScale,
  largeScaleModalOpen,
  replicaLaunchButtonRef,
  orbitPointDealNumbers = false,
  deckStripAboveCap = false,
  orbitReplicaSpectrum = false,
  orbitReplica = false,
  orbitPointsReadOnly = false,
  orbitSweepInstant = false,
  orbitCssRingSweep = null,
  orbitSweepNeonHue = null,
  centerLabelLayoutDeal,
}: OrbitTrackDiskProps) {
  const [launchScaleCenterHot, setLaunchScaleCenterHot] = useState(false);
  const cssRingSweepNotifiedRef = useRef(false);
  useEffect(() => {
    cssRingSweepNotifiedRef.current = false;
  }, [orbitCssRingSweep?.durationMs, orbitCssRingSweep != null]);
  const suppressOrbitalReactFloors = orbitCssRingSweep != null;
  const centerDealDisplay = orbitPreviewUiActive ? focusedDeal : currentDeal;
  const centerDealType = getDealType(centerDealDisplay);
  const layoutDealForCenterLabel =
    centerLabelLayoutDeal !== undefined ? centerLabelLayoutDeal : centerDealDisplay;
  const centerCapLayoutType = getDealType(layoutDealForCenterLabel);
  const centerCapTwoRows =
    centerCapLayoutType === 'no-trump' || centerCapLayoutType === 'dark';
  const centerNumPinkMod = orbitHoldPinkAccent ? ' deal-track-lab-circle-center-num--orbit-hold-pink' : '';
  const showArcCurrentDealPlaque =
    orbitPointDealNumbers && !(centerNumOpensLargeScale && launchScaleCenterHot);

  /** Превью совпадает с «текущей» по орбите (прогон или hover на ту же раздачу): нужен слой --hover-preview, иначе только слабый --current. */
  const sameSpotPreviewMode = orbitPreviewUiActive && previewOrbitFloor == null;
  const sameSpotFloorPos = warmOrbitGlowPos ?? currentOrbitFloor;

  return (
    <div
      ref={diskRef ?? undefined}
      className={
        [
          orbitPointDealNumbers
            ? 'deal-track-lab-circle deal-track-lab-circle--orbit-nums deal-track-lab-disk-volume-main'
            : 'deal-track-lab-circle',
          orbitReplica ? 'deal-track-lab-circle--orbit-replica' : '',
        ]
          .filter(Boolean)
          .join(' ')
      }
      data-deal-track-lab-disk
      data-deal-track-lab-orbit-replica={orbitReplica ? '' : undefined}
      data-deal-track-lab-center-cap-two-rows={
        orbitPointDealNumbers && centerCapTwoRows ? '' : undefined
      }
      data-deal-track-lab-orbit-preview-ui={orbitPreviewUiActive ? '' : undefined}
      data-orbit-hover-suppressed={orbitCssSuppressHover ? '' : undefined}
      data-orbit-preview={warmOrbitGlowPos != null ? '' : undefined}
      data-orbit-sweep-instant={orbitSweepInstant ? '' : undefined}
      data-orbit-sweep-multicolor={orbitSweepNeonHue != null ? '' : undefined}
      style={
        {
          '--norm-deg': `${normDeg}deg`,
          '--nt-deg': `${ntDeg}deg`,
          ...(orbitSweepNeonHue != null ? { ['--orbit-sweep-hue' as string]: `${orbitSweepNeonHue}` } : {}),
        } as CSSProperties
      }
      onMouseLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          onOrbitHoverResume();
        }
      }}
    >
      <div className="deal-track-lab-circle-phase" />
      <div className="deal-track-lab-circle-ring-donut" aria-hidden />
      {!sameSpotPreviewMode && !suppressOrbitalReactFloors && (
        <div
          className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--current"
          aria-hidden
          style={{
            left: currentOrbitFloor.left,
            top: currentOrbitFloor.top,
          }}
        />
      )}
      {previewOrbitFloor != null && !suppressOrbitalReactFloors && (
        <div
          className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--hover-preview"
          aria-hidden
          style={{
            left: previewOrbitFloor.left,
            top: previewOrbitFloor.top,
          }}
        />
      )}
      {sameSpotPreviewMode && !suppressOrbitalReactFloors && (
        <div
          className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--hover-preview"
          aria-hidden
          style={{
            left: sameSpotFloorPos.left,
            top: sameSpotFloorPos.top,
          }}
        />
      )}
      <div className="deal-track-lab-circle-inner" />
      <div
        className={
          orbitPreviewUiActive
            ? 'deal-track-lab-circle-center-spot deal-track-lab-circle-center-spot--lit'
            : 'deal-track-lab-circle-center-spot'
        }
        style={getDealPointStyle(centerDealDisplay)}
        aria-hidden
      />
      {orbitPointDealNumbers ? <div className="deal-track-lab-sphere-dome" aria-hidden /> : null}
      {orbitPointDealNumbers ? <div className="deal-track-lab-torus-facet" aria-hidden /> : null}
      {warmOrbitGlowPos != null && !suppressOrbitalReactFloors && (
        <div
          className="deal-track-lab-circle-warm-orbit-glow"
          aria-hidden
          style={{
            left: warmOrbitGlowPos.left,
            top: warmOrbitGlowPos.top,
          }}
        />
      )}
      {orbitCssRingSweep != null && (
        <div
          className="deal-track-lab-orbit-css-sweep"
          aria-hidden
          style={
            {
              ['--orbit-css-sweep-ms' as string]: `${orbitCssRingSweep.durationMs}ms`,
              ['--orbit-css-sweep-segments' as string]: String(totalDeals),
            } as CSSProperties
          }
        >
          <div
            className="deal-track-lab-orbit-css-sweep-rotor"
            onAnimationEnd={(e) => {
              if (e.target !== e.currentTarget) return;
              if (cssRingSweepNotifiedRef.current) return;
              cssRingSweepNotifiedRef.current = true;
              orbitCssRingSweep.onEnd();
            }}
          >
            <div className="deal-track-lab-circle-active-floor deal-track-lab-circle-active-floor--current deal-track-lab-orbit-css-sweep-spot" aria-hidden />
          </div>
        </div>
      )}
      {deals.map((d) => {
        const angle = ((d - 1) / totalDeals) * Math.PI * 2 - Math.PI / 2;
        const x = ORBIT_DOT_CX + Math.cos(angle) * ORBIT_DOT_R;
        const y = ORBIT_DOT_CY + Math.sin(angle) * ORBIT_DOT_R;
        const active = d === currentDeal;
        const done = d < currentDeal;
        const type = getDealType(d);
        const tricks = getTricksInDeal(d);
        const pointClass = pointGlowClass(type, active, done);
        /** Прошедшие 15–28: цифра визуально как «будущая» у 1–14 (hue + градиент future). */
        const orbitPastSecondHalfFutureDigit = done && d >= 15 && d <= 28;
        /** Лиловый/ранний индиго коридор 15–23: светлее глифа, чем у 24–28 (контраст к шару). */
        const orbitPastSecondHalfFutureDigitBright = done && d >= 15 && d <= 23;
        const pointStyle: CSSProperties = {
          ...getOrbitCirclePointStyle(d),
          ...(orbitReplicaSpectrum
            ? { [`--orbit-replica-rest-hue`]: `${getReplicaOrbitRestHueDegrees(d).toFixed(1)}` }
            : {}),
          position: 'absolute',
          left: x,
          top: y,
        };
        return (
          <button
            key={`c-${d}`}
            className={pointClass}
            type="button"
            {...(d >= 1 && d <= 7 ? { 'data-orbit-ball-segment': 'mid' } : {})}
            {...(d >= 15 && d <= 21 ? { 'data-orbit-ball-tone': 'lilac' } : {})}
            {...(d >= 22 && d <= 28 ? { 'data-orbit-ball-tone': 'indigo' } : {})}
            {...(orbitPastSecondHalfFutureDigit ? { 'data-orbit-past-second-half-light': '' } : {})}
            {...(orbitReplicaSpectrum
              ? {
                  'data-orbit-replica-tint': (
                    ['cyan', 'violet', 'blue', 'lavender'] as const
                  )[((d - 1) % 4 + 4) % 4],
                }
              : {})}
            onClick={(e) => {
              if (orbitPointsReadOnly) {
                e.preventDefault();
                const revertTo = currentDeal;
                cancelOrbitHoverLeaveTimer();
                beginOrbitClickPreviewHold(d, revertTo);
                const el = e.currentTarget;
                requestAnimationFrame(() => {
                  if (typeof el.matches === 'function' && !el.matches(':focus-visible')) {
                    el.blur();
                  }
                });
                return;
              }
              const revertTo = currentDeal;
              setCurrentDeal(d);
              cancelOrbitHoverLeaveTimer();
              beginOrbitClickPreviewHold(d, revertTo);
              const el = e.currentTarget;
              requestAnimationFrame(() => {
                if (typeof el.matches === 'function' && !el.matches(':focus-visible')) {
                  el.blur();
                }
              });
            }}
            onMouseEnter={(e) => {
              onOrbitHoverResume();
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
              const el = e.currentTarget;
              if (typeof el.matches === 'function' && el.matches(':focus-visible')) {
                onOrbitHoverResume();
                setHoveredDeal(d);
                showOrbitTooltip(d, el);
              }
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
          >
            {orbitPointDealNumbers ? (
              <span
                className={
                  [
                    d >= 20
                      ? 'deal-track-lab-orbit-point-num deal-track-lab-orbit-point-num--two deal-track-lab-orbit-point-num--two-late'
                      : d >= 10
                        ? 'deal-track-lab-orbit-point-num deal-track-lab-orbit-point-num--two'
                        : 'deal-track-lab-orbit-point-num',
                    orbitPastSecondHalfFutureDigit ? 'deal-track-lab-orbit-point-num--past-as-future-pale' : '',
                    orbitPastSecondHalfFutureDigitBright
                      ? 'deal-track-lab-orbit-point-num--past-as-future-pale-bright'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                }
                style={
                  {
                    '--orbit-digit-h': `${
                      orbitPastSecondHalfFutureDigitBright
                        ? d >= 18 && d <= 23
                          ? getOrbitPast1523DigitHueDegrees(15)
                          : getOrbitPast1523DigitHueDegrees(d)
                        : orbitPastSecondHalfFutureDigit
                          ? 266
                          : getOrbitDigitHueDegrees(d)
                    }`,
                  } as CSSProperties
                }
                aria-hidden
              >
                {d}
              </span>
            ) : null}
          </button>
        );
      })}
      <div className="deal-track-lab-circle-center">
        <div className="deal-track-lab-circle-center-label-strip">
          <div className="deal-track-lab-circle-center-label-row">
            <div className="deal-track-lab-circle-center-label-stack">
              <div
                className={[
                  'deal-track-lab-circle-center-label-lit-wrap',
                  orbitPreviewUiActive ? 'deal-track-lab-circle-center-stack-dim' : '',
                  orbitPointDealNumbers ? 'deal-track-lab-circle-center-label-lit-wrap--volume-main-plaque' : '',
                  showArcCurrentDealPlaque ? 'deal-track-lab-circle-center-label-lit-wrap--volume-main-plaque--arc' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-hidden={orbitPreviewUiActive}
              >
                <div
                  className={
                    centerNumOpensLargeScale && launchScaleCenterHot
                      ? 'deal-track-lab-circle-center-label deal-track-lab-circle-center-label--current-head deal-track-lab-circle-center-label--launch-hint'
                      : showArcCurrentDealPlaque
                        ? 'deal-track-lab-circle-center-label deal-track-lab-circle-center-label--current-head deal-track-lab-circle-center-label--volume-arc'
                        : 'deal-track-lab-circle-center-label deal-track-lab-circle-center-label--current-head'
                  }
                  aria-label={showArcCurrentDealPlaque ? 'Текущая раздача' : undefined}
                >
                  {centerNumOpensLargeScale && launchScaleCenterHot ? (
                    <>
                      <span className="deal-track-lab-circle-center-label--launch-hint-title">
                        Шкала раздач в партии.
                      </span>
                      <span className="deal-track-lab-circle-center-label--launch-hint-cta">Открыть</span>
                    </>
                  ) : showArcCurrentDealPlaque ? (
                    <DealTrackLabVolumeMainArcPlaque />
                  ) : (
                    'Текущая раздача'
                  )}
                </div>
              </div>
              <div
                className={
                  !orbitPreviewUiActive
                    ? 'deal-track-lab-circle-center-preview-wrap deal-track-lab-circle-center-stack-dim'
                    : 'deal-track-lab-circle-center-preview-wrap'
                }
                aria-hidden={!orbitPreviewUiActive}
              >
                <div className="deal-track-lab-circle-center-label deal-track-lab-circle-center-label--preview-pick">
                  Выбрано
                </div>
                <div className="deal-track-lab-circle-center-label-bar" aria-hidden />
              </div>
            </div>
          </div>
          {centerCapTwoRows && (
            <div className="deal-track-lab-circle-center-label-row deal-track-lab-circle-center-label-row--deal-type-dup">
              <div
                className={
                  'deal-track-lab-circle-center-label-lit-wrap' +
                  (orbitPointDealNumbers ? ' deal-track-lab-circle-center-label-lit-wrap--volume-main-plaque' : '')
                }
                aria-hidden
              >
                <div className="deal-track-lab-circle-center-label deal-track-lab-circle-center-label--current-head deal-track-lab-circle-center-label--deal-type-dup">
                  <span
                    className={
                      'deal-track-lab-circle-center-label--deal-type-dup-mode' +
                      (centerCapLayoutType === 'no-trump'
                        ? ' deal-track-lab-circle-center-label--deal-type-dup-mode--no-trump'
                        : '')
                    }
                  >
                    {centerCapLayoutType === 'no-trump' ? 'Бескозырка' : 'Тёмная'}
                  </span>
                  <span className="deal-track-lab-circle-center-label--deal-type-dup-kartline">
                    <span className="deal-track-lab-circle-center-label--deal-type-dup-kart">КАРТ:</span>{' '}
                    <span className="deal-track-lab-circle-center-label--deal-type-dup-num">
                      {getTricksInDeal(layoutDealForCenterLabel)}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        {centerNumOpensLargeScale && onOpenLargeScale ? (
          <button
            ref={replicaLaunchButtonRef ?? undefined}
            type="button"
            className={`deal-track-lab-circle-center-num deal-track-lab-circle-center-num--launch-scale${centerNumPinkMod}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenLargeScale();
            }}
            onMouseEnter={() => {
              if (centerNumOpensLargeScale) setLaunchScaleCenterHot(true);
            }}
            onMouseLeave={() => setLaunchScaleCenterHot(false)}
            onFocus={() => {
              if (centerNumOpensLargeScale) setLaunchScaleCenterHot(true);
            }}
            onBlur={() => setLaunchScaleCenterHot(false)}
            aria-label={`Полная круговая шкала порядка раздач в партии. Сейчас выбрана раздача ${centerDealDisplay}.`}
            aria-haspopup="dialog"
            aria-expanded={largeScaleModalOpen}
            aria-controls="deal-track-lab-orbit-scale-dialog"
          >
            <span className="deal-track-lab-circle-center-num-glyph deal-track-lab-circle-center-num-glyph--launch-idle">
              {centerDealDisplay}
            </span>
            <DealTrackLabLaunchScaleGlyph className="deal-track-lab-circle-center-launch-icon" />
          </button>
        ) : (
          <div className={`deal-track-lab-circle-center-num${centerNumPinkMod}`}>{centerDealDisplay}</div>
        )}
        {deckStripAboveCap ? (
          <>
            <DealCardBackStrip
              tricks={getTricksInDeal(centerDealDisplay)}
              type={centerDealType}
              inDiskCenter
            />
            <div
              className={`deal-track-lab-circle-center-cap${centerCapTwoRows ? ' deal-track-lab-circle-center-cap--two-rows' : ''}`}
            >
              <DealCircleCenterCapContent dealNumber={centerDealDisplay} />
            </div>
          </>
        ) : (
          <>
            <div
              className={`deal-track-lab-circle-center-cap${centerCapTwoRows ? ' deal-track-lab-circle-center-cap--two-rows' : ''}`}
            >
              <DealCircleCenterCapContent dealNumber={centerDealDisplay} />
            </div>
            <DealCardBackStrip
              tricks={getTricksInDeal(centerDealDisplay)}
              type={centerDealType}
              inDiskCenter
            />
          </>
        )}
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
  /** Пока true — «огонь» бежит только по основному OrbitTrackDisk; `currentDeal` (слайдер/шкалы/реплика) не дёргается. */
  const [introRunning, setIntroRunning] = useState(() => DEAL_TRACK_LAB_CYCLE_HIGHLIGHT_DEMO);
  const [orbitSweepDeal, setOrbitSweepDeal] = useState(1);
  const [modalIntroRunning, setModalIntroRunning] = useState(false);
  const [hoveredDeal, setHoveredDeal] = useState<number | null>(null);
  /** После клика по точке: номер для центра в режиме «Выбрано» до истечения таймера. */
  const [orbitCenterHoldDeal, setOrbitCenterHoldDeal] = useState<number | null>(null);
  /**
   * После таймера сброса: курсор всё ещё может стоять над той же точкой без нового mouseenter —
   * тогда не показываем превью по hover, пока не зайдём на точку снова или не уйдём с диска.
   */
  const [orbitHoverPreviewSuppressed, setOrbitHoverPreviewSuppressed] = useState(false);
  const [orbitTooltip, setOrbitTooltip] = useState<OrbitTooltipState | null>(null);
  const [verticalTooltip, setVerticalTooltip] = useState<VerticalTooltipState | null>(null);
  const [horizontalTooltip, setHorizontalTooltip] = useState<HorizontalTooltipState | null>(null);
  const diskRef = useRef<HTMLDivElement | null>(null);
  /** Диск, с которого вызвали тултип (основной или мини) — для refine и `keepOut` зоны. */
  const orbitTooltipDiskElRef = useRef<HTMLElement | null>(null);
  const orbitBallGeomRef = useRef<OrbitBallGeom | null>(null);
  const orbitHoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Браузер: `setTimeout` → number; без пересечения с NodeJS.Timeout из lib */
  const orbitClickHoldTimerRef = useRef<number | null>(null);
  const orbitScaleDialogRef = useRef<HTMLDialogElement | null>(null);
  const replicaLaunchBtnRef = useRef<HTMLButtonElement | null>(null);
  const orbitModalWasOpenRef = useRef(false);
  const [orbitScaleModalOpen, setOrbitScaleModalOpen] = useState(false);

  const cancelOrbitHoverLeaveTimer = useCallback(() => {
    if (orbitHoverLeaveTimerRef.current !== null) {
      clearTimeout(orbitHoverLeaveTimerRef.current);
      orbitHoverLeaveTimerRef.current = null;
    }
  }, []);

  const clearOrbitClickHold = useCallback(() => {
    if (orbitClickHoldTimerRef.current !== null) {
      clearTimeout(orbitClickHoldTimerRef.current);
      orbitClickHoldTimerRef.current = null;
    }
    setOrbitCenterHoldDeal(null);
    setOrbitHoverPreviewSuppressed(false);
  }, []);

  const resumeOrbitHoverPreview = useCallback(() => {
    setOrbitHoverPreviewSuppressed(false);
  }, []);

  const beginOrbitClickPreviewHold = useCallback((d: number, revertCurrentDealTo: number) => {
    if (orbitClickHoldTimerRef.current !== null) {
      clearTimeout(orbitClickHoldTimerRef.current);
      orbitClickHoldTimerRef.current = null;
    }
    setOrbitHoverPreviewSuppressed(false);
    setOrbitCenterHoldDeal(d);
    orbitClickHoldTimerRef.current = window.setTimeout(() => {
      orbitClickHoldTimerRef.current = null;
      setOrbitCenterHoldDeal(null);
      setHoveredDeal(null);
      setOrbitTooltip(null);
      setOrbitHoverPreviewSuppressed(true);
      setCurrentDeal(revertCurrentDealTo);
    }, DEAL_TRACK_LAB_ORBIT_CLICK_PREVIEW_HOLD_MS);
  }, []);

  useEffect(() => () => cancelOrbitHoverLeaveTimer(), [cancelOrbitHoverLeaveTimer]);

  useEffect(() => () => clearOrbitClickHold(), [clearOrbitClickHold]);

  useEffect(() => {
    if (orbitTooltip == null) {
      orbitTooltipDiskElRef.current = null;
      return;
    }
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

  useEffect(() => {
    const d = orbitScaleDialogRef.current;
    if (!d) return;

    if (orbitScaleModalOpen) {
      cancelOrbitHoverLeaveTimer();
      clearOrbitClickHold();
      setHoveredDeal(null);
      clearOrbitTooltip();
      clearVerticalTooltip();
      clearHorizontalTooltip();
      if (!d.open) d.showModal();
    } else if (d.open) {
      d.close();
    }

    /** После showModal фокус уходит на диалог; при закрытии часто возвращается на кнопку цифры → «залипший» focus-within / ховер-слой */
    let innerRaf = 0;
    if (orbitModalWasOpenRef.current && !orbitScaleModalOpen) {
      const outerRaf = window.requestAnimationFrame(() => {
        innerRaf = window.requestAnimationFrame(() => {
          replicaLaunchBtnRef.current?.blur();
          clearOrbitClickHold();
          setHoveredDeal(null);
          clearOrbitTooltip();
          cancelOrbitHoverLeaveTimer();
        });
      });
      orbitModalWasOpenRef.current = orbitScaleModalOpen;
      return () => {
        window.cancelAnimationFrame(outerRaf);
        window.cancelAnimationFrame(innerRaf);
      };
    }

    orbitModalWasOpenRef.current = orbitScaleModalOpen;
    return undefined;
  }, [
    orbitScaleModalOpen,
    cancelOrbitHoverLeaveTimer,
    clearOrbitClickHold,
    clearOrbitTooltip,
    clearVerticalTooltip,
    clearHorizontalTooltip,
  ]);

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
    const disk = target.closest<HTMLElement>('[data-deal-track-lab-disk]');
    const diskRect = disk?.getBoundingClientRect();
    if (!disk || !diskRect) return;
    orbitTooltipDiskElRef.current = disk;
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
      accentHue: getOrbitDigitHueDegrees(deal),
      refine: true,
    });
  }, []);

  useLayoutEffect(() => {
    if (orbitTooltip?.refine !== true) return;
    const disk = orbitTooltipDiskElRef.current?.getBoundingClientRect();
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
    if (!DEAL_TRACK_LAB_CYCLE_HIGHLIGHT_DEMO) {
      setIntroRunning(false);
      return;
    }

    let rafId = 0;
    let cancelled = false;
    let lastTs: number | null = null;
    let elapsed = 0;
    let step = 1;
    const maxStep = Math.max(1, totalDeals);

    const tick = (ts: number) => {
      if (cancelled) return;
      if (lastTs == null) lastTs = ts;
      elapsed += ts - lastTs;
      lastTs = ts;

      while (elapsed >= DEAL_TRACK_LAB_CYCLE_STEP_MS && step < maxStep) {
        elapsed -= DEAL_TRACK_LAB_CYCLE_STEP_MS;
        step += 1;
      }

      if (step >= maxStep) {
        if (!cancelled) {
          setOrbitSweepDeal(maxStep);
          setIntroRunning(false);
        }
        return;
      }

      setOrbitSweepDeal(step);
      rafId = window.requestAnimationFrame(tick);
    };

    setOrbitSweepDeal(1);
    setIntroRunning(true);
    rafId = window.requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [totalDeals]);

  useEffect(() => {
    if (!orbitScaleModalOpen || !DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN) {
      setModalIntroRunning(false);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setModalIntroRunning(false);
      return;
    }
    setModalIntroRunning(true);
  }, [orbitScaleModalOpen]);

  const deals = useMemo(
    () => Array.from({ length: totalDeals }, (_, i) => i + 1),
    [totalDeals],
  );
  const orbitEffectiveHoveredDeal = orbitHoverPreviewSuppressed ? null : hoveredDeal;
  const mainOrbitDeal = introRunning ? orbitSweepDeal : currentDeal;
  const focusedDealMain = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? mainOrbitDeal;
  const focusedDealReplica = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? currentDeal;
  const syntheticMainSweep = introRunning ? mainOrbitDeal : null;
  const orbitPreviewUiActiveMain =
    orbitCenterHoldDeal !== null || orbitEffectiveHoveredDeal !== null || introRunning;
  const orbitPreviewUiActiveReplica =
    orbitCenterHoldDeal !== null || orbitEffectiveHoveredDeal !== null;
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
  const currentOrbitFloorMain = orbitSpotPosition(
    mainOrbitDeal,
    totalDeals,
    circleCx,
    circleCy,
    circleRingDotR,
  );
  const currentOrbitFloorReplica = orbitSpotPosition(
    currentDeal,
    totalDeals,
    circleCx,
    circleCy,
    circleRingDotR,
  );
  const orbitPreviewTargetMain =
    orbitCenterHoldDeal ?? syntheticMainSweep ?? orbitEffectiveHoveredDeal ?? null;
  const orbitPreviewTargetReplica =
    orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? null;
  const previewOrbitFloorMain =
    orbitPreviewTargetMain != null && orbitPreviewTargetMain !== mainOrbitDeal
      ? orbitSpotPosition(orbitPreviewTargetMain, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  const previewOrbitFloorReplica =
    orbitPreviewTargetReplica != null && orbitPreviewTargetReplica !== currentDeal
      ? orbitSpotPosition(orbitPreviewTargetReplica, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;

  const prefersReducedMotionLab =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const modalOrbitCssSweepConfig =
    orbitScaleModalOpen &&
    modalIntroRunning &&
    DEAL_TRACK_LAB_MODAL_CYCLE_ON_OPEN &&
    !prefersReducedMotionLab
      ? {
          durationMs: DEAL_TRACK_LAB_MODAL_SWEEP_DURATION_MS,
          onEnd: () => setModalIntroRunning(false),
        }
      : null;

  const modalOrbitDeal = currentDeal;
  const focusedDealModal = orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? modalOrbitDeal;
  const orbitPreviewUiActiveModal =
    orbitCenterHoldDeal !== null ||
    orbitEffectiveHoveredDeal !== null ||
    (orbitScaleModalOpen && modalIntroRunning);
  const orbitPreviewTargetModal =
    orbitCenterHoldDeal ?? orbitEffectiveHoveredDeal ?? null;
  const currentOrbitFloorModal = orbitSpotPosition(
    modalOrbitDeal,
    totalDeals,
    circleCx,
    circleCy,
    circleRingDotR,
  );
  const previewOrbitFloorModal =
    orbitPreviewTargetModal != null && orbitPreviewTargetModal !== modalOrbitDeal
      ? orbitSpotPosition(orbitPreviewTargetModal, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;

  /** Рыжевато-оранжевое свечение у активной/превью точки (hover, клик, автопрогон). */
  const warmOrbitGlowPosMain =
    orbitPreviewTargetMain != null
      ? orbitSpotPosition(orbitPreviewTargetMain, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  const warmOrbitGlowPosReplica =
    orbitPreviewTargetReplica != null
      ? orbitSpotPosition(orbitPreviewTargetReplica, totalDeals, circleCx, circleCy, circleRingDotR)
      : null;
  const warmOrbitGlowPosModal =
    modalOrbitCssSweepConfig != null
      ? null
      : orbitPreviewTargetModal != null
        ? orbitSpotPosition(orbitPreviewTargetModal, totalDeals, circleCx, circleCy, circleRingDotR)
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
                  normDeg={normDeg}
                  ntDeg={ntDeg}
                  totalDeals={totalDeals}
                  deals={deals}
                  currentDeal={mainOrbitDeal}
                  orbitPreviewUiActive={orbitPreviewUiActiveMain}
                  focusedDeal={focusedDealMain}
                  currentOrbitFloor={currentOrbitFloorMain}
                  previewOrbitFloor={previewOrbitFloorMain}
                  warmOrbitGlowPos={warmOrbitGlowPosMain}
                  orbitTooltipDeal={orbitTooltip?.deal ?? null}
                  cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                  setHoveredDeal={setHoveredDeal}
                  setOrbitTooltip={setOrbitTooltip}
                  showOrbitTooltip={showOrbitTooltip}
                  setCurrentDeal={setCurrentDeal}
                  orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                  beginOrbitClickPreviewHold={beginOrbitClickPreviewHold}
                  onOrbitHoverResume={resumeOrbitHoverPreview}
                  orbitCssSuppressHover={orbitHoverPreviewSuppressed}
                  orbitHoldPinkAccent={orbitCenterHoldDeal !== null}
                  orbitPointDealNumbers
                  deckStripAboveCap
                  orbitSweepInstant={introRunning}
                />
              </div>
              <div className="deal-track-lab-orbit-replica-column">
                <div
                  className="deal-track-lab-orbit-replica-btn"
                  role="group"
                  aria-label="Компактная круговая шкала раздач"
                  aria-describedby="deal-track-lab-replica-help"
                >
                  <div className="deal-track-lab-orbit-replica-inner">
                    <OrbitTrackDisk
                      normDeg={normDeg}
                      ntDeg={ntDeg}
                      totalDeals={totalDeals}
                      deals={deals}
                      currentDeal={currentDeal}
                      orbitPreviewUiActive={orbitPreviewUiActiveReplica}
                      focusedDeal={focusedDealReplica}
                      currentOrbitFloor={currentOrbitFloorReplica}
                      previewOrbitFloor={previewOrbitFloorReplica}
                      warmOrbitGlowPos={warmOrbitGlowPosReplica}
                      orbitTooltipDeal={orbitTooltip?.deal ?? null}
                      cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                      setHoveredDeal={setHoveredDeal}
                      setOrbitTooltip={setOrbitTooltip}
                      showOrbitTooltip={showOrbitTooltip}
                      setCurrentDeal={setCurrentDeal}
                      orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                      beginOrbitClickPreviewHold={beginOrbitClickPreviewHold}
                      onOrbitHoverResume={resumeOrbitHoverPreview}
                      orbitCssSuppressHover={orbitHoverPreviewSuppressed}
                      orbitHoldPinkAccent={orbitCenterHoldDeal !== null}
                      centerNumOpensLargeScale
                      onOpenLargeScale={() => setOrbitScaleModalOpen(true)}
                      largeScaleModalOpen={orbitScaleModalOpen}
                      replicaLaunchButtonRef={replicaLaunchBtnRef}
                      orbitReplicaSpectrum
                      orbitReplica
                    />
                  </div>
                </div>
                <p id="deal-track-lab-replica-help" className="deal-track-lab-orbit-replica-help">
                  <span className="deal-track-lab-orbit-replica-help-k">Точки на орбите</span> — выбор раздачи и
                  свои подсказки (не всплывашка браузера).{' '}
                  В <span className="deal-track-lab-orbit-replica-help-k">центре</span> видна текущая раздача;
                  при наведении на неё появляется иконка <span className="deal-track-lab-orbit-replica-help-k">развернуть</span>{' '}
                  — <span className="deal-track-lab-orbit-replica-help-k">клик</span> открывает полную круговую шкалу
                  порядка раздач.
                </p>
              </div>
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
      <dialog
        ref={orbitScaleDialogRef}
        id="deal-track-lab-orbit-scale-dialog"
        className="deal-track-lab-orbit-scale-dialog"
        aria-labelledby="deal-track-lab-orbit-scale-title"
        onClose={() => setOrbitScaleModalOpen(false)}
      >
        <div className="deal-track-lab-orbit-scale-dialog-surface">
          <header className="deal-track-lab-orbit-scale-dialog-head">
            <h2 id="deal-track-lab-orbit-scale-title" className="deal-track-lab-orbit-scale-dialog-title">
              Круговая шкала · полный размер
            </h2>
            <button
              type="button"
              className="deal-track-lab-orbit-scale-dialog-close"
              autoFocus
              onClick={() => setOrbitScaleModalOpen(false)}
            >
              Закрыть
            </button>
          </header>
          <div className="deal-track-lab-orbit-scale-disk">
            <div className="deal-track-lab-circle-wrap deal-track-lab-circle-wrap--in-row">
              <OrbitTrackDisk
                normDeg={normDeg}
                ntDeg={ntDeg}
                totalDeals={totalDeals}
                deals={deals}
                currentDeal={modalOrbitDeal}
                orbitPreviewUiActive={orbitPreviewUiActiveModal}
                focusedDeal={focusedDealModal}
                currentOrbitFloor={currentOrbitFloorModal}
                previewOrbitFloor={previewOrbitFloorModal}
                warmOrbitGlowPos={warmOrbitGlowPosModal}
                orbitTooltipDeal={orbitTooltip?.deal ?? null}
                cancelOrbitHoverLeaveTimer={cancelOrbitHoverLeaveTimer}
                setHoveredDeal={setHoveredDeal}
                setOrbitTooltip={setOrbitTooltip}
                showOrbitTooltip={showOrbitTooltip}
                setCurrentDeal={setCurrentDeal}
                orbitHoverLeaveTimerRef={orbitHoverLeaveTimerRef}
                beginOrbitClickPreviewHold={beginOrbitClickPreviewHold}
                onOrbitHoverResume={resumeOrbitHoverPreview}
                orbitCssSuppressHover={orbitHoverPreviewSuppressed}
                orbitHoldPinkAccent={orbitCenterHoldDeal !== null}
                orbitPointDealNumbers
                deckStripAboveCap
                orbitCssRingSweep={modalOrbitCssSweepConfig}
                orbitSweepInstant={modalIntroRunning && modalOrbitCssSweepConfig == null}
                centerLabelLayoutDeal={currentDeal}
              />
            </div>
          </div>
        </div>
      </dialog>
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
