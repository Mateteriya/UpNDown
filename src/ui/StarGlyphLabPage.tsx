/**
 * Лаборатория умных глифов ★ по тирам баланса.
 * URL: /star-glyph-lab (devMode) — смотреть все варианты до полировки в игре.
 */

import { STAR_GLYPH_TIER_LAB_SAMPLES } from '../game/starGlyphTier';
import { getLocale } from '../i18n';
import { StarBrandGlyph } from './StarBrandGlyph';
import { StarsBalanceBadge } from './StarsBalanceBadge';
import '../styles/star-glyph-tiers.css';

type Props = { onBack: () => void };

export function StarGlyphLabPage({ onBack }: Props) {
  const ru = getLocale() === 'ru';

  return (
    <main className="star-glyph-lab">
      <div className="star-glyph-lab__top">
        <button type="button" className="star-glyph-lab__back" onClick={onBack}>
          ← Меню
        </button>
        <span style={{ fontSize: 11, opacity: 0.7 }}>локальный тест · не прод</span>
      </div>
      <h1 className="star-glyph-lab__title">Star glyph lab</h1>
      <p className="star-glyph-lab__lead">
        Все тиры «умной» звезды до внедрения в стол. На бейдже — только глиф; клик открывает
        поповер с числом (как у себя и у оппонентов). Диапазоны: 0 · 1–9 · 10–100 · 101–999 ·
        1000–9999 · 10000+.
      </p>
      <div className="star-glyph-lab__grid">
        {STAR_GLYPH_TIER_LAB_SAMPLES.map((row) => (
          <article key={row.tier} className="star-glyph-lab__card">
            <div className="star-glyph-lab__stage">
              <StarBrandGlyph size={52} tier={row.tier} balance={row.sample} />
              <StarsBalanceBadge
                size="sm"
                balance={row.sample}
                forceTier={row.tier}
                interactive
              />
              <StarsBalanceBadge
                className="stars-badge--south-rail-vertical"
                size="sm"
                balance={row.sample}
                forceTier={row.tier}
                interactive
              />
            </div>
            <div className="star-glyph-lab__meta">
              <span className="star-glyph-lab__range">{row.rangeLabel}</span>
              <span className="star-glyph-lab__name">
                {ru ? row.titleRu : row.titleEn}
              </span>
              <span className="star-glyph-lab__blurb">
                {ru ? row.blurbRu : row.blurbEn}
              </span>
            </div>
            <div className="star-glyph-lab__row">
              <span className="star-glyph-lab__row-label">sample balance</span>
              <span style={{ fontFamily: 'var(--font-pororoca, monospace)', fontWeight: 700 }}>
                ★ {row.sample}
              </span>
            </div>
          </article>
        ))}
      </div>
      <p className="star-glyph-lab__hint">
        Кликните бейдж на карточке — в поповере видно число. Правки тиров: StarBrandGlyph +
        star-glyph-tiers.css + starGlyphTier.ts.
      </p>
    </main>
  );
}
