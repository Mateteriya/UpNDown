/**
 * ПК/планшет Юг: аватар + absolute-колонка ★+имя слева.
 * Колонка НЕ в потоке (position:absolute !important) → vertical-name не раздувает панель.
 * Правая кромка колонки = visual left внешней кромки обода (scale/ring учтены).
 */

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { StarsBalanceBadge } from './StarsBalanceBadge';
import { UserSouthPcNamePlaque } from './UserSouthPcNamePlaque';
import {
  USER_SOUTH_NAME_RAIL_WIDTH_PC_PX,
  USER_SOUTH_NAME_RAIL_WIDTH_TABLET_PX,
} from './userSouthPanelCanon';

type UserSouthPcAvatarRailProps = {
  facePx: number;
  name: string;
  isBiddingPhase: boolean;
  longCompact: boolean;
  textClassName: string;
  textStyle?: CSSProperties;
  layoutKey: string;
  isTabletShell?: boolean;
  /** ★ только в онлайн-комнате (живые игроки); офлайн — скрыто */
  showStars?: boolean;
  onSaveDisplayName?: (displayName: string) => void;
  renderAvatar: (facePx: number) => ReactNode;
};

type Dock = {
  left: number;
  top: number;
  height: number;
};

function pickChromeEl(wrap: HTMLElement): HTMLElement | null {
  return (
    (wrap.querySelector(
      '.user-player-avatar-order-scale-wrap',
    ) as HTMLElement | null) ||
    (wrap.querySelector('.opponent-avatar-order-ring') as HTMLElement | null) ||
    (wrap.querySelector(
      'button.user-player-avatar-root, .player-avatar',
    ) as HTMLElement | null)
  );
}

/** Visual left внешней кромки обода (transform/scale входят в getBoundingClientRect). */
function measureChromeOuterLeft(wrap: HTMLElement): number {
  const scaleEl = wrap.querySelector(
    '.user-player-avatar-order-scale-wrap',
  ) as HTMLElement | null;
  const ringEl = wrap.querySelector(
    '.opponent-avatar-order-ring',
  ) as HTMLElement | null;
  const faceEl = wrap.querySelector(
    'button.user-player-avatar-root, .player-avatar',
  ) as HTMLElement | null;

  let outerLeft = Infinity;
  for (const el of [scaleEl, ringEl, faceEl]) {
    if (!el) continue;
    outerLeft = Math.min(outerLeft, el.getBoundingClientRect().left);
  }
  if (!Number.isFinite(outerLeft)) {
    return wrap.getBoundingClientRect().left;
  }
  return outerLeft;
}

export function UserSouthPcAvatarRail({
  facePx,
  name,
  isBiddingPhase,
  longCompact,
  textClassName,
  textStyle,
  layoutKey,
  isTabletShell = false,
  showStars = false,
  onSaveDisplayName,
  renderAvatar,
}: UserSouthPcAvatarRailProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const railW = isTabletShell
    ? USER_SOUTH_NAME_RAIL_WIDTH_TABLET_PX
    : USER_SOUTH_NAME_RAIL_WIDTH_PC_PX;

  const [dock, setDock] = useState<Dock>({ left: -railW, top: 0, height: facePx });

  useLayoutEffect(() => {
    const root = rootRef.current;
    const wrap = wrapRef.current;
    const chrome = chromeRef.current;
    if (!root || !wrap || !chrome) return;

    /* Гарантированно вынуть из потока — иначе vertical-name раздувает Юг */
    chrome.style.setProperty('position', 'absolute', 'important');
    chrome.style.setProperty('right', 'auto', 'important');
    chrome.style.setProperty('margin', '0', 'important');
    /* visible — ★ popover; имя клипает себя через overflow:hidden на dock */
    chrome.style.setProperty('overflow', 'visible', 'important');

    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rootRect = root.getBoundingClientRect();
        const chromeLeft = measureChromeOuterLeft(wrap);
        const avatarEl = pickChromeEl(wrap) ?? wrap;
        const avRect = avatarEl.getBoundingClientRect();
        /* Высота по layout-box wrap — scale не раздувает слот */
        const layoutH = Math.max(1, Math.round(wrap.offsetHeight || facePx));
        const next: Dock = {
          left: Math.round(chromeLeft - rootRect.left - railW),
          top: Math.round(avRect.top - rootRect.top + (avRect.height - layoutH) / 2),
          height: layoutH,
        };
        setDock((prev) =>
          prev.left === next.left && prev.top === next.top && prev.height === next.height
            ? prev
            : next,
        );
        root.style.setProperty(
          '--south-rail-out',
          `${Math.max(0, Math.round(wrap.getBoundingClientRect().left - chromeLeft))}px`,
        );
      });
    };

    measure();
    const t1 = window.setTimeout(measure, 32);
    const t2 = window.setTimeout(measure, 120);
    const t3 = window.setTimeout(measure, 320);

    const ro = new ResizeObserver(measure);
    ro.observe(root);
    ro.observe(wrap);
    wrap
      .querySelectorAll(
        '.user-player-avatar-order-scale-wrap, .opponent-avatar-order-ring, button.user-player-avatar-root, .player-avatar',
      )
      .forEach((el) => ro.observe(el));

    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [facePx, layoutKey, railW]);

  const chromeStyle: CSSProperties = {
    position: 'absolute',
    left: dock.left,
    top: dock.top,
    right: 'auto',
    width: railW,
    height: dock.height,
    zIndex: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    gap: 0,
    margin: 0,
    padding: 0,
    overflow: 'visible',
    pointerEvents: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div
      ref={rootRef}
      className="user-player-panel-pc-avatar-name-stack user-player-panel-pc-avatar-name-stack--rail"
      style={{
        position: 'relative',
        display: 'block',
        width: 'fit-content',
        height: 'fit-content',
        maxHeight: 'none',
        padding: 0,
        margin: 0,
        overflow: 'visible',
        lineHeight: 0,
      }}
    >
      <div
        ref={chromeRef}
        className="user-player-panel-pc-left-chrome"
        style={chromeStyle}
      >
        {/* Два стыковочных зажима: верхний + нижний */}
        <div className="user-player-panel-pc-rail-bridge" aria-hidden="true">
          <span className="user-player-panel-pc-rail-bridge__pin user-player-panel-pc-rail-bridge__pin--top" />
          <span className="user-player-panel-pc-rail-bridge__pin user-player-panel-pc-rail-bridge__pin--bot" />
        </div>
        {showStars ? (
          <div className="user-player-panel-pc-rail-stars">
            <StarsBalanceBadge
              className="stars-badge--south-rail-vertical"
              size="sm"
              interactive
            />
          </div>
        ) : null}
        <div className="user-player-panel-pc-name-dock user-player-panel-pc-name-dock--left-rail">
          <UserSouthPcNamePlaque
            name={name}
            isBiddingPhase={isBiddingPhase}
            longCompact={longCompact}
            textClassName={textClassName}
            textStyle={textStyle}
            isTabletShell={isTabletShell}
            onSaveDisplayName={onSaveDisplayName}
          />
        </div>
      </div>
      <div
        ref={wrapRef}
        className="user-player-panel-pc-avatar-wrap"
        style={{
          position: 'relative',
          display: 'inline-flex',
          width: 'fit-content',
          height: 'fit-content',
          maxHeight: 'none',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          lineHeight: 0,
          margin: 0,
        }}
      >
        {renderAvatar(facePx)}
      </div>
    </div>
  );
}
