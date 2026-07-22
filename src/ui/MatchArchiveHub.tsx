/**
 * Хаб «Мои партии»: лента (локальный архив ∪ облако) + деталь с таблицей раздач.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  getPartyArchive,
  getPartyArchiveById,
  type PartyArchiveRecord,
} from '../game/partyArchive';
import { SETTLEMENT_MODE_LABELS, type SettlementMode } from '../game/partySettlement';
import type { DealResult } from '../game/GameEngine';
import { hasSavedGame } from '../game/persistence';
import {
  getMatchDetail,
  getMyMatchHistory,
  type MatchDetail,
  type MatchHistoryItem,
} from '../lib/onlineGameSupabase';
import { chipColor } from './DealResultsSettlement';

export type MatchArchiveFilter = 'all' | 'cloud' | 'local' | 'online' | 'offline';

export type MatchArchiveHubProps = {
  userId: string | null;
  configured: boolean;
  /** Прокрутить к ленте / открыть деталь */
  focus?: 'matches' | null;
  onContinueOffline?: () => void;
};

type FeedRow =
  | { key: string; at: string; kind: 'cloud'; cloud: MatchHistoryItem }
  | { key: string; at: string; kind: 'local'; local: PartyArchiveRecord };

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function modeLabel(mode: SettlementMode | string | null | undefined): string {
  if (!mode) return '';
  if (mode in SETTLEMENT_MODE_LABELS) {
    return SETTLEMENT_MODE_LABELS[mode as SettlementMode];
  }
  return String(mode);
}

function DealHistoryTable({
  deals,
  playerNames,
}: {
  deals: DealResult[];
  playerNames: string[];
}) {
  if (!deals.length) {
    return <p className="lk-archive__empty">Срез раздач недоступен для этой записи.</p>;
  }
  const cols = Math.max(playerNames.length, deals[0]?.bids?.length ?? 0, 1);
  const names = Array.from({ length: cols }, (_, i) => playerNames[i] ?? `Игрок ${i + 1}`);
  return (
    <div className="lk-archive__deals-block">
      <div className="lk-archive__deals-legend" aria-hidden="true">
        заказ / взятки · очки
      </div>
      <div className="lk-archive__deals-wrap">
        <table className="lk-archive__deals">
          <thead>
            <tr>
              <th scope="col">№</th>
              {names.map((n) => (
                <th key={n} scope="col">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.dealNumber}>
                <td className="lk-archive__deals-num">{d.dealNumber}</td>
                {names.map((_, i) => {
                  const bid = d.bids[i];
                  const taken = d.takens?.[i];
                  const pts = d.points[i];
                  const bidStr = bid == null ? '—' : String(bid);
                  const takenStr = taken == null ? '—' : String(taken);
                  const ptsStr = pts == null ? '—' : `${pts >= 0 ? '+' : ''}${pts}`;
                  return (
                    <td key={i}>
                      <span className="lk-archive__cell-main">
                        {bidStr}/{takenStr}
                      </span>
                      <span className="lk-archive__cell-pts">{ptsStr}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function MatchArchiveHub({
  userId,
  configured,
  focus,
  onContinueOffline,
}: MatchArchiveHubProps) {
  const [filter, setFilter] = useState<MatchArchiveFilter>('all');
  const [localRows, setLocalRows] = useState<PartyArchiveRecord[]>([]);
  const [cloudRows, setCloudRows] = useState<MatchHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [cloudDetail, setCloudDetail] = useState<MatchDetail | null>(null);
  const [localDetail, setLocalDetail] = useState<PartyArchiveRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const offlineSaved = hasSavedGame();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const local = await getPartyArchive(undefined, 80);
        let cloud: MatchHistoryItem[] = [];
        if (configured && userId) {
          cloud = await getMyMatchHistory(userId, 80);
        }
        if (!cancelled) {
          setLocalRows(local);
          setCloudRows(configured && userId ? cloud : []);
        }
      } catch {
        if (!cancelled) {
          setLocalRows([]);
          setCloudRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, userId]);

  useEffect(() => {
    if (focus === 'matches') {
      document.getElementById('lk-archive-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focus]);

  const feed: FeedRow[] = useMemo(() => {
    const rows: FeedRow[] = [];
    const cloudIds = new Set((cloudRows ?? []).map((c) => c.id));
    for (const c of cloudRows ?? []) {
      rows.push({ key: `cloud:${c.id}`, at: c.finished_at, kind: 'cloud', cloud: c });
    }
    for (const loc of localRows) {
      if (loc.cloudMatchId && cloudIds.has(loc.cloudMatchId)) continue;
      rows.push({ key: `local:${loc.id}`, at: loc.finishedAt, kind: 'local', local: loc });
    }
    rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return rows.filter((row) => {
      if (filter === 'all') return true;
      if (filter === 'cloud') return row.kind === 'cloud';
      if (filter === 'local') return row.kind === 'local';
      if (filter === 'online') {
        return row.kind === 'cloud' ? !row.cloud.is_offline : row.local.source === 'online';
      }
      if (filter === 'offline') {
        return row.kind === 'cloud' ? row.cloud.is_offline : row.local.source === 'offline';
      }
      return true;
    });
  }, [cloudRows, localRows, filter]);

  const openDetail = async (row: FeedRow) => {
    setDetailKey(row.key);
    setDetailLoading(true);
    setCloudDetail(null);
    setLocalDetail(null);
    try {
      if (row.kind === 'local') {
        const full = (await getPartyArchiveById(row.local.id)) ?? row.local;
        setLocalDetail(full);
      } else if (userId) {
        const d = await getMatchDetail(row.cloud.id, userId);
        setCloudDetail(d);
        if (!d?.deal_history?.length) {
          const localHit = localRows.find(
            (l) => l.cloudMatchId === row.cloud.id || Math.abs(Date.parse(l.finishedAt) - Date.parse(row.cloud.finished_at)) < 120_000,
          );
          if (localHit) setLocalDetail(localHit);
        }
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailKey(null);
    setCloudDetail(null);
    setLocalDetail(null);
  };

  const filters: { id: MatchArchiveFilter; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'offline', label: 'Офлайн' },
    { id: 'online', label: 'Онлайн' },
    { id: 'cloud', label: 'Облако' },
    { id: 'local', label: 'Устройство' },
  ];

  return (
    <section className="lk-archive" id="lk-archive-hub" aria-labelledby="lk-archive-title">
      <header className="lk-archive__head">
        <h2 id="lk-archive-title" className="lk-archive__title">
          Мои партии
        </h2>
        <p className="lk-archive__hint">
          Облако хранит онлайн (и офлайн под логином). На устройстве — полный срез с раздачами после
          этой версии. Рейтинг — по очкам.
        </p>
      </header>

      {offlineSaved && onContinueOffline ? (
        <div className="lk-archive__resume">
          <div>
            <span className="lk-archive__resume-title">Незавершённая офлайн-партия</span>
            <span className="lk-archive__resume-sub">Есть сохранение на этом устройстве</span>
          </div>
          <button type="button" className="lk-archive__btn" onClick={onContinueOffline}>
            Продолжить
          </button>
        </div>
      ) : null}

      <div className="lk-archive__filters" role="tablist" aria-label="Фильтр партий">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            className={`lk-archive__filter${filter === f.id ? ' lk-archive__filter--on' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="lk-archive__layout">
        <div className="lk-archive__list" role="list">
          {loading ? (
            <p className="lk-archive__empty">Загрузка…</p>
          ) : feed.length === 0 ? (
            <p className="lk-archive__empty">
              Пока пусто. Завершите партию — запись появится здесь
              {configured && userId ? ' и в облаке под вашим логином' : ''}.
            </p>
          ) : (
            feed.map((row) => {
              const selected = detailKey === row.key;
              if (row.kind === 'cloud') {
                const c = row.cloud;
                const score =
                  c.final_score != null ? `${c.final_score >= 0 ? '+' : ''}${c.final_score}` : '—';
                return (
                  <button
                    key={row.key}
                    type="button"
                    role="listitem"
                    className={`lk-archive__row${selected ? ' lk-archive__row--on' : ''}`}
                    onClick={() => void openDetail(row)}
                  >
                    <span className="lk-archive__row-top">
                      <span className="lk-archive__row-when">{formatWhen(c.finished_at)}</span>
                      <span className="lk-archive__tags">
                        <span className={`lk-archive__tag lk-archive__tag--${c.is_offline ? 'offline' : 'online'}`}>
                          {c.is_offline ? 'офлайн' : 'онлайн'}
                        </span>
                        <span className="lk-archive__tag lk-archive__tag--cloud">облако</span>
                      </span>
                    </span>
                    <span className="lk-archive__row-body">
                      <strong className="lk-archive__place">
                        {c.place != null ? `${c.place} место` : '—'}
                      </strong>
                      <span className="lk-archive__sep">·</span>
                      <span>{score} очк.</span>
                      {c.chips != null ? (
                        <>
                          <span className="lk-archive__sep">·</span>
                          <span style={{ color: chipColor(c.chips) }}>
                            {c.chips >= 0 ? '+' : ''}
                            {c.chips} фиш.
                          </span>
                        </>
                      ) : null}
                    </span>
                  </button>
                );
              }
              const loc = row.local;
              return (
                <button
                  key={row.key}
                  type="button"
                  role="listitem"
                  className={`lk-archive__row${selected ? ' lk-archive__row--on' : ''}`}
                  onClick={() => void openDetail(row)}
                >
                  <span className="lk-archive__row-top">
                    <span className="lk-archive__row-when">{formatWhen(loc.finishedAt)}</span>
                    <span className="lk-archive__tags">
                      <span
                        className={`lk-archive__tag lk-archive__tag--${loc.source === 'online' ? 'online' : 'offline'}`}
                      >
                        {loc.source === 'online' ? 'онлайн' : 'офлайн'}
                      </span>
                      <span className="lk-archive__tag lk-archive__tag--device">устройство</span>
                    </span>
                  </span>
                  <span className="lk-archive__row-body">
                    <strong className="lk-archive__place">{loc.humanPlace} место</strong>
                    <span className="lk-archive__sep">·</span>
                    <span>
                      {loc.humanScore >= 0 ? '+' : ''}
                      {loc.humanScore} очк.
                    </span>
                    <span className="lk-archive__sep">·</span>
                    <span style={{ color: chipColor(loc.humanChips) }}>
                      {loc.humanChips >= 0 ? '+' : ''}
                      {loc.humanChips} фиш.
                    </span>
                    {loc.humanWon ? (
                      <>
                        <span className="lk-archive__sep">·</span>
                        <span className="lk-archive__win">победа</span>
                      </>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="lk-archive__detail" aria-live="polite">
          {!detailKey ? (
            <p className="lk-archive__empty">Выберите партию, чтобы открыть итог и раздачи.</p>
          ) : detailLoading ? (
            <p className="lk-archive__empty">Загрузка детали…</p>
          ) : cloudDetail ? (
            <div className="lk-archive__detail-inner">
              <div className="lk-archive__detail-top">
                <h3 className="lk-archive__detail-title">
                  {cloudDetail.is_offline ? 'Офлайн' : 'Онлайн'} · {cloudDetail.code}
                </h3>
                <button type="button" className="lk-archive__btn lk-archive__btn--ghost" onClick={closeDetail}>
                  Закрыть
                </button>
              </div>
              <p className="lk-archive__detail-meta">
                {formatWhen(cloudDetail.finished_at)}
                {cloudDetail.settlement_mode
                  ? ` · ${modeLabel(cloudDetail.settlement_mode)}`
                  : ''}
                {cloudDetail.my_place != null ? ` · ваше место ${cloudDetail.my_place}` : ''}
                {cloudDetail.my_final_score != null
                  ? ` · ${cloudDetail.my_final_score >= 0 ? '+' : ''}${cloudDetail.my_final_score} очк.`
                  : ''}
                {cloudDetail.my_chips != null
                  ? ` · ${cloudDetail.my_chips >= 0 ? '+' : ''}${cloudDetail.my_chips} фиш.`
                  : ''}
              </p>
              <ul className="lk-archive__standings">
                {[...cloudDetail.players]
                  .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
                  .map((p) => {
                    const chips =
                      cloudDetail.chips_by_slot?.[String(p.slot_index)] != null
                        ? Number(cloudDetail.chips_by_slot[String(p.slot_index)])
                        : null;
                    return (
                      <li key={p.slot_index}>
                        <span>
                          {p.place != null ? `${p.place}. ` : ''}
                          {p.display_name}
                          {p.is_ai ? ' (ИИ)' : ''}
                        </span>
                        <span>
                          {p.final_score >= 0 ? '+' : ''}
                          {p.final_score}
                          {chips != null ? (
                            <span style={{ color: chipColor(chips) }}>
                              {' '}
                              · {chips >= 0 ? '+' : ''}
                              {chips}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              <DealHistoryTable
                deals={
                  cloudDetail.deal_history.length
                    ? cloudDetail.deal_history
                    : localDetail?.dealHistory ?? []
                }
                playerNames={
                  cloudDetail.players.length
                    ? [...cloudDetail.players]
                        .sort((a, b) => a.slot_index - b.slot_index)
                        .map((p) => p.display_name)
                    : localDetail?.players.map((p) => p.name) ?? []
                }
              />
            </div>
          ) : localDetail ? (
            <div className="lk-archive__detail-inner">
              <div className="lk-archive__detail-top">
                <h3 className="lk-archive__detail-title">
                  {localDetail.source === 'online' ? 'Онлайн' : 'Офлайн'} · №{localDetail.gameId}
                </h3>
                <button type="button" className="lk-archive__btn lk-archive__btn--ghost" onClick={closeDetail}>
                  Закрыть
                </button>
              </div>
              <p className="lk-archive__detail-meta">
                {formatWhen(localDetail.finishedAt)} · {modeLabel(localDetail.settlementMode)} · место{' '}
                {localDetail.humanPlace} · {localDetail.humanScore >= 0 ? '+' : ''}
                {localDetail.humanScore} очк. · {localDetail.humanChips >= 0 ? '+' : ''}
                {localDetail.humanChips} фиш.
              </p>
              <ul className="lk-archive__standings">
                {localDetail.players.map((p) => (
                  <li key={`${p.place}-${p.name}`}>
                    <span>
                      {p.place}. {p.name}
                    </span>
                    <span>
                      {p.score >= 0 ? '+' : ''}
                      {p.score}
                      <span style={{ color: chipColor(p.chips) }}>
                        {' '}
                        · {p.chips >= 0 ? '+' : ''}
                        {p.chips}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <DealHistoryTable
                deals={localDetail.dealHistory}
                playerNames={localDetail.players.map((p) => p.name)}
              />
            </div>
          ) : (
            <p className="lk-archive__empty">Не удалось загрузить деталь.</p>
          )}
        </div>
      </div>
    </section>
  );
}
