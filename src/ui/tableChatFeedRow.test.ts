import { describe, expect, it } from 'vitest';
import {
  TABLE_CHAT_NAME_FOLD_CHARS,
  foldTableChatDisplayName,
  formatTableChatClock,
  tableChatFeedKind,
  tableChatFeedRowClassNames,
  tableChatMessageSheetHideCopy,
  tableChatNameTapKind,
  tableChatOwnAuthorLabel,
} from './tableChatFeedRow';

describe('tableChatFeedRow contract', () => {
  it('folds names longer than 6 characters with an ellipsis', () => {
    expect(TABLE_CHAT_NAME_FOLD_CHARS).toBe(6);
    expect(foldTableChatDisplayName('Саша')).toEqual({
      full: 'Саша',
      folded: 'Саша',
      long: false,
    });
    expect(foldTableChatDisplayName('Алексе')).toEqual({
      full: 'Алексе',
      folded: 'Алексе',
      long: false,
    });
    expect(foldTableChatDisplayName('Алексей')).toEqual({
      full: 'Алексей',
      folded: 'Алексе…',
      long: true,
    });
  });

  it('uses the profile name, not a generic «Вы» label', () => {
    expect(tableChatOwnAuthorLabel('Катя')).toBe('Катя');
    expect(tableChatOwnAuthorLabel('  ', 'Аня')).toBe('Аня');
    expect(tableChatOwnAuthorLabel('   ', '  ')).toBe('Игрок');
  });

  it('opens the name menu only for peers; own name only toggles a long fold', () => {
    expect(tableChatNameTapKind({ self: false, long: false })).toBe('expand-and-menu');
    expect(tableChatNameTapKind({ self: false, long: true })).toBe('expand-and-menu');
    expect(tableChatNameTapKind({ self: true, long: true })).toBe('toggle-fold');
    expect(tableChatNameTapKind({ self: true, long: false })).toBe('none');
  });

  it('uses the compact side3 layout only when chat sits beside the felt', () => {
    expect(tableChatFeedKind({ mobileEmbedHost: false })).toBe('full');
    expect(tableChatFeedKind({ mobileEmbedHost: true })).toBe('side3');
  });

  it('marks own messages as Удалить and others as Скрыть', () => {
    expect(tableChatMessageSheetHideCopy(true).label).toBe('Удалить');
    expect(tableChatMessageSheetHideCopy(false).label).toBe('Скрыть');
  });

  it('prints a clock, not «сейчас», for a valid timestamp', () => {
    const clock = formatTableChatClock('2026-08-19T10:05:00.000Z');
    expect(clock).not.toBe('');
    expect(clock.toLowerCase()).not.toContain('сейчас');
    expect(formatTableChatClock('not-a-date')).toBe('');
  });

  it('uses one feed row class family instead of --ls-wide', () => {
    const full = tableChatFeedRowClassNames({
      kind: 'full',
      self: true,
      pending: false,
      hasContextQuote: false,
      selected: false,
    });
    expect(full).toContain('table-chat-msg-compact--feed');
    expect(full).toContain('table-chat-msg-compact--feed-full');
    expect(full).not.toContain('ls-wide');
    const side = tableChatFeedRowClassNames({
      kind: 'side3',
      self: false,
      pending: true,
      hasContextQuote: true,
      selected: true,
    });
    expect(side).toContain('table-chat-msg-compact--feed-side3');
    expect(side).toContain('table-chat-msg-compact--pending');
    expect(side).not.toContain('table-chat-msg-compact--actionable');
  });
});
