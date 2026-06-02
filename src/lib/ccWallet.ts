/**
 * Cosmic Credits wallet API (волна 3).
 */

import { supabase } from './supabase';
import { CC_LEDGER_ENABLED } from './productFlags';

export type CcWalletSnapshot = {
  balance: number;
  held: number;
};

export async function fetchCcWallet(): Promise<{ ok: boolean; wallet?: CcWalletSnapshot; error?: string }> {
  if (!CC_LEDGER_ENABLED) return { ok: false, error: 'cc_ledger_disabled' };
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: 'not_authenticated' };
  const { data, error } = await supabase
    .from('wallets')
    .select('balance, held')
    .eq('user_id', auth.user.id)
    .eq('currency', 'cc')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, wallet: { balance: 0, held: 0 } };
  return {
    ok: true,
    wallet: { balance: Number(data.balance), held: Number(data.held) },
  };
}

export async function claimCcDailyGrant(): Promise<{
  ok: boolean;
  granted?: number;
  balance?: number;
  error?: string;
}> {
  if (!CC_LEDGER_ENABLED) return { ok: false, error: 'cc_ledger_disabled' };
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('updown_cc_daily_grant');
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; granted?: number; balance?: number; error?: string };
  if (!row?.ok) return { ok: false, error: row.error ?? 'grant_failed' };
  return { ok: true, granted: row.granted, balance: row.balance };
}

export async function holdCcForRoom(
  roomId: string,
  amount: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!CC_LEDGER_ENABLED) return { ok: true };
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('updown_cc_hold_for_room', {
    p_room_id: roomId,
    p_amount: amount,
  });
  if (error) return { ok: false, error: error.message };
  const row = data as { ok?: boolean; error?: string };
  if (!row?.ok) return { ok: false, error: row.error ?? 'hold_failed' };
  return { ok: true };
}
