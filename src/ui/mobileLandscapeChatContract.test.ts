import { describe, expect, it } from 'vitest';
import {
  MOBILE_LS_CHAT_HAND_DISK_MAX_CARDS,
  MOBILE_LS_EAST_CHAT_COL_W_MAX_PX,
  MOBILE_LS_EAST_CHAT_COL_W_MIN_PX,
  MOBILE_LS_EAST_CHAT_COL_W_NARROW_PX,
  MOBILE_LS_EAST_CHAT_COL_W_PX,
  MOBILE_LS_SOUTH_MINI_COLLAPSE_MS,
  clampMobileLsEastChatColW,
  mobileLsChatAffordanceMode,
  mobileLsEastChatColWidthPx,
  mobilePortraitChatAffordanceMode,
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

describe('mobilePortraitChatAffordanceMode', () => {
  it('uses hand-disk while the hand has fewer than 5 cards', () => {
    expect(mobilePortraitChatAffordanceMode(0)).toBe('hand-disk');
    expect(mobilePortraitChatAffordanceMode(4)).toBe('hand-disk');
  });

  it('uses south-mini from 5 cards', () => {
    expect(mobilePortraitChatAffordanceMode(5)).toBe('south-mini');
    expect(mobilePortraitChatAffordanceMode(12)).toBe('south-mini');
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
