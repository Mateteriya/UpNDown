/**
 * Флаги мобильных режимов вёрстки. Иммерсив short-VH отключён — код в резерве:
 * src/archived/mobileShortImmersiveMode.archived.ts (не импортируется).
 */
export const MOBILE_SHORT_IMMERSIVE_ENABLED = false as const;

const IMMERSIVE_SESSION_KEYS = [
  'upd.gameTable.mobileShortHeaderImmersive.v1',
  'upd.gameTable.mobileShortImmersiveBadgeDragX.v1',
] as const;

const IMMERSIVE_LOCAL_KEYS = ['upd.gameTable.immersiveWelcomeDismissed.v1'] as const;

/** Сброс сохранённого immersive при старте, пока режим выключен. */
export function purgeDisabledMobileShortImmersiveStorage(): void {
  if (MOBILE_SHORT_IMMERSIVE_ENABLED) return;
  try {
    for (const k of IMMERSIVE_SESSION_KEYS) sessionStorage.removeItem(k);
    for (const k of IMMERSIVE_LOCAL_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
