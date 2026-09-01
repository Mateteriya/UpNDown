/** Размеры панелей студии лабы — localStorage. */

export const LAB_PANEL_LAYOUT_KEY = 'updown_audio_lab_panel_layout_v1';

export type LabPanelLayout = {
  libraryPx: number;
  inspectorPx: number;
  /** Доля высоты библиотеки под пресеты (0…1). */
  presetsFrac: number;
  /** Высота блока дорожек/слоёв в аранжировке, px. */
  tracksPx: number;
  /** Высота клавиатуры (drawer), px; 0 = свёрнута. */
  keyboardPx: number;
};

export const DEFAULT_LAB_PANEL_LAYOUT: LabPanelLayout = {
  libraryPx: 340,
  inspectorPx: 248,
  presetsFrac: 0.42,
  tracksPx: 200,
  keyboardPx: 210,
};

const LIBRARY_MIN = 200;
const LIBRARY_MAX = 520;
const INSPECTOR_MIN = 180;
const INSPECTOR_MAX = 420;
const TRACKS_MIN = 120;
const TRACKS_MAX = 480;
const KEYBOARD_MIN = 0;
const KEYBOARD_MAX = 560;
const PRESETS_FRAC_MIN = 0.18;
const PRESETS_FRAC_MAX = 0.82;

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

export function clampLabPanelLayout(partial: Partial<LabPanelLayout>): LabPanelLayout {
  const base = { ...DEFAULT_LAB_PANEL_LAYOUT, ...partial };
  return {
    libraryPx: clamp(Math.round(base.libraryPx), LIBRARY_MIN, LIBRARY_MAX),
    inspectorPx: clamp(Math.round(base.inspectorPx), INSPECTOR_MIN, INSPECTOR_MAX),
    presetsFrac: clamp(base.presetsFrac, PRESETS_FRAC_MIN, PRESETS_FRAC_MAX),
    tracksPx: clamp(Math.round(base.tracksPx), TRACKS_MIN, TRACKS_MAX),
    keyboardPx: clamp(Math.round(base.keyboardPx), KEYBOARD_MIN, KEYBOARD_MAX),
  };
}

export function loadLabPanelLayout(): LabPanelLayout {
  try {
    const raw = localStorage.getItem(LAB_PANEL_LAYOUT_KEY);
    if (!raw) return { ...DEFAULT_LAB_PANEL_LAYOUT };
    const parsed = JSON.parse(raw) as Partial<LabPanelLayout>;
    return clampLabPanelLayout(parsed);
  } catch {
    return { ...DEFAULT_LAB_PANEL_LAYOUT };
  }
}

export function saveLabPanelLayout(layout: LabPanelLayout): void {
  try {
    localStorage.setItem(LAB_PANEL_LAYOUT_KEY, JSON.stringify(clampLabPanelLayout(layout)));
  } catch {
    /* ignore */
  }
}

export const LAB_PANEL_LIMITS = {
  LIBRARY_MIN,
  LIBRARY_MAX,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
  TRACKS_MIN,
  TRACKS_MAX,
  KEYBOARD_MIN,
  KEYBOARD_MAX,
  PRESETS_FRAC_MIN,
  PRESETS_FRAC_MAX,
} as const;
