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

/** Параметр LAN-моста: code на прод → увести на локальный auth-callback (см. bounceOAuthPayloadToReturnUrl). */
export const OAUTH_RETURN_PARAM = 'ud_return';

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Канонический origin для OAuth (PKCE в sessionStorage привязан к хосту).
 * www.up2down.ru и up2down.ru — разные origin → иначе «код есть, вход не завершается».
 */
export function getCanonicalWebOrigin(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const u = new URL(window.location.href);
    if (u.hostname.toLowerCase() === 'www.up2down.ru') {
      u.hostname = 'up2down.ru';
    }
    return u.origin;
  } catch {
    return window.location.origin;
  }
}

/** Локальный (или текущий) URL страницы auth-callback — куда нужен PKCE exchange. */
export function getLocalAuthCallbackUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  if (isNativePlatform()) return NATIVE_AUTH_CALLBACK;
  const origin = getCanonicalWebOrigin() || window.location.origin;
  const path = window.location.pathname || '';
  const base = typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL || '/') : '/';
  if (path.startsWith('/play') || base === '/play/' || base.startsWith('/play')) {
    return `${origin}/play/auth-callback.html`;
  }
  return `${origin}/auth-callback.html`;
}

/** Если открыли www — сразу на канон (сохраняя path+query+hash). */
export function bounceWwwToCanonicalHost(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const u = new URL(window.location.href);
    if (u.hostname.toLowerCase() !== 'www.up2down.ru') return false;
    u.hostname = 'up2down.ru';
    window.location.replace(u.toString());
    return true;
  } catch {
    return false;
  }
}

/** Куда вернуть после Google — всегда текущий origin (LAN / Vite / прод). Без моста на другой домен. */
export function getAuthRedirectTo(): string | undefined {
  return getLocalAuthCallbackUrl();
}

/**
 * Ссылка в письме подтверждения email+пароль / recovery.
 * Ведём на **auth-callback** (лёгкая страница): setSession из hash → домой.
 * Раньше был home SPA — на проде грузился весь бандл (секунды–минуты), казалось «зависло».
 * URL должен быть в Supabase → Authentication → URL Configuration → Redirect URLs.
 */
export function getEmailConfirmRedirectTo(): string | undefined {
  return getLocalAuthCallbackUrl();
}

const OAUTH_RETURN_KEY = 'updown_oauth_return_to';

/** Куда вернуть SPA после auth-callback: #game / #online / … (не путать с PKCE redirect). */
const AUTH_APP_RETURN_KEY = 'updown_auth_app_return';

const SAFE_APP_RETURN_HASH =
  /^#(menu|game|online|lobby|rules|training|account|lk|cabinet|support|premium|rating)(\/.*)?$/i;

function appHomeBaseFromPath(pathname: string): string {
  const base = typeof import.meta !== 'undefined' ? String(import.meta.env?.BASE_URL || '/') : '/';
  if (pathname.startsWith('/play') || base === '/play/' || base.startsWith('/play')) {
    return '/play/';
  }
  return '/';
}

function normalizeAuthAppReturn(raw: string): string | null {
  try {
    const abs = raw.includes('://')
      ? new URL(raw)
      : new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'http://local');
    if (abs.username || abs.password) return null;
    if (/auth-callback/i.test(abs.pathname)) return null;
    const home = appHomeBaseFromPath(abs.pathname || '/');
    let hash = (abs.hash || '').trim();
    if (!hash || /access_token|refresh_token|error|type=/i.test(hash)) {
      hash = '#menu';
    }
    const hashOnly = hash.split(/[?&]/)[0] || '#menu';
    if (!SAFE_APP_RETURN_HASH.test(hashOnly)) {
      hash = '#menu';
    } else {
      hash = hashOnly;
    }
    const joined = `${home.replace(/\/?$/, '/')}${hash}`.replace(/\/{2,}#/, '/#');
    return joined.startsWith('/') ? joined : `/${joined}`;
  } catch {
    return null;
  }
}

/**
 * Запомнить экран игры/лобби до ухода на OAuth (auth-callback теряет #game).
 * Вызывать при открытии AuthModal и перед OAuth — с актуального URL (#game / #online).
 */
export function rememberAuthAppReturn(fromHref?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const src = fromHref || window.location.href;
    const next = normalizeAuthAppReturn(src);
    if (!next) return;
    sessionStorage.setItem(AUTH_APP_RETURN_KEY, next);
  } catch {
    /* ignore */
  }
}

export function peekAuthAppReturn(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_APP_RETURN_KEY)?.trim() || '';
    return raw ? normalizeAuthAppReturn(raw) : null;
  } catch {
    return null;
  }
}

export function clearAuthAppReturn(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_APP_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function consumeAuthAppReturn(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(AUTH_APP_RETURN_KEY)?.trim() || '';
    if (raw) sessionStorage.removeItem(AUTH_APP_RETURN_KEY);
    return raw ? normalizeAuthAppReturn(raw) : null;
  } catch {
    return null;
  }
}

/** Hash из сохранённого возврата (#game / #online / …). */
export function authAppReturnHash(returnPath: string | null | undefined): string | null {
  if (!returnPath) return null;
  try {
    const u = returnPath.includes('://')
      ? new URL(returnPath)
      : new URL(returnPath, 'http://local');
    const h = (u.hash || '').trim().toLowerCase().split(/[?&]/)[0];
    return h && SAFE_APP_RETURN_HASH.test(h) ? h : null;
  } catch {
    return null;
  }
}

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
  const remembered = consumeAuthAppReturn();
  if (remembered) return remembered;

  const path = window.location.pathname || '';
  const home = appHomeBaseFromPath(path);
  /** Сохранить #online / #menu — иначе replace('/') теряет раздел; не тащить oauth-hash. */
  try {
    const hash = window.location.hash || '';
    if (hash && !/access_token|refresh_token|error|type=/i.test(hash)) {
      const normalized = normalizeAuthAppReturn(`${home}${hash}`);
      if (normalized) return normalized;
    }
  } catch {
    /* ignore */
  }
  return home;
}

/** Backup JWT на время auth-callback → /play/ (если localStorage не успел/не записал). */
export const OAUTH_SESSION_BACKUP_KEY = 'updown_oauth_session_backup';

export type OAuthSessionBackup = {
  access_token: string;
  refresh_token: string;
  at: number;
};

export function stashOAuthSessionBackup(tokens: {
  access_token: string;
  refresh_token: string;
}): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!tokens.access_token || !tokens.refresh_token) return;
  try {
    const payload: OAuthSessionBackup = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      at: Date.now(),
    };
    sessionStorage.setItem(OAUTH_SESSION_BACKUP_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Прочитать backup (≤2 мин). consume=true — сразу удалить. */
export function readOAuthSessionBackup(opts?: { consume?: boolean }): OAuthSessionBackup | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(OAUTH_SESSION_BACKUP_KEY);
    if (!raw) return null;
    if (opts?.consume) sessionStorage.removeItem(OAUTH_SESSION_BACKUP_KEY);
    const p = JSON.parse(raw) as Partial<OAuthSessionBackup>;
    if (!p?.access_token || !p.refresh_token) return null;
    const at = typeof p.at === 'number' ? p.at : 0;
    if (at && Date.now() - at > 120_000) {
      sessionStorage.removeItem(OAUTH_SESSION_BACKUP_KEY);
      return null;
    }
    return { access_token: p.access_token, refresh_token: p.refresh_token, at };
  } catch {
    try {
      sessionStorage.removeItem(OAUTH_SESSION_BACKUP_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export function clearOAuthSessionBackup(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(OAUTH_SESSION_BACKUP_KEY);
  } catch {
    /* ignore */
  }
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
