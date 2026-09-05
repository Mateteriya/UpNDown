import { describe, expect, it } from 'vitest';
import { projectGameState, projectRoomForViewer, viewerSeatIndex, slimPlayerSlots } from './stateView';
import { canAccessRoom, isRoomMember } from './roomAccess';
import type { GameState } from '../../src/game/GameEngine';
import type { GameRoomRow } from './protocol';

function stateWithHands(): GameState {
  return {
    phase: 'playing',
    dealerIndex: 0,
    currentPlayerIndex: 0,
    trump: null,
    tricksInDeal: 1,
    currentTrick: [],
    trickLeaderIndex: 0,
    bids: [1, 0],
    dealNumber: 1,
    trumpCard: null,
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
    dealHistory: [],
    players: [
      {
        id: 'a',
        name: 'A',
        hand: [{ suit: '♠', rank: 'A' }],
        tricksTaken: 0,
        score: 0,
      },
      {
        id: 'b',
        name: 'B',
        hand: [{ suit: '♥', rank: 'K' }],
        tricksTaken: 0,
        score: 0,
      },
    ],
  };
}

const room: GameRoomRow = {
  id: 'r1',
  code: 'ABC123',
  host_user_id: 'user-a',
  status: 'playing',
  game_state: null,
  player_slots: [
    { slotIndex: 0, userId: 'user-a', displayName: 'A' },
    { slotIndex: 1, userId: 'user-b', displayName: 'B' },
  ],
  created_at: '',
  updated_at: '',
};

describe('slimPlayerSlots', () => {
  it('drops data-URL avatars and keeps pause flags', () => {
    const slim = slimPlayerSlots([
      {
        slotIndex: 0,
        displayName: 'A',
        userId: 'u1',
        avatarDataUrl: 'data:image/jpeg;base64,' + 'x'.repeat(80),
        pausedByUser: true,
      },
      { slotIndex: 1, displayName: 'B', userId: 'u2' },
    ]);
    expect(slim?.[0]).not.toHaveProperty('avatarDataUrl');
    expect(slim?.[0].pausedByUser).toBe(true);
    expect(slim?.[1].displayName).toBe('B');
  });
});

describe('projectRoomForViewer', () => {
  it('strips data-URL avatars unless keepAvatars is explicit', () => {
    const fat = 'data:image/jpeg;base64,' + 'x'.repeat(80);
    const waiting: GameRoomRow = {
      ...room,
      status: 'waiting',
      player_slots: [{ slotIndex: 0, userId: 'user-a', displayName: 'A', avatarDataUrl: fat }],
    };
    const playing: GameRoomRow = { ...waiting, status: 'playing' };
    expect(projectRoomForViewer(waiting, 'user-a').player_slots?.[0]).not.toHaveProperty('avatarDataUrl');
    expect(projectRoomForViewer(playing, 'user-a').player_slots?.[0]).not.toHaveProperty('avatarDataUrl');
    expect(
      projectRoomForViewer(playing, 'user-a', { stripUnknownHands: false, keepAvatars: true }).player_slots?.[0],
    ).toHaveProperty('avatarDataUrl', fat);
  });
});

describe('projectGameState', () => {
  it('keeps only the viewer hand', () => {
    const view = projectGameState(stateWithHands(), 0);
    expect(view.players[0].hand).toEqual([{ suit: '♠', rank: 'A' }]);
    expect(view.players[1].hand).toEqual([]);
  });

  it('strips all hands when viewer seat is unknown', () => {
    const view = projectGameState(stateWithHands(), null);
    expect(view.players.every((p) => p.hand.length === 0)).toBe(true);
  });
});

describe('room access', () => {
  it('maps user to seat', () => {
    expect(viewerSeatIndex(room, 'user-b')).toBe(1);
  });

  it('required: stranger cannot subscribe', () => {
    expect(isRoomMember(room, 'eve')).toBe(false);
    expect(canAccessRoom(room, { userId: 'eve', authed: true }, 'required')).toBe(false);
    expect(canAccessRoom(room, { userId: 'user-a', authed: true }, 'required')).toBe(true);
    expect(canAccessRoom(room, { userId: null, authed: false }, 'required')).toBe(false);
  });

  it('off: LAN guest can access', () => {
    expect(canAccessRoom(room, { userId: null, authed: false }, 'off')).toBe(true);
  });
});
