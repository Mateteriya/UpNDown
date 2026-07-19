/** Единый hash-маршрут страницы «Онлайн» (лобби) в SPA. */
export const ONLINE_ROUTE_HASH = '#online';

export function onlineRouteHref(): string {
  return `/${ONLINE_ROUTE_HASH}`;
}

export function isOnlineRouteHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return h === '#online' || h === '#lobby';
}
