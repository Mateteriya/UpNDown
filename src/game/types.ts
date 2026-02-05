/**
 * Типы для игровой логики Up&Down
 */

/** Масти карт (колода 36 карт) */
export type Suit = '♠' | '♥' | '♦' | '♣';

/** Ранги карт: 6–10, В, Д, К, Т */
export type Rank = '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

/** Карта */
export interface Card {
  suit: Suit;
  rank: Rank;
}

/** Игрок */
export interface Player {
  id: string;
  name: string;
  /** Карты на руке */
  hand: Card[];
  /** Заказ на текущую раздачу */
  bid?: number;
  /** Взятые взятки в текущей раздаче */
  tricksTaken: number;
  /** Общий счёт */
  score: number;
}

/** Тип раздачи */
export type DealType = 
  | 'normal'      // Обычная (с козырем)
  | 'no-trump'    // Бескозырка
  | 'dark';       // Тёмная (заказ до раздачи)

/** Состояние игры */
export type GamePhase = 
  | 'bidding'     // Фаза заказов
  | 'dark-bidding' // Тёмная: заказ до раздачи (карт ещё нет)
  | 'playing'     // Фаза розыгрыша
  | 'trick-complete' // Взятка завершена
  | 'deal-complete'  // Раздача завершена
  | 'game-complete'; // Игра завершена

/** Результат раздачи */
export interface DealResult {
  playerId: string;
  bid: number;
  taken: number;
  points: number;
}
