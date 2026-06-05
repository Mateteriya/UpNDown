import { usePortalAuth } from '../contexts/PortalAuthContext';

type Props = {
  syncEnabled: boolean;
  syncError: string | null;
};

export function PortalSyncBanner({ syncEnabled, syncError }: Props) {
  const { configured, user, loading } = usePortalAuth();

  if (loading) return null;

  if (syncError) {
    return (
      <div className="portal-sync-banner portal-sync-banner--error" role="alert">
        Ошибка синхронизации: {syncError}
      </div>
    );
  }

  if (configured && !user) {
    return (
      <div className="portal-sync-banner">
        Прогресс сейчас только в этом браузере.{' '}
        <strong>Войдите через Google</strong>, чтобы команда видела «в работе» и готовые задачи.
      </div>
    );
  }

  if (syncEnabled) {
    return (
      <div className="portal-sync-banner portal-sync-banner--ok">
        Общий режим команды: статусы синхронизируются через Supabase.
      </div>
    );
  }

  return null;
}
