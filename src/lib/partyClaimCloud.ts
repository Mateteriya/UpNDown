/**
 * Облачные квитанции партии (Supabase).
 * Миграция: 20261009140000_party_claim_receipts.sql
 */

import { supabase } from './supabase';
import {
  type PartyClaimReceipt,
  readClaimOutbox,
  updateClaimOutbox,
  upsertClaimOutbox,
} from '../game/partyClaim';
import { getAuthRedirectTo } from './nativeAuth';

export async function uploadPartyClaim(
  receipt: PartyClaimReceipt,
): Promise<{ ok: boolean; cloudClaimId?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('submit_party_claim', {
    p_claim_token: receipt.claimToken,
    p_match_key: receipt.matchKey,
    p_email: receipt.email,
    p_intent: receipt.intent,
    p_finished_at: receipt.finishedAt,
    p_payload: {
      archiveId: receipt.archiveId,
      viewer: receipt.viewer,
      profileId: receipt.profileId,
    },
  });
  if (error) return { ok: false, error: error.message };
  const id = typeof data === 'string' ? data : (data as { id?: string } | null)?.id;
  return { ok: true, cloudClaimId: id || undefined };
}

/** Magic link / OTP: письмо со ссылкой; claimToken в redirect. */
export async function sendClaimAuthEmail(
  receipt: PartyClaimReceipt,
): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const base = getAuthRedirectTo() || (typeof window !== 'undefined' ? `${window.location.origin}/` : '');
  const sep = base.includes('?') ? '&' : base.includes('auth-callback') ? '?' : '?';
  const redirectTo = `${base}${sep}ud_claim=${encodeURIComponent(receipt.claimToken)}`;
  const { error } = await supabase.auth.signInWithOtp({
    email: receipt.email,
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: receipt.intent === 'new_account',
    },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function flushClaimOutbox(): Promise<void> {
  if (!supabase) return;
  const list = readClaimOutbox().filter((r) => r.status === 'pending_network' || r.status === 'failed');
  for (const r of list) {
    const up = await uploadPartyClaim(r);
    if (up.ok) {
      updateClaimOutbox(r.claimToken, {
        status: 'uploaded',
        cloudClaimId: up.cloudClaimId ?? null,
        lastError: null,
      });
      const mail = await sendClaimAuthEmail({ ...r, status: 'uploaded', cloudClaimId: up.cloudClaimId });
      if (!mail.ok) {
        updateClaimOutbox(r.claimToken, { lastError: mail.error ?? 'email_failed' });
      }
    } else {
      updateClaimOutbox(r.claimToken, { status: 'failed', lastError: up.error ?? 'upload_failed' });
    }
  }
}

export async function submitNewPartyClaim(
  receipt: PartyClaimReceipt,
): Promise<{ ok: boolean; error?: string; emailed?: boolean }> {
  upsertClaimOutbox(receipt);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: true, emailed: false };
  }
  const up = await uploadPartyClaim(receipt);
  if (!up.ok) {
    updateClaimOutbox(receipt.claimToken, { status: 'failed', lastError: up.error });
    /* всё равно пробуем OTP — квитанция останется локально */
  } else {
    updateClaimOutbox(receipt.claimToken, {
      status: 'uploaded',
      cloudClaimId: up.cloudClaimId ?? null,
      lastError: null,
    });
  }
  const mail = await sendClaimAuthEmail(receipt);
  if (!mail.ok) {
    updateClaimOutbox(receipt.claimToken, { lastError: mail.error ?? 'email_failed' });
    return { ok: true, emailed: false, error: mail.error };
  }
  return { ok: true, emailed: true };
}

export type CloudPartyClaimRow = {
  id: string;
  claim_token: string;
  match_key: string;
  email: string;
  intent: string;
  finished_at: string;
  status: string;
  payload: {
    archiveId?: string;
    viewer?: PartyClaimReceipt['viewer'];
    profileId?: string;
  } | null;
  created_at: string;
};

export async function listMyPartyClaims(): Promise<{
  ok: boolean;
  rows: CloudPartyClaimRow[];
  error?: string;
}> {
  if (!supabase) return { ok: false, rows: [], error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('list_my_party_claims');
  if (error) return { ok: false, rows: [], error: error.message };
  const rows = Array.isArray(data) ? (data as CloudPartyClaimRow[]) : [];
  return { ok: true, rows };
}

export async function acceptPartyClaim(claimId: string): Promise<{ ok: boolean; matchId?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('accept_party_claim', { p_claim_id: claimId });
  if (error) return { ok: false, error: error.message };
  return { ok: true, matchId: typeof data === 'string' ? data : undefined };
}

export async function rejectPartyClaim(claimId: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: 'Supabase не настроен' };
  const { error } = await supabase.rpc('reject_party_claim', { p_claim_id: claimId });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** После логина/регистрации: привязать по email + опционально auto-accept для new_account. */
export async function bindPartyClaimsAfterAuth(opts?: {
  claimToken?: string | null;
}): Promise<{ ok: boolean; bound: number; error?: string }> {
  if (!supabase) return { ok: false, bound: 0, error: 'Supabase не настроен' };
  const { data, error } = await supabase.rpc('bind_party_claims_for_user', {
    p_claim_token: opts?.claimToken?.trim() || null,
  });
  if (error) return { ok: false, bound: 0, error: error.message };
  const bound = typeof data === 'number' ? data : Number(data) || 0;
  if (opts?.claimToken) {
    updateClaimOutbox(opts.claimToken, { status: 'bound', lastError: null });
  }
  return { ok: true, bound };
}
