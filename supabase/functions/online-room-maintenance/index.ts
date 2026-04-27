/**
 * Scheduled Edge Function: вызывает RPC updown_online_room_maintenance_tick (service_role)
 * — смена хоста по устаревшему host_last_seen_at и перевод waiting_return → waiting_host_action.
 *
 * Deploy: Supabase Dashboard → Edge Functions → Create → attach cron every 30–60 s.
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (подставляются при деплое из проекта).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

Deno.serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    return new Response(JSON.stringify({ ok: false, error: 'missing_supabase_env' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc('updown_online_room_maintenance_tick');
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
