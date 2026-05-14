import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  fetchRoomChatMessages,
  sendRoomChatMessage,
  subscribeRoomChat,
  type RoomChatMessageRow,
  type RoomChatTypingBroadcastPayload,
} from '../lib/onlineGameSupabase';
import {
  CHAT_QUICK_PHRASES,
  MY_SNIPPETS_LS_KEY,
  MY_SNIPPETS_MAX,
  MY_SNIPPETS_MAX_LEN,
  TABLE_CHAT_PICKER_TABS,
  getEmojiCellsForTab,
  tabHasEmojiMore,
  type TableChatPickerTabId,
} from './tableChatEmojiPalette';

export type TableChatDockOwnMessageHandler = (row: RoomChatMessageRow) => void;

/** Только с `offlineUiLab`: подставить текст/точку на ушке без Supabase (лаб-страница). */
export type OfflineUiLabEarMock =
  | { scenario: 'none' }
  | { scenario: 'typing'; line?: string }
  | { scenario: 'unread'; preview?: string };

const MAX_BODY = 500;
const FETCH_LIMIT = 120;

const LS_PC_CHAT_DRAG = 'upndown.pcChat.drag';
const LS_PC_CHAT_COLLAPSED = 'upndown.pcChat.collapsed';
const LS_PC_CHAT_SIZE = 'upndown.pcChat.size';
const LS_MOBILE_CHAT_HEIGHT = 'upndown.mobileChat.height';
const LS_MOBILE_CHAT_RESIZE_HINT_SEEN = 'upndown.mobileChat.resizeHintSeen.v1';
const LS_MOBILE_SIDE_EAR_CENTER_PCT = 'upndown.mobileChat.sideEar.centerPercent.v1';
const LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED = 'upndown.mobileChat.sideEar.railCollapsed.v1';
/** «1» — не показывать текст превью непрочитанного у ушка (только точка). */
const LS_MOBILE_SIDE_EAR_HIDE_UNREAD_PREVIEW = 'upndown.mobileChat.sideEar.hideUnreadPreview.v1';
/** Чуть выше центра экрана (~на 15–18% от прежнего 38%), чтобы не залезать на низ стола */
const SIDE_EAR_DEFAULT_CENTER_PCT = 31;
/** Порог в px: ниже — считаем тапом (открыть чат), выше — перетаскивание */
const SIDE_EAR_DRAG_THRESHOLD_PX = 10;
/** Минимум между broadcast «печатает» (нагрузка на Realtime). */
const TYPING_BROADCAST_MIN_INTERVAL_MS = 2200;
/** Сколько держим «печатает» без повторного broadcast от игрока; сброс протухших — тик ~420ms. */
const TYPING_PEER_TTL_MS = 4200;

type TypingPeerEntry = { displayName: string; expiresAt: number };

function formatTypingLineFromMap(m: Map<string, TypingPeerEntry>, now: number): string | null {
  const names = [...m.entries()]
    .filter(([, v]) => v.expiresAt > now)
    .map(([, v]) => (v.displayName.trim() || 'Игрок'))
    .filter(Boolean);
  if (names.length === 0) return null;
  const short = (n: string) => (n.length > 14 ? `${n.slice(0, 14)}…` : n);
  if (names.length === 1) return `${short(names[0])} печатает…`;
  if (names.length === 2) return `${short(names[0])}, ${short(names[1])} печатают…`;
  return 'Несколько игроков печатают…';
}

type SideEarUnreadPhantom = { author: string; body: string; messageId: string };

/** Временное скрытие фантома по крестику до смены превью (id сообщения / демо-ключ) или строки «печатает». */
type SideEarPhantomDismiss =
  | { kind: 'typing'; line: string }
  | { kind: 'unread'; messageId: string };

function formatUnreadPhantomFromMessage(row: RoomChatMessageRow): SideEarUnreadPhantom {
  const author = row.display_name.trim().slice(0, 28) || 'Игрок';
  const b = row.body.trim();
  if (!b) return { author, body: 'сообщение', messageId: row.id };
  const maxBody = 72;
  const body = b.length > maxBody ? `${b.slice(0, maxBody)}…` : b;
  return { author, body, messageId: row.id };
}

/** Эхо в ушке после отправки из фантома, если сервер не вернул строку сообщения. */
function formatOwnPhantomEchoAfterSend(
  sentBody: string,
  displayName: string,
  row: RoomChatMessageRow | null | undefined,
): SideEarUnreadPhantom {
  if (row) return formatUnreadPhantomFromMessage(row);
  const author = displayName.trim().slice(0, 28) || 'Игрок';
  const b = sentBody.trim();
  const maxBody = 72;
  const body = !b ? '…' : b.length > maxBody ? `${b.slice(0, maxBody)}…` : b;
  return {
    author,
    body,
    messageId: `local-echo:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

/** Разделитель «цитата / ваш текст» в теле одного сообщения чата. */
const PHANTOM_CONTEXT_QUOTE_SEP = '\n—\n';

/** Сообщение в чат с привязкой к превью: цитата + ответ (в БД по-прежнему одна строка body). */
function buildPhantomContextualReplyBody(
  draft: string,
  anchor: SideEarUnreadPhantom,
  maxTotal: number,
): string {
  const t = draft.trim();
  const author = anchor.author.trim().slice(0, 28);
  const flat = anchor.body.trim().replace(/\s+/g, ' ');
  const sep = PHANTOM_CONTEXT_QUOTE_SEP;
  const build = (snippet: string) =>
    author ? `${author}: «${snippet}»${sep}${t}` : `«${snippet}»${sep}${t}`;
  if (!flat && !author) return t.slice(0, maxTotal);
  if (!t) {
    if (!flat) return (author ? `${author}:${sep}` : sep).slice(0, maxTotal);
    for (let n = Math.min(160, flat.length); n >= 8; n--) {
      const snippet = flat.length > n ? `${flat.slice(0, n)}…` : flat;
      const candidate = author ? `${author}: «${snippet}»${sep}` : `«${snippet}»${sep}`;
      if (candidate.length <= maxTotal) return candidate;
    }
    const head = author ? `${author}: «…»${sep}` : `«…»${sep}`;
    return head.slice(0, maxTotal);
  }
  if (!flat) return (author ? `${author}:${sep}${t}` : t).slice(0, maxTotal);
  for (let n = Math.min(160, flat.length); n >= 8; n--) {
    const snippet = flat.length > n ? `${flat.slice(0, n)}…` : flat;
    const candidate = build(snippet);
    if (candidate.length <= maxTotal) return candidate;
  }
  return t.slice(0, maxTotal);
}

function phantomUnreadStableKeyFromPhantom(p: SideEarUnreadPhantom | null): string {
  if (!p) return '';
  return p.messageId || `${p.author}\0${p.body}`;
}

/** Строка лабы «Имя: текст» или только текст — разбор для двух цветов в фантоме. */
function parseUnreadPhantomDemoLine(line: string): SideEarUnreadPhantom {
  const t = line.trim();
  const demoId = `demo:${t.slice(0, 200)}`;
  const i = t.indexOf(': ');
  if (i > 0 && i < t.length - 2) {
    const author = t.slice(0, i).trim().slice(0, 28) || 'Игрок';
    const body = t.slice(i + 2).trim() || '…';
    return { author, body, messageId: demoId };
  }
  return { author: '', body: t.length > 0 ? t : 'Новое сообщение', messageId: demoId };
}

const PC_CHAT_MIN_W = 220;
const PC_CHAT_MAX_W = 720;
const PC_CHAT_MIN_H = 240;

/** Половина оценки высоты shell (ушко + рельса + фантом), до getBoundingClientRect; держать в согласии с min-height рельсы/ушка в index.css. */
const SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX = 48;

function readSideEarCenterPctFromLs(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_MOBILE_SIDE_EAR_CENTER_PCT);
    if (raw == null) return null;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function readSideEarRailCollapsedFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

function readHideUnreadEarPhantomPreviewFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_MOBILE_SIDE_EAR_HIDE_UNREAD_PREVIEW) === '1';
  } catch {
    return false;
  }
}

/** Центр ушка по вертикали в % от innerHeight; половина высоты кнопки + отступ от краёв. */
function clampSideEarCenterPct(pct: number, innerH: number, earHalfPx: number, edgeMarginPx = 10): number {
  if (innerH <= 0 || !Number.isFinite(pct)) return SIDE_EAR_DEFAULT_CENTER_PCT;
  const minCenter = edgeMarginPx + earHalfPx;
  const maxCenter = innerH - edgeMarginPx - earHalfPx;
  if (maxCenter <= minCenter) return 50;
  let centerPx = (pct / 100) * innerH;
  centerPx = Math.min(maxCenter, Math.max(minCenter, centerPx));
  return (centerPx / innerH) * 100;
}

function readPcSizeFromLs(): { w: number; h: number } | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_PC_CHAT_SIZE);
    if (!raw) return null;
    const j = JSON.parse(raw) as { w?: unknown; h?: unknown };
    const w = typeof j.w === 'number' && Number.isFinite(j.w) ? j.w : NaN;
    const h = typeof j.h === 'number' && Number.isFinite(j.h) ? j.h : NaN;
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
    return { w, h };
  } catch {
    return null;
  }
}

function readPlayerAreaHeightPx(): number {
  if (typeof window === 'undefined') return 260;
  const ph = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--game-player-area-height').trim(),
  );
  if (!Number.isFinite(ph) || ph <= 0) return 260;
  /* Никогда не даём «полосе руки» занимать почти весь viewport для расчётов чата */
  return Math.min(ph, window.innerHeight * 0.7);
}

/** Верхняя граница высоты дока (увеличена: разрешаем растягивать значительно выше текущего вьюпорта). */
function maxPcChatDockHeightPx(): number {
  if (typeof window === 'undefined') return 800;
  const ih = window.innerHeight;
  return Math.max(PC_CHAT_MIN_H + 48, ih * 1.84);
}

function clampPcChatSize(w: number, h: number): { w: number; h: number } {
  if (typeof window === 'undefined') {
    return {
      w: Math.round(Math.min(PC_CHAT_MAX_W, Math.max(PC_CHAT_MIN_W, w))),
      h: Math.round(Math.max(PC_CHAT_MIN_H, h)),
    };
  }
  const maxW = Math.min(PC_CHAT_MAX_W, window.innerWidth - 24);
  const maxH = maxPcChatDockHeightPx();
  return {
    w: Math.round(Math.min(maxW, Math.max(PC_CHAT_MIN_W, w))),
    h: Math.round(Math.min(maxH, Math.max(PC_CHAT_MIN_H, h))),
  };
}

/** Стартовый размер окна (согласован с CSS min(492px, 62vh)): inline height — больше ленты. */
function readDefaultPcDockSize(): { w: number; h: number } {
  if (typeof window === 'undefined') return { w: 280, h: 492 };
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const w = Math.min(280, Math.max(PC_CHAT_MIN_W, iw - 48));
  const h = Math.min(492, Math.max(320, ih * 0.62));
  return { w: Math.round(w), h: Math.round(h) };
}

/** После ресайза — не тянуть верх на 12px как у перетаскивания окна (избегаем «прыжка»). */
function clampPcChatOffsetAfterResize(el: HTMLElement, nx: number, ny: number): { x: number; y: number } {
  const padX = 8;
  const padBottom = 8;
  const padTop = 2;
  let x = nx;
  let y = ny;
  for (let i = 0; i < 8; i++) {
    el.style.transform = `translate3d(${PC_CHAT_SHIFT_X + x}px, ${PC_CHAT_SHIFT_Y + y}px, 0)`;
    const br = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    const maxW = Math.max(0, window.innerWidth - padX * 2);
    const maxH = Math.max(0, window.innerHeight - (padTop + padBottom));

    /* Если панель больше видимой зоны, приоритет — верх/лево внутри экрана (не даём «вылетать» за верх). */
    if (br.width > maxW) {
      dx += padX - br.left;
    }
    if (br.left < padX) dx += padX - br.left;
    if (br.right > window.innerWidth - padX && br.width <= maxW) dx += window.innerWidth - padX - br.right;

    if (br.height > maxH) {
      dy += padTop - br.top;
    }
    if (br.top < padTop) dy += padTop - br.top;
    if (br.bottom > window.innerHeight - padBottom && br.height <= maxH) dy += window.innerHeight - padBottom - br.bottom;
    if (dx === 0 && dy === 0) return { x, y };
    x += dx;
    y += dy;
  }
  return { x, y };
}

const PC_POINTER_MOVE_OPTS: AddEventListenerOptions = { passive: true };
/** Ушко: preventDefault при перетаскивании — иначе scroll у предка (main-wrap) съедает pointermove на тачскрине. */
const SIDE_EAR_POINTER_MOVE_OPTS: AddEventListenerOptions = { passive: false };
const SIDE_EAR_POINTER_RAW_OPTS: AddEventListenerOptions = { passive: false };

function sideEarPointerRawUpdateSupported(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    return 'onpointerrawupdate' in document.createElement('div');
  } catch {
    return false;
  }
}

/** Coalesced + финальный ev — для порога «уже тянем»; позицию берём только с `ev` (актуальная точка). */
function sideEarDragThresholdSamples(ev: PointerEvent): PointerEvent[] {
  if (typeof ev.getCoalescedEvents === 'function') {
    try {
      const c = ev.getCoalescedEvents();
      if (c.length > 0) return [...c, ev];
    } catch {
      /* ignore */
    }
  }
  return [ev];
}
/** От прежней привязки к правому нижнему углу: влево 15px, вниз 30px */
const PC_CHAT_SHIFT_X = -15;
const PC_CHAT_SHIFT_Y = 30;

/**
 * Фактический translate с отрисованного окна (inline + CSS), чтобы origin драга не расходился с React state
 * (иначе панель «улетает» относительно курсора).
 */
/** То же, что в React state `pcDrag` (один коммит с transform) — без расхождений с matrix в углу экрана */
function readPcDragFromDataAttrs(el: HTMLElement): { x: number; y: number } | null {
  const xs = el.getAttribute('data-pc-chat-drag-x');
  const ys = el.getAttribute('data-pc-chat-drag-y');
  if (xs == null || ys == null) return null;
  const x = Number(xs);
  const y = Number(ys);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function readPcDragFromComputedTranslate(el: HTMLElement): { x: number; y: number } | null {
  if (typeof DOMMatrixReadOnly === 'undefined') return null;
  const raw = getComputedStyle(el).transform;
  if (!raw || raw === 'none') return null;
  try {
    const m = new DOMMatrixReadOnly(raw);
    const tx = m.m41;
    const ty = m.m42;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return null;
    return { x: tx - PC_CHAT_SHIFT_X, y: ty - PC_CHAT_SHIFT_Y };
  } catch {
    return null;
  }
}

function readPcDragFromLs(): { x: number; y: number } {
  if (typeof localStorage === 'undefined') return { x: 0, y: 0 };
  try {
    const raw = localStorage.getItem(LS_PC_CHAT_DRAG);
    if (!raw) return { x: 0, y: 0 };
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = typeof j.x === 'number' && Number.isFinite(j.x) ? j.x : 0;
    const y = typeof j.y === 'number' && Number.isFinite(j.y) ? j.y : 0;
    return { x, y };
  } catch {
    return { x: 0, y: 0 };
  }
}

function hasPcDragInLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(LS_PC_CHAT_DRAG);
    if (!raw) return false;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    return typeof j.x === 'number' && Number.isFinite(j.x) && typeof j.y === 'number' && Number.isFinite(j.y);
  } catch {
    return false;
  }
}

function readPcCollapsedFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(LS_PC_CHAT_COLLAPSED) === '1';
}

function hasPcCollapsedInLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_PC_CHAT_COLLAPSED) != null;
  } catch {
    return false;
  }
}

function readMobileChatHeightFromLs(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_MOBILE_CHAT_HEIGHT);
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return n;
  } catch {
    return null;
  }
}

function readMobileResizeHintSeenFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_MOBILE_CHAT_RESIZE_HINT_SEEN) === '1';
  } catch {
    return false;
  }
}

/**
 * Вписать смещение в экран (тест через el.style.transform).
 * dx/dy суммируются: иначе при одновременном выходе за левый и правый край второе условие затирало первое.
 */
function clampPcChatOffset(el: HTMLElement, nx: number, ny: number): { x: number; y: number } {
  const pad = 12;
  let x = nx;
  let y = ny;
  for (let i = 0; i < 8; i++) {
    el.style.transform = `translate3d(${PC_CHAT_SHIFT_X + x}px, ${PC_CHAT_SHIFT_Y + y}px, 0)`;
    const br = el.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    const maxW = Math.max(0, window.innerWidth - pad * 2);
    const maxH = Math.max(0, window.innerHeight - pad * 2);

    /* Для oversized-панели фиксируем верх/лево внутри экрана, чтобы не было «базы» с вылетом за верх. */
    if (br.width > maxW) {
      dx += pad - br.left;
    }
    if (br.left < pad) dx += pad - br.left;
    if (br.right > window.innerWidth - pad && br.width <= maxW) dx += window.innerWidth - pad - br.right;

    if (br.height > maxH) {
      dy += pad - br.top;
    }
    if (br.top < pad) dy += pad - br.top;
    if (br.bottom > window.innerHeight - pad && br.height <= maxH) dy += window.innerHeight - pad - br.bottom;
    if (dx === 0 && dy === 0) return { x, y };
    x += dx;
    y += dy;
  }
  return { x, y };
}

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 45_000) return 'сейчас';
    if (diff < 86_400_000) {
      return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function initialsFromName(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export type TableChatDockProps = {
  roomId: string;
  userId: string;
  displayName: string;
  variant: 'mobile' | 'pc';
  onOwnMessageSent?: TableChatDockOwnMessageHandler;
  /** Моб.: «стандарт после short» — узкая подсказка + боковое ушко открытия чата */
  standardAfterShortVh?: boolean;
  /** Лаб-страница / без Supabase: не подписываться на чат, отправка только локально */
  offlineUiLab?: boolean;
  /** Вместе с offlineUiLab: принудительно показать «печатает» / непрочитанное на ушке */
  offlineUiLabEarMock?: OfflineUiLabEarMock;
  /**
   * Лаба: при каждом **увеличении** числа — имитация нового входящего сообщения от другого игрока
   * (обновляет превью ушка и ленту; для проверки ответа во фантоме при смене превью).
   */
  offlineUiLabIncomingSeq?: number;
  /** Только mobile: свёрнут ли док (полоска + ушко видны при true) */
  onMobileChatCollapsedChange?: (collapsed: boolean) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Сравнение строк в «Мои»: без toLowerCase() для эмодзи — иначе суррогаты/последовательности ломаются. */
function mineSnippetDedupeKey(s: string): string {
  const t = s.trim().normalize('NFC');
  if (t.length === 0) return '';
  if (/\p{Extended_Pictographic}/u.test(t)) return t;
  return t.toLowerCase();
}

function isLikelyEmojiSnippet(s: string): boolean {
  const t = s.trim();
  return /\p{Extended_Pictographic}/u.test(t) && t.length <= 10;
}

function dedupeMySnippets(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const t = s.trim();
    if (!t) continue;
    const k = mineSnippetDedupeKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MY_SNIPPETS_MAX) break;
  }
  return out;
}

function loadMySnippetsFromLs(): string[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MY_SNIPPETS_LS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    const out: string[] = [];
    for (const x of p) {
      if (typeof x !== 'string') continue;
      const t = x.trim().slice(0, MY_SNIPPETS_MAX_LEN);
      if (!t) continue;
      out.push(t);
    }
    return dedupeMySnippets(out);
  } catch {
    return [];
  }
}

/** Несколько попыток: после входа в комнату SELECT иногда раньше, чем RLS «видит» участника. */
async function fetchRoomChatHistoryWithRetry(roomId: string, limit: number): Promise<RoomChatMessageRow[]> {
  const extraWaitsMs = [200, 380, 680];
  let last = await fetchRoomChatMessages(roomId, limit);
  if (last.length > 0) return last;
  for (const w of extraWaitsMs) {
    await sleep(w);
    last = await fetchRoomChatMessages(roomId, limit);
    if (last.length > 0) return last;
  }
  return last;
}

function TableChatDock({
  roomId,
  userId,
  displayName,
  variant,
  onOwnMessageSent,
  standardAfterShortVh = false,
  offlineUiLab = false,
  offlineUiLabEarMock = { scenario: 'none' },
  offlineUiLabIncomingSeq = 0,
  onMobileChatCollapsedChange,
}: TableChatDockProps) {
  const [messages, setMessages] = useState<RoomChatMessageRow[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optimisticIdRef = useRef<string | null>(null);
  const lastLabIncomingSeqRef = useRef(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const resizeCornerRef = useRef<HTMLButtonElement>(null);
  const latestPcDragRef = useRef({ x: 0, y: 0 });
  const pcDragSessionRef = useRef({
    active: false,
    pointerId: -1,
    originX: 0,
    originY: 0,
    startX: 0,
    startY: 0,
  });
  const pcPrefsLoadedRef = useRef(false);
  const pcDefaultPlacedRef = useRef(false);
  const pcForceDefaultPlacementRef = useRef(false);
  /** Сворачивать ПК-чат при смене комнаты — не при каждом heal Realtime игры (nonce раньше путали с «перезаходом»). */
  const lastCollapsedPcChatForRoomIdRef = useRef<string | null>(null);
  const liveDragRef = useRef({ x: 0, y: 0 });
  const pcResizeSessionRef = useRef({
    active: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startDragX: 0,
    startDragY: 0,
  });
  const mobileResizeSessionRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    startHeight: 220,
  });

  const [pcCollapsed, setPcCollapsed] = useState(false);
  const [pcDrag, setPcDrag] = useState(() =>
    typeof window === 'undefined' ? { x: 0, y: 0 } : readPcDragFromLs(),
  );
  const [pcSize, setPcSize] = useState<{ w: number; h: number } | null>(() => {
    if (typeof window === 'undefined') return null;
    const ls = readPcSizeFromLs();
    if (ls) return clampPcChatSize(ls.w, ls.h);
    const d = readDefaultPcDockSize();
    return clampPcChatSize(d.w, d.h);
  });
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [emojiTab, setEmojiTab] = useState<TableChatPickerTabId>('react');
  const [emojiBankExpanded, setEmojiBankExpanded] = useState(false);
  const emojiPanelRef = useRef<HTMLDivElement>(null);
  const emojiToggleRef = useRef<HTMLButtonElement>(null);
  const emojiQuickRef = useRef<HTMLButtonElement>(null);
  const mineQuickRef = useRef<HTMLButtonElement>(null);
  const composerInnerRef = useRef<HTMLDivElement>(null);
  const emojiPanelDomId = useId().replace(/:/g, '');
  const sideEarGlyphGradId = `${emojiPanelDomId}-side-ear-glyph`;
  /** Градиент для ▲/▼ ушка (SVG), без background-clip:text у символа — иначе «волосок» над каймой. */
  const sideEarChevronGradId = `${emojiPanelDomId}-side-ear-chevron`;
  const sideRailChevronGradId = `${emojiPanelDomId}-side-rail-chevron`;
  const earPreviewDialogTitleId = `${emojiPanelDomId}-ear-preview-title`;
  /** Градиенты для глифов панели фантома (stroke/fill url #…). */
  const phantomToolbarGradId = `${emojiPanelDomId}-phantom-toolbar-grad`;
  const phantomToolbarGradDeepId = `${emojiPanelDomId}-phantom-toolbar-grad-deep`;
  const phantomToolbarStrokeUrl = `url(#${phantomToolbarGradId})`;
  const phantomToolbarFillUrl = `url(#${phantomToolbarGradDeepId})`;
  const [mobileMessagesHeight, setMobileMessagesHeight] = useState<number>(() => {
    const ls = readMobileChatHeightFromLs();
    return Math.round(Math.min(360, Math.max(140, ls ?? 188)));
  });
  const [mobileResizeHintVisible, setMobileResizeHintVisible] = useState<boolean>(() => !readMobileResizeHintSeenFromLs());
  const [sideEarCenterPct, setSideEarCenterPct] = useState(() => {
    if (typeof window === 'undefined') return SIDE_EAR_DEFAULT_CENTER_PCT;
    const ls = readSideEarCenterPctFromLs();
    const base = ls ?? SIDE_EAR_DEFAULT_CENTER_PCT;
    return clampSideEarCenterPct(base, window.innerHeight, SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX);
  });
  const [sideEarRailCollapsed, setSideEarRailCollapsed] = useState(() => readSideEarRailCollapsedFromLs());
  /** Ушко: непрочитанные при свёрнутом чате (новые от других после последнего «прочитано»). */
  const [sideEarUnread, setSideEarUnread] = useState(false);
  const [unreadPhantom, setUnreadPhantom] = useState<SideEarUnreadPhantom | null>(null);
  /** Строка для «фантомной» плашки — «печатает». */
  const [typingPhantomLine, setTypingPhantomLine] = useState<string | null>(null);
  /** Не показывать текст превью непрочитанного у ушка (только индикатор). */
  const [hideUnreadEarPhantomPreview, setHideUnreadEarPhantomPreview] = useState(
    readHideUnreadEarPhantomPreviewFromLs,
  );
  const [earPreviewSettingsOpen, setEarPreviewSettingsOpen] = useState(false);
  /** Разовый показ превью непрочитанного при тапе на точку, если в настройках включено скрытие — галочка в модалке не меняется. */
  const [earUnreadPhantomPeek, setEarUnreadPhantomPeek] = useState(false);
  const [sideEarPhantomDismissed, setSideEarPhantomDismissed] = useState<SideEarPhantomDismiss | null>(null);
  /** Раскрыть полный текст непрочитанного во фантоме (без смены размера пузыря по ширине). */
  const [earPhantomUnreadExpanded, setEarPhantomUnreadExpanded] = useState(false);
  /** Предыдущее превью у ушка (один уровень «назад»), когда пришло новое сообщение — можно снова открыть текст старого. */
  const [phantomUnreadUnderlay, setPhantomUnreadUnderlay] = useState<SideEarUnreadPhantom | null>(null);
  /** Какой текст показывать в блоке строк: актуальное превью или сохранённое предыдущее. */
  const [phantomUnreadUiLayer, setPhantomUnreadUiLayer] = useState<'fresh' | 'previous'>('fresh');
  /** Поле быстрого ответа из фантома. */
  const [earPhantomReplyOpen, setEarPhantomReplyOpen] = useState(false);
  const [earPhantomReplyDraft, setEarPhantomReplyDraft] = useState('');
  /** Снимок превью в момент открытия ответа — для «С цитатой» и подсказки, пока текст ушка обновился. */
  const [phantomReplyAnchor, setPhantomReplyAnchor] = useState<SideEarUnreadPhantom | null>(null);
  /** Снимок превью в момент открытия ответа — чтобы после «свежее» не терять кнопку «исходное». */
  const phantomReplyAnchorAtOpenRef = useRef<SideEarUnreadPhantom | null>(null);
  /** Последнее значение `unreadPhantom` до текущего рендера — для стека «свежее / предыдущее». */
  const lastUnreadPhantomSnapRef = useRef<SideEarUnreadPhantom | null>(null);
  /** Скролл раскрытого превью к хвосту после смены текста / id (WebKit иногда не пересчитывает без толчка). */
  const phantomUnreadLinesRef = useRef<HTMLDivElement | null>(null);
  /** Режим отправки: с подстановкой цитаты из якоря или только текст поля. */
  const [earPhantomReplyIncludeQuote, setEarPhantomReplyIncludeQuote] = useState(false);
  const prevEarPhantomReplyOpenRef = useRef(false);
  const earPreviewSheetRef = useRef<HTMLDivElement>(null);
  const sideEarShellRef = useRef<HTMLDivElement>(null);
  /** Смещение drag в px — на узле без React style, чтобы ре-рендеры чата не трогали transform. */
  const sideEarDragShiftRef = useRef<HTMLDivElement>(null);
  const sideEarCenterPctRef = useRef(sideEarCenterPct);
  sideEarCenterPctRef.current = sideEarCenterPct;
  const mobileOpenRef = useRef(mobileOpen);
  mobileOpenRef.current = mobileOpen;
  const seenUpToCreatedAtRef = useRef<string | null>(null);
  const broadcastTypingRef = useRef<((p: RoomChatTypingBroadcastPayload) => void) | null>(null);
  const lastTypingBroadcastSentRef = useRef(0);
  const typingPeersRef = useRef<Map<string, TypingPeerEntry>>(new Map());
  const sideEarSuppressClickRef = useRef(false);
  const sideEarDragRef = useRef({
    active: false,
    pointerId: -1,
    startClientY: 0,
    startCenterPct: SIDE_EAR_DEFAULT_CENTER_PCT,
    dragging: false,
    earHalfClampPx: SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX,
    /** Смещение центра по Y относительно точки старта drag (px), последнее по pointer (для up). */
    lastDragOffsetPx: 0,
    /** Один rAF на кадр: запись --side-ear-drag-y синхронно с отрисовкой, без лишних style-write. */
    dragVisualRafId: 0,
    dragWillChangeSet: false,
    /** На время drag фиксируем высоту shell — иначе -50% и контент (печатает/непрочитано) дают микропрыжки. */
    dragLayoutLocked: false,
  });
  /** Снятие window-listeners при up или размонтировании (те же ссылки, что в addEventListener). */
  const sideEarDragWindowHandlersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    raw?: (e: Event) => void;
  } | null>(null);

  latestPcDragRef.current = pcDrag;

  const pcBaseFloatStyle = useMemo((): CSSProperties | undefined => {
    if (variant !== 'pc') return undefined;
    return {
      touchAction: 'none',
      /* Всегда через React: иначе при pcDragging transform пропадал из style и панель прыгала к right/bottom */
      transform: `translate3d(${PC_CHAT_SHIFT_X + pcDrag.x}px, ${PC_CHAT_SHIFT_Y + pcDrag.y}px, 0)`,
    };
  }, [variant, pcDrag.x, pcDrag.y]);

  const pcExpandedDockStyle = useMemo((): CSSProperties | undefined => {
    if (variant !== 'pc') return undefined;
    const s: CSSProperties = { ...pcBaseFloatStyle };
    const box = pcSize ?? readDefaultPcDockSize();
    s.width = box.w;
    s.height = box.h;
    return s;
  }, [variant, pcBaseFloatStyle, pcSize]);

  const mobileDockStyle = useMemo((): CSSProperties | undefined => {
    if (variant !== 'mobile') return undefined;
    return {
      ['--mobile-chat-messages-height' as string]: `${mobileMessagesHeight}px`,
    };
  }, [mobileMessagesHeight, variant]);

  const displayMessages = useMemo(
    () => (variant === 'mobile' ? [...messages].reverse() : messages),
    [messages, variant],
  );

  const [mySnippets, setMySnippets] = useState<string[]>(() => loadMySnippetsFromLs());
  const [mineDraft, setMineDraft] = useState('');
  const [mobileMineEditMode, setMobileMineEditMode] = useState(false);
  const [mobileMineToast, setMobileMineToast] = useState<string | null>(null);
  const mobileMineToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressSessionRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });
  /** ПК: короткая подсказка «Мои» (кнопка ?) */
  const [minePcHelpOpen, setMinePcHelpOpen] = useState(false);
  /** Ключ ячейки «эмодзи+индекс» для неон-вспышки звезды после добавления в «Мои» */
  const [mineStarFlashKey, setMineStarFlashKey] = useState<string | null>(null);
  const mineStarFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emojiCells = useMemo(() => {
    if (emojiTab === 'phrases' || emojiTab === 'mine') return [];
    return getEmojiCellsForTab(emojiTab, emojiBankExpanded);
  }, [emojiTab, emojiBankExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(MY_SNIPPETS_LS_KEY, JSON.stringify(mySnippets));
    } catch {
      /* ignore */
    }
  }, [mySnippets]);

  useEffect(() => {
    return () => {
      if (mineStarFlashTimerRef.current) clearTimeout(mineStarFlashTimerRef.current);
      if (mobileMineToastTimerRef.current) clearTimeout(mobileMineToastTimerRef.current);
      if (longPressSessionRef.current.timer) clearTimeout(longPressSessionRef.current.timer);
    };
  }, []);

  const showMobileMineToast = useCallback((message: string) => {
    if (variant !== 'mobile') return;
    if (mobileMineToastTimerRef.current) clearTimeout(mobileMineToastTimerRef.current);
    setMobileMineToast(message);
    mobileMineToastTimerRef.current = setTimeout(() => {
      setMobileMineToast(null);
      mobileMineToastTimerRef.current = null;
    }, 1100);
  }, [variant]);

  const triggerMineStarFlash = useCallback((key: string) => {
    if (mineStarFlashTimerRef.current) clearTimeout(mineStarFlashTimerRef.current);
    setMineStarFlashKey(key);
    mineStarFlashTimerRef.current = setTimeout(() => {
      setMineStarFlashKey(null);
      mineStarFlashTimerRef.current = null;
    }, 720);
  }, []);

  const addMineFromEmojiStar = useCallback(
    (emo: string, flashKey: string) => {
      const t = emo.trim().slice(0, MY_SNIPPETS_MAX_LEN);
      if (!t) return;
      if (mySnippets.length >= MY_SNIPPETS_MAX) {
        triggerMineStarFlash(flashKey);
        return;
      }
      const key = mineSnippetDedupeKey(t);
      setMySnippets((prev) => {
        if (prev.length >= MY_SNIPPETS_MAX) return prev;
        if (prev.some((x) => mineSnippetDedupeKey(x) === key)) return prev;
        return dedupeMySnippets([...prev, t]);
      });
      if (variant === 'mobile') {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(12);
          } catch {
            /* ignore */
          }
        }
        showMobileMineToast('Добавлено в «Мои»');
      }
      triggerMineStarFlash(flashKey);
    },
    [mySnippets.length, showMobileMineToast, triggerMineStarFlash, variant],
  );

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      /* closest надёжнее ref.contains (звёздочка и др. внутри панели) */
      if (t.closest('.table-chat-emoji-panel--popover')) return;
      if (emojiToggleRef.current?.contains(t)) return;
      if (emojiQuickRef.current?.contains(t)) return;
      if (mineQuickRef.current?.contains(t)) return;
      if (composerInnerRef.current?.contains(t)) return;
      if (resizeCornerRef.current?.contains(t)) return;
      setEmojiPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEmojiPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [emojiPickerOpen]);

  const insertSnippet = useCallback((ch: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setText((prev) => (prev + ch).slice(0, MAX_BODY));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const v = ta.value;
    const merged = (v.slice(0, start) + ch + v.slice(end)).slice(0, MAX_BODY);
    const nextPos = Math.min(start + ch.length, merged.length);
    setText(merged);
    requestAnimationFrame(() => {
      ta.focus();
      try {
        ta.setSelectionRange(nextPos, nextPos);
      } catch {
        /* ignore */
      }
    });
  }, []);

  const onEmojiToggle = useCallback(() => {
    setEmojiPickerOpen((o) => {
      const next = !o;
      if (next) setEmojiBankExpanded(false);
      return next;
    });
    if (variant === 'mobile') {
      // На мобильном при открытии панели убираем системную клавиатуру,
      // чтобы эмодзи/фразы не конкурировали за вертикальное пространство.
      textareaRef.current?.blur();
    }
  }, [variant]);

  const onEmojiTab = useCallback((id: TableChatPickerTabId) => {
    setEmojiTab(id);
    setEmojiBankExpanded(false);
  }, []);

  const onMobileQuickEmoji = useCallback(() => {
    if (variant !== 'mobile') return;
    setEmojiPickerOpen((open) => {
      if (open && emojiTab !== 'mine') return false;
      return true;
    });
    if (emojiTab === 'mine') {
      setEmojiTab('react');
      setEmojiBankExpanded(false);
    }
  }, [emojiTab, variant]);

  const onMobileQuickMine = useCallback(() => {
    if (variant !== 'mobile') return;
    setEmojiPickerOpen((open) => !(open && emojiTab === 'mine'));
    if (emojiTab !== 'mine') {
      setEmojiTab('mine');
      setEmojiBankExpanded(false);
    }
  }, [emojiTab, variant]);

  const addMineSnippet = useCallback((raw: string) => {
    const t = raw.trim().slice(0, MY_SNIPPETS_MAX_LEN);
    if (!t) return;
    const key = mineSnippetDedupeKey(t);
    let added = false;
    setMySnippets((prev) => {
      if (prev.some((x) => mineSnippetDedupeKey(x) === key)) return prev;
      if (prev.length >= MY_SNIPPETS_MAX) return prev;
      added = true;
      return dedupeMySnippets([...prev, t]);
    });
    if (added && variant === 'mobile') {
      showMobileMineToast('Добавлено в «Мои»');
    }
  }, [showMobileMineToast, variant]);

  const startMobileLongPressAddMine = useCallback((value: string, flashKey?: string) => {
    if (variant !== 'mobile') return;
    if (longPressSessionRef.current.timer) clearTimeout(longPressSessionRef.current.timer);
    longPressSessionRef.current.fired = false;
    longPressSessionRef.current.timer = setTimeout(() => {
      longPressSessionRef.current.fired = true;
      if (flashKey) addMineFromEmojiStar(value, flashKey);
      else addMineSnippet(value);
    }, 420);
  }, [addMineFromEmojiStar, addMineSnippet, variant]);

  const clearMobileLongPress = useCallback(() => {
    if (longPressSessionRef.current.timer) {
      clearTimeout(longPressSessionRef.current.timer);
      longPressSessionRef.current.timer = null;
    }
  }, []);

  const consumeMobileLongPressFired = useCallback(() => {
    const fired = longPressSessionRef.current.fired;
    longPressSessionRef.current.fired = false;
    return fired;
  }, []);

  const addMineFromComposer = useCallback(() => {
    addMineSnippet(text);
  }, [text, addMineSnippet]);

  const removeMineSnippet = useCallback((index: number) => {
    setMySnippets((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const commitMineDraft = useCallback(() => {
    addMineSnippet(mineDraft);
    setMineDraft('');
  }, [mineDraft, addMineSnippet]);

  const flushTypingLine = useCallback(() => {
    const now = Date.now();
    const m = typingPeersRef.current;
    for (const k of [...m.keys()]) {
      if ((m.get(k)?.expiresAt ?? 0) < now) m.delete(k);
    }
    setTypingPhantomLine(formatTypingLineFromMap(m, now));
  }, []);

  const onTypingBroadcast = useCallback(
    (p: RoomChatTypingBroadcastPayload) => {
      if (p.user_id === userId) return;
      const dn = (p.display_name ?? '').trim().slice(0, 40) || 'Игрок';
      typingPeersRef.current.set(p.user_id, {
        displayName: dn,
        expiresAt: Date.now() + TYPING_PEER_TTL_MS,
      });
      flushTypingLine();
    },
    [userId, flushTypingLine],
  );

  const handleChatInsert = useCallback(
    (row: RoomChatMessageRow) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        const opt = optimisticIdRef.current;
        const next = opt ? prev.filter((m) => m.id !== opt) : prev;
        return [...next, row].slice(-FETCH_LIMIT);
      });
      if (standardAfterShortVh && !mobileOpenRef.current && row.user_id !== userId) {
        const seen = seenUpToCreatedAtRef.current;
        if (!seen || row.created_at > seen) {
          setSideEarUnread(true);
          setUnreadPhantom(formatUnreadPhantomFromMessage(row));
        }
      }
    },
    [standardAfterShortVh, userId],
  );

  useEffect(() => {
    setSideEarUnread(false);
    setUnreadPhantom(null);
    setTypingPhantomLine(null);
    typingPeersRef.current.clear();
    seenUpToCreatedAtRef.current = null;
    lastTypingBroadcastSentRef.current = 0;
    lastLabIncomingSeqRef.current = 0;
    lastUnreadPhantomSnapRef.current = null;
    setPhantomUnreadUnderlay(null);
    setPhantomUnreadUiLayer('fresh');
  }, [roomId]);

  useEffect(() => {
    if (!offlineUiLab) {
      lastLabIncomingSeqRef.current = 0;
      return;
    }
    const seq = offlineUiLabIncomingSeq;
    if (seq <= 0) {
      lastLabIncomingSeqRef.current = 0;
      return;
    }
    if (seq <= lastLabIncomingSeqRef.current) return;
    lastLabIncomingSeqRef.current = seq;
    const id = `lab-peer-${seq}-${Date.now()}`;
    const names = ['Маша', 'Олеся', 'Петя'];
    const dn = names[(seq - 1) % names.length];
    const row: RoomChatMessageRow = {
      id,
      room_id: roomId,
      user_id: `lab-peer-${seq}`,
      display_name: dn,
      body: `Свежее «входящее» #${seq} (${new Date().toLocaleTimeString('ru-RU')}) — превью ушка сменится; черновик ответа во фантоме не сбрасывается.`,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, row].slice(-FETCH_LIMIT));
    if (standardAfterShortVh && !mobileOpenRef.current) {
      setSideEarUnread(true);
      setUnreadPhantom(formatUnreadPhantomFromMessage(row));
    }
  }, [offlineUiLab, offlineUiLabIncomingSeq, roomId, standardAfterShortVh]);

  useEffect(() => {
    if (offlineUiLab) {
      return () => {};
    }
    let cancelled = false;
    setError(null);
    void (async () => {
      const initial = await fetchRoomChatHistoryWithRetry(roomId, FETCH_LIMIT);
      if (cancelled) return;
      setMessages(initial);
      const tail = initial[initial.length - 1];
      seenUpToCreatedAtRef.current = tail?.created_at ?? null;
    })();
    const sub = subscribeRoomChat(roomId, handleChatInsert, { onTypingBroadcast });
    broadcastTypingRef.current = sub.broadcastTyping;
    return () => {
      cancelled = true;
      broadcastTypingRef.current = null;
      sub.unsubscribe();
    };
  }, [roomId, offlineUiLab, handleChatInsert, onTypingBroadcast]);

  useEffect(() => {
    if (!mobileOpen) return;
    const tail = messages[messages.length - 1];
    if (tail) seenUpToCreatedAtRef.current = tail.created_at;
    setSideEarUnread(false);
    setUnreadPhantom(null);
  }, [mobileOpen, messages]);

  useEffect(() => {
    if (offlineUiLab) return;
    const id = window.setInterval(flushTypingLine, 420);
    return () => clearInterval(id);
  }, [offlineUiLab, flushTypingLine]);

  useEffect(() => {
    if (offlineUiLab || !roomId || !userId) return;
    if (text.trim().length === 0) return;
    const tid = window.setTimeout(() => {
      const now = Date.now();
      if (now - lastTypingBroadcastSentRef.current < TYPING_BROADCAST_MIN_INTERVAL_MS) return;
      lastTypingBroadcastSentRef.current = now;
      broadcastTypingRef.current?.({
        user_id: userId,
        display_name: displayName.trim().slice(0, 40) || 'Игрок',
      });
    }, 400);
    return () => clearTimeout(tid);
  }, [text, roomId, userId, displayName, offlineUiLab]);

  /** Вкладка/сеть: повторный вход без смены roomId у монтированного дока. */
  useEffect(() => {
    if (offlineUiLab || !roomId) return;
    const softRefetch = () => {
      if (document.visibilityState !== 'visible') return;
      void (async () => {
        const rows = await fetchRoomChatHistoryWithRetry(roomId, FETCH_LIMIT);
        setMessages((prev) => (rows.length > 0 ? rows : prev));
      })();
    };
    const onOnline = () => {
      void (async () => {
        const rows = await fetchRoomChatHistoryWithRetry(roomId, FETCH_LIMIT);
        setMessages((prev) => (rows.length > 0 ? rows : prev));
      })();
    };
    document.addEventListener('visibilitychange', softRefetch);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', softRefetch);
      window.removeEventListener('online', onOnline);
    };
  }, [roomId, offlineUiLab]);

  useEffect(() => {
    if (variant === 'mobile' && !mobileOpen) setEmojiPickerOpen(false);
  }, [variant, mobileOpen]);

  useEffect(() => {
    if (variant !== 'mobile') return;
    onMobileChatCollapsedChange?.(!mobileOpen);
  }, [variant, mobileOpen, onMobileChatCollapsedChange]);

  useEffect(() => {
    if (variant !== 'mobile' || emojiTab !== 'mine') setMobileMineEditMode(false);
  }, [emojiTab, variant]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (variant === 'mobile') {
      if (!mobileOpen) return;
      const stickToLatest = el.scrollTop < 72;
      if (stickToLatest) el.scrollTop = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, mobileOpen, variant]);

  const resizeComposer = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = variant === 'mobile' ? 100 : 120;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [variant]);

  useLayoutEffect(() => {
    resizeComposer();
  }, [text, resizeComposer, mobileOpen, variant]);

  useEffect(() => {
    if (variant !== 'mobile' || !emojiPickerOpen) return;
    const ensureEmojiPanelVisible = () => {
      const panel = emojiPanelRef.current;
      if (!panel) return;
      panel.scrollTop = 0;
      const nested = panel.querySelectorAll<HTMLElement>(
        '.table-chat-emoji-panel__grid, .table-chat-phrase-scroll, .table-chat-mine__scroll',
      );
      nested.forEach((el) => {
        el.scrollTop = 0;
      });
      try {
        panel.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
      } catch {
        panel.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
    };
    const rafId = requestAnimationFrame(ensureEmojiPanelVisible);
    const tId = window.setTimeout(ensureEmojiPanelVisible, 120);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(tId);
    };
  }, [emojiPickerOpen, variant]);

  useEffect(() => {
    if (variant !== 'pc' || pcPrefsLoadedRef.current) return;
    pcPrefsLoadedRef.current = true;
    setPcCollapsed(hasPcCollapsedInLs() ? readPcCollapsedFromLs() : true);
    const sz = readPcSizeFromLs();
    if (sz) setPcSize(clampPcChatSize(sz.w, sz.h));
  }, [variant]);

  useEffect(() => {
    if (variant !== 'pc') return;
    if (!roomId) {
      lastCollapsedPcChatForRoomIdRef.current = null;
      return;
    }
    if (lastCollapsedPcChatForRoomIdRef.current === roomId) return;
    lastCollapsedPcChatForRoomIdRef.current = roomId;
    /* Только другая комната: новый стол — свёрнуто и позиция по умолчанию. heal игры без смены roomId не трогает окно чата. */
    setPcCollapsed(true);
    pcDefaultPlacedRef.current = false;
    pcForceDefaultPlacementRef.current = true;
    try {
      localStorage.setItem(LS_PC_CHAT_COLLAPSED, '1');
    } catch {
      /* ignore */
    }
  }, [roomId, variant]);

  useLayoutEffect(() => {
    if (variant !== 'pc') return;
    if (pcDragSessionRef.current.active || pcResizeSessionRef.current.active) return;
    const el = dockRef.current;
    if (!el) return;
    let clamped = clampPcChatOffset(el, pcDrag.x, pcDrag.y);
    /* Жёсткий safeguard: если после clamp top всё ещё выше экрана, сдвигаем вниз принудительно. */
    el.style.transform = `translate3d(${PC_CHAT_SHIFT_X + clamped.x}px, ${PC_CHAT_SHIFT_Y + clamped.y}px, 0)`;
    const br = el.getBoundingClientRect();
    if (br.top < 8) {
      clamped = { x: clamped.x, y: clamped.y + (8 - br.top) };
    }
    if (clamped.x === pcDrag.x && clamped.y === pcDrag.y) return;
    setPcDrag(clamped);
    latestPcDragRef.current = clamped;
    try {
      localStorage.setItem(LS_PC_CHAT_DRAG, JSON.stringify(clamped));
    } catch {
      /* ignore */
    }
  }, [variant, pcDrag.x, pcDrag.y, pcSize?.w, pcSize?.h, pcCollapsed]);

  useLayoutEffect(() => {
    if (variant !== 'pc') return;
    if (!pcCollapsed) return;
    if (!pcPrefsLoadedRef.current) return;
    if (pcDefaultPlacedRef.current) return;
    if (!pcForceDefaultPlacementRef.current && hasPcDragInLs()) {
      pcDefaultPlacedRef.current = true;
      return;
    }
    const el = dockRef.current;
    if (!el) return;
    const east = document.querySelector<HTMLElement>('.opponent-slot.opponent-slot-east, .opponent-slot-east');
    if (!east) {
      pcDefaultPlacedRef.current = true;
      return;
    }
    const cur = readPcDragFromDataAttrs(el) ?? latestPcDragRef.current;
    const chatRect = el.getBoundingClientRect();
    const eastRect = east.getBoundingClientRect();
    const desiredLeft = eastRect.left + (eastRect.width - chatRect.width) / 2;
    const desiredTop = eastRect.bottom + 8;
    const nx = cur.x + (desiredLeft - chatRect.left);
    const ny = cur.y + (desiredTop - chatRect.top);
    const final = clampPcChatOffset(el, nx, ny);
    setPcDrag(final);
    latestPcDragRef.current = final;
    pcDefaultPlacedRef.current = true;
    pcForceDefaultPlacementRef.current = false;
    try {
      localStorage.setItem(LS_PC_CHAT_DRAG, JSON.stringify(final));
    } catch {
      /* ignore */
    }
  }, [variant, pcCollapsed, pcSize?.w, pcSize?.h]);

  const onPcResizePointerMove = useCallback((e: PointerEvent) => {
    const s = pcResizeSessionRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const el = dockRef.current;
    if (!el) return;
    const nw = s.startW + (e.clientX - s.startX);
    const nh = s.startH + (e.clientY - s.startY);
    const { w, h } = clampPcChatSize(nw, nh);
    const dW = w - s.startW;
    const dH = h - s.startH;
    const dx = s.startDragX + dW;
    const dy = s.startDragY + dH;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate3d(${PC_CHAT_SHIFT_X + dx}px, ${PC_CHAT_SHIFT_Y + dy}px, 0)`;
  }, []);

  const onPcResizePointerUp = useCallback(
    (e: PointerEvent) => {
      const s = pcResizeSessionRef.current;
      if (!s.active || e.pointerId !== s.pointerId) return;
      s.active = false;
      window.removeEventListener('pointermove', onPcResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onPcResizePointerUp);
      window.removeEventListener('pointercancel', onPcResizePointerUp);
      const nw = s.startW + (e.clientX - s.startX);
      const nh = s.startH + (e.clientY - s.startY);
      const next = clampPcChatSize(nw, nh);
      const dW = next.w - s.startW;
      const dH = next.h - s.startH;
      let nx = s.startDragX + dW;
      let ny = s.startDragY + dH;
      const el = dockRef.current;
      if (el) {
        el.style.width = `${next.w}px`;
        el.style.height = `${next.h}px`;
        const final = clampPcChatOffsetAfterResize(el, nx, ny);
        el.style.removeProperty('transform');
        el.style.removeProperty('width');
        el.style.removeProperty('height');
        nx = final.x;
        ny = final.y;
        setPcDrag(final);
        latestPcDragRef.current = final;
        try {
          localStorage.setItem(LS_PC_CHAT_DRAG, JSON.stringify(final));
        } catch {
          /* ignore */
        }
      } else {
        setPcDrag({ x: nx, y: ny });
        latestPcDragRef.current = { x: nx, y: ny };
      }
      setPcSize(next);
      try {
        localStorage.setItem(LS_PC_CHAT_SIZE, JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [onPcResizePointerMove],
  );

  const startPcResize = useCallback(
    (e: ReactPointerEvent) => {
      if (variant !== 'pc' || e.button !== 0) return;
      const el = dockRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const drag = latestPcDragRef.current;
      pcResizeSessionRef.current = {
        active: true,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startW: r.width,
        startH: r.height,
        startDragX: drag.x,
        startDragY: drag.y,
      };
      window.addEventListener('pointermove', onPcResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.addEventListener('pointerup', onPcResizePointerUp);
      window.addEventListener('pointercancel', onPcResizePointerUp);
      e.preventDefault();
      e.stopPropagation();
    },
    [variant, onPcResizePointerMove, onPcResizePointerUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPcResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onPcResizePointerUp);
      window.removeEventListener('pointercancel', onPcResizePointerUp);
      pcResizeSessionRef.current.active = false;
    };
  }, [onPcResizePointerMove, onPcResizePointerUp]);

  const onPcWindowPointerMove = useCallback((e: PointerEvent) => {
    const s = pcDragSessionRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const nx = s.originX + (e.clientX - s.startX);
    const ny = s.originY + (e.clientY - s.startY);
    liveDragRef.current = { x: nx, y: ny };
    setPcDrag((prev) => (prev.x === nx && prev.y === ny ? prev : { x: nx, y: ny }));
  }, []);

  const onMobileResizePointerMove = useCallback((e: PointerEvent) => {
    const s = mobileResizeSessionRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const next = s.startHeight + (s.startY - e.clientY);
    const clamped = Math.round(Math.min(360, Math.max(140, next)));
    setMobileMessagesHeight(clamped);
  }, []);

  const onMobileResizePointerUp = useCallback(
    (e: PointerEvent) => {
      const s = mobileResizeSessionRef.current;
      if (!s.active || e.pointerId !== s.pointerId) return;
      s.active = false;
      window.removeEventListener('pointermove', onMobileResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onMobileResizePointerUp);
      window.removeEventListener('pointercancel', onMobileResizePointerUp);
      const next = s.startHeight + (s.startY - e.clientY);
      const clamped = Math.round(Math.min(360, Math.max(140, next)));
      setMobileMessagesHeight(clamped);
      try {
        localStorage.setItem(LS_MOBILE_CHAT_HEIGHT, String(clamped));
      } catch {
        /* ignore */
      }
      setMobileResizeHintVisible(false);
      try {
        localStorage.setItem(LS_MOBILE_CHAT_RESIZE_HINT_SEEN, '1');
      } catch {
        /* ignore */
      }
    },
    [onMobileResizePointerMove],
  );

  const startMobileResize = useCallback(
    (e: ReactPointerEvent) => {
      if (variant !== 'mobile') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      mobileResizeSessionRef.current = {
        active: true,
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: mobileMessagesHeight,
      };
      window.addEventListener('pointermove', onMobileResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.addEventListener('pointerup', onMobileResizePointerUp);
      window.addEventListener('pointercancel', onMobileResizePointerUp);
      setMobileResizeHintVisible(false);
      try {
        localStorage.setItem(LS_MOBILE_CHAT_RESIZE_HINT_SEEN, '1');
      } catch {
        /* ignore */
      }
      e.preventDefault();
    },
    [mobileMessagesHeight, onMobileResizePointerMove, onMobileResizePointerUp, variant],
  );

  const onPcWindowPointerUp = useCallback(
    (e: PointerEvent) => {
      const s = pcDragSessionRef.current;
      if (!s.active || e.pointerId !== s.pointerId) return;
      s.active = false;
      window.removeEventListener('pointermove', onPcWindowPointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onPcWindowPointerUp);
      window.removeEventListener('pointercancel', onPcWindowPointerUp);
      const el = dockRef.current;
      if (el) {
        try {
          if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      /* Последняя позиция из move — надёжнее, чем clientX на up; без removeProperty(transform): иначе кадр без translate = «база» right/bottom */
      const nx = liveDragRef.current.x;
      const ny = liveDragRef.current.y;
      let final = { x: nx, y: ny };
      if (el) {
        final = clampPcChatOffset(el, nx, ny);
      }
      setPcDrag(final);
      latestPcDragRef.current = final;
      try {
        localStorage.setItem(LS_PC_CHAT_DRAG, JSON.stringify(final));
      } catch {
        /* ignore */
      }
    },
    [onPcWindowPointerMove],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onPcWindowPointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onPcWindowPointerUp);
      window.removeEventListener('pointercancel', onPcWindowPointerUp);
      pcDragSessionRef.current.active = false;
      dockRef.current?.style.removeProperty('transform');
    };
  }, [onPcWindowPointerMove, onPcWindowPointerUp]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onMobileResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onMobileResizePointerUp);
      window.removeEventListener('pointercancel', onMobileResizePointerUp);
      mobileResizeSessionRef.current.active = false;
    };
  }, [onMobileResizePointerMove, onMobileResizePointerUp]);

  useEffect(() => {
    if (variant !== 'mobile' || !mobileOpen || !mobileResizeHintVisible) return;
    const t = window.setTimeout(() => {
      setMobileResizeHintVisible(false);
      try {
        localStorage.setItem(LS_MOBILE_CHAT_RESIZE_HINT_SEEN, '1');
      } catch {
        /* ignore */
      }
    }, 4200);
    return () => window.clearTimeout(t);
  }, [mobileOpen, mobileResizeHintVisible, variant]);

  const startPcWindowDrag = useCallback(
    (e: ReactPointerEvent) => {
      if (variant !== 'pc') return;
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      const inCollapsedRow = Boolean(t.closest('.table-chat-dock-pc-collapsed-row'));
      if (t.closest('.table-chat-dock-pc-resize-corner')) return;
      if (!inCollapsedRow && t.closest('button, textarea, a, input')) return;
      const el = dockRef.current;
      if (!el) return;
      /* data-* совпадает с transform в одном коммите React; matrix из getComputedStyle в углу могла расходиться с pcDrag */
      const cur =
        readPcDragFromDataAttrs(el) ?? readPcDragFromComputedTranslate(el) ?? latestPcDragRef.current;
      latestPcDragRef.current = cur;
      liveDragRef.current = { x: cur.x, y: cur.y };
      pcDragSessionRef.current = {
        active: true,
        pointerId: e.pointerId,
        originX: cur.x,
        originY: cur.y,
        startX: e.clientX,
        startY: e.clientY,
      };
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      window.addEventListener('pointermove', onPcWindowPointerMove, PC_POINTER_MOVE_OPTS);
      window.addEventListener('pointerup', onPcWindowPointerUp);
      window.addEventListener('pointercancel', onPcWindowPointerUp);
      e.preventDefault();
    },
    [variant, onPcWindowPointerMove, onPcWindowPointerUp],
  );

  const sendTrimmedChatBody = useCallback(
    async (raw: string): Promise<{ ok: boolean; row?: RoomChatMessageRow | null }> => {
      const t = raw.trim();
      if (!t || sending) return { ok: false };
      if (offlineUiLab) {
        const labId = `lab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const localRow: RoomChatMessageRow = {
          id: labId,
          room_id: roomId,
          user_id: userId,
          display_name: displayName.trim() || 'Игрок',
          body: t,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, localRow].slice(-FETCH_LIMIT));
        return { ok: true, row: localRow };
      }
      const optId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      optimisticIdRef.current = optId;
      const optimistic: RoomChatMessageRow = {
        id: optId,
        room_id: roomId,
        user_id: userId,
        display_name: displayName.trim() || 'Игрок',
        body: t,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic].slice(-FETCH_LIMIT));
      setSending(true);
      setError(null);

      const { error: err, row } = await sendRoomChatMessage(roomId, userId, displayName, t);
      optimisticIdRef.current = null;
      setSending(false);
      if (err) {
        setError(err);
        setMessages((prev) => prev.filter((m) => m.id !== optId));
        return { ok: false };
      }
      if (row) {
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== optId);
          if (without.some((m) => m.id === row.id)) return without;
          return [...without, row].slice(-FETCH_LIMIT);
        });
        onOwnMessageSent?.(row);
        return { ok: true, row };
      }
      setMessages((prev) => prev.filter((m) => m.id !== optId));
      return { ok: true, row: null };
    },
    [roomId, userId, displayName, sending, offlineUiLab, onOwnMessageSent],
  );

  const onSend = useCallback(async () => {
    setEmojiPickerOpen(false);
    const t = text.trim();
    if (!t || sending) return;
    if (offlineUiLab) {
      const r = await sendTrimmedChatBody(t);
      if (r.ok) {
        setText('');
        resizeComposer();
      }
      return;
    }
    setText('');
    resizeComposer();
    const r = await sendTrimmedChatBody(t);
    if (!r.ok) setText(t);
  }, [text, sending, sendTrimmedChatBody, resizeComposer, offlineUiLab]);

  const flushPhantomReplySend = useCallback(async () => {
    const rawDraft = earPhantomReplyDraft.trim();
    if (!rawDraft || sending) return;
    const body =
      earPhantomReplyIncludeQuote && phantomReplyAnchor
        ? buildPhantomContextualReplyBody(rawDraft, phantomReplyAnchor, MAX_BODY)
        : rawDraft;
    if (!body.trim()) return;
    const res = await sendTrimmedChatBody(body);
    if (res.ok) {
      setEarPhantomReplyDraft('');
      setEarPhantomReplyIncludeQuote(false);
      setEarPhantomReplyOpen(false);
      setPhantomReplyAnchor(null);
      setSideEarPhantomDismissed(null);
      if (standardAfterShortVh && !mobileOpenRef.current) {
        setUnreadPhantom(formatOwnPhantomEchoAfterSend(rawDraft, displayName, res.row ?? null));
        setSideEarUnread(true);
      }
    }
  }, [
    earPhantomReplyDraft,
    earPhantomReplyIncludeQuote,
    sending,
    sendTrimmedChatBody,
    standardAfterShortVh,
    displayName,
    phantomReplyAnchor,
  ]);

  const onPhantomReplySendClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await flushPhantomReplySend();
    },
    [flushPhantomReplySend],
  );

  const onPhantomReplyKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.shiftKey) return;
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        e.stopPropagation();
        setEarPhantomReplyIncludeQuote((v) => !v);
        return;
      }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      if (sending || !earPhantomReplyDraft.trim()) return;
      void flushPhantomReplySend();
    },
    [sending, earPhantomReplyDraft, flushPhantomReplySend],
  );

  const copyBody = useCallback((body: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(body);
    }
  }, []);

  const clampSideEarY = useCallback((pct: number) => {
    if (typeof window === 'undefined') return pct;
    const ih = window.innerHeight;
    const rect = sideEarShellRef.current?.getBoundingClientRect();
    const h = rect && rect.height >= 8 ? rect.height : 96;
    return clampSideEarCenterPct(pct, ih, h / 2);
  }, []);

  useEffect(() => {
    if (!standardAfterShortVh || typeof window === 'undefined') return;
    const onResize = () => {
      setSideEarCenterPct((p) => clampSideEarY(p));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [standardAfterShortVh, clampSideEarY]);

  useEffect(() => {
    return () => {
      const h = sideEarDragWindowHandlersRef.current;
      if (!h || typeof window === 'undefined') return;
      window.removeEventListener('pointermove', h.move, SIDE_EAR_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', h.up);
      window.removeEventListener('pointercancel', h.up);
      if (h.raw) {
        window.removeEventListener('pointerrawupdate', h.raw, SIDE_EAR_POINTER_RAW_OPTS);
      }
      sideEarDragWindowHandlersRef.current = null;
      const d = sideEarDragRef.current;
      d.active = false;
      d.lastDragOffsetPx = 0;
      if (d.dragVisualRafId !== 0 && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(d.dragVisualRafId);
        d.dragVisualRafId = 0;
      }
      const shellEl = sideEarShellRef.current;
      const shiftEl = sideEarDragShiftRef.current;
      if (shiftEl) {
        shiftEl.style.removeProperty('--side-ear-drag-y');
        shiftEl.style.removeProperty('will-change');
      }
      if (shellEl) {
        shellEl.style.removeProperty('height');
        shellEl.style.removeProperty('box-sizing');
      }
    };
  }, []);

  const onSideEarPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!standardAfterShortVh) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (typeof window !== 'undefined') {
        const prev = sideEarDragWindowHandlersRef.current;
        if (prev) {
          window.removeEventListener('pointermove', prev.move, SIDE_EAR_POINTER_MOVE_OPTS);
          window.removeEventListener('pointerup', prev.up);
          window.removeEventListener('pointercancel', prev.up);
          if (prev.raw) {
            window.removeEventListener('pointerrawupdate', prev.raw, SIDE_EAR_POINTER_RAW_OPTS);
          }
          sideEarDragWindowHandlersRef.current = null;
        }
      }
      const shell = sideEarShellRef.current ?? e.currentTarget;
      const shellRect = shell.getBoundingClientRect();
      const earHalfClampPx =
        shellRect.height >= 8 ? shellRect.height / 2 : SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX;
      shell.style.removeProperty('height');
      shell.style.removeProperty('box-sizing');
      sideEarDragShiftRef.current?.style.removeProperty('--side-ear-drag-y');
      sideEarDragShiftRef.current?.style.removeProperty('will-change');
      const prevDrag = sideEarDragRef.current;
      if (prevDrag.dragVisualRafId !== 0 && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(prevDrag.dragVisualRafId);
      }
      sideEarDragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startClientY: e.clientY,
        startCenterPct: sideEarCenterPctRef.current,
        dragging: false,
        earHalfClampPx,
        lastDragOffsetPx: 0,
        dragVisualRafId: 0,
        dragWillChangeSet: false,
        dragLayoutLocked: false,
      };
      const usePointerRawUpdate = typeof window !== 'undefined' && sideEarPointerRawUpdateSupported();
      const flushDragVisual = () => {
        const st = sideEarDragRef.current;
        st.dragVisualRafId = 0;
        if (!st.active || !st.dragging) return;
        const elFlush = sideEarDragShiftRef.current;
        if (!elFlush) return;
        let y = st.lastDragOffsetPx;
        if (typeof window !== 'undefined') {
          const dpr = window.devicePixelRatio;
          if (typeof dpr === 'number' && dpr > 0 && Number.isFinite(dpr)) {
            y = Math.round(y * dpr) / dpr;
          }
        }
        elFlush.style.setProperty('--side-ear-drag-y', `${y}px`);
      };
      const scheduleDragVisual = () => {
        const st = sideEarDragRef.current;
        const elSch = sideEarDragShiftRef.current;
        if (elSch && st.dragging && !st.dragWillChangeSet) {
          elSch.style.willChange = 'transform';
          st.dragWillChangeSet = true;
        }
        if (st.dragVisualRafId !== 0) return;
        st.dragVisualRafId = requestAnimationFrame(flushDragVisual);
      };
      const applySideEarDragFromPointer = (ev: PointerEvent, useCoalescedThreshold: boolean) => {
        const s = sideEarDragRef.current;
        if (!s.active || ev.pointerId !== s.pointerId) return;
        if (useCoalescedThreshold) {
          const samples = sideEarDragThresholdSamples(ev);
          for (const cev of samples) {
            const dy0 = cev.clientY - s.startClientY;
            if (!s.dragging && Math.abs(dy0) >= SIDE_EAR_DRAG_THRESHOLD_PX) {
              s.dragging = true;
            }
          }
        } else {
          const dy0 = ev.clientY - s.startClientY;
          if (!s.dragging && Math.abs(dy0) >= SIDE_EAR_DRAG_THRESHOLD_PX) {
            s.dragging = true;
          }
        }
        if (!s.dragging) return;
        if (!s.dragLayoutLocked) {
          const shellLock = sideEarShellRef.current;
          if (shellLock) {
            const h = Math.max(8, Math.ceil(shellLock.getBoundingClientRect().height));
            shellLock.style.height = `${h}px`;
            shellLock.style.boxSizing = 'border-box';
            s.dragLayoutLocked = true;
          }
        }
        const dy = ev.clientY - s.startClientY;
        ev.preventDefault();
        const ih = window.innerHeight;
        const startPx = (s.startCenterPct / 100) * ih;
        const nextPct = ((startPx + dy) / ih) * 100;
        const clamped = clampSideEarCenterPct(nextPct, ih, s.earHalfClampPx);
        const clampedCenterPx = (clamped / 100) * ih;
        s.lastDragOffsetPx = clampedCenterPx - startPx;
        scheduleDragVisual();
      };
      const onMove = (ev: PointerEvent) => {
        applySideEarDragFromPointer(ev, true);
      };
      const onRaw = (ev: Event) => {
        applySideEarDragFromPointer(ev as PointerEvent, false);
      };
      const onUp = (ev: PointerEvent) => {
        const s = sideEarDragRef.current;
        if (!s.active || ev.pointerId !== s.pointerId) return;
        const wasDragging = s.dragging;
        if (s.dragVisualRafId !== 0 && typeof cancelAnimationFrame !== 'undefined') {
          cancelAnimationFrame(s.dragVisualRafId);
          s.dragVisualRafId = 0;
        }
        s.active = false;
        s.dragging = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
          if (usePointerRawUpdate) {
            window.removeEventListener('pointerrawupdate', onRaw, SIDE_EAR_POINTER_RAW_OPTS);
          }
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          sideEarDragWindowHandlersRef.current = null;
        }
        try {
          shell.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
        const el = sideEarShellRef.current;
        const viz = sideEarDragShiftRef.current;
        /* Не трогаем el.style.top — его задаёт React; removeProperty('top') ломал fixed-позицию до следующего коммита (рельса/ушко «пропадали» после тапа). */
        if (viz) {
          viz.style.removeProperty('--side-ear-drag-y');
          viz.style.removeProperty('will-change');
        }
        if (el && s.dragLayoutLocked) {
          el.style.removeProperty('height');
          el.style.removeProperty('box-sizing');
        }
        if (wasDragging) {
          sideEarSuppressClickRef.current = true;
          const ih = window.innerHeight;
          const startPx = (s.startCenterPct / 100) * ih;
          const seed = ((startPx + s.lastDragOffsetPx) / ih) * 100;
          setSideEarCenterPct(() => {
            const clamped = clampSideEarY(seed);
            sideEarCenterPctRef.current = clamped;
            try {
              localStorage.setItem(LS_MOBILE_SIDE_EAR_CENTER_PCT, String(clamped));
            } catch {
              /* ignore */
            }
            return clamped;
          });
        }
      };
      sideEarDragWindowHandlersRef.current = {
        move: onMove,
        up: onUp,
        ...(usePointerRawUpdate ? { raw: onRaw } : {}),
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
        if (usePointerRawUpdate) {
          window.addEventListener('pointerrawupdate', onRaw, SIDE_EAR_POINTER_RAW_OPTS);
        }
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }
      try {
        shell.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [standardAfterShortVh, clampSideEarY],
  );

  const onSideEarMainClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (sideEarSuppressClickRef.current) {
        e.preventDefault();
        sideEarSuppressClickRef.current = false;
        return;
      }
      setMobileOpen(true);
    },
    [],
  );

  const onSideEarRailClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (sideEarSuppressClickRef.current) {
      e.preventDefault();
      sideEarSuppressClickRef.current = false;
      return;
    }
    e.stopPropagation();
    setSideEarPhantomDismissed(null);
    setEarUnreadPhantomPeek(false);
    setSideEarRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const persistHideUnreadEarPhantomPreview = useCallback((next: boolean) => {
    setHideUnreadEarPhantomPreview(next);
    if (!next) setSideEarPhantomDismissed(null);
    if (next) setEarUnreadPhantomPeek(false);
    try {
      localStorage.setItem(LS_MOBILE_SIDE_EAR_HIDE_UNREAD_PREVIEW, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!earPreviewSettingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEarPreviewSettingsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [earPreviewSettingsOpen]);

  useEffect(() => {
    if (!earPreviewSettingsOpen) return;
    const t = window.setTimeout(() => {
      earPreviewSheetRef.current
        ?.querySelector<HTMLInputElement>('input.table-chat-ear-preview-switch__input')
        ?.focus();
    }, 50);
    return () => clearTimeout(t);
  }, [earPreviewSettingsOpen]);

  useEffect(() => {
    if (mobileOpen) setEarPreviewSettingsOpen(false);
  }, [mobileOpen]);

  useEffect(() => {
    if (mobileOpen) {
      setSideEarPhantomDismissed(null);
      setEarUnreadPhantomPeek(false);
    }
  }, [mobileOpen]);

  const { earTypingLine, earUnread, earUnreadPhantomEffective } = useMemo(() => {
    if (!offlineUiLab || offlineUiLabEarMock.scenario === 'none') {
      return {
        earTypingLine: typingPhantomLine,
        earUnread: sideEarUnread,
        earUnreadPhantomEffective: unreadPhantom,
      };
    }
    if (offlineUiLabEarMock.scenario === 'typing') {
      return {
        earTypingLine: offlineUiLabEarMock.line ?? 'Алиса печатает…',
        earUnread: false,
        earUnreadPhantomEffective: unreadPhantom,
      };
    }
    return {
      earTypingLine: null,
      earUnread: true,
      /* После ответа из фантома в лабе пишем в unreadPhantom — показываем его, а не застывший мок. */
      earUnreadPhantomEffective:
        unreadPhantom ??
        parseUnreadPhantomDemoLine(offlineUiLabEarMock.preview ?? 'Новое сообщение'),
    };
  }, [offlineUiLab, offlineUiLabEarMock, typingPhantomLine, sideEarUnread, unreadPhantom]);

  useEffect(() => {
    if (!earUnread) setEarUnreadPhantomPeek(false);
  }, [earUnread]);

  /** В режиме «только полоска» рельсы не показываем фантом/подсветку «печатает». */
  const earTypingShown =
    standardAfterShortVh && sideEarRailCollapsed ? null : earTypingLine;

  /** Фантом «печатает» скрывается той же опцией, что и текст превью непрочитанного. */
  const earTypingPhantomLine = hideUnreadEarPhantomPreview ? null : earTypingShown;

  /**
   * Фактическое «текущее» непрочитанное у ушка (в т.ч. лаб-мок до первого inject).
   * Стек «Свежее / Раньше» вешать на это, а не только на `unreadPhantom` — иначе ref не видит первый кадр и кнопки никогда не появляются.
   */
  const phantomStackHead = useMemo(() => {
    if (!earUnread || earTypingShown) return null;
    if (hideUnreadEarPhantomPreview && !earUnreadPhantomPeek) return null;
    return earUnreadPhantomEffective ?? null;
  }, [earUnread, earTypingShown, hideUnreadEarPhantomPreview, earUnreadPhantomPeek, earUnreadPhantomEffective]);

  useLayoutEffect(() => {
    const next = phantomStackHead;
    const prevSnap = lastUnreadPhantomSnapRef.current;

    if (!next) {
      setPhantomUnreadUnderlay(null);
      setPhantomUnreadUiLayer('fresh');
      lastUnreadPhantomSnapRef.current = null;
      return;
    }

    if (prevSnap) {
      const kPrev = phantomUnreadStableKeyFromPhantom(prevSnap);
      const kNext = phantomUnreadStableKeyFromPhantom(next);
      if (kPrev !== '' && kNext !== '' && kPrev !== kNext) {
        setPhantomUnreadUnderlay({ ...prevSnap });
        setPhantomUnreadUiLayer('fresh');
      }
    }

    lastUnreadPhantomSnapRef.current = { ...next };
  }, [phantomStackHead]);

  /** Тап по индикатору: временный показ превью без смены настройки в модалке (peek). */
  const onUnreadRailIndicatorPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  }, []);

  const onUnreadRailIndicatorClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!earUnread || earTypingShown) return;
      setSideEarPhantomDismissed(null);
      if (hideUnreadEarPhantomPreview) setEarUnreadPhantomPeek(true);
    },
    [earUnread, earTypingShown, hideUnreadEarPhantomPreview],
  );

  const sideEarAriaLabel = useMemo(() => {
    let base =
      'Открыть чат стола. Потяните вверх или вниз, чтобы сместить кнопку по краю экрана.';
    if (earTypingShown) base += ` ${earTypingShown}`;
    else if (earUnread) base += ' Есть непрочитанные сообщения.';
    return base;
  }, [earTypingShown, earUnread]);

  const sideEarPhantomUnread =
    earUnread && !earTypingShown && (!hideUnreadEarPhantomPreview || earUnreadPhantomPeek)
      ? (earUnreadPhantomEffective ?? {
          author: '',
          body: 'Новое сообщение',
          messageId: '',
        })
      : null;

  const phantomLinesPayload = useMemo(() => {
    if (!sideEarPhantomUnread) return null;
    if (phantomUnreadUnderlay && phantomUnreadUiLayer === 'previous') {
      return phantomUnreadUnderlay;
    }
    return sideEarPhantomUnread;
  }, [sideEarPhantomUnread, phantomUnreadUnderlay, phantomUnreadUiLayer]);

  /** Ключ текста в блоке строк (свежий или «предыдущий» слой). */
  const phantomLinesStableKey = useMemo(() => {
    if (!phantomLinesPayload) return '';
    return (
      phantomLinesPayload.messageId ||
      `${phantomLinesPayload.author}\0${phantomLinesPayload.body}\0${phantomUnreadUiLayer}`
    );
  }, [phantomLinesPayload, phantomUnreadUiLayer]);

  /** Ключ превью: id сообщения (или демо), чтобы крестик не «залипал» на одинаковом тексте превью. */
  const unreadPhantomStableKey = useMemo(() => {
    if (!sideEarPhantomUnread) return '';
    return (
      sideEarPhantomUnread.messageId ||
      `${sideEarPhantomUnread.author}\0${sideEarPhantomUnread.body}`
    );
  }, [sideEarPhantomUnread]);

  useEffect(() => {
    if (!earPhantomUnreadExpanded || !phantomLinesPayload) return;
    const el = phantomUnreadLinesRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    });
    return () => cancelAnimationFrame(id);
  }, [phantomLinesStableKey, earPhantomUnreadExpanded, phantomLinesPayload]);

  const phantomReplyAnchorKey = useMemo(
    () => phantomUnreadStableKeyFromPhantom(phantomReplyAnchor),
    [phantomReplyAnchor],
  );

  const phantomAnchorAtOpenStableKey = phantomReplyAnchorAtOpenRef.current
    ? phantomUnreadStableKeyFromPhantom(phantomReplyAnchorAtOpenRef.current)
    : '';
  /** Показать выбор якоря цитаты: превью ушка ушло вперёд или якорь вручную переключили с «как при открытии». */
  const showPhantomAnchorChoices =
    earPhantomReplyOpen &&
    phantomAnchorAtOpenStableKey !== '' &&
    (unreadPhantomStableKey !== phantomAnchorAtOpenStableKey ||
      (Boolean(phantomReplyAnchorKey) && phantomReplyAnchorKey !== phantomAnchorAtOpenStableKey));

  /** Имя автора в текущем превью ушка (для кнопки «свежее → цитата»). */
  const phantomDriftFreshAuthorShort = useMemo(() => {
    const a = (sideEarPhantomUnread?.author ?? '').trim();
    if (!a) return 'Собеседника';
    return a.length > 22 ? `${a.slice(0, 22)}…` : a;
  }, [sideEarPhantomUnread]);

  /** Одна строка для кнопки «с цитатой»: кто и короткий фрагмент. */
  const phantomReplyAnchorMicro = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    const a = (phantomReplyAnchor.author || '').trim().slice(0, 14) || '…';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    if (!raw) return a;
    const sn = raw.length > 20 ? `${raw.slice(0, 20)}…` : raw;
    return `${a}: «${sn}»`;
  }, [phantomReplyAnchor]);

  const phantomAtOpenAuthorShort = useMemo(() => {
    const snap = phantomReplyAnchorAtOpenRef.current;
    if (!snap) return 'Собеседника';
    const a = (snap.author ?? '').trim();
    if (!a) return 'Собеседника';
    return a.length > 22 ? `${a.slice(0, 22)}…` : a;
  }, [phantomAnchorAtOpenStableKey, earPhantomReplyOpen]);

  const phantomAnchorUsingFreshPreview =
    Boolean(unreadPhantomStableKey) && phantomReplyAnchorKey === unreadPhantomStableKey;

  const phantomQuotePanelAuthor = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    return (phantomReplyAnchor.author || '').trim() || 'Собеседник';
  }, [phantomReplyAnchor]);

  /** Текст цитаты для панели (без имени). */
  const phantomQuotePanelSnippet = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    if (!raw) return '…';
    const max = 220;
    return raw.length > max ? `${raw.slice(0, max)}…` : raw;
  }, [phantomReplyAnchor]);

  const phantomReplyAnchorTitle = useMemo(() => {
    if (!phantomReplyAnchor) {
      return '«Добавить цитирование» / «Отменить цитирование»: панель цитаты и поле ответа. Enter или «Отправить». Ctrl+Enter — вкл/выкл.';
    }
    const a = phantomReplyAnchor.author.trim() || 'Собеседник';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    const cite = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
    return `${a}: «${cite}» — так уйдёт в чат вместе с вашим текстом. Enter / «Отправить». Ctrl+Enter — вкл/выкл.`;
  }, [phantomReplyAnchor]);

  useEffect(() => {
    const was = prevEarPhantomReplyOpenRef.current;
    const now = earPhantomReplyOpen;
    if (now && !was && sideEarPhantomUnread) {
      const snap: SideEarUnreadPhantom = {
        author: sideEarPhantomUnread.author,
        body: sideEarPhantomUnread.body,
        messageId: sideEarPhantomUnread.messageId,
      };
      setPhantomReplyAnchor(snap);
      phantomReplyAnchorAtOpenRef.current = { ...snap };
      setEarPhantomReplyIncludeQuote(false);
    }
    if (!now && was) {
      setPhantomReplyAnchor(null);
      phantomReplyAnchorAtOpenRef.current = null;
      setEarPhantomReplyIncludeQuote(false);
    }
    prevEarPhantomReplyOpenRef.current = now;
  }, [earPhantomReplyOpen, sideEarPhantomUnread]);

  useEffect(() => {
    if (earPhantomReplyOpen) return;
    setEarPhantomReplyOpen(false);
    setEarPhantomReplyDraft('');
  }, [unreadPhantomStableKey, earPhantomReplyOpen]);

  /**
   * Свернуть «весь текст», только когда превью непрочитанного реально убрано.
   * Пока показывается «печатает», `sideEarPhantomUnread` временно null — не сбрасывать раскрытие,
   * иначе после нового сообщения блок остаётся в line-clamp без скролла.
   */
  useEffect(() => {
    if (!sideEarPhantomUnread && !earTypingShown) {
      setEarPhantomUnreadExpanded(false);
    }
  }, [sideEarPhantomUnread, earTypingShown]);

  const sideEarPhantomCardVisible = useMemo(() => {
    const hasPhantom = Boolean(earTypingPhantomLine || sideEarPhantomUnread);
    if (!hasPhantom) return false;
    if (earTypingPhantomLine) {
      if (
        sideEarPhantomDismissed?.kind === 'typing' &&
        sideEarPhantomDismissed.line === earTypingPhantomLine
      ) {
        return false;
      }
      return true;
    }
    if (sideEarPhantomUnread) {
      if (
        sideEarPhantomDismissed?.kind === 'unread' &&
        sideEarPhantomDismissed.messageId === sideEarPhantomUnread.messageId
      ) {
        return false;
      }
      return true;
    }
    return false;
  }, [
    earTypingPhantomLine,
    sideEarPhantomUnread,
    sideEarPhantomDismissed,
  ]);

  const onPhantomDismissPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  }, []);

  const onPhantomDismissClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (earTypingPhantomLine) {
        setSideEarPhantomDismissed({ kind: 'typing', line: earTypingPhantomLine });
        return;
      }
      if (sideEarPhantomUnread) {
        setSideEarPhantomDismissed({
          kind: 'unread',
          messageId: sideEarPhantomUnread.messageId,
        });
        setEarUnreadPhantomPeek(false);
        setPhantomUnreadUnderlay(null);
        setPhantomUnreadUiLayer('fresh');
      }
    },
    [earTypingPhantomLine, sideEarPhantomUnread],
  );

  const onPhantomExpandClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setEarPhantomUnreadExpanded((v) => !v);
  }, []);

  const onPhantomReplyToggleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setEarPhantomReplyOpen((v) => !v);
  }, []);

  const onPhantomAnchorFlipClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!sideEarPhantomUnread) return;
      if (phantomReplyAnchorKey === unreadPhantomStableKey) {
        const snap = phantomReplyAnchorAtOpenRef.current;
        if (!snap) return;
        setPhantomReplyAnchor({ ...snap });
      } else {
        setPhantomReplyAnchor({
          author: sideEarPhantomUnread.author,
          body: sideEarPhantomUnread.body,
          messageId: sideEarPhantomUnread.messageId,
        });
      }
    },
    [sideEarPhantomUnread, phantomReplyAnchorKey, unreadPhantomStableKey],
  );

  const earPreviewSettingsPortal =
    earPreviewSettingsOpen && typeof document !== 'undefined'
      ? createPortal(
          <>
            <button
              type="button"
              className="table-chat-ear-preview-toast-backdrop"
              aria-label="Закрыть"
              onClick={() => setEarPreviewSettingsOpen(false)}
            />
            <div
              ref={earPreviewSheetRef}
              className="table-chat-ear-preview-toast"
              role="dialog"
              aria-modal="true"
              aria-labelledby={earPreviewDialogTitleId}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id={earPreviewDialogTitleId} className="table-chat-ear-preview-toast__title">
                Фантомы из чата
              </h2>
              <label className="table-chat-ear-preview-switch">
                <input
                  type="checkbox"
                  className="table-chat-ear-preview-switch__input"
                  checked={hideUnreadEarPhantomPreview}
                  onChange={(e) => persistHideUnreadEarPhantomPreview(e.target.checked)}
                />
                <span className="table-chat-ear-preview-switch__visual" aria-hidden>
                  <span className="table-chat-ear-preview-switch__track" />
                  <span className="table-chat-ear-preview-switch__knob" />
                </span>
                <span className="table-chat-ear-preview-switch__label">Не показывать фантомы из чата</span>
              </label>
              <button
                type="button"
                className="table-chat-ear-preview-toast__done"
                onClick={() => setEarPreviewSettingsOpen(false)}
              >
                Готово
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  if (variant === 'mobile' && !mobileOpen) {
    return (
      <>
        <div
          className={[
            'table-chat-dock',
            'table-chat-dock--pro',
            'table-chat-dock--mobile',
            'table-chat-dock--collapsed',
            standardAfterShortVh ? 'table-chat-dock--standard-after-short-vh' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {standardAfterShortVh ? (
            <>
              <p className="table-chat-collapsed-strip-hint">
                <span className="table-chat-collapsed-strip-hint-text">Чат стола можно открыть ниже</span>{' '}
                <span className="table-chat-collapsed-strip-hint-arrow-inline" aria-hidden>
                  ↓
                </span>
              </p>
              <button
                type="button"
                className="table-chat-toggle table-chat-toggle--compact"
                onClick={() => setMobileOpen(true)}
              >
                Открыть чат
              </button>
            </>
          ) : (
            <button type="button" className="table-chat-toggle" onClick={() => setMobileOpen(true)}>
              Чат
            </button>
          )}
        </div>
        {standardAfterShortVh ? (
          <div
            ref={sideEarShellRef}
            className={[
              'table-chat-side-ear-shell',
              sideEarRailCollapsed ? 'table-chat-side-ear-shell--rail-collapsed' : '',
              earTypingShown ? 'table-chat-side-ear-shell--activity-typing' : '',
              earUnread && !earTypingShown ? 'table-chat-side-ear-shell--activity-unread' : '',
              hideUnreadEarPhantomPreview &&
              earUnread &&
              !earTypingShown &&
              !earUnreadPhantomPeek
                ? 'table-chat-side-ear-shell--preview-suppressed'
                : '',
              earPhantomUnreadExpanded && sideEarPhantomUnread
                ? 'table-chat-side-ear-shell--phantom-unread-expanded'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={{ top: `${sideEarCenterPct}%` }}
            onPointerDown={onSideEarPointerDown}
          >
            <div ref={sideEarDragShiftRef} className="table-chat-side-ear-shell__drag-shift">
            <div
              className={[
                'table-chat-side-ear-cluster',
                sideEarRailCollapsed ? 'table-chat-side-ear-cluster--rail-collapsed' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="table-chat-side-ear-rail-wrap">
                {earUnread && !earTypingShown ? (
                  <button
                    type="button"
                    className="table-chat-side-ear-rail__unread-hit table-chat-side-ear-rail__unread-hit--on-rail"
                    aria-label={
                      hideUnreadEarPhantomPreview
                        ? 'Показать превью непрочитанного сообщения'
                        : 'Индикатор непрочитанного сообщения'
                    }
                    onPointerDown={onUnreadRailIndicatorPointerDown}
                    onClick={onUnreadRailIndicatorClick}
                  >
                    <span className="table-chat-side-ear-rail__unread-dot" aria-hidden />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="table-chat-side-ear-rail"
                  onClick={onSideEarRailClick}
                  aria-label={
                    sideEarRailCollapsed
                      ? 'Показать кнопку «Чат» — сейчас у края только рельса'
                      : 'Свернуть кнопку «Чат» вправо — у края останется рельса'
                  }
                  aria-pressed={sideEarRailCollapsed}
                >
                  <svg
                    className="table-chat-side-ear-rail__chevron-grad-defs"
                    xmlns="http://www.w3.org/2000/svg"
                    width={0}
                    height={0}
                    aria-hidden
                    focusable="false"
                  >
                    <defs>
                      <linearGradient
                        id={sideRailChevronGradId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                        gradientUnits="objectBoundingBox"
                      >
                        <stop offset="0%" stopColor="#faf5ff" />
                        <stop offset="14%" stopColor="#e9d5ff" />
                        <stop offset="28%" stopColor="#c4b5fd" />
                        <stop offset="42%" stopColor="#a78bfa" />
                        <stop offset="56%" stopColor="#818cf8" />
                        <stop offset="72%" stopColor="#38bdf8" />
                        <stop offset="86%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#5eead4" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="table-chat-side-ear-rail__twin-stripes" aria-hidden>
                    <span className="table-chat-side-ear-rail__twin-stripe table-chat-side-ear-rail__twin-stripe--left" />
                    <span className="table-chat-side-ear-rail__twin-stripe table-chat-side-ear-rail__twin-stripe--right" />
                  </span>
                  {sideEarRailCollapsed ? (
                    <>
                      <span
                        className="table-chat-side-ear-rail__chevron table-chat-side-ear-rail__chevron--up"
                        aria-hidden
                      >
                        <svg
                          className="table-chat-side-ear-rail__chevron-svg"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 20"
                          focusable="false"
                          aria-hidden
                        >
                          <path
                            fill={`url(#${sideRailChevronGradId})`}
                            d="M12 2L22 18H2L12 2z"
                          />
                        </svg>
                      </span>
                      <span
                        className="table-chat-side-ear-rail__chevron table-chat-side-ear-rail__chevron--down"
                        aria-hidden
                      >
                        <svg
                          className="table-chat-side-ear-rail__chevron-svg"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 20"
                          focusable="false"
                          aria-hidden
                        >
                          <path
                            fill={`url(#${sideRailChevronGradId})`}
                            d="M12 18L2 2h20L12 18z"
                          />
                        </svg>
                      </span>
                    </>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={[
                    'table-chat-side-ear-preview-settings',
                    'table-chat-side-ear-preview-settings--ear-vertical',
                    'table-chat-side-ear-rail__preview-on-rail',
                    hideUnreadEarPhantomPreview ? 'table-chat-side-ear-preview-settings--off' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label="Настройки превью у ушка, открыть окно"
                  aria-haspopup="dialog"
                  aria-expanded={earPreviewSettingsOpen}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEarPreviewSettingsOpen((o) => !o);
                  }}
                >
                  <span className="table-chat-side-ear-preview-settings__disc" aria-hidden>
                    <svg
                      className="table-chat-side-ear-preview-settings__glyph"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width={5}
                      height={5}
                      focusable="false"
                    >
                      {/* «Бегунки» — не спутать с круглым индикатором нового сообщения */}
                      <path
                        fill="currentColor"
                        d="M3 17v2h6v-2H3zm0-6v2h10v-2H3zm0-6v2h14V5H3zm14 16v-2h4v2h-4zm0-10v2h8v-2h-8zm0-6v2h6V5h-6z"
                      />
                    </svg>
                  </span>
                </button>
              </div>
              <div className="table-chat-side-ear-bundle">
                <button
                  type="button"
                  className="table-chat-side-ear"
                  onClick={onSideEarMainClick}
                  aria-label={sideEarAriaLabel}
                  aria-hidden={sideEarRailCollapsed}
                  tabIndex={sideEarRailCollapsed ? -1 : undefined}
                >
                  <svg
                    className="table-chat-side-ear__chevron-grad-defs"
                    xmlns="http://www.w3.org/2000/svg"
                    width={0}
                    height={0}
                    aria-hidden
                    focusable="false"
                  >
                    <defs>
                      <linearGradient
                        id={sideEarChevronGradId}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="1"
                        gradientUnits="objectBoundingBox"
                      >
                        <stop offset="0%" stopColor="#faf5ff" />
                        <stop offset="14%" stopColor="#e9d5ff" />
                        <stop offset="28%" stopColor="#c4b5fd" />
                        <stop offset="42%" stopColor="#a78bfa" />
                        <stop offset="56%" stopColor="#818cf8" />
                        <stop offset="72%" stopColor="#38bdf8" />
                        <stop offset="86%" stopColor="#22d3ee" />
                        <stop offset="100%" stopColor="#5eead4" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="table-chat-side-ear__chevron table-chat-side-ear__chevron--up" aria-hidden>
                    <svg
                      className="table-chat-side-ear__chevron-svg"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 20"
                      focusable="false"
                      aria-hidden
                    >
                      <path
                        fill={`url(#${sideEarChevronGradId})`}
                        d="M12 2L22 18H2L12 2z"
                      />
                    </svg>
                  </span>
                  <span className="table-chat-side-ear__glyph" aria-hidden>
                    <svg
                      className="table-chat-side-ear__glyph-svg"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      width={20}
                      height={20}
                      focusable="false"
                    >
                      <defs>
                        <linearGradient
                          id={sideEarGlyphGradId}
                          x1="2"
                          y1="3"
                          x2="22"
                          y2="21"
                          gradientUnits="userSpaceOnUse"
                        >
                          <stop offset="0%" stopColor="#faf5ff" />
                          <stop offset="22%" stopColor="#e9d5ff" />
                          <stop offset="42%" stopColor="#a78bfa" />
                          <stop offset="62%" stopColor="#6366f1" />
                          <stop offset="82%" stopColor="#38bdf8" />
                          <stop offset="100%" stopColor="#22d3ee" />
                        </linearGradient>
                      </defs>
                      <path
                        fill={`url(#${sideEarGlyphGradId})`}
                        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"
                      />
                    </svg>
                  </span>
                  <span
                    className={[
                      'table-chat-side-ear__label',
                      earUnread && !earTypingShown ? 'table-chat-side-ear__label--unread' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    Чат
                  </span>
                  <span className="table-chat-side-ear__chevron table-chat-side-ear__chevron--down" aria-hidden>
                    <svg
                      className="table-chat-side-ear__chevron-svg"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 20"
                      focusable="false"
                      aria-hidden
                    >
                      <path
                        fill={`url(#${sideEarChevronGradId})`}
                        d="M12 18L2 2h20L12 18z"
                      />
                    </svg>
                  </span>
                </button>
              </div>
              <span className="table-chat-side-ear-rail__crystal" aria-hidden />
            </div>
            {sideEarPhantomCardVisible ? (
              <div
                className={[
                  'table-chat-side-ear-phantom',
                  earPhantomUnreadExpanded && sideEarPhantomUnread
                    ? 'table-chat-side-ear-phantom--unread-expanded'
                    : '',
                  earPhantomReplyOpen && sideEarPhantomUnread ? 'table-chat-side-ear-phantom--reply-open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                data-table-chat-phantom=""
                aria-live="polite"
              >
                <svg
                  className="table-chat-side-ear-phantom__grad-defs"
                  xmlns="http://www.w3.org/2000/svg"
                  width={0}
                  height={0}
                  aria-hidden
                  focusable="false"
                >
                  <defs>
                    <linearGradient
                      id={phantomToolbarGradId}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                      gradientUnits="objectBoundingBox"
                    >
                      <stop offset="0%" stopColor="#22d3ee" />
                      <stop offset="35%" stopColor="#67e8f9" />
                      <stop offset="52%" stopColor="#818cf8" />
                      <stop offset="78%" stopColor="#c084fc" />
                      <stop offset="100%" stopColor="#fb7185" />
                    </linearGradient>
                    <linearGradient
                      id={phantomToolbarGradDeepId}
                      x1="1"
                      y1="0"
                      x2="0"
                      y2="1"
                      gradientUnits="objectBoundingBox"
                    >
                      <stop offset="0%" stopColor="#a5f3fc" />
                      <stop offset="45%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#f472b6" />
                    </linearGradient>
                  </defs>
                </svg>
                <button
                  type="button"
                  className="table-chat-side-ear-phantom__dismiss"
                  aria-label="Скрыть превью"
                  title="Скрыть"
                  onPointerDown={onPhantomDismissPointerDown}
                  onClick={onPhantomDismissClick}
                >
                  <svg
                    className="table-chat-side-ear-phantom__dismiss-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width={12}
                    height={12}
                    aria-hidden
                    focusable="false"
                  >
                    <path
                      fill="none"
                      stroke={phantomToolbarStrokeUrl}
                      strokeWidth={2.65}
                      strokeLinecap="round"
                      d="M7 7l10 10M17 7L7 17"
                    />
                  </svg>
                </button>
                {earTypingPhantomLine ? (
                  <span className="table-chat-side-ear-phantom__typing">{earTypingPhantomLine}</span>
                ) : sideEarPhantomUnread && phantomLinesPayload ? (
                  <>
                    <div
                      className={[
                        'table-chat-side-ear-phantom__lines-stack-wrap',
                        phantomUnreadUnderlay && phantomUnreadUiLayer === 'fresh'
                          ? 'table-chat-side-ear-phantom__lines-stack-wrap--fresh-on-top'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {phantomUnreadUnderlay ? (
                        <div
                          className="table-chat-side-ear-phantom__preview-stack"
                          role="tablist"
                          aria-label="Версия превью: свежее или предыдущее сообщение"
                        >
                          <button
                            type="button"
                            role="tab"
                            aria-selected={phantomUnreadUiLayer === 'fresh'}
                            className={[
                              'table-chat-side-ear-phantom__preview-stack-btn',
                              phantomUnreadUiLayer === 'fresh'
                                ? 'table-chat-side-ear-phantom__preview-stack-btn--active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhantomUnreadUiLayer('fresh');
                            }}
                          >
                            Свежее
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={phantomUnreadUiLayer === 'previous'}
                            className={[
                              'table-chat-side-ear-phantom__preview-stack-btn',
                              phantomUnreadUiLayer === 'previous'
                                ? 'table-chat-side-ear-phantom__preview-stack-btn--active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={(e) => {
                              e.stopPropagation();
                              setPhantomUnreadUiLayer('previous');
                            }}
                          >
                            Раньше
                          </button>
                        </div>
                      ) : null}
                      <div ref={phantomUnreadLinesRef} className="table-chat-side-ear-phantom__lines">
                        {phantomLinesPayload.author ? (
                          <>
                            <span className="table-chat-side-ear-phantom__author">
                              {phantomLinesPayload.author}
                            </span>
                            <span className="table-chat-side-ear-phantom__sep" aria-hidden>
                              :{' '}
                            </span>
                          </>
                        ) : null}
                        <span className="table-chat-side-ear-phantom__body">
                          {phantomLinesPayload.body}
                        </span>
                      </div>
                    </div>
                    <div className="table-chat-side-ear-phantom__toolbar">
                      <button
                        type="button"
                        className="table-chat-side-ear-phantom__tool"
                        onPointerDown={onPhantomDismissPointerDown}
                        onClick={onPhantomExpandClick}
                        aria-expanded={earPhantomUnreadExpanded}
                        aria-label={earPhantomUnreadExpanded ? 'Свернуть текст' : 'Показать весь текст'}
                        title={earPhantomUnreadExpanded ? 'Свернуть' : 'Весь текст'}
                      >
                        {earPhantomUnreadExpanded ? (
                          <svg
                            className="table-chat-side-ear-phantom__tool-glyph"
                            viewBox="0 0 20 20"
                            width={13}
                            height={13}
                            aria-hidden
                          >
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              d="M3 5h11M3 9h14M3 13h9"
                            />
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 14l2-2 2 2"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="table-chat-side-ear-phantom__tool-glyph"
                            viewBox="0 0 20 20"
                            width={13}
                            height={13}
                            aria-hidden
                          >
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              d="M3 4.5h11M3 8.5h14M3 12.5h9"
                            />
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M15 11l2 2 2-2"
                            />
                          </svg>
                        )}
                      </button>
                      <button
                        type="button"
                        className="table-chat-side-ear-phantom__tool"
                        onPointerDown={onPhantomDismissPointerDown}
                        onClick={onPhantomReplyToggleClick}
                        aria-expanded={earPhantomReplyOpen}
                        aria-label={earPhantomReplyOpen ? 'Скрыть ответ' : 'Ответить'}
                        title={earPhantomReplyOpen ? 'Скрыть' : 'Ответ'}
                      >
                        {earPhantomReplyOpen ? (
                          <svg
                            className="table-chat-side-ear-phantom__tool-glyph"
                            viewBox="0 0 20 20"
                            width={13}
                            height={13}
                            aria-hidden
                          >
                            <path
                              fill={phantomToolbarFillUrl}
                              d="M10 5.2l4.2 5.2H5.8L10 5.2z"
                            />
                          </svg>
                        ) : (
                          <span
                            className="table-chat-side-ear-phantom__tool-char table-chat-side-ear-phantom__tool-char--grad"
                            aria-hidden
                          >
                            ↩
                          </span>
                        )}
                      </button>
                    </div>
                    {earPhantomReplyOpen ? (
                      <div
                        className="table-chat-side-ear-phantom__reply-box"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="table-chat-side-ear-phantom__reply-quote-strip">
                          <button
                            type="button"
                            className={[
                              'table-chat-side-ear-phantom__reply-quote-toggle',
                              earPhantomReplyIncludeQuote
                                ? 'table-chat-side-ear-phantom__reply-quote-toggle--on'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!phantomReplyAnchor) return;
                              setEarPhantomReplyIncludeQuote((v) => !v);
                            }}
                            aria-pressed={earPhantomReplyIncludeQuote}
                            disabled={!phantomReplyAnchor}
                            aria-label={
                              phantomReplyAnchor
                                ? earPhantomReplyIncludeQuote
                                  ? 'Отменить цитирование: убрать панель цитаты из ответа'
                                  : 'Добавить цитирование в ответ. Нажмите, чтобы включить'
                                : 'Нет привязки к превью'
                            }
                            title={
                              phantomReplyAnchor
                                ? phantomReplyAnchorTitle
                                : 'Нет привязки к превью'
                            }
                          >
                            <span className="table-chat-side-ear-phantom__reply-quote-toggle__row">
                              <span
                                className={[
                                  'table-chat-side-ear-phantom__reply-quote-toggle__mark',
                                  earPhantomReplyIncludeQuote
                                    ? 'table-chat-side-ear-phantom__reply-quote-toggle__mark--active'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                aria-hidden
                              >
                                {earPhantomReplyIncludeQuote ? '✓' : '+'}
                              </span>
                              <span className="table-chat-side-ear-phantom__reply-quote-toggle__main">
                                {earPhantomReplyIncludeQuote
                                  ? 'Отменить цитирование'
                                  : 'Добавить цитирование'}
                              </span>
                            </span>
                            {phantomReplyAnchor && phantomReplyAnchorMicro && !earPhantomReplyIncludeQuote ? (
                              <span
                                className="table-chat-side-ear-phantom__reply-quote-toggle__micro"
                                aria-hidden
                              >
                                {phantomReplyAnchorMicro}
                              </span>
                            ) : null}
                          </button>
                          {showPhantomAnchorChoices ? (
                            <div className="table-chat-side-ear-phantom__reply-anchor-wrap">
                              <button
                                type="button"
                                className={[
                                  'table-chat-side-ear-phantom__reply-anchor-flip-btn',
                                  phantomAnchorUsingFreshPreview
                                    ? 'table-chat-side-ear-phantom__reply-anchor-flip-btn--on'
                                    : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onPointerDown={onPhantomDismissPointerDown}
                                onClick={onPhantomAnchorFlipClick}
                                aria-pressed={phantomAnchorUsingFreshPreview}
                                aria-label={
                                  phantomAnchorUsingFreshPreview
                                    ? `Цитировать раннее сообщение от ${phantomAtOpenAuthorShort}`
                                    : `Цитировать свежее от ${phantomDriftFreshAuthorShort}`
                                }
                                title={
                                  phantomAnchorUsingFreshPreview
                                    ? 'Вернуть цитату к сообщению из ушка на момент открытия ответа'
                                    : 'Взять для цитаты текущее превью ушка (новее)'
                                }
                              >
                                {phantomAnchorUsingFreshPreview ? (
                                  <span className="table-chat-side-ear-phantom__reply-anchor-flip-btn__text">
                                    Цитировать раннее сообщение{' '}
                                    <span className="table-chat-side-ear-phantom__reply-anchor-flip-btn__ot">
                                      ОТ
                                    </span>{' '}
                                    <span className="table-chat-side-ear-phantom__reply-anchor-flip-btn__name">
                                      {phantomAtOpenAuthorShort}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="table-chat-side-ear-phantom__reply-anchor-flip-btn__text">
                                    Цитировать свежее от{' '}
                                    <span className="table-chat-side-ear-phantom__reply-anchor-flip-btn__name">
                                      {phantomDriftFreshAuthorShort}
                                    </span>
                                  </span>
                                )}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        <div
                          className={[
                            'table-chat-side-ear-phantom__reply-input-wrap',
                            earPhantomReplyIncludeQuote && phantomReplyAnchor
                              ? 'table-chat-side-ear-phantom__reply-input-wrap--quoted'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {earPhantomReplyIncludeQuote && phantomReplyAnchor ? (
                            <div
                              className="table-chat-side-ear-phantom__reply-quote-card"
                              aria-label={`Цитата: ${phantomQuotePanelAuthor}`}
                            >
                              <div
                                className="table-chat-side-ear-phantom__reply-quote-card__accent"
                                aria-hidden
                              />
                              <div className="table-chat-side-ear-phantom__reply-quote-card__body">
                                <div className="table-chat-side-ear-phantom__reply-quote-card__kicker">
                                  Ответ для
                                </div>
                                <div className="table-chat-side-ear-phantom__reply-quote-card__author">
                                  {phantomQuotePanelAuthor}
                                </div>
                                <blockquote className="table-chat-side-ear-phantom__reply-quote-card__excerpt">
                                  {phantomQuotePanelSnippet}
                                </blockquote>
                              </div>
                            </div>
                          ) : null}
                          <textarea
                            className="table-chat-side-ear-phantom__reply-input"
                            value={earPhantomReplyDraft}
                            onChange={(e) => setEarPhantomReplyDraft(e.target.value.slice(0, MAX_BODY))}
                            onKeyDown={onPhantomReplyKeyDown}
                            onPointerDown={(e) => e.stopPropagation()}
                            placeholder={
                              earPhantomReplyIncludeQuote && phantomReplyAnchor
                                ? 'Ваш ответ…'
                                : 'Ответ…'
                            }
                            rows={3}
                            maxLength={MAX_BODY}
                            aria-label={
                              earPhantomReplyIncludeQuote && phantomReplyAnchor
                                ? 'Текст вашего ответа (цитата показана панелью выше). Enter — отправить; Shift+Enter — новая строка; Ctrl+Enter — выключить цитирование.'
                                : 'Текст ответа. Enter — отправить; Shift+Enter — новая строка; Ctrl+Enter — включить или выключить цитирование.'
                            }
                            title={
                              earPhantomReplyIncludeQuote && phantomReplyAnchor
                                ? 'Панель выше — цитата · здесь только ваш текст · Enter — отправить · Ctrl+Enter — выкл. цитирование'
                                : 'Enter — отправить · Shift+Enter — новая строка · Ctrl+Enter — цитирование вкл/выкл'
                            }
                            spellCheck={false}
                            disabled={sending}
                          />
                          <button
                            type="button"
                            className="table-chat-side-ear-phantom__reply-send-float"
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={onPhantomReplySendClick}
                            disabled={sending || !earPhantomReplyDraft.trim()}
                            aria-label={sending ? 'Отправка…' : 'Отправить в чат'}
                            title={
                              sending
                                ? 'Отправка…'
                                : earPhantomReplyIncludeQuote
                                  ? phantomReplyAnchorTitle
                                  : 'Только ваш текст (включите «Добавить цитирование» для панели цитаты; при включении — «Отменить цитирование»)'
                            }
                          >
                            {sending ? (
                              <span
                                className="table-chat-side-ear-phantom__reply-send-float__dot"
                                aria-hidden
                              >
                                ···
                              </span>
                            ) : (
                              'Отправить'
                            )}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}
            </div>
          </div>
        ) : null}
        {earPreviewSettingsPortal}
      </>
    );
  }

  if (variant === 'pc' && pcCollapsed) {
    return (
      <div
        ref={dockRef}
        className={[
          'table-chat-dock',
          'table-chat-dock--pro',
          'table-chat-dock--pc',
          'table-chat-dock--pc-collapsed',
        ].join(' ')}
        style={pcBaseFloatStyle}
        data-pc-chat-drag-x={String(pcDrag.x)}
        data-pc-chat-drag-y={String(pcDrag.y)}
      >
        <div className="table-chat-dock-pc-collapsed-row" onPointerDown={startPcWindowDrag}>
          <span className="table-chat-dock-pc-collapsed-grip" aria-hidden>
            ⋮⋮
          </span>
          <button
            type="button"
            className="table-chat-dock-pc-expand-btn"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => {
              setPcCollapsed(false);
              try {
                localStorage.setItem(LS_PC_CHAT_COLLAPSED, '0');
              } catch {
                /* ignore */
              }
            }}
            aria-expanded="false"
            aria-label="Открыть чат стола"
          >
            <span aria-hidden>💬</span> Чат
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dockRef}
      className={[
        'table-chat-dock',
        'table-chat-dock--pro',
        variant === 'mobile' ? 'table-chat-dock--mobile' : 'table-chat-dock--pc',
      ].join(' ')}
      style={variant === 'pc' ? pcExpandedDockStyle : mobileDockStyle}
      {...(variant === 'pc'
        ? { 'data-pc-chat-drag-x': String(pcDrag.x), 'data-pc-chat-drag-y': String(pcDrag.y) }
        : {})}
    >
      {variant === 'mobile' && (
        <div className="table-chat-dock-header table-chat-dock-header--pro">
          <div className="table-chat-dock-header-left">
            <span className="table-chat-dock-title" aria-hidden>
              💬
            </span>
            <span className="table-chat-dock-title-text">Чат стола</span>
          </div>
          <button
            type="button"
            className="table-chat-dock-collapse"
            onClick={() => setMobileOpen(false)}
            aria-label="Свернуть чат"
          >
            Свернуть
          </button>
          <div className="table-chat-dock-mobile-quick-actions">
            <button
              ref={emojiQuickRef}
              type="button"
              className={[
                'table-chat-dock-mobile-quick-btn',
                emojiPickerOpen && emojiTab !== 'mine' ? 'table-chat-dock-mobile-quick-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onMobileQuickEmoji}
              aria-pressed={emojiPickerOpen && emojiTab !== 'mine'}
              aria-label="Эмодзи и фразы"
            >
              Эмодзи
            </button>
            <button
              ref={mineQuickRef}
              type="button"
              className={[
                'table-chat-dock-mobile-quick-btn',
                emojiPickerOpen && emojiTab === 'mine' ? 'table-chat-dock-mobile-quick-btn--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={onMobileQuickMine}
              aria-pressed={emojiPickerOpen && emojiTab === 'mine'}
              aria-label="Раздел Мои"
            >
              Мои
            </button>
          </div>
        </div>
      )}
      {variant === 'pc' && (
        <div
          className="table-chat-dock-header table-chat-dock-header--pro table-chat-dock-header--pc-only table-chat-dock-header--pc-drag"
          onPointerDown={startPcWindowDrag}
        >
          <span className="table-chat-dock-pc-drag-grip" aria-hidden>
            ⋮⋮
          </span>
          <span className="table-chat-dock-title-text">Чат</span>
          <button
            type="button"
            className="table-chat-dock-pc-collapse-btn"
            onPointerDown={(ev) => ev.stopPropagation()}
            onClick={() => {
              setPcCollapsed(true);
              try {
                localStorage.setItem(LS_PC_CHAT_COLLAPSED, '1');
              } catch {
                /* ignore */
              }
            }}
            aria-label="Свернуть чат"
            title="Свернуть"
          >
            −
          </button>
        </div>
      )}
      {variant === 'mobile' ? (
        <div className="table-chat-mobile-resize-wrap">
          <button
            type="button"
            className="table-chat-mobile-resize-handle"
            onPointerDown={startMobileResize}
            aria-label="Изменить высоту области сообщений"
            title="Потяните вверх или вниз"
          >
            <span aria-hidden>⋯</span>
          </button>
          {mobileResizeHintVisible ? (
            <div className="table-chat-mobile-resize-hint" role="status" aria-live="polite">
              Потяните для изменения высоты
            </div>
          ) : null}
        </div>
      ) : null}
      <div ref={listRef} className="table-chat-messages table-chat-messages--pro" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="table-chat-empty table-chat-empty--pro">
            <span className="table-chat-empty__lead">Пока тихо</span>
            <span className="table-chat-empty__hint">Напишите что-нибудь — сообщение увидят все за столом.</span>
          </div>
        ) : (
          displayMessages.map((m) => {
            const self = m.user_id === userId;
            const pending = m.id.startsWith('opt-');
            if (variant === 'mobile') {
              return (
                <div
                  key={m.id}
                  className={[
                    'table-chat-msg-compact',
                    self ? 'table-chat-msg-compact--self' : '',
                    pending ? 'table-chat-msg-compact--pending' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="table-chat-msg-compact__name">{self ? 'Вы' : (m.display_name || 'Игрок')}</span>
                  <span className="table-chat-msg-compact__sep">:</span>
                  <span className="table-chat-msg-compact__body">{m.body}</span>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={['table-chat-msg', self ? 'table-chat-msg--self' : 'table-chat-msg--peer', pending ? 'table-chat-msg--pending' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                {!self && (
                  <div className="table-chat-msg__avatar" aria-hidden title={m.display_name || 'Игрок'}>
                    {initialsFromName(m.display_name || 'Игрок')}
                  </div>
                )}
                <div className="table-chat-msg__bubble-wrap">
                  <div className="table-chat-msg__meta">
                    {!self && <span className="table-chat-msg__name">{m.display_name || 'Игрок'}</span>}
                    <time className="table-chat-msg__time" dateTime={m.created_at}>
                      {formatChatTime(m.created_at)}
                    </time>
                  </div>
                  <div className="table-chat-msg__bubble">
                    <p className="table-chat-msg__body">{m.body}</p>
                    {!pending && (
                      <button
                        type="button"
                        className="table-chat-msg__copy"
                        onClick={() => copyBody(m.body)}
                        aria-label="Скопировать текст"
                        title="Скопировать"
                      >
                        ⧉
                      </button>
                    )}
                  </div>
                </div>
                {self && (
                  <div className="table-chat-msg__avatar table-chat-msg__avatar--self" aria-hidden title="Вы">
                    {initialsFromName(displayName || 'Вы')}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {error && (
        <div className="table-chat-error table-chat-error--pro" role="alert">
          <span>{error}</span>
          <button type="button" className="table-chat-error__dismiss" onClick={() => setError(null)} aria-label="Закрыть">
            ×
          </button>
        </div>
      )}
      <div className="table-chat-composer table-chat-composer--pro">
        <div ref={composerInnerRef} className="table-chat-composer__inner">
          <div className="table-chat-composer__anchor">
            {emojiPickerOpen ? (
              <div
                ref={emojiPanelRef}
                id={emojiPanelDomId}
                className={[
                  'table-chat-emoji-panel',
                  'table-chat-emoji-panel--popover',
                  variant === 'mobile' ? 'table-chat-emoji-panel--mobile-sheet' : '',
                  emojiTab === 'mine' ? 'table-chat-emoji-panel--mine' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="dialog"
                aria-label={
                  emojiTab === 'phrases'
                    ? 'Готовые фразы'
                    : emojiTab === 'mine'
                      ? 'Мои быстрые вставки'
                      : 'Эмодзи для сообщения'
                }
                onPointerDown={(ev) => ev.stopPropagation()}
              >
                <div className="table-chat-emoji-panel__tabs" role="tablist">
                  {TABLE_CHAT_PICKER_TABS.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={emojiTab === tab.id}
                      aria-label={tab.label}
                      title={tab.label}
                      className={[
                        'table-chat-emoji-tab',
                        emojiTab === tab.id ? 'table-chat-emoji-tab--active' : '',
                        variant === 'pc' && tab.tabEmojiPc ? 'table-chat-emoji-tab--icon-pc' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => onEmojiTab(tab.id)}
                    >
                      {variant === 'pc' && tab.tabEmojiPc ? (
                        <span className="table-chat-emoji-tab__pc-ico" aria-hidden>
                          {tab.tabEmojiPc}
                        </span>
                      ) : (
                        tab.label
                      )}
                    </button>
                  ))}
                </div>
                {emojiTab === 'phrases' ? (
                  <div className="table-chat-phrase-scroll">
                    {CHAT_QUICK_PHRASES.map((phrase, idx) => (
                      <div key={`ph-${idx}`} className="table-chat-phrase-row">
                        <button
                          type="button"
                          className="table-chat-phrase-btn"
                          style={{
                            opacity: text.length + phrase.length > MAX_BODY ? 0.45 : 1,
                          }}
                          title={
                            text.length + phrase.length > MAX_BODY
                              ? 'В сообщение не влезет — удерживайте Shift или Alt и кликните по фразе, либо нажмите «+» справа, чтобы только в «Мои»'
                              : variant === 'pc'
                                ? 'Клик — вставить в сообщение. Shift/Alt + клик — только в «Мои»'
                                : undefined
                          }
                          onClick={(e) => {
                            if (variant === 'mobile' && consumeMobileLongPressFired()) {
                              e.preventDefault();
                              return;
                            }
                            if (e.shiftKey || e.altKey) {
                              e.preventDefault();
                              addMineSnippet(phrase);
                              return;
                            }
                            if (text.length + phrase.length > MAX_BODY) return;
                            insertSnippet(phrase);
                          }}
                          onPointerDown={() => {
                            if (variant === 'mobile') startMobileLongPressAddMine(phrase);
                          }}
                          onPointerUp={() => {
                            if (variant === 'mobile') clearMobileLongPress();
                          }}
                          onPointerCancel={() => {
                            if (variant === 'mobile') clearMobileLongPress();
                          }}
                          onPointerLeave={() => {
                            if (variant === 'mobile') clearMobileLongPress();
                          }}
                        >
                          {phrase}
                        </button>
                        <button
                          type="button"
                          className={[
                            'table-chat-add-mine-mini',
                            variant === 'mobile' || variant === 'pc' ? 'table-chat-add-mine-mini--labeled' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          disabled={mySnippets.length >= MY_SNIPPETS_MAX}
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            addMineSnippet(phrase);
                          }}
                          title={
                            variant === 'pc'
                              ? 'Добавить эту фразу в «Мои»'
                              : 'Сохранить в банк «Мои» на этом устройстве'
                          }
                          aria-label={`В «Мои»: ${phrase.slice(0, 48)}`}
                        >
                          {variant === 'mobile' || variant === 'pc' ? 'В Мои' : '+'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : emojiTab === 'mine' ? (
                  <div className="table-chat-mine">
                    {variant === 'mobile' ? (
                      <button
                        type="button"
                        className="table-chat-mine__edit-toggle-mobile"
                        onClick={() => setMobileMineEditMode((v) => !v)}
                        aria-pressed={mobileMineEditMode}
                      >
                        {mobileMineEditMode ? 'Готово' : 'Редактировать'}
                      </button>
                    ) : null}
                    {variant !== 'mobile' ? (
                      <div className="table-chat-mine__hint-wrap table-chat-mine__hint-wrap--pc">
                        <button
                          type="button"
                          className="table-chat-mine__hint-toggle"
                          aria-expanded={minePcHelpOpen}
                          title={minePcHelpOpen ? 'Свернуть' : 'Как добавить в «Мои»'}
                          aria-label={minePcHelpOpen ? 'Свернуть подсказку' : 'Как добавить в «Мои»'}
                          onClick={() => setMinePcHelpOpen((v) => !v)}
                        >
                          {minePcHelpOpen ? '×' : '?'}
                        </button>
                        {minePcHelpOpen ? (
                          <p className="table-chat-mine__hint table-chat-mine__hint--expanded">
                            ★ у эмодзи, «+» у фразы, Shift+клик; поле или «Из поля».
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="table-chat-mine__scroll">
                      {mySnippets.length === 0 ? (
                        <div className="table-chat-mine__empty">Пока пусто — добавьте первую строку.</div>
                      ) : (
                        <div className="table-chat-mine__layout">
                          <div className="table-chat-mine__phrases-col">
                            {mySnippets.map((s, idx) => {
                              if (isLikelyEmojiSnippet(s)) return null;
                              return (
                                <div key={`${idx}-${mineSnippetDedupeKey(s)}`} className="table-chat-mine__row">
                                  <button
                                    type="button"
                                    className="table-chat-mine__use"
                                    disabled={text.length + s.length > MAX_BODY}
                                    onClick={() => insertSnippet(s)}
                                    title={s}
                                  >
                                    {s}
                                  </button>
                                  {variant !== 'mobile' || mobileMineEditMode ? (
                                    <button
                                      type="button"
                                      className="table-chat-mine__del"
                                      aria-label={`Удалить: ${s.slice(0, 40)}`}
                                      onClick={() => removeMineSnippet(idx)}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                          <div className="table-chat-mine__emoji-cols">
                            {mySnippets.map((s, idx) => {
                              if (!isLikelyEmojiSnippet(s)) return null;
                              return (
                                <div key={`${idx}-${mineSnippetDedupeKey(s)}`} className="table-chat-mine__row table-chat-mine__row--emoji">
                                  <button
                                    type="button"
                                    className="table-chat-mine__use table-chat-mine__use--emoji"
                                    disabled={text.length + s.length > MAX_BODY}
                                    onClick={() => insertSnippet(s)}
                                    title={s}
                                  >
                                    {s}
                                  </button>
                                  {variant !== 'mobile' || mobileMineEditMode ? (
                                    <button
                                      type="button"
                                      className="table-chat-mine__del table-chat-mine__del--emoji"
                                      aria-label={`Удалить: ${s.slice(0, 40)}`}
                                      onClick={() => removeMineSnippet(idx)}
                                    >
                                      ×
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="table-chat-mine__add-row">
                      <input
                        type="text"
                        className="table-chat-mine__input"
                        value={mineDraft}
                        onChange={(e) => setMineDraft(e.target.value.slice(0, MY_SNIPPETS_MAX_LEN))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitMineDraft();
                          }
                        }}
                        placeholder="Новая фраза или эмодзи…"
                        maxLength={MY_SNIPPETS_MAX_LEN}
                        aria-label="Новая строка для банка «Мои»"
                      />
                      <button
                        type="button"
                        className="table-chat-mine__add-btn"
                        disabled={!mineDraft.trim() || mySnippets.length >= MY_SNIPPETS_MAX}
                        onClick={() => commitMineDraft()}
                      >
                        Добавить
                      </button>
                    </div>
                    <button
                      type="button"
                      className="table-chat-mine__from-msg"
                      disabled={!text.trim() || mySnippets.length >= MY_SNIPPETS_MAX}
                      onClick={() => addMineFromComposer()}
                    >
                      Из поля сообщения
                    </button>
                  </div>
                ) : (
                  <>
                    {(emojiTab === 'react' || emojiTab === 'cards' || emojiTab === 'misc') && tabHasEmojiMore(emojiTab) ? (
                      <button
                        type="button"
                        className="table-chat-emoji-more"
                        aria-expanded={emojiBankExpanded}
                        aria-controls={`${emojiPanelDomId}-grid`}
                        onClick={() => setEmojiBankExpanded((v) => !v)}
                      >
                        {emojiBankExpanded ? '− Свернуть' : '+ Ещё эмодзи'}
                      </button>
                    ) : null}
                    <div className="table-chat-emoji-panel__grid" id={`${emojiPanelDomId}-grid`}>
                      {emojiCells.map((emo, idx) => {
                        const starFlashKey = `${emojiTab}-${idx}`;
                        return (
                          <div key={`${emojiTab}-${idx}-${emo}`} className="table-chat-emoji-slot">
                            <button
                              type="button"
                              className="table-chat-emoji-cell"
                              title={
                                variant === 'mobile'
                                  ? `${emo} — тап: в чат; Shift+тап: в «Мои»`
                                  : `${emo} — обычный клик: в сообщение. Shift или Alt + клик: сохранить в «Мои»`
                              }
                              aria-label={`Вставить ${emo}`}
                              style={{
                                opacity: text.length + emo.length > MAX_BODY ? 0.45 : 1,
                              }}
                              onClick={(e) => {
                                if (variant === 'mobile' && consumeMobileLongPressFired()) {
                                  e.preventDefault();
                                  return;
                                }
                                if (e.shiftKey || e.altKey) {
                                  e.preventDefault();
                                  addMineSnippet(emo);
                                  return;
                                }
                                if (text.length + emo.length > MAX_BODY) return;
                                insertSnippet(emo);
                              }}
                              onPointerDown={() => {
                                if (variant === 'mobile') startMobileLongPressAddMine(emo, starFlashKey);
                              }}
                              onPointerUp={() => {
                                if (variant === 'mobile') clearMobileLongPress();
                              }}
                              onPointerCancel={() => {
                                if (variant === 'mobile') clearMobileLongPress();
                              }}
                              onPointerLeave={() => {
                                if (variant === 'mobile') clearMobileLongPress();
                              }}
                            >
                              {emo}
                            </button>
                            {variant !== 'mobile' ? (
                              <button
                                type="button"
                                className={[
                                  'table-chat-emoji-cell-star',
                                  mineStarFlashKey === starFlashKey ? 'table-chat-emoji-cell-star--flash' : '',
                                  mySnippets.length >= MY_SNIPPETS_MAX ? 'table-chat-emoji-cell-star--at-cap' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                title={
                                  mySnippets.length >= MY_SNIPPETS_MAX
                                    ? 'Список «Мои» полон — удалите строку или замените фразу'
                                    : 'Добавить в «Мои»'
                                }
                                aria-label={`Добавить в «Мои»: ${emo}`}
                                aria-disabled={mySnippets.length >= MY_SNIPPETS_MAX}
                                onMouseDown={(e) => {
                                  e.stopPropagation();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  addMineFromEmojiStar(emo, starFlashKey);
                                }}
                              >
                                <span aria-hidden>★</span>
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ) : null}
            <div className="table-chat-composer__toolbar">
              <button
                ref={emojiToggleRef}
                type="button"
                className="table-chat-emoji-toggle"
                aria-expanded={emojiPickerOpen}
                aria-haspopup="dialog"
                aria-controls={emojiPanelDomId}
                aria-label={emojiPickerOpen ? 'Закрыть вставку' : 'Эмодзи и фразы'}
                title="Эмодзи и фразы"
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={onEmojiToggle}
              >
                <span aria-hidden>✨</span>
              </button>
            </div>
          </div>
          {variant === 'mobile' ? (
            <div className="table-chat-mobile-input-shell">
              <button
                ref={emojiToggleRef}
                type="button"
                className="table-chat-mobile-input-shell__emoji"
                aria-expanded={emojiPickerOpen}
                aria-haspopup="dialog"
                aria-controls={emojiPanelDomId}
                aria-label={emojiPickerOpen ? 'Закрыть вставку' : 'Эмодзи и фразы'}
                title="Эмодзи и фразы"
                onClick={onEmojiToggle}
              >
                <span aria-hidden>✨</span>
              </button>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder="Сообщение…"
                maxLength={MAX_BODY}
                rows={1}
                className="table-chat-input table-chat-input--pro table-chat-input--mobile-inline"
                autoComplete="off"
                aria-label="Текст сообщения в чат"
              />
              <button
                type="button"
                className="table-chat-mobile-input-shell__send"
                onClick={() => void onSend()}
                disabled={sending || !text.trim()}
                aria-label={sending ? 'Отправка…' : 'Отправить'}
              >
                {sending ? <span className="table-chat-send__spinner" aria-hidden /> : '➤'}
              </button>
            </div>
          ) : (
            <>
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
                placeholder="Сообщение…"
                maxLength={MAX_BODY}
                rows={1}
                className="table-chat-input table-chat-input--pro"
                autoComplete="off"
                aria-label="Текст сообщения в чат"
              />
              <div className="table-chat-composer__footer">
                <span className="table-chat-composer__counter" aria-live="polite">
                  {text.length}/{MAX_BODY}
                </span>
                <button
                  type="button"
                  className="table-chat-send table-chat-send--pro"
                  onClick={() => void onSend()}
                  disabled={sending || !text.trim()}
                  aria-label={sending ? 'Отправка…' : 'Отправить'}
                >
                  {sending ? <span className="table-chat-send__spinner" aria-hidden /> : 'Отправить'}
                </button>
              </div>
            </>
          )}
          {variant === 'mobile' && mySnippets.length > 0 ? (
            <div className="table-chat-mobile-favorites" aria-label="Избранные вставки">
              {mySnippets.slice(0, 10).map((s, idx) => (
                <button
                  key={`fav-${idx}-${mineSnippetDedupeKey(s)}`}
                  type="button"
                  className="table-chat-mobile-favorites__chip"
                  disabled={text.length + s.length > MAX_BODY}
                  onClick={() => insertSnippet(s)}
                  title={s}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          {variant === 'mobile' && mobileMineToast ? (
            <div className="table-chat-mobile-mine-toast" role="status" aria-live="polite">
              {mobileMineToast}
            </div>
          ) : null}
        </div>
      </div>
      {variant === 'pc' ? (
        <button
          type="button"
          ref={resizeCornerRef}
          className="table-chat-dock-pc-resize-corner"
          onPointerDown={(ev) => {
            ev.stopPropagation();
            startPcResize(ev);
          }}
          aria-label="Изменить размер окна чата: потяните угол"
          title="Потяните угол, чтобы изменить ширину и высоту"
        />
      ) : null}
    </div>
  );
}

export { TableChatDock };
