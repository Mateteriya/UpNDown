/**
 * Вызов finish_game_from_server (service_role). Без ключа — skipped, не ошибка процесса.
 */

import type { GameState } from '../../src/game/GameEngine.js';
import {
  buildFinishMatchPlayers,
  chipsBySlotFromState,
  dealResultsToFinishRpcPayload,
} from '../../src/game/finishMatchPayload.js';
import type { GameRoomRow } from './protocol.js';

export function supabaseFinishConfigured(): boolean {
  return !!(process.env.SUPABASE_URL ?? '').trim() && !!(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
}

export async function finishGameFromServer(
  room: GameRoomRow,
  state: GameState,
): Promise<{ ok: true; matchId: string } | { ok: true; skipped: true } | { ok: false; error: string }> {
  if (room.match_id) return { ok: true, matchId: room.match_id };
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return { ok: true, skipped: true };

  const players = buildFinishMatchPlayers(state, room.player_slots ?? [], state.dealHistory);
  const chips = chipsBySlotFromState(state, room.settlement_mode, room.buy_in);
  const history = dealResultsToFinishRpcPayload(state.dealHistory ?? []);
  const endpoint = `${url}/rest/v1/rpc/finish_game_from_server`;
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        p_room_id: room.id,
        p_code: room.code,
        p_deals_count: state.dealNumber,
        p_players: players,
        p_deal_history: history.length ? history : null,
        p_chips_by_slot: chips,
        p_settlement_mode: room.settlement_mode ?? 'accuracy_bonus',
        p_buy_in: room.buy_in ?? null,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { ok: false, error: raw.slice(0, 400) || `http_${res.status}` };
    }
    let matchId = '';
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'string') matchId = parsed;
      else if (parsed && typeof parsed === 'object' && 'id' in parsed) {
        matchId = String((parsed as { id: unknown }).id);
      }
    } catch {
      matchId = raw.replace(/^"|"$/g, '').trim();
    }
    if (!matchId) return { ok: false, error: 'empty_match_id' };
    return { ok: true, matchId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function supabaseAuthReachable(timeoutMs = 2500): Promise<boolean> {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return false;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      signal: ac.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
