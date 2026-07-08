import type { CSSProperties } from 'react';
import { kidDealKind } from '../../cosmogenesis/kidTypes';
import { ELEMENTS, ELEMENT_SHOWCASE, POWER_MAX, type ElementMeta } from '../../cosmogenesis/theme';

/** Сияющие «заряды» силы — вместо цифры */
export function PowerCharge({
  power,
  meta,
  compact,
}: {
  power: number;
  meta: ElementMeta;
  compact?: boolean;
}) {
  return (
    <div
      className={`cosmo-charge${compact ? ' cosmo-charge--compact' : ''}`}
      aria-hidden
      style={{ '--charge-color': meta.color, '--charge-glow': meta.glow } as CSSProperties}
    >
      {Array.from({ length: POWER_MAX }, (_, i) => (
        <span
          key={i}
          className={`cosmo-charge__pip${i < power ? ' cosmo-charge__pip--lit' : ''}${i >= 3 ? ' cosmo-charge__pip--strong' : ''}`}
        />
      ))}
    </div>
  );
}

/** Иконка стихии — CSS-форма, не emoji */
export function ElementIcon({ meta, large }: { meta: ElementMeta; large?: boolean }) {
  return (
    <span
      className={`cosmo-icon ${meta.iconClass}${large ? ' cosmo-icon--large' : ''}`}
      style={{ '--icon-color': meta.color, '--icon-glow': meta.glow } as CSSProperties}
      aria-hidden
    />
  );
}

/** Кристалл-квант */
export function QuantumCrystal({
  meta,
  power,
  tierLabel,
  isChaos,
  onClick,
  playable,
  compact,
  strongTier,
}: {
  meta: ElementMeta;
  power: number;
  tierLabel: string;
  isChaos: boolean;
  onClick?: () => void;
  playable?: boolean;
  compact?: boolean;
  strongTier?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={[
        'cosmo-crystal',
        compact ? 'cosmo-crystal--compact' : '',
        onClick ? 'cosmo-crystal--clickable' : '',
        playable ? 'cosmo-crystal--playable' : '',
        isChaos ? 'cosmo-crystal--chaos' : '',
        strongTier ? 'cosmo-crystal--strong-tier' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--c-color': meta.color,
          '--c-glow': meta.glow,
          '--c-accent': meta.accent,
        } as CSSProperties
      }
      onClick={onClick}
      disabled={onClick ? !onClick : undefined}
      title={`${meta.shortLabel} · ${tierLabel}${isChaos ? ' · Хаос' : ''}`}
    >
      <span className="cosmo-crystal__aura" aria-hidden />
      {isChaos && <span className="cosmo-crystal__chaos-ring" aria-hidden />}
      <ElementIcon meta={meta} large={!compact} />
      <span className="cosmo-crystal__element">{meta.shortLabel}</span>
      <PowerCharge power={power} meta={meta} compact={compact} />
      {!compact && <span className="cosmo-crystal__tier">{tierLabel}</span>}
    </Tag>
  );
}

/** Заказ колодцев — визуально, словами */
export function BidChoice({ n, onClick }: { n: number; onClick: () => void }) {
  return (
    <button type="button" className="cosmo-bid-choice" onClick={onClick}>
      <span className="cosmo-bid-choice__wells" aria-hidden>
        {n === 0 ? (
          <span className="cosmo-bid-choice__void" />
        ) : (
          Array.from({ length: n }, (_, i) => (
            <span key={i} className="cosmo-bid-choice__mini-well" />
          ))
        )}
      </span>
      <span className="cosmo-bid-choice__word">{BID_WORDS_LOCAL[n] ?? `${n}`}</span>
    </button>
  );
}

const BID_WORDS_LOCAL: Record<number, string> = {
  0: 'Ни одного',
  1: 'Один',
  2: 'Два',
  3: 'Три',
  4: 'Четыре',
  5: 'Пять',
  6: 'Шесть',
  7: 'Семь',
  8: 'Восемь',
  9: 'Девять',
};

/** Осколки — звёздочки вместо цифры (до 12) */
export function ShardStars({ count, max = 12 }: { count: number; max?: number }) {
  const shown = Math.min(count, max);
  const extra = count > max;
  return (
    <span className="cosmo-shards" aria-label={`${count} осколков`}>
      {Array.from({ length: shown }, (_, i) => (
        <span key={i} className="cosmo-shards__star" aria-hidden />
      ))}
      {extra && <span className="cosmo-shards__more">+</span>}
    </span>
  );
}

/** Очки — неоновые «кристаллы» группами по 10 + остаток точками */
export function ScoreGems({ score, color }: { score: number; color: string }) {
  const big = Math.floor(Math.abs(score) / 10);
  const mid = Math.abs(score) % 10;
  const neg = score < 0;
  return (
    <span
      className={`cosmo-score-gems${neg ? ' cosmo-score-gems--neg' : ''}`}
      style={{ '--gem-color': color } as CSSProperties}
      title={`${score}`}
    >
      {neg && <span className="cosmo-score-gems__minus">−</span>}
      {big > 0 &&
        Array.from({ length: Math.min(big, 5) }, (_, i) => (
          <span key={`b${i}`} className="cosmo-score-gems__big" aria-hidden />
        ))}
      {big > 5 && <span className="cosmo-score-gems__burst">✦</span>}
      {Array.from({ length: mid }, (_, i) => (
        <span key={`s${i}`} className="cosmo-score-gems__small" aria-hidden />
      ))}
      {score === 0 && <span className="cosmo-score-gems__zero" aria-hidden />}
    </span>
  );
}

/** Витрина четырёх стихий на экране приветствия */
export function ElementShowcaseRow() {
  return (
    <div className="cosmo-showcase">
      {ELEMENT_SHOWCASE.map(({ id, power, tierLabel }) => (
        <QuantumCrystal
          key={id}
          meta={ELEMENTS[id]}
          power={power}
          tierLabel={tierLabel}
          isChaos={false}
        />
      ))}
    </div>
  );
}

/** Отдельно: что такое «Хаос» — крутящаяся рамка */
export function ChaosHintCard() {
  return (
    <div className="cosmo-chaos-hint">
      <QuantumCrystal
        meta={ELEMENTS.fire}
        power={5}
        tierLabel="Буря"
        isChaos
        compact
      />
      <div className="cosmo-chaos-hint__text">
        <span className="cosmo-chaos-hint__title">Крутящаяся рамка = Хаос ✦</span>
        <span className="cosmo-chaos-hint__body">
          Это не отдельная стихия. Так помечают кристалл <strong>главной стихии раунда</strong> — он
          сильнее обычного и может победить, когда своей стихии нет под рукой.
        </span>
      </div>
    </div>
  );
}

/** Легенда для первого раунда */
export function FirstRoundLegend({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="cosmo-legend" role="dialog" aria-label="Подсказка первого раунда">
      <div className="cosmo-legend__glow" aria-hidden />
      <h3 className="cosmo-legend__title">✦ Как читать кристаллы</h3>
      <div className="cosmo-legend__grid">
        {ELEMENT_SHOWCASE.map(({ id }) => (
          <div key={id} className="cosmo-legend__item">
            <ElementIcon meta={ELEMENTS[id]} large />
            <span style={{ color: ELEMENTS[id].accent }}>{ELEMENTS[id].shortLabel}</span>
          </div>
        ))}
      </div>
      <p className="cosmo-legend__line cosmo-neon-text--cyan">
        <strong>Огоньки внизу</strong> — заряд (всего пять). Нижние два — послабее, верхние три — суперсильные ✦
      </p>
      <p className="cosmo-legend__line cosmo-neon-text--pink">
        <strong>Колодец в центре</strong> — сюда летит кристалл. Побеждает самый сильный подходящий
        заряд.
      </p>
      <p className="cosmo-legend__line cosmo-neon-text--amber">
        <strong>Крутящаяся рамка</strong> — Хаос: главная стихия раунда, особый усилитель.
      </p>
      <button type="button" className="cosmo-demo__btn cosmo-demo__btn--primary cosmo-legend__btn" onClick={onDismiss}>
        Понятно, играем ✦
      </button>
    </div>
  );
}

/** Летящий кристалл к колодцу */
export function FlyingCrystal({
  meta,
  power,
  tierLabel,
  isChaos,
  from,
}: {
  meta: ElementMeta;
  power: number;
  tierLabel: string;
  isChaos: boolean;
  from: string;
}) {
  return (
    <div className={`cosmo-fly-crystal cosmo-fly-crystal--from-${from}`} aria-hidden>
      <QuantumCrystal meta={meta} power={power} tierLabel={tierLabel} isChaos={isChaos} compact />
      <span className="cosmo-fly-crystal__trail" />
    </div>
  );
}

/** Полоска прогресса турнира */
export function DealProgressStrip({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="cosmo-deal-strip" aria-label={`Раунд ${current} из ${total}`}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        const kind = kidDealKind(n);
        const special = kind === 'void-day' || kind === 'double-shard';
        return (
          <span
            key={n}
            className={[
              'cosmo-deal-strip__dot',
              done ? 'cosmo-deal-strip__dot--done' : '',
              active ? 'cosmo-deal-strip__dot--active' : '',
              special ? 'cosmo-deal-strip__dot--special' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={special ? (kind === 'void-day' ? 'День без Хаоса' : 'Двойной осколок') : undefined}
          />
        );
      })}
    </div>
  );
}

/** Мини-колодец для счётчика взяток */
export function WellCounter({ count, color }: { count: number; color: string }) {
  return (
    <span className="cosmo-well-counter" style={{ '--wc-color': color } as CSSProperties}>
      {Array.from({ length: Math.min(count, 9) }, (_, i) => (
        <span key={i} className="cosmo-well-counter__drop" aria-hidden />
      ))}
      {count > 9 && <span className="cosmo-well-counter__burst">✦</span>}
    </span>
  );
}
