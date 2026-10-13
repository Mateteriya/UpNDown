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

export function isVkidProvider(p: AppOAuthProvider): boolean {
  return p === OAUTH_VKID;
}

/**
 * VK ID проверяет «базовый домен» страницы входа. LAN IP и localhost
 * (в т.ч. вечеринка :3001/play/) в кабинете VK не проходят — кнопку скрываем.
 * На публичном хосте (up2down.online, Vercel и т.п.) показываем.
 */
export function isVkidOAuthAvailableHere(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1') return false;
  // IPv4 / IPv6 literal — домашний хост вечеринки
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  if (host.includes(':')) return false;
  return true;
}

/** Для supabase.auth.signInWithOAuth — кастомные id как string. */
export function toSupabaseOAuthProvider(p: AppOAuthProvider): Provider {
  return p as Provider;
}
