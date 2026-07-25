/**
 * Аватарка signed-identity на главной: profile (WAVE + offline-dot) / account (twin + online pill).
 * Тултип по антенне профиля → кабинет; по индикатору статуса → «офлайн» / «онлайн».
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { MenuIdentityStatus } from '../lib/menuIdentityStatus';
import { PlayerAvatar } from './PlayerAvatar';

export type MenuSignedStatus = Extract<MenuIdentityStatus, 'profile' | 'account'>;

const PROFILE_WAVE_TIP_TEXT =
  'Вы в локальном профиле. Для игр в интернет, сохранения в облаке и рейтинга войдите в аккаунт.';

const ONLINE_STATUS_TIP =
  'Онлайн: вы вошли в аккаунт. Доступны комнаты в интернет, облачная история и рейтинг.';

const OFFLINE_STATUS_TIP =
  'Офлайн-профиль: имя и прогресс на этом устройстве. Для онлайна и облака войдите в аккаунт.';

/** Чередование «онлайн» / имя, затем только имя (мс). */
const ONLINE_LABEL_CYCLE_MS = 8500;
/** Интервал смены надписи во время чередования (мс). */
const ONLINE_LABEL_FLIP_MS = 2000;
/** Кол-во букв имени после завершения мигания. */
const SETTLED_NAME_CHARS = 5;

const ONLINE_LETTER_COLORS = ['#a5f3fc', '#22d3ee', '#2dd4bf', '#67e8f9', '#34d399', '#38bdf8'] as const;

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

function ColorfulOnlineLabel({ text, preserveCase }: { text: string; preserveCase?: boolean }) {
  return (
    <span
      className={[
        'menu-signed-id__online-text',
        preserveCase ? 'menu-signed-id__online-text--name' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    >
      {[...text].map((ch, i) => (
        <span
          key={`${ch}-${i}`}
          className="menu-signed-id__online-letter"
          style={{ color: ONLINE_LETTER_COLORS[i % ONLINE_LETTER_COLORS.length] }}
        >
          {ch === ' ' ? '\u00a0' : ch}
        </span>
      ))}
    </span>
  );
}

function StatusTip({
  tipId,
  anchorRef,
  title,
  body,
  onClose,
}: {
  tipId: string;
  anchorRef: RefObject<HTMLElement | null>;
  title: string;
  body: string;
  onClose: () => void;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const tipW = tipRef.current?.offsetWidth ?? 240;
      const tipH = tipRef.current?.offsetHeight ?? 100;
      const pad = 10;
      let left = r.left + r.width / 2 - tipW / 2;
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
      if (t.closest('.menu-signed-id__tip') || t.closest('[data-signed-status-anchor]')) return;
      onClose();
    };
    const autoClose = window.setTimeout(onClose, 7000);
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
      aria-label={title}
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
      <p className="game-table-tooltip-cosmic-body-text menu-signed-id__tip-text">{body}</p>
    </div>,
    document.body,
  );
}

/** Аккаунт: пилюля с индикатором + надпись; 7–10с чередует «онлайн»/имя, затем короткое имя. */
function AccountStatusBadge({
  tipId,
  tipOpen,
  onToggleTip,
  badgeRef,
  accountName,
}: {
  tipId: string;
  tipOpen: boolean;
  onToggleTip: () => void;
  badgeRef: RefObject<HTMLButtonElement | null>;
  accountName: string;
}) {
  const fullName = accountName.trim() || 'аккаунт';
  const settledName =
    fullName.length <= SETTLED_NAME_CHARS ? fullName : fullName.slice(0, SETTLED_NAME_CHARS);
  const settledTruncated = fullName.length > SETTLED_NAME_CHARS;

  const [showOnlineWord, setShowOnlineWord] = useState(true);
  const [cycling, setCycling] = useState(true);

  useEffect(() => {
    if (!cycling) return;
    const flip = window.setInterval(() => {
      setShowOnlineWord((v) => !v);
    }, ONLINE_LABEL_FLIP_MS);
    const stop = window.setTimeout(() => {
      window.clearInterval(flip);
      setCycling(false);
      setShowOnlineWord(false);
    }, ONLINE_LABEL_CYCLE_MS);
    return () => {
      window.clearInterval(flip);
      window.clearTimeout(stop);
    };
  }, [cycling]);

  const label = showOnlineWord && cycling ? 'онлайн' : cycling ? fullName : settledName;
  const showFade = !cycling && settledTruncated;

  useLayoutEffect(() => {
    const el = badgeRef.current;
    if (!el) return;

    const EDGE_PAD = 8;
    const place = () => {
      el.style.setProperty('--status-shift-x', '0px');
      if (!cycling) return;
      const rect = el.getBoundingClientRect();
      const viewRight = window.innerWidth - EDGE_PAD;
      const viewLeft = EDGE_PAD;
      let shift = 0;
      if (rect.right > viewRight) shift = viewRight - rect.right;
      if (rect.left + shift < viewLeft) shift = viewLeft - rect.left;
      el.style.setProperty('--status-shift-x', `${Math.round(shift)}px`);
    };

    place();
    const raf = window.requestAnimationFrame(place);
    window.addEventListener('resize', place);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', place);
      el.style.removeProperty('--status-shift-x');
    };
  }, [badgeRef, cycling, label]);

  return (
    <button
      ref={badgeRef as RefObject<HTMLButtonElement>}
      type="button"
      data-signed-status-anchor
      className={[
        'menu-signed-id__status',
        'menu-signed-id__status--online',
        'menu-signed-id__status--pill',
        cycling ? 'menu-signed-id__status--cycling' : 'menu-signed-id__status--settled',
        tipOpen ? 'menu-signed-id__status--tip-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Онлайн: ${fullName}. Показать пояснение`}
      aria-expanded={tipOpen}
      aria-controls={tipOpen ? tipId : undefined}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleTip();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="menu-signed-id__status-core" aria-hidden>
        <span className="menu-signed-id__status-glow" />
        <span className="menu-signed-id__status-dot" />
      </span>
      <span className="menu-signed-id__online-label">
        <ColorfulOnlineLabel text={label} preserveCase={label !== 'онлайн'} />
        {showFade ? (
          <span className="menu-signed-id__name-fade" aria-hidden>
            <span className="menu-signed-id__name-fade-dot" />
            <span className="menu-signed-id__name-fade-dot" />
            <span className="menu-signed-id__name-fade-dot" />
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Профиль: сразу орб acid pink; тап → тултип «офлайн». */
function ProfileStatusBadge({
  tipId,
  tipOpen,
  onToggleTip,
  badgeRef,
}: {
  tipId: string;
  tipOpen: boolean;
  onToggleTip: () => void;
  badgeRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={badgeRef as RefObject<HTMLButtonElement>}
      type="button"
      data-signed-status-anchor
      className={[
        'menu-signed-id__status',
        'menu-signed-id__status--offline',
        'menu-signed-id__status--orb',
        tipOpen ? 'menu-signed-id__status--tip-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Статус: офлайн-профиль. Показать пояснение"
      aria-expanded={tipOpen}
      aria-controls={tipOpen ? tipId : undefined}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggleTip();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="menu-signed-id__status-core" aria-hidden>
        <span className="menu-signed-id__status-glow" />
        <span className="menu-signed-id__status-dot" />
      </span>
    </button>
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
  const waveTipId = useId();
  const statusTipId = useId();
  const waveRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const [waveTipOpen, setWaveTipOpen] = useState(false);
  const [statusTipOpen, setStatusTipOpen] = useState(false);

  const closeWaveTip = useCallback(() => setWaveTipOpen(false), []);
  const toggleWaveTip = useCallback(() => {
    setStatusTipOpen(false);
    setWaveTipOpen((v) => !v);
  }, []);
  const closeStatusTip = useCallback(() => setStatusTipOpen(false), []);
  const toggleStatusTip = useCallback(() => {
    setWaveTipOpen(false);
    setStatusTipOpen((v) => !v);
  }, []);

  const openCabinetFromTip = useCallback(() => {
    setWaveTipOpen(false);
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
      {isAccount ? (
        <AccountStatusBadge
          tipId={statusTipId}
          tipOpen={statusTipOpen}
          onToggleTip={toggleStatusTip}
          badgeRef={statusRef}
          accountName={name}
        />
      ) : (
        <ProfileStatusBadge
          tipId={statusTipId}
          tipOpen={statusTipOpen}
          onToggleTip={toggleStatusTip}
          badgeRef={statusRef}
        />
      )}
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
          <WaveAntenna tipOpen={waveTipOpen} tipId={waveTipId} badgeRef={waveRef} onToggleTip={toggleWaveTip} />
        ) : (
          <TwinStars />
        )}
      </span>
      {statusTipOpen ? (
        <StatusTip
          tipId={statusTipId}
          anchorRef={statusRef}
          title={isAccount ? 'Онлайн' : 'Офлайн'}
          body={isAccount ? ONLINE_STATUS_TIP : OFFLINE_STATUS_TIP}
          onClose={closeStatusTip}
        />
      ) : null}
      {!isAccount && waveTipOpen ? (
        <ProfileWaveTip
          tipId={waveTipId}
          anchorRef={waveRef}
          onClose={closeWaveTip}
          onOpenCabinet={openCabinetFromTip}
        />
      ) : null}
    </span>
  );
}
