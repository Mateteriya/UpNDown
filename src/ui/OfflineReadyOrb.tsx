/**
 * «Прилетающий» офлайн-орб (Гибрид · Лучший):
 * idle — орб; running — стрелка + прогресс + космос-лунка; ready — лицо-улыбка + фиолетовое кольцо.
 */
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import { accountRouteHref } from '../lib/accountRoute';
import {
  downloadOfflinePack,
  getOfflinePackBlockReason,
  refreshOfflinePackStatus,
  subscribeOfflinePackStatus,
  type OfflinePackStatus,
} from '../lib/warmOfflineAssets';
import {
  getIosAddToHomeTip,
  getPwaInstallKind,
  promptPwaInstall,
  subscribePwaInstallAvailability,
  type PwaInstallKind,
} from '../lib/pwaInstallPrompt';

const EXPANDED_LS = 'updown-offline-orb-expanded-v1';
const DISMISS_READY_LS = 'updown-offline-orb-dismiss-ready-v1';
const POS_LS = 'updown-offline-orb-pos-v1';
const PINNED_LS = 'updown-offline-orb-pinned-v1';
const OPENED_LS = 'updown-offline-orb-opened-v1';
const NUDGE_LS = 'updown-offline-orb-nudge-v1';

const FAB_SIZE = 64;
/** Спокойный roam: реже прыжки, больше времени «постоять». */
const ROAM_INTERVAL_MS = 7200;
const ROAM_FIRST_MS = 2800;
const DRAG_THRESHOLD_PX = 8;

type OrbPos = { x: number; y: number };

const PROGRESS_STOPS: { t: number; c: [number, number, number] }[] = [
  { t: 0, c: [6, 182, 212] },
  { t: 18, c: [14, 165, 233] },
  { t: 38, c: [124, 58, 237] },
  { t: 58, c: [192, 38, 211] },
  { t: 78, c: [225, 29, 72] },
  { t: 100, c: [22, 163, 74] },
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

function readExpanded(): boolean {
  try {
    return sessionStorage.getItem(EXPANDED_LS) === '1';
  } catch {
    return false;
  }
}

function writeExpanded(v: boolean) {
  try {
    sessionStorage.setItem(EXPANDED_LS, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

function readPinned(): boolean {
  try {
    return localStorage.getItem(PINNED_LS) === '1';
  } catch {
    return false;
  }
}

function readNudgeDone(): boolean {
  try {
    return sessionStorage.getItem(NUDGE_LS) === '1';
  } catch {
    return false;
  }
}

function writeNudgeDone() {
  try {
    sessionStorage.setItem(NUDGE_LS, '1');
  } catch {
    /* ignore */
  }
}

function readOpenedOnce(): boolean {
  try {
    return localStorage.getItem(OPENED_LS) === '1';
  } catch {
    return false;
  }
}

function readPos(): OrbPos | null {
  try {
    const raw = localStorage.getItem(POS_LS);
    if (!raw) return null;
    const p = JSON.parse(raw) as OrbPos;
    if (typeof p?.x === 'number' && typeof p?.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return null;
}

function writePos(p: OrbPos) {
  try {
    localStorage.setItem(POS_LS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

function clampPos(x: number, y: number): OrbPos {
  const pad = 10;
  const safeL = pad;
  const maxX = Math.max(safeL, window.innerWidth - FAB_SIZE - pad);
  const maxY = Math.max(safeL, window.innerHeight - FAB_SIZE - pad - 8);
  return {
    x: Math.min(maxX, Math.max(safeL, x)),
    y: Math.min(maxY, Math.max(safeL + 48, y)),
  };
}

function randomRoamPos(avoid?: OrbPos | null): OrbPos {
  const pad = 20;
  const maxX = Math.max(pad, window.innerWidth - FAB_SIZE - pad);
  const maxY = Math.max(72, window.innerHeight - FAB_SIZE - pad - 16);
  const stepMax = Math.min(140, Math.max(72, Math.min(window.innerWidth, window.innerHeight) * 0.22));
  if (avoid) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 48 + Math.random() * stepMax;
    return clampPos(avoid.x + Math.cos(ang) * dist, avoid.y + Math.sin(ang) * dist);
  }
  return clampPos(pad + Math.random() * (maxX - pad), 64 + Math.random() * (maxY - 64));
}

function defaultStartPos(): OrbPos {
  return clampPos(window.innerWidth - FAB_SIZE - 18, window.innerHeight - FAB_SIZE - 24);
}

function OfflineOrbMarkGlyph({ uid }: { uid: string }) {
  return (
    <svg className="offline-orb__glyph-svg offline-orb__glyph-svg--orb" viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id={`${uid}-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb__stop offline-orb__stop--laser-0" offset="0%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-2" offset="45%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-5" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-core`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop className="offline-orb__stop offline-orb__stop--core-0" offset="0%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-0" offset="55%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-2" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-mark`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop className="offline-orb__stop offline-orb__stop--laser-5" offset="0%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-3" offset="100%" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="18" fill="none" stroke={`url(#${uid}-ring)`} strokeWidth="2.2" opacity="0.95" />
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

function OfflineDownloadGlyph({ uid }: { uid: string }) {
  const d = 'M24 11v16.5m0 0-6-6M24 27.5l6-6M13 35.5h22';
  return (
    <svg
      className="offline-orb__glyph-svg offline-orb__glyph-svg--download"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-laser`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb__stop offline-orb__stop--laser-0" offset="0%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-1" offset="22%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-2" offset="42%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-3" offset="62%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-4" offset="80%" />
          <stop className="offline-orb__stop offline-orb__stop--laser-5" offset="100%" />
        </linearGradient>
        <linearGradient id={`${uid}-laser-core`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop className="offline-orb__stop offline-orb__stop--core-0" offset="0%" />
          <stop className="offline-orb__stop offline-orb__stop--core-1" offset="35%" />
          <stop className="offline-orb__stop offline-orb__stop--core-2" offset="65%" />
          <stop className="offline-orb__stop offline-orb__stop--core-3" offset="100%" />
        </linearGradient>
      </defs>
      <path
        className="offline-orb__icon-outer"
        d={d}
        fill="none"
        stroke={`url(#${uid}-laser)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="offline-orb__icon-inner"
        d={d}
        fill="none"
        stroke={`url(#${uid}-laser-core)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** «?» и стрелка рядом — развернуть описание. */
function OfflineExpandHelpGlyph({ uid }: { uid: string }) {
  return (
    <svg
      className="offline-orb__tool-svg offline-orb__tool-svg--help"
      viewBox="0 0 48 28"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-help-shine`} x1="8%" y1="0%" x2="92%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="48%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f0abfc" />
        </linearGradient>
        <linearGradient id={`${uid}-help-fill`} x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="14" r="9.2" fill={`url(#${uid}-help-fill)`} />
      <circle
        cx="12"
        cy="14"
        r="8.8"
        fill="none"
        stroke={`url(#${uid}-help-shine)`}
        strokeWidth="1.65"
      />
      <text
        x="12"
        y="18.6"
        textAnchor="middle"
        fontFamily="Plus Jakarta Sans, Manrope, sans-serif"
        fontSize="14"
        fontWeight="800"
        fill={`url(#${uid}-help-shine)`}
      >
        ?
      </text>
      <g className="offline-orb__tool-chevron-wrap">
        <path
          className="offline-orb__tool-chevron"
          d="M28 9.2 36.5 17 45 9.2"
          fill="none"
          stroke={`url(#${uid}-help-shine)`}
          strokeWidth="2.55"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Компактный значок скачивания для кнопок панели. */
function OfflineToolDownloadGlyph({ uid }: { uid: string }) {
  return (
    <svg
      className="offline-orb__tool-svg offline-orb__tool-svg--dl"
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-dl-shine`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="offline-orb__go-stop offline-orb__go-stop--a" offset="0%" />
          <stop className="offline-orb__go-stop offline-orb__go-stop--b" offset="45%" />
          <stop className="offline-orb__go-stop offline-orb__go-stop--c" offset="100%" />
        </linearGradient>
      </defs>
      <path
        className="offline-orb__tool-path"
        d="M16 6.5v13.2m0 0-4.6-4.6M16 19.7l4.6-4.6M7.5 24.8h17"
        fill="none"
        stroke={`url(#${uid}-dl-shine)`}
        strokeWidth="2.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Ярлык на экран — плитка + плюс. */
function OfflineToolShortcutGlyph({ uid }: { uid: string }) {
  return (
    <svg
      className="offline-orb__tool-svg offline-orb__tool-svg--pin"
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-pin-shine`} x1="15%" y1="0%" x2="90%" y2="100%">
          <stop className="offline-orb__go-stop offline-orb__go-stop--a" offset="0%" />
          <stop className="offline-orb__go-stop offline-orb__go-stop--b" offset="50%" />
          <stop className="offline-orb__go-stop offline-orb__go-stop--c" offset="100%" />
        </linearGradient>
      </defs>
      <rect
        className="offline-orb__tool-path"
        x="6.5"
        y="6.5"
        width="13.5"
        height="13.5"
        rx="3.2"
        fill="none"
        stroke={`url(#${uid}-pin-shine)`}
        strokeWidth="2.45"
      />
      <path
        className="offline-orb__tool-path"
        d="M22.2 17.2v8.2m0 0h8.2m-8.2 0 6.4-6.4"
        fill="none"
        stroke={`url(#${uid}-pin-shine)`}
        strokeWidth="2.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type CapsulePanelId = 'download' | 'install' | 'combo';

function OfflinePanelTitle({
  action,
  rest,
  onAction,
  disabled,
}: {
  action: string;
  rest: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="offline-orb__panel-title">
      <button
        type="button"
        className="offline-orb__title-action"
        disabled={disabled}
        onClick={onAction}
      >
        {action}
      </button>
      {rest ? <span className="offline-orb__panel-title-rest">{rest}</span> : null}
    </span>
  );
}

/** Ready · ready-check: лицо guest-style + зелёная улыбка, фиолетовое кольцо снаружи. */
function OfflineFaceOkGlyph({ uid }: { uid: string }) {
  const mouth = 'M14.2 34.6c3.2 3.8 10.2 4 13.6 0.2';
  return (
    <svg
      className="offline-orb__glyph-svg offline-orb__glyph-svg--face-ok"
      viewBox="0 0 48 48"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${uid}-face-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="48%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#c026d3" />
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
      <circle cx="15.6" cy="19.6" r="2.15" fill="#e9d5ff" />
      <circle className="offline-orb__face-ok-pupil offline-orb__face-ok-pupil--l" cx="15.6" cy="19.6" r="1.2" fill="#67e8f9" />
      <circle cx="32.2" cy="19.9" r="2.15" fill="#e9d5ff" />
      <circle className="offline-orb__face-ok-pupil offline-orb__face-ok-pupil--r" cx="32.2" cy="19.9" r="1.2" fill="#f472b6" />
      <circle cx="14.95" cy="18.95" r="0.45" fill="#fff" opacity="0.9" />
      <circle cx="31.55" cy="19.25" r="0.45" fill="#fff" opacity="0.9" />
      <path
        className="offline-orb__icon-outer"
        d={mouth}
        fill="none"
        stroke={`url(#${uid}-mouth)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        className="offline-orb__icon-inner"
        d={mouth}
        fill="none"
        stroke={`url(#${uid}-mouth-core)`}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OfflineProgressRing({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  const tipAngle = -90 + pct * 3.6;
  const tipColor = progressTipColor(pct);
  return (
    <span
      className="offline-orb__progress"
      style={
        {
          '--orb-progress': `${pct}%`,
          '--orb-progress-tip': `${tipAngle}deg`,
          '--orb-progress-tip-color': tipColor,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="offline-orb__progress-track" />
      <span className="offline-orb__progress-value" />
      <span className="offline-orb__progress-value-shine" />
      <span className="offline-orb__progress-knob">
        <span className="offline-orb__progress-knob-ball" />
      </span>
    </span>
  );
}

function OfflineReadyCompleteRing() {
  return (
    <span className="offline-orb__progress offline-orb__progress--ready-done" aria-hidden>
      <span className="offline-orb__progress-track offline-orb__progress-track--ready-done" />
      <span className="offline-orb__progress-value offline-orb__progress-value--ready-done" />
      <span className="offline-orb__progress-value-shine offline-orb__progress-value-shine--ready-done" />
    </span>
  );
}

function OfflineFabWell() {
  return (
    <span className="offline-orb__fab-well" aria-hidden>
      <span className="offline-orb__fab-well-stars offline-orb__fab-well-stars--a" />
      <span className="offline-orb__fab-well-stars offline-orb__fab-well-stars--b" />
      <span className="offline-orb__fab-well-stars offline-orb__fab-well-stars--c" />
    </span>
  );
}

function fabGlyph(kind: 'orb' | 'download' | 'face-ok', uid: string): ReactNode {
  if (kind === 'download') return <OfflineDownloadGlyph uid={uid} />;
  if (kind === 'face-ok') return <OfflineFaceOkGlyph uid={uid} />;
  return <OfflineOrbMarkGlyph uid={uid} />;
}

/** Визуал idle-слоя гибрида (B тёмный / A светлый) — без своей кнопки. */
function OfflineIdleFabVisual({
  skin,
  uid,
  showDot,
  showBeacon,
}: {
  skin: 'tuned' | 'baseline';
  uid: string;
  showDot: boolean;
  showBeacon: boolean;
}) {
  return (
    <div
      className={`offline-orb__fab offline-orb__fab--visual offline-orb__fab--skin-${skin}`}
      aria-hidden
    >
      <span className="offline-orb__fab-face" />
      <span className="offline-orb__fab-glow" />
      <span className="offline-orb__fab-ring" />
      {showBeacon ? <span className="offline-orb__fab-beacon" /> : null}
      <span className="offline-orb__glyph-wrap offline-orb__glyph-wrap--orb">
        <OfflineOrbMarkGlyph uid={uid} />
      </span>
      {showDot ? <span className="offline-orb__fab-dot" /> : null}
    </div>
  );
}

export function OfflineReadyOrb() {
  const uid = useId().replace(/:/g, '');
  const [entered, setEntered] = useState(false);
  const [expanded, setExpanded] = useState(readExpanded);
  const [pack, setPack] = useState<OfflinePackStatus | null>(null);
  const [installKind, setInstallKind] = useState<PwaInstallKind>(() => getPwaInstallKind());
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const [openPanels, setOpenPanels] = useState<Partial<Record<CapsulePanelId, boolean>>>({});
  const [hiddenAfterReady, setHiddenAfterReady] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_READY_LS) === '1';
    } catch {
      return false;
    }
  });

  const [pinned, setPinned] = useState(readPinned);
  const [openedOnce, setOpenedOnce] = useState(readOpenedOnce);
  const [pos, setPos] = useState<OrbPos>(() => readPos() ?? { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [nudge, setNudge] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const applyPosToDom = useCallback((p: OrbPos) => {
    const el = rootRef.current;
    if (!el) return;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  }, []);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  useEffect(() => () => clearDragListeners(), [clearDragListeners]);

  const shouldRoam = !pinned && !openedOnce && !expanded && !dragging;

  useEffect(() => subscribeOfflinePackStatus(setPack), []);
  useEffect(() => {
    void refreshOfflinePackStatus();
  }, []);
  useEffect(() => subscribePwaInstallAvailability(() => setInstallKind(getPwaInstallKind())), []);

  useEffect(() => {
    const start = readPos() ?? defaultStartPos();
    setPos(start);
    const id = window.setTimeout(() => setEntered(true), 420);
    return () => window.clearTimeout(id);
  }, []);

  /** 4 · одноразовый nudge после прилёта (раз за сессию, пока не pinned). */
  useEffect(() => {
    if (!entered || pinned || expanded || readNudgeDone()) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      writeNudgeDone();
      return;
    }
    const startId = window.setTimeout(() => {
      setNudge(true);
      writeNudgeDone();
    }, 580);
    const endId = window.setTimeout(() => setNudge(false), 580 + 700);
    return () => {
      window.clearTimeout(startId);
      window.clearTimeout(endId);
    };
  }, [entered, pinned, expanded]);

  useEffect(() => {
    if (!shouldRoam) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    const tick = () => {
      setPos((prev) => randomRoamPos(prev));
    };
    const first = window.setTimeout(tick, ROAM_FIRST_MS);
    const iv = window.setInterval(tick, ROAM_INTERVAL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(iv);
    };
  }, [shouldRoam]);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const markPinned = useCallback((next: OrbPos) => {
    const c = clampPos(next.x, next.y);
    setPos(c);
    writePos(c);
    try {
      localStorage.setItem(PINNED_LS, '1');
    } catch {
      /* ignore */
    }
    setPinned(true);
  }, []);

  const blocked = pack?.blocked === true;
  const blockReason = pack?.blockReason ?? (blocked ? getOfflinePackBlockReason() : null);
  const running = pack?.running === true;
  const ready = pack?.ready === true;
  const cached = pack?.cached ?? 0;
  const total = pack?.total ?? 0;
  const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
  const offlineNet = typeof navigator !== 'undefined' && navigator.onLine === false;

  const open = useCallback(() => {
    try {
      localStorage.setItem(OPENED_LS, '1');
    } catch {
      /* ignore */
    }
    setOpenedOnce(true);
    writePos(posRef.current);
    setExpanded(true);
    writeExpanded(true);
  }, []);

  const close = useCallback(() => {
    setExpanded(false);
    writeExpanded(false);
    if (pack?.ready) {
      try {
        localStorage.setItem(DISMISS_READY_LS, '1');
      } catch {
        /* ignore */
      }
      setHiddenAfterReady(true);
    }
  }, [pack?.ready]);

  /** В момент старта скачивания свернуть капсулу — на кнопке виден running-глиф. */
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const started = running && !wasRunningRef.current;
    wasRunningRef.current = running;
    if (!started || !expanded) return;
    setExpanded(false);
    writeExpanded(false);
  }, [running, expanded]);

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* Не preventDefault на down — на части браузеров ломает последующие move */
    clearDragListeners();

    const root = rootRef.current;
    const rect = (root ?? e.currentTarget).getBoundingClientRect();
    const visual = clampPos(rect.left, rect.top);

    flushSync(() => {
      setDragging(true);
      setPos(visual);
    });
    posRef.current = visual;
    applyPosToDom(visual);

    const pointerId = e.pointerId;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }

    dragRef.current = {
      pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: visual.x,
      origY: visual.y,
      moved: false,
    };

    let moveRaf = 0;
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== ev.pointerId) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved) {
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
        d.moved = true;
      }
      ev.preventDefault();
      const next = clampPos(d.origX + dx, d.origY + dy);
      posRef.current = next;
      /* DOM сразу — React style во время drag не трогает left/top */
      applyPosToDom(next);
      if (!moveRaf) {
        moveRaf = window.requestAnimationFrame(() => {
          moveRaf = 0;
          setPos(posRef.current);
        });
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      try {
        if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      clearDragListeners();
      const d = dragRef.current;
      dragRef.current = null;
      const finalPos = posRef.current;
      flushSync(() => {
        setPos(finalPos);
        setDragging(false);
      });
      applyPosToDom(finalPos);
      if (!d) return;
      if (d.moved) {
        markPinned(finalPos);
        return;
      }
      open();
    };

    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, { capture: true });
    window.addEventListener('pointercancel', onUp, { capture: true });
    dragCleanupRef.current = () => {
      if (moveRaf) window.cancelAnimationFrame(moveRaf);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  };

  useLayoutEffect(() => {
    if (dragging || expanded) return;
    applyPosToDom(pos);
  }, [pos, dragging, expanded, applyPosToDom]);

  if (hiddenAfterReady && ready && !expanded) return null;

  const onDownload = () => {
    if (blocked || offlineNet) return;
    void downloadOfflinePack({ force: false });
  };

  const onInstall = async () => {
    setInstallMsg(null);
    const kind = getPwaInstallKind();
    if (kind === 'prompt') {
      const outcome = await promptPwaInstall();
      if (outcome === 'accepted') setInstallMsg('Ярлык добавлен.');
      else if (outcome === 'dismissed') setInstallMsg('Установка отменена.');
      else setInstallMsg('Установка сейчас недоступна в этом браузере.');
      setInstallKind(getPwaInstallKind());
      return;
    }
    if (kind === 'ios-tip') {
      setInstallMsg(getIosAddToHomeTip());
      return;
    }
    if (kind === 'installed') {
      setInstallMsg('Ярлык уже установлен — вы в приложении.');
      return;
    }
    setInstallMsg('Браузер не предлагает ярлык здесь. Откройте сайт по HTTPS в Chrome / Safari.');
  };

  const onDownloadAndInstall = () => {
    onDownload();
    void onInstall();
  };

  const togglePanel = (id: CapsulePanelId) => {
    setOpenPanels((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const downloadDisabled = running || blocked || (offlineNet && !ready);

  const downloadTitleNode = running ? (
    <span className="offline-orb__panel-title">
      <span className="offline-orb__panel-title-rest">
        Скачиваем… {cached}/{total}
      </span>
    </span>
  ) : ready ? (
    <span className="offline-orb__panel-title">
      <span className="offline-orb__panel-title-rest">Офлайн готов · {total} файлов</span>
    </span>
  ) : cached > 0 ? (
    <OfflinePanelTitle
      action="Докачать"
      rest={` пакет · ${cached}/${total}`}
      onAction={onDownload}
      disabled={downloadDisabled}
    />
  ) : (
    <OfflinePanelTitle
      action="Скачать"
      rest=" игру на устройство"
      onAction={onDownload}
      disabled={downloadDisabled}
    />
  );

  const installTitleNode =
    installKind === 'installed' ? (
      <span className="offline-orb__panel-title">
        <span className="offline-orb__panel-title-rest">Ярлык уже на устройстве</span>
      </span>
    ) : installKind === 'ios-tip' ? (
      <span className="offline-orb__panel-title">
        <span className="offline-orb__panel-title-rest">Как </span>
        <button
          type="button"
          className="offline-orb__title-action"
          onClick={() => void onInstall()}
        >
          добавить
        </button>
        <span className="offline-orb__panel-title-rest"> ярлык (iPhone)</span>
      </span>
    ) : (
      <OfflinePanelTitle
        action="Добавить"
        rest=" ярлык на экран"
        onAction={() => void onInstall()}
      />
    );

  /* Во время drag left/top только через DOM — иначе любой re-render (статус пака) срывает позицию */
  const glyphStyle: CSSProperties | undefined =
    !expanded && entered
      ? dragging
        ? { right: 'auto', bottom: 'auto' }
        : { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
      : undefined;

  const isIdleFab = !running && !ready;
  const fabGlyphKind: 'orb' | 'download' | 'face-ok' = ready
    ? 'face-ok'
    : running
      ? 'download'
      : 'orb';
  const showCutout = running || ready;
  const showWell = running || ready;
  const headGlyphKind: 'orb' | 'download' | 'face-ok' = ready
    ? 'face-ok'
    : running
      ? 'download'
      : 'orb';
  const fabAria =
    running
      ? `Скачивание офлайн-пакета ${pct}% — открыть или перетащить`
      : ready
        ? 'Офлайн готов — открыть или перетащить'
        : 'Играть без интернета — открыть или перетащить';

  const showDragHalo = entered && !pinned && !expanded && !dragging;

  return (
    <div
      ref={rootRef}
      className={[
        'offline-orb',
        entered ? 'offline-orb--in' : '',
        expanded ? 'offline-orb--expanded' : 'offline-orb--glyph',
        shouldRoam ? 'offline-orb--roaming' : '',
        dragging ? 'offline-orb--dragging' : '',
        pinned ? 'offline-orb--pinned' : '',
        ready ? 'offline-orb--ready' : '',
        running ? 'offline-orb--running' : '',
        isIdleFab ? 'offline-orb--idle-hybrid' : '',
        showDragHalo ? 'offline-orb--drag-halo' : '',
        nudge ? 'offline-orb--nudge' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={glyphStyle}
    >
      {!expanded ? (
        <>
          {showDragHalo ? (
            <span className="offline-orb__drag-halo" aria-hidden>
              <svg className="offline-orb__drag-halo-ring" viewBox="0 0 100 100" focusable="false">
                <defs>
                  <linearGradient id={`${uid}-halo-chrome`} x1="12%" y1="8%" x2="88%" y2="92%">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="16%" stopColor="#c084fc" />
                    <stop offset="32%" stopColor="#ff2ecf" />
                    <stop offset="48%" stopColor="#8b5cf6" />
                    <stop offset="64%" stopColor="#22d3ee" />
                    <stop offset="80%" stopColor="#ff5ae8" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                  <filter id={`${uid}-halo-glow`} x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="0.55" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <circle
                  className="offline-orb__drag-halo-stroke"
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={`url(#${uid}-halo-chrome)`}
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeDasharray="4.2 5.8"
                  filter={`url(#${uid}-halo-glow)`}
                />
              </svg>
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <span
                  key={deg}
                  className={[
                    'offline-orb__drag-arrow',
                    i % 2 === 0 ? 'offline-orb__drag-arrow--rim' : '',
                    i === 0 ? 'offline-orb__drag-arrow--chrome' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ ['--a' as string]: `${deg}deg` }}
                />
              ))}
            </span>
          ) : null}
          {isIdleFab ? (
          <div className="offline-orb__hybrid offline-orb__hybrid--pulse">
            <div className="offline-orb__hybrid-layer offline-orb__hybrid-layer--b">
              <OfflineIdleFabVisual
                skin="tuned"
                uid={`${uid}-b`}
                showDot
                showBeacon
              />
            </div>
            <div className="offline-orb__hybrid-layer offline-orb__hybrid-layer--a" aria-hidden>
              <OfflineIdleFabVisual
                skin="baseline"
                uid={`${uid}-a`}
                showDot={false}
                showBeacon
              />
            </div>
            <button
              type="button"
              className="offline-orb__fab offline-orb__fab--hit"
              onPointerDown={onPointerDown}
              aria-expanded={false}
              aria-label={fabAria}
              title="Перетащите или нажмите"
            />
          </div>
        ) : (
          <button
            type="button"
            className={['offline-orb__fab', showCutout ? 'offline-orb__fab--cutout' : '']
              .filter(Boolean)
              .join(' ')}
            onPointerDown={onPointerDown}
            aria-expanded={false}
            aria-label={fabAria}
            title="Перетащите или нажмите"
          >
            {showWell ? <OfflineFabWell /> : null}
            <span className="offline-orb__fab-face" aria-hidden />
            <span className="offline-orb__fab-glow" aria-hidden />
            <span className="offline-orb__fab-ring" aria-hidden />
            {running ? <OfflineProgressRing progress={pct} /> : null}
            {ready ? <OfflineReadyCompleteRing /> : null}
            <span
              className={[
                'offline-orb__glyph-wrap',
                running ? 'offline-orb__glyph-wrap--running' : '',
                ready ? 'offline-orb__glyph-wrap--ready' : '',
                `offline-orb__glyph-wrap--${fabGlyphKind}`,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {fabGlyph(fabGlyphKind, `${uid}-fab`)}
            </span>
            <span className="offline-orb__fab-hit" aria-hidden />
          </button>
        )}
        </>
      ) : (
        <div className="offline-orb__capsule" role="dialog" aria-label="Загрузка на устройство">
          <span className="offline-orb__capsule-shine" aria-hidden />
          <header className="offline-orb__head">
            <button
              type="button"
              className="offline-orb__head-fab"
              onClick={close}
              aria-label="Свернуть в кнопку офлайна"
              title="Свернуть"
            >
              {isIdleFab ? (
                <div className="offline-orb__hybrid offline-orb__hybrid--pulse">
                  <div className="offline-orb__hybrid-layer offline-orb__hybrid-layer--b">
                    <OfflineIdleFabVisual
                      skin="tuned"
                      uid={`${uid}-cap-b`}
                      showDot
                      showBeacon
                    />
                  </div>
                  <div
                    className="offline-orb__hybrid-layer offline-orb__hybrid-layer--a"
                    aria-hidden
                  >
                    <OfflineIdleFabVisual
                      skin="baseline"
                      uid={`${uid}-cap-a`}
                      showDot={false}
                      showBeacon
                    />
                  </div>
                </div>
              ) : (
                <div
                  className={[
                    'offline-orb__fab',
                    'offline-orb__fab--visual',
                    showCutout ? 'offline-orb__fab--cutout' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden
                >
                  {showWell ? <OfflineFabWell /> : null}
                  <span className="offline-orb__fab-face" />
                  <span className="offline-orb__fab-glow" />
                  <span className="offline-orb__fab-ring" />
                  {running ? <OfflineProgressRing progress={pct} /> : null}
                  {ready ? <OfflineReadyCompleteRing /> : null}
                  <span
                    className={[
                      'offline-orb__glyph-wrap',
                      running ? 'offline-orb__glyph-wrap--running' : '',
                      ready ? 'offline-orb__glyph-wrap--ready' : '',
                      `offline-orb__glyph-wrap--${headGlyphKind}`,
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {fabGlyph(headGlyphKind, `${uid}-cap`)}
                  </span>
                </div>
              )}
            </button>
            <div className="offline-orb__head-text">
              <p className="offline-orb__eyebrow">Для игры без интернета</p>
              <h2 className="offline-orb__title">Загрузка на устройство</h2>
              <p className="offline-orb__lead">«Офлайн vs ИИ» всегда доступен.</p>
            </div>
            <button type="button" className="offline-orb__close" onClick={close} aria-label="Свернуть">
              ×
            </button>
          </header>

          <div className="offline-orb__actions">
            <div
              className={[
                'offline-orb__panel',
                'offline-orb__panel--download',
                ready ? 'offline-orb__panel--done' : '',
                running ? 'offline-orb__panel--busy' : '',
                openPanels.download ? 'offline-orb__panel--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="offline-orb__panel-row">
                {downloadTitleNode}
                <div className="offline-orb__panel-tools">
                  <button
                    type="button"
                    className={[
                      'offline-orb__icon-btn',
                      'offline-orb__icon-btn--help',
                      openPanels.download ? 'offline-orb__icon-btn--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-expanded={!!openPanels.download}
                    aria-label={openPanels.download ? 'Свернуть описание' : 'Развернуть описание'}
                    onClick={() => togglePanel('download')}
                  >
                    <OfflineExpandHelpGlyph uid={`${uid}-dl-help`} />
                  </button>
                  <button
                    type="button"
                    className="offline-orb__icon-btn offline-orb__icon-btn--go"
                    aria-label="Скачать игру на устройство"
                    disabled={downloadDisabled}
                    onClick={onDownload}
                  >
                    <OfflineToolDownloadGlyph uid={`${uid}-dl-go`} />
                  </button>
                </div>
              </div>
              {(running || (cached > 0 && !ready)) && (
                <span className="offline-orb__bar" aria-hidden>
                  <span className="offline-orb__bar-fill" style={{ width: `${pct}%` }} />
                </span>
              )}
              {openPanels.download ? (
                <div className="offline-orb__panel-body">
                  {running ? (
                    <p>Не выключайте интернет</p>
                  ) : blocked ? (
                    <p>Нужен HTTPS или ярлык с боевого сайта</p>
                  ) : (
                    <>
                      <p>Нужные файлы будут храниться в браузере.</p>
                      <p className="offline-orb__em">
                        Важно: очистка cookie / данных сайта для этой игры сбрасывает
                        офлайн-историю и часть визуала.
                      </p>
                      <p>
                        Если снова скачать игру на устройство — офлайн-режим полностью
                        восстановится.
                      </p>
                      <p>
                        История офлайн-матчей с устройства при очистке данных сайта{' '}
                        <strong className="offline-orb__strong">не возвращается</strong>. Для
                        хранения истории вне устройства играйте через{' '}
                        <a href={accountRouteHref()} className="offline-orb__link">
                          вход в аккаунт
                        </a>
                        :{' '}
                        <strong className="offline-orb__strong">
                          партии, доигранные под логином, сохраняются в облаке
                        </strong>
                        .
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className={[
                'offline-orb__panel',
                'offline-orb__panel--install',
                openPanels.install ? 'offline-orb__panel--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="offline-orb__panel-row">
                {installTitleNode}
                <div className="offline-orb__panel-tools">
                  <button
                    type="button"
                    className={[
                      'offline-orb__icon-btn',
                      'offline-orb__icon-btn--help',
                      openPanels.install ? 'offline-orb__icon-btn--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-expanded={!!openPanels.install}
                    aria-label={openPanels.install ? 'Свернуть описание' : 'Развернуть описание'}
                    onClick={() => togglePanel('install')}
                  >
                    <OfflineExpandHelpGlyph uid={`${uid}-in-help`} />
                  </button>
                  <button
                    type="button"
                    className="offline-orb__icon-btn offline-orb__icon-btn--go"
                    aria-label="Добавить ярлык на экран"
                    onClick={() => void onInstall()}
                  >
                    <OfflineToolShortcutGlyph uid={`${uid}-in-go`} />
                  </button>
                </div>
              </div>
              {openPanels.install ? (
                <div className="offline-orb__panel-body">
                  {installKind === 'installed' ? (
                    <p>Можно сразу качать офлайн-пакет выше</p>
                  ) : installKind === 'unavailable' ? (
                    <p>На HTTPS в Chrome часто появляется установка</p>
                  ) : (
                    <>
                      <p>Иконка игры на рабочий стол.</p>
                      <p className="offline-orb__action-sub-lead">
                        Открывает игру в один тап + полноэкранный режим.
                      </p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <div
              className={[
                'offline-orb__panel',
                'offline-orb__panel--combo',
                openPanels.combo ? 'offline-orb__panel--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className="offline-orb__panel-row">
                <OfflinePanelTitle
                  action="Скачать"
                  rest=" игру и установить ярлык"
                  onAction={onDownloadAndInstall}
                  disabled={downloadDisabled}
                />
                <div className="offline-orb__panel-tools">
                  <button
                    type="button"
                    className={[
                      'offline-orb__icon-btn',
                      'offline-orb__icon-btn--help',
                      openPanels.combo ? 'offline-orb__icon-btn--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-expanded={!!openPanels.combo}
                    aria-label={openPanels.combo ? 'Свернуть описание' : 'Развернуть описание'}
                    onClick={() => togglePanel('combo')}
                  >
                    <OfflineExpandHelpGlyph uid={`${uid}-cb-help`} />
                  </button>
                  <button
                    type="button"
                    className="offline-orb__icon-btn offline-orb__icon-btn--go"
                    aria-label="Скачать игру и установить ярлык"
                    disabled={downloadDisabled}
                    onClick={onDownloadAndInstall}
                  >
                    <OfflineToolDownloadGlyph uid={`${uid}-cb-go`} />
                  </button>
                </div>
              </div>
              {openPanels.combo ? (
                <div className="offline-orb__panel-body">
                  <p>Оба шага сразу: загрузка на устройство + иконка на экран.</p>
                </div>
              ) : null}
            </div>
          </div>

          {blockReason ? (
            <p className="offline-orb__note offline-orb__note--warn" role="status">
              {blockReason}
            </p>
          ) : null}
          {installMsg ? (
            <p className="offline-orb__note" role="status">
              {installMsg}
            </p>
          ) : null}
          {pack?.lastError && !ready && !blocked ? (
            <p className="offline-orb__note offline-orb__note--warn" role="status">
              {pack.lastError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
