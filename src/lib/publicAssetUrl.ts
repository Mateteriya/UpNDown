/**
 * URL файла из `public/` с учётом Vite `base` (`/` или `/play/` для LAN-хоста).
 * Без этого касты/ИИ-аватарки на телефоне бьют в `http://IP/МЕНЮ/…` → 404.
 */
export function publicAssetUrl(path: string): string {
  const baseRaw = (import.meta.env.BASE_URL as string | undefined) || '/';
  const base = baseRaw.endsWith('/') ? baseRaw : `${baseRaw}/`;
  let rel = String(path || '').trim();
  if (rel.startsWith('/')) rel = rel.slice(1);
  const qi = rel.indexOf('?');
  const file = qi >= 0 ? rel.slice(0, qi) : rel;
  const query = qi >= 0 ? rel.slice(qi) : '';
  return `${base}${encodeURI(file)}${query}`;
}
