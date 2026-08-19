import { describe, expect, it } from 'vitest';
import {
  aggregateChatReactions,
  buildAddressedChatBody,
  buildChatReactionBody,
  chatBodyForClipboard,
  isChatReactionControlBody,
  messageMatchesChatSearch,
  myReactionEmoji,
  parseAddressedChatBody,
  parseChatReactionBody,
  splitChatSearchHighlight,
} from './tableChatBodyProtocol';

describe('chat reaction protocol', () => {
  it('round-trips set/clear payloads', () => {
    const setBody = buildChatReactionBody('msg-1', '🔥', 'set');
    expect(parseChatReactionBody(setBody)).toEqual({
      op: 'set',
      targetId: 'msg-1',
      emoji: '🔥',
    });
    expect(isChatReactionControlBody(setBody)).toBe(true);
    const clearBody = buildChatReactionBody('msg-1', '🔥', 'clear');
    expect(parseChatReactionBody(clearBody)?.op).toBe('clear');
  });

  it('does not treat ordinary chat as a reaction', () => {
    expect(parseChatReactionBody('🔥')).toBeNull();
    expect(parseChatReactionBody('→ Саша: привет')).toBeNull();
    expect(isChatReactionControlBody('обычный текст')).toBe(false);
  });

  it('aggregates replace and remove like a messenger', () => {
    const rows = [
      { user_id: 'a', body: buildChatReactionBody('m1', '👍', 'set') },
      { user_id: 'b', body: buildChatReactionBody('m1', '👍', 'set') },
      { user_id: 'a', body: buildChatReactionBody('m1', '❤️', 'set') },
      { user_id: 'b', body: buildChatReactionBody('m1', '👍', 'clear') },
    ];
    const chips = aggregateChatReactions(rows, 'a').get('m1') ?? [];
    expect(chips).toEqual([{ emoji: '❤️', count: 1, mine: true }]);
    expect(myReactionEmoji(chips)).toBe('❤️');
  });
});

describe('addressed chat body', () => {
  it('parses cosmic mention prefix', () => {
    expect(parseAddressedChatBody('→ Маша: пас')).toEqual({ to: 'Маша', text: 'пас' });
    expect(parseAddressedChatBody('привет')).toBeNull();
  });

  it('builds without doubling the prefix', () => {
    const once = buildAddressedChatBody('Петя', 'беру', 500);
    expect(once).toBe('→ Петя: беру');
    expect(buildAddressedChatBody('Петя', once, 500)).toBe(once);
  });

  it('copies visible text without quote or address chrome', () => {
    expect(chatBodyForClipboard('→ Маша: пас')).toBe('пас');
    expect(chatBodyForClipboard('Игрок: «привет»\n—\nок')).toBe('ок');
  });

  it('matches search on name, body, and clipboard text', () => {
    expect(messageMatchesChatSearch({ display_name: 'Маша', body: 'пас' }, 'маш')).toBe(true);
    expect(messageMatchesChatSearch({ display_name: 'Петя', body: '→ Маша: пас' }, 'пас')).toBe(true);
    expect(messageMatchesChatSearch({ display_name: 'Петя', body: 'привет' }, 'xyz')).toBe(false);
    expect(messageMatchesChatSearch({ display_name: 'Петя', body: 'привет' }, '  ')).toBe(true);
  });

  it('splits highlight parts without regex', () => {
    expect(splitChatSearchHighlight('Привет стол', 'стол')).toEqual([
      { t: 'Привет ', hit: false },
      { t: 'стол', hit: true },
    ]);
    expect(splitChatSearchHighlight('ок', 'нет')).toEqual([{ t: 'ок', hit: false }]);
  });
});
