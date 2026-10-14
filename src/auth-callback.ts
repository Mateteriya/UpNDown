/**
 * Возврат с OAuth (Google/GitHub/Yandex/VK).
 * Лёгкий бандл: без тяжёлого partyClaimCloud на старте (иначе при зависании
 * чанка страница вечно показывает «Завершение входа…» без красной ошибки).
 */

import { supabase } from './lib/supabase';
import {
  bounceOAuthPayloadToReturnUrl,
  bounceWwwToCanonicalHost,
  getAuthReturnHomePath,
} from './lib/nativeAuth';
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
    vkExchanging: 'Finishing VK…',
    supabaseUnreachable:
      'Could not reach Supabase (*.supabase.co). Check Network for failed supabase.co. Try VPN or https://up2down.online',
  },
} as const;

type AuthCallbackCopy = (typeof COPY)[keyof typeof COPY];

const EXCHANGE_MS = 25_000;
const CLAIMS_MS = 2_000;
const HARD_MS = 18_000;

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
  showLink(copy);

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
      window.clearTimeout(hardTimer);
      showError(copy, humanizeAuthError(copy, vkDone.value.error));
      return;
    }
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

  const sessionProbe = async (): Promise<boolean> => {
    const probed = await raceOrTimeout(client.auth.getSession(), 4_000);
    if (!probed.ok) return false;
    return Boolean(probed.value.data.session);
  };

  try {
    if (code) {
      setMsg(copy.exchanging);
      const exchanged = await raceOrTimeout(
        client.auth.exchangeCodeForSession(code),
        EXCHANGE_MS,
      );
      if (!exchanged.ok) {
        if (!(await sessionProbe())) {
          if (exchanged.reason === 'timeout') {
            throw new Error(copy.supabaseUnreachable);
          }
          throw exchanged.error instanceof Error
            ? exchanged.error
            : new Error(String(exchanged.error ?? 'exchange_failed'));
        }
      } else if (exchanged.value.error) {
        if (!(await sessionProbe())) throw exchanged.value.error;
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
        if (!(await sessionProbe())) {
          throw set.reason === 'timeout'
            ? new Error(copy.supabaseUnreachable)
            : set.error instanceof Error
              ? set.error
              : new Error(String(set.error ?? 'set_session_failed'));
        }
      } else if (set.value.error) {
        if (!(await sessionProbe())) throw set.value.error;
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

    const okSession = await sessionProbe();
    if (!okSession) {
      throw new Error(
        'Код обменяли, но сессия не сохранилась. Попробуйте ещё раз (Incognito) или другой вход (Яндекс/Google).',
      );
    }
    try {
      sessionStorage.setItem('updown_from_oauth_redirect', '1');
    } catch {
      /* ignore */
    }
    const claimToken = claimFromUrl || consumePendingClaimToken();
    void bindClaimsBestEffort(claimToken);
    window.clearTimeout(hardTimer);
    window.location.replace(getAuthReturnHomePath());
  } catch (e) {
    window.clearTimeout(hardTimer);
    showError(copy, humanizeAuthError(copy, e));
  }
}

void run().catch((e) => {
  const copy = readCopy();
  showError(copy, humanizeAuthError(copy, e));
});
