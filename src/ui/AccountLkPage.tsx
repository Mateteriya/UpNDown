/**
 * Заглушка личного кабинета (ЛК) — маршрут /lk.
 * Позже: история, облако, настройки, подписка.
 */

import { CosmicCockpit, CosmicGlassClose, CosmicPhysButton } from './CosmicCockpit';

export function AccountLkPage({ onBack }: { onBack?: () => void }) {
  const goMenu = () => {
    if (onBack) onBack();
    else window.location.href = '/';
  };

  const close = () => {
    if (onBack) onBack();
    else if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="lk-page">
      <div className="lk-page__shell">
        <CosmicGlassClose className="lk-page__close" onClick={close} />
        <CosmicCockpit className="lk-page__cockpit">
          <h1 className="lk-page__title cosmic-iridescent-text">Личный кабинет</h1>
          <p className="lk-page__lead">
            Раздел в разработке. Здесь будет вход в аккаунт, история партий на всех устройствах, облачная
            синхронизация и настройки профиля.
          </p>
          <ul className="lk-page__list">
            <li>История матчей (офлайн и онлайн)</li>
            <li>Рейтинг и статистика по аккаунту</li>
            <li>Имя, аватар, привязка email</li>
          </ul>
          <p className="lk-page__hint">
            Сейчас: войдите через меню (Google / GitHub), завершите офлайн-партию — запись уйдёт в облако.
          </p>
          <CosmicPhysButton variant="primary" onClick={goMenu}>
            В главное меню
          </CosmicPhysButton>
        </CosmicCockpit>
      </div>
    </div>
  );
}
