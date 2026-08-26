/**
 * Аудио v1 — слоты и каналы.
 * Файлы CC0/кастом можно подставить позже: id слота не меняем.
 */

export const AUDIO_CHANNELS = ['mine', 'others', 'ui', 'nudge', 'music'] as const;
export type AudioChannel = (typeof AUDIO_CHANNELS)[number];

/** Каналы, которые уже играют (музыка — слот на будущее). */
export const LIVE_AUDIO_CHANNELS = ['mine', 'others', 'ui', 'nudge'] as const;
export type LiveAudioChannel = (typeof LIVE_AUDIO_CHANNELS)[number];

export const AUDIO_CHANNEL_META: Record<
  AudioChannel,
  { label: string; hint: string; comingSoon?: boolean }
> = {
  mine: { label: 'Мои', hint: 'ваши карты и заказ' },
  others: { label: 'Стол', hint: 'соперники и раздача' },
  ui: { label: 'Система', hint: 'кнопки и запрет' },
  nudge: { label: 'Ход', hint: 'напоминание ходить' },
  music: { label: 'Музыка', hint: 'фоновые темы — скоро', comingSoon: true },
};

/** Идентификаторы событий (контракт для ассетов и хуков). */
export type SoundId =
  | 'card_play'
  | 'trick_won'
  | 'bid_place'
  | 'exact_south'
  | 'exact_other'
  | 'over_south'
  | 'over_other'
  | 'under_south'
  | 'under_other'
  | 'illegal'
  | 'your_turn_soft'
  | 'your_turn_nudge_long'
  | 'your_turn_nudge_short'
  | 'deal_complete'
  | 'deal_complete_south'
  | 'deal_results_fly'
  | 'ui_tap'
  | 'game_win'
  | 'game_lose';

export const SOUND_CHANNEL: Record<SoundId, AudioChannel> = {
  card_play: 'mine',
  trick_won: 'mine',
  bid_place: 'mine',
  exact_south: 'mine',
  over_south: 'mine',
  under_south: 'mine',
  deal_complete_south: 'mine',
  game_win: 'mine',
  game_lose: 'mine',
  exact_other: 'others',
  over_other: 'others',
  under_other: 'others',
  deal_complete: 'others',
  deal_results_fly: 'others',
  illegal: 'ui',
  ui_tap: 'ui',
  your_turn_soft: 'nudge',
  your_turn_nudge_long: 'nudge',
  your_turn_nudge_short: 'nudge',
};

/** Чужие/боты: тише (exact/over/under other, card/trick offline). */
export const OTHER_VOLUME_MUL = 0.32;

export interface AudioSettings {
  /** Глобальный выключатель (если false — тишина везде). */
  enabled: boolean;
  /** Общая громкость 0…1 поверх каналов. */
  masterVolume: number;
  muted: Record<AudioChannel, boolean>;
  volume: Record<AudioChannel, number>;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: true,
  masterVolume: 1,
  muted: { mine: false, others: false, ui: false, nudge: false, music: false },
  volume: { mine: 0.72, others: 0.62, ui: 0.5, nudge: 0.62, music: 0.45 },
};

export const AUDIO_SETTINGS_STORAGE_KEY = 'updown_audio_settings_v1';

/** Напоминание хода: мягкий сигнал → длинная мелодия → редкие короткие. */
export const YOUR_TURN_NUDGE_IDLE_MS = 5000;
/** Пауза после старта длинной мелодии до повторяющихся коротких (+2 с к прежним 3.5 с). */
export const YOUR_TURN_NUDGE_LONG_MS = 5500;
/** Интервал между короткими повторами (было 3.5 с). */
export const YOUR_TURN_NUDGE_REPEAT_MS = 6000;
