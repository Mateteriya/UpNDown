import type { TaskOwner } from './types';

const STORAGE_KEY = 'upndown-portal-member-role';

export const PORTAL_MEMBER_ROLE_EVENT = 'upndown-portal-member-role-change';

export const PORTAL_MEMBER_ROLES: TaskOwner[] = ['product', 'tech', 'intl', 'legal', 'all'];

export function loadMemberRole(): TaskOwner | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    if (PORTAL_MEMBER_ROLES.includes(raw as TaskOwner)) return raw as TaskOwner;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveMemberRole(role: TaskOwner | null): void {
  if (!role) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, role);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PORTAL_MEMBER_ROLE_EVENT));
  }
}
