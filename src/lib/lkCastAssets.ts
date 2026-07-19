/** Кадр каста личного кабинета (public/ЛК). Пока фиксируем «ЛК 5». */

export const LK_CAST_FRAMES = [
  { id: 'lk-5', label: 'ЛК 5', url: encodeURI('/ЛК/ЛК 5.jpg') },
] as const;

export type LkCastFrame = (typeof LK_CAST_FRAMES)[number];

export const LK_CAST_PRIMARY = LK_CAST_FRAMES[0];

/** Вставка в hero-панель (между именем и капсулами). */
export const LK_CAST_HERO = {
  id: 'lk-555',
  label: 'ЛК 555',
  url: encodeURI('/ЛК/ЛК 555.jpg'),
} as const;

export function getLkCastFrameAt(index = 0): LkCastFrame {
  const n = LK_CAST_FRAMES.length;
  const i = ((index % n) + n) % n;
  return LK_CAST_FRAMES[i]!;
}

export function preloadLkCastUrl(url: string): void {
  if (typeof Image === 'undefined') return;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  } catch {
    /* ignore */
  }
}
