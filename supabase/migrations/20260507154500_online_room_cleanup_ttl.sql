-- Автоочистка старых онлайн-комнат:
-- 1) завершённые комнаты удаляются через 10 минут;
-- 2) пустые лобби (все вышли, userId отсутствуют) удаляются через 5 минут.
-- Это не трогает активные playing-сессии и не ломает рефреш в живой игре.

create or replace function public.updown_cleanup_stale_rooms()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
begin
  with deleted as (
    delete from public.game_rooms gr
    where
      (
        gr.status = 'finished'
        and gr.updated_at < now() - interval '10 minutes'
      )
      or (
        gr.status = 'waiting'
        and gr.updated_at < now() - interval '5 minutes'
        and not exists (
          select 1
          from jsonb_array_elements(coalesce(gr.player_slots, '[]'::jsonb)) as s
          where coalesce(s->>'userId', '') <> ''
        )
      )
    returning 1
  )
  select count(*) into n from deleted;

  return coalesce(n, 0);
end;
$$;

comment on function public.updown_cleanup_stale_rooms() is
  'Удаляет старые finished-комнаты и пустые waiting-лобби по TTL.';

revoke all on function public.updown_cleanup_stale_rooms() from public;
grant execute on function public.updown_cleanup_stale_rooms() to service_role;

create or replace function public.updown_online_room_maintenance_tick()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a int;
  b int;
  c int;
begin
  a := public.updown_auto_transfer_host_if_stale();
  b := public.updown_absent_wait_expired_tick();
  c := public.updown_cleanup_stale_rooms();
  return jsonb_build_object(
    'stale_hosts_transferred', a,
    'absent_waits_expired', b,
    'stale_rooms_deleted', c
  );
end;
$$;

comment on function public.updown_online_room_maintenance_tick() is
  'Для Edge Functions / pg_cron: смена хоста по host_last_seen_at + истечение waiting_return + cleanup старых комнат.';

revoke all on function public.updown_online_room_maintenance_tick() from public;
grant execute on function public.updown_online_room_maintenance_tick() to service_role;
