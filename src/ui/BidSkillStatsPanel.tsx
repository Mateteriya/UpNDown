/**
 * Персональный skill-блок: точность / характер / недобор·перебор / инсайты.
 * @see docs/METRICS-MAP-V1.md
 */

import { useState, type CSSProperties } from 'react';
import type { BidStyleFlavor, DealSkillSummary } from '../game/playerSkillStats';
import { buildMatchSkillInsight } from '../game/playerSkillStats';
import type { LocalSkillView } from '../game/localSkillCache';
import type { MatchHighlight } from '../game/matchHighlights';
import { useT, type TFunc } from '../i18n';

function styleTitle(t: TFunc, style: LocalSkillView['style']): string {
  switch (style) {
    case 'sniper':
      return t('cabinet.skillStyleSniper');
    case 'hunter':
      return t('cabinet.skillStyleHunter');
    case 'cautious':
      return t('cabinet.skillStyleCautious');
    case 'chaotic':
      return t('cabinet.skillStyleChaotic');
    case 'learning':
      return t('cabinet.skillStyleLearning');
    default:
      return t('cabinet.skillStyleBalanced');
  }
}

function styleBlurb(t: TFunc, style: LocalSkillView['style']): string {
  switch (style) {
    case 'sniper':
      return t('cabinet.skillStyleSniperBlurb');
    case 'hunter':
      return t('cabinet.skillStyleHunterBlurb');
    case 'cautious':
      return t('cabinet.skillStyleCautiousBlurb');
    case 'chaotic':
      return t('cabinet.skillStyleChaoticBlurb');
    case 'learning':
      return t('cabinet.skillStyleLearningBlurb');
    default:
      return t('cabinet.skillStyleBalancedBlurb');
  }
}

function styleLong(t: TFunc, style: LocalSkillView['style']): string {
  switch (style) {
    case 'sniper':
      return t('cabinet.skillStyleSniperLong');
    case 'hunter':
      return t('cabinet.skillStyleHunterLong');
    case 'cautious':
      return t('cabinet.skillStyleCautiousLong');
    case 'chaotic':
      return t('cabinet.skillStyleChaoticLong');
    case 'learning':
      return t('cabinet.skillStyleLearningLong');
    default:
      return t('cabinet.skillStyleBalancedLong');
  }
}

function styleTip(t: TFunc, style: LocalSkillView['style']): string {
  switch (style) {
    case 'sniper':
      return t('cabinet.skillStyleSniperTip');
    case 'hunter':
      return t('cabinet.skillStyleHunterTip');
    case 'cautious':
      return t('cabinet.skillStyleCautiousTip');
    case 'chaotic':
      return t('cabinet.skillStyleChaoticTip');
    case 'learning':
      return t('cabinet.skillStyleLearningTip');
    default:
      return t('cabinet.skillStyleBalancedTip');
  }
}

const FLAVOR_KEYS: Record<BidStyleFlavor, string> = {
  learning: 'skillFlavorLearning',
  precision_minimalist: 'skillFlavorPrecisionMinimalist',
  precision_bold: 'skillFlavorPrecisionBold',
  precision_pure: 'skillFlavorPrecisionPure',
  hunter_sharp: 'skillFlavorHunterSharp',
  hunter_wild: 'skillFlavorHunterWild',
  cautious_tight: 'skillFlavorCautiousTight',
  cautious_soft: 'skillFlavorCautiousSoft',
  chaos_recovering: 'skillFlavorChaosRecovering',
  chaos_storm: 'skillFlavorChaosStorm',
  balanced_flex: 'skillFlavorBalancedFlex',
  balanced_steady: 'skillFlavorBalancedSteady',
};

function flavorTitle(t: TFunc, flavor: BidStyleFlavor): string {
  return t(`cabinet.${FLAVOR_KEYS[flavor]}` as 'cabinet.skillFlavorLearning');
}

function biasLine(t: TFunc, view: LocalSkillView): string | null {
  if (view.dealTotal < 8) return null;
  switch (view.bias) {
    case 'over':
      return t('cabinet.skillBiasOver', {
        over: view.overPct ?? 0,
        under: view.underPct ?? 0,
      });
    case 'under':
      return t('cabinet.skillBiasUnder', {
        under: view.underPct ?? 0,
        over: view.overPct ?? 0,
      });
    case 'exact':
      return t('cabinet.skillBiasExact');
    default:
      return t('cabinet.skillBiasMixed');
  }
}

export function BidSkillLifetimeRow({
  view,
  compact,
  showPremiumHint,
}: {
  view: LocalSkillView;
  compact?: boolean;
  showPremiumHint?: boolean;
}) {
  const t = useT();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const exactW = view.exactPct ?? 0;
  const underW = view.underPct ?? 0;
  const overW = view.overPct ?? 0;
  const bias = biasLine(t, view);
  const hasSkill = view.dealTotal > 0 || view.avgPlace != null || view.accuracyPct != null;

  if (!hasSkill && !compact) {
    return (
      <div className="bid-skill bid-skill--profile bid-skill--empty stat-hud--alive">
        <div className="stat-hud__chrome" aria-hidden="true">
          <span className="stat-hud__led" />
          <span className="stat-hud__eyebrow">{t('cabinet.skillTitle')}</span>
        </div>
        <p className="bid-skill__empty">{t('cabinet.skillEmptyHint')}</p>
        <p className="bid-skill__empty bid-skill__empty--soft">{t('cabinet.skillEmptyDeviceHint')}</p>
      </div>
    );
  }

  if (!hasSkill) return null;

  if (compact) {
    return (
      <div className="bid-skill bid-skill--compact">
        {view.accuracyPct != null ? (
          <div className="bid-skill__match-line">
            <strong>{view.accuracyPct}%</strong>
            <span>{t('cabinet.skillHeroSub')}</span>
          </div>
        ) : null}
        {view.dealTotal > 0 ? (
          <div className="bid-skill__bar" aria-hidden="true">
            <span className="bid-skill__bar-seg bid-skill__bar-seg--exact" style={{ flex: exactW || 0.001 }} />
            <span className="bid-skill__bar-seg bid-skill__bar-seg--under" style={{ flex: underW || 0.001 }} />
            <span className="bid-skill__bar-seg bid-skill__bar-seg--over" style={{ flex: overW || 0.001 }} />
          </div>
        ) : null}
        <div className="bid-skill__meta">
          {view.avgPlace != null ? (
            <span className="bid-skill__meta-item">
              {t('cabinet.skillAvgPlace')}: <strong>{view.avgPlace}</strong>
            </span>
          ) : null}
          {view.bestExactStreak > 0 ? (
            <span className="bid-skill__meta-item">
              {t('cabinet.skillBestStreak')}: <strong>{view.bestExactStreak}</strong>
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="bid-skill bid-skill--profile stat-hud--alive">
      <span className="stat-hud__corner stat-hud__corner--tl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--tr" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--bl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--br" aria-hidden="true" />
      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led stat-hud__led--pulse" />
        <span className="stat-hud__eyebrow">{t('cabinet.skillTitle')}</span>
        <span className="stat-hud__diodes" aria-hidden="true">
          <i /><i /><i /><i /><i />
        </span>
        <span className="stat-hud__sheen" />
      </div>

      <div className="bid-skill__hero">
        <button
          type="button"
          className="bid-skill__hero-ring bid-skill__hero-ring--btn"
          style={
            view.accuracyPct != null
              ? ({ ['--acc']: String(view.accuracyPct) } as CSSProperties)
              : undefined
          }
          aria-expanded={detailsOpen}
          aria-label={t('cabinet.skillHeroToggleAria')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDetailsOpen((v) => !v);
          }}
        >
          <div className="bid-skill__hero-ring-glow" aria-hidden="true" />
          <div className="bid-skill__hero-pct">
            {view.accuracyPct != null ? `${view.accuracyPct}%` : '—'}
          </div>
        </button>
        <div className="bid-skill__hero-text">
          <div className="bid-skill__hero-label">{t('cabinet.skillHeroLabel')}</div>
          {view.dealTotal > 0 ? (
            <p className="bid-skill__hero-sub">
              {t('cabinet.skillHeroDetail', {
                exact: view.rating.exactDeals,
                total: view.dealTotal,
              })}
            </p>
          ) : (
            <p className="bid-skill__hero-sub">{t('cabinet.skillHeroSub')}</p>
          )}
        </div>
      </div>

      {view.bestExactStreak > 0 || view.currentExactStreak > 0 ? (
        <button
          type="button"
          className={[
            'bid-skill__streak-peek',
            view.currentExactStreak > 0 ? 'bid-skill__streak-peek--live' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={detailsOpen}
          aria-label={t('cabinet.skillStreakOpenAria')}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDetailsOpen(true);
          }}
        >
          <span className="bid-skill__streak-peek-n" aria-hidden="true">
            {view.bestExactStreak > 0 ? view.bestExactStreak : view.currentExactStreak}
          </span>
          <span className="bid-skill__streak-peek-copy">
            <strong>{t('cabinet.skillBestStreak')}</strong>
            <em>{t('cabinet.skillStreakHint')}</em>
          </span>
          {view.currentExactStreak > 0 ? (
            <span className="bid-skill__streak-peek-live">
              {t('cabinet.skillStreakLive', { n: view.currentExactStreak })}
            </span>
          ) : null}
        </button>
      ) : null}

      {view.dealTotal > 0 ? (
        <>
          <div className="bid-skill__bar" role="img" aria-label={t('cabinet.skillBarAria')}>
            <span className="bid-skill__bar-seg bid-skill__bar-seg--exact" style={{ flex: exactW || 0.001 }} />
            <span className="bid-skill__bar-seg bid-skill__bar-seg--under" style={{ flex: underW || 0.001 }} />
            <span className="bid-skill__bar-seg bid-skill__bar-seg--over" style={{ flex: overW || 0.001 }} />
          </div>
          <div className="bid-skill__split" role="list">
            <div className="bid-skill__pill bid-skill__pill--exact" role="listitem">
              <span className="bid-skill__pill-led" aria-hidden="true" />
              <span className="bid-skill__pill-value">{exactW}%</span>
              <span className="bid-skill__pill-label">{t('cabinet.skillExact')}</span>
              <span className="bid-skill__pill-count">
                {t('cabinet.skillDealsCount', { n: view.rating.exactDeals })}
              </span>
            </div>
            <div className="bid-skill__pill bid-skill__pill--under" role="listitem">
              <span className="bid-skill__pill-led" aria-hidden="true" />
              <span className="bid-skill__pill-value">{underW}%</span>
              <span className="bid-skill__pill-label">{t('cabinet.skillUnder')}</span>
              <span className="bid-skill__pill-count">
                {t('cabinet.skillDealsCount', { n: view.rating.underDeals })}
              </span>
            </div>
            <div className="bid-skill__pill bid-skill__pill--over" role="listitem">
              <span className="bid-skill__pill-led" aria-hidden="true" />
              <span className="bid-skill__pill-value">{overW}%</span>
              <span className="bid-skill__pill-label">{t('cabinet.skillOver')}</span>
              <span className="bid-skill__pill-count">
                {t('cabinet.skillDealsCount', { n: view.rating.overDeals })}
              </span>
            </div>
          </div>
        </>
      ) : null}

      <button
        type="button"
        className={`bid-skill__more ${detailsOpen ? 'bid-skill__more--open' : ''}`}
        aria-expanded={detailsOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDetailsOpen((v) => !v);
        }}
      >
        <span className="bid-skill__more-led" aria-hidden="true" />
        <span className="bid-skill__more-label">
          {detailsOpen ? t('cabinet.skillDetailsHide') : t('cabinet.skillDetailsShow')}
        </span>
        <span className="bid-skill__more-peek">
          {[
            styleTitle(t, view.style),
            view.bestExactStreak > 0
              ? t('cabinet.skillPeekStreak', { n: view.bestExactStreak })
              : null,
            view.avgPlace != null ? `⌀${view.avgPlace}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="bid-skill__more-chev" aria-hidden="true" />
      </button>

      <div className={`bid-skill__details${detailsOpen ? ' is-open' : ''}`} aria-hidden={!detailsOpen}>
        {detailsOpen ? (
          <>
          <div className="bid-skill__taxonomy" aria-label={t('cabinet.skillTaxonomyTitle')}>
            <strong className="bid-skill__taxonomy-title">{t('cabinet.skillTaxonomyTitle')}</strong>
            <p className="bid-skill__taxonomy-lead">{t('cabinet.skillTaxonomyLead')}</p>
            <ul className="bid-skill__taxonomy-list">
              <li data-active={view.style === 'sniper' ? '1' : '0'}>{t('cabinet.skillTaxonomyItemSniper')}</li>
              <li data-active={view.style === 'hunter' ? '1' : '0'}>{t('cabinet.skillTaxonomyItemHunter')}</li>
              <li data-active={view.style === 'cautious' ? '1' : '0'}>{t('cabinet.skillTaxonomyItemCautious')}</li>
              <li data-active={view.style === 'chaotic' ? '1' : '0'}>{t('cabinet.skillTaxonomyItemChaotic')}</li>
              <li data-active={view.style === 'balanced' ? '1' : '0'}>{t('cabinet.skillTaxonomyItemBalanced')}</li>
            </ul>
          </div>

          <div className={`bid-skill__style bid-skill__style--${view.style} bid-skill__style--hero`}>
            <span className="bid-skill__style-tag" aria-hidden="true">
              ID
            </span>
            <div className="bid-skill__style-body">
              <span className="bid-skill__style-kicker">{t('cabinet.skillTaxonomyTitle')}</span>
              <span className="bid-skill__style-name">{styleTitle(t, view.style)}</span>
              <span className="bid-skill__style-flavor">{flavorTitle(t, view.flavor)}</span>
              <span className="bid-skill__style-blurb">{styleBlurb(t, view.style)}</span>
              <span className="bid-skill__style-long">{styleLong(t, view.style)}</span>
              <span className="bid-skill__style-tip">{styleTip(t, view.style)}</span>
            </div>
            <span className="bid-skill__style-pulse" aria-hidden="true" />
          </div>

          {bias ? <p className="bid-skill__insight">{bias}</p> : null}

          {view.dealTotal > 0 ? (
          <div className="bid-skill__meters">
            <div className="stat-meter stat-meter--violet">
              <div className="stat-meter__row">
                <span className="stat-meter__label">{t('cabinet.skillExact')}</span>
                <span className="stat-meter__value">{exactW}%</span>
              </div>
              <div className="stat-meter__track">
                <div className="stat-meter__fill" style={{ width: `${exactW}%` }} />
              </div>
            </div>
            <div className="stat-meter stat-meter--cyan">
              <div className="stat-meter__row">
                <span className="stat-meter__label">{t('cabinet.skillUnder')}</span>
                <span className="stat-meter__value">{underW}%</span>
              </div>
              <div className="stat-meter__track">
                <div className="stat-meter__fill" style={{ width: `${underW}%` }} />
              </div>
            </div>
            <div className="stat-meter stat-meter--magenta">
              <div className="stat-meter__row">
                <span className="stat-meter__label">{t('cabinet.skillOver')}</span>
                <span className="stat-meter__value">{overW}%</span>
              </div>
              <div className="stat-meter__track">
                <div className="stat-meter__fill" style={{ width: `${overW}%` }} />
              </div>
            </div>
          </div>
          ) : (
            <p className="bid-skill__empty">{t('cabinet.skillEmptyHint')}</p>
          )}

          <p className="bid-skill__grid-lead">{t('cabinet.skillGridLead')}</p>
          <div className="bid-skill__grid">
            {view.avgPlace != null ? (
              <div className="bid-skill__grid-cell bid-skill__grid-cell--cyan">
                <span className="bid-skill__grid-value">{view.avgPlace}</span>
                <span className="bid-skill__grid-label">{t('cabinet.skillAvgPlace')}</span>
                <span className="bid-skill__grid-hint">{t('cabinet.skillAvgPlaceHint')}</span>
              </div>
            ) : null}
            {view.bestExactStreak > 0 ? (
              <div className="bid-skill__grid-cell bid-skill__grid-cell--violet">
                <span className="bid-skill__grid-value">{view.bestExactStreak}</span>
                <span className="bid-skill__grid-label">{t('cabinet.skillBestStreak')}</span>
                <span className="bid-skill__grid-hint">{t('cabinet.skillStreakHint')}</span>
              </div>
            ) : null}
            {view.currentExactStreak > 0 ? (
              <div className="bid-skill__grid-cell bid-skill__grid-cell--gold">
                <span className="bid-skill__grid-value">{view.currentExactStreak}</span>
                <span className="bid-skill__grid-label">{t('cabinet.skillCurrentStreak')}</span>
                <span className="bid-skill__grid-hint">{t('cabinet.skillCurrentStreakHint')}</span>
              </div>
            ) : null}
            {view.matchesShown > 0 ? (
              <div className="bid-skill__grid-cell bid-skill__grid-cell--magenta">
                <span className="bid-skill__grid-value">
                  {view.winsShown}/{view.matchesShown}
                </span>
                <span className="bid-skill__grid-label">{t('cabinet.skillWinsMatches')}</span>
                <span className="bid-skill__grid-hint">
                  {view.winRateShown != null
                    ? t('cabinet.skillWinRateHint', { n: view.winRateShown })
                    : t('cabinet.skillFromArchive')}
                </span>
              </div>
            ) : null}
          </div>

          {showPremiumHint ? (
            <p className="bid-skill__premium-hint">{t('cabinet.skillPremiumHint')}</p>
          ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function celebrationText(t: TFunc, h: MatchHighlight): string {
  if (h.kind === 'party_score' && h.tier) {
    return t(`cabinet.highlight.${h.labelKey}` as 'cabinet.highlight.scoreTierMini', {
      n: h.value,
    });
  }
  if (h.kind === 'exact_deal') {
    return t(`cabinet.highlight.${h.labelKey}` as 'cabinet.highlight.exactDeal10', {
      n: h.value,
    });
  }
  if (h.kind === 'perfect_party') {
    return t('cabinet.highlight.perfectParty', { n: h.value });
  }
  if (h.kind === 'exact_streak') {
    return t('cabinet.highlight.exactStreak', { n: h.value });
  }
  return t('cabinet.highlight.generic');
}

export function MatchBidSkillInsight({
  match,
  deviceAccuracyPct,
  compact,
  celebration,
}: {
  match: DealSkillSummary;
  deviceAccuracyPct: number | null;
  compact?: boolean;
  celebration?: MatchHighlight | null;
}) {
  const t = useT();
  if (match.deals <= 0 && !celebration) return null;

  const insight = match.deals > 0 ? buildMatchSkillInsight(match, deviceAccuracyPct) : null;
  let insightText: string | null = null;
  if (insight?.kind === 'perfect') {
    insightText = t('gameOver.skillInsightPerfect');
  } else if (insight?.kind === 'vs_avg' && insight.deltaVsAvg != null && insight.deltaVsAvg !== 0) {
    const d = insight.deltaVsAvg;
    insightText =
      d > 0
        ? t('gameOver.skillInsightAboveAvg', { n: Math.abs(d) })
        : t('gameOver.skillInsightBelowAvg', { n: Math.abs(d) });
  } else if (insight?.kind === 'worst_miss' && insight.worstMiss) {
    const w = insight.worstMiss;
    insightText = t('gameOver.skillInsightWorst', {
      deal: w.dealNumber,
      bid: w.bid,
      taken: w.taken,
    });
  }

  return (
    <div className={['bid-skill', 'bid-skill--match', compact ? 'bid-skill--compact' : ''].filter(Boolean).join(' ')}>
      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led" />
        <span className="stat-hud__eyebrow">{t('gameOver.skillMatchTitle')}</span>
      </div>
      {celebration ? (
        <p className="bid-skill__celebration" role="status">
          {celebrationText(t, celebration)}
        </p>
      ) : null}
      {match.deals > 0 ? (
        <div className="bid-skill__match-line">
          <strong>{match.accuracyPct}%</strong>
          <span>
            {t('gameOver.skillMatchSplit', {
              exact: match.exact,
              under: match.under,
              over: match.over,
            })}
          </span>
        </div>
      ) : null}
      {insightText ? <p className="bid-skill__insight">{insightText}</p> : null}
    </div>
  );
}
