/**
 * Аватары ИИ-ботов по уровню сложности (public/ИИ-боты).
 */
import type { AIDifficulty } from '../game/types';

const AI_BOTS_PUBLIC_DIR = '/ИИ-боты';

export const AI_BOT_AVATAR_VARIANT_COUNT = 6;

const OFFLINE_AVATAR_PICKS_KEY = 'upd.aiBotAvatarPick.offline.v1';
const ONLINE_AVATAR_PICKS_KEY = 'upd.aiBotAvatarPick.online.v1';

const AVATAR_FILES: Record<AIDifficulty, readonly string[]> = {
  novice: [
    'Новичок.jpg',
    'Новичок 0.jpg',
    'Новичок 1.jpg',
    'Новичок 2.jpg',
    'Новичок 3.jpg',
    'Новичок 5.jpg',
  ],
  amateur: [
    'Любитель.jpg',
    'Любитель 1.jpg',
    'Любитель 2.jpg',
    'Любитель 3.jpg',
    'Любитель 4.jpg',
    'Любитель 5.jpg',
  ],
  expert: [
    'Эксперт.jpg',
    'Эксперт 1.jpg',
    'Эксперт 2.jpg',
    'Эксперт 3.jpg',
    'Эксперт 4.jpg',
    'Эксперт 5.jpg',
  ],
};

export type AiBotTableSeat = {
  key: string;
  difficulty: AIDifficulty;
  /** Порядок за столом (ai1 < ai2 < ai3 или slotIndex). */
  sortOrder: number;
};

function encodePublicAssetPath(dir: string, fileName: string): string {
  const normalizedDir = dir.replace(/\/+$/, '');
  return `${normalizedDir}/${encodeURIComponent(fileName)}`;
}

function clampVariantIndex(variantIndex: number): number {
  const n = AI_BOT_AVATAR_VARIANT_COUNT;
  return ((variantIndex % n) + n) % n;
}

/** Все URL картинок уровня (6 шт.). */
export function listAiBotAvatarUrls(difficulty: AIDifficulty): string[] {
  return AVATAR_FILES[difficulty].map((file) => encodePublicAssetPath(AI_BOTS_PUBLIC_DIR, file));
}

/** URL картинки бота по уровню и индексу варианта (0…5). */
export function getAiBotAvatarUrl(difficulty: AIDifficulty, variantIndex = 0): string {
  const files = AVATAR_FILES[difficulty];
  const file = files[clampVariantIndex(variantIndex)];
  return encodePublicAssetPath(AI_BOTS_PUBLIC_DIR, file);
}

/**
 * Уникальные варианты за столом: при одном уровне у нескольких ИИ — разные картинки (0, 1, 2…).
 */
export function assignUniqueAiBotVariantsForTable(seats: readonly AiBotTableSeat[]): Readonly<Record<string, number>> {
  const byDifficulty = new Map<AIDifficulty, AiBotTableSeat[]>();
  for (const seat of seats) {
    const group = byDifficulty.get(seat.difficulty) ?? [];
    group.push(seat);
    byDifficulty.set(seat.difficulty, group);
  }
  const out: Record<string, number> = {};
  for (const group of byDifficulty.values()) {
    const sorted = [...group].sort((a, b) => a.sortOrder - b.sortOrder);
    sorted.forEach((seat, index) => {
      out[seat.key] = index % AI_BOT_AVATAR_VARIANT_COUNT;
    });
  }
  return out;
}

export function aiBotVariantIndexForOfflineBotId(botId: string): number {
  if (botId === 'ai1') return 0;
  if (botId === 'ai2') return 1;
  if (botId === 'ai3') return 2;
  return 0;
}

/** Канонический slotIndex комнаты (0–3) → порядок для уникального назначения. */
export function aiBotSortOrderForServerSlot(slotIndex: number): number {
  return slotIndex;
}

export function offlineAiBotAvatarKey(botId: string): string {
  return botId;
}

export function onlineAiBotAvatarKey(slotIndex: number): string {
  return `online-slot-${slotIndex}`;
}

function readPickMap(storageKey: string): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        out[key] = clampVariantIndex(value);
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writePickMap(storageKey: string, map: Record<string, number>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getOfflineAiBotAvatarPick(botId: string): number | null {
  const pick = readPickMap(OFFLINE_AVATAR_PICKS_KEY)[botId];
  return pick == null ? null : pick;
}

export function setOfflineAiBotAvatarPick(botId: string, variantIndex: number): void {
  const map = readPickMap(OFFLINE_AVATAR_PICKS_KEY);
  map[botId] = clampVariantIndex(variantIndex);
  writePickMap(OFFLINE_AVATAR_PICKS_KEY, map);
}

export function getOnlineAiBotAvatarPick(slotIndex: number): number | null {
  const pick = readPickMap(ONLINE_AVATAR_PICKS_KEY)[onlineAiBotAvatarKey(slotIndex)];
  return pick == null ? null : pick;
}

export function setOnlineAiBotAvatarPick(slotIndex: number, variantIndex: number): void {
  const map = readPickMap(ONLINE_AVATAR_PICKS_KEY);
  map[onlineAiBotAvatarKey(slotIndex)] = clampVariantIndex(variantIndex);
  writePickMap(ONLINE_AVATAR_PICKS_KEY, map);
}

export function resolveAiBotAvatarVariantIndex(opts: {
  seatKey: string;
  tableAssignments: Readonly<Record<string, number>>;
  customPick: number | null;
  fallbackVariant: number;
}): number {
  if (opts.customPick != null) return opts.customPick;
  const assigned = opts.tableAssignments[opts.seatKey];
  if (assigned != null) return assigned;
  return clampVariantIndex(opts.fallbackVariant);
}

export function isOfflineAiBotId(playerId: string | undefined): playerId is 'ai1' | 'ai2' | 'ai3' {
  return playerId === 'ai1' || playerId === 'ai2' || playerId === 'ai3';
}

/** Слот без живого игрока или с ручной паузой (ИИ играет вместо человека). */
export function isOnlineAiControlledSlot(slot: {
  userId?: string | null;
  replacedUserId?: string | null;
} | undefined): boolean {
  if (!slot) return false;
  if (slot.userId == null || slot.userId === '') return true;
  return slot.replacedUserId != null && String(slot.replacedUserId).trim() !== '';
}

/** @deprecated используйте aiBotSortOrderForServerSlot */
export function aiBotVariantIndexForServerSlot(slotIndex: number): number {
  return ((slotIndex % 3) + 3) % 3;
}
