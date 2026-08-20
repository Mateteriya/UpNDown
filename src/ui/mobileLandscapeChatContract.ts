/**
 * Контракт: онлайн-чат · mobile landscape + обычный портрет (см. обсуждение Aug 2026).
 *
 * 4p LS:
 * - dock чата всегда под Югом;
 * - handLen ≤ HAND_DISK_MAX_CARDS → диск справа от руки;
 * - handLen ≥ 6 → мини-бейдж только на панели Юг (левый нижний угол).
 *
 * Портрет: всегда диск справа от руки (мини на Юге нет).
 *
 * 3p LS:
 * - диск всегда (мини на Юге нет);
 * - handLen ≤ 9 → слот справа от руки;
 * - handLen ≥ 10 → слот сверху над панелью Восток (шапка колонки);
 * - при смене порога / обновлении — снова слот, не last drag;
 * - drag свободен, пока слот не сменился.
 *
 * Вёрстка диска: слот `.game-mobile-ls-hand-chat-row` у карт; сам диск —
 * portal/fixed для drag. Старт всегда у слота (не restore из LS).
 * Phone LS: grid-column 2. Mid 601–899: chat-row = grid-column 1/-1.
 */

export const MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS = 5;
/** 3p LS: диск справа от руки, пока карт не больше этого. */
export const MOBILE_LS_3P_HAND_DISK_MAX_CARDS = 9;
/** Мини на Юге: полный чип → микро (середина окна 5–7 с). */
export const MOBILE_LS_SOUTH_MINI_COLLAPSE_MS = 6000;

/** 3p · side-chat: ширина колонки у сукна (обычный phone LS). */
export const MOBILE_LS_EAST_CHAT_COL_W_PX = 260;
/** 3p · side-chat: узкий landscape (after-short / short) — компактнее. */
export const MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX = 200;
/** 3p · side-chat: ширина колонки, когда чат свёрнут в шапку. */
export const MOBILE_LS_EAST_CHAT_HEADER_COLLAPSED_W_PX = 76;
/** Ручка resize: минимум / максимум ширины колонки чата. */
export const MOBILE_LS_EAST_CHAT_COL_W_MIN_PX = 148;
export const MOBILE_LS_EAST_CHAT_COL_W_MAX_PX = 340;
/** Мин. ширина сукна при растягивании чата (px). */
export const MOBILE_LS_FELT_MIN_BESIDE_CHAT_PX = 160;

export const LS_ONLINE_THREE_SEAT_SIDE_CHAT = 'upndown.onlineChat.threeSeatSide.v1';
export const LS_ONLINE_EAST_CHAT_COL_W = 'upndown.onlineChat.eastColW.v1';
/** Landscape · диск «Чат»: сохранённая позиция после drag. */
export const LS_ONLINE_LS_HAND_DISK_POS = 'upndown.onlineChat.lsHandDiskPos.v1';
export const MOBILE_LS_HAND_DISK_SIZE_PX = 40;
/** Орбита/стрелки вокруг диска вылезают за квадрат 40px. */
export const MOBILE_LS_HAND_DISK_ORBIT_PX = 11;
/** Зазор между визуальным краем карт и орбитой диска. */
export const MOBILE_LS_HAND_DISK_CARD_GAP_PX = 8;
/** 3p LS: вынос живых стрелок ↓/→ за обод диска (hit-target). */
export const MOBILE_LS_HAND_DISK_PLACE_TICK_PX = 30;
/** East-embed: sort/search/кегль в шапке только начиная с этой ширины колонки. */
export const MOBILE_LS_EAST_HEADER_TOOLS_INLINE_MIN_PX = 213;
/** 3p LS: сколько подсвечивать живые ↓/→ при появлении диска. */
export const MOBILE_LS_HAND_DISK_PLACE_INTRO_MS = 3500;
/** После яркого intro: мягкое мигание самих глифов стрелок. */
export const MOBILE_LS_HAND_DISK_PLACE_SOFT_MS = 2500;

export type MobileLsChatPlacement = 'bottom' | 'side';

export function mobileLsEastHeaderUsesOverflow(colW: number): boolean {
  return colW < MOBILE_LS_EAST_HEADER_TOOLS_INLINE_MIN_PX;
}

export type MobileLsChatAffordanceMode = 'hand-disk' | 'south-mini';
export type MobileLsHandDiskHome = 'hand' | 'east-header';

/** 4p landscape: диск ≤5 / мини ≥6. */
export function mobileLsChatAffordanceMode(handLen: number): MobileLsChatAffordanceMode {
  return handLen <= MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS ? 'hand-disk' : 'south-mini';
}

/** Единый вид входа: мини только 4p landscape ≥6; иначе диск. */
export function mobileLsChatAffordanceKind(input: {
  handLen: number;
  landscape: boolean;
  threeSeat: boolean;
}): MobileLsChatAffordanceMode {
  if (input.landscape && !input.threeSeat) return mobileLsChatAffordanceMode(input.handLen);
  return 'hand-disk';
}

export function mobileLsHandDiskHome(input: {
  handLen: number;
  landscape: boolean;
  threeSeat: boolean;
}): MobileLsHandDiskHome {
  if (input.landscape && input.threeSeat && input.handLen > MOBILE_LS_3P_HAND_DISK_MAX_CARDS) {
    return 'east-header';
  }
  return 'hand';
}

/** Портрет: диск всегда (мини на Юге только 4p landscape). */
export function mobilePortraitChatAffordanceMode(_handLen: number): MobileLsChatAffordanceMode {
  return 'hand-disk';
}

/** Узкий phone LS: after-short или short-VH — компактный east-chat. */
export function mobileLsEastChatColWidthPx(opts: {
  afterShort?: boolean;
  shortVh?: boolean;
}): number {
  if (opts.afterShort || opts.shortVh) return MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX;
  return MOBILE_LS_EAST_CHAT_COL_W_PX;
}

export function clampMobileLsEastChatColW(
  px: number,
  opts?: { maxPx?: number },
): number {
  const max = Math.min(
    MOBILE_LS_EAST_CHAT_COL_W_MAX_PX,
    opts?.maxPx ?? MOBILE_LS_EAST_CHAT_COL_W_MAX_PX,
  );
  const hi = Math.max(MOBILE_LS_EAST_CHAT_COL_W_MIN_PX, max);
  return Math.round(Math.min(hi, Math.max(MOBILE_LS_EAST_CHAT_COL_W_MIN_PX, px)));
}

export function readOnlineEastChatColWFromLs(): number | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_ONLINE_EAST_CHAT_COL_W);
    if (raw == null) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return clampMobileLsEastChatColW(n);
  } catch {
    return null;
  }
}

export function writeOnlineEastChatColWToLs(px: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LS_ONLINE_EAST_CHAT_COL_W, String(clampMobileLsEastChatColW(px)));
  } catch {
    /* ignore */
  }
}

export function readOnlineThreeSeatSideChatFromLs(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(LS_ONLINE_THREE_SEAT_SIDE_CHAT) === '1';
  } catch {
    return false;
  }
}

export function writeOnlineThreeSeatSideChatToLs(on: boolean): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (on) localStorage.setItem(LS_ONLINE_THREE_SEAT_SIDE_CHAT, '1');
    else localStorage.removeItem(LS_ONLINE_THREE_SEAT_SIDE_CHAT);
  } catch {
    /* ignore */
  }
}

export type MobileLsHandDiskPos = { x: number; y: number };

export function clampMobileLsHandDiskPos(
  x: number,
  y: number,
  opts?: {
    extraRight?: number;
    extraBottom?: number;
    extraLeft?: number;
    extraTop?: number;
    viewportW?: number;
    viewportH?: number;
  },
): MobileLsHandDiskPos {
  const pad = 8;
  const size = MOBILE_LS_HAND_DISK_SIZE_PX;
  const extraR = Math.max(0, opts?.extraRight ?? 0);
  const extraB = Math.max(0, opts?.extraBottom ?? 0);
  const extraL = Math.max(0, opts?.extraLeft ?? 0);
  const extraT = Math.max(0, opts?.extraTop ?? 0);
  const vw = opts?.viewportW ?? (typeof window !== 'undefined' ? window.innerWidth : 800);
  const vh = opts?.viewportH ?? (typeof window !== 'undefined' ? window.innerHeight : 600);
  const minX = pad + extraL;
  const minY = pad + extraT;
  const maxX = Math.max(minX, vw - size - pad - extraR);
  const maxY = Math.max(minY, vh - size - pad - extraB);
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

export function readOnlineLsHandDiskPosFromLs(): MobileLsHandDiskPos | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_ONLINE_LS_HAND_DISK_POS);
    if (!raw) return null;
    const p = JSON.parse(raw) as MobileLsHandDiskPos;
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return clampMobileLsHandDiskPos(p.x, p.y);
  } catch {
    return null;
  }
}

export function writeOnlineLsHandDiskPosToLs(pos: MobileLsHandDiskPos): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const c = clampMobileLsHandDiskPos(pos.x, pos.y);
    localStorage.setItem(LS_ONLINE_LS_HAND_DISK_POS, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export type MobileLsRect = { left: number; top: number; right: number; bottom: number };

export function mobileLsRectsIntersect(a: MobileLsRect, b: MobileLsRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function mobileLsHandDiskFootprint(
  pos: MobileLsHandDiskPos,
  opts?: {
    extraRight?: number;
    extraBottom?: number;
    extraLeft?: number;
    extraTop?: number;
    pad?: number;
  },
): MobileLsRect {
  const size = MOBILE_LS_HAND_DISK_SIZE_PX;
  const extraR = Math.max(0, opts?.extraRight ?? 0);
  const extraB = Math.max(0, opts?.extraBottom ?? 0);
  const extraL = Math.max(0, opts?.extraLeft ?? 0);
  const extraT = Math.max(0, opts?.extraTop ?? 0);
  const pad = Math.max(0, opts?.pad ?? 0);
  return {
    left: pos.x - extraL - pad,
    top: pos.y - extraT - pad,
    right: pos.x + size + extraR + pad,
    bottom: pos.y + size + extraB + pad,
  };
}

/** Сдвинуть диск вправо (иначе вниз), чтобы орбита не садилась на карты. */
export function nudgeMobileLsHandDiskOffRects(
  pos: MobileLsHandDiskPos,
  obstacles: readonly MobileLsRect[],
  opts?: {
    extraRight?: number;
    extraBottom?: number;
    extraLeft?: number;
    extraTop?: number;
    gap?: number;
  },
): MobileLsHandDiskPos {
  const extraL = Math.max(0, opts?.extraLeft ?? 0);
  const extraT = Math.max(0, opts?.extraTop ?? 0);
  const extraR = Math.max(0, opts?.extraRight ?? 0);
  const extraB = Math.max(0, opts?.extraBottom ?? 0);
  const extra = {
    extraRight: extraR,
    extraBottom: extraB,
    extraLeft: extraL,
    extraTop: extraT,
  };
  const gap = Math.max(4, opts?.gap ?? MOBILE_LS_HAND_DISK_CARD_GAP_PX);
  const finish = (p: MobileLsHandDiskPos) => clampMobileLsHandDiskPos(p.x, p.y, extra);
  const halo = { extraLeft: extraL, extraTop: extraT, extraRight: extraR, extraBottom: extraB };
  const footprint = (p: MobileLsHandDiskPos) => mobileLsHandDiskFootprint(p, halo);
  const overlapsY = (o: MobileLsRect, p: MobileLsHandDiskPos) => {
    const f = footprint(p);
    return o.top < f.bottom && o.bottom > f.top;
  };
  const tooClose = (p: MobileLsHandDiskPos, cards: readonly MobileLsRect[]) => {
    const f = footprint(p);
    return cards.some(
      (o) => f.left < o.right + gap && f.right > o.left && f.top < o.bottom && f.bottom > o.top,
    );
  };

  const relevant = obstacles.filter((o) => overlapsY(o, pos));
  if (relevant.length === 0) return finish(pos);

  const maxRight = Math.max(...relevant.map((o) => o.right));
  const maxBottom = Math.max(...relevant.map((o) => o.bottom));
  const minX = maxRight + gap + extraL;
  const minY = maxBottom + gap + extraT;
  if (pos.x + 0.5 >= minX && !tooClose(pos, relevant)) return finish(pos);

  const rightward = finish({ x: minX, y: pos.y });
  if (rightward.x + 0.5 >= minX && !tooClose(rightward, relevant)) return rightward;

  const down = finish({ x: pos.x, y: minY });
  if (!tooClose(down, relevant)) return down;

  const downRight = finish({ x: minX, y: minY });
  if (!tooClose(downRight, relevant)) return downRight;

  return rightward.x >= pos.x ? rightward : down;
}
