import { describe, expect, it } from 'vitest';
import { getMobileDealContractMetaTooltip, resolveMobileDealContractBadgeFace } from './mobileDealContractBadgeFace';

describe('resolveMobileDealContractBadgeFace', () => {
  it('обычная раздача на торгах — КАРТ до завершения заказов', () => {
    expect(
      resolveMobileDealContractBadgeFace({
        dealNumber: 1,
        phase: 'bidding',
        allBidsPlaced: false,
        alternateFace: 0,
      }),
    ).toBe('cards');
  });

  it('обычная раздача после торгов — заказ/взятки', () => {
    expect(
      resolveMobileDealContractBadgeFace({
        dealNumber: 1,
        phase: 'playing',
        allBidsPlaced: true,
        alternateFace: 0,
      }),
    ).toBe('orders');
  });

  it('бескозырка на торгах — чередование: режим', () => {
    expect(
      resolveMobileDealContractBadgeFace({
        dealNumber: 21,
        phase: 'bidding',
        allBidsPlaced: false,
        alternateFace: 0,
      }),
    ).toBe('mode');
  });

  it('бескозырка в игре — только заказ/взятки (без режима)', () => {
    expect(
      resolveMobileDealContractBadgeFace({
        dealNumber: 21,
        phase: 'playing',
        allBidsPlaced: true,
        alternateFace: 0,
      }),
    ).toBe('orders');
  });
});

describe('getMobileDealContractMetaTooltip', () => {
  it('торги обычной раздачи — как title у моб. бейджа КАРТ', () => {
    expect(
      getMobileDealContractMetaTooltip({
        dealNumber: 1,
        tricksInDeal: 9,
        totalOrders: 0,
        totalTricks: 0,
        allBidsPlaced: false,
      }),
    ).toEqual({
      title: 'Сколько карт в раздаче',
      ariaLabel: 'КАРТ: 9 у каждого',
    });
  });

  it('после торгов — заказ и взятки', () => {
    expect(
      getMobileDealContractMetaTooltip({
        dealNumber: 1,
        tricksInDeal: 9,
        totalOrders: 10,
        totalTricks: 3,
        allBidsPlaced: true,
      }).title,
    ).toContain('Заказ: 10');
  });
});
