/**
 * Главное меню: две гравировки в стекле — луч мира и луч игрока.
 * Не карточка: слой в фоне, капсулы могут лежать поверх.
 */

import { useEffect, useRef, useState } from 'react';
import { getLeaderboard, listPublicWaitingRooms, type LeaderboardRow } from '../lib/onlineGameSupabase';
import { startMenuGlassMagnet } from './menuGlassMagnet';

function shortName(name: string, max = 14): string {
  const t = name.trim() || 'Игрок';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type GlassState = {
  leader: LeaderboardRow | null;
  me: (LeaderboardRow & { rank: number | null }) | null;
  tablesLive: boolean;
};

export function MenuGlassLadder({
  signedIn,
  youName,
  onOpenRating,
}: {
  signedIn: boolean;
  youName: string;
  onOpenRating?: () => void;
}) {
  const [data, setData] = useState<GlassState | null>(null);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLElement | null>(null);
  const driftRef = useRef<HTMLSpanElement | null>(null);
  const etchRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [board, hall] = await Promise.all([
          getLeaderboard(8),
          signedIn
            ? listPublicWaitingRooms(12)
            : Promise.resolve({ ok: false as const, rooms: [] }),
        ]);
        if (cancelled) return;
        const rows = board.ok && Array.isArray(board.rows) ? board.rows : [];
        const me = board.ok ? board.me : null;
        const leader =
          rows.find((r) => Number(r.rank) === 1) ??
          rows[0] ??
          (me && Number(me.rank) === 1 ? me : null);
        setData({
          leader,
          me,
          tablesLive: hall.ok && hall.rooms.length > 0,
        });
      } catch {
        if (!cancelled) {
          setData({ leader: null, me: null, tablesLive: false });
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  useEffect(() => {
    if (!ready) return;
    const drift = driftRef.current;
    const etch = etchRef.current;
    if (!drift || !etch) return;
    return startMenuGlassMagnet({ steer: drift, etch });
  }, [ready]);

  if (!ready) return null;

  const leader = data?.leader ?? null;
  const meRank = data?.me?.rank ?? null;
  const merged = Boolean(signedIn && leader && meRank === 1);
  const inBoard = Boolean(signedIn && meRank != null && meRank > 0);
  const youLabel = data?.me?.display_name?.trim() || youName;
  const guest = !signedIn;
  const worldName = leader ? shortName(leader.display_name) : '—';
  const worldElo = leader ? String(leader.elo) : '—';
  const worldEmpty = !leader;

  const aria = merged && leader
    ? `Рейтинг: вы первое место, ${leader.display_name}, ELO ${leader.elo}`
    : guest
      ? `Рейтинг: лидер ${leader?.display_name ?? 'пока неизвестен'}, вы вне таблицы`
      : `Рейтинг: лидер ${leader?.display_name ?? 'пока неизвестен'}, вы ${inBoard ? `номер ${meRank}` : 'вне таблицы'}`;

  const className = [
    'menu-glass-ladder',
    merged ? 'menu-glass-ladder--merged' : '',
    guest ? 'menu-glass-ladder--guest' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const body = (
    <span className="menu-glass-ladder__drift">
      <span className="menu-glass-ladder__steer" ref={driftRef}>
      <span className="menu-glass-ladder__bulk">
      <span className="menu-glass-ladder__etch" ref={etchRef}>
      <span className="menu-glass-ladder__beam menu-glass-ladder__beam--world">
        <span className="menu-glass-ladder__rank">#1</span>
        {!worldEmpty ? (
          <span className="menu-glass-ladder__star" aria-hidden>
            ✦
          </span>
        ) : null}
        <span className={`menu-glass-ladder__name${worldEmpty ? ' menu-glass-ladder__name--dash' : ''}`}>{worldName}</span>
        {!worldEmpty ? (
          <span className="menu-glass-ladder__star menu-glass-ladder__star--trail" aria-hidden>
            ✦
          </span>
        ) : null}
        <span className={`menu-glass-ladder__elo${worldEmpty ? ' menu-glass-ladder__elo--dash' : ''}`}>{worldElo}</span>
      </span>

      {!merged ? (
        <>
          <span className="menu-glass-ladder__rift" aria-hidden>
            <span className="menu-glass-ladder__tick menu-glass-ladder__tick--dot" />
            <span className="menu-glass-ladder__tick menu-glass-ladder__tick--line" />
            <span className="menu-glass-ladder__tick menu-glass-ladder__tick--dot" />
            <span className="menu-glass-ladder__tick menu-glass-ladder__tick--line-short" />
            <span className="menu-glass-ladder__tick menu-glass-ladder__tick--dot" />
          </span>
          <span className="menu-glass-ladder__beam menu-glass-ladder__beam--you">
            <span className="menu-glass-ladder__rank">{inBoard ? `#${meRank}` : '—'}</span>
            {!guest && youLabel ? (
              <span className="menu-glass-ladder__name">{shortName(youLabel)}</span>
            ) : null}
            {data?.me && !guest ? <span className="menu-glass-ladder__elo">{data.me.elo}</span> : null}
          </span>
        </>
      ) : null}

      <span className="menu-glass-ladder__lamps" aria-hidden>
        <span
          className={`menu-glass-ladder__lamp menu-glass-ladder__lamp--ether${
            !guest && data?.tablesLive ? ' is-on' : ''
          }`}
        />
        <span
          className={`menu-glass-ladder__lamp menu-glass-ladder__lamp--rank${inBoard ? ' is-on' : ''}`}
        />
      </span>
      {onOpenRating ? (
        <span className="menu-glass-ladder__hint" aria-hidden>
          <span className="menu-glass-ladder__hint-kicker">открыть</span>
          <span className="menu-glass-ladder__hint-title">рейтинг</span>
          <span className="menu-glass-ladder__hint-sub">таблица лидеров</span>
        </span>
      ) : null}
      </span>
      </span>
      </span>
    </span>
  );

  if (!onOpenRating) {
    return (
      <div className={className} aria-hidden ref={(el) => { rootRef.current = el; }}>
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onOpenRating}
      aria-label={aria}
      ref={(el) => { rootRef.current = el; }}
    >
      {body}
    </button>
  );
}
