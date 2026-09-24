/** Выбор глифа кнопки «Звук» на мобильном меню. Лаб: /sound-glyph-lab */

export const MENU_SOUND_GLYPH_IDS = [
  'pulse-orb',
  'nebula-horn',
  'crystal-wave',
  'satellite-beep',
  'aurora-bars',
] as const;

export type MenuSoundGlyphId = (typeof MENU_SOUND_GLYPH_IDS)[number];

export const MENU_SOUND_GLYPH_META: Record<
  MenuSoundGlyphId,
  { title: string; blurb: string }
> = {
  'pulse-orb': {
    title: 'Pulse Orb',
    blurb: 'Конус + орбитальные дуги, ядро-пульс',
  },
  'nebula-horn': {
    title: 'Nebula Horn',
    blurb: 'Рупор в туманности, радужные кольца',
  },
  'crystal-wave': {
    title: 'Crystal Wave',
    blurb: 'Кристалл с гранёными волнами',
  },
  'satellite-beep': {
    title: 'Satellite Beep',
    blurb: 'Тарелка-спутник и лучи сигнала',
  },
  'aurora-bars': {
    title: 'Aurora Bars',
    blurb: 'Кольцо + эквалайзер-аврора',
  },
};

const STORAGE_KEY = 'updown.menuSoundGlyph';
const DEFAULT_ID: MenuSoundGlyphId = 'pulse-orb';

export function isMenuSoundGlyphId(v: string): v is MenuSoundGlyphId {
  return (MENU_SOUND_GLYPH_IDS as readonly string[]).includes(v);
}

export function getMenuSoundGlyphId(): MenuSoundGlyphId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
    if (isMenuSoundGlyphId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

export function setMenuSoundGlyphId(id: MenuSoundGlyphId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('updown-menu-sound-glyph', { detail: id }));
  }
}

export function subscribeMenuSoundGlyph(cb: (id: MenuSoundGlyphId) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    cb(getMenuSoundGlyphId());
  };
  const onCustom = (e: Event) => {
    const id = (e as CustomEvent).detail;
    cb(isMenuSoundGlyphId(id) ? id : getMenuSoundGlyphId());
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('updown-menu-sound-glyph', onCustom);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('updown-menu-sound-glyph', onCustom);
  };
}
