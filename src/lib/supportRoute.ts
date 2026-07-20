/** Hash-маршрут страницы «Поддержать проект» (донаты). */
export const SUPPORT_ROUTE_HASH = '#support';

export function supportRouteHref(): string {
  return `/${SUPPORT_ROUTE_HASH}`;
}

export function isSupportRouteHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return h === '#support' || h === '#donate' || h === '#donations';
}
