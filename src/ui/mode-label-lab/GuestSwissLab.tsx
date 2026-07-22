/**
 * Песочница: облики guest-глифа «швейцарский крест» бок о бок.
 * Самодостаточные кнопки — без классов меню.
 */

import { useId, type ReactNode } from 'react';

type SwissStageId =
  | 'original'
  | 's1'
  | 's2'
  | 's3'
  | 's4'
  | 's5'
  | 's6'
  | 's7'
  | 'leg1'
  | 'leg2'
  | 'leg3'
  | 'leg4';
type CrossKind = 'soft' | 'ice' | 'prism' | 'elite';

const STAGES: { id: SwissStageId; title: string; blurb: string }[] = [
  {
    id: 'original',
    title: '0 · оригинал',
    blurb: 'Точный исходник (без пульсации).',
  },
  {
    id: 's1',
    title: '1 · мат + пульс',
    blurb: 'Неон-кольцо + крестик тоже слегка светится.',
  },
  {
    id: 's2',
    title: '2 · глянец + пульс',
    blurb: 'Плавный блик + лёгкая подсветка креста.',
  },
  {
    id: 's3',
    title: '3 · magenta + пульс',
    blurb: 'Твои цвета на пике; обводка креста всегда кислотно-розовая.',
  },
  {
    id: 's4',
    title: '4 · teal + пульс',
    blurb: 'На пике ярче; на затухании хрустальная обводка почти уходит.',
  },
  {
    id: 's5',
    title: '5 · press-пульс',
    blurb: 'Как было + без светлого пятна в центре.',
  },
  {
    id: 's6',
    title: '6 · хрусталь-кольцо',
    blurb: 'На пике чуть больше объёма.',
  },
  {
    id: 's7',
    title: '7 · хрусталь + 3D',
    blurb: 'Выпуклый центр + аккуратный пульс креста.',
  },
];

/** Старые 4 стадии с мобильного меню (как сейчас крутятся). */
const LEGACY_STAGES: { id: SwissStageId; title: string; blurb: string }[] = [
  {
    id: 'leg1',
    title: 'A · классика',
    blurb: 'Старая стадия 1 + мягкий пульс.',
  },
  {
    id: 'leg2',
    title: 'B · плотный 3D',
    blurb: 'Старая стадия 2 + реально плотный 3D / ножка.',
  },
  {
    id: 'leg3',
    title: 'C · пик-хрусталь',
    blurb: 'Старая стадия 3 + дыхание кристалла.',
  },
  {
    id: 'leg4',
    title: 'D · космос',
    blurb: 'Старая стадия 4 + cyan/violet неон-пульс.',
  },
];

type CrossProps = { uid: string; kind: CrossKind };

function SwissCross({ uid, kind }: CrossProps) {
  if (kind === 'soft') {
    return (
      <svg className="swiss-btn__glyph" viewBox="0 0 44 44" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="35%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="28%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#0ea5e9" />
            <stop offset="78%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#075985" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`${uid}-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.85" />
            <stop offset="40%" stopColor="#e0f2fe" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="8" y="17.5" width="28" height="9" rx="1.8" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="0.85" />
        <rect x="17.5" y="8" width="9" height="28" rx="1.8" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="0.85" />
        <rect x="9.4" y="18.2" width="10" height="2.4" rx="1" fill={`url(#${uid}-gloss)`} />
        <rect x="18.9" y="9" width="2" height="10.5" rx="0.9" fill={`url(#${uid}-gloss)`} />
        <ellipse cx="21.2" cy="12.8" rx="1.4" ry="1.1" fill="#e0f2fe" opacity="0.75" />
      </svg>
    );
  }

  if (kind === 'ice') {
    return (
      <svg className="swiss-btn__glyph" viewBox="0 0 44 44" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="35%" y2="100%">
            <stop offset="0%" stopColor="#7dd3fc" />
            <stop offset="28%" stopColor="#38bdf8" />
            <stop offset="55%" stopColor="#0ea5e9" />
            <stop offset="78%" stopColor="#0284c7" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="45%" stopColor="#e0f2fe" stopOpacity="0.98" />
            <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id={`${uid}-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#e0f2fe" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* кислотно-розовая обводка (на s3 проявляется на пике) */}
        <rect
          className="swiss-btn__cross-pink"
          x="8"
          y="17.5"
          width="28"
          height="9"
          rx="1.8"
          fill="none"
          stroke="#ff2ec8"
          strokeWidth="1.35"
        />
        <rect
          className="swiss-btn__cross-pink"
          x="17.5"
          y="8"
          width="9"
          height="28"
          rx="1.8"
          fill="none"
          stroke="#ff2ec8"
          strokeWidth="1.35"
        />
        <rect
          className="swiss-btn__cross-ice"
          x="8"
          y="17.5"
          width="28"
          height="9"
          rx="1.8"
          fill="none"
          stroke="#e0f2fe"
          strokeOpacity="0.5"
          strokeWidth="2.15"
        />
        <rect
          className="swiss-btn__cross-ice"
          x="17.5"
          y="8"
          width="9"
          height="28"
          rx="1.8"
          fill="none"
          stroke="#e0f2fe"
          strokeOpacity="0.5"
          strokeWidth="2.15"
        />
        <rect
          className="swiss-btn__cross-ice-edge"
          x="8"
          y="17.5"
          width="28"
          height="9"
          rx="1.8"
          fill={`url(#${uid}-fill)`}
          stroke={`url(#${uid}-edge)`}
          strokeWidth="1.15"
        />
        <rect
          className="swiss-btn__cross-ice-edge"
          x="17.5"
          y="8"
          width="9"
          height="28"
          rx="1.8"
          fill={`url(#${uid}-fill)`}
          stroke={`url(#${uid}-edge)`}
          strokeWidth="1.15"
        />
        <rect x="9.4" y="18.2" width="10" height="2.4" rx="1" fill={`url(#${uid}-gloss)`} />
        <rect x="18.9" y="9" width="2" height="10.5" rx="0.9" fill={`url(#${uid}-gloss)`} />
        <ellipse className="swiss-btn__cross-spark" cx="21.2" cy="12.8" rx="1.4" ry="1.1" fill="#ffffff" opacity="0.92" />
      </svg>
    );
  }

  if (kind === 'prism') {
    return (
      <svg className="swiss-btn__glyph" viewBox="0 0 44 44" aria-hidden>
        <defs>
          <linearGradient id={`${uid}-fill`} x1="0%" y1="0%" x2="35%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="30%" stopColor="#38bdf8" />
            <stop offset="60%" stopColor="#0ea5e9" />
            <stop offset="100%" stopColor="#0369a1" />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f5d0fe" stopOpacity="0.95" />
            <stop offset="35%" stopColor="#a5f3fc" stopOpacity="1" />
            <stop offset="65%" stopColor="#c4b5fd" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id={`${uid}-gloss`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fdf4ff" stopOpacity="0.7" />
            <stop offset="50%" stopColor="#a5f3fc" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="8" y="17.5" width="28" height="9" rx="1.8" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="1.05" />
        <rect x="17.5" y="8" width="9" height="28" rx="1.8" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="1.05" />
        <rect x="9.4" y="18.2" width="10" height="2.2" rx="1" fill={`url(#${uid}-gloss)`} />
        <rect x="18.9" y="9" width="2" height="10" rx="0.9" fill={`url(#${uid}-gloss)`} />
        <ellipse cx="20.6" cy="12.4" rx="1.2" ry="0.9" fill="#f5d0fe" opacity="0.75" />
        <ellipse cx="23.2" cy="14.2" rx="0.7" ry="0.55" fill="#a5f3fc" opacity="0.8" />
      </svg>
    );
  }

  /* elite — чистый хрусталь: холодный лёд, чёткие грани, без грязного blur */
  return (
    <svg className="swiss-btn__glyph swiss-btn__glyph--elite" viewBox="0 0 44 44" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-fill`} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#f0f9ff" />
          <stop offset="22%" stopColor="#bae6fd" />
          <stop offset="48%" stopColor="#7dd3fc" />
          <stop offset="72%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </linearGradient>
        <linearGradient id={`${uid}-edge`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={`${uid}-facet`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#e0f2fe" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="8" y="17.5" width="28" height="9" rx="1.6" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="1.05" />
      <rect x="17.5" y="8" width="9" height="28" rx="1.6" fill={`url(#${uid}-fill)`} stroke={`url(#${uid}-edge)`} strokeWidth="1.05" />
      <rect x="9.5" y="18.15" width="9.5" height="2.1" rx="0.9" fill={`url(#${uid}-facet)`} />
      <rect x="19" y="9.1" width="1.9" height="9.8" rx="0.85" fill={`url(#${uid}-facet)`} />
      <ellipse cx="21" cy="12.5" rx="1.15" ry="0.9" fill="#ffffff" opacity="0.95" />
    </svg>
  );
}

function stageCrossKind(stage: SwissStageId): CrossKind {
  if (stage === 's3' || stage === 'leg3') return 'ice';
  if (stage === 's4') return 'prism';
  if (stage === 's7') return 'elite';
  return 'soft';
}

/** Кольцо: постоянное или тонкий неон у s1; legacy тоже со слоями. */
function stageHasRing(stage: SwissStageId): boolean {
  return (
    stage === 's1' ||
    stage === 's3' ||
    stage === 's4' ||
    stage === 's5' ||
    stage === 's6' ||
    stage === 's7' ||
    stage === 'leg1' ||
    stage === 'leg2' ||
    stage === 'leg3' ||
    stage === 'leg4'
  );
}

function SwissBtn({ stage }: { stage: SwissStageId }) {
  const uid = useId().replace(/:/g, '');
  const withRing = stageHasRing(stage);
  const kind = stageCrossKind(stage);

  return (
    <span className={`swiss-btn swiss-btn--${stage}`} aria-hidden>
      <span className="swiss-btn__rim">
        {withRing ? <span className="swiss-btn__depth" /> : null}
        <span className="swiss-btn__face">
          <SwissCross uid={`${uid}-${stage}`} kind={kind} />
        </span>
      </span>
    </span>
  );
}

/** Кнопка-крест из лаба (s7 и др.) — для гибридов support и guest. */
export function SwissLabGlyph({ stage }: { stage: SwissStageId }) {
  return <SwissBtn stage={stage} />;
}

function SwissStageCard({
  stage,
  title,
  blurb,
}: {
  stage: SwissStageId;
  title: string;
  blurb: string;
}) {
  return (
    <div className="guest-swiss-lab__card">
      <div className="guest-swiss-lab__card-head">
        <h3 className="guest-swiss-lab__card-title">{title}</h3>
        <p className="guest-swiss-lab__card-blurb">{blurb}</p>
      </div>
      <div className="guest-swiss-lab__chip-wrap">
        <SwissBtn stage={stage} />
        <p className="guest-swiss-lab__pick-hint">запомни номер, если нравится</p>
      </div>
    </div>
  );
}

export function GuestSwissLabSection(): ReactNode {
  return (
    <>
      <section className="mode-label-lab__section mode-label-lab__section--featured guest-swiss-lab">
        <div className="mode-label-lab__section-head">
          <span className="mode-label-lab__badge">guest · крест</span>
          <h2>Швейцарский крест — новые варианты</h2>
          <p>0–7: актуальная песочница. Ниже — старые 4 стадии с мобильного меню.</p>
        </div>
        <div className="guest-swiss-lab__grid">
          {STAGES.map((s) => (
            <SwissStageCard key={s.id} stage={s.id} title={s.title} blurb={s.blurb} />
          ))}
        </div>
      </section>

      <section className="mode-label-lab__section guest-swiss-lab guest-swiss-lab--legacy">
        <div className="mode-label-lab__section-head">
          <span className="mode-label-lab__badge">меню · старые</span>
          <h2>Старые 4 облика с мобилки</h2>
          <p>
            Снимки стадий с мобильной guest-аватарки (A→B→C→D), теперь каждый со своей пульсацией.
          </p>
        </div>
        <div className="guest-swiss-lab__grid">
          {LEGACY_STAGES.map((s) => (
            <SwissStageCard key={s.id} stage={s.id} title={s.title} blurb={s.blurb} />
          ))}
        </div>
      </section>
    </>
  );
}
