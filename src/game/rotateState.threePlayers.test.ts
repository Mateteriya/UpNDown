import { describe, expect, it } from 'vitest';
import { createGameOnline, playerAtLeftFrom, placeBid, startDeal } from './GameEngine';
import {
  getCanonicalIndexForDisplay,
  getDisplayTrickPlayerIndex,
  rotateStateForPlayer,
  unrotateStateToCanonical,
} from './rotateState';

/**
 * Онлайн на троих = тот же контракт, что на четверых:
 * после rotate слева (display 2) всегда следующий по ходу; сверху — оставшийся.
 * Круг хода только в GameEngine: 0→2→1.
 */
describe('3-player online = 4-player contract without East', () => {
  it('seats: left panel is always next clockwise', () => {
    const base = createGameOnline(['Юг', 'Север', 'Запад']);

    // Юг: как абсолютный стол — верх Север, слева Запад
    expect(rotateStateForPlayer(base, 0).players.map((p) => p.name)).toEqual(['Юг', 'Север', 'Запад']);

    // Запад: слева Север (ходит после Запада), сверху Юг
    const west = rotateStateForPlayer(base, 2);
    expect(west.players.map((p) => p.name)).toEqual(['Запад', 'Юг', 'Север']);
    expect(unrotateStateToCanonical(west, 2).players.map((p) => p.name)).toEqual(['Юг', 'Север', 'Запад']);

    // Север: слева Юг, сверху Запад
    expect(rotateStateForPlayer(base, 1).players.map((p) => p.name)).toEqual(['Север', 'Запад', 'Юг']);
  });

  it('display left-hand walk matches engine (0→2→1) for every viewer', () => {
    for (const my of [0, 1, 2] as const) {
      expect(playerAtLeftFrom(0, 1, 3)).toBe(2);
      expect(getDisplayTrickPlayerIndex(0, 1, my, 3)).toBe(2);
      expect(getDisplayTrickPlayerIndex(2, 1, my, 3)).toBe(1);
      expect(getDisplayTrickPlayerIndex(1, 1, my, 3)).toBe(0);
    }
  });

  it('canonical turn order stays 0→2→1 after rotate', () => {
    let s = createGameOnline(['Юг', 'Север', 'Запад']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    expect(s.currentPlayerIndex).toBe(2);
    for (const seat of [2, 1, 0] as const) {
      expect(s.currentPlayerIndex).toBe(seat);
      for (const my of [0, 1, 2] as const) {
        const view = rotateStateForPlayer(s, my);
        expect(getCanonicalIndexForDisplay(view.currentPlayerIndex, my, 3)).toBe(seat);
        if (seat === my) expect(view.currentPlayerIndex).toBe(0);
      }
      s = placeBid(s, seat, 0);
    }
  });
});

describe('4-player rotation unchanged', () => {
  it('South: display trick walk = playerAtLeftFrom', () => {
    for (let leader = 0; leader < 4; leader++) {
      for (let i = 0; i < 4; i++) {
        expect(getDisplayTrickPlayerIndex(leader, i, 0, 4)).toBe(playerAtLeftFrom(leader, i, 4));
      }
    }
  });

  it('West viewer: me → left(North) → top(East) → right(South)', () => {
    const my = 2;
    const rotated = rotateStateForPlayer(
      {
        ...createGameOnline(['Юг', 'Север', 'Запад', 'Восток']),
        trickLeaderIndex: 2,
        currentPlayerIndex: 2,
      },
      my,
    );
    expect(rotated.players.map((p) => p.name)).toEqual(['Запад', 'Восток', 'Север', 'Юг']);
    expect(rotated.trickLeaderIndex).toBe(0);
    expect(getDisplayTrickPlayerIndex(0, 0, my, 4)).toBe(0);
    expect(getDisplayTrickPlayerIndex(0, 1, my, 4)).toBe(2);
    expect(getDisplayTrickPlayerIndex(0, 2, my, 4)).toBe(1);
    expect(getDisplayTrickPlayerIndex(0, 3, my, 4)).toBe(3);
  });
});
