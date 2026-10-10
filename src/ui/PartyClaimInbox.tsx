/**
 * ЛК: квитанции партий с других устройств / без сессии — принять или отклонить.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  acceptPartyClaim,
  listMyPartyClaims,
  rejectPartyClaim,
  type CloudPartyClaimRow,
} from '../lib/partyClaimCloud';
import { getLocale, useT } from '../i18n';

function cardLines(row: CloudPartyClaimRow): { title: string; you: string; table: string } {
  const locale = getLocale() === 'en' ? 'en' : 'ru';
  const viewer = (row.payload as { viewer?: Record<string, unknown> } | null)?.viewer;
  const d = new Date(row.finished_at);
  const when = Number.isFinite(d.getTime())
    ? d.toLocaleString(locale === 'en' ? 'en-GB' : 'ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : row.finished_at;
  const shortKey = String(row.match_key || '').replace(/^room:/, '').slice(0, 8);
  const title = locale === 'en' ? `${when} · key ${shortKey}…` : `${when} · ключ ${shortKey}…`;
  if (!viewer) return { title, you: '—', table: '—' };
  const place = Number(viewer.humanPlace) || 0;
  const score = Number(viewer.humanScore) || 0;
  const chips = Number(viewer.humanChips) || 0;
  const acc = Number(viewer.humanBidAccuracyPct) || 0;
  const you =
    locale === 'en'
      ? `You: place ${place} · ${score} pts · ${chips >= 0 ? '+' : ''}${chips} chips · bid ${acc}%`
      : `Вы: ${place}-е · ${score} очк. · ${chips >= 0 ? '+' : ''}${chips} фиш. · точн. ${acc}%`;
  const players = Array.isArray(viewer.players) ? viewer.players : [];
  const table = [...players]
    .sort((a, b) => Number((a as { place?: number }).place) - Number((b as { place?: number }).place))
    .map((p) => {
      const row = p as { name?: string; score?: number };
      return `${row.name ?? '?'} ${row.score ?? 0}`;
    })
    .join(' · ');
  return { title, you, table };
}

export function PartyClaimInbox() {
  const t = useT();
  const { user, configured } = useAuth();
  const [rows, setRows] = useState<CloudPartyClaimRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user?.id || !configured) {
      setRows([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await listMyPartyClaims();
      if (!res.ok) setErr(res.error ?? 'error');
      setRows(
        (res.rows || []).filter((r) => r.status === 'pending' || r.status === 'bound'),
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, configured]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!user?.id || !configured) return null;

  const onAccept = async (id: string) => {
    setBusyId(id);
    try {
      const r = await acceptPartyClaim(id);
      if (!r.ok) setErr(r.error ?? 'accept failed');
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  const onReject = async (id: string) => {
    setBusyId(id);
    try {
      const r = await rejectPartyClaim(id);
      if (!r.ok) setErr(r.error ?? 'reject failed');
      await reload();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="party-claim-inbox" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>{t('partyClaim.lkTitle')}</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
        {t('partyClaim.lkHint')}
      </p>
      {loading && <p style={{ fontSize: 13, color: '#64748b' }}>{t('common.loading')}</p>}
      {err && (
        <p style={{ fontSize: 12, color: '#f87171' }} role="alert">
          {err}
        </p>
      )}
      {!loading && rows.length === 0 && (
        <p style={{ fontSize: 13, color: '#64748b' }}>{t('partyClaim.lkEmpty')}</p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row) => {
          const lines = cardLines(row);
          return (
            <li
              key={row.id}
              style={{
                border: '1px solid rgba(148,163,184,0.25)',
                borderRadius: 12,
                padding: '12px 14px',
                background: 'rgba(15,23,42,0.45)',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{lines.title}</div>
              <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 2 }}>{lines.you}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>{lines.table}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="cosmic-glass-btn"
                  disabled={busyId === row.id}
                  onClick={() => void onAccept(row.id)}
                >
                  {t('partyClaim.lkAccept')}
                </button>
                <button
                  type="button"
                  className="cosmic-glass-btn"
                  disabled={busyId === row.id}
                  onClick={() => void onReject(row.id)}
                  style={{ opacity: 0.85 }}
                >
                  {t('partyClaim.lkReject')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
