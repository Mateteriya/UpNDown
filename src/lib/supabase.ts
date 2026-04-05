/**
 * Supabase client для авторизации и (позже) онлайна.
 * Требует VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Верхняя граница висящего REST; 55 с × два последовательных вызова ощущались как ~2 мин на телефоне. */
const FETCH_TIMEOUT_MS = 38_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  if (parent) {
    if (parent.aborted) {
      clearTimeout(t);
      return Promise.reject(parent.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    const onParentAbort = () => {
      clearTimeout(t);
      controller.abort(parent.reason);
    };
    parent.addEventListener('abort', onParentAbort);
    return fetch(input, { ...init, signal: controller.signal })
      .finally(() => {
        clearTimeout(t);
        parent.removeEventListener('abort', onParentAbort);
      });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

/** Auth (OAuth, setSession, refresh) без общего таймаута — иначе цепочка вызовов даёт минуты ожидания. */
function fetchForSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let href = '';
  if (typeof input === 'string') href = input;
  else if (typeof URL !== 'undefined' && input instanceof URL) href = input.href;
  else if (typeof Request !== 'undefined' && input instanceof Request) href = input.url;
  // Любой путь GoTrue, не только /auth/v1/…
  if (/\/auth\/v1\b/i.test(href)) return fetch(input, init);
  return fetchWithTimeout(input, init);
}

let _supabase: SupabaseClient | null = null;

try {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (url && anonKey && url.startsWith('http')) {
    _supabase = createClient(url, anonKey, {
      global: { fetch: fetchForSupabase },
    });
  }
} catch {
  _supabase = null;
}

export const supabase = _supabase;

export const isSupabaseConfigured = (): boolean => !!supabase;
