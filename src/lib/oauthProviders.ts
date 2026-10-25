/**
 * Провайдеры входа. Built-in Supabase + custom:* (Dashboard → Custom Providers).
 * @see docs/AUTH-YANDEX-VK-MAIL.md
 * @see docs/AUTH-APPLE-LINE.md
 */

import type { Provider } from '@supabase/supabase-js';

/** Кастомные IdP (identifier в Supabase должен совпадать). */
export const OAUTH_YANDEX = 'custom:yandex' as const;
export const OAUTH_VKID = 'custom:vkid' as const;
export const OAUTH_LINE = 'custom:line' as const;

export type AppOAuthProvider =
  | Provider
  | typeof OAUTH_YANDEX
  | typeof OAUTH_VKID
  | typeof OAUTH_LINE;

export type AuthUiRegion = 'ru' | 'jp' | 'default';

export function isGoogleProvider(p: AppOAuthProvider): boolean {
  return p === 'google';
}

export function isAppleProvider(p: AppOAuthProvider): boolean {
  return p === 'apple';
}

export function isYandexProvider(p: AppOAuthProvider): boolean {
  return p === OAUTH_YANDEX;
}

export function isVkidProvider(p: AppOAuthProvider): boolean {
  return p === OAUTH_VKID;
}

export function isLineProvider(p: AppOAuthProvider): boolean {
  return p === OAUTH_LINE;
}

/**
 * Канон для VK ID «базовый домен» в кабинете — только этот хост стартует OAuth напрямую.
 * Остальное (LAN, localhost, up2down.ru, vercel.app) → мост /vk-lan-bridge.html на online.
 */
export const VKID_CANONICAL_HOST = 'up2down.online';

/**
 * Нужен ли публичный мост (up2down.online/vk-lan-bridge.html).
 */
export function needsVkidLanBridge(hostname?: string): boolean {
  const host = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  if (!host) return true;
  if (host === VKID_CANONICAL_HOST || host === `www.${VKID_CANONICAL_HOST}`) return false;
  return true;
}

/** @deprecated используйте needsVkidLanBridge — кнопка VK больше не скрывается на LAN */
export function isVkidOAuthAvailableHere(hostname?: string): boolean {
  return !needsVkidLanBridge(hostname);
}

/** Язык UI / браузера → какие OAuth-кнопки в приоритете. */
export function detectAuthUiRegion(): AuthUiRegion {
  try {
    const loc = (typeof localStorage !== 'undefined' ? localStorage.getItem('updown-locale') : null)
      ?.trim()
      .toLowerCase();
    if (loc === 'ja' || loc === 'jp') return 'jp';
    if (loc === 'ru') return 'ru';
  } catch {
    /* ignore */
  }
  const nav =
    typeof navigator !== 'undefined' ? String(navigator.language || '').toLowerCase() : '';
  if (nav.startsWith('ja')) return 'jp';
  if (nav.startsWith('ru') || nav.startsWith('uk') || nav.startsWith('be') || nav.startsWith('kk')) {
    return 'ru';
  }
  return 'default';
}

/**
 * Порядок кнопок в модалке входа.
 * Apple/LINE видны всегда, но в JP — выше; RU — Яндекс + VK ID·Mail.ru (на LAN через мост).
 */
export function listVisibleOAuthProviders(region?: AuthUiRegion): AppOAuthProvider[] {
  const r = region ?? detectAuthUiRegion();
  if (r === 'jp') {
    return [OAUTH_LINE, 'apple', 'google', 'github'];
  }
  if (r === 'ru') {
    return [OAUTH_YANDEX, OAUTH_VKID, 'google', 'apple', 'github'];
  }
  return ['google', 'apple', 'github', OAUTH_YANDEX, OAUTH_VKID, OAUTH_LINE];
}

/** Для supabase.auth.signInWithOAuth — кастомные id как string. */
export function toSupabaseOAuthProvider(p: AppOAuthProvider): Provider {
  return p as Provider;
}
