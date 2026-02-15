/**
 * Контекст авторизации — единый источник правды для сессии.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Provider, Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
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
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|webOS/i.test(navigator.userAgent);
    const options: Parameters<typeof supabase.auth.signInWithOAuth>[0]['options'] = {
      redirectTo,
      skipBrowserRedirect: true,
    };
    // Google на мобильных иногда зависает — prompt: 'select_account' принудительно показывает выбор аккаунта
    if (provider === 'google' && isMobile) {
      options.queryParams = { prompt: 'select_account' };
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options,
    });
    if (error) return { error };
    if (data?.url && typeof window !== 'undefined') {
      // На мобильных для Google пробуем новую вкладку — иногда обходит зависание
      if (provider === 'google' && isMobile) {
        const w = window.open(data.url, '_blank', 'noopener,noreferrer');
        if (w) return { error: null }; // Открылось — пользователь завершит вход в новой вкладке
      }
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
