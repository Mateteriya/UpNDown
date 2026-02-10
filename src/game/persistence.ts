/**
 * Сохранение и загрузка состояния партии (localStorage).
 * Единая точка для ключа и операций — используется App и GameTable.
 * Позже можно заменить на бэкенд/аккаунты без смены интерфейса.
 */

import type { GameState } from './GameEngine';

export const GAME_STATE_STORAGE_KEY = 'updown_game_state';

export function loadGameStateFromStorage(): GameState | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GAME_STATE_STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Record<string, unknown>;
    if (!Array.isArray(s.players) || s.players.length !== 4 || typeof s.phase !== 'string') return null;
    if (typeof s.dealerIndex !== 'number' || typeof s.dealNumber !== 'number') return null;
    return parsed as GameState;
  } catch {
    return null;
  }
}

export function saveGameStateToStorage(state: GameState): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GAME_STATE_STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    /* ignore */
  }
}

export function clearGameStateFromStorage(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(GAME_STATE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** Есть ли сохранённая партия (для показа экрана игры при загрузке) */
export function hasSavedGame(): boolean {
  return loadGameStateFromStorage() !== null;
}

/** Локальный рейтинг игрока (игр сыграно, побед) — для модалки «Партия завершена» */
export const LOCAL_RATING_STORAGE_KEY = 'updown_local_rating';

export interface LocalRating {
  gamesPlayed: number;
  wins: number;
}

export function getLocalRating(): LocalRating {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_RATING_STORAGE_KEY) : null;
    if (!raw) return { gamesPlayed: 0, wins: 0 };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { gamesPlayed: 0, wins: 0 };
    const r = parsed as Record<string, unknown>;
    const gamesPlayed = typeof r.gamesPlayed === 'number' && r.gamesPlayed >= 0 ? r.gamesPlayed : 0;
    const wins = typeof r.wins === 'number' && r.wins >= 0 ? r.wins : 0;
    return { gamesPlayed, wins: Math.min(wins, gamesPlayed) };
  } catch {
    return { gamesPlayed: 0, wins: 0 };
  }
}

export function updateLocalRating(won: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const prev = getLocalRating();
    const next: LocalRating = {
      gamesPlayed: prev.gamesPlayed + 1,
      wins: prev.wins + (won ? 1 : 0),
    };
    localStorage.setItem(LOCAL_RATING_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
