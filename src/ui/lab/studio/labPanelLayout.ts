/** Размеры панелей студии лабы — localStorage. */

export const LAB_PANEL_LAYOUT_KEY = 'updown_audio_lab_panel_layout_v2';

export type LabPanelLayout = {
  libraryPx: number;
  inspectorPx: number;
  /** Доля высоты библиотеки под пресеты (0…1). */
  presetsFrac: number;
  /** Высота блока дорожек/слоёв в аранжировке, px. */
  tracksPx: number;
  /** Высота клавиатуры (drawer), px; 0 = свёрнута. */
  keyboardPx: number;
  /** Размер крутилок голоса (диаметр dial), px. */
  knobsPx: number;
  /** Библиотека свёрнута в узкий столбик. */
  libraryCollapsed?: boolean;
};

export const DEFAULT_LAB_PANEL_LAYOUT: LabPanelLayout = {
  libraryPx: 340,
  inspectorPx: 248,
  presetsFrac: 0.42,
  tracksPx: 280,
  keyboardPx: 240,
  knobsPx: 88,
  libraryCollapsed: false,
};

export const LAB_LIBRARY_RAIL_PX = 52;
const LIBRARY_MIN = 200;
const LIBRARY_MAX = 520;
const INSPECTOR_MIN = 180;
const INSPECTOR_MAX = 420;
const TRACKS_MIN = 140;
const TRACKS_MAX = 900;
const KEYBOARD_MIN = 0;
const KEYBOARD_MAX = 720;
const KNOBS_MIN = 56;
const KNOBS_MAX = 120;
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
    knobsPx: clamp(Math.round(base.knobsPx), KNOBS_MIN, KNOBS_MAX),
    libraryCollapsed: base.libraryCollapsed === true,
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
  KNOBS_MIN,
  KNOBS_MAX,
  PRESETS_FRAC_MIN,
  PRESETS_FRAC_MAX,
  LAB_LIBRARY_RAIL_PX,
} as const;
