import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import {
  fetchRoomChatMessages,
  sendRoomChatMessage,
  subscribeRoomChat,
  type RoomChatMessageRow,
  type RoomChatTypingBroadcastPayload,
} from '../lib/onlineGameApi';
import {
  CHAT_QUICK_PHRASES,
  MY_SNIPPETS_LS_KEY,
  MY_SNIPPETS_MAX,
  MY_SNIPPETS_MAX_LEN,
  REACTION_EMOJI_PRIMARY,
  TABLE_CHAT_PICKER_TABS,
  getEmojiCellsForTab,
  tabHasEmojiMore,
  type TableChatPickerTabId,
} from './tableChatEmojiPalette';
import {
  aggregateChatReactions,
  buildAddressedChatBody,
  buildChatReactionBody,
  chatBodyForClipboard,
  isChatReactionControlBody,
  messageMatchesChatSearch,
  myReactionEmoji,
  parseAddressedChatBody,
  splitChatSearchHighlight,
  type ChatReactionChip,
} from './tableChatBodyProtocol';
import {
  TABLE_CHAT_NAME_FOLD_MS,
  foldTableChatDisplayName,
  formatTableChatClock,
  tableChatFeedKind,
  tableChatFeedRowClassNames,
  tableChatMessageSheetHideCopy,
  tableChatNameTapKind,
  tableChatOwnAuthorLabel,
} from './tableChatFeedRow';
import {
  loadHiddenChatMessageIds,
  loadHiddenChatUserIds,
  persistHiddenChatMessageIds,
  persistHiddenChatUserIds,
  withHiddenId,
  withoutHiddenId,
} from './tableChatHide';

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
const LS_MOBILE_CHAT_FONT_STEP = 'upndown.mobileChat.fontStep.v1';
const LS_CHAT_NEWEST_FIRST = 'upndown.tableChat.newestFirst.v1';
const LS_LS_CHAT_BODY_H = 'upndown.tableChat.lsBodyH.v1';
const LS_MOBILE_SIDE_EAR_CENTER_PCT = 'upndown.mobileChat.sideEar.centerPercent.v1';
const LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED = 'upndown.mobileChat.sideEar.railCollapsed.v1';
/** «1» — космическая закладка-шарик (без фантомов). */
const LS_MOBILE_SIDE_EAR_COSMIC_COMPACT = 'upndown.mobileChat.sideEar.cosmicCompact.v1';
/** Центр шарика { x, y } в px (viewport). */
const LS_MOBILE_COSMIC_ORB_POS = 'upndown.mobileChat.cosmicOrb.pos.v1';
/** ~14% компактнее прежних 44px */
const COSMIC_ORB_SIZE_PX = 38;
const COSMIC_ORB_HALF_PX = COSMIC_ORB_SIZE_PX / 2;
const COSMIC_ORB_EDGE_MARGIN_PX = 10;
const COSMIC_ORB_SNAP_EDGE_PX = 32;
const COSMIC_ORB_DRAG_THRESHOLD_PX = 8;
/** После drag/tap по шарику: сбросить suppress, если synthetic click не пришёл (touch). */
const COSMIC_ORB_SUPPRESS_CLICK_MS = 320;
/** Чип «тяните» исчезает через ~3 с; кольцо и стрелки — до первого перетаскивания. */
const COSMIC_ORB_HINT_CHIP_AUTO_HIDE_MS = 3000;
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

type SideEarUnreadPhantom = { author: string; body: string; messageId: string; userId?: string };

/** Временное скрытие фантома по крестику до смены превью (стабильный ключ / id) или строки «печатает». */
type SideEarPhantomDismiss =
  | { kind: 'typing'; line: string }
  | { kind: 'unread'; messageId: string };

function formatUnreadPhantomFromMessage(row: RoomChatMessageRow): SideEarUnreadPhantom {
  const author = row.display_name.trim().slice(0, 28) || 'Игрок';
  const b = row.body.trim();
  return {
    author,
    body: b || 'сообщение',
    messageId: row.id,
    userId: row.user_id,
  };
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
  return {
    author,
    body: b || '…',
    messageId: `local-echo:${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  };
}

/** Разделитель «цитата / ваш текст» в теле одного сообщения чата. */
const PHANTOM_CONTEXT_QUOTE_SEP = '\n—\n';
/** Макс. длина фрагмента цитаты в превью ушка и при отправке. */
const PHANTOM_QUOTE_SNIPPET_MAX = 72;
/** Макс. длина цитаты в панели «Добавить цитирование» (фантом). */
const PHANTOM_REPLY_QUOTE_PREVIEW_MAX = 72;
/** Высота поля ответа фантома при ручном ресайзе (шарики). */
const PHANTOM_REPLY_INPUT_MIN_H = 72;
const PHANTOM_REPLY_INPUT_MAX_H = 280;

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
    for (let n = Math.min(PHANTOM_QUOTE_SNIPPET_MAX, flat.length); n >= 8; n--) {
      const snippet = flat.length > n ? `${flat.slice(0, n)}…` : flat;
      const candidate = author ? `${author}: «${snippet}»${sep}` : `«${snippet}»${sep}`;
      if (candidate.length <= maxTotal) return candidate;
    }
    const head = author ? `${author}: «…»${sep}` : `«…»${sep}`;
    return head.slice(0, maxTotal);
  }
  if (!flat) return (author ? `${author}:${sep}${t}` : t).slice(0, maxTotal);
  for (let n = Math.min(PHANTOM_QUOTE_SNIPPET_MAX, flat.length); n >= 8; n--) {
    const snippet = flat.length > n ? `${flat.slice(0, n)}…` : flat;
    const candidate = build(snippet);
    if (candidate.length <= maxTotal) return candidate;
  }
  return t.slice(0, maxTotal);
}

type PhantomContextQuoteParts = {
  quoteAuthor: string;
  quoteExcerpt: string;
  replyText: string;
};

function parsePhantomContextualReplyBody(body: string): PhantomContextQuoteParts | null {
  const sep = PHANTOM_CONTEXT_QUOTE_SEP;
  const sepIdx = body.indexOf(sep);
  if (sepIdx < 0) return null;
  const quoteRaw = body.slice(0, sepIdx).trim();
  const replyText = body.slice(sepIdx + sep.length);
  if (!quoteRaw) return null;
  const authorQuote = quoteRaw.match(/^(.+?):\s*«([\s\S]*)»\s*$/);
  if (authorQuote) {
    return {
      quoteAuthor: authorQuote[1].trim(),
      quoteExcerpt: authorQuote[2].trim(),
      replyText,
    };
  }
  const bare = quoteRaw.match(/^«([\s\S]*)»\s*$/);
  if (bare) {
    return { quoteAuthor: '', quoteExcerpt: bare[1].trim(), replyText };
  }
  return { quoteAuthor: '', quoteExcerpt: quoteRaw, replyText };
}

function ChatHighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query?.trim() || !text) return <>{text}</>;
  const parts = splitChatSearchHighlight(text, query);
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="table-chat-search-hit">
            {p.t}
          </mark>
        ) : (
          <Fragment key={i}>{p.t}</Fragment>
        ),
      )}
    </>
  );
}

function TableChatQuoteCard({
  author,
  excerpt,
  highlightQuery,
}: {
  author: string;
  excerpt: string;
  highlightQuery?: string;
}) {
  return (
    <div
      className="table-chat-msg__quote-card"
      aria-label={author ? `Цитата: ${author}` : 'Цитата'}
    >
      <div className="table-chat-msg__quote-card__accent" aria-hidden />
      <div className="table-chat-msg__quote-card__body">
        <div className="table-chat-msg__quote-card__kicker">Цитата</div>
        {author ? (
          <div className="table-chat-msg__quote-card__author">
            <ChatHighlightedText text={author} query={highlightQuery} />
          </div>
        ) : null}
        <blockquote className="table-chat-msg__quote-card__excerpt">
          <ChatHighlightedText text={excerpt || '…'} query={highlightQuery} />
        </blockquote>
      </div>
    </div>
  );
}

function truncatePhantomQuoteExcerpt(text: string, max: number): string {
  const raw = text.trim().replace(/\s+/g, ' ');
  if (!raw) return '…';
  return raw.length > max ? `${raw.slice(0, max)}…` : raw;
}

/** Текст непрочитанного в фантоме: карточка цитаты + ответ, как в ленте чата. */
function PhantomEarPreviewBody({ body }: { body: string }) {
  const parsed = useMemo(() => parsePhantomContextualReplyBody(body), [body]);
  if (!parsed) {
    return <span className="table-chat-side-ear-phantom__body">{body}</span>;
  }
  const reply = parsed.replyText.trim();
  const excerpt = truncatePhantomQuoteExcerpt(parsed.quoteExcerpt, PHANTOM_QUOTE_SNIPPET_MAX);
  return (
    <span className="table-chat-side-ear-phantom__body table-chat-side-ear-phantom__body--quoted">
      <TableChatQuoteCard author={parsed.quoteAuthor} excerpt={excerpt} />
      {reply ? <span className="table-chat-side-ear-phantom__reply">{parsed.replyText}</span> : null}
    </span>
  );
}

function TableChatAddressedText({
  to,
  text,
  highlightQuery,
}: {
  to: string;
  text: string;
  highlightQuery?: string;
}) {
  return (
    <span className="table-chat-addr">
      <span className="table-chat-addr__to">
        <ChatHighlightedText text={to} query={highlightQuery} />
      </span>
      {text ? (
        <span className="table-chat-addr__text">
          <ChatHighlightedText text={text} query={highlightQuery} />
        </span>
      ) : null}
    </span>
  );
}

function renderChatPlainOrAddressed(text: string, highlightQuery?: string) {
  const addr = parseAddressedChatBody(text);
  if (!addr) return <ChatHighlightedText text={text} query={highlightQuery} />;
  return <TableChatAddressedText to={addr.to} text={addr.text} highlightQuery={highlightQuery} />;
}

function TableChatMessageBody({
  body,
  variant,
  highlightQuery,
}: {
  body: string;
  variant: 'bubble' | 'compact';
  highlightQuery?: string;
}) {
  const parsed = useMemo(() => parsePhantomContextualReplyBody(body), [body]);
  if (!parsed) {
    if (variant === 'bubble') {
      return <p className="table-chat-msg__body">{renderChatPlainOrAddressed(body, highlightQuery)}</p>;
    }
    return (
      <span className="table-chat-msg-compact__body">
        {renderChatPlainOrAddressed(body, highlightQuery)}
      </span>
    );
  }
  const reply = parsed.replyText.trim();
  const replyNode = reply ? renderChatPlainOrAddressed(parsed.replyText, highlightQuery) : null;
  if (variant === 'bubble') {
    return (
      <div className="table-chat-msg__body table-chat-msg__body--quoted">
        <TableChatQuoteCard
          author={parsed.quoteAuthor}
          excerpt={parsed.quoteExcerpt}
          highlightQuery={highlightQuery}
        />
        {replyNode ? <p className="table-chat-msg__reply-text">{replyNode}</p> : null}
      </div>
    );
  }
  return (
    <span className="table-chat-msg-compact__quoted">
      <TableChatQuoteCard
        author={parsed.quoteAuthor}
        excerpt={parsed.quoteExcerpt}
        highlightQuery={highlightQuery}
      />
      {replyNode ? <span className="table-chat-msg-compact__reply">{replyNode}</span> : null}
    </span>
  );
}

function TableChatReactionChips({
  chips,
  disabled,
  onToggle,
}: {
  chips: ReadonlyArray<ChatReactionChip>;
  disabled?: boolean;
  onToggle: (emoji: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <span className="table-chat-msg-reactions" role="list" aria-label="Реакции">
      {chips.map((chip) => (
        <button
          key={chip.emoji}
          type="button"
          role="listitem"
          className={[
            'table-chat-msg-reactions__chip',
            chip.mine ? 'table-chat-msg-reactions__chip--mine' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-pressed={chip.mine}
          aria-label={
            chip.mine
              ? `Убрать реакцию ${chip.emoji}`
              : `Поставить реакцию ${chip.emoji}`
          }
          title={chip.mine ? 'Нажмите, чтобы убрать' : 'Нажмите, чтобы поставить'}
          disabled={disabled}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(chip.emoji);
          }}
        >
          <span aria-hidden>{chip.emoji}</span>
          {chip.count > 1 ? (
            <span className="table-chat-msg-reactions__count">{chip.count}</span>
          ) : null}
        </button>
      ))}
    </span>
  );
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

function readSideEarCosmicCompactFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_MOBILE_SIDE_EAR_COSMIC_COMPACT) === '1';
  } catch {
    return false;
  }
}

type CosmicOrbPos = { x: number; y: number };

function clampCosmicOrbPos(x: number, y: number): CosmicOrbPos {
  if (typeof window === 'undefined') return { x, y };
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const m = COSMIC_ORB_EDGE_MARGIN_PX + COSMIC_ORB_HALF_PX;
  return {
    x: Math.min(iw - m, Math.max(m, x)),
    y: Math.min(ih - m, Math.max(m, y)),
  };
}

function snapCosmicOrbPos(x: number, y: number): CosmicOrbPos {
  if (typeof window === 'undefined') return clampCosmicOrbPos(x, y);
  const clamped = clampCosmicOrbPos(x, y);
  const iw = window.innerWidth;
  const ih = window.innerHeight;
  const h = COSMIC_ORB_HALF_PX;
  const snap = COSMIC_ORB_SNAP_EDGE_PX + h;
  const edge = COSMIC_ORB_EDGE_MARGIN_PX + h;
  let nx = clamped.x;
  let ny = clamped.y;
  if (clamped.x <= snap) nx = edge;
  else if (clamped.x >= iw - snap) nx = iw - edge;
  if (clamped.y <= snap) ny = edge;
  else if (clamped.y >= ih - snap) ny = ih - edge;
  return { x: nx, y: ny };
}

function defaultCosmicOrbPos(centerPct = SIDE_EAR_DEFAULT_CENTER_PCT): CosmicOrbPos {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const ih = window.innerHeight;
  const iw = window.innerWidth;
  return clampCosmicOrbPos(iw - COSMIC_ORB_EDGE_MARGIN_PX - COSMIC_ORB_HALF_PX, (centerPct / 100) * ih);
}

function readCosmicOrbPosFromLs(): CosmicOrbPos | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_MOBILE_COSMIC_ORB_POS);
    if (!raw) return null;
    const j = JSON.parse(raw) as { x?: unknown; y?: unknown };
    const x = typeof j.x === 'number' && Number.isFinite(j.x) ? j.x : NaN;
    const y = typeof j.y === 'number' && Number.isFinite(j.y) ? j.y : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return clampCosmicOrbPos(x, y);
  } catch {
    return null;
  }
}

function persistCosmicOrbPos(pos: CosmicOrbPos) {
  try {
    localStorage.setItem(LS_MOBILE_COSMIC_ORB_POS, JSON.stringify(pos));
  } catch {
    /* ignore */
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
/** Ушко: passive: false — preventDefault; capture: true — раньше остальных слушателей (меньше «съедания» move). */
const SIDE_EAR_POINTER_MOVE_OPTS: AddEventListenerOptions = { passive: false, capture: true };

/** Coalesced + финальный ev — порог «уже тянем»; позицию — синхронно по финальному ev.clientY. */
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

function readChatNewestFirstFromLs(fallback: boolean): boolean {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(LS_CHAT_NEWEST_FIRST);
    if (raw === '1') return true;
    if (raw === '0') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

function writeChatNewestFirstToLs(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_CHAT_NEWEST_FIRST, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const MOBILE_CHAT_BODY_BASE_H = 188;

function clampMobilePortraitChatH(px: number): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 700;
  const max = Math.round(Math.min(vh * 0.62, 560));
  return Math.round(Math.min(max, Math.max(140, px)));
}

function lsChatBodyBaseH(): number {
  return typeof window !== 'undefined' ? Math.min(window.innerHeight * 0.32, 220) : 180;
}

function clampLsChatBodyH(px: number): number {
  const vh = typeof window !== 'undefined' ? window.innerHeight : 400;
  const max = Math.round(Math.min(vh * 0.58, 420));
  return Math.round(Math.min(max, Math.max(96, px)));
}

function readLsChatBodyHFromLs(): number {
  const fallback = lsChatBodyBaseH();
  if (typeof localStorage === 'undefined') return clampLsChatBodyH(fallback);
  try {
    const raw = localStorage.getItem(LS_LS_CHAT_BODY_H);
    if (!raw) return clampLsChatBodyH(fallback);
    const n = Number(raw);
    if (!Number.isFinite(n)) return clampLsChatBodyH(fallback);
    return clampLsChatBodyH(n);
  } catch {
    return clampLsChatBodyH(fallback);
  }
}

function writeLsChatBodyHToLs(px: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_LS_CHAT_BODY_H, String(clampLsChatBodyH(px)));
  } catch {
    /* ignore */
  }
}

/** Кегль ленты/ввода: 0 = обычный … 3 = крупный; «+» циклит. */
const MOBILE_CHAT_FONT_SCALES = [1, 1.12, 1.26, 1.4] as const;

function readMobileChatFontStepFromLs(): number {
  if (typeof localStorage === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(LS_MOBILE_CHAT_FONT_STEP);
    if (!raw) return 0;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0 || n >= MOBILE_CHAT_FONT_SCALES.length) return 0;
    return n;
  } catch {
    return 0;
  }
}

function writeMobileChatFontStepToLs(step: number): void {
  try {
    localStorage.setItem(LS_MOBILE_CHAT_FONT_STEP, String(step));
  } catch {
    /* ignore */
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
  /**
   * Мобильное ушко (рельса, фантомы, космическая закладка): все режимы, кроме short immersive.
   * В GameTable: `isMobile && !(mobileViewportShort && mobileShortHeaderImmersive)`.
   */
  mobileSideEarEnabled?: boolean;
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
  /**
   * Инкремент → открыть мобильный док (диск/мини). 0 / undefined — игнор.
   */
  openMobileNonce?: number;
  /** Свёрнутый chrome: непрочитанное / «печатает» для внешнего диска·мини */
  onMobileChromeMeta?: (meta: { unread: boolean; typingLine: string | null }) => void;
  /**
   * 3p · landscape «чат справа»: монтировать док в эту колонку (лента у сукна),
   * а не снизу страницы. null = обычный нижний dock.
   */
  mobileEmbedHost?: HTMLElement | null;
  /** East-embed: «Убрать» — вернуть чат вниз страницы (как Чат↓). */
  onEastEmbedDismissToBottom?: () => void;
  /** Landscape · нижний dock: тот же chrome, что у чата справа от сукна. */
  mobileLsBottomChrome?: boolean;
  /** 3p LS · нижний dock: переложить чат в колонку справа от сукна. */
  onLsBottomMoveToSide?: () => void;
  /**
   * 3p east-embed: true, пока колонка уже, чем порог inline-инструментов.
   * Сортировка / поиск / кегль уходят под «⋯».
   */
  mobileEastHeaderCompact?: boolean;
};

function CrystalLilacGlyph({
  id,
  path,
  filled = false,
}: {
  id: string;
  path: string;
  filled?: boolean;
}) {
  const gradId = `${id}-lilac`;
  return (
    <svg className="table-chat-east-crystal-glyph" viewBox="0 0 16 16" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0.15" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="38%" stopColor="#a78bfa" />
          <stop offset="72%" stopColor="#f472b6" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d={path}
        fill={filled ? `url(#${gradId})` : 'none'}
        stroke={`url(#${gradId})`}
        strokeWidth={filled ? 0.6 : 1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChatToolSortGlyph({ newestFirst, hint }: { newestFirst: boolean; hint: boolean }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg
      className={[
        'table-chat-tool-glyph',
        'table-chat-tool-glyph--sort',
        newestFirst ? 'table-chat-tool-glyph--sort-new-top' : 'table-chat-tool-glyph--sort-new-bot',
        hint ? 'table-chat-tool-glyph--sort-hint' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 16 16"
      aria-hidden
    >
      <defs>
        <linearGradient id={`${gid}-hot`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="46%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
        <linearGradient id={`${gid}-dim`} x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        className={[
          'table-chat-tool-glyph__chev',
          'table-chat-tool-glyph__chev--up',
          newestFirst ? 'table-chat-tool-glyph__chev--hot' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        d="M8 1.6 12.2 6.2H3.8Z"
        fill={newestFirst ? `url(#${gid}-hot)` : `url(#${gid}-dim)`}
        stroke={newestFirst ? '#f472b6' : '#7c3aed'}
        strokeWidth={newestFirst ? 1.05 : 0.8}
        strokeLinejoin="round"
        paintOrder="stroke fill"
      />
      <path
        className={[
          'table-chat-tool-glyph__chev',
          'table-chat-tool-glyph__chev--down',
          newestFirst ? '' : 'table-chat-tool-glyph__chev--hot',
        ]
          .filter(Boolean)
          .join(' ')}
        d="M8 14.4 3.8 9.8h8.4Z"
        fill={newestFirst ? `url(#${gid}-dim)` : `url(#${gid}-hot)`}
        stroke={newestFirst ? '#7c3aed' : '#f472b6'}
        strokeWidth={newestFirst ? 0.8 : 1.05}
        strokeLinejoin="round"
        paintOrder="stroke fill"
      />
      <g className="table-chat-tool-glyph__spark" aria-hidden>
        <path className="table-chat-tool-glyph__spark-outer" d="M0-2.35 2.35 0 0 2.35-2.35 0Z" />
        <path className="table-chat-tool-glyph__spark-core" d="M0-1.15 1.15 0 0 1.15-1.15 0Z" />
      </g>
    </svg>
  );
}

function ChatToolSearchGlyph() {
  const gid = useId().replace(/:/g, '');
  return (
    <svg className="table-chat-tool-glyph table-chat-tool-glyph--search" viewBox="0 0 16 16" aria-hidden>
      <defs>
        <linearGradient id={`${gid}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="45%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <circle cx="6.6" cy="6.6" r="4.05" fill="none" stroke={`url(#${gid}-s)`} strokeWidth="2.2" />
      <path
        d="M9.7 9.7 14.1 14.1"
        fill="none"
        stroke={`url(#${gid}-s)`}
        strokeWidth="2.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChatFontTypeGlyph({ plus }: { plus: boolean }) {
  return (
    <span
      className={[
        'table-chat-dock-mobile-font-ctrl__glyph',
        'table-chat-dock-mobile-font-ctrl__glyph--type',
        plus
          ? 'table-chat-dock-mobile-font-ctrl__glyph--type-plus'
          : 'table-chat-dock-mobile-font-ctrl__glyph--type-minus',
      ].join(' ')}
      aria-hidden
    >
      <span className="table-chat-dock-mobile-font-ctrl__type-lg">{plus ? 'А' : 'О'}</span>
      <span className="table-chat-dock-mobile-font-ctrl__type-sm">{plus ? 'а' : 'о'}</span>
      <span className="table-chat-dock-mobile-font-ctrl__type-op">{plus ? '+' : '−'}</span>
    </span>
  );
}

/** 3p LS: переложить док вниз / вправо — рамка сукна + полоска места чата. */
function ChatPlacementDockGlyph({ side }: { side: 'bottom' | 'east' }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg className="table-chat-placement-glyph" viewBox="0 0 16 16" aria-hidden>
      <defs>
        <linearGradient id={`${gid}-p`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect
        x="2.1"
        y="2.1"
        width="11.8"
        height="11.8"
        rx="2.2"
        fill="none"
        stroke={`url(#${gid}-p)`}
        strokeWidth="1.35"
      />
      {side === 'bottom' ? (
        <rect x="3.6" y="10.05" width="8.8" height="2.35" rx="0.7" fill={`url(#${gid}-p)`} />
      ) : (
        <rect x="10.05" y="3.6" width="2.35" height="8.8" rx="0.7" fill={`url(#${gid}-p)`} />
      )}
    </svg>
  );
}

function ChatStripPeekButton({
  id,
  dir,
  onScroll,
  className,
  label,
  crystal,
}: {
  id: string;
  dir: 1 | -1;
  onScroll: (dir: 1 | -1) => void;
  className: string;
  label: string;
  crystal: boolean;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onScroll(dir);
      }}
    >
      {crystal ? (
        <CrystalLilacGlyph
          id={id}
          path={dir === 1 ? 'M4.2 2 12.2 8 4.2 14' : 'M11.8 2 3.8 8 11.8 14'}
        />
      ) : dir === 1 ? (
        '›'
      ) : (
        '‹'
      )}
    </button>
  );
}

function readHScrollOverflow(el: HTMLElement | null): { left: boolean; right: boolean } {
  if (!el) return { left: false, right: false };
  const maxScroll = el.scrollWidth - el.clientWidth;
  const sl = el.scrollLeft;
  return {
    left: sl > 2,
    right: maxScroll > 4 && sl < maxScroll - 2,
  };
}

/** Докрутить чип/вкладку из зоны fade, чтобы она была видна целиком. */
function scrollChipFullyIntoHScroll(scroller: HTMLElement, chip: HTMLElement): void {
  const sRect = scroller.getBoundingClientRect();
  const tRect = chip.getBoundingClientRect();
  if (sRect.width < 8) return;
  const pad = Math.max(22, Math.round(sRect.width * 0.22));
  let delta = 0;
  if (tRect.left < sRect.left + pad) {
    delta = tRect.left - (sRect.left + pad);
  } else if (tRect.right > sRect.right - pad) {
    delta = tRect.right - (sRect.right - pad);
  }
  if (Math.abs(delta) < 1) return;
  scroller.scrollBy({ left: delta, behavior: 'smooth' });
}

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
  mobileSideEarEnabled = false,
  offlineUiLab = false,
  offlineUiLabEarMock = { scenario: 'none' },
  offlineUiLabIncomingSeq = 0,
  onMobileChatCollapsedChange,
  openMobileNonce = 0,
  onMobileChromeMeta,
  mobileEmbedHost = null,
  onEastEmbedDismissToBottom,
  mobileLsBottomChrome = false,
  onLsBottomMoveToSide,
  mobileEastHeaderCompact = false,
}: TableChatDockProps) {
  const [messages, setMessages] = useState<RoomChatMessageRow[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapseHintOn, setCollapseHintOn] = useState(false);
  const [sortSparkHintOn, setSortSparkHintOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const mobileFavoritesRef = useRef<HTMLDivElement>(null);
  const mobileEmojiTabsRef = useRef<HTMLDivElement>(null);
  const [mobileFavCanScrollLeft, setMobileFavCanScrollLeft] = useState(false);
  const [mobileFavCanScrollRight, setMobileFavCanScrollRight] = useState(false);
  const [mobileEmojiTabsCanScrollLeft, setMobileEmojiTabsCanScrollLeft] = useState(false);
  const [mobileEmojiTabsCanScrollRight, setMobileEmojiTabsCanScrollRight] = useState(false);
  /** Меню действий по сообщению в ленте: ответить / реакция / адресовать. */
  const [msgActionTarget, setMsgActionTarget] = useState<SideEarUnreadPhantom | null>(null);
  const [msgActionMode, setMsgActionMode] = useState<'sheet' | 'react' | 'name' | null>(null);
  /** Цитата к ответу из ленты (главный композер). */
  const [feedReplyAnchor, setFeedReplyAnchor] = useState<SideEarUnreadPhantom | null>(null);
  /** Адресат: в ленту уйдёт `→ Имя:`, в поле не вставляем сырой префикс. */
  const [feedAddressTo, setFeedAddressTo] = useState<string | null>(null);
  const [chatNewestFirst, setChatNewestFirst] = useState(() =>
    readChatNewestFirstFromLs(variant === 'mobile' && !mobileEmbedHost),
  );
  const [chatSearchOpen, setChatSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [eastToolsMenuOpen, setEastToolsMenuOpen] = useState(false);
  const eastToolsMenuRef = useRef<HTMLDivElement>(null);
  const [lsChatBodyH, setLsChatBodyH] = useState(() => readLsChatBodyHFromLs());
  const chatSearchInputRef = useRef<HTMLInputElement>(null);
  const [composerFlashOn, setComposerFlashOn] = useState(false);
  const composerFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hiddenMsgIds, setHiddenMsgIds] = useState<ReadonlySet<string>>(
    () => loadHiddenChatMessageIds(roomId),
  );
  const [hiddenUserIds, setHiddenUserIds] = useState<ReadonlySet<string>>(
    () => loadHiddenChatUserIds(roomId),
  );
  const [chatHideUndo, setChatHideUndo] = useState<{
    kind: 'msg' | 'user';
    id: string;
    label: string;
  } | null>(null);
  const [chatHiddenPanelOpen, setChatHiddenPanelOpen] = useState(false);
  const chatHideUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [expandedFeedNames, setExpandedFeedNames] = useState<Set<string>>(() => new Set());
  const feedNameFoldTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const msgTapGuardRef = useRef({ x: 0, y: 0, moved: false });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputShellRef = useRef<HTMLDivElement>(null);
  const optimisticIdRef = useRef<string | null>(null);
  const lastLabIncomingSeqRef = useRef(0);
  const dockRef = useRef<HTMLDivElement>(null);
  const prevMobileEmbedHostRef = useRef<HTMLElement | null>(null);
  const mobileCollapsedChatDockRef = useRef<HTMLDivElement>(null);
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
  const lsChatResizeSessionRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    startHeight: 180,
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
  const mineQuickRef = useRef<HTMLButtonElement>(null);
  const [mobileChatFontStep, setMobileChatFontStep] = useState(readMobileChatFontStepFromLs);
  const composerInnerRef = useRef<HTMLDivElement>(null);
  const emojiPanelDomId = useId().replace(/:/g, '');
  const sideEarGlyphGradId = `${emojiPanelDomId}-side-ear-glyph`;
  /** Градиент для ▲/▼ ушка (SVG), без background-clip:text у символа — иначе «волосок» над каймой. */
  const sideEarChevronGradId = `${emojiPanelDomId}-side-ear-chevron`;
  const sideRailChevronGradId = `${emojiPanelDomId}-side-rail-chevron`;
  const sideEarCosmicChipGradId = `${emojiPanelDomId}-side-ear-cosmic-chip`;
  const sideEarCosmicPinGradId = `${emojiPanelDomId}-side-ear-cosmic-pin`;
  const earPreviewDialogTitleId = `${emojiPanelDomId}-ear-preview-title`;
  /** Градиенты для глифов панели фантома (stroke/fill url #…). */
  const phantomToolbarGradId = `${emojiPanelDomId}-phantom-toolbar-grad`;
  const phantomToolbarGradDeepId = `${emojiPanelDomId}-phantom-toolbar-grad-deep`;
  /** Тёмный насыщенный градиент только для глифа «закрыть» (не светлый общий toolbar-grad). */
  const phantomDismissGradId = `${emojiPanelDomId}-phantom-dismiss-grad`;
  const phantomToolbarStrokeUrl = `url(#${phantomToolbarGradId})`;
  const phantomToolbarFillUrl = `url(#${phantomToolbarGradDeepId})`;
  const phantomDismissStrokeUrl = `url(#${phantomDismissGradId})`;
  const [mobileMessagesHeight, setMobileMessagesHeight] = useState<number>(() => {
    const ls = readMobileChatHeightFromLs();
    return clampMobilePortraitChatH(ls ?? MOBILE_CHAT_BODY_BASE_H);
  });
  const [mobileResizeHintVisible, setMobileResizeHintVisible] = useState<boolean>(() => !readMobileResizeHintSeenFromLs());
  const [sideEarCenterPct, setSideEarCenterPct] = useState(() => {
    if (typeof window === 'undefined') return SIDE_EAR_DEFAULT_CENTER_PCT;
    const ls = readSideEarCenterPctFromLs();
    const base = ls ?? SIDE_EAR_DEFAULT_CENTER_PCT;
    return clampSideEarCenterPct(base, window.innerHeight, SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX);
  });
  const [sideEarCosmicCompact, setSideEarCosmicCompact] = useState(() => readSideEarCosmicCompactFromLs());
  const [cosmicOrbPos, setCosmicOrbPos] = useState<CosmicOrbPos>(() => {
    const saved = readCosmicOrbPosFromLs();
    if (saved) return saved;
    return defaultCosmicOrbPos(readSideEarCenterPctFromLs() ?? SIDE_EAR_DEFAULT_CENTER_PCT);
  });
  const [cosmicOrbDragging, setCosmicOrbDragging] = useState(false);
  /** Яркие подсказки drag; после первого перетаскивания в сессии — приглушены (сброс при входе в космический режим). */
  const [cosmicOrbDragHintsSoft, setCosmicOrbDragHintsSoft] = useState(false);
  const [cosmicOrbHintChipVisible, setCosmicOrbHintChipVisible] = useState(false);
  const [sideEarRailCollapsed, setSideEarRailCollapsed] = useState(() => {
    if (readSideEarCosmicCompactFromLs()) return true;
    return readSideEarRailCollapsedFromLs();
  });
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
  /** Непрочитанные превью: [0] — самое свежее, дальше — более ранние. */
  const [phantomUnreadStack, setPhantomUnreadStack] = useState<SideEarUnreadPhantom[]>([]);
  /** Индекс в `phantomUnreadStack` (0 = свежее). */
  const [phantomUnreadStackIndex, setPhantomUnreadStackIndex] = useState(0);
  /** Поле быстрого ответа из фантома. */
  const [earPhantomReplyOpen, setEarPhantomReplyOpen] = useState(false);
  const [earPhantomReplyDraft, setEarPhantomReplyDraft] = useState('');
  /** Якорь цитаты: совпадает с сообщением, показанным в превью ушка (в т.ч. при листании стека). */
  const [phantomReplyAnchor, setPhantomReplyAnchor] = useState<SideEarUnreadPhantom | null>(null);
  /** Последнее значение `unreadPhantom` до текущего рендера — для стека «свежее / предыдущее». */
  const lastUnreadPhantomSnapRef = useRef<SideEarUnreadPhantom | null>(null);
  /** Скролл раскрытого превью к хвосту после смены текста / id (WebKit иногда не пересчитывает без толчка). */
  const phantomUnreadLinesRef = useRef<HTMLDivElement | null>(null);
  /** Режим отправки: с подстановкой цитаты из якоря или только текст поля. */
  const [earPhantomReplyIncludeQuote, setEarPhantomReplyIncludeQuote] = useState(false);
  const [earPhantomReplyEmojiOpen, setEarPhantomReplyEmojiOpen] = useState(false);
  const [phantomReplyEmojiTab, setPhantomReplyEmojiTab] = useState<TableChatPickerTabId>('react');
  const [phantomReplyEmojiExpanded, setPhantomReplyEmojiExpanded] = useState(false);
  const phantomReplyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const phantomReplyEmojiToggleRef = useRef<HTMLButtonElement>(null);
  const phantomReplyEmojiPanelRef = useRef<HTMLDivElement>(null);
  const phantomReplyResizeSessionRef = useRef({
    active: false,
    pointerId: -1,
    startY: 0,
    startHeight: 0,
  });
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
  const cosmicOrbPosRef = useRef(cosmicOrbPos);
  cosmicOrbPosRef.current = cosmicOrbPos;
  const cosmicOrbDragRef = useRef({
    active: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startOrbX: 0,
    startOrbY: 0,
    dragging: false,
  });
  const cosmicOrbDragWindowHandlersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);
  const cosmicOrbHintChipTimerRef = useRef<number | null>(null);
  const sideEarDragRef = useRef({
    active: false,
    pointerId: -1,
    startClientY: 0,
    startCenterPct: SIDE_EAR_DEFAULT_CENTER_PCT,
    dragging: false,
    earHalfClampPx: SIDE_EAR_SHELL_HALF_HEIGHT_ESTIMATE_PX,
    /** Смещение центра по Y относительно точки старта drag (px), последнее по pointer (для up). */
    lastDragOffsetPx: 0,
    dragWillChangeSet: false,
    /** На время drag фиксируем высоту shell — иначе -50% и контент (печатает/непрочитано) дают микропрыжки. */
    dragLayoutLocked: false,
    /** Снимок на pointerdown — стабильная геометрия на весь жест (меньше дрожания от скачков innerHeight/%). */
    innerHSnap: 0,
    startCenterPxSnap: 0,
  });
  /** Снятие window-listeners при up или размонтировании (те же ссылки, что в addEventListener). */
  const sideEarDragWindowHandlersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
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
    const bodyZoom = MOBILE_CHAT_FONT_SCALES[mobileChatFontStep] ?? 1;
    /* Ввод: мягче ленты — чуть крупнее шрифт, без раздувания полоски. */
    const inputFs = 1 + (bodyZoom - 1) * 0.28;
    return {
      ['--mobile-chat-messages-height' as string]: `${mobileMessagesHeight}px`,
      ['--tch-body-zoom' as string]: String(bodyZoom),
      ['--tch-input-fs' as string]: String(inputFs),
      ...(mobileLsBottomChrome
        ? {
            ['--ls-chat-body-h' as string]: `${lsChatBodyH}px`,
            ['--ls-chat-lift' as string]: `${Math.max(0, lsChatBodyH - lsChatBodyBaseH())}px`,
          }
        : {}),
    };
  }, [mobileChatFontStep, mobileMessagesHeight, variant, mobileLsBottomChrome, lsChatBodyH]);

  const visibleFeedMessages = useMemo(
    () =>
      messages.filter((m) => {
        if (isChatReactionControlBody(m.body)) return false;
        if (hiddenMsgIds.has(m.id)) return false;
        if (m.user_id !== userId && hiddenUserIds.has(m.user_id)) return false;
        return true;
      }),
    [messages, hiddenMsgIds, hiddenUserIds, userId],
  );
  const reactionsByMessageId = useMemo(
    () => aggregateChatReactions(messages, userId),
    [messages, userId],
  );
  const displayMessages = useMemo(() => {
    const q = chatSearchQuery.trim();
    const filtered = q
      ? visibleFeedMessages.filter((m) => messageMatchesChatSearch(m, q))
      : visibleFeedMessages;
    if (chatNewestFirst) return [...filtered].reverse();
    return filtered;
  }, [visibleFeedMessages, chatNewestFirst, chatSearchQuery]);
  const mobileFeedKind = tableChatFeedKind({ mobileEmbedHost: Boolean(mobileEmbedHost) });

  const [mySnippets, setMySnippets] = useState<string[]>(() => loadMySnippetsFromLs());
  const [mineDraft, setMineDraft] = useState('');
  const [mineEditIndex, setMineEditIndex] = useState<number | null>(null);
  const [mobileMineEditMode, setMobileMineEditMode] = useState(false);
  const [mobileMineToast, setMobileMineToast] = useState<string | null>(null);
  const mobileMineToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressSessionRef = useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({
    timer: null,
    fired: false,
  });

  const updateMobileFavoritesOverflow = useCallback(() => {
    const { left, right } = readHScrollOverflow(mobileFavoritesRef.current);
    setMobileFavCanScrollLeft(left);
    setMobileFavCanScrollRight(right);
  }, []);

  const scrollMobileFavoritesBy = useCallback((dir: 1 | -1) => {
    const el = mobileFavoritesRef.current;
    if (!el) return;
    const step = Math.max(80, Math.round(el.clientWidth * 0.62));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  const updateMobileEmojiTabsOverflow = useCallback(() => {
    const { left, right } = readHScrollOverflow(mobileEmojiTabsRef.current);
    setMobileEmojiTabsCanScrollLeft(left);
    setMobileEmojiTabsCanScrollRight(right);
  }, []);

  const scrollMobileEmojiTabsBy = useCallback((dir: 1 | -1) => {
    const el = mobileEmojiTabsRef.current;
    if (!el) return;
    const step = Math.max(72, Math.round(el.clientWidth * 0.7));
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  }, []);

  useLayoutEffect(() => {
    if (variant !== 'mobile' || mySnippets.length === 0) {
      setMobileFavCanScrollLeft(false);
      setMobileFavCanScrollRight(false);
      return;
    }
    updateMobileFavoritesOverflow();
    const el = mobileFavoritesRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateMobileFavoritesOverflow()) : null;
    ro?.observe(el);
    const t = window.setTimeout(updateMobileFavoritesOverflow, 80);
    return () => {
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [variant, mySnippets, mobileOpen, mobileEmbedHost, updateMobileFavoritesOverflow]);

  useLayoutEffect(() => {
    if (variant !== 'mobile' || !emojiPickerOpen) {
      setMobileEmojiTabsCanScrollLeft(false);
      setMobileEmojiTabsCanScrollRight(false);
      return;
    }
    updateMobileEmojiTabsOverflow();
    const el = mobileEmojiTabsRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => updateMobileEmojiTabsOverflow()) : null;
    ro?.observe(el);
    const t = window.setTimeout(updateMobileEmojiTabsOverflow, 80);
    return () => {
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [variant, emojiPickerOpen, emojiTab, mobileEmbedHost, mobileLsBottomChrome, updateMobileEmojiTabsOverflow]);

  useLayoutEffect(() => {
    if (variant !== 'mobile' || !emojiPickerOpen) return;
    const scroller = mobileEmojiTabsRef.current;
    if (!scroller) return;
    const tabEl = scroller.querySelector(`[data-emoji-tab="${emojiTab}"]`);
    if (!(tabEl instanceof HTMLElement)) return;
    const run = () => scrollChipFullyIntoHScroll(scroller, tabEl);
    run();
    const t = window.setTimeout(run, 40);
    return () => window.clearTimeout(t);
  }, [variant, emojiPickerOpen, emojiTab]);

  /** ПК: короткая подсказка «Мои» (кнопка ?) */
  const [minePcHelpOpen, setMinePcHelpOpen] = useState(false);
  /** Ключ ячейки «эмодзи+индекс» для неон-вспышки звезды после добавления в «Мои» */
  const [mineStarFlashKey, setMineStarFlashKey] = useState<string | null>(null);
  const mineStarFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emojiCells = useMemo(() => {
    if (emojiTab === 'phrases' || emojiTab === 'mine') return [];
    return getEmojiCellsForTab(emojiTab, emojiBankExpanded);
  }, [emojiTab, emojiBankExpanded]);

  const phantomReplyEmojiPanelDomId = `${emojiPanelDomId}-phantom-reply`;

  const phantomReplyEmojiCells = useMemo(() => {
    if (phantomReplyEmojiTab === 'mine' || phantomReplyEmojiTab === 'phrases') return [];
    return getEmojiCellsForTab(phantomReplyEmojiTab, phantomReplyEmojiExpanded);
  }, [phantomReplyEmojiTab, phantomReplyEmojiExpanded]);

  useEffect(() => {
    try {
      localStorage.setItem(MY_SNIPPETS_LS_KEY, JSON.stringify(mySnippets));
    } catch {
      /* ignore */
    }
  }, [mySnippets]);

  useEffect(() => {
    setHiddenMsgIds(loadHiddenChatMessageIds(roomId));
    setHiddenUserIds(loadHiddenChatUserIds(roomId));
    setChatHideUndo(null);
    setChatHiddenPanelOpen(false);
    setChatSearchOpen(false);
    setChatSearchQuery('');
    if (chatHideUndoTimerRef.current) {
      clearTimeout(chatHideUndoTimerRef.current);
      chatHideUndoTimerRef.current = null;
    }
    for (const t of feedNameFoldTimersRef.current.values()) clearTimeout(t);
    feedNameFoldTimersRef.current.clear();
    setExpandedFeedNames(new Set());
  }, [roomId]);

  useEffect(() => {
    return () => {
      if (mineStarFlashTimerRef.current) clearTimeout(mineStarFlashTimerRef.current);
      if (mobileMineToastTimerRef.current) clearTimeout(mobileMineToastTimerRef.current);
      if (chatHideUndoTimerRef.current) clearTimeout(chatHideUndoTimerRef.current);
      if (composerFlashTimerRef.current) clearTimeout(composerFlashTimerRef.current);
      if (longPressSessionRef.current.timer) clearTimeout(longPressSessionRef.current.timer);
      for (const t of feedNameFoldTimersRef.current.values()) clearTimeout(t);
      feedNameFoldTimersRef.current.clear();
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

  useEffect(() => {
    if (!earPhantomReplyEmojiOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.table-chat-side-ear-phantom__reply-emoji-popover')) return;
      if (phantomReplyEmojiToggleRef.current?.contains(t)) return;
      setEarPhantomReplyEmojiOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEarPhantomReplyEmojiOpen(false);
    };
    /* После клика «открыть», чтобы тот же тап не закрыл панель сразу. */
    const attachId = window.setTimeout(() => {
      document.addEventListener('click', onDoc, true);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(attachId);
      document.removeEventListener('click', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [earPhantomReplyEmojiOpen]);

  const insertPhantomReplySnippet = useCallback((ch: string) => {
    const ta = phantomReplyTextareaRef.current;
    setEarPhantomReplyDraft((prev) => {
      const start = ta?.selectionStart ?? prev.length;
      const end = ta?.selectionEnd ?? prev.length;
      const merged = (prev.slice(0, start) + ch + prev.slice(end)).slice(0, MAX_BODY);
      const nextPos = Math.min(start + ch.length, merged.length);
      requestAnimationFrame(() => {
        ta?.focus();
        try {
          ta?.setSelectionRange(nextPos, nextPos);
        } catch {
          /* ignore */
        }
      });
      return merged;
    });
  }, []);

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

  const onPhantomReplyEmojiToggle = useCallback(() => {
    setEarPhantomReplyEmojiOpen((o) => {
      const next = !o;
      if (next) {
        setEmojiPickerOpen(false);
        setPhantomReplyEmojiExpanded(false);
        phantomReplyTextareaRef.current?.blur();
      }
      return next;
    });
  }, []);

  const onPhantomReplyResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const ta = phantomReplyTextareaRef.current;
      if (!ta || sending) return;
      const session = phantomReplyResizeSessionRef.current;
      session.active = true;
      session.pointerId = e.pointerId;
      session.startY = e.clientY;
      session.startHeight = ta.getBoundingClientRect().height;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [sending],
  );

  const onPhantomReplyResizePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const session = phantomReplyResizeSessionRef.current;
    if (!session.active || e.pointerId !== session.pointerId) return;
    const ta = phantomReplyTextareaRef.current;
    if (!ta) return;
    e.preventDefault();
    const dy = e.clientY - session.startY;
    const next = Math.round(
      Math.min(
        PHANTOM_REPLY_INPUT_MAX_H,
        Math.max(PHANTOM_REPLY_INPUT_MIN_H, session.startHeight + dy),
      ),
    );
    ta.style.height = `${next}px`;
  }, []);

  const onPhantomReplyResizePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const session = phantomReplyResizeSessionRef.current;
    if (!session.active || e.pointerId !== session.pointerId) return;
    session.active = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onEmojiToggle = useCallback(() => {
    setEarPhantomReplyEmojiOpen(false);
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

  const onEmojiTab = useCallback(
    (id: TableChatPickerTabId) => {
      /* Повторный тап по уже открытой вкладке — закрыть панель эмодзи/фраз. */
      if (emojiPickerOpen && emojiTab === id) {
        setEmojiPickerOpen(false);
        return;
      }
      setEmojiTab(id);
      setEmojiBankExpanded(false);
    },
    [emojiPickerOpen, emojiTab],
  );

  const onMobileQuickMine = useCallback(() => {
    if (variant !== 'mobile') return;
    setEmojiPickerOpen((open) => !(open && emojiTab === 'mine'));
    if (emojiTab !== 'mine') {
      setEmojiTab('mine');
      setEmojiBankExpanded(false);
    }
  }, [emojiTab, variant]);

  const onMobileQuickPhrases = useCallback(() => {
    if (variant !== 'mobile') return;
    setEmojiPickerOpen((open) => !(open && emojiTab === 'phrases'));
    if (emojiTab !== 'phrases') {
      setEmojiTab('phrases');
      setEmojiBankExpanded(false);
    }
  }, [emojiTab, variant]);

  const onMobileChatFontStepUp = useCallback(() => {
    if (variant !== 'mobile') return;
    setMobileChatFontStep((prev) => {
      const next = Math.min(prev + 1, MOBILE_CHAT_FONT_SCALES.length - 1);
      writeMobileChatFontStepToLs(next);
      return next;
    });
  }, [variant]);

  const onMobileChatFontStepDown = useCallback(() => {
    if (variant !== 'mobile') return;
    setMobileChatFontStep((prev) => {
      const next = Math.max(prev - 1, 0);
      writeMobileChatFontStepToLs(next);
      return next;
    });
  }, [variant]);

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

  const removeMineSnippet = useCallback((index: number) => {
    setMySnippets((prev) => prev.filter((_, i) => i !== index));
    setMineEditIndex((cur) => {
      if (cur == null) return cur;
      if (cur === index) {
        setMineDraft('');
        return null;
      }
      return cur > index ? cur - 1 : cur;
    });
  }, []);

  const commitMineDraft = useCallback(() => {
    const t = mineDraft.trim().slice(0, MY_SNIPPETS_MAX_LEN);
    if (!t) return;
    if (mineEditIndex != null) {
      setMySnippets((prev) => {
        if (mineEditIndex < 0 || mineEditIndex >= prev.length) return prev;
        const next = [...prev];
        next[mineEditIndex] = t;
        return dedupeMySnippets(next);
      });
      setMineEditIndex(null);
      setMineDraft('');
      return;
    }
    addMineSnippet(mineDraft);
    setMineDraft('');
  }, [mineDraft, mineEditIndex, addMineSnippet]);

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
      if (isChatReactionControlBody(row.body)) return;
      /** Без ушка тоже помечаем непрочитанное — точка на кнопке «Чат». */
      if (!mobileOpenRef.current && row.user_id !== userId) {
        const seen = seenUpToCreatedAtRef.current;
        if (!seen || row.created_at > seen) {
          setSideEarUnread(true);
          if (mobileSideEarEnabled) {
            setUnreadPhantom(formatUnreadPhantomFromMessage(row));
          }
        }
      }
    },
    [mobileSideEarEnabled, userId],
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
    setPhantomUnreadStack([]);
    setPhantomUnreadStackIndex(0);
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
      body:
        `Свежее «входящее» #${seq} (${new Date().toLocaleTimeString('ru-RU')}) — превью ушка сменится; черновик ответа во фантоме не сбрасывается. ` +
        'Текст для проверки скролла и «Развернуть»: несколько строк в свёрнутом превью, полное окно со скроллбаром после разворота. ' +
        'Повтор для высоты блока — АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ 0123456789.',
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, row].slice(-FETCH_LIMIT));
    if (mobileSideEarEnabled && !mobileOpenRef.current) {
      setSideEarUnread(true);
      setUnreadPhantom(formatUnreadPhantomFromMessage(row));
    }
  }, [offlineUiLab, offlineUiLabIncomingSeq, roomId, mobileSideEarEnabled]);

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
    if (variant !== 'mobile' || !mobileOpen || mobileEmbedHost) {
      setCollapseHintOn(false);
      setSortSparkHintOn(false);
      return;
    }
    setCollapseHintOn(true);
    setSortSparkHintOn(true);
    const collapseT = window.setTimeout(() => setCollapseHintOn(false), 4000);
    const sparkT = window.setTimeout(() => setSortSparkHintOn(false), 14000);
    return () => {
      window.clearTimeout(collapseT);
      window.clearTimeout(sparkT);
    };
  }, [mobileOpen, variant, mobileEmbedHost, openMobileNonce]);

  useEffect(() => {
    if (!mobileEastHeaderCompact) setEastToolsMenuOpen(false);
  }, [mobileEastHeaderCompact]);

  useEffect(() => {
    if (!eastToolsMenuOpen) return;
    const onPtr = (ev: PointerEvent) => {
      const root = eastToolsMenuRef.current;
      if (!root) return;
      if (ev.target instanceof Node && root.contains(ev.target)) return;
      setEastToolsMenuOpen(false);
    };
    window.addEventListener('pointerdown', onPtr, true);
    return () => window.removeEventListener('pointerdown', onPtr, true);
  }, [eastToolsMenuOpen]);

  useEffect(() => {
    if (variant === 'mobile' && !mobileOpen) setEmojiPickerOpen(false);
  }, [variant, mobileOpen]);

  useEffect(() => {
    if (variant !== 'mobile') return;
    onMobileChatCollapsedChange?.(!mobileOpen);
  }, [variant, mobileOpen, onMobileChatCollapsedChange]);

  useLayoutEffect(() => {
    if (variant !== 'mobile' || !openMobileNonce) return;
    setMobileOpen(true);
  }, [openMobileNonce, variant]);

  /** Диск/мини: чат в потоке внизу — прокрутить страницу к низу дока (не overlay). */
  useLayoutEffect(() => {
    if (variant !== 'mobile' || !mobileOpen || !openMobileNonce || mobileEmbedHost) return;
    const timer = window.setTimeout(() => {
      const el = dockRef.current;
      if (!el) return;
      const wrap = el.closest('.game-table-main-wrap');
      if (wrap instanceof HTMLElement) {
        try {
          wrap.scrollTo({ top: wrap.scrollHeight, behavior: 'smooth' });
        } catch {
          wrap.scrollTop = wrap.scrollHeight;
        }
      }
      try {
        el.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'smooth' });
      } catch {
        el.scrollIntoView({ block: 'end', inline: 'nearest' });
      }
    }, 40);
    return () => window.clearTimeout(timer);
  }, [openMobileNonce, mobileOpen, variant, mobileEmbedHost]);

  const prevMobileOpenRef = useRef(mobileOpen);
  useLayoutEffect(() => {
    const wasOpen = prevMobileOpenRef.current;
    prevMobileOpenRef.current = mobileOpen;
    if (variant !== 'mobile' || mobileEmbedHost) return;
    if (!wasOpen || mobileOpen) return;
    const wrap =
      (typeof document !== 'undefined' &&
        document.querySelector(
          '.game-table-root.viewport-mobile.viewport-mobile-landscape .game-table-main-wrap',
        )) ||
      null;
    if (wrap instanceof HTMLElement) {
      try {
        wrap.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        wrap.scrollTop = 0;
      }
    }
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      window.scrollTo(0, 0);
    }
  }, [mobileOpen, variant, mobileEmbedHost]);

  /** Встроенный чат справа: открыть при появлении колонки, не форсить после «свернуть». */
  useEffect(() => {
    if (variant !== 'mobile') return;
    const prev = prevMobileEmbedHostRef.current;
    prevMobileEmbedHostRef.current = mobileEmbedHost;
    if (mobileEmbedHost && !prev) setMobileOpen(true);
    if (!mobileEmbedHost && prev) setMobileOpen(false);
  }, [mobileEmbedHost, variant]);

  useEffect(() => {
    if (variant !== 'mobile' || emojiTab !== 'mine') setMobileMineEditMode(false);
  }, [emojiTab, variant]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (variant === 'mobile' && !mobileOpen) return;
    if (chatNewestFirst) {
      const stickToLatest = el.scrollTop < 72;
      if (stickToLatest) el.scrollTop = 0;
      return;
    }
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (variant === 'mobile' && mobileEmbedHost) {
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (dist < 80) el.scrollTop = el.scrollHeight;
  }, [messages, mobileOpen, variant, mobileEmbedHost, chatNewestFirst]);

  const resizeComposer = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (mobileLsBottomChrome) {
      ta.style.height = '';
      return;
    }
    ta.style.height = 'auto';
    const max = variant === 'mobile' ? 100 : 120;
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [variant, mobileLsBottomChrome]);

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
    setMobileMessagesHeight(clampMobilePortraitChatH(next));
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
      const clamped = clampMobilePortraitChatH(next);
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
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
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
      e.stopPropagation();
    },
    [mobileMessagesHeight, onMobileResizePointerMove, onMobileResizePointerUp, variant],
  );

  const onLsChatResizePointerMove = useCallback((e: PointerEvent) => {
    const s = lsChatResizeSessionRef.current;
    if (!s.active || e.pointerId !== s.pointerId) return;
    const next = s.startHeight + (s.startY - e.clientY);
    setLsChatBodyH(clampLsChatBodyH(next));
  }, []);

  const onLsChatResizePointerUp = useCallback(
    (e: PointerEvent) => {
      const s = lsChatResizeSessionRef.current;
      if (!s.active || e.pointerId !== s.pointerId) return;
      s.active = false;
      window.removeEventListener('pointermove', onLsChatResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onLsChatResizePointerUp);
      window.removeEventListener('pointercancel', onLsChatResizePointerUp);
      const next = clampLsChatBodyH(s.startHeight + (s.startY - e.clientY));
      setLsChatBodyH(next);
      writeLsChatBodyHToLs(next);
    },
    [onLsChatResizePointerMove],
  );

  const startLsChatResize = useCallback(
    (e: ReactPointerEvent) => {
      if (variant !== 'mobile' || !mobileLsBottomChrome) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lsChatResizeSessionRef.current = {
        active: true,
        pointerId: e.pointerId,
        startY: e.clientY,
        startHeight: lsChatBodyH,
      };
      window.addEventListener('pointermove', onLsChatResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.addEventListener('pointerup', onLsChatResizePointerUp);
      window.addEventListener('pointercancel', onLsChatResizePointerUp);
      e.preventDefault();
      e.stopPropagation();
    },
    [
      lsChatBodyH,
      mobileLsBottomChrome,
      onLsChatResizePointerMove,
      onLsChatResizePointerUp,
      variant,
    ],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onLsChatResizePointerMove, PC_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', onLsChatResizePointerUp);
      window.removeEventListener('pointercancel', onLsChatResizePointerUp);
      lsChatResizeSessionRef.current.active = false;
    };
  }, [onLsChatResizePointerMove, onLsChatResizePointerUp]);

  useEffect(() => {
    const onWin = () => setLsChatBodyH((h) => clampLsChatBodyH(h));
    window.addEventListener('resize', onWin);
    return () => window.removeEventListener('resize', onWin);
  }, []);

  useEffect(() => {
    if (!chatSearchOpen) return;
    const t = window.setTimeout(() => chatSearchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [chatSearchOpen]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (variant === 'mobile' && !mobileOpen) return;
    if (chatNewestFirst) el.scrollTop = 0;
    else el.scrollTop = el.scrollHeight;
  }, [chatNewestFirst, mobileOpen, variant]);

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
        if (!isChatReactionControlBody(row.body)) {
          onOwnMessageSent?.(row);
        }
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
    const addressed = feedAddressTo ? buildAddressedChatBody(feedAddressTo, t, MAX_BODY) : t;
    const body = feedReplyAnchor
      ? buildPhantomContextualReplyBody(addressed, feedReplyAnchor, MAX_BODY)
      : addressed;
    if (!body.trim()) return;
    if (offlineUiLab) {
      const r = await sendTrimmedChatBody(body);
      if (r.ok) {
        setText('');
        setFeedReplyAnchor(null);
        setFeedAddressTo(null);
        resizeComposer();
      }
      return;
    }
    setText('');
    const replyAnchorSnap = feedReplyAnchor;
    const addressSnap = feedAddressTo;
    setFeedReplyAnchor(null);
    setFeedAddressTo(null);
    resizeComposer();
    const r = await sendTrimmedChatBody(body);
    if (!r.ok) {
      setText(t);
      if (replyAnchorSnap) setFeedReplyAnchor(replyAnchorSnap);
      if (addressSnap) setFeedAddressTo(addressSnap);
    }
  }, [text, sending, sendTrimmedChatBody, resizeComposer, offlineUiLab, feedReplyAnchor, feedAddressTo]);

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
      setEarPhantomReplyEmojiOpen(false);
      setEarPhantomReplyOpen(false);
      setPhantomReplyAnchor(null);
      setSideEarPhantomDismissed(null);
      if (mobileSideEarEnabled && !mobileOpenRef.current) {
        setUnreadPhantom(formatOwnPhantomEchoAfterSend(rawDraft, displayName, res.row ?? null));
        setSideEarUnread(true);
      }
    }
  }, [
    earPhantomReplyDraft,
    earPhantomReplyIncludeQuote,
    sending,
    sendTrimmedChatBody,
    mobileSideEarEnabled,
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

  const collapseAllFeedNames = useCallback(() => {
    for (const t of feedNameFoldTimersRef.current.values()) clearTimeout(t);
    feedNameFoldTimersRef.current.clear();
    setExpandedFeedNames((cur) => (cur.size === 0 ? cur : new Set()));
  }, []);

  const expandFeedName = useCallback((full: string) => {
    for (const [key, timer] of feedNameFoldTimersRef.current) {
      if (key === full) continue;
      clearTimeout(timer);
      feedNameFoldTimersRef.current.delete(key);
    }
    setExpandedFeedNames(new Set([full]));
    const prev = feedNameFoldTimersRef.current.get(full);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      feedNameFoldTimersRef.current.delete(full);
      setExpandedFeedNames((cur) => {
        if (!cur.has(full)) return cur;
        const next = new Set(cur);
        next.delete(full);
        return next;
      });
    }, TABLE_CHAT_NAME_FOLD_MS);
    feedNameFoldTimersRef.current.set(full, t);
  }, []);

  const toggleFeedName = useCallback(
    (full: string, currentlyExpanded: boolean) => {
      if (currentlyExpanded) {
        const prev = feedNameFoldTimersRef.current.get(full);
        if (prev) {
          clearTimeout(prev);
          feedNameFoldTimersRef.current.delete(full);
        }
        setExpandedFeedNames((cur) => {
          if (!cur.has(full)) return cur;
          const next = new Set(cur);
          next.delete(full);
          return next;
        });
        return;
      }
      expandFeedName(full);
    },
    [expandFeedName],
  );

  const copyBody = useCallback((body: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(chatBodyForClipboard(body) || body);
    }
  }, []);

  const closeMsgActionMenu = useCallback(() => {
    setMsgActionMode(null);
    setMsgActionTarget(null);
  }, []);

  const openMsgActionSheet = useCallback((row: RoomChatMessageRow) => {
    if (row.id.startsWith('opt-')) return;
    collapseAllFeedNames();
    setChatHiddenPanelOpen(false);
    setMsgActionTarget(formatUnreadPhantomFromMessage(row));
    setMsgActionMode('sheet');
    setEmojiPickerOpen(false);
    setEarPhantomReplyEmojiOpen(false);
  }, [collapseAllFeedNames]);

  const openMsgReactSheet = useCallback((row: RoomChatMessageRow) => {
    if (row.id.startsWith('opt-')) return;
    setChatHiddenPanelOpen(false);
    setMsgActionTarget(formatUnreadPhantomFromMessage(row));
    setMsgActionMode('react');
    setEmojiPickerOpen(false);
    setEarPhantomReplyEmojiOpen(false);
  }, []);

  const openMsgNameSheet = useCallback((row: RoomChatMessageRow) => {
    if (row.id.startsWith('opt-') || row.user_id === userId) return;
    setChatHiddenPanelOpen(false);
    setMsgActionTarget(formatUnreadPhantomFromMessage(row));
    setMsgActionMode('name');
    setEmojiPickerOpen(false);
    setEarPhantomReplyEmojiOpen(false);
  }, [userId]);

  const armChatHideUndo = useCallback((next: { kind: 'msg' | 'user'; id: string; label: string }) => {
    if (chatHideUndoTimerRef.current) clearTimeout(chatHideUndoTimerRef.current);
    setChatHideUndo(next);
    chatHideUndoTimerRef.current = setTimeout(() => {
      setChatHideUndo(null);
      chatHideUndoTimerRef.current = null;
    }, 4200);
  }, []);

  const hideChatMessage = useCallback(() => {
    if (!msgActionTarget || !roomId) return;
    const id = msgActionTarget.messageId;
    const hideCopy = tableChatMessageSheetHideCopy(msgActionTarget.userId === userId);
    setHiddenMsgIds((prev) => {
      const next = withHiddenId(prev, id);
      persistHiddenChatMessageIds(roomId, next);
      return next;
    });
    armChatHideUndo({ kind: 'msg', id, label: hideCopy.undo });
    closeMsgActionMenu();
  }, [msgActionTarget, roomId, userId, armChatHideUndo, closeMsgActionMenu]);

  const hideChatUser = useCallback(() => {
    const uid = msgActionTarget?.userId;
    if (!uid || uid === userId || !roomId) return;
    setHiddenUserIds((prev) => {
      const next = withHiddenId(prev, uid);
      persistHiddenChatUserIds(roomId, next);
      return next;
    });
    const name = msgActionTarget.author.trim() || 'игрока';
    armChatHideUndo({ kind: 'user', id: uid, label: `Сообщения ${name} скрыты` });
    closeMsgActionMenu();
  }, [msgActionTarget, userId, roomId, armChatHideUndo, closeMsgActionMenu]);

  const undoChatHide = useCallback(() => {
    if (!chatHideUndo || !roomId) return;
    if (chatHideUndo.kind === 'msg') {
      setHiddenMsgIds((prev) => {
        const next = withoutHiddenId(prev, chatHideUndo.id);
        persistHiddenChatMessageIds(roomId, next);
        return next;
      });
    } else {
      setHiddenUserIds((prev) => {
        const next = withoutHiddenId(prev, chatHideUndo.id);
        persistHiddenChatUserIds(roomId, next);
        return next;
      });
    }
    setChatHideUndo(null);
    if (chatHideUndoTimerRef.current) {
      clearTimeout(chatHideUndoTimerRef.current);
      chatHideUndoTimerRef.current = null;
    }
  }, [chatHideUndo, roomId]);

  const copyMsgActionTarget = useCallback(() => {
    if (!msgActionTarget) return;
    copyBody(msgActionTarget.body);
    closeMsgActionMenu();
  }, [msgActionTarget, copyBody, closeMsgActionMenu]);

  const hiddenUserEntries = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const m of messages) {
      if (!hiddenUserIds.has(m.user_id) || m.user_id === userId || seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      out.push({ id: m.user_id, name: m.display_name.trim() || 'Игрок' });
    }
    for (const id of hiddenUserIds) {
      if (id === userId || seen.has(id)) continue;
      out.push({ id, name: 'Игрок' });
    }
    return out;
  }, [messages, hiddenUserIds, userId]);

  const hiddenSoloMsgCount = useMemo(
    () => messages.filter((m) => hiddenMsgIds.has(m.id) && !hiddenUserIds.has(m.user_id)).length,
    [messages, hiddenMsgIds, hiddenUserIds],
  );
  const hasLocalHidden = hiddenMsgIds.size > 0 || hiddenUserIds.size > 0;

  useEffect(() => {
    if (!hasLocalHidden && chatHiddenPanelOpen) setChatHiddenPanelOpen(false);
  }, [hasLocalHidden, chatHiddenPanelOpen]);

  const unhideChatUserById = useCallback(
    (uid: string) => {
      if (!roomId || !uid) return;
      setHiddenUserIds((prev) => {
        const next = withoutHiddenId(prev, uid);
        persistHiddenChatUserIds(roomId, next);
        return next;
      });
    },
    [roomId],
  );

  const unhideAllHiddenMessages = useCallback(() => {
    if (!roomId) return;
    setHiddenMsgIds(() => {
      const next = new Set<string>();
      persistHiddenChatMessageIds(roomId, next);
      return next;
    });
  }, [roomId]);

  const unhideAllHiddenChat = useCallback(() => {
    if (!roomId) return;
    setHiddenMsgIds(() => {
      const next = new Set<string>();
      persistHiddenChatMessageIds(roomId, next);
      return next;
    });
    setHiddenUserIds(() => {
      const next = new Set<string>();
      persistHiddenChatUserIds(roomId, next);
      return next;
    });
    setChatHiddenPanelOpen(false);
  }, [roomId]);

  const flashComposerField = useCallback(() => {
    const shell = inputShellRef.current;
    if (shell) {
      shell.classList.remove('table-chat-mobile-input-shell--flash');
      void shell.offsetWidth;
      shell.classList.add('table-chat-mobile-input-shell--flash');
    }
    setComposerFlashOn(true);
    if (composerFlashTimerRef.current) clearTimeout(composerFlashTimerRef.current);
    composerFlashTimerRef.current = setTimeout(() => {
      setComposerFlashOn(false);
      inputShellRef.current?.classList.remove('table-chat-mobile-input-shell--flash');
      composerFlashTimerRef.current = null;
    }, 2600);
  }, []);

  const focusComposerField = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    try {
      const pos = ta.value.length;
      ta.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
  }, []);

  const beginFeedQuoteReply = useCallback(() => {
    if (!msgActionTarget) return;
    setFeedReplyAnchor(msgActionTarget);
    closeMsgActionMenu();
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusComposerField();
        flashComposerField();
      });
    });
  }, [msgActionTarget, closeMsgActionMenu, flashComposerField, focusComposerField]);

  const beginFeedAddressSender = useCallback(() => {
    if (!msgActionTarget) return;
    const name = msgActionTarget.author.trim() || 'Игрок';
    setFeedAddressTo(name);
    closeMsgActionMenu();
    setEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        focusComposerField();
        flashComposerField();
      });
    });
  }, [msgActionTarget, closeMsgActionMenu, flashComposerField, focusComposerField]);

  const toggleMsgReaction = useCallback(
    async (targetId: string, emoji: string) => {
      const id = targetId.trim();
      const emo = emoji.trim();
      if (!id || !emo || sending || id.startsWith('opt-')) return;
      const mine = myReactionEmoji(reactionsByMessageId.get(id));
      const op = mine === emo ? 'clear' : 'set';
      closeMsgActionMenu();
      await sendTrimmedChatBody(buildChatReactionBody(id, emo, op));
    },
    [sending, reactionsByMessageId, closeMsgActionMenu, sendTrimmedChatBody],
  );

  const sendMsgReaction = useCallback(
    async (emoji: string) => {
      if (!msgActionTarget) return;
      await toggleMsgReaction(msgActionTarget.messageId, emoji);
    },
    [msgActionTarget, toggleMsgReaction],
  );

  const msgReactMineSnippets = useMemo(
    () => mySnippets.filter((s) => isLikelyEmojiSnippet(s)),
    [mySnippets],
  );
  const msgActionMineEmoji = msgActionTarget
    ? myReactionEmoji(reactionsByMessageId.get(msgActionTarget.messageId))
    : null;

  const feedReplyPreview = useMemo(() => {
    if (!feedReplyAnchor) return null;
    const author = feedReplyAnchor.author.trim() || 'Собеседник';
    const excerpt = truncatePhantomQuoteExcerpt(feedReplyAnchor.body, 48);
    return { author, excerpt };
  }, [feedReplyAnchor]);

  useEffect(() => {
    if (!msgActionMode && !chatHiddenPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMsgActionMenu();
        setChatHiddenPanelOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [msgActionMode, chatHiddenPanelOpen, closeMsgActionMenu]);

  const clampSideEarY = useCallback((pct: number) => {
    if (typeof window === 'undefined') return pct;
    const ih = window.innerHeight;
    const rect = sideEarShellRef.current?.getBoundingClientRect();
    const h = rect && rect.height >= 8 ? rect.height : 96;
    return clampSideEarCenterPct(pct, ih, h / 2);
  }, []);

  const sideEarShellStyle = useMemo((): CSSProperties => {
    if (sideEarCosmicCompact) {
      return {
        left: cosmicOrbPos.x,
        top: cosmicOrbPos.y,
        right: 'auto',
      };
    }
    return { top: `${sideEarCenterPct}%` };
  }, [sideEarCosmicCompact, cosmicOrbPos.x, cosmicOrbPos.y, sideEarCenterPct]);

  useEffect(() => {
    if (!sideEarCosmicCompact || typeof window === 'undefined') return;
    const onResize = () => {
      if (cosmicOrbDragRef.current.active) return;
      setCosmicOrbPos((p) => {
        const next = clampCosmicOrbPos(p.x, p.y);
        cosmicOrbPosRef.current = next;
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
    };
  }, [sideEarCosmicCompact]);

  useEffect(() => {
    if (!sideEarCosmicCompact || typeof window === 'undefined') return;
    setCosmicOrbHintChipVisible(true);
    if (cosmicOrbHintChipTimerRef.current != null) {
      clearTimeout(cosmicOrbHintChipTimerRef.current);
    }
    cosmicOrbHintChipTimerRef.current = window.setTimeout(() => {
      setCosmicOrbHintChipVisible(false);
      cosmicOrbHintChipTimerRef.current = null;
    }, COSMIC_ORB_HINT_CHIP_AUTO_HIDE_MS);
    return () => {
      if (cosmicOrbHintChipTimerRef.current != null) {
        clearTimeout(cosmicOrbHintChipTimerRef.current);
        cosmicOrbHintChipTimerRef.current = null;
      }
    };
  }, [sideEarCosmicCompact]);

  useEffect(() => {
    if (!mobileSideEarEnabled || typeof window === 'undefined') return;
    const onResize = () => {
      const d = sideEarDragRef.current;
      if (d.active) return;
      if (sideEarCosmicCompact) return;
      setSideEarCenterPct((p) => clampSideEarY(p));
    };
    window.addEventListener('resize', onResize);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', onResize);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      if (vv) vv.removeEventListener('resize', onResize);
    };
  }, [mobileSideEarEnabled, clampSideEarY, sideEarCosmicCompact]);

  useEffect(() => {
    return () => {
      const orbH = cosmicOrbDragWindowHandlersRef.current;
      if (orbH && typeof window !== 'undefined') {
        window.removeEventListener('pointermove', orbH.move, SIDE_EAR_POINTER_MOVE_OPTS);
        window.removeEventListener('pointerup', orbH.up);
        window.removeEventListener('pointercancel', orbH.up);
        cosmicOrbDragWindowHandlersRef.current = null;
      }
      cosmicOrbDragRef.current.active = false;
      const h = sideEarDragWindowHandlersRef.current;
      if (!h || typeof window === 'undefined') return;
      window.removeEventListener('pointermove', h.move, SIDE_EAR_POINTER_MOVE_OPTS);
      window.removeEventListener('pointerup', h.up);
      window.removeEventListener('pointercancel', h.up);
      sideEarDragWindowHandlersRef.current = null;
      const d = sideEarDragRef.current;
      d.active = false;
      d.lastDragOffsetPx = 0;
      const shellEl = sideEarShellRef.current;
      const shiftEl = sideEarDragShiftRef.current;
      shellEl?.classList.remove('table-chat-side-ear-shell--vertical-drag');
      if (shiftEl) {
        shiftEl.style.removeProperty('--side-ear-drag-y');
        shiftEl.style.removeProperty('transform');
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
      if (!mobileSideEarEnabled || sideEarCosmicCompact) return;
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (typeof window !== 'undefined') {
        const prev = sideEarDragWindowHandlersRef.current;
        if (prev) {
          window.removeEventListener('pointermove', prev.move, SIDE_EAR_POINTER_MOVE_OPTS);
          window.removeEventListener('pointerup', prev.up);
          window.removeEventListener('pointercancel', prev.up);
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
      sideEarDragShiftRef.current?.style.removeProperty('transform');
      sideEarDragShiftRef.current?.style.removeProperty('will-change');
      sideEarShellRef.current?.classList.remove('table-chat-side-ear-shell--vertical-drag');
      const ihSnap = typeof window !== 'undefined' ? window.innerHeight : 0;
      const pct0 = sideEarCenterPctRef.current;
      const startCenterPxSnap = (pct0 / 100) * ihSnap;
      sideEarDragRef.current = {
        active: true,
        pointerId: e.pointerId,
        startClientY: e.clientY,
        startCenterPct: pct0,
        dragging: false,
        earHalfClampPx,
        lastDragOffsetPx: 0,
        dragWillChangeSet: false,
        dragLayoutLocked: false,
        innerHSnap: ihSnap,
        startCenterPxSnap,
      };
      const paintSideEarDragTransform = (yPx: number) => {
        const st = sideEarDragRef.current;
        const el = sideEarDragShiftRef.current;
        if (!el || !st.dragging) return;
        if (!st.dragWillChangeSet) {
          el.style.willChange = 'transform';
          st.dragWillChangeSet = true;
        }
        el.style.transform = `translate3d(0, ${yPx}px, 0)`;
      };
      const ensureSideEarDragChrome = (wasDragging: boolean) => {
        const s = sideEarDragRef.current;
        if (!wasDragging && s.dragging) {
          sideEarShellRef.current?.classList.add('table-chat-side-ear-shell--vertical-drag');
        }
        if (!s.dragLayoutLocked) {
          const shellLock = sideEarShellRef.current;
          if (shellLock) {
            const hLock = Math.max(8, Math.ceil(shellLock.getBoundingClientRect().height));
            shellLock.style.height = `${hLock}px`;
            shellLock.style.boxSizing = 'border-box';
            s.dragLayoutLocked = true;
          }
        }
      };
      const applySideEarDragPosition = (clientY: number, ev: PointerEvent | null) => {
        const s = sideEarDragRef.current;
        if (!s.active || !s.dragging) return;
        const ih = s.innerHSnap;
        if (ih <= 0) return;
        const dy = clientY - s.startClientY;
        ev?.preventDefault();
        const nextPct = ((s.startCenterPxSnap + dy) / ih) * 100;
        const clamped = clampSideEarCenterPct(nextPct, ih, s.earHalfClampPx);
        const clampedCenterPx = (clamped / 100) * ih;
        s.lastDragOffsetPx = clampedCenterPx - s.startCenterPxSnap;
        paintSideEarDragTransform(s.lastDragOffsetPx);
      };
      const onMove = (ev: PointerEvent) => {
        const s = sideEarDragRef.current;
        if (!s.active || ev.pointerId !== s.pointerId) return;
        const wasDragging = s.dragging;
        if (!s.dragging) {
          for (const cev of sideEarDragThresholdSamples(ev)) {
            const dy0 = cev.clientY - s.startClientY;
            if (Math.abs(dy0) >= SIDE_EAR_DRAG_THRESHOLD_PX) {
              s.dragging = true;
              break;
            }
          }
        }
        if (!s.dragging) return;
        ensureSideEarDragChrome(wasDragging);
        applySideEarDragPosition(ev.clientY, ev);
      };
      const onUp = (ev: PointerEvent) => {
        const s = sideEarDragRef.current;
        if (!s.active || ev.pointerId !== s.pointerId) return;
        const wasDragging = s.dragging;
        if (wasDragging) {
          applySideEarDragPosition(ev.clientY, null);
        }
        s.active = false;
        s.dragging = false;
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
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
        el?.classList.remove('table-chat-side-ear-shell--vertical-drag');
        /* Не трогаем el.style.top — его задаёт React; removeProperty('top') ломал fixed-позицию до следующего коммита (рельса/ушко «пропадали» после тапа). */
        if (viz) {
          viz.style.removeProperty('--side-ear-drag-y');
          viz.style.removeProperty('transform');
          viz.style.removeProperty('will-change');
        }
        if (el && s.dragLayoutLocked) {
          el.style.removeProperty('height');
          el.style.removeProperty('box-sizing');
        }
        if (wasDragging) {
          sideEarSuppressClickRef.current = true;
          const ih = s.innerHSnap > 0 ? s.innerHSnap : window.innerHeight;
          const seed = ((s.startCenterPxSnap + s.lastDragOffsetPx) / ih) * 100;
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
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
      }
      try {
        shell.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [mobileSideEarEnabled, clampSideEarY],
  );

  const scrollToMobileChat = useCallback(() => {
    const target = mobileCollapsedChatDockRef.current ?? dockRef.current;
    if (!target) return;
    try {
      target.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'smooth' });
    } catch {
      target.scrollIntoView({ block: 'end', inline: 'nearest' });
    }
  }, []);

  const collapseSideEarRail = useCallback(() => {
    setSideEarRailCollapsed((prev) => {
      if (prev) return prev;
      try {
        localStorage.setItem(LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED, '1');
      } catch {
        /* ignore */
      }
      return true;
    });
  }, []);

  const enterSideEarCosmicCompact = useCallback(() => {
    if (typeof window !== 'undefined') {
      const saved = readCosmicOrbPosFromLs();
      const pos = saved ?? defaultCosmicOrbPos(sideEarCenterPctRef.current);
      cosmicOrbPosRef.current = pos;
      setCosmicOrbPos(pos);
      if (!saved) persistCosmicOrbPos(pos);
    }
    setSideEarCosmicCompact(true);
    setSideEarRailCollapsed(true);
    setCosmicOrbDragHintsSoft(false);
    setCosmicOrbHintChipVisible(true);
    setEarUnreadPhantomPeek(false);
    try {
      localStorage.setItem(LS_MOBILE_SIDE_EAR_COSMIC_COMPACT, '1');
      localStorage.setItem(LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED, '1');
    } catch {
      /* ignore */
    }
  }, []);

  const exitSideEarCosmicCompact = useCallback(() => {
    setSideEarCosmicCompact(false);
    setSideEarRailCollapsed(false);
    try {
      localStorage.setItem(LS_MOBILE_SIDE_EAR_COSMIC_COMPACT, '0');
      localStorage.setItem(LS_MOBILE_SIDE_EAR_RAIL_COLLAPSED, '0');
    } catch {
      /* ignore */
    }
  }, []);

  const scheduleClearSideEarSuppressClick = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.setTimeout(() => {
      sideEarSuppressClickRef.current = false;
    }, COSMIC_ORB_SUPPRESS_CLICK_MS);
  }, []);

  const onCosmicOrbPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!sideEarCosmicCompact) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const btn = e.currentTarget;
    if (typeof window !== 'undefined') {
      const prev = cosmicOrbDragWindowHandlersRef.current;
      if (prev) {
        window.removeEventListener('pointermove', prev.move, SIDE_EAR_POINTER_MOVE_OPTS);
        window.removeEventListener('pointerup', prev.up);
        window.removeEventListener('pointercancel', prev.up);
        cosmicOrbDragWindowHandlersRef.current = null;
      }
    }
    const start = cosmicOrbPosRef.current;
    cosmicOrbDragRef.current = {
      active: true,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startOrbX: start.x,
      startOrbY: start.y,
      dragging: false,
    };
    const onMove = (ev: PointerEvent) => {
      const s = cosmicOrbDragRef.current;
      if (!s.active || ev.pointerId !== s.pointerId) return;
      const dx = ev.clientX - s.startClientX;
      const dy = ev.clientY - s.startClientY;
      if (!s.dragging) {
        if (Math.hypot(dx, dy) < COSMIC_ORB_DRAG_THRESHOLD_PX) return;
        s.dragging = true;
        setCosmicOrbDragging(true);
        setCosmicOrbHintChipVisible(false);
      }
      ev.preventDefault();
      const next = clampCosmicOrbPos(s.startOrbX + dx, s.startOrbY + dy);
      cosmicOrbPosRef.current = next;
      setCosmicOrbPos(next);
    };
    const onUp = (ev: PointerEvent) => {
      const s = cosmicOrbDragRef.current;
      if (!s.active || ev.pointerId !== s.pointerId) return;
      const wasDragging = s.dragging;
      s.active = false;
      s.dragging = false;
      setCosmicOrbDragging(false);
      if (typeof window !== 'undefined') {
        window.removeEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        cosmicOrbDragWindowHandlersRef.current = null;
      }
      try {
        btn.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
      if (wasDragging) {
        sideEarSuppressClickRef.current = true;
        const snapped = snapCosmicOrbPos(cosmicOrbPosRef.current.x, cosmicOrbPosRef.current.y);
        cosmicOrbPosRef.current = snapped;
        setCosmicOrbPos(snapped);
        persistCosmicOrbPos(snapped);
        setCosmicOrbDragHintsSoft(true);
        scheduleClearSideEarSuppressClick();
      } else {
        sideEarSuppressClickRef.current = true;
        exitSideEarCosmicCompact();
        scheduleClearSideEarSuppressClick();
      }
    };
    cosmicOrbDragWindowHandlersRef.current = { move: onMove, up: onUp };
    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', onMove, SIDE_EAR_POINTER_MOVE_OPTS);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    }
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, [sideEarCosmicCompact, exitSideEarCosmicCompact, scheduleClearSideEarSuppressClick]);

  const onSideEarCosmicPinPointerDown = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  }, []);

  const onSideEarCosmicPinClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (sideEarSuppressClickRef.current) {
        e.preventDefault();
        sideEarSuppressClickRef.current = false;
        return;
      }
      enterSideEarCosmicCompact();
    },
    [enterSideEarCosmicCompact],
  );

  const onSideEarCosmicChipClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (sideEarSuppressClickRef.current) {
        e.preventDefault();
        sideEarSuppressClickRef.current = false;
        return;
      }
      exitSideEarCosmicCompact();
    },
    [exitSideEarCosmicCompact],
  );

  const onSideEarMainClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (sideEarSuppressClickRef.current) {
        e.preventDefault();
        sideEarSuppressClickRef.current = false;
        return;
      }
      e.stopPropagation();
      scrollToMobileChat();
      collapseSideEarRail();
    },
    [scrollToMobileChat, collapseSideEarRail],
  );

  const onSideEarRailClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (sideEarSuppressClickRef.current) {
      e.preventDefault();
      sideEarSuppressClickRef.current = false;
      return;
    }
    e.stopPropagation();
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
    mobileSideEarEnabled && (sideEarRailCollapsed || sideEarCosmicCompact) ? null : earTypingLine;

  useEffect(() => {
    if (variant !== 'mobile' || !onMobileChromeMeta) return;
    const typingForChrome =
      !mobileOpen && earTypingLine?.trim() ? earTypingLine.trim() : null;
    onMobileChromeMeta({
      unread: !mobileOpen && earUnread,
      typingLine: typingForChrome,
    });
  }, [variant, mobileOpen, earUnread, earTypingLine, onMobileChromeMeta]);

  /** Фантом «печатает» скрывается той же опцией, что и текст превью непрочитанного. */
  const earTypingPhantomLine = hideUnreadEarPhantomPreview ? null : earTypingShown;

  /**
   * Фактическое «текущее» непрочитанное у ушка (в т.ч. лаб-мок до первого inject).
   * Стек «Свежее / Раньше» вешать на это, а не только на `unreadPhantom` — иначе ref не видит первый кадр и кнопки никогда не появляются.
   */
  /** Актуальное непрочитанное превью (без учёта hide/peek) — для смены сообщения и стабильного ключа. */
  const earUnreadContentSnapshot = useMemo(() => {
    if (!earUnread || earTypingShown) return null;
    return earUnreadPhantomEffective ?? null;
  }, [earUnread, earTypingShown, earUnreadPhantomEffective]);

  const earUnreadStackStableKey = useMemo(
    () => phantomUnreadStableKeyFromPhantom(earUnreadContentSnapshot),
    [earUnreadContentSnapshot],
  );

  const phantomStackHead = useMemo(() => {
    if (!earUnread || earTypingShown) return null;
    if (hideUnreadEarPhantomPreview && !earUnreadPhantomPeek) return null;
    return earUnreadContentSnapshot;
  }, [earUnread, earTypingShown, hideUnreadEarPhantomPreview, earUnreadPhantomPeek, earUnreadContentSnapshot]);

  useLayoutEffect(() => {
    const next = earUnreadContentSnapshot;
    if (!next) {
      if (!earUnread || earTypingShown) {
        setPhantomUnreadStack([]);
        setPhantomUnreadStackIndex(0);
        lastUnreadPhantomSnapRef.current = null;
      }
      return;
    }

    const prevSnap = lastUnreadPhantomSnapRef.current;
    const kNext = phantomUnreadStableKeyFromPhantom(next);

    setPhantomUnreadStack((stack) => {
      const nextCopy = { ...next };
      if (!prevSnap) {
        const rest = stack.filter((s) => phantomUnreadStableKeyFromPhantom(s) !== kNext);
        return [nextCopy, ...rest];
      }
      const kPrev = phantomUnreadStableKeyFromPhantom(prevSnap);
      if (kPrev === kNext) {
        return stack.map((s) =>
          phantomUnreadStableKeyFromPhantom(s) === kNext ? nextCopy : s,
        );
      }
      if (kPrev === '' || kNext === '') return stack;
      const prevCopy = { ...prevSnap };
      const rest = stack.filter((s) => {
        const k = phantomUnreadStableKeyFromPhantom(s);
        return k !== kNext && k !== kPrev;
      });
      return [nextCopy, prevCopy, ...rest];
    });

    if (prevSnap) {
      const kPrev = phantomUnreadStableKeyFromPhantom(prevSnap);
      if (kPrev !== '' && kNext !== '' && kPrev !== kNext) {
        setPhantomUnreadStackIndex(0);
        setSideEarPhantomDismissed(null);
        /* При «не показывать фантомы» — только индикаторы; peek только по тапу на точку. */
        setEarUnreadPhantomPeek(!hideUnreadEarPhantomPreview);
        setEarPhantomUnreadExpanded(false);
      }
    }

    lastUnreadPhantomSnapRef.current = { ...next };
  }, [earUnreadContentSnapshot, earUnread, earTypingShown, hideUnreadEarPhantomPreview]);

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
      'Прокрутить к чату внизу и свернуть кнопку «Чат» в рельсу. Крестик под надписью — компактная закладка у края. Потяните вверх или вниз, чтобы сместить ушко.';
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

  const phantomStackItem = useMemo(() => {
    if (!sideEarPhantomUnread) return null;
    if (phantomUnreadStackIndex === 0 && earUnreadContentSnapshot) {
      return earUnreadContentSnapshot;
    }
    if (phantomUnreadStack.length > 0) {
      const item = phantomUnreadStack[phantomUnreadStackIndex] ?? phantomUnreadStack[0];
      if (item) return item;
    }
    return earUnreadContentSnapshot ?? sideEarPhantomUnread;
  }, [
    sideEarPhantomUnread,
    phantomUnreadStack,
    phantomUnreadStackIndex,
    earUnreadContentSnapshot,
  ]);

  const phantomLinesPayload = useMemo(() => phantomStackItem, [phantomStackItem]);

  /** Ключ текста в блоке строк (текущий кадр стека). */
  const phantomLinesStableKey = useMemo(() => {
    return phantomUnreadStableKeyFromPhantom(phantomStackItem);
  }, [phantomStackItem]);

  const phantomUnreadStackNav = useMemo(() => {
    const len = phantomUnreadStack.length;
    const index = Math.min(Math.max(phantomUnreadStackIndex, 0), Math.max(0, len - 1));
    /** 1 = самое раннее непрочитанное, len = самое свежее. */
    const chronoPos = len > 0 ? len - index : 0;
    return {
      len,
      index,
      chronoPos,
      canGoNewer: index > 0,
      canGoOlder: index < len - 1,
    };
  }, [phantomUnreadStack.length, phantomUnreadStackIndex]);

  /** Ключ превью: id сообщения (или демо), чтобы крестик не «залипал» на одинаковом тексте превью. */
  const unreadPhantomStableKey = useMemo(() => {
    if (sideEarPhantomUnread) {
      return phantomUnreadStableKeyFromPhantom(sideEarPhantomUnread);
    }
    return earUnreadStackStableKey;
  }, [sideEarPhantomUnread, earUnreadStackStableKey]);

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

  /** Одна строка для кнопки «с цитатой»: кто и короткий фрагмент. */
  const phantomReplyAnchorMicro = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    const a = (phantomReplyAnchor.author || '').trim().slice(0, 14) || '…';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    if (!raw) return a;
    const sn = raw.length > 14 ? `${raw.slice(0, 14)}…` : raw;
    return `${a}: «${sn}»`;
  }, [phantomReplyAnchor]);

  const phantomQuotePanelAuthor = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    return (phantomReplyAnchor.author || '').trim() || 'Собеседник';
  }, [phantomReplyAnchor]);

  /** Текст цитаты для панели (без имени). */
  const phantomQuotePanelSnippet = useMemo(() => {
    if (!phantomReplyAnchor) return '';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    if (!raw) return '…';
    return truncatePhantomQuoteExcerpt(raw, PHANTOM_REPLY_QUOTE_PREVIEW_MAX);
  }, [phantomReplyAnchor]);

  const phantomReplyAnchorTitle = useMemo(() => {
    if (!phantomReplyAnchor) {
      return '«Добавить цитирование» / «Отменить цитирование»: панель цитаты и поле ответа. Enter или «Отправить». Ctrl+Enter — вкл/выкл.';
    }
    const a = phantomReplyAnchor.author.trim() || 'Собеседник';
    const raw = phantomReplyAnchor.body.trim().replace(/\s+/g, ' ');
    const cite = truncatePhantomQuoteExcerpt(raw, PHANTOM_REPLY_QUOTE_PREVIEW_MAX);
    return `${a}: «${cite}» — так уйдёт в чат вместе с вашим текстом. Enter / «Отправить». Ctrl+Enter — вкл/выкл.`;
  }, [phantomReplyAnchor]);

  useEffect(() => {
    const was = prevEarPhantomReplyOpenRef.current;
    const now = earPhantomReplyOpen;
    if (now && !was) {
      setEarPhantomReplyIncludeQuote(false);
    }
    if (!now && was) {
      setPhantomReplyAnchor(null);
      setEarPhantomReplyIncludeQuote(false);
      setEarPhantomReplyEmojiOpen(false);
      setPhantomReplyEmojiExpanded(false);
      const ta = phantomReplyTextareaRef.current;
      if (ta) ta.style.height = '';
    }
    prevEarPhantomReplyOpenRef.current = now;
  }, [earPhantomReplyOpen]);

  /** Цитата и микропревью следуют за текущим кадром стека непрочитанных. */
  useEffect(() => {
    if (!earPhantomReplyOpen || !phantomStackItem) return;
    setPhantomReplyAnchor({
      author: phantomStackItem.author,
      body: phantomStackItem.body,
      messageId: phantomStackItem.messageId,
    });
  }, [earPhantomReplyOpen, phantomLinesStableKey, phantomStackItem]);

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
    if (sideEarCosmicCompact) return false;
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
        earUnreadStackStableKey !== '' &&
        sideEarPhantomDismissed.messageId === earUnreadStackStableKey
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
    earUnreadStackStableKey,
    sideEarCosmicCompact,
  ]);

  const persistHideUnreadEarPhantomPreview = useCallback(
    (next: boolean) => {
      if (next) {
        setEarUnreadPhantomPeek(false);
        /* Фантом на экране — пользователь мог прочитать; как закрытие крестиком → гасим кристалл и индикатор. */
        if (sideEarPhantomCardVisible) {
          if (earTypingPhantomLine) {
            setSideEarPhantomDismissed({ kind: 'typing', line: earTypingPhantomLine });
          } else if (sideEarPhantomUnread) {
            const dismissKey = phantomUnreadStableKeyFromPhantom(sideEarPhantomUnread);
            if (dismissKey) {
              setSideEarPhantomDismissed({ kind: 'unread', messageId: dismissKey });
            }
            setPhantomUnreadStack([]);
            setPhantomUnreadStackIndex(0);
          }
        }
      } else {
        setSideEarPhantomDismissed(null);
      }
      setHideUnreadEarPhantomPreview(next);
      try {
        localStorage.setItem(LS_MOBILE_SIDE_EAR_HIDE_UNREAD_PREVIEW, next ? '1' : '0');
      } catch {
        /* ignore */
      }
    },
    [sideEarPhantomCardVisible, earTypingPhantomLine, sideEarPhantomUnread],
  );

  /** Перелив кристалла: непрочитанное + не «печатает», но не после закрытия фантома крестиком по тому же сообщению (пока нет нового). */
  const sideEarCrystalShimmerEnabled = useMemo(() => {
    if (sideEarCosmicCompact) return false;
    if (!earUnread || earTypingShown) return false;
    if (
      sideEarPhantomDismissed?.kind === 'unread' &&
      earUnreadStackStableKey !== '' &&
      sideEarPhantomDismissed.messageId === earUnreadStackStableKey
    ) {
      return false;
    }
    return true;
  }, [earUnread, earTypingShown, sideEarPhantomDismissed, earUnreadStackStableKey, sideEarCosmicCompact]);

  const onPhantomDismissPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
  }, []);

  const onPhantomToChatClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      scrollToMobileChat();
    },
    [scrollToMobileChat],
  );

  const onPhantomDismissClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (earTypingPhantomLine) {
        setSideEarPhantomDismissed({ kind: 'typing', line: earTypingPhantomLine });
        return;
      }
      if (sideEarPhantomUnread) {
        const dismissKey = phantomUnreadStableKeyFromPhantom(sideEarPhantomUnread);
        if (dismissKey) {
          setSideEarPhantomDismissed({
            kind: 'unread',
            messageId: dismissKey,
          });
        }
        setEarUnreadPhantomPeek(false);
        setPhantomUnreadStack([]);
        setPhantomUnreadStackIndex(0);
      }
    },
    [earTypingPhantomLine, sideEarPhantomUnread],
  );

  const onPhantomUnreadGoNewer = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPhantomUnreadStackIndex((i) => Math.max(0, i - 1));
    setEarPhantomUnreadExpanded(false);
  }, []);

  const onPhantomUnreadGoOlder = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPhantomUnreadStackIndex((i) => Math.min(phantomUnreadStack.length - 1, i + 1));
    setEarPhantomUnreadExpanded(false);
  }, [phantomUnreadStack.length]);

  const onPhantomUnreadGoFresh = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setPhantomUnreadStackIndex(0);
    setEarPhantomUnreadExpanded(false);
  }, []);

  const onPhantomExpandClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setEarPhantomUnreadExpanded((v) => !v);
  }, []);

  const onPhantomReplyToggleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setEarPhantomReplyOpen((v) => !v);
  }, []);

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
    const collapsedTyping = typingPhantomLine?.trim() || null;
    if (mobileEmbedHost) {
      return createPortal(
        <div
          ref={mobileCollapsedChatDockRef}
          className={[
            'table-chat-dock',
            'table-chat-dock--pro',
            'table-chat-dock--mobile',
            'table-chat-dock--collapsed',
            'table-chat-dock--east-embed',
            'table-chat-dock--east-mini',
            collapsedTyping ? 'table-chat-dock--collapsed-typing' : '',
            sideEarUnread && !collapsedTyping ? 'table-chat-dock--collapsed-unread' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <div className="table-chat-east-mini-bar" role="toolbar" aria-label="Чат свёрнут">
            <button
              type="button"
              className="table-chat-east-crystal-btn table-chat-east-crystal-btn--expand"
              onClick={() => setMobileOpen(true)}
              aria-label={
                collapsedTyping
                  ? `Развернуть чат. ${collapsedTyping}`
                  : sideEarUnread
                    ? 'Развернуть чат. Есть новые сообщения'
                    : 'Развернуть чат'
              }
              title="Развернуть"
            >
              <CrystalLilacGlyph id={`${emojiPanelDomId}-exp`} path="M3.2 10.2 8 5.2l4.8 5" />
            </button>
            {onEastEmbedDismissToBottom ? (
              <button
                type="button"
                className="table-chat-east-crystal-btn table-chat-east-crystal-btn--dismiss"
                onClick={onEastEmbedDismissToBottom}
                aria-label="Убрать чат вниз страницы"
              title="Убрать вниз"
            >
              <CrystalLilacGlyph
                id={`${emojiPanelDomId}-dis`}
                path="M4.2 4.2 11.8 11.8M11.8 11.8H6.4M11.8 11.8V6.4"
              />
            </button>
            ) : null}
            <span className="table-chat-east-mini-bar__signals">
              {sideEarUnread && !collapsedTyping ? (
                <span className="table-chat-east-mini-bar__unread" title="Новые сообщения" />
              ) : null}
              {collapsedTyping ? (
                <span className="table-chat-east-mini-bar__typing" title={collapsedTyping} />
              ) : null}
            </span>
          </div>
        </div>,
        mobileEmbedHost,
      );
    }
    return (
      <>
        <div
          ref={mobileCollapsedChatDockRef}
          className={[
            'table-chat-dock',
            'table-chat-dock--pro',
            'table-chat-dock--mobile',
            'table-chat-dock--collapsed',
            mobileSideEarEnabled ? 'table-chat-dock--mobile-side-ear' : '',
            collapsedTyping ? 'table-chat-dock--collapsed-typing' : '',
            sideEarUnread && !collapsedTyping ? 'table-chat-dock--collapsed-unread' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <button
            type="button"
            className={[
              'table-chat-toggle',
              collapsedTyping ? 'table-chat-toggle--typing' : '',
              sideEarUnread && !collapsedTyping ? 'table-chat-toggle--unread' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            data-upnd-table-chat-toggle=""
            onClick={() => setMobileOpen(true)}
            aria-label={
              collapsedTyping
                ? `Открыть чат. ${collapsedTyping}`
                : sideEarUnread
                  ? 'Открыть чат. Есть новые сообщения'
                  : 'Открыть чат'
            }
          >
            <span className="table-chat-toggle__label">Чат</span>
            {sideEarUnread && !collapsedTyping ? (
              <span className="table-chat-toggle__unread-dot" aria-hidden />
            ) : null}
            {collapsedTyping ? (
              <span className="table-chat-toggle__typing" aria-live="polite">
                {collapsedTyping}
              </span>
            ) : null}
          </button>
        </div>
        {mobileSideEarEnabled ? (
          <div
            ref={sideEarShellRef}
            className={[
              'table-chat-side-ear-shell',
              sideEarCosmicCompact ? 'table-chat-side-ear-shell--cosmic-orb-mode' : '',
              cosmicOrbDragging ? 'table-chat-side-ear-shell--cosmic-orb-dragging' : '',
              sideEarCosmicCompact && cosmicOrbDragHintsSoft
                ? 'table-chat-side-ear-shell--cosmic-orb-hints-soft'
                : '',
              sideEarCosmicCompact && !cosmicOrbHintChipVisible
                ? 'table-chat-side-ear-shell--cosmic-orb-hint-chip-hidden'
                : '',
              sideEarRailCollapsed && !sideEarCosmicCompact
                ? 'table-chat-side-ear-shell--rail-collapsed'
                : '',
              earTypingShown ? 'table-chat-side-ear-shell--activity-typing' : '',
              earUnread && !earTypingShown ? 'table-chat-side-ear-shell--activity-unread' : '',
              sideEarCrystalShimmerEnabled ? 'table-chat-side-ear-shell--crystal-shimmer' : '',
              hideUnreadEarPhantomPreview &&
              earUnread &&
              !earTypingShown &&
              !earUnreadPhantomPeek
                ? 'table-chat-side-ear-shell--preview-suppressed'
                : '',
              earPhantomUnreadExpanded && phantomLinesPayload
                ? 'table-chat-side-ear-shell--phantom-unread-expanded'
                : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={sideEarShellStyle}
            onPointerDown={sideEarCosmicCompact ? undefined : onSideEarPointerDown}
          >
            <div ref={sideEarDragShiftRef} className="table-chat-side-ear-shell__drag-shift">
            {sideEarCosmicCompact ? (
              <button
                type="button"
                className="table-chat-side-ear-cosmic-orb"
                onPointerDown={onCosmicOrbPointerDown}
                onClick={onSideEarCosmicChipClick}
                aria-label="Космическая закладка чата. Потяните в любую сторону; у края экрана прилипнет. Нажмите — развернуть ушко."
                title="Потяните в любую сторону · у края прилипнет · тап — развернуть ушко"
              >
                <span className="table-chat-side-ear-cosmic-orb__drag-ring" aria-hidden />
                <span className="table-chat-side-ear-cosmic-orb__drag-hints" aria-hidden>
                  <span className="table-chat-side-ear-cosmic-orb__drag-hint table-chat-side-ear-cosmic-orb__drag-hint--n" />
                  <span className="table-chat-side-ear-cosmic-orb__drag-hint table-chat-side-ear-cosmic-orb__drag-hint--e" />
                  <span className="table-chat-side-ear-cosmic-orb__drag-hint table-chat-side-ear-cosmic-orb__drag-hint--s" />
                  <span className="table-chat-side-ear-cosmic-orb__drag-hint table-chat-side-ear-cosmic-orb__drag-hint--w" />
                </span>
                <span className="table-chat-side-ear-cosmic-orb__hint-chip" aria-hidden>
                  ⇄ тяните
                </span>
                <svg
                  className="table-chat-side-ear-cosmic-orb__grad-defs"
                  xmlns="http://www.w3.org/2000/svg"
                  width={0}
                  height={0}
                  aria-hidden
                  focusable="false"
                >
                  <defs>
                    <linearGradient
                      id={sideEarCosmicChipGradId}
                      x1="2"
                      y1="2"
                      x2="18"
                      y2="18"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#ffffff" />
                      <stop offset="14%" stopColor="#e8edf5" />
                      <stop offset="30%" stopColor="#b8c5d6" />
                      <stop offset="46%" stopColor="#14f5eb" />
                      <stop offset="62%" stopColor="#38b8ff" />
                      <stop offset="78%" stopColor="#22e8f0" />
                      <stop offset="92%" stopColor="#a8d4e8" />
                      <stop offset="100%" stopColor="#f8fafc" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="table-chat-side-ear-cosmic-orb__glyph" aria-hidden>
                  <svg
                    className="table-chat-side-ear-cosmic-orb__glyph-svg"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    focusable="false"
                  >
                    <path
                      fill="rgb(15 23 42 / 55%)"
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"
                      transform="translate(0.35 0.45)"
                    />
                    <path
                      fill={`url(#${sideEarCosmicChipGradId})`}
                      d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"
                    />
                  </svg>
                </span>
              </button>
            ) : (
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
                      fill="none"
                      focusable="false"
                    >
                      {/* Глаз: «видимость превью»; читается лучше бегунков на микро-размере */}
                      <path
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.25}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"
                      />
                      <circle cx="12" cy="12" r="3" fill="currentColor" />
                    </svg>
                  </span>
                </button>
              </div>
              <div className="table-chat-side-ear-bundle">
                <div className="table-chat-side-ear-stack">
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
                {!sideEarRailCollapsed ? (
                  <button
                    type="button"
                    className="table-chat-side-ear__cosmic-pin"
                    onPointerDown={onSideEarCosmicPinPointerDown}
                    onClick={onSideEarCosmicPinClick}
                    aria-label="Свернуть ушко в компактную закладку"
                    title="Компактная закладка чата"
                  >
                    <span className="table-chat-side-ear__cosmic-pin-icon" aria-hidden>
                      <svg
                        className="table-chat-side-ear__cosmic-pin-icon-svg"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        focusable="false"
                      >
                        <defs>
                          <linearGradient
                            id={sideEarCosmicPinGradId}
                            x1="2"
                            y1="2"
                            x2="18"
                            y2="18"
                            gradientUnits="userSpaceOnUse"
                          >
                            <stop offset="0%" stopColor="#ffffff" />
                            <stop offset="14%" stopColor="#e8edf5" />
                            <stop offset="30%" stopColor="#b8c5d6" />
                            <stop offset="46%" stopColor="#14f5eb" />
                            <stop offset="62%" stopColor="#38b8ff" />
                            <stop offset="78%" stopColor="#22e8f0" />
                            <stop offset="92%" stopColor="#a8d4e8" />
                            <stop offset="100%" stopColor="#f8fafc" />
                          </linearGradient>
                        </defs>
                        <path
                          fill="none"
                          stroke="rgb(36 8 52 / 80%)"
                          strokeWidth="3.15"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          d="M5.5 5.5l9 9M14.5 5.5l-9 9"
                        />
                        <path
                          fill="none"
                          stroke={`url(#${sideEarCosmicPinGradId})`}
                          strokeWidth="2.45"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                          d="M5.5 5.5l9 9M14.5 5.5l-9 9"
                        />
                      </svg>
                    </span>
                  </button>
                ) : null}
                </div>
              </div>
              <span className="table-chat-side-ear-rail__crystal" aria-hidden />
            </div>
            )}
            {sideEarPhantomCardVisible ? (
              <div
                className={[
                  'table-chat-side-ear-phantom',
                  earPhantomUnreadExpanded && phantomLinesPayload
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
                    <linearGradient
                      id={phantomDismissGradId}
                      x1="0.08"
                      y1="0"
                      x2="0.92"
                      y2="1"
                      gradientUnits="objectBoundingBox"
                    >
                      <stop offset="0%" stopColor="#0891b2" />
                      <stop offset="16%" stopColor="#2dd4bf" />
                      <stop offset="34%" stopColor="#14b8a6" />
                      <stop offset="52%" stopColor="#4f46e5" />
                      <stop offset="72%" stopColor="#7c3aed" />
                      <stop offset="100%" stopColor="#c026d3" />
                    </linearGradient>
                  </defs>
                </svg>
                <button
                  type="button"
                  className="table-chat-side-ear-phantom__to-chat"
                  aria-label="Прокрутить к чату стола"
                  title="В чат"
                  onPointerDown={onPhantomDismissPointerDown}
                  onClick={onPhantomToChatClick}
                >
                  <span className="table-chat-side-ear-phantom__to-chat-label" aria-hidden>
                    В чат
                  </span>
                </button>
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
                    viewBox="0 0 32 12"
                    preserveAspectRatio="none"
                    aria-hidden
                    focusable="false"
                  >
                    <path
                      fill="none"
                      stroke={phantomDismissStrokeUrl}
                      strokeWidth={2.5}
                      strokeLinecap="butt"
                      d="M6 3 L26 9M26 3 L6 9"
                    />
                  </svg>
                </button>
                {earTypingPhantomLine ? (
                  <span className="table-chat-side-ear-phantom__typing">{earTypingPhantomLine}</span>
                ) : sideEarPhantomUnread && phantomLinesPayload ? (
                  <>
                    <div className="table-chat-side-ear-phantom__lines-stack-wrap">
                      {phantomUnreadStackNav.len > 1 ? (
                        <div
                          className="table-chat-side-ear-phantom__preview-stack"
                          role="navigation"
                          aria-label="Листание непрочитанных превью"
                        >
                          <button
                            type="button"
                            className="table-chat-side-ear-phantom__preview-stack-btn"
                            disabled={!phantomUnreadStackNav.canGoOlder}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={onPhantomUnreadGoOlder}
                            aria-label="Более раннее непрочитанное сообщение"
                          >
                            ‹ Назад
                          </button>
                          <span
                            className="table-chat-side-ear-phantom__preview-stack-pos"
                            aria-live="polite"
                            title="По порядку получения: 1 — самое раннее"
                          >
                            {phantomUnreadStackNav.chronoPos} / {phantomUnreadStackNav.len}
                          </span>
                          <button
                            type="button"
                            className="table-chat-side-ear-phantom__preview-stack-btn"
                            disabled={!phantomUnreadStackNav.canGoNewer}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={onPhantomUnreadGoNewer}
                            aria-label="Более новое непрочитанное сообщение"
                          >
                            Вперёд ›
                          </button>
                          <button
                            type="button"
                            className={[
                              'table-chat-side-ear-phantom__preview-stack-btn',
                              phantomUnreadStackNav.index === 0
                                ? 'table-chat-side-ear-phantom__preview-stack-btn--active'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            disabled={phantomUnreadStackNav.index === 0}
                            onPointerDown={onPhantomDismissPointerDown}
                            onClick={onPhantomUnreadGoFresh}
                            aria-label="Текущее, самое свежее сообщение"
                          >
                            Текущее
                          </button>
                        </div>
                      ) : null}
                      <div
                        key={phantomLinesStableKey}
                        className="table-chat-side-ear-phantom__lines-clip"
                      >
                        <div ref={phantomUnreadLinesRef} className="table-chat-side-ear-phantom__lines">
                          {phantomLinesPayload.author ? (
                            <>
                              <span
                                key={phantomLinesStableKey}
                                className="table-chat-side-ear-phantom__author"
                              >
                                {phantomLinesPayload.author}
                              </span>
                              <span className="table-chat-side-ear-phantom__sep" aria-hidden>
                                :{' '}
                              </span>
                            </>
                          ) : null}
                          <PhantomEarPreviewBody body={phantomLinesPayload.body} />
                        </div>
                      </div>
                      {phantomLinesPayload ? (
                        <button
                          type="button"
                          className="table-chat-side-ear-phantom__expand-inline"
                          onPointerDown={onPhantomDismissPointerDown}
                          onClick={onPhantomExpandClick}
                          aria-expanded={earPhantomUnreadExpanded}
                          aria-label={
                            earPhantomUnreadExpanded
                              ? 'Свернуть текст сообщения'
                              : 'Развернуть и показать весь текст сообщения'
                          }
                        >
                          <svg
                            className="table-chat-side-ear-phantom__expand-inline-glyph"
                            viewBox="0 0 20 20"
                            aria-hidden
                          >
                            {earPhantomUnreadExpanded ? (
                              <>
                                <path
                                  fill="none"
                                  stroke={phantomToolbarStrokeUrl}
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  d="M3 5h11M3 9h14M3 13h9"
                                />
                                <path
                                  fill="none"
                                  stroke={phantomToolbarStrokeUrl}
                                  strokeWidth="1.75"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 14l2-2 2 2"
                                />
                              </>
                            ) : (
                              <path
                                fill="none"
                                stroke={phantomToolbarStrokeUrl}
                                strokeWidth="1.75"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4 7.5h9M4 10.5h12M4 13.5h7M14.5 12.5l2.5 2.5 2.5-2.5"
                              />
                            )}
                          </svg>
                          <span className="table-chat-side-ear-phantom__expand-inline-label">
                            {earPhantomUnreadExpanded ? 'Свернуть' : 'Развернуть'}
                          </span>
                        </button>
                      ) : null}
                      {!earPhantomReplyOpen ? (
                        <button
                          type="button"
                          className={[
                            'table-chat-side-ear-phantom__reply-close-bar',
                            'table-chat-side-ear-phantom__reply-close-bar--phantom-lip',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onPointerDown={onPhantomDismissPointerDown}
                          onClick={onPhantomReplyToggleClick}
                          aria-expanded={false}
                          aria-label="Ответить на сообщение из превью"
                          title="Ответить"
                        >
                          <svg
                            className="table-chat-side-ear-phantom__reply-close-bar__glyph"
                            viewBox="0 0 20 20"
                            aria-hidden
                          >
                            <circle cx="10" cy="10" r="8.4" fill="rgb(6 10 30 / 82%)" />
                            <circle
                              cx="10"
                              cy="10"
                              r="8.4"
                              fill="none"
                              stroke="rgb(186 230 253 / 34%)"
                              strokeWidth="0.65"
                            />
                            <ellipse
                              cx="10"
                              cy="10"
                              rx="6.8"
                              ry="3.1"
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.25"
                              opacity="0.72"
                              transform="rotate(-24 10 10)"
                            />
                            <circle cx="4.8" cy="7.2" r="0.85" fill={phantomToolbarStrokeUrl} />
                            <circle cx="16.8" cy="13.4" r="0.65" fill={phantomToolbarStrokeUrl} opacity="0.92" />
                            <path
                              fill={phantomToolbarStrokeUrl}
                              d="M15.1 3.9l.52 1.56 1.56.52-1.56.52-.52 1.56-.52-1.56-1.56-.52 1.56-.52z"
                            />
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.85"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.6 12.4c-2.3-2.7-5.9-2.4-8.1 0.4L4.4 13.8"
                            />
                            <path
                              fill="none"
                              stroke={phantomToolbarStrokeUrl}
                              strokeWidth="1.85"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M6.7 10.9 4.4 13.8l2.7-.15"
                            />
                          </svg>
                          <span className="table-chat-side-ear-phantom__reply-close-bar__label">
                            Нажмите для ответа
                          </span>
                        </button>
                      ) : null}
                    </div>
                    {earPhantomReplyOpen ? (
                      <div className="table-chat-side-ear-phantom__reply-panel">
                      <div
                        className="table-chat-side-ear-phantom__reply-box"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <div className="table-chat-side-ear-phantom__reply-box-body">
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
                          <div className="table-chat-side-ear-phantom__reply-compose">
                            <div className="table-chat-side-ear-phantom__reply-compose-field">
                            <button
                              ref={phantomReplyEmojiToggleRef}
                              type="button"
                              className={[
                                'table-chat-side-ear-phantom__reply-emoji-btn',
                                earPhantomReplyEmojiOpen
                                  ? 'table-chat-side-ear-phantom__reply-emoji-btn--open'
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onPhantomReplyEmojiToggle();
                              }}
                              aria-expanded={earPhantomReplyEmojiOpen}
                              aria-haspopup="dialog"
                              aria-controls={phantomReplyEmojiPanelDomId}
                              aria-label={
                                earPhantomReplyEmojiOpen ? 'Закрыть эмодзи' : 'Вставить эмодзи в ответ'
                              }
                              title={earPhantomReplyEmojiOpen ? 'Закрыть эмодзи' : 'Эмодзи'}
                              disabled={sending}
                            >
                              <span
                                className="table-chat-side-ear-phantom__reply-emoji-btn__glyph"
                                aria-hidden
                              >
                                ☺
                              </span>
                            </button>
                            {earPhantomReplyEmojiOpen ? (
                              <div
                                ref={phantomReplyEmojiPanelRef}
                                id={phantomReplyEmojiPanelDomId}
                                className="table-chat-side-ear-phantom__reply-emoji-popover"
                                role="dialog"
                                aria-label="Эмодзи для ответа"
                                onPointerDown={(e) => e.stopPropagation()}
                              >
                                <div
                                  className="table-chat-side-ear-phantom__reply-emoji-tabs"
                                  role="tablist"
                                >
                                  {TABLE_CHAT_PICKER_TABS.map((tab) => (
                                    <button
                                      key={tab.id}
                                      type="button"
                                      role="tab"
                                      aria-selected={phantomReplyEmojiTab === tab.id}
                                      aria-label={tab.label}
                                      title={tab.label}
                                      className={[
                                        'table-chat-side-ear-phantom__reply-emoji-tab',
                                        tab.id === 'phrases'
                                          ? 'table-chat-side-ear-phantom__reply-emoji-tab--text'
                                          : '',
                                        phantomReplyEmojiTab === tab.id
                                          ? 'table-chat-side-ear-phantom__reply-emoji-tab--active'
                                          : '',
                                      ]
                                        .filter(Boolean)
                                        .join(' ')}
                                      onClick={() => {
                                        setPhantomReplyEmojiTab(tab.id);
                                        setPhantomReplyEmojiExpanded(false);
                                      }}
                                    >
                                      {tab.id === 'mine' ? (
                                        <span
                                          className="table-chat-side-ear-phantom__reply-emoji-tab__star"
                                          aria-hidden
                                        >
                                          ★
                                        </span>
                                      ) : tab.kind === 'emoji' ? (
                                        tab.tabEmojiPc ?? tab.label.slice(0, 1)
                                      ) : (
                                        tab.label
                                      )}
                                    </button>
                                  ))}
                                </div>
                                {phantomReplyEmojiTab === 'phrases' ? (
                                  <div className="table-chat-side-ear-phantom__reply-emoji-phrases">
                                    <div className="table-chat-side-ear-phantom__reply-emoji-phrases__scroll">
                                      {CHAT_QUICK_PHRASES.map((phrase, idx) => (
                                        <button
                                          key={`ph-${idx}`}
                                          type="button"
                                          className="table-chat-side-ear-phantom__reply-emoji-phrases__item"
                                          title={phrase}
                                          disabled={
                                            sending ||
                                            earPhantomReplyDraft.length + phrase.length > MAX_BODY
                                          }
                                          style={{
                                            opacity:
                                              earPhantomReplyDraft.length + phrase.length >
                                              MAX_BODY
                                                ? 0.45
                                                : 1,
                                          }}
                                          onClick={() => insertPhantomReplySnippet(phrase)}
                                        >
                                          {phrase}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : phantomReplyEmojiTab === 'mine' ? (
                                  <div className="table-chat-side-ear-phantom__reply-emoji-mine">
                                    {mySnippets.length === 0 ? (
                                      <p className="table-chat-side-ear-phantom__reply-emoji-mine__empty">
                                        Пока пусто — добавьте в «Мои» из чата.
                                      </p>
                                    ) : (
                                      <div className="table-chat-side-ear-phantom__reply-emoji-mine__layout">
                                        <div className="table-chat-side-ear-phantom__reply-emoji-mine__phrases-col">
                                          {mySnippets.map((s, idx) => {
                                            if (isLikelyEmojiSnippet(s)) return null;
                                            return (
                                              <button
                                                key={`ph-${idx}-${mineSnippetDedupeKey(s)}`}
                                                type="button"
                                                className="table-chat-side-ear-phantom__reply-emoji-mine__phrase"
                                                title={s}
                                                disabled={
                                                  sending ||
                                                  earPhantomReplyDraft.length + s.length > MAX_BODY
                                                }
                                                style={{
                                                  opacity:
                                                    earPhantomReplyDraft.length + s.length > MAX_BODY
                                                      ? 0.4
                                                      : 1,
                                                }}
                                                onClick={() => insertPhantomReplySnippet(s)}
                                              >
                                                {s}
                                              </button>
                                            );
                                          })}
                                        </div>
                                        <div className="table-chat-side-ear-phantom__reply-emoji-mine__emoji-col">
                                          {mySnippets.map((s, idx) => {
                                            if (!isLikelyEmojiSnippet(s)) return null;
                                            return (
                                              <button
                                                key={`em-${idx}-${mineSnippetDedupeKey(s)}`}
                                                type="button"
                                                className="table-chat-side-ear-phantom__reply-emoji-mine__emoji"
                                                aria-label={`Вставить ${s}`}
                                                title={s}
                                                disabled={
                                                  sending ||
                                                  earPhantomReplyDraft.length + s.length > MAX_BODY
                                                }
                                                style={{
                                                  opacity:
                                                    earPhantomReplyDraft.length + s.length > MAX_BODY
                                                      ? 0.4
                                                      : 1,
                                                }}
                                                onClick={() => insertPhantomReplySnippet(s)}
                                              >
                                                {s}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    {(phantomReplyEmojiTab === 'react' ||
                                      phantomReplyEmojiTab === 'cards' ||
                                      phantomReplyEmojiTab === 'misc') &&
                                    tabHasEmojiMore(phantomReplyEmojiTab) ? (
                                      <button
                                        type="button"
                                        className="table-chat-side-ear-phantom__reply-emoji-more"
                                        aria-expanded={phantomReplyEmojiExpanded}
                                        aria-label={
                                          phantomReplyEmojiExpanded
                                            ? 'Свернуть: только основной набор эмодзи'
                                            : 'Показать ещё эмодзи в этой категории'
                                        }
                                        title={
                                          phantomReplyEmojiExpanded
                                            ? 'Свернуть расширенный набор'
                                            : 'Ещё эмодзи в этой категории'
                                        }
                                        onClick={() => setPhantomReplyEmojiExpanded((v) => !v)}
                                      >
                                        <span aria-hidden>{phantomReplyEmojiExpanded ? '−' : '+'}</span>
                                        <span className="table-chat-side-ear-phantom__reply-emoji-more__label">
                                          {phantomReplyEmojiExpanded ? 'свернуть' : 'ещё'}
                                        </span>
                                      </button>
                                    ) : null}
                                    <div className="table-chat-side-ear-phantom__reply-emoji-grid">
                                      {phantomReplyEmojiCells.map((emo, idx) => (
                                        <button
                                          key={`${phantomReplyEmojiTab}-${idx}-${emo}`}
                                          type="button"
                                          className="table-chat-side-ear-phantom__reply-emoji-cell"
                                          aria-label={`Вставить ${emo}`}
                                          title={emo}
                                          style={{
                                            opacity:
                                              earPhantomReplyDraft.length + emo.length > MAX_BODY
                                                ? 0.4
                                                : 1,
                                          }}
                                          disabled={
                                            sending ||
                                            earPhantomReplyDraft.length + emo.length > MAX_BODY
                                          }
                                          onClick={() => insertPhantomReplySnippet(emo)}
                                        >
                                          {emo}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            ) : null}
                            <textarea
                              ref={phantomReplyTextareaRef}
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
                              className="table-chat-side-ear-phantom__reply-resize-grip"
                              aria-label="Изменить высоту поля ответа"
                              title="Потяните вверх или вниз"
                              disabled={sending}
                              onPointerDown={onPhantomReplyResizePointerDown}
                              onPointerMove={onPhantomReplyResizePointerMove}
                              onPointerUp={onPhantomReplyResizePointerUp}
                              onPointerCancel={onPhantomReplyResizePointerUp}
                            />
                            </div>
                            <button
                              type="button"
                              className="table-chat-side-ear-phantom__reply-send-bar"
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
                                  className="table-chat-side-ear-phantom__reply-send-bar__dot"
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
                        </div>
                      </div>
                        <button
                          type="button"
                          className="table-chat-side-ear-phantom__reply-close-bar"
                          onPointerDown={onPhantomDismissPointerDown}
                          onClick={onPhantomReplyToggleClick}
                          aria-expanded
                          aria-label="Закрыть окно ответа"
                          title="Закрыть окно ответа"
                        >
                          Закрыть окно ответа
                        </button>
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
            className={[
              'table-chat-dock-pc-expand-btn',
              typingPhantomLine ? 'table-chat-dock-pc-expand-btn--typing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
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
            aria-label={
              typingPhantomLine ? `Открыть чат. ${typingPhantomLine}` : 'Открыть чат стола'
            }
          >
            <span aria-hidden>💬</span> Чат
            {typingPhantomLine ? (
              <span className="table-chat-dock-pc-expand-btn__typing">{typingPhantomLine}</span>
            ) : null}
          </button>
        </div>
      </div>
    );
  }

  const mobileChatFontAtMin = mobileChatFontStep <= 0;
  const mobileChatFontAtMax = mobileChatFontStep >= MOBILE_CHAT_FONT_SCALES.length - 1;
  const mobileChatFontSplit = !mobileChatFontAtMin && !mobileChatFontAtMax;
  const mobileChatFontPct = Math.round(MOBILE_CHAT_FONT_SCALES[mobileChatFontStep] * 100);

  const runChatSearch = (raw?: string) => {
    const next = (raw ?? chatSearchInputRef.current?.value ?? chatSearchQuery).trim();
    if (raw != null && raw !== chatSearchQuery) setChatSearchQuery(raw);
    if (!next) return;
    window.requestAnimationFrame(() => {
      const first = listRef.current?.querySelector<HTMLElement>(
        '.table-chat-msg-compact, .table-chat-msg',
      );
      first?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  };

  const chatSearchField = (
    <form
      className="table-chat-dock-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        runChatSearch(chatSearchInputRef.current?.value ?? chatSearchQuery);
      }}
    >
      <input
        ref={chatSearchInputRef}
        type="search"
        name="table-chat-search"
        className="table-chat-dock-search__input"
        value={chatSearchQuery}
        onChange={(e) => setChatSearchQuery(e.target.value)}
        onInput={(e) => setChatSearchQuery((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          e.stopPropagation();
          runChatSearch((e.target as HTMLInputElement).value);
        }}
        onPointerDown={(ev) => ev.stopPropagation()}
        placeholder="слово или символ…"
        aria-label="Поиск сообщений, слов и символов"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
        inputMode="search"
      />
      {chatSearchQuery.trim() ? (
        <span className="table-chat-dock-search__count" aria-live="polite">
          {displayMessages.length}
        </span>
      ) : null}
      {chatSearchQuery ? (
        <button
          type="button"
          className="table-chat-dock-search__clear"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => {
            setChatSearchQuery('');
            chatSearchInputRef.current?.focus();
          }}
          aria-label="Очистить поиск"
        >
          ×
        </button>
      ) : null}
    </form>
  );

  const chatHeaderTools = (stopDrag: boolean) => (
    <div className="table-chat-dock-header-tools" role="toolbar" aria-label="Параметры чата">
      <button
        type="button"
        className={[
          'table-chat-dock-tool-btn',
          'table-chat-dock-tool-btn--sort',
          chatNewestFirst ? 'table-chat-dock-tool-btn--on' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={chatNewestFirst}
        title={
          chatNewestFirst
            ? 'Свежие сверху — нажмите, чтобы свежие были снизу'
            : 'Свежие снизу — нажмите, чтобы свежие были сверху'
        }
        aria-label={chatNewestFirst ? 'Порядок: свежие сверху' : 'Порядок: свежие снизу'}
        onPointerDown={stopDrag ? (ev) => ev.stopPropagation() : undefined}
        onClick={() => {
          setChatNewestFirst((v) => {
            const next = !v;
            writeChatNewestFirstToLs(next);
            return next;
          });
        }}
      >
        <ChatToolSortGlyph newestFirst={chatNewestFirst} hint={sortSparkHintOn} />
      </button>
      <button
        type="button"
        className={[
          'table-chat-dock-tool-btn',
          'table-chat-dock-tool-btn--search',
          chatSearchOpen ? 'table-chat-dock-tool-btn--on' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={chatSearchOpen}
        title={chatSearchOpen ? 'Закрыть поиск' : 'Поиск в чате'}
        aria-label={chatSearchOpen ? 'Закрыть поиск' : 'Поиск в чате'}
        onPointerDown={stopDrag ? (ev) => ev.stopPropagation() : undefined}
        onClick={() => {
          setChatSearchOpen((v) => {
            const next = !v;
            if (!next) setChatSearchQuery('');
            return next;
          });
          setEastToolsMenuOpen(false);
        }}
      >
        <ChatToolSearchGlyph />
      </button>
    </div>
  );

  const mobileFontCtrl = (
    <div
      className={[
        'table-chat-dock-mobile-font-ctrl',
        mobileChatFontSplit ? 'table-chat-dock-mobile-font-ctrl--split' : '',
        !mobileChatFontAtMin ? 'table-chat-dock-mobile-font-ctrl--raised' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={`Кегль чата ${mobileChatFontPct}%`}
    >
      {!mobileChatFontAtMax ? (
        <button
          type="button"
          className="table-chat-dock-mobile-font-ctrl__half table-chat-dock-mobile-font-ctrl__half--plus"
          onClick={onMobileChatFontStepUp}
          aria-label={`Увеличить кегль (сейчас ${mobileChatFontPct}%)`}
          title={`Кегль ${mobileChatFontPct}% · увеличить`}
        >
          <ChatFontTypeGlyph plus />
        </button>
      ) : null}
      {mobileChatFontSplit ? (
        <span className="table-chat-dock-mobile-font-ctrl__split-line" aria-hidden />
      ) : null}
      {!mobileChatFontAtMin ? (
        <button
          type="button"
          className="table-chat-dock-mobile-font-ctrl__half table-chat-dock-mobile-font-ctrl__half--minus"
          onClick={onMobileChatFontStepDown}
          aria-label={`Уменьшить кегль (сейчас ${mobileChatFontPct}%)`}
          title={`Кегль ${mobileChatFontPct}% · уменьшить`}
        >
          <ChatFontTypeGlyph plus={false} />
        </button>
      ) : null}
    </div>
  );

  const eastHeaderOverflow = Boolean(mobileEmbedHost && mobileEastHeaderCompact);

  const dockNode = (
    <div
      ref={dockRef}
      className={[
        'table-chat-dock',
        'table-chat-dock--pro',
        variant === 'mobile' ? 'table-chat-dock--mobile' : 'table-chat-dock--pc',
        variant === 'mobile' && mobileEmbedHost ? 'table-chat-dock--east-embed' : '',
        variant === 'mobile' && mobileLsBottomChrome ? 'table-chat-dock--ls-bottom' : '',
        eastHeaderOverflow ? 'table-chat-dock--east-header-overflow' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={variant === 'pc' ? pcExpandedDockStyle : mobileDockStyle}
      {...(variant === 'pc'
        ? { 'data-pc-chat-drag-x': String(pcDrag.x), 'data-pc-chat-drag-y': String(pcDrag.y) }
        : {})}
    >
      {variant === 'mobile' && !mobileEmbedHost ? (
        <button
          type="button"
          className="table-chat-ls-height-handle"
          onPointerDown={mobileLsBottomChrome ? startLsChatResize : startMobileResize}
          aria-label="Изменить высоту окна чата"
          title="Потяните вверх, чтобы увеличить высоту"
        >
          <span aria-hidden>⋯</span>
        </button>
      ) : null}
      {variant === 'mobile' && (
        <div className="table-chat-dock-header table-chat-dock-header--pro">
          <div className="table-chat-dock-header-left">
            {chatSearchOpen ? (
              chatSearchField
            ) : (
              <>
                <span className="table-chat-dock-title" aria-hidden>
                  💬
                </span>
                <span className="table-chat-dock-title-text">Чат стола</span>
                {hasLocalHidden ? (
                  <button
                    type="button"
                    className="table-chat-hidden-chip"
                    aria-expanded={chatHiddenPanelOpen}
                    aria-label="Показать скрытые сообщения"
                    title="Скрытые только у вас — можно вернуть"
                    onClick={() => {
                      closeMsgActionMenu();
                      setChatHiddenPanelOpen((v) => !v);
                    }}
                  >
                    Скрыто
                  </button>
                ) : null}
                {typingPhantomLine ? (
                  <span className="table-chat-dock-typing" aria-live="polite">
                    {typingPhantomLine}
                  </span>
                ) : null}
              </>
            )}
          </div>
          {!eastHeaderOverflow ? chatHeaderTools(false) : null}
          {!mobileEmbedHost ? (
            <button
              type="button"
              className={[
                'table-chat-dock-collapse',
                'table-chat-dock-collapse--crystal',
                collapseHintOn ? 'table-chat-dock-collapse--intro' : '',
                !mobileLsBottomChrome && !collapseHintOn ? 'table-chat-dock-collapse--glyph-only' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => setMobileOpen(false)}
              aria-label="Свернуть чат"
              title="Свернуть"
            >
              <CrystalLilacGlyph id={`${emojiPanelDomId}-col-bottom`} path="M3.2 5.8 8 10.8l4.8-5" />
              <span className="table-chat-dock-collapse__label">Свернуть</span>
            </button>
          ) : null}
          <div className="table-chat-dock-mobile-quick-actions">
            {mobileEmbedHost ? (
              <button
                type="button"
                className="table-chat-east-crystal-btn table-chat-east-crystal-btn--collapse"
                onClick={() => setMobileOpen(false)}
                aria-label="Свернуть чат в капсулу"
                title="Свернуть"
              >
                <CrystalLilacGlyph id={`${emojiPanelDomId}-col`} path="M3.2 5.8 8 10.8l4.8-5" />
              </button>
            ) : null}
            {mobileEmbedHost && onEastEmbedDismissToBottom ? (
              <button
                type="button"
                className="table-chat-east-crystal-btn table-chat-dock-placement-btn"
                onClick={onEastEmbedDismissToBottom}
                aria-label="Переложить чат вниз, под Юг"
                title="Чат снизу под Югом"
              >
                <ChatPlacementDockGlyph side="bottom" />
              </button>
            ) : null}
            {mobileLsBottomChrome && onLsBottomMoveToSide ? (
              <button
                type="button"
                className="table-chat-east-crystal-btn table-chat-dock-placement-btn"
                onClick={onLsBottomMoveToSide}
                aria-label="Переложить чат вправо, к сукну"
                title="Чат справа от сукна"
              >
                <ChatPlacementDockGlyph side="east" />
              </button>
            ) : null}
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
              <span className="table-chat-dock-mobile-quick-btn__label">Мои</span>
            </button>
            {!mobileEmbedHost && (mobileLsBottomChrome || !collapseHintOn) ? (
              <button
                type="button"
                className={[
                  'table-chat-dock-mobile-quick-btn',
                  emojiPickerOpen && emojiTab === 'phrases' ? 'table-chat-dock-mobile-quick-btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={onMobileQuickPhrases}
                aria-pressed={emojiPickerOpen && emojiTab === 'phrases'}
                aria-label="Готовые фразы"
              >
                <span className="table-chat-dock-mobile-quick-btn__label">Фразы</span>
              </button>
            ) : null}
            {!eastHeaderOverflow ? mobileFontCtrl : null}
            {eastHeaderOverflow ? (
              <div ref={eastToolsMenuRef} className="table-chat-dock-east-more">
                <button
                  type="button"
                  className={[
                    'table-chat-east-crystal-btn',
                    'table-chat-dock-east-more__btn',
                    eastToolsMenuOpen ? 'is-open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-expanded={eastToolsMenuOpen}
                  aria-haspopup="true"
                  aria-label="Ещё параметры чата"
                  title="Поиск, порядок, кегль"
                  onClick={() => setEastToolsMenuOpen((v) => !v)}
                >
                  <span className="table-chat-dock-east-more__dots" aria-hidden>
                    ···
                  </span>
                </button>
                {eastToolsMenuOpen ? (
                  <div className="table-chat-dock-east-more__panel" role="menu">
                    {chatHeaderTools(false)}
                    {mobileFontCtrl}
                  </div>
                ) : null}
              </div>
            ) : null}
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
          {chatSearchOpen ? (
            chatSearchField
          ) : (
            <span className="table-chat-dock-title-text">Чат</span>
          )}
          {hasLocalHidden && !chatSearchOpen ? (
            <button
              type="button"
              className="table-chat-hidden-chip"
              aria-expanded={chatHiddenPanelOpen}
              aria-label="Показать скрытые сообщения"
              title="Скрытые только у вас — можно вернуть"
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => {
                closeMsgActionMenu();
                setChatHiddenPanelOpen((v) => !v);
              }}
            >
              Скрыто
            </button>
          ) : null}
          {typingPhantomLine && !chatSearchOpen ? (
            <span className="table-chat-dock-typing table-chat-dock-typing--pc" aria-live="polite">
              {typingPhantomLine}
            </span>
          ) : null}
          {chatHeaderTools(true)}
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
      <div ref={listRef} className="table-chat-messages table-chat-messages--pro" role="log" aria-live="polite">
        {visibleFeedMessages.length === 0 ? (
          <div className="table-chat-empty table-chat-empty--pro">
            <span className="table-chat-empty__lead">Пока тихо</span>
            <span className="table-chat-empty__hint">Напишите что-нибудь — сообщение увидят все за столом.</span>
          </div>
        ) : displayMessages.length === 0 ? (
          <div className="table-chat-empty table-chat-empty--pro">
            <span className="table-chat-empty__lead">Ничего не найдено</span>
            <span className="table-chat-empty__hint">Попробуйте другое слово или символ.</span>
          </div>
        ) : (
          displayMessages.map((m) => {
            const self = m.user_id === userId;
            const pending = m.id.startsWith('opt-');
            const msgActionHandlers = pending
              ? {}
              : {
                  onContextMenu: (e: ReactMouseEvent) => {
                    e.preventDefault();
                    openMsgActionSheet(m);
                  },
                  onPointerDown: (e: ReactPointerEvent) => {
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    msgTapGuardRef.current = { x: e.clientX, y: e.clientY, moved: false };
                  },
                  onPointerMove: (e: ReactPointerEvent) => {
                    const g = msgTapGuardRef.current;
                    if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 14) g.moved = true;
                  },
                  onClick: () => {
                    if (msgTapGuardRef.current.moved) return;
                    openMsgActionSheet(m);
                  },
                };
            if (variant === 'mobile') {
              const hasContextQuote = parsePhantomContextualReplyBody(m.body) !== null;
              const reactChips = reactionsByMessageId.get(m.id) ?? [];
              const authorLabel = self
                ? tableChatOwnAuthorLabel(displayName, m.display_name)
                : m.display_name.trim() || 'Игрок';
              const authorFold = foldTableChatDisplayName(authorLabel);
              const authorExpanded = expandedFeedNames.has(authorFold.full);
              const authorShown =
                authorFold.long && !authorExpanded ? authorFold.folded : authorFold.full;
              const nameTap = tableChatNameTapKind({ self, long: authorFold.long });
              const nameClass = [
                'table-chat-msg-compact__name',
                self
                  ? 'table-chat-msg-compact__name--self-chip'
                  : 'table-chat-msg-compact__name--peer',
                nameTap !== 'none' ? 'table-chat-msg-compact__name--fold' : '',
                authorExpanded ? 'table-chat-msg-compact__name--fold-open' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const nameInner = (
                <ChatHighlightedText text={authorShown} query={chatSearchQuery} />
              );
              const nameNode =
                nameTap === 'none' ? (
                  <span className={nameClass}>{nameInner}</span>
                ) : (
                  <button
                    type="button"
                    className={nameClass}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (nameTap === 'expand-and-menu') {
                        if (authorFold.long) expandFeedName(authorFold.full);
                        openMsgNameSheet(m);
                      } else {
                        toggleFeedName(authorFold.full, authorExpanded);
                      }
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    aria-expanded={authorFold.long ? authorExpanded : undefined}
                    aria-label={self ? authorFold.full : `Написать ${authorFold.full}`}
                  >
                    {nameInner}
                  </button>
                );
              return (
                <div
                  key={m.id}
                  className={tableChatFeedRowClassNames({
                    kind: mobileFeedKind,
                    self,
                    pending,
                    hasContextQuote,
                    selected: msgActionTarget?.messageId === m.id,
                  })}
                  {...msgActionHandlers}
                >
                  <span className="table-chat-msg-compact__name-cell">{nameNode}</span>
                  <span className="table-chat-msg-compact__body-cell">
                    <TableChatMessageBody
                      body={m.body}
                      variant="compact"
                      highlightQuery={chatSearchQuery}
                    />
                    <span
                      className="table-chat-msg-compact__tail"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {reactChips.length > 0 ? (
                        <TableChatReactionChips
                          chips={reactChips}
                          disabled={sending}
                          onToggle={(emo) => void toggleMsgReaction(m.id, emo)}
                        />
                      ) : null}
                      {!pending ? (
                        <button
                          type="button"
                          className="table-chat-msg-react-btn"
                          aria-label="Добавить реакцию"
                          title="Реакция"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openMsgReactSheet(m);
                          }}
                        >
                          {'\u263A\uFE0E'}
                        </button>
                      ) : null}
                    </span>
                  </span>
                  <time className="table-chat-msg-compact__time" dateTime={m.created_at}>
                    {formatTableChatClock(m.created_at)}
                  </time>
                </div>
              );
            }
            return (
              <div
                key={m.id}
                className={[
                  'table-chat-msg',
                  self ? 'table-chat-msg--self' : 'table-chat-msg--peer',
                  pending ? 'table-chat-msg--pending' : '',
                  !pending ? 'table-chat-msg--actionable' : '',
                  msgActionTarget?.messageId === m.id ? 'table-chat-msg--selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                {...msgActionHandlers}
              >
                {!self && (
                  <div className="table-chat-msg__avatar" aria-hidden title={m.display_name || 'Игрок'}>
                    {initialsFromName(m.display_name || 'Игрок')}
                  </div>
                )}
                <div className="table-chat-msg__bubble-wrap">
                  <div className="table-chat-msg__meta">
                    {!self && (
                      <button
                        type="button"
                        className="table-chat-msg__name table-chat-msg__name--peer"
                        onClick={(e) => {
                          e.stopPropagation();
                          openMsgNameSheet(m);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <ChatHighlightedText text={m.display_name || 'Игрок'} query={chatSearchQuery} />
                      </button>
                    )}
                    <time className="table-chat-msg__time" dateTime={m.created_at}>
                      {formatChatTime(m.created_at)}
                    </time>
                  </div>
                  <div className="table-chat-msg__bubble">
                    <TableChatMessageBody
                      body={m.body}
                      variant="bubble"
                      highlightQuery={chatSearchQuery}
                    />
                    {!pending && (
                      <>
                        <button
                          type="button"
                          className="table-chat-msg__copy"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyBody(m.body);
                          }}
                          aria-label="Скопировать текст"
                          title="Скопировать"
                        >
                          ⧉
                        </button>
                        <button
                          type="button"
                          className="table-chat-msg-react-btn table-chat-msg-react-btn--bubble"
                          aria-label="Добавить реакцию"
                          title="Реакция"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            openMsgReactSheet(m);
                          }}
                        >
                          {'\u263A\uFE0E'}
                        </button>
                      </>
                    )}
                  </div>
                  <TableChatReactionChips
                    chips={reactionsByMessageId.get(m.id) ?? []}
                    disabled={sending}
                    onToggle={(emo) => void toggleMsgReaction(m.id, emo)}
                  />
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
      <div
        className={[
          'table-chat-composer',
          'table-chat-composer--pro',
          feedReplyAnchor || feedAddressTo ? 'table-chat-composer--compose-extra' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
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
                <div
                  className={[
                    'table-chat-emoji-panel__tabs-rail',
                    variant === 'mobile' && mobileEmojiTabsCanScrollLeft
                      ? 'table-chat-emoji-panel__tabs-rail--more-left'
                      : '',
                    variant === 'mobile' && mobileEmojiTabsCanScrollRight
                      ? 'table-chat-emoji-panel__tabs-rail--more-right'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div
                    ref={variant === 'mobile' ? mobileEmojiTabsRef : undefined}
                    className="table-chat-emoji-panel__tabs"
                    role="tablist"
                    onScroll={variant === 'mobile' ? updateMobileEmojiTabsOverflow : undefined}
                  >
                    {TABLE_CHAT_PICKER_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        data-emoji-tab={tab.id}
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
                  {variant === 'mobile' && mobileEmojiTabsCanScrollLeft ? (
                    <ChatStripPeekButton
                      id={`${emojiPanelDomId}-tabs-peek-l`}
                      dir={-1}
                      onScroll={scrollMobileEmojiTabsBy}
                      className="table-chat-emoji-panel__tabs-peek table-chat-emoji-panel__tabs-peek--left"
                      label="Прокрутить вкладки влево"
                      crystal
                    />
                  ) : null}
                  {variant === 'mobile' && mobileEmojiTabsCanScrollRight ? (
                    <ChatStripPeekButton
                      id={`${emojiPanelDomId}-tabs-peek-r`}
                      dir={1}
                      onScroll={scrollMobileEmojiTabsBy}
                      className="table-chat-emoji-panel__tabs-peek"
                      label="Прокрутить вкладки вправо"
                      crystal
                    />
                  ) : null}
                </div>
                {emojiTab === 'phrases' ? (
                  <div className="table-chat-phrase-scroll">
                    {variant === 'mobile' ? (
                      <p className="table-chat-picker-short-hint" role="note">
                        <span className="table-chat-picker-short-hint__lead">Тап</span> — в сообщение.
                        {' '}
                        <span className="table-chat-picker-short-hint__lead">★</span> — в «Мои».
                      </p>
                    ) : null}
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
                              ? 'В сообщение не влезет — нажмите «В Мои» справа, чтобы сохранить'
                              : variant === 'pc'
                                ? 'Клик — вставить в сообщение. Shift/Alt + клик — только в «Мои»'
                                : 'Тап — в сообщение'
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
                          onContextMenu={(e) => {
                            if (variant === 'mobile') e.preventDefault();
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
                          {variant === 'mobile' ? '★' : variant === 'pc' ? 'В Мои' : '+'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : emojiTab === 'mine' ? (
                  <div className="table-chat-mine">
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
                        <div className="table-chat-mine__empty table-chat-mine__empty--guide">
                          <p className="table-chat-mine__empty-lead">Пока пусто</p>
                          {variant === 'mobile' ? (
                            <>
                              <ol className="table-chat-mine__empty-steps">
                                <li>
                                  Введите фразу в поле <strong>ниже</strong> и нажмите «Добавить»
                                </li>
                                <li>
                                  Или откройте эмодзи / фразы и нажмите <strong>★</strong> / «В Мои»
                                </li>
                              </ol>
                              <div className="table-chat-mine__empty-actions">
                                <button
                                  type="button"
                                  className="table-chat-mine__empty-go"
                                  onClick={() => {
                                    setEmojiTab('react');
                                    setEmojiBankExpanded(false);
                                  }}
                                >
                                  К эмодзи
                                </button>
                                <button
                                  type="button"
                                  className="table-chat-mine__empty-go"
                                  onClick={() => {
                                    setEmojiTab('phrases');
                                    setEmojiBankExpanded(false);
                                  }}
                                >
                                  К фразам
                                </button>
                              </div>
                            </>
                          ) : (
                            <p className="table-chat-mine__empty-hint">
                              ★ у эмодзи, «+» у фразы, или поле ниже.
                            </p>
                          )}
                        </div>
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
                                  {variant === 'mobile' && mobileMineEditMode ? (
                                    <button
                                      type="button"
                                      className="table-chat-mine__rewrite"
                                      aria-label={`Изменить: ${s.slice(0, 40)}`}
                                      title="Изменить"
                                      onClick={() => {
                                        setMineDraft(s);
                                        setMineEditIndex(idx);
                                      }}
                                    >
                                      ✎
                                    </button>
                                  ) : null}
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
                                  {variant === 'mobile' && mobileMineEditMode ? (
                                    <button
                                      type="button"
                                      className="table-chat-mine__rewrite"
                                      aria-label={`Изменить: ${s.slice(0, 40)}`}
                                      title="Изменить"
                                      onClick={() => {
                                        setMineDraft(s);
                                        setMineEditIndex(idx);
                                      }}
                                    >
                                      ✎
                                    </button>
                                  ) : null}
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
                      {variant === 'mobile' ? (
                        <button
                          type="button"
                          className="table-chat-mine__edit-toggle-mobile"
                          onClick={() => {
                            setMobileMineEditMode((v) => {
                              if (v) {
                                setMineEditIndex(null);
                              }
                              return !v;
                            });
                          }}
                          aria-pressed={mobileMineEditMode}
                          aria-label={mobileMineEditMode ? 'Готово' : 'Настроить список Мои'}
                        >
                          {mobileMineEditMode ? 'Готово' : 'Настроить'}
                        </button>
                      ) : null}
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
                        placeholder={variant === 'mobile' ? 'Новая фраза…' : 'Новая фраза или эмодзи…'}
                        maxLength={MY_SNIPPETS_MAX_LEN}
                        aria-label="Новая строка для банка «Мои»"
                      />
                      <button
                        type="button"
                        className="table-chat-mine__add-btn"
                        disabled={!mineDraft.trim() || mySnippets.length >= MY_SNIPPETS_MAX}
                        onClick={() => commitMineDraft()}
                        aria-label={mineEditIndex != null ? 'Сохранить изменение' : 'Добавить'}
                      >
                        {variant === 'mobile' ? (mineEditIndex != null ? '✓' : '+') : mineEditIndex != null ? 'Сохранить' : 'Добавить'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {variant === 'mobile' ? (
                      <p className="table-chat-picker-short-hint" role="note">
                        <span className="table-chat-picker-short-hint__lead">Тап</span> — в сообщение.
                        {' '}
                        <span className="table-chat-picker-short-hint__lead">★</span> — в «Мои».
                      </p>
                    ) : null}
                    {variant !== 'mobile' &&
                    (emojiTab === 'react' || emojiTab === 'cards' || emojiTab === 'misc') &&
                    tabHasEmojiMore(emojiTab) ? (
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
                                  ? `${emo} — тап: в чат; ★: в «Мои»`
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
                              onContextMenu={(e) => {
                                if (variant === 'mobile') e.preventDefault();
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
                            <button
                              type="button"
                              className={[
                                'table-chat-emoji-cell-star',
                                variant === 'mobile' ? 'table-chat-emoji-cell-star--mobile' : '',
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
                              onContextMenu={(e) => {
                                e.preventDefault();
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                addMineFromEmojiStar(emo, starFlashKey);
                              }}
                            >
                              <span aria-hidden>★</span>
                            </button>
                          </div>
                        );
                      })}
                      {variant === 'mobile' &&
                      (emojiTab === 'react' || emojiTab === 'cards' || emojiTab === 'misc') &&
                      tabHasEmojiMore(emojiTab) ? (
                        <button
                          type="button"
                          className="table-chat-emoji-more table-chat-emoji-more--compact"
                          aria-expanded={emojiBankExpanded}
                          aria-controls={`${emojiPanelDomId}-grid`}
                          aria-label={emojiBankExpanded ? 'Свернуть дополнительные эмодзи' : 'Ещё эмодзи'}
                          onClick={() => setEmojiBankExpanded((v) => !v)}
                        >
                          {emojiBankExpanded ? '−' : '+ ещё'}
                        </button>
                      ) : null}
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
          {mobileLsBottomChrome ? (
            <div className="table-chat-ls-bottom-rail" aria-hidden />
          ) : null}
          {variant === 'mobile' && mySnippets.length > 0 ? (
            <div
              id={`${emojiPanelDomId}-fav-rail`}
              className={[
                'table-chat-mobile-favorites-rail',
                mobileFavCanScrollLeft ? 'table-chat-mobile-favorites-rail--more-left' : '',
                mobileFavCanScrollRight ? 'table-chat-mobile-favorites-rail--more-right' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div
                ref={mobileFavoritesRef}
                className="table-chat-mobile-favorites"
                aria-label="Избранные вставки. Прокрутите вбок, если есть ещё"
                onScroll={updateMobileFavoritesOverflow}
              >
                {mySnippets.slice(0, 10).map((s, idx) => (
                  <Fragment key={`fav-${idx}-${mineSnippetDedupeKey(s)}`}>
                    {idx > 0 && !mobileEmbedHost ? (
                      <span className="table-chat-mobile-favorites__spark" aria-hidden />
                    ) : null}
                    <button
                      type="button"
                      className="table-chat-mobile-favorites__chip"
                      disabled={text.length + s.length > MAX_BODY}
                      onClick={() => insertSnippet(s)}
                      title={s}
                    >
                      {s}
                    </button>
                  </Fragment>
                ))}
                <span className="table-chat-mobile-favorites__tail" aria-hidden />
              </div>
              {mobileFavCanScrollLeft ? (
                <ChatStripPeekButton
                  id={`${emojiPanelDomId}-fav-peek-l`}
                  dir={-1}
                  onScroll={scrollMobileFavoritesBy}
                  className="table-chat-mobile-favorites-rail__peek table-chat-mobile-favorites-rail__peek--left"
                  label="Прокрутить избранное влево"
                  crystal={!mobileEmbedHost}
                />
              ) : null}
              {mobileFavCanScrollRight ? (
                <ChatStripPeekButton
                  id={`${emojiPanelDomId}-fav-peek-r`}
                  dir={1}
                  onScroll={scrollMobileFavoritesBy}
                  className="table-chat-mobile-favorites-rail__peek"
                  label="Прокрутить избранное вправо"
                  crystal={!mobileEmbedHost}
                />
              ) : null}
            </div>
          ) : null}
          {feedReplyPreview ? (
            <div className="table-chat-feed-reply-strip" role="status">
              <div className="table-chat-feed-reply-strip__accent" aria-hidden />
              <div className="table-chat-feed-reply-strip__body">
                <span className="table-chat-feed-reply-strip__kicker">Ответ</span>
                <span className="table-chat-feed-reply-strip__author">{feedReplyPreview.author}</span>
                <span className="table-chat-feed-reply-strip__excerpt">{feedReplyPreview.excerpt}</span>
              </div>
              <button
                type="button"
                className="table-chat-feed-reply-strip__clear"
                aria-label="Отменить цитату"
                title="Отменить цитату"
                onClick={() => setFeedReplyAnchor(null)}
              >
                ×
              </button>
            </div>
          ) : null}
          {feedAddressTo ? (
            <div className="table-chat-feed-reply-strip table-chat-feed-reply-strip--address" role="status">
              <div className="table-chat-feed-reply-strip__accent" aria-hidden />
              <div className="table-chat-feed-reply-strip__body">
                <span className="table-chat-feed-reply-strip__kicker">Для</span>
                <span className="table-chat-feed-reply-strip__author">{feedAddressTo}</span>
              </div>
              <button
                type="button"
                className="table-chat-feed-reply-strip__clear"
                aria-label="Отменить адресата"
                title="Отменить адресата"
                onClick={() => setFeedAddressTo(null)}
              >
                ×
              </button>
            </div>
          ) : null}
          {variant === 'mobile' ? (
            <div
              ref={inputShellRef}
              className={[
                'table-chat-mobile-input-shell',
                composerFlashOn ? 'table-chat-mobile-input-shell--flash' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
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
                placeholder={
                  feedAddressTo
                    ? `Для ${feedAddressTo}…`
                    : feedReplyAnchor
                      ? `Ответ для ${feedReplyAnchor.author || 'собеседника'}…`
                      : 'Сообщение…'
                }
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
                {sending ? (
                  <span className="table-chat-send__spinner" aria-hidden />
                ) : (
                  <span className="table-chat-mobile-input-shell__send-glyph" aria-hidden>
                    <CrystalLilacGlyph
                      id={`${emojiPanelDomId}-send`}
                      filled
                      path="M2.6 2.4 13.6 8 2.6 13.6 5.4 8Z"
                    />
                  </span>
                )}
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
                placeholder={
                  feedAddressTo
                    ? `Для ${feedAddressTo}…`
                    : feedReplyAnchor
                      ? `Ответ для ${feedReplyAnchor.author || 'собеседника'}…`
                      : 'Сообщение…'
                }
                maxLength={MAX_BODY}
                rows={1}
                className={[
                  'table-chat-input',
                  'table-chat-input--pro',
                  composerFlashOn ? 'table-chat-input--flash' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
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
      {chatHiddenPanelOpen && hasLocalHidden ? (
        <div
          className={[
            'table-chat-msg-action-layer',
            variant === 'mobile' ? 'table-chat-msg-action-layer--feed' : '',
            mobileLsBottomChrome ? 'table-chat-msg-action-layer--ls-feed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="presentation"
        >
          <button
            type="button"
            className="table-chat-msg-action-layer__dismiss"
            aria-label="Закрыть список скрытых"
            onClick={() => setChatHiddenPanelOpen(false)}
          />
          <div
            className="table-chat-msg-action-sheet table-chat-hidden-sheet"
            role="dialog"
            aria-label="Скрытые сообщения"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="table-chat-msg-action-sheet__head">
              <div className="table-chat-msg-action-sheet__preview">
                <span className="table-chat-msg-action-sheet__author">Скрыто у вас</span>
                <span className="table-chat-msg-action-sheet__snippet">Можно вернуть в любой момент</span>
              </div>
              <button
                type="button"
                className="table-chat-msg-action-sheet__close"
                aria-label="Закрыть"
                onClick={() => setChatHiddenPanelOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="table-chat-hidden-sheet__list">
              {hiddenUserEntries.map((u) => (
                <div key={u.id} className="table-chat-hidden-sheet__row">
                  <span className="table-chat-hidden-sheet__label">{u.name}</span>
                  <button
                    type="button"
                    className="table-chat-hidden-sheet__show"
                    onClick={() => unhideChatUserById(u.id)}
                  >
                    Показать
                  </button>
                </div>
              ))}
              {hiddenMsgIds.size > 0 ? (
                <div className="table-chat-hidden-sheet__row">
                  <span className="table-chat-hidden-sheet__label">
                    {hiddenSoloMsgCount > 0
                      ? `Сообщения (${hiddenSoloMsgCount})`
                      : 'Скрытые сообщения'}
                  </span>
                  <button
                    type="button"
                    className="table-chat-hidden-sheet__show"
                    onClick={unhideAllHiddenMessages}
                  >
                    Показать
                  </button>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="table-chat-msg-action-sheet__btn table-chat-hidden-sheet__all"
              onClick={unhideAllHiddenChat}
            >
              <span className="table-chat-msg-action-sheet__btn-copy">
                <strong>Показать всё</strong>
              </span>
            </button>
          </div>
        </div>
      ) : null}
      {chatHideUndo ? (
        <div className="table-chat-hide-toast" role="status">
          <span>{chatHideUndo.label}</span>
          <button type="button" className="table-chat-hide-toast__undo" onClick={undoChatHide}>
            Вернуть
          </button>
        </div>
      ) : null}
      {msgActionMode && msgActionTarget ? (
        <div
          className={[
            'table-chat-msg-action-layer',
            variant === 'mobile' ? 'table-chat-msg-action-layer--feed' : '',
            mobileLsBottomChrome ? 'table-chat-msg-action-layer--ls-feed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          role="presentation"
        >
          <button
            type="button"
            className="table-chat-msg-action-layer__dismiss"
            aria-label="Закрыть меню сообщения"
            onClick={closeMsgActionMenu}
          />
          <div
            className={[
              'table-chat-msg-action-sheet',
              msgActionMode === 'react' ? 'table-chat-msg-action-sheet--react' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="dialog"
            aria-label={
              msgActionMode === 'react'
                ? `Реакция на сообщение от ${msgActionTarget.author || 'игрока'}`
                : msgActionMode === 'name'
                  ? `Написать ${msgActionTarget.author || 'игроку'}`
                  : `Действия с сообщением от ${msgActionTarget.author || 'игрока'}`
            }
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="table-chat-msg-action-sheet__head">
              <div className="table-chat-msg-action-sheet__preview">
                <span className="table-chat-msg-action-sheet__author">
                  {msgActionTarget.author.trim() || 'Игрок'}
                </span>
                <span className="table-chat-msg-action-sheet__snippet">
                  {truncatePhantomQuoteExcerpt(msgActionTarget.body, 42)}
                </span>
              </div>
              <button
                type="button"
                className="table-chat-msg-action-sheet__close"
                aria-label="Закрыть"
                onClick={closeMsgActionMenu}
              >
                ×
              </button>
            </div>
            {msgActionMode === 'sheet' ? (
              <div className="table-chat-msg-action-sheet__actions" role="menu">
                <button
                  type="button"
                  className="table-chat-msg-action-sheet__btn"
                  role="menuitem"
                  title="Ответить с цитатой"
                  onClick={beginFeedQuoteReply}
                >
                  <span className="table-chat-msg-action-sheet__btn-ico" aria-hidden>
                    ↩
                  </span>
                  <span className="table-chat-msg-action-sheet__btn-copy">
                    <strong>Ответить</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="table-chat-msg-action-sheet__btn"
                  role="menuitem"
                  title="Скопировать текст"
                  onClick={copyMsgActionTarget}
                >
                  <span className="table-chat-msg-action-sheet__btn-ico" aria-hidden>
                    ⧉
                  </span>
                  <span className="table-chat-msg-action-sheet__btn-copy">
                    <strong>Копировать</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="table-chat-msg-action-sheet__btn table-chat-msg-action-sheet__btn--quiet"
                  role="menuitem"
                  title={tableChatMessageSheetHideCopy(msgActionTarget.userId === userId).title}
                  onClick={hideChatMessage}
                >
                  <span className="table-chat-msg-action-sheet__btn-ico" aria-hidden>
                    ⌕
                  </span>
                  <span className="table-chat-msg-action-sheet__btn-copy">
                    <strong>
                      {tableChatMessageSheetHideCopy(msgActionTarget.userId === userId).label}
                    </strong>
                  </span>
                </button>
              </div>
            ) : msgActionMode === 'name' ? (
              <div className="table-chat-msg-action-sheet__actions" role="menu">
                <button
                  type="button"
                  className="table-chat-msg-action-sheet__btn"
                  role="menuitem"
                  title={`Написать ${msgActionTarget.author.trim() || 'отправителю'}`}
                  onClick={beginFeedAddressSender}
                >
                  <span className="table-chat-msg-action-sheet__btn-ico" aria-hidden>
                    ✎
                  </span>
                  <span className="table-chat-msg-action-sheet__btn-copy">
                    <strong>Написать</strong>
                  </span>
                </button>
                <button
                  type="button"
                  className="table-chat-msg-action-sheet__btn table-chat-msg-action-sheet__btn--quiet"
                  role="menuitem"
                  title="Скрыть все сообщения этого игрока у себя"
                  onClick={hideChatUser}
                >
                  <span className="table-chat-msg-action-sheet__btn-ico" aria-hidden>
                    ⌕
                  </span>
                  <span className="table-chat-msg-action-sheet__btn-copy">
                    <strong>Скрыть все</strong>
                  </span>
                </button>
              </div>
            ) : (
              <div className="table-chat-msg-action-sheet__reacts" role="listbox" aria-label="Выберите реакцию">
                {msgReactMineSnippets.length > 0 ? (
                  <>
                    <span className="table-chat-msg-action-sheet__react-kicker">Мои</span>
                    <div className="table-chat-msg-action-sheet__react-grid table-chat-msg-action-sheet__react-grid--mine">
                      {msgReactMineSnippets.map((emo) => (
                        <button
                          key={`mine-${emo}`}
                          type="button"
                          className={[
                            'table-chat-msg-action-sheet__react-cell',
                            msgActionMineEmoji === emo
                              ? 'table-chat-msg-action-sheet__react-cell--mine'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          role="option"
                          aria-label={`Моя реакция ${emo}`}
                          aria-selected={msgActionMineEmoji === emo}
                          disabled={sending}
                          onClick={() => void sendMsgReaction(emo)}
                        >
                          {emo}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <span className="table-chat-msg-action-sheet__react-kicker">Реакции</span>
                <div className="table-chat-msg-action-sheet__react-grid">
                  {REACTION_EMOJI_PRIMARY.map((emo) => (
                    <button
                      key={emo}
                      type="button"
                      className={[
                        'table-chat-msg-action-sheet__react-cell',
                        msgActionMineEmoji === emo
                          ? 'table-chat-msg-action-sheet__react-cell--mine'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      role="option"
                      aria-label={`Реакция ${emo}`}
                      aria-selected={msgActionMineEmoji === emo}
                      disabled={sending}
                      onClick={() => void sendMsgReaction(emo)}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );

  if (variant === 'mobile' && mobileEmbedHost) {
    return createPortal(dockNode, mobileEmbedHost);
  }
  return dockNode;
}

export { TableChatDock };
