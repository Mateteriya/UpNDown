/**
 * АРХИВ: short-VH «иммерсив» (самый компактный режим, стол на весь экран без шапки).
 * Файл НЕ импортируется в приложение — только резерв для восстановления.
 * Отключено: MOBILE_SHORT_IMMERSIVE_ENABLED = false в src/lib/mobileViewportModes.ts
 * Полный код до отключения: git show fdf6400:src/ui/GameTable.tsx
 * CSS: index.css селекторы .viewport-mobile-short-header-immersive, .mobile-short-immersive-*
 */

// --- constants ---
/** sessionStorage: СЂРµР¶РёРј В«СЃС‚РѕР» РЅР° РІРµСЃСЊ СЌРєСЂР°РЅВ» (immersive) РґР»СЏ short-VH. */
const MOBILE_SHORT_HEADER_IMMERSIVE_STORAGE_KEY = 'upd.gameTable.mobileShortHeaderImmersive.v1';

function readStoredShortHeaderImmersive(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(MOBILE_SHORT_HEADER_IMMERSIVE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** РџРѕСЃР»Рµ РІС…РѕРґР° РІ immersive: РїРѕРґСЃРІРµС‚РєР° РєРЅРѕРїРєРё В«С€Р°РїРєР°В» (pulse), РјСЃ. */
const IMMERSIVE_ENTER_REVEAL_PULSE_MS = 3800;
/** РљР°СЂС‚РѕС‡РєР° В«СЂРµР¶РёРј Р±РµР· С€Р°РїРєРёВ» + РєСѓРґР° Р¶Р°С‚СЊ РЅР° РІС‹С…РѕРґ, РјСЃ. */
const IMMERSIVE_WELCOME_HINT_MS = 5600;
/** localStorage: РєР°СЂС‚РѕС‡РєР° РїСЂРёРІРµС‚СЃС‚РІРёСЏ immersive СЃРєСЂС‹С‚Р° РЅР°РІСЃРµРіРґР° (РіР°Р»РѕС‡РєР° В«РЅРµ РїРѕРєР°Р·С‹РІР°С‚СЊВ»). */
const IMMERSIVE_WELCOME_DISMISSED_FOREVER_KEY = 'upd.gameTable.immersiveWelcomeDismissed.v1';

function readImmersiveWelcomeDismissedForever(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(IMMERSIVE_WELCOME_DISMISSED_FOREVER_KEY) === '1';
  } catch {
    return false;
  }
}

function persistImmersiveWelcomeDismissedForever() {
  try {
    localStorage.setItem(IMMERSIVE_WELCOME_DISMISSED_FOREVER_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** sessionStorage: СЃРґРІРёРі Р±РµР№РґР¶Р° РїРѕ X РІ short + immersive (px РѕС‚ С†РµРЅС‚СЂР°). */
const MOBILE_SHORT_IMMERSIVE_BADGE_DRAG_X_KEY = 'upd.gameTable.mobileShortImmersiveBadgeDragX.v1';

function readImmersiveBadgeDragXFromStorage(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = sessionStorage.getItem(MOBILE_SHORT_IMMERSIVE_BADGE_DRAG_X_KEY);
    if (raw == null || raw === '') return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Р¦РµРЅС‚СЂ Р±РµР№РґР¶Р° = vw/2 + offset; РЅРµ РґР°С‘Рј СѓРµС…Р°С‚СЊ Р·Р° РєСЂР°СЏ СЃ margin. */
function clampImmersiveBadgeDragX(offset: number, badgeWidthPx: number, viewportWidthPx: number, edgeMarginPx: number): number {
  const half = viewportWidthPx / 2 - badgeWidthPx / 2 - edgeMarginPx;
  const max = Math.max(0, half);
  if (max === 0) return 0;
  if (offset > max) return max;
  if (offset < -max) return -max;
  return offset;
}

/** Р’РЅСѓС‚СЂРё СЌС‚РѕР№ Р·РѕРЅС‹ РїРѕ X Р±РµР№РґР¶ В«РїСЂРёР»РёРїР°РµС‚В» Рє С†РµРЅС‚СЂСѓ (offset 0), РїРѕРєР° Р¶РµСЃС‚ РЅРµ В«СЃРѕСЂРІР°РЅВ» РїРѕСЂРѕРіРѕРј escape. */
const IMMERSIVE_BADGE_SNAP_ZONE_PX = 16;
/** Р•СЃР»Рё РїР°Р»РµС† СѓРІРѕРґРёС‚ СЃС‹СЂРѕР№ offset РґР°Р»СЊС€Рµ вЂ” РјР°РіРЅРёС‚ РѕС‚РєР»СЋС‡Р°РµС‚СЃСЏ РґРѕ РєРѕРЅС†Р° Р¶РµСЃС‚Р° (РјРѕР¶РЅРѕ Р·Р°С„РёРєСЃРёСЂРѕРІР°С‚СЊ С‡СѓС‚СЊ РІ СЃС‚РѕСЂРѕРЅРµ РѕС‚ С†РµРЅС‚СЂР°). */
const IMMERSIVE_BADGE_MAGNET_ESCAPE_PX = 40;

/** РњР°РєСЃ. РІС‹СЃРѕС‚Р° Р·РѕРЅС‹ РјР°РіРЅРёС‚Р° РѕС‚ РЅРёР·Р° СЃРєСЂРѕР»Р»Р° (px). РЁРёСЂРµ вЂ” РґРѕРІРѕРґРєР° СЃСЂР°Р±Р°С‚С‹РІР°РµС‚ РІС‹С€Рµ РїРѕ СЃС‚СЂР°РЅРёС†Рµ, РґРѕС…РѕРґРёС‚ РґРѕ immersive Р±РµР· В«РЅРµРґРѕС‚СЏРіР°В». */
const SHORT_VH_MAGNET_ZONE_CAP_PX = 188;
/**
 * Р•СЃР»Рё РІРєР»СЋС‡РµРЅР° СЂСѓС‡РЅР°СЏ СЂР°СЃС‚СЏР¶РєР° Р®РіР° (shortVhSouthStretchPx), РєРѕРЅС‚РµРЅС‚ РІС‹С€Рµ вЂ” Р±РµР· СЃСѓР¶РµРЅРёСЏ Р·РѕРЅС‹
 * immersive СЃСЂР°Р±Р°С‚С‹РІР°РµС‚ Р·Р° СЃРѕС‚РЅРё px РґРѕ СЂРµР°Р»СЊРЅРѕРіРѕ РЅРёР·Р°: РЅРµ РґРѕРєСЂСѓС‚РёС‚СЊ РґРѕ РЅРёР¶РЅРµР№ РіСЂР°РЅРёС†С‹ РїР°РЅРµР»Рё/СЂСѓС‡РєРё.
 */
const SHORT_VH_MAGNET_ZONE_WHEN_SOUTH_STRETCH_SCALE = 0.22;
const SHORT_VH_MAGNET_ZONE_WHEN_SOUTH_STRETCH_CAP_PX = 56;
/** РњРёРЅРёРјР°Р»СЊРЅС‹Р№ С…РѕРґ СЃРєСЂРѕР»Р»Р°, РїСЂРё РєРѕС‚РѕСЂРѕРј РІРєР»СЋС‡Р°РµРј РјР°РіРЅРёС‚ (РёРЅР°С‡Рµ РЅР° РєРѕСЂРѕС‚РєРѕРј РєРѕРЅС‚РµРЅС‚Рµ РґС‘СЂРіР°РµС‚). */
const SHORT_VH_MAGNET_MIN_SCROLL_RANGE_PX = 48;
/**
 * РћР±СЂР°С‚РЅС‹Р№ РјР°РіРЅРёС‚ (РІС‹С…РѕРґ РёР· immersive): РїРѕ СЂР°СЃСЃС‚РѕСЏРЅРёСЋ РѕС‚ РїСЂРёР¶Р°С‚РѕРіРѕ РЅРёР·Р° (maxTop в€’ scrollTop) Рё/РёР»Рё РїРѕ Р¶РµСЃС‚Сѓ
 * В«РІРЅРёР·В» СЃ РЅРёР¶РЅРµР№ С‡Р°СЃС‚Рё СЌРєСЂР°РЅР° вЂ” РґРѕС‚СЏРіРёРІР°РµРј Рє РІРёРґСѓ В«РїРѕРґ С€Р°РїРєРѕР№В»: scrollTop=0, С€Р°РїРєР° СЃРЅРѕРІР° РІ РїРѕС‚РѕРєРµ РЅР°Рґ СЃС‚РѕР»РѕРј.
 * РџРѕСЂРѕРі РїРѕ СЃРєСЂРѕР»Р»Сѓ вЂ” РјРёРЅРёРјСѓРј РёР· В«РїРѕР»РѕРІРёРЅР° РІС‹СЃРѕС‚С‹ С€Р°РїРєРёВ» Рё РґРѕР»Рё maxTop (С‡С‚РѕР±С‹ СЃСЂР°Р±Р°С‚С‹РІР°Р»Рѕ РґР°Р¶Рµ РїСЂРё РєР°РїСЂРёР·РЅРѕРј scroll).
 */
const SHORT_VH_REVERSE_MAGNET_HALF_HEADER_MIN_PX = 28;
const SHORT_VH_REVERSE_MAGNET_HALF_HEADER_MAX_PX = 84;
/** Р—РѕРЅР° В«С‡РёРїР°В» РїСЂРёРіР»Р°С€РµРЅРёСЏ РІ immersive: РЅРµ РїСЂРё СЃР°РјРѕРј РЅСѓР»Рµ distBottom. */
const SHORT_VH_IMMERSIVE_EXIT_SCROLL_PX = 16;
/**
 * Short immersive: РІРµСЂС… visual viewport вЂ” СЃС‚Р°СЂС‚ Р¶РµСЃС‚Р° В«РІРЅРёР·В» Р·РґРµСЃСЊ РїРѕС‡С‚Рё РІСЃРµРіРґР° pull-to-refresh СЃС‚СЂР°РЅРёС†С‹.
 * РќРµ СЃС‚Р°РІРёРј touchmove-РІС‹С…РѕРґ РІ С€Р°РїРєСѓ (РёРЅР°С‡Рµ РїСЂРё РѕР±РЅРѕРІР»РµРЅРёРё СЃС‚СЂР°РЅРёС†С‹ РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕ СЂР°СЃРєСЂС‹РІР°РµС‚СЃСЏ С…РµРґРµСЂ).
 */
const SHORT_IMMERSIVE_PULL_REFRESH_GUARD_TOP_PX = 100;
/** РЎР±СЂРѕСЃ shortVhMagnetConsumedRef РїСЂРё РїСЂРѕРєСЂСѓС‚РєРµ Рє РІРµСЂС…Сѓ: РїРѕСЂРѕРі РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ Р·РѕРЅС‹ (px). */
const SHORT_VH_MAGNET_REARM_THRESHOLD_PX = 8;
/** Р•СЃР»Рё !immersive Рё consumed В«Р·Р°Р»РёРїВ» РїРѕСЃР»Рµ РІС‹С…РѕРґР° вЂ” СЂР°Р·СЂРµС€Р°РµРј РїСЂСЏРјРѕР№ РјР°РіРЅРёС‚ СЃРЅРѕРІР°, РєРѕРіРґР° РїР°Р»РµС† СЃРЅРѕРІР° РІ Р·РѕРЅРµ СЃРЅРёР·Сѓ РёР»Рё СѓС€С‘Р» РѕС‚ РЅРµС‘. */
const SHORT_VH_MAGNET_REARM_LEAVE_BOTTOM_EXTRA_PX = 24;
/** РРјРјРµСЂСЃРёРІ: СЃС‡РёС‚Р°РµРј wrap В«РїСЂРёР¶Р°С‚С‹Рј Рє РЅРёР·СѓВ», РµСЃР»Рё РґРѕ maxTop РЅРµ Р±РѕР»СЊС€Рµ СЌС‚РѕРіРѕ px вЂ” РёРЅР°С‡Рµ СЃР±СЂРѕСЃ margin РЎ/Р— РґС‘СЂРіР°Р» РІС‘СЂСЃС‚РєСѓ РёР·вЂ‘Р·Р° СЃСѓР±РїРёРєСЃРµР»РµР№/WebKit. */
const SHORT_VH_IMMERSIVE_NW_ALIGN_SCROLL_SLACK_PX = 28;
/** РРјРјРµСЂСЃРёРІ: margin-top СЂСЏРґР° Р—/РЎ РѕС‚РЅРѕСЃРёС‚РµР»СЊРЅРѕ РІРµСЂС…Р° Р±РµР№РґР¶Р° вЂ” clamp |margin| (РґРІСѓСЃС‚РѕСЂРѕРЅРЅРµРµ РІС‹СЂР°РІРЅРёРІР°РЅРёРµ). */
const SHORT_VH_IMMERSIVE_NW_ALIGN_MARGIN_ABS_MAX_PX = 40;
/**
 * Р•СЃР»Рё wrap Р±С‹Р» Сѓ РЅРёР·Р°, Р° РІС‹СЃРѕС‚Р° РєРѕРЅС‚РµРЅС‚Р° РІС‹СЂРѕСЃР»Р° (РІР°С€ С…РѕРґ, СЂР°РјРєР°, СЂСЏРґ РєР°СЂС‚), dist РґРѕ РЅРёР·Р° СЃС‚Р°РЅРµС‚ > slack, РЅРѕ РЅРµР±РѕР»СЊС€РёРј.
 * РўРѕРіРґР° РїРµСЂРµРїСЂРёР¶РёРјР°РµРј scroll Рє РЅРёР·Сѓ, Р° РЅРµ СЃР±СЂР°СЃС‹РІР°РµРј РІС‹СЂР°РІРЅРёРІР°РЅРёРµ РЎ/Р— (РёРЅР°С‡Рµ Р·Р°Р·РѕСЂ СЃРІРµСЂС…Сѓ Рё РѕР±СЂРµР· РЅРёР·Р° РїР°РЅРµР»Рё Р®РіР°).
 */
const SHORT_VH_IMMERSIVE_REPIN_AFTER_GROW_MAX_DIST_PX = 240;
/** Р®Р¶РЅР°СЏ СЂСѓС‡РєР° short-VH: СЃРґРІРёРі РјРµРЅСЊС€Рµ СЌС‚РѕРіРѕ (РїРѕ Y) вЂ” С‚Р°Рї в†’ РјРµРЅСЋ СЂРµР¶РёРјРѕРІ; РёРЅР°С‡Рµ РїРµСЂРµС‚Р°СЃРєРёРІР°РЅРёРµ в†’ РїСЂРѕРєСЂСѓС‚РєР° СЃС‚РѕР»РёРєР°. */
const SHORT_VH_SOUTH_PULL_TAB_TAP_MAX_MOVE_PX = 14;
/** РџРѕСЃР»Рµ РѕС‚РїСѓСЃРєР°РЅРёСЏ СЂСѓС‡РєРё Р±РµР· СѓРґРµСЂР¶Р°РЅРёСЏ вЂ” РіР»СѓС€РёРј Р°РІС‚Рѕ-immersive РѕС‚ РЅРёР¶РЅРµРіРѕ РјР°РіРЅРёС‚Р° (РјРёРєСЂРѕСЃРєСЂРѕР»Р» РѕС‚ РєРѕСЂРѕС‚РєРѕРіРѕ С‚Р°РїР°). */
const SHORT_VH_SOUTH_PULL_TAB_POST_TAP_MAGNET_SUPPRESS_MS = 650;
function readShortGameHeaderHalfHeightPx(headerEl: HTMLElement | null): number {
  if (headerEl == null) return 44;
  const h = headerEl.offsetHeight > 8 ? headerEl.offsetHeight : headerEl.getBoundingClientRect().height;
  const half = h > 12 ? Math.round(h / 2) : 44;
  return Math.max(
    SHORT_VH_REVERSE_MAGNET_HALF_HEADER_MIN_PX,
    Math.min(SHORT_VH_REVERSE_MAGNET_HALF_HEADER_MAX_PX, half),
  );
}

/** Р“Р»РёС„ РєРЅРѕРїРєРё В«РџРѕРєР°Р·Р°С‚СЊ С€Р°РїРєСѓВ» (immersive, РІРЅСѓС‚СЂРё Р±РµР№РґР¶Р°): РѕРґРёРЅ СЂСЏРґ РёР· 5 РєСЂСѓР¶РєРѕРІ; С†РІРµС‚ РІ --dot. */
const MOBILE_IMMERSIVE_HANDLE_DOT_COLORS: readonly string[] = [
  '#c26cff',

// --- exit/enter immersive ---
  /** Р’С‹С…РѕРґ РёР· short immersive: СЃРЅРёРјР°РµРј immersive СЃРёРЅС…СЂРѕРЅРЅРѕ, Р·Р°С‚РµРј scrollTop=0 вЂ” РІРёРґ В«РїРѕРґ С€Р°РїРєРѕР№В» (РёРЅР°С‡Рµ maxTop/РІС‘СЂСЃС‚РєР° СЂР°СЃС…РѕРґСЏС‚СЃСЏ). */
  const exitShortVhImmersiveWithMagnetSnap = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      cancelShortVhEnterGentleScroll();
      flushSync(() => {
        setMobileShortHeaderImmersive(false);
      });
      shortVhMagnetConsumedRef.current = true;
      commitShortMainWrapScrollToStart(el);
    },
    [setMobileShortHeaderImmersive, cancelShortVhEnterGentleScroll],
  );

  type ShortVhEnterImmersiveMode = 'instant' | 'gentle';

  /**
   * Short immersive: РїСЂРёР¶Р°С‚СЊ wrap Рє РЅРёР·Сѓ, РІС‹СЂРѕРІРЅСЏС‚СЊ РІРµСЂС… `.game-mobile-top-row` СЃ РІРµСЂС…РѕРј `.game-info-left-section`
   * (getBoundingClientRect), Р±РµР· С†РµРїРѕС‡РєРё rAF вЂ” РёРЅР°С‡Рµ РјРµР¶РґСѓ РєР°РґСЂР°РјРё padding/main-wrap РјРµРЅСЏРµС‚СЃСЏ Рё РІРёРґРЅРѕ В«РІРІРµСЂС…, РїРѕС‚РѕРј РІРЅРёР·В».
   * Р”РІР° РїСЂРѕС…РѕРґР°: margin РјРµРЅСЏРµС‚ scrollHeight вЂ” РІС‚РѕСЂРѕР№ pin+РёР·РјРµСЂРµРЅРёРµ РІ С‚РѕРј Р¶Рµ РєР°РґСЂРµ РїРѕСЃР»Рµ flushSync.
   */
  const requestShortVhImmersiveLayoutFlush = useCallback(() => {
    if (!mobileShortHeaderImmersiveRef.current) return;
    const wrap = mobileShortMainWrapRef.current;
    if (!wrap || !isMobileRef.current) {
      flushSync(() => setShortImmersiveNwRowAlignPx(0));
      return;
    }

    const applyPinnedMargin = () => {
      const badge = mobileGameInfoSectionAlignRef.current;
      const row = mobileShortTopRowRef.current;
      if (!badge || !row) {
        flushSync(() => setShortImmersiveNwRowAlignPx(0));
        return false;
      }
      let maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
      let distFromBottom = maxTop - wrap.scrollTop;
      if (distFromBottom > SHORT_VH_IMMERSIVE_NW_ALIGN_SCROLL_SLACK_PX) {
        if (
          shortVhImmersivePinnedToEndRef.current &&
          distFromBottom <= SHORT_VH_IMMERSIVE_REPIN_AFTER_GROW_MAX_DIST_PX
        ) {
          commitShortMainWrapScrollToEnd(wrap);
          maxTop = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
          distFromBottom = maxTop - wrap.scrollTop;
          if (distFromBottom > SHORT_VH_IMMERSIVE_NW_ALIGN_SCROLL_SLACK_PX) {
            flushSync(() => setShortImmersiveNwRowAlignPx(0));
            return false;
          }
        } else {
          flushSync(() => setShortImmersiveNwRowAlignPx(0));
          return false;
        }
      }
      const bt = badge.getBoundingClientRect().top;
      const rt = row.getBoundingClientRect().top;
      const deltaRaw = Math.round(bt - rt);
      const delta = Math.max(
        -SHORT_VH_IMMERSIVE_NW_ALIGN_MARGIN_ABS_MAX_PX,
        Math.min(SHORT_VH_IMMERSIVE_NW_ALIGN_MARGIN_ABS_MAX_PX, deltaRaw),
      );
      flushSync(() => setShortImmersiveNwRowAlignPx((prev) => (prev === delta ? prev : delta)));
      return true;
    };

    for (let pass = 0; pass < 2; pass++) {
      commitShortMainWrapScrollToEnd(wrap);
      if (!applyPinnedMargin()) return;
    }
    commitShortMainWrapScrollToEnd(wrap);
  }, []);

  const syncShortImmersiveNwRowWithBadgeTop = requestShortVhImmersiveLayoutFlush;

  /**
   * РџРѕСЃР»Рµ flushSync(immersive): pin + РІС‹СЂР°РІРЅРёРІР°РЅРёРµ РІ РѕРґРЅРѕРј СЃРёРЅС…СЂРѕРЅРЅРѕРј РїСЂРѕС…РѕРґРµ (Р±РµР· Р»РёС€РЅРµРіРѕ commit РґРѕ rAF).
   */
  const finalizeShortVhImmersiveEnterLayout = useCallback(
    (_wrap: HTMLDivElement) => {
      if (!mobileShortHeaderImmersiveRef.current) return;
      requestShortVhImmersiveLayoutFlush();
    },
    [requestShortVhImmersiveLayoutFlush],
  );

  /**
   * Р’С…РѕРґ РІ immersive: Сѓ СЃР°РјРѕРіРѕ РЅРёР·Р° вЂ” РјРіРЅРѕРІРµРЅРЅРѕ. РњР°РіРЅРёС‚ В«СЃ СЃРµСЂРµРґРёРЅС‹В» вЂ” РєРѕСЂРѕС‚РєР°СЏ РґРѕРІРѕРґРєР° scroll, Р·Р°С‚РµРј immersive.
   * РўРѕС‡РєР° РІС…РѕРґР° РёР· РјРµРЅСЋ СЋР¶РЅРѕР№ СЂСѓС‡РєРё: СЃРј. onShortVhSouthPullMenuChooseImmersive.
   */
  const enterShortVhImmersiveWithMagnetSnap = useCallback(
    (el: HTMLDivElement, mode: ShortVhEnterImmersiveMode = 'gentle') => {
      const nearBottomPx = 22;

      const useInstant = prefersReducedMotion || mode === 'instant';
      const maxTop0 = Math.max(0, el.scrollHeight - el.clientHeight);
      const distBottom0 = maxTop0 - el.scrollTop;
      /** Р‘Р»РёР¶Рµ Рє РЅРёР·Сѓ вЂ” СЃСЂР°Р·Сѓ instant+commit (Р±РµР· gentle), С‡С‚РѕР±С‹ РЅРµ В«РЅРµРґРѕС‚СЏРіРёРІР°С‚СЊВ» РёР·вЂ‘Р·Р° СЃРјРµРЅС‹ maxTop РЅР° РєР°РґСЂРµ immersive. */

      if (useInstant || distBottom0 <= nearBottomPx) {
        cancelShortVhEnterGentleScroll();
        flushSync(() => {
          setMobileShortHeaderImmersive(true);
        });
        shortVhMagnetConsumedRef.current = true;
        finalizeShortVhImmersiveEnterLayout(el);
        return;
      }

      if (shortVhEnterMagnetAnimatingRef.current) return;
      cancelShortVhEnterGentleScroll();
      shortVhEnterMagnetAnimatingRef.current = true;
      shortVhMagnetConsumedRef.current = true;

      const startTop = el.scrollTop;
      const targetTop = maxTop0;
      const durationMs = 150;
      const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

      const tick = (now: number) => {
        const wrap = mobileShortMainWrapRef.current;
        if (wrap !== el || !isMobileRef.current || mobileShortHeaderImmersiveRef.current) {
          shortVhEnterMagnetAnimatingRef.current = false;
          shortVhEnterGentleRafRef.current = null;
          if (!mobileShortHeaderImmersiveRef.current) shortVhMagnetConsumedRef.current = false;
          return;
        }
        const elapsed = typeof performance !== 'undefined' ? now - t0 : durationMs;
        const p = Math.min(1, elapsed / durationMs);
        const eased = 1 - (1 - p) ** 4;
        setShortMainWrapScrollTopProgrammatic(wrap, Math.round(startTop + (targetTop - startTop) * eased));
        if (p < 1) {
          shortVhEnterGentleRafRef.current = window.requestAnimationFrame(tick);
          return;
        }
        const maxSnap = Math.max(0, wrap.scrollHeight - wrap.clientHeight);
        setShortMainWrapScrollTopProgrammatic(wrap, maxSnap);
        shortVhEnterGentleRafRef.current = null;
        shortVhEnterMagnetAnimatingRef.current = false;
        flushSync(() => {
          setMobileShortHeaderImmersive(true);
        });
        finalizeShortVhImmersiveEnterLayout(wrap);
      };

      shortVhEnterGentleRafRef.current = window.requestAnimationFrame(tick);
    },
    [
      setMobileShortHeaderImmersive,
      prefersReducedMotion,
      cancelShortVhEnterGentleScroll,
      finalizeShortVhImmersiveEnterLayout,
    ],
  );

  const updateMobileShortScrollMagnet = useCallback(() => {
    const el = mobileShortMainWrapRef.current;
    if (!el || !isMobileRef.current || !mobileViewportShort) return;
    if (onlineRef.current.userOnPause) return;


// --- menu handler ---
  const onShortVhSouthPullMenuChooseImmersive = useCallback(() => {
    dismissShortVhSouthPullModeMenu();
    const el = mobileShortMainWrapRef.current;
    if (!el) return;
    commitShortMainWrapScrollToEnd(el);
    enterShortVhImmersiveWithMagnetSnap(el, prefersReducedMotion ? 'instant' : 'instant');
  }, [dismissShortVhSouthPullModeMenu, enterShortVhImmersiveWithMagnetSnap, prefersReducedMotion]);


// --- menu option JSX ---
                <button
                  type="button"
                  className="short-vh-south-pull-menu-portal__opt short-vh-south-pull-menu-portal__opt--immersive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShortVhSouthPullMenuChooseImmersive();
                  }}
                >
                  <span className="short-vh-south-pull-menu-portal__opt-ico" aria-hidden>
                    вњ¦
                  </span>
                  <span className="short-vh-south-pull-menu-portal__opt-body">
                    <span className="short-vh-south-pull-menu-portal__opt-k">РЎР°РјС‹Р№ РєРѕРјРїР°РєС‚РЅС‹Р№</span>
                    <span className="short-vh-south-pull-menu-portal__opt-d">Р‘РµР· С€Р°РїРєРё, СЃС‚РѕР» РЅР° РІРµСЃСЊ СЌРєСЂР°РЅ</span>
                  </span>
                </button>
