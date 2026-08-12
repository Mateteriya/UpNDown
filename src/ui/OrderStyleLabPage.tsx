/**
 * Лаба: визуальный подбор стилей цифр заказ/взято и обводок панелек (мобилка).
 * URL: /order-style-lab
 *
 * Пресеты = цвета из GameTable + SOUTH_LS_CHROME + theme.
 * «Свой» = неоновая палитра + hex; у обводки — рамка/фон/толщина/градиент/свечение.
 * Цвета едины на всей мобилке (без матрицы горизонт/вертикаль). ПК/планшет вне лабы.
 * Между раздачами = обводки финала. Выбор → localStorage updown-order-style-lab-v1
 */

import { useCallback, useEffect, useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import '../styles/order-style-lab.css';
import {
  AvatarNeonColorPicker,
  NEON_PALETTE_SWATCHES,
} from './AvatarNeonColorPicker';

const STORAGE_KEY = 'updown-order-style-lab-v1';

type DigitId =
  | 'cyanTaken'
  | 'themeCyan'
  | 'chaseCyanLegacy'
  | 'teal'
  | 'chromeTeal'
  | 'yellow'
  | 'chromeYellow'
  | 'acid'
  | 'lilacMobile'
  | 'lilacPc'
  | 'slashLilac'
  | 'chromeLilac'
  | 'bidPending'
  | 'overNeon'
  | 'overSwamp'
  | 'chromeOrange'
  | 'chromeBidOrange'
  | 'red'
  | 'amber'
  | 'gold8'
  | 'gold9'
  | 'gold8under'
  | 'gold9under'
  | 'mintExact'
  | 'chromeMint'
  | 'chromeCyan'
  | 'slate'
  | 'plain'
  | 'custom';

type BorderId =
  | 'amber1'
  | 'amber2'
  | 'exact3'
  | 'exact1'
  | 'over'
  | 'under'
  | 'plainDark'
  | 'indigoThin'
  | 'dealerGold'
  | 'dealerBidding'
  | 'dealerPlaying'
  | 'dealerOver'
  | 'dealerUnder'
  | 'dealerExact'
  | 'custom';

type SeatRole = 'normal' | 'dealer';

type StateId =
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

type BorderWidthPx = 1 | 2 | 3 | 4;
type GradMode = 'solid' | 'gradient';
type FigureWeight = 500 | 600 | 700 | 800 | 900;

/** Крестик «заказ 0 / не брать взятки» (мобилка, в т.ч. Ровно 0/0) */
type ZeroCrossId =
  | 'gameOrange'
  | 'lilac'
  | 'cyan'
  | 'gold'
  | 'acid'
  | 'red'
  | 'mint'
  | 'white'
  | 'custom';

type CtxId = 'south' | 'north' | 'we' | 'ear';

type StatePick = {
  taken: DigitId;
  bid: DigitId;
  /** Разделитель «/» */
  slash: DigitId;
  /** Обводка для обычного игрока (не сдающий) */
  border: BorderId;
  /** Обводка для сдающего в этом же игровом состоянии */
  dealerBorder: BorderId;
  takenHex: string;
  bidHex: string;
  slashHex: string;
  /** Неоновое свечение цифры «взято» */
  takenGlow: boolean;
  /** Неоновое свечение цифры «заказ» */
  bidGlow: boolean;
  slashGlow: boolean;
  /** Жирность цифр и «/» */
  figureWeight: FigureWeight;
  /** Цифры сдающего — отдельная ось (не смешивать с обычным) */
  dealerTaken: DigitId;
  dealerBid: DigitId;
  dealerSlash: DigitId;
  dealerTakenHex: string;
  dealerBidHex: string;
  dealerSlashHex: string;
  dealerTakenGlow: boolean;
  dealerBidGlow: boolean;
  dealerSlashGlow: boolean;
  dealerFigureWeight: FigureWeight;
  /** Цвет рамки (для custom) */
  borderHex: string;
  /** Второй цвет рамки (градиент) */
  borderHex2: string;
  /** Фон панели (для custom или оверрайд поверх пресета) */
  borderFillHex: string;
  /** Второй цвет фона (градиент) */
  borderFillHex2: string;
  /** true = фон поверх пресета рамки, без перехода в ★ Своя */
  borderFillOnly: boolean;
  /** Последний выбранный пресет рамки (чтобы фон мог вернуть край) */
  lastPresetBorder: BorderId;
  borderWidth: BorderWidthPx;
  borderEdgeMode: GradMode;
  borderFillMode: GradMode;
  /** Свечение рамки (неон). По умолчанию выкл — иначе превью всегда «неоновое». */
  borderGlow: boolean;
  dealerBorderHex: string;
  dealerBorderHex2: string;
  dealerBorderFillHex: string;
  dealerBorderFillHex2: string;
  dealerBorderFillOnly: boolean;
  dealerLastPresetBorder: BorderId;
  dealerBorderWidth: BorderWidthPx;
  dealerBorderEdgeMode: GradMode;
  dealerBorderFillMode: GradMode;
  dealerBorderGlow: boolean;
  /**
   * Крестик заказа 0 (общий для обычный/сдающий — один глиф в табличке).
   * Имеет смысл для «Ровно 0/0» и любых состояний с bid===0.
   */
  zeroCross: ZeroCrossId;
  zeroCrossHex: string;
  zeroCrossHex2: string;
  zeroCrossMode: GradMode;
  zeroCrossGlow: boolean;
  note: string;
};

type LabStore = {
  /** v2 = полный StatePick на каждое состояние (обе оси сразу) */
  schemaVersion?: number;
  picks: Partial<Record<StateId, StatePick>>;
  /** Что отмечено кнопками сохранения: обычный / сдающий */
  savedRoles?: Partial<Record<StateId, { normal?: boolean; dealer?: boolean }>>;
  /** Цвета едины для всей мобилки; ПК/планшет вне лабы; сдающий = отдельная ось */
  policy: string;
  freeNote: string;
};

const LAB_SCHEMA_VERSION = 2;

type DigitDef = { id: DigitId; label: string; hex: string; where: string };

/** Все заметные цвета цифр из игры (GameTable + chrome map + theme). */
const DIGIT_LIST: DigitDef[] = [
  { id: 'cyanTaken', label: 'Cyan 0 взято', hex: '#67e8f9', where: 'оппонент taken===0' },
  { id: 'themeCyan', label: 'Theme #38bdf8', hex: '#38bdf8', where: 'theme-standard span' },
  { id: 'chaseCyanLegacy', label: 'Cyan заказ (legacy)', hex: '#22d3ee', where: 'старый chasing bid' },
  { id: 'chromeCyan', label: 'Chrome cyan', hex: '#00d4ff', where: 'legacy hex' },
  { id: 'teal', label: 'Бирюза игрок', hex: '#5eead4', where: 'pcTrickTakenFigureStyle' },
  { id: 'chromeTeal', label: 'Chrome teal', hex: '#00e8c8', where: 'legacy hex' },
  { id: 'yellow', label: 'Жёлтый догоняем', hex: '#fde047', where: 'chasing taken' },
  { id: 'chromeYellow', label: 'Chrome жёлтый', hex: '#ffcc00', where: 'legacy hex' },
  { id: 'acid', label: 'Кислота заказ', hex: '#f4f509', where: 'mobileCompactNeonBidChasing' },
  { id: 'lilacMobile', label: 'Сирень mobile', hex: '#e879f9', where: 'neon exact' },
  { id: 'lilacPc', label: 'Сирень ПК', hex: '#c084fc', where: 'pcTrickExactMatch' },
  { id: 'slashLilac', label: 'Сирень slash', hex: '#d8b4fe', where: 'slash exact' },
  { id: 'chromeLilac', label: 'Chrome сирень', hex: '#f0abfc', where: 'legacy hex' },
  { id: 'bidPending', label: 'Оранж заказ pending', hex: '#fb923c', where: 'pcTrickBidFigureStyle' },
  { id: 'overNeon', label: 'Оранж перебор neon', hex: '#fdba74', where: 'neon over' },
  { id: 'overSwamp', label: 'Болото перебор', hex: '#c8c89a', where: 'pcTrickOverBid' },
  { id: 'chromeOrange', label: 'Chrome оранж', hex: '#ff6a00', where: 'legacy hex' },
  { id: 'chromeBidOrange', label: 'Chrome bid оранж', hex: '#ff5500', where: 'legacy hex' },
  { id: 'red', label: 'Красный недобор', hex: '#ff5a6e', where: 'under taken' },
  { id: 'amber', label: 'Янтарь недобор', hex: '#ffc400', where: 'under bid' },
  { id: 'gold8', label: 'Gold 8', hex: '#fef08a', where: 'rare 8' },
  { id: 'gold9', label: 'Gold 9', hex: '#fff7c2', where: 'rare 9' },
  { id: 'gold8under', label: 'Gold 8 under', hex: '#ffb300', where: 'rare 8 + under' },
  { id: 'gold9under', label: 'Gold 9 under', hex: '#ffaa00', where: 'rare 9 + under' },
  { id: 'mintExact', label: 'Mint exact (old)', hex: '#34d399', where: 'старый exact green' },
  { id: 'chromeMint', label: 'Chrome mint', hex: '#00ff9a', where: 'legacy hex' },
  { id: 'slate', label: 'Серый —', hex: '#94a3b8', where: 'нет заказа' },
  { id: 'plain', label: 'Светлый plain', hex: '#e2e8f0', where: 'opponent plain taken' },
  { id: 'custom', label: '★ Свой цвет', hex: '#ffffff', where: 'пикер ниже' },
];

/** Обводки обычного игрока. «Без низа» сюда НЕ входит — layout только Юга. */
const NORMAL_BORDER_LIST: { id: BorderId; label: string }[] = [
  { id: 'amber1', label: 'Золото 1px' },
  { id: 'amber2', label: 'Золото 2px' },
  { id: 'exact3', label: 'Exact 3px градиент' },
  { id: 'exact1', label: 'Exact 1px (legacy short)' },
  { id: 'over', label: 'Перебор swamp' },
  { id: 'under', label: 'Недобор red' },
  { id: 'plainDark', label: 'Тёмная простая' },
  { id: 'indigoThin', label: 'Indigo thin (legacy)' },
  { id: 'custom', label: '★ Своя обводка' },
];

/** Сдающий — отдельная ось стилей на каждое игровое состояние */
const DEALER_BORDER_LIST: { id: BorderId; label: string }[] = [
  { id: 'dealerBidding', label: 'Торги · cyan→magenta' },
  { id: 'dealerPlaying', label: 'Розыгрыш · violet→green' },
  { id: 'dealerGold', label: 'База · золото glass' },
  { id: 'dealerExact', label: 'Ровно · glass exact' },
  { id: 'dealerOver', label: 'Перебор · glass swamp' },
  { id: 'dealerUnder', label: 'Недобор · glass red' },
  { id: 'custom', label: '★ Своя обводка сдающего' },
];

/** Крестик заказа 0 — как SVG в GameTable + близкие тона цифр */
const ZERO_CROSS_LIST: {
  id: ZeroCrossId;
  label: string;
  hex: string;
  hex2: string;
  mode: GradMode;
  where: string;
}[] = [
  {
    id: 'gameOrange',
    label: 'Игра · янтарь',
    hex: '#fb923c',
    hex2: '#c2410c',
    mode: 'gradient',
    where: 'opponent-zero-order-cross-mobile SVG',
  },
  {
    id: 'lilac',
    label: 'Сирень exact',
    hex: '#e879f9',
    hex2: '#a21caf',
    mode: 'gradient',
    where: 'тон ровно 0/0',
  },
  {
    id: 'cyan',
    label: 'Cyan 0 взято',
    hex: '#67e8f9',
    hex2: '#0891b2',
    mode: 'gradient',
    where: 'cyanTaken',
  },
  {
    id: 'gold',
    label: 'Gold',
    hex: '#fef08a',
    hex2: '#f59e0b',
    mode: 'gradient',
    where: 'rare gold',
  },
  {
    id: 'acid',
    label: 'Кислота',
    hex: '#f4f509',
    hex2: '#84cc16',
    mode: 'gradient',
    where: 'acid bid',
  },
  {
    id: 'red',
    label: 'Красный недобор',
    hex: '#ff5a6e',
    hex2: '#991b1b',
    mode: 'gradient',
    where: 'under',
  },
  {
    id: 'mint',
    label: 'Mint',
    hex: '#34d399',
    hex2: '#0f766e',
    mode: 'gradient',
    where: 'mintExact',
  },
  {
    id: 'white',
    label: 'Белый',
    hex: '#ffffff',
    hex2: '#94a3b8',
    mode: 'gradient',
    where: 'high contrast',
  },
  {
    id: 'custom',
    label: '★ Свой крестик',
    hex: '#fb923c',
    hex2: '#c2410c',
    mode: 'gradient',
    where: 'пикер ниже',
  },
];

const ZERO_CROSS_BY_ID = Object.fromEntries(ZERO_CROSS_LIST.map((d) => [d.id, d])) as Record<
  ZeroCrossId,
  (typeof ZERO_CROSS_LIST)[number]
>;

const DIGIT_BY_ID = Object.fromEntries(DIGIT_LIST.map((d) => [d.id, d])) as Record<DigitId, DigitDef>;
const DIGIT_LABEL = Object.fromEntries(DIGIT_LIST.map((d) => [d.id, d.label])) as Record<DigitId, string>;
const BORDER_LABEL = Object.fromEntries(
  [...NORMAL_BORDER_LIST, ...DEALER_BORDER_LIST].map((d) => [d.id, d.label]),
) as Record<BorderId, string>;

function pickHex(id: DigitId, fallback = '#ffffff'): string {
  return DIGIT_BY_ID[id]?.hex ?? fallback;
}

const DEFAULT_BORDER_FILL = '#0b1224';
const DEFAULT_DEALER_BORDER_FILL = '#0a1020';

function makePick(
  taken: DigitId,
  bid: DigitId,
  border: BorderId,
  dealerBorder: BorderId,
  note = '',
): StatePick {
  return {
    taken,
    bid,
    slash: 'slate',
    border,
    dealerBorder,
    takenHex: pickHex(taken),
    bidHex: pickHex(bid),
    slashHex: pickHex('slate'),
    takenGlow: false,
    bidGlow: false,
    slashGlow: false,
    figureWeight: 800,
    dealerTaken: taken,
    dealerBid: bid,
    dealerSlash: 'slate',
    dealerTakenHex: pickHex(taken),
    dealerBidHex: pickHex(bid),
    dealerSlashHex: pickHex('slate'),
    dealerTakenGlow: false,
    dealerBidGlow: false,
    dealerSlashGlow: false,
    dealerFigureWeight: 800,
    borderHex: '#fbbf24',
    borderHex2: '#f472b6',
    borderFillHex: DEFAULT_BORDER_FILL,
    borderFillHex2: '#1e1b4b',
    borderFillOnly: false,
    lastPresetBorder: border === 'custom' ? 'amber2' : border,
    borderWidth: 2,
    borderEdgeMode: 'solid',
    borderFillMode: 'solid',
    borderGlow: false,
    dealerBorderHex: '#24acfb',
    dealerBorderHex2: '#f40bf5',
    dealerBorderFillHex: DEFAULT_DEALER_BORDER_FILL,
    dealerBorderFillHex2: '#1a0033',
    dealerBorderFillOnly: false,
    dealerLastPresetBorder: dealerBorder === 'custom' ? 'dealerBidding' : dealerBorder,
    dealerBorderWidth: 2,
    dealerBorderEdgeMode: 'gradient',
    dealerBorderFillMode: 'solid',
    dealerBorderGlow: false,
    zeroCross: 'gameOrange',
    zeroCrossHex: '#fb923c',
    zeroCrossHex2: '#c2410c',
    zeroCrossMode: 'gradient',
    zeroCrossGlow: true,
    note,
  };
}

const STATES: {
  id: StateId;
  title: string;
  example: string;
  taken: number | '—';
  bid: number | '—';
  showSlots: boolean;
  nowDefault: StatePick;
  /** Между раздачами: стили = финал розыгрыша (ровно/перебор/недобор), без отдельной обводки */
  inheritOutcomes?: boolean;
}[] = [
  {
    id: 'biddingNoBid',
    title: 'Торги · ещё не заказал',
    example: '0 / —',
    taken: 0,
    bid: '—',
    showSlots: false,
    nowDefault: makePick('plain', 'slate', 'plainDark', 'dealerBidding', 'ждёт хода'),
  },
  {
    id: 'biddingTurnNoBid',
    title: 'Торги · сейчас заказывает',
    example: '0 / —',
    taken: 0,
    bid: '—',
    showSlots: false,
    nowDefault: makePick(
      'plain',
      'slate',
      'amber2',
      'dealerBidding',
      'ход торгов: ещё не заказал, сейчас выбирает',
    ),
  },
  {
    id: 'biddingHasBid',
    title: 'Торги · уже заказал',
    example: '0 / 3',
    taken: 0,
    bid: 3,
    showSlots: true,
    nowDefault: makePick('cyanTaken', 'bidPending', 'amber1', 'dealerGold', 'слоты пустые'),
  },
  {
    id: 'zeroPending',
    title: 'Розыгрыш · 0 взято',
    example: '0 / 3',
    taken: 0,
    bid: 3,
    showSlots: true,
    nowDefault: makePick('cyanTaken', 'bidPending', 'amber1', 'dealerPlaying'),
  },
  {
    id: 'zeroExact',
    title: 'Ровно 0/0',
    example: '0 / 0',
    taken: 0,
    bid: 0,
    showSlots: true,
    nowDefault: makePick('lilacMobile', 'lilacMobile', 'exact3', 'dealerExact'),
  },
  {
    id: 'chasing',
    title: 'Догоняем',
    example: '2 / 5',
    taken: 2,
    bid: 5,
    showSlots: true,
    nowDefault: makePick('yellow', 'acid', 'amber2', 'dealerPlaying'),
  },
  {
    id: 'exact',
    title: 'Ровно',
    example: '4 / 4',
    taken: 4,
    bid: 4,
    showSlots: true,
    nowDefault: makePick('lilacMobile', 'lilacMobile', 'exact3', 'dealerExact'),
  },
  {
    id: 'over',
    title: 'Перебор',
    example: '5 / 3',
    taken: 5,
    bid: 3,
    showSlots: true,
    nowDefault: makePick('overNeon', 'overNeon', 'over', 'dealerOver'),
  },
  {
    id: 'under',
    title: 'Жёсткий недобор',
    example: '1 / 6',
    taken: 1,
    bid: 6,
    showSlots: true,
    nowDefault: makePick('red', 'amber', 'under', 'dealerUnder'),
  },
  {
    id: 'collecting',
    title: 'Между раздачами',
    example: 'финал',
    taken: 2,
    bid: 5,
    showSlots: true,
    inheritOutcomes: true,
    nowDefault: makePick(
      'lilacMobile',
      'lilacMobile',
      'exact3',
      'dealerExact',
      'как закончили розыгрыш: ровно / перебор / недобор (отдельной обводки нет)',
    ),
  },
  {
    id: 'rare8',
    title: 'Редкий заказ 8',
    example: '2 / 8',
    taken: 2,
    bid: 8,
    showSlots: true,
    nowDefault: makePick('yellow', 'gold8', 'amber2', 'dealerPlaying'),
  },
];

const CONTEXTS: {
  id: CtxId;
  title: string;
  hint: string;
  layout: 'h' | 'ear';
  canBeDealer?: boolean;
}[] = [
  { id: 'south', title: 'Юг', hint: 'мобилка · цвета едины', layout: 'h', canBeDealer: true },
  { id: 'north', title: 'Север', hint: 'мобилка · может быть сдающим', layout: 'h', canBeDealer: true },
  { id: 'we', title: 'З / В', hint: 'мобилка · может быть сдающим', layout: 'h', canBeDealer: true },
  { id: 'ear', title: 'Ушко high-bid', hint: 'мобилка · может быть сдающим', layout: 'ear', canBeDealer: true },
];

/** Цвета едины на всей мобилке. Роль сдающего — отдельный border. ПК/планшет вне лабы. */
function nowBorderFor(stateId: StateId, role: SeatRole): BorderId {
  const st = STATES.find((s) => s.id === stateId)!;
  return role === 'dealer' ? st.nowDefault.dealerBorder : st.nowDefault.border;
}

function normalizeHex(raw: string): string {
  const t = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1];
    const g = t[2];
    const b = t[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t.toLowerCase()}`;
  return t.startsWith('#') ? t : `#${t}`;
}

function resolveDigitHex(id: DigitId, customHex: string): string {
  if (id === 'custom') return normalizeHex(customHex || '#ffffff');
  return DIGIT_BY_ID[id]?.hex ?? '#ffffff';
}

function digitLabel(id: DigitId, customHex: string): string {
  if (id === 'custom') return `Свой ${normalizeHex(customHex)}`;
  return DIGIT_LABEL[id] ?? id;
}

function borderLabel(id: BorderId, customHex: string): string {
  if (id === 'custom') return `Своя ${normalizeHex(customHex)}`;
  return BORDER_LABEL[id] ?? id;
}

function loadStore(): LabStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        schemaVersion: LAB_SCHEMA_VERSION,
        picks: {},
        savedRoles: {},
        policy: 'mobile-unified-v2',
        freeNote: '',
      };
    }
    const parsed = JSON.parse(raw) as Partial<LabStore>;
    const picksIn = parsed.picks ?? {};
    const picks: Partial<Record<StateId, StatePick>> = {};
    for (const s of STATES) {
      if (picksIn[s.id]) {
        picks[s.id] = serializePick(hydratePick(picksIn[s.id], s.nowDefault));
      }
    }
    return {
      schemaVersion: LAB_SCHEMA_VERSION,
      picks,
      savedRoles: parsed.savedRoles ?? {},
      policy: parsed.policy || 'mobile-unified-v2',
      freeNote: parsed.freeNote || '',
    };
  } catch {
    return {
      schemaVersion: LAB_SCHEMA_VERSION,
      picks: {},
      savedRoles: {},
      policy: 'mobile-unified-v2',
      freeNote: '',
    };
  }
}

function saveStore(store: LabStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Старые сохранения без savedRoles считаем «обычный ✓»; ключи состояний не трогаем. */
function roleSavedFlags(
  store: LabStore,
  id: StateId,
): { normal: boolean; dealer: boolean } {
  const meta = store.savedRoles?.[id];
  if (meta) {
    return { normal: Boolean(meta.normal), dealer: Boolean(meta.dealer) };
  }
  if (store.picks[id]) return { normal: true, dealer: false };
  return { normal: false, dealer: false };
}

function serializePick(p: StatePick): StatePick {
  return {
    taken: p.taken,
    bid: p.bid,
    slash: p.slash,
    border: p.border,
    dealerBorder: p.dealerBorder,
    takenHex: normalizeHex(p.takenHex),
    bidHex: normalizeHex(p.bidHex),
    slashHex: normalizeHex(p.slashHex),
    takenGlow: Boolean(p.takenGlow),
    bidGlow: Boolean(p.bidGlow),
    slashGlow: Boolean(p.slashGlow),
    figureWeight: p.figureWeight,
    dealerTaken: p.dealerTaken,
    dealerBid: p.dealerBid,
    dealerSlash: p.dealerSlash,
    dealerTakenHex: normalizeHex(p.dealerTakenHex),
    dealerBidHex: normalizeHex(p.dealerBidHex),
    dealerSlashHex: normalizeHex(p.dealerSlashHex),
    dealerTakenGlow: Boolean(p.dealerTakenGlow),
    dealerBidGlow: Boolean(p.dealerBidGlow),
    dealerSlashGlow: Boolean(p.dealerSlashGlow),
    dealerFigureWeight: p.dealerFigureWeight,
    borderHex: normalizeHex(p.borderHex),
    borderHex2: normalizeHex(p.borderHex2),
    borderFillHex: normalizeHex(p.borderFillHex),
    borderFillHex2: normalizeHex(p.borderFillHex2),
    borderFillOnly: Boolean(p.borderFillOnly),
    lastPresetBorder: p.lastPresetBorder,
    borderWidth: p.borderWidth,
    borderEdgeMode: p.borderEdgeMode,
    borderFillMode: p.borderFillMode,
    borderGlow: Boolean(p.borderGlow),
    dealerBorderHex: normalizeHex(p.dealerBorderHex),
    dealerBorderHex2: normalizeHex(p.dealerBorderHex2),
    dealerBorderFillHex: normalizeHex(p.dealerBorderFillHex),
    dealerBorderFillHex2: normalizeHex(p.dealerBorderFillHex2),
    dealerBorderFillOnly: Boolean(p.dealerBorderFillOnly),
    dealerLastPresetBorder: p.dealerLastPresetBorder,
    dealerBorderWidth: p.dealerBorderWidth,
    dealerBorderEdgeMode: p.dealerBorderEdgeMode,
    dealerBorderFillMode: p.dealerBorderFillMode,
    dealerBorderGlow: Boolean(p.dealerBorderGlow),
    zeroCross: p.zeroCross,
    zeroCrossHex: normalizeHex(p.zeroCrossHex),
    zeroCrossHex2: normalizeHex(p.zeroCrossHex2),
    zeroCrossMode: p.zeroCrossMode,
    zeroCrossGlow: Boolean(p.zeroCrossGlow),
    note: typeof p.note === 'string' ? p.note : '',
  };
}

const STATE_PICK_KEY_COUNT = 48;

function buildExportStore(
  store: LabStore,
  draft: StatePick,
  currentStateId: StateId,
): LabStore {
  const picks: Partial<Record<StateId, StatePick>> = {};
  for (const s of STATES) {
    const base = hydratePick(store.picks[s.id], s.nowDefault);
    const raw = s.id === currentStateId ? draft : base;
    picks[s.id] = serializePick(hydratePick(raw, s.nowDefault));
  }
  return {
    schemaVersion: LAB_SCHEMA_VERSION,
    picks,
    savedRoles: store.savedRoles ?? {},
    policy: store.policy || 'mobile-unified-v2',
    freeNote: store.freeNote || '',
  };
}

function pickFieldCount(p: StatePick): number {
  return Object.keys(serializePick(p)).length;
}

type FigureStyle = {
  taken: DigitId;
  bid: DigitId;
  slash: DigitId;
  takenHex: string;
  bidHex: string;
  slashHex: string;
  takenGlow: boolean;
  bidGlow: boolean;
  slashGlow: boolean;
  figureWeight: FigureWeight;
};

function figuresFromPick(p: StatePick, role: SeatRole): FigureStyle {
  if (role === 'dealer') {
    return {
      taken: p.dealerTaken,
      bid: p.dealerBid,
      slash: p.dealerSlash,
      takenHex: p.dealerTakenHex,
      bidHex: p.dealerBidHex,
      slashHex: p.dealerSlashHex,
      takenGlow: p.dealerTakenGlow,
      bidGlow: p.dealerBidGlow,
      slashGlow: p.dealerSlashGlow,
      figureWeight: p.dealerFigureWeight,
    };
  }
  return {
    taken: p.taken,
    bid: p.bid,
    slash: p.slash,
    takenHex: p.takenHex,
    bidHex: p.bidHex,
    slashHex: p.slashHex,
    takenGlow: p.takenGlow,
    bidGlow: p.bidGlow,
    slashGlow: p.slashGlow,
    figureWeight: p.figureWeight,
  };
}

function hydratePick(raw: Partial<StatePick> | undefined, fallback: StatePick): StatePick {
  if (!raw) return { ...fallback };
  const taken = (raw.taken && DIGIT_BY_ID[raw.taken as DigitId] ? raw.taken : fallback.taken) as DigitId;
  const bid = (raw.bid && DIGIT_BY_ID[raw.bid as DigitId] ? raw.bid : fallback.bid) as DigitId;
  const slash = (raw.slash && DIGIT_BY_ID[raw.slash as DigitId] ? raw.slash : fallback.slash ?? 'slate') as DigitId;
  let border = raw.border as BorderId | undefined;
  if ((border as string) === 'dealerGlass' || (border as string) === 'slateOpen') border = fallback.border;
  if ((border as string) === 'midVert') border = 'plainDark';
  if (!border || !BORDER_LABEL[border]) border = fallback.border;
  let dealerBorder = (raw.dealerBorder as BorderId | undefined) ?? fallback.dealerBorder;
  if (!BORDER_LABEL[dealerBorder]) dealerBorder = fallback.dealerBorder;
  const clampW = (v: unknown, fb: BorderWidthPx): BorderWidthPx =>
    v === 1 || v === 2 || v === 3 || v === 4 ? v : fb;
  const clampMode = (v: unknown, fb: GradMode): GradMode =>
    v === 'gradient' || v === 'solid' ? v : fb;
  const clampWeight = (v: unknown, fb: FigureWeight): FigureWeight =>
    v === 500 || v === 600 || v === 700 || v === 800 || v === 900 ? v : fb;
  return {
    taken,
    bid,
    slash,
    border,
    dealerBorder,
    takenHex: raw.takenHex || pickHex(taken),
    bidHex: raw.bidHex || pickHex(bid),
    slashHex: raw.slashHex || pickHex(slash),
    takenGlow: typeof raw.takenGlow === 'boolean' ? raw.takenGlow : (fallback.takenGlow ?? false),
    bidGlow: typeof raw.bidGlow === 'boolean' ? raw.bidGlow : (fallback.bidGlow ?? false),
    slashGlow: typeof raw.slashGlow === 'boolean' ? raw.slashGlow : (fallback.slashGlow ?? false),
    figureWeight: clampWeight(raw.figureWeight, fallback.figureWeight ?? 800),
    dealerTaken: (raw.dealerTaken && DIGIT_BY_ID[raw.dealerTaken as DigitId]
      ? raw.dealerTaken
      : fallback.dealerTaken ?? taken) as DigitId,
    dealerBid: (raw.dealerBid && DIGIT_BY_ID[raw.dealerBid as DigitId]
      ? raw.dealerBid
      : fallback.dealerBid ?? bid) as DigitId,
    dealerSlash: (raw.dealerSlash && DIGIT_BY_ID[raw.dealerSlash as DigitId]
      ? raw.dealerSlash
      : fallback.dealerSlash ?? slash) as DigitId,
    dealerTakenHex:
      raw.dealerTakenHex ||
      fallback.dealerTakenHex ||
      pickHex((raw.dealerTaken as DigitId) || taken),
    dealerBidHex:
      raw.dealerBidHex || fallback.dealerBidHex || pickHex((raw.dealerBid as DigitId) || bid),
    dealerSlashHex:
      raw.dealerSlashHex ||
      fallback.dealerSlashHex ||
      pickHex((raw.dealerSlash as DigitId) || slash),
    dealerTakenGlow:
      typeof raw.dealerTakenGlow === 'boolean'
        ? raw.dealerTakenGlow
        : (fallback.dealerTakenGlow ?? false),
    dealerBidGlow:
      typeof raw.dealerBidGlow === 'boolean' ? raw.dealerBidGlow : (fallback.dealerBidGlow ?? false),
    dealerSlashGlow:
      typeof raw.dealerSlashGlow === 'boolean'
        ? raw.dealerSlashGlow
        : (fallback.dealerSlashGlow ?? false),
    dealerFigureWeight: clampWeight(
      raw.dealerFigureWeight,
      fallback.dealerFigureWeight ?? fallback.figureWeight ?? 800,
    ),
    borderHex: raw.borderHex || fallback.borderHex,
    borderHex2: raw.borderHex2 || fallback.borderHex2 || '#f472b6',
    borderFillHex: raw.borderFillHex || fallback.borderFillHex || DEFAULT_BORDER_FILL,
    borderFillHex2: raw.borderFillHex2 || fallback.borderFillHex2 || '#1e1b4b',
    borderFillOnly:
      typeof raw.borderFillOnly === 'boolean' ? raw.borderFillOnly : (fallback.borderFillOnly ?? false),
    lastPresetBorder: (() => {
      const lp = raw.lastPresetBorder as BorderId | undefined;
      if (lp && lp !== 'custom' && BORDER_LABEL[lp]) return lp;
      if (border !== 'custom') return border;
      return fallback.lastPresetBorder ?? 'amber2';
    })(),
    borderWidth: clampW(raw.borderWidth, fallback.borderWidth ?? 2),
    borderEdgeMode: clampMode(raw.borderEdgeMode, fallback.borderEdgeMode ?? 'solid'),
    borderFillMode: clampMode(raw.borderFillMode, fallback.borderFillMode ?? 'solid'),
    borderGlow: typeof raw.borderGlow === 'boolean' ? raw.borderGlow : (fallback.borderGlow ?? false),
    dealerBorderHex: raw.dealerBorderHex || fallback.dealerBorderHex,
    dealerBorderHex2: raw.dealerBorderHex2 || fallback.dealerBorderHex2 || '#f40bf5',
    dealerBorderFillHex:
      raw.dealerBorderFillHex || fallback.dealerBorderFillHex || DEFAULT_DEALER_BORDER_FILL,
    dealerBorderFillHex2:
      raw.dealerBorderFillHex2 || fallback.dealerBorderFillHex2 || '#1a0033',
    dealerBorderFillOnly:
      typeof raw.dealerBorderFillOnly === 'boolean'
        ? raw.dealerBorderFillOnly
        : (fallback.dealerBorderFillOnly ?? false),
    dealerLastPresetBorder: (() => {
      const lp = raw.dealerLastPresetBorder as BorderId | undefined;
      if (lp && lp !== 'custom' && BORDER_LABEL[lp]) return lp;
      if (dealerBorder !== 'custom') return dealerBorder;
      return fallback.dealerLastPresetBorder ?? 'dealerBidding';
    })(),
    dealerBorderWidth: clampW(raw.dealerBorderWidth, fallback.dealerBorderWidth ?? 2),
    dealerBorderEdgeMode: clampMode(
      raw.dealerBorderEdgeMode,
      fallback.dealerBorderEdgeMode ?? 'gradient',
    ),
    dealerBorderFillMode: clampMode(
      raw.dealerBorderFillMode,
      fallback.dealerBorderFillMode ?? 'solid',
    ),
    dealerBorderGlow:
      typeof raw.dealerBorderGlow === 'boolean'
        ? raw.dealerBorderGlow
        : (fallback.dealerBorderGlow ?? false),
    zeroCross: (() => {
      const z = raw.zeroCross as ZeroCrossId | undefined;
      if (z && ZERO_CROSS_BY_ID[z]) return z;
      return fallback.zeroCross ?? 'gameOrange';
    })(),
    zeroCrossHex: raw.zeroCrossHex || fallback.zeroCrossHex || '#fb923c',
    zeroCrossHex2: raw.zeroCrossHex2 || fallback.zeroCrossHex2 || '#c2410c',
    zeroCrossMode: clampMode(raw.zeroCrossMode, fallback.zeroCrossMode ?? 'gradient'),
    zeroCrossGlow:
      typeof raw.zeroCrossGlow === 'boolean'
        ? raw.zeroCrossGlow
        : (fallback.zeroCrossGlow ?? true),
    note: raw.note ?? '',
  };
}

function DigitSample({
  id,
  hex,
  children,
  neon = false,
  weight = 800,
}: {
  id: DigitId;
  hex: string;
  children: ReactNode;
  neon?: boolean;
  weight?: FigureWeight;
}) {
  const color = resolveDigitHex(id, hex);
  const style: CSSProperties = neon
    ? {
        color,
        WebkitTextFillColor: color,
        fontWeight: weight,
        ['--osl-digit-weight' as string]: String(weight),
        textShadow: `0 0 4px ${color}88, 0 0 9px ${color}55`,
      }
    : {
        color,
        WebkitTextFillColor: color,
        fontWeight: weight,
        ['--osl-digit-weight' as string]: String(weight),
        textShadow: '0 1px 1px rgba(0,0,0,0.75)',
      };
  return (
    <span className={`osl-digit${neon ? ' osl-digit--neon' : ''}`} style={style}>
      {children}
    </span>
  );
}

type CustomBorderOpts = {
  edgeHex: string;
  edgeHex2: string;
  fillHex: string;
  fillHex2: string;
  width: BorderWidthPx;
  edgeMode: GradMode;
  fillMode: GradMode;
  glow: boolean;
};

function customBorderStyle(opts: CustomBorderOpts): CSSProperties {
  const edge = normalizeHex(opts.edgeHex);
  const edge2 = normalizeHex(opts.edgeHex2 || edge);
  const fill = normalizeHex(opts.fillHex || DEFAULT_BORDER_FILL);
  const fill2 = normalizeHex(opts.fillHex2 || fill);
  const fillLayer =
    opts.fillMode === 'gradient'
      ? `linear-gradient(180deg, ${fill} 0%, ${fill2} 100%)`
      : `linear-gradient(${fill}, ${fill})`;
  const edgeLayer =
    opts.edgeMode === 'gradient'
      ? `linear-gradient(180deg, ${edge} 0%, ${edge2} 100%)`
      : `linear-gradient(${edge}, ${edge})`;
  return {
    ['--osl-custom-w' as string]: `${opts.width}px`,
    ['--osl-custom-fill-layer' as string]: fillLayer,
    ['--osl-custom-edge-layer' as string]: edgeLayer,
    ['--osl-custom-edge' as string]: edge,
    ['--osl-custom-fill' as string]: fill,
  } as CSSProperties;
}

function customOptsFromPick(p: StatePick, role: SeatRole): CustomBorderOpts {
  if (role === 'dealer') {
    return {
      edgeHex: p.dealerBorderHex,
      edgeHex2: p.dealerBorderHex2,
      fillHex: p.dealerBorderFillHex,
      fillHex2: p.dealerBorderFillHex2,
      width: p.dealerBorderWidth,
      edgeMode: p.dealerBorderEdgeMode,
      fillMode: p.dealerBorderFillMode,
      glow: p.dealerBorderGlow,
    };
  }
  return {
    edgeHex: p.borderHex,
    edgeHex2: p.borderHex2,
    fillHex: p.borderFillHex,
    fillHex2: p.borderFillHex2,
    width: p.borderWidth,
    edgeMode: p.borderEdgeMode,
    fillMode: p.borderFillMode,
    glow: p.borderGlow,
  };
}

/** Цвет ореола для пресета (когда неон без ★ Своя) */
function presetGlowEdge(border: BorderId, fallbackHex: string): string {
  switch (border) {
    case 'dealerExact':
    case 'exact3':
    case 'exact1':
      return '#e879f9';
    case 'dealerOver':
    case 'over':
      return '#a3a86a';
    case 'dealerUnder':
    case 'under':
      return '#f87171';
    case 'dealerBidding':
      return '#24acfb';
    case 'dealerPlaying':
      return '#a78bfa';
    case 'dealerGold':
    case 'amber1':
    case 'amber2':
      return '#fbbf24';
    case 'indigoThin':
      return '#818cf8';
    case 'plainDark':
      return '#94a3b8';
    default:
      return normalizeHex(fallbackHex || '#e879f9');
  }
}

function resolveZeroCrossColors(p: {
  zeroCross: ZeroCrossId;
  zeroCrossHex: string;
  zeroCrossHex2: string;
  zeroCrossMode: GradMode;
}): { c1: string; c2: string; mode: GradMode; mid: string } {
  const preset = ZERO_CROSS_BY_ID[p.zeroCross];
  if (p.zeroCross === 'custom') {
    const c1 = normalizeHex(p.zeroCrossHex || '#fb923c');
    const c2 = normalizeHex(p.zeroCrossHex2 || c1);
    return {
      c1,
      c2,
      mode: p.zeroCrossMode,
      mid: c1,
    };
  }
  return {
    c1: preset.hex,
    c2: preset.hex2,
    mode: preset.mode,
    mid: preset.hex,
  };
}

/** Крестик «заказ 0» — как opponent-zero-order-cross-mobile в GameTable */
function ZeroOrderCross({
  crossId,
  hex,
  hex2,
  mode,
  glow,
  size = 22,
}: {
  crossId: ZeroCrossId;
  hex: string;
  hex2: string;
  mode: GradMode;
  glow: boolean;
  size?: number;
}) {
  const uid = useId().replace(/:/g, '');
  const { c1, c2, mode: resolvedMode, mid } = resolveZeroCrossColors({
    zeroCross: crossId,
    zeroCrossHex: hex,
    zeroCrossHex2: hex2,
    zeroCrossMode: mode,
  });
  const stroke = resolvedMode === 'gradient' ? `url(#${uid})` : c1;
  return (
    <span
      className={`osl-zero-cross${glow ? ' osl-zero-cross--glow' : ''}`}
      style={{ ['--osl-zero-cross-glow' as string]: mid, width: size, height: size }}
      title="Заказ: не брать взятки"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width={size} height={size}>
        {resolvedMode === 'gradient' ? (
          <defs>
            <linearGradient id={uid} x1="5" y1="5" x2="19" y2="19" gradientUnits="userSpaceOnUse">
              <stop stopColor={crossId === 'gameOrange' ? '#fef3c7' : c1} />
              <stop offset="0.4" stopColor={c1} />
              <stop offset="1" stopColor={c2} />
            </linearGradient>
          </defs>
        ) : null}
        <path
          d="M6.25 6.25l11.5 11.5m0-11.5l-11.5 11.5"
          stroke="rgba(15, 23, 42, 0.6)"
          strokeWidth="6.25"
          strokeLinecap="round"
        />
        <path
          d="M6.25 6.25l11.5 11.5m0-11.5l-11.5 11.5"
          stroke={stroke}
          strokeWidth="4.35"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

function MockPanel({
  taken,
  bid,
  takenDigit,
  bidDigit,
  slashDigit = 'slate',
  takenHex,
  bidHex,
  slashHex,
  takenNeon = false,
  bidNeon = false,
  slashNeon = false,
  figureWeight = 800,
  border,
  borderHex,
  borderFillHex,
  fillOnly = false,
  customOpts,
  layout,
  modeTag,
  showSlots = true,
  turnPulse = false,
  zeroCross,
}: {
  taken: number | '—';
  bid: number | '—';
  takenDigit: DigitId;
  bidDigit: DigitId;
  slashDigit?: DigitId;
  takenHex: string;
  bidHex: string;
  slashHex?: string;
  takenNeon?: boolean;
  bidNeon?: boolean;
  slashNeon?: boolean;
  figureWeight?: FigureWeight;
  border: BorderId;
  borderHex: string;
  borderFillHex?: string;
  /** Фон поверх пресета рамки (без ★ Своя) */
  fillOnly?: boolean;
  customOpts?: CustomBorderOpts;
  layout: 'h' | 'ear';
  modeTag: string;
  showSlots?: boolean;
  /** Ход торгов: «сейчас заказывает» */
  turnPulse?: boolean;
  /** Крестик заказа 0 (если bid===0) */
  zeroCross?: Pick<
    StatePick,
    'zeroCross' | 'zeroCrossHex' | 'zeroCrossHex2' | 'zeroCrossMode' | 'zeroCrossGlow'
  >;
}) {
  const fill = normalizeHex(
    (customOpts?.fillHex || borderFillHex || DEFAULT_BORDER_FILL) as string,
  );
  const fill2 = normalizeHex(customOpts?.fillHex2 || fill);
  const fillMode = customOpts?.fillMode ?? 'solid';
  const fillLayer =
    fillMode === 'gradient'
      ? `linear-gradient(180deg, ${fill} 0%, ${fill2} 100%)`
      : `linear-gradient(${fill}, ${fill})`;
  const useFillOnly = Boolean(fillOnly) && border !== 'custom';
  const showGlow = Boolean(customOpts?.glow);
  const glowEdge =
    border === 'custom'
      ? normalizeHex(customOpts?.edgeHex || borderHex || '#f0abfc')
      : presetGlowEdge(border, borderHex);
  const borderCls = [
    border === 'custom' ? 'osl-border--custom' : `osl-border--${border}`,
    showGlow ? (border === 'custom' ? 'osl-border--custom-glow' : 'osl-border--glow') : '',
    useFillOnly ? 'osl-border--fill-only' : '',
    turnPulse ? 'osl-panel--turn' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const fillStyle: CSSProperties | undefined = useFillOnly
    ? ({
        ['--osl-fill-override' as string]: fill,
        ['--osl-fill-override-layer' as string]: fillLayer,
      } as CSSProperties)
    : undefined;
  const glowStyle: CSSProperties | undefined = showGlow
    ? ({ ['--osl-glow-edge' as string]: glowEdge } as CSSProperties)
    : undefined;
  const borderStyle: CSSProperties | undefined =
    border === 'custom'
      ? customBorderStyle(
          customOpts ?? {
            edgeHex: borderHex,
            edgeHex2: borderHex,
            fillHex: fill,
            fillHex2: fill,
            width: 2,
            edgeMode: 'solid',
            fillMode: 'solid',
            glow: false,
          },
        )
      : fillStyle || glowStyle
        ? { ...fillStyle, ...glowStyle }
        : undefined;

  const figures = (
    <span className="osl-figures">
      <DigitSample id={takenDigit} hex={takenHex} neon={takenNeon} weight={figureWeight}>
        {taken}
      </DigitSample>
      <DigitSample
        id={slashDigit}
        hex={slashHex || pickHex(slashDigit)}
        neon={slashNeon}
        weight={figureWeight}
      >
        /
      </DigitSample>
      <DigitSample id={bidDigit} hex={bidHex} neon={bidNeon} weight={figureWeight}>
        {bid}
      </DigitSample>
    </span>
  );
  const showZeroCross = showSlots && bid === 0 && zeroCross;
  const slotCount = typeof bid === 'number' && bid > 0 ? Math.min(bid, 5) : 3;
  const slots = !showSlots ? (
    <span className="osl-no-slots">ещё не заказал</span>
  ) : showZeroCross ? (
    <span className="osl-slots osl-slots--zero-cross" aria-hidden>
      <ZeroOrderCross
        crossId={zeroCross.zeroCross}
        hex={zeroCross.zeroCrossHex}
        hex2={zeroCross.zeroCrossHex2}
        mode={zeroCross.zeroCrossMode}
        glow={zeroCross.zeroCrossGlow}
      />
    </span>
  ) : (
    <span className="osl-slots" aria-hidden>
      {Array.from({ length: slotCount }, (_, i) => (
        <span
          key={`s${i}`}
          className={`osl-slot${typeof taken === 'number' && i < taken ? ' is-on' : ''}`}
        />
      ))}
    </span>
  );

  return (
    <div className={`osl-mock osl-mock--${layout}`}>
      <div className="osl-mock__tag">{modeTag}</div>
      {layout === 'ear' ? (
        <div className="osl-ear-stack">
          <div className={`osl-ear-tab ${borderCls}`} style={borderStyle}>
            {figures}
          </div>
          <div className={`osl-panel ${borderCls}`} style={borderStyle}>
            {slots}
          </div>
        </div>
      ) : (
        <div className={`osl-panel ${borderCls}`.trim()} style={borderStyle}>
          {figures}
          {slots}
        </div>
      )}
      <div className="osl-mock__foot">
        {digitLabel(takenDigit, takenHex)}{' '}
        <span style={{ color: resolveDigitHex(slashDigit, slashHex || pickHex(slashDigit)) }}>/</span>{' '}
        {digitLabel(bidDigit, bidHex)} · w{figureWeight} · {borderLabel(border, borderHex)}
        {border === 'custom' && customOpts
          ? ` · ${customOpts.width}px · рамка ${customOpts.edgeMode} · фон ${customOpts.fillMode}${customOpts.glow ? ' · неон' : ' · без свечения'}`
          : [
              useFillOnly
                ? fillMode === 'gradient'
                  ? ` · фон градиент ${fill}→${fill2}`
                  : ` · фон поверх пресета ${fill}`
                : '',
              showGlow ? ' · неон рамки' : '',
            ]
              .filter(Boolean)
              .join('')}
        {!showSlots ? ' · без слотов' : ''}
        {showZeroCross ? ` · крестик ${ZERO_CROSS_BY_ID[zeroCross.zeroCross]?.label ?? zeroCross.zeroCross}` : ''}
        {turnPulse ? ' · ход' : ''}
      </div>
    </div>
  );
}

function LabNeonColorField({
  title,
  hex,
  onHex,
  onActivateCustom,
  triggerLabel = 'Палитра',
  neon,
  onNeonChange,
}: {
  title: string;
  hex: string;
  onHex: (hex: string) => void;
  /** Если задано — при выборе цвета уводит в ★ Своя (не для фона поверх пресета). */
  onActivateCustom?: () => void;
  triggerLabel?: string;
  /** Если задано — «Неон» в палитре пишется в draft и видно на цифрах */
  neon?: boolean;
  onNeonChange?: (neon: boolean) => void;
}) {
  const [localNeon, setLocalNeon] = useState(false);
  const neonBrush = neon ?? localNeon;
  const setNeonBrush = (next: boolean) => {
    if (onNeonChange) onNeonChange(next);
    else setLocalNeon(next);
  };
  const value = normalizeHex(hex);
  const safe = /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff';
  const apply = (next: string, forceNeon?: boolean) => {
    onActivateCustom?.();
    if (forceNeon && onNeonChange) onNeonChange(true);
    onHex(normalizeHex(next));
  };
  return (
    <div className="osl-custom osl-custom--neon">
      <div className="osl-custom__title">
        {title}
        {onNeonChange ? (
          <span className={`osl-custom__neon-flag${neonBrush ? ' is-on' : ''}`}>
            {neonBrush ? ' · неон ON' : ' · неон OFF'}
          </span>
        ) : null}
      </div>
      <div className="osl-custom__row">
        <AvatarNeonColorPicker
          color={safe}
          onChange={(c) => apply(c)}
          neonBrush={neonBrush}
          onNeonBrushChange={setNeonBrush}
          hideExternalModeToggle
          title={title}
          triggerLabel={triggerLabel}
        />
        <input
          type="text"
          className="osl-hex"
          value={hex}
          spellCheck={false}
          placeholder="#rrggbb"
          onFocus={onActivateCustom}
          onChange={(e) => onHex(e.target.value)}
          onBlur={() => onHex(normalizeHex(hex))}
        />
        <button type="button" className="osl-btn" onClick={() => apply(safe)}>
          Применить
        </button>
      </div>
      {onNeonChange ? (
        <div className="osl-geom-row" role="group" aria-label="Свечение цифры">
          <span className="osl-geom-label">Цифра</span>
          <button
            type="button"
            className={`osl-btn${!neonBrush ? ' osl-btn--accent' : ''}`}
            onClick={() => setNeonBrush(false)}
          >
            Без неона
          </button>
          <button
            type="button"
            className={`osl-btn${neonBrush ? ' osl-btn--accent' : ''}`}
            onClick={() => setNeonBrush(true)}
          >
            Неон
          </button>
        </div>
      ) : null}
      <div className="osl-neon-strip" role="list" aria-label={`Неон · ${title}`}>
        {NEON_PALETTE_SWATCHES.map((sw) => (
          <button
            key={`${title}-${sw}`}
            type="button"
            role="listitem"
            className={`osl-neon-strip__swatch${safe === sw ? ' is-on' : ''}`}
            style={{
              background: sw,
              boxShadow:
                sw === '#1a0033' || sw === '#080812'
                  ? '0 0 10px #a855f7aa'
                  : `0 0 10px ${sw}, 0 0 4px #fff8`,
            }}
            title={sw}
            aria-label={sw}
            onClick={() => apply(sw, true)}
          />
        ))}
      </div>
    </div>
  );
}

export function OrderStyleLabPage({ onBack }: { onBack: () => void }) {
  const [store, setStore] = useState<LabStore>(() =>
    typeof window !== 'undefined'
      ? loadStore()
      : { picks: {}, savedRoles: {}, policy: '', freeNote: '' },
  );
  const [stateId, setStateId] = useState<StateId>('chasing');
  const [view, setView] = useState<'now' | 'pick' | 'both'>('pick');
  const [seatRole, setSeatRole] = useState<SeatRole>('normal');
  const [draft, setDraft] = useState<StatePick>(() => STATES.find((s) => s.id === 'chasing')!.nowDefault);
  const [copied, setCopied] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevHtmlHeight = html.style.height;
    const prevBodyHeight = body.style.height;
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    html.style.height = 'auto';
    body.style.height = 'auto';
    html.classList.add('osl-lab-scroll');
    body.classList.add('osl-lab-scroll');
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      html.style.height = prevHtmlHeight;
      body.style.height = prevBodyHeight;
      html.classList.remove('osl-lab-scroll');
      body.classList.remove('osl-lab-scroll');
    };
  }, []);

  const state = STATES.find((s) => s.id === stateId)!;

  const selectState = useCallback(
    (id: StateId) => {
      setStateId(id);
      const st = STATES.find((s) => s.id === id)!;
      setDraft(hydratePick(store.picks[id], st.nowDefault));
    },
    [store.picks],
  );

  const persist = useCallback((next: LabStore) => {
    setStore(next);
    saveStore(next);
  }, []);

  const savePickForRole = (role: SeatRole | 'both') => {
    /** Полный снимок draft (обе оси) — иначе «Сохранить · сдающий» терял правки обычного и наоборот. */
    const full = serializePick(hydratePick(draft, state.nowDefault));
    const prevFlags = roleSavedFlags(store, stateId);
    const nextFlags = {
      normal: role === 'normal' || role === 'both' ? true : prevFlags.normal,
      dealer: role === 'dealer' || role === 'both' ? true : prevFlags.dealer,
    };
    const nextStore: LabStore = {
      ...store,
      schemaVersion: LAB_SCHEMA_VERSION,
      picks: { ...store.picks, [stateId]: full },
      savedRoles: { ...store.savedRoles, [stateId]: nextFlags },
      policy: store.policy || 'mobile-unified-v2',
    };
    persist(nextStore);
    setDraft(full);
    const n = pickFieldCount(full);
    setFlash(
      role === 'both'
        ? `Сохранено ПОЛНОСТЬЮ (${n} полей): ${state.title}`
        : role === 'dealer'
          ? `Сохранено полностью · метка СДАЮЩИЙ (${n} полей): ${state.title}`
          : `Сохранено полностью · метка обычный (${n} полей): ${state.title}`,
    );
    window.setTimeout(() => setFlash(''), 2200);
  };

  const exportJson = async () => {
    const payload = buildExportStore(store, draft, stateId);
    const states = Object.keys(payload.picks);
    const incomplete = states.filter((id) => {
      const p = payload.picks[id as StateId];
      return !p || pickFieldCount(p) < STATE_PICK_KEY_COUNT;
    });
    if (incomplete.length) {
      setFlash(`Экспорт: неполные состояния ${incomplete.join(', ')}`);
      window.setTimeout(() => setFlash(''), 4000);
    }
    /** Сразу пишем нормализованный снимок в localStorage — без «дырявых» старых picks */
    persist(payload);
    setDraft(payload.picks[stateId] ?? draft);
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFlash(
        `JSON v${LAB_SCHEMA_VERSION}: ${states.length} состояний × ${STATE_PICK_KEY_COUNT} полей` +
          (incomplete.length ? ` · дыры: ${incomplete.join(',')}` : ' · полно'),
      );
      window.setTimeout(() => setCopied(false), 1600);
      window.setTimeout(() => setFlash(''), 3500);
    } catch {
      window.prompt('Скопируйте JSON:', text);
    }
  };

  const setTakenPreset = (id: DigitId) => {
    setDraft((d) =>
      seatRole === 'dealer'
        ? {
            ...d,
            dealerTaken: id,
            dealerTakenHex: id === 'custom' ? d.dealerTakenHex : pickHex(id),
          }
        : {
            ...d,
            taken: id,
            takenHex: id === 'custom' ? d.takenHex : pickHex(id),
          },
    );
  };
  const setBidPreset = (id: DigitId) => {
    setDraft((d) =>
      seatRole === 'dealer'
        ? {
            ...d,
            dealerBid: id,
            dealerBidHex: id === 'custom' ? d.dealerBidHex : pickHex(id),
          }
        : {
            ...d,
            bid: id,
            bidHex: id === 'custom' ? d.bidHex : pickHex(id),
          },
    );
  };
  const setSlashPreset = (id: DigitId) => {
    setDraft((d) =>
      seatRole === 'dealer'
        ? {
            ...d,
            dealerSlash: id,
            dealerSlashHex: id === 'custom' ? d.dealerSlashHex : pickHex(id),
          }
        : {
            ...d,
            slash: id,
            slashHex: id === 'custom' ? d.slashHex : pickHex(id),
          },
    );
  };
  const setFigureWeight = (figureWeight: FigureWeight) => {
    setDraft((d) =>
      seatRole === 'dealer' ? { ...d, dealerFigureWeight: figureWeight } : { ...d, figureWeight },
    );
  };
  const activeFigures = figuresFromPick(draft, seatRole);
  const setBorderPreset = (id: BorderId) => {
    setDraft((d) => ({
      ...d,
      border: id,
      ...(id !== 'custom' ? { lastPresetBorder: id } : {}),
    }));
  };
  const setDealerBorderPreset = (id: BorderId) => {
    setDraft((d) => ({
      ...d,
      dealerBorder: id,
      ...(id !== 'custom' ? { dealerLastPresetBorder: id } : {}),
    }));
  };
  const activeBorderList = seatRole === 'dealer' ? DEALER_BORDER_LIST : NORMAL_BORDER_LIST;
  const activeBorderId = seatRole === 'dealer' ? draft.dealerBorder : draft.border;
  const activeBorderHex = seatRole === 'dealer' ? draft.dealerBorderHex : draft.borderHex;
  const activeBorderHex2 = seatRole === 'dealer' ? draft.dealerBorderHex2 : draft.borderHex2;
  const activeBorderFillHex =
    seatRole === 'dealer' ? draft.dealerBorderFillHex : draft.borderFillHex;
  const activeBorderFillHex2 =
    seatRole === 'dealer' ? draft.dealerBorderFillHex2 : draft.borderFillHex2;
  const activeFillOnly = seatRole === 'dealer' ? draft.dealerBorderFillOnly : draft.borderFillOnly;
  const activeBorderWidth = seatRole === 'dealer' ? draft.dealerBorderWidth : draft.borderWidth;
  const activeEdgeMode = seatRole === 'dealer' ? draft.dealerBorderEdgeMode : draft.borderEdgeMode;
  const activeFillMode = seatRole === 'dealer' ? draft.dealerBorderFillMode : draft.borderFillMode;
  const activeBorderGlow = seatRole === 'dealer' ? draft.dealerBorderGlow : draft.borderGlow;
  const activeCustomOpts: CustomBorderOpts = {
    edgeHex: activeBorderHex,
    edgeHex2: activeBorderHex2,
    fillHex: activeBorderFillHex,
    fillHex2: activeBorderFillHex2,
    width: activeBorderWidth,
    edgeMode: activeEdgeMode,
    fillMode: activeFillMode,
    glow: activeBorderGlow,
  };
  const setActiveBorder = (id: BorderId) => {
    if (seatRole === 'dealer') setDealerBorderPreset(id);
    else setBorderPreset(id);
  };
  const markCustom = <T extends Partial<StatePick>>(patch: T) => {
    if (seatRole === 'dealer') {
      setDraft((d) => ({
        ...d,
        ...patch,
        dealerBorder: 'custom',
        dealerBorderFillOnly: false,
        ...(d.dealerBorder !== 'custom' ? { dealerLastPresetBorder: d.dealerBorder } : {}),
      }));
    } else {
      setDraft((d) => ({
        ...d,
        ...patch,
        border: 'custom',
        borderFillOnly: false,
        ...(d.border !== 'custom' ? { lastPresetBorder: d.border } : {}),
      }));
    }
  };
  /** Фон: никогда не уводит в ★ Своя; если уже custom — возвращает последний пресет края. */
  const applyFillOnPreset = (opts: {
    fillHex?: string;
    fillHex2?: string;
    fillMode?: GradMode;
  }) => {
    setDraft((d) => {
      if (seatRole === 'dealer') {
        const preset =
          d.dealerBorder !== 'custom'
            ? d.dealerBorder
            : d.dealerLastPresetBorder !== 'custom'
              ? d.dealerLastPresetBorder
              : 'dealerBidding';
        return {
          ...d,
          dealerBorder: preset,
          dealerLastPresetBorder: preset,
          dealerBorderFillOnly: true,
          ...(opts.fillHex ? { dealerBorderFillHex: opts.fillHex } : {}),
          ...(opts.fillHex2 ? { dealerBorderFillHex2: opts.fillHex2 } : {}),
          ...(opts.fillMode ? { dealerBorderFillMode: opts.fillMode } : {}),
        };
      }
      const preset =
        d.border !== 'custom'
          ? d.border
          : d.lastPresetBorder !== 'custom'
            ? d.lastPresetBorder
            : 'amber2';
      return {
        ...d,
        border: preset,
        lastPresetBorder: preset,
        borderFillOnly: true,
        ...(opts.fillHex ? { borderFillHex: opts.fillHex } : {}),
        ...(opts.fillHex2 ? { borderFillHex2: opts.fillHex2 } : {}),
        ...(opts.fillMode ? { borderFillMode: opts.fillMode } : {}),
      };
    });
  };
  const setActiveBorderHex = (hex: string) => {
    markCustom(seatRole === 'dealer' ? { dealerBorderHex: hex } : { borderHex: hex });
  };
  const setActiveBorderHex2 = (hex: string) => {
    markCustom(
      seatRole === 'dealer'
        ? { dealerBorderHex2: hex, dealerBorderEdgeMode: 'gradient' as GradMode }
        : { borderHex2: hex, borderEdgeMode: 'gradient' as GradMode },
    );
  };
  const setActiveBorderFillHex = (hex: string) => {
    applyFillOnPreset({ fillHex: hex });
  };
  const setActiveBorderFillHex2 = (hex: string) => {
    applyFillOnPreset({ fillHex2: hex, fillMode: 'gradient' });
  };
  const setActiveBorderWidth = (width: BorderWidthPx) => {
    markCustom(seatRole === 'dealer' ? { dealerBorderWidth: width } : { borderWidth: width });
  };
  const setActiveEdgeMode = (mode: GradMode) => {
    markCustom(
      seatRole === 'dealer' ? { dealerBorderEdgeMode: mode } : { borderEdgeMode: mode },
    );
  };
  const setActiveFillMode = (mode: GradMode) => {
    applyFillOnPreset({ fillMode: mode });
  };
  const clearFillOnly = () => {
    if (seatRole === 'dealer') {
      setDraft((d) => ({ ...d, dealerBorderFillOnly: false }));
    } else {
      setDraft((d) => ({ ...d, borderFillOnly: false }));
    }
  };
  const setActiveBorderGlow = (glow: boolean) => {
    /* Неон рамки — отдельная ось: не уводит в ★ Своя, работает и на пресете */
    if (seatRole === 'dealer') {
      setDraft((d) => ({ ...d, dealerBorderGlow: glow }));
    } else {
      setDraft((d) => ({ ...d, borderGlow: glow }));
    }
  };
  const setZeroCrossPreset = (id: ZeroCrossId) => {
    const p = ZERO_CROSS_BY_ID[id];
    setDraft((d) => ({
      ...d,
      zeroCross: id,
      ...(id !== 'custom'
        ? {
            zeroCrossHex: p.hex,
            zeroCrossHex2: p.hex2,
            zeroCrossMode: p.mode,
          }
        : {}),
    }));
  };
  const setZeroCrossHex = (hex: string) => {
    setDraft((d) => ({ ...d, zeroCross: 'custom', zeroCrossHex: hex }));
  };
  const setZeroCrossHex2 = (hex: string) => {
    setDraft((d) => ({
      ...d,
      zeroCross: 'custom',
      zeroCrossHex2: hex,
      zeroCrossMode: 'gradient',
    }));
  };
  const setZeroCrossMode = (mode: GradMode) => {
    setDraft((d) => ({ ...d, zeroCross: 'custom', zeroCrossMode: mode }));
  };
  const setZeroCrossGlow = (glow: boolean) => {
    setDraft((d) => ({ ...d, zeroCrossGlow: glow }));
  };

  const outcomeStates = useMemo(
    () => STATES.filter((s) => s.id === 'exact' || s.id === 'over' || s.id === 'under'),
    [],
  );
  const inheritOutcomes = Boolean(state.inheritOutcomes);

  const savedCount = useMemo(() => Object.keys(store.picks).length, [store.picks]);

  return (
    <div className="osl-page" data-order-style-lab="1">
      <header className="osl-header">
        <button type="button" className="osl-btn" onClick={onBack}>
          ← Назад
        </button>
        <div className="osl-header__titles">
          <h1>Лаба: заказ / взято</h1>
          <p>
            Цвета едины на всей мобилке (без матрицы горизонт/вертикаль). ПК/планшет не трогаем.
            Сдающий — отдельная ось. Сохранено {savedCount}/{STATES.length} ·{' '}
            <code>/order-style-lab</code>
          </p>
        </div>
        <button type="button" className="osl-btn osl-btn--accent" onClick={exportJson}>
          {copied ? 'Скопировано ✓' : 'Копировать JSON'}
        </button>
      </header>

      {flash ? <div className="osl-flash">{flash}</div> : null}

      <section className="osl-states" aria-label="Состояния">
        {STATES.map((s) => {
          const flags = roleSavedFlags(store, s.id);
          const saved = flags.normal || flags.dealer;
          return (
            <button
              key={s.id}
              type="button"
              className={`osl-state-chip${stateId === s.id ? ' is-on' : ''}${saved ? ' is-saved' : ''}`}
              onClick={() => selectState(s.id)}
            >
              <span className="osl-state-chip__ex">{s.example}</span>
              <span className="osl-state-chip__t">{s.title}</span>
              <span className="osl-state-chip__marks">
                {flags.normal ? (
                  <span className="osl-state-chip__ok" title="Сохранён обычный">
                    О
                  </span>
                ) : null}
                {flags.dealer ? (
                  <span className="osl-state-chip__ok osl-state-chip__ok--dealer" title="Сохранён сдающий">
                    С
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </section>

      <section id="osl-controls" className="osl-controls" aria-label="Выбор стиля">
        <h2>1. Выбор для «{state.title}» ({state.example})</h2>
        <p className="osl-controls__lead">
          Правила: <strong>один набор цветов</strong> для всей мобилки — без вариантов
          горизонт/вертикаль/short. <strong>ПК и планшет не трогаем.</strong>
          <strong> Сдающий</strong> — своя ось обводок для каждого состояния (торги ждёт / сейчас
          заказывает / уже заказал / розыгрыш / ровно / перебор / недобор…). Переключатель ниже.
        </p>

        <div className="osl-seg osl-seg--role" role="group" aria-label="Роль сидения">
          <button
            type="button"
            className={seatRole === 'normal' ? 'is-on' : ''}
            onClick={() => setSeatRole('normal')}
          >
            Обычный игрок
          </button>
          <button
            type="button"
            className={seatRole === 'dealer' ? 'is-on' : ''}
            onClick={() => setSeatRole('dealer')}
          >
            Сдающий
          </button>
        </div>

        {inheritOutcomes ? null : (
          <div className="osl-selects">
            <label>
              Взято (список)
              <select
                value={activeFigures.taken}
                onChange={(e) => setTakenPreset(e.target.value as DigitId)}
              >
                {DIGIT_LIST.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} · {d.hex}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Заказ (список)
              <select value={activeFigures.bid} onChange={(e) => setBidPreset(e.target.value as DigitId)}>
                {DIGIT_LIST.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label} · {d.hex}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Разделитель «/»
              <select
                value={activeFigures.slash}
                onChange={(e) => setSlashPreset(e.target.value as DigitId)}
              >
                {DIGIT_LIST.map((d) => (
                  <option key={`sl-${d.id}`} value={d.id}>
                    {d.label} · {d.hex}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Жирность
              <select
                value={activeFigures.figureWeight}
                onChange={(e) => setFigureWeight(Number(e.target.value) as FigureWeight)}
              >
                {([500, 600, 700, 800, 900] as FigureWeight[]).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Обводка · {seatRole === 'dealer' ? 'сдающий' : 'обычный'}
              <select
                value={activeBorderId}
                onChange={(e) => setActiveBorder(e.target.value as BorderId)}
              >
                {activeBorderList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {inheritOutcomes ? (
          <div className="osl-inherit-banner">
            <p>
              <strong>Между раздачами</strong> отдельной обводки нет: показываем те же рамки, с
              которыми игрок <em>закончил розыгрыш</em> — ровно / перебор / недобор (и сдающий —
              своими финальными). Цифры тоже остаются «финальными».
            </p>
            <button
              type="button"
              className="osl-btn osl-btn--accent"
              onClick={() => {
                const next = {
                  ...state.nowDefault,
                  note: 'наследует финал: exact / over / under (+ dealerExact / dealerOver / dealerUnder)',
                };
                setDraft(next);
                persist({
                  ...store,
                  picks: { ...store.picks, collecting: next },
                  savedRoles: {
                    ...store.savedRoles,
                    collecting: { normal: true, dealer: true },
                  },
                });
                setFlash('Зафиксировано: между раздачами = финальные обводки');
                window.setTimeout(() => setFlash(''), 2000);
              }}
            >
              Зафиксировать правило «как закончили»
            </button>
          </div>
        ) : (
          <div className="osl-custom-grid">
            <p className="osl-role-hint">
              Сейчас правите: <strong>{seatRole === 'dealer' ? 'СДАЮЩИЙ' : 'обычный'}</strong>. Цифры,
              «/», жирность и обводка этой роли сохраняются только своей кнопкой и не затирают
              другую.
            </p>
            <LabNeonColorField
              title={`Свой цвет · ВЗЯТО (${seatRole === 'dealer' ? 'сдающий' : 'обычный'})`}
              hex={activeFigures.takenHex}
              onHex={(hex) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerTakenHex: hex, dealerTaken: 'custom' }
                    : { ...d, takenHex: hex, taken: 'custom' },
                )
              }
              onActivateCustom={() =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerTaken: 'custom' }
                    : { ...d, taken: 'custom' },
                )
              }
              triggerLabel="Взято"
              neon={activeFigures.takenGlow}
              onNeonChange={(glow) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerTakenGlow: glow, dealerTaken: 'custom' }
                    : { ...d, takenGlow: glow, taken: 'custom' },
                )
              }
            />
            <LabNeonColorField
              title={`Свой цвет · ЗАКАЗ (${seatRole === 'dealer' ? 'сдающий' : 'обычный'})`}
              hex={activeFigures.bidHex}
              onHex={(hex) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerBidHex: hex, dealerBid: 'custom' }
                    : { ...d, bidHex: hex, bid: 'custom' },
                )
              }
              onActivateCustom={() =>
                setDraft((d) =>
                  seatRole === 'dealer' ? { ...d, dealerBid: 'custom' } : { ...d, bid: 'custom' },
                )
              }
              triggerLabel="Заказ"
              neon={activeFigures.bidGlow}
              onNeonChange={(glow) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerBidGlow: glow, dealerBid: 'custom' }
                    : { ...d, bidGlow: glow, bid: 'custom' },
                )
              }
            />
            <LabNeonColorField
              title={`Свой цвет · РАЗДЕЛИТЕЛЬ / (${seatRole === 'dealer' ? 'сдающий' : 'обычный'})`}
              hex={activeFigures.slashHex}
              onHex={(hex) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerSlashHex: hex, dealerSlash: 'custom' }
                    : { ...d, slashHex: hex, slash: 'custom' },
                )
              }
              onActivateCustom={() =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerSlash: 'custom' }
                    : { ...d, slash: 'custom' },
                )
              }
              triggerLabel="/"
              neon={activeFigures.slashGlow}
              onNeonChange={(glow) =>
                setDraft((d) =>
                  seatRole === 'dealer'
                    ? { ...d, dealerSlashGlow: glow, dealerSlash: 'custom' }
                    : { ...d, slashGlow: glow, slash: 'custom' },
                )
              }
            />
            <div className="osl-custom-geom">
              <div className="osl-custom__title">
                Жирность · {seatRole === 'dealer' ? 'сдающий' : 'обычный'}
              </div>
              <div className="osl-geom-row" role="group" aria-label="Жирность">
                <span className="osl-geom-label">Weight</span>
                {([500, 600, 700, 800, 900] as FigureWeight[]).map((w) => (
                  <button
                    key={`fw-${w}`}
                    type="button"
                    className={`osl-btn${activeFigures.figureWeight === w ? ' osl-btn--accent' : ''}`}
                    style={{ fontWeight: w }}
                    onClick={() => setFigureWeight(w)}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <LabNeonColorField
              title={`Своя рамка · ОБВОДКА (${seatRole === 'dealer' ? 'сдающий' : 'обычный'})`}
              hex={activeBorderHex}
              onHex={setActiveBorderHex}
              onActivateCustom={() => setActiveBorder('custom')}
              triggerLabel="Рамка"
              neon={activeBorderGlow}
              onNeonChange={setActiveBorderGlow}
            />
            <LabNeonColorField
              title={`Фон поверх рамки (${seatRole === 'dealer' ? 'сдающий' : 'обычный'}) · без ★ Своя`}
              hex={activeBorderFillHex}
              onHex={setActiveBorderFillHex}
              triggerLabel="Фон"
            />
            {activeFillOnly && activeBorderId !== 'custom' ? (
              <div className="osl-custom-geom">
                <div className="osl-custom__title">
                  Фон поверх пресета «{BORDER_LABEL[activeBorderId] ?? activeBorderId}»
                </div>
                <button type="button" className="osl-btn" onClick={clearFillOnly}>
                  Сбросить фон к пресету
                </button>
              </div>
            ) : null}
            <div className="osl-custom-geom">
              <div className="osl-custom__title">
                Геометрия своей обводки · {seatRole === 'dealer' ? 'сдающий' : 'обычный'}
              </div>
              <div className="osl-geom-row" role="group" aria-label="Свечение рамки">
                <span className="osl-geom-label">Свечение</span>
                <button
                  type="button"
                  className={`osl-btn${!activeBorderGlow ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveBorderGlow(false)}
                >
                  Без неона
                </button>
                <button
                  type="button"
                  className={`osl-btn${activeBorderGlow ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveBorderGlow(true)}
                >
                  Неон
                </button>
              </div>
              <div className="osl-geom-row" role="group" aria-label="Толщина рамки">
                <span className="osl-geom-label">Толщина</span>
                {([1, 2, 3, 4] as BorderWidthPx[]).map((w) => (
                  <button
                    key={`w-${w}`}
                    type="button"
                    className={`osl-btn${activeBorderWidth === w ? ' osl-btn--accent' : ''}`}
                    onClick={() => setActiveBorderWidth(w)}
                  >
                    {w}px
                  </button>
                ))}
              </div>
              <div className="osl-geom-row" role="group" aria-label="Рамка solid/gradient">
                <span className="osl-geom-label">Рамка</span>
                <button
                  type="button"
                  className={`osl-btn${activeEdgeMode === 'solid' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveEdgeMode('solid')}
                >
                  Solid
                </button>
                <button
                  type="button"
                  className={`osl-btn${activeEdgeMode === 'gradient' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveEdgeMode('gradient')}
                >
                  Градиент
                </button>
              </div>
              {activeEdgeMode === 'gradient' ? (
                <LabNeonColorField
                  title="Рамка · 2-й цвет градиента"
                  hex={activeBorderHex2}
                  onHex={setActiveBorderHex2}
                  onActivateCustom={() => setActiveBorder('custom')}
                  triggerLabel="Рамка2"
                  neon={activeBorderGlow}
                  onNeonChange={setActiveBorderGlow}
                />
              ) : null}
              <div className="osl-geom-row" role="group" aria-label="Фон solid/gradient">
                <span className="osl-geom-label">Фон</span>
                <button
                  type="button"
                  className={`osl-btn${activeFillMode === 'solid' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveFillMode('solid')}
                >
                  Solid
                </button>
                <button
                  type="button"
                  className={`osl-btn${activeFillMode === 'gradient' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setActiveFillMode('gradient')}
                >
                  Градиент
                </button>
              </div>
              {activeFillMode === 'gradient' ? (
                <LabNeonColorField
                  title="Фон · 2-й цвет градиента · без ★ Своя"
                  hex={activeBorderFillHex2}
                  onHex={setActiveBorderFillHex2}
                  triggerLabel="Фон2"
                />
              ) : null}
            </div>
          </div>
        )}

        {inheritOutcomes ? null : (
          <>
        <div className="osl-swatch-block">
          <div className="osl-swatch-row__title">
            Цифра ВЗЯТО — пресеты из приложения ({DIGIT_LIST.length})
          </div>
          <div className="osl-swatch-row__list">
            {DIGIT_LIST.map((d) => (
              <button
                key={`t-${d.id}`}
                type="button"
                title={d.where}
                className={`osl-swatch${activeFigures.taken === d.id ? ' is-on' : ''}`}
                onClick={() => setTakenPreset(d.id)}
              >
                <DigitSample
                  id={d.id}
                  hex={d.id === 'custom' ? activeFigures.takenHex : d.hex}
                  neon={d.id === 'custom' ? activeFigures.takenGlow : false}
                  weight={activeFigures.figureWeight}
                >
                  3
                </DigitSample>
                <span className="osl-swatch__label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="osl-swatch-block">
          <div className="osl-swatch-row__title">
            Цифра ЗАКАЗ — пресеты из приложения ({DIGIT_LIST.length})
          </div>
          <div className="osl-swatch-row__list">
            {DIGIT_LIST.map((d) => (
              <button
                key={`b-${d.id}`}
                type="button"
                title={d.where}
                className={`osl-swatch${activeFigures.bid === d.id ? ' is-on' : ''}`}
                onClick={() => setBidPreset(d.id)}
              >
                <DigitSample
                  id={d.id}
                  hex={d.id === 'custom' ? activeFigures.bidHex : d.hex}
                  neon={d.id === 'custom' ? activeFigures.bidGlow : false}
                  weight={activeFigures.figureWeight}
                >
                  5
                </DigitSample>
                <span className="osl-swatch__label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="osl-swatch-block">
          <div className="osl-swatch-row__title">
            Разделитель «/» — пресеты ({DIGIT_LIST.length})
          </div>
          <div className="osl-swatch-row__list">
            {DIGIT_LIST.map((d) => (
              <button
                key={`sl-${d.id}`}
                type="button"
                title={d.where}
                className={`osl-swatch${activeFigures.slash === d.id ? ' is-on' : ''}`}
                onClick={() => setSlashPreset(d.id)}
              >
                <DigitSample
                  id={d.id}
                  hex={d.id === 'custom' ? activeFigures.slashHex : d.hex}
                  neon={d.id === 'custom' ? activeFigures.slashGlow : false}
                  weight={activeFigures.figureWeight}
                >
                  /
                </DigitSample>
                <span className="osl-swatch__label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="osl-swatch-block">
          <div className="osl-swatch-row__title">
            Обводка · {seatRole === 'dealer' ? 'СДАЮЩИЙ' : 'обычный'} — {activeBorderList.length}{' '}
            вариантов (мобилка единая)
          </div>
          <div className="osl-swatch-row__list">
            {activeBorderList.map((d) => (
              <button
                key={`p-${seatRole}-${d.id}`}
                type="button"
                className={`osl-swatch${activeBorderId === d.id ? ' is-on' : ''}`}
                onClick={() => setActiveBorder(d.id)}
              >
                <span
                  className={`osl-border-chip ${
                    d.id === 'custom'
                      ? `osl-border--custom${activeBorderGlow ? ' osl-border--custom-glow' : ''}`
                      : `osl-border--${d.id}${
                          activeBorderGlow && activeBorderId === d.id ? ' osl-border--glow' : ''
                        }`
                  }`}
                  style={
                    d.id === 'custom'
                      ? customBorderStyle(activeCustomOpts)
                      : activeBorderGlow && activeBorderId === d.id
                        ? ({
                            ['--osl-glow-edge' as string]: presetGlowEdge(d.id, activeBorderHex),
                          } as CSSProperties)
                        : undefined
                  }
                />
                <span className="osl-swatch__label">{d.label}</span>
              </button>
            ))}
          </div>
        </div>

        {state.bid === 0 ? (
          <div className="osl-swatch-block">
            <div className="osl-swatch-row__title">
              Крестик «заказ 0 / не брать» — общий для обычный и сдающий ({ZERO_CROSS_LIST.length})
            </div>
            <div className="osl-swatch-row__list">
              {ZERO_CROSS_LIST.map((d) => (
                <button
                  key={`zx-${d.id}`}
                  type="button"
                  title={d.where}
                  className={`osl-swatch${draft.zeroCross === d.id ? ' is-on' : ''}`}
                  onClick={() => setZeroCrossPreset(d.id)}
                >
                  <ZeroOrderCross
                    crossId={d.id}
                    hex={d.id === 'custom' ? draft.zeroCrossHex : d.hex}
                    hex2={d.id === 'custom' ? draft.zeroCrossHex2 : d.hex2}
                    mode={d.id === 'custom' ? draft.zeroCrossMode : d.mode}
                    glow={d.id === 'custom' ? draft.zeroCrossGlow : true}
                    size={20}
                  />
                  <span className="osl-swatch__label">{d.label}</span>
                </button>
              ))}
            </div>
            <LabNeonColorField
              title="Свой крестик · цвет 1"
              hex={draft.zeroCrossHex}
              onHex={setZeroCrossHex}
              onActivateCustom={() => setZeroCrossPreset('custom')}
              triggerLabel="Крест"
              neon={draft.zeroCrossGlow}
              onNeonChange={setZeroCrossGlow}
            />
            <div className="osl-custom-geom">
              <div className="osl-custom__title">Крестик · градиент / свечение</div>
              <div className="osl-geom-row" role="group" aria-label="Свечение крестика">
                <span className="osl-geom-label">Свечение</span>
                <button
                  type="button"
                  className={`osl-btn${!draft.zeroCrossGlow ? ' osl-btn--accent' : ''}`}
                  onClick={() => setZeroCrossGlow(false)}
                >
                  Без неона
                </button>
                <button
                  type="button"
                  className={`osl-btn${draft.zeroCrossGlow ? ' osl-btn--accent' : ''}`}
                  onClick={() => setZeroCrossGlow(true)}
                >
                  Неон
                </button>
              </div>
              <div className="osl-geom-row" role="group" aria-label="Крестик solid/gradient">
                <span className="osl-geom-label">Штрих</span>
                <button
                  type="button"
                  className={`osl-btn${draft.zeroCrossMode === 'solid' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setZeroCrossMode('solid')}
                >
                  Solid
                </button>
                <button
                  type="button"
                  className={`osl-btn${draft.zeroCrossMode === 'gradient' ? ' osl-btn--accent' : ''}`}
                  onClick={() => setZeroCrossMode('gradient')}
                >
                  Градиент
                </button>
              </div>
              {draft.zeroCross === 'custom' && draft.zeroCrossMode === 'gradient' ? (
                <LabNeonColorField
                  title="Свой крестик · цвет 2 (градиент)"
                  hex={draft.zeroCrossHex2}
                  onHex={setZeroCrossHex2}
                  triggerLabel="Крест2"
                />
              ) : null}
            </div>
          </div>
        ) : null}

        <label className="osl-note">
          Заметка
          <textarea
            value={draft.note}
            onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            rows={2}
            placeholder="Напр.: З/В как Север…"
          />
        </label>

        <div className="osl-actions">
          <button
            type="button"
            className="osl-btn osl-btn--accent"
            onClick={() => savePickForRole('both')}
            title="Пишет в JSON все поля: обычный + сдающий + крестик + рамки/фоны"
          >
            Сохранить · ОБА (полный снимок)
          </button>
          <button
            type="button"
            className={`osl-btn${seatRole === 'normal' ? ' osl-btn--accent' : ''}`}
            onClick={() => savePickForRole('normal')}
            title="Тот же полный снимок + метка «обычный ✓»"
          >
            Сохранить · обычный
          </button>
          <button
            type="button"
            className={`osl-btn${seatRole === 'dealer' ? ' osl-btn--accent' : ''}`}
            onClick={() => savePickForRole('dealer')}
            title="Тот же полный снимок + метка «сдающий ✓»"
          >
            Сохранить · сдающий
          </button>
          <button type="button" className="osl-btn" onClick={() => setDraft({ ...state.nowDefault })}>
            Сбросить к «как сейчас»
          </button>
        </div>
        <p className="osl-muted" style={{ margin: '6px 0 0', fontSize: 12 }}>
          Сохранение пишет <strong>все {STATE_PICK_KEY_COUNT} полей</strong> состояния (обе оси). Экспорт
          нормализует весь словарь (schema v{LAB_SCHEMA_VERSION}) и подмешивает несохранённый draft текущего
          экрана.
        </p>

        <div className="osl-live-bar">
          Живой превью:&nbsp;
          <DigitSample
            id={activeFigures.taken}
            hex={activeFigures.takenHex}
            neon={activeFigures.takenGlow}
            weight={activeFigures.figureWeight}
          >
            {state.taken}
          </DigitSample>
          <DigitSample
            id={activeFigures.slash}
            hex={activeFigures.slashHex}
            neon={activeFigures.slashGlow}
            weight={activeFigures.figureWeight}
          >
            /
          </DigitSample>
          <DigitSample
            id={activeFigures.bid}
            hex={activeFigures.bidHex}
            neon={activeFigures.bidGlow}
            weight={activeFigures.figureWeight}
          >
            {state.bid}
          </DigitSample>
          &nbsp;·&nbsp;
          {borderLabel(activeBorderId, activeBorderHex)}
          {activeBorderId === 'custom'
            ? ` · ${activeBorderWidth}px · рамка ${activeEdgeMode} · фон ${activeFillMode}${activeBorderGlow ? ' · неон' : ' · без свечения'}`
            : ''}
          &nbsp;({seatRole === 'dealer' ? 'сдающий' : 'обычный'})
        </div>
          </>
        )}

      </section>

      <section id="osl-previews" className="osl-toolbar">
        <div className="osl-seg" role="group" aria-label="Режим превью">
          <button type="button" className={view === 'now' ? 'is-on' : ''} onClick={() => setView('now')}>
            Как сейчас
          </button>
          <button type="button" className={view === 'pick' ? 'is-on' : ''} onClick={() => setView('pick')}>
            Мой выбор
          </button>
          <button type="button" className={view === 'both' ? 'is-on' : ''} onClick={() => setView('both')}>
            Рядом
          </button>
        </div>
        <p className="osl-toolbar__hint">
          {inheritOutcomes
            ? '2. Между раздачами — превью финалов (ровно / перебор / недобор)'
            : '2. Превью по сидениям (мобилка единая · ПК/планшет вне лабы)'}
        </p>
      </section>

      {inheritOutcomes ? (
        <section className="osl-grid osl-grid--outcomes">
          {outcomeStates.map((out) => {
            const savedPick = hydratePick(store.picks[out.id], out.nowDefault);
            const roleHere: SeatRole = seatRole;
            const nowBorder = nowBorderFor(out.id, roleHere);
            const pickBorder = roleHere === 'dealer' ? savedPick.dealerBorder : savedPick.border;
            const pickBorderHex =
              roleHere === 'dealer' ? savedPick.dealerBorderHex : savedPick.borderHex;
            const pickFill =
              roleHere === 'dealer' ? savedPick.dealerBorderFillHex : savedPick.borderFillHex;
            const pickFillOnly =
              roleHere === 'dealer' ? savedPick.dealerBorderFillOnly : savedPick.borderFillOnly;
            const showNow = view === 'now' || view === 'both';
            const showPick = view === 'pick' || view === 'both';
            return (
              <div key={out.id} className="osl-ctx">
                <h2>
                  {out.title}
                  <span>
                    {out.example} · между раздачами оставляем этот финал
                    {roleHere === 'dealer' ? ' · СДАЮЩИЙ' : ''}
                  </span>
                </h2>
                <div className={`osl-ctx__previews${view === 'both' ? ' is-both' : ''}`}>
                  {showNow ? (
                    <MockPanel
                      taken={out.taken}
                      bid={out.bid}
                      takenDigit={figuresFromPick(out.nowDefault, roleHere).taken}
                      bidDigit={figuresFromPick(out.nowDefault, roleHere).bid}
                      slashDigit={figuresFromPick(out.nowDefault, roleHere).slash}
                      takenHex={figuresFromPick(out.nowDefault, roleHere).takenHex}
                      bidHex={figuresFromPick(out.nowDefault, roleHere).bidHex}
                      slashHex={figuresFromPick(out.nowDefault, roleHere).slashHex}
                      figureWeight={figuresFromPick(out.nowDefault, roleHere).figureWeight}
                      border={nowBorder}
                      borderHex={roleHere === 'dealer' ? '#24acfb' : '#fbbf24'}
                      layout="h"
                      modeTag="сейчас · финал"
                      showSlots={out.showSlots}
                      zeroCross={
                        out.bid === 0
                          ? {
                              zeroCross: out.nowDefault.zeroCross,
                              zeroCrossHex: out.nowDefault.zeroCrossHex,
                              zeroCrossHex2: out.nowDefault.zeroCrossHex2,
                              zeroCrossMode: out.nowDefault.zeroCrossMode,
                              zeroCrossGlow: out.nowDefault.zeroCrossGlow,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  {showPick ? (
                    <MockPanel
                      taken={out.taken}
                      bid={out.bid}
                      {...(() => {
                        const f = figuresFromPick(savedPick, roleHere);
                        return {
                          takenDigit: f.taken,
                          bidDigit: f.bid,
                          slashDigit: f.slash,
                          takenHex: f.takenHex,
                          bidHex: f.bidHex,
                          slashHex: f.slashHex,
                          takenNeon: f.takenGlow,
                          bidNeon: f.bidGlow,
                          slashNeon: f.slashGlow,
                          figureWeight: f.figureWeight,
                        };
                      })()}
                      border={pickBorder}
                      borderHex={pickBorderHex}
                      borderFillHex={pickFill}
                      fillOnly={pickFillOnly}
                      customOpts={customOptsFromPick(savedPick, roleHere)}
                      layout="h"
                      modeTag={store.picks[out.id] ? 'выбор финала' : 'финал (ещё не выбран)'}
                      showSlots={out.showSlots}
                      zeroCross={
                        out.bid === 0
                          ? {
                              zeroCross: savedPick.zeroCross,
                              zeroCrossHex: savedPick.zeroCrossHex,
                              zeroCrossHex2: savedPick.zeroCrossHex2,
                              zeroCrossMode: savedPick.zeroCrossMode,
                              zeroCrossGlow: savedPick.zeroCrossGlow,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="osl-grid">
          {CONTEXTS.map((ctx) => {
            const roleHere: SeatRole =
              seatRole === 'dealer' && ctx.canBeDealer ? 'dealer' : 'normal';
            const nowBorder = nowBorderFor(stateId, roleHere);
            const pickBorder = roleHere === 'dealer' ? draft.dealerBorder : draft.border;
            const pickBorderHex = roleHere === 'dealer' ? draft.dealerBorderHex : draft.borderHex;
            const pickFill =
              roleHere === 'dealer' ? draft.dealerBorderFillHex : draft.borderFillHex;
            const pickFillOnly =
              roleHere === 'dealer' ? draft.dealerBorderFillOnly : draft.borderFillOnly;
            const showNow = view === 'now' || view === 'both';
            const showPick = view === 'pick' || view === 'both';
            return (
              <div key={ctx.id} className="osl-ctx">
                <h2>
                  {ctx.title}
                  <span>
                    {ctx.hint}
                    {roleHere === 'dealer' ? ' · СДАЮЩИЙ' : ''}
                  </span>
                </h2>
                <div className={`osl-ctx__previews${view === 'both' ? ' is-both' : ''}`}>
                  {showNow ? (
                    <MockPanel
                      taken={state.taken}
                      bid={state.bid}
                      {...(() => {
                        const f = figuresFromPick(state.nowDefault, roleHere);
                        return {
                          takenDigit: f.taken,
                          bidDigit: f.bid,
                          slashDigit: f.slash,
                          takenHex: f.takenHex,
                          bidHex: f.bidHex,
                          slashHex: f.slashHex,
                          figureWeight: f.figureWeight,
                        };
                      })()}
                      border={nowBorder}
                      borderHex={roleHere === 'dealer' ? '#24acfb' : '#fbbf24'}
                      layout={ctx.layout}
                      modeTag="сейчас"
                      showSlots={state.showSlots}
                      turnPulse={stateId === 'biddingTurnNoBid'}
                      zeroCross={
                        state.bid === 0
                          ? {
                              zeroCross: state.nowDefault.zeroCross,
                              zeroCrossHex: state.nowDefault.zeroCrossHex,
                              zeroCrossHex2: state.nowDefault.zeroCrossHex2,
                              zeroCrossMode: state.nowDefault.zeroCrossMode,
                              zeroCrossGlow: state.nowDefault.zeroCrossGlow,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  {showPick ? (
                    <MockPanel
                      taken={state.taken}
                      bid={state.bid}
                      {...(() => {
                        const f = figuresFromPick(draft, roleHere);
                        return {
                          takenDigit: f.taken,
                          bidDigit: f.bid,
                          slashDigit: f.slash,
                          takenHex: f.takenHex,
                          bidHex: f.bidHex,
                          slashHex: f.slashHex,
                          takenNeon: f.takenGlow,
                          bidNeon: f.bidGlow,
                          slashNeon: f.slashGlow,
                          figureWeight: f.figureWeight,
                        };
                      })()}
                      border={pickBorder}
                      borderHex={pickBorderHex}
                      borderFillHex={pickFill}
                      fillOnly={pickFillOnly}
                      customOpts={customOptsFromPick(draft, roleHere)}
                      layout={ctx.layout}
                      modeTag="мой выбор"
                      showSlots={state.showSlots}
                      turnPulse={stateId === 'biddingTurnNoBid'}
                      zeroCross={
                        state.bid === 0
                          ? {
                              zeroCross: draft.zeroCross,
                              zeroCrossHex: draft.zeroCrossHex,
                              zeroCrossHex2: draft.zeroCrossHex2,
                              zeroCrossMode: draft.zeroCrossMode,
                              zeroCrossGlow: draft.zeroCrossGlow,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="osl-policy">
        <h2>Правила (зафиксировано)</h2>
        <ul className="osl-rules">
          <li>
            <strong>Цвета едины</strong> на всей мобилке — без матрицы горизонт / вертикаль / short.
          </li>
          <li>
            <strong>ПК и планшет</strong> — вне этой лабы, не меняем.
          </li>
          <li>
            <strong>Сдающий</strong> — отдельная ось обводок на каждое состояние (торги нет/есть,
            розыгрыш, ровно, перебор, недобор…).
          </li>
          <li>
            <strong>Между раздачами</strong> — те же обводки, с которыми закончили розыгрыш (ровно /
            перебор / недобор), без отдельного стиля.
          </li>
          <li>
            <strong>Своя обводка</strong> — рамка + фон, толщина, solid/градиент; свечение (неон) —
            отдельный переключатель, по умолчанию выкл. Фон можно менять поверх любого пресета
            рамки без перехода в ★ Своя.
          </li>
        </ul>
        <label>
          Политика (подтверждение)
          <select
            value={store.policy || 'mobile-unified-dealer-axis'}
            onChange={(e) => persist({ ...store, policy: e.target.value })}
          >
            <option value="mobile-unified-dealer-axis">
              Мобилка единая + сдающий отдельной осью (рекомендуется)
            </option>
            <option value="colors-unified-dealer-axis">
              Цвета едины + сдающий отдельной осью (старое имя)
            </option>
            <option value="one-dictionary">Один словарь без оси сдающего</option>
          </select>
        </label>
        <label>
          Что бесит / эталон
          <textarea
            value={store.freeNote}
            onChange={(e) => persist({ ...store, freeNote: e.target.value })}
            rows={3}
            placeholder="Напр.: эталон сдающего на торгах — cyan→magenta…"
          />
        </label>
      </section>

      <section className="osl-summary">
        <h2>Сохранённые ответы</h2>
        {savedCount === 0 ? (
          <p className="osl-muted">Пока пусто — сохраните хотя бы «Догоняем» и «Ровно».</p>
        ) : (
          <ul>
            {STATES.filter((s) => store.picks[s.id]).map((s) => {
              const p = hydratePick(store.picks[s.id], s.nowDefault);
              return (
                <li key={s.id}>
                  <strong>{s.title}</strong>
                  {(() => {
                    const flags = roleSavedFlags(store, s.id);
                    const marks = [
                      flags.normal ? 'обычный' : null,
                      flags.dealer ? 'сдающий' : null,
                    ]
                      .filter(Boolean)
                      .join(' + ');
                    return marks ? ` [${marks}]` : '';
                  })()}
                  {s.inheritOutcomes ? (
                    <>: наследует финал (ровно / перебор / недобор){p.note ? ` — ${p.note}` : ''}</>
                  ) : (
                    <>
                      : взято {digitLabel(p.taken, p.takenHex)}, заказ{' '}
                      {digitLabel(p.bid, p.bidHex)}, обводка {borderLabel(p.border, p.borderHex)}
                      {p.border === 'custom'
                        ? ` · ${p.borderWidth}px · рамка ${p.borderEdgeMode} · фон ${p.borderFillMode}`
                        : ''}
                      , сдающий {borderLabel(p.dealerBorder, p.dealerBorderHex)}
                      {p.dealerBorder === 'custom'
                        ? ` · ${p.dealerBorderWidth}px · рамка ${p.dealerBorderEdgeMode} · фон ${p.dealerBorderFillMode}`
                        : ''}
                      {p.note ? ` — ${p.note}` : ''}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className="osl-muted">
          Когда наберёте — напишите в чат «лаба заполнена» или вставьте JSON.
        </p>
      </section>

      <div className="osl-fab" aria-label="Быстрая навигация">
        <button
          type="button"
          className="osl-btn"
          onClick={() => document.getElementById('osl-controls')?.scrollIntoView({ behavior: 'smooth' })}
        >
          ↑ Выбор
        </button>
        <button
          type="button"
          className="osl-btn osl-btn--accent"
          onClick={() => document.getElementById('osl-previews')?.scrollIntoView({ behavior: 'smooth' })}
        >
          ↓ Превью
        </button>
      </div>
    </div>
  );
}
