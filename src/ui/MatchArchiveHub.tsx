/**
 * Хаб «Мои партии»: лента (локальный архив ∪ облако) + деталь с таблицей раздач.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  getPartyArchive,
  getPartyArchiveById,
  type PartyArchiveRecord,
} from '../game/partyArchive';
import type { SettlementMode } from '../game/partySettlement';
import type { DealResult } from '../game/GameEngine';
import { hasSavedGame } from '../game/persistence';
import { isFullDealRow, type GatedDealRow } from '../lib/historyAccess';
import { useAuth } from '../contexts/AuthContext';
import {
  getMatchDetail,
  getMyMatchHistoryResult,
  type MatchDetail,
  type MatchHistoryItem,
} from '../lib/onlineGameSupabase';
import { chipColor } from './DealResultsSettlement';
import { getLocale, localizeAiDisplayName, useT, type TFunc } from '../i18n';

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
  return !n || n === 'игрок' || n === 'player' || /^(игрок|player)\s*\d*$/i.test(name.trim());
}

function displaySeatName(raw: string, index: number, playerCount: number, tr: TFunc): string {
  const trimmed = raw.trim();
  if (!trimmed || isGenericPlayerLabel(trimmed)) return tr('archive.playerN', { n: index + 1 });
  return localizeAiDisplayName(undefined, trimmed, playerCount);
}

function modeLabel(mode: SettlementMode | string | null | undefined, tr: TFunc): string {
  if (!mode) return '';
  if (mode === 'points_only') return tr('settlement.points');
  if (mode === 'vs_average') return tr('settlement.average');
  if (mode === 'accuracy_bonus') return tr('settlement.accuracy');
  if (mode === 'prize_pool') return tr('settlement.prize');
  return String(mode);
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

/** Локальная копия той же онлайн-партии: фишки/минута часто не совпадают с облаком. */
function isSameAccountMatch(
  a: {
    at: string;
    place: number | null | undefined;
    score: number | null | undefined;
    offline: boolean;
  },
  b: {
    at: string;
    place: number | null | undefined;
    score: number | null | undefined;
    offline: boolean;
  },
): boolean {
  if (a.offline !== b.offline) return false;
  if ((a.place ?? null) !== (b.place ?? null)) return false;
  if ((a.score ?? null) !== (b.score ?? null)) return false;
  const ta = Date.parse(a.at);
  const tb = Date.parse(b.at);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return false;
  return Math.abs(ta - tb) <= 15 * 60 * 1000;
}

export type MatchArchiveFilter = 'all' | 'cloud' | 'local' | 'online' | 'offline';

export type MatchArchiveHubProps = {
  userId: string | null;
  configured: boolean;
  /** Прокрутить к ленте / открыть деталь */
  focus?: 'matches' | null;
  /** ПК: раскрыть список партий (капсула «История»). */
  expandList?: boolean;
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
    return d.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 10);
  }
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
  const t = useT();
  if (!deals.length) {
    return <p className="lk-archive__empty">{t('archive.dealsUnavailable')}</p>;
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
        <span className="lk-archive__legend-bid">{t('archive.legendBid')}</span>
        {' / '}
        <span className="lk-archive__legend-taken">{t('archive.legendTaken')}</span>
        {` · ${t('archive.legendPts')}`}
        {youCol != null ? (
          <>
            {' · '}
            <span className="lk-archive__legend-you">{t('rating.you')}</span>
          </>
        ) : null}
      </div>
      <div className="lk-archive__deals-wrap">
        <table className="lk-archive__deals">
          <thead>
            <tr>
              <th scope="col">{t('archive.dealCol')}</th>
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
                        {t('rating.you')}
                      </span>
                      {displaySeatName(n, i, cols, t) || '—'}
                    </span>
                  ) : (
                    n ? displaySeatName(n, i, cols, t) : '—'
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
                <th scope="row">{t('archive.total')}</th>
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
  expandList = false,
  onContinueOffline,
  onOpenRating,
}: MatchArchiveHubProps) {
  const t = useT();
  const { session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [filter, setFilter] = useState<MatchArchiveFilter>('all');
  const [localRows, setLocalRows] = useState<PartyArchiveRecord[]>([]);
  const [cloudRows, setCloudRows] = useState<MatchHistoryItem[] | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
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

  const loadGen = useRef(0);
  const loadFeed = useCallback(async () => {
    if (authLoading) return;
    void accessToken;
    const gen = ++loadGen.current;
    if (gen === 1) setLoading(true);
    try {
      const local = await getPartyArchive(undefined, 80);
      if (loadGen.current !== gen) return;
      setLocalRows(local);
      if (configured && userId) {
        const { rows, error } = await getMyMatchHistoryResult(userId, 80);
        if (loadGen.current !== gen) return;
        setCloudRows(rows);
        setCloudError(error);
      } else if (loadGen.current === gen) {
        setCloudRows([]);
        setCloudError(null);
      }
    } catch {
      if (loadGen.current === gen) setCloudError(t('archive.cloudLoadFail'));
    } finally {
      if (loadGen.current === gen) setLoading(false);
    }
  }, [authLoading, configured, userId, accessToken, t]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadFeed();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadFeed]);

  useEffect(() => {
    if (focus === 'matches' || expandList) setListOpen(true);
    if (focus === 'matches') {
      document.getElementById('lk-archive-hub')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focus, expandList]);

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
      const locParts = {
        at: loc.finishedAt,
        place: loc.humanPlace,
        score: loc.humanScore,
        chips: loc.humanChips,
        offline: loc.source !== 'online',
      };
      const sig = matchFeedDedupeKey(locParts);
      if (seenSig.has(sig)) continue;
      const cloudDup = (cloudRows ?? []).some((c) =>
        isSameAccountMatch(locParts, {
          at: c.finished_at,
          place: c.place,
          score: c.final_score,
          offline: !!c.is_offline,
        }),
      );
      if (cloudDup) continue;
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
        const localHit =
          localRows.find((l) => l.cloudMatchId === row.cloud.id) ??
          localRows.find(
            (l) =>
              (row.cloud.is_offline ? l.source === 'offline' : l.source === 'online') &&
              isSameAccountMatch(
                {
                  at: l.finishedAt,
                  place: l.humanPlace,
                  score: l.humanScore,
                  offline: l.source !== 'online',
                },
                {
                  at: row.cloud.finished_at,
                  place: row.cloud.place,
                  score: row.cloud.final_score,
                  offline: !!row.cloud.is_offline,
                },
              ),
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
    { id: 'all', label: t('archive.all') },
    { id: 'offline', label: t('archive.offline') },
    { id: 'online', label: t('archive.online') },
    { id: 'cloud', label: t('archive.cloud') },
    { id: 'local', label: t('archive.device') },
  ];

  return (
    <section className="lk-archive" id="lk-archive-hub" aria-labelledby="lk-archive-title">
      <header className="lk-archive__head">
        <h2 id="lk-archive-title" className="lk-archive__title">
          {t('archive.title')}
        </h2>
        <div className="lk-archive__hint">
          <p>{t('archive.hintLocal')}</p>
          <p>
            {t('archive.hintCloud')}
            {onOpenRating ? (
              <>
                {' '}
                {t('archive.hintRating')}{' '}
                <button type="button" className="lk-archive__hint-link" onClick={onOpenRating}>
                  {t('archive.ratingPage')}
                </button>
                {'.'}
              </>
            ) : null}
          </p>
        </div>
      </header>

      {offlineSaved && onContinueOffline ? (
        <div className="lk-archive__resume">
          <div>
            <span className="lk-archive__resume-title">{t('archive.resumeTitle')}</span>
            <span className="lk-archive__resume-sub">{t('archive.resumeSub')}</span>
          </div>
          <button type="button" className="lk-archive__btn" onClick={onContinueOffline}>
            {t('archive.continue')}
          </button>
        </div>
      ) : null}

      {cloudError && configured && userId ? (
        <p className="lk-archive__cloud-error">
          {t('archive.cloudFail')}{' '}
          <button type="button" className="lk-archive__hint-link" onClick={() => void loadFeed()}>
            {t('archive.refresh')}
          </button>
        </p>
      ) : null}

      {showMobileEmpty ? (
        <p className="lk-archive__empty-hero">
          {t('archive.emptyHero')}
        </p>
      ) : isMobile && loading && !hasAnyMatches ? (
        <p className="lk-archive__empty-hero">{t('archive.loading')}</p>
      ) : (
        <>
      <div className="lk-archive__filters" role="tablist" aria-label={t('archive.filterAria')}>
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
            listOpen ? 'lk-archive__list-panel--open' : 'lk-archive__list-panel--collapsed',
          ].join(' ')}
        >
          <button
            type="button"
            className="lk-archive__list-toggle"
            aria-expanded={listOpen}
            onClick={() => setListOpen((v) => !v)}
          >
            <span className="lk-archive__list-toggle-label">
              {listOpen
                ? t('archive.collapseList')
                : hasAnyMatches
                  ? t('archive.listWithCount', { label: t('archive.listMatches'), n: feed.length })
                  : t('archive.listMatches')}
            </span>
            <span className="lk-archive__list-toggle-chev" aria-hidden>
              {listOpen ? '▴' : '▾'}
            </span>
          </button>

          {listOpen ? (
            <div className="lk-archive__list-wrap">
              <div className="lk-archive__list" role="list">
                {loading ? (
                  <p className="lk-archive__empty">{t('archive.loading')}</p>
                ) : feed.length === 0 ? (
                  <p className="lk-archive__empty">
                    {`${t('archive.emptyFeed')}${configured && userId ? t('archive.emptyFeedCloud') : ''}.`}
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
                                {c.is_offline ? t('archive.tagOffline') : t('archive.tagOnline')}
                              </span>
                              <span className="lk-archive__tag lk-archive__tag--cloud">{t('archive.tagCloud')}</span>
                            </span>
                          </span>
                          <span className="lk-archive__row-body">
                            <strong className="lk-archive__place">
                              {c.place != null ? t('archive.place', { n: c.place }) : '—'}
                            </strong>
                            <span className="lk-archive__sep">·</span>
                            <span>{t('archive.pts', { n: score })}</span>
                            {c.chips != null ? (
                              <>
                                <span className="lk-archive__sep">·</span>
                                <span style={{ color: chipColor(c.chips) }}>
                                  {t('archive.chips', { n: `${c.chips >= 0 ? '+' : ''}${c.chips}` })}
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
                              {loc.source === 'online' ? t('archive.tagOnline') : t('archive.tagOffline')}
                            </span>
                            <span className="lk-archive__tag lk-archive__tag--device">{t('archive.tagDevice')}</span>
                          </span>
                        </span>
                        <span className="lk-archive__row-body">
                          <strong className="lk-archive__place">{t('archive.place', { n: loc.humanPlace })}</strong>
                          <span className="lk-archive__sep">·</span>
                          <span>
                            {t('archive.pts', { n: `${loc.humanScore >= 0 ? '+' : ''}${loc.humanScore}` })}
                          </span>
                          <span className="lk-archive__sep">·</span>
                          <span style={{ color: chipColor(loc.humanChips) }}>
                            {t('archive.chips', { n: `${loc.humanChips >= 0 ? '+' : ''}${loc.humanChips}` })}
                          </span>
                          {loc.humanWon ? (
                            <>
                              <span className="lk-archive__sep">·</span>
                              <span className="lk-archive__win">{t('archive.win')}</span>
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
            <p className="lk-archive__empty">{t('archive.pickDetail')}</p>
          ) : detailLoading ? (
            <p className="lk-archive__empty">{t('archive.loadingDetail')}</p>
          ) : cloudDetail ? (
            <div className="lk-archive__detail-inner">
              <div className="lk-archive__detail-top">
                <h3 className="lk-archive__detail-title">
                  {cloudDetail.is_offline ? t('archive.offline') : t('archive.online')} · {cloudDetail.code}
                </h3>
                <button type="button" className="lk-archive__btn lk-archive__btn--ghost" onClick={closeDetail}>
                  {t('common.close')}
                </button>
              </div>
              <p className="lk-archive__detail-meta">
                {formatWhen(cloudDetail.finished_at)}
                {cloudDetail.settlement_mode
                  ? ` · ${modeLabel(cloudDetail.settlement_mode, t)}`
                  : ''}
                {cloudDetail.my_place != null ? ` · ${t('archive.yourPlace', { n: cloudDetail.my_place })}` : ''}
                {cloudDetail.my_final_score != null
                  ? ` · ${t('archive.pts', { n: `${cloudDetail.my_final_score >= 0 ? '+' : ''}${cloudDetail.my_final_score}` })}`
                  : ''}
                {cloudDetail.my_chips != null
                  ? ` · ${t('archive.chips', { n: `${cloudDetail.my_chips >= 0 ? '+' : ''}${cloudDetail.my_chips}` })}`
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
                    const rawName =
                      p.display_name?.trim() && !isGenericPlayerLabel(p.display_name)
                        ? p.display_name.trim()
                        : p.account_hint?.trim() || p.display_name?.trim() || '';
                    const label = displaySeatName(rawName, p.slot_index ?? 0, cloudDetail.players.length, t);
                    return (
                      <li key={p.slot_index}>
                        <span>
                          {p.place != null ? `${p.place}. ` : ''}
                          {label}
                          {p.is_ai ? t('archive.aiParen') : ''}
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
                  {t('archive.recordTitle', {
                    kind: localDetail.source === 'online' ? t('archive.online') : t('archive.offline'),
                    id: localDetail.gameId,
                  })}
                </h3>
                <button type="button" className="lk-archive__btn lk-archive__btn--ghost" onClick={closeDetail}>
                  {t('common.close')}
                </button>
              </div>
              <p className="lk-archive__detail-meta">
                {formatWhen(localDetail.finishedAt)} · {modeLabel(localDetail.settlementMode, t)} ·{' '}
                {t('archive.placeMeta', { n: localDetail.humanPlace })} ·{' '}
                {t('archive.pts', { n: `${localDetail.humanScore >= 0 ? '+' : ''}${localDetail.humanScore}` })} ·{' '}
                {t('archive.chips', { n: `${localDetail.humanChips >= 0 ? '+' : ''}${localDetail.humanChips}` })}
              </p>
              <ul className="lk-archive__standings">
                {localDetail.players.map((p, i) => (
                  <li key={`${p.place}-${p.name}-${i}`}>
                    <span>
                      {p.place}. {displaySeatName(p.name ?? '', i, localDetail.players.length, t)}
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
            <p className="lk-archive__empty">{t('archive.detailFail')}</p>
          )}
        </div>
        ) : null}
      </div>
        </>
      )}
    </section>
  );
}
