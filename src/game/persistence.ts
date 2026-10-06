/**
 * Сохранение и загрузка состояния партии (localStorage).
 * Единая точка для ключа и операций — используется App и GameTable.
 * Позже можно заменить на бэкенд/аккаунты без смены интерфейса.
 */

import type { GameState } from './GameEngine';
import { offlineAiDifficultyForNewBotId } from './aiSettings';
import { type SkillCounters, emptySkillCounters } from './playerSkillStats';

export const GAME_STATE_STORAGE_KEY = 'updown_game_state';

export function loadGameStateFromStorage(): GameState | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(GAME_STATE_STORAGE_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const s = parsed as Record<string, unknown>;
    if (!Array.isArray(s.players) || (s.players.length !== 3 && s.players.length !== 4) || typeof s.phase !== 'string') return null;
    if (typeof s.dealerIndex !== 'number' || typeof s.dealNumber !== 'number') return null;
    let game = parsed as GameState;
    if (game.players[0]?.id === 'human') {
      let changed = false;
      const players = game.players.map((p) => {
        if (p.id === 'human') return p;
        if (p.id !== 'ai1' && p.id !== 'ai2' && p.id !== 'ai3') return p;
        if (p.aiDifficulty) return p;
        changed = true;
        return { ...p, aiDifficulty: offlineAiDifficultyForNewBotId(p.id) };
      });
      if (changed) game = { ...game, players };
    }
    return game;
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

/** Локальный рейтинг игрока (игр сыграно, побед, skill) — привязан к profileId */
const LOCAL_RATING_KEY_PREFIX = 'updown_rating_';
const LEGACY_RATING_STORAGE_KEY = 'updown_local_rating';

export interface LocalRating extends SkillCounters {
  gamesPlayed: number;
  wins: number;
  bidAccuracySum: number;
  bidAccuracyCount: number;
  /** Версия skill-backfill; 0 = ещё не заливали из архива */
  skillVersion: number;
}

export type LocalRatingMatchSkill = {
  /** Точность партии 0..100 (для среднего по партиям) */
  bidAccuracyPct: number;
  /** Были ли раздачи с известным taken (тогда pct учитываем даже при 0%) */
  hasDealSkill: boolean;
  exact: number;
  under: number;
  over: number;
  /** Исходы раздач по порядку — для серий */
  outcomes: readonly ('exact' | 'under' | 'over')[];
  place?: number;
};

function emptyLocalRating(): LocalRating {
  return {
    gamesPlayed: 0,
    wins: 0,
    bidAccuracySum: 0,
    bidAccuracyCount: 0,
    ...emptySkillCounters(),
    skillVersion: 0,
  };
}

function getRatingKey(profileId: string): string {
  return LOCAL_RATING_KEY_PREFIX + profileId;
}

function nonNegInt(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function parseRating(raw: string | null): LocalRating {
  const empty = emptyLocalRating();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return empty;
    const r = parsed as Record<string, unknown>;
    const gamesPlayed = nonNegInt(r.gamesPlayed);
    const wins = Math.min(nonNegInt(r.wins), gamesPlayed);
    return {
      gamesPlayed,
      wins,
      bidAccuracySum: nonNegInt(r.bidAccuracySum),
      bidAccuracyCount: nonNegInt(r.bidAccuracyCount),
      exactDeals: nonNegInt(r.exactDeals),
      underDeals: nonNegInt(r.underDeals),
      overDeals: nonNegInt(r.overDeals),
      placeSum: nonNegInt(r.placeSum),
      placeCount: nonNegInt(r.placeCount),
      bestExactStreak: nonNegInt(r.bestExactStreak),
      currentExactStreak: nonNegInt(r.currentExactStreak),
      skillVersion: nonNegInt(r.skillVersion),
    };
  } catch {
    return empty;
  }
}

function writeRating(key: string, rating: LocalRating): void {
  localStorage.setItem(key, JSON.stringify(rating));
}

/** Рейтинг текущего профиля; при первом вызове с profileId мигрирует данные со старого ключа (устройство) */
export function getLocalRating(profileId?: string): LocalRating {
  try {
    if (typeof localStorage === 'undefined') return emptyLocalRating();
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (pid) {
      const key = getRatingKey(pid);
      let rating = parseRating(localStorage.getItem(key));
      if (rating.gamesPlayed === 0 && rating.wins === 0) {
        const legacy = parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
        if (legacy.gamesPlayed > 0 || legacy.wins > 0) {
          writeRating(key, legacy);
          localStorage.removeItem(LEGACY_RATING_STORAGE_KEY);
          return legacy;
        }
      }
      return rating;
    }
    return parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
  } catch {
    return emptyLocalRating();
  }
}

export type LocalRatingBasicsPatch = Partial<
  Pick<LocalRating, 'gamesPlayed' | 'wins' | 'bidAccuracySum' | 'bidAccuracyCount'>
>;

/** Записать skill-counters (backfill). basics — только если gamesPlayed ещё 0. */
export function replaceLocalSkillCounters(
  counters: SkillCounters,
  skillVersion: number,
  profileId?: string,
  basics?: LocalRatingBasicsPatch,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const key = pid ? getRatingKey(pid) : LEGACY_RATING_STORAGE_KEY;
    const prev = pid ? getLocalRating(pid) : parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));
    const next: LocalRating = {
      ...prev,
      ...counters,
      skillVersion,
    };
    if (basics && prev.gamesPlayed === 0) {
      if (typeof basics.gamesPlayed === 'number') next.gamesPlayed = basics.gamesPlayed;
      if (typeof basics.wins === 'number') next.wins = Math.min(basics.wins, next.gamesPlayed);
      if (typeof basics.bidAccuracySum === 'number') next.bidAccuracySum = basics.bidAccuracySum;
      if (typeof basics.bidAccuracyCount === 'number') next.bidAccuracyCount = basics.bidAccuracyCount;
    }
    writeRating(key, next);
  } catch {
    /* ignore */
  }
}

export function updateLocalRating(
  won: boolean,
  profileId?: string,
  bidAccuracyOrSkill?: number | LocalRatingMatchSkill,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const key = pid ? getRatingKey(pid) : LEGACY_RATING_STORAGE_KEY;
    const prev = pid ? getLocalRating(pid) : parseRating(localStorage.getItem(LEGACY_RATING_STORAGE_KEY));

    let acc = 0;
    let countAcc = false;
    let exactAdd = 0;
    let underAdd = 0;
    let overAdd = 0;
    let outcomes: readonly ('exact' | 'under' | 'over')[] = [];
    let place: number | undefined;

    if (typeof bidAccuracyOrSkill === 'number') {
      acc = bidAccuracyOrSkill >= 0 && bidAccuracyOrSkill <= 100 ? bidAccuracyOrSkill : 0;
      countAcc = true;
    } else if (bidAccuracyOrSkill && typeof bidAccuracyOrSkill === 'object') {
      const s = bidAccuracyOrSkill;
      acc = s.bidAccuracyPct >= 0 && s.bidAccuracyPct <= 100 ? s.bidAccuracyPct : 0;
      countAcc = s.hasDealSkill;
      exactAdd = s.exact;
      underAdd = s.under;
      overAdd = s.over;
      outcomes = s.outcomes ?? [];
      place = s.place;
    }

    let currentExactStreak = prev.currentExactStreak;
    let bestExactStreak = prev.bestExactStreak;
    if (outcomes.length > 0) {
      for (const o of outcomes) {
        if (o === 'exact') {
          currentExactStreak++;
          if (currentExactStreak > bestExactStreak) bestExactStreak = currentExactStreak;
        } else {
          currentExactStreak = 0;
        }
      }
    }

    const next: LocalRating = {
      gamesPlayed: prev.gamesPlayed + 1,
      wins: prev.wins + (won ? 1 : 0),
      bidAccuracySum: prev.bidAccuracySum + (countAcc ? acc : 0),
      bidAccuracyCount: prev.bidAccuracyCount + (countAcc ? 1 : 0),
      exactDeals: prev.exactDeals + exactAdd,
      underDeals: prev.underDeals + underAdd,
      overDeals: prev.overDeals + overAdd,
      placeSum: prev.placeSum + (typeof place === 'number' && place >= 1 ? place : 0),
      placeCount: prev.placeCount + (typeof place === 'number' && place >= 1 ? 1 : 0),
      bestExactStreak,
      currentExactStreak,
      // skillVersion поднимает только ensureLocalSkillBackfill
      skillVersion: prev.skillVersion,
    };
    writeRating(key, next);
  } catch {
    /* ignore */
  }
}

/** Профиль игрока: имя, опциональное фото, стабильный id для привязки рейтинга */
export const PLAYER_PROFILE_STORAGE_KEY = 'updown_player_profile';
/** Аватар отдельно — большой data URL не должен ломать JSON.parse профиля. */
export const PLAYER_AVATAR_STORAGE_KEY = 'updown_avatar_data_url';

export interface PlayerProfile {
  displayName: string;
  avatarDataUrl?: string | null;
  /** Цвет фона плейсхолдера инициалов (hex), когда нет фото */
  avatarBgColor?: string | null;
  /** Стабильный id профиля (uuid) — не меняется при смене имени; рейтинг привязан к нему */
  profileId?: string;
  /** ISO-время последнего сохранения (last-write-wins с облаком). */
  updatedAt?: string;
}

const DEFAULT_DISPLAY_NAME = 'Вы';
const MAX_DISPLAY_NAME_LENGTH = 17;

/** Выше — JSON.parse на главном потоке «подвешивает» кнопки (лобби createRoom читает профиль). */
const PLAYER_PROFILE_RAW_PARSE_MAX = 90_000;

function readStoredAvatar(): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PLAYER_AVATAR_STORAGE_KEY) : null;
    if (!raw || raw.length < 32) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeStoredAvatar(avatarDataUrl: string | null | undefined): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (avatarDataUrl && avatarDataUrl.length >= 32) {
      /* Сначала снять старый — иначе quota при огромном PNG сносит sb-*-auth-token */
      try {
        localStorage.removeItem(PLAYER_AVATAR_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      try {
        localStorage.setItem(PLAYER_AVATAR_STORAGE_KEY, avatarDataUrl);
      } catch {
        /* Не оставляем полузапись: лучше пустой аватар, чем logout из-за auth */
        try {
          localStorage.removeItem(PLAYER_AVATAR_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    } else {
      localStorage.removeItem(PLAYER_AVATAR_STORAGE_KEY);
    }
  } catch {
    /* quota / private mode */
  }
}

/** Только начало файла: profileId и displayName без полного parse мегабайтного data URL. */
function tryParsePlayerProfileLight(raw: string): PlayerProfile {
  const head = raw.slice(0, 8000);
  const profileIdMatch = head.match(/"profileId"\s*:\s*"([0-9a-f-]{36})"/i);
  const nameMatch = head.match(/"displayName"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const updatedMatch = head.match(/"updatedAt"\s*:\s*"([^"]+)"/);
  let displayName = DEFAULT_DISPLAY_NAME;
  if (nameMatch?.[1]) {
    try {
      displayName = JSON.parse(`"${nameMatch[1].replace(/\\"/g, '"')}"`) as string;
    } catch {
      displayName = nameMatch[1].replace(/\\"/g, '"');
    }
    if (!displayName.trim()) displayName = DEFAULT_DISPLAY_NAME;
  }
  const profileId = profileIdMatch?.[1] ?? generateProfileId();
  return {
    displayName: displayName.trim().slice(0, MAX_DISPLAY_NAME_LENGTH),
    avatarDataUrl: readStoredAvatar(),
    profileId,
    updatedAt: updatedMatch?.[1],
  };
}

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
    const sideAvatar = readStoredAvatar();
    if (!raw) {
      return { displayName: DEFAULT_DISPLAY_NAME, avatarDataUrl: sideAvatar, profileId: generateProfileId() };
    }
    if (raw.length > PLAYER_PROFILE_RAW_PARSE_MAX) {
      const light = tryParsePlayerProfileLight(raw);
      return { ...light, avatarDataUrl: sideAvatar ?? light.avatarDataUrl ?? null };
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return { displayName: DEFAULT_DISPLAY_NAME, avatarDataUrl: sideAvatar, profileId: generateProfileId() };
    }
    const p = parsed as Record<string, unknown>;
    const displayName = typeof p.displayName === 'string' && p.displayName.trim().length > 0
      ? p.displayName.trim()
      : DEFAULT_DISPLAY_NAME;
    const fromMain = p.avatarDataUrl === null || p.avatarDataUrl === undefined
      ? null
      : typeof p.avatarDataUrl === 'string' ? p.avatarDataUrl : null;
    const avatarDataUrl = sideAvatar ?? fromMain;
    const avatarBgColor =
      typeof p.avatarBgColor === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(p.avatarBgColor.trim())
        ? p.avatarBgColor.trim()
        : null;
    const updatedAt = typeof p.updatedAt === 'string' && p.updatedAt.length > 0 ? p.updatedAt : undefined;
    let profileId = typeof p.profileId === 'string' && p.profileId.length > 0 ? p.profileId : undefined;
    if (!profileId) {
      profileId = generateProfileId();
      try {
        const payload = { displayName, avatarBgColor, profileId, updatedAt };
        localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    }
    return { displayName, avatarDataUrl: avatarDataUrl ?? null, avatarBgColor, profileId, updatedAt };
  } catch {
    return { displayName: DEFAULT_DISPLAY_NAME, avatarDataUrl: readStoredAvatar(), profileId: generateProfileId() };
  }
}

export function savePlayerProfile(profile: PlayerProfile): void {
  try {
    if (typeof localStorage === 'undefined') return;
    let displayName = typeof profile.displayName === 'string' && profile.displayName.trim().length > 0
      ? profile.displayName.trim()
      : DEFAULT_DISPLAY_NAME;
    if (displayName.length > MAX_DISPLAY_NAME_LENGTH) displayName = displayName.slice(0, MAX_DISPLAY_NAME_LENGTH);
    const existing = getPlayerProfile();
    const profileId = profile.profileId ?? existing.profileId ?? generateProfileId();
    /* undefined = не трогать; null = явная очистка (вход в аккаунт без аватара в облаке) */
    const avatarDataUrl =
      profile.avatarDataUrl === undefined ? existing.avatarDataUrl ?? null : profile.avatarDataUrl ?? null;
    const avatarBgColor =
      typeof profile.avatarBgColor === 'string' && /^#[0-9A-Fa-f]{3,8}$/.test(profile.avatarBgColor.trim())
        ? profile.avatarBgColor.trim()
        : profile.avatarBgColor === null
          ? null
          : existing.avatarBgColor ?? null;
    const updatedAt = profile.updatedAt ?? new Date().toISOString();
    writeStoredAvatar(avatarDataUrl);
    const meta = {
      displayName,
      avatarBgColor,
      profileId,
      updatedAt,
    };
    const withAvatar: PlayerProfile = { ...meta, avatarDataUrl };
    const full = JSON.stringify(withAvatar);
    if (full.length <= PLAYER_PROFILE_RAW_PARSE_MAX) {
      localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, full);
    } else {
      localStorage.setItem(PLAYER_PROFILE_STORAGE_KEY, JSON.stringify({ ...meta, avatarDataUrl: null }));
    }
  } catch {
    /* ignore */
  }
}

/** Незавершённые онлайн-партии (игрок отказался вернуться — для статистики/истории) */
const UNFINISHED_ONLINE_KEY = 'updown_unfinished_online';

export interface UnfinishedOnlineGame {
  roomId: string;
  code: string;
  leftAt: string;
}

export function saveUnfinishedOnlineGame(roomId: string, code: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(UNFINISHED_ONLINE_KEY);
    const list: UnfinishedOnlineGame[] = raw ? (JSON.parse(raw) as UnfinishedOnlineGame[]) : [];
    if (!Array.isArray(list)) return;
    list.push({ roomId, code, leftAt: new Date().toISOString() });
    const trimmed = list.slice(-50);
    localStorage.setItem(UNFINISHED_ONLINE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export function getUnfinishedOnlineGames(): UnfinishedOnlineGame[] {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(UNFINISHED_ONLINE_KEY) : null;
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (x): x is UnfinishedOnlineGame =>
        x && typeof x === 'object' && typeof (x as UnfinishedOnlineGame).roomId === 'string' && typeof (x as UnfinishedOnlineGame).code === 'string'
    );
  } catch {
    return [];
  }
}

/** Убрать запись незавершённой онлайн-партии (по roomId; при дубликатах — все с этим id). */
export function removeUnfinishedOnlineGame(roomId: string): void {
  try {
    if (typeof localStorage === 'undefined' || !roomId) return;
    const list = getUnfinishedOnlineGames().filter((x) => x.roomId !== roomId);
    localStorage.setItem(UNFINISHED_ONLINE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
