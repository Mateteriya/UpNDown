/**
 * Минимальная страница для возврата с OAuth — обход чёрного экрана на мобильных.
 * Загружает только Supabase, обрабатывает hash, редиректит на главную.
 */

import { supabase } from './lib/supabase';

const COPY = {
  ru: {
    title: 'Вход…',
    finishing: 'Завершение входа…',
    goHome: 'Перейти на главную',
    supabaseOff: 'Supabase не настроен',
    noToken: 'Токен не получен',
    errorPrefix: 'Ошибка: ',
  },
  en: {
    title: 'Signing in…',
    finishing: 'Finishing sign-in…',
    goHome: 'Go to the home page',
    supabaseOff: 'Supabase is not configured',
    noToken: 'No token received',
    errorPrefix: 'Error: ',
  },
} as const;

function readCopy() {
  try {
    return localStorage.getItem('updown-locale') === 'en' ? COPY.en : COPY.ru;
  } catch {
    return COPY.ru;
  }
}

async function run() {
  const copy = readCopy();
  document.documentElement.lang = copy === COPY.en ? 'en' : 'ru';
  document.title = copy.title;
  const msgEl = document.getElementById('msg');
  const errEl = document.getElementById('err');
  const linkEl = document.getElementById('link');
  if (msgEl) msgEl.textContent = copy.finishing;
  if (linkEl) linkEl.textContent = copy.goHome;

  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) {
    window.location.replace('/');
    return;
  }

  if (!supabase) {
    if (errEl) {
      errEl.textContent = copy.supabaseOff;
      errEl.style.display = 'block';
    }
    if (linkEl) linkEl.style.display = 'inline';
    return;
  }

  try {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';

    if (!accessToken) {
      throw new Error(copy.noToken);
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) throw error;

    sessionStorage.setItem('updown_from_oauth_redirect', '1');
    window.location.replace('/');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msgEl) msgEl.textContent = '';
    if (errEl) {
      errEl.textContent = copy.errorPrefix + msg;
      errEl.style.display = 'block';
    }
    if (linkEl) linkEl.style.display = 'inline';
  }
}

run();
