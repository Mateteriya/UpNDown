/**
 * Глобальный уровень ИИ (онлайн и дефолт офлайн) + отдельные уровни ботов ai1–ai3 в офлайне.
 */

import type { AIDifficulty } from './types';

const STORAGE_KEY = 'upndown-ai-difficulty';
/** JSON { "ai1": "expert", ... } — предпочтения для новых партий и подстановка в сохранениях без поля */
const OFFLINE_BY_BOT_ID_KEY = 'upndown-offline-ai-by-bot-id';

const VALID: readonly AIDifficulty[] = ['novice', 'amateur', 'expert'];

const OFFLINE_BOT_IDS = ['ai1', 'ai2', 'ai3'] as const;

function parseOfflineByBotId(raw: string | null): Partial<Record<(typeof OFFLINE_BOT_IDS)[number], AIDifficulty>> {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    const out: Partial<Record<string, AIDifficulty>> = {};
    for (const id of OFFLINE_BOT_IDS) {
      const v = (o as Record<string, unknown>)[id];
      if (typeof v === 'string' && (VALID as readonly string[]).includes(v)) out[id] = v as AIDifficulty;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOfflineByBotId(map: Partial<Record<(typeof OFFLINE_BOT_IDS)[number], AIDifficulty>>): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_BY_BOT_ID_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getAiDifficulty(): AIDifficulty {
  if (typeof localStorage === 'undefined') return 'amateur';
  const v = localStorage.getItem(STORAGE_KEY);
  if (v && (VALID as readonly string[]).includes(v)) return v as AIDifficulty;
  return 'amateur';
}

export function setAiDifficulty(level: AIDifficulty): void {
  if (typeof localStorage === 'undefined') return;
  if (!(VALID as readonly string[]).includes(level)) return;
  localStorage.setItem(STORAGE_KEY, level);
}

/** Уровень для нового бота и как fallback при загрузке старого сохранения */
export function offlineAiDifficultyForNewBotId(botId: string): AIDifficulty {
  if (botId !== 'ai1' && botId !== 'ai2' && botId !== 'ai3') return getAiDifficulty();
  const map = parseOfflineByBotId(typeof localStorage !== 'undefined' ? localStorage.getItem(OFFLINE_BY_BOT_ID_KEY) : null);
  return map[botId as 'ai1'] ?? getAiDifficulty();
}

export function persistOfflineAiDifficultyForBotId(botId: string, level: AIDifficulty): void {
  if (botId !== 'ai1' && botId !== 'ai2' && botId !== 'ai3') return;
  if (!(VALID as readonly string[]).includes(level)) return;
  const map = parseOfflineByBotId(typeof localStorage !== 'undefined' ? localStorage.getItem(OFFLINE_BY_BOT_ID_KEY) : null);
  map[botId as 'ai1'] = level;
  writeOfflineByBotId(map);
}

/** Кнопка «ИИ» в шапке офлайна: выставить всем ботам и запомнить для новых партий */
export function persistAllOfflineAiDifficulties(level: AIDifficulty): void {
  if (!(VALID as readonly string[]).includes(level)) return;
  const map: Partial<Record<'ai1' | 'ai2' | 'ai3', AIDifficulty>> = { ai1: level, ai2: level, ai3: level };
  writeOfflineByBotId(map);
}

