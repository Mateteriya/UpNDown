import { describe, expect, it } from 'vitest';
import {
  pcSouthNameCutChars,
  USER_SOUTH_AVATAR_PC_BIDDING_PX,
  USER_SOUTH_AVATAR_PC_PLAY_PX,
  USER_SOUTH_AVATAR_TABLET_BIDDING_PX,
  USER_SOUTH_AVATAR_TABLET_PLAY_PX,
  userSouthAvatarSizePx,
} from './userSouthPanelCanon';

describe('userSouthPanelCanon', () => {
  it('cuts PC names by trick slot count; tablet never cuts', () => {
    expect(pcSouthNameCutChars(6, false)).toBe(0);
    expect(pcSouthNameCutChars(7, false)).toBe(3);
    expect(pcSouthNameCutChars(9, false)).toBe(3);
    expect(pcSouthNameCutChars(10, false)).toBe(5);
    expect(pcSouthNameCutChars(12, true)).toBe(0);
  });

  it('picks avatar size by shell and phase', () => {
    expect(userSouthAvatarSizePx({ isTabletShell: false, isBidding: false })).toBe(
      USER_SOUTH_AVATAR_PC_PLAY_PX,
    );
    expect(userSouthAvatarSizePx({ isTabletShell: false, isBidding: true })).toBe(
      USER_SOUTH_AVATAR_PC_BIDDING_PX,
    );
    expect(userSouthAvatarSizePx({ isTabletShell: true, isBidding: false })).toBe(
      USER_SOUTH_AVATAR_TABLET_PLAY_PX,
    );
    expect(userSouthAvatarSizePx({ isTabletShell: true, isBidding: true })).toBe(
      USER_SOUTH_AVATAR_TABLET_BIDDING_PX,
    );
  });
});
