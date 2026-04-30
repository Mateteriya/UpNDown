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
import {
  fetchRoomChatMessages,
  sendRoomChatMessage,
  subscribeRoomChat,
  type RoomChatMessageRow,
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

const MAX_BODY = 500;
const FETCH_LIMIT = 120;

const LS_PC_CHAT_DRAG = 'upndown.pcChat.drag';
const LS_PC_CHAT_COLLAPSED = 'upndown.pcChat.collapsed';
const LS_PC_CHAT_SIZE = 'upndown.pcChat.size';
const LS_MOBILE_CHAT_HEIGHT = 'upndown.mobileChat.height';
const LS_MOBILE_CHAT_RESIZE_HINT_SEEN = 'upndown.mobileChat.resizeHintSeen.v1';

const PC_CHAT_MIN_W = 220;
const PC_CHAT_MAX_W = 720;
const PC_CHAT_MIN_H = 240;

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

export function TableChatDock({
  roomId,
  userId,
  displayName,
  variant,
  onOwnMessageSent,
}: TableChatDockProps) {
  const [messages, setMessages] = useState<RoomChatMessageRow[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const optimisticIdRef = useRef<string | null>(null);
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
  const [mobileMessagesHeight, setMobileMessagesHeight] = useState<number>(() => {
    const ls = readMobileChatHeightFromLs();
    return Math.round(Math.min(360, Math.max(140, ls ?? 188)));
  });
  const [mobileResizeHintVisible, setMobileResizeHintVisible] = useState<boolean>(() => !readMobileResizeHintSeenFromLs());

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

  useEffect(() => {
    let cancelled = false;
    let off = () => {};
    setError(null);
    void (async () => {
      const initial = await fetchRoomChatHistoryWithRetry(roomId, FETCH_LIMIT);
      if (cancelled) return;
      setMessages(initial);
    })();
    off = subscribeRoomChat(roomId, (row) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        const opt = optimisticIdRef.current;
        const next = opt ? prev.filter((m) => m.id !== opt) : prev;
        return [...next, row].slice(-FETCH_LIMIT);
      });
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [roomId, userId]);

  /** Вкладка/сеть: повторный вход без смены roomId у монтированного дока. */
  useEffect(() => {
    if (!roomId) return;
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
  }, [roomId]);

  useEffect(() => {
    if (variant === 'mobile' && !mobileOpen) setEmojiPickerOpen(false);
  }, [variant, mobileOpen]);

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

  const onSend = useCallback(async () => {
    setEmojiPickerOpen(false);
    const t = text.trim();
    if (!t || sending) return;
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
    setText('');
    setSending(true);
    setError(null);
    resizeComposer();

    const { error: err, row } = await sendRoomChatMessage(roomId, userId, displayName, t);
    optimisticIdRef.current = null;
    setSending(false);
    if (err) {
      setError(err);
      setMessages((prev) => prev.filter((m) => m.id !== optId));
      setText(t);
      return;
    }
    if (row) {
      setMessages((prev) => {
        const without = prev.filter((m) => m.id !== optId);
        if (without.some((m) => m.id === row.id)) return without;
        return [...without, row].slice(-FETCH_LIMIT);
      });
      onOwnMessageSent?.(row);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optId));
    }
  }, [roomId, userId, displayName, text, sending, onOwnMessageSent, resizeComposer]);

  const copyBody = useCallback((body: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(body);
    }
  }, []);

  if (variant === 'mobile' && !mobileOpen) {
    return (
      <div className="table-chat-dock table-chat-dock--pro table-chat-dock--mobile table-chat-dock--collapsed">
        <button type="button" className="table-chat-toggle" onClick={() => setMobileOpen(true)}>
          Чат
        </button>
      </div>
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
