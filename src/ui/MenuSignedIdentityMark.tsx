/**
 * Аватарка signed-identity на главной: profile (WAVE) / account (twin + «онлайн»).
 * Тултип по антенне профиля → приглашение в кабинет.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MenuIdentityStatus } from '../lib/menuIdentityStatus';
import { PlayerAvatar } from './PlayerAvatar';

export type MenuSignedStatus = Extract<MenuIdentityStatus, 'profile' | 'account'>;

const PROFILE_WAVE_TIP_TEXT =
  'Вы в локальном профиле. Для игр в интернет, сохранения в облаке и рейтинга войдите в аккаунт.';

type MenuSignedIdentityMarkProps = {
  status: MenuSignedStatus;
  name: string;
  avatarDataUrl?: string | null;
  avatarBgColor?: string | null;
  sizePx?: number;
  onOpenCabinet: () => void;
  className?: string;
  /** chip = мобильный чип кабинета; capsule = ПК MenuCapsuleButton */
  surface?: 'chip' | 'capsule';
};

function TwinStars() {
  return (
    <span className="menu-signed-id__stars" aria-hidden>
      <svg viewBox="0 0 12 12" className="menu-signed-id__star menu-signed-id__star--a">
        <path d="M6 1 L7 4.5 L10.5 6 L7 7.5 L6 11 L5 7.5 L1.5 6 L5 4.5 Z" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 12 12" className="menu-signed-id__star menu-signed-id__star--b">
        <path d="M6 1 L7 4.5 L10.5 6 L7 7.5 L6 11 L5 7.5 L1.5 6 L5 4.5 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function OnlineStamp() {
  return (
    <span className="menu-signed-id__online" aria-hidden>
      <span className="menu-signed-id__online-dot" />
      <span className="menu-signed-id__online-text">онлайн</span>
    </span>
  );
}

function WaveAntenna({
  tipOpen,
  tipId,
  badgeRef,
  onToggleTip,
}: {
  tipOpen: boolean;
  tipId: string;
  badgeRef: RefObject<HTMLButtonElement | null>;
  onToggleTip: () => void;
}) {
  return (
    <button
      ref={badgeRef as RefObject<HTMLButtonElement>}
      type="button"
      className={[
        'menu-signed-id__wave',
        tipOpen ? 'menu-signed-id__wave--tip-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Подсказка: локальный профиль"
      aria-expanded={tipOpen}
      aria-controls={tipOpen ? tipId : undefined}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleTip();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <svg className="menu-signed-id__wave-svg" viewBox="0 0 28 28" aria-hidden>
        <path
          className="menu-signed-id__wave-arc menu-signed-id__wave-arc--a"
          d="M8.5 11.5c2.4-2.4 6.4-2.4 8.8 0"
          fill="none"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          className="menu-signed-id__wave-arc menu-signed-id__wave-arc--b"
          d="M6.2 8.8c3.8-3.8 10-3.8 13.8 0"
          fill="none"
          strokeWidth="1.45"
          strokeLinecap="round"
        />
        <path
          d="M14 13.2 L14 20.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          opacity="0.9"
        />
        <circle cx="14" cy="12.2" r="2.15" fill="currentColor" />
        <path
          d="M10.2 21.2 H17.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.85"
        />
      </svg>
    </button>
  );
}

function ProfileWaveTip({
  tipId,
  anchorRef,
  onClose,
  onOpenCabinet,
}: {
  tipId: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpenCabinet: () => void;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const tipW = tipRef.current?.offsetWidth ?? 240;
      const tipH = tipRef.current?.offsetHeight ?? 120;
      const pad = 10;
      let left = r.left + r.width / 2 - tipW * 0.72;
      let top = r.bottom + 10;
      left = Math.max(pad, Math.min(left, window.innerWidth - tipW - pad));
      if (top + tipH > window.innerHeight - pad) {
        top = Math.max(pad, r.top - tipH - 10);
      }
      setPos({ top, left });
    };
    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('.menu-signed-id__tip') || t.closest('.menu-signed-id__wave')) return;
      onClose();
    };
    const autoClose = window.setTimeout(onClose, 8500);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.clearTimeout(autoClose);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={tipRef}
      id={tipId}
      className="menu-signed-id__tip game-table-tooltip-cosmic"
      role="dialog"
      aria-label="Локальный профиль"
      style={
        pos
          ? { top: pos.top, left: pos.left, visibility: 'visible' }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      <button
        type="button"
        className="menu-signed-id__tip-close"
        aria-label="Закрыть"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span aria-hidden>×</span>
      </button>
      <p className="game-table-tooltip-cosmic-body-text menu-signed-id__tip-text">{PROFILE_WAVE_TIP_TEXT}</p>
      <button
        type="button"
        className="menu-signed-id__tip-cta"
        onClick={(e) => {
          e.stopPropagation();
          onOpenCabinet();
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="menu-signed-id__tip-cta__label">войти в кабинет</span>
      </button>
    </div>,
    document.body,
  );
}

export function MenuSignedIdentityMark({
  status,
  name,
  avatarDataUrl,
  avatarBgColor,
  sizePx = 44,
  onOpenCabinet,
  className,
  surface = 'chip',
}: MenuSignedIdentityMarkProps) {
  const isAccount = status === 'account';
  const tipId = useId();
  const waveRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);

  const closeTip = useCallback(() => setTipOpen(false), []);
  const toggleTip = useCallback(() => setTipOpen((v) => !v), []);

  const openCabinetFromTip = useCallback(() => {
    setTipOpen(false);
    onOpenCabinet();
  }, [onOpenCabinet]);

  const faceSize = surface === 'capsule' ? sizePx : isAccount ? sizePx + 4 : sizePx;

  return (
    <span
      className={[
        'menu-signed-id',
        `menu-signed-id--${status}`,
        `menu-signed-id--${surface}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="menu-signed-id__ring">
        <PlayerAvatar
          name={name}
          avatarDataUrl={avatarDataUrl}
          avatarBgColor={avatarBgColor}
          sizePx={faceSize}
          className={[
            'menu-signed-id__face',
            isAccount ? 'menu-signed-id__face--pop' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        />
        {!isAccount ? (
          <WaveAntenna tipOpen={tipOpen} tipId={tipId} badgeRef={waveRef} onToggleTip={toggleTip} />
        ) : (
          <TwinStars />
        )}
      </span>
      {isAccount ? <OnlineStamp /> : null}
      {!isAccount && tipOpen ? (
        <ProfileWaveTip
          tipId={tipId}
          anchorRef={waveRef}
          onClose={closeTip}
          onOpenCabinet={openCabinetFromTip}
        />
      ) : null}
    </span>
  );
}
