const MENU_SECTION_GLYPHS_ONLY_KEY = 'updown-menu-section-glyphs-only';

export type MenuSectionId = 'play' | 'profile' | 'more';

type MenuSectionGlyphsOnlyPrefs = Partial<Record<MenuSectionId, boolean>>;

function readPrefs(): MenuSectionGlyphsOnlyPrefs {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MENU_SECTION_GLYPHS_ONLY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as MenuSectionGlyphsOnlyPrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: MenuSectionGlyphsOnlyPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MENU_SECTION_GLYPHS_ONLY_KEY, JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}

export function getMenuSectionGlyphsOnly(sectionId: MenuSectionId): boolean {
  return readPrefs()[sectionId] === true;
}

export function setMenuSectionGlyphsOnly(sectionId: MenuSectionId, glyphsOnly: boolean): void {
  const prefs = readPrefs();
  if (glyphsOnly) {
    prefs[sectionId] = true;
  } else {
    delete prefs[sectionId];
  }
  writePrefs(prefs);
}
