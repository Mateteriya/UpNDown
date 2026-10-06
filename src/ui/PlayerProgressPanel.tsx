/**
 * Прогресс в ЛК: офлайн/онлайн, дашборды, уровни ELO, лучшие/худшие раздачи.
 * Аккордеон: одновременно открыта только одна секция — без бесконечного роста вниз.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { ELO_TIERS, eloTierProgress, type EloTierId } from '../game/eloTiers';
import type {
  PlayerProgressBundle,
  HighlightDeal,
  MatchAccuracyPoint,
} from '../game/playerProgressStats';
import type { LeaderboardRow } from '../lib/onlineGameSupabase';
import { useT, type TFunc } from '../i18n';

type ProgFoldKey = 'channels' | 'dash' | 'levels' | 'deals';

function tierLabel(t: TFunc, id: EloTierId): string {
  switch (id) {
    case 'novice':
      return t('cabinet.eloTierNovice');
    case 'amateur':
      return t('cabinet.eloTierAmateur');
    case 'regular':
      return t('cabinet.eloTierRegular');
    case 'adept':
      return t('cabinet.eloTierAdept');
    case 'expert':
      return t('cabinet.eloTierExpert');
    case 'master':
      return t('cabinet.eloTierMaster');
    case 'legend':
      return t('cabinet.eloTierLegend');
  }
}

function formatDealWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return iso.slice(0, 10);
  }
}

function StatFold({
  title,
  peek,
  preview,
  open,
  onToggle,
  tone = 'violet',
  children,
}: {
  title: string;
  /** Короткий текст справа в шапке. */
  peek?: ReactNode;
  /** Мини-дашборд/график снаружи, пока вкладка свёрнута. */
  preview?: ReactNode;
  open: boolean;
  onToggle: () => void;
  tone?: 'cyan' | 'lime' | 'violet' | 'gold' | 'magenta';
  children: ReactNode;
}) {
  return (
    <section
      className={[
        `stat-fold stat-fold--${tone}`,
        open ? 'stat-fold--open' : '',
        !open && preview ? 'stat-fold--has-preview' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="stat-fold__head"
        aria-expanded={open}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onToggle();
        }}
      >
        <span className="stat-fold__head-row">
          <span className="stat-fold__led" aria-hidden="true" />
          <span className="stat-fold__title">{title}</span>
          {!open && peek ? <span className="stat-fold__peek">{peek}</span> : null}
          <span className="stat-fold__chev" aria-hidden="true" />
        </span>
        {!open && preview ? (
          <span className="stat-fold__preview" aria-hidden="true">
            {preview}
          </span>
        ) : null}
      </button>
      <div className={`stat-fold__body${open ? ' is-open' : ''}`} aria-hidden={!open}>
        {open ? children : null}
      </div>
    </section>
  );
}

function ChannelFoldPreview({
  offline,
  online,
  offlineLabel,
  onlineLabel,
}: {
  offline: { wins: number; matches: number; winRate: number | null };
  online: { wins: number; matches: number; winRate: number | null };
  offlineLabel: string;
  onlineLabel: string;
}) {
  return (
    <div className="fold-prev fold-prev--channels">
      <div className="fold-prev__ch fold-prev__ch--off">
        <span className="fold-prev__ch-l">{offlineLabel}</span>
        <span className="fold-prev__ch-n">
          {offline.wins}/{offline.matches}
        </span>
        <span className="fold-prev__meter" aria-hidden="true">
          <i style={{ width: `${Math.max(4, offline.winRate ?? 0)}%` }} />
        </span>
      </div>
      <div className="fold-prev__ch fold-prev__ch--on">
        <span className="fold-prev__ch-l">{onlineLabel}</span>
        <span className="fold-prev__ch-n">
          {online.wins}/{online.matches}
        </span>
        <span className="fold-prev__meter" aria-hidden="true">
          <i style={{ width: `${Math.max(4, online.winRate ?? 0)}%` }} />
        </span>
      </div>
    </div>
  );
}

function DashFoldPreview({
  series,
  trendShort,
  onlineWinRate,
  offlineWinRate,
}: {
  series: number[];
  trendShort: string | null;
  onlineWinRate: number | null;
  offlineWinRate: number | null;
}) {
  const hasSpark = series.length >= 2;
  const hasChannels = onlineWinRate != null || offlineWinRate != null;
  if (!hasSpark && !hasChannels && series.length === 0) return null;
  return (
    <div className="fold-prev fold-prev--dash">
      {hasSpark ? <ProgressSparkline values={series.slice(-12)} /> : null}
      {series.length > 0 ? <MiniAccBars values={series} /> : null}
      {hasChannels ? (
        <span className="fold-prev__winpair" aria-hidden="true">
          {offlineWinRate != null ? <em className="is-off">{offlineWinRate}%</em> : null}
          {onlineWinRate != null ? <em className="is-on">{onlineWinRate}%</em> : null}
        </span>
      ) : null}
      {trendShort ? <span className="fold-prev__trend">{trendShort}</span> : null}
    </div>
  );
}

function LevelsFoldPreview({
  elo,
  rank,
  progressPct,
  tierName,
}: {
  elo: number | null;
  rank: number | null | undefined;
  progressPct: number | null;
  tierName: string | null;
}) {
  if (elo == null) return <span className="fold-prev fold-prev--gate">ELO</span>;
  return (
    <div className="fold-prev fold-prev--levels">
      <span className="fold-prev__elo">{elo}</span>
      <span className="fold-prev__levels-meta">
        {tierName ? <em>{tierName}</em> : null}
        {rank != null ? <strong>#{rank}</strong> : null}
      </span>
      {progressPct != null ? (
        <span className="fold-prev__track" aria-hidden="true">
          <i style={{ width: `${Math.round(progressPct * 100)}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function DealsFoldPreview({
  best,
  worst,
}: {
  best: HighlightDeal | undefined;
  worst: HighlightDeal | undefined;
}) {
  if (!best && !worst) return null;
  return (
    <div className="fold-prev fold-prev--deals">
      {best ? (
        <span className="fold-prev__deal fold-prev__deal--best">
          {best.points >= 0 ? `+${best.points}` : best.points}
          <em>
            {best.bid}→{best.taken}
          </em>
        </span>
      ) : null}
      {worst ? (
        <span className="fold-prev__deal fold-prev__deal--worst">
          {worst.points}
          <em>
            {worst.bid}→{worst.taken}
          </em>
        </span>
      ) : null}
    </div>
  );
}

function MeterBar({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: 'cyan' | 'lime' | 'gold' | 'magenta' | 'violet';
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`stat-meter stat-meter--${tone}`}>
      <div className="stat-meter__row">
        <span className="stat-meter__label">{label}</span>
        <span className="stat-meter__value">{Math.round(pct)}%</span>
      </div>
      <div className="stat-meter__track" aria-hidden="true">
        <div className="stat-meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ChannelCard({
  title,
  matches,
  wins,
  winRate,
  accuracyPct,
  avgPlace,
  emptyHint,
  tone,
}: {
  title: string;
  matches: number;
  wins: number;
  winRate: number | null;
  accuracyPct: number | null;
  avgPlace: number | null;
  emptyHint: string;
  tone: 'offline' | 'online';
}) {
  const t = useT();
  const lit = winRate != null ? Math.max(1, Math.min(5, Math.ceil((winRate / 100) * 5))) : 0;
  if (matches <= 0) {
    return (
      <div className={`prog-channel prog-channel--empty prog-channel--${tone}`}>
        <div className="prog-channel__title">
          <span className="stat-hud__led" aria-hidden="true" />
          {title}
        </div>
        <p className="prog-channel__empty">{emptyHint}</p>
      </div>
    );
  }
  return (
    <div className={`prog-channel prog-channel--${tone} prog-channel--live`}>
      <div className="prog-channel__title">
        <span className="stat-hud__led stat-hud__led--pulse" aria-hidden="true" />
        {title}
      </div>
      <div className="prog-channel__row">
        <span className="prog-channel__big">
          {wins}/{matches}
        </span>
        <span className="prog-channel__rate">{winRate != null ? `${winRate}%` : '—'}</span>
      </div>
      <div className="prog-channel__diodes" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} className={i < lit ? 'is-on' : undefined} />
        ))}
      </div>
      {winRate != null ? (
        <MeterBar value={winRate} label={t('cabinet.progMeterWin')} tone={tone === 'online' ? 'magenta' : 'cyan'} />
      ) : null}
      {accuracyPct != null ? (
        <MeterBar value={accuracyPct} label={t('cabinet.progMeterAcc')} tone="lime" />
      ) : null}
      {avgPlace != null ? (
        <MeterBar
          value={Math.max(0, 100 - ((avgPlace - 1) / 3) * 100)}
          label={t('cabinet.progChannelPlace', { n: avgPlace })}
          tone="gold"
        />
      ) : null}
    </div>
  );
}

/** Sparkline: шарик без transform-анимации (иначе улетает от origin SVG). */
export function ProgressSparkline({
  values,
  compact = false,
}: {
  values: number[];
  compact?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const fillId = `progSparkFill-${uid}`;
  const strokeId = `progSparkStroke-${uid}`;
  if (values.length < 2) return null;
  const padX = compact ? 2 : 4;
  const padY = compact ? 2 : 4;
  const w = compact ? 96 : 140;
  const h = compact ? 28 : 36;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const coords = values.map((v, i) => {
    const x = padX + (i / (values.length - 1)) * innerW;
    const y = padY + (innerH - ((v - min) / span) * innerH);
    return { x, y };
  });
  const line = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${line} ${padX + innerW},${padY + innerH} ${padX},${padY + innerH}`;
  const last = coords[coords.length - 1]!;
  return (
    <svg
      className={['prog-spark', compact ? 'prog-spark--compact' : ''].filter(Boolean).join(' ')}
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#c4b5fd" />
          <stop offset="100%" stopColor="#fcd34d" />
        </linearGradient>
      </defs>
      <polygon fill={`url(#${fillId})`} points={area} />
      <polyline
        fill="none"
        stroke={`url(#${strokeId})`}
        strokeWidth={compact ? 2 : 2.4}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={line}
      />
      <circle cx={last.x} cy={last.y} r={compact ? 2.6 : 3.4} className="prog-spark__dot" />
    </svg>
  );
}

function MiniAccBars({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const slice = values.slice(-8);
  return (
    <div className="prog-mini-bars" aria-hidden="true">
      {slice.map((v, i) => (
        <i
          key={i}
          className="prog-mini-bars__col"
          style={{ height: `${Math.max(14, Math.min(100, v))}%` }}
        />
      ))}
    </div>
  );
}

/** Столбики точности последних партий. */
function AccuracyBars({
  points,
}: {
  points: MatchAccuracyPoint[];
}) {
  const t = useT();
  const [focus, setFocus] = useState<number | null>(null);
  const scored = points.filter((p) => p.accuracyPct != null);
  if (scored.length === 0) return null;
  const active = focus != null ? scored[focus] : null;
  return (
    <div className="prog-bars-wrap">
      <div className="prog-bars" role="list" aria-label={t('cabinet.progChartAcc')}>
        {scored.map((p, i) => (
          <button
            key={`${p.gameId}-${p.finishedAt}-${i}`}
            type="button"
            role="listitem"
            className={['prog-bars__col', focus === i ? 'prog-bars__col--on' : ''].filter(Boolean).join(' ')}
            title={`${p.accuracyPct}%`}
            aria-pressed={focus === i}
            onClick={() => setFocus((cur) => (cur === i ? null : i))}
          >
            <div className="prog-bars__track">
              <div
                className="prog-bars__fill"
                style={{ height: `${Math.max(6, Math.min(100, p.accuracyPct ?? 0))}%` }}
              />
            </div>
            <span className="prog-bars__n">{p.accuracyPct}</span>
          </button>
        ))}
      </div>
      {active && active.accuracyPct != null ? (
        <p className="prog-bars__focus">
          {t('cabinet.progBarFocusAcc', { n: active.accuracyPct })}
          {' · '}
          {active.source === 'online' ? t('cabinet.progOnline') : t('cabinet.progOffline')}
          {' · #'}
          {active.place}
        </p>
      ) : null}
    </div>
  );
}

/** Столбики мест (инвертировано: 1 выше). */
function PlaceBars({ points }: { points: MatchAccuracyPoint[] }) {
  const t = useT();
  const [focus, setFocus] = useState<number | null>(null);
  if (points.length === 0) return null;
  const active = focus != null ? points[focus] : null;
  return (
    <div className="prog-bars-wrap">
      <div className="prog-bars prog-bars--place" role="list" aria-label={t('cabinet.progChartPlace')}>
        {points.map((p, i) => {
          const h = Math.max(12, ((5 - Math.min(4, Math.max(1, p.place))) / 4) * 100);
          return (
            <button
              key={`${p.gameId}-place-${i}`}
              type="button"
              role="listitem"
              className={['prog-bars__col', focus === i ? 'prog-bars__col--on' : ''].filter(Boolean).join(' ')}
              title={`#${p.place}`}
              aria-pressed={focus === i}
              onClick={() => setFocus((cur) => (cur === i ? null : i))}
            >
              <div className="prog-bars__track">
                <div className="prog-bars__fill prog-bars__fill--place" style={{ height: `${h}%` }} />
              </div>
              <span className="prog-bars__n">{p.place}</span>
            </button>
          );
        })}
      </div>
      {active ? (
        <p className="prog-bars__focus">
          {t('cabinet.progBarFocusPlace', { n: active.place })}
          {' · '}
          {active.accuracyPct}%
        </p>
      ) : null}
    </div>
  );
}

function DealList({
  title,
  items,
  tone,
}: {
  title: string;
  items: HighlightDeal[];
  tone: 'best' | 'worst';
}) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className={`prog-deals prog-deals--${tone}`}>
      <div className="prog-deals__title">{title}</div>
      <ul className="prog-deals__list">
        {items.map((d) => (
          <li key={`${d.archiveId}-${d.dealNumber}-${d.kind}`} className="prog-deals__item">
            <span className="prog-deals__main">
              {t('cabinet.progDealLine', {
                deal: d.dealNumber,
                bid: d.bid,
                taken: d.taken,
                pts: d.points >= 0 ? `+${d.points}` : `${d.points}`,
              })}
            </span>
            <div className="prog-deals__meter" aria-hidden="true">
              <div
                className="prog-deals__meter-fill"
                style={{
                  width: `${Math.min(100, Math.max(8, (Math.abs(d.points) / 50) * 100))}%`,
                }}
              />
            </div>
            <span className="prog-deals__sub">
              {formatDealWhen(d.finishedAt)} ·{' '}
              {d.source === 'online' ? t('cabinet.progOnline') : t('cabinet.progOffline')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PlayerProgressPanelProps = {
  progress: PlayerProgressBundle;
  ladderMe?: (LeaderboardRow & { rank: number | null }) | null;
  ladderMedianElo?: number | null;
  onOpenLeaderboard?: () => void;
};

export function PlayerProgressPanel({
  progress,
  ladderMe,
  ladderMedianElo,
  onOpenLeaderboard,
}: PlayerProgressPanelProps) {
  const t = useT();
  const hasAny = progress.all.matches > 0 || (ladderMe?.elo != null);
  const [isPc, setIsPc] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1025px)').matches,
  );
  /** Панель открыта: свёрнутые вкладки сразу показывают мини-дашборды. */
  const [panelOpen, setPanelOpen] = useState(true);
  const [openFold, setOpenFold] = useState<ProgFoldKey | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1025px)');
    const sync = () => setIsPc(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (!hasAny) return null;

  const trend = progress.trend;
  const seriesVals = progress.recentSeries
    .map((p) => p.accuracyPct)
    .filter((v): v is number => v != null);
  const recentPoints = progress.recentSeries.slice(-10);
  const placePoints = recentPoints.filter((p) => p.place >= 1);
  const elo = ladderMe?.elo ?? null;
  const tierProg = elo != null ? eloTierProgress(elo) : null;
  const hasChannelDash = progress.offline.matches > 0 || progress.online.matches > 0;

  const accTrendText =
    trend.accuracyDelta == null
      ? null
      : trend.accuracyDelta > 0
        ? t('cabinet.progTrendAccUp', { n: trend.accuracyDelta })
        : trend.accuracyDelta < 0
          ? t('cabinet.progTrendAccDown', { n: Math.abs(trend.accuracyDelta) })
          : t('cabinet.progTrendAccFlat');

  const placeTrendText =
    trend.placeDelta == null
      ? null
      : trend.placeDelta < 0
        ? t('cabinet.progTrendPlaceUp', { n: Math.abs(trend.placeDelta) })
        : trend.placeDelta > 0
          ? t('cabinet.progTrendPlaceDown', { n: trend.placeDelta })
          : t('cabinet.progTrendPlaceFlat');

  const accTrendShort =
    trend.accuracyDelta == null
      ? null
      : trend.accuracyDelta > 0
        ? t('cabinet.progTrendAccShortUp', { n: trend.accuracyDelta })
        : trend.accuracyDelta < 0
          ? t('cabinet.progTrendAccShortDown', { n: Math.abs(trend.accuracyDelta) })
          : t('cabinet.progTrendAccShortFlat');

  const toggle = (key: ProgFoldKey) => setOpenFold((cur) => (cur === key ? null : key));

  const openTo = (key: ProgFoldKey) => {
    setPanelOpen(true);
    setOpenFold(key);
  };

  const summaryPeek = [
    progress.offline.matches > 0 ? `${t('cabinet.progOffline')} ${progress.offline.wins}/${progress.offline.matches}` : null,
    progress.online.matches > 0 ? `${t('cabinet.progOnline')} ${progress.online.wins}/${progress.online.matches}` : null,
    elo != null ? `ELO ${elo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const dashPeek =
    trend.recentAccuracy != null && accTrendShort
      ? t('cabinet.progDashPeekTrend', { acc: trend.recentAccuracy, delta: accTrendShort })
      : trend.recentAccuracy != null
        ? `${trend.recentAccuracy}% · ${seriesVals.length}`
        : progress.online.winRate != null
          ? t('cabinet.progDashPeekWinrate', { n: progress.online.winRate })
          : progress.offline.winRate != null
            ? `${progress.offline.winRate}%`
            : t('cabinet.progDashPeekEmpty');

  const showDashBody =
    seriesVals.length >= 1 ||
    placePoints.length >= 1 ||
    hasChannelDash ||
    !!accTrendText ||
    !!placeTrendText;

  const bestDeal = progress.bestDeals[0];
  const dealsPeek =
    bestDeal != null
      ? t('cabinet.progFoldDealsPeekBest', {
          pts: bestDeal.points >= 0 ? `+${bestDeal.points}` : `${bestDeal.points}`,
        })
      : progress.bestDeals.length + progress.worstDeals.length > 0
        ? t('cabinet.progFoldDealsPeek', {
            n: progress.bestDeals.length + progress.worstDeals.length,
          })
        : t('cabinet.progDealsPeekEmpty');

  return (
    <div
      className={`prog-panel stat-hud--alive ${isPc ? 'prog-panel--pc' : 'prog-panel--mobile'}${panelOpen ? '' : ' prog-panel--collapsed'}`}
    >
      <span className="stat-hud__corner stat-hud__corner--tl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--tr" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--bl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--br" aria-hidden="true" />
      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led stat-hud__led--pulse" />
        <span className="stat-hud__eyebrow">{t('cabinet.progHudEyebrow')}</span>
        <span className="stat-hud__diodes">
          <i /><i /><i /><i /><i />
        </span>
        <span className="stat-hud__sheen" />
      </div>
      <div className="prog-panel__head">
        <button
          type="button"
          className="prog-panel__toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <h3 className="prog-panel__title">{t('cabinet.progTitle')}</h3>
          <span className="prog-panel__toggle-chev" aria-hidden="true" />
        </button>
        {panelOpen ? <p className="prog-panel__lead">{t('cabinet.progLead')}</p> : null}
        {summaryPeek ? <p className="prog-panel__summary">{summaryPeek}</p> : null}
      </div>

      {!panelOpen ? (
        <div className="prog-dash-preview">
          <div className="prog-dash-preview__row">
            <button
              type="button"
              className="prog-dash-preview__chip prog-dash-preview__chip--cyan"
              aria-label={t('cabinet.progPreviewOpenChannels')}
              onClick={() => openTo('channels')}
            >
              {t('cabinet.progOffline')} {progress.offline.wins}/{progress.offline.matches}
              {progress.offline.accuracyPct != null ? ` · ${progress.offline.accuracyPct}%` : ''}
            </button>
            <button
              type="button"
              className="prog-dash-preview__chip prog-dash-preview__chip--magenta"
              aria-label={t('cabinet.progPreviewOpenChannels')}
              onClick={() => openTo('channels')}
            >
              {t('cabinet.progOnline')} {progress.online.wins}/{progress.online.matches}
              {progress.online.accuracyPct != null ? ` · ${progress.online.accuracyPct}%` : ''}
            </button>
            {elo != null ? (
              <button
                type="button"
                className="prog-dash-preview__chip prog-dash-preview__chip--violet"
                aria-label={t('cabinet.progPreviewOpenLevels')}
                onClick={() => openTo('levels')}
              >
                ELO {elo}
              </button>
            ) : null}
            {accTrendShort ? (
              <button
                type="button"
                className={[
                  'prog-dash-preview__chip',
                  'prog-dash-preview__chip--lime',
                  trend.accuracyDelta != null && trend.accuracyDelta > 0
                    ? 'prog-dash-preview__chip--up'
                    : '',
                  trend.accuracyDelta != null && trend.accuracyDelta < 0
                    ? 'prog-dash-preview__chip--down'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={t('cabinet.progPreviewOpenDash')}
                onClick={() => openTo('dash')}
              >
                {accTrendShort}
              </button>
            ) : null}
            {bestDeal ? (
              <button
                type="button"
                className="prog-dash-preview__chip prog-dash-preview__chip--gold"
                aria-label={t('cabinet.progPreviewOpenDeals')}
                onClick={() => openTo('deals')}
              >
                {bestDeal.points >= 0 ? `+${bestDeal.points}` : bestDeal.points}
              </button>
            ) : null}
          </div>
          {seriesVals.length >= 2 ? (
            <button
              type="button"
              className="prog-dash-preview__viz"
              aria-label={t('cabinet.progPreviewOpenDash')}
              onClick={() => openTo('dash')}
            >
              <div className="prog-dash-preview__spark">
                <ProgressSparkline values={seriesVals.slice(-12)} />
                <MiniAccBars values={seriesVals} />
              </div>
              <span className="prog-dash-preview__spark-label">{t('cabinet.progTrendTitle')}</span>
            </button>
          ) : (
            <button
              type="button"
              className="prog-dash-preview__hint-btn"
              onClick={() => openTo('channels')}
            >
              {t('cabinet.progPreviewHint')}
            </button>
          )}
        </div>
      ) : null}

      {panelOpen ? (
      <>
      <StatFold
        title={t('cabinet.progFoldChannels')}
        peek={
          progress.online.winRate != null
            ? `${progress.online.winRate}%`
            : progress.offline.winRate != null
              ? `${progress.offline.winRate}%`
              : undefined
        }
        preview={
          <ChannelFoldPreview
            offline={progress.offline}
            online={progress.online}
            offlineLabel={t('cabinet.progOffline')}
            onlineLabel={t('cabinet.progOnline')}
          />
        }
        open={openFold === 'channels'}
        onToggle={() => toggle('channels')}
        tone="cyan"
      >
        <div className="prog-channels">
          <ChannelCard
            title={t('cabinet.progOffline')}
            matches={progress.offline.matches}
            wins={progress.offline.wins}
            winRate={progress.offline.winRate}
            accuracyPct={progress.offline.accuracyPct}
            avgPlace={progress.offline.avgPlace}
            emptyHint={t('cabinet.progOfflineEmpty')}
            tone="offline"
          />
          <ChannelCard
            title={t('cabinet.progOnline')}
            matches={progress.online.matches}
            wins={progress.online.wins}
            winRate={progress.online.winRate}
            accuracyPct={progress.online.accuracyPct}
            avgPlace={progress.online.avgPlace}
            emptyHint={t('cabinet.progOnlineEmpty')}
            tone="online"
          />
        </div>
      </StatFold>

      <StatFold
        title={t('cabinet.progFoldDash')}
        peek={dashPeek}
        preview={
          seriesVals.length >= 1 || hasChannelDash ? (
            <DashFoldPreview
              series={seriesVals}
              trendShort={accTrendShort}
              onlineWinRate={progress.online.winRate}
              offlineWinRate={progress.offline.winRate}
            />
          ) : undefined
        }
        open={openFold === 'dash'}
        onToggle={() => toggle('dash')}
        tone="lime"
      >
        {showDashBody ? (
          <div className="prog-dash">
            {hasChannelDash ? (
              <div className="prog-trend">
                <div className="prog-trend__top">
                  <span className="prog-trend__label">{t('cabinet.progDashChannelsTitle')}</span>
                </div>
                <div className="prog-compare-meters">
                  {progress.offline.matches > 0 ? (
                    <MeterBar
                      value={progress.offline.winRate ?? 0}
                      label={`${t('cabinet.progOffline')} ${progress.offline.wins}/${progress.offline.matches}`}
                      tone="cyan"
                    />
                  ) : null}
                  {progress.online.matches > 0 ? (
                    <MeterBar
                      value={progress.online.winRate ?? 0}
                      label={`${t('cabinet.progOnline')} ${progress.online.wins}/${progress.online.matches}`}
                      tone="magenta"
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            {seriesVals.length >= 1 || accTrendText || placeTrendText ? (
              <div className="prog-trend">
                <div className="prog-trend__top">
                  <span className="prog-trend__label">{t('cabinet.progTrendTitle')}</span>
                  <ProgressSparkline values={seriesVals} />
                </div>
                {accTrendText ? <p className="prog-trend__line">{accTrendText}</p> : null}
                {placeTrendText ? <p className="prog-trend__line">{placeTrendText}</p> : null}
                {trend.recentMatches > 0 && trend.previousMatches > 0 ? (
                  <p className="prog-trend__hint">
                    {t('cabinet.progTrendWindow', {
                      recent: trend.recentMatches,
                      prev: trend.previousMatches,
                    })}
                  </p>
                ) : seriesVals.length >= 1 ? (
                  <p className="prog-trend__hint">{t('cabinet.progTrendNeedMore')}</p>
                ) : null}
                {trend.recentAccuracy != null && trend.previousAccuracy != null ? (
                  <div className="prog-compare-meters">
                    <MeterBar
                      value={trend.previousAccuracy}
                      label={t('cabinet.progMeterPrev')}
                      tone="violet"
                    />
                    <MeterBar
                      value={trend.recentAccuracy}
                      label={t('cabinet.progMeterRecent')}
                      tone="lime"
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {seriesVals.length >= 1 || placePoints.length >= 1 ? (
              <div className="prog-dash__charts">
                {seriesVals.length >= 1 ? (
                  <div className="prog-dash__chart">
                    <div className="prog-dash__chart-title">{t('cabinet.progChartAcc')}</div>
                    <AccuracyBars points={recentPoints} />
                  </div>
                ) : null}
                {placePoints.length >= 1 ? (
                  <div className="prog-dash__chart">
                    <div className="prog-dash__chart-title">{t('cabinet.progChartPlace')}</div>
                    <PlaceBars points={placePoints} />
                  </div>
                ) : null}
              </div>
            ) : null}

            {seriesVals.length < 2 && hasChannelDash ? (
              <p className="prog-trend__hint">{t('cabinet.progDashArchiveHint')}</p>
            ) : null}
          </div>
        ) : (
          <p className="prog-fold-empty">{t('cabinet.progDashEmpty')}</p>
        )}
      </StatFold>

      <StatFold
        title={t('cabinet.progFoldLevels')}
        peek={elo != null ? `ELO ${elo}` : undefined}
        preview={
          <LevelsFoldPreview
            elo={elo}
            rank={ladderMe?.rank}
            progressPct={tierProg?.progressInTier ?? null}
            tierName={tierProg ? tierLabel(t, tierProg.tier.id) : null}
          />
        }
        open={openFold === 'levels'}
        onToggle={() => toggle('levels')}
        tone="violet"
      >
        <div className="prog-ladder">
          {tierProg && elo != null ? (
            <>
              <div className="prog-ladder__you">
                <span className="prog-ladder__elo">{elo}</span>
                <span className="prog-ladder__tier">{tierLabel(t, tierProg.tier.id)}</span>
                {ladderMe?.rank != null ? (
                  <span className="prog-ladder__rank">#{ladderMe.rank}</span>
                ) : null}
              </div>
              {tierProg.next && tierProg.pointsToNext != null ? (
                <div className="prog-ladder__track">
                  <div className="prog-ladder__bar-wrap">
                    <div
                      className="prog-ladder__bar"
                      style={{ width: `${Math.round(tierProg.progressInTier * 100)}%` }}
                    />
                  </div>
                  <span className="prog-ladder__bar-hint">
                    {t('cabinet.progNextTier', {
                      n: tierProg.pointsToNext,
                      tier: tierLabel(t, tierProg.next.id),
                    })}
                  </span>
                </div>
              ) : (
                <p className="prog-ladder__bar-hint">{t('cabinet.progTopTier')}</p>
              )}
              {ladderMedianElo != null ? (
                <>
                  <p className="prog-compare">
                    {elo >= ladderMedianElo
                      ? t('cabinet.progVsMedianAbove', { n: elo - ladderMedianElo })
                      : t('cabinet.progVsMedianBelow', { n: ladderMedianElo - elo })}
                  </p>
                  <div className="prog-compare-meters">
                    <MeterBar
                      value={Math.min(100, (ladderMedianElo / 1600) * 100)}
                      label={t('cabinet.progMeterField')}
                      tone="violet"
                    />
                    <MeterBar
                      value={Math.min(100, (elo / 1600) * 100)}
                      label={t('cabinet.progMeterYou')}
                      tone="cyan"
                    />
                  </div>
                </>
              ) : null}
              {onOpenLeaderboard ? (
                <button type="button" className="prog-ladder__cta" onClick={onOpenLeaderboard}>
                  <span className="prog-ladder__cta-glow" aria-hidden="true" />
                  {t('cabinet.leaderboard')}
                </button>
              ) : null}
            </>
          ) : (
            <p className="prog-ladder__gate">{t('cabinet.progLevelsGate')}</p>
          )}

          <ul className="prog-tiers">
            {ELO_TIERS.map((tier) => {
              const active = tierProg?.tier.id === tier.id;
              const range =
                tier.maxElo == null
                  ? `${tier.minElo}+`
                  : `${tier.minElo}–${tier.maxElo - 1}`;
              return (
                <li
                  key={tier.id}
                  className={['prog-tiers__row', active ? 'prog-tiers__row--active' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span className="prog-tiers__name">{tierLabel(t, tier.id)}</span>
                  <span className="prog-tiers__elo">{range}</span>
                </li>
              );
            })}
          </ul>
          <p className="prog-ladder__note">{t('cabinet.progLevelsNote')}</p>
        </div>
      </StatFold>

      <StatFold
        title={t('cabinet.progFoldDeals')}
        peek={dealsPeek}
        preview={
          bestDeal || progress.worstDeals[0] ? (
            <DealsFoldPreview best={bestDeal} worst={progress.worstDeals[0]} />
          ) : undefined
        }
        open={openFold === 'deals'}
        onToggle={() => toggle('deals')}
        tone="gold"
      >
        {progress.bestDeals.length > 0 || progress.worstDeals.length > 0 ? (
          <>
            <div className="prog-highlights">
              <DealList title={t('cabinet.progBestDeals')} items={progress.bestDeals} tone="best" />
              <DealList title={t('cabinet.progWorstDeals')} items={progress.worstDeals} tone="worst" />
            </div>
            <p className="prog-panel__premium">{t('cabinet.progPremiumHint')}</p>
          </>
        ) : (
          <p className="prog-fold-empty">{t('cabinet.progDealsEmpty')}</p>
        )}
      </StatFold>
      </>
      ) : null}
    </div>
  );
}
