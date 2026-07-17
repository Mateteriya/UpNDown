import { useId } from 'react';

type Mode = 'online' | 'offline';

const MODE_WORD: Record<Mode, string> = {
  online: 'ОНЛАЙН',
  offline: 'ОФЛАЙН',
};

const MODE_KICKER: Record<Mode, string> = {
  online: 'Космический зал',
  offline: 'Экипаж ИИ',
};

/** Вариант 2 — голографический клин ПОД глифом (замена дуги) */
export function ModeLabelHoloWedge({ mode }: { mode: Mode }) {
  return (
    <div className={`mode-label-lab-holo mode-label-lab-holo--${mode}`} aria-hidden="true">
      <div className="mode-label-lab-holo__panel">
        <span className="mode-label-lab-holo__scan" />
        <span className="mode-label-lab-holo__grid" />
        <span className="mode-label-lab-holo__neon-rise" />
        <span className="mode-label-lab-holo__title">{MODE_WORD[mode]}</span>
        <span className="mode-label-lab-holo__kicker">{MODE_KICKER[mode]}</span>
        <span className="mode-label-lab-holo__corner mode-label-lab-holo__corner--tl" />
        <span className="mode-label-lab-holo__corner mode-label-lab-holo__corner--br" />
      </div>
    </div>
  );
}

/**
 * Вариант 3 — орбитальное кольцо ВОКРУГ глифа.
 * Центр SVG = центр кнопки глифа; текст по нижней дуге.
 * `ringsOnly` — только орбита (для симбиоза с клином).
 */
export function ModeLabelOrbitalRing({
  mode,
  ringsOnly = false,
}: {
  mode: Mode;
  ringsOnly?: boolean;
}) {
  const uid = useId().replace(/:/g, '');
  const pathId = `${uid}-orbit`;
  const fillId = `${uid}-fill`;
  const word = MODE_WORD[mode];

  return (
    <div
      className={[
        'mode-label-lab-orbit',
        `mode-label-lab-orbit--${mode}`,
        ringsOnly ? 'mode-label-lab-orbit--rings-only' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden="true"
    >
      <svg className="mode-label-lab-orbit__svg" viewBox="0 0 180 180" preserveAspectRatio="xMidYMid meet">
        <defs>
          {!ringsOnly ? (
            <>
              <path id={pathId} d="M 22,108 A 68,58 0 0,0 158,108" fill="none" />
              {mode === 'online' ? (
                <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#2dd4bf" />
                  <stop offset="18%" stopColor="#38bdf8" />
                  <stop offset="38%" stopColor="#a3ff48" />
                  <stop offset="58%" stopColor="#67e8f9" />
                  <stop offset="78%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#22d3ee" />
                  <animate attributeName="x1" values="-30%;0%;-30%" dur="14s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="70%;100%;70%" dur="14s" repeatCount="indefinite" />
                </linearGradient>
              ) : (
                <linearGradient id={fillId} x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f0abfc" />
                  <stop offset="25%" stopColor="#fb7185" />
                  <stop offset="50%" stopColor="#e879f9" />
                  <stop offset="75%" stopColor="#c084fc" />
                  <stop offset="100%" stopColor="#a78bfa" />
                  <animate attributeName="x1" values="-20%;0%;-20%" dur="12s" repeatCount="indefinite" />
                  <animate attributeName="x2" values="80%;100%;80%" dur="12s" repeatCount="indefinite" />
                </linearGradient>
              )}
            </>
          ) : null}
        </defs>

        <ellipse className="mode-label-lab-orbit__halo" cx="90" cy="90" rx="68" ry="60" fill="none" />
        <ellipse className="mode-label-lab-orbit__track" cx="90" cy="90" rx="58" ry="50" fill="none" />
        <path
          className="mode-label-lab-orbit__sweep"
          d="M 90,30 A 58,58 0 0,1 138,64"
          fill="none"
        />

        {!ringsOnly ? (
          <text className="mode-label-lab-orbit__text" fill={`url(#${fillId})`}>
            <textPath href={`#${pathId}`} xlinkHref={`#${pathId}`} startOffset="50%" textAnchor="middle">
              {word}
            </textPath>
          </text>
        ) : null}

        <circle className="mode-label-lab-orbit__node" cx="30" cy="102" r="2.8" />
        <circle className="mode-label-lab-orbit__node mode-label-lab-orbit__node--b" cx="150" cy="102" r="2.8" />
        <circle className="mode-label-lab-orbit__node mode-label-lab-orbit__node--c" cx="90" cy="34" r="3" />
      </svg>
    </div>
  );
}

/** Симбиоз — только кольца вокруг глифа (клин идёт отдельно в shellDecor) */
export function ModeLabelHoloOrbitHybridRings({ mode }: { mode: Mode }) {
  return <ModeLabelOrbitalRing mode={mode} ringsOnly />;
}

/**
 * Вариант 4 — watermark в ЦЕНТРАЛЬНОЙ трети + яркая подпись под глифом.
 * Ghost рендерится в shell; caption — в modeLabelSlot.
 */
export function ModeLabelCenterWatermarkGhost({ mode }: { mode: Mode }) {
  const word = MODE_WORD[mode];
  const wordTitle = mode === 'online' ? 'Онлайн' : 'Офлайн';

  return (
    <div className={`mode-label-lab-watermark mode-label-lab-watermark--${mode}`} aria-hidden="true">
      <span className="mode-label-lab-watermark__band">
        <span className="mode-label-lab-watermark__scan" />
        <span className="mode-label-lab-watermark__ghost">{word}</span>
        <span className="mode-label-lab-watermark__glitch mode-label-lab-watermark__glitch--a">{wordTitle}</span>
        <span className="mode-label-lab-watermark__glitch mode-label-lab-watermark__glitch--b">{wordTitle}</span>
      </span>
    </div>
  );
}

export function ModeLabelCenterWatermarkCaption({ mode }: { mode: Mode }) {
  return (
    <div className={`mode-label-lab-wm-caption mode-label-lab-wm-caption--${mode}`} aria-hidden="true">
      <span className="mode-label-lab-wm-caption__pill">
        <span className="mode-label-lab-wm-caption__text">{MODE_WORD[mode]}</span>
      </span>
    </div>
  );
}
