/** Hash-маршрут экрана «Рейтинг» (таблица лидеров). */
export const RATING_ROUTE_HASH = '#rating';

export function ratingRouteHref(): string {
  return `/${RATING_ROUTE_HASH}`;
}

export function isRatingRouteHash(hash: string): boolean {
  const h = hash.trim().toLowerCase();
  return h === '#rating' || h === '#leaderboard' || h === '#ratings';
}
