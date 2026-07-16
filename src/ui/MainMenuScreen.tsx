/**
 * Главное меню — космические капсулы в стиле онлайн-лобби.
 */

import { useEffect, useState } from 'react';
import { getMenuPcCastArtUrlForSession } from '../lib/menuAssets';
import { MenuCapsuleButton, MenuPlaySplitCapsule, MenuSection } from './MenuEntryActions';
import { MenuPcDrift } from './MenuPcDrift';
import { PlayerAvatar } from './PlayerAvatar';

const PC_MENU_MQ = '(min-width: 1025px)';

export type MainMenuScreenProps = {
  displayName: string;
  avatarDataUrl?: string | null;
  userEmail?: string | null;
  devMode: boolean;
  canResumeOnline: boolean;
  hasSavedOffline: boolean;
  lastPartyCode: string | null;
  onlineResumeMessage: string | null;
  onTitleDevMode?: () => void;
  onOpenAccount: () => void;
  onResumeOnline: () => void;
  onOpenOnline: () => void;
  onResumeOffline: () => void;
  onOfflinePlay: () => void;
  onTraining: () => void;
};

export function MainMenuScreen({
  displayName,
  avatarDataUrl,
  userEmail,
  devMode,
  canResumeOnline,
  hasSavedOffline,
  lastPartyCode,
  onlineResumeMessage,
  onTitleDevMode,
  onOpenAccount,
  onResumeOnline,
  onOpenOnline,
  onResumeOffline,
  onOfflinePlay,
  onTraining,
}: MainMenuScreenProps) {
  const signedIn = Boolean(userEmail);
  /** Только ПК: один JPG за сессию, на мобилке не качаем. */
  const [isPcMenu, setIsPcMenu] = useState(false);
  const [pcCastUrl, setPcCastUrl] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(PC_MENU_MQ);
    const sync = () => {
      const pc = mq.matches;
      setIsPcMenu(pc);
      if (pc) setPcCastUrl(getMenuPcCastArtUrlForSession());
      else setPcCastUrl(null);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return (
    <main className="menu-screen menu-screen--pc-cinematic">
      {pcCastUrl ? (
        <div className="menu-screen__pc-cast" aria-hidden="true">
          <img className="menu-screen__pc-cast-img" src={pcCastUrl} alt="" draggable={false} />
          <div className="menu-screen__pc-cast-meld" />
        </div>
      ) : null}
      {isPcMenu ? (
        <>
          <div className="menu-screen__pc-stars" aria-hidden="true">
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--far" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--mid-a" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--mid-b" />
            <div className="menu-screen__pc-stars__layer menu-screen__pc-stars__layer--near" />
          </div>
          <div className="menu-screen__pc-ufos" aria-hidden="true">
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--cyan">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <ellipse cx="24" cy="18" rx="16" ry="4" fill="#22d3ee" opacity="0.85" />
                <ellipse cx="24" cy="13" rx="10" ry="6" fill="#a5f3fc" />
                <ellipse cx="24" cy="17.5" rx="18" ry="1.6" fill="none" stroke="#c4b5fd" strokeWidth="1.2" opacity="0.9" />
                <circle cx="16" cy="19" r="1.4" fill="#f0abfc" />
                <circle cx="24" cy="20" r="1.5" fill="#ecfeff" />
                <circle cx="32" cy="19" r="1.4" fill="#f0abfc" />
              </svg>
            </span>
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--magenta">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <ellipse cx="24" cy="16" rx="18" ry="5" fill="#a855f7" opacity="0.75" />
                <ellipse cx="24" cy="12" rx="8" ry="5.5" fill="#f5d0fe" />
                <path d="M6 16 Q24 22 42 16" fill="none" stroke="#67e8f9" strokeWidth="1.1" opacity="0.85" />
                <circle cx="14" cy="17.5" r="1.2" fill="#22d3ee" />
                <circle cx="24" cy="18.5" r="1.3" fill="#fef08a" />
                <circle cx="34" cy="17.5" r="1.2" fill="#22d3ee" />
              </svg>
            </span>
            <span className="menu-screen__pc-ufo menu-screen__pc-ufo--gold">
              <svg viewBox="0 0 48 28" width="100%" height="100%" focusable="false" aria-hidden>
                <path d="M8 18 L24 6 L40 18 L32 20 L24 10 L16 20 Z" fill="#fbbf24" opacity="0.92" />
                <ellipse cx="24" cy="19" rx="14" ry="3.2" fill="#f59e0b" opacity="0.8" />
                <circle cx="18" cy="19.5" r="1.1" fill="#ecfeff" />
                <circle cx="24" cy="20.2" r="1.2" fill="#a5f3fc" />
                <circle cx="30" cy="19.5" r="1.1" fill="#ecfeff" />
              </svg>
            </span>
          </div>
        </>
      ) : null}
      <div className="menu-screen__aura" aria-hidden="true">
        <div className="menu-screen__aura-glow" />
        <div className="menu-screen__aura-scrim" />
      </div>
      <div className="menu-screen__stack">
        <div className="menu-screen__pc-topbar">
          <header className="menu-screen__header">
            <div className="menu-screen__brand">
              <img
                className="menu-screen__brand-icon"
                src="/icon-192.png"
                alt=""
                width={48}
                height={48}
                draggable={false}
              />
              <div className="menu-screen__brand-text">
                <h1
                  className="menu-screen__title"
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || !onTitleDevMode) return;
                    const target = e.currentTarget;
                    const t = window.setTimeout?.(() => onTitleDevMode(), 1200);
                    const clear = () => window.clearTimeout?.(t);
                    target.addEventListener('pointerup', clear, { once: true });
                    target.addEventListener('pointerleave', clear, { once: true });
                  }}
                >
                  Up&Down
                </h1>
                <p className="menu-screen__tagline">Карточная игра на взятки</p>
              </div>
            </div>
          </header>

          <button
            type="button"
            className="menu-screen__player"
            onClick={onOpenAccount}
            aria-label="Открыть личный кабинет"
          >
            <PlayerAvatar name={displayName} avatarDataUrl={avatarDataUrl} sizePx={36} />
            <span className="menu-screen__player-text">
              <span className="menu-screen__player-label">Кабинет</span>
              <strong className="menu-screen__player-name">{displayName}</strong>
              <span className="menu-screen__player-sub">
                {signedIn ? 'профиль + аккаунт' : 'профиль · войти в аккаунт'}
              </span>
            </span>
            <span className="menu-screen__player-chev" aria-hidden="true">
              ▸
            </span>
          </button>
        </div>

        {onlineResumeMessage ? (
          <p className="menu-screen__alert" role="alert">
            {onlineResumeMessage}
          </p>
        ) : null}

        <div className="menu-screen__sections menu-screen__constellation">
          <MenuSection sectionId="play" label="Играть">
            <MenuPcDrift id="offline" className="menu-screen__drift--offline" movable>
              <MenuPlaySplitCapsule
                mode="offline"
                canResume={hasSavedOffline}
                onResume={onResumeOffline}
                onMain={onOfflinePlay}
              />
            </MenuPcDrift>
            <MenuPcDrift id="online" className="menu-screen__drift--online" movable>
              <MenuPlaySplitCapsule
                mode="online"
                canResume={canResumeOnline}
                satelliteCode={lastPartyCode}
                onResume={onResumeOnline}
                onMain={onOpenOnline}
              />
            </MenuPcDrift>
            <MenuPcDrift id="training" className="menu-screen__drift--training" movable>
              <MenuCapsuleButton
                variant="training"
                title="Обучение"
                hint="правила и практика"
                onClick={onTraining}
              />
            </MenuPcDrift>
            <MenuPcDrift id="soon" className="menu-screen__drift--soon" movable>
              <MenuCapsuleButton variant="soon" title="Турниры" hint="скоро" disabled />
            </MenuPcDrift>
          </MenuSection>

          {devMode ? (
            <div className="menu-screen__dev">
              <MenuCapsuleButton variant="link" title="Демо карт" href="/demo" compact />
              <MenuCapsuleButton variant="link" title="Лаб: шкала раздач" href="/deal-track-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: цвета ИТОГО" href="/total-color-lab" compact />
              <MenuCapsuleButton variant="link" title="Лаб: онлайн-UI" href="/online-ui-lab" compact />
              <MenuCapsuleButton variant="link" title="Демо: фишки" href="/scoring-demo" compact />
              <MenuCapsuleButton variant="link" title="Космогенез" href="/cosmogenesis-demo.html" compact />
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
