import { MENU_OFFLINE_LEGEND_ART_URL, MENU_ONLINE_LEGEND_ART_URL } from './menuAssets';

/** Тексты легенд режимов Офлайн / Онлайн (Главная + страница Онлайн). */
export const MODE_LEGENDS = {
  online: {
    kicker: 'Космический зал',
    title: 'Онлайн',
    body: 'Живые партии через комнаты и лобби: создавайте столы, подключайтесь к друзьям, играйте в общем зале. Рейтинг и прогресс сохраняются, когда вы в аккаунте.',
    artUrl: MENU_ONLINE_LEGEND_ART_URL,
  },
  offline: {
    kicker: 'Экипаж ИИ',
    title: 'Офлайн',
    body: 'Игра на вашем устройстве без сети: быстрый старт против ботов, настройка сложности ИИ и продолжение сохранённой партии в любой момент.',
    artUrl: MENU_OFFLINE_LEGEND_ART_URL,
  },
} as const;

export type ModeLegendId = keyof typeof MODE_LEGENDS;
