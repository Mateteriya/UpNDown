/**
 * Единый контракт мобильной ленты столового чата.
 *
 * Где действует
 * -------------
 * Один и тот же ряд во всех мобильных режимах:
 *   - портрет;
 *   - landscape 4 игрока (чат снизу, `.table-chat-dock--ls-bottom`);
 *   - landscape 3 игрока, **кроме** узкой колонки у сукна (`mobileEmbedHost` /
 *     `.table-chat-dock--east-embed`) — там `kind: 'side3'`.
 *
 * Разметка ряда (`kind: 'full'`)
 * ------------------------------
 * Одна строка, три полоски:
 *   1. имя отправителя — своя полоска;
 *   2. текст — своя полоска, реакции в конце этой полоски;
 *   3. время — отдельный столбец напротив сообщения.
 * Двухрядный `--ls-wide` (имя сверху, текст снизу) не использовать.
 * Двоеточие «Имя: текст» в ленте не показывать.
 * Кнопки «…» / меню у столбца времени нет. Меню сообщения — только тап по тексту.
 *
 * `kind: 'side3'` (чат справа от сукна)
 * ------------------------------------
 * Та же строка и те же жесты, но:
 *   - имя — узкая полоска;
 *   - текст без chrome полоски (без подложки);
 *   - время крошечное в той же строке, без тяжёлого столбца.
 *
 * Имя
 * ---
 * Своё сообщение: всегда имя из профиля (`tableChatOwnAuthorLabel`), никогда «Вы».
 * Своя полоска визуально отличается от чужой.
 * Длиннее `TABLE_CHAT_NAME_FOLD_CHARS` → свёртка + «…».
 * Тап по чужому имени: развернуть (если свёрнуто) и открыть меню
 *   «Написать» / «Скрыть все».
 * Тап по своему имени: только разворот/сворачивание, без меню.
 * Автосворачивание: `TABLE_CHAT_NAME_FOLD_MS`, либо раньше — другой тап
 * (другое имя / тап по тексту сообщения).
 *
 * Меню по тексту
 * --------------
 * Всем: Ответить (цитата), Копировать.
 * Чужое: Скрыть (локально).
 * Своё: Удалить — тот же локальный hide, другой ярлык
 * (серверного unsend нет).
 */

import { getLocale, t, type TFunc } from '../i18n';

export const TABLE_CHAT_NAME_FOLD_CHARS = 6;
export const TABLE_CHAT_NAME_FOLD_MS = 3000;

export type TableChatFeedKind = 'full' | 'side3';

export type TableChatNameTapKind = 'expand-and-menu' | 'toggle-fold' | 'none';

export function tableChatFeedKind(opts: { mobileEmbedHost: boolean }): TableChatFeedKind {
  return opts.mobileEmbedHost ? 'side3' : 'full';
}

export function tableChatOwnAuthorLabel(
  profileDisplayName: string,
  fallbackMessageName?: string,
  tr: TFunc = t,
): string {
  const fromProfile = profileDisplayName.trim();
  if (fromProfile) return fromProfile;
  const fromMessage = fallbackMessageName?.trim();
  if (fromMessage) return fromMessage;
  return tr('common.player');
}

export function foldTableChatDisplayName(name: string, tr: TFunc = t): {
  full: string;
  folded: string;
  long: boolean;
} {
  const full = name.trim() || tr('common.player');
  const chars = Array.from(full);
  if (chars.length <= TABLE_CHAT_NAME_FOLD_CHARS) {
    return { full, folded: full, long: false };
  }
  return {
    full,
    folded: `${chars.slice(0, TABLE_CHAT_NAME_FOLD_CHARS).join('')}…`,
    long: true,
  };
}

export function tableChatNameTapKind(opts: {
  self: boolean;
  long: boolean;
}): TableChatNameTapKind {
  if (!opts.self) return 'expand-and-menu';
  if (opts.long) return 'toggle-fold';
  return 'none';
}

/** Часы в столбце ленты: всегда HH:MM, без «сейчас» и без «…». */
export function formatTableChatClock(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const loc = getLocale() === 'en' ? 'en-GB' : 'ru-RU';
    return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function tableChatMessageSheetHideCopy(self: boolean, tr: TFunc = t): {
  label: string;
  undo: string;
  title: string;
} {
  if (self) {
    return {
      label: tr('chat.delete'),
      undo: tr('chat.msgDeleted'),
      title: tr('chat.deleteLocal'),
    };
  }
  return {
    label: tr('chat.hide'),
    undo: tr('chat.msgHidden'),
    title: tr('chat.hideLocal'),
  };
}

export function tableChatFeedRowClassNames(opts: {
  kind: TableChatFeedKind;
  self: boolean;
  pending: boolean;
  hasContextQuote: boolean;
  selected: boolean;
}): string {
  return [
    'table-chat-msg-compact',
    'table-chat-msg-compact--feed',
    opts.kind === 'side3'
      ? 'table-chat-msg-compact--feed-side3'
      : 'table-chat-msg-compact--feed-full',
    opts.self ? 'table-chat-msg-compact--self' : '',
    opts.pending ? 'table-chat-msg-compact--pending' : '',
    opts.hasContextQuote ? 'table-chat-msg-compact--has-quote' : '',
    !opts.pending ? 'table-chat-msg-compact--actionable' : '',
    opts.selected ? 'table-chat-msg-compact--selected' : '',
  ]
    .filter(Boolean)
    .join(' ');
}
