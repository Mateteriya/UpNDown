/**
 * Возврат с OAuth (Google/GitHub/Yandex/VK).
 * Лёгкий бандл: без тяжёлого partyClaimCloud на старте (иначе при зависании
 * чанка страница вечно показывает «Завершение входа…» без красной ошибки).
 */

/** LAN http://IP: без crypto.subtle GoTrue уходит в PKCE plain → 404. */
import './lib/polyfillCryptoSubtle';
import { supabase } from './lib/supabase';
import {
  bounceOAuthPayloadToReturnUrl,
  bounceWwwToCanonicalHost,
  getAuthReturnHomePath,
  stashOAuthSessionBackup,
} from './lib/nativeAuth';
import {
  discardParkedAuthTokens,
  restoreParkedAuthTokens,
} from './lib/authTokenPark';
import { consumePendingClaimToken, peekClaimTokenFromUrl, rememberPendingClaimToken } from './game/partyClaim';
import {
  completeVkidDirectOAuthFromUrl,
  isVkidBridgeCallback,
} from './lib/vkidDirectOAuth';

const COPY = {
  ru: {
    title: 'Вход…',
    finishing: 'Завершение входа…',
    goHome: 'Перейти на главную',
    supabaseOff: 'Supabase не настроен',
    noToken: 'Код входа не получен',
    errorPrefix: 'Ошибка: ',
    slowHint: 'Долго нет ответа. Можно открыть главную — если вход прошёл, кабинет уже будет.',
    exchanging: 'Обмен кода входа…',
    emailConfirm: 'Подтверждение email…',
    vkExchanging: 'Обмен VK…',
    supabaseUnreachable:
      'Не удалось связаться с Supabase (*.supabase.co). Из РФ без VPN это бывает. DevTools → Network: красные supabase.co? Временно VPN или https://up2down.online',
  },
  en: {
    title: 'Signing in…',
    finishing: 'Finishing sign-in…',
    goHome: 'Go to the home page',
    supabaseOff: 'Supabase is not configured',
    noToken: 'No sign-in code received',
    errorPrefix: 'Error: ',
    slowHint: 'Taking too long. You can open home — if sign-in worked, you will be in the account.',
    exchanging: 'Exchanging sign-in code…',
    emailConfirm: 'Confirming email…',
    vkExchanging: 'Finishing VK…',
    supabaseUnreachable:
      'Could not reach Supabase (*.supabase.co). Check Network for failed supabase.co. Try VPN or https://up2down.online',
  },
} as const;

type AuthCallbackCopy = (typeof COPY)[keyof typeof COPY];

/** Чуть выше типичного auth refresh timeout — иначе race рвёт обмен. */
const EXCHANGE_MS = 42_000;
const CLAIMS_MS = 2_000;
const HARD_MS = 40_000;

declare global {
  interface Window {
    __updownAuthCbBoot?: () => void;
  }
}

function readCopy(): AuthCallbackCopy {
  try {
    return localStorage.getItem('updown-locale') === 'en' ? COPY.en : COPY.ru;
  } catch {
    return COPY.ru;
  }
}

function setMsg(text: string) {
  const msgEl = document.getElementById('msg');
  if (msgEl) msgEl.textContent = text;
}

function showError(copy: AuthCallbackCopy, msg: string) {
  const msgEl = document.getElementById('msg');
  const errEl = document.getElementById('err');
  const linkEl = document.getElementById('link');
  if (msgEl) msgEl.textContent = '';
  if (errEl) {
    errEl.textContent = copy.errorPrefix + msg;
    errEl.style.display = 'block';
  }
  if (linkEl) linkEl.style.display = 'inline';
  try {
    console.error('[auth-callback]', msg);
  } catch {
    /* ignore */
  }
}

function showLink(copy: AuthCallbackCopy) {
  const linkEl = document.getElementById('link');
  if (linkEl) {
    linkEl.textContent = copy.goHome;
    linkEl.style.display = 'inline';
  }
}

function humanizeAuthError(copy: AuthCallbackCopy, raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : String(raw ?? '');
  if (/failed to fetch|networkerror|load failed|aborted|timed out|timeout|AbortError/i.test(msg)) {
    return `${copy.supabaseUnreachable} (${msg || 'network'})`;
  }
  if (/code verifier|pkce/i.test(msg)) {
    return `${msg} — начните вход снова с https://up2down.ru (Incognito), одна вкладка.`;
  }
  return msg || 'unknown_error';
}

async function raceOrTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<{ ok: true; value: T } | { ok: false; reason: 'timeout' | 'error'; error?: unknown }> {
  let timer = 0;
  try {
    const value = await Promise.race([
      promise.then((v) => ({ kind: 'ok' as const, v })),
      new Promise<{ kind: 'timeout' }>((r) => {
        timer = window.setTimeout(() => r({ kind: 'timeout' }), ms);
      }),
    ]);
    if (value.kind === 'timeout') return { ok: false, reason: 'timeout' };
    return { ok: true, value: value.v };
  } catch (error) {
    return { ok: false, reason: 'error', error };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

async function bindClaimsBestEffort(claimToken: string | null) {
  try {
    const mod = await import('./lib/partyClaimCloud');
    await raceOrTimeout(mod.bindPartyClaimsAfterAuth({ claimToken }), CLAIMS_MS);
  } catch {
    /* вход важнее квитанций */
  }
}

async function run() {
  try {
    window.__updownAuthCbBoot?.();
  } catch {
    /* ignore */
  }

  if (bounceWwwToCanonicalHost()) return;

  const copy = readCopy();
  document.documentElement.lang = copy === COPY.en ? 'en' : 'ru';
  document.title = copy.title;
  setMsg(copy.finishing);
  /* Ссылку «на главную» не показываем сразу — иначе кажется, что вход завис. */

  window.addEventListener('unhandledrejection', (ev) => {
    showError(copy, humanizeAuthError(copy, ev.reason));
  });

  const hardTimer = window.setTimeout(() => {
    setMsg(copy.slowHint);
    showLink(copy);
  }, HARD_MS);

  if (bounceOAuthPayloadToReturnUrl(window.location.href)) {
    window.clearTimeout(hardTimer);
    return;
  }

  const claimFromUrl = peekClaimTokenFromUrl(window.location.href);
  if (claimFromUrl) rememberPendingClaimToken(claimFromUrl);

  const client = supabase;
  if (!client) {
    window.clearTimeout(hardTimer);
    showError(copy, copy.supabaseOff);
    return;
  }

  const url = new URL(window.location.href);
  const errDesc =
    url.searchParams.get('error_description') ||
    url.searchParams.get('error') ||
    '';
  if (errDesc) {
    window.clearTimeout(hardTimer);
    showError(copy, errDesc);
    return;
  }

  if (isVkidBridgeCallback(window.location.href)) {
    setMsg(copy.vkExchanging);
    const vkDone = await raceOrTimeout(
      completeVkidDirectOAuthFromUrl(window.location.href),
      EXCHANGE_MS,
    );
    if (!vkDone.ok) {
      restoreParkedAuthTokens();
      window.clearTimeout(hardTimer);
      showError(
        copy,
        vkDone.reason === 'timeout'
          ? humanizeAuthError(copy, new Error('timeout'))
          : humanizeAuthError(copy, vkDone.error),
      );
      return;
    }
    if (vkDone.value.error) {
      restoreParkedAuthTokens();
      window.clearTimeout(hardTimer);
      showError(copy, humanizeAuthError(copy, vkDone.value.error));
      return;
    }
    /** LAN-мост: сессия собрана на up2down.online → перенос токенов на вечеринку. */
    const hop = vkDone.value.lanHop;
    if (hop) {
      discardParkedAuthTokens();
      window.clearTimeout(hardTimer);
      setMsg(copy.finishing);
      try {
        const dest = new URL(hop.url);
        dest.hash = new URLSearchParams({
          access_token: hop.access_token,
          refresh_token: hop.refresh_token,
          token_type: 'bearer',
          type: 'bearer',
        }).toString();
        window.location.replace(dest.toString());
      } catch (e) {
        showError(copy, humanizeAuthError(copy, e));
      }
      return;
    }
    discardParkedAuthTokens();
    const claimToken = claimFromUrl || consumePendingClaimToken();
    void bindClaimsBestEffort(claimToken);
    window.clearTimeout(hardTimer);
    window.location.replace(getAuthReturnHomePath());
    return;
  }

  const code = url.searchParams.get('code');
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || '';
  const hashType = (hashParams.get('type') || '').toLowerCase();
  if (accessToken && /^(signup|invite|email_change|email)$/.test(hashType)) {
    setMsg(copy.emailConfirm);
  }

  const sessionProbe = async (): Promise<boolean> => {
    const probed = await raceOrTimeout(client.auth.getSession(), 4_000);
    if (!probed.ok) return false;
    return Boolean(probed.value.data.session);
  };

  const storageHasSessionToken = (): boolean => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/^sb-[\w-]+-auth-token$/.test(k)) continue;
        const v = localStorage.getItem(k) || '';
        if (v.length > 40 && /access_token/.test(v)) return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };

  const takeTokens = (
    s: { access_token?: string | null; refresh_token?: string | null } | null | undefined,
  ): { access_token: string; refresh_token: string } | null => {
    if (!s?.access_token || !s.refresh_token) return null;
    return { access_token: s.access_token, refresh_token: s.refresh_token };
  };

  try {
    let tokens: { access_token: string; refresh_token: string } | null = null;
    if (code) {
      setMsg(copy.exchanging);
      /** Один exchange: повтор съедает code-verifier → ложный PKCE error. */
      const exchanged = await raceOrTimeout(
        client.auth.exchangeCodeForSession(code),
        EXCHANGE_MS,
      );
      if (!exchanged.ok) {
        if (!(await sessionProbe()) && !storageHasSessionToken()) {
          if (exchanged.reason === 'timeout') {
            throw new Error(copy.supabaseUnreachable);
          }
          throw exchanged.error instanceof Error
            ? exchanged.error
            : new Error(String(exchanged.error ?? 'exchange_failed'));
        }
      } else if (exchanged.value.error) {
        if (!(await sessionProbe()) && !storageHasSessionToken()) {
          throw exchanged.value.error;
        }
      } else {
        tokens = takeTokens(exchanged.value.data.session);
      }
    } else if (accessToken) {
      setMsg(copy.exchanging);
      const set = await raceOrTimeout(
        client.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
        EXCHANGE_MS,
      );
      if (!set.ok) {
        if (!(await sessionProbe()) && !storageHasSessionToken()) {
          throw set.reason === 'timeout'
            ? new Error(copy.supabaseUnreachable)
            : set.error instanceof Error
              ? set.error
              : new Error(String(set.error ?? 'set_session_failed'));
        }
      } else if (set.value.error) {
        if (!(await sessionProbe()) && !storageHasSessionToken()) {
          throw set.value.error;
        }
      } else {
        tokens =
          takeTokens(set.value.data.session) ||
          (refreshToken
            ? { access_token: accessToken, refresh_token: refreshToken }
            : null);
      }
    } else {
      const q = url.searchParams.toString();
      const hint = q
        ? `Параметры URL: ${q.slice(0, 180)}`
        : 'В адресе нет ?code= и нет #access_token.';
      window.clearTimeout(hardTimer);
      showError(copy, `${copy.noToken}. ${hint}`);
      return;
    }

    /**
     * Есть JWT из exchange → сразу домой (не ждать getSession: на LAN он часто
     * висит, а сессия уже в storage — отсюда «висит auth-callback, но вход есть»).
     */
    if (tokens) {
      stashOAuthSessionBackup(tokens);
    } else {
      const okSession = (await sessionProbe()) || storageHasSessionToken();
      if (!okSession) {
        throw new Error(
          'Код обменяли, но сессия не сохранилась. Попробуйте ещё раз (Incognito) или другой вход (Яндекс/Google).',
        );
      }
    }
    try {
      sessionStorage.setItem('updown_from_oauth_redirect', '1');
    } catch {
      /* ignore */
    }
    const claimToken = claimFromUrl || consumePendingClaimToken();
    void bindClaimsBestEffort(claimToken);
    discardParkedAuthTokens();
    window.clearTimeout(hardTimer);
    setMsg(copy.finishing);
    window.location.replace(getAuthReturnHomePath());
  } catch (e) {
    restoreParkedAuthTokens();
    window.clearTimeout(hardTimer);
    showError(copy, humanizeAuthError(copy, e));
  }
}

void run().catch((e) => {
  const copy = readCopy();
  showError(copy, humanizeAuthError(copy, e));
});
