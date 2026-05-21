import { useEffect, useState } from 'react';

/** ПК-стол (>1024px): крупнее меню профиля и редактор аватарки. */
export const DESKTOP_PROFILE_UI_MQ = '(min-width: 1025px)';

export function useDesktopProfileUi(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DESKTOP_PROFILE_UI_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_PROFILE_UI_MQ);
    const sync = () => setDesktop(mq.matches);
    mq.addEventListener('change', sync);
    sync();
    return () => mq.removeEventListener('change', sync);
  }, []);

  return desktop;
}
