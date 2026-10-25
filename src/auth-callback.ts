/**
 * Возврат с OAuth (Google/GitHub/Yandex/VK).
 * VK bridge: сначала лёгкий vkBridgeBoot (fetch exchange + hop) — без supabase (~200KB),
 * иначе на медленной сети вечно «Завершение входа…» до любого обмена.
 */

import './lib/polyfillCryptoSubtle';
import {
  discardParkedAuthTokens,
  restoreParkedAuthTokens,
} from './lib/authTokenPark';
import {
  consumePendingClaimToken,
  peekClaimTokenFromUrl,
  rememberPendingClaimToken,
} from './lib/authClaimToken';

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

const EXCHANGE_MS = 28_000;
const VK_EXCHANGE_MS = 22_000;
const CLAIMS_MS = 2_000;
const HARD_MS = 28_000;

type VkBridgeInlineState =
  | { status: 'skip' }
  | { status: 'pending' }
  | { status: 'done'; kind: 'hop'; url: string }
  | { status: 'done'; kind: 'session'; access_token: string; refresh_token: string }
  | { status: 'done'; kind: 'error'; message: string };

declare global {
  interface Window {
    __updownAuthCbBoot?: () => void;
    __updownVkBridgeInline?: VkBridgeInlineState;
  }
}

function waitVkBridgeInline(ms: number): Promise<VkBridgeInlineState | null> {
  const cur = window.__updownVkBridgeInline;
  if (!cur || cur.status === 'skip') return Promise.resolve(null);
  if (cur.status === 'done') return Promise.resolve(cur);
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: VkBridgeInlineState | null) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      window.removeEventListener('updown-vk-bridge-inline', onEvt);
      resolve(v);
    };
    const onEvt = () => {
      const s = window.__updownVkBridgeInline;
      if (s && s.status === 'done') finish(s);
    };
    const timer = window.setTimeout(() => {
      const s = window.__updownVkBridgeInline;
      finish(s && s.status === 'done' ? s : null);
    }, ms);
    window.addEventListener('updown-vk-bridge-inline', onEvt);
  });
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
    return `${msg} — начните вход снова с одной вкладки (Incognito).`;
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

function bounceWwwInline(): boolean {
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

function isVkBridgeUrl(href: string): boolean {
  try {
    return new URL(href).searchParams.get('vk_bridge') === '1';
  } catch {
    return false;
  }
}

async function run() {
  try {
    window.__updownAuthCbBoot?.();
  } catch {
    /* ignore */
  }

  if (bounceWwwInline()) return;

  const copy = readCopy();
  document.documentElement.lang = copy === COPY.en ? 'en' : 'ru';
  document.title = copy.title;
  setMsg(copy.finishing);

  window.addEventListener('unhandledrejection', (ev) => {
    showError(copy, humanizeAuthError(copy, ev.reason));
  });

  const hardTimer = window.setTimeout(() => {
    setMsg(copy.slowHint);
    showLink(copy);
  }, HARD_MS);

  /**
   * VK: сначала результат inline-скрипта в HTML (без ожидания auth-callback.js ~19с),
   * иначе лёгкий vkBridgeBoot (fetch, без supabase).
   */
  if (isVkBridgeUrl(window.location.href)) {
    setMsg(copy.vkExchanging);
    let r:
      | { kind: 'hop'; url: string }
      | { kind: 'session'; access_token: string; refresh_token: string }
      | { kind: 'error'; message: string }
      | { kind: 'skip' }
      | null = null;

    const inline = await waitVkBridgeInline(VK_EXCHANGE_MS);
    if (inline && inline.status === 'done') {
      if (inline.kind === 'hop') {
        /* уже location.replace в HTML; на всякий случай */
        window.clearTimeout(hardTimer);
        return;
      }
      if (inline.kind === 'error') {
        restoreParkedAuthTokens();
        window.clearTimeout(hardTimer);
        showError(copy, inline.message);
        return;
      }
      if (inline.kind === 'session') {
        r = {
          kind: 'session',
          access_token: inline.access_token,
          refresh_token: inline.refresh_token,
        };
      }
    } else if (!inline || inline.status === 'skip') {
      const bootMod = await import('./lib/vkBridgeBoot');
      const vkDone = await raceOrTimeout(bootMod.runVkBridgeBoot(window.location.href), VK_EXCHANGE_MS);
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
      r = vkDone.value;
    } else {
      restoreParkedAuthTokens();
      window.clearTimeout(hardTimer);
      showError(copy, humanizeAuthError(copy, new Error('timeout')));
      return;
    }

    if (!r || r.kind === 'skip') {
      /* fall through to generic OAuth */
    } else if (r.kind === 'error') {
      restoreParkedAuthTokens();
      window.clearTimeout(hardTimer);
      showError(copy, r.message);
      return;
    } else if (r.kind === 'hop') {
      discardParkedAuthTokens();
      window.clearTimeout(hardTimer);
      setMsg(copy.finishing);
      window.location.replace(r.url);
      return;
    } else if (r.kind === 'session') {
      const { supabase } = await import('./lib/supabase');
      const { getAuthReturnHomePath, stashOAuthSessionBackup } = await import('./lib/nativeAuth');
      if (!supabase) {
        window.clearTimeout(hardTimer);
        showError(copy, copy.supabaseOff);
        return;
      }
      const set = await raceOrTimeout(
        supabase.auth.setSession({
          access_token: r.access_token,
          refresh_token: r.refresh_token,
        }),
        12_000,
      );
      if (!set.ok || set.value.error) {
        restoreParkedAuthTokens();
        window.clearTimeout(hardTimer);
        showError(
          copy,
          humanizeAuthError(
            copy,
            !set.ok
              ? set.reason === 'timeout'
                ? new Error('timeout')
                : set.error
              : set.value.error,
          ),
        );
        return;
      }
      stashOAuthSessionBackup({
        access_token: r.access_token,
        refresh_token: r.refresh_token,
      });
      try {
        sessionStorage.setItem('updown_from_oauth_redirect', '1');
      } catch {
        /* ignore */
      }
      const claimFromUrl = peekClaimTokenFromUrl(window.location.href);
      if (claimFromUrl) rememberPendingClaimToken(claimFromUrl);
      void bindClaimsBestEffort(claimFromUrl || consumePendingClaimToken());
      discardParkedAuthTokens();
      window.clearTimeout(hardTimer);
      window.location.replace(getAuthReturnHomePath());
      return;
    }
  }

  const {
    bounceOAuthPayloadToReturnUrl,
    getAuthReturnHomePath,
    stashOAuthSessionBackup,
  } = await import('./lib/nativeAuth');
  const { supabase } = await import('./lib/supabase');

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
    url.searchParams.get('error_description') || url.searchParams.get('error') || '';
  if (errDesc) {
    window.clearTimeout(hardTimer);
    showError(copy, errDesc);
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
      const exchanged = await raceOrTimeout(client.auth.exchangeCodeForSession(code), EXCHANGE_MS);
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

run().catch((e) => {
  const copy = readCopy();
  showError(copy, humanizeAuthError(copy, e));
});
