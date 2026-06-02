/**
 * CC sit-n-go турниры (волна 4).
 */

import { supabase } from './supabase';
import { CC_TOURNAMENTS_ENABLED } from './productFlags';

export type OpenTournamentRow = {
  id: string;
  title: string;
  status: string;
  buy_in_cc: number;
  max_players: number;
  starts_at: string | null;
  registered_count: number;
};

export async function listOpenTournaments(): Promise<{
  ok: boolean;
  tournaments: OpenTournamentRow[];
  error?: string;
}> {
  if (!CC_TOURNAMENTS_ENABLED) return { ok: true, tournaments: [] };
  if (!supabase) return { ok: false, tournaments: [], error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('updown_list_open_tournaments', { p_limit: 20 });
  if (error) return { ok: false, tournaments: [], error: error.message };
  const row = data as { ok?: boolean; tournaments?: OpenTournamentRow[]; error?: string };
  if (!row?.ok) return { ok: false, tournaments: [], error: row?.error ?? 'list_failed' };
  return { ok: true, tournaments: row.tournaments ?? [] };
}

export async function registerForTournament(tournamentId: string): Promise<{ ok: boolean; error?: string }> {
  if (!CC_TOURNAMENTS_ENABLED) return { ok: false, error: 'tournaments_disabled' };
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('updown_register_tournament', {
    p_tournament_id: tournamentId,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string };
  if (!row?.ok) return { ok: false, error: row.error ?? 'register_failed' };
  return { ok: true };
}
