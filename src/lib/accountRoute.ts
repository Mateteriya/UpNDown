/** Единый hash-маршрут личного кабинета в SPA. */
export const ACCOUNT_ROUTE_HASH = '#account';

export function accountRouteHref(): string {
  return `/${ACCOUNT_ROUTE_HASH}`;
}

export function isAccountRouteHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return h === '#account' || h === '#lk';
}
