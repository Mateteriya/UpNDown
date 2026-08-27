import type { SoundId } from '../types';
import type { LabInstrumentId, LabVoiceParams } from './types';
import { DEFAULT_LAB_VOICE } from './types';

/** Один пункт чеклиста «звуки для игры». */
export type GameSoundTask = {
  id: SoundId;
  /** Порядок в списке для человека. */
  order: number;
  title: string;
  /** Когда звучит в партии. */
  when: string;
  /** Одна нота/удар или короткая мелодия. */
  shape: 'note' | 'phrase';
  tip: string;
  /** Стартовые крутилки при выборе пункта. */
  suggest?: Partial<LabVoiceParams>;
};

/**
 * Полный список слотов игры (имена файлов = id.wav).
 * Порядок — удобный для озвучки, не алфавит.
 */
export const GAME_SOUND_TASKS: GameSoundTask[] = [
  {
    order: 1,
    id: 'card_play',
    title: 'Карта на стол',
    when: 'Кладёте карту на сукно',
    shape: 'note',
    tip: 'Короткий глубокий удар (бас). Одна нота.',
    suggest: { instrument: 'bass', duration: 0.14, brightness: 0.45, depth: 0.7, attack: 0.003, release: 0.08, volume: 0.9 },
  },
  {
    order: 2,
    id: 'trick_won',
    title: 'Взята взятка',
    when: 'Кто-то взял взятку',
    shape: 'note',
    tip: 'Короткий приятный акцент (1–2 ноты или одна яркая).',
    suggest: { instrument: 'bell', duration: 0.45, brightness: 0.55, depth: 0.4, release: 0.3 },
  },
  {
    order: 3,
    id: 'bid_place',
    title: 'Заказ (цифра)',
    when: 'Выбрали число взяток',
    shape: 'note',
    tip: 'Мягкий клик / две ноты подтверждения.',
    suggest: { instrument: 'epiano', duration: 0.4, brightness: 0.55, depth: 0.45 },
  },
  {
    order: 4,
    id: 'exact_south',
    title: 'Ровно — вы',
    when: 'Вы набрали ровно заказ',
    shape: 'phrase',
    tip: 'Радостнее и длиннее, чем «Ровно — соперник».',
    suggest: { instrument: 'bell', duration: 0.55, brightness: 0.6, depth: 0.45 },
  },
  {
    order: 5,
    id: 'exact_other',
    title: 'Ровно — соперник',
    when: 'Соперник набрал ровно',
    shape: 'note',
    tip: 'Тише и короче, чем ваш «Ровно».',
    suggest: { instrument: 'bell', duration: 0.4, brightness: 0.5, depth: 0.35, volume: 0.55 },
  },
  {
    order: 6,
    id: 'over_south',
    title: 'Перебор — вы',
    when: 'Вы взяли больше заказа',
    shape: 'note',
    tip: 'Немного «ой», но не грубо.',
    suggest: { instrument: 'piano', duration: 0.5, brightness: 0.4, depth: 0.5 },
  },
  {
    order: 7,
    id: 'over_other',
    title: 'Перебор — соперник',
    when: 'Соперник перебрал',
    shape: 'note',
    tip: 'Тише вашего перебора.',
    suggest: { instrument: 'piano', duration: 0.4, volume: 0.5 },
  },
  {
    order: 8,
    id: 'under_south',
    title: 'Недобор — вы',
    when: 'Уже математически не доберёте заказ',
    shape: 'note',
    tip: 'Глубже / грустнее.',
    suggest: { instrument: 'bass', duration: 0.55, brightness: 0.35, depth: 0.65 },
  },
  {
    order: 9,
    id: 'under_other',
    title: 'Недобор — соперник',
    when: 'Соперник уже не доберёт',
    shape: 'note',
    tip: 'Тише вашего недобора.',
    suggest: { instrument: 'bass', duration: 0.45, volume: 0.45 },
  },
  {
    order: 10,
    id: 'illegal',
    title: 'Нельзя так ходить',
    when: 'Клик по запрещённой карте',
    shape: 'note',
    tip: 'Короткий отказ / «тук».',
    suggest: { instrument: 'piano', duration: 0.22, brightness: 0.35, depth: 0.4 },
  },
  {
    order: 11,
    id: 'your_turn_soft',
    title: 'Ваш ход (мягко)',
    when: 'Только что стал ваш ход',
    shape: 'phrase',
    tip: 'Короткая милая фраза из 2–3 нот.',
    suggest: { instrument: 'bell', duration: 0.4, brightness: 0.55, depth: 0.4 },
  },
  {
    order: 12,
    id: 'your_turn_nudge_long',
    title: 'Напоминание хода (длинное)',
    when: 'Долго не ходите (~5 с)',
    shape: 'phrase',
    tip: 'Мелодичнее и длиннее мягкого «ваш ход».',
    suggest: { instrument: 'epiano', duration: 0.5, brightness: 0.55, depth: 0.5 },
  },
  {
    order: 13,
    id: 'your_turn_nudge_short',
    title: 'Напоминание хода (короткое)',
    when: 'Повторные пинки, пока не сходите',
    shape: 'phrase',
    tip: 'Короче длинного напоминания.',
    suggest: { instrument: 'bell', duration: 0.35, brightness: 0.55 },
  },
  {
    order: 14,
    id: 'deal_complete',
    title: 'Конец раздачи',
    when: 'Раздача закрылась (общий)',
    shape: 'note',
    tip: 'Нейтральное завершение.',
    suggest: { instrument: 'epiano', duration: 0.55 },
  },
  {
    order: 15,
    id: 'deal_complete_south',
    title: 'Конец раздачи — вы лидируете',
    when: 'Раздача закрылась и вы впереди по очкам',
    shape: 'phrase',
    tip: 'Чуть праздничнее обычного конца раздачи.',
    suggest: { instrument: 'bell', duration: 0.55 },
  },
  {
    order: 16,
    id: 'deal_results_fly',
    title: 'Улёт итогов в Σ',
    when: 'Модалка промежуточных результатов улетает в кнопку шапки',
    shape: 'phrase',
    tip: 'Спокойно, «аэропорт»: до–соль–ми–до вниз.',
    suggest: { instrument: 'bell', duration: 0.35, brightness: 0.5, depth: 0.35, release: 0.35 },
  },
  {
    order: 17,
    id: 'ui_tap',
    title: 'Клик UI',
    when: 'Кнопки меню / настройки',
    shape: 'note',
    tip: 'Очень короткий тихий клик.',
    suggest: { instrument: 'bell', duration: 0.16, brightness: 0.65, depth: 0.3, volume: 0.55 },
  },
  {
    order: 18,
    id: 'game_win',
    title: 'Победа в партии',
    when: 'Вы выиграли игру',
    shape: 'phrase',
    tip: 'Короткий победный мотив.',
    suggest: { instrument: 'bell', duration: 0.5, brightness: 0.65 },
  },
  {
    order: 19,
    id: 'game_lose',
    title: 'Поражение в партии',
    when: 'Партия окончена не вашей победой',
    shape: 'phrase',
    tip: 'Спокойнее / ниже победы.',
    suggest: { instrument: 'piano', duration: 0.6, brightness: 0.4, depth: 0.55 },
  },
];

export const LAB_DONE_STORAGE_KEY = 'updown_audio_sfx_lab_done_v1';

export function loadLabDoneMap(): Partial<Record<SoundId, boolean>> {
  try {
    const raw = localStorage.getItem(LAB_DONE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<Record<SoundId, boolean>>;
  } catch {
    return {};
  }
}

export function setLabDone(id: SoundId, done: boolean): Partial<Record<SoundId, boolean>> {
  const next = { ...loadLabDoneMap(), [id]: done };
  try {
    localStorage.setItem(LAB_DONE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function voiceFromSuggest(suggest?: Partial<LabVoiceParams> | null): LabVoiceParams {
  const s = suggest ?? {};
  return {
    instrument: s.instrument ?? DEFAULT_LAB_VOICE.instrument,
    brightness: numOr(s.brightness, DEFAULT_LAB_VOICE.brightness),
    depth: numOr(s.depth, DEFAULT_LAB_VOICE.depth),
    duration: numOr(s.duration, DEFAULT_LAB_VOICE.duration),
    attack: numOr(s.attack, DEFAULT_LAB_VOICE.attack),
    release: numOr(s.release, DEFAULT_LAB_VOICE.release),
    volume: numOr(s.volume, DEFAULT_LAB_VOICE.volume),
    detuneCents: numOr(s.detuneCents, DEFAULT_LAB_VOICE.detuneCents),
    octave: numOr(s.octave, DEFAULT_LAB_VOICE.octave),
    filter: numOr(s.filter, DEFAULT_LAB_VOICE.filter),
  };
}

function numOr(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function instrumentLabel(id: LabInstrumentId): string {
  const map: Record<LabInstrumentId, string> = {
    bell: 'Колокольчики',
    epiano: 'Hang',
    piano: 'Пианино',
    guitar: 'Гитара',
    bass: 'Бас',
    ebass: 'Эл. бас',
  };
  return map[id] ?? id;
}
