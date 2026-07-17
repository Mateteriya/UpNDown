/** Статус идентичности на главной: гость → локальный профиль → облачный аккаунт. */

export type MenuIdentityStatus = 'guest' | 'profile' | 'account';

const DEFAULT_DISPLAY_NAME = 'Вы';

export function getMenuIdentityStatus(opts: {
  displayName: string;
  avatarDataUrl?: string | null;
  userEmail?: string | null;
}): MenuIdentityStatus {
  if (opts.userEmail?.trim()) return 'account';
  const name = opts.displayName?.trim() || DEFAULT_DISPLAY_NAME;
  const hasPhoto = Boolean(opts.avatarDataUrl && opts.avatarDataUrl.length > 32);
  if (name !== DEFAULT_DISPLAY_NAME || hasPhoto) return 'profile';
  return 'guest';
}

export function menuIdentityStatusLabel(
  status: MenuIdentityStatus,
  userEmail?: string | null,
): string {
  if (status === 'guest') return 'профиль не задан';
  if (status === 'profile') return 'локальный профиль';
  const email = userEmail?.trim();
  if (!email) return 'аккаунт';
  if (email.length <= 22) return email;
  const at = email.indexOf('@');
  if (at > 0 && at <= 10) return `${email.slice(0, at)}@…`;
  return `${email.slice(0, 12)}…`;
}

export const MENU_IDENTITY_STATUS_ARIA: Record<MenuIdentityStatus, string> = {
  guest: 'Гость: профиль и аккаунт не заданы',
  profile: 'Локальный профиль, без входа в аккаунт',
  account: 'Вход в аккаунт выполнен',
};
