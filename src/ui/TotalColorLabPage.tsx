import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type PaletteTone = {
  color: string;
  textShadow: string;
  backgroundImage?: string;
  border?: string;
};

/** Верхняя граница для нормализации hue / лабы: в игре почти нереально, но бывает +700 и чуть выше. */
const VALUE_MAX_DESIGN = 720;

const SAMPLE_VALUES = [-80, -12, 0, 7, 22, 48, 120, 205, 240, 304, 372, 430, 520, 620, 700] as const;

/** После этого порога добавляем «второе дыхание» по насыщенности и glow (волна в индиго/фиолет легко кажется серой на тёмном фоне). */
const HIGH_SAT_START = 205;

/** С этого значения — ещё немного подсветки (доп. glow + насыщенность). */
const EXTRA_GLOW_START = 304;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const normHue = (h: number) => ((h % 360) + 360) % 360;

/** Вариант B: непрерывный переход hue по сумме «ИТОГО» (масштаб до VALUE_MAX_DESIGN). */
function hueContinuous(value: number): number {
  if (value < 0) return 2;
  const t = clamp(value, 0, VALUE_MAX_DESIGN) / VALUE_MAX_DESIGN;
  return mix(28, 318, t);
}

/** Насыщенность и светимость текста для непрерывной шкалы; выше +205 — доп. сочность; с +304 — ещё подсветка; 500+ — лёгкий «мега»-акцент. */
function continuousSatLightAndGlowStrength(value: number): { sat: number; light: number; glow: number } {
  const i = clamp(value / 520, 0, 1);
  let sat = mix(78, 93, i);
  let light = mix(61, 72, i);
  /** 0 после 205, до 1 около +400 */
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

function getTone(value: number): PaletteTone {
  if (value < 0) {
    const danger = clamp(Math.abs(value) / 100, 0, 1);
    const hue = mix(0, 10, danger);
    return {
      color: `hsl(${hue} 95% 66%)`,
      textShadow: `0 0 10px hsl(${hue} 90% 52% / 0.55), 0 0 24px hsl(${hue} 88% 46% / 0.3)`,
    };
  }

  const hue = hueContinuous(value);
  const { sat, light, glow } = continuousSatLightAndGlowStrength(value);
  const h = Math.round(hue);
  const s = Math.round(sat);
  const l = Math.round(light);

  const t304 = value >= EXTRA_GLOW_START ? clamp((value - EXTRA_GLOW_START) / (VALUE_MAX_DESIGN - EXTRA_GLOW_START), 0, 1) : 0;
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
      border: `1px solid hsl(${h2} 98% ${72 + t304 * 4}% / ${0.85 + t304 * 0.1})`,
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

function TotalValue({ value }: { value: number }) {
  const tone = getTone(value);
  const valueStyle: CSSProperties = {
    fontSize: 32,
    fontWeight: 900,
    letterSpacing: '0.02em',
    lineHeight: 1,
    textShadow: tone.textShadow,
    color: tone.color,
  };

  if (tone.backgroundImage) {
    valueStyle.backgroundImage = tone.backgroundImage;
    valueStyle.backgroundClip = 'text';
    valueStyle.WebkitBackgroundClip = 'text';
    valueStyle.WebkitTextFillColor = 'transparent';
    valueStyle.padding = '2px 8px';
    valueStyle.borderRadius = 10;
    valueStyle.border = tone.border;
  }

  return <span style={valueStyle}>{value >= 0 ? `+${value}` : value}</span>;
}

export function TotalColorLabPage({ onBack }: { onBack: () => void }) {
  const [value, setValue] = useState(96);
  const [autoPlay, setAutoPlay] = useState(true);

  useEffect(() => {
    if (!autoPlay) return;
    let raf = 0;
    let started = 0;
    const tick = (ts: number) => {
      if (!started) started = ts;
      const t = (ts - started) / 1000;
      const next = Math.round(Math.sin(t * 0.7) * 300 + Math.sin(t * 0.23) * 170 + 200);
      setValue(clamp(next, -120, VALUE_MAX_DESIGN));
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [autoPlay]);

  const activeLabel = useMemo(() => {
    if (value < 0) return 'Меньше нуля (красные тона)';
    if (value <= 9) return '0..9 (оранжевый)';
    if (value <= 39) return '10..39 (салатный)';
    if (value <= 99) return '40..99 (зелёный)';
    if (value <= 179) return '100..179 (cyan)';
    if (value <= 259) return '180..259 (голубой crystal)';
    if (value <= 349) return '260..349 (indigo/blue)';
    if (value <= 399) return '350..399 (lilac neon)';
    if (value <= 499) return '400..499 (иридисцентный premium)';
    if (value <= 599) return '500..599 (экстрим)';
    return '600+ (редкий максимум)';
  }, [value]);

  return (
    <main style={{ minHeight: '100vh', background: '#0b1020', color: '#e2e8f0', padding: 16 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={onBack} style={btn}>
            Назад
          </button>
          <h1 style={{ margin: 0, fontSize: 20 }}>Лаба ИТОГО — непрерывная шкала (Вариант B)</h1>
        </div>

        <section style={card}>
          <p style={{ margin: '0 0 8px', color: '#9fb4d0', fontSize: 13 }}>
            Только непрерывный hue по сумме. После <strong style={{ color: '#e2e8f0' }}>+{HIGH_SAT_START}</strong> — сочнее;
            с <strong style={{ color: '#e2e8f0' }}>+{EXTRA_GLOW_START}</strong> — ещё подсветка. Шкала рассчитана до{' '}
            <strong style={{ color: '#e2e8f0' }}>+{VALUE_MAX_DESIGN}</strong> (в игре возможны +500…+700).
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>
                Текущее значение: <strong>{value}</strong> ({activeLabel})
              </span>
              <input type="range" min={-120} max={VALUE_MAX_DESIGN} value={value} onChange={(e) => setValue(Number(e.target.value))} />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setAutoPlay((v) => !v)} style={btn}>
                {autoPlay ? 'Пауза динамики' : 'Запустить динамику'}
              </button>
              <button type="button" onClick={() => setValue(Math.round(Math.random() * (VALUE_MAX_DESIGN + 120) - 120))} style={btn}>
                Случайное значение
              </button>
            </div>
          </div>
        </section>

        <section style={card}>
          <div style={{ ...mobileRow, justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, color: '#f1f5f9' }}>ИТОГО</span>
            <TotalValue value={value} />
          </div>
        </section>

        <section style={card}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16 }}>Ключевые точки шкалы</h2>
          <div style={{ display: 'grid', gap: 8 }}>
            {SAMPLE_VALUES.map((sample) => (
              <div key={sample} style={{ ...mobileRow, gap: 12 }}>
                <span style={{ color: '#9fb4d0', fontVariantNumeric: 'tabular-nums' }}>
                  {sample >= 0 ? `+${sample}` : sample}
                </span>
                <TotalValue value={sample} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

const btn: CSSProperties = {
  border: '1px solid #334155',
  background: '#162036',
  color: '#e2e8f0',
  borderRadius: 10,
  padding: '8px 12px',
  cursor: 'pointer',
};

const card: CSSProperties = {
  border: '1px solid rgb(51 65 85 / 0.7)',
  borderRadius: 14,
  padding: 14,
  background: 'linear-gradient(180deg, rgb(15 23 42 / 0.88) 0%, rgb(9 14 28 / 0.9) 100%)',
};

const mobileRow: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  border: '1px solid rgb(71 85 105 / 0.65)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'rgb(2 6 23 / 0.55)',
};
