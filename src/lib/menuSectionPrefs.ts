const MENU_SECTION_GLYPHS_ONLY_KEY = 'updown-menu-section-glyphs-only';
const MENU_CAPSULE_GLYPH_ONLY_KEY = 'upnd-menu-capsule-glyph-only';

export type MenuSectionId = 'play' | 'profile' | 'more';

type MenuSectionGlyphsOnlyPrefs = Partial<Record<MenuSectionId, boolean>>;
type MenuCapsuleGlyphOnlyPrefs = Record<string, boolean>;

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

function readCapsuleGlyphPrefs(): MenuCapsuleGlyphOnlyPrefs {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MENU_CAPSULE_GLYPH_ONLY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as MenuCapsuleGlyphOnlyPrefs;
  } catch {
    return {};
  }
}

function writeCapsuleGlyphPrefs(prefs: MenuCapsuleGlyphOnlyPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MENU_CAPSULE_GLYPH_ONLY_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** Свёртка отдельной капсулы до глифа (ПК). */
export function getMenuCapsuleGlyphOnly(capsuleId: string): boolean {
  return readCapsuleGlyphPrefs()[capsuleId] === true;
}

export function setMenuCapsuleGlyphOnly(capsuleId: string, glyphOnly: boolean): void {
  const prefs = readCapsuleGlyphPrefs();
  if (glyphOnly) prefs[capsuleId] = true;
  else delete prefs[capsuleId];
  writeCapsuleGlyphPrefs(prefs);
}

const MENU_SOLO_MAP_HINTS_SEEN_KEY = 'upnd-menu-solo-map-hints-seen';

export type SoloMapHintKind = 'glyph' | 'pill' | 'guest';

type SoloMapHintsSeenPrefs = Partial<Record<SoloMapHintKind, boolean>>;

function readSoloMapHintsSeen(): SoloMapHintsSeenPrefs {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(MENU_SOLO_MAP_HINTS_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SoloMapHintsSeenPrefs;
  } catch {
    return {};
  }
}

function writeSoloMapHintsSeen(prefs: SoloMapHintsSeenPrefs): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MENU_SOLO_MAP_HINTS_SEEN_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

/** true = пользователь уже нажимал глиф/пилюлю/guest-аватар; хинт-линию больше не показываем. */
export function hasSeenSoloMapHint(kind: SoloMapHintKind): boolean {
  return readSoloMapHintsSeen()[kind] === true;
}

export function markSoloMapHintSeen(kind: SoloMapHintKind): void {
  const prefs = readSoloMapHintsSeen();
  if (prefs[kind] === true) return;
  prefs[kind] = true;
  writeSoloMapHintsSeen(prefs);
}
