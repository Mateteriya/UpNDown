import type { User } from '@supabase/supabase-js';

/** Короткий ярлык аккаунта для UI (email local-part / meta name). */
export function accountWhoFromUser(user: User | null | undefined): string | null {
  if (!user) return null;
  const email = typeof user.email === 'string' ? user.email.trim() : '';
  if (email) return email.replace(/@.*$/, '') || email;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const full =
    (typeof meta?.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta?.name === 'string' && meta.name.trim()) ||
    '';
  if (full) return full;
  const id = typeof user.id === 'string' ? user.id : '';
  return id ? id.slice(0, 8) : null;
}

export function isUserSignedIn(user: User | null | undefined): boolean {
  return !!(user && typeof user.id === 'string' && user.id.length > 0);
}
