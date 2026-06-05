import { usePortalAuth } from '../contexts/PortalAuthContext';
import { useMemberRole } from '../portal/useMemberRole';
import { OWNER_LABELS, type TaskOwner } from '../portal/types';
import { useState } from 'react';

export function PortalAuthBar() {
  const { user, displayName, configured, loading, signInWithGoogle, signOut } = usePortalAuth();
  const { role, setRole } = useMemberRole();
  const [busy, setBusy] = useState(false);

  if (!configured) {
    return (
      <span className="portal-auth-hint" title="Добавьте VITE_SUPABASE_* в .env.local">
        CRM: Supabase не настроен
      </span>
    );
  }

  if (loading) {
    return <span className="portal-auth-hint">Сессия…</span>;
  }

  if (!user) {
    return (
      <button
        type="button"
        className="btn btn-neon-cyan btn-sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signInWithGoogle();
          setBusy(false);
        }}
      >
        Войти через Google
      </button>
    );
  }

  return (
    <div className="portal-auth-bar">
      <span className="portal-auth-user" title={user.email ?? ''}>
        {displayName}
      </span>
      <select
        className="portal-role-select"
        value={role ?? ''}
        onChange={(e) => {
          const v = e.target.value;
          setRole(v ? (v as TaskOwner) : null);
        }}
        title="Ваша роль для фильтра «Рекомендовано мне»"
        aria-label="Роль в команде"
      >
        <option value="">Роль…</option>
        {(Object.keys(OWNER_LABELS) as TaskOwner[]).map((k) => (
          <option key={k} value={k}>
            {OWNER_LABELS[k]}
          </option>
        ))}
      </select>
      {role && (
        <span className="portal-role-active" title="Активна для вкладки «Рекомендовано мне»">
          {OWNER_LABELS[role]}
        </span>
      )}
      <button type="button" className="btn ghost btn-sm" onClick={() => void signOut()}>
        Выйти
      </button>
    </div>
  );
}
