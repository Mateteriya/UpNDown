/**
 * Контракт: онлайн-чат · mobile landscape + обычный портрет (см. обсуждение Aug 2026).
 *
 * 4p LS:
 * - dock чата всегда под Югом;
 * - handLen ≤ HAND_DISK_MAX_CARDS → диск справа от руки;
 * - handLen ≥ HAND_DISK_MAX_CARDS+1 → мини в левом нижнем углу панели Юг
 *   (компактный кристалл; через SOUTH_MINI_COLLAPSE_MS → микро; unread-pip, без «печатает»);
 * - тап по диску/мини → открыть тот же dock.
 *
 * Портрет (обычный, не short-VH), 3p и 4p online:
 * - диск при <5 карт (справа от shrink-wrap руки, группа по центру);
 * - мини при ≥5 карт — на нижней границе панели Юг, по центру по горизонтали.
 *
 * 3p LS:
 * - offline / online по умолчанию: Восток (как сейчас), чат снизу;
 *   вход как у 4p: диск справа от руки (≤5) / мини в ЛН углу Юга (≥6);
 * - online + LS-флаг THREE_SEAT_SIDE_CHAT: idx1 → Север (chrome only), справа колонка чата.
 *
 * Вёрстка диска: слот `.game-mobile-ls-hand-chat-row` у карт; сам диск —
 * portal/fixed для drag. Старт всегда у слота (не restore из LS).
 * Phone LS: grid-column 2. Mid 601–899: chat-row = grid-column 1/-1.
 */

export const MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS = 5;
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

export type MobileLsChatAffordanceMode = 'hand-disk' | 'south-mini';

export function mobileLsChatAffordanceMode(handLen: number): MobileLsChatAffordanceMode {
  return handLen <= MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS ? 'hand-disk' : 'south-mini';
}

/** Портрет: диск, пока карт меньше 5; мини с 5 карт (рука уже широкая). */
export function mobilePortraitChatAffordanceMode(handLen: number): MobileLsChatAffordanceMode {
  return handLen < MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS ? 'hand-disk' : 'south-mini';
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

export function clampMobileLsHandDiskPos(x: number, y: number): MobileLsHandDiskPos {
  const pad = 8;
  const size = MOBILE_LS_HAND_DISK_SIZE_PX;
  const maxX = Math.max(pad, (typeof window !== 'undefined' ? window.innerWidth : size) - size - pad);
  const maxY = Math.max(pad, (typeof window !== 'undefined' ? window.innerHeight : size) - size - pad);
  return {
    x: Math.min(maxX, Math.max(pad, x)),
    y: Math.min(maxY, Math.max(pad, y)),
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
