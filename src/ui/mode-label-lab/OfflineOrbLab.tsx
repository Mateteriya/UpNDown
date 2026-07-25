/**
 * Песочница офлайн-кнопки — только /mode-label-lab.
 * Гибриды: покой B / пик A. «Лучший» = idle-орб + running-скачать; ready — позже.
 */

import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';

type FabState = 'idle' | 'ready' | 'running';
/** download / orb — чистые скины; best — idle=орб, running=скачать+прогресс */
type GlyphKind = 'download' | 'orb' | 'best';
/** Варианты ready для «Лучшего» — сравниваем в лабе */
type ReadyVariant = 'check' | 'orb-seal' | 'ring-done';

function resolveGlyph(kind: GlyphKind, state: FabState): 'download' | 'orb' {
  if (kind === 'best') return state === 'running' ? 'download' : 'orb';
  return kind;
}

const PROGRESS_STOPS: { t: number; c: [number, number, number] }[] = [
  { t: 0, c: [6, 182, 212] }, // #06b6d4
  { t: 18, c: [14, 165, 233] }, // #0ea5e9
  { t: 38, c: [124, 58, 237] }, // #7c3aed
  { t: 58, c: [192, 38, 211] }, // #c026d3
  { t: 78, c: [225, 29, 72] }, // #e11d48
  { t: 100, c: [22, 163, 74] }, // #16a34a
];

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function progressTipColor(pct: number): string {
  const p = Math.max(0, Math.min(100, pct));
  let i = 0;
  while (i < PROGRESS_STOPS.length - 1 && p >= PROGRESS_STOPS[i + 1].t) i += 1;
  const a = PROGRESS_STOPS[i];
  const b = PROGRESS_STOPS[Math.min(i + 1, PROGRESS_STOPS.length - 1)];
  if (a.t === b.t) return `rgb(${a.c[0]} ${a.c[1]} ${a.c[2]})`;
  const t = (p - a.t) / (b.t - a.t);
  const r = Math.round(lerp(a.c[0], b.c[0], t));
  const g = Math.round(lerp(a.c[1], b.c[1], t));
  const bl = Math.round(lerp(a.c[2], b.c[2], t));
  return `rgb(${r} ${g} ${bl})`;
}

/** Перелив по дуге: циан → … → малина → зелёный только в самом конце. */
function LabDownloadProgressRing({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  const tipAngle = -90 + pct * 3.6;
  const tipColor = progressTipColor(pct);
  return (
    <span
      className="offline-orb-lab__progress"
      style={
        {
          '--orb-lab-progress': `${pct}%`,
          '--orb-lab-progress-tip': `${tipAngle}deg`,
          '--orb-lab-progress-tip-color': tipColor,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="offline-orb-lab__progress-track" />
      <span className="offline-orb-lab__progress-value" />
      <span className="offline-orb-lab__progress-value-shine" />
      <span className="offline-orb-lab__progress-knob">
        <span className="offline-orb-lab__progress-knob-ball" />
      </span>
    </span>
  );
}

/** Лазерная стрелка «скачать» (текущая в лабе). */
function LabDownloadGlyph({ uid }: { uid: string }) {
  const d = 'M24 11v16.5m0 0-6-6M24 27.5l6-6M13 35.5h22';
  return (
    <svg className="offline-orb-lab__glyph-svg offline-orb-lab__glyph-svg--download" viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${uid}-laser`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-1" offset="22%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-2" offset="42%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-3" offset="62%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-4" offset="80%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-5" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-laser-core`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--core-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--core-1" offset="35%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--core-2" offset="65%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--core-3" offset="100%" />
        </linearGradient>
      </defs>
      <path
        className="offline-orb-lab__icon-outer"
        d={d}
        fill="none"
        stroke={`url(#${uid}-laser)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="offline-orb-lab__icon-inner"
        d={d}
        fill="none"
        stroke={`url(#${uid}-laser-core)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Орб-значок как первый глиф кнопки в приложении: кольцо + ядро + мини-скачать.
 */
function LabOrbMarkGlyph({ uid }: { uid: string }) {
  return (
    <svg
      className="offline-orb-lab__glyph-svg offline-orb-lab__glyph-svg--orb"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-2" offset="45%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-5" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-core`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--core-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-0" offset="55%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-2" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-mark`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-5" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--laser-3" offset="100%" />
        </linearGradient>
      </defs>
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="none"
        stroke={`url(#${uid}-ring)`}
        strokeWidth="2.2"
        opacity="0.95"
      />
      <circle cx="24" cy="24" r="11.5" fill={`url(#${uid}-core)`} opacity="0.92" />
      <path
        d="M24 14.5v12.2m0 0-4.2-4.2M24 26.7l4.2-4.2M16.5 32.5h15"
        fill="none"
        stroke={`url(#${uid}-mark)`}
        strokeWidth="2.15"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.92"
      />
    </svg>
  );
}

/** Ready A: как C (кольцо 100% + космос), но фиолет + лицо guest-style (глаза + рот-✓). */
function LabFaceOkGlyph({ uid }: { uid: string }) {
  const mouth = 'M14.2 34.6c3.2 3.8 10.2 4 13.6 0.2';
  return (
    <svg
      className="offline-orb-lab__glyph-svg offline-orb-lab__glyph-svg--face-ok"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-face-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-1" offset="48%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-2" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-mouth`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="40%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#4ade80" />
        </linearGradient>
        <linearGradient id={`${uid}-mouth-core`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f0fdf4" />
          <stop offset="100%" stopColor="#86efac" />
        </linearGradient>
        <radialGradient id={`${uid}-face-plate`} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.12" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="16.2" fill={`url(#${uid}-face-plate)`} opacity="0.72" />
      {/* Брови — чуть приподняты, добро-шутливые */}
      <path
        d="M11.4 14.4c2.1-2.4 5.8-2.6 7.8-0.35"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="2.05"
        strokeLinecap="round"
        opacity="0.92"
      />
      <path
        d="M28.4 15.6c1.7-1.15 4.6-0.95 6.2 0.45"
        fill="none"
        stroke={`url(#${uid}-face-stroke)`}
        strokeWidth="1.95"
        strokeLinecap="round"
        opacity="0.95"
      />
      {/* Глаза — как у guest-глифа, чуть живее */}
      <circle className="offline-orb-lab__face-ok-eye" cx="15.6" cy="19.6" r="2.15" fill="#e9d5ff" />
      <circle className="offline-orb-lab__face-ok-pupil offline-orb-lab__face-ok-pupil--l" cx="15.6" cy="19.6" r="1.2" fill="#67e8f9" />
      <circle className="offline-orb-lab__face-ok-eye" cx="32.2" cy="19.9" r="2.15" fill="#e9d5ff" />
      <circle className="offline-orb-lab__face-ok-pupil offline-orb-lab__face-ok-pupil--r" cx="32.2" cy="19.9" r="1.2" fill="#f472b6" />
      <circle cx="14.95" cy="18.95" r="0.45" fill="#fff" opacity="0.9" />
      <circle cx="31.55" cy="19.25" r="0.45" fill="#fff" opacity="0.9" />
      {/* Рот = улыбка «ок» */}
      <path
        className="offline-orb-lab__icon-outer"
        d={mouth}
        fill="none"
        stroke={`url(#${uid}-mouth)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="offline-orb-lab__icon-inner"
        d={mouth}
        fill="none"
        stroke={`url(#${uid}-mouth-core)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ready B: idle-орб, но стрелка → галочка (печать «готово»). */
function LabOrbSealGlyph({ uid }: { uid: string }) {
  return (
    <svg
      className="offline-orb-lab__glyph-svg offline-orb-lab__glyph-svg--orb-seal"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-seal-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-1" offset="55%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-2" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-seal-core`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-core-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-1" offset="55%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-2" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-seal-mark`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-core-0" offset="0%" />
          <stop className="offline-orb-lab__stop offline-orb-lab__stop--rdy-core-1" offset="100%" />
        </linearGradient>
      </defs>
      <circle
        cx="24"
        cy="24"
        r="18"
        fill="none"
        stroke={`url(#${uid}-seal-ring)`}
        strokeWidth="2.2"
        opacity="0.96"
      />
      <circle cx="24" cy="24" r="11.5" fill={`url(#${uid}-seal-core)`} opacity="0.94" />
      <path
        d="M17.2 24.2 21.6 28.5 30.8 19"
        fill="none"
        stroke={`url(#${uid}-seal-mark)`}
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.98"
      />
    </svg>
  );
}

/** Ready C: замкнутое кольцо 100% (зелёный финиш прогресса). */
function LabReadyCompleteRing() {
  return (
    <span className="offline-orb-lab__progress offline-orb-lab__progress--ready-done" aria-hidden>
      <span className="offline-orb-lab__progress-track offline-orb-lab__progress-track--ready-done" />
      <span className="offline-orb-lab__progress-value offline-orb-lab__progress-value--ready-done" />
      <span className="offline-orb-lab__progress-value-shine offline-orb-lab__progress-value-shine--ready-done" />
    </span>
  );
}

function glyphFor(kind: 'download' | 'orb', uid: string): ReactNode {
  return kind === 'orb' ? <LabOrbMarkGlyph uid={uid} /> : <LabDownloadGlyph uid={uid} />;
}

function readyGlyphFor(variant: ReadyVariant, uid: string): ReactNode {
  if (variant === 'orb-seal') return <LabOrbSealGlyph uid={uid} />;
  return <LabFaceOkGlyph uid={uid} />;
}

function LabFab({
  state,
  size,
  showDot,
  pulse,
  idSuffix,
  glyph,
  downloadProgress = 0,
  readyVariant = null,
}: {
  state: FabState;
  size: 'm' | 'pc';
  showDot: boolean;
  pulse: boolean;
  idSuffix: string;
  glyph: GlyphKind;
  /** 0–100, для скачать / best в running */
  downloadProgress?: number;
  /** Если задан — в ready рисуем этот вариант вместо старого 3D-шара */
  readyVariant?: ReadyVariant | null;
}) {
  const uid = useId().replace(/:/g, '');
  const activeGlyph = resolveGlyph(glyph, state);
  const useReadyVariant = state === 'ready' && readyVariant != null;
  const showSphere = state === 'ready' && !useReadyVariant;
  const showProgress = activeGlyph === 'download' && state === 'running';
  const showRingDone =
    useReadyVariant && (readyVariant === 'ring-done' || readyVariant === 'check');
  const showWell = showProgress || showRingDone;
  const showCutout =
    (activeGlyph === 'download' && !showSphere && !useReadyVariant) || showRingDone;
  return (
    <div
      className={[
        'offline-orb-lab__preview',
        `offline-orb-lab__preview--${size}`,
        `offline-orb-lab__preview--${state}`,
        pulse ? 'offline-orb-lab__preview--pulse' : '',
        showProgress || showRingDone ? 'offline-orb-lab__preview--progress' : '',
        useReadyVariant ? `offline-orb-lab__preview--rdy-${readyVariant}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className={['offline-orb-lab__fab', showCutout ? 'offline-orb-lab__fab--cutout' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label={
          showProgress
            ? `Скачивание ${Math.round(downloadProgress)}%`
            : useReadyVariant
              ? `Офлайн готово · ${readyVariant}`
              : `Офлайн-кнопка · ${state}`
        }
      >
        {showWell ? (
          <span className="offline-orb-lab__fab-well" aria-hidden>
            <span className="offline-orb-lab__fab-well-stars offline-orb-lab__fab-well-stars--a" />
            <span className="offline-orb-lab__fab-well-stars offline-orb-lab__fab-well-stars--b" />
            <span className="offline-orb-lab__fab-well-stars offline-orb-lab__fab-well-stars--c" />
          </span>
        ) : null}
        <span className="offline-orb-lab__fab-face" aria-hidden />
        <span className="offline-orb-lab__fab-glow" aria-hidden />
        <span className="offline-orb-lab__fab-ring" aria-hidden />
        {!showProgress && !showRingDone ? <span className="offline-orb-lab__fab-beacon" aria-hidden /> : null}
        {showProgress ? <LabDownloadProgressRing progress={downloadProgress} /> : null}
        {showRingDone ? <LabReadyCompleteRing /> : null}
        <span className="offline-orb-lab__fab-mirror" aria-hidden />
        {showSphere ? (
          <span className="offline-orb-lab__sphere" aria-hidden>
            <span className="offline-orb-lab__sphere-shine" />
            <span className="offline-orb-lab__sphere-rim" />
          </span>
        ) : useReadyVariant ? (
          <span
            className={[
              'offline-orb-lab__glyph-wrap',
              'offline-orb-lab__glyph-wrap--ready',
              `offline-orb-lab__glyph-wrap--rdy-${readyVariant}`,
            ].join(' ')}
          >
            {readyGlyphFor(readyVariant, `${uid}-${idSuffix}-rdy`)}
          </span>
        ) : (
          <span
            className={[
              'offline-orb-lab__glyph-wrap',
              state === 'running' ? 'offline-orb-lab__glyph-wrap--running' : '',
              `offline-orb-lab__glyph-wrap--${activeGlyph}`,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {glyphFor(activeGlyph, `${uid}-${idSuffix}-${state}-${size}`)}
          </span>
        )}
        {showDot && state === 'idle' ? <span className="offline-orb-lab__fab-dot" aria-hidden /> : null}
      </button>
    </div>
  );
}

/** Покой = B (tuned), пик пульса = A (baseline). */
function LabHybridFab({
  state,
  size,
  showDot,
  pulse,
  idSuffix,
  glyph,
  downloadProgress = 0,
  readyVariant = null,
}: {
  state: FabState;
  size: 'm' | 'pc';
  showDot: boolean;
  pulse: boolean;
  idSuffix: string;
  glyph: GlyphKind;
  downloadProgress?: number;
  readyVariant?: ReadyVariant | null;
}) {
  return (
    <div
      className={[
        'offline-orb-lab__hybrid',
        `offline-orb-lab__hybrid--${size}`,
        pulse ? 'offline-orb-lab__hybrid--pulse' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="offline-orb-lab__hybrid-layer offline-orb-lab__hybrid-layer--b offline-orb-lab__skin--tuned">
        <LabFab
          state={state}
          size={size}
          showDot={showDot}
          pulse={false}
          idSuffix={`${idSuffix}-b`}
          glyph={glyph}
          downloadProgress={downloadProgress}
          readyVariant={readyVariant}
        />
      </div>
      <div
        className="offline-orb-lab__hybrid-layer offline-orb-lab__hybrid-layer--a offline-orb-lab__skin--baseline"
        aria-hidden
      >
        <LabFab
          state={state}
          size={size}
          showDot={showDot}
          pulse={pulse}
          idSuffix={`${idSuffix}-a`}
          glyph={glyph}
          downloadProgress={downloadProgress}
          readyVariant={readyVariant}
        />
      </div>
    </div>
  );
}

function LabHybridStage({
  glyph,
  title,
  hint,
  state,
  showDot,
  pulse,
  downloadProgress = 0,
  featured = false,
  readyVariant = null,
}: {
  glyph: GlyphKind;
  title: string;
  hint: string;
  state: FabState;
  showDot: boolean;
  pulse: boolean;
  downloadProgress?: number;
  featured?: boolean;
  readyVariant?: ReadyVariant | null;
}) {
  const id = glyph === 'best' ? 'hybrid-best' : glyph === 'orb' ? 'hybrid-orb' : 'hybrid-dl';
  return (
    <div
      className={[
        'offline-orb-lab__skin',
        'offline-orb-lab__skin--hybrid',
        `offline-orb-lab__skin--${id}`,
        featured ? 'offline-orb-lab__skin--featured' : '',
        readyVariant ? `offline-orb-lab__skin--ready-${readyVariant}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="offline-orb-lab__skin-head">
        <h3 className="offline-orb-lab__skin-title">
          {featured ? <span className="offline-orb-lab__skin-badge">лучший</span> : null}
          {title}
        </h3>
        <p className="offline-orb-lab__skin-hint">{hint}</p>
      </div>
      <div className="offline-orb-lab__stage">
        <div className="offline-orb-lab__stage-card">
          <p className="offline-orb-lab__stage-label">mobile · 58</p>
          <LabHybridFab
            state={state}
            size="m"
            showDot={showDot}
            pulse={pulse}
            idSuffix={id}
            glyph={glyph}
            downloadProgress={downloadProgress}
            readyVariant={readyVariant}
          />
        </div>
        <div className="offline-orb-lab__stage-card">
          <p className="offline-orb-lab__stage-label">PC · 64</p>
          <LabHybridFab
            state={state}
            size="pc"
            showDot={showDot}
            pulse={pulse}
            idSuffix={id}
            glyph={glyph}
            downloadProgress={downloadProgress}
            readyVariant={readyVariant}
          />
        </div>
        <div className="offline-orb-lab__stage-card offline-orb-lab__stage-card--wide">
          <p className="offline-orb-lab__stage-label">на тёмном меню</p>
          <div className="offline-orb-lab__menu-mock">
            <LabHybridFab
              state={state}
              size="m"
              showDot={showDot}
              pulse={pulse}
              idSuffix={`${id}-m`}
              glyph={glyph}
              downloadProgress={downloadProgress}
              readyVariant={readyVariant}
            />
            <LabHybridFab
              state={state}
              size="pc"
              showDot={showDot}
              pulse={pulse}
              idSuffix={`${id}-pc`}
              glyph={glyph}
              downloadProgress={downloadProgress}
              readyVariant={readyVariant}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const READY_VARIANTS: {
  id: ReadyVariant;
  title: string;
  hint: string;
  tuneHint: string;
}[] = [
  {
    id: 'check',
    title: 'A · Лицо-ок',
    hint: 'Как C (кольцо 100% + космос), но фиолет + глаза guest-глифа, рот = улыбка.',
    tuneHint: 'скоуп .offline-orb-lab__skin--ready-check',
  },
  {
    id: 'orb-seal',
    title: 'B · Орб-печать',
    hint: 'Тот же орб idle, но мини-скачать → ✓ (пакет запечатан).',
    tuneHint: 'скоуп .offline-orb-lab__skin--ready-orb-seal',
  },
  {
    id: 'ring-done',
    title: 'C · Кольцо 100%',
    hint: 'Замкнутое зелёное кольцо прогресса + ✓ на космосе — конец running.',
    tuneHint: 'скоуп .offline-orb-lab__skin--ready-ring-done',
  },
];

/** Три кандидата ready для «Лучшего» — всегда видны, каждый со своим CSS-скоупом. */
function LabReadyVariantsCompare({ pulse }: { pulse: boolean }) {
  return (
    <div className="offline-orb-lab__ready-compare">
      <div className="offline-orb-lab__skin-head">
        <h3 className="offline-orb-lab__skin-title">
          <span className="offline-orb-lab__skin-badge">ready</span>
          Варианты «готово» · Лучший
        </h3>
        <p className="offline-orb-lab__skin-hint">
          Логика истории: idle орб → running стрелка+дуга → ready. Тюнь в DevTools по скоупу каждой
          карточки (переменные <code>--orb-lab-rdy-*</code>).
        </p>
      </div>
      <div className="offline-orb-lab__ready-grid">
        {READY_VARIANTS.map((v) => (
          <div
            key={v.id}
            className={`offline-orb-lab__skin offline-orb-lab__skin--ready-var offline-orb-lab__skin--ready-${v.id}`}
          >
            <div className="offline-orb-lab__skin-head">
              <h4 className="offline-orb-lab__skin-title offline-orb-lab__skin-title--sm">{v.title}</h4>
              <p className="offline-orb-lab__skin-hint">{v.hint}</p>
              <p className="offline-orb-lab__skin-tune">
                <code>{v.tuneHint}</code>
              </p>
            </div>
            <div className="offline-orb-lab__stage offline-orb-lab__stage--ready">
              <div className="offline-orb-lab__stage-card">
                <p className="offline-orb-lab__stage-label">mobile</p>
                <LabHybridFab
                  state="ready"
                  size="m"
                  showDot={false}
                  pulse={pulse}
                  idSuffix={`rdy-${v.id}`}
                  glyph="best"
                  readyVariant={v.id}
                />
              </div>
              <div className="offline-orb-lab__stage-card">
                <p className="offline-orb-lab__stage-label">PC</p>
                <LabHybridFab
                  state="ready"
                  size="pc"
                  showDot={false}
                  pulse={pulse}
                  idSuffix={`rdy-${v.id}-pc`}
                  glyph="best"
                  readyVariant={v.id}
                />
              </div>
              <div className="offline-orb-lab__stage-card offline-orb-lab__stage-card--wide">
                <p className="offline-orb-lab__stage-label">меню</p>
                <div className="offline-orb-lab__menu-mock">
                  <LabHybridFab
                    state="ready"
                    size="m"
                    showDot={false}
                    pulse={pulse}
                    idSuffix={`rdy-${v.id}-mm`}
                    glyph="best"
                    readyVariant={v.id}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const VAR_GROUPS: { title: string; vars: string[] }[] = [
  {
    title: 'Размеры',
    vars: [
      '--orb-lab-fab-size',
      '--orb-lab-fab-size-pc',
      '--orb-lab-icon-size',
      '--orb-lab-icon-size-pc',
      '--orb-lab-icon-stroke-outer',
      '--orb-lab-icon-stroke-inner',
      '--orb-lab-dot-size',
    ],
  },
  {
    title: 'Лицо кнопки (stops градиента)',
    vars: [
      '--orb-lab-face-0',
      '--orb-lab-face-1',
      '--orb-lab-face-2',
      '--orb-lab-face-3',
      '--orb-lab-face-4',
      '--orb-lab-face-5',
      '--orb-lab-face-6',
      '--orb-lab-face-angle',
    ],
  },
  {
    title: 'Зеркало',
    vars: [
      '--orb-lab-mirror-opacity',
      '--orb-lab-mirror-angle',
      '--orb-lab-mirror-soft',
      '--orb-lab-mirror-mid',
      '--orb-lab-mirror-edge',
      '--orb-lab-mirror-spec',
      '--orb-lab-mirror-spec-fade',
      '--orb-lab-mirror-sweep',
    ],
  },
  {
    title: 'Блик / серебро / тень лица',
    vars: [
      '--orb-lab-shine-top',
      '--orb-lab-shine-mid',
      '--orb-lab-shade-bottom',
      '--orb-lab-inset-top',
      '--orb-lab-inset-bottom',
      '--orb-lab-inset-ring',
      '--orb-lab-rim-top',
    ],
  },
  {
    title: '3D-бортик (ledge)',
    vars: ['--orb-lab-ledge-1', '--orb-lab-ledge-2', '--orb-lab-drop', '--orb-lab-glow-a', '--orb-lab-glow-b'],
  },
  {
    title: 'Кольцо / маяк / пульс',
    vars: [
      '--orb-lab-ring-border',
      '--orb-lab-ring-inset',
      '--orb-lab-beacon',
      '--orb-lab-pulse-0',
      '--orb-lab-pulse-1',
      '--orb-lab-pulse-2',
    ],
  },
  {
    title: 'Лазер-иконка / орб',
    vars: [
      '--orb-lab-laser-0',
      '--orb-lab-laser-1',
      '--orb-lab-laser-2',
      '--orb-lab-laser-3',
      '--orb-lab-laser-4',
      '--orb-lab-laser-5',
      '--orb-lab-core-0',
      '--orb-lab-core-1',
      '--orb-lab-core-2',
      '--orb-lab-core-3',
      '--orb-lab-icon-glow-0',
      '--orb-lab-icon-glow-1',
      '--orb-lab-icon-glow-2',
    ],
  },
  {
    title: 'Ready · варианты (тюнь на карточке)',
    vars: [
      '--orb-lab-rdy-0',
      '--orb-lab-rdy-1',
      '--orb-lab-rdy-2',
      '--orb-lab-rdy-core-0',
      '--orb-lab-rdy-core-1',
      '--orb-lab-rdy-ring',
      '--orb-lab-rdy-ring-shine',
      '--orb-lab-rdy-breathe',
    ],
  },
  {
    title: 'Ready · 3D-шар (старые гибриды)',
    vars: [
      '--orb-lab-sphere-hi',
      '--orb-lab-sphere-mid',
      '--orb-lab-sphere-deep',
      '--orb-lab-sphere-edge',
      '--orb-lab-sphere-spec',
    ],
  },
  {
    title: 'Точка «новое»',
    vars: ['--orb-lab-dot-a', '--orb-lab-dot-b', '--orb-lab-dot-border', '--orb-lab-dot-glow'],
  },
];

export function OfflineOrbLabSection() {
  const [state, setState] = useState<FabState>('idle');
  const [showDot, setShowDot] = useState(true);
  const [pulse, setPulse] = useState(true);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [autoProgress, setAutoProgress] = useState(true);
  const [readyVariant, setReadyVariant] = useState<ReadyVariant>('check');

  useEffect(() => {
    if (state !== 'running') {
      setDownloadProgress(0);
      return;
    }
    if (!autoProgress) return;
    setDownloadProgress((p) => (p > 0 ? p : 4));
    const id = window.setInterval(() => {
      setDownloadProgress((p) => {
        if (p >= 100) return 100;
        return Math.min(100, p + 1.2);
      });
    }, 110);
    return () => window.clearInterval(id);
  }, [state, autoProgress]);

  return (
    <section className="mode-label-lab__section mode-label-lab__section--featured offline-orb-lab">
      <div className="mode-label-lab__section-head">
        <span className="mode-label-lab__badge">офлайн · глиф</span>
        <h2>Офлайн-кнопка — гибриды</h2>
        <p>
          Покой = B, пик = A. <strong>Гибрид · Лучший</strong>: idle — орб, running — стрелка +
          прогресс. Ниже — 3 кандидата <strong>ready</strong> (тюнь в DevTools по скоупу карточки).
        </p>
      </div>

      <div className="offline-orb-lab__toolbar" role="toolbar" aria-label="Состояния кнопки">
        <div className="offline-orb-lab__toolbar-group">
          {(['idle', 'ready', 'running'] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={
                state === s
                  ? 'offline-orb-lab__chip offline-orb-lab__chip--active'
                  : 'offline-orb-lab__chip'
              }
              aria-pressed={state === s}
              onClick={() => setState(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {state === 'ready' ? (
          <div className="offline-orb-lab__toolbar-group" aria-label="Вариант ready для Лучшего">
            {READY_VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={
                  readyVariant === v.id
                    ? 'offline-orb-lab__chip offline-orb-lab__chip--active'
                    : 'offline-orb-lab__chip'
                }
                aria-pressed={readyVariant === v.id}
                onClick={() => setReadyVariant(v.id)}
              >
                {v.id}
              </button>
            ))}
          </div>
        ) : null}
        <label className="offline-orb-lab__check">
          <input type="checkbox" checked={showDot} onChange={(e) => setShowDot(e.target.checked)} />
          точка «новое»
        </label>
        <label className="offline-orb-lab__check">
          <input type="checkbox" checked={pulse} onChange={(e) => setPulse(e.target.checked)} />
          пульс / маяк
        </label>
        {state === 'running' ? (
          <div className="offline-orb-lab__progress-ctrl">
            <div className="offline-orb-lab__progress-ctrl-row">
              <span>прогресс скачивания · {Math.round(downloadProgress)}%</span>
              <label className="offline-orb-lab__check offline-orb-lab__check--inline">
                <input
                  type="checkbox"
                  checked={autoProgress}
                  onChange={(e) => setAutoProgress(e.target.checked)}
                />
                авто
              </label>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={downloadProgress}
              aria-label="Прогресс скачивания"
              onChange={(e) => {
                setAutoProgress(false);
                setDownloadProgress(Number(e.target.value));
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="offline-orb-lab__compare offline-orb-lab__compare--hybrids">
        <LabHybridStage
          glyph="best"
          title="Гибрид · Лучший"
          hint={
            state === 'running'
              ? `idle→орб · running→скачать + ${Math.round(downloadProgress)}% · ready→${readyVariant}`
              : state === 'ready'
                ? `ready вариант: ${readyVariant} (см. сравнение ниже)`
                : 'idle→орб · running→скачать+прогресс · ready — 3 варианта ниже'
          }
          state={state}
          showDot={showDot}
          pulse={pulse}
          downloadProgress={downloadProgress}
          readyVariant={state === 'ready' ? readyVariant : null}
          featured
        />
        <LabReadyVariantsCompare pulse={pulse} />
        <LabHybridStage
          glyph="download"
          title="Гибрид · скачать"
          hint={`Покой B → пик A · running: кольцо-прогресс ${Math.round(downloadProgress)}%`}
          state={state}
          showDot={showDot}
          pulse={pulse}
          downloadProgress={downloadProgress}
        />
        <LabHybridStage
          glyph="orb"
          title="Гибрид · орб"
          hint="Тот же гибрид · иконка: кольцо + ядро + мини-скачать (глиф приложения)"
          state={state}
          showDot={showDot}
          pulse={pulse}
        />
      </div>

      <details className="offline-orb-lab__vars">
        <summary>Список CSS-переменных (для поиска в DevTools)</summary>
        <div className="offline-orb-lab__vars-grid">
          {VAR_GROUPS.map((g) => (
            <div key={g.title} className="offline-orb-lab__vars-block">
              <h3>{g.title}</h3>
              <ul>
                {g.vars.map((v) => (
                  <li key={v}>
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
