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

/** Локальный рейтинг игрока (игр сыграно, побед) — привязан к profileId */
const LOCAL_RATING_KEY_PREFIX = 'updown_rating_';
const LEGACY_RATING_STORAGE_KEY = 'updown_local_rating';

export interface LocalRating {
  gamesPlayed: number;
  wins: number;
  bidAccuracySum: number;
  bidAccuracyCount: number;
}

function getRatingKey(profileId: string): string {
  return LOCAL_RATING_KEY_PREFIX + profileId;
}

function parseRating(raw: string | null): LocalRating {
  const empty: LocalRating = { gamesPlayed: 0, wins: 0, bidAccuracySum: 0, bidAccuracyCount: 0 };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return empty;
    const r = parsed as Record<string, unknown>;
    const gamesPlayed = typeof r.gamesPlayed === 'number' && r.gamesPlayed >= 0 ? r.gamesPlayed : 0;
    const wins = typeof r.wins === 'number' && r.wins >= 0 ? r.wins : 0;
    const bidAccuracySum = typeof r.bidAccuracySum === 'number' && r.bidAccuracySum >= 0 ? r.bidAccuracySum : 0;
    const bidAccuracyCount = typeof r.bidAccuracyCount === 'number' && r.bidAccuracyCount >= 0 ? r.bidAccuracyCount : 0;
    return { gamesPlayed, wins: Math.min(wins, gamesPlayed), bidAccuracySum, bidAccuracyCount };
  } catch {
    return empty;
  }
}

/** Рейтинг текущего профиля; при первом вызове с profileId мигрирует данные со старого ключа (устройство) */
export function getLocalRating(profileId?: string): LocalRating {
  try {
    if (typeof localStorage === 'undefined') return { gamesPlayed: 0, wins: 0, bidAccuracySum: 0, bidAccuracyCount: 0 };
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (pid) {
      const key = getRatingKey(pid);
      let rating = parseRating(localStorage.getItem(key));
      if (rating.gamesPlayed === 0 && rating.wins === 0) {
        const legacy = parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
        if (legacy.gamesPlayed > 0 || legacy.wins > 0) {
          const migrated: LocalRating = { ...legacy, bidAccuracySum: legacy.bidAccuracySum ?? 0, bidAccuracyCount: legacy.bidAccuracyCount ?? 0 };
          localStorage.setItem(key, JSON.stringify(migrated));
          localStorage.removeItem(LEGACY_RATING_STORAGE_KEY);
          return migrated;
        }
      }
      return rating;
    }
    return parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
  } catch {
    return { gamesPlayed: 0, wins: 0, bidAccuracySum: 0, bidAccuracyCount: 0 };
  }
}

export function updateLocalRating(won: boolean, profileId?: string, bidAccuracy?: number): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const key = pid ? getRatingKey(pid) : LEGACY_RATING_STORAGE_KEY;
    const prev = pid ? getLocalRating(pid) : parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
    const acc = typeof bidAccuracy === 'number' && bidAccuracy >= 0 && bidAccuracy <= 100 ? bidAccuracy : 0;
    const next: LocalRating = {
      gamesPlayed: prev.gamesPlayed + 1,
      wins: prev.wins + (won ? 1 : 0),
      bidAccuracySum: prev.bidAccuracySum + acc,
      bidAccuracyCount: prev.bidAccuracyCount + (acc > 0 ? 1 : 0),
    };
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Профиль игрока: имя, опциональное фото, стабильный id для привязки рейтинга */
export const PLAYER_PROFILE_STORAGE_KEY = 'updown_player_profile';

export interface PlayerProfile {
  displayName: string;
  avatarDataUrl?: string | null;
  /** Стабильный id профиля (uuid) — не меняется при смене имени; рейтинг привязан к нему */
  profileId?: string;
}

const DEFAULT_DISPLAY_NAME = 'Вы';

function generateProfileId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getPlayerProfile(): PlayerProfile {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PLAYER_PROFILE_STORAGE_KEY) : null;
    if (!raw) return { displayName: DEFAULT_DISPLAY_NAME, profileId: generateProfileId() };
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return { displayName: DEFAULT_DISPLAY_NAME, profileId: generateProfileId() };
    const p = parsed as Record<string, unknown>;
    const displayName = typeof p.displayName === 'string' && p.displayName.trim().length > 0
      ? p.displayName.trim()
      : DEFAULT_DISPLAY_NAME;
    const avatarDataUrl = p.avatarDataUrl === null || p.avatarDataUrl === undefined
      ? undefined
      : typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : undefined;
    let profileId = typeof p.profileId === 'string' && p.profileId.length > 0 ? p.profileId : undefined;
    if (!profileId) {
      profileId = generateProfileId();
      try {
        const payload = { displayName, avatarDataUrl: avatarDataUrl ?? null, profileId };
        localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
    return { displayName, avatarDataUrl: avatarDataUrl ?? null, profileId };
  } catch {
    return { displayName: DEFAULT_DISPLAY_NAME, profileId: generateProfileId() };
  }
}

const MAX_DISPLAY_NAME_LENGTH = 17;

export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    let displayName = typeof profile.displayName === 'string' && profile.displayName.trim().length > 0
      ? profile.displayName.trim()
      : DEFAULT_DISPLAY_NAME;
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) displayName = displayName.slice(0, MAX_DISPLAY_NAME_LENGTH);
    const existing = getPlayerProfile();
    const profileId = profile.profileId ?? existing.profileId ?? generateProfileId();
    const payload: PlayerProfile = {
      displayName,
      avatarDataUrl: profile.avatarDataUrl ?? null,
      profileId,
    };
    localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}
