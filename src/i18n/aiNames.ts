import { t, type MsgKey } from './t';

const STORED_AI_NAME_KEYS: Record<string, MsgKey> = {
  'ИИ Юг': 'ai.south',
  'ИИ Север': 'ai.north',
  'ИИ Запад': 'ai.west',
  'ИИ Восток': 'ai.east',
};

/** Display-only: stored RU names and bot ids stay as-is in saves. */
export function localizeAiDisplayName(
  id: string | undefined,
  stored: string,
  playerCount: number,
): string {
  const fromStored = STORED_AI_NAME_KEYS[stored.trim()];
  if (fromStored) return t(fromStored);
  if (id === 'ai1') return t(playerCount === 3 ? 'ai.east' : 'ai.north');
  if (id === 'ai2') return t('ai.west');
  if (id === 'ai3') return t('ai.east');
  return stored;
}
