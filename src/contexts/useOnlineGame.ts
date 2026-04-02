import { useContext } from 'react';
import { OnlineGameContext, type OnlineGameContextValue } from './OnlineGameContext';

/** Отдельный файл — чтобы Vite Fast Refresh не сбрасывал всё приложение при правках провайдера. */
export function useOnlineGame(): OnlineGameContextValue {
  const ctx = useContext(OnlineGameContext);
  if (!ctx) throw new Error('useOnlineGame must be used within OnlineGameProvider');
  return ctx;
}
