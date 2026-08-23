import { describe, expect, it } from 'vitest';
import {
  MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS,
  MOBILE_LS_3P_HAND_DISK_MAX_CARDS,
  MOBILE_LS_EAST_CHAT_COL_W_MAX_PX,
  MOBILE_LS_EAST_CHAT_COL_W_MIN_PX,
  MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX,
  MOBILE_LS_EAST_CHAT_COL_W_PX,
  MOBILE_LS_EAST_HEADER_TOOLS_INLINE_MIN_PX,
  MOBILE_LS_HAND_DISK_CARD_GAP_PX,
  MOBILE_LS_HAND_DISK_ORBIT_PX,
  MOBILE_LS_HAND_DISK_PLACE_INTRO_MS,
  MOBILE_LS_HAND_DISK_PLACE_SOFT_MS,
  MOBILE_LS_HAND_DISK_PLACE_TICK_PX,
  MOBILE_LS_SOUTH_MINI_COLLAPSE_MS,
  clampMobileLsEastChatColW,
  clampMobileLsHandDiskPos,
  mobileLsChatAffordanceKind,
  mobileLsChatAffordanceMode,
  mobileLsEastChatColWidthPx,
  mobileLsEastHeaderUsesOverflow,
  mobileLsHandDiskHome,
  mobilePortraitHandDiskHome,
  mobilePortraitChatAffordanceMode,
  nudgeMobileLsHandDiskOffRects,
} from './mobileLandscapeChatContract';

describe('mobileLsChatAffordanceMode', () => {
  it('uses hand-disk for 0..max cards', () => {
    expect(MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS).toBe(5);
    expect(mobileLsChatAffordanceMode(0)).toBe('hand-disk');
    expect(mobileLsChatAffordanceMode(5)).toBe('hand-disk');
  });

  it('uses south-mini for 6+ cards', () => {
    expect(mobileLsChatAffordanceMode(6)).toBe('south-mini');
    expect(mobileLsChatAffordanceMode(12)).toBe('south-mini');
  });
});

describe('mobileLsChatAffordanceKind', () => {
  it('uses south-mini only in 4p landscape at 6+ cards', () => {
    expect(
      mobileLsChatAffordanceKind({ handLen: 6, landscape: true, threeSeat: false }),
    ).toBe('south-mini');
    expect(
      mobileLsChatAffordanceKind({ handLen: 12, landscape: true, threeSeat: false }),
    ).toBe('south-mini');
  });

  it('keeps the disk in 3p landscape even at 6–12 cards', () => {
    expect(
      mobileLsChatAffordanceKind({ handLen: 6, landscape: true, threeSeat: true }),
    ).toBe('hand-disk');
    expect(
      mobileLsChatAffordanceKind({ handLen: 12, landscape: true, threeSeat: true }),
    ).toBe('hand-disk');
  });

  it('keeps the disk in portrait at any hand size', () => {
    expect(
      mobileLsChatAffordanceKind({ handLen: 12, landscape: false, threeSeat: false }),
    ).toBe('hand-disk');
    expect(
      mobileLsChatAffordanceKind({ handLen: 12, landscape: false, threeSeat: true }),
    ).toBe('hand-disk');
  });
});

describe('mobilePortraitHandDiskHome', () => {
  it('anchors the disk on the south panel bottom in portrait', () => {
    expect(mobilePortraitHandDiskHome()).toBe('south-panel');
  });
});

describe('mobileLsHandDiskHome', () => {
  it('keeps 3p landscape disk beside the hand through 9 cards', () => {
    expect(MOBILE_LS_3P_HAND_DISK_MAX_CARDS).toBe(9);
    expect(
      mobileLsHandDiskHome({ handLen: 9, landscape: true, threeSeat: true }),
    ).toBe('hand');
  });

  it('moves 3p landscape disk above East at 10–12 cards', () => {
    expect(
      mobileLsHandDiskHome({ handLen: 10, landscape: true, threeSeat: true }),
    ).toBe('east-header');
    expect(
      mobileLsHandDiskHome({ handLen: 12, landscape: true, threeSeat: true }),
    ).toBe('east-header');
  });

  it('does not use the East header slot in 4p or portrait', () => {
    expect(
      mobileLsHandDiskHome({ handLen: 12, landscape: true, threeSeat: false }),
    ).toBe('hand');
    expect(
      mobileLsHandDiskHome({ handLen: 12, landscape: false, threeSeat: true }),
    ).toBe('hand');
  });
});

describe('mobilePortraitChatAffordanceMode', () => {
  it('always uses the hand disk (south mini is 4p landscape only)', () => {
    expect(mobilePortraitChatAffordanceMode(0)).toBe('hand-disk');
    expect(mobilePortraitChatAffordanceMode(4)).toBe('hand-disk');
    expect(mobilePortraitChatAffordanceMode(5)).toBe('hand-disk');
    expect(mobilePortraitChatAffordanceMode(12)).toBe('hand-disk');
  });
});

describe('MOBILE_LS_SOUTH_MINI_COLLAPSE_MS', () => {
  it('collapses to micro between 5 and 7 seconds', () => {
    expect(MOBILE_LS_SOUTH_MINI_COLLAPSE_MS).toBeGreaterThanOrEqual(5000);
    expect(MOBILE_LS_SOUTH_MINI_COLLAPSE_MS).toBeLessThanOrEqual(7000);
  });
});

describe('mobileLsEastChatColWidthPx', () => {
  it('uses full width on normal landscape', () => {
    expect(mobileLsEastChatColWidthPx({})).toBe(MOBILE_LS_EAST_CHAT_COL_W_PX);
    expect(MOBILE_LS_EAST_CHAT_COL_W_PX).toBe(260);
  });

  it('uses compact width on after-short / short', () => {
    expect(mobileLsEastChatColWidthPx({ afterShort: true })).toBe(MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX);
    expect(mobileLsEastChatColWidthPx({ shortVh: true })).toBe(MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX);
    expect(MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX).toBe(200);
  });
});

describe('clampMobileLsEastChatColW', () => {
  it('clamps to min/max', () => {
    expect(clampMobileLsEastChatColW(10)).toBe(MOBILE_LS_EAST_CHAT_COL_W_MIN_PX);
    expect(clampMobileLsEastChatColW(999)).toBe(MOBILE_LS_EAST_CHAT_COL_W_MAX_PX);
    expect(clampMobileLsEastChatColW(220)).toBe(220);
  });

  it('respects custom max', () => {
    expect(clampMobileLsEastChatColW(300, { maxPx: 240 })).toBe(240);
  });
});

describe('mobileLsEastHeaderUsesOverflow', () => {
  it('packs tools under overflow below the inline threshold', () => {
    expect(MOBILE_LS_EAST_HEADER_TOOLS_INLINE_MIN_PX).toBe(213);
    expect(mobileLsEastHeaderUsesOverflow(148)).toBe(true);
    expect(mobileLsEastHeaderUsesOverflow(200)).toBe(true);
    expect(mobileLsEastHeaderUsesOverflow(212)).toBe(true);
    expect(mobileLsEastHeaderUsesOverflow(213)).toBe(false);
    expect(mobileLsEastHeaderUsesOverflow(260)).toBe(false);
    expect(mobileLsEastHeaderUsesOverflow(340)).toBe(false);
  });
});

describe('MOBILE_LS_HAND_DISK_PLACE_INTRO_MS', () => {
  it('highlights placement ticks for about 3–4 seconds', () => {
    expect(MOBILE_LS_HAND_DISK_PLACE_INTRO_MS).toBeGreaterThanOrEqual(3000);
    expect(MOBILE_LS_HAND_DISK_PLACE_INTRO_MS).toBeLessThanOrEqual(4000);
  });

  it('then softly blinks glyphs for another 2–3 seconds', () => {
    expect(MOBILE_LS_HAND_DISK_PLACE_SOFT_MS).toBeGreaterThanOrEqual(2000);
    expect(MOBILE_LS_HAND_DISK_PLACE_SOFT_MS).toBeLessThanOrEqual(3000);
  });
});

describe('clampMobileLsHandDiskPos', () => {
  it('keeps placement ticks on-screen when extra insets are set', () => {
    expect(MOBILE_LS_HAND_DISK_PLACE_TICK_PX).toBe(30);
    const tight = clampMobileLsHandDiskPos(9999, 9999, {
      extraRight: MOBILE_LS_HAND_DISK_PLACE_TICK_PX,
      extraBottom: MOBILE_LS_HAND_DISK_PLACE_TICK_PX,
    });
    const loose = clampMobileLsHandDiskPos(9999, 9999);
    expect(tight.x).toBeLessThanOrEqual(loose.x);
    expect(tight.y).toBeLessThanOrEqual(loose.y);
    expect(tight.x).toBeGreaterThanOrEqual(8);
    expect(tight.y).toBeGreaterThanOrEqual(8);
  });
});

describe('nudgeMobileLsHandDiskOffRects', () => {
  it('keeps the slot position when cards do not overlap', () => {
    const pos = { x: 200, y: 100 };
    const next = nudgeMobileLsHandDiskOffRects(pos, [
      { left: 40, top: 80, right: 120, bottom: 180 },
    ]);
    expect(next).toEqual(pos);
  });

  it('slides right of an overlapping hand card', () => {
    const pos = { x: 100, y: 100 };
    const card = { left: 40, top: 80, right: 130, bottom: 190 };
    const next = nudgeMobileLsHandDiskOffRects(pos, [card], { gap: 8 });
    expect(next.x).toBeGreaterThanOrEqual(card.right + 8);
    expect(next.y).toBeGreaterThanOrEqual(8);
  });

  it('slides right when the orbit sits on cards even if the 40px box does not', () => {
    const card = { left: 40, top: 80, right: 130, bottom: 190 };
    const pos = { x: 136, y: 100 };
    const next = nudgeMobileLsHandDiskOffRects(pos, [card], {
      extraLeft: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraTop: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraRight: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraBottom: MOBILE_LS_HAND_DISK_ORBIT_PX,
      gap: MOBILE_LS_HAND_DISK_CARD_GAP_PX,
    });
    expect(next.x).toBeGreaterThanOrEqual(
      card.right + MOBILE_LS_HAND_DISK_CARD_GAP_PX + MOBILE_LS_HAND_DISK_ORBIT_PX,
    );
    expect(next.x).toBeGreaterThan(pos.x);
  });
});
