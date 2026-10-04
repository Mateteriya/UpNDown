import { describe, expect, it } from 'vitest';
import {
  countPlayerNameUppercaseLetters,
  formatPlayerNameForDisplay,
  getPlayerDisplayNameFontScale,
  shouldShrinkPlayerNameForDisplay,
  splitDisplayNameTwoLines,
} from './playerDisplayNameFormat';

describe('formatPlayerNameForDisplay', () => {
  it('title-cases first word and softens rest when >4 caps', () => {
    expect(formatPlayerNameForDisplay('петя СУПЕР ЧЕмпион')).toBe('Петя Супер Чемпион');
  });

  it('preserves full ALL-CAPS names as typed', () => {
    expect(formatPlayerNameForDisplay('ЩЩЩЩЩЩЩЩЩЩЩЩЩЩЩ')).toBe('ЩЩЩЩЩЩЩЩЩЩЩЩЩЩЩ');
    expect(formatPlayerNameForDisplay('МАРИЯ АНАТОЛЬЕВНА')).toBe('МАРИЯ АНАТОЛЬЕВНА');
  });

  it('keeps short caps words when ≤4 caps total', () => {
    expect(formatPlayerNameForDisplay('петя супер Чемпион')).toBe('Петя супер Чемпион');
    expect(formatPlayerNameForDisplay('петя 1987 ДА!')).toBe('Петя 1987 ДА!');
  });

  it('preserves ДА! when softening', () => {
    expect(formatPlayerNameForDisplay('петя 1987 ДА! СУПЕР')).toBe('Петя 1987 ДА! Супер');
  });
});

describe('player name font scale', () => {
  it('shrinks when >4 uppercase letters', () => {
    expect(countPlayerNameUppercaseLetters('Ш Ку Уф Ле Ус')).toBe(5);
    expect(shouldShrinkPlayerNameForDisplay('Ш Ку Уф Ле Ус')).toBe(true);
    expect(getPlayerDisplayNameFontScale('Ш Ку Уф Ле Ус')).toBe(0.91);
  });

  it('does not shrink at 4 caps', () => {
    expect(countPlayerNameUppercaseLetters('Я Маша Лучше Всех')).toBe(4);
    expect(shouldShrinkPlayerNameForDisplay('Я Маша Лучше Всех')).toBe(false);
    expect(getPlayerDisplayNameFontScale('Том Злой Кот Ус')).toBe(1);
  });
});

describe('splitDisplayNameTwoLines', () => {
  it('keeps short names on one line', () => {
    expect(splitDisplayNameTwoLines('Анна')).toEqual(['Анна']);
  });

  it('splits on space near the middle', () => {
    expect(splitDisplayNameTwoLines('Мария Суперзвезда')).toEqual(['Мария', 'Суперзвезда']);
  });

  it('splits by characters when there are no spaces', () => {
    expect(splitDisplayNameTwoLines('Суперчемпиончик')).toEqual(['Суперчем', 'пиончик']);
  });
});
