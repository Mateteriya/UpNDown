import { describe, expect, it } from 'vitest';
import {
  southNameLongCompact,
  USER_SOUTH_AVATAR_PC_BIDDING_PX,
  USER_SOUTH_AVATAR_PC_PLAY_PX,
  USER_SOUTH_AVATAR_TABLET_BIDDING_PX,
  USER_SOUTH_AVATAR_TABLET_PLAY_PX,
  userSouthAvatarSizePx,
} from './userSouthPanelCanon';

describe('userSouthPanelCanon', () => {
  it('compacts long names only after bid is placed', () => {
    expect(southNameLongCompact({ name: 'Мария', hasPlacedBid: true })).toBe(false);
    expect(southNameLongCompact({ name: 'СуперМария17', hasPlacedBid: false })).toBe(false);
    expect(southNameLongCompact({ name: 'СуперМария17', hasPlacedBid: true })).toBe(true);
    expect(southNameLongCompact({ name: '123456789', hasPlacedBid: true })).toBe(false);
    expect(southNameLongCompact({ name: '1234567890', hasPlacedBid: true })).toBe(true);
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
