/**
 * OAuth / email-confirm.
 *
 * APK → updown://auth-callback
 * Браузер → тот же origin, где открыта игра (/play/auth-callback.html или /auth-callback.html)
 *
 * Вечеринка: НИКОГДА не уводить на up2down.online (часто нужен VPN).
 * Site URL / Redirect URLs в Supabase должны указывать на LAN :3001 — см. docs/ЛОКАЛЬНАЯ-РАЗРАБОТКА.md
 */
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

export const NATIVE_AUTH_CALLBACK = 'updown://auth-callback';

/** @deprecated мост через прод отключён (VPN). Оставлено для старых ссылок с ud_return. */
export const PROD_AUTH_BRIDGE = 'https://up2down.online/auth-callback.html';
export const OAUTH_RETURN_PARAM = 'ud_return';

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Локальный (или текущий) URL страницы auth-callback — куда нужен PKCE exchange. */
export function getLocalAuthCallbackUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (isNativePlatform()) return NATIVE_AUTH_CALLBACK;
  const origin = window.location.origin;
  const path = window.location.pathname || '';
  const base = typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL || '/') : '/';
  if (path.startsWith('/play') || base === '/play/' || base.startsWith('/play')) {
    return `${origin}/play/auth-callback.html`;
  }
  return `${origin}/auth-callback.html`;
}

/** Куда вернуть после Google — всегда текущий origin (LAN / Vite / прод). Без моста на другой домен. */
export function getAuthRedirectTo(): string | undefined {
  return getLocalAuthCallbackUrl();
}

/** @deprecated не использовать — уводит на прод и VPN. */
export function getAuthBridgeRedirectTo(): string | undefined {
  return getLocalAuthCallbackUrl();
}

const OAUTH_RETURN_KEY = 'updown_oauth_return_to';

export function rememberOAuthReturnTo(redirectTo: string | undefined): void {
  const local = getLocalAuthCallbackUrl();
  const value = local || redirectTo;
  if (!value || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(OAUTH_RETURN_KEY, value);
  } catch {
    /* ignore */
  }
}

export function peekOAuthReturnTo(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    return localStorage.getItem(OAUTH_RETURN_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Только loopback / private LAN → auth-callback (anti open-redirect). */
export function isSafeOAuthReturnUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!/auth-callback/i.test(u.pathname)) return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(host);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Если в URL есть ud_return (старые ссылки) — перекинуть code на LAN без exchange здесь.
 */
export function bounceOAuthPayloadToReturnUrl(currentHref: string): boolean {
  if (typeof window === 'undefined') return false;
  let url: URL;
  try {
    url = new URL(currentHref);
  } catch {
    return false;
  }
  const udReturn = url.searchParams.get(OAUTH_RETURN_PARAM)?.trim();
  if (!udReturn || !isSafeOAuthReturnUrl(udReturn)) return false;

  let target: URL;
  try {
    target = new URL(udReturn);
  } catch {
    return false;
  }

  if (
    target.origin === url.origin &&
    target.pathname.replace(/\/$/, '') === url.pathname.replace(/\/$/, '')
  ) {
    return false;
  }

  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  const hashParams = new URLSearchParams(hash);
  const hasCode = !!url.searchParams.get('code');
  const hasToken = !!hashParams.get('access_token');
  const hasErr = !!(url.searchParams.get('error') || url.searchParams.get('error_description'));
  if (!hasCode && !hasToken && !hasErr) return false;

  for (const [k, v] of url.searchParams) {
    if (k === OAUTH_RETURN_PARAM) continue;
    target.searchParams.set(k, v);
  }
  if (url.hash) target.hash = url.hash;

  window.location.replace(target.toString());
  return true;
}

export function oauthAuthorizeUsesExpectedRedirect(
  authorizeUrl: string,
  expectedRedirect: string,
): boolean {
  try {
    const u = new URL(authorizeUrl);
    const raw = u.searchParams.get('redirect_to');
    if (!raw) return false;
    const rt = decodeURIComponent(raw);
    const expect = new URL(expectedRedirect);
    const got = new URL(rt);
    if (got.origin.toLowerCase() !== expect.origin.toLowerCase()) return false;
    if (!/auth-callback/i.test(got.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function oauthAuthorizeUsesLocalRedirect(
  authorizeUrl: string,
  expectedRedirect: string,
): boolean {
  return oauthAuthorizeUsesExpectedRedirect(authorizeUrl, expectedRedirect);
}

export function oauthRedirectRejectedError(expectedRedirect: string): Error {
  const playHome = expectedRedirect.replace(/\/auth-callback\.html$/i, '/');
  const e = new Error(
    `Google вернул бы на сайт (часто нужен VPN), а не в локальную игру.\n\n` +
      `Supabase → Authentication → URL Configuration:\n` +
      `1) Redirect URLs — добавьте точно:\n${expectedRedirect}\n` +
      `   и удобный wildcard: http://192.168.*.*:3001/**\n` +
      `2) На время вечеринки Site URL можно поставить:\n${playHome}\n` +
      `   (без ?code= и без #online). После вечеринки верните https://up2down.online\n\n` +
      `Не путайте: вечеринка = порт 3001/play/, не Vite :5173, не сайт.`,
  );
  e.name = 'AuthRedirectRejectedError';
  return e;
}

export function getAuthReturnHomePath(): string {
  if (typeof window === 'undefined') return '/';
  const path = window.location.pathname || '';
  const base = typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL || '/') : '/';
  if (path.startsWith('/play') || base === '/play/' || base.startsWith('/play')) {
    return '/play/';
  }
  return '/';
}

export function isAuthCallbackUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('updown://auth-callback')) return true;
  if (u.includes('auth-callback.html')) return true;
  if (u.includes('access_token=') || u.includes('refresh_token=')) return true;
  if (/[?&#]code=[^&]+/.test(u) && (u.includes('auth') || u.includes('updown'))) return true;
  return false;
}

export async function openAuthProviderUrl(url: string): Promise<void> {
  if (!url) return;
  window.location.href = url;
}

export async function closeAuthBrowser(): Promise<void> {
  /* no-op */
}

export async function completeNativeAuthFromUrl(url: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: new Error('Supabase не настроен') };

  try {
    let parsed: URL;
    try {
      parsed = new URL(url.replace(/^updown:\/\//i, 'https://updown.local/'));
    } catch {
      const q = url.includes('?') ? url.slice(url.indexOf('?')) : '';
      parsed = new URL('https://updown.local/auth-callback' + q);
    }

    const errParam = parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
    if (errParam) {
      await closeAuthBrowser();
      return { error: new Error(errParam) };
    }

    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      await closeAuthBrowser();
      if (error) return { error };
      try {
        sessionStorage.setItem('updown_from_oauth_redirect', '1');
      } catch {
        /* ignore */
      }
      return { error: null };
    }

    const hash = parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash;
    const fromHash = new URLSearchParams(hash);
    const access_token =
      fromHash.get('access_token') || parsed.searchParams.get('access_token') || '';
    const refresh_token =
      fromHash.get('refresh_token') || parsed.searchParams.get('refresh_token') || '';

    if (!access_token) {
      await closeAuthBrowser();
      return {
        error: new Error(
          'Код входа не получен. Нужен PKCE и Redirect URL updown://auth-callback в Supabase.',
        ),
      };
    }

    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    await closeAuthBrowser();
    if (error) return { error };
    try {
      sessionStorage.setItem('updown_from_oauth_redirect', '1');
    } catch {
      /* ignore */
    }
    return { error: null };
  } catch (e) {
    await closeAuthBrowser();
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}
