/** Порог заглавных букв в исходном имени: выше — смягчение слов 2+ и уменьшение шрифта в UI. */
export const PLAYER_DISPLAY_NAME_CAPS_SHRINK_THRESHOLD = 4;

/** ~9% меньше базового кегля (диапазон 8–10% по ТЗ). */
export const PLAYER_DISPLAY_NAME_CAPS_FONT_SCALE = 0.91;

const LETTER_RE = /\p{L}/u;

function isLetter(ch: string): boolean {
  return LETTER_RE.test(ch);
}

function isUppercaseLetter(ch: string): boolean {
  return isLetter(ch) && ch === ch.toLocaleUpperCase('ru') && ch !== ch.toLocaleLowerCase('ru');
}

/** Заглавные буквы в исходной строке (до форматирования). */
export function countPlayerNameUppercaseLetters(name: string): number {
  return [...name].filter(isUppercaseLetter).length;
}

export function shouldShrinkPlayerNameForDisplay(name: string): boolean {
  return countPlayerNameUppercaseLetters(name) > PLAYER_DISPLAY_NAME_CAPS_SHRINK_THRESHOLD;
}

export function getPlayerDisplayNameFontScale(name: string): number {
  return shouldShrinkPlayerNameForDisplay(name) ? PLAYER_DISPLAY_NAME_CAPS_FONT_SCALE : 1;
}

function firstLetterIndex(word: string): number {
  return [...word].findIndex(isLetter);
}

function isAllLettersUpper(word: string): boolean {
  const letters = [...word].filter(isLetter);
  if (letters.length < 2) return false;
  return letters.every(isUppercaseLetter);
}

/** Первая буква заглавная, остальные буквы слова — строчные. */
function titleCaseWord(word: string): string {
  const chars = [...word];
  const firstIdx = firstLetterIndex(word);
  if (firstIdx < 0) return word;
  return chars
    .map((ch, idx) => {
      if (!isLetter(ch)) return ch;
      return idx === firstIdx ? ch.toLocaleUpperCase('ru') : ch.toLocaleLowerCase('ru');
    })
    .join('');
}

/** Первое слово: первая буква всегда заглавная; целиком КАПС → «Петя»-стиль. */
function formatDisplayFirstWord(word: string): string {
  if (isAllLettersUpper(word)) return titleCaseWord(word);
  const chars = [...word];
  const firstIdx = firstLetterIndex(word);
  if (firstIdx < 0) return word;
  return chars
    .map((ch, idx) => {
      if (!isLetter(ch)) return ch;
      if (idx === firstIdx) return ch.toLocaleUpperCase('ru');
      return ch;
    })
    .join('');
}

/** Исключения: не смягчать (напр. «ДА!» остаётся «ДА!»). */
function isPreservedSecondaryWord(word: string): boolean {
  return word === 'ДА!';
}

/**
 * Отображаемое имя игрока (профиль не меняется).
 * Первое слово: первая буква заглавная; КАПС целиком → title case.
 * Если заглавных букв в исходнике > 4 — слова со 2-го: title case (кроме исключений).
 * Иначе слова 2+ без изменений.
 */
export function formatPlayerNameForDisplay(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  const uppercaseCount = countPlayerNameUppercaseLetters(trimmed);
  const softenRest = uppercaseCount > PLAYER_DISPLAY_NAME_CAPS_SHRINK_THRESHOLD;

  return words
    .map((word, index) => {
      if (index === 0) return formatDisplayFirstWord(word);
      if (!softenRest || isPreservedSecondaryWord(word)) return word;
      return titleCaseWord(word);
    })
    .join(' ');
}
