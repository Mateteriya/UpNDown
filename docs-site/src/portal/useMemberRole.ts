import { useCallback, useEffect, useState } from 'react';
import type { TaskOwner } from './types';
import {
  loadMemberRole,
  PORTAL_MEMBER_ROLE_EVENT,
  saveMemberRole,
} from './memberRole';

export function useMemberRole() {
  const [role, setRoleState] = useState<TaskOwner | null>(() => loadMemberRole());

  useEffect(() => {
    const sync = () => setRoleState(loadMemberRole());
    window.addEventListener(PORTAL_MEMBER_ROLE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PORTAL_MEMBER_ROLE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const setRole = useCallback((next: TaskOwner | null) => {
    saveMemberRole(next);
    setRoleState(next);
  }, []);

  return { role, setRole };
}
