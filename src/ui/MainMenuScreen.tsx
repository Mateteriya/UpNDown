/**
 * Главное меню — космические капсулы в стиле онлайн-лобби.
 */

import { MenuCapsuleButton, MenuPlaySplitCapsule, MenuSection } from './MenuEntryActions';
import { PlayerAvatar } from './PlayerAvatar';

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
  onEditProfile: () => void;
  onOpenRating: () => void;
  onOpenHistory: () => void;
  onSignIn: () => void;
  onSignOut: () => void;
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
  onEditProfile,
  onOpenRating,
  onOpenHistory,
  onSignIn,
  onSignOut,
}: MainMenuScreenProps) {
  const signedIn = Boolean(userEmail);

  return (
    <main className="menu-screen">
      <div className="menu-screen__aura" aria-hidden="true">
        <div className="menu-screen__aura-glow" />
        <div className="menu-screen__aura-scrim" />
      </div>
      <div className="menu-screen__stack">
        <header className="menu-screen__header">
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
        </header>

        <button
          type="button"
          className="menu-screen__player"
          onClick={onOpenAccount}
          aria-label="Открыть личный кабинет"
        >
          <PlayerAvatar name={displayName} avatarDataUrl={avatarDataUrl} sizePx={36} />
          <span className="menu-screen__player-text">
            <span className="menu-screen__player-label">Вы</span>
            <strong className="menu-screen__player-name">{displayName}</strong>
          </span>
          <span className="menu-screen__player-chev" aria-hidden="true">
            ▸
          </span>
        </button>

        {onlineResumeMessage ? (
          <p className="menu-screen__alert" role="alert">
            {onlineResumeMessage}
          </p>
        ) : null}

        <div className="menu-screen__sections">
          <MenuSection sectionId="play" label="Играть">
            <MenuPlaySplitCapsule
              mode="offline"
              canResume={hasSavedOffline}
              onResume={onResumeOffline}
              onMain={onOfflinePlay}
            />
            <MenuPlaySplitCapsule
              mode="online"
              canResume={canResumeOnline}
              satelliteCode={lastPartyCode}
              onResume={onResumeOnline}
              onMain={onOpenOnline}
            />
            <MenuCapsuleButton
              variant="training"
              title="Обучение"
              hint="правила и практика"
              onClick={onTraining}
            />
          </MenuSection>

          <MenuSection sectionId="profile" label="Профиль и статистика" compact>
            <div className="menu-screen__grid">
              <MenuCapsuleButton
                variant="account"
                title="Кабинет"
                hint="аккаунт"
                compact
                onClick={onOpenAccount}
              />
              <MenuCapsuleButton
                variant="profile"
                title="Профиль"
                hint="имя и фото"
                compact
                onClick={onEditProfile}
              />
              <MenuCapsuleButton
                variant="rating"
                title="Рейтинг"
                hint="статистика"
                compact
                onClick={onOpenRating}
              />
              <MenuCapsuleButton
                variant="history"
                title="История"
                hint="партии"
                compact
                onClick={onOpenHistory}
              />
            </div>
          </MenuSection>

          <MenuSection sectionId="more" label="Ещё" compact>
            <MenuCapsuleButton
              variant="auth"
              title={signedIn ? `Выйти · ${userEmail?.split('@')[0] ?? 'аккаунт'}` : 'Вход'}
              hint={signedIn ? 'сменить аккаунт' : 'Google / email'}
              onClick={signedIn ? onSignOut : onSignIn}
            />
            <MenuCapsuleButton variant="soon" title="Турниры" hint="скоро" disabled />
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
          </MenuSection>
        </div>
      </div>
    </main>
  );
}
