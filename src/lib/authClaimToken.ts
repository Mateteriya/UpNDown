/**
 * Лёгкие хелперы claim-токена для auth-callback.
 * Не импортировать partyClaim.ts сюда — иначе в бандл callback уезжает GameEngine (~200KB+)
 * и на медленной сети страница «висит» до любого VK exchange.
 */

const CLAIM_TOKEN_PENDING_KEY = 'updown_party_claim_pending_token';

export function rememberPendingClaimToken(token: string): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(CLAIM_TOKEN_PENDING_KEY, token);
  } catch {
    /* ignore */
  }
}

export function consumePendingClaimToken(): string | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const t = sessionStorage.getItem(CLAIM_TOKEN_PENDING_KEY)?.trim() || null;
    if (t) sessionStorage.removeItem(CLAIM_TOKEN_PENDING_KEY);
    return t;
  } catch {
    return null;
  }
}

export function peekClaimTokenFromUrl(href: string): string | null {
  try {
    const u = new URL(href);
    return (
      u.searchParams.get('ud_claim')?.trim() ||
      u.searchParams.get('claim')?.trim() ||
      null
    );
  } catch {
    return null;
  }
}
