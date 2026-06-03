/**
 * Продуктовые feature flags (монетизация, geo, волны roadmap).
 * Override через VITE_* в .env.local
 */

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Real-money Cash Arena — волна 5+, только после legal sign-off */
export const CASH_ARENA_ENABLED = envBool('VITE_CASH_ARENA_ENABLED', false);

/** РФ и аналоги: только Cosmic Credits, без cash-out */
export const GEO_RU_CC_ONLY = envBool('VITE_GEO_RU_CC_ONLY', true);

/** CC ledger (hold/settle) — волна 3+ */
export const CC_LEDGER_ENABLED = envBool('VITE_CC_LEDGER_ENABLED', false);

/** Публичный зал столов — волна 2+ (в проде включён; выключить: VITE_PUBLIC_HALL_ENABLED=false) */
export const PUBLIC_HALL_ENABLED = envBool('VITE_PUBLIC_HALL_ENABLED', true);

/** Sit-n-go турниры на CC — волна 4+ */
export const CC_TOURNAMENTS_ENABLED = envBool('VITE_CC_TOURNAMENTS_ENABLED', false);

/** Дефолтный demo buy-in для банковой комнаты (волна 1, без wallet) */
export const DEFAULT_BANK_DEMO_BUY_IN = 100;
