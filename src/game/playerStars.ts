/**
 * Локальный stub-кошелёк «Звёзд» (Up'ы / достижения / онлайн-заходы).
 * Под будущий бэкенд: API уже разделено по reason, ledger идемпотентен по key.
 * reason `like` в store = полученный Up (+3 ★).
 */

import { getPlayerProfile } from './persistence';
import type { MilestoneId } from './playerMilestones';

export type StarGrantReason =
  | 'milestone'
  | 'like'
  | 'win'
  | 'exact'
  | 'streak3'
  | 'streak5'
  | 'online_day'
  | 'online_streak_bonus'
  | 'gift_out'
  | 'gift_in'
  | 'adjust';

export type StarLedgerEntry = {
  id: string;
  at: number;
  reason: StarGrantReason;
  delta: number;
  /** Идемпотентный ключ (milestone:streak_5, online:2026-10-07, …) */
  key?: string;
  note?: string;
};

export type PlayerStarsStore = {
  balance: number;
  earnedTotal: number;
  givenTotal: number;
  receivedLikes: number;
  lastOnlineDay: string | null;
  loginStreakDays: number;
  ledger: StarLedgerEntry[];
};

export const STAR_AMOUNTS = {
  milestone: 5,
  /** Один UP от игрока = 3 ★ */
  like: 3,
  /** Победа в партии */
  win: 10,
  /** Серия 3 точных подряд (базовый порог) */
  streak3: 1,
  /** Серия 5 точных подряд — сверху к streak3; далее каждые +5 точных в серии — ещё столько же */
  streak5: 3,
  onlineDay: 1,
  onlineStreak3: 2,
  onlineStreak7: 5,
} as const;

/** Точно в заказ (4 игрока): взято = заказано → ★ */
export const STAR_EXACT_REWARDS_4P: Readonly<Record<number, number>> = {
  6: 1,
  7: 2,
  8: 3,
  9: 5,
};

/** Точно в заказ (3 игрока): взято = заказано → ★ */
export const STAR_EXACT_REWARDS_3P: Readonly<Record<number, number>> = {
  7: 1,
  8: 2,
  9: 3,
  10: 5,
  11: 5,
  12: 10,
};

/** Звёзды за точный заказ по числу игроков и размеру заказа. */
export function starsForExactBid(playerCount: 3 | 4, orderedTricks: number): number {
  const table = playerCount === 3 ? STAR_EXACT_REWARDS_3P : STAR_EXACT_REWARDS_4P;
  return table[orderedTricks] ?? 0;
}

const STORAGE_PREFIX = 'updown_stars_';
const LEDGER_MAX = 40;

export function emptyPlayerStars(): PlayerStarsStore {
  return {
    balance: 0,
    earnedTotal: 0,
    givenTotal: 0,
    receivedLikes: 0,
    lastOnlineDay: null,
    loginStreakDays: 0,
    ledger: [],
  };
}

function storageKey(profileId: string): string {
  return STORAGE_PREFIX + profileId;
}

function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayKey(dt);
}

function resolveProfileId(profileId?: string): string {
  return profileId ?? getPlayerProfile().profileId ?? '';
}

export function loadPlayerStars(profileId?: string): PlayerStarsStore {
  try {
    if (typeof localStorage === 'undefined') return emptyPlayerStars();
    const pid = resolveProfileId(profileId);
    if (!pid) return emptyPlayerStars();
    const raw = localStorage.getItem(storageKey(pid));
    if (!raw) return emptyPlayerStars();
    const parsed = JSON.parse(raw) as Partial<PlayerStarsStore>;
    const base = emptyPlayerStars();
    return {
      balance: Number.isFinite(parsed.balance) ? Math.max(0, Number(parsed.balance)) : 0,
      earnedTotal: Number.isFinite(parsed.earnedTotal) ? Math.max(0, Number(parsed.earnedTotal)) : 0,
      givenTotal: Number.isFinite(parsed.givenTotal) ? Math.max(0, Number(parsed.givenTotal)) : 0,
      receivedLikes: Number.isFinite(parsed.receivedLikes)
        ? Math.max(0, Number(parsed.receivedLikes))
        : 0,
      lastOnlineDay: typeof parsed.lastOnlineDay === 'string' ? parsed.lastOnlineDay : null,
      loginStreakDays: Number.isFinite(parsed.loginStreakDays)
        ? Math.max(0, Number(parsed.loginStreakDays))
        : 0,
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger.slice(0, LEDGER_MAX) : base.ledger,
    };
  } catch {
    return emptyPlayerStars();
  }
}

export function savePlayerStars(store: PlayerStarsStore, profileId?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const pid = resolveProfileId(profileId);
    if (!pid) return;
    localStorage.setItem(storageKey(pid), JSON.stringify(store));
  } catch {
    /* quota */
  }
}

export function getPlayerStars(profileId?: string): PlayerStarsStore {
  return loadPlayerStars(profileId);
}

function pushLedger(store: PlayerStarsStore, entry: Omit<StarLedgerEntry, 'id' | 'at'> & { at?: number }) {
  const full: StarLedgerEntry = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: entry.at ?? Date.now(),
    reason: entry.reason,
    delta: entry.delta,
    key: entry.key,
    note: entry.note,
  };
  store.ledger = [full, ...store.ledger].slice(0, LEDGER_MAX);
}

function hasLedgerKey(store: PlayerStarsStore, key: string): boolean {
  return store.ledger.some((e) => e.key === key);
}

/** Универсальное начисление (положительное). Отрицательные — через gift/adjust. */
export function grantStars(
  reason: StarGrantReason,
  amount: number,
  opts?: { profileId?: string; key?: string; note?: string },
): PlayerStarsStore {
  const store = loadPlayerStars(opts?.profileId);
  const n = Math.floor(amount);
  if (n === 0) return store;
  if (opts?.key && hasLedgerKey(store, opts.key)) return store;

  store.balance = Math.max(0, store.balance + n);
  if (n > 0) store.earnedTotal += n;
  if (reason === 'like' && n > 0) store.receivedLikes += n;
  pushLedger(store, { reason, delta: n, key: opts?.key, note: opts?.note });
  savePlayerStars(store, opts?.profileId);
  return store;
}

/** Идемпотентно: одна выплата на достижение. */
export function grantMilestoneStars(
  milestoneId: MilestoneId,
  profileId?: string,
): PlayerStarsStore {
  return grantStars('milestone', STAR_AMOUNTS.milestone, {
    profileId,
    key: `milestone:${milestoneId}`,
    note: milestoneId,
  });
}

/** Подарить N звёзд (локальный stub: только списание у отправителя). */
export function giftStars(
  toProfileId: string,
  amount: number,
  profileId?: string,
): { store: PlayerStarsStore; ok: boolean } {
  const store = loadPlayerStars(profileId);
  const n = Math.floor(amount);
  if (n <= 0 || store.balance < n) return { store, ok: false };
  store.balance -= n;
  store.givenTotal += n;
  pushLedger(store, {
    reason: 'gift_out',
    delta: -n,
    key: `gift:${Date.now()}:${toProfileId || 'stub'}`,
    note: toProfileId || 'stub',
  });
  savePlayerStars(store, profileId);
  return { store, ok: true };
}

/** Ежедневный заход в онлайн / ЛК: +1 и бонусы за серию 3/7 дней. */
export function recordOnlineVisitToday(profileId?: string, now = new Date()): PlayerStarsStore {
  const store = loadPlayerStars(profileId);
  const today = todayKey(now);
  if (store.lastOnlineDay === today) return store;

  const prev = store.lastOnlineDay;
  if (prev && prev === dayBefore(today)) {
    store.loginStreakDays = Math.max(1, store.loginStreakDays) + 1;
  } else {
    store.loginStreakDays = 1;
  }
  store.lastOnlineDay = today;
  savePlayerStars(store, profileId);

  grantStars('online_day', STAR_AMOUNTS.onlineDay, {
    profileId,
    key: `online:${today}`,
  });

  if (store.loginStreakDays === 3) {
    grantStars('online_streak_bonus', STAR_AMOUNTS.onlineStreak3, {
      profileId,
      key: `online_streak3:${today}`,
    });
  } else if (store.loginStreakDays === 7) {
    grantStars('online_streak_bonus', STAR_AMOUNTS.onlineStreak7, {
      profileId,
      key: `online_streak7:${today}`,
    });
  }

  return loadPlayerStars(profileId);
}

/** Stub: игрок поставил вам Up (+3 ★). */
export function receiveStarLike(fromNote?: string, profileId?: string): PlayerStarsStore {
  return grantStars('like', STAR_AMOUNTS.like, {
    profileId,
    key: `like:${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    note: fromNote ?? 'up',
  });
}

export function grantStarsForNewlyUnlockedMilestones(
  ids: readonly MilestoneId[],
  profileId?: string,
): PlayerStarsStore {
  let store = loadPlayerStars(profileId);
  for (const id of ids) {
    store = grantMilestoneStars(id, profileId);
  }
  return store;
}
