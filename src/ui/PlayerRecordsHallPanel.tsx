/**
 * Личный «Зал рекордов» в ЛК: bests + тиры + лента.
 */

import { useEffect, useState } from 'react';
import { PARTY_SCORE_TIERS, type PartyScoreTierId } from '../game/matchHighlights';
import {
  ensureRecordsBackfill,
  isFeedWorthyHighlight,
  loadPlayerRecords,
  type PlayerRecordsStore,
  type RecordFeedItem,
} from '../game/playerRecords';
import { getPlayerProfile } from '../game/persistence';
import { useT } from '../i18n';

const TIER_ORDER: PartyScoreTierId[] = [
  'mini',
  'success',
  'great',
  'rare',
  'legendary',
  'incredible',
  'mythic',
  'unreal',
];

function feedLabel(
  t: ReturnType<typeof useT>,
  item: RecordFeedItem,
): string {
  return t(`cabinet.highlight.${item.labelKey}` as 'cabinet.highlight.generic', {
    n: item.value,
  });
}

export function PlayerRecordsHallPanel({
  compact,
  onOpenMatch,
  /** Без аккаунта не показываем онлайн-моменты из прошлой сессии входа */
  showOnlineMoments = true,
}: {
  compact?: boolean;
  /** Переход к партии в архиве ЛК */
  onOpenMatch?: (matchRef: string) => void;
  showOnlineMoments?: boolean;
}) {
  const t = useT();
  const [store, setStore] = useState<PlayerRecordsStore>(() => loadPlayerRecords());
  const [panelOpen, setPanelOpen] = useState(() => !compact);

  const feedVisible = store.feed.filter((item) => {
    if (!isFeedWorthyHighlight(item)) return false;
    if (!showOnlineMoments && item.source === 'online') return false;
    return true;
  });

  useEffect(() => {
    const pid = getPlayerProfile().profileId ?? '';
    let cancelled = false;
    const reload = () => {
      void ensureRecordsBackfill(pid).then((s) => {
        if (!cancelled) setStore(s);
      });
    };
    reload();
    const onRefresh = () => {
      if (!cancelled) setStore(loadPlayerRecords(pid));
    };
    window.addEventListener('upndown:records-refresh', onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener('upndown:records-refresh', onRefresh);
    };
  }, []);

  const hasAnything =
    store.bestPartyScore > 0 ||
    store.bestExactBid > 0 ||
    feedVisible.length > 0 ||
    store.perfectParties > 0;

  const maxTierCount = Math.max(1, ...TIER_ORDER.map((id) => store.scoreTierCounts[id] ?? 0));

  const openItem = (item: RecordFeedItem) => {
    if (!item.matchRef || !onOpenMatch) return;
    onOpenMatch(item.matchRef);
  };

  return (
    <section
      className={[
        'records-hall',
        compact ? 'records-hall--compact' : '',
        panelOpen ? 'records-hall--open' : 'records-hall--collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('cabinet.recordsTitle')}
    >
      <header className="records-hall__head">
        <button
          type="button"
          className="records-hall__head-toggle"
          aria-expanded={panelOpen}
          aria-controls="records-hall-body"
          aria-label={panelOpen ? t('cabinet.recordsCollapse') : t('cabinet.recordsExpand')}
          title={t('cabinet.recordsToggle')}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="records-hall__head-main">
            <span className="records-hall__chrome" aria-hidden="true">
              <span className="records-hall__led" />
              <span className="records-hall__eyebrow">{t('cabinet.recordsEyebrow')}</span>
            </span>
            <h3 className="records-hall__title">{t('cabinet.recordsTitle')}</h3>
            {!panelOpen ? (
              <span className="records-hall__peek">
                {store.bestPartyScore > 0
                  ? t('cabinet.recordsPeekBest', { n: store.bestPartyScore })
                  : t('cabinet.recordsPeekIdle')}
              </span>
            ) : null}
          </span>
          <span className="records-hall__head-chev" aria-hidden="true" data-open={panelOpen ? '1' : '0'} />
        </button>
        {panelOpen ? <p className="records-hall__lead">{t('cabinet.recordsLead')}</p> : null}
      </header>

      <div
        id="records-hall-body"
        className={['records-hall__body', panelOpen ? 'is-open' : ''].join(' ')}
        hidden={!panelOpen}
        aria-hidden={!panelOpen}
      >
        {!hasAnything ? (
          <p className="records-hall__empty">{t('cabinet.recordsEmpty')}</p>
        ) : (
          <>
            <div className="records-hall__kpis" role="list">
              <div className="records-hall__kpi" role="listitem">
                <strong>{store.bestPartyScore || '—'}</strong>
                <span>{t('cabinet.recordsBestScore')}</span>
              </div>
              <div className="records-hall__kpi" role="listitem">
                <strong>
                  {store.bestExactBid > 0 ? `${store.bestExactBid}/${store.bestExactBid}` : '—'}
                </strong>
                <span>{t('cabinet.recordsBestExact')}</span>
              </div>
              <div className="records-hall__kpi" role="listitem">
                <strong>{store.bestPartyExactStreak || '—'}</strong>
                <span>{t('cabinet.recordsBestStreak')}</span>
              </div>
              <div className="records-hall__kpi" role="listitem">
                <strong>{store.exactDeal10Count}</strong>
                <span>{t('cabinet.recordsExact10')}</span>
              </div>
              <div className="records-hall__kpi" role="listitem">
                <strong>{store.exactDealBigCount}</strong>
                <span>{t('cabinet.recordsExactBig')}</span>
              </div>
              <div className="records-hall__kpi" role="listitem">
                <strong>{store.perfectParties}</strong>
                <span>{t('cabinet.recordsPerfect')}</span>
              </div>
            </div>

            <div className="records-hall__tiers">
              <div className="records-hall__tiers-label">{t('cabinet.recordsTierChart')}</div>
              <ul className="records-hall__tier-bars">
                {TIER_ORDER.map((id) => {
                  const n = store.scoreTierCounts[id] ?? 0;
                  const min = PARTY_SCORE_TIERS.find((x) => x.id === id)?.min ?? 0;
                  return (
                    <li key={id} className={`records-hall__tier records-hall__tier--${id}`}>
                      <span className="records-hall__tier-min">{min}+</span>
                      <span className="records-hall__tier-track">
                        <span
                          className="records-hall__tier-fill"
                          style={{ width: `${Math.round((n / maxTierCount) * 100)}%` }}
                        />
                      </span>
                      <span className="records-hall__tier-n">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {feedVisible.length > 0 ? (
              <div className="records-hall__feed">
                <div className="records-hall__feed-label">{t('cabinet.recordsFeed')}</div>
                <ul className="records-hall__feed-list">
                  {feedVisible.slice(0, compact ? 5 : 12).map((item) => {
                    const canOpen = Boolean(item.matchRef && onOpenMatch);
                    return (
                      <li key={item.id} className="records-hall__feed-item">
                        {canOpen ? (
                          <button
                            type="button"
                            className="records-hall__feed-btn"
                            onClick={() => openItem(item)}
                            title={t('cabinet.recordsOpenMatch')}
                          >
                            <span className="records-hall__feed-text">{feedLabel(t, item)}</span>
                            <span className="records-hall__feed-meta">
                              {item.source === 'online'
                                ? t('cabinet.recordsSourceOnline')
                                : t('cabinet.recordsSourceOffline')}
                              {' · '}
                              {t('cabinet.recordsOpenMatch')}
                            </span>
                          </button>
                        ) : (
                          <>
                            <span className="records-hall__feed-text">{feedLabel(t, item)}</span>
                            <span className="records-hall__feed-meta">
                              {item.source === 'online'
                                ? t('cabinet.recordsSourceOnline')
                                : t('cabinet.recordsSourceOffline')}
                            </span>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
