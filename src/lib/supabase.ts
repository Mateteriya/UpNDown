/**
 * Supabase client для авторизации и (позже) онлайна.
 * Требует VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  SUPABASE_AUTH_REFRESH_TIMEOUT_MS,
  SUPABASE_AUTH_TIMEOUT_MS,
  SUPABASE_REST_TIMEOUT_MS,
} from './networkTimeouts';

function abortReason(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(abortReason('Supabase request timed out')), timeoutMs);
  const parent = init?.signal;
  if (parent) {
    if (parent.aborted) {
      clearTimeout(t);
      return Promise.reject(parent.reason ?? abortReason('Aborted'));
    }
    const onParentAbort = () => {
      clearTimeout(t);
      controller.abort(parent.reason ?? abortReason('Aborted'));
    };
    parent.addEventListener('abort', onParentAbort);
    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(t);
      parent.removeEventListener('abort', onParentAbort);
    });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

function authHref(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (typeof URL !== 'undefined' && input instanceof URL) return input.href;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.url;
  return '';
}

function isAuthPath(href: string): boolean {
  return /\/auth\/v1\b/i.test(href);
}

function isTokenPath(href: string): boolean {
  return /\/auth\/v1\/token\b/i.test(href);
}

function isTransientAuthFailure(err: unknown, res?: Response): boolean {
  if (res && (res.status === 502 || res.status === 503 || res.status === 504)) return true;
  if (err == null) return false;
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && 'message' in err
        ? String((err as { message: unknown }).message)
        : String(err);
  return /timed out|timeout|AbortError|Failed to fetch|NetworkError|upstream/i.test(msg);
}

async function responseLooksLikeUpstreamTimeout(res: Response): Promise<boolean> {
  if (res.status !== 502 && res.status !== 503 && res.status !== 504 && res.status !== 546) {
    /* Иногда шлюз отдаёт 200/500 с текстом upstream request timeout */
    try {
      const clone = res.clone();
      const text = (await clone.text()).slice(0, 200).toLowerCase();
      return text.includes('upstream request timeout') || text.includes('upstream connect error');
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * REST — длинный таймаут (запись стола).
 * Auth — с ретраем: один обрыв refresh не должен сразу валить сессию.
 */
async function fetchForSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = authHref(input);
  const auth = isAuthPath(href);
  const token = isTokenPath(href);
  const timeoutMs = token
    ? SUPABASE_AUTH_REFRESH_TIMEOUT_MS
    : auth
      ? SUPABASE_AUTH_TIMEOUT_MS
      : SUPABASE_REST_TIMEOUT_MS;
  /* Ретрай только на быстрый обрыв (502/сеть за <8с). После полного таймаута — не долбить ещё 35с. */
  const maxAttempts = auth ? 2 : 1;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    try {
      const res = await fetchWithTimeout(input, init, timeoutMs);
      const elapsed = Date.now() - started;
      if (
        auth &&
        attempt < maxAttempts &&
        elapsed < 8_000 &&
        (await responseLooksLikeUpstreamTimeout(res))
      ) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      const elapsed = Date.now() - started;
      if (auth && attempt < maxAttempts && elapsed < 8_000 && isTransientAuthFailure(err)) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : abortReason('Supabase request timed out');
}

let _supabase: SupabaseClient | null = null;

try {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (url && anonKey && url.startsWith('http')) {
    /**
     * На auth-callback.html обмен ?code= делает auth-callback.ts вручную.
     * Если detectSessionInUrl=true — клиент съедает PKCE verifier раньше →
     * «PKCE code verifier not found in storage».
     */
    const onAuthCallback =
      typeof window !== 'undefined' &&
      /auth-callback\.html/i.test(window.location.pathname || '');
    _supabase = createClient(url, anonKey, {
      global: { fetch: fetchForSupabase },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !onAuthCallback,
        /**
         * PKCE: в redirect уходит ?code=… (query).
         * Implicit (#access_token) на Android в updown:// не доходит — ОС отрезает hash.
         */
        flowType: 'pkce',
      },
    });
  }
} catch {
  _supabase = null;
}

export const supabase = _supabase;

export const isSupabaseConfigured = (): boolean => !!supabase;

/** supabase-js abort’ит lock/getSession без catch — иначе консоль и DEV-тормоза. */
function isBenignAbortReason(reason: unknown): boolean {
  if (reason == null || typeof reason !== 'object') return false;
  return 'name' in reason && String((reason as { name: unknown }).name) === 'AbortError';
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (ev) => {
    if (!isBenignAbortReason(ev.reason)) return;
    ev.preventDefault();
  });
}
