import { describe, expect, it } from 'vitest';
import { dealResultsToFinishRpcPayload } from './onlineGameSupabase';
import type { DealResult } from '../game/GameEngine';

describe('dealResultsToFinishRpcPayload', () => {
  it('maps deal history for finish_game RPC shape', () => {
    const bh: DealResult[] = [
      { dealNumber: 2, bids: [3, 2, 1, 0], points: [30, 20, -10, 5], takens: [3, 2, 1, 0] },
      { dealNumber: 3, bids: [1, 1, 1, 1], points: [10, 10, 10, 10] },
    ];
    const payload = dealResultsToFinishRpcPayload(bh);
    expect(payload).toHaveLength(2);
    expect(payload[0]).toEqual({
      dealNumber: 2,
      bids: [3, 2, 1, 0],
      points: [30, 20, -10, 5],
      takens: [3, 2, 1, 0],
    });
    expect(payload[1]).not.toHaveProperty('takens');
    expect(payload[1].dealNumber).toBe(3);
  });
});
