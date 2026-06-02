/** Публичный адрес портала (GitHub Pages). */
export const PORTAL_PUBLIC_ORIGIN = 'https://mateteriya.github.io/UpNDown';

/** Ссылка для sharing (#/roadmap, #/app/ws, …). */
export function portalShareUrl(hashPath = '/'): string {
  if (hashPath === '/' || hashPath === '') return `${PORTAL_PUBLIC_ORIGIN}/#/`;
  const path = hashPath.startsWith('/') ? hashPath : `/${hashPath}`;
  return `${PORTAL_PUBLIC_ORIGIN}/#${path}`;
}
