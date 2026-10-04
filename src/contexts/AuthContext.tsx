/**
 * Контекст авторизации — единый источник правды для сессии.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Provider, Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AUTH_BOOT_TIMEOUT_MS } from '../lib/networkTimeouts';
import { clearLocalAccountAvatarCache } from '../lib/profileSync';
import { authDebug, authDebugProbeSetItem, authDebugStorageSnapshot } from '../lib/authDebug';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithOAuth: (provider: Provider) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isDeadRefreshTokenError(err: unknown): boolean {
  const msg =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: unknown }).message)
      : String(err ?? '');
  return /invalid refresh token|refresh token not found/i.test(msg);
}

/** Только ключи storage — без signOut (он шлёт SIGNED_OUT и может снести живую сессию). */
function wipeAuthStorageKeys(reason: string): void {
  authDebug(`wipeAuthStorageKeys ← ${reason}`, {
    stack: new Error().stack?.split('\n').slice(0, 8),
    storage: authDebugStorageSnapshot(),
  });
  if (typeof localStorage === 'undefined') return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-[\w-]+-auth-token/.test(k)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch (e) {
    authDebug('wipeAuthStorageKeys error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Перед refresh: освободить место под auth-токен (черновики редактора часто забивают quota). */
function freeStoragePressureForAuth(reason: string): void {
  authDebug(`freeStoragePressureForAuth ← ${reason}`, authDebugStorageSnapshot());
  if (typeof localStorage === 'undefined') return;
  /* Сначала черновики — аватар профиля не трогаем (иначе пропадёт до следующего sync). */
  for (const k of ['updown_avatar_editor_working_flat', 'updown_avatar_editor_meta', 'updown_avatar_pending']) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  authDebugProbeSetItem(`after-free:${reason}`);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let settled = false;
    let cancelled = false;
    const deferTimers = new Set<number>();
    authDebug('AuthProvider boot', authDebugStorageSnapshot());
    authDebugProbeSetItem('boot');

    const applySession = (next: Session | null | undefined, stopLoading = true, via = 'finish') => {
      if (cancelled) return;
      const prev = sessionRef.current;
      const prevId = prev?.user?.id ?? null;
      const nextId = next === undefined ? '(keep)' : next?.user?.id ?? null;
      if (next !== undefined && prevId && !nextId) {
        authDebug(`SESSION→NULL via ${via}`, {
          prevId,
          stack: new Error().stack?.split('\n').slice(0, 10),
          storage: authDebugStorageSnapshot(),
        });
      } else {
        authDebug(`session.finish via ${via}`, { prevId, nextId, stopLoading });
      }
      if (next !== undefined) {
        /* Один и тот же JWT — не дёргать React (иначе ЛК/архив перезапускают fetch → шторм refresh). */
        const same =
          (prev?.access_token ?? null) === (next?.access_token ?? null) &&
          (prev?.user?.id ?? null) === (next?.user?.id ?? null) &&
          (prev?.expires_at ?? null) === (next?.expires_at ?? null);
        if (same) {
          authDebug(`session.skip identical via ${via}`);
        } else {
          setSession(next);
        }
      }
      if (stopLoading && !settled) {
        settled = true;
        setLoading(false);
      }
    };

    /**
     * setState из колбэка GoTrue держит auth-lock; эффекты с supabase.from()
     * тогда гоняют параллельный refresh → TOKEN_REFRESHED storm → SIGNED_OUT.
     * Выходим из lock через setTimeout(0) (рекомендация supabase-js).
     */
    const finish = (next: Session | null | undefined, stopLoading = true, via = 'finish') => {
      const id = window.setTimeout(() => {
        deferTimers.delete(id);
        applySession(next, stopLoading, via);
      }, 0);
      deferTimers.add(id);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authDebug(`onAuthStateChange:${event}`, {
        nextUserId: nextSession?.user?.id ?? null,
        hadSession: !!sessionRef.current,
        storage: authDebugStorageSnapshot(),
      });
      /* Probe на каждый TOKEN_REFRESHED засоряет storage/консоль во время шторма. */
      if (event !== 'TOKEN_REFRESHED') {
        authDebugProbeSetItem(`auth-event:${event}`);
      }
      /* Не обнулять сессию на сбое/таймауте refresh — иначе лаба «сбрасывается» ~каждые 10 мин.
       * SIGNED_OUT — всегда применяем (явный выход). */
      if (
        event !== 'SIGNED_OUT' &&
        (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') &&
        nextSession == null &&
        sessionRef.current != null
      ) {
        authDebug(`KEEP session despite ${event} with null next`);
        return;
      }
      if (
        event === 'TOKEN_REFRESHED' &&
        nextSession &&
        sessionRef.current?.access_token === nextSession.access_token &&
        sessionRef.current?.expires_at === nextSession.expires_at
      ) {
        return;
      }
      finish(nextSession, true, `onAuthStateChange:${event}`);
    });
    supabase.auth
      .getSession()
      .then(async ({ data: { session: next }, error }) => {
        if (cancelled) return;
        if (error) {
          authDebug('getSession error', {
            message: error.message,
            deadRefresh: isDeadRefreshTokenError(error),
            storage: authDebugStorageSnapshot(),
          });
        }
        if (error && isDeadRefreshTokenError(error)) {
          /* Сначала попробовать освободить quota и перечитать — не сразу logout */
          freeStoragePressureForAuth('getSession.deadRefresh');
          try {
            const retry = await supabase.auth.getSession();
            if (cancelled) return;
            if (!retry.error && retry.data.session) {
              authDebug('getSession retry OK after freeStorage');
              finish(retry.data.session, true, 'getSession.retry');
              return;
            }
            authDebug('getSession retry still bad', {
              error: retry.error?.message,
              hasSession: !!retry.data.session,
            });
          } catch (e) {
            authDebug('getSession retry threw', {
              error: e instanceof Error ? e.message : String(e),
            });
          }
          wipeAuthStorageKeys('getSession.deadRefresh');
          finish(null, true, 'getSession.wipe');
          return;
        }
        finish(next, true, 'getSession');
      })
      .catch(async (err) => {
        if (cancelled) return;
        authDebug('getSession catch', {
          error: err instanceof Error ? err.message : String(err),
          deadRefresh: isDeadRefreshTokenError(err),
        });
        if (isDeadRefreshTokenError(err)) {
          freeStoragePressureForAuth('getSession.catch.deadRefresh');
          try {
            const retry = await supabase!.auth.getSession();
            if (cancelled) return;
            if (!retry.error && retry.data.session) {
              finish(retry.data.session, true, 'getSession.catch.retry');
              return;
            }
          } catch {
            /* fall through */
          }
          wipeAuthStorageKeys('getSession.catch.deadRefresh');
          finish(null, true, 'getSession.catch.wipe');
          return;
        }
        finish(undefined, true, 'getSession.catch');
      });
    /* Офлайн / висящий refresh: не держим весь UI в loading */
    const bootTimer = window.setTimeout(() => finish(undefined, true, 'bootTimer'), AUTH_BOOT_TIMEOUT_MS);
    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      for (const id of deferTimers) clearTimeout(id);
      deferTimers.clear();
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const first = await supabase.auth.signInWithPassword({ email, password });
    if (first.error && isDeadRefreshTokenError(first.error)) {
      wipeAuthStorageKeys('signIn.deadRefresh');
      const retry = await supabase.auth.signInWithPassword({ email, password });
      return { error: retry.error ?? null };
    }
    return { error: first.error ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const first = await supabase.auth.signUp({ email, password });
    if (first.error && isDeadRefreshTokenError(first.error)) {
      wipeAuthStorageKeys('signUp.deadRefresh');
      const retry = await supabase.auth.signUp({ email, password });
      return { error: retry.error ?? null };
    }
    return { error: first.error ?? null };
  }, []);

  const signInWithOAuth = useCallback(async (provider: Provider) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const redirectTo = typeof window !== 'undefined'
      ? window.location.origin + '/auth-callback.html'
      : undefined;
    const options: Parameters<typeof supabase.auth.signInWithOAuth>[0]['options'] = {
      redirectTo,
      skipBrowserRedirect: true,
    };
    // Google: prompt=select_account — сразу выбор аккаунта, без автодетекта
    if (provider === 'google') {
      options.queryParams = { prompt: 'select_account' };
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });
    if (error) {
      if (isDeadRefreshTokenError(error)) {
        wipeAuthStorageKeys('signInWithOAuth.deadRefresh');
        const retry = await supabase.auth.signInWithOAuth({ provider, options });
        if (retry.error) return { error: retry.error };
        if (retry.data?.url && typeof window !== 'undefined') {
          window.location.href = retry.data.url;
          return { error: null };
        }
        return { error: retry.error ?? null };
      }
      return { error };
    }
    if (data?.url && typeof window !== 'undefined') {
      // Редирект в той же вкладке (как GitHub) — новая вкладка давала чёрный экран после возврата
      window.location.href = data.url;
      return { error: null };
    }
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    authDebug('signOut() explicit', {
      stack: new Error().stack?.split('\n').slice(0, 10),
      storage: authDebugStorageSnapshot(),
    });
    /* Явный выход: не оставлять облачную аву на госте; не трогаем при сбое JWT */
    try {
      clearLocalAccountAvatarCache();
    } catch {
      /* ignore */
    }
    if (supabase) await supabase.auth.signOut();
  }, []);

  useEffect(() => {
    authDebug('session.state', {
      userId: session?.user?.id ?? null,
      loading,
      email: session?.user?.email ?? null,
    });
  }, [session?.user?.id, session?.user?.email, loading]);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    configured,
    signIn,
    signUp,
    signInWithOAuth,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
