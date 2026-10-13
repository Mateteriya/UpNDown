/**
 * Возврат с OAuth (Google/GitHub/Yandex).
 * PKCE: ?code=… → exchangeCodeForSession
 * Legacy implicit: #access_token=… → setSession
 */

import { supabase } from './lib/supabase';
import { bounceOAuthPayloadToReturnUrl, getAuthReturnHomePath } from './lib/nativeAuth';
import { consumePendingClaimToken, peekClaimTokenFromUrl, rememberPendingClaimToken } from './game/partyClaim';
import { bindPartyClaimsAfterAuth } from './lib/partyClaimCloud';

const COPY = {
  ru: {
    title: 'Вход…',
    finishing: 'Завершение входа…',
    goHome: 'Перейти на главную',
    supabaseOff: 'Supabase не настроен',
    noToken: 'Код входа не получен',
    errorPrefix: 'Ошибка: ',
    slowHint: 'Долго нет ответа. Можно открыть главную — если вход прошёл, кабинет уже будет.',
  },
  en: {
    title: 'Signing in…',
    finishing: 'Finishing sign-in…',
    goHome: 'Go to the home page',
    supabaseOff: 'Supabase is not configured',
    noToken: 'No sign-in code received',
    errorPrefix: 'Error: ',
    slowHint: 'Taking too long. You can open home — if sign-in worked, you will be in the account.',
  },
} as const;

const EXCHANGE_MS = 25_000;
const CLAIMS_MS = 2_000;
const HARD_MS = 30_000;

function readCopy() {
  try {
    return localStorage.getItem('updown-locale') === 'en' ? COPY.en : COPY.ru;
  } catch {
    return COPY.ru;
  }
}

function showError(copy: (typeof COPY)['ru'], msg: string) {
  const msgEl = document.getElementById('msg');
  const errEl = document.getElementById('err');
  const linkEl = document.getElementById('link');
  if (msgEl) msgEl.textContent = '';
  if (errEl) {
    errEl.textContent = copy.errorPrefix + msg;
    errEl.style.display = 'block';
  }
  if (linkEl) linkEl.style.display = 'inline';
}

function showLink(copy: (typeof COPY)['ru']) {
  const linkEl = document.getElementById('link');
  if (linkEl) {
    linkEl.textContent = copy.goHome;
    linkEl.style.display = 'inline';
  }
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

async function run() {
  const copy = readCopy();
  document.documentElement.lang = copy === COPY.en ? 'en' : 'ru';
  document.title = copy.title;
  const msgEl = document.getElementById('msg');
  if (msgEl) msgEl.textContent = copy.finishing;
  showLink(copy);

  const hardTimer = window.setTimeout(() => {
    if (msgEl) msgEl.textContent = copy.slowHint;
    showLink(copy);
  }, HARD_MS);

  /**
   * Прод-мост: Google вернул code сюда (Site URL allowlisted),
   * а PKCE verifier — на LAN. Сразу уводим на локальный auth-callback с тем же code.
   */
  if (bounceOAuthPayloadToReturnUrl(window.location.href)) {
    window.clearTimeout(hardTimer);
    return;
  }

  const claimFromUrl = peekClaimTokenFromUrl(window.location.href);
  if (claimFromUrl) rememberPendingClaimToken(claimFromUrl);

  if (!supabase) {
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

  const code = url.searchParams.get('code');
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token') || '';

  const sessionProbe = async (): Promise<boolean> => {
    const probed = await raceOrTimeout(supabase.auth.getSession(), 4_000);
    if (!probed.ok) return false;
    return Boolean(probed.value.data.session);
  };

  try {
    if (code) {
      const exchanged = await raceOrTimeout(
        supabase.auth.exchangeCodeForSession(code),
        EXCHANGE_MS,
      );
      if (!exchanged.ok) {
        if (!(await sessionProbe())) {
          if (exchanged.reason === 'timeout') {
            throw new Error(
              'Обмен кода входа превысил время ожидания. Откройте главную и попробуйте ещё раз.',
            );
          }
          throw exchanged.error instanceof Error
            ? exchanged.error
            : new Error(String(exchanged.error ?? 'exchange_failed'));
        }
      } else if (exchanged.value.error) {
        if (!(await sessionProbe())) throw exchanged.value.error;
      }
    } else if (accessToken) {
      const set = await raceOrTimeout(
        supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        }),
        EXCHANGE_MS,
      );
      if (!set.ok) {
        if (!(await sessionProbe())) {
          throw set.reason === 'timeout'
            ? new Error('Сохранение сессии превысило время ожидания.')
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

    /** Только если сессия реально есть — иначе «успешный вход» на главной врёт. */
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
    /** Не блокировать редирект на RPC (REST timeout до 70с). */
    void raceOrTimeout(bindPartyClaimsAfterAuth({ claimToken }), CLAIMS_MS);
    window.clearTimeout(hardTimer);
    window.location.replace(getAuthReturnHomePath());
  } catch (e) {
    window.clearTimeout(hardTimer);
    const msg = e instanceof Error ? e.message : String(e);
    showError(copy, msg);
  }
}

void run();
