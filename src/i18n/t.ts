import { en } from './en';
import { getLocale } from './locale';
import { interpolate, type MessageTree } from './path';
import { ru, type Messages } from './ru';
import type { Locale } from './types';

const DICTS: Record<Locale, Messages> = { ru, en };

function flattenDict(tree: MessageTree, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else flattenDict(v as MessageTree, path, out);
  }
  return out;
}

/** Плоский индекс: GameTable зовёт t() сотни раз за кадр — без обхода дерева. */
const FLAT: Record<Locale, Record<string, string>> = {
  ru: flattenDict(ru as unknown as MessageTree),
  en: flattenDict(en as unknown as MessageTree),
};

type NestedKey<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown>
      ? NestedKey<T[K], `${Prefix}${K}.`>
      : never;
}[keyof T & string];

export type MsgKey = NestedKey<typeof ru>;

export type MessageKey = MsgKey;

export type TFunc = (key: MsgKey, vars?: Record<string, string | number>) => string;

export function t(key: MsgKey, vars?: Record<string, string | number>): string {
  const loc = getLocale();
  const raw = FLAT[loc][key] ?? FLAT.ru[key] ?? key;
  return interpolate(raw, vars);
}

export function translate(locale: Locale, key: MsgKey, vars?: Record<string, string | number>): string {
  const raw = FLAT[locale][key] ?? FLAT.ru[key] ?? key;
  return interpolate(raw, vars);
}

const SENTINEL_YOU = 'Вы';

/** Stored default name stays «Вы»; UI shows the localized You. */
export function formatYouName(name: string | null | undefined, tr: TFunc = t): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed || trimmed === SENTINEL_YOU) return tr('common.you');
  return trimmed;
}

export function getDict(locale: Locale = getLocale()): Messages {
  return DICTS[locale];
}
