/**
 * Минимальная страница для возврата с OAuth — обход чёрного экрана на мобильных.
 * Загружает только Supabase, обрабатывает hash, редиректит на главную.
 */

import { supabase } from './lib/supabase';

async function run() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) {
    window.location.replace('/');
    return;
  }

  if (!supabase) {
    document.getElementById('err')!.textContent = 'Supabase не настроен';
    document.getElementById('err')!.style.display = 'block';
    document.getElementById('link')!.style.display = 'inline';
    return;
  }

  try {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';

    if (!accessToken) {
      throw new Error('Токен не получен');
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
    document.getElementById('msg')!.textContent = '';
    document.getElementById('err')!.textContent = 'Ошибка: ' + msg;
    document.getElementById('err')!.style.display = 'block';
    document.getElementById('link')!.style.display = 'inline';
  }
}

run();
