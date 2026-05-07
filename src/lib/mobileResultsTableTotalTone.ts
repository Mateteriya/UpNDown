/**
 * Цвет суммы в строке «Итог» таблицы результатов (ПК и моб.): непрерывная шкала как `/total-color-lab`.
 * Не затрагивает межраздачный оверлей.
 */

import type { CSSProperties } from 'react';

const VALUE_MAX_DESIGN = 720;
const HIGH_SAT_START = 205;
const EXTRA_GLOW_START = 304;

export type ResultsTableFootVariant = 'mobile' | 'desktop';

/**
 * Моноширинный UI-шрифт: одинаковые «коробки» у цифр 0–9 и предсказуемая высота (+2/3 знака).
 */
const RESULTS_FOOT_TOTAL_FONT_FAMILY =
  '"JetBrains Mono", "Cascadia Code", "Segoe UI Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function normHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function hueContinuous(value: number): number {
  if (value < 0) return 2;
  const t = clamp(value, 0, VALUE_MAX_DESIGN) / VALUE_MAX_DESIGN;
  return mix(28, 318, t);
}

function continuousSatLightAndGlowStrength(value: number): { sat: number; light: number; glow: number } {
  const i = clamp(value / 520, 0, 1);
  let sat = mix(78, 93, i);
  let light = mix(61, 72, i);
  const hi = clamp((value - HIGH_SAT_START) / (400 - HIGH_SAT_START), 0, 1);

  if (value > HIGH_SAT_START) {
    const punch = clamp((value - 240) / 160, 0, 1);
    sat = mix(sat, 100, hi * 0.72 + punch * 0.18);
    sat = clamp(sat + hi * 5 + punch * 3, 0, 100);
    light = mix(light, 76, hi * 0.55 + punch * 0.12);
    light = clamp(light, 56, 80);
  }

  let glow =
    value > HIGH_SAT_START ? mix(1, 1.55, hi) + (value >= 260 ? clamp((value - 260) / 200, 0, 1) * 0.2 : 0) : 1;

  if (value >= EXTRA_GLOW_START) {
    const t304 = clamp((value - EXTRA_GLOW_START) / (VALUE_MAX_DESIGN - EXTRA_GLOW_START), 0, 1);
    glow += 0.16 + t304 * 0.38;
    sat = clamp(sat + 2.8 + t304 * 4, 0, 100);
    light = clamp(light + 1.1 + t304 * 2.4, 56, 83);
  }

  const mega = clamp((value - 500) / (VALUE_MAX_DESIGN - 500), 0, 1);
  glow += mega * 0.22;
  sat = clamp(sat + mega * 2.5, 0, 100);

  return { sat, light, glow: clamp(glow, 1, 2.65) };
}

type Tone = {
  color: string;
  textShadow: string;
  backgroundImage?: string;
};

function toneForTotalScore(score: number): Tone {
  if (score < 0) {
    const danger = clamp(Math.abs(score) / 100, 0, 1);
    const hue = mix(0, 10, danger);
    return {
      color: `hsl(${hue} 95% 66%)`,
      textShadow: `0 0 10px hsl(${hue} 90% 52% / 0.55), 0 0 24px hsl(${hue} 88% 46% / 0.3)`,
    };
  }

  const value = clamp(score, 0, VALUE_MAX_DESIGN);

  const hue = hueContinuous(value);
  const { sat, light, glow } = continuousSatLightAndGlowStrength(value);
  const h = Math.round(hue);
  const s = Math.round(sat);
  const l = Math.round(light);

  const t304 =
    value >= EXTRA_GLOW_START ? clamp((value - EXTRA_GLOW_START) / (VALUE_MAX_DESIGN - EXTRA_GLOW_START), 0, 1) : 0;
  const premiumGlowScale = 1 + t304 * 0.18 + clamp((value - 500) / (VALUE_MAX_DESIGN - 500), 0, 1) * 0.1;

  if (value >= 400) {
    const h1 = normHue(hue - 38);
    const h2 = normHue(hue + 6);
    const h3 = normHue(hue + 42);
    const h4 = normHue(hue + 92);
    const pg = glow * premiumGlowScale;
    return {
      color: 'transparent',
      textShadow:
        `0 0 ${12 * pg}px hsl(${h2} 100% 68% / ${0.65 + pg * 0.08}), ` +
        `0 0 ${32 * pg}px hsl(${h3} 98% 60% / ${0.54 + pg * 0.1}), ` +
        `0 0 ${58 * pg}px hsl(${h4} 96% 56% / ${0.4 + pg * 0.07}), ` +
        `${value >= EXTRA_GLOW_START ? `0 0 ${74 * pg}px hsl(${normHue(hue + 58)} 100% 58% / ${0.22 + t304 * 0.14})` : ''}`,
      backgroundImage:
        `linear-gradient(112deg, hsl(${h1} 100% 88%) 0%, hsl(${h2} 100% 72%) 26%, ` +
        `hsl(${h3} 100% 66%) 58%, hsl(${h4} 98% 78%) 100%)`,
    };
  }

  const sh1 = mix(88, 98, clamp((value - HIGH_SAT_START) / 220, 0, 1));
  const sh2 = mix(76, 92, clamp((value - HIGH_SAT_START) / 220, 0, 1));
  const a1 = clamp(0.42 * glow + (value > HIGH_SAT_START ? 0.12 : 0), 0.35, 0.94);
  const a2 = clamp(0.32 * glow + (value > HIGH_SAT_START ? 0.22 : 0), 0.28, 0.82);
  const a3 =
    value >= EXTRA_GLOW_START ? clamp(0.18 + t304 * 0.28 + glow * 0.06, 0.15, 0.55) : 0;

  return {
    color: `hsl(${h} ${s}% ${l}%)`,
    textShadow:
      `0 0 ${8 * glow}px hsl(${hue} ${sh1}% 52% / ${a1}), ` +
      `0 0 ${22 * glow}px hsl(${normHue(hue + 28)} ${sh2}% 48% / ${a2})` +
      (value >= EXTRA_GLOW_START
        ? `, 0 0 ${36 * glow}px hsl(${normHue(hue + 52)} ${mix(94, 100, t304)}% 54% / ${a3}), ` +
          `0 0 ${52 * glow}px hsl(${normHue(hue + 18)} 96% 50% / ${a3 * 0.72})`
        : ''),
  };
}

function footFontSize(score: number, variant: ResultsTableFootVariant, isWinner: boolean): string {
  if (score === 0) {
    if (variant === 'mobile') return '15px';
    return isWinner ? '1.06em' : '1.02em';
  }
  /** На мобилке один размер для всех столбцов — синхрон с укрупнёнными капсулами «Итог». */
  if (variant === 'mobile') return '17px';
  return isWinner ? '1.1em' : '1.04em';
}

/** Компактный «контур» строки цифр в капсуле: симметричная вертикаль, единый line-box в px. */
function mobileFootDigitBox(fontSizePx: number): CSSProperties {
  const fs = `${fontSizePx}px`;
  /** JetBrains Mono чуть выше пропорциональных цифр — чуть больше запас по вертикали. */
  const boxH = fontSizePx + 8;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    fontFamily: RESULTS_FOOT_TOTAL_FONT_FAMILY,
    fontSize: fs,
    lineHeight: fs,
    minHeight: `${boxH}px`,
    height: `${boxH}px`,
    paddingLeft: '1px',
    paddingRight: '1px',
    paddingTop: '2px',
    paddingBottom: '2px',
    fontVariantNumeric: 'tabular-nums',
    fontFeatureSettings: '"tnum" 1, "lnum" 1',
    letterSpacing: '0.01em',
    WebkitFontSmoothing: 'antialiased',
  };
}

/**
 * Стили для `<span>` с текстом «+NN» / «-NN» в строке Итог (мобильные капсулы и ПК tfoot).
 */
export function getResultsTableFootTotalDigitStyle(
  score: number,
  options?: { isWinner?: boolean; variant?: ResultsTableFootVariant },
): CSSProperties {
  const variant = options?.variant ?? 'mobile';
  const isWinner = options?.isWinner ?? false;
  const fs = footFontSize(score, variant, isWinner);

  if (score === 0) {
    const fw = isWinner ? 900 : 780;
    if (variant === 'mobile') {
      return {
        fontWeight: fw,
        ...mobileFootDigitBox(15),
        color: '#94a3b8',
        WebkitTextFillColor: '#94a3b8',
        textShadow: 'none',
        overflow: 'visible',
      };
    }
    return {
      fontWeight: fw,
      fontFamily: RESULTS_FOOT_TOTAL_FONT_FAMILY,
      fontVariantNumeric: 'tabular-nums',
      fontFeatureSettings: '"tnum" 1, "lnum" 1',
      fontSize: fs,
      lineHeight: 1.15,
      color: '#94a3b8',
      WebkitTextFillColor: '#94a3b8',
      textShadow: 'none',
    };
  }

  const fw = isWinner ? 900 : 780;
  const tone = toneForTotalScore(score);

  const mobileBox: CSSProperties | null =
    variant === 'mobile' ? { ...mobileFootDigitBox(17), overflow: 'visible' } : null;

  const base: CSSProperties =
    variant === 'mobile'
      ? {
          fontWeight: fw,
          ...mobileBox,
          verticalAlign: 'middle',
        }
      : {
          fontWeight: fw,
          fontFamily: RESULTS_FOOT_TOTAL_FONT_FAMILY,
          fontVariantNumeric: 'tabular-nums',
          fontFeatureSettings: '"tnum" 1, "lnum" 1',
          fontSize: fs,
          lineHeight: 1.12,
          display: 'inline-block',
          verticalAlign: 'baseline',
          WebkitFontSmoothing: 'antialiased',
        };

  if (tone.backgroundImage) {
    return {
      ...base,
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      backgroundImage: tone.backgroundImage,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      textShadow: tone.textShadow,
    };
  }

  return {
    ...base,
    color: tone.color,
    WebkitTextFillColor: tone.color,
    textShadow: tone.textShadow,
  };
}

/** @deprecated используйте getResultsTableFootTotalDigitStyle(score, { variant: 'mobile', isWinner }) */
export function getMobileResultsTableTotalDigitStyle(score: number, options?: { isWinner?: boolean }): CSSProperties {
  return getResultsTableFootTotalDigitStyle(score, { ...options, variant: 'mobile' });
}
