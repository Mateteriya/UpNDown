import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Provider, Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

function authCallbackUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  const path = `${base}auth-callback.html`.replace(/\/{2,}/g, '/');
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`;
}

function portalHomeUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}#/`;
}

interface PortalAuthContextValue {
  session: Session | null;
  user: User | null;
  displayName: string;
  loading: boolean;
  configured: boolean;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const PortalAuthContext = createContext<PortalAuthContextValue | null>(null);

export function PortalAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google' as Provider,
      options: {
        redirectTo: authCallbackUrl(),
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error) return { error };
    if (data?.url) {
      window.location.href = data.url;
      return { error: null };
    }
    return { error: new Error('OAuth URL не получен') };
  }, []);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
  }, []);

  const user = session?.user ?? null;
  const displayName =
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    (user?.user_metadata?.name as string | undefined)?.trim() ||
    user?.email?.split('@')[0] ||
    'Участник';

  const value: PortalAuthContextValue = {
    session,
    user,
    displayName,
    loading,
    configured,
    signInWithGoogle,
    signOut,
  };

  return <PortalAuthContext.Provider value={value}>{children}</PortalAuthContext.Provider>;
}

export function usePortalAuth(): PortalAuthContextValue {
  const ctx = useContext(PortalAuthContext);
  if (!ctx) throw new Error('usePortalAuth must be used within PortalAuthProvider');
  return ctx;
}

export { portalHomeUrl };
