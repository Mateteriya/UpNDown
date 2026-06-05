import { supabase } from './lib/supabase';
import { portalHomeUrl } from './contexts/PortalAuthContext';

async function run() {
  const hash = window.location.hash;
  if (!hash || !hash.includes('access_token')) {
    window.location.replace(portalHomeUrl());
    return;
  }

  if (!supabase) {
    document.getElementById('err')!.textContent = 'Supabase не настроен (VITE_SUPABASE_*)';
    document.getElementById('err')!.style.display = 'block';
    document.getElementById('link')!.style.display = 'inline';
    return;
  }

  try {
    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token') || '';
    if (!accessToken) throw new Error('Токен не получен');

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;

    window.location.replace(portalHomeUrl());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    document.getElementById('msg')!.textContent = '';
    document.getElementById('err')!.textContent = 'Ошибка: ' + msg;
    document.getElementById('err')!.style.display = 'block';
    document.getElementById('link')!.style.display = 'inline';
  }
}

run();
