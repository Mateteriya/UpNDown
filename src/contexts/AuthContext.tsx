/**
 * Контекст авторизации — единый источник правды для сессии.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Provider, Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { AUTH_BOOT_TIMEOUT_MS } from '../lib/networkTimeouts';

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let settled = false;
    const finish = (next: Session | null | undefined, stopLoading = true) => {
      if (next !== undefined) setSession(next);
      if (stopLoading && !settled) {
        settled = true;
        setLoading(false);
      }
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      finish(nextSession, true);
    });
    supabase.auth
      .getSession()
      .then(({ data: { session: next } }) => finish(next, true))
      .catch(() => finish(undefined, true));
    /* Офлайн / висящий refresh: не держим весь UI в loading */
    const bootTimer = window.setTimeout(() => finish(undefined, true), AUTH_BOOT_TIMEOUT_MS);
    return () => {
      clearTimeout(bootTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error ?? null };
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
    if (error) return { error };
    if (data?.url && typeof window !== 'undefined') {
      // Редирект в той же вкладке (как GitHub) — новая вкладка давала чёрный экран после возврата
      window.location.href = data.url;
      return { error: null };
    }
    return { error: error ?? null };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

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
