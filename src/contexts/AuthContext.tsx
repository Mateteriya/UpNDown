/**
 * Контекст авторизации — единый источник правды для сессии.
 *
 * Устойчивость к «upstream request timeout» у Supabase Auth:
 * - не выкидывать из аккаунта на ложном SIGNED_OUT, пока access JWT ещё жив;
 * - вход/выход с ретраями и локальным wipe, если облако не отвечает;
 * - не держать UI на вечном await к GoTrue.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  isGoogleProvider,
  isVkidProvider,
  isYandexProvider,
  toSupabaseOAuthProvider,
  type AppOAuthProvider,
} from '../lib/oauthProviders';
import { startVkidDirectOAuth } from '../lib/vkidDirectOAuth';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  AUTH_BOOT_OFFLINE_MS,
  AUTH_BOOT_TIMEOUT_MS,
  SUPABASE_AUTH_SIGNIN_BUDGET_MS,
  SUPABASE_AUTH_SIGNOUT_TIMEOUT_MS,
} from '../lib/networkTimeouts';
import { networkAuthError, storageFullAuthError } from '../lib/authErrors';
import { clearLocalAccountAvatarCache } from '../lib/profileSync';
import { authDebug, authDebugProbeSetItem, authDebugStorageSnapshot } from '../lib/authDebug';
import { isBrowserOffline, shouldSkipCloudBootWait } from '../lib/offlineReady';
import {
  clearOAuthSessionBackup,
  completeNativeAuthFromUrl,
  getAuthRedirectTo,
  getEmailConfirmRedirectTo,
  isAuthCallbackUrl,
  isNativePlatform,
  oauthAuthorizeUsesExpectedRedirect,
  oauthRedirectRejectedError,
  openAuthProviderUrl,
  readOAuthSessionBackup,
  rememberAuthAppReturn,
  rememberOAuthReturnTo,
} from '../lib/nativeAuth';
import { subscribeNativeJoinUrls } from '../lib/nativeDeepLink';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; needsEmailConfirm?: boolean }>;
  signInWithOAuth: (provider: AppOAuthProvider) => Promise<{ error: Error | null }>;
  /** Смена / первичная установка пароля (email). currentPassword — если в Dashboard включён Require current password. */
  changePassword: (
    newPassword: string,
    currentPassword?: string,
  ) => Promise<{ error: Error | null }>;
  /** Есть ли у пользователя identity email (пароль можно менять / уже задан). */
  hasEmailPassword: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function errMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err ?? '');
}

function isDeadRefreshTokenError(err: unknown): boolean {
  return /invalid refresh token|refresh token not found|refresh token already used/i.test(
    errMessage(err),
  );
}

function isTransientAuthError(err: unknown): boolean {
  const msg = errMessage(err);
  return /timed out|timeout|AbortError|Failed to fetch|NetworkError|upstream|503|502|504|fetch failed/i.test(
    msg,
  );
}

function isQuotaExceededError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'name' in err && String((err as { name: unknown }).name) === 'QuotaExceededError') {
    return true;
  }
  return /exceeded the quota|QuotaExceeded|setItem.*Storage/i.test(errMessage(err));
}

function mapAuthOpError(err: unknown): Error {
  if (isQuotaExceededError(err)) return storageFullAuthError();
  if (isTransientAuthError(err)) return networkAuthError();
  if (err instanceof Error) return err;
  return new Error(errMessage(err) || 'auth_error');
}

function accessStillFresh(session: Session | null | undefined, skewMs = 20_000): boolean {
  if (!session?.access_token) return false;
  const exp = session.expires_at;
  if (typeof exp !== 'number') return true;
  return exp * 1000 > Date.now() + skewMs;
}

/** Синхронно из localStorage — без auth-lock (если getSession завис на refresh). */
function readStoredAuthSession(): Session | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-[\w-]+-auth-token$/.test(k)) continue;
      const raw = localStorage.getItem(k);
      if (!raw || raw.length < 40) continue;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const s = (parsed?.currentSession ?? parsed?.session ?? parsed) as Session | null;
      if (s?.access_token && s.user?.id) return s;
    }
  } catch {
    /* ignore */
  }
  return null;
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
      /* Не трогать *-auth-token-code-verifier — иначе ломается OAuth PKCE. */
      if (k && /^sb-[\w-]+-auth-token$/.test(k)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch (e) {
    authDebug('wipeAuthStorageKeys error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

function storageProbeOk(bytes = 4096): boolean {
  if (typeof localStorage === 'undefined') return false;
  const probeKey = '__updown_auth_quota_probe__';
  try {
    localStorage.setItem(probeKey, 'x'.repeat(bytes));
    localStorage.removeItem(probeKey);
    return true;
  } catch {
    try {
      localStorage.removeItem(probeKey);
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Перед Google/регистрацией (PKCE пишет code-verifier в localStorage).
 * На Android WebView квота маленькая — аватарки/черновики её забивают.
 */
function freeStoragePressureForAuth(reason: string): void {
  authDebug(`freeStoragePressureForAuth ← ${reason}`, authDebugStorageSnapshot());
  if (typeof localStorage === 'undefined') return;

  const dropExact = [
    'updown_avatar_editor_working_flat',
    'updown_avatar_editor_meta',
    'updown_avatar_pending',
    'updown_avatar_editor_source_photo',
    'updown_avatar_data_url',
    'updown_game_state',
    'updown_unfinished_online',
    '__updown_auth_probe__',
    '__updown_auth_quota_probe__',
  ];
  for (const k of dropExact) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }

  /* Старые PKCE verifier’ы — место под новый */
  try {
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /auth-token-code-verifier/i.test(k)) kill.push(k);
    }
    for (const k of kill) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }

  /* Профиль без data-URL аватарки (самый жирный кусок) */
  try {
    const raw = localStorage.getItem('updown_player_profile');
    if (raw && raw.length > 2000) {
      const p = JSON.parse(raw) as { avatarDataUrl?: string | null; [k: string]: unknown };
      if (p && p.avatarDataUrl) {
        localStorage.setItem(
          'updown_player_profile',
          JSON.stringify({ ...p, avatarDataUrl: null }),
        );
      }
    }
  } catch {
    try {
      localStorage.removeItem('updown_player_profile');
    } catch {
      /* ignore */
    }
  }

  if (storageProbeOk(8192)) {
    authDebugProbeSetItem(`after-free:${reason}`);
    return;
  }

  /* Агрессивно: выкинуть самые большие ключи, кроме живой сессии и мелких prefs */
  try {
    const rows: Array<{ key: string; len: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/^sb-[\w-]+-auth-token$/.test(k)) continue; /* не трогаем access/refresh */
      if (k === 'updown-locale' || k === 'updown_device_id') continue;
      const v = localStorage.getItem(k) ?? '';
      rows.push({ key: k, len: k.length + v.length });
    }
    rows.sort((a, b) => b.len - a.len);
    for (const row of rows) {
      if (storageProbeOk(8192)) break;
      if (row.len < 400) continue;
      try {
        localStorage.removeItem(row.key);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  authDebugProbeSetItem(`after-free-aggressive:${reason}`);
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const configured = isSupabaseConfigured();
  const sessionRef = useRef(session);
  sessionRef.current = session;
  /** Явный выход пользователя — только тогда принимаем SIGNED_OUT «в ноль». */
  const userInitiatedSignOutRef = useRef(false);
  const restoreInFlightRef = useRef(false);
  /** Антилуп: не восстановливать сессию чаще раза в ~90с. */
  const spuriousRestoreUntilRef = useRef(0);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setLoading(false);
      return;
    }
    let settled = false;
    let cancelled = false;
    const deferTimers = new Set<number>();
    authDebug('AuthProvider boot', authDebugStorageSnapshot());
    authDebugProbeSetItem('boot');

    const cachedBoot = readStoredAuthSession();
    /* Даже «протухший» access — сразу в UI; refresh догонит (иначе 1–30с «гость» при живом token). */
    if (cachedBoot?.user?.id) {
      authDebug('session.hydrate from storage', {
        userId: cachedBoot.user.id,
        fresh: accessStillFresh(cachedBoot, -60_000),
      });
      sessionRef.current = cachedBoot;
      setSession(cachedBoot);
      setLoading(false);
      settled = true;
    }

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

    const restoreSpuriousSignOut = (kept: Session) => {
      if (restoreInFlightRef.current) return;
      if (!kept.access_token || !kept.refresh_token) return;
      restoreInFlightRef.current = true;
      void client.auth
        .setSession({
          access_token: kept.access_token,
          refresh_token: kept.refresh_token,
        })
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            authDebug('restore after spurious SIGNED_OUT failed', { message: error.message });
            return;
          }
          if (data.session) finish(data.session, true, 'restore.afterSignedOut');
        })
        .catch((e) => {
          authDebug('restore after spurious SIGNED_OUT threw', {
            error: e instanceof Error ? e.message : String(e),
          });
        })
        .finally(() => {
          restoreInFlightRef.current = false;
        });
    };

    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      authDebug(`onAuthStateChange:${event}`, {
        nextUserId: nextSession?.user?.id ?? null,
        hadSession: !!sessionRef.current,
        userInitiated: userInitiatedSignOutRef.current,
        storage: authDebugStorageSnapshot(),
      });
      if (event !== 'TOKEN_REFRESHED') {
        authDebugProbeSetItem(`auth-event:${event}`);
      }

      /* Ложный SIGNED_OUT после таймаута refresh: access ещё валиден — не выкидывать. */
      if (event === 'SIGNED_OUT') {
        const kept = sessionRef.current;
        const canRestore =
          !userInitiatedSignOutRef.current &&
          accessStillFresh(kept) &&
          Date.now() >= spuriousRestoreUntilRef.current;
        if (canRestore) {
          spuriousRestoreUntilRef.current = Date.now() + 90_000;
          authDebug('KEEP session despite spurious SIGNED_OUT', {
            expires_at: kept?.expires_at ?? null,
          });
          restoreSpuriousSignOut(kept!);
          return;
        }
        userInitiatedSignOutRef.current = false;
        finish(null, true, 'onAuthStateChange:SIGNED_OUT');
        return;
      }

      /* Не обнулять сессию на сбое/таймауте refresh — иначе лаба «сбрасывается» ~каждые 10 мин. */
      if (
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

    const restoreOAuthBackupOnce = async (via: string): Promise<boolean> => {
      const fromLs = readStoredAuthSession();
      if (fromLs?.user?.id) {
        clearOAuthSessionBackup();
        finish(fromLs, true, `storage:${via}`);
        return true;
      }
      const backup = readOAuthSessionBackup({ consume: false });
      if (!backup) return false;
      authDebug(`oauth.backup.restore ← ${via}`);
      try {
        const { data, error } = await withTimeout(
          client.auth.setSession({
            access_token: backup.access_token,
            refresh_token: backup.refresh_token,
          }),
          8_000,
          'oauth.backup.setSession',
        );
        if (cancelled) return false;
        if (error || !data.session) {
          authDebug('oauth.backup.restore failed', { error: error?.message });
          return false;
        }
        clearOAuthSessionBackup();
        finish(data.session, true, `oauth.backup:${via}`);
        return true;
      } catch (e) {
        authDebug('oauth.backup.restore threw', {
          error: e instanceof Error ? e.message : String(e),
        });
        return false;
      }
    };

    void withTimeout(client.auth.getSession(), 6_000, 'getSession')
      .then(async ({ data: { session: next }, error }) => {
        if (cancelled) return;
        if (error) {
          authDebug('getSession error', {
            message: error.message,
            deadRefresh: isDeadRefreshTokenError(error),
            transient: isTransientAuthError(error),
            storage: authDebugStorageSnapshot(),
          });
        }
        /* Сеть/таймаут: не логинимся в ноль — оставляем то, что было / bootTimer. */
        if (error && isTransientAuthError(error)) {
          finish(next ?? readStoredAuthSession() ?? undefined, true, 'getSession.transient');
          return;
        }
        if (error && isDeadRefreshTokenError(error)) {
          freeStoragePressureForAuth('getSession.deadRefresh');
          try {
            const retry = await withTimeout(client.auth.getSession(), 4_000, 'getSession.retry');
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
        if (!next) {
          const fromLs = readStoredAuthSession();
          if (fromLs?.user?.id) {
            clearOAuthSessionBackup();
            finish(fromLs, true, 'getSession.storage');
            return;
          }
          if (await restoreOAuthBackupOnce('getSession')) return;
        } else {
          clearOAuthSessionBackup();
        }
        finish(next, true, 'getSession');
      })
      .catch(async (err) => {
        if (cancelled) return;
        authDebug('getSession catch', {
          error: err instanceof Error ? err.message : String(err),
          deadRefresh: isDeadRefreshTokenError(err),
          transient: isTransientAuthError(err),
        });
        const fromLs = readStoredAuthSession();
        if (fromLs?.user?.id) {
          finish(fromLs, true, 'getSession.catch.storage');
          return;
        }
        if (isTransientAuthError(err) || /timed out/i.test(errMessage(err))) {
          if (await restoreOAuthBackupOnce('getSession.catch')) return;
          finish(undefined, true, 'getSession.catch.transient');
          return;
        }
        if (isDeadRefreshTokenError(err)) {
          freeStoragePressureForAuth('getSession.catch.deadRefresh');
          wipeAuthStorageKeys('getSession.catch.deadRefresh');
          finish(null, true, 'getSession.catch.wipe');
          return;
        }
        if (await restoreOAuthBackupOnce('getSession.catch')) return;
        finish(undefined, true, 'getSession.catch');
      });
    /* Офлайн / LAN-party / висящий refresh: не держим весь UI в loading */
    const bootMs = cachedBoot
      ? Math.max(AUTH_BOOT_OFFLINE_MS, 1_200)
      : shouldSkipCloudBootWait()
        ? AUTH_BOOT_OFFLINE_MS
        : AUTH_BOOT_TIMEOUT_MS;
    if (isBrowserOffline()) {
      try {
        client.auth.stopAutoRefresh();
      } catch {
        /* ignore */
      }
    }
    const bootTimer = window.setTimeout(() => {
      if (cancelled) return;
      if (sessionRef.current) {
        finish(undefined, true, 'bootTimer.already');
        return;
      }
      const fromLs = readStoredAuthSession();
      if (fromLs?.user?.id) {
        finish(fromLs, true, 'bootTimer.storage');
        return;
      }
      void restoreOAuthBackupOnce('bootTimer').then((ok) => {
        if (!ok && !cancelled) finish(undefined, true, 'bootTimer');
      });
    }, bootMs);

    const onOnline = () => {
      try {
        client.auth.startAutoRefresh();
      } catch {
        /* ignore */
      }
    };
    const onOffline = () => {
      try {
        client.auth.stopAutoRefresh();
      } catch {
        /* ignore */
      }
      finish(undefined, true, 'offline.event');
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      clearTimeout(bootTimer);
      for (const id of deferTimers) clearTimeout(id);
      deferTimers.clear();
      subscription.unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  /** APK: возврат с Google / ссылки из письма → updown://auth-callback */
  useEffect(() => {
    return subscribeNativeJoinUrls((url) => {
      if (!isAuthCallbackUrl(url)) return;
      void completeNativeAuthFromUrl(url).then(({ error }) => {
        if (error) {
          authDebug('nativeAuth.callback', { error: error.message });
          return;
        }
        void supabase?.auth.getSession().then(({ data }) => {
          if (data.session) setSession(data.session);
        });
      });
    });
  }, []);

  /** Квитанции вечеринки: flush outbox + bind к аккаунту после входа / online */
  useEffect(() => {
    let cancelled = false;
    const uid = session?.user?.id ?? null;
    const run = async () => {
      try {
        const { flushClaimOutbox, bindPartyClaimsAfterAuth } = await import('../lib/partyClaimCloud');
        const { consumePendingClaimToken } = await import('../game/partyClaim');
        if (cancelled) return;
        await flushClaimOutbox();
        if (cancelled || !uid) return;
        const token = consumePendingClaimToken();
        await bindPartyClaimsAfterAuth({ claimToken: token });
      } catch (e) {
        authDebug('partyClaim.bind', {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    };
    void run();
    const onOnline = () => {
      void run();
    };
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [session?.user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const client = supabase;
    const attempt = async () => client.auth.signInWithPassword({ email, password });

    const run = async (): Promise<{ error: Error | null }> => {
      try {
        /* Старый мёртвый refresh в LS часто ломает первый password grant. */
        wipeAuthStorageKeys('signIn.prep');
        freeStoragePressureForAuth('signIn.prep');
        let first = await attempt();
        if (first.error && isTransientAuthError(first.error)) {
          await new Promise((r) => setTimeout(r, 400));
          first = await attempt();
        }
        if (first.error) return { error: mapAuthOpError(first.error) };
        if (first.data.session) setSession(first.data.session);
        return { error: null };
      } catch (e) {
        if (isTransientAuthError(e)) {
          try {
            const retry = await attempt();
            if (retry.error) return { error: mapAuthOpError(retry.error) };
            if (retry.data.session) setSession(retry.data.session);
            return { error: null };
          } catch (e2) {
            return { error: mapAuthOpError(e2) };
          }
        }
        return { error: mapAuthOpError(e) };
      }
    };

    try {
      return await withTimeout(run(), SUPABASE_AUTH_SIGNIN_BUDGET_MS, 'signIn');
    } catch (e) {
      return { error: mapAuthOpError(e) };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    const client = supabase;
    /** Письмо должно вести на SPA (/play/), не на oauth auth-callback. */
    const emailRedirectTo = getEmailConfirmRedirectTo() || getAuthRedirectTo();
    rememberAuthAppReturn();
    freeStoragePressureForAuth('signUp.prep');
    authDebug('signUp', { emailRedirectTo: emailRedirectTo ?? null });
    const doSignUp = () =>
      client.auth.signUp({
        email,
        password,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });
    const interpret = (data: {
      session: Session | null;
      user: User | null;
    }): { error: Error | null; needsEmailConfirm?: boolean } => {
      /* Supabase: повторная регистрация → user без identities (анти-enumeration). */
      const identities = data.user?.identities;
      if (data.user && Array.isArray(identities) && identities.length === 0) {
        return {
          error: new Error(
            'Этот email уже зарегистрирован. Войдите или восстановите пароль. Если письма не было — войдите через Google/Яндекс.',
          ),
        };
      }
      if (data.session) {
        setSession(data.session);
        return { error: null, needsEmailConfirm: false };
      }
      return { error: null, needsEmailConfirm: true };
    };
    const run = async (): Promise<{ error: Error | null; needsEmailConfirm?: boolean }> => {
      try {
        const first = await doSignUp();
        if (first.error && (isDeadRefreshTokenError(first.error) || isTransientAuthError(first.error))) {
          wipeAuthStorageKeys('signUp.deadRefresh');
          freeStoragePressureForAuth('signUp.retry');
          const retry = await doSignUp();
          if (retry.error) return { error: mapAuthOpError(retry.error) };
          return interpret(retry.data);
        }
        if (first.error) return { error: mapAuthOpError(first.error) };
        return interpret(first.data);
      } catch (e) {
        if (isQuotaExceededError(e)) {
          freeStoragePressureForAuth('signUp.quota');
          try {
            const retry = await doSignUp();
            if (retry.error) return { error: mapAuthOpError(retry.error) };
            return interpret(retry.data);
          } catch (e2) {
            return { error: mapAuthOpError(e2) };
          }
        }
        return { error: mapAuthOpError(e) };
      }
    };
    try {
      return await withTimeout(run(), SUPABASE_AUTH_SIGNIN_BUDGET_MS, 'signUp');
    } catch (e) {
      return { error: mapAuthOpError(e) };
    }
  }, []);

  const signInWithOAuth = useCallback(async (provider: AppOAuthProvider) => {
    if (!supabase) return { error: new Error('Supabase не настроен') };
    /** Стол/лобби до IdP — auth-callback вернёт сюда, не на голую главную. */
    rememberAuthAppReturn();
    /** Только текущий origin — без ухода на up2down.online (VPN). */
    const redirectTo = getAuthRedirectTo();
    rememberOAuthReturnTo(redirectTo);
    freeStoragePressureForAuth('signInWithOAuth.prep');
    if (!storageProbeOk(2048)) {
      freeStoragePressureForAuth('signInWithOAuth.prep2');
    }
    if (!storageProbeOk(1024)) {
      return { error: storageFullAuthError() };
    }
    /** VK ID: свой PKCE+bridge+exchange — GoTrue custom OAuth нестабилен (state / session drop). */
    if (isVkidProvider(provider)) {
      return startVkidDirectOAuth();
    }
    const sbProvider = toSupabaseOAuthProvider(provider);
    const options: Parameters<typeof supabase.auth.signInWithOAuth>[0]['options'] = {
      redirectTo,
      skipBrowserRedirect: true,
    };
    if (isGoogleProvider(provider)) {
      options.queryParams = { prompt: 'select_account' };
    } else if (isYandexProvider(provider)) {
      /** Яндекс: экран согласия + выбор аккаунта (иначе SSO сразу в прошлый). */
      options.queryParams = { force_confirm: 'yes' };
    }

    const openLocalOnly = async (authorizeUrl: string): Promise<{ error: Error | null }> => {
      if (!redirectTo || isNativePlatform()) {
        await openAuthProviderUrl(authorizeUrl);
        return { error: null };
      }
      let urlToOpen = authorizeUrl;
      try {
        const u = new URL(authorizeUrl);
        u.searchParams.set('redirect_to', redirectTo);
        /** Яндекс: попросить согласие и выбор аккаунта (если GoTrue пробросит на IdP). */
        if (isYandexProvider(provider)) {
          u.searchParams.set('force_confirm', 'yes');
        }
        urlToOpen = u.toString();
      } catch {
        /* keep */
      }
      if (!oauthAuthorizeUsesExpectedRedirect(urlToOpen, redirectTo)) {
        return { error: oauthRedirectRejectedError(redirectTo) };
      }
      await openAuthProviderUrl(urlToOpen);
      return { error: null };
    };

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: sbProvider,
        options,
      });
      if (error) {
        if (isQuotaExceededError(error) || isDeadRefreshTokenError(error) || isTransientAuthError(error)) {
          wipeAuthStorageKeys('signInWithOAuth.retry');
          freeStoragePressureForAuth('signInWithOAuth.retry');
          const retry = await supabase.auth.signInWithOAuth({
            provider: sbProvider,
            options,
          });
          if (retry.error) return { error: mapAuthOpError(retry.error) };
          if (retry.data?.url) return openLocalOnly(retry.data.url);
          return { error: retry.error ?? null };
        }
        return { error: mapAuthOpError(error) };
      }
      if (data?.url) return openLocalOnly(data.url);
      return { error: error ?? null };
    } catch (e) {
      if (isQuotaExceededError(e)) {
        freeStoragePressureForAuth('signInWithOAuth.quota');
        return { error: storageFullAuthError() };
      }
      return { error: mapAuthOpError(e) };
    }
  }, []);

  const changePassword = useCallback(
    async (newPassword: string, currentPassword?: string) => {
      const client = supabase;
      if (!client) return { error: new Error('Supabase не настроен') };
      const attrs: {
        password: string;
        current_password?: string;
      } = { password: newPassword };
      const cur = currentPassword?.trim();
      if (cur) attrs.current_password = cur;
      try {
        const { error } = await withTimeout(
          client.auth.updateUser(attrs as Parameters<typeof client.auth.updateUser>[0]),
          SUPABASE_AUTH_SIGNIN_BUDGET_MS,
          'changePassword',
        );
        if (error) return { error: mapAuthOpError(error) };
        return { error: null };
      } catch (e) {
        return { error: mapAuthOpError(e) };
      }
    },
    [],
  );

  const hasEmailPassword = Boolean(
    session?.user?.identities?.some((i) => i.provider === 'email'),
  );

  const signOut = useCallback(async () => {
    authDebug('signOut() explicit', {
      stack: new Error().stack?.split('\n').slice(0, 10),
      storage: authDebugStorageSnapshot(),
    });
    userInitiatedSignOutRef.current = true;
    try {
      clearLocalAccountAvatarCache();
    } catch {
      /* ignore */
    }

    /**
     * UI сразу: иначе await signOut({ local }) через fetchForSupabase
     * может висеть 20–40с+ (кнопка «зависла»).
     * Сеть — best-effort в фоне.
     */
    wipeAuthStorageKeys('signOut.explicit');
    setSession(null);

    if (supabase) {
      const client = supabase;
      void withTimeout(client.auth.signOut({ scope: 'local' }), 2_500, 'signOut.local').catch(
        (e) => {
          authDebug('signOut local skipped', {
            error: e instanceof Error ? e.message : String(e),
          });
        },
      );
      void withTimeout(
        client.auth.signOut({ scope: 'global' }),
        SUPABASE_AUTH_SIGNOUT_TIMEOUT_MS,
        'signOut.global',
      ).catch((e) => {
        authDebug('signOut global skipped', {
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
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
    changePassword,
    hasEmailPassword,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
