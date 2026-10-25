import { loadEnv, type Plugin } from 'vite';

/** Подставляет VITE_SUPABASE_URL в auth-callback.html (inline VK boot без ожидания module). */
export function injectSupabaseUrlHtml(): Plugin {
  let supabaseUrl = '';
  return {
    name: 'inject-supabase-url-html',
    configResolved(config) {
      const env = loadEnv(config.mode, config.envDir, 'VITE_');
      supabaseUrl = (env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
        .trim()
        .replace(/\/$/, '');
    },
    transformIndexHtml(html) {
      return html.replace(/%VITE_SUPABASE_URL%/g, supabaseUrl);
    },
  };
}
