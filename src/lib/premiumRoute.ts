/** Hash-маршрут страницы Premium. */
export const PREMIUM_ROUTE_HASH = '#premium';

export function premiumRouteHref(): string {
  return `/${PREMIUM_ROUTE_HASH}`;
}

export function isPremiumRouteHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return h === '#premium' || h === '#subscription' || h === '#subscribe';
}
