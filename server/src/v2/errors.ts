/** Коды ошибок протокола v2. */
export type V2ErrorCode =
  | 'not_your_turn'
  | 'invalid_bid'
  | 'invalid_card'
  | 'wrong_phase'
  | 'room_not_found'
  | 'not_host'
  | 'seat_mismatch'
  | 'game_not_started'
  | 'player_required'
  | 'room_not_v2'
  | 'protocol_v1_only';

export class V2CommandError extends Error {
  constructor(
    readonly code: V2ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'V2CommandError';
  }
}
