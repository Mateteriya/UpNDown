/**
 * Провайдеры входа. Built-in Supabase + custom:* (Dashboard → Custom Providers).
 * @see docs/AUTH-YANDEX-VK-MAIL.md
 */

import type { Provider } from '@supabase/supabase-js';

/** Кастомные IdP (identifier в Supabase должен совпадать). */
export const OAUTH_YANDEX = 'custom:yandex' as const;
export const OAUTH_VKID = 'custom:vkid' as const;

export type AppOAuthProvider = Provider | typeof OAUTH_YANDEX | typeof OAUTH_VKID;

export function isGoogleProvider(p: AppOAuthProvider): boolean {
  return p === 'google';
}

export function isYandexProvider(p: AppOAuthProvider): boolean {
  return p === OAUTH_YANDEX;
}

/** Для supabase.auth.signInWithOAuth — кастомные id как string. */
export function toSupabaseOAuthProvider(p: AppOAuthProvider): Provider {
  return p as Provider;
}
