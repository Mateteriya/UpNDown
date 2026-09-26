import { MENU_OFFLINE_LEGEND_ART_URL, MENU_ONLINE_LEGEND_ART_URL } from './menuAssets';

/** Тексты легенд режимов Офлайн / Онлайн (Главная + страница Онлайн).
 *  Body дублируется в i18n (menu.legendOnlineBody / legendOfflineBody) — UI берёт t(). */
export const MODE_LEGENDS = {
  online: {
    kicker: 'Космический зал',
    title: 'Онлайн',
    body: 'Живые партии через комнаты и лобби: создавайте столы, подключайтесь к друзьям, играйте в общем зале. Без аккаунта онлайн недоступен — войдите или зарегистрируйтесь. Рейтинг и прогресс сохраняются в облаке, когда вы в аккаунте.',
    artUrl: MENU_ONLINE_LEGEND_ART_URL,
  },
  offline: {
    kicker: 'Экипаж ИИ',
    title: 'Офлайн',
    body: 'Игра на вашем устройстве без сети: быстрый старт против ботов, настройка сложности ИИ и продолжение сохранённой партии. Можно играть сразу; локальный профиль даёт своё имя, аватар и историю на этом устройстве — без аккаунта.',
    artUrl: MENU_OFFLINE_LEGEND_ART_URL,
  },
} as const;

export type ModeLegendId = keyof typeof MODE_LEGENDS;
