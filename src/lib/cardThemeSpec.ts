/**

 * Спецификация тем карт: какая масть какую палитру III использует.

 * Источник правды для игры и лаборатории.

 */



import type { Card } from '../game/types';

import type { CardTheme } from './cardPaletteLock';



export type SuitV3Variant =

  | 'spades-v3'

  | 'spades-v3-deep'

  | 'spades-v3-gray'

  | 'diamonds-v3-gray'

  | 'diamonds-v3-deep'

  | 'clubs-v3'

  | 'clubs-v3-gray'

  | 'hearts-v3'

  | 'hearts-v3-deep';



/** Тема «Легаси»: III с воздушными градиентами по мастям; ♠ — элитный чёрный spades-v3-gray. */

export const LEGACY_THEME_V3_BY_SUIT: Record<Card['suit'], SuitV3Variant | null> = {

  '♠': 'spades-v3-gray',

  '♦': 'diamonds-v3-gray',

  '♥': 'hearts-v3',

  '♣': 'clubs-v3',

};



export const LEGACY_THEME_SUIT_CAPTION: Record<Card['suit'], string> = {

  '♠': 'III — серебристый лист, глифы #0a0a0c, кольцо #6a7280',

  '♦': 'III — светлый золотистый градиент, глифы #6e1a10, кольцо #d85848',

  '♥': 'III — светлый розово-малиновый градиент, глифы #5c1018, неон #dd2aa8',

  '♣': 'III — чистый лавандовый градиент, глифы #221040, неон #5b21b6',

};



/** Тема «Нео»: ♠ ♦ ♥ — тёмные градиенты III; ♣ — серый III. */

export const NEO_THEME_V3_BY_SUIT: Record<Card['suit'], SuitV3Variant | null> = {

  '♠': 'spades-v3-deep',

  '♥': 'hearts-v3-deep',

  '♣': 'clubs-v3-gray',

  '♦': 'diamonds-v3-deep',

};



export const NEO_THEME_SUIT_CAPTION: Record<Card['suit'], string> = {

  '♠': 'III — тёмный фиолетово-индиго градиент, светлые глифы',

  '♥': 'III — тёмный красный градиент, глифы rgb(220, 150, 168)',

  '♣': 'III — серый лист, глубокий фиолет (#221040), неон #5b21b6',

  '♦': 'III — тёмный янтарный градиент, светлые глифы',

};



export function getCardThemeV3Variant(theme: CardTheme, suit: Card['suit']): SuitV3Variant | null {

  if (theme === 'legacy') return LEGACY_THEME_V3_BY_SUIT[suit];

  if (theme === 'neo') return NEO_THEME_V3_BY_SUIT[suit];

  return null;

}


