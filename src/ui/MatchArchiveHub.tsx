/**
 * Хаб «Мои партии»: лента (локальный архив ∪ облако) + деталь с таблицей раздач.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getPartyArchive,
  getPartyArchiveById,
  type PartyArchiveRecord,
} from '../game/partyArchive';
import { SETTLEMENT_MODE_LABELS, type SettlementMode } from '../game/partySettlement';
import type { DealResult } from '../game/GameEngine';
import { hasSavedGame } from '../game/persistence';
import { isFullDealRow, type GatedDealRow } from '../lib/historyAccess';
import {
  getMatchDetail,
  getMyMatchHistory,
  type MatchDetail,
  type MatchHistoryItem,
} from '../lib/onlineGameSupabase';
import { chipColor } from './DealResultsSettlement';

/** Дефолтные имена офлайн-ботов (как в createGame) — если в старой записи имя пустое. */
function offlineDefaultSeatName(seat: number, playerCount: number): string {
  if (seat === 0) return '';
  if (seat === 1) return playerCount === 3 ? 'ИИ Восток' : 'ИИ Север';
  if (seat === 2) return playerCount === 3 ? 'ИИ Запад' : 'ИИ супердлинноеим';
  if (seat === 3) return 'Семнадцать символ';
  return '';
}

const ONLINE_AI_SEAT_NAMES = ['ИИ Юг', 'ИИ Север', 'ИИ Запад', 'ИИ Восток'] as const;

/** Заполнить пустые слоты только там, где это безопасно (не подменять живых онлайн-игроков ботами). */
function fillMissingSeatNames(
  names: string[],
  opts: {
    humanIndex?: number;
    source?: 'offline' | 'online' | string;
    aiSlots?: ReadonlySet<number> | null;
  },
): void {
  const cols = names.length;
  const humanIndex = opts.humanIndex;
  const offline = opts.source === 'offline';

  for (let i = 0; i < cols; i++) {
    if ((names[i] || '').trim()) continue;
    if (humanIndex != null && i === humanIndex) continue;

    // Онлайн: имена только для явно помеченных ИИ-слотов
    if (!offline) {
      if (opts.aiSlots?.has(i)) {
        names[i] = ONLINE_AI_SEAT_NAMES[i] ?? `ИИ ${i}`;
      }
      continue;
    }

    // Офлайн: дефолтные имена ботов createGame
    if (opts.aiSlots?.has(i) || humanIndex === 0 || humanIndex == null) {
      const bot = offlineDefaultSeatName(i, cols);
      if (bot) names[i] = bot;
    }
  }
}

/** Показать полный срез, если bids есть; light — только уже сжатые в облаке строки. */
function dealsForViewer(raw: DealResult[]): GatedDealRow[] {
  return raw.map((d) => {
    if (Array.isArray(d.bids)) return d;
    return {
      dealNumber: d.dealNumber,
      points: Array.isArray(d.points) ? [...d.points] : [],
      _light: true as const,
    };
  });
}

function isGenericPlayerLabel(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !n || n === 'игрок' || /^игрок\s*\d*$/i.test(name.trim());
}

/** Ключ для схлопывания одинаковых строк ленты (код комнаты разный у дублей insert — не используем). */
function matchFeedDedupeKey(parts: {
  at: string;
  place: number | null | undefined;
  score: number | null | undefined;
  chips: number | null | undefined;
  offline: boolean;
}): string {
  const t = Date.parse(parts.at);
  // До минуты: в UI время без секунд, дубли RPC часто в одну минуту
  const bucket = Number.isFinite(t) ? Math.floor(t / 60_000) : parts.at;
  return [bucket, parts.place ?? '', parts.score ?? '', parts.chips ?? '', parts.offline ? 1 : 0].join('|');
}

export type MatchArchiveFilter = 'all' | 'cloud' | 'local' | 'online' | 'offline';

export type MatchArchiveHubProps = {
  userId: string | null;
  configured: boolean;
  /** Прокрутить к ленте / открыть деталь */
  focus?: 'matches' | null;
  onContinueOffline?: () => void;
  /** Открыть экран «Рейтинг» */
  onOpenRating?: () => void;
  /** Открыть страницу «Подписка / Премиум» (stub до реализации) */
  onOpenPremium?: () => void;
};

const MOBILE_ARCHIVE_MQ = '(max-width: 1024px)';

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
  finalScores,
  youColumnIndex,
}: {
  deals: GatedDealRow[];
  playerNames: string[];
  /** Итоговые очки по слотам (колонкам). */
  finalScores?: Array<number | null | undefined>;
  /** Колонка текущего пользователя (не всегда 0). */
  youColumnIndex?: number | null;
}) {
  if (!deals.length) {
    return <p className="lk-archive__empty">Срез раздач недоступен для этой записи.</p>;
  }
  const cols = Math.max(
    playerNames.length,
    finalScores?.length ?? 0,
    ...deals.map((d) => (isFullDealRow(d) ? Math.max(d.bids.length, d.points.length) : d.points.length)),
    1,
  );
  const names = Array.from({ length: cols }, (_, i) => playerNames[i]?.trim() || '');
  const showTotals = finalScores != null && finalScores.length > 0;
  const youCol =
    youColumnIndex != null && Number.isFinite(youColumnIndex) && youColumnIndex >= 0 && youColumnIndex < cols
      ? youColumnIndex
      : null;
  return (
    <div className="lk-archive__deals-block">
      <div className="lk-archive__deals-legend">
        <span className="lk-archive__legend-bid">заказ</span>
        {' / '}
        <span className="lk-archive__legend-taken">взятки</span>
        {' · очки'}
        {youCol != null ? (
          <>
            {' · '}
            <span className="lk-archive__legend-you">вы</span>
          </>
        ) : null}
      </div>
      <div className="lk-archive__deals-wrap">
        <table className="lk-archive__deals">
          <thead>
            <tr>
              <th scope="col">№</th>
              {names.map((n, i) => (
                <th
                  key={`col-${i}`}
                  scope="col"
                  title={n || undefined}
                  className={i === youCol ? 'lk-archive__deals-you' : undefined}
                >
                  {i === youCol ? (
                    <span className="lk-archive__you-name">
                      <span className="lk-archive__you-badge" aria-hidden>
                        вы
                      </span>
                      {n || '—'}
                    </span>
                  ) : (
                    n || '—'
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.dealNumber} className={!isFullDealRow(d) ? 'lk-archive__deals-row--light' : undefined}>
                <td className="lk-archive__deals-num">{d.dealNumber}</td>
                {Array.from({ length: cols }, (_, i) => {
                  const youClass = i === youCol ? ' lk-archive__deals-td--you' : '';
                  if (!isFullDealRow(d)) {
                    const pts = d.points[i];
                    const ptsStr = pts == null ? '—' : `${pts >= 0 ? '+' : ''}${pts}`;
                    return (
                      <td key={i} className={youClass.trim() || undefined}>
                        <span className="lk-archive__cell-main lk-archive__cell-main--light">{ptsStr}</span>
                      </td>
                    );
                  }
                  const bid = d.bids[i];
                  const taken = d.takens?.[i];
                  const pts = d.points[i];
                  const bidStr = bid == null ? '—' : String(bid);
                  const takenStr = taken == null ? '—' : String(taken);
                  const ptsStr = pts == null ? '—' : `${pts >= 0 ? '+' : ''}${pts}`;
                  return (
                    <td key={i} className={youClass.trim() || undefined}>
                      <span className="lk-archive__cell-main">
                        <span className="lk-archive__cell-bid">{bidStr}</span>
                        <span className="lk-archive__cell-sep">/</span>
                        <span className="lk-archive__cell-taken">{takenStr}</span>
                      </span>
                      <span className="lk-archive__cell-pts">{ptsStr}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {showTotals ? (
            <tfoot>
              <tr className="lk-archive__deals-total">
                <th scope="row">Итог</th>
                {Array.from({ length: cols }, (_, i) => {
                  const s = finalScores[i];
                  const str = s == null || !Number.isFinite(s) ? '—' : `${s >= 0 ? '+' : ''}${s}`;
                  return (
                    <td key={i} className={i === youCol ? 'lk-archive__deals-td--you' : undefined}>
                      <span className="lk-archive__cell-main lk-archive__cell-total">{str}</span>
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

function sumDealPointsBySeat(
  deals: Array<{ points?: number[] | null }>,
  cols: number,
): Array<number | null> {
  const totals = Array.from({ length: cols }, () => 0);
  const seen = Array.from({ length: cols }, () => false);
  for (const d of deals) {
    const pts = d.points;
    if (!Array.isArray(pts)) continue;
    for (let i = 0; i < cols; i++) {
      const v = pts[i];
      if (typeof v === 'number' && Number.isFinite(v)) {
        totals[i] += v;
        seen[i] = true;
      }
    }
  }
  return totals.map((t, i) => (seen[i] ? t : null));
}

/** Имена по слотам стола + итог = сумма очков раздач в колонке. */
function seatColumnsFromLocal(
  rec: {
    players: Array<{ name: string; score: number; place: number; playerIndex?: number }>;
    playerCount: number;
    humanIndex: number;
    humanPlace: number;
    dealHistory: Array<{ points?: number[]; bids?: number[] }>;
    seatNames?: string[];
    source?: 'offline' | 'online';
  },
  dealsForTable: Array<{ points?: number[]; bids?: number[] }>,
): { names: string[]; scores: number[] } {
  const cols = Math.max(
    rec.playerCount || 0,
    rec.players.length,
    rec.seatNames?.length ?? 0,
    ...dealsForTable.map((d) => d.points?.length ?? 0),
    ...dealsForTable.map((d) => d.bids?.length ?? 0),
    ...rec.dealHistory.map((d) => d.points?.length ?? 0),
    1,
  );

  const names = Array.from({ length: cols }, () => '');

  // 1) Явный снимок имён по слотам (новые записи)
  if (Array.isArray(rec.seatNames) && rec.seatNames.length > 0) {
    for (let i = 0; i < cols; i++) {
      const n = (rec.seatNames[i] || '').trim();
      if (n) names[i] = n;
    }
  }

  // 2) playerIndex → имя
  for (const p of rec.players) {
    if (typeof p.playerIndex !== 'number') continue;
    const i = p.playerIndex;
    if (i < 0 || i >= cols) continue;
    const n = (p.name || '').trim();
    if (n && !names[i]) names[i] = n;
  }

  // 3) Legacy без playerIndex: человек на humanIndex, остальные — в свободные слоты
  const byPlace = [...rec.players].sort((a, b) => a.place - b.place);
  const human = byPlace.find((p) => p.place === rec.humanPlace) ?? byPlace[0];
  if (human && rec.humanIndex >= 0 && rec.humanIndex < cols) {
    const hn = (human.name || '').trim();
    if (hn && !names[rec.humanIndex]) names[rec.humanIndex] = hn;
  }
  const used = new Set(names.filter(Boolean));
  const unused = byPlace
    .map((p) => (p.name || '').trim())
    .filter((n) => n && !used.has(n));
  let ui = 0;
  for (let i = 0; i < cols; i++) {
    if (!names[i] && unused[ui]) {
      names[i] = unused[ui]!;
      used.add(unused[ui]!);
      ui += 1;
    }
  }

  // 4) Пустые слоты → дефолтные/компасные имена (старые записи часто без имён ботов)
  fillMissingSeatNames(names, {
    humanIndex: rec.humanIndex,
    source: rec.source,
  });

  const fromDeals = sumDealPointsBySeat(dealsForTable, cols);
  const scores = Array.from({ length: cols }, (_, i) => {
    if (fromDeals[i] != null) return fromDeals[i]!;
    const byIdx = rec.players.find((x) => x.playerIndex === i);
    if (byIdx) return byIdx.score;
    return 0;
  });

  return { names, scores };
}

function seatColumnsFromCloud(
  players: Array<{
    slot_index: number;
    display_name: string;
    final_score: number;
    is_ai?: boolean;
    account_hint?: string | null;
  }>,
  dealHistory: Array<{ points?: number[]; bids?: number[] }>,
  dealsForTable: Array<{ points?: number[]; bids?: number[] }>,
  localFallback?: { names: string[]; scores: number[] } | null,
  opts?: { isOffline?: boolean; humanSlot?: number | null },
): { names: string[]; scores: number[] } {
  const cols = Math.max(
    players.length,
    localFallback?.names.length ?? 0,
    ...dealHistory.map((d) => d.points?.length ?? 0),
    ...dealHistory.map((d) => d.bids?.length ?? 0),
    ...dealsForTable.map((d) => d.points?.length ?? 0),
    1,
  );
  const names = Array.from({ length: cols }, () => '');
  const aiSlots = new Set<number>();
  for (const p of players) {
    const i = Number(p.slot_index);
    if (!Number.isFinite(i) || i < 0 || i >= cols) continue;
    if (p.is_ai) aiSlots.add(i);
    const dn = (p.display_name || '').trim();
    const hint = (p.account_hint || '').trim();
    // Имя стола → логин аккаунта (email) → что есть
    if (dn && !isGenericPlayerLabel(dn)) names[i] = dn;
    else if (hint) names[i] = hint;
    else if (dn) names[i] = dn;
  }
  if (localFallback) {
    for (let i = 0; i < cols; i++) {
      const local = (localFallback.names[i] || '').trim();
      if (!local) continue;
      const cur = (names[i] || '').trim();
      if (!cur || isGenericPlayerLabel(cur)) names[i] = local;
    }
  }

  const humanSlotRaw =
    opts?.humanSlot != null && opts.humanSlot >= 0 && opts.humanSlot < cols
      ? opts.humanSlot
      : players.find((p) => !p.is_ai)?.slot_index;
  const humanSlot = humanSlotRaw != null ? Number(humanSlotRaw) : undefined;

  fillMissingSeatNames(names, {
    humanIndex: humanSlot != null && Number.isFinite(humanSlot) ? humanSlot : undefined,
    source: opts?.isOffline ? 'offline' : 'online',
    aiSlots,
  });

  const fromDeals = sumDealPointsBySeat(dealsForTable, cols);
  const scores = Array.from({ length: cols }, (_, i) => {
    if (fromDeals[i] != null) return fromDeals[i]!;
    if (localFallback?.scores[i] != null && Number.isFinite(localFallback.scores[i])) {
      return localFallback.scores[i]!;
    }
    const p = players.find((x) => Number(x.slot_index) === i);
    return p?.final_score ?? 0;
  });
  return { names, scores };
}


export function MatchArchiveHub({
  userId,
  configured,
  focus,
  onContinueOffline,
  onOpenRating,
}: MatchArchiveHubProps) {
  const [filter, setFilter] = useState<MatchArchiveFilter>('all');
  const [localRows, setLocalRows] = useState<PartyArchiveRecord[]>([]);
  const [cloudRows, setCloudRows] = useState<MatchHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [cloudDetail, setCloudDetail] = useState<MatchDetail | null>(null);
  const [localDetail, setLocalDetail] = useState<PartyArchiveRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_ARCHIVE_MQ).matches,
  );
  const [listOpen, setListOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const offlineSaved = hasSavedGame();

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_ARCHIVE_MQ);
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

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
    const seenSig = new Set<string>();
    for (const c of cloudRows ?? []) {
      const sig = matchFeedDedupeKey({
        at: c.finished_at,
        place: c.place,
        score: c.final_score,
        chips: c.chips,
        offline: !!c.is_offline,
      });
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
      rows.push({ key: `cloud:${c.id}`, at: c.finished_at, kind: 'cloud', cloud: c });
    }
    for (const loc of localRows) {
      if (loc.cloudMatchId && cloudIds.has(loc.cloudMatchId)) continue;
      const sig = matchFeedDedupeKey({
        at: loc.finishedAt,
        place: loc.humanPlace,
        score: loc.humanScore,
        chips: loc.humanChips,
        offline: loc.source !== 'online',
      });
      // Та же партия уже есть из облака (без cloudMatchId у старых записей)
      if (seenSig.has(sig)) continue;
      seenSig.add(sig);
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
    if (isMobile) setListOpen(true);
    try {
      if (row.kind === 'local') {
        const full = (await getPartyArchiveById(row.local.id)) ?? row.local;
        setLocalDetail(full);
      } else if (userId) {
        const d = await getMatchDetail(row.cloud.id, userId);
        setCloudDetail(d);
        const cloudSig = matchFeedDedupeKey({
          at: row.cloud.finished_at,
          place: row.cloud.place,
          score: row.cloud.final_score,
          chips: row.cloud.chips,
          offline: !!row.cloud.is_offline,
        });
        // Точный id, иначе (только офлайн↔офлайн) та же партия по месту/очкам/минуте
        const localHit =
          localRows.find((l) => l.cloudMatchId === row.cloud.id) ??
          localRows.find(
            (l) =>
              (row.cloud.is_offline ? l.source === 'offline' : l.source === 'online') &&
              matchFeedDedupeKey({
                at: l.finishedAt,
                place: l.humanPlace,
                score: l.humanScore,
                chips: l.humanChips,
                offline: l.source !== 'online',
              }) === cloudSig,
          );
        if (localHit) {
          const full = (await getPartyArchiveById(localHit.id)) ?? localHit;
          setLocalDetail(full);
        }
      }
    } finally {
      setDetailLoading(false);
    }
  };

  useLayoutEffect(() => {
    if (!isMobile || !detailKey || !listOpen) return;
    detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [isMobile, detailKey, listOpen, detailLoading]);

  const closeDetail = () => {
    setDetailKey(null);
    setCloudDetail(null);
    setLocalDetail(null);
  };

  const hasAnyMatches = localRows.length > 0 || (cloudRows?.length ?? 0) > 0;
  const showMobileEmpty = isMobile && !loading && !hasAnyMatches;
  const showDetailPane = !isMobile || listOpen;

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
        <div className="lk-archive__hint">
          <p>На устройстве сохраняется история с раздачами. Рейтинг — по очкам.</p>
          <p>
            Онлайн-партии хранятся в облаке (офлайн тоже — если вы вошли)
            {onOpenRating ? (
              <>
                . Общий онлайн-рейтинг — на странице{' '}
                <button type="button" className="lk-archive__hint-link" onClick={onOpenRating}>
                  Рейтинг
                </button>
                .
              </>
            ) : (
              '.'
            )}
          </p>
        </div>
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

      {showMobileEmpty ? (
        <p className="lk-archive__empty-hero">
          Сохранённых партий пока нет. Здесь появится список завершённых партий.
        </p>
      ) : isMobile && loading && !hasAnyMatches ? (
        <p className="lk-archive__empty-hero">Загрузка…</p>
      ) : (
        <>
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
        <div
          className={[
            'lk-archive__list-panel',
            listOpen || !isMobile ? 'lk-archive__list-panel--open' : 'lk-archive__list-panel--collapsed',
          ].join(' ')}
        >
          {isMobile ? (
            <button
              type="button"
              className="lk-archive__list-toggle"
              aria-expanded={listOpen}
              onClick={() => setListOpen((v) => !v)}
            >
              <span className="lk-archive__list-toggle-label">
                {listOpen
                  ? 'Свернуть список'
                  : `Список партий${hasAnyMatches ? ` · ${feed.length}` : ''}`}
              </span>
              <span className="lk-archive__list-toggle-chev" aria-hidden>
                {listOpen ? '▴' : '▾'}
              </span>
            </button>
          ) : null}

          {listOpen || !isMobile ? (
            <div className="lk-archive__list-wrap">
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
            </div>
          ) : null}
        </div>

        {showDetailPane ? (
        <div className="lk-archive__detail" ref={detailRef} aria-live="polite">
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
                    const label =
                      p.display_name?.trim() && !/^игрок\s*\d*$/i.test(p.display_name.trim())
                        ? p.display_name.trim()
                        : p.account_hint?.trim() ||
                          p.display_name?.trim() ||
                          `Игрок ${(p.slot_index ?? 0) + 1}`;
                    return (
                      <li key={p.slot_index}>
                        <span>
                          {p.place != null ? `${p.place}. ` : ''}
                          {label}
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
              {(() => {
                const rawDeals =
                  cloudDetail.deal_history.length > 0
                    ? cloudDetail.deal_history
                    : localDetail &&
                        ((cloudDetail.is_offline && localDetail.source === 'offline') ||
                          (!cloudDetail.is_offline && localDetail.source === 'online'))
                      ? localDetail.dealHistory
                      : [];
                const deals = dealsForViewer(rawDeals);
                const localOk =
                  localDetail &&
                  ((cloudDetail.is_offline && localDetail.source === 'offline') ||
                    (!cloudDetail.is_offline && localDetail.source === 'online'));
                const localCols = localOk ? seatColumnsFromLocal(localDetail, deals) : null;
                const youSlot =
                  cloudDetail.my_slot_index != null && Number.isFinite(Number(cloudDetail.my_slot_index))
                    ? Number(cloudDetail.my_slot_index)
                    : cloudDetail.players.find((p) => !p.is_ai && p.place === cloudDetail.my_place)?.slot_index ??
                      null;
                const cols =
                  cloudDetail.players.length > 0
                    ? seatColumnsFromCloud(cloudDetail.players, rawDeals, deals, localCols, {
                        isOffline: cloudDetail.is_offline,
                        humanSlot: youSlot,
                      })
                    : localCols ?? { names: [] as string[], scores: [] as number[] };
                return (
                  <DealHistoryTable
                    deals={deals}
                    playerNames={cols.names}
                    finalScores={cols.scores}
                    youColumnIndex={youSlot}
                  />
                );
              })()}
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
                {localDetail.players.map((p, i) => (
                  <li key={`${p.place}-${p.name}-${i}`}>
                    <span>
                      {p.place}. {p.name?.trim() || `Игрок ${i + 1}`}
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
              {(() => {
                const deals = dealsForViewer(localDetail.dealHistory);
                const cols = seatColumnsFromLocal(localDetail, deals);
                return (
                  <DealHistoryTable
                    deals={deals}
                    playerNames={cols.names}
                    finalScores={cols.scores}
                    youColumnIndex={localDetail.humanIndex}
                  />
                );
              })()}
            </div>
          ) : (
            <p className="lk-archive__empty">Не удалось загрузить деталь.</p>
          )}
        </div>
        ) : null}
      </div>
        </>
      )}
    </section>
  );
}
