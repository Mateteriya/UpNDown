/**
 * Единый словарь стилей панелек заказ/взято для ТЕЛЕФОНА (viewport-mobile).
 * Источник: docs/order-style-lab-pick.json (лаба /order-style-lab).
 *
 * ПК и планшет (не viewport-mobile) этим модулем не пользуются.
 */

import type { CSSProperties } from 'react';
import labPick from './mobileOrderPanelStyle.lab.json';

export type MobileOrderStateId =
  | 'biddingNoBid'
  | 'biddingTurnNoBid'
  | 'biddingHasBid'
  | 'zeroPending'
  | 'zeroExact'
  | 'chasing'
  | 'exact'
  | 'over'
  | 'under'
  | 'collecting'
  | 'rare8';

export type MobileOrderSeatRole = 'normal' | 'dealer';

type GradMode = 'solid' | 'gradient';

type LabPick = {
  takenHex?: string;
  bidHex?: string;
  slashHex?: string;
  takenGlow?: boolean;
  bidGlow?: boolean;
  slashGlow?: boolean;
  figureWeight?: number;
  dealerTakenHex?: string;
  dealerBidHex?: string;
  dealerSlashHex?: string;
  dealerTakenGlow?: boolean;
  dealerBidGlow?: boolean;
  dealerSlashGlow?: boolean;
  dealerFigureWeight?: number;
  border?: string;
  dealerBorder?: string;
  borderHex?: string;
  borderHex2?: string;
  borderFillHex?: string;
  borderFillHex2?: string;
  borderFillOnly?: boolean;
  lastPresetBorder?: string;
  borderWidth?: number;
  borderEdgeMode?: GradMode;
  borderFillMode?: GradMode;
  borderGlow?: boolean;
  dealerBorderHex?: string;
  dealerBorderHex2?: string;
  dealerBorderFillHex?: string;
  dealerBorderFillHex2?: string;
  dealerBorderFillOnly?: boolean;
  dealerLastPresetBorder?: string;
  dealerBorderWidth?: number;
  dealerBorderEdgeMode?: GradMode;
  dealerBorderFillMode?: GradMode;
  dealerBorderGlow?: boolean;
  zeroCross?: string;
  zeroCrossHex?: string;
  zeroCrossHex2?: string;
  zeroCrossMode?: GradMode;
  zeroCrossGlow?: boolean;
};

const PICKS = (labPick as { picks: Partial<Record<MobileOrderStateId, LabPick>> }).picks;

export type ResolveMobileOrderStateInput = {
  bid: number | null;
  tricksTaken: number;
  tricksLeftInDeal?: number;
  /** Между раздачами / сбор карт */
  collecting?: boolean;
  /** Торги и ещё не заказал */
  bidding?: boolean;
  /** Сейчас ход торгов этого игрока (ещё без заказа) */
  biddingTurn?: boolean;
};

/**
 * Классификатор состояния панели (как в лабе).
 * collecting → наследует exact/over/under по счёту взяток.
 * rare8 → заказ 8|9 до exact/over/жёсткого under (поверх chasing/zeroPending).
 */
export function resolveMobileOrderStateId(input: ResolveMobileOrderStateInput): MobileOrderStateId {
  const { bid, tricksTaken, tricksLeftInDeal, collecting, bidding, biddingTurn } = input;

  if (bidding && bid == null) {
    return biddingTurn ? 'biddingTurnNoBid' : 'biddingNoBid';
  }

  if (bid == null) {
    return 'biddingNoBid';
  }

  const exact = tricksTaken === bid;
  const over = tricksTaken > bid;
  const underSoft = tricksTaken < bid;
  const underHard =
    underSoft &&
    (tricksLeftInDeal === undefined || tricksTaken + tricksLeftInDeal < bid);

  if (collecting) {
    if (exact) return 'exact';
    if (over) return 'over';
    if (underHard) return 'under';
    return 'chasing';
  }

  if (exact) {
    return bid === 0 ? 'zeroExact' : 'exact';
  }
  if (over) return 'over';
  if (underHard) return 'under';

  const rare = bid === 8 || bid === 9;
  if (tricksTaken === 0 && bid > 0) {
    return rare ? 'rare8' : bidding ? 'biddingHasBid' : 'zeroPending';
  }
  if (underSoft) {
    return rare ? 'rare8' : 'chasing';
  }

  return bidding ? 'biddingHasBid' : 'zeroPending';
}

function pickFor(state: MobileOrderStateId): LabPick {
  return PICKS[state] ?? PICKS.chasing ?? {};
}

function neonDigitStyle(hex: string, glow: boolean, weight: number): CSSProperties {
  const c = hex || '#e2e8f0';
  const base: CSSProperties = {
    cursor: 'help',
    color: c,
    WebkitTextFillColor: c,
    fontWeight: weight,
  };
  if (!glow) {
    return {
      ...base,
      textShadow: '0 1px 2px rgba(0,0,0,0.9)',
    };
  }
  return {
    ...base,
    WebkitTextStroke: `0.55px color-mix(in srgb, ${c} 35%, #000)`,
    textShadow: [
      `0 0 8px color-mix(in srgb, ${c} 85%, transparent)`,
      `0 0 16px color-mix(in srgb, ${c} 55%, transparent)`,
      '0 1px 2px rgba(0,0,0,0.9)',
    ].join(', '),
  };
}

export type MobileOrderFigureStyles = {
  stateId: MobileOrderStateId;
  taken: CSSProperties;
  bid: CSSProperties;
  slash: CSSProperties;
  /** Класс-маркер состояния (для CSS-хуков, без ПК-селекторов) */
  figuresClassName: string;
};

export function resolveMobileOrderFigureStyles(opts: {
  stateId: MobileOrderStateId;
  role: MobileOrderSeatRole;
  bidIsNull?: boolean;
}): MobileOrderFigureStyles {
  const p = pickFor(opts.stateId);
  const dealer = opts.role === 'dealer';
  const takenHex = (dealer ? p.dealerTakenHex ?? p.takenHex : p.takenHex) || '#e2e8f0';
  const bidHex = (dealer ? p.dealerBidHex ?? p.bidHex : p.bidHex) || '#94a3b8';
  const slashHex = (dealer ? p.dealerSlashHex ?? p.slashHex : p.slashHex) || '#94a3b8';
  const takenGlow = dealer ? Boolean(p.dealerTakenGlow ?? p.takenGlow) : Boolean(p.takenGlow);
  const bidGlow = dealer ? Boolean(p.dealerBidGlow ?? p.bidGlow) : Boolean(p.bidGlow);
  const slashGlow = dealer ? Boolean(p.dealerSlashGlow ?? p.slashGlow) : Boolean(p.slashGlow);
  const weight =
    (dealer ? p.dealerFigureWeight ?? p.figureWeight : p.figureWeight) || 800;

  return {
    stateId: opts.stateId,
    taken: neonDigitStyle(takenHex, takenGlow, weight),
    bid: opts.bidIsNull
      ? neonDigitStyle(bidHex, bidGlow, weight)
      : neonDigitStyle(bidHex, bidGlow, weight),
    slash: {
      ...neonDigitStyle(slashHex, slashGlow, weight),
      cursor: 'default',
      userSelect: 'none',
    },
    figuresClassName: [
      'trick-bid-taken-figures-neon',
      'mop-figures',
      `mop-figures--${opts.stateId}`,
      dealer ? 'mop-figures--dealer' : 'mop-figures--normal',
    ].join(' '),
  };
}

/** Игровые CSS-классы исхода — на телефоне с лабой НЕ используем (бьют lab chrome). */
function outcomeClassFromState(_stateId: MobileOrderStateId): string {
  return '';
}

function gradientOrSolid(a: string, b: string, mode: GradMode | undefined): string {
  if (mode === 'gradient') return `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
  return `linear-gradient(${a}, ${a})`;
}

/** Визуал пресетов лабы → слои padding-box / border-box (как в order-style-lab.css). */
function presetLabLayers(borderId: string): { fill: string; edge: string; width: number } | null {
  switch (borderId) {
    case 'amber1':
      return {
        width: 1,
        fill: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        edge: 'linear-gradient(rgba(251,191,36,0.55), rgba(251,191,36,0.55))',
      };
    case 'amber2':
      return {
        width: 2,
        fill: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        edge: 'linear-gradient(rgba(251,191,36,0.72), rgba(251,191,36,0.72))',
      };
    case 'exact3':
      return {
        width: 3,
        fill: 'linear-gradient(180deg, #1e1540 0%, #140d2e 42%, #0a061c 100%)',
        edge: `linear-gradient(180deg, rgb(87 67 160 / 98%) 0%, #3e06b2f5 14%, #e879f9 28%, rgb(33 239 176) 48%, rgb(129 29 223) 68%, rgb(52 5 167) 84%, rgb(12 204 98 / 98%) 100%)`,
      };
    case 'exact1':
      return {
        width: 1,
        fill: 'linear-gradient(180deg, #1e1540 0%, #0a061c 100%)',
        edge: 'linear-gradient(180deg, #e879f9 0%, rgb(33 239 176) 50%, rgb(129 29 223) 100%)',
      };
    case 'over':
      return {
        width: 2,
        fill: 'linear-gradient(180deg, #1f2418 0%, #12160e 100%)',
        edge: 'linear-gradient(rgba(130,135,78,0.75), rgba(130,135,78,0.75))',
      };
    case 'under':
      return {
        width: 2,
        fill: 'linear-gradient(180deg, #2a1218 0%, #14080c 100%)',
        edge: 'linear-gradient(rgba(248,113,113,0.75), rgba(248,113,113,0.75))',
      };
    case 'plainDark':
      return {
        width: 1,
        fill: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        edge: 'linear-gradient(rgba(71,85,105,0.65), rgba(71,85,105,0.65))',
      };
    case 'indigoThin':
      return {
        width: 1,
        fill: 'linear-gradient(#0f172a, #0f172a)',
        edge: 'linear-gradient(rgba(129,140,248,0.65), rgba(129,140,248,0.65))',
      };
    case 'dealerGold':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgba(251,191,36,0.92) 0%, rgba(245,158,11,0.88) 48%, rgba(251,146,60,0.9) 100%)',
      };
    case 'dealerBidding':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgb(36 172 251 / 92%) 0%, rgb(244 11 245 / 88%) 100%)',
      };
    case 'dealerPlaying':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgb(167 139 250 / 92%) 0%, rgb(52 211 153 / 88%) 100%)',
      };
    case 'dealerExact':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgb(87 67 160 / 98%) 0%, #e879f9 28%, rgb(33 239 176) 52%, rgb(129 29 223) 100%)',
      };
    case 'dealerOver':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgba(130,135,78,0.95), rgba(90,95,55,0.9))',
      };
    case 'dealerUnder':
      return {
        width: 2,
        fill: 'linear-gradient(rgba(8,12,28,0.55), rgba(8,12,28,0.55))',
        edge: 'linear-gradient(180deg, rgba(248,113,113,0.95), rgba(153,27,27,0.9))',
      };
    default:
      return null;
  }
}

export type MobileOrderPanelChrome = {
  stateId: MobileOrderStateId;
  /** Inline CSS-переменные для .mop-panel--lab-chrome */
  wrapStyle: CSSProperties;
  /** Доп. классы поверх trick-slots-* */
  extraClassName: string;
  /** Всегда пусто на телефоне с лабой — старые complete/over ломают цвета */
  outcomeClassName: string;
  borderGlow: boolean;
};

export function resolveMobileOrderPanelChrome(opts: {
  stateId: MobileOrderStateId;
  role: MobileOrderSeatRole;
}): MobileOrderPanelChrome {
  const p = pickFor(opts.stateId);
  const dealer = opts.role === 'dealer';
  const borderId = dealer ? p.dealerBorder ?? 'custom' : p.border ?? 'custom';
  const fillOnly = dealer ? Boolean(p.dealerBorderFillOnly) : Boolean(p.borderFillOnly);
  const edge = (dealer ? p.dealerBorderHex : p.borderHex) || '#fbbf24';
  const edge2 = (dealer ? p.dealerBorderHex2 : p.borderHex2) || edge;
  const fill = (dealer ? p.dealerBorderFillHex : p.borderFillHex) || '#0b1224';
  const fill2 = (dealer ? p.dealerBorderFillHex2 : p.borderFillHex2) || fill;
  const edgeMode = (dealer ? p.dealerBorderEdgeMode : p.borderEdgeMode) || 'solid';
  const fillMode = (dealer ? p.dealerBorderFillMode : p.borderFillMode) || 'solid';
  const width = (dealer ? p.dealerBorderWidth : p.borderWidth) || 2;
  const glow = dealer ? Boolean(p.dealerBorderGlow) : Boolean(p.borderGlow);

  const labFill = gradientOrSolid(fill, fill2, fillMode);
  const labEdge = gradientOrSolid(edge, edge2, edgeMode);
  const preset = borderId !== 'custom' ? presetLabLayers(borderId) : null;

  let fillLayer: string;
  let edgeLayer: string;
  let bw: number;

  if (borderId === 'custom') {
    fillLayer = labFill;
    edgeLayer = labEdge;
    bw = width;
  } else if (fillOnly && preset) {
    fillLayer = labFill;
    edgeLayer = preset.edge;
    bw = preset.width;
  } else if (preset) {
    fillLayer = preset.fill;
    edgeLayer = preset.edge;
    bw = preset.width;
  } else {
    fillLayer = labFill;
    edgeLayer = labEdge;
    bw = width;
  }

  /* Обычные игроки · перебор: без утолщения обводки (лаба могла держать 4). Сдающий — как в лабе. */
  if (!dealer && opts.stateId === 'over') {
    bw = Math.min(bw, 2);
  }

  const glowShadow = glow
    ? `0 0 8px color-mix(in srgb, ${edge} 50%, transparent), 0 0 18px color-mix(in srgb, ${edge} 30%, transparent)`
    : 'none';

  const wrapStyle: CSSProperties = {
    ['--mop-bw' as string]: `${bw}px`,
    ['--mop-fill' as string]: fillLayer,
    ['--mop-edge' as string]: edgeLayer,
    ['--mop-glow' as string]: glowShadow,
  };

  return {
    stateId: opts.stateId,
    wrapStyle,
    extraClassName: [
      'mop-panel',
      'mop-panel--lab-chrome',
      `mop-panel--${opts.stateId}`,
      dealer ? 'mop-panel--dealer' : 'mop-panel--normal',
      borderId === 'custom' ? 'mop-panel--custom' : `mop-border--${borderId}`,
      fillOnly ? 'mop-panel--fill-only' : '',
      glow ? 'mop-panel--glow' : '',
    ]
      .filter(Boolean)
      .join(' '),
    outcomeClassName: outcomeClassFromState(opts.stateId),
    borderGlow: glow,
  };
}

export type MobileZeroCrossStyle = {
  c1: string;
  c2: string;
  mid: string;
  mode: GradMode;
  glow: boolean;
};

export function resolveMobileZeroCrossStyle(): MobileZeroCrossStyle {
  const p = pickFor('zeroExact');
  const c1 = p.zeroCrossHex || '#5105ff';
  const c2 = p.zeroCrossHex2 || '#a604ff';
  return {
    c1,
    c2,
    mid: c1,
    mode: p.zeroCrossMode === 'solid' ? 'solid' : 'gradient',
    glow: p.zeroCrossGlow !== false,
  };
}

/** Удобный пакет для TrickSlotsDisplay / PcTrickBidTakenFigures */
export function resolveMobileOrderPanelStyle(input: {
  bid: number | null;
  tricksTaken: number;
  tricksLeftInDeal?: number;
  collecting?: boolean;
  bidding?: boolean;
  biddingTurn?: boolean;
  role: MobileOrderSeatRole;
}) {
  const stateId = resolveMobileOrderStateId(input);
  const figures = resolveMobileOrderFigureStyles({
    stateId,
    role: input.role,
    bidIsNull: input.bid == null,
  });
  const chrome = resolveMobileOrderPanelChrome({ stateId, role: input.role });
  const zeroCross = stateId === 'zeroExact' || input.bid === 0 ? resolveMobileZeroCrossStyle() : null;
  return { stateId, figures, chrome, zeroCross };
}
