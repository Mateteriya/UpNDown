/**
 * Песочница статусов аватарки — /mode-label-lab.
 * Стадии profile / account: текущие I–U + новые отличия связи.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { accountRouteHref } from '../../lib/accountRoute';
import type { MenuIdentityStatus } from '../../lib/menuIdentityStatus';
import { menuIdentityStatusLabel, MENU_IDENTITY_STATUS_ARIA } from '../../lib/menuIdentityStatus';
import { PlayerAvatar } from '../PlayerAvatar';

export type AvatarStatusLabVariant =
  | 'I'
  | 'BE'
  | 'J'
  | 'K'
  | 'U'
  | 'WAVE'
  | 'STAMP'
  | 'DISH'
  | 'CHIP'
  | 'IPLUS'
  | 'WSTAMP';

type LabIdentityStatus = Extract<MenuIdentityStatus, 'profile' | 'account'>;

const PROFILE_WAVE_TIP_TEXT =
  'Вы в локальном профиле. Для игр в интернет, сохранения в облаке и рейтинга войдите в аккаунт.';

const DEMO: Record<LabIdentityStatus, { name: string; email: string | null }> = {
  profile: { name: 'Мыша', email: null },
  account: { name: 'Мыша', email: 'mysha@example.com' },
};

const VARIANT_META: Record<AvatarStatusLabVariant, { title: string; blurb: string; tag?: string }> = {
  I: {
    title: 'I — Док + искра (profile/account)',
    blurb: 'Аватар + док; account + искра + 3D.',
    tag: 'keep',
  },
  BE: {
    title: 'Гибрид B+E',
    blurb: 'Полюса + тембр; account 3D.',
    tag: 'keep',
  },
  J: {
    title: 'J — круг-аватар',
    blurb: 'Profile/account: обычный круг-аватар.',
    tag: 'keep',
  },
  K: {
    title: 'K — twin stars (account)',
    blurb: 'Account: двойные микрозвёзды.',
    tag: 'keep',
  },
  U: {
    title: 'U — raised brow (источник смайла)',
    blurb: 'Profile/account: аватар (без guest-глифа).',
    tag: 'face',
  },
  WAVE: {
    title: 'WAVE — ловит волну ↔ на связи',
    blurb: 'Profile: антенна + редкие ping-дуги. Account: плотные дуги + зелёный lock-on.',
    tag: 'new',
  },
  STAMP: {
    title: 'STAMP — passport stamp',
    blurb: 'Уголок-штамп: LOCAL / ONLINE.',
    tag: 'new',
  },
  DISH: {
    title: 'DISH — seeking dish',
    blurb: 'Profile: тарелка ищет sweep. Account: захват + точка lock.',
    tag: 'new',
  },
  CHIP: {
    title: 'CHIP — capsule chip',
    blurb: 'Мини-плашка под аватаром: «профиль» / «в сети».',
    tag: 'new',
  },
  IPLUS: {
    title: 'I+ — док с offline / online',
    blurb: 'Док как у I, плюс глиф: перечёркнутый сигнал (profile) / живой сигнал (account).',
    tag: 'new',
  },
  WSTAMP: {
    title: 'WSTAMP — WAVE × STAMP × K',
    blurb:
      'Profile: WAVE + тап по антенне → тултип и «войти в кабинет». Account: twin stars + плашка «онлайн».',
    tag: 'try',
  },
};

function StarSparkle() {
  return (
    <svg className="avatar-status-lab__star-badge avatar-status-lab__star-badge--sparkle" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.5 L13.2 9.2 L19.5 12 L13.2 14.8 L12 21.5 L10.8 14.8 L4.5 12 L10.8 9.2 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function StarTwin() {
  return (
    <span className="avatar-status-lab__star-twin" aria-hidden>
      <svg viewBox="0 0 12 12" className="avatar-status-lab__star-micro">
        <path d="M6 1 L7 4.5 L10.5 6 L7 7.5 L6 11 L5 7.5 L1.5 6 L5 4.5 Z" fill="currentColor" />
      </svg>
      <svg viewBox="0 0 12 12" className="avatar-status-lab__star-micro avatar-status-lab__star-micro--b">
        <path d="M6 1 L7 4.5 L10.5 6 L7 7.5 L6 11 L5 7.5 L1.5 6 L5 4.5 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function DockI({ status }: { status: LabIdentityStatus }) {
  return (
    <span className={['avatar-status-lab__dock', `avatar-status-lab__dock--${status}`].join(' ')} aria-hidden />
  );
}

function PolesB({ status }: { status: LabIdentityStatus }) {
  return (
    <span className="avatar-status-lab__poles" aria-hidden>
      <span className="avatar-status-lab__pole avatar-status-lab__pole--profile avatar-status-lab__pole--lit" />
      <span
        className={[
          'avatar-status-lab__pole',
          'avatar-status-lab__pole--cloud',
          status === 'account' ? 'avatar-status-lab__pole--lit' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      />
    </span>
  );
}

function AccountStar({ variant }: { variant: AvatarStatusLabVariant }) {
  if (variant === 'I' || variant === 'IPLUS') {
    return (
      <span className="avatar-status-lab__star-wrap">
        <StarSparkle />
      </span>
    );
  }
  if (variant === 'K' || variant === 'WSTAMP') {
    return (
      <span className="avatar-status-lab__star-wrap">
        <StarTwin />
      </span>
    );
  }
  return null;
}

/** WAVE: антенна + ping-дуги / lock-on */
function WaveSignalBadge({
  status,
  interactive,
  tipOpen,
  tipId,
  onToggleTip,
  badgeRef,
}: {
  status: LabIdentityStatus;
  interactive?: boolean;
  tipOpen?: boolean;
  tipId?: string;
  onToggleTip?: () => void;
  badgeRef?: RefObject<HTMLButtonElement | null>;
}) {
  const seeking = status === 'profile';
  const className = [
    'avatar-status-lab__wave',
    seeking ? 'avatar-status-lab__wave--seek' : 'avatar-status-lab__wave--lock',
    interactive ? 'avatar-status-lab__wave--interactive' : '',
    tipOpen ? 'avatar-status-lab__wave--tip-open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const glyph = (
    <svg className="avatar-status-lab__wave-svg" viewBox="0 0 28 28" aria-hidden>
      <path
        className="avatar-status-lab__wave-arc avatar-status-lab__wave-arc--a"
        d="M8.5 11.5c2.4-2.4 6.4-2.4 8.8 0"
        fill="none"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        className="avatar-status-lab__wave-arc avatar-status-lab__wave-arc--b"
        d="M6.2 8.8c3.8-3.8 10-3.8 13.8 0"
        fill="none"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      {!seeking ? (
        <path
          className="avatar-status-lab__wave-arc avatar-status-lab__wave-arc--c"
          d="M4.2 6.4c5.2-5.2 13.6-5.2 18.8 0"
          fill="none"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      ) : null}
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
      {seeking ? null : <circle className="avatar-status-lab__wave-lock-dot" cx="14" cy="5.2" r="1.35" />}
    </svg>
  );

  if (interactive && seeking) {
    return (
      <button
        ref={badgeRef as RefObject<HTMLButtonElement>}
        type="button"
        className={className}
        aria-label="Подсказка: локальный профиль"
        aria-expanded={tipOpen}
        aria-controls={tipOpen ? tipId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          onToggleTip?.();
        }}
      >
        {glyph}
      </button>
    );
  }

  return (
    <span className={className} aria-hidden>
      {glyph}
    </span>
  );
}

/** Космический тултип антенны профиля → ЛК */
function ProfileWaveCabinetTip({
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
      if (t.closest('.avatar-status-lab__profile-tip') || t.closest('.avatar-status-lab__wave--interactive')) {
        return;
      }
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
      className="avatar-status-lab__profile-tip game-table-tooltip-cosmic"
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
        className="avatar-status-lab__profile-tip-close"
        aria-label="Закрыть"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <span aria-hidden>×</span>
      </button>
      <p className="game-table-tooltip-cosmic-body-text avatar-status-lab__profile-tip-text">
        {PROFILE_WAVE_TIP_TEXT}
      </p>
      <button
        type="button"
        className="avatar-status-lab__profile-tip-cta"
        onClick={(e) => {
          e.stopPropagation();
          onOpenCabinet();
        }}
      >
        <span className="avatar-status-lab__profile-tip-cta__label">войти в кабинет</span>
      </button>
    </div>,
    document.body,
  );
}

/** STAMP: LOCAL / ONLINE */
function PassportStamp({ status }: { status: LabIdentityStatus }) {
  const online = status === 'account';
  return (
    <span
      className={[
        'avatar-status-lab__stamp',
        online ? 'avatar-status-lab__stamp--online' : 'avatar-status-lab__stamp--local',
      ].join(' ')}
      aria-hidden
    >
      {online ? 'ONLINE' : 'LOCAL'}
    </span>
  );
}

/** DISH: seeking / locked dish */
function SeekingDishBadge({ status }: { status: LabIdentityStatus }) {
  const seeking = status === 'profile';
  return (
    <span
      className={[
        'avatar-status-lab__dish',
        seeking ? 'avatar-status-lab__dish--seek' : 'avatar-status-lab__dish--lock',
      ].join(' ')}
      aria-hidden
    >
      <svg className="avatar-status-lab__dish-svg" viewBox="0 0 32 28">
        <ellipse
          className="avatar-status-lab__dish-bowl"
          cx="16"
          cy="18.5"
          rx="11.5"
          ry="5.2"
          fill="none"
          strokeWidth="1.55"
        />
        <path
          className="avatar-status-lab__dish-arm"
          d="M16 18.2 L16 9.5"
          fill="none"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
        <circle className="avatar-status-lab__dish-hub" cx="16" cy="8.6" r="2.1" />
        {seeking ? (
          <path
            className="avatar-status-lab__dish-sweep"
            d="M16 8.6 L24.5 4.2"
            fill="none"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        ) : (
          <>
            <path
              className="avatar-status-lab__dish-beam"
              d="M16 8.6 L22.8 3.4"
              fill="none"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <circle className="avatar-status-lab__dish-lock" cx="23.4" cy="2.9" r="1.5" />
          </>
        )}
      </svg>
    </span>
  );
}

/** CHIP: плашка под аватаром */
function CapsuleChipLabel({ status }: { status: LabIdentityStatus }) {
  const online = status === 'account';
  return (
    <span
      className={[
        'avatar-status-lab__capsule',
        online ? 'avatar-status-lab__capsule--online' : 'avatar-status-lab__capsule--local',
      ].join(' ')}
      aria-hidden
    >
      {online ? 'в сети' : 'профиль'}
    </span>
  );
}

/** WSTAMP account: плашка «онлайн» внизу + стильный индикатор */
function OnlineUnderStamp() {
  return (
    <span className="avatar-status-lab__online-stamp" aria-hidden>
      <span className="avatar-status-lab__online-stamp__dot" />
      <span className="avatar-status-lab__online-stamp__text">онлайн</span>
    </span>
  );
}

/** I+: offline / online glyph в доке */
function DockSignalGlyph({ status }: { status: LabIdentityStatus }) {
  const offline = status === 'profile';
  return (
    <span
      className={[
        'avatar-status-lab__dock-signal',
        offline ? 'avatar-status-lab__dock-signal--off' : 'avatar-status-lab__dock-signal--on',
      ].join(' ')}
      aria-hidden
    >
      <svg viewBox="0 0 20 14" className="avatar-status-lab__dock-signal-svg">
        <path
          d="M3.2 9.2c2.4-2.4 6.4-2.4 8.8 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.45"
          strokeLinecap="round"
          opacity={offline ? 0.55 : 1}
        />
        <path
          d="M1.4 6.8c3.6-3.6 9.6-3.6 13.2 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          opacity={offline ? 0.35 : 0.95}
        />
        <circle cx="7.6" cy="11.4" r="1.35" fill="currentColor" />
        {offline ? (
          <path
            d="M2.2 2.4 L15.2 12.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.55"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </span>
  );
}

function LabAvatarChip({
  variant,
  status,
  onOpenCabinet,
}: {
  variant: AvatarStatusLabVariant;
  status: LabIdentityStatus;
  onOpenCabinet?: () => void;
}) {
  const demo = DEMO[status];
  const label = menuIdentityStatusLabel(status, demo.email);
  const isAccount = status === 'account';
  const faceSize = isAccount && variant !== 'CHIP' ? 48 : 44;
  const muteRim = variant === 'WAVE' || variant === 'DISH' || variant === 'IPLUS' || variant === 'WSTAMP';
  const waveInteractive = variant === 'WSTAMP' && !isAccount;
  const tipId = useId();
  const waveBtnRef = useRef<HTMLButtonElement>(null);
  const [waveTipOpen, setWaveTipOpen] = useState(false);

  const ringClass = [
    'avatar-status-lab__ring',
    `avatar-status-lab__ring--${variant}`,
    `avatar-status-lab__ring--${status}`,
    isAccount && variant !== 'CHIP' ? 'avatar-status-lab__ring--pop' : '',
    muteRim && !isAccount ? 'avatar-status-lab__ring--mute' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="avatar-status-lab__chip-wrap">
      <div
        className={[
          'avatar-status-lab__chip',
          `avatar-status-lab__chip--${variant}`,
          `avatar-status-lab__chip--${status}`,
        ].join(' ')}
        title={MENU_IDENTITY_STATUS_ARIA[status]}
      >
        <span className={ringClass}>
          <PlayerAvatar
            name={demo.name}
            avatarDataUrl={null}
            sizePx={faceSize}
            className={[
              'avatar-status-lab__face',
              isAccount && variant !== 'CHIP' ? 'avatar-status-lab__face--pop' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          />
          {variant === 'BE' ? <PolesB status={status} /> : null}
          {variant === 'I' || variant === 'IPLUS' ? <DockI status={status} /> : null}
          {variant === 'IPLUS' ? <DockSignalGlyph status={status} /> : null}
          {variant === 'WAVE' || (variant === 'WSTAMP' && !isAccount) ? (
            <WaveSignalBadge
              status={status}
              interactive={waveInteractive}
              tipOpen={waveTipOpen}
              tipId={tipId}
              badgeRef={waveBtnRef}
              onToggleTip={() => setWaveTipOpen((v) => !v)}
            />
          ) : null}
          {variant === 'STAMP' ? <PassportStamp status={status} /> : null}
          {variant === 'DISH' ? <SeekingDishBadge status={status} /> : null}
          {isAccount &&
          (variant === 'I' || variant === 'K' || variant === 'IPLUS' || variant === 'WSTAMP') ? (
            <AccountStar variant={variant} />
          ) : null}
        </span>
        {variant === 'CHIP' ? <CapsuleChipLabel status={status} /> : null}
        {variant === 'WSTAMP' && isAccount ? <OnlineUnderStamp /> : null}
      </div>
      {waveInteractive && waveTipOpen ? (
        <ProfileWaveCabinetTip
          tipId={tipId}
          anchorRef={waveBtnRef}
          onClose={() => setWaveTipOpen(false)}
          onOpenCabinet={() => {
            setWaveTipOpen(false);
            onOpenCabinet?.();
          }}
        />
      ) : null}
      <p className="avatar-status-lab__chip-status">{status}</p>
      <p className="avatar-status-lab__chip-caption">
        {label}
        {waveInteractive ? (
          <span className="avatar-status-lab__star-note"> · тап по антенне</span>
        ) : null}
        {isAccount &&
        (variant === 'I' || variant === 'K' || variant === 'IPLUS' || variant === 'WSTAMP') ? (
          <span className="avatar-status-lab__star-note">
            {' · '}
            {variant === 'K' || variant === 'WSTAMP' ? 'twin' : 'sparkle'}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export function AvatarStatusLabSection({ onOpenCabinet }: { onOpenCabinet?: () => void }) {
  const legacyVariants: AvatarStatusLabVariant[] = ['I', 'BE', 'J', 'K', 'U'];
  const tryVariants: AvatarStatusLabVariant[] = ['WSTAMP'];
  const newVariants: AvatarStatusLabVariant[] = ['WAVE', 'STAMP', 'DISH', 'CHIP', 'IPLUS'];
  const statuses: LabIdentityStatus[] = ['profile', 'account'];
  const openCabinet = onOpenCabinet ?? (() => {
    window.location.href = accountRouteHref();
  });

  return (
    <section className="mode-label-lab__section mode-label-lab__section--featured avatar-status-lab">
      <div className="mode-label-lab__section-head">
        <span className="mode-label-lab__badge">profile · account</span>
        <h2>Аватарка: профиль и аккаунт</h2>
        <p>
          Сверху — пробуемый гибрид WSTAMP (тап по антенне профиля → космический тултип + вход в
          кабинет). Дальше текущие I–U и остальные кандидаты связи.
        </p>
      </div>

      {tryVariants.map((variant) => {
        const meta = VARIANT_META[variant];
        return (
          <div
            key={variant}
            className="avatar-status-lab__variant avatar-status-lab__variant--new avatar-status-lab__variant--try"
          >
            <div className="avatar-status-lab__variant-head">
              <h3>
                {meta.title}
                {meta.tag ? (
                  <span className={`avatar-status-lab__tag avatar-status-lab__tag--${meta.tag}`}>
                    {meta.tag}
                  </span>
                ) : null}
              </h3>
              <p>{meta.blurb}</p>
            </div>
            <div className="avatar-status-lab__row avatar-status-lab__row--pair">
              {statuses.map((status) => (
                <LabAvatarChip
                  key={status}
                  variant={variant}
                  status={status}
                  onOpenCabinet={openCabinet}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="avatar-status-lab__divider">
        <h2 className="avatar-status-lab__divider-title">Текущие линии I–U</h2>
        <p>Базовые варианты без удаления.</p>
      </div>

      {legacyVariants.map((variant) => {
        const meta = VARIANT_META[variant];
        return (
          <div key={variant} className="avatar-status-lab__variant">
            <div className="avatar-status-lab__variant-head">
              <h3>
                {meta.title}
                {meta.tag ? (
                  <span className={`avatar-status-lab__tag avatar-status-lab__tag--${meta.tag}`}>
                    {meta.tag}
                  </span>
                ) : null}
              </h3>
              <p>{meta.blurb}</p>
            </div>
            <div className="avatar-status-lab__row avatar-status-lab__row--pair">
              {statuses.map((status) => (
                <LabAvatarChip key={status} variant={variant} status={status} />
              ))}
            </div>
          </div>
        );
      })}

      <div className="avatar-status-lab__divider">
        <h2 className="avatar-status-lab__divider-title">Кандидаты связи</h2>
        <p>Profile = локально / ищет связь. Account = на связи / в кабинете.</p>
      </div>

      {newVariants.map((variant) => {
        const meta = VARIANT_META[variant];
        return (
          <div key={variant} className="avatar-status-lab__variant avatar-status-lab__variant--new">
            <div className="avatar-status-lab__variant-head">
              <h3>
                {meta.title}
                {meta.tag ? (
                  <span className={`avatar-status-lab__tag avatar-status-lab__tag--${meta.tag}`}>
                    {meta.tag}
                  </span>
                ) : null}
              </h3>
              <p>{meta.blurb}</p>
            </div>
            <div className="avatar-status-lab__row avatar-status-lab__row--pair">
              {statuses.map((status) => (
                <LabAvatarChip key={status} variant={variant} status={status} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
